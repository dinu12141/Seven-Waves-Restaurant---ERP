// ═══════════════════════════════════════════════════════════════════════════════
// Finance Account Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { financeLedgerService, logFinanceAudit } from './finance-ledger.service'
import { accountLinkIssue, recomputeLedgerBalance, signedOpening } from './finance-ledger-integrity'

// Columns an account form may write. Balances are NOT among them: an account
// mirrors its ledger (opening = the ledger's signed opening, balance = the
// ledger's GL balance) — opening balances are maintained on the ledger only.
const ACCOUNT_WRITABLE = [
  'account_type', 'ledger_id', 'registered_name', 'account_number', 'bank_name', 'bank_branch',
  'currency', 'is_default', 'is_active', 'branch_id', 'company_id',
]
export function pickAccountFields(src = {}) {
  const out = {}
  for (const k of ACCOUNT_WRITABLE) if (src[k] !== undefined) out[k] = src[k]
  if (typeof out.registered_name === 'string') out.registered_name = out.registered_name.trim()
  if (out.ledger_id === '') out.ledger_id = null
  return out
}

/** Validate the account → ledger link; returns the linked ledger row. */
async function assertLedgerLink(ledgerId, accountId = null) {
  if (!ledgerId) throw new Error('Every account must be linked to a ledger — otherwise its postings cannot reach the GL.')
  const ledger = await financeLedgerService.getById(ledgerId)
  const { data: others, error } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, ledger_id, deleted_at')
    .eq('ledger_id', ledgerId)
    .is('deleted_at', null)
  if (error) throw error
  const issue = accountLinkIssue({ id: accountId, ledger_id: ledgerId }, ledger, others || [])
  if (issue) throw new Error(issue)
  return ledger
}

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

  /**
   * Accounts annotated with the GL balance of their ledger (signed opening +
   * Σ Dr − Cr), drift against the stored current_balance and link problems.
   */
  async listWithGl(filters = {}) {
    const [accounts, totals] = await Promise.all([this.list(filters), financeLedgerService.loadGlTotals()])
    return accounts.map((a) => {
      const gl = a.ledger ? recomputeLedgerBalance(a.ledger, totals.get(a.ledger_id)) : null
      const stored = Number(a.current_balance) || 0
      return {
        ...a,
        gl_balance: gl,
        balance_drift: gl === null || Math.abs(gl - stored) < 0.005 ? 0 : Math.round((stored - gl) * 100) / 100,
        link_issue: accountLinkIssue(a, a.ledger, accounts),
      }
    })
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_accounts').select('*, ledger:finance_ledgers(*)').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(account) {
    const authStore = useAuthStore()
    const cleaned = pickAccountFields(account)
    const ledger = await assertLedgerLink(cleaned.ledger_id)
    const { balance } = await financeLedgerService.recomputeBalance(ledger)
    const payload = {
      ...cleaned,
      company_id: cleaned.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: cleaned.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      opening_balance: signedOpening(ledger),
      current_balance: balance,
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
    const cleaned = pickAccountFields(updates)

    // Only a (re)link is validated, so a legacy wrong link can still be edited
    // (e.g. renamed) — the list flags it until it is re-linked.
    const ledgerId = cleaned.ledger_id !== undefined ? cleaned.ledger_id : old?.ledger_id
    let ledger = old?.ledger || null
    if (ledgerId !== old?.ledger_id) ledger = await assertLedgerLink(ledgerId, id)
    else if (!ledgerId) throw new Error('Every account must be linked to a ledger.')

    const payload = {
      ...cleaned,
      updated_by: authStore.user?.id || null,
      updated_at: new Date().toISOString()
    }
    if (ledger) {
      payload.opening_balance = signedOpening(ledger)
      payload.current_balance = (await financeLedgerService.recomputeBalance(ledger)).balance
    }

    const { data, error } = await supabase.from('finance_accounts').update(payload).eq('id', id).select('*, ledger:finance_ledgers(*)').single()
    if (error) throw error
    // NOTE: the ledger is never written from here — its opening is edited on
    // Ledger Registration and its balance comes from GL postings only.

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
    const authStore = useAuthStore()
    const role = authStore.userRole || authStore.profile?.role
    if (role && role !== 'admin' && role !== 'super_admin' && role !== 'owner') {
      throw new Error('Unauthorized: Only administrators can delete finance accounts.')
    }

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
