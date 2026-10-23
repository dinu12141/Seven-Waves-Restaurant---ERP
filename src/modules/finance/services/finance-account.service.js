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
    // Strip the embedded join object (ledger:finance_ledgers(*)) that list() injects —
    // it is not a column and PostgREST rejects it on INSERT.
    delete cleaned.ledger
    // Seed the live balance from the opening balance — otherwise a new account
    // always shows LKR 0 until a transaction posts. current_balance then tracks
    // opening + posted movements.
    const opening = Number(cleaned.opening_balance) || 0
    const payload = {
      ...cleaned,
      company_id: cleaned.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: cleaned.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      current_balance: cleaned.current_balance ?? opening,
      created_by: authStore.user?.id || null,
      updated_by: authStore.user?.id || null
    }
    const { data, error } = await supabase.from('finance_accounts').insert(payload).select('*, ledger:finance_ledgers(*)').single()
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
    // Strip the embedded join object (ledger:finance_ledgers(*)) that list() injects —
    // it is not a column and PostgREST would 400 on UPDATE if present.
    delete cleaned.ledger

    const oldOpening = Number(old?.opening_balance) || 0
    const newOpening = cleaned.opening_balance !== undefined ? (Number(cleaned.opening_balance) || 0) : oldOpening
    const openingDelta = newOpening - oldOpening

    let newCurrentBalance = Number(old?.current_balance) || 0
    if (cleaned.current_balance !== undefined && Number(cleaned.current_balance) !== Number(old?.current_balance)) {
      newCurrentBalance = Number(cleaned.current_balance) || 0
    } else if (openingDelta !== 0) {
      newCurrentBalance += openingDelta
    }

    const payload = {
      ...cleaned,
      current_balance: newCurrentBalance,
      updated_by: authStore.user?.id || null,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('finance_accounts').update(payload).eq('id', id).select('*, ledger:finance_ledgers(*)').single()
    if (error) throw error

    // Sync linked ledger in finance_ledgers
    const ledgerId = cleaned.ledger_id || old?.ledger_id
    if (ledgerId) {
      await supabase.from('finance_ledgers').update({
        opening_balance: newOpening,
        current_balance: newCurrentBalance,
        updated_at: new Date().toISOString()
      }).eq('id', ledgerId)
    }

    await logFinanceAudit('account_updated', 'finance_account', id, old, data)
    return data
  },

  async deactivate(id) {
    return this.update(id, { is_active: false })
  },

  // Hard delete — admin only. Gated in the DB by finance_accounts RLS
  // (admin ALL); the UI also hides the button for non-admins. Blocks deleting
  // an account that has posted cashbook/cheque movements (FK) — deactivate instead.
  async remove(id) {
    const old = await this.getById(id).catch(() => null)
    const { error } = await supabase.from('finance_accounts').delete().eq('id', id)
    if (error) throw error
    await logFinanceAudit('account_deleted', 'finance_account', id, old, null)
    return true
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
