// ═══════════════════════════════════════════════════════════════════════════
// Daily Executive Summary WhatsApp Dispatcher
// Seven Waves Restaurant (Pvt) Ltd
// Automatically generates and dispatches daily briefing to the owner:
//   1. Finance Expenses breakdown
//   2. Daily Purchases (GRN bills, items, supplier, tax)
//   3. Daily Stock Issues (GIN - Kitchen Food Cost vs Cleaning Chemicals vs Gas)
//   4. Low Stock / Reorder alerts
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const s = createClient(SUPABASE_URL, SERVICE_KEY)

// Parse CLI args
const args = process.argv.slice(2)
let targetDate = new Date().toISOString().slice(0, 10)
let targetPhone = '0717266563'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) targetDate = args[i + 1]
  if (args[i] === '--phone' && args[i + 1]) targetPhone = args[i + 1]
}

function cleanPhone(raw) {
  let cleaned = String(raw || '').replace(/\D/g, '')
  if (cleaned.startsWith('0')) cleaned = '94' + cleaned.slice(1)
  if (!cleaned.startsWith('94') && cleaned.length === 9) cleaned = '94' + cleaned
  return cleaned
}

function fmtCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function runDailySummary() {
  console.log(`\n====================================================================`)
  console.log(`🌊 Seven Waves ERP — Generating Daily Summary for ${targetDate}`)
  console.log(`📱 Recipient Phone: +${cleanPhone(targetPhone)}`)
  console.log(`====================================================================\n`)

  // 1. Fetch Today's GRNs (Goods Received)
  const { data: grns } = await s
    .from('goods_receipts')
    .select(`
      id, doc_number, doc_date, subtotal, tax_amount, total_amount, status,
      supplier:suppliers(id, name, phone),
      lines:goods_receipt_lines(id, item_id, quantity, unit_cost, line_total, item:items(name, code, uom(code)))
    `)
    .eq('doc_date', targetDate)
    .neq('status', 'cancelled')

  // 2. Fetch Today's GINs (Goods Issued)
  const { data: gins } = await s
    .from('inventory_documents')
    .select(`
      id, doc_number, doc_date, doc_type, status, remarks, warehouse_id, target_warehouse_id,
      target_warehouse:warehouses!target_warehouse_id(name),
      lines:inventory_document_lines(id, item_id, quantity, unit_cost, item:items(name, code, category:item_categories(name)))
    `)
    .eq('doc_date', targetDate)
    .in('doc_type', ['GIN', 'GIN_ISSUE', 'WASTAGE'])
    .neq('status', 'cancelled')

  // 3. Fetch Today's Expenses (Cashbook debits on expense ledgers)
  const { data: cashbook } = await s
    .from('finance_cashbook_entries')
    .select(`
      id, entry_date, debit_amount, credit_amount, description, source_type,
      ledger:finance_ledgers(ledger_code, ledger_name, ledger_type, account_group)
    `)
    .eq('entry_date', targetDate)

  const expenseEntries = (cashbook || []).filter(e => 
    e.debit_amount > 0 && e.ledger?.ledger_type === 'expense'
  )

  // 4. Fetch Low Stock Items
  const { data: allStock } = await s
    .from('stock_on_hand')
    .select(`
      item_id, qty_on_hand,
      item:items(id, name, code, reorder_level, uom(code), category:item_categories(name), is_active)
    `)

  const stockByItem = new Map()
  for (const row of allStock || []) {
    if (!row.item || !row.item.is_active) continue
    const curr = stockByItem.get(row.item_id) || {
      name: row.item.name,
      code: row.item.code,
      uom: row.item.uom?.code || 'PCS',
      category: row.item.category?.name || 'General',
      reorder_level: Number(row.item.reorder_level || 0),
      qty_on_hand: 0
    }
    curr.qty_on_hand += Number(row.qty_on_hand || 0)
    stockByItem.set(row.item_id, curr)
  }

  const lowStockItems = Array.from(stockByItem.values()).filter(it => 
    it.reorder_level > 0 && it.qty_on_hand <= it.reorder_level
  )

  // Calculations
  let totalGrnSpend = 0
  let totalGrnTax = 0
  for (const g of grns || []) {
    totalGrnSpend += Number(g.total_amount || 0)
    totalGrnTax += Number(g.tax_amount || 0)
  }

  let totalGinCost = 0
  let foodCostTotal = 0
  let cleaningExpenseTotal = 0
  let gasExpenseTotal = 0
  let packagingTotal = 0

  for (const doc of gins || []) {
    for (const l of doc.lines || []) {
      const cost = Number(l.quantity || 0) * Number(l.unit_cost || 0)
      totalGinCost += cost
      const n = (l.item?.name || '').toLowerCase()
      const c = (l.item?.category?.name || '').toLowerCase()

      if (c.includes('clean') || n.includes('bleach') || n.includes('wash') || n.includes('soap') || n.includes('clean') || n.includes('detergent') || n.includes('towel') || n.includes('serviette') || n.includes('toilet') || n.includes('harpic') || n.includes('vim') || n.includes('idal') || n.includes('kohu')) {
        cleaningExpenseTotal += cost
      } else if (c.includes('fuel') || c.includes('gas') || n.includes('gas') || n.includes('lpg')) {
        gasExpenseTotal += cost
      } else if (c.includes('packag') || n.includes('box')) {
        packagingTotal += cost
      } else {
        foodCostTotal += cost
      }
    }
  }

  const totalDailyExpenses = expenseEntries.reduce((s, e) => s + Number(e.debit_amount || 0), 0)

  // 5. Compose WhatsApp Message
  let msg = `🌊 *SEVEN WAVES RESTAURANT (PVT) LTD*
📊 *OWNER'S DAILY EXECUTIVE BRIEFING*
📅 *Date:* ${targetDate} | ⏰ *Close-of-Day Audit*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *1. FINANCIAL EXPENSES (දෛනික වියදම්)*
• *Total Direct Operating Expenses:* ${fmtCurrency(totalDailyExpenses)}
`

  if (expenseEntries.length > 0) {
    msg += `• *Expense Breakdown by Category:*\n`
    const byCategory = new Map()
    expenseEntries.forEach(e => {
      const name = e.ledger?.ledger_name || 'General Expense'
      byCategory.set(name, (byCategory.get(name) || 0) + Number(e.debit_amount || 0))
    })
    for (const [catName, amt] of byCategory.entries()) {
      msg += `  ▫️ ${catName}: ${fmtCurrency(amt)}\n`
    }
  } else {
    msg += `• _No cash voucher / direct expense disbursements recorded today._\n`
  }

  msg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛒 *2. DAILY PURCHASES (GRN / බඩු ගත් විස්තර)*
• *Total Spend on Purchases:* ${fmtCurrency(totalGrnSpend)} (${grns?.length || 0} Bills Received)
• *Input VAT Recoverable (Asset 1010):* ${fmtCurrency(totalGrnTax)}
`

  if (grns && grns.length > 0) {
    msg += `• *Received Supplier Invoices:*\n`
    grns.forEach((g, idx) => {
      msg += `  ${idx + 1}. *${g.supplier?.name || 'Supplier'}* (${g.doc_number})\n`
      msg += `     Total: ${fmtCurrency(g.total_amount)} (Tax: ${fmtCurrency(g.tax_amount)})\n`
      if (g.lines && g.lines.length > 0) {
        const itemNames = g.lines.slice(0, 3).map(l => `${l.item?.name || 'Item'} (${l.quantity} ${l.item?.uom?.code || ''})`).join(', ')
        msg += `     Items: _${itemNames}${g.lines.length > 3 ? ' +' + (g.lines.length - 3) + ' more' : ''}_\n`
      }
    })
  } else {
    msg += `• _No supplier purchases received today._\n`
  }

  msg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🍲 *3. DAILY STOCK ISSUES (GIN / පරිභෝජන විස්තර)*
• *Total Stock Value Consumed:* ${fmtCurrency(totalGinCost)} (${gins?.length || 0} GINs)
• 🥘 *Kitchen Food Cost (COGS 6000):* ${fmtCurrency(foodCostTotal)}
• 🧼 *Cleaning & Chemicals (Expense 7044):* ${fmtCurrency(cleaningExpenseTotal)}
• 🔥 *Cooking Gas / LPG (Expense 7011):* ${fmtCurrency(gasExpenseTotal)}
• 📦 *Takeaway Packaging (COGS 6001):* ${fmtCurrency(packagingTotal)}
`

  msg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *4. LOW STOCK & REORDER ALERTS (නැවත ඇණවුම් කළ යුතු තොග)*
`
  if (lowStockItems.length > 0) {
    msg += `🚨 *${lowStockItems.length} Items need replenishment:*\n`
    lowStockItems.slice(0, 8).forEach((item, idx) => {
      msg += `  ${idx + 1}. *${item.name}* (${item.code})\n`
      msg += `     On Hand: *${item.qty_on_hand} ${item.uom}* | Reorder Level: ${item.reorder_level} ${item.uom}\n`
    })
    if (lowStockItems.length > 8) {
      msg += `  ▫️ _...and ${lowStockItems.length - 8} more items._\n`
    }
  } else {
    msg += `✅ *All active inventory stock levels are healthy above reorder thresholds.*\n`
  }

  msg += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 _Generated automatically by Seven Waves ERP AI Operations Agent._`

  console.log(msg)

  // 6. Attempt Dispatch via WhatsApp Bridge HTTP
  const postData = JSON.stringify({
    phone: targetPhone,
    message: msg
  })

  let bridgeDelivered = false
  try {
    const req = http.request({
      hostname: 'localhost',
      port: 3005,
      path: '/send-message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 5000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.success) {
            console.log(`\n✅ Successfully delivered to Owner (+${cleanPhone(targetPhone)}) via WhatsApp Bridge!`)
            bridgeDelivered = true
          } else {
            console.log(`\nℹ️ WhatsApp Bridge Response:`, parsed.error || data)
          }
        } catch {
          console.log(`\nℹ️ WhatsApp Bridge Response:`, data)
        }
      })
    })

    req.on('error', (e) => {
      console.log(`\n⚠️ WhatsApp Bridge not connected or offline (Error: ${e.message})`)
    })

    req.write(postData)
    req.end()
  } catch (bridgeErr) {
    console.log('Bridge dispatch error:', bridgeErr.message)
  }

  // 7. Click-to-chat web link for instant 1-click delivery
  const encodedText = encodeURIComponent(msg)
  const waWebUrl = `https://wa.me/${cleanPhone(targetPhone)}?text=${encodedText}`
  console.log(`\n🔗 Instant 1-Click WhatsApp Link:\n${waWebUrl}\n`)

  return { success: true, message: msg, waWebUrl }
}

runDailySummary()

