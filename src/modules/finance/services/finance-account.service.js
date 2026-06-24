// ═══════════════════════════════════════════════════════════════════════════════
// Finance Account Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
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
    const authStore = useAuthStore()
    const cleaned = { ...account }
    delete cleaned._isEdit
    delete cleaned._id
    const payload = {
      ...cleaned,
      company_id: cleaned.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: cleaned.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      created_by: authStore.user?.id || null,
      updated_by: authStore.user?.id || null
    }
    const { data, error } = await supabase.from('finance_accounts').insert(payload).select().single()
    if (error) throw error
    await logFinanceAudit('account_created', 'finance_account', data.id, null, data)
    return data
  },

  async update(id, updates) {
    const authStore = useAuthStore()
    const old = await this.getById(id)
    const cleaned = { ...updates }
    delete cleaned._isEdit
    delete cleaned._id
    const payload = {
      ...cleaned,
      updated_by: authStore.user?.id || null,
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('finance_accounts').update(payload).eq('id', id).select().single()
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
