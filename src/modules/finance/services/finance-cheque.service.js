// ═══════════════════════════════════════════════════════════════════════════════
// Finance Cheque Service
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'

export const financeChequeService = {
  async list(filters = {}) {
    let q = supabase.from('finance_cheques').select('*, voucher:finance_vouchers(voucher_no, voucher_type, pay_to, amount), bank_account:finance_accounts(registered_name, bank_name)')
      .order('cheque_date', { ascending: false })
    if (filters.bank_account_id) q = q.eq('bank_account_id', filters.bank_account_id)
    if (filters.status) q = q.eq('status', filters.status)
    if (filters.date_from) q = q.gte('cheque_date', filters.date_from)
    if (filters.date_to) q = q.lte('cheque_date', filters.date_to)
    const { data, error } = await q
    if (error) throw error
    return data || []
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
    const payload = {
      bank_account_id: data.bank_account_id,
      cheque_no: String(data.cheque_no).trim(),
      cheque_date: data.cheque_date || new Date().toISOString().split('T')[0],
      amount: Number(data.amount),
      issued_to: data.issued_to ? String(data.issued_to).trim() : null,
      status: data.status || 'planned',
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
    const old = await this.getById(id)

    if (status === 'cancelled' && !extra.cancelled_reason) {
      throw new Error('Cancellation reason is required')
    }

    const update = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === 'cleared' ? { cleared_date: extra.cleared_date || new Date().toISOString().split('T')[0] } : {}),
      ...(status === 'cancelled' ? { cancelled_reason: extra.cancelled_reason } : {}),
    }

    const { data, error } = await supabase.from('finance_cheques').update(update).eq('id', id).select().single()
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
