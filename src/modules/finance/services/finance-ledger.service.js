// ═══════════════════════════════════════════════════════════════════════════════
// Finance Ledger Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { fetchAllPages } from './finance-statements.service'
import {
  annotateLedgers,
  openingBalanceDifference,
  recomputeLedgerBalance,
  signedOpening,
  sumEntriesByLedger,
} from './finance-ledger-integrity'

// Columns a ledger form may write. Anything else in the payload (id, joins,
// audit columns, current_balance …) is dropped: the balance is derived from
// the GL and never typed in.
const LEDGER_WRITABLE = [
  'ledger_code', 'ledger_name', 'ledger_type', 'ledger_nature', 'account_group',
  'opening_balance', 'opening_balance_type', 'is_cashbook_ledger', 'is_petty_cash_ledger',
  'is_bank_ledger', 'is_active', 'branch_id', 'company_id',
]
export function pickLedgerFields(src = {}) {
  const out = {}
  for (const k of LEDGER_WRITABLE) if (src[k] !== undefined) out[k] = src[k]
  if (typeof out.ledger_code === 'string') out.ledger_code = out.ledger_code.trim()
  if (typeof out.ledger_name === 'string') out.ledger_name = out.ledger_name.trim()
  if (typeof out.account_group === 'string') out.account_group = out.account_group.trim() || null
  if (out.opening_balance !== undefined) {
    const n = Number(out.opening_balance) || 0
    if (n < 0) throw new Error('Opening balance cannot be negative — choose Debit or Credit instead.')
    out.opening_balance = n
  }
  return out
}

/** Σ Dr / Cr per ledger from the GL (all cashbook legs, paged). */
async function loadGlTotals(ledgerId = null) {
  const entries = await fetchAllPages(() => {
    let q = supabase.from('finance_cashbook_entries').select('id, ledger_id, debit_amount, credit_amount').order('id')
    if (ledgerId) q = q.eq('ledger_id', ledgerId)
    return q
  })
  return sumEntriesByLedger(entries)
}

async function assertUniqueCode(code, exceptId = null) {
  if (!code) throw new Error('Ledger code is required.')
  const { data, error } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name')
    .eq('ledger_code', code)
    .is('deleted_at', null)
  if (error) throw error
  const dup = (data || []).find((r) => r.id !== exceptId)
  if (dup) throw new Error(`Ledger code ${code} is already used by "${dup.ledger_name}".`)
}

export const financeLedgerService = {
  async list(filters = {}) {
    let q = supabase.from('finance_ledgers').select('*').is('deleted_at', null).order('ledger_code').limit(1000)
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

  /** Ledgers annotated with GL balance, stored-balance drift and classification issues. */
  async listWithGl(filters = {}) {
    const [ledgers, totals] = await Promise.all([this.list(filters), loadGlTotals()])
    return annotateLedgers(ledgers, totals)
  },

  /** Σ Dr / Cr per ledger from the GL. */
  loadGlTotals,

  /** Company-wide opening-balance difference (must be 0: openings Dr = Cr). */
  async getOpeningDifference(opts = {}) {
    return openingBalanceDifference(await this.listOpenings(), opts)
  },

  /** Opening balances of every non-deleted ledger (for the Dr = Cr check). */
  async listOpenings() {
    return fetchAllPages(() =>
      supabase
        .from('finance_ledgers')
        .select('id, ledger_code, opening_balance, opening_balance_type, deleted_at')
        .is('deleted_at', null)
        .order('id'),
    )
  },

  /** GL balance of one ledger: signed opening + Σ(Dr − Cr). */
  async recomputeBalance(ledgerOrId) {
    const ledger = typeof ledgerOrId === 'string' ? await this.getById(ledgerOrId) : ledgerOrId
    const totals = await loadGlTotals(ledger.id)
    const t = totals.get(ledger.id)
    return { balance: recomputeLedgerBalance(ledger, t), entryCount: t?.count || 0 }
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_ledgers').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(ledger) {
    const authStore = useAuthStore()
    const cleaned = pickLedgerFields(ledger)
    await assertUniqueCode(cleaned.ledger_code)
    // A new ledger has no postings: its live balance IS its signed opening (#122).
    const payload = {
      ...cleaned,
      company_id: cleaned.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: cleaned.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      current_balance: signedOpening(cleaned),
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
    const cleaned = pickLedgerFields(updates)
    if (cleaned.ledger_code !== undefined && cleaned.ledger_code !== old?.ledger_code) {
      await assertUniqueCode(cleaned.ledger_code, id)
    }

    // #122: current_balance = signed opening + Σ(Dr − Cr) of the GL. Recomputed
    // from the cashbook instead of applying a delta, so stored drift heals.
    const merged = { ...old, ...cleaned }
    const { balance } = await this.recomputeBalance(merged)

    const payload = {
      ...cleaned,
      current_balance: balance,
      updated_by: authStore.user?.id || null,
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabase.from('finance_ledgers').update(payload).eq('id', id).select().single()
    if (error) throw error

    // Linked cash/bank accounts mirror their ledger (signed opening + GL balance).
    const { data: linkedAccounts } = await supabase.from('finance_accounts').select('id, opening_balance, current_balance').eq('ledger_id', id)
    for (const la of linkedAccounts || []) {
      if (Number(la.opening_balance) === signedOpening(merged) && Number(la.current_balance) === balance) continue
      await supabase.from('finance_accounts').update({
        opening_balance: signedOpening(merged),
        current_balance: balance,
        updated_at: new Date().toISOString()
      }).eq('id', la.id)
    }

    await logFinanceAudit('ledger_updated', 'finance_ledger', id, old, data)
    return data
  },

  async deactivate(id) {
    return this.update(id, { is_active: false })
  },

  async activate(id) {
    return this.update(id, { is_active: true })
  },

  /** What blocks deleting this ledger (GL postings / linked accounts). */
  async usage(id) {
    const [entriesRes, accountsRes] = await Promise.all([
      supabase.from('finance_cashbook_entries').select('id', { count: 'exact', head: true }).eq('ledger_id', id),
      supabase.from('finance_accounts').select('id, registered_name').eq('ledger_id', id).is('deleted_at', null),
    ])
    if (entriesRes.error) throw entriesRes.error
    if (accountsRes.error) throw accountsRes.error
    return { entryCount: entriesRes.count || 0, accounts: accountsRes.data || [] }
  },

  // Hard delete — admin only (finance_ledgers RLS: admin ALL; UI hides for
  // non-admins). System ledgers, ledgers with GL postings, ledgers linked to an
  // account and ledgers carrying an opening balance cannot be deleted.
  async remove(id) {
    const authStore = useAuthStore()
    const role = authStore.userRole || authStore.profile?.role
    if (role && role !== 'admin' && role !== 'super_admin' && role !== 'owner') {
      throw new Error('Unauthorized: Only administrators can delete ledgers.')
    }

    const old = await this.getById(id).catch(() => null)
    if (old?.is_system_ledger) throw new Error('System ledgers cannot be deleted.')
    const { entryCount, accounts } = await this.usage(id)
    if (entryCount > 0) {
      throw new Error(`This ledger has ${entryCount} GL posting(s) and cannot be deleted. Deactivate it instead.`)
    }
    if (accounts.length) {
      throw new Error(`This ledger is linked to account(s): ${accounts.map((a) => a.registered_name).join(', ')}. Re-link or delete them first.`)
    }
    if (old && Math.abs(signedOpening(old)) >= 0.005) {
      throw new Error('This ledger carries an opening balance. Set its opening to 0 (keeping openings Dr = Cr) before deleting it.')
    }
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
