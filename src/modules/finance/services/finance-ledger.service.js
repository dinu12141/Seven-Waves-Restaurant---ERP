// ═══════════════════════════════════════════════════════════════════════════════
// Finance Ledger Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

export const financeLedgerService = {
  async list(filters = {}) {
    let q = supabase.from('finance_ledgers').select('*').is('deleted_at', null).order('ledger_code').limit(500)
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
    const authStore = useAuthStore()
    const cleaned = { ...ledger }
    delete cleaned._isEdit
    delete cleaned._id
    // A ledger's live balance must START at its opening balance — otherwise it
    // shows 0 until the first voucher posts. current_balance then tracks
    // opening + posted deltas. (A credit-nature opening balance is negative.)
    const opening = Number(cleaned.opening_balance) || 0
    const signedOpening = cleaned.opening_balance_type === 'credit' ? -opening : opening
    const payload = {
      ...cleaned,
      company_id: cleaned.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: cleaned.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      current_balance: cleaned.current_balance ?? signedOpening,
      created_by: authStore.user?.id || null,
      updated_by: authStore.user?.id || null
    }
    const { data, error } = await supabase.from('finance_ledgers').insert(payload).select().single()
    if (error) throw error
    await logFinanceAudit('ledger_created', 'finance_ledger', data.id, null, data)
    return data
  },

  async update(id, updates) {
    const authStore = useAuthStore()
    const old = await this.getById(id)
    const cleaned = { ...updates }
    delete cleaned._isEdit
    delete cleaned._id

    // Opening balance delta
    const oldSignedOpening = old?.opening_balance_type === 'credit'
      ? -(Number(old?.opening_balance) || 0)
      : (Number(old?.opening_balance) || 0)
    const newOpening = cleaned.opening_balance !== undefined
      ? (Number(cleaned.opening_balance) || 0)
      : (Number(old?.opening_balance) || 0)
    const newType = cleaned.opening_balance_type || old?.opening_balance_type || 'debit'
    const newSignedOpening = newType === 'credit' ? -newOpening : newOpening
    const openingDelta = newSignedOpening - oldSignedOpening

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
    const { data, error } = await supabase.from('finance_ledgers').update(payload).eq('id', id).select().single()
    if (error) throw error

    // Sync any linked account in finance_accounts
    const { data: linkedAccounts } = await supabase.from('finance_accounts').select('id, current_balance, opening_balance').eq('ledger_id', id)
    if (linkedAccounts?.length) {
      for (const la of linkedAccounts) {
        await supabase.from('finance_accounts').update({
          opening_balance: newOpening,
          current_balance: newCurrentBalance,
          updated_at: new Date().toISOString()
        }).eq('id', la.id)
      }
    }

    await logFinanceAudit('ledger_updated', 'finance_ledger', id, old, data)
    return data
  },

  async deactivate(id) {
    return this.update(id, { is_active: false })
  },

  // Hard delete — admin only (finance_ledgers RLS: admin ALL; UI hides for
  // non-admins). System ledgers and any ledger with posted movements (FK from
  // cashbook/vouchers) cannot be deleted — deactivate instead.
  async remove(id) {
    const authStore = useAuthStore()
    const role = authStore.userRole || authStore.profile?.role
    if (role && role !== 'admin' && role !== 'super_admin' && role !== 'owner') {
      throw new Error('Unauthorized: Only administrators can delete ledgers.')
    }

    const old = await this.getById(id).catch(() => null)
    if (old?.is_system_ledger) throw new Error('System ledgers cannot be deleted.')
    const { error } = await supabase.from('finance_ledgers').delete().eq('id', id)
    if (error) throw error
    await logFinanceAudit('ledger_deleted', 'finance_ledger', id, old, null)
    return true
  },

  async getBalance(id) {
    const { data, error } = await supabase.from('finance_ledgers').select('current_balance, opening_balance, opening_balance_type').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getTransactions(ledgerId, filters = {}) {
    let q = supabase.from('finance_cashbook_entries').select('*').eq('ledger_id', ledgerId).order('entry_date', { ascending: false }).limit(1000)
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
