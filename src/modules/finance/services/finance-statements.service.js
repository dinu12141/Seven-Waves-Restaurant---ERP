// ═══════════════════════════════════════════════════════════════════════════════
// Finance Statements Service — Trial Balance, P&L, Balance Sheet
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export const financeStatementsService = {
  // ── Trial Balance ─────────────────────────────────────────────────────────
  async generateTrialBalance(filters = {}) {
    // Fetch all active ledgers
    let q = supabase.from('finance_ledgers').select('*').eq('is_active', true).is('deleted_at', null).order('ledger_code')
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    const { data: ledgers, error: lErr } = await q
    if (lErr) throw lErr

    // Fetch cashbook entries for the period
    let eq = supabase.from('finance_cashbook_entries').select('ledger_id, debit_amount, credit_amount, entry_date')
    if (filters.branch_id) eq = eq.eq('branch_id', filters.branch_id)
    if (filters.date_from) eq = eq.gte('entry_date', filters.date_from)
    if (filters.date_to) eq = eq.lte('entry_date', filters.date_to)
    const { data: entries } = await eq

    // Aggregate by ledger
    const entryMap = {}
    ;(entries || []).forEach(e => {
      if (!entryMap[e.ledger_id]) entryMap[e.ledger_id] = { debit: 0, credit: 0 }
      entryMap[e.ledger_id].debit += Number(e.debit_amount)
      entryMap[e.ledger_id].credit += Number(e.credit_amount)
    })

    const rows = (ledgers || []).map(l => {
      const opening = Number(l.opening_balance)
      const openingDebit = l.opening_balance_type === 'debit' ? opening : 0
      const openingCredit = l.opening_balance_type === 'credit' ? opening : 0
      const periodDebit = entryMap[l.id]?.debit || 0
      const periodCredit = entryMap[l.id]?.credit || 0
      const closingDebit = openingDebit + periodDebit
      const closingCredit = openingCredit + periodCredit

      return {
        ledger_code: l.ledger_code,
        ledger_name: l.ledger_name,
        ledger_type: l.ledger_type,
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: periodDebit,
        period_credit: periodCredit,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
      }
    }).filter(r => r.closing_debit !== 0 || r.closing_credit !== 0)

    const totalDebit = rows.reduce((s, r) => s + r.closing_debit, 0)
    const totalCredit = rows.reduce((s, r) => s + r.closing_credit, 0)

    return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  },

  // ── Profit & Loss ─────────────────────────────────────────────────────────
  async generateProfitLoss(filters = {}) {
    const tb = await this.generateTrialBalance(filters)

    const revenueItems = tb.rows.filter(r => r.ledger_type === 'income').map(r => ({ name: r.ledger_name, amount: r.closing_credit - r.closing_debit }))
    const expenseItems = tb.rows.filter(r => r.ledger_type === 'expense').map(r => ({ name: r.ledger_name, amount: r.closing_debit - r.closing_credit }))

    const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0)

    // Separate COGS from operating expenses
    const cogsItems = expenseItems.filter(i => i.name.toLowerCase().includes('cost of') || i.name.toLowerCase().includes('cogs'))
    const opexItems = expenseItems.filter(i => !cogsItems.includes(i))
    const totalCogs = cogsItems.reduce((s, i) => s + i.amount, 0)
    const totalOpex = opexItems.reduce((s, i) => s + i.amount, 0)
    const grossProfit = totalRevenue - totalCogs
    const netProfit = grossProfit - totalOpex

    return {
      period: `${filters.date_from || 'Start'} to ${filters.date_to || 'Today'}`,
      revenue: { label: 'Revenue', items: revenueItems, total: totalRevenue },
      cost_of_sales: { label: 'Cost of Sales', items: cogsItems, total: totalCogs },
      gross_profit: grossProfit,
      operating_expenses: { label: 'Operating Expenses', items: opexItems, total: totalOpex },
      net_profit: netProfit,
      generated_at: new Date().toISOString(),
    }
  },

  // ── Balance Sheet ─────────────────────────────────────────────────────────
  async generateBalanceSheet(filters = {}) {
    const tb = await this.generateTrialBalance(filters)

    const assetItems = tb.rows.filter(r => r.ledger_type === 'asset').map(r => ({ name: r.ledger_name, amount: r.closing_debit - r.closing_credit }))
    const liabilityItems = tb.rows.filter(r => r.ledger_type === 'liability').map(r => ({ name: r.ledger_name, amount: r.closing_credit - r.closing_debit }))
    const equityItems = tb.rows.filter(r => r.ledger_type === 'equity').map(r => ({ name: r.ledger_name, amount: r.closing_credit - r.closing_debit }))

    const totalAssets = assetItems.reduce((s, i) => s + i.amount, 0)
    const totalLiabilities = liabilityItems.reduce((s, i) => s + i.amount, 0)
    const totalEquity = equityItems.reduce((s, i) => s + i.amount, 0)

    // Add retained earnings (P&L net profit)
    const pl = await this.generateProfitLoss(filters)
    equityItems.push({ name: 'Retained Earnings (Current Period)', amount: pl.net_profit })
    const totalEquityWithRetained = totalEquity + pl.net_profit
    const totalLiabilitiesEquity = totalLiabilities + totalEquityWithRetained

    return {
      as_of_date: filters.date_to || new Date().toISOString().split('T')[0],
      assets: { label: 'Assets', items: assetItems, total: totalAssets },
      liabilities: { label: 'Liabilities', items: liabilityItems, total: totalLiabilities },
      equity: { label: 'Equity', items: equityItems, total: totalEquityWithRetained },
      total_liabilities_equity: totalLiabilitiesEquity,
      is_balanced: Math.abs(totalAssets - totalLiabilitiesEquity) < 0.01,
      generated_at: new Date().toISOString(),
    }
  },
}
