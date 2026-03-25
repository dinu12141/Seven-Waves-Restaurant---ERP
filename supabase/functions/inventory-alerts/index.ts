// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// ══════════════════════════════════════════════════════════════════════════════
// Seven Waves ERP – Inventory Alert Edge Function
// ──────────────────────────────────────────────────────────────────────────────
// Triggered by Supabase Database Webhook on UPDATE of `stock_on_hand`.
// Monitors stock levels and sends email alerts to suppliers/managers when
// an item's qty_on_hand falls below its reorder_level.
//
// Environment Variables (set via Supabase Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL              – auto-injected
//   SUPABASE_SERVICE_ROLE_KEY – auto-injected
//   RESEND_API_KEY            – Resend.com API key for sending emails
//   ALERT_FROM_EMAIL          – sender email (default: alerts@sevenwaves.lk)
//   MANAGER_ALERT_EMAIL       – fallback manager email for notifications
// ══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Resend Email Sender ─────────────────────────────────────────────────────
interface EmailPayload {
  to: string[]
  subject: string
  html: string
}

async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string; id?: string }> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' }
  }

  const fromEmail = Deno.env.get('ALERT_FROM_EMAIL') || 'Seven Waves ERP <alerts@sevenwaves.lk>'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    })

    const result = await res.json()

    if (!res.ok) {
      return { success: false, error: result?.message || JSON.stringify(result) }
    }

    return { success: true, id: result.id }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ── Professional HTML Email Template ────────────────────────────────────────
function buildAlertEmailHtml(
  itemName: string,
  itemCode: string,
  currentQty: number,
  reorderLevel: number,
  reorderQty: number,
  warehouseName: string,
  supplierName: string,
  uomName: string,
): string {
  const alertLevel = currentQty <= 0 ? 'OUT OF STOCK' : currentQty <= reorderLevel * 0.5 ? 'CRITICAL' : 'LOW STOCK'
  const alertColor = currentQty <= 0 ? '#DC2626' : currentQty <= reorderLevel * 0.5 ? '#EA580C' : '#D97706'
  const alertBg = currentQty <= 0 ? '#FEF2F2' : currentQty <= reorderLevel * 0.5 ? '#FFF7ED' : '#FFFBEB'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stock Reorder Alert</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#F3F4F6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                📦 Stock Reorder Alert
              </h1>
              <p style="margin:8px 0 0;color:#93C5FD;font-size:14px;">
                Seven Waves Restaurant – Inventory Management
              </p>
            </td>
          </tr>

          <!-- Alert Badge -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${alertBg};border-left:4px solid ${alertColor};border-radius:8px;padding:16px 20px;">
                    <span style="display:inline-block;background-color:${alertColor};color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:1px;">
                      ⚠️ ${alertLevel}
                    </span>
                    <p style="margin:12px 0 0;color:#374151;font-size:15px;line-height:1.5;">
                      <strong>${itemName}</strong> has fallen below the reorder threshold and requires immediate attention.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Item Details -->
          <tr>
            <td style="padding:24px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
                <tr style="background-color:#F9FAFB;">
                  <td colspan="2" style="padding:12px 20px;border-bottom:1px solid #E5E7EB;">
                    <strong style="color:#374151;font-size:14px;">📋 Item Details</strong>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;width:40%;">Item Name</td>
                  <td style="padding:12px 20px;color:#111827;font-size:13px;font-weight:600;border-bottom:1px solid #F3F4F6;">${itemName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;">Item Code</td>
                  <td style="padding:12px 20px;color:#111827;font-size:13px;font-weight:600;border-bottom:1px solid #F3F4F6;">${itemCode}</td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;">Warehouse</td>
                  <td style="padding:12px 20px;color:#111827;font-size:13px;font-weight:600;border-bottom:1px solid #F3F4F6;">${warehouseName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;">Current Stock</td>
                  <td style="padding:12px 20px;font-size:13px;border-bottom:1px solid #F3F4F6;">
                    <span style="color:${alertColor};font-weight:700;font-size:16px;">${currentQty}</span>
                    <span style="color:#6B7280;"> ${uomName}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;border-bottom:1px solid #F3F4F6;">Reorder Level</td>
                  <td style="padding:12px 20px;color:#111827;font-size:13px;font-weight:600;border-bottom:1px solid #F3F4F6;">${reorderLevel} ${uomName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 20px;color:#6B7280;font-size:13px;">Suggested Reorder Qty</td>
                  <td style="padding:12px 20px;color:#2563EB;font-size:13px;font-weight:700;">${reorderQty} ${uomName}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Supplier Info -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EFF6FF;border-radius:8px;padding:16px 20px;">
                <tr>
                  <td>
                    <strong style="color:#1E40AF;font-size:13px;">🏢 Preferred Supplier</strong>
                    <p style="margin:8px 0 0;color:#374151;font-size:14px;font-weight:600;">${supplierName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Timestamp -->
          <tr>
            <td style="padding:0 40px 24px;">
              <p style="margin:0;color:#9CA3AF;font-size:12px;text-align:center;">
                🕐 Alert generated at ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo', dateStyle: 'full', timeStyle: 'short' })}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;padding:20px 40px;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;color:#9CA3AF;font-size:11px;">
                This is an automated alert from the <strong>Seven Waves ERP</strong> Inventory Management System.<br>
                Please do not reply to this email. Contact your inventory manager for follow-up.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── De-duplication Check ────────────────────────────────────────────────────
async function wasAlertSentRecently(
  supabase: any,
  itemId: string,
  warehouseId: string,
  hoursWindow = 24,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('stock_alert_logs')
    .select('id')
    .eq('item_id', itemId)
    .eq('warehouse_id', warehouseId)
    .eq('email_sent', true)
    .is('resolved_at', null)
    .gte('created_at', cutoff)
    .limit(1)

  if (error) {
    console.warn('[inventory-alerts] De-dup check failed:', error.message)
    return false // fail open: allow sending
  }

  return data && data.length > 0
}

// ── Process a single stock_on_hand record ──────────────────────────────────
interface AlertResult {
  item_id: string
  item_name: string
  status: 'sent' | 'skipped_dedup' | 'skipped_above_reorder' | 'skipped_no_supplier' | 'error'
  email?: string
  error?: string
}

async function processStockAlert(
  supabase: any,
  record: any,
  oldRecord: any,
): Promise<AlertResult> {
  const itemId = record.item_id
  const warehouseId = record.warehouse_id
  const companyId = record.company_id
  const qtyOnHand = Number(record.qty_on_hand)

  // 1. Fetch item details with supplier info
  const { data: item, error: itemErr } = await supabase
    .from('items')
    .select(`
      id, name, code, reorder_level, reorder_qty, default_supplier_id,
      inventory_uom_id,
      uom:uom!items_inventory_uom_id_fkey ( name, code )
    `)
    .eq('id', itemId)
    .single()

  if (itemErr || !item) {
    return {
      item_id: itemId,
      item_name: 'Unknown',
      status: 'error',
      error: `Item not found: ${itemErr?.message}`,
    }
  }

  const reorderLevel = Number(item.reorder_level ?? 0)
  const reorderQty = Number(item.reorder_qty ?? 0)
  const uomName = item.uom?.name ?? item.uom?.code ?? 'units'

  // 2. Check if stock is above reorder level
  if (reorderLevel <= 0 || qtyOnHand > reorderLevel) {
    return {
      item_id: itemId,
      item_name: item.name,
      status: 'skipped_above_reorder',
    }
  }

  // 3. Fetch warehouse name
  const { data: warehouse } = await supabase
    .from('warehouses')
    .select('name')
    .eq('id', warehouseId)
    .single()

  const warehouseName = warehouse?.name ?? 'Unknown Warehouse'

  // 4. De-duplication: check if alert was already sent in last 24h
  const recentlySent = await wasAlertSentRecently(supabase, itemId, warehouseId)
  if (recentlySent) {
    console.log(`[inventory-alerts] Skipping duplicate alert for item=${item.name}, warehouse=${warehouseName}`)
    return {
      item_id: itemId,
      item_name: item.name,
      status: 'skipped_dedup',
    }
  }

  // 5. Fetch supplier details
  let supplierEmail: string | null = null
  let supplierName = 'N/A'
  let supplierId: string | null = null

  if (item.default_supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, name, email, contact_person')
      .eq('id', item.default_supplier_id)
      .single()

    if (supplier) {
      supplierId = supplier.id
      supplierName = supplier.name
      supplierEmail = supplier.email
    }
  }

  // Determine alert type
  const alertType = qtyOnHand <= 0 ? 'out_of_stock' : qtyOnHand <= reorderLevel * 0.5 ? 'critical' : 'low_stock'

  // 6. Build recipient list
  const recipients: string[] = []

  // Add supplier email if available
  if (supplierEmail) {
    recipients.push(supplierEmail)
  }

  // Add manager email as fallback/CC
  const managerEmail = Deno.env.get('MANAGER_ALERT_EMAIL')
  if (managerEmail && !recipients.includes(managerEmail)) {
    recipients.push(managerEmail)
  }

  if (recipients.length === 0) {
    // Log that no email could be sent but still record the alert
    await supabase.from('stock_alert_logs').insert({
      company_id: companyId,
      item_id: itemId,
      warehouse_id: warehouseId,
      supplier_id: supplierId,
      item_name: item.name,
      item_code: item.code,
      qty_on_hand: qtyOnHand,
      reorder_level: reorderLevel,
      supplier_email: null,
      alert_type: alertType,
      email_sent: false,
      email_error: 'No recipient email configured (supplier has no email & MANAGER_ALERT_EMAIL not set)',
    })

    return {
      item_id: itemId,
      item_name: item.name,
      status: 'skipped_no_supplier',
    }
  }

  // 7. Build and send the email
  const emailHtml = buildAlertEmailHtml(
    item.name,
    item.code,
    qtyOnHand,
    reorderLevel,
    reorderQty,
    warehouseName,
    supplierName,
    uomName,
  )

  const alertLabel = alertType === 'out_of_stock' ? '🚨 OUT OF STOCK' : alertType === 'critical' ? '⚠️ CRITICAL' : '📦 Low Stock'
  const emailSubject = `${alertLabel}: ${item.name} (${item.code}) – Reorder Required`

  const emailResult = await sendEmail({
    to: recipients,
    subject: emailSubject,
    html: emailHtml,
  })

  // 8. Log the alert
  await supabase.from('stock_alert_logs').insert({
    company_id: companyId,
    item_id: itemId,
    warehouse_id: warehouseId,
    supplier_id: supplierId,
    item_name: item.name,
    item_code: item.code,
    qty_on_hand: qtyOnHand,
    reorder_level: reorderLevel,
    supplier_email: recipients.join(', '),
    alert_type: alertType,
    email_sent: emailResult.success,
    email_error: emailResult.error ?? null,
  })

  console.log(
    `[inventory-alerts] ${emailResult.success ? '✅ Email sent' : '❌ Email failed'} for ${item.name} → ${recipients.join(', ')}`,
  )

  // 9. Also log to erp_event_log for centralized audit
  await supabase.from('erp_event_log').insert({
    event_type: 'inventory_alert',
    event_data: {
      item_id: itemId,
      item_name: item.name,
      item_code: item.code,
      warehouse: warehouseName,
      qty_on_hand: qtyOnHand,
      reorder_level: reorderLevel,
      alert_type: alertType,
      supplier: supplierName,
      recipients,
      email_sent: emailResult.success,
    },
    created_at: new Date().toISOString(),
  })

  return {
    item_id: itemId,
    item_name: item.name,
    status: emailResult.success ? 'sent' : 'error',
    email: recipients.join(', '),
    error: emailResult.error,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  // ── CORS preflight ──────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── Parse webhook payload ───────────────────────────────────────
    const payload = await req.json().catch(() => null)
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or empty payload' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[inventory-alerts] Received webhook: table=${payload.table}, type=${payload.type}`)

    // Only process UPDATE events on stock_on_hand
    if (payload.type !== 'UPDATE') {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Not an UPDATE event' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    const oldRecord = payload.old_record
    const newRecord = payload.record

    if (!newRecord) {
      return new Response(
        JSON.stringify({ success: false, error: 'No record in payload' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // Check if qty_on_hand actually changed
    if (oldRecord && Number(oldRecord.qty_on_hand) === Number(newRecord.qty_on_hand)) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'qty_on_hand did not change' }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    }

    // ── Handle single record (webhook fires per row) ────────────────
    // The webhook fires once per row update, but we also support
    // a bulk mode where the payload contains an array of records
    const records = Array.isArray(newRecord) ? newRecord : [newRecord]
    const oldRecords = Array.isArray(oldRecord) ? oldRecord : [oldRecord]

    console.log(`[inventory-alerts] Processing ${records.length} stock record(s)`)

    // ── Process all items in parallel for scalability ────────────────
    const results: AlertResult[] = await Promise.all(
      records.map((rec: any, idx: number) =>
        processStockAlert(supabase, rec, oldRecords[idx] ?? null)
      ),
    )

    // ── Summary ─────────────────────────────────────────────────────
    const sent = results.filter((r) => r.status === 'sent').length
    const skipped = results.filter((r) => r.status.startsWith('skipped')).length
    const errors = results.filter((r) => r.status === 'error').length

    console.log(
      `[inventory-alerts] Done. Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}`,
    )

    return new Response(
      JSON.stringify({
        success: true,
        summary: { total: results.length, sent, skipped, errors },
        details: results,
      }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('[inventory-alerts] Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message ?? 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
