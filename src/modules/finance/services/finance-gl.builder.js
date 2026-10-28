// ═══════════════════════════════════════════════════════════════════════════════
// Finance GL Builder — pure helpers that turn finance_cashbook_entries legs into
// "postings" (one document's balanced Dr/Cr legs) for the General Ledger view.
// No Supabase access here: everything is unit-testable.
// ═══════════════════════════════════════════════════════════════════════════════

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Human label per cashbook source_type. Unknown types are title-cased. */
export const GL_SOURCE_LABELS = {
  invoice: 'Supplier Bill',
  supplier_payment: 'Supplier Payment',
  pay_voucher: 'Pay Voucher',
  received_voucher: 'Received Voucher',
  manual_adjustment: 'Manual Journal',
  payroll: 'Payroll',
  salary_advance: 'Salary Advance',
  petty_cash: 'Petty Cash',
  bank_transfer: 'Bank Transfer',
  cheque_bounced: 'Cheque Bounced',
  bank_charge: 'Bank Charge',
  cheque: 'Cheque',
  purchase_return: 'Purchase Return',
  pos_sale: 'POS Sale',
  pos_refund: 'POS Refund',
  pos_shift: 'POS Shift Variance',
  ar_invoice: 'Customer Invoice',
  ar_receipt: 'Customer Receipt',
  ar_write_off: 'Bad Debt Write-off',
  pos_payout: 'POS Cash Payout',
}

export function titleCase(str) {
  if (!str) return 'Unknown'
  return String(str)
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function sourceLabel(sourceType) {
  if (!sourceType) return 'Unknown'
  if (GL_SOURCE_LABELS[sourceType]) return GL_SOURCE_LABELS[sourceType]
  if (sourceType.startsWith('pos_')) return `POS ${titleCase(sourceType.slice(4))}`
  return titleCase(sourceType)
}

/**
 * Where each source_type's document number lives:
 * { table, select, columns } — the first non-empty column of the row wins.
 */
export const GL_DOC_SOURCES = {
  invoice: { table: 'ap_invoices', select: 'id, doc_number', columns: ['doc_number'] },
  supplier_payment: { table: 'supplier_payments', select: 'id, doc_number', columns: ['doc_number'] },
  pay_voucher: { table: 'finance_vouchers', select: 'id, voucher_no', columns: ['voucher_no'] },
  received_voucher: { table: 'finance_vouchers', select: 'id, voucher_no', columns: ['voucher_no'] },
  manual_adjustment: {
    table: 'journal_entries',
    select: '*',
    columns: ['doc_ref', 'doc_number', 'journal_no'],
  },
  pos_sale: { table: 'orders', select: 'id, order_number', columns: ['order_number'] },
  pos_refund: { table: 'orders', select: 'id, order_number', columns: ['order_number'] },
  ar_invoice: { table: 'customer_receivables', select: 'id, doc_number', columns: ['doc_number'] },
  ar_receipt: { table: 'ar_receipts', select: 'id, receipt_no', columns: ['receipt_no'] },
  ar_write_off: { table: 'ar_write_offs', select: 'id, write_off_no', columns: ['write_off_no'] },
}

export function isReversalLeg(entry) {
  return /^\s*REVERSAL/i.test(entry?.description || '')
}

export function postingKey(entry) {
  return `${entry.source_type || 'unknown'}|${entry.source_id || entry.id}|${isReversalLeg(entry) ? 'R' : 'N'}`
}

/** Pick the document number out of a source row for the given source_type. */
export function docRefFromRow(sourceType, row) {
  if (!row) return null
  const cfg = GL_DOC_SOURCES[sourceType]
  for (const c of cfg?.columns || []) {
    if (row[c]) return String(row[c])
  }
  return null
}

/**
 * Group cashbook legs into postings.
 *
 * @param {Array} entries   finance_cashbook_entries rows
 * @param {Object} opts
 * @param {Map|Object} [opts.ledgers]   id → { ledger_code, ledger_name }
 * @param {Map|Object} [opts.accounts]  id → { registered_name, account_number }
 * @param {Map|Object} [opts.docRefs]   `${source_type}|${source_id}` → doc number
 * @returns {Array} postings sorted newest first
 */
export function buildGlPostings(entries = [], opts = {}) {
  const get = (m, k) => (k == null || !m ? undefined : m instanceof Map ? m.get(k) : m[k])
  const postings = new Map()

  for (const e of entries) {
    const key = postingKey(e)
    let p = postings.get(key)
    if (!p) {
      const reversal = isReversalLeg(e)
      const docRef = get(opts.docRefs, `${e.source_type}|${e.source_id}`) || null
      p = {
        key,
        date: e.entry_date || null,
        created_at: e.created_at || null,
        branch_id: e.branch_id || null,
        source_type: e.source_type || null,
        source_id: e.source_id || null,
        source_label: sourceLabel(e.source_type),
        doc_ref: docRef,
        description: e.description || '',
        is_reversal: reversal,
        lines: [],
        total_dr: 0,
        total_cr: 0,
        balanced: true,
      }
      postings.set(key, p)
    }

    const ledger = get(opts.ledgers, e.ledger_id)
    const account = get(opts.accounts, e.account_id)
    const debit = round2(e.debit_amount)
    const credit = round2(e.credit_amount)

    p.lines.push({
      id: e.id,
      ledger_id: e.ledger_id || null,
      ledger_code: ledger?.ledger_code || '',
      ledger_name: ledger?.ledger_name || (e.ledger_id ? 'Unknown ledger' : '—'),
      account_name: account
        ? [account.registered_name, account.account_number].filter(Boolean).join(' · ')
        : '',
      debit,
      credit,
      description: e.description || '',
    })
    p.total_dr = round2(p.total_dr + debit)
    p.total_cr = round2(p.total_cr + credit)
    if (e.entry_date && (!p.date || e.entry_date > p.date)) p.date = e.entry_date
    if (e.created_at && (!p.created_at || e.created_at > p.created_at)) p.created_at = e.created_at
  }

  const list = [...postings.values()]
  for (const p of list) {
    p.balanced = Math.abs(p.total_dr - p.total_cr) < 0.01
    // Debit legs first, then credits — conventional journal layout.
    p.lines.sort((a, b) => (b.debit > 0) - (a.debit > 0))
  }

  list.sort((a, b) => {
    const d = String(b.date || '').localeCompare(String(a.date || ''))
    if (d !== 0) return d
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
  return list
}

/** KPI summary for a list of postings. */
export function summarizeGlPostings(postings = []) {
  let totalDr = 0
  let totalCr = 0
  let unbalanced = 0
  for (const p of postings) {
    totalDr += p.total_dr
    totalCr += p.total_cr
    if (!p.balanced) unbalanced++
  }
  return {
    count: postings.length,
    total_dr: round2(totalDr),
    total_cr: round2(totalCr),
    unbalanced,
  }
}

/** Split an array into chunks of at most `size`. */
export function chunk(arr, size = 200) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}
