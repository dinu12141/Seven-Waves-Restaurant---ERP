// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import webpush from 'npm:web-push@3.6.7'

// ══════════════════════════════════════════════════════════════════════════════
// Seven Waves ERP – Waiter Push Send Edge Function
// ──────────────────────────────────────────────────────────────────────────────
// Triggered by a pg_net database webhook (trg_new_order_push, see
// 20260801_web_push_infrastructure.sql) whenever a new order is INSERTed with
// status IN ('pending_waiter', 'pending'). Sends a real Web Push notification
// (VAPID) to every on-shift waiter/manager in that branch, so they're alerted
// even if the Waiter PWA is closed or the phone screen is off — Supabase
// Realtime alone requires the app to be open with a live WebSocket.
//
// Environment Variables (Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              – auto-injected
//   SUPABASE_SERVICE_ROLE_KEY – auto-injected
//   VAPID_PUBLIC_KEY          – same key served by waiter-push-notify/vapid-key
//   VAPID_PRIVATE_KEY         – kept secret, used only here to sign pushes
//   VAPID_SUBJECT             – e.g. "mailto:ops@sevenwaves.lk" (required by web-push)
// ══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:ops@sevenwaves.lk'

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('[waiter-push-send] VAPID keys not configured — cannot send push')
      return json({ success: false, error: 'VAPID keys not configured on the server' }, 500)
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const supabase = createClient(supabaseUrl, supabaseKey)

    const payload = await req.json().catch(() => null)
    if (!payload || payload.type !== 'INSERT' || payload.table !== 'orders') {
      return json({ success: true, skipped: true, reason: 'Not a new-order INSERT' })
    }

    const order = payload.record
    if (!order?.branch_id) {
      return json({ success: true, skipped: true, reason: 'Order has no branch_id' })
    }

    // ── Resolve recipients: on-shift waiters + managers/admins in this branch ──
    const { data: recipients, error: recipErr } = await supabase.rpc(
      'get_on_shift_notification_recipients',
      { p_branch_id: order.branch_id },
    )

    if (recipErr) {
      console.error('[waiter-push-send] Error resolving recipients:', recipErr)
      return json({ success: false, error: recipErr.message }, 500)
    }

    const recipientIds = (recipients ?? []).map((r: { user_id: string }) => r.user_id)
    if (recipientIds.length === 0) {
      return json({ success: true, skipped: true, reason: 'No on-shift recipients' })
    }

    // ── Fetch active Web Push subscriptions for those recipients ─────────────
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', recipientIds)
      .eq('is_active', true)

    if (subsErr) {
      console.error('[waiter-push-send] Error fetching push subscriptions:', subsErr)
      return json({ success: false, error: subsErr.message }, 500)
    }

    if (!subs || subs.length === 0) {
      return json({ success: true, skipped: true, reason: 'No active push subscriptions' })
    }

    let tableLabel = 'Takeaway'
    if (order.table_id) {
      const { data: tbl } = await supabase
        .from('restaurant_tables')
        .select('table_number')
        .eq('id', order.table_id)
        .single()
      if (tbl?.table_number) tableLabel = `Table ${tbl.table_number}`
    }

    const notificationPayload = JSON.stringify({
      title: '🔔 New Order Waiting',
      body: `${tableLabel} · Order #${order.order_number ?? order.id?.slice(0, 8)}`,
      icon: '/icons/favicon-128x128.png',
      data: {
        order_id: order.id,
        new_status: order.status,
      },
    })

    const results = await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            notificationPayload,
          )
          return { subscription_id: sub.id, success: true }
        } catch (err: any) {
          // 410 Gone / 404 Not Found → subscription is dead, deactivate it
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id)
          }
          console.warn(`[waiter-push-send] Send failed for subscription ${sub.id}:`, err.message)
          return { subscription_id: sub.id, success: false, error: err.message }
        }
      }),
    )

    const sent = results.filter((r) => r.success).length
    console.log(`[waiter-push-send] Sent ${sent}/${results.length} push notification(s)`)

    return json({ success: true, sent, total: results.length, results })
  } catch (err: any) {
    console.error('[waiter-push-send] Unhandled error:', err)
    return json({ success: false, error: err.message }, 500)
  }
})
