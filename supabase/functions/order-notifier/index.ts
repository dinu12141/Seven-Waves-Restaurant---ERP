// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// ══════════════════════════════════════════════════════════════════════════════
// Seven Waves ERP – Order Notifier Edge Function
// ──────────────────────────────────────────────────────────────────────────────
// Triggered by Supabase Database Webhook on UPDATE of `orders` or `order_items`.
// Sends FCM push notifications to waiters/managers when order status changes
// (e.g. "Pending" → "Ready").
//
// Environment Variables (set via Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL             – auto-injected
//   SUPABASE_SERVICE_ROLE_KEY – auto-injected
//   FCM_SERVER_KEY           – Firebase Cloud Messaging legacy server key
//   SERVICE_ACCOUNT_JSON     – Firebase service account JSON (for FCM v1 HTTP API)
//   DRY_RUN                  – set to "true" to skip actual FCM/SMS calls
// ══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Retry helper ────────────────────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  backoffMs = 1000,
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      // Treat 5xx as retriable
      if (res.status >= 500 && attempt < maxRetries - 1) {
        console.warn(
          `[order-notifier] FCM returned ${res.status}, retrying (${attempt + 1}/${maxRetries})…`,
        )
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)))
        continue
      }
      return res
    } catch (err) {
      lastError = err as Error
      console.warn(
        `[order-notifier] Network error on attempt ${attempt + 1}: ${lastError.message}`,
      )
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError ?? new Error('fetchWithRetry: all attempts exhausted')
}

// ── FCM v1 Access Token (from service account JSON) ─────────────────────────
async function getAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)

  // Build JWT header + claims
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

  const unsignedToken = `${encode(header)}.${encode(claims)}`

  // Import RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemBody), (c: string) => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const jwt = `${unsignedToken}.${signature}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get FCM access token: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

// ── Send FCM Notification (supports both legacy & v1 API) ───────────────────
async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<{ success: boolean; response?: unknown; error?: string }> {
  const fcmServerKey = Deno.env.get('FCM_SERVER_KEY')
  const serviceAccountJson = Deno.env.get('SERVICE_ACCOUNT_JSON')

  // ── FCM HTTP v1 API (preferred) ─────────────────────────────────
  if (serviceAccountJson) {
    try {
      const accessToken = await getAccessToken(serviceAccountJson)
      const sa = JSON.parse(serviceAccountJson)
      const projectId = sa.project_id

      const res = await fetchWithRetry(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data,
              android: {
                priority: 'high',
                notification: {
                  sound: 'default',
                  channel_id: 'order_notifications',
                },
              },
              webpush: {
                notification: {
                  icon: '/icons/icon-192x192.png',
                  badge: '/icons/badge-72x72.png',
                  vibrate: [200, 100, 200],
                },
              },
            },
          }),
        },
      )

      const result = await res.json()
      if (!res.ok) {
        return { success: false, error: JSON.stringify(result) }
      }
      return { success: true, response: result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  // ── FCM Legacy API (fallback) ───────────────────────────────────
  if (fcmServerKey) {
    try {
      const res = await fetchWithRetry(
        'https://fcm.googleapis.com/fcm/send',
        {
          method: 'POST',
          headers: {
            Authorization: `key=${fcmServerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            notification: { title, body, sound: 'default' },
            data,
            priority: 'high',
          }),
        },
      )

      const result = await res.json()
      if (result.failure > 0) {
        return { success: false, error: JSON.stringify(result.results) }
      }
      return { success: true, response: result }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  return { success: false, error: 'No FCM credentials configured (FCM_SERVER_KEY or SERVICE_ACCOUNT_JSON)' }
}

// ── Status labels for human-readable messages ───────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  pending_waiter: 'Pending Waiter',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  completed: 'Completed',
  cancelled: 'Cancelled',
  queued: 'Queued',
  cooking: 'Cooking',
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const dryRun = Deno.env.get('DRY_RUN') === 'true'

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── Parse webhook payload ─────────────────────────────────────
    const payload = await req.json().catch(() => null)
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or empty payload' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[order-notifier] Received webhook: table=${payload.table}, type=${payload.type}`)

    // Only process UPDATE events
    if (payload.type !== 'UPDATE') {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Not an UPDATE event' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const oldRecord = payload.old_record
    const newRecord = payload.record

    // Check if the status column actually changed
    if (oldRecord?.status === newRecord?.status) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Status did not change' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const oldStatus = oldRecord?.status ?? 'unknown'
    const newStatus = newRecord?.status ?? 'unknown'
    const tableName = payload.table as string

    console.log(`[order-notifier] Status change: ${oldStatus} → ${newStatus} on ${tableName}`)

    // ── Determine the order & waiter context ──────────────────────
    let orderId: string
    let orderNumber: number | null = null
    let tableNumber: string | null = null
    let waiterId: string | null = null
    let itemName: string | null = null

    if (tableName === 'orders') {
      // Webhook fired on the `orders` table
      orderId = newRecord.id
      orderNumber = newRecord.order_number
      waiterId = newRecord.waiter_id ?? newRecord.assigned_waiter_id

      // Fetch table number
      if (newRecord.table_id) {
        const { data: tbl } = await supabase
          .from('restaurant_tables')
          .select('table_number')
          .eq('id', newRecord.table_id)
          .single()
        tableNumber = tbl?.table_number ?? null
      }
    } else if (tableName === 'order_items') {
      // Webhook fired on the `order_items` table
      orderId = newRecord.order_id

      // Fetch the parent order to get waiter + table info
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('id, order_number, waiter_id, assigned_waiter_id, table_id')
        .eq('id', orderId)
        .single()

      if (orderErr || !order) {
        console.error('[order-notifier] Could not find parent order:', orderErr)
        return new Response(
          JSON.stringify({ success: false, error: 'Parent order not found' }),
          { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        )
      }

      orderNumber = order.order_number
      waiterId = order.waiter_id ?? order.assigned_waiter_id

      if (order.table_id) {
        const { data: tbl } = await supabase
          .from('restaurant_tables')
          .select('table_number')
          .eq('id', order.table_id)
          .single()
        tableNumber = tbl?.table_number ?? null
      }

      // Fetch item name for richer notification
      if (newRecord.menu_item_id) {
        const { data: menuItem } = await supabase
          .from('menu_items')
          .select('name')
          .eq('id', newRecord.menu_item_id)
          .single()
        itemName = menuItem?.name ?? null
      }
    } else {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: `Unsupported table: ${tableName}` }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // ── Build notification message ────────────────────────────────
    const statusLabel = STATUS_LABELS[newStatus] ?? newStatus
    const orderRef = `Order #${orderNumber ?? orderId.slice(0, 8)}`
    const tableRef = tableNumber ? ` for Table ${tableNumber}` : ''
    const itemRef = itemName ? ` (${itemName})` : ''

    let notificationTitle = '🔔 Order Update'
    let notificationBody = ''

    if (newStatus === 'ready') {
      notificationTitle = '✅ Order Ready!'
      notificationBody = `${orderRef} is ready${tableRef}${itemRef}`
    } else if (newStatus === 'cancelled') {
      notificationTitle = '❌ Order Cancelled'
      notificationBody = `${orderRef} has been cancelled${tableRef}`
    } else if (newStatus === 'preparing' || newStatus === 'cooking') {
      notificationTitle = '👨‍🍳 Now Preparing'
      notificationBody = `${orderRef} is now being prepared${tableRef}${itemRef}`
    } else if (newStatus === 'served') {
      notificationTitle = '🍽️ Order Served'
      notificationBody = `${orderRef} has been served${tableRef}`
    } else if (newStatus === 'completed') {
      notificationTitle = '✔️ Order Completed'
      notificationBody = `${orderRef} is completed${tableRef}`
    } else {
      notificationBody = `${orderRef} → ${statusLabel}${tableRef}${itemRef}`
    }

    // ── Notification data payload ─────────────────────────────────
    const dataPayload: Record<string, string> = {
      order_id: orderId,
      order_number: String(orderNumber ?? ''),
      old_status: oldStatus,
      new_status: newStatus,
      table: tableName,
      table_number: tableNumber ?? '',
      timestamp: new Date().toISOString(),
    }

    // ── Collect FCM tokens for recipients ─────────────────────────
    const recipientIds: string[] = []

    // Always notify the assigned waiter
    if (waiterId) {
      recipientIds.push(waiterId)
    }

    // Notify all managers (users with "Manager" or "Admin" role)
    const { data: managerRoles } = await supabase
      .from('roles')
      .select('id')
      .in('name', ['Manager', 'Admin', 'admin', 'manager', 'Super Admin'])

    if (managerRoles && managerRoles.length > 0) {
      const roleIds = managerRoles.map((r: { id: string }) => r.id)
      const { data: managerUserRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('role_id', roleIds)

      if (managerUserRoles) {
        for (const ur of managerUserRoles) {
          if (!recipientIds.includes(ur.user_id)) {
            recipientIds.push(ur.user_id)
          }
        }
      }
    }

    if (recipientIds.length === 0) {
      console.log('[order-notifier] No recipients found, skipping notification')
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'No recipients' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Fetch active FCM tokens for all recipients
    const { data: tokens, error: tokenErr } = await supabase
      .from('push_tokens')
      .select('user_id, token, platform')
      .in('user_id', recipientIds)
      .eq('is_active', true)

    if (tokenErr) {
      console.error('[order-notifier] Error fetching push tokens:', tokenErr)
    }

    const activeTokens = tokens ?? []

    console.log(
      `[order-notifier] Found ${activeTokens.length} active token(s) for ${recipientIds.length} recipient(s)`,
    )

    // ── Also insert into waiter_notifications for in-app display ──
    const notificationInserts = recipientIds.map((userId) => ({
      profile_id: userId,
      title: notificationTitle,
      body: notificationBody,
      type: 'order_status',
      metadata: dataPayload,
      is_read: false,
      created_at: new Date().toISOString(),
    }))

    const { error: notifInsertErr } = await supabase
      .from('waiter_notifications')
      .insert(notificationInserts)

    if (notifInsertErr) {
      console.warn('[order-notifier] Could not insert in-app notifications:', notifInsertErr)
    }

    // ── Dry Run Mode ──────────────────────────────────────────────
    if (dryRun) {
      console.log('[order-notifier] DRY RUN – skipping actual FCM/SMS delivery')
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          notification: { title: notificationTitle, body: notificationBody },
          recipients: recipientIds,
          tokens_found: activeTokens.length,
          data: dataPayload,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // ── Send FCM Push Notifications ───────────────────────────────
    const results: Array<{
      user_id: string
      token: string
      success: boolean
      error?: string
    }> = []

    for (const t of activeTokens) {
      console.log(`[order-notifier] Sending FCM to user=${t.user_id}, platform=${t.platform}`)
      const result = await sendFcmNotification(
        t.token,
        notificationTitle,
        notificationBody,
        dataPayload,
      )
      results.push({
        user_id: t.user_id,
        token: t.token.slice(0, 12) + '…', // truncate for privacy
        success: result.success,
        error: result.error,
      })

      // If the token is invalid, mark it as inactive
      if (
        result.error &&
        (result.error.includes('NotRegistered') ||
          result.error.includes('UNREGISTERED') ||
          result.error.includes('InvalidRegistration'))
      ) {
        console.warn(`[order-notifier] Deactivating stale token for user=${t.user_id}`)
        await supabase
          .from('push_tokens')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', t.user_id)
          .eq('token', t.token)
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    console.log(
      `[order-notifier] Done. Sent: ${successCount}, Failed: ${failCount}`,
    )

    // ── Log to erp_event_log for auditing ─────────────────────────
    await supabase.from('erp_event_log').insert({
      event_type: 'order_notification',
      event_data: {
        order_id: orderId,
        order_number: orderNumber,
        old_status: oldStatus,
        new_status: newStatus,
        table: tableName,
        recipients: recipientIds.length,
        fcm_sent: successCount,
        fcm_failed: failCount,
      },
      created_at: new Date().toISOString(),
    })

    return new Response(
      JSON.stringify({
        success: true,
        notification: { title: notificationTitle, body: notificationBody },
        recipients: recipientIds.length,
        fcm_sent: successCount,
        fcm_failed: failCount,
        details: results,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[order-notifier] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message ?? 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
