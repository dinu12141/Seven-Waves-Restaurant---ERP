// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Natural Language Database Query Agent
// ═══════════════════════════════════════════════════════════════════════════════
// Translates natural language questions in English, Sinhala, and Singlish
// into accurate, real-time live database queries against Supabase.
// Covers:
//   1. Daily Purchases & Supplier GRNs (goods_receipts & inventory_documents)
//   2. Low Stock & Reorder Alerts (stock_on_hand & items)
//   3. Specific Item Stock Level checks (item search + on-hand quantities)
//   4. Daily Stock Issues & GIN (Kitchen Food Cost vs Cleaning vs Gas)
//   5. Financial Expenses & Cashbook (debit expenses, ledger postings)
//   6. General Ledger Balances & Chart of Accounts (COGS 6000, Tax 1010, AP 2000)
//   7. Sales & POS Shifts (revenue, payment methods, order counts)
//   8. Suppliers, Menu Items & HR Staffing counts
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase as defaultClient } from 'src/boot/supabase'

export interface AgentQueryResult {
  answer: string
  intent: string
  confidence: number
  data?: any
  suggestions?: string[]
}

function fmtLKR(val: number | string | null | undefined): string {
  const n = Number(val || 0)
  return 'LKR ' + n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function getYesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function getMonthStartStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Natural Language Database Query Agent
 */
export class NaturalLanguageDbAgent {
  private client: any

  constructor(customClient?: any) {
    this.client = customClient || defaultClient
  }

  /**
   * Main entry point: Process a user question and return an answer with verified DB data.
   */
  async processQuery(prompt: string, branchId?: string): Promise<AgentQueryResult> {
    const raw = (prompt || '').trim()
    const q = raw.toLowerCase()

    if (!q) {
      return {
        answer: 'Please enter a question about Seven Waves Restaurant operations, sales, inventory, or expenses.',
        intent: 'EMPTY',
        confidence: 1.0,
        suggestions: ["Today's sales", "Today's purchases (GRN)", "Low stock items", "Today's expenses"]
      }
    }

    try {
      // 1. Specific Ledger Balances / Chart of Accounts (COGS, Tax, AP, Cash, GL)
      if (this.isMatch(q, ['ledger', 'account balance', 'cogs', 'food cost', 'input vat', 'tax receivable', 'accounts payable', 'ap balance', 'balance of', '1010', '6000', '2000', '1005', '7044', '7011'])) {
        return await this.handleLedgerBalances(q)
      }

      // 2. Purchases & GRN (බඩු ගත් විස්තර)
      if (this.isMatch(q, ['grn', 'purchase', 'purchases', 'bought', 'badu gaththa', 'gaththa badu', 'supplier bill', 'supplier invoice', 'ada gaththa'])) {
        return await this.handlePurchases(q, branchId)
      }

      // 3. Low Stock & Reorder Alerts (තොග අඩු වීම්)
      if (this.isMatch(q, ['low stock', 'reorder', 'running out', 'out of stock', 'adu wechcha', 'stock adu', 'iwarawena', 'adu thoga', 'reorder alert', 'reorder level'])) {
        return await this.handleLowStock()
      }

      // 4. Stock Issues & GIN (පරිභෝජන විස්තර / Kitchen Usage)
      if (this.isMatch(q, ['gin', 'issued', 'issues', 'kitchen issue', 'kitchen issues', 'kitchen usage', 'paribhojana', 'nikuth', 'food cost issued', 'raw material issue'])) {
        return await this.handleStockIssues(q, branchId)
      }

      // 5. Financial Expenses (දෛනික වියදම් / Cash disbursements)
      if (this.isMatch(q, ['expense', 'expenses', 'spent', 'wiyadam', 'cost', 'petty cash', 'disbursement', 'gas wiyadam', 'ada wiyadam'])) {
        return await this.handleExpenses(q, branchId)
      }

      // 6. Sales & Revenue (ආදායම / බිල්පත්)
      if (this.isMatch(q, ['sale', 'sales', 'revenue', 'income', 'orders', 'ada vikuna', 'cashier', 'shift', 'collection', 'pos'])) {
        return await this.handleSales(q, branchId)
      }

      // 7. Suppliers (සැපයුම්කරුවන්)
      if (this.isMatch(q, ['supplier', 'suppliers', 'vendor', 'vendors', 'supplierla', 'suppliyer'])) {
        return await this.handleSuppliers()
      }

      // 8. Specific Item Stock Level (e.g. "how much sugar", "chicken stock", "gas tank")
      if (this.isMatch(q, ['stock of', 'how much', 'do we have', 'quantity of', 'thiyeda', 'thiyenawada', 'stock status', 'available'])) {
        const itemResult = await this.handleSpecificItemStock(q)
        if (itemResult) return itemResult
      }

      // 9. Menu Items & Catalog (මෙනු අයිතම)
      if (this.isMatch(q, ['menu', 'dish', 'dishes', 'food menu', 'category', 'categories'])) {
        return await this.handleMenuStats()
      }

      // 10. HR & Employees (සේවක මණ්ඩලය)
      if (this.isMatch(q, ['employee', 'employees', 'staff', 'waiter', 'waiters', 'sewayakayo', 'staffing'])) {
        return await this.handleEmployees()
      }

      // 11. Try item stock lookup fallback if query mentions an item
      const itemFallback = await this.handleSpecificItemStock(q)
      if (itemFallback) return itemFallback

      // 12. Fallback guidance with helpful prompt suggestions
      return this.handleGeneralGuidance(raw)

    } catch (err: any) {
      console.error('[NaturalLanguageDbAgent] Error processing query:', err)
      return {
        answer: `⚠️ I encountered an error querying the system data: ${err.message || 'Unknown error'}. Please try again.`,
        intent: 'ERROR',
        confidence: 0.0
      }
    }
  }

  private isMatch(q: string, keywords: string[]): boolean {
    return keywords.some(k => q.includes(k))
  }

  private extractDateScope(q: string): { dateFrom: string; dateTo: string; label: string } {
    const today = getTodayStr()
    const yesterday = getYesterdayStr()
    const monthStart = getMonthStartStr()

    if (q.includes('yesterday') || q.includes('iye')) {
      return { dateFrom: yesterday, dateTo: yesterday, label: 'Yesterday (' + yesterday + ')' }
    }
    if (q.includes('this month') || q.includes('me mase')) {
      return { dateFrom: monthStart, dateTo: today, label: 'This Month (' + monthStart + ' to ' + today + ')' }
    }
    // Match explicit date format YYYY-MM-DD
    const dateMatch = q.match(/\b\d{4}-\d{2}-\d{2}\b/)
    if (dateMatch) {
      return { dateFrom: dateMatch[0], dateTo: dateMatch[0], label: dateMatch[0] }
    }
    return { dateFrom: today, dateTo: today, label: 'Today (' + today + ')' }
  }

  // ── 1. Purchases & GRN ───────────────────────────────────────────────────────
  private async handlePurchases(q: string, branchId?: string): Promise<AgentQueryResult> {
    const scope = this.extractDateScope(q)

    let query = this.client
      .from('inventory_documents')
      .select(`
        id, doc_number, doc_date, total_qty, total_cost, status, remarks,
        supplier:suppliers(id, name),
        lines:inventory_document_lines(id, item_id, quantity, unit_cost, line_total, tax_amount, item:items(name, code))
      `)
      .eq('doc_type', 'GRN')
      .gte('doc_date', scope.dateFrom)
      .lte('doc_date', scope.dateTo)
      .neq('status', 'cancelled')

    if (branchId) query = query.eq('branch_id', branchId)

    const { data: grnDocs, error: grnErr } = await query
    if (grnErr) throw grnErr

    // Also check goods_receipts table if separate
    const { data: grnReceipts } = await this.client
      .from('goods_receipts')
      .select('id, doc_number, doc_date, subtotal, tax_amount, total_amount, status, supplier:suppliers(name)')
      .gte('doc_date', scope.dateFrom)
      .lte('doc_date', scope.dateTo)
      .neq('status', 'cancelled')

    const docs = grnDocs || []
    const receipts = grnReceipts || []
    const totalCount = docs.length + receipts.length

    let totalSpend = 0
    let totalTax = 0
    const billsList: string[] = []

    for (const d of docs) {
      const cost = Number(d.total_cost || 0)
      totalSpend += cost
      const sName = d.supplier?.name || 'Standard Supplier'
      billsList.push(`• **${d.doc_number}** — ${sName} | Total: **${fmtLKR(cost)}** (Qty: ${d.total_qty || 0})`)
      for (const line of d.lines || []) {
        totalTax += Number(line.tax_amount || 0)
      }
    }

    for (const r of receipts) {
      const tot = Number(r.total_amount || 0)
      totalSpend += tot
      totalTax += Number(r.tax_amount || 0)
      const sName = r.supplier?.name || 'Standard Supplier'
      billsList.push(`• **${r.doc_number}** — ${sName} | Total: **${fmtLKR(tot)}**`)
    }

    let answer = `🛒 **Supplier Purchases & GRN Summary — ${scope.label}**\n\n`
    if (totalCount === 0) {
      answer += `No supplier purchase goods receipts (GRN) recorded for **${scope.label}**.`
    } else {
      answer += `• **Total Purchases:** **${fmtLKR(totalSpend)}**\n`
      answer += `• **Total GRN Invoices:** **${totalCount} bills**\n`
      if (totalTax > 0) {
        answer += `• **Input VAT Recoverable (Asset 1010):** **${fmtLKR(totalTax)}**\n`
      }
      answer += `\n**Bills Received:**\n` + billsList.slice(0, 10).join('\n')
      if (billsList.length > 10) {
        answer += `\n_...and ${billsList.length - 10} more bills._`
      }
    }

    return {
      answer,
      intent: 'PURCHASES_GRN',
      confidence: 0.95,
      data: { totalSpend, totalCount, totalTax, scope },
      suggestions: ['Low stock items', "Today's stock issues (GIN)", "Accounts payable balance"]
    }
  }

  // ── 2. Low Stock & Reorder Alerts ───────────────────────────────────────────
  private async handleLowStock(): Promise<AgentQueryResult> {
    const { data: stockRows, error } = await this.client
      .from('stock_on_hand')
      .select('item_id, qty_on_hand, items(id, name, code, reorder_level, uom_id, is_active)')

    if (error) throw error

    // Aggregate by item
    const itemMap = new Map<string, { id: string; name: string; code: string; reorder_level: number; qty_on_hand: number }>()

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
      answer += `✅ **All active items are healthy!** No items are currently below their reorder thresholds.`
    } else {
      answer += `🚨 **${lowItems.length} items** are currently at or below their reorder level and require purchasing:\n\n`
      const list = lowItems.slice(0, 15).map(i => {
        const diff = i.reorder_level - i.qty_on_hand
        return `• **${i.name}** (${i.code}) — On Hand: **${i.qty_on_hand}** | Reorder Level: **${i.reorder_level}** | Shortage: **${diff > 0 ? diff : 0}**`
      })
      answer += list.join('\n')
      if (lowItems.length > 15) {
        answer += `\n_...and ${lowItems.length - 15} more low stock items._`
      }
    }

    return {
      answer,
      intent: 'STOCK_LOW_REORDER',
      confidence: 0.98,
      data: { lowItemsCount: lowItems.length, items: lowItems },
      suggestions: ["Today's purchases (GRN)", "Check supplier list", "Stock of chicken"]
    }
  }

  // ── 3. Specific Item Stock Level Check ───────────────────────────────────────
  private async handleSpecificItemStock(q: string): Promise<AgentQueryResult | null> {
    // Extract likely item keywords
    const cleanWord = q
      .replace(/\b(how much|stock of|do we have|quantity of|thiyeda|thiyenawada|stock status|available|what is the stock|stock)\b/gi, '')
      .replace(/[?.,]/g, '')
      .trim()

    if (!cleanWord || cleanWord.length < 2) return null

    const { data: matchedItems, error: itemErr } = await this.client
      .from('items')
      .select('id, name, code, reorder_level, cost_price')
      .ilike('name', `%${cleanWord}%`)
      .limit(6)

    if (itemErr || !matchedItems || matchedItems.length === 0) return null

    const itemIds = matchedItems.map(i => i.id)
    const { data: stockData } = await this.client
      .from('stock_on_hand')
      .select('item_id, qty_on_hand, warehouse:warehouses(name)')
      .in('item_id', itemIds)

    let answer = `📦 **Inventory Stock Level for "${cleanWord.toUpperCase()}"**\n\n`
    for (const item of matchedItems) {
      const itemStocks = (stockData || []).filter((s: any) => s.item_id === item.id)
      const totalQty = itemStocks.reduce((sum: number, s: any) => sum + Number(s.qty_on_hand || 0), 0)
      const isLow = Number(item.reorder_level || 0) > 0 && totalQty <= Number(item.reorder_level)

      answer += `• **${item.name}** (\`${item.code}\`):\n`
      answer += `   - **Total On Hand:** **${totalQty}** ${isLow ? '⚠️ *(Below Reorder Level of ' + item.reorder_level + ')*' : '✅'}\n`
      if (itemStocks.length > 0) {
        const whDetails = itemStocks.map((s: any) => `${s.warehouse?.name || 'Main Warehouse'}: ${s.qty_on_hand}`).join(', ')
        answer += `   - *Locations:* ${whDetails}\n`
      }
    }

    return {
      answer,
      intent: 'STOCK_SPECIFIC_ITEM',
      confidence: 0.92,
      data: { matchedItems, stockData },
      suggestions: ['Low stock items', "Today's stock issues (GIN)", "Today's purchases (GRN)"]
    }
  }

  // ── 4. Stock Issues & GIN (Goods Issue Notes) ──────────────────────────────
  private async handleStockIssues(q: string, branchId?: string): Promise<AgentQueryResult> {
    const scope = this.extractDateScope(q)

    let query = this.client
      .from('inventory_documents')
      .select(`
        id, doc_number, doc_date, doc_type, status, total_qty, total_cost, remarks,
        target_warehouse:warehouses!target_warehouse_id(name),
        lines:inventory_document_lines(id, item_id, quantity, unit_cost, line_total, item:items(name, code))
      `)
      .in('doc_type', ['GIN', 'GIN_ISSUE', 'WASTAGE'])
      .gte('doc_date', scope.dateFrom)
      .lte('doc_date', scope.dateTo)
      .neq('status', 'cancelled')

    if (branchId) query = query.eq('branch_id', branchId)

    const { data: gins, error } = await query
    if (error) throw error

    let totalConsumed = 0
    let foodCost = 0
    let cleaningCost = 0
    let gasCost = 0
    let otherCost = 0

    for (const doc of gins || []) {
      for (const line of doc.lines || []) {
        const val = Number(line.line_total || (line.quantity * line.unit_cost) || 0)
        totalConsumed += val
        const iName = (line.item?.name || '').toLowerCase()

        if (iName.includes('gas') || iName.includes('lpg')) {
          gasCost += val
        } else if (
          iName.includes('bleach') || iName.includes('detergent') || iName.includes('sanit') ||
          iName.includes('soap') || iName.includes('sponge') || iName.includes('cleaner')
        ) {
          cleaningCost += val
        } else {
          foodCost += val
        }
      }
    }

    let answer = `🍲 **Daily Stock Issues & GIN Summary — ${scope.label}**\n\n`
    if (!gins || gins.length === 0) {
      answer += `No stock issue documents (GIN) recorded for **${scope.label}**.`
    } else {
      answer += `• **Total Stock Value Consumed:** **${fmtLKR(totalConsumed)}** (${gins.length} GIN documents)\n\n`
      answer += `**Account Classification Breakdown:**\n`
      answer += `• 🥘 **Kitchen Food Cost (COGS 6000):** **${fmtLKR(foodCost)}**\n`
      answer += `• 🧼 **Cleaning & Sanitation (Expense 7044):** **${fmtLKR(cleaningCost)}**\n`
      answer += `• 🔥 **Cooking Gas / LPG (Expense 7011):** **${fmtLKR(gasCost)}**\n`
      if (otherCost > 0) {
        answer += `• 📦 **Other Consumables:** **${fmtLKR(otherCost)}**\n`
      }
      answer += `\n**Recent GIN Notes:**\n`
      const notes = gins.slice(0, 5).map(g => `• **${g.doc_number}** (${g.target_warehouse?.name || 'Kitchen'}) — Total: **${fmtLKR(g.total_cost)}**`)
      answer += notes.join('\n')
    }

    return {
      answer,
      intent: 'STOCK_ISSUES_GIN',
      confidence: 0.94,
      data: { totalConsumed, foodCost, cleaningCost, gasCost, ginsCount: gins?.length || 0 },
      suggestions: ['Food cost ledger 6000 balance', "Today's purchases (GRN)", "Low stock items"]
    }
  }

  // ── 5. Financial Expenses (Cashbook & Disbursements) ────────────────────────
  private async handleExpenses(q: string, branchId?: string): Promise<AgentQueryResult> {
    const scope = this.extractDateScope(q)

    let query = this.client
      .from('finance_cashbook_entries')
      .select(`
        id, entry_date, debit_amount, credit_amount, description, source_type,
        ledger:finance_ledgers(ledger_code, ledger_name, ledger_type)
      `)
      .gte('entry_date', scope.dateFrom)
      .lte('entry_date', scope.dateTo)

    if (branchId) query = query.eq('branch_id', branchId)

    const { data: entries, error } = await query
    if (error) throw error

    const expenseList = (entries || []).filter((e: any) =>
      Number(e.debit_amount) > 0 && e.ledger?.ledger_type === 'expense'
    )

    let totalExpense = 0
    const byCategory = new Map<string, number>()

    for (const e of expenseList) {
      const amt = Number(e.debit_amount || 0)
      totalExpense += amt
      const cat = e.ledger?.ledger_name || 'General Operating Expense'
      byCategory.set(cat, (byCategory.get(cat) || 0) + amt)
    }

    let answer = `💰 **Operating Expenses Summary — ${scope.label}**\n\n`
    if (expenseList.length === 0) {
      answer += `No cash voucher or direct operating expense disbursements recorded for **${scope.label}**.`
    } else {
      answer += `• **Total Operating Expenses:** **${fmtLKR(totalExpense)}** (${expenseList.length} transactions)\n\n`
      answer += `**Category Breakdown:**\n`
      for (const [cat, amt] of byCategory.entries()) {
        answer += `• ${cat}: **${fmtLKR(amt)}**\n`
      }
    }

    return {
      answer,
      intent: 'EXPENSES_SUMMARY',
      confidence: 0.95,
      data: { totalExpense, count: expenseList.length },
      suggestions: ['Food cost balance (COGS 6000)', "Today's sales", "Accounts payable balance"]
    }
  }

  // ── 6. General Ledger Balances & Chart of Accounts ──────────────────────────
  private async handleLedgerBalances(q: string): Promise<AgentQueryResult> {
    const { data: ledgers, error } = await this.client
      .from('finance_ledgers')
      .select('id, ledger_code, ledger_name, current_balance, ledger_type, account_group')
      .is('deleted_at', null)

    if (error) throw error

    const all = ledgers || []

    // If specific code requested
    const targetCodes = ['1000', '1005', '1010', '2000', '6000', '7011', '7044']
    const matched = all.filter((l: any) => {
      const code = String(l.ledger_code || '')
      const name = (l.ledger_name || '').toLowerCase()
      if (q.includes(code)) return true
      if (q.includes('cogs') || q.includes('food cost')) return code === '6000'
      if (q.includes('vat') || q.includes('tax')) return code === '1010'
      if (q.includes('payable') || q.includes('ap')) return code === '2000'
      if (q.includes('gas')) return code === '7011'
      if (q.includes('cleaning')) return code === '7044'
      return targetCodes.includes(code)
    })

    let answer = `🏛️ **General Ledger Key Account Balances**\n\n`
    if (matched.length === 0) {
      answer += `No matching ledger accounts found.`
    } else {
      for (const l of matched) {
        answer += `• **${l.ledger_code} — ${l.ledger_name}** (${l.ledger_type?.toUpperCase()}):\n`
        answer += `   Current Balance: **${fmtLKR(l.current_balance)}**\n`
      }
    }

    return {
      answer,
      intent: 'LEDGER_BALANCE',
      confidence: 0.96,
      data: { matched },
      suggestions: ["Today's expenses", "Today's purchases (GRN)", "Low stock items"]
    }
  }

  // ── 7. Sales & POS Shifts ──────────────────────────────────────────────────
  private async handleSales(q: string, branchId?: string): Promise<AgentQueryResult> {
    const scope = this.extractDateScope(q)

    let query = this.client
      .from('orders')
      .select('id, order_number, total_amount, status, payment_method, created_at')
      .gte('created_at', scope.dateFrom + 'T00:00:00')
      .lte('created_at', scope.dateTo + 'T23:59:59')

    if (branchId) query = query.eq('branch_id', branchId)

    const { data: orders, error } = await query
    if (error) throw error

    // Also check pos_shifts
    const { data: shifts } = await this.client
      .from('pos_shifts')
      .select('cash_sales_total, card_sales_total, qr_sales_total, total_sales')
      .gte('opened_at', scope.dateFrom + 'T00:00:00')
      .lte('opened_at', scope.dateTo + 'T23:59:59')

    const paidOrders = (orders || []).filter((o: any) => o.status === 'completed' || o.status === 'paid')
    const totalRev = paidOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0)

    let answer = `💵 **Restaurant Sales & Revenue — ${scope.label}**\n\n`
    if (paidOrders.length === 0 && (!shifts || shifts.length === 0)) {
      answer += `No completed orders or active POS shift collections recorded for **${scope.label}**.`
    } else {
      answer += `• **Total Net Revenue:** **${fmtLKR(totalRev)}**\n`
      answer += `• **Completed Orders:** **${paidOrders.length} orders**\n`
      if (paidOrders.length > 0) {
        const avg = totalRev / paidOrders.length
        answer += `• **Average Ticket / Bill:** **${fmtLKR(avg)}**\n`
      }
    }

    return {
      answer,
      intent: 'SALES_REVENUE',
      confidence: 0.95,
      data: { totalRev, orderCount: paidOrders.length },
      suggestions: ["Today's expenses", "Today's stock issues (GIN)", "Low stock items"]
    }
  }

  // ── 8. Suppliers ───────────────────────────────────────────────────────────
  private async handleSuppliers(): Promise<AgentQueryResult> {
    const { count, data: suppliers, error } = await this.client
      .from('suppliers')
      .select('id, name, phone, email, is_active', { count: 'exact' })
      .order('name', { ascending: true })
      .limit(10)

    if (error) throw error

    let answer = `🤝 **Suppliers Directory**\n\n`
    answer += `• **Total Registered Suppliers:** **${count || 0} active vendors**\n\n`
    answer += `**Key Suppliers:**\n`
    for (const s of suppliers || []) {
      answer += `• **${s.name}** ${s.phone ? '📞 ' + s.phone : ''}\n`
    }

    return {
      answer,
      intent: 'SUPPLIERS',
      confidence: 0.95,
      data: { count, suppliers },
      suggestions: ["Today's purchases (GRN)", "Low stock items", "Accounts payable balance"]
    }
  }

  // ── 9. Menu Items & Catalog ─────────────────────────────────────────────────
  private async handleMenuStats(): Promise<AgentQueryResult> {
    const { count, error } = await this.client
      .from('menu_items')
      .select('id', { count: 'exact', head: true })

    if (error) throw error

    const { data: topCategories } = await this.client
      .from('menu_categories')
      .select('name, is_active')
      .limit(8)

    let answer = `🍽️ **Seven Waves Menu Catalog**\n\n`
    answer += `• **Total Active Menu Dishes:** **${count || 0} items**\n`
    if (topCategories && topCategories.length > 0) {
      answer += `• **Menu Categories:** ${topCategories.map((c: any) => c.name).join(', ')}\n`
    }

    return {
      answer,
      intent: 'MENU_ITEMS',
      confidence: 0.92,
      data: { count },
      suggestions: ["Today's sales", "Low stock items", "Today's stock issues (GIN)"]
    }
  }

  // ── 10. Employees & HR ─────────────────────────────────────────────────────
  private async handleEmployees(): Promise<AgentQueryResult> {
    const { count, data: empList, error } = await this.client
      .from('employees')
      .select('id, first_name, last_name, designation, is_active', { count: 'exact' })
      .limit(10)

    if (error) throw error

    let answer = `👥 **Staff & Employee Overview**\n\n`
    answer += `• **Total Employees:** **${count || 0} active staff members**\n\n`
    answer += `**Recent Staff Members:**\n`
    for (const e of empList || []) {
      const name = `${e.first_name || ''} ${e.last_name || ''}`.trim()
      answer += `• **${name}** — ${e.designation || 'Staff'}\n`
    }

    return {
      answer,
      intent: 'EMPLOYEES_HR',
      confidence: 0.93,
      data: { count },
      suggestions: ["Today's sales", "Today's expenses", "Today's purchases"]
    }
  }

  // ── 11. General Guidance & Fallback ─────────────────────────────────────────
  private handleGeneralGuidance(raw: string): AgentQueryResult {
    return {
      answer: `👋 **Seven Waves Executive AI Assistant**\n\nI can retrieve real-time live data directly from your database for questions like:\n\n` +
        `• 🛒 *"What were today's purchases (GRN)?"*\n` +
        `• ⚠️ *"Which items are running low on stock?"*\n` +
        `• 📦 *"How much chicken/sugar/gas stock do we have?"*\n` +
        `• 🍲 *"Today's stock issues and kitchen food cost (GIN)?"*\n` +
        `• 💰 *"What are today's operating expenses?"*\n` +
        `• 🏛️ *"What is the balance of Food Cost (6000) or Tax (1010)?"*\n` +
        `• 💵 *"What were today's total sales and orders?"*\n` +
        `• 🤝 *"How many suppliers do we have?"*\n\n` +
        `_You can also ask in Sinhala / Singlish (e.g. "ada badu gaththa ewa", "low stock monawada", "ada wiyadam kiyada")!_`,
      intent: 'GENERAL_GUIDANCE',
      confidence: 0.70,
      suggestions: [
        "Today's purchases (GRN)",
        "Low stock items",
        "Today's stock issues (GIN)",
        "Today's expenses",
        "Food cost ledger 6000 balance"
      ]
    }
  }
}

// Singleton instance
export const naturalLanguageDbAgent = new NaturalLanguageDbAgent()
