// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// ══════════════════════════════════════════════════════════════════════════════
// Seven Waves ERP – Waiter Push Subscription Edge Function
// ──────────────────────────────────────────────────────────────────────────────
// Manages Web Push (VAPID) subscriptions for the Waiter PWA, so waiters can
// receive real system notifications even when the app is closed or the phone
// screen is off — Supabase Realtime (WebSocket) alone cannot do this because
// the socket dies the moment the tab/PWA is suspended or closed.
//
// Routes (path is matched against the last segment after /waiter-push-notify):
//   GET  /vapid-key   → { vapid_public_key }
//   POST /subscribe   → { user_id, subscription: {endpoint, keys:{p256dh,auth}}, device_name? }
//   POST /unsubscribe → { endpoint }
//
// Environment Variables (Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              – auto-injected
//   SUPABASE_SERVICE_ROLE_KEY – auto-injected
//   VAPID_PUBLIC_KEY          – generate once with `npx web-push generate-vapid-keys`
//   VAPID_PRIVATE_KEY         – (used only by waiter-push-send, not this function)
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

  const url = new URL(req.url)
  const route = url.pathname.split('/').filter(Boolean).pop() // last path segment

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── GET /vapid-key ──────────────────────────────────────────────
    if (route === 'vapid-key' && req.method === 'GET') {
      const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
      if (!vapidPublicKey) {
        return json({ error: 'VAPID_PUBLIC_KEY not configured on the server' }, 500)
      }
      return json({ vapid_public_key: vapidPublicKey })
    }

    // ── POST /subscribe ─────────────────────────────────────────────
    if (route === 'subscribe' && req.method === 'POST') {
      const body = await req.json().catch(() => null)
      const userId = body?.user_id
      const subscription = body?.subscription
      const deviceName = body?.device_name ?? null

      if (!userId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: 'user_id and a valid Web Push subscription are required' }, 400)
      }

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          device_name: deviceName,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      )

      if (error) {
        console.error('[waiter-push-notify] subscribe upsert error:', error)
        return json({ error: error.message }, 500)
      }

      return json({ success: true })
    }

    // ── POST /unsubscribe ───────────────────────────────────────────
    if (route === 'unsubscribe' && req.method === 'POST') {
      const body = await req.json().catch(() => null)
      const endpoint = body?.endpoint

      if (!endpoint) {
        return json({ error: 'endpoint is required' }, 400)
      }

      const { error } = await supabase
        .from('push_subscriptions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('endpoint', endpoint)

      if (error) {
        console.error('[waiter-push-notify] unsubscribe error:', error)
        return json({ error: error.message }, 500)
      }

      return json({ success: true })
    }

    return json({ error: `Not found: ${req.method} ${url.pathname}` }, 404)
  } catch (err: any) {
    console.error('[waiter-push-notify] Unhandled error:', err)
    return json({ error: err.message }, 500)
  }
})
