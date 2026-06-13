// ═══════════════════════════════════════════════════════════════════════════════
// Finance Voucher Service — Pay & Received Vouchers
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'

const VOUCHER_SELECT = '*, ledger:finance_ledgers(*), account:finance_accounts(*), lines:finance_voucher_lines(*, ledger:finance_ledgers(*))'

export const financeVoucherService = {
  // ── List ──────────────────────────────────────────────────────────────────
  async list(filters = {}) {
    let q = supabase.from('finance_vouchers').select(VOUCHER_SELECT).is('deleted_at', null).order('created_at', { ascending: false })
    if (filters.voucher_type) q = q.eq('voucher_type', filters.voucher_type)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
    if (filters.date_from) q = q.gte('voucher_date', filters.date_from)
    if (filters.date_to) q = q.lte('voucher_date', filters.date_to)
    if (filters.ledger_id) q = q.eq('ledger_id', filters.ledger_id)
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
    const voucherNo = await this._generateVoucherNo(form.voucher_type)
    const { lines, ...voucherData } = form
    delete voucherData.cheque_no
    delete voucherData.cheque_date

    const { data: voucher, error } = await supabase.from('finance_vouchers').insert({
      ...voucherData,
      voucher_no: voucherNo,
      status: 'draft',
      approval_status: 'pending',
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
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const voucher = await this.getById(id)

    if (voucher.status !== 'approved') throw new Error('Only approved vouchers can be posted')

    // Validate double-entry balance for multi-line vouchers
    if (voucher.lines?.length > 0) {
      const totalDebit = voucher.lines.reduce((s, l) => s + Number(l.debit_amount), 0)
      const totalCredit = voucher.lines.reduce((s, l) => s + Number(l.credit_amount), 0)
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Double-entry imbalance: Debit ${totalDebit} ≠ Credit ${totalCredit}`)
      }
    }

    // Post the voucher
    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'posted', posted_by: userId, posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()

    if (error) throw error

    // Create cashbook entry
    await this._createCashbookEntry(voucher)

    // Create cheque plan if payment_method = cheque
    if (voucher.payment_method === 'cheque') {
      await this._createChequeFromVoucher(voucher)
    }

    // Update ledger balance
    await this._updateLedgerBalance(voucher)

    await logFinanceAudit('voucher_posted', 'finance_voucher', id, voucher, data)
    return data
  },

  async cancelVoucher(id, reason) {
    const userId = (await supabase.auth.getUser()).data?.user?.id
    const voucher = await this.getById(id)

    if (voucher.status === 'posted') {
      // Create reversal cashbook entry for already-posted voucher
      await this._createReversalCashbookEntry(voucher)
      await this._reverseLedgerBalance(voucher)
    }

    const { data, error } = await supabase.from('finance_vouchers').update({
      status: 'cancelled', updated_by: userId, updated_at: new Date().toISOString(),
    }).eq('id', id).select().single()

    if (error) throw error
    await logFinanceAudit('voucher_cancelled', 'finance_voucher', id, voucher, { ...data, cancel_reason: reason })
    return data
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
    const prefix = type === 'pay' ? 'PV' : 'RV'
    const { count } = await supabase.from('finance_vouchers').select('*', { count: 'exact', head: true }).eq('voucher_type', type)
    return `${prefix}-${String((count || 0) + 1).padStart(6, '0')}`
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
