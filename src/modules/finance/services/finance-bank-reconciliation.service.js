// ═══════════════════════════════════════════════════════════════════════════════
// Finance Bank Reconciliation Service — Comprehensive BRS Engine
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)

export const financeBankReconciliationService = {
  // ── List Reconciliations ──────────────────────────────────────────────────
  async list(filters = {}) {
    const ok = (v) => v !== undefined && v !== null && v !== ''
    let q = supabase
      .from('finance_bank_reconciliations')
      .select('*, bank_account:finance_accounts(id, registered_name, bank_name, account_number), lines:finance_bank_reconciliation_lines(id, is_matched, debit_amount, credit_amount)')
      .order('reconciliation_month', { ascending: false })
      .order('created_at', { ascending: false })

    if (ok(filters.bank_account_id)) q = q.eq('bank_account_id', filters.bank_account_id)
    if (ok(filters.status)) q = q.eq('status', filters.status)
    if (ok(filters.month)) q = q.eq('reconciliation_month', filters.month)

    const { data, error } = await q
    if (error) throw error

    // Enrich with computed metrics for table display
    return (data || []).map((recon) => {
      const lines = recon.lines || []
      const matchedCount = lines.filter((l) => l.is_matched).length
      const totalCount = lines.length
      return {
        ...recon,
        matched_lines_count: matchedCount,
        total_lines_count: totalCount,
      }
    })
  },

  // ── Get Single Reconciliation with all lines ─────────────────────────────
  async getById(id) {
    const { data, error } = await supabase
      .from('finance_bank_reconciliations')
      .select('*, bank_account:finance_accounts(*), lines:finance_bank_reconciliation_lines(*)')
      .eq('id', id)
      .single()

    if (error) throw error
    if (data?.lines) {
      // Sort lines: transaction_date ascending, then created_at
      data.lines.sort((a, b) => {
        if (a.transaction_date === b.transaction_date) {
          return (a.id || '').localeCompare(b.id || '')
        }
        return (a.transaction_date || '').localeCompare(b.transaction_date || '')
      })
    }
    return data
  },

  // ── Create New Reconciliation ────────────────────────────────────────────
  async create(recon, { autoFetch = true } = {}) {
    const authStore = useAuthStore()
    const user = (await supabase.auth.getUser()).data?.user

    if (!recon.bank_account_id) throw new Error('Bank account is required.')
    if (!recon.reconciliation_month) throw new Error('Reconciliation month (YYYY-MM) is required.')
    if (!recon.statement_start_date) throw new Error('Statement start date is required.')
    if (!recon.statement_end_date) throw new Error('Statement end date is required.')

    const opening = Math.round((Number(recon.opening_bank_balance) || 0) * 100) / 100
    const closing = Math.round((Number(recon.closing_bank_balance) || 0) * 100) / 100
    const initialDiff = Math.round((closing - opening) * 100) / 100

    const companyId =
      cleanUuid(recon.company_id) ||
      cleanUuid(authStore.currentBranch?.company_id) ||
      cleanUuid(authStore.profile?.company_id) ||
      null

    const branchId =
      cleanUuid(recon.branch_id) ||
      cleanUuid(authStore.currentBranch?.id) ||
      cleanUuid(authStore.profile?.branch_id) ||
      null

    const payload = {
      company_id: companyId,
      branch_id: branchId,
      bank_account_id: recon.bank_account_id,
      reconciliation_month: recon.reconciliation_month,
      statement_start_date: recon.statement_start_date,
      statement_end_date: recon.statement_end_date,
      opening_bank_balance: opening,
      closing_bank_balance: closing,
      system_balance: opening,
      difference_amount: initialDiff,
      status: 'draft',
      prepared_by: user?.id || null,
    }

    const { data, error } = await supabase
      .from('finance_bank_reconciliations')
      .insert(payload)
      .select('*, bank_account:finance_accounts(registered_name, bank_name)')
      .single()

    if (error) throw error

    await logFinanceAudit('reconciliation_created', 'bank_reconciliation', data.id, null, data)

    // Automatically pull system transactions if requested
    if (autoFetch) {
      try {
        await this.fetchAndPopulateTransactions(data.id)
      } catch (err) {
        console.warn('[BankReconciliation] Failed to auto-pull transactions:', err)
      }
    }

    return this.getById(data.id)
  },

  // ── Auto-Fetch & Populate System Transactions into Reconciliation Lines ──
  async fetchAndPopulateTransactions(reconId) {
    const recon = await this.getById(reconId)
    if (!recon) throw new Error('Reconciliation not found.')
    if (recon.status === 'locked') throw new Error('Reconciliation is locked.')

    const bankAccountId = recon.bank_account_id
    const startDate = recon.statement_start_date
    const endDate = recon.statement_end_date

    // Existing lines to prevent duplicate inserts
    const existingLines = recon.lines || []
    const existingSourceIds = new Set(existingLines.map((l) => l.source_id).filter(Boolean))

    const newLines = []

    // 1. Fetch Vouchers (Pay & Received vouchers associated with this bank account)
    const { data: vouchers, error: vErr } = await supabase
      .from('finance_vouchers')
      .select('*')
      .or(`account_id.eq.${bankAccountId},bank_id.eq.${bankAccountId}`)
      .gte('voucher_date', startDate)
      .lte('voucher_date', endDate)
      .is('deleted_at', null)

    if (vErr) console.warn('[BankReconciliation] Error fetching vouchers:', vErr)

    if (vouchers && vouchers.length > 0) {
      for (const v of vouchers) {
        if (existingSourceIds.has(v.id)) continue

        const amount = Math.round((Number(v.amount) || 0) * 100) / 100
        if (amount <= 0) continue

        const isPayment = v.voucher_type === 'pay'
        const party = v.pay_to || v.received_from || ''
        const memo = v.narration || v.remark || ''
        const desc = `[${v.voucher_no}] ${party}${memo ? ' — ' + memo : ''}`.trim()
        const isCheque = Boolean(v.cheque_id)

        newLines.push({
          reconciliation_id: reconId,
          source_type: isCheque ? 'cheque' : isPayment ? 'voucher' : 'deposit',
          source_id: v.id,
          transaction_date: v.voucher_date,
          description: desc,
          debit_amount: isPayment ? amount : 0, // Outflow (debit on bank statement)
          credit_amount: isPayment ? 0 : amount, // Inflow (credit on bank statement)
          is_matched: false,
        })
        existingSourceIds.add(v.id)
      }
    }

    // 2. Fetch Cheques from finance_cheques
    const { data: cheques, error: cErr } = await supabase
      .from('finance_cheques')
      .select('*')
      .eq('bank_account_id', bankAccountId)
      .gte('cheque_date', startDate)
      .lte('cheque_date', endDate)

    if (cErr) console.warn('[BankReconciliation] Error fetching cheques:', cErr)

    if (cheques && cheques.length > 0) {
      for (const chq of cheques) {
        // Skip if voucher already represented this
        if (chq.voucher_id && existingSourceIds.has(chq.voucher_id)) continue
        if (existingSourceIds.has(chq.id)) continue

        const amount = Math.round((Number(chq.amount) || 0) * 100) / 100
        if (amount <= 0) continue

        newLines.push({
          reconciliation_id: reconId,
          source_type: 'cheque',
          source_id: chq.id,
          transaction_date: chq.cheque_date,
          description: `[Cheque #${chq.cheque_no}] ${chq.issued_to || ''}`.trim(),
          debit_amount: amount,
          credit_amount: 0,
          is_matched: chq.status === 'cleared',
        })
        existingSourceIds.add(chq.id)
      }
    }

    // 3. Fetch Non-Voucher Cashbook Entries for this bank account (e.g. transfers, manual adjustments)
    const { data: cashbookEntries, error: cbErr } = await supabase
      .from('finance_cashbook_entries')
      .select('*')
      .eq('account_id', bankAccountId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)

    if (cbErr) console.warn('[BankReconciliation] Error fetching cashbook entries:', cbErr)

    if (cashbookEntries && cashbookEntries.length > 0) {
      for (const cb of cashbookEntries) {
        if (cb.source_id && existingSourceIds.has(cb.source_id)) continue
        if (existingSourceIds.has(cb.id)) continue

        const dr = Math.round((Number(cb.debit_amount) || 0) * 100) / 100
        const cr = Math.round((Number(cb.credit_amount) || 0) * 100) / 100
        if (dr <= 0 && cr <= 0) continue

        // Cashbook debit is cash IN (credit on bank statement)
        // Cashbook credit is cash OUT (debit on bank statement)
        newLines.push({
          reconciliation_id: reconId,
          source_type: dr > 0 ? 'deposit' : 'manual_bank_entry',
          source_id: cb.id,
          transaction_date: cb.entry_date,
          description: `[Cashbook] ${cb.description || 'Bank transaction'}`.trim(),
          debit_amount: cr, // payment
          credit_amount: dr, // deposit
          is_matched: false,
        })
        existingSourceIds.add(cb.id)
      }
    }

    // Insert any new lines
    if (newLines.length > 0) {
      const { error: insErr } = await supabase.from('finance_bank_reconciliation_lines').insert(newLines)
      if (insErr) throw insErr
    }

    // Recalculate difference and update reconciliation state
    await this.recalculateDifference(reconId)
    return this.getById(reconId)
  },

  // ── Add Manual Adjustment (Bank Charge, Interest, Fee) ───────────────────
  async addAdjustment(reconId, adjustment) {
    const user = (await supabase.auth.getUser()).data?.user
    const recon = await this.getById(reconId)
    if (!recon) throw new Error('Reconciliation not found.')
    if (recon.status === 'locked' || recon.status === 'approved') {
      throw new Error(`Cannot add adjustments to an ${recon.status} reconciliation.`)
    }

    if (!adjustment.transaction_date) throw new Error('Transaction date is required.')
    if (!adjustment.description || !adjustment.description.trim()) {
      throw new Error('Description is required.')
    }
    const amount = Math.round((Number(adjustment.amount) || 0) * 100) / 100
    if (amount <= 0) throw new Error('Amount must be greater than zero.')

    const direction = adjustment.direction || 'debit' // 'debit' = bank charge/payment, 'credit' = interest/deposit
    const isDebit = direction === 'debit'

    const payload = {
      reconciliation_id: reconId,
      source_type: adjustment.source_type || (isDebit ? 'bank_charge' : 'interest'),
      source_id: null,
      transaction_date: adjustment.transaction_date,
      description: adjustment.description.trim(),
      debit_amount: isDebit ? amount : 0,
      credit_amount: isDebit ? 0 : amount,
      is_matched: true, // Manual adjustments from statement are pre-matched
      matched_by: user?.id || null,
      matched_at: new Date().toISOString(),
      note: adjustment.note || 'Entered directly from bank statement',
    }

    const { data: line, error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    await this.recalculateDifference(reconId)
    await logFinanceAudit('reconciliation_adjustment_added', 'bank_reconciliation', reconId, null, line)
    return line
  },

  // ── Toggle Line Match ────────────────────────────────────────────────────
  async toggleMatch(lineId, isMatched) {
    const user = (await supabase.auth.getUser()).data?.user

    const updatePayload = {
      is_matched: Boolean(isMatched),
      matched_by: isMatched ? user?.id || null : null,
      matched_at: isMatched ? new Date().toISOString() : null,
    }

    const { data: line, error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .update(updatePayload)
      .eq('id', lineId)
      .select()
      .single()

    if (error) throw error

    if (line?.reconciliation_id) {
      await this.recalculateDifference(line.reconciliation_id)
    }

    return line
  },

  // ── Mass Match / Unmatch All Lines ───────────────────────────────────────
  async matchAll(reconId, shouldMatch = true) {
    const user = (await supabase.auth.getUser()).data?.user
    const recon = await this.getById(reconId)
    if (!recon) throw new Error('Reconciliation not found.')
    if (recon.status === 'locked' || recon.status === 'approved') {
      throw new Error(`Cannot modify lines on an ${recon.status} reconciliation.`)
    }

    const updatePayload = {
      is_matched: Boolean(shouldMatch),
      matched_by: shouldMatch ? user?.id || null : null,
      matched_at: shouldMatch ? new Date().toISOString() : null,
    }

    const { error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .update(updatePayload)
      .eq('reconciliation_id', reconId)

    if (error) throw error

    await this.recalculateDifference(reconId)
    return this.getById(reconId)
  },

  // ── Delete Manual Line ───────────────────────────────────────────────────
  async deleteLine(lineId) {
    const { data: line } = await supabase
      .from('finance_bank_reconciliation_lines')
      .select('id, reconciliation_id')
      .eq('id', lineId)
      .single()

    const { error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .delete()
      .eq('id', lineId)

    if (error) throw error

    if (line?.reconciliation_id) {
      await this.recalculateDifference(line.reconciliation_id)
    }
    return true
  },

  // ── Recalculate Difference & Auto-Transition Status ───────────────────────
  async recalculateDifference(reconId) {
    const recon = await this.getById(reconId)
    if (!recon) throw new Error('Reconciliation not found.')

    const lines = recon.lines || []

    // 1. Cleared / Matched sums
    const matchedDebit = lines
      .filter((l) => l.is_matched)
      .reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    const matchedCredit = lines
      .filter((l) => l.is_matched)
      .reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)

    // 2. Uncleared / Outstanding sums (BRS reporting)
    const unpresentedCheques = lines
      .filter((l) => !l.is_matched && Number(l.debit_amount) > 0)
      .reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
    const unclearedDeposits = lines
      .filter((l) => !l.is_matched && Number(l.credit_amount) > 0)
      .reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)

    const opening = Number(recon.opening_bank_balance) || 0
    const closing = Number(recon.closing_bank_balance) || 0

    // Standard Bank Reconciliation Formula:
    // Expected Statement Closing = Opening Bank Balance + Cleared Deposits (Inflow) - Cleared Payments (Outflow)
    const systemBalance = Math.round((opening + matchedCredit - matchedDebit) * 100) / 100
    const diff = Math.round((closing - systemBalance) * 100) / 100

    let newStatus = recon.status
    // Auto status promotion: if diff == 0 in draft, promote to reconciled
    if (recon.status === 'draft' && Math.abs(diff) < 0.01) {
      newStatus = 'reconciled'
    } else if (recon.status === 'reconciled' && Math.abs(diff) >= 0.01) {
      newStatus = 'draft'
    }

    const { data: updated, error } = await supabase
      .from('finance_bank_reconciliations')
      .update({
        system_balance: systemBalance,
        difference_amount: diff,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reconId)
      .select('*, bank_account:finance_accounts(registered_name, bank_name)')
      .single()

    if (error) throw error

    return {
      system_balance: systemBalance,
      difference_amount: diff,
      status: newStatus,
      matchedDebit,
      matchedCredit,
      unpresentedCheques,
      unclearedDeposits,
      updated,
    }
  },

  // ── Update Reconciliation Balances (Opening/Closing) ─────────────────────
  async updateBalances(reconId, { opening_bank_balance, closing_bank_balance }) {
    const opening = Math.round((Number(opening_bank_balance) || 0) * 100) / 100
    const closing = Math.round((Number(closing_bank_balance) || 0) * 100) / 100

    const { error } = await supabase
      .from('finance_bank_reconciliations')
      .update({
        opening_bank_balance: opening,
        closing_bank_balance: closing,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reconId)

    if (error) throw error
    await this.recalculateDifference(reconId)
    return this.getById(reconId)
  },

  // ── Approve Reconciliation ───────────────────────────────────────────────
  async approve(id) {
    const user = (await supabase.auth.getUser()).data?.user
    const old = await this.getById(id)

    if (!old) throw new Error('Reconciliation not found.')
    if (Math.abs(Number(old.difference_amount) || 0) >= 0.01) {
      throw new Error(`Cannot approve: Reconciliation has an unresolved difference of LKR ${Number(old.difference_amount).toFixed(2)}.`)
    }

    const { data, error } = await supabase
      .from('finance_bank_reconciliations')
      .update({
        status: 'approved',
        approved_by: user?.id || null,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    await logFinanceAudit('reconciliation_approved', 'bank_reconciliation', id, old, data)
    return data
  },

  // ── Lock Reconciliation ──────────────────────────────────────────────────
  async lock(id) {
    const old = await this.getById(id)
    if (!old) throw new Error('Reconciliation not found.')
    if (old.status !== 'approved') {
      throw new Error('Only approved reconciliations can be locked.')
    }

    const { data, error } = await supabase
      .from('finance_bank_reconciliations')
      .update({
        status: 'locked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    await logFinanceAudit('reconciliation_locked', 'bank_reconciliation', id, old, data)
    return data
  },

  // ── Reopen Reconciliation (Admin / Manager only) ─────────────────────────
  async reopen(id, reason = '') {
    const old = await this.getById(id)
    if (!old) throw new Error('Reconciliation not found.')
    if (old.status === 'draft') throw new Error('Reconciliation is already in draft status.')

    const { data, error } = await supabase
      .from('finance_bank_reconciliations')
      .update({
        status: 'draft',
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    await logFinanceAudit('reconciliation_reopened', 'bank_reconciliation', id, old, { ...data, reason })
    await this.recalculateDifference(id)
    return data
  },

  // ── Delete Draft Reconciliation ──────────────────────────────────────────
  async deleteReconciliation(id) {
    const old = await this.getById(id)
    if (!old) throw new Error('Reconciliation not found.')
    if (old.status !== 'draft') {
      throw new Error(`Cannot delete a reconciliation with status '${old.status}'. Only draft reconciliations can be deleted.`)
    }

    // Delete lines first (cascade handles it, but explicit delete ensures clean removal)
    await supabase.from('finance_bank_reconciliation_lines').delete().eq('reconciliation_id', id)
    const { error } = await supabase.from('finance_bank_reconciliations').delete().eq('id', id)
    if (error) throw error

    await logFinanceAudit('reconciliation_deleted', 'bank_reconciliation', id, old, null)
    return true
  },
}
