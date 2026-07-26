// @ts-nocheck
/// <reference lib="deno.ns" />

/**
 * ═══════════════════════════════════════════════════════════════════
 * PAYMENT HANDLER — Edge Function
 * Seven Waves Restaurant ERP
 * ═══════════════════════════════════════════════════════════════════
 *
 * Endpoints (via `action` body parameter):
 *
 *   1. create-payment-intent   → Initiate a payment session with the gateway
 *   2. verify-payment          → Check payment status from the gateway
 *   3. webhook                 → Receive async payment confirmations from gateway
 *
 * Security:
 *   - Actions 1 & 2 require a valid JWT in the Authorization header.
 *   - Action 3 (webhook) verifies a gateway signature instead.
 *   - All DB mutations use SERVICE_ROLE_KEY to bypass RLS.
 *
 * Supported Gateways: Stripe (primary), DirectPay (Sri Lankan alternative)
 * ═══════════════════════════════════════════════════════════════════
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function jsonResponse(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400) {
  console.error(`[payment-handler] ERROR: ${message}`)
  return jsonResponse({ success: false, error: message }, status)
}

/** Generates a unique idempotency key for a payment attempt */
function generateIdempotencyKey(orderId: string, gateway: string): string {
  return `pay_${gateway}_${orderId}_${Date.now()}`
}

/** Validates a UUID format */
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}

/**
 * Server-side throttle via the shared check_qr_rate_limit RPC (SECURITY DEFINER;
 * upserts a per-identifier+endpoint minute bucket). Returns true if the request
 * may proceed. Fails OPEN on infra error — a rate-limit table hiccup must never
 * block a legitimate payment. Applied only to the JWT-authenticated actions;
 * gateway webhooks are authenticated by signature and must not be dropped. [#99/#46]
 */
async function withinRateLimit(
  admin: any,
  identifier: string,
  endpoint: string,
  limit: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_qr_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_limit: limit,
    })
    if (error) {
      console.warn(`[payment-handler] rate-limit check failed (fail-open): ${error.message}`)
      return true
    }
    return (data?.allowed ?? true) === true
  } catch (e) {
    console.warn('[payment-handler] rate-limit check threw (fail-open):', e)
    return true
  }
}

// ─── Stripe Helpers ──────────────────────────────────────────────────────────

/**
 * Creates a Stripe PaymentIntent via the Stripe REST API.
 * This avoids pulling in the full Stripe SDK for Deno compatibility.
 */
async function createStripePaymentIntent(params: {
  amount: number
  currency: string
  orderId: string
  customerEmail?: string
  stripeSecretKey: string
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { amount, currency, orderId, customerEmail, stripeSecretKey } = params

  // Stripe expects amount in the smallest currency unit (e.g. cents for USD,
  // but LKR already uses whole units — Stripe handles LKR as zero-decimal)
  const zeroDecimalCurrencies = ['lkr', 'jpy', 'krw', 'bif', 'clp', 'gnf', 'kmf', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']
  const isZeroDecimal = zeroDecimalCurrencies.includes(currency.toLowerCase())
  const stripeAmount = isZeroDecimal ? Math.round(amount) : Math.round(amount * 100)

  const body = new URLSearchParams({
    amount: stripeAmount.toString(),
    currency: currency.toLowerCase(),
    'metadata[order_id]': orderId,
    'payment_method_types[]': 'card',
  })

  if (customerEmail) {
    body.append('receipt_email', customerEmail)
  }

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64Encode(new TextEncoder().encode(`${stripeSecretKey}:`))}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Stripe API error: ${result.error?.message ?? JSON.stringify(result)}`)
  }

  return {
    clientSecret: result.client_secret,
    paymentIntentId: result.id,
  }
}

/**
 * Retrieves a Stripe PaymentIntent to verify its status.
 */
async function getStripePaymentIntent(
  paymentIntentId: string,
  stripeSecretKey: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
    {
      headers: {
        Authorization: `Basic ${base64Encode(new TextEncoder().encode(`${stripeSecretKey}:`))}`,
      },
    },
  )

  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Stripe API error: ${result.error?.message ?? JSON.stringify(result)}`)
  }

  return result
}

/**
 * Verifies a Stripe webhook signature using HMAC-SHA256.
 * Reference: https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  webhookSecret: string,
): Promise<boolean> {
  try {
    const parts = sigHeader.split(',')
    const timestampPart = parts.find((p: string) => p.startsWith('t='))
    const signaturePart = parts.find((p: string) => p.startsWith('v1='))

    if (!timestampPart || !signaturePart) return false

    const timestamp = timestampPart.split('=')[1]
    const signature = signaturePart.split('=')[1]

    // Reject if timestamp is more than 5 minutes old
    const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10))
    if (timestampAge > 300) {
      console.warn('[payment-handler] Webhook timestamp too old:', timestampAge, 'seconds')
      return false
    }

    const signedPayload = `${timestamp}.${payload}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(signedPayload),
    )

    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return expectedHex === signature
  } catch (err) {
    console.error('[payment-handler] Signature verification failed:', err)
    return false
  }
}

// ─── DirectPay Helpers ───────────────────────────────────────────────────────

/**
 * Creates a DirectPay payment session.
 * DirectPay is a Sri Lankan payment gateway commonly used for LKR transactions.
 */
async function createDirectPaySession(params: {
  amount: number
  currency: string
  orderId: string
  customerEmail?: string
  customerPhone?: string
  returnUrl: string
  cancelUrl: string
  notifyUrl: string
  directPayApiKey: string
  directPayMerchantId: string
}): Promise<{ sessionUrl: string; sessionId: string }> {
  const {
    amount,
    orderId,
    currency,
    customerEmail,
    customerPhone,
    returnUrl,
    cancelUrl,
    notifyUrl,
    directPayApiKey,
    directPayMerchantId,
  } = params

  const body = {
    merchant_id: directPayMerchantId,
    order_id: orderId,
    amount: amount.toFixed(2),
    currency: currency.toUpperCase(),
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    first_name: 'Customer',
    last_name: '',
    email: customerEmail ?? '',
    phone: customerPhone ?? '',
    items: `Order #${orderId}`,
  }

  const response = await fetch('https://gateway.directpay.lk/api/v3/create-session', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${directPayApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const result = await response.json()

  if (!response.ok || !result.data?.sessionUrl) {
    throw new Error(
      `DirectPay API error: ${result.message ?? JSON.stringify(result)}`,
    )
  }

  return {
    sessionUrl: result.data.sessionUrl,
    sessionId: result.data.sessionId ?? result.data.session_id ?? orderId,
  }
}

/**
 * Verifies a DirectPay webhook signature using HMAC-SHA256.
 */
async function verifyDirectPaySignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload),
    )

    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return expectedHex === signature
  } catch (err) {
    console.error('[payment-handler] DirectPay signature verification failed:', err)
    return false
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return errorResponse('Only POST method is allowed', 405)
  }

  try {
    // ── Environment Variables ──────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
    const directPayApiKey = Deno.env.get('DIRECTPAY_API_KEY') ?? ''
    const directPayMerchantId = Deno.env.get('DIRECTPAY_MERCHANT_ID') ?? ''
    const directPayWebhookSecret = Deno.env.get('DIRECTPAY_WEBHOOK_SECRET') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // Service Role client — bypasses RLS for system-level updates
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // ── Parse request ─────────────────────────────────────────────
    const rawBody = await req.text()
    let body: Record<string, unknown>

    try {
      body = JSON.parse(rawBody)
    } catch {
      // Webhook payloads may use form-encoded; try parsing as JSON first
      body = Object.fromEntries(new URLSearchParams(rawBody))
    }

    const action = (body.action as string) ?? ''

    console.log(`[payment-handler] Action: ${action}`)

    // ═══════════════════════════════════════════════════════════════
    // ACTION 1: CREATE PAYMENT INTENT
    // ═══════════════════════════════════════════════════════════════
    if (action === 'create-payment-intent') {
      // ── JWT Authentication ────────────────────────────────────
      const authHeader = req.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('Missing or invalid Authorization header', 401)
      }

      const jwt = authHeader.replace('Bearer ', '')

      // Create an authenticated client to verify the user
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()

      if (userError || !user) {
        return errorResponse('Invalid or expired JWT token', 401)
      }

      console.log(`[payment-handler] Authenticated user: ${user.id}`)

      // ── Throttle intent creation per user (12/min; fail-open on infra error) ──
      if (!(await withinRateLimit(supabaseAdmin, `user:${user.id}`, 'pay_create_intent', 12))) {
        return errorResponse('Too many payment attempts. Please wait a moment.', 429)
      }

      // ── Validate Input ──────────────────────────────────────────
      const orderId = body.order_id as string
      const paymentMethod = (body.payment_method as string) ?? 'stripe'
      const returnUrl = (body.return_url as string) ?? ''
      const cancelUrl = (body.cancel_url as string) ?? ''

      if (!orderId || !isValidUUID(orderId)) {
        return errorResponse('Missing or invalid order_id (UUID required)')
      }

      // ── Fetch Order & Verify Amount ─────────────────────────────
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, total_amount, payment_status, status, customer_name, customer_phone, branch_id, company_id')
        .eq('id', orderId)
        .single()

      if (orderError || !order) {
        return errorResponse(`Order not found: ${orderId}`, 404)
      }

      // Prevent duplicate payment
      if (order.payment_status === 'paid') {
        return jsonResponse({
          success: true,
          already_paid: true,
          order_id: orderId,
          message: 'Order is already paid',
        })
      }

      // Validate amount
      const amount = order.total_amount as number
      if (!amount || amount <= 0) {
        return errorResponse('Order has no payable amount')
      }

      // If a specific amount was passed, verify it matches the order total
      if (body.amount && Math.abs((body.amount as number) - amount) > 0.01) {
        return errorResponse(
          `Amount mismatch: provided ${body.amount}, expected ${amount}`,
        )
      }

      const currency = (body.currency as string) ?? 'LKR'
      const idempotencyKey = generateIdempotencyKey(orderId, paymentMethod)

      // ── Record the payment attempt ──────────────────────────────
      const { data: txnRecord, error: txnInsertErr } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          gateway: paymentMethod === 'directpay' ? 'payhere' : paymentMethod,
          txn_type: 'payment',
          amount,
          currency,
          status: 'pending',
          idempotency_key: idempotencyKey,
          request_payload: {
            user_id: user.id,
            payment_method: paymentMethod,
            initiated_from: 'edge_function',
          },
          ip_address: req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? 'unknown',
        })
        .select('id')
        .single()

      if (txnInsertErr) {
        console.error('[payment-handler] Failed to record transaction:', txnInsertErr)
        throw txnInsertErr
      }

      // ── Create Payment Session with Gateway ─────────────────────
      let gatewayResponse: Record<string, unknown> = {}

      if (paymentMethod === 'stripe') {
        if (!stripeSecretKey) {
          return errorResponse('Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase Secrets.', 500)
        }

        // Fetch customer email from web_customer_auth if available
        let customerEmail: string | undefined
        if (user.email) {
          customerEmail = user.email
        }

        const stripeResult = await createStripePaymentIntent({
          amount,
          currency,
          orderId,
          customerEmail,
          stripeSecretKey,
        })

        // Update the transaction record with gateway IDs
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            gateway_txn_id: stripeResult.paymentIntentId,
            gateway_order_id: stripeResult.paymentIntentId,
            status: 'processing',
            response_payload: { client_secret: stripeResult.clientSecret },
          })
          .eq('id', txnRecord.id)

        // Update order payment method
        await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'stripe',
            payment_status: 'pending_payment',
            gateway_ref: stripeResult.paymentIntentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        gatewayResponse = {
          client_secret: stripeResult.clientSecret,
          payment_intent_id: stripeResult.paymentIntentId,
          gateway: 'stripe',
        }
      } else if (paymentMethod === 'directpay') {
        if (!directPayApiKey || !directPayMerchantId) {
          return errorResponse(
            'DirectPay is not configured. Set DIRECTPAY_API_KEY and DIRECTPAY_MERCHANT_ID in Supabase Secrets.',
            500,
          )
        }

        const notifyUrl = `${supabaseUrl}/functions/v1/payment-handler`

        const dpResult = await createDirectPaySession({
          amount,
          currency,
          orderId,
          customerEmail: user.email,
          customerPhone: order.customer_phone as string,
          returnUrl: returnUrl || `${supabaseUrl}/payment/success`,
          cancelUrl: cancelUrl || `${supabaseUrl}/payment/cancel`,
          notifyUrl,
          directPayApiKey,
          directPayMerchantId,
        })

        // Update the transaction record
        await supabaseAdmin
          .from('payment_transactions')
          .update({
            gateway_txn_id: dpResult.sessionId,
            gateway_order_id: dpResult.sessionId,
            status: 'processing',
            response_payload: { session_url: dpResult.sessionUrl },
          })
          .eq('id', txnRecord.id)

        // Update order
        await supabaseAdmin
          .from('orders')
          .update({
            payment_method: 'payhere',
            payment_status: 'pending_payment',
            gateway_ref: dpResult.sessionId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)

        gatewayResponse = {
          session_url: dpResult.sessionUrl,
          session_id: dpResult.sessionId,
          gateway: 'directpay',
        }
      } else {
        return errorResponse(
          `Unsupported payment method: ${paymentMethod}. Supported: stripe, directpay`,
        )
      }

      console.log(`[payment-handler] Payment intent created for order ${orderId}`)

      return jsonResponse({
        success: true,
        order_id: orderId,
        order_number: order.order_number,
        amount,
        currency,
        transaction_id: txnRecord.id,
        idempotency_key: idempotencyKey,
        ...gatewayResponse,
      })
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTION 2: VERIFY PAYMENT STATUS
    // ═══════════════════════════════════════════════════════════════
    if (action === 'verify-payment') {
      // ── JWT Authentication ────────────────────────────────────
      const authHeader = req.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return errorResponse('Missing or invalid Authorization header', 401)
      }

      const jwt = authHeader.replace('Bearer ', '')
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceRoleKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })

      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
      if (userError || !user) {
        return errorResponse('Invalid or expired JWT token', 401)
      }

      // ── Throttle verification polling per user (30/min; fail-open on infra error) ──
      if (!(await withinRateLimit(supabaseAdmin, `user:${user.id}`, 'pay_verify', 30))) {
        return errorResponse('Too many verification attempts. Please wait a moment.', 429)
      }

      const orderId = body.order_id as string
      const paymentIntentId = body.payment_intent_id as string
      const gateway = (body.gateway as string) ?? 'stripe'

      if (!orderId || !isValidUUID(orderId)) {
        return errorResponse('Missing or invalid order_id')
      }

      // Fetch order payment status from DB
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('id, payment_status, payment_method, gateway_ref, total_amount')
        .eq('id', orderId)
        .single()

      if (orderErr || !order) {
        return errorResponse('Order not found', 404)
      }

      // If already paid, just return the status
      if (order.payment_status === 'paid') {
        return jsonResponse({
          success: true,
          order_id: orderId,
          payment_status: 'paid',
          verified: true,
        })
      }

      // ── Verify with Gateway ──────────────────────────────────────
      let gatewayStatus = 'unknown'
      let gatewayDetails: Record<string, unknown> = {}

      if (gateway === 'stripe' && paymentIntentId && stripeSecretKey) {
        const pi = await getStripePaymentIntent(paymentIntentId, stripeSecretKey) as Record<string, unknown>
        gatewayStatus = pi.status as string
        gatewayDetails = {
          stripe_status: pi.status,
          amount_received: pi.amount_received,
          payment_method: pi.payment_method,
        }

        // If Stripe reports succeeded but our DB doesn't know yet → confirm
        if (gatewayStatus === 'succeeded' && order.payment_status !== 'paid') {
          console.log(`[payment-handler] Stripe confirms payment for ${orderId}, updating DB...`)

          const { data: confirmResult } = await supabaseAdmin.rpc('confirm_online_payment', {
            p_order_id: orderId,
            p_gateway: 'stripe',
            p_gateway_txn_id: paymentIntentId,
            p_amount: order.total_amount,
            p_gateway_status: 'success',
            p_idempotency_key: `stripe_verify_${paymentIntentId}`,
            p_response_payload: gatewayDetails,
          })

          return jsonResponse({
            success: true,
            order_id: orderId,
            payment_status: 'paid',
            verified: true,
            gateway_status: gatewayStatus,
            confirm_result: confirmResult,
          })
        }
      }

      return jsonResponse({
        success: true,
        order_id: orderId,
        payment_status: order.payment_status,
        gateway_status: gatewayStatus,
        gateway_details: gatewayDetails,
        verified: gatewayStatus === 'succeeded',
      })
    }

    // ═══════════════════════════════════════════════════════════════
    // ACTION 3: WEBHOOK — Async payment confirmation from gateway
    // ═══════════════════════════════════════════════════════════════
    if (action === 'webhook' || action === '') {
      // Webhooks can arrive without an explicit "action" field.
      // Detect which gateway sent the webhook.

      const sigHeader = req.headers.get('stripe-signature') ?? ''
      const dpSignature = req.headers.get('x-webhook-signature') ?? (body.signature as string) ?? ''

      // ── A) STRIPE WEBHOOK ─────────────────────────────────────
      if (sigHeader) {
        console.log('[payment-handler] Processing Stripe webhook')

        if (!stripeWebhookSecret) {
          console.error('[payment-handler] STRIPE_WEBHOOK_SECRET not configured')
          return errorResponse('Webhook secret not configured', 500)
        }

        // Verify signature
        const isValid = await verifyStripeSignature(rawBody, sigHeader, stripeWebhookSecret)
        if (!isValid) {
          console.error('[payment-handler] Invalid Stripe webhook signature')
          return errorResponse('Invalid webhook signature', 403)
        }

        const event = body as Record<string, unknown>
        const eventType = event.type as string
        console.log(`[payment-handler] Stripe event type: ${eventType}`)

        if (eventType === 'payment_intent.succeeded') {
          const paymentIntent = (event.data as Record<string, unknown>)?.object as Record<string, unknown>
          const piId = paymentIntent?.id as string
          const metadata = paymentIntent?.metadata as Record<string, string>
          const orderId = metadata?.order_id

          if (!orderId) {
            console.warn('[payment-handler] No order_id in Stripe metadata')
            return jsonResponse({ received: true, warning: 'No order_id in metadata' })
          }

          console.log(`[payment-handler] Stripe payment succeeded for order: ${orderId}`)

          // Use the existing confirm_online_payment RPC
          const { data: confirmResult, error: confirmErr } = await supabaseAdmin.rpc(
            'confirm_online_payment',
            {
              p_order_id: orderId,
              p_gateway: 'stripe',
              p_gateway_txn_id: piId,
              p_amount: (paymentIntent?.amount_received as number) / 100, // Convert from cents
              p_gateway_status: 'success',
              p_idempotency_key: `stripe_wh_${piId}`,
              p_response_payload: {
                stripe_event_id: event.id,
                stripe_event_type: eventType,
                payment_method_type: paymentIntent?.payment_method_types,
                created: paymentIntent?.created,
              },
            },
          )

          if (confirmErr) {
            console.error('[payment-handler] confirm_online_payment error:', confirmErr)
            return errorResponse('Failed to confirm payment', 500)
          }

          console.log('[payment-handler] Payment confirmed via webhook:', JSON.stringify(confirmResult))
          return jsonResponse({ received: true, confirmed: true, result: confirmResult })
        }

        if (eventType === 'payment_intent.payment_failed') {
          const paymentIntent = (event.data as Record<string, unknown>)?.object as Record<string, unknown>
          const piId = paymentIntent?.id as string
          const metadata = paymentIntent?.metadata as Record<string, string>
          const orderId = metadata?.order_id

          if (orderId) {
            // Record the failed payment attempt
            await supabaseAdmin
              .from('payment_transactions')
              .update({
                status: 'failed',
                gateway_status: 'failed',
                error_message: (paymentIntent?.last_payment_error as Record<string, unknown>)?.message as string ?? 'Payment failed',
                completed_at: new Date().toISOString(),
                response_payload: {
                  stripe_event_id: event.id,
                  error: paymentIntent?.last_payment_error,
                },
              })
              .eq('gateway_txn_id', piId)
              .eq('status', 'processing')

            console.log(`[payment-handler] Payment failed for order: ${orderId}`)
          }

          return jsonResponse({ received: true, status: 'payment_failed' })
        }

        // For all other Stripe events, acknowledge but don't process
        return jsonResponse({ received: true, event_type: eventType })
      }

      // ── B) DIRECTPAY WEBHOOK ──────────────────────────────────
      if (dpSignature || body.merchant_id || body.order_id) {
        console.log('[payment-handler] Processing DirectPay webhook')

        // Verify signature if secret is configured
        if (directPayWebhookSecret && dpSignature) {
          const isValid = await verifyDirectPaySignature(rawBody, dpSignature, directPayWebhookSecret)
          if (!isValid) {
            console.error('[payment-handler] Invalid DirectPay webhook signature')
            return errorResponse('Invalid webhook signature', 403)
          }
        }

        const orderId = body.order_id as string
        const dpStatus = (body.status_code as string) ?? (body.status as string) ?? ''
        const dpTxnId = (body.transaction_id as string) ?? (body.payment_id as string) ?? ''
        const dpAmount = parseFloat((body.payhere_amount as string) ?? (body.amount as string) ?? '0')

        if (!orderId) {
          console.warn('[payment-handler] DirectPay webhook missing order_id')
          return jsonResponse({ received: true, warning: 'Missing order_id' })
        }

        console.log(`[payment-handler] DirectPay status: ${dpStatus} for order: ${orderId}`)

        // DirectPay status codes: 2 = success, 0 = pending, -1 = cancelled, -2 = failed, -3 = chargedback
        const isSuccess = dpStatus === '2' || dpStatus === 'success' || dpStatus === 'completed'

        if (isSuccess) {
          const { data: confirmResult, error: confirmErr } = await supabaseAdmin.rpc(
            'confirm_online_payment',
            {
              p_order_id: orderId,
              p_gateway: 'payhere',
              p_gateway_txn_id: dpTxnId,
              p_amount: dpAmount,
              p_gateway_status: 'success',
              p_idempotency_key: `dp_wh_${dpTxnId || orderId}`,
              p_response_payload: body,
            },
          )

          if (confirmErr) {
            console.error('[payment-handler] confirm_online_payment error:', confirmErr)
            return errorResponse('Failed to confirm payment', 500)
          }

          console.log('[payment-handler] DirectPay payment confirmed:', JSON.stringify(confirmResult))
          return jsonResponse({ received: true, confirmed: true, result: confirmResult })
        } else {
          // Record the failed/cancelled payment
          await supabaseAdmin
            .from('payment_transactions')
            .insert({
              order_id: orderId,
              gateway: 'payhere',
              gateway_txn_id: dpTxnId,
              txn_type: 'payment',
              amount: dpAmount,
              status: dpStatus === '-1' ? 'cancelled' : 'failed',
              gateway_status: dpStatus,
              response_payload: body,
              error_message: `DirectPay status: ${dpStatus}`,
              completed_at: new Date().toISOString(),
              idempotency_key: `dp_fail_${dpTxnId || orderId}_${Date.now()}`,
            })

          return jsonResponse({ received: true, status: 'payment_not_successful', dp_status: dpStatus })
        }
      }

      return errorResponse('Unknown webhook source or missing action parameter')
    }

    // ── Unknown Action ────────────────────────────────────────────
    return errorResponse(
      `Unknown action: "${action}". Supported: create-payment-intent, verify-payment, webhook`,
    )
  } catch (error: any) {
    console.error('[payment-handler] Fatal error:', error)
    return errorResponse(error.message ?? 'Internal server error', 500)
  }
})
