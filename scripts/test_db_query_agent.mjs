// ═══════════════════════════════════════════════════════════════════════════════
// Test CLI for Natural Language DB Query Agent
// Seven Waves ERP
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Import the agent class logic directly for CLI verification
function fmtLKR(val) {
  const n = Number(val || 0)
  return 'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10)
}

function getYesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getMonthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export class CliNaturalLanguageDbAgent {
  constructor(client) {
    this.client = client
  }

  isMatch(q, keywords) {
    return keywords.some(k => q.includes(k))
  }

  extractDateScope(q) {
    const today = getTodayStr()
    const yesterday = getYesterdayStr()
    const monthStart = getMonthStartStr()

    if (q.includes('yesterday') || q.includes('iye')) {
      return { dateFrom: yesterday, dateTo: yesterday, label: 'Yesterday (' + yesterday + ')' }
    }
    if (q.includes('this month') || q.includes('me mase')) {
      return { dateFrom: monthStart, dateTo: today, label: 'This Month (' + monthStart + ' to ' + today + ')' }
    }
    const dateMatch = q.match(/\b\d{4}-\d{2}-\d{2}\b/)
    if (dateMatch) {
      return { dateFrom: dateMatch[0], dateTo: dateMatch[0], label: dateMatch[0] }
    }
    return { dateFrom: today, dateTo: today, label: 'Today (' + today + ')' }
  }

  async processQuery(prompt) {
    const raw = (prompt || '').trim()
    const q = raw.toLowerCase()

    if (!q) {
      return { answer: 'Please enter a question.', intent: 'EMPTY' }
    }

    // 1. Ledger Balances
    if (this.isMatch(q, ['ledger', 'account balance', 'cogs', 'food cost', 'input vat', 'tax receivable', 'accounts payable', 'ap balance', 'balance of', '1010', '6000', '2000', '1005', '7044', '7011'])) {
      return await this.handleLedgerBalances(q)
    }

    // 2. Purchases & GRN
    if (this.isMatch(q, ['grn', 'purchase', 'purchases', 'bought', 'badu gaththa', 'gaththa badu', 'supplier bill', 'supplier invoice', 'ada gaththa'])) {
      return await this.handlePurchases(q)
    }

    // 3. Low Stock & Reorder Alerts
    if (this.isMatch(q, ['low stock', 'reorder', 'running out', 'out of stock', 'adu wechcha', 'stock adu', 'iwarawena', 'adu thoga', 'reorder alert', 'reorder level'])) {
      return await this.handleLowStock()
    }

    // 4. Stock Issues & GIN
    if (this.isMatch(q, ['gin', 'issued', 'issues', 'kitchen issue', 'kitchen issues', 'kitchen usage', 'paribhojana', 'nikuth', 'food cost issued', 'raw material issue'])) {
      return await this.handleStockIssues(q)
    }

    // 5. Financial Expenses
    if (this.isMatch(q, ['expense', 'expenses', 'spent', 'wiyadam', 'cost', 'petty cash', 'disbursement', 'gas wiyadam', 'ada wiyadam'])) {
      return await this.handleExpenses(q)
    }

    // 6. Sales & Revenue
    if (this.isMatch(q, ['sale', 'sales', 'revenue', 'income', 'orders', 'ada vikuna', 'cashier', 'shift', 'collection', 'pos'])) {
      return await this.handleSales(q)
    }

    // 7. Suppliers
    if (this.isMatch(q, ['supplier', 'suppliers', 'vendor', 'vendors', 'supplierla', 'suppliyer'])) {
      return await this.handleSuppliers()
    }

    // 8. Specific Item Stock
    if (this.isMatch(q, ['stock of', 'how much', 'do we have', 'quantity of', 'thiyeda', 'thiyenawada', 'stock status', 'available'])) {
      const itemResult = await this.handleSpecificItemStock(q)
      if (itemResult) return itemResult
    }

    // 9. Menu
    if (this.isMatch(q, ['menu', 'dish', 'dishes', 'food menu', 'category', 'categories'])) {
      return await this.handleMenuStats()
    }

    // 10. Employees
    if (this.isMatch(q, ['employee', 'employees', 'staff', 'waiter', 'waiters', 'sewayakayo', 'staffing'])) {
      return await this.handleEmployees()
    }

    // Fallback item stock check
    const fallbackItem = await this.handleSpecificItemStock(q)
    if (fallbackItem) return fallbackItem

    return {
      answer: `👋 Seven Waves AI Assistant is ready! You can ask about sales, purchases (GRN), stock issues (GIN), low stock items, or expenses.`,
      intent: 'GENERAL'
    }
  }

  async handlePurchases(q) {
    const scope = this.extractDateScope(q)
    const { data: docs } = await this.client
      .from('inventory_documents')
      .select('id, doc_number, doc_date, total_qty, total_cost, status, supplier:suppliers(name)')
      .eq('doc_type', 'GRN')
      .gte('doc_date', scope.dateFrom)
      .lte('doc_date', scope.dateTo)
      .neq('status', 'cancelled')

    let totalSpend = 0
    const bills = []
    for (const d of docs || []) {
      const cost = Number(d.total_cost || 0)
      totalSpend += cost
      bills.push(`• ${d.doc_number} — ${d.supplier?.name || 'Supplier'} | ${fmtLKR(cost)} (Qty: ${d.total_qty || 0})`)
    }

    let answer = `🛒 **Supplier Purchases & GRN Summary — ${scope.label}**\n\n`
    if (!docs || docs.length === 0) {
      answer += `No supplier purchase goods receipts (GRN) recorded for ${scope.label}.`
    } else {
      answer += `• Total Purchases: **${fmtLKR(totalSpend)}** (${docs.length} bills)\n\n`
      answer += bills.join('\n')
    }
    return { answer, intent: 'PURCHASES_GRN', totalSpend, count: docs?.length || 0 }
  }

  async handleLowStock() {
    const { data: stockRows } = await this.client
      .from('stock_on_hand')
      .select('qty_on_hand, items(id, name, code, reorder_level, is_active)')

    const itemMap = new Map()
    for (const row of stockRows || []) {
      const it = row.items
      if (!it || it.is_active === false) continue
      const reorder = Number(it.reorder_level || 0)
      if (reorder <= 0) continue

      const existing = itemMap.get(it.id) || {
        id: it.id,
        name: it.name,
        code: it.code,
        reorder_level: reorder,
        qty_on_hand: 0
      }
      existing.qty_on_hand += Number(row.qty_on_hand || 0)
      itemMap.set(it.id, existing)
    }

    const lowItems = Array.from(itemMap.values()).filter(i => i.qty_on_hand <= i.reorder_level)
    lowItems.sort((a, b) => a.qty_on_hand - b.qty_on_hand)

    let answer = `⚠️ **Low Stock & Reorder Alert**\n\n`
    if (lowItems.length === 0) {
      answer += `✅ All active inventory items are healthy above reorder thresholds.`
    } else {
      answer += `🚨 **${lowItems.length} items** are below reorder level:\n\n`
      answer += lowItems.slice(0, 10).map(i => `• **${i.name}** (${i.code}): On Hand: ${i.qty_on_hand} | Reorder: ${i.reorder_level}`).join('\n')
    }
    return { answer, intent: 'STOCK_LOW_REORDER', count: lowItems.length }
  }

  async handleSpecificItemStock(q) {
    const cleanWord = q.replace(/\b(how much|stock of|do we have|quantity of|thiyeda|thiyenawada|stock status|available|stock)\b/gi, '').replace(/[?.,]/g, '').trim()
    if (!cleanWord || cleanWord.length < 2) return null

    const { data: matched } = await this.client
      .from('items')
      .select('id, name, code, reorder_level')
      .ilike('name', `%${cleanWord}%`)
      .limit(5)

    if (!matched || matched.length === 0) return null

    const ids = matched.map(m => m.id)
    const { data: stocks } = await this.client.from('stock_on_hand').select('item_id, qty_on_hand').in('item_id', ids)

    let answer = `📦 **Inventory Stock Level for "${cleanWord.toUpperCase()}"**\n\n`
    for (const m of matched) {
      const total = (stocks || []).filter(s => s.item_id === m.id).reduce((sum, s) => sum + Number(s.qty_on_hand || 0), 0)
      answer += `• **${m.name}** (\`${m.code}\`): **${total} units** on hand ${Number(m.reorder_level) > 0 ? '(Reorder level: ' + m.reorder_level + ')' : ''}\n`
    }
    return { answer, intent: 'STOCK_SPECIFIC_ITEM' }
  }

  async handleStockIssues(q) {
    const scope = this.extractDateScope(q)
    const { data: gins } = await this.client
      .from('inventory_documents')
      .select('id, doc_number, total_cost, total_qty, status')
      .in('doc_type', ['GIN', 'GIN_ISSUE', 'WASTAGE'])
      .gte('doc_date', scope.dateFrom)
      .lte('doc_date', scope.dateTo)
      .neq('status', 'cancelled')

    let totalVal = 0
    for (const g of gins || []) totalVal += Number(g.total_cost || 0)

    let answer = `🍲 **Daily Stock Issues (GIN) — ${scope.label}**\n\n`
    if (!gins || gins.length === 0) {
      answer += `No stock issue documents (GIN) recorded for ${scope.label}.`
    } else {
      answer += `• Total Stock Value Consumed: **${fmtLKR(totalVal)}** (${gins.length} GIN documents)\n`
    }
    return { answer, intent: 'STOCK_ISSUES_GIN', totalVal, count: gins?.length || 0 }
  }

  async handleExpenses(q) {
    const scope = this.extractDateScope(q)
    const { data: entries } = await this.client
      .from('finance_cashbook_entries')
      .select('id, debit_amount, description, ledger:finance_ledgers(ledger_name, ledger_type)')
      .gte('entry_date', scope.dateFrom)
      .lte('entry_date', scope.dateTo)

    const expenseList = (entries || []).filter(e => Number(e.debit_amount) > 0 && e.ledger?.ledger_type === 'expense')
    let total = 0
    for (const e of expenseList) total += Number(e.debit_amount || 0)

    let answer = `💰 **Operating Expenses — ${scope.label}**\n\n`
    if (expenseList.length === 0) {
      answer += `No cash voucher or operating expense disbursements recorded for ${scope.label}.`
    } else {
      answer += `• Total Operating Expenses: **${fmtLKR(total)}** (${expenseList.length} transactions)\n`
    }
    return { answer, intent: 'EXPENSES_SUMMARY', total, count: expenseList.length }
  }

  async handleLedgerBalances(q) {
    const { data: ledgers } = await this.client
      .from('finance_ledgers')
      .select('ledger_code, ledger_name, current_balance, ledger_type')
      .is('deleted_at', null)
      .in('ledger_code', ['1000', '1005', '1010', '2000', '6000', '7011', '7044'])

    let answer = `🏛️ **General Ledger Key Account Balances**\n\n`
    for (const l of ledgers || []) {
      answer += `• **${l.ledger_code} — ${l.ledger_name}**: **${fmtLKR(l.current_balance)}**\n`
    }
    return { answer, intent: 'LEDGER_BALANCE' }
  }

  async handleSales(q) {
    const scope = this.extractDateScope(q)
    const { data: orders } = await this.client
      .from('orders')
      .select('id, total_amount, status')
      .gte('created_at', scope.dateFrom + 'T00:00:00')
      .lte('created_at', scope.dateTo + 'T23:59:59')

    const paid = (orders || []).filter(o => o.status === 'completed' || o.status === 'paid')
    const total = paid.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)

    let answer = `💵 **Restaurant Sales & Revenue — ${scope.label}**\n\n`
    if (paid.length === 0) {
      answer += `No completed orders recorded for ${scope.label}.`
    } else {
      answer += `• Total Net Revenue: **${fmtLKR(total)}** (${paid.length} orders)\n`
    }
    return { answer, intent: 'SALES_REVENUE', total, count: paid.length }
  }

  async handleSuppliers() {
    const { count } = await this.client.from('suppliers').select('id', { count: 'exact', head: true })
    return {
      answer: `🤝 **Suppliers Directory:** There are **${count || 0} active suppliers** registered in Seven Waves ERP.`,
      intent: 'SUPPLIERS',
      count
    }
  }

  async handleMenuStats() {
    const { count } = await this.client.from('menu_items').select('id', { count: 'exact', head: true })
    return {
      answer: `🍽️ **Seven Waves Menu:** There are currently **${count || 0} active dishes** listed in the menu.`,
      intent: 'MENU_ITEMS',
      count
    }
  }

  async handleEmployees() {
    const { count } = await this.client.from('employees').select('id', { count: 'exact', head: true })
    return {
      answer: `👥 **Staff Overview:** Seven Waves Restaurant has **${count || 0} staff members** in the HR system.`,
      intent: 'EMPLOYEES_HR',
      count
    }
  }
}

// CLI Execution
const testPrompts = process.argv.slice(2).join(' ') || "today purchases"
const agent = new CliNaturalLanguageDbAgent(supabase)

console.log('🤖 Natural Language DB Query Agent Test')
console.log('Query:', testPrompts)
console.log('--------------------------------------------------')

agent.processQuery(testPrompts).then(res => {
  console.log(res.answer)
  console.log('--------------------------------------------------')
  console.log('Intent Detected:', res.intent)
  process.exit(0)
}).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
