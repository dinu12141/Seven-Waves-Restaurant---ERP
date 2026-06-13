/**
 * Shift Finance Service — Auto-post journal entries on shift close
 *
 * Creates balanced journal entries linking the closed shift
 * to the ERP accounting module.
 */

import { createJournalEntry } from 'src/services/financeService'
import { supabase } from 'src/boot/supabase'
import type { ShiftSummary } from './shiftService'
import { logShiftAudit } from './shiftService'

// ── Account Codes (Chart of Accounts) ────────────────────────────
const ACCOUNTS = {
  CASH_IN_HAND: { code: '1000', name: 'Cash in Hand' },
  CARD_RECEIVABLE: { code: '1050', name: 'Card Receivable' },
  ONLINE_RECEIVABLE: { code: '1060', name: 'Online Payment Receivable' },
  SALES_REVENUE: { code: '4000', name: 'Sales Revenue' },
  TAX_PAYABLE: { code: '2100', name: 'Tax Payable' },
  CASH_SHORTAGE: { code: '5200', name: 'Cash Shortage Expense' },
  CASH_OVERAGE: { code: '4200', name: 'Cash Overage Income' },
}

// ── Post Shift Journal ───────────────────────────────────────────

export async function postShiftJournal(shift: ShiftSummary): Promise<{
  success: boolean
  journalId?: string
  error?: string
}> {
  try {
    if (shift.status !== 'closed') {
      return { success: false, error: 'Shift must be closed before posting journal.' }
    }

    const totalSales = (shift.cash_sales_total || 0)
      + (shift.card_sales_total || 0)
      + (shift.qr_sales_total || 0)
      + (shift.bank_sales_total || 0)
      + (shift.credit_sales_total || 0)

    if (totalSales <= 0) {
      // No sales to post — skip journal creation
      return { success: true, journalId: undefined }
    }

    const onlineTotal = (shift.qr_sales_total || 0) + (shift.bank_sales_total || 0)
    const variance = shift.variance || 0
    const expectedCash = shift.expected_cash || 0

    // ── Build journal lines ──────────────────────────────────────

    const lines: Array<{
      account_code: string
      account_name: string
      dr_amount: number
      cr_amount: number
      memo: string
    }> = []

    // Dr: Cash in Hand = expected_cash
    if (expectedCash > 0) {
      lines.push({
        account_code: ACCOUNTS.CASH_IN_HAND.code,
        account_name: ACCOUNTS.CASH_IN_HAND.name,
        dr_amount: expectedCash,
        cr_amount: 0,
        memo: `POS Shift cash — expected: ${expectedCash.toFixed(2)}`,
      })
    }

    // Dr: Card Receivable = card_sales_total
    if ((shift.card_sales_total || 0) > 0) {
      lines.push({
        account_code: ACCOUNTS.CARD_RECEIVABLE.code,
        account_name: ACCOUNTS.CARD_RECEIVABLE.name,
        dr_amount: shift.card_sales_total,
        cr_amount: 0,
        memo: `POS Shift card sales`,
      })
    }

    // Dr: Online Payment Receivable = qr + bank
    if (onlineTotal > 0) {
      lines.push({
        account_code: ACCOUNTS.ONLINE_RECEIVABLE.code,
        account_name: ACCOUNTS.ONLINE_RECEIVABLE.name,
        dr_amount: onlineTotal,
        cr_amount: 0,
        memo: `POS Shift online sales (QR: ${(shift.qr_sales_total || 0).toFixed(2)}, Bank: ${(shift.bank_sales_total || 0).toFixed(2)})`,
      })
    }

    // Cr: Sales Revenue = total sales (net)
    lines.push({
      account_code: ACCOUNTS.SALES_REVENUE.code,
      account_name: ACCOUNTS.SALES_REVENUE.name,
      dr_amount: 0,
      cr_amount: totalSales,
      memo: `POS Shift sales revenue`,
    })

    // Variance handling
    if (variance < 0) {
      // Shortage: debit Cash Shortage Expense
      lines.push({
        account_code: ACCOUNTS.CASH_SHORTAGE.code,
        account_name: ACCOUNTS.CASH_SHORTAGE.name,
        dr_amount: Math.abs(variance),
        cr_amount: 0,
        memo: `POS Shift cash shortage: ${Math.abs(variance).toFixed(2)}`,
      })
    } else if (variance > 0) {
      // Overage: credit Cash Overage Income
      lines.push({
        account_code: ACCOUNTS.CASH_OVERAGE.code,
        account_name: ACCOUNTS.CASH_OVERAGE.name,
        dr_amount: 0,
        cr_amount: variance,
        memo: `POS Shift cash overage: ${variance.toFixed(2)}`,
      })
    }

    // ── Create the journal entry ─────────────────────────────────

    const today = new Date().toISOString().split('T')[0]

    const entry = {
      description: `POS Shift Close — ${shift.terminal_id} — ${shift.opened_at?.substring(0, 10) || today}`,
      reference_type: 'pos_shift',
      reference_id: shift.id,
      doc_date: today,
      total_amount: totalSales,
      branch_id: shift.branch_id,
    }

    const { data: je, error: jeErr } = await createJournalEntry(entry, lines)

    if (jeErr) {
      console.error('[ShiftFinance] Journal creation failed:', jeErr)
      return { success: false, error: `Journal creation failed: ${jeErr}` }
    }

    // ── Link journal to shift ────────────────────────────────────

    if (je?.id) {
      await supabase
        .from('pos_shifts')
        .update({ journal_entry_id: je.id })
        .eq('id', shift.id)

      // Audit log
      await logShiftAudit(
        'finance_journal_created',
        shift.id,
        shift.branch_id,
        shift.terminal_id,
        undefined,
        {
          journal_entry_id: je.id,
          total_sales: totalSales,
          variance,
          lines_count: lines.length,
        },
      )
    }

    return { success: true, journalId: je?.id }
  } catch (err: any) {
    console.error('[ShiftFinance] postShiftJournal error:', err)
    return { success: false, error: err.message || 'Unknown error' }
  }
}
