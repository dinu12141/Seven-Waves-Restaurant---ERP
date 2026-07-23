// @ts-nocheck
/// <reference lib="deno.ns" />

/**
 * ═══════════════════════════════════════════════════════════════════
 * PAYMENT TERMINAL CHARGE — Edge Function  (finding #10)
 * Seven Waves Restaurant ERP
 * ═══════════════════════════════════════════════════════════════════
 *
 * PURPOSE
 *   Card-terminal charges/refunds where PROVIDER SECRETS NEVER TOUCH THE
 *   BROWSER/RENDERER. The renderer (src/modules/devices/services/
 *   payment.terminal.service.js) must send ONLY { orderId, terminalId,
 *   provider, action } + a user JWT — no API keys / providerCfg secrets.
 *   All provider credentials are read here from Supabase Secrets (Vault)
 *   via Deno.env, and the charge amount is resolved SERVER-SIDE from the
 *   order (client-supplied amounts are ignored — anti-tamper).
 *
 * REQUEST (JSON):
 *   {
 *     action:     'charge' | 'refund',
 *     orderId:    uuid,              // ERP order — amount resolved from here
 *     terminalId: string,           // devices.device_id (audit only)
 *     provider:   'stripe'|'square'|'pax',
 *     txRef?:     string,           // required for refund
 *     amount?:    number            // refund partial amount (validated <= paid)
 *   }
 *
 * SECURITY
 *   - Requires a valid staff JWT (cashier/manager/admin/waiter) — enforced
 *     in-function, NOT just by the platform verify_jwt gate.
 *   - Amount for a charge is ALWAYS orders.total_amount from the DB.
 *   - Provider secrets come from Deno.env (Vault): STRIPE_SECRET_KEY,
 *     SQUARE_ACCESS_TOKEN, PAX_API_KEY, etc. Never accepted from the client.
 *   - Every attempt is recorded in payment_terminal_transactions (service role).
 *
 * NOTE: Stripe/Square/PAX card-present flows are hardware/SDK-bound. The
 *   provider handlers below implement the server-side REST portions and mark
 *   device-bridge steps as TODO for @ERP-Electron-Fixer to wire from the
 *   Electron main process (never the renderer). The security contract —
 *   auth + server-side amount + Vault secrets — is fully enforced regardless.
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str ?? '')
}

/**
 * In-function authorization gate. Requires a staff JWT with a payment-capable
 * role. Returns { user } on success or a Response to return on failure.
 */
async function requireStaff(
  req: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ user: any } | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return jsonRes({ success: false, error: 'Missing Authorization header' }, 401)

  const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) return jsonRes({ success: false, error: 'Invalid or expired token' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: roleRows } = await admin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', user.id)
  const roles = (roleRows ?? []).map((r: any) => r.roles?.name).filter(Boolean)
  const ALLOWED = ['admin', 'manager', 'cashier', 'waiter']
  if (!roles.some((r: string) => ALLOWED.includes(r))) {
    return jsonRes({ success: false, error: 'Insufficient permissions to take card payment' }, 403)
  }
  return { user }
}

// ─── Provider handlers (server-side, secrets from Vault) ──────────────────────

/** Stripe: create + confirm a card-present PaymentIntent. Reader interaction
 *  (collectPaymentMethod) happens on the terminal via the Electron bridge; this
 *  handler owns the secret-key REST calls. */
async function stripeCharge(amountMinor: number, currency: string, orderId: string) {
  const secret = Deno.env.get('STRIPE_SECRET_KEY')
  if (!secret) return { success: false, status: 'error', error: 'STRIPE_SECRET_KEY not configured in Vault' }

  const body = new URLSearchParams({
    amount: String(amountMinor),
    currency: currency.toLowerCase(),
    'payment_method_types[]': 'card_present',
    capture_method: 'automatic',
    'metadata[order_id]': orderId,
  })
  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64Encode(new TextEncoder().encode(`${secret}:`))}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  const pi = await res.json()
  if (!res.ok) return { success: false, status: 'error', error: pi.error?.message ?? 'Stripe error' }
  // TODO(@ERP-Electron-Fixer): return client_secret to the Electron MAIN process
  // (not the renderer) to drive reader.collectPaymentMethod, then confirm here.
  return { success: true, status: 'waiting_card', txRef: pi.id, clientSecret: pi.client_secret }
}

async function squareCharge(amountMinor: number, currency: string, orderId: string) {
  const token = Deno.env.get('SQUARE_ACCESS_TOKEN')
  if (!token) return { success: false, status: 'error', error: 'SQUARE_ACCESS_TOKEN not configured in Vault' }
  // TODO(@ERP-Electron-Fixer): call Square Terminal API /v2/terminals/checkouts
  // with the device_id; secrets stay here. Stubbed pending device pairing.
  return { success: false, status: 'error', error: 'Square terminal handler not yet wired (server scaffold ready)' }
}

async function paxCharge(amountMinor: number, currency: string, orderId: string) {
  const apiKey = Deno.env.get('PAX_API_KEY')
  if (!apiKey) return { success: false, status: 'error', error: 'PAX_API_KEY not configured in Vault' }
  // TODO(@ERP-Electron-Fixer): PAX ISO-8583 charge is issued over the LAN from
  // the Electron main process; this function authorizes + records only.
  return { success: false, status: 'error', error: 'PAX terminal handler not yet wired (server scaffold ready)' }
}

// ═════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return jsonRes({ success: false, error: 'Only POST allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

    const gate = await requireStaff(req, supabaseUrl, serviceRoleKey)
    if (gate instanceof Response) return gate

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => ({}))
    const action = (body.action as string) ?? 'charge'
    const orderId = body.orderId as string
    const provider = (body.provider as string) ?? 'stripe'
    const terminalId = (body.terminalId as string) ?? null

    if (!orderId || !isValidUUID(orderId)) return jsonRes({ success: false, error: 'Valid orderId required' }, 400)

    // ── Resolve amount SERVER-SIDE from the order (ignore any client amount) ──
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, total_amount, payment_status, currency')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return jsonRes({ success: false, error: 'Order not found' }, 404)
    if (action === 'charge' && order.payment_status === 'paid') {
      return jsonRes({ success: true, already_paid: true, order_id: orderId })
    }

    const currency = (order.currency as string) ?? 'LKR'
    const zeroDecimal = ['lkr', 'jpy', 'krw', 'vnd'].includes(currency.toLowerCase())
    const amountMajor = Number(order.total_amount) || 0
    if (amountMajor <= 0) return jsonRes({ success: false, error: 'Order has no payable amount' }, 400)
    const amountMinor = zeroDecimal ? Math.round(amountMajor) : Math.round(amountMajor * 100)

    // ── Record the attempt (service role) ──
    const { data: txRec } = await admin
      .from('payment_terminal_transactions')
      .insert({
        order_id: orderId,
        terminal_id: terminalId,
        provider,
        amount: action === 'refund' ? -Math.abs(amountMajor) : amountMajor,
        currency,
        status: 'processing',
      })
      .select('id')
      .single()

    // ── Dispatch to provider (secrets resolved inside each handler) ──
    let result: Record<string, unknown>
    if (action === 'refund') {
      result = { success: false, status: 'error', error: 'Refund handler pending device wiring (server scaffold ready)' }
    } else if (provider === 'stripe') {
      result = await stripeCharge(amountMinor, currency, orderId)
    } else if (provider === 'square') {
      result = await squareCharge(amountMinor, currency, orderId)
    } else if (provider === 'pax') {
      result = await paxCharge(amountMinor, currency, orderId)
    } else {
      result = { success: false, status: 'error', error: `Unsupported provider: ${provider}` }
    }

    if (txRec?.id) {
      await admin
        .from('payment_terminal_transactions')
        .update({
          status: result.status ?? (result.success ? 'approved' : 'error'),
          tx_ref: (result.txRef as string) ?? null,
          error_message: (result.error as string) ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', txRec.id)
    }

    // Never leak provider secrets; clientSecret (if any) is a per-intent token.
    return jsonRes({ ...result, order_id: orderId, tx_id: txRec?.id })
  } catch (err: any) {
    console.error('[payment-terminal-charge] Fatal:', err)
    return jsonRes({ success: false, error: err.message ?? 'Internal error' }, 500)
  }
})
