// ═══════════════════════════════════════════════════════════════════════════════
// Finance Bank Reconciliation Service — Comprehensive BRS Engine
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { logFinanceAudit } from './finance-ledger.service'
import { useAuthStore } from 'src/stores/auth'
import { fetchAllPages } from './finance-statements.service'

const cleanUuid = (val) => (typeof val === 'string' && val.trim() !== '' ? val : null)
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100

// finance_bank_reconciliation_lines.source_type CHECK:
// cheque | voucher | deposit | bank_charge | interest | manual_bank_entry
function glSourceToLineType(glSourceType, isInflow) {
  if (isInflow) return 'deposit'
  if (glSourceType === 'voucher') return 'voucher'
  return 'manual_bank_entry'
}

function lineTypeForAdjustment(type, isDebit) {
  if (type === 'card_settlement') return 'deposit'
  if (['bank_charge', 'interest', 'deposit', 'manual_bank_entry'].includes(type)) return type
  return isDebit ? 'manual_bank_entry' : 'deposit'
}

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
    if (recon.statement_end_date < recon.statement_start_date) {
      throw new Error('Statement end date cannot be before the start date.')
    }

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
  // Source of truth is the GL: every finance_cashbook_entries leg posted to
  // this bank account (account_id = bank account AND ledger_id = the account's
  // ledger). Vouchers / cheques / supplier payments / manual journals all post
  // such a leg, so pulling them separately (as the old code did) counted the
  // same movement two or three times. Cheques only enrich the description and
  // pre-match legs whose cheque has cleared within the statement period.
  async fetchAndPopulateTransactions(reconId) {
    const recon = await this.getById(reconId)
    if (!recon) throw new Error('Reconciliation not found.')
    if (['approved', 'locked'].includes(recon.status)) throw new Error(`Reconciliation is ${recon.status}.`)

    const bankAccountId = recon.bank_account_id
    const startDate = recon.statement_start_date
    const endDate = recon.statement_end_date

    let ledgerId = recon.bank_account?.ledger_id || null
    if (!ledgerId) {
      const { data: acc, error: accErr } = await supabase
        .from('finance_accounts')
        .select('id, ledger_id')
        .eq('id', bankAccountId)
        .single()
      if (accErr) throw accErr
      ledgerId = acc?.ledger_id || null
    }
    if (!ledgerId) {
      throw new Error('This bank account is not linked to a GL ledger — link it in Bank & Cash Accounts first.')
    }

    const legs = await fetchAllPages(() =>
      supabase
        .from('finance_cashbook_entries')
        .select('id, source_type, source_id, entry_date, description, debit_amount, credit_amount')
        .eq('account_id', bankAccountId)
        .eq('ledger_id', ledgerId)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: true })
        .order('id', { ascending: true }),
    )

    // Cheques on this account, keyed by the document whose GL leg they back.
    const { data: cheques, error: cErr } = await supabase
      .from('finance_cheques')
      .select('id, cheque_no, issued_to, status, cleared_date, voucher_id, supplier_payment_id')
      .eq('bank_account_id', bankAccountId)
      .in('status', ['issued', 'cleared', 'bounced'])
    if (cErr) throw cErr
    const chequeBySource = new Map()
    for (const c of cheques || []) {
      if (c.voucher_id) chequeBySource.set(c.voucher_id, c)
      if (c.supplier_payment_id) chequeBySource.set(c.supplier_payment_id, c)
    }

    const existingLines = recon.lines || []
    const lineSourceIds = new Set(existingLines.map((l) => l.source_id).filter(Boolean))
    const legIds = new Set(legs.map((l) => l.id))
    // Lines created by the pre-GL engine point at a voucher / cheque id rather
    // than at a cashbook leg; skip the original leg of those documents so they
    // are not added twice (reversal legs are still pulled in).
    const legacyIds = new Set([...lineSourceIds].filter((id) => !legIds.has(id)))
    for (const c of cheques || []) {
      if (legacyIds.has(c.id)) {
        if (c.voucher_id) legacyIds.add(c.voucher_id)
        if (c.supplier_payment_id) legacyIds.add(c.supplier_payment_id)
      }
    }

    const newLines = []
    for (const leg of legs) {
      if (lineSourceIds.has(leg.id)) continue
      const isReversal = /^REVERSAL/i.test(leg.description || '')
      if (!isReversal && leg.source_id && legacyIds.has(leg.source_id)) continue

      const dr = round2(leg.debit_amount)
      const cr = round2(leg.credit_amount)
      if (dr <= 0 && cr <= 0) continue

      const chq = leg.source_id ? chequeBySource.get(leg.source_id) : null
      const clearedInPeriod = Boolean(
        chq && !isReversal && chq.status === 'cleared' && chq.cleared_date && chq.cleared_date <= endDate,
      )
      const desc = chq
        ? `[Cheque #${chq.cheque_no}] ${leg.description || chq.issued_to || ''}`
        : `[${leg.source_type || 'GL'}] ${leg.description || 'Bank transaction'}`

      // Ledger debit = money into the bank (credit on the bank statement).
      newLines.push({
        reconciliation_id: reconId,
        source_type: chq && !isReversal ? 'cheque' : glSourceToLineType(leg.source_type, dr > 0),
        source_id: leg.id,
        transaction_date: leg.entry_date,
        description: desc.trim(),
        debit_amount: cr,
        credit_amount: dr,
        is_matched: clearedInPeriod,
        matched_at: clearedInPeriod ? new Date().toISOString() : null,
        note: clearedInPeriod ? `Cheque cleared ${chq.cleared_date}` : null,
      })
      lineSourceIds.add(leg.id)
    }

    if (newLines.length > 0) {
      const { error: insErr } = await supabase.from('finance_bank_reconciliation_lines').insert(newLines)
      if (insErr) throw insErr
    }

    await this.recalculateDifference(reconId)
    return this.getById(reconId)
  },

  // ── Add Statement Adjustment (Bank Charge, Interest, Card Settlement…) ──
  // Every adjustment is a real GL posting made atomically by the existing
  // fn_fin_post_manual_journal RPC (balanced, admin/finance only). The bank
  // ledger leg carries the bank account_id so it lands in this account's
  // cashbook; the reconciliation line then points at that cashbook leg.
  //   bank_charge / manual_bank_entry (outflow): Dr contra / Cr bank
  //   interest / deposit (inflow):               Dr bank   / Cr contra
  //   card_settlement (inflow, contra = 1021):   Dr bank (net) + Dr fee ledger / Cr 1021 (gross)
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
    const amount = round2(adjustment.amount)
    if (amount <= 0) throw new Error('Amount must be greater than zero.')
    if (!adjustment.contra_ledger_id) {
      throw new Error('Select the GL ledger to post the other side of this adjustment to.')
    }

    const bankLedgerId = recon.bank_account?.ledger_id
    if (!bankLedgerId) throw new Error('This bank account is not linked to a GL ledger.')
    if (adjustment.contra_ledger_id === bankLedgerId) {
      throw new Error('The contra ledger cannot be the bank ledger itself.')
    }

    const type = adjustment.source_type || 'bank_charge'
    const isCardSettlement = type === 'card_settlement'
    const isDebit = isCardSettlement ? false : (adjustment.direction || 'debit') === 'debit'
    const fee = isCardSettlement ? round2(adjustment.fee_amount) : 0
    if (fee < 0) throw new Error('Fee cannot be negative.')
    if (fee > 0 && !adjustment.fee_ledger_id) throw new Error('Select the ledger for the settlement fee / commission.')
    if (fee >= amount && fee > 0) throw new Error('Fee must be less than the gross settlement amount.')

    const description = adjustment.description.trim()
    const memo = adjustment.note?.trim() || null
    const bankLeg = (dr, cr) => ({
      ledger_id: bankLedgerId,
      account_id: recon.bank_account_id,
      dr_amount: dr,
      cr_amount: cr,
      memo,
    })
    let lines
    let bankNet
    if (isCardSettlement) {
      bankNet = round2(amount - fee)
      lines = [bankLeg(bankNet, 0)]
      if (fee > 0) lines.push({ ledger_id: adjustment.fee_ledger_id, dr_amount: fee, cr_amount: 0, memo: 'Settlement fee' })
      lines.push({ ledger_id: adjustment.contra_ledger_id, dr_amount: 0, cr_amount: amount, memo })
    } else {
      bankNet = amount
      lines = isDebit
        ? [{ ledger_id: adjustment.contra_ledger_id, dr_amount: amount, cr_amount: 0, memo }, bankLeg(0, amount)]
        : [bankLeg(amount, 0), { ledger_id: adjustment.contra_ledger_id, dr_amount: 0, cr_amount: amount, memo }]
    }

    const branchId =
      cleanUuid(recon.branch_id) ||
      cleanUuid(recon.bank_account?.branch_id) ||
      cleanUuid(useAuthStore().currentBranch?.id)
    const { data: res, error: rpcErr } = await supabase.rpc('fn_fin_post_manual_journal', {
      p_doc_date: adjustment.transaction_date,
      p_description: `Bank reconciliation ${recon.reconciliation_month}: ${description}`,
      p_reference: memo,
      p_branch_id: branchId,
      p_lines: lines,
    })
    if (rpcErr) throw rpcErr
    if (!res?.success || !res.journal_id) {
      throw new Error(res?.error || 'Failed to post the adjustment to the General Ledger.')
    }

    // Point the reconciliation line at the bank-ledger cashbook leg so a later
    // sync recognises it and does not add it a second time.
    const { data: leg } = await supabase
      .from('finance_cashbook_entries')
      .select('id')
      .eq('source_type', 'manual_adjustment')
      .eq('source_id', res.journal_id)
      .eq('account_id', recon.bank_account_id)
      .limit(1)
      .maybeSingle()

    const payload = {
      reconciliation_id: reconId,
      source_type: lineTypeForAdjustment(type, isDebit),
      source_id: leg?.id || res.journal_id,
      transaction_date: adjustment.transaction_date,
      description: isCardSettlement ? `[Card settlement] ${description}` : description,
      debit_amount: isDebit ? bankNet : 0,
      credit_amount: isDebit ? 0 : bankNet,
      is_matched: true, // Entered from the bank statement, so already cleared
      matched_by: user?.id || null,
      matched_at: new Date().toISOString(),
      note: memo || `GL journal ${res.journal_id}`,
    }

    const { data: line, error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    await this.recalculateDifference(reconId)
    await logFinanceAudit('reconciliation_adjustment_added', 'bank_reconciliation', reconId, null, {
      ...line,
      journal_id: res.journal_id,
    })
    return line
  },

  // ── Toggle Line Match ────────────────────────────────────────────────────
  async toggleMatch(lineId, isMatched) {
    const user = (await supabase.auth.getUser()).data?.user
    await this.assertLineEditable(lineId)

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
  // Only source-less lines (legacy pre-GL manual entries) can be deleted: a
  // GL-backed line is re-pulled on sync, and a posted adjustment must be
  // reversed from the Journal page so the GL stays correct.
  async deleteLine(lineId) {
    const line = await this.assertLineEditable(lineId)
    if (line.source_id) {
      throw new Error('This line is backed by a General Ledger posting. Reverse the journal instead of deleting the line.')
    }

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

  async assertLineEditable(lineId) {
    const { data: line, error } = await supabase
      .from('finance_bank_reconciliation_lines')
      .select('id, reconciliation_id, source_id, reconciliation:finance_bank_reconciliations(status)')
      .eq('id', lineId)
      .single()
    if (error) throw error
    const status = line?.reconciliation?.status
    if (status === 'approved' || status === 'locked') {
      throw new Error(`Cannot modify lines on an ${status} reconciliation.`)
    }
    return line
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
