// ═══════════════════════════════════════════════════════════════════════════════
// Cashbook / Petty Cash Book — pure builder (no I/O, unit-testable)
// Seven Waves Restaurant (Pvt) Ltd
//
// The GL of record is finance_cashbook_entries. A cash book is every leg posted
// to a cash / bank ledger, whatever produced it (vouchers, POS sales, payouts,
// shift variances, AR receipts, supplier payments, payroll, journals …).
//
// Balance convention (#122, same as the ledger statement):
//   ledger balance = signed opening (credit → negative) + Σ(debit − credit)
// For a cash/bank ledger Dr = money in (receipt), Cr = money out (payment).
// Running balances are kept PER LEDGER and always accumulate every leg of the
// ledger — a source-type filter only hides rows, it never changes a balance.
// ═══════════════════════════════════════════════════════════════════════════════

import { signedLedgerOpening, compareEntries, resolveSource, DRIFT_TOLERANCE } from './finance-ledger-statement.builder'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (n) => Number(n) || 0

/** Petty-cash style ledgers (live: 10011 Petty Cash -HR, 100001-3 Store Petty Cash, 10012 Change Fund). */
export const PETTY_CASH_RE = /petty|change\s*fund/i

/**
 * Splits the ledgers into the main cash/bank book and the petty cash book.
 * A ledger is a cash/bank ledger when it is flagged as one OR a finance_accounts
 * row (cash drawer / bank / petty cash) is linked to it.
 */
export function classifyCashLedgers(ledgers = [], accounts = []) {
  const linked = new Map()
  for (const a of accounts || []) {
    if (!a?.ledger_id || a.deleted_at) continue
    ;(linked.get(a.ledger_id) || linked.set(a.ledger_id, []).get(a.ledger_id)).push(a)
  }
  const cash = []
  const petty = []
  for (const l of ledgers || []) {
    if (!l?.id) continue
    const accs = linked.get(l.id) || []
    // A petty-cash / change-fund named ledger counts even when unflagged — but
    // never an income / expense ledger such as "Petty Cash Expenses".
    const pettyByName =
      PETTY_CASH_RE.test(String(l.ledger_name || '')) && !['expense', 'income'].includes(String(l.ledger_type || '').toLowerCase())
    const isCash = !!(l.is_cashbook_ledger || l.is_bank_ledger || l.is_petty_cash_ledger || accs.length || pettyByName)
    if (!isCash) continue
    const isPetty = !!l.is_petty_cash_ledger || accs.some((a) => a.account_type === 'petty_cash') || pettyByName
    ;(isPetty ? petty : cash).push(l)
  }
  const byCode = (a, b) => String(a.ledger_code || '').localeCompare(String(b.ledger_code || ''), undefined, { numeric: true })
  return { cash: cash.sort(byCode), petty: petty.sort(byCode) }
}

const entryDate = (e) => (e?.entry_date ? String(e.entry_date).slice(0, 10) : '')

/** True when the entry falls inside [dateFrom, dateTo] (both inclusive, empty = open). */
export function inPeriod(e, dateFrom, dateTo) {
  const d = entryDate(e)
  if (dateFrom && d < dateFrom) return false
  if (dateTo && d > dateTo) return false
  return true
}

/**
 * @param {object}  p
 * @param {Array}   p.ledgers        the ledgers of the book (already scoped)
 * @param {Array}   p.entries        ALL finance_cashbook_entries of those ledgers (any date)
 * @param {string}  [p.dateFrom]
 * @param {string}  [p.dateTo]
 * @param {string}  [p.sourceType]   only show rows of this source_type (balances unaffected)
 * @param {boolean} [p.compareStored=true] false when a branch filter makes the stored balance incomparable
 * @param {object}  [p.docRefs]
 */
export function buildCashbook({
  ledgers = [],
  entries = [],
  dateFrom = null,
  dateTo = null,
  sourceType = null,
  compareStored = true,
  docRefs = {},
} = {}) {
  const byLedger = new Map()
  for (const l of ledgers) byLedger.set(l.id, [])
  for (const e of entries || []) {
    if (e && byLedger.has(e.ledger_id)) byLedger.get(e.ledger_id).push(e)
  }

  const summary = []
  const rows = []
  const totals = { opening: 0, debit: 0, credit: 0, closing: 0, shown_debit: 0, shown_credit: 0 }

  for (const l of ledgers) {
    const list = byLedger.get(l.id).sort(compareEntries)
    let opening = signedLedgerOpening(l)
    let allTime = opening
    let dr = 0
    let cr = 0
    const periodRows = []
    let running = null

    for (const e of list) {
      const d = num(e.debit_amount)
      const c = num(e.credit_amount)
      const net = d - c
      allTime += net
      const date = entryDate(e)
      if (dateFrom && date < dateFrom) {
        opening += net
        continue
      }
      if (dateTo && date > dateTo) continue
      if (running === null) running = opening
      running += net
      dr += d
      cr += c
      if (sourceType && e.source_type !== sourceType) continue
      totals.shown_debit += d
      totals.shown_credit += c
      periodRows.push({
        key: e.id,
        kind: 'entry',
        id: e.id,
        date,
        ledger_id: l.id,
        ledger_code: l.ledger_code || '',
        ledger_name: l.ledger_name || '',
        ...resolveSource(e, docRefs),
        source_type: e.source_type || null,
        source_id: e.source_id || null,
        branch_id: e.branch_id || null,
        account_id: e.account_id || null,
        debit: round2(d),
        credit: round2(c),
        running_balance: round2(running),
      })
    }

    opening = round2(opening)
    const closing = round2(running === null ? opening : running)
    const recomputed = round2(allTime)
    const stored =
      l.current_balance === null || l.current_balance === undefined ? null : round2(l.current_balance)
    const drift = compareStored && stored !== null ? round2(recomputed - stored) : null

    // Hide ledgers that are completely silent in the period and carry no balance.
    if (!periodRows.length && opening === 0 && closing === 0 && dr === 0 && cr === 0) continue

    summary.push({
      ledger_id: l.id,
      ledger_code: l.ledger_code || '',
      ledger_name: l.ledger_name || '',
      opening,
      debit: round2(dr),
      credit: round2(cr),
      closing,
      recomputed_balance: recomputed,
      stored_current_balance: stored,
      drift,
      has_drift: drift !== null && Math.abs(drift) > DRIFT_TOLERANCE,
    })

    rows.push({
      key: `ob-${l.id}`,
      kind: 'opening',
      id: null,
      date: dateFrom || '',
      ledger_id: l.id,
      ledger_code: l.ledger_code || '',
      ledger_name: l.ledger_name || '',
      source_label: '',
      doc_ref: '',
      description: 'Balance b/f',
      source_type: null,
      debit: 0,
      credit: 0,
      running_balance: opening,
    })
    rows.push(...periodRows)

    totals.opening += opening
    totals.debit += dr
    totals.credit += cr
    totals.closing += closing
  }

  for (const k of Object.keys(totals)) totals[k] = round2(totals[k])
  return { date_from: dateFrom || null, date_to: dateTo || null, ledgers: summary, rows, totals }
}

/** Source types that post to cash / bank ledgers (filter options). */
export const CASHBOOK_SOURCE_OPTIONS = [
  { label: 'POS Sale', value: 'pos_sale' },
  { label: 'POS Refund', value: 'pos_refund' },
  { label: 'POS Cash Payout', value: 'pos_payout' },
  { label: 'POS Shift Variance', value: 'pos_shift' },
  { label: 'Payment Voucher', value: 'pay_voucher' },
  { label: 'Receipt Voucher', value: 'received_voucher' },
  { label: 'Customer Receipt', value: 'ar_receipt' },
  { label: 'Supplier Payment', value: 'supplier_payment' },
  { label: 'Payroll', value: 'payroll' },
  { label: 'Salary Advance', value: 'salary_advance' },
  { label: 'Purchase Return', value: 'purchase_return' },
  { label: 'Cheque Bounced', value: 'cheque_bounced' },
  { label: 'Journal Entry', value: 'manual_adjustment' },
]
