// ═══════════════════════════════════════════════════════════════════════════════
// Finance Cheque Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { fetchAllPages } from './finance-statements.service'

const today = () => new Date().toISOString().split('T')[0]

/**
 * Allowed client-side status transitions. Anything with a GL effect goes
 * through the server:
 *  - planned → issued happens only when a supplier payment / voucher is posted
 *    (#134 trigger / post_finance_voucher), never by a label flip here.
 *  - issued → bounced goes through the mark_cheque_bounced RPC (reverses GL).
 *  - issued → cleared is a pure status change (the bank leg was posted at issue).
 *  - cancel is only allowed for cheques with no posted GL effect (planned/stale
 *    and not linked to a voucher or supplier payment). A linked issued cheque
 *    is voided by cancelling its supplier payment / voucher, which reverses GL.
 */
export function assertChequeTransition(cheque, status) {
  const from = cheque?.status
  if (status === 'cleared') {
    if (from !== 'issued') throw new Error(`Only issued cheques can be marked cleared (current status: ${from})`)
    return
  }
  if (status === 'cancelled') {
    if (!['planned', 'stale', 'issued'].includes(from)) {
      throw new Error(`A ${from} cheque cannot be cancelled`)
    }
    if (cheque.supplier_payment_id) {
      throw new Error('This cheque belongs to a posted supplier payment — cancel the supplier payment (or mark the cheque bounced) so the GL is reversed.')
    }
    if (cheque.voucher_id) {
      throw new Error('This cheque belongs to a posted voucher — cancel the voucher (or mark the cheque bounced) so the GL is reversed.')
    }
    return
  }
  throw new Error(`Status "${status}" cannot be set directly`)
}

export const financeChequeService = {
  async list(filters = {}) {
    // Paged so registers over 1000 rows are not silently truncated.
    return fetchAllPages(() => {
      let q = supabase.from('finance_cheques')
        .select('*, voucher:finance_vouchers(voucher_no, voucher_type, pay_to, amount), bank_account:finance_accounts(registered_name, bank_name, account_number), supplier_payment:supplier_payments(doc_number, status)')
        .order('cheque_date', { ascending: false })
        .order('id', { ascending: true })
      if (filters.bank_account_id) q = q.eq('bank_account_id', filters.bank_account_id)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.date_from) q = q.gte('cheque_date', filters.date_from)
      if (filters.date_to) q = q.lte('cheque_date', filters.date_to)
      return q
    })
  },

  async listPlanned(bankAccountId = null) {
    let q = supabase.from('finance_cheques')
      .select('*, bank_account:finance_accounts(id, registered_name, bank_name, account_number)')
      .eq('status', 'planned')
      .order('cheque_date', { ascending: true })
    if (bankAccountId) {
      q = q.eq('bank_account_id', bankAccountId)
    }
    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  async create(data) {
    const chequeNo = data.cheque_no == null ? '' : String(data.cheque_no).trim()
    const amount = Number(data.amount)
    if (!data.bank_account_id) throw new Error('Bank account is required')
    if (!chequeNo) throw new Error('Cheque number is required')
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than zero')
    // Only planned cheques may be created here: an "issued" cheque without a
    // posted voucher/payment would have no GL leg behind it.
    if (data.status && data.status !== 'planned') throw new Error('Only planned cheques can be created directly')
    const payload = {
      bank_account_id: data.bank_account_id,
      cheque_no: chequeNo,
      cheque_date: data.cheque_date || today(),
      amount,
      issued_to: data.issued_to ? String(data.issued_to).trim() : null,
      status: 'planned',
      company_id: data.company_id || null,
      branch_id: data.branch_id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data: created, error } = await supabase
      .from('finance_cheques')
      .insert(payload)
      .select('*, voucher:finance_vouchers(voucher_no, voucher_type, pay_to, amount), bank_account:finance_accounts(registered_name, bank_name, account_number)')
      .single()
    if (error) throw error
    await logFinanceAudit('cheque_created', 'finance_cheque', created.id, null, created)
    return created
  },

  async getById(id) {
    const { data, error } = await supabase.from('finance_cheques').select('*, voucher:finance_vouchers(*), bank_account:finance_accounts(*)').eq('id', id).single()
    if (error) throw error
    return data
  },

  async updateStatus(id, status, extra = {}) {
    if (status === 'cancelled' && !String(extra.cancelled_reason || '').trim()) {
      throw new Error('Cancellation reason is required')
    }
    const old = await this.getById(id)
    assertChequeTransition(old, status)
    const clearedDate = extra.cleared_date || today()
    if (status === 'cleared' && old.cheque_date && clearedDate < old.cheque_date) {
      throw new Error('Cleared date cannot be before the cheque date')
    }

    const update = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'cleared' ? { cleared_date: clearedDate } : {}),
      ...(status === 'cancelled' ? { cancelled_reason: extra.cancelled_reason } : {}),
    }

    // Guard against a concurrent server-side change (e.g. #134 voiding the cheque).
    const { data, error } = await supabase.from('finance_cheques').update(update)
      .eq('id', id).eq('status', old.status).select().single()
    if (error) throw error
    await logFinanceAudit(`cheque_${status}`, 'finance_cheque', id, old, data)
    return data
  },

  async markCleared(id, clearedDate) {
    return this.updateStatus(id, 'cleared', { cleared_date: clearedDate })
  },

  async cancel(id, reason) {
    return this.updateStatus(id, 'cancelled', { cancelled_reason: reason })
  },

  async markBounced(id, reason) {
    // Bouncing a cheque must reverse the ledger/cashbook/account effect that
    // post_finance_voucher applied when it was issued — not just flip the
    // status label. Done atomically server-side; see mark_cheque_bounced.
    const { data, error } = await supabase.rpc('mark_cheque_bounced', {
      p_cheque_id: id,
      p_reason: reason || null,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Failed to mark cheque as bounced')
    return this.getById(id)
  },
}
