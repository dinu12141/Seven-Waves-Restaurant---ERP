// ═══════════════════════════════════════════════════════════════════════════════
// Finance Account Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'

export const financeAccountService = {
  async list(filters = {}) {
    let q = supabase.from('finance_accounts').select('*, ledger:finance_ledgers(*)').is('deleted_at', null).order('registered_name')
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    if (filters.account_type) q = q.eq('account_type', filters.account_type)
    if (filters.is_active !== undefined) q = q.eq('is_active', filters.is_active)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_accounts').select('*, ledger:finance_ledgers(*)').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(account) {
    const { data, error } = await supabase.from('finance_accounts').insert(account).select().single()
    if (error) throw error
    await logFinanceAudit('account_created', 'finance_account', data.id, null, data)
    return data
  },

  async update(id, updates) {
    const old = await this.getById(id)
    const { data, error } = await supabase.from('finance_accounts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    await logFinanceAudit('account_updated', 'finance_account', id, old, data)
    return data
  },

  async deactivate(id) {
    return this.update(id, { is_active: false })
  },

  async getBalance(id) {
    const { data, error } = await supabase.from('finance_accounts').select('current_balance, opening_balance').eq('id', id).single()
    if (error) throw error
    return data
  },

  async listByType(type) {
    return this.list({ account_type: type, is_active: true })
  },

  async getBankAccounts() {
    return this.list({ account_type: 'bank', is_active: true })
  },

  async getCashAccounts() {
    return this.list({ account_type: 'cash', is_active: true })
  },

  async getPettyCashAccounts() {
    return this.list({ account_type: 'petty_cash', is_active: true })
  },
}
