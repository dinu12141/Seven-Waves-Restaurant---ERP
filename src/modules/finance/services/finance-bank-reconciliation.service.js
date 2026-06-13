// ═══════════════════════════════════════════════════════════════════════════════
// Finance Bank Reconciliation Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'

export const financeBankReconciliationService = {
  async list(filters = {}) {
    let q = supabase.from('finance_bank_reconciliations').select('*, bank_account:finance_accounts(registered_name, bank_name)')
      .order('created_at', { ascending: false })
    if (filters.bank_account_id) q = q.eq('bank_account_id', filters.bank_account_id)
    if (filters.status) q = q.eq('status', filters.status)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_bank_reconciliations')
      .select('*, bank_account:finance_accounts(*), lines:finance_bank_reconciliation_lines(*)')
      .eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(recon) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const { data, error } = await supabase.from('finance_bank_reconciliations').insert({
      ...recon, prepared_by: userId, status: 'draft',
    }).select().single()
    if (error) throw error
    await logFinanceAudit('reconciliation_created', 'bank_reconciliation', data.id, null, data)
    return data
  },

  async addLine(reconId, line) {
    const { data, error } = await supabase.from('finance_bank_reconciliation_lines').insert({
      ...line, reconciliation_id: reconId,
    }).select().single()
    if (error) throw error
    return data
  },

  async matchTransaction(lineId) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const { data, error } = await supabase.from('finance_bank_reconciliation_lines').update({
      is_matched: true, matched_by: userId, matched_at: new Date().toISOString(),
    }).eq('id', lineId).select().single()
    if (error) throw error
    return data
  },

  async unmatchTransaction(lineId) {
    const { data, error } = await supabase.from('finance_bank_reconciliation_lines').update({
      is_matched: false, matched_by: null, matched_at: null,
    }).eq('id', lineId).select().single()
    if (error) throw error
    return data
  },

  async recalculateDifference(reconId) {
    const recon = await this.getById(reconId)
    const lines = recon.lines || []
    const matchedDebit = lines.filter(l => l.is_matched).reduce((s, l) => s + Number(l.debit_amount), 0)
    const matchedCredit = lines.filter(l => l.is_matched).reduce((s, l) => s + Number(l.credit_amount), 0)
    const systemBalance = Number(recon.opening_bank_balance) + matchedCredit - matchedDebit
    const diff = Number(recon.closing_bank_balance) - systemBalance

    const { error } = await supabase.from('finance_bank_reconciliations').update({
      system_balance: systemBalance, difference_amount: diff, updated_at: new Date().toISOString(),
    }).eq('id', reconId)
    if (error) throw error
    return { system_balance: systemBalance, difference_amount: diff }
  },

  async approve(id) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const old = await this.getById(id)

    const { data, error } = await supabase.from('finance_bank_reconciliations').update({
      status: 'approved', approved_by: userId, approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'reconciled').select().single()

    if (error) throw error
    await logFinanceAudit('reconciliation_approved', 'bank_reconciliation', id, old, data)
    return data
  },

  async lock(id) {
    const old = await this.getById(id)
    const { data, error } = await supabase.from('finance_bank_reconciliations').update({
      status: 'locked', updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'approved').select().single()
    if (error) throw error
    await logFinanceAudit('reconciliation_locked', 'bank_reconciliation', id, old, data)
    return data
  },
}
