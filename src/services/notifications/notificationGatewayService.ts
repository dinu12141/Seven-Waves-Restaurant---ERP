/**
 * notificationGatewayService.ts
 * ==============================
 * Enterprise Multi-Channel Notification Gateway for Seven Waves Restaurant ERP.
 * 
 * Supports:
 *  1. Meta WhatsApp Cloud API (Official Meta Graph API)
 *  2. Twilio WhatsApp & SMS API
 *  3. Instant Click-to-Chat WhatsApp URL (Zero-Cost / No API Key needed)
 *  4. Resend REST Email API (Transactional Email with high deliverability)
 *  5. Standard SMTP Email Dispatch
 *  6. Automated Digest Templates (Midnight Sales, Reservations, Payslips, Low Stock)
 */

import { supabase } from '../../boot/supabase'

export interface GatewayConfig {
  whatsapp_provider: 'meta' | 'twilio' | 'direct'
  meta_phone_number_id: string
  meta_access_token: string
  meta_business_account_id: string
  twilio_account_sid: string
  twilio_auth_token: string
  twilio_from_phone: string
  owner_phone_number: string
  
  email_provider: 'resend' | 'smtp'
  /**
   * @deprecated The Resend key is a server-side secret (edge function `send-email`
   * reads Deno.env RESEND_API_KEY). Any value here is ignored and never persisted.
   */
  resend_api_key?: string
  email_from_address: string
  email_from_name: string
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password?: string
  
  auto_midnight_sales_whatsapp: boolean
  auto_low_stock_whatsapp: boolean
  auto_reservation_whatsapp: boolean
  auto_payslip_email: boolean
}

const DEFAULT_CONFIG: GatewayConfig = {
  whatsapp_provider: 'direct',
  meta_phone_number_id: '',
  meta_access_token: '',
  meta_business_account_id: '',
  twilio_account_sid: '',
  twilio_auth_token: '',
  twilio_from_phone: '',
  owner_phone_number: '+94717462205',
  
  email_provider: 'resend',
  email_from_address: 'hr@sevenwaves.lk',
  email_from_name: 'Seven Waves ERP',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_user: '',
  
  auto_midnight_sales_whatsapp: true,
  auto_low_stock_whatsapp: true,
  auto_reservation_whatsapp: true,
  auto_payslip_email: true,
}

const STORAGE_KEY = 'sw_notification_gateway_config'

/** Name of the edge function that holds the Resend key server-side. */
export const SEND_EMAIL_FUNCTION = 'send-email'

/** Strip server-only secrets so they are never stored client-side or in system_settings. */
export function sanitizeGatewayConfig<T extends Partial<GatewayConfig>>(config: T): T {
  const clean = { ...config }
  delete clean.resend_api_key
  return clean
}

/** Get active gateway settings */
export async function getGatewayConfig(): Promise<GatewayConfig> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_gateway_config')
      .single()

    if (data && data.value) {
      return sanitizeGatewayConfig({ ...DEFAULT_CONFIG, ...(typeof data.value === 'string' ? JSON.parse(data.value) : data.value) })
    }
  } catch (e) {
    // Fallback to local storage if system_settings row is not yet initialized
  }

  const local = localStorage.getItem(STORAGE_KEY)
  if (local) {
    try {
      const parsed = JSON.parse(local)
      if (parsed && 'resend_api_key' in parsed) {
        // Purge a previously cached key from browser storage.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeGatewayConfig(parsed)))
      }
      return sanitizeGatewayConfig({ ...DEFAULT_CONFIG, ...parsed })
    } catch {
      // ignore
    }
  }

  return { ...DEFAULT_CONFIG }
}

/** Save gateway settings */
export async function saveGatewayConfig(config: GatewayConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const safe = sanitizeGatewayConfig(config)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe))

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'notification_gateway_config',
        value: safe,
        updated_at: new Date().toISOString(),
      })

    if (error && error.code !== 'PGRST116') {
      console.warn('[NotificationGateway] Database sync warning:', error)
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message || 'Failed to save configuration' }
  }
}

// ── WhatsApp Dispatchers ──────────────────────────────────────────

/** Clean and format international phone number for WhatsApp (e.g. 0771234567 -> 94771234567) */
export function formatWhatsAppPhone(phone: string): string {
  if (!phone) return ''
  let cleaned = phone.replace(/[^0-9]/g, '')
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.substring(1)
  }
  return cleaned
}

/** Generate a direct WhatsApp Web/App click-to-chat URL */
export function getWhatsAppDirectUrl(phone: string, message: string): string {
  const clean = formatWhatsAppPhone(phone)
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

/** Send WhatsApp Message via Meta Cloud API or Twilio API */
export async function sendWhatsAppMessage(
  payload: {
    to: string
    text: string
    templateName?: string
  },
  overrideConfig?: GatewayConfig
): Promise<{ success: boolean; directUrl?: string; error?: string; messageId?: string }> {
  const config = overrideConfig || (await getGatewayConfig())
  const cleanPhone = formatWhatsAppPhone(payload.to)

  if (!cleanPhone) {
    return { success: false, error: 'Invalid recipient phone number' }
  }

  // 1. Direct Web Link Mode (Instant Zero-Cost)
  if (config.whatsapp_provider === 'direct' || (!config.meta_access_token && !config.twilio_auth_token)) {
    const directUrl = getWhatsAppDirectUrl(cleanPhone, payload.text)
    return { success: true, directUrl }
  }

  // 2. Meta Official WhatsApp Cloud API
  if (config.whatsapp_provider === 'meta') {
    if (!config.meta_phone_number_id || !config.meta_access_token) {
      return { success: false, error: 'Meta WhatsApp Cloud API credentials missing' }
    }

    try {
      // First attempt: Text message
      let reqBody: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: true, body: payload.text },
      }

      // If template is specified or requested
      if (payload.templateName) {
        reqBody = {
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'template',
          template: { name: payload.templateName, language: { code: 'en_US' } },
        }
      }

      let response = await fetch(
        `https://graph.facebook.com/v19.0/${config.meta_phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.meta_access_token.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reqBody),
        }
      )

      let result = await response.json()

      // If text message failed due to 24h conversation window, try with default 'hello_world' template
      if (!response.ok && !payload.templateName) {
        const errorMsg = result.error?.message || ''
        if (errorMsg.includes('template') || errorMsg.includes('conversation') || result.error?.code === 131047) {
          response = await fetch(
            `https://graph.facebook.com/v19.0/${config.meta_phone_number_id}/messages`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${config.meta_access_token.trim()}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: cleanPhone,
                type: 'template',
                template: { name: 'hello_world', language: { code: 'en_US' } },
              }),
            }
          )
          result = await response.json()
        }
      }

      if (!response.ok) {
        throw new Error(result.error?.message || `Meta API Error (${response.status})`)
      }

      return { success: true, messageId: result.messages?.[0]?.id }
    } catch (err: any) {
      return { success: false, error: err.message, directUrl: getWhatsAppDirectUrl(cleanPhone, payload.text) }
    }
  }

  // 3. Twilio WhatsApp API
  if (config.whatsapp_provider === 'twilio') {
    if (!config.twilio_account_sid || !config.twilio_auth_token) {
      return { success: false, error: 'Twilio credentials missing' }
    }

    try {
      const auth = btoa(`${config.twilio_account_sid}:${config.twilio_auth_token}`)
      const from = config.twilio_from_phone.startsWith('whatsapp:')
        ? config.twilio_from_phone
        : `whatsapp:${config.twilio_from_phone}`

      const formData = new URLSearchParams()
      formData.append('From', from)
      formData.append('To', `whatsapp:+${cleanPhone}`)
      formData.append('Body', payload.text)

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilio_account_sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        }
      )

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.message || `Twilio Error (${response.status})`)
      }

      return { success: true, messageId: result.sid }
    } catch (err: any) {
      return { success: false, error: err.message, directUrl: getWhatsAppDirectUrl(cleanPhone, payload.text) }
    }
  }

  return { success: true, directUrl: getWhatsAppDirectUrl(cleanPhone, payload.text) }
}

// ── Email Dispatchers ─────────────────────────────────────────────

/**
 * Send transactional email. The browser never talks to Resend directly and never
 * holds the API key: the request goes to the `send-email` edge function, which
 * authorizes the caller (admin/manager/hr/finance) and reads RESEND_API_KEY from
 * its server-side secrets. The sender address is fixed server-side (FROM_EMAIL).
 */
export async function sendEmail(payload: {
  to: string | string[]
  subject: string
  html: string
  attachments?: Array<{ filename: string; content: string }>
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(SEND_EMAIL_FUNCTION, {
      body: {
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments,
      },
    })

    if (error) {
      let message = error.message || 'Email dispatch failed'
      // FunctionsHttpError carries the function's JSON body in `context`.
      try {
        const ctx: any = (error as any).context
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json()
          if (body?.error) message = body.error
        }
      } catch {
        // ignore body parse errors
      }
      return { success: false, error: message }
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Email dispatch failed' }
    }
    return { success: true, messageId: data.messageId }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Email dispatch failed' }
  }
}

// ── Digest & Alert Templates ──────────────────────────────────────

export function buildMidnightSalesWhatsAppMessage(data: {
  date: string
  totalSales: number
  totalOrders: number
  cashSales: number
  cardSales: number
  topItems: Array<{ name: string; qty: number }>
  estimatedNetProfit: number
}): string {
  const topList = (data.topItems || [])
    .slice(0, 3)
    .map((item, idx) => `  ${idx + 1}. ${item.name} (${item.qty})`)
    .join('\n')

  return `🌊 *SEVEN WAVES RESTAURANT*
📊 *Daily Executive Briefing*
📅 *Date*: ${data.date}

💰 *Total Sales*: LKR ${data.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
🧾 *Total Orders*: ${data.totalOrders}
💵 *Cash Collected*: LKR ${data.cashSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
💳 *Card / Online*: LKR ${data.cardSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
📈 *Est. Net Profit*: LKR ${data.estimatedNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}

🍽️ *Top Selling Items*:
${topList || '  None recorded'}

_Automated summary generated by Seven Waves ERP._`
}

export function buildReservationWhatsAppMessage(data: {
  customerName: string
  date: string
  time: string
  guestCount: number
  tableNumber?: string
}): string {
  return `🌊 *SEVEN WAVES RESTAURANT*
✨ *Reservation Confirmation*

Dear ${data.customerName},
Your table reservation has been confirmed!

📅 *Date*: ${data.date}
⏰ *Time*: ${data.time}
👥 *Guests*: ${data.guestCount}
🪑 *Table*: ${data.tableNumber || 'Assigned on Arrival'}

📍 *Location*: Seven Waves Restaurant
📞 *Contact*: +94 77 123 4567

We look forward to serving you an exceptional culinary experience!`
}

export function buildLowStockAlertMessage(items: Array<{ name: string; current: number; reorder: number; uom: string }>): string {
  const list = items
    .map(i => `⚠️ *${i.name}*: ${i.current} ${i.uom} (Reorder Level: ${i.reorder})`)
    .join('\n')

  return `📦 *SEVEN WAVES ERP — LOW STOCK ALERT*
Attention Store Manager, the following items require procurement replenishment:

${list}

_Open Procurement > Purchase Orders in Seven Waves ERP to generate auto-draft PO._`
}
