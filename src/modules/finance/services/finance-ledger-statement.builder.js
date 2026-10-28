// ═══════════════════════════════════════════════════════════════════════════════
// Ledger / Account Statement — pure builder (no I/O, unit-testable)
// Seven Waves Restaurant (Pvt) Ltd
//
// Balance convention (#122):
//   ledger  balance = signed opening (credit → negative) + Σ(debit − credit)
//   account balance = opening_balance + Σ(debit − credit) of its own entries
// Positive = Dr, negative = Cr. Amounts are never silently flipped.
// ═══════════════════════════════════════════════════════════════════════════════

export const DRIFT_TOLERANCE = 0.01

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (n) => Number(n) || 0

/** Signed ledger opening: credit-type openings are negative. */
export function signedLedgerOpening(ledger) {
  const amt = Math.abs(num(ledger?.opening_balance))
  return ledger?.opening_balance_type === 'credit' ? -amt : amt
}

/** Account opening is stored already signed (positive = Dr). */
export function signedAccountOpening(account) {
  return num(account?.opening_balance)
}

/** "1,234.50 Dr" / "1,234.50 Cr" / "0.00" */
export function formatDrCr(value) {
  const v = round2(value)
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v === 0) return abs
  return `${abs} ${v > 0 ? 'Dr' : 'Cr'}`
}

/** Stable GL ordering: entry_date, then created_at, then id. */
export function compareEntries(a, b) {
  const d = String(a.entry_date || '').localeCompare(String(b.entry_date || ''))
  if (d) return d
  const c = String(a.created_at || '').localeCompare(String(b.created_at || ''))
  if (c) return c
  return String(a.id || '').localeCompare(String(b.id || ''))
}

/** Entries that belong to an account: account_id matches AND ledger_id matches the account's ledger. */
export function filterAccountEntries(entries, account) {
  return (entries || []).filter(
    (e) => e && e.account_id === account?.id && !!account?.ledger_id && e.ledger_id === account.ledger_id,
  )
}

const SOURCE_LABELS = {
  invoice: 'Supplier Invoice',
  supplier_payment: 'Supplier Payment',
  pay_voucher: 'Payment Voucher',
  received_voucher: 'Receipt Voucher',
  manual_adjustment: 'Journal Entry',
  pos_sale: 'POS Sale',
  pos_refund: 'POS Refund',
  pos_shift: 'POS Shift Variance',
  ar_invoice: 'Customer Invoice',
  ar_receipt: 'Customer Receipt',
  ar_write_off: 'Bad Debt Write-off',
  pos_payout: 'POS Cash Payout',
}

export function titleCase(s) {
  return String(s || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Which table holds the document for a source_type (null = none). */
export function sourceTable(sourceType) {
  switch (sourceType) {
    case 'invoice':
      return 'ap_invoices'
    case 'supplier_payment':
      return 'supplier_payments'
    case 'pay_voucher':
    case 'received_voucher':
      return 'finance_vouchers'
    case 'manual_adjustment':
      return 'journal_entries'
    case 'pos_sale':
    case 'pos_refund':
      return 'orders'
    case 'ar_invoice':
      return 'customer_receivables'
    case 'ar_receipt':
      return 'ar_receipts'
    case 'ar_write_off':
      return 'ar_write_offs'
    default:
      return null
  }
}

/**
 * docRefs: { [table]: { [id]: string } } — doc numbers already resolved by the service.
 * Falls back to a short id so a reference is always visible.
 */
export function resolveSource(entry, docRefs = {}) {
  const type = entry?.source_type || ''
  const source_label = SOURCE_LABELS[type] || titleCase(type) || '—'
  const table = sourceTable(type)
  const id = entry?.source_id
  let doc_ref = ''
  if (id) {
    const found = table ? docRefs?.[table]?.[id] : null
    doc_ref = found || (type === 'manual_adjustment' ? `JE-${String(id).slice(0, 8)}` : String(id).slice(0, 8))
  }
  const description = entry?.description || ''
  return { source_label, doc_ref, description, is_reversal: /^REVERSAL/i.test(description) }
}

/**
 * Build the statement from all entries of the subject (already filtered to it).
 *
 * @param {object} p
 * @param {object} p.subject         { type, id, code, name, group, ... } for display
 * @param {number} [p.openingBase=0] signed opening balance of the ledger/account
 * @param {Array}  [p.entries]       finance_cashbook_entries of this subject (any order, any date)
 * @param {string} [p.dateFrom]      inclusive (YYYY-MM-DD); empty = all time
 * @param {string} [p.dateTo]        inclusive (YYYY-MM-DD); empty = open-ended
 * @param {number} [p.storedCurrentBalance]
 * @param {boolean} [p.compareStored=true] false when a branch filter makes the comparison meaningless
 * @param {object} [p.docRefs]
 */
export function buildStatement({
  subject,
  openingBase = 0,
  entries = [],
  dateFrom = null,
  dateTo = null,
  storedCurrentBalance = null,
  compareStored = true,
  docRefs = {},
}) {
  const sorted = [...(entries || [])].sort(compareEntries)

  let opening = num(openingBase)
  let allTime = num(openingBase)
  const rows = []
  let totalDr = 0
  let totalCr = 0
  let running = null

  for (const e of sorted) {
    const dr = num(e.debit_amount)
    const cr = num(e.credit_amount)
    const net = dr - cr
    allTime += net
    const date = e.entry_date ? String(e.entry_date).slice(0, 10) : ''
    if (dateFrom && date < dateFrom) {
      opening += net
      continue
    }
    if (dateTo && date > dateTo) continue
    if (running === null) running = opening
    running += net
    totalDr += dr
    totalCr += cr
    rows.push({
      id: e.id,
      date,
      ...resolveSource(e, docRefs),
      source_type: e.source_type || null,
      source_id: e.source_id || null,
      branch_id: e.branch_id || null,
      debit: round2(dr),
      credit: round2(cr),
      running_balance: round2(running),
    })
  }

  opening = round2(opening)
  const closing = round2(running === null ? opening : running)
  const recomputed = round2(allTime)
  const stored = storedCurrentBalance === null || storedCurrentBalance === undefined ? null : round2(storedCurrentBalance)
  const drift = compareStored && stored !== null ? round2(recomputed - stored) : null

  return {
    subject,
    date_from: dateFrom || null,
    date_to: dateTo || null,
    opening,
    rows,
    totals: { debit: round2(totalDr), credit: round2(totalCr) },
    closing,
    recomputed_balance: recomputed,
    stored_current_balance: stored,
    drift,
    has_drift: drift !== null && Math.abs(drift) > DRIFT_TOLERANCE,
  }
}

/** Array-of-arrays for spreadsheet export (header block + table + totals). */
export function statementToAoa(st) {
  const s = st?.subject || {}
  const period = st?.date_from || st?.date_to ? `${st.date_from || 'Beginning'} to ${st.date_to || 'Today'}` : 'All time'
  const aoa = [
    [s.type === 'account' ? 'Account Statement' : 'Ledger Statement'],
    [`${s.code ? s.code + ' — ' : ''}${s.name || ''}`],
    [s.group ? `Group: ${s.group}` : ''],
    [`Period: ${period}`],
    [],
    ['Date', 'Source', 'Reference', 'Description', 'Debit', 'Credit', 'Balance', 'Dr/Cr'],
    ['', '', '', 'Balance b/f', '', '', Math.abs(st.opening), drCrTag(st.opening)],
  ]
  for (const r of st.rows || []) {
    aoa.push([
      r.date,
      r.source_label,
      r.doc_ref,
      r.description,
      r.debit || '',
      r.credit || '',
      Math.abs(r.running_balance),
      drCrTag(r.running_balance),
    ])
  }
  aoa.push(['', '', '', 'Totals', st.totals.debit, st.totals.credit, '', ''])
  aoa.push(['', '', '', 'Closing balance c/f', '', '', Math.abs(st.closing), drCrTag(st.closing)])
  return aoa
}

export function drCrTag(v) {
  const r = round2(v)
  return r > 0 ? 'Dr' : r < 0 ? 'Cr' : ''
}
