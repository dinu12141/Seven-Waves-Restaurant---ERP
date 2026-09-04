// @ts-nocheck
/// <reference lib="deno.ns" />

// ══════════════════════════════════════════════════════════════════════════════
// Seven Waves ERP – Notify Restaurant WhatsApp (Meta Cloud API)
// ──────────────────────────────────────────────────────────────────────────────
// Sends instant order notifications directly to the restaurant WhatsApp (+94777179225)
// via Meta WhatsApp Cloud API when a customer places an order on the website.
//
// Environment Secrets (Set in Supabase Dashboard → Edge Functions → Secrets):
//   WHATSAPP_PHONE_NUMBER_ID  – Meta WhatsApp Phone Number ID
//   WHATSAPP_ACCESS_TOKEN     – Meta WhatsApp System User Permanent Token
//   RESTAURANT_PHONE          – Restaurant WhatsApp number, e.g. 94777179225
// ══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderItem {
  name: string
  quantity: number
  price: number
  variant?: string
  notes?: string
  kitchen?: string
}

interface WebOrderData {
  orderNumber: string
  orderType: 'delivery' | 'takeaway' | 'dine_in'
  customerName: string
  customerPhone: string
  deliveryAddress?: string
  items: OrderItem[]
  subtotal: number
  deliveryCharge?: number
  total: number
  notes?: string
}

function cleanPhone(raw: string): string {
  let cleaned = raw.replace(/\D/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.slice(1)
  }
  if (!cleaned.startsWith('94') && cleaned.length === 9) {
    cleaned = '94' + cleaned
  }
  return cleaned
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const payload = (await req.json()) as WebOrderData
    if (!payload || !payload.orderNumber) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order details' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')
    const targetPhone = cleanPhone(Deno.env.get('RESTAURANT_PHONE') || '94777179225')

    if (!phoneNumberId || !accessToken) {
      console.warn('[WhatsApp Edge] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Meta WhatsApp API secrets not yet configured in Supabase Edge Functions.',
          details: 'Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in Supabase Secrets.',
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // ── Build formatted order message ─────────────────────────────────────
    const orderTypeLabel =
      payload.orderType === 'delivery'
        ? 'Delivery 🛵'
        : payload.orderType === 'takeaway'
        ? 'Takeaway 🛍️'
        : 'Dine-In 🍽️'

    const addressVal =
      payload.orderType === 'delivery'
        ? payload.deliveryAddress || 'Address not provided'
        : payload.orderType === 'takeaway'
        ? 'Takeaway (Self-Pickup)'
        : 'Dine-In'

    const itemLines = (payload.items || [])
      .map((item) => {
        const variantStr = item.variant ? ` (${item.variant})` : ''
        const notesStr = item.notes ? ` [Note: ${item.notes}]` : ''
        const kitchenStr = item.kitchen ? ` [${item.kitchen}]` : ''
        const lineTotal = (item.price || 0) * (item.quantity || 1)
        return `• ${item.name}${variantStr} x${item.quantity}${notesStr}\n  └─ ${kitchenStr} Rs. ${lineTotal.toLocaleString('en-LK')}`
      })
      .join('\n')

    const message = [
      `*🌊 Seven Waves — New Website Order (#${payload.orderNumber})*`,
      ``,
      `📌 *Order Type:* ${orderTypeLabel}`,
      `👤 *Customer:* ${payload.customerName}`,
      `📞 *Phone:* ${payload.customerPhone}`,
      `📍 *Address:* ${addressVal}`,
      payload.notes ? `📝 *Notes:* ${payload.notes}` : null,
      ``,
      `*Items Ordered:*`,
      itemLines,
      ``,
      `*━━━━━━━━━━━━━━━━━━━━*`,
      (payload.deliveryCharge || 0) > 0 ? `*Subtotal:* Rs. ${(payload.subtotal || 0).toLocaleString('en-LK')}` : null,
      (payload.deliveryCharge || 0) > 0 ? `*Delivery Fee:* Rs. ${payload.deliveryCharge.toLocaleString('en-LK')}` : null,
      `*Grand Total: Rs. ${(payload.total || 0).toLocaleString('en-LK')}*`,
      `*━━━━━━━━━━━━━━━━━━━━*`,
      ``,
      `⚡ _Automated notification from Seven Waves Website_`,
    ]
      .filter(Boolean)
      .join('\n')

    // ── Send via Meta WhatsApp Cloud API ─────────────────────────────────
    console.log(`[WhatsApp Edge] Dispatching order #${payload.orderNumber} to ${targetPhone}...`)

    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        }),
      },
    )

    const metaJson = await metaRes.json()

    if (!metaRes.ok) {
      console.error('[WhatsApp Edge] Meta API error:', JSON.stringify(metaJson))
      return new Response(
        JSON.stringify({
          success: false,
          error: metaJson.error?.message || 'Meta WhatsApp API returned an error',
          metaError: metaJson,
        }),
        { status: metaRes.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[WhatsApp Edge] Message sent successfully: ID=${metaJson.messages?.[0]?.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        messageId: metaJson.messages?.[0]?.id,
        recipient: targetPhone,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[WhatsApp Edge] Server error:', err)
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
