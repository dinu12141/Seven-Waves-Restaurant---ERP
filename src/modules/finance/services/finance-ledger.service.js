// ═══════════════════════════════════════════════════════════════════════════════
// Finance Ledger Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'

export const financeLedgerService = {
  async list(filters = {}) {
    let q = supabase.from('finance_ledgers').select('*').is('deleted_at', null).order('ledger_code')
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    if (filters.ledger_type) q = q.eq('ledger_type', filters.ledger_type)
    if (filters.is_active !== undefined) q = q.eq('is_active', filters.is_active)
    if (filters.is_cashbook_ledger) q = q.eq('is_cashbook_ledger', true)
    if (filters.is_bank_ledger) q = q.eq('is_bank_ledger', true)
    if (filters.is_petty_cash_ledger) q = q.eq('is_petty_cash_ledger', true)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_ledgers').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(ledger) {
    const { data, error } = await supabase.from('finance_ledgers').insert(ledger).select().single()
    if (error) throw error
    await logFinanceAudit('ledger_created', 'finance_ledger', data.id, null, data)
    return data
  },

  async update(id, updates) {
    const old = await this.getById(id)
    const { data, error } = await supabase.from('finance_ledgers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    await logFinanceAudit('ledger_updated', 'finance_ledger', id, old, data)
    return data
  },

  async deactivate(id) {
    return this.update(id, { is_active: false })
  },

  async getBalance(id) {
    const { data, error } = await supabase.from('finance_ledgers').select('current_balance, opening_balance, opening_balance_type').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getTransactions(ledgerId, filters = {}) {
    let q = supabase.from('finance_cashbook_entries').select('*').eq('ledger_id', ledgerId).order('entry_date', { ascending: false })
    if (filters.date_from) q = q.gte('entry_date', filters.date_from)
    if (filters.date_to) q = q.lte('entry_date', filters.date_to)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },
}

async function logFinanceAudit(action, entityType, entityId, oldData, newData) {
  try {
    await supabase.from('finance_audit_logs').insert({
      action, entity_type: entityType, entity_id: entityId,
      old_values: oldData, new_values: newData,
      user_id: (await supabase.auth.getUser()).data?.user?.id,
    })
  } catch (e) { console.warn('[FinanceAudit]', e) }
}

export { logFinanceAudit }
