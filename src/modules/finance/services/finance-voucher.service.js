// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher Service — Pay & Received Vouchers
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'

// finance_vouchers has TWO FKs to finance_accounts (account_id + bank_id), so the
// embed MUST name the FK explicitly — otherwise PostgREST returns PGRST201 (400)
// "more than one relationship found" and every voucher list/get fails.
const VOUCHER_SELECT = '*, ledger:finance_ledgers(*), account:finance_accounts!finance_vouchers_account_id_fkey(*), bank:finance_accounts!finance_vouchers_bank_id_fkey(*), lines:finance_voucher_lines(*, ledger:finance_ledgers(*))'

export const financeVoucherService = {
  // ── List ──────────────────────────────────────────────────────────────────
  async list(filters = {}) {
    // Guard: only apply a filter when it is a real, non-empty value. A stray
    // `undefined`/`null`/'' (e.g. branch_id=undefined) would become
    // `col=eq.undefined` and PostgREST 400s (invalid uuid/date). This keeps the
    // voucher list from breaking on a half-initialised filter object.
    const ok = (v) => v !== undefined && v !== null && v !== ''
    let q = supabase.from('finance_vouchers').select(VOUCHER_SELECT).is('deleted_at', null).order('created_at', { ascending: false })
    if (ok(filters.voucher_type)) q = q.eq('voucher_type', filters.voucher_type)
    if (ok(filters.status)) q = q.eq('status', filters.status)
    if (ok(filters.branch_id)) q = q.eq('branch_id', filters.branch_id)
    if (ok(filters.date_from)) q = q.gte('voucher_date', filters.date_from)
    if (ok(filters.date_to)) q = q.lte('voucher_date', filters.date_to)
    if (ok(filters.ledger_id)) q = q.eq('ledger_id', filters.ledger_id)
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_vouchers').select(VOUCHER_SELECT).eq('id', id).single()
    if (error) throw error
    return data
  },

  // ── Create ────────────────────────────────────────────────────────────────
  async createPayVoucher(form) {
    return this._createVoucher({ ...form, voucher_type: 'pay' })
  },

  async createReceivedVoucher(form) {
    return this._createVoucher({ ...form, voucher_type: 'received' })
  },

  async _createVoucher(form) {
    const authStore = useAuthStore()
    const voucherNo = await this._generateVoucherNo(form.voucher_type)
    const { lines, ...voucherData } = form
    delete voucherData.cheque_no
    delete voucherData.cheque_date

    const { data: voucher, error } = await supabase.from('finance_vouchers').insert({
      ...voucherData,
      voucher_no: voucherNo,
      status: 'draft',
      approval_status: 'pending',
      company_id: voucherData.company_id || authStore.currentBranch?.company_id || authStore.profile?.company_id || null,
      branch_id: voucherData.branch_id || authStore.currentBranch?.id || authStore.profile?.branch_id || null,
      created_by: voucherData.created_by || authStore.user?.id || null,
    }).select().single()

    if (error) throw error

    // Insert voucher lines if provided
    if (lines?.length) {
      const lineRows = lines.map(l => ({ voucher_id: voucher.id, ledger_id: l.ledger_id, description: l.description, debit_amount: l.debit_amount || 0, credit_amount: l.credit_amount || 0 }))
      const { error: lineErr } = await supabase.from('finance_voucher_lines').insert(lineRows)
      if (lineErr) throw lineErr
    }

    await logFinanceAudit('voucher_created', 'finance_voucher', voucher.id, null, voucher)
    return this.getById(voucher.id)
  },

  // ── Workflow ──────────────────────────────────────────────────────────────
  async submitVoucher(id) {
    return this._updateStatus(id, 'submitted', 'voucher_submitted')
  },

  async approveVoucher(id) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const voucher = await this.getById(id)

    // Self-approval check
    if (voucher.created_by === userId) {
      throw new Error('Creator cannot approve their own voucher')
    }

    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'approved', approval_status: 'approved',
      approved_by: userId, approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'submitted').select().single()

    if (error) throw error
    await logFinanceAudit('voucher_approved', 'finance_voucher', id, voucher, data)
    return data
  },

  async rejectVoucher(id, reason) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const voucher = await this.getById(id)

    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'rejected', approval_status: 'rejected',
      rejected_by: userId, rejected_at: new Date().toISOString(),
      rejection_reason: reason, updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'submitted').select().single()

    if (error) throw error
    await logFinanceAudit('voucher_rejected', 'finance_voucher', id, voucher, data)
    return data
  },

  async postVoucher(id) {
    // P0 #50/#51 — post atomically in a single DB transaction. The RPC guards
    // against the double-post race (WHERE status='approved'), writes the
    // cashbook + optional cheque, and applies the ledger balance as an in-DB
    // delta (no read-modify-write => no lost update).
    const before = await this.getById(id)

    const { data: result, error } = await supabase.rpc('post_finance_voucher', {
      p_voucher_id: id,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to post voucher')

    const after = await this.getById(id)
    if (!result.already_posted) {
      await logFinanceAudit('voucher_posted', 'finance_voucher', id, before, after)
    }
    return after
  },

  async cancelVoucher(id, reason) {
    // #98 — cancel atomically via RPC. The SECURITY DEFINER cancel_finance_voucher
    // row-locks the voucher and, for POSTED vouchers, writes the reversal cashbook
    // entry, applies the inverse ledger delta in-DB (no read-modify-write / lost
    // update), and voids any issued cheque — all in ONE transaction. Replaces the
    // previous non-atomic client 3-step reversal (partial-commit family, same as
    // post #50/#51). Mirrors postVoucher's before/after + audit pattern.
    const before = await this.getById(id)

    const { data: result, error } = await supabase.rpc('cancel_finance_voucher', {
      p_voucher_id: id,
      p_reason: reason || null,
    })
    if (error) throw error
    if (!result?.success) throw new Error(result?.error || 'Failed to cancel voucher')

    const after = await this.getById(id)
    if (!result.already_cancelled) {
      await logFinanceAudit('voucher_cancelled', 'finance_voucher', id, before, { ...after, cancel_reason: reason })
    }
    return after
  },

  // ── Update (draft only) ───────────────────────────────────────────────────
  async updateVoucher(id, updates) {
    const voucher = await this.getById(id)
    if (voucher.status !== 'draft' && voucher.status !== 'rejected') {
      throw new Error('Only draft or rejected vouchers can be edited')
    }

    const { lines, ...voucherUpdates } = updates

    const { data, error } = await supabase.from('finance_vouchers').update({
      ...voucherUpdates, status: 'draft', approval_status: 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()

    if (error) throw error

    // Replace lines if provided
    if (lines) {
      await supabase.from('finance_voucher_lines').delete().eq('voucher_id', id)
      if (lines.length) {
        const lineRows = lines.map(l => ({ voucher_id: id, ledger_id: l.ledger_id, description: l.description, debit_amount: l.debit_amount || 0, credit_amount: l.credit_amount || 0 }))
        await supabase.from('finance_voucher_lines').insert(lineRows)
      }
    }

    await logFinanceAudit('voucher_updated', 'finance_voucher', id, voucher, data)
    return this.getById(id)
  },

  // ── Approval Queue ────────────────────────────────────────────────────────
  async getApprovalQueue(filters = {}) {
    return this.list({ ...filters, status: 'submitted' })
  },

  // ── Internal helpers ──────────────────────────────────────────────────────
  async _generateVoucherNo(type) {
    // P0 #54 — concurrency-safe sequence-backed numbering (was client count()+1,
    // which produced duplicates when two vouchers were created at once).
    const { data, error } = await supabase.rpc('next_voucher_no', { p_type: type })
    if (error) throw error
    return data
  },

  async _updateStatus(id, status, auditAction) {
    const old = await this.getById(id)
    const { data, error } = await supabase.from('finance_vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single()
    if (error) throw error
    await logFinanceAudit(auditAction, 'finance_voucher', id, old, data)
    return data
  },

  async _createCashbookEntry(voucher) {
    const sourceType = voucher.voucher_type === 'pay' ? 'pay_voucher' : 'received_voucher'
    const entry = {
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      source_type: sourceType,
      source_id: voucher.id,
      entry_date: voucher.voucher_date,
      ledger_id: voucher.ledger_id,
      account_id: voucher.account_id,
      description: `${voucher.voucher_no} — ${voucher.remark || voucher.narration || ''}`.trim(),
      debit_amount: voucher.voucher_type === 'pay' ? Number(voucher.amount) : 0,
      credit_amount: voucher.voucher_type === 'received' ? Number(voucher.amount) : 0,
      running_balance: 0,
    }
    const { error } = await supabase.from('finance_cashbook_entries').insert(entry)
    if (error) console.error('[Cashbook]', error)
  },

  async _createReversalCashbookEntry(voucher) {
    const sourceType = voucher.voucher_type === 'pay' ? 'pay_voucher' : 'received_voucher'
    const entry = {
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      source_type: sourceType,
      source_id: voucher.id,
      entry_date: new Date().toISOString().split('T')[0],
      ledger_id: voucher.ledger_id,
      account_id: voucher.account_id,
      description: `REVERSAL: ${voucher.voucher_no}`,
      debit_amount: voucher.voucher_type === 'received' ? Number(voucher.amount) : 0,
      credit_amount: voucher.voucher_type === 'pay' ? Number(voucher.amount) : 0,
      running_balance: 0,
    }
    await supabase.from('finance_cashbook_entries').insert(entry)
  },

  async _createChequeFromVoucher(voucher) {
    const { error } = await supabase.from('finance_cheques').insert({
      company_id: voucher.company_id,
      branch_id: voucher.branch_id,
      voucher_id: voucher.id,
      bank_account_id: voucher.bank_id || voucher.account_id,
      cheque_no: voucher.cheque_id || `CHQ-${voucher.voucher_no}`,
      cheque_date: voucher.voucher_date,
      issued_to: voucher.pay_to,
      amount: Number(voucher.amount),
      status: 'issued',
    })
    if (error) console.error('[Cheque]', error)
  },

  async _updateLedgerBalance(voucher) {
    const amt = Number(voucher.amount)
    const delta = voucher.voucher_type === 'pay' ? -amt : amt
    await supabase.rpc('increment_field', { table_name: 'finance_ledgers', row_id: voucher.ledger_id, field_name: 'current_balance', increment_by: delta }).catch(() => {
      // Fallback: manual update
      supabase.from('finance_ledgers').select('current_balance').eq('id', voucher.ledger_id).single().then(({ data }) => {
        if (data) supabase.from('finance_ledgers').update({ current_balance: Number(data.current_balance) + delta }).eq('id', voucher.ledger_id)
      })
    })
  },

  async _reverseLedgerBalance(voucher) {
    const amt = Number(voucher.amount)
    const delta = voucher.voucher_type === 'pay' ? amt : -amt
    await supabase.from('finance_ledgers').select('current_balance').eq('id', voucher.ledger_id).single().then(({ data }) => {
      if (data) supabase.from('finance_ledgers').update({ current_balance: Number(data.current_balance) + delta }).eq('id', voucher.ledger_id)
    })
  },
}
