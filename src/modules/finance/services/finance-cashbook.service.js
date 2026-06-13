// ═══════════════════════════════════════════════════════════════════════════════
// Finance Cashbook Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export const financeCashbookService = {
  async getReport(filters = {}) {
    let q = supabase.from('finance_cashbook_entries').select('*, ledger:finance_ledgers(ledger_name, ledger_code), account:finance_accounts(registered_name, account_type)')
      .order('entry_date', { ascending: true }).order('created_at', { ascending: true })
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    if (filters.date_from) q = q.gte('entry_date', filters.date_from)
    if (filters.date_to) q = q.lte('entry_date', filters.date_to)
    if (filters.ledger_id) q = q.eq('ledger_id', filters.ledger_id)
    if (filters.account_id) q = q.eq('account_id', filters.account_id)
    if (filters.source_type) q = q.eq('source_type', filters.source_type)
    const { data, error } = await q
    if (error) throw error

    // Calculate running balances
    let balance = 0
    return (data || []).map(e => {
      balance += Number(e.credit_amount) - Number(e.debit_amount)
      return { ...e, running_balance: balance }
    })
  },

  async getTotals(filters = {}) {
    const entries = await this.getReport(filters)
    const totalDebit = entries.reduce((s, e) => s + Number(e.debit_amount), 0)
    const totalCredit = entries.reduce((s, e) => s + Number(e.credit_amount), 0)
    return { totalDebit, totalCredit, balance: totalCredit - totalDebit, count: entries.length }
  },

  async getPettyCashReport(filters = {}) {
    let q = supabase.from('finance_petty_cash_entries').select('*, account:finance_accounts(registered_name)')
      .order('entry_date', { ascending: true })
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    if (filters.petty_cash_account_id) q = q.eq('petty_cash_account_id', filters.petty_cash_account_id)
    if (filters.date_from) q = q.gte('entry_date', filters.date_from)
    if (filters.date_to) q = q.lte('entry_date', filters.date_to)
    const { data, error } = await q
    if (error) throw error

    let balance = 0
    return (data || []).map(e => {
      balance += Number(e.credit_amount) - Number(e.debit_amount)
      return { ...e, running_balance: balance }
    })
  },
}
