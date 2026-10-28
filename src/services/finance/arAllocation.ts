// ═══════════════════════════════════════════════════════════════════════════════
// Accounts Receivable — pure helpers (#144)
//
// No Supabase / store imports: everything here is deterministic and unit-tested
// (tests/finance/ar-allocation.test.ts). Money maths is done in integer cents.
// Server rules mirrored from supabase/finance_accounts_receivable_144.sql
// (fn_ar_receive_payment): one customer, open receivables only,
// 0 < allocation ≤ open balance, receipt amount == sum of allocations.
// ═══════════════════════════════════════════════════════════════════════════════

/** Receivable statuses that still carry an open balance. */
export const AR_OPEN_STATUSES = ['outstanding', 'partial', 'overdue'] as const

/** Aging bucket keys (shared with Finance → Receivables KPI cards). */
export const AR_AGING_KEYS = ['current', '1-30 days', '31-60 days', '61-90 days', '90+ days'] as const
export type ArAgingKey = (typeof AR_AGING_KEYS)[number]

export const AR_PAYMENT_METHODS = ['Cash', 'Cheque', 'Bank Transfer', 'Card'] as const

const DAY_MS = 86_400_000

/** Money in integer cents, so allocation maths never drifts (0.1 + 0.2). */
export const toCents = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const fromCents = (c: number): number => c / 100

/** Sum of amounts computed in cents (2dp number). */
export function sumAmounts(values: unknown[]): number {
  return fromCents((values || []).reduce<number>((s, v) => s + toCents(v), 0))
}

/** Clamp a per-invoice allocation to [0, balance], rounded to cents. */
export function clampAllocation(value: unknown, balance: unknown): number {
  const bal = Math.max(toCents(balance), 0)
  const amt = Math.max(toCents(value), 0)
  return fromCents(Math.min(amt, bal))
}

/** Local calendar date as YYYY-MM-DD (not UTC — Sri Lanka is UTC+5:30). */
export function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse the date part of 'YYYY-MM-DD…' as a UTC day number (null if invalid). */
function dayNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const s = value instanceof Date ? localIsoDate(value) : String(value)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isFinite(t) ? Math.round(t / DAY_MS) : null
}

/**
 * Whole days the due date is in the past (0 when due today or in the future,
 * or when there is no due date).
 */
export function daysPastDue(dueDate: unknown, today: unknown = localIsoDate()): number {
  const due = dayNumber(dueDate)
  const now = dayNumber(today)
  if (due === null || now === null) return 0
  return Math.max(now - due, 0)
}

/** Aging bucket by days past the DUE date. */
export function agingBucketFor(dueDate: unknown, today: unknown = localIsoDate()): ArAgingKey {
  const d = daysPastDue(dueDate, today)
  if (d <= 0) return 'current'
  if (d <= 30) return '1-30 days'
  if (d <= 60) return '31-60 days'
  if (d <= 90) return '61-90 days'
  return '90+ days'
}

export interface ReceivableLike {
  id: string
  customer_id?: string | null
  doc_number?: string | null
  doc_date?: string | null
  due_date?: string | null
  total_amount?: unknown
  paid_amount?: unknown
  balance?: unknown
  status?: string | null
  source?: string | null
  gl_posted_at?: string | null
  /** part of paid_amount cleared by bad-debt write-offs (fn_ar_write_off) */
  written_off_amount?: unknown
}

/**
 * Open balance: generated `balance` column, else total − paid (never < 0).
 * paid_amount already includes write-offs, so this is the true open amount.
 */
export function receivableBalance(r: Partial<ReceivableLike> | null | undefined): number {
  if (!r) return 0
  const cents =
    r.balance !== undefined && r.balance !== null
      ? toCents(r.balance)
      : toCents(r.total_amount) - toCents(r.paid_amount)
  return fromCents(Math.max(cents, 0))
}

export function isOpenReceivable(r: Partial<ReceivableLike> | null | undefined): boolean {
  return !!r && (AR_OPEN_STATUSES as readonly string[]).includes(String(r.status || '')) && toCents(receivableBalance(r)) > 0
}

/** Aging totals of the OPEN balance of open receivables, keyed by AR_AGING_KEYS. */
export function summarizeAging(rows: Partial<ReceivableLike>[], today: unknown = localIsoDate()): Record<ArAgingKey, number> {
  const cents: Record<string, number> = Object.fromEntries(AR_AGING_KEYS.map((k) => [k, 0]))
  for (const r of rows || []) {
    if (!isOpenReceivable(r)) continue
    cents[agingBucketFor(r.due_date, today)] += toCents(receivableBalance(r))
  }
  return Object.fromEntries(AR_AGING_KEYS.map((k) => [k, fromCents(cents[k] || 0)])) as Record<ArAgingKey, number>
}

/**
 * Oldest-DUE-first ordering: due date (undated last), then doc date, then doc
 * number, then id — deterministic for several invoices due the same day.
 */
export function compareOldestDueFirst(a: Partial<ReceivableLike>, b: Partial<ReceivableLike>): number {
  const keys: [string, string][] = [
    [a.due_date || '9999-12-31', b.due_date || '9999-12-31'],
    [a.doc_date || '9999-12-31', b.doc_date || '9999-12-31'],
    [a.doc_number || '', b.doc_number || ''],
    [a.id || '', b.id || ''],
  ]
  for (const [x, y] of keys) {
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export interface ArAllocation {
  receivable_id: string
  amount: number
}

/**
 * Spread `amount` over receivables oldest-due-first, each line capped at its
 * open balance. Returns allocations (> 0 only), allocated and unallocated
 * remainder (amount larger than the total open balance).
 */
export function allocateOldestDueFirst(
  rows: Partial<ReceivableLike>[],
  amount: unknown,
): { allocations: ArAllocation[]; allocated: number; unallocated: number } {
  const requested = Math.max(toCents(amount), 0)
  let remaining = requested
  const allocations: ArAllocation[] = []
  for (const r of [...(rows || [])].sort(compareOldestDueFirst)) {
    if (remaining <= 0) break
    const bal = toCents(receivableBalance(r))
    if (bal <= 0 || !r.id) continue
    const take = Math.min(bal, remaining)
    allocations.push({ receivable_id: r.id, amount: fromCents(take) })
    remaining -= take
  }
  return { allocations, allocated: fromCents(requested - remaining), unallocated: fromCents(remaining) }
}

/** One invoice line in the Receive Payment dialog. */
export interface ReceiptAllocationLine extends ReceivableLike {
  selected: boolean
  allocation: unknown
}

export interface ReceiptAllocationCheck {
  /** [{receivable_id, amount}] for ticked lines with amount > 0 — feed to receivePayment */
  allocations: ArAllocation[]
  selectedCount: number
  allocated: number
  amount: number
  /** amount − allocated (positive = unallocated, negative = over-allocated) */
  difference: number
  customerId: string | null
  errors: string[]
  valid: boolean
}

/**
 * Validate a multi-invoice customer receipt before submit. Never clamps
 * silently — an invalid line is reported as an error.
 */
export function checkReceiptAllocations(lines: ReceiptAllocationLine[], receiptAmount: unknown): ReceiptAllocationCheck {
  const errors: string[] = []
  const selected = (lines || []).filter((l) => l && l.selected)
  const allocations: ArAllocation[] = []
  let allocatedCents = 0

  const customerIds = new Set(selected.map((l) => l.customer_id ?? ''))
  if (customerIds.size > 1) errors.push('Selected invoices belong to different customers. Receive each customer separately.')
  const customerId = customerIds.size === 1 ? [...customerIds][0] || null : null
  if (selected.length > 0 && customerIds.size === 1 && !customerId) errors.push('Invoice has no registered customer.')

  for (const line of selected) {
    const label = line.doc_number || line.id
    const raw = line.allocation === '' || line.allocation === null || line.allocation === undefined ? 0 : Number(line.allocation)
    if (!Number.isFinite(raw) || raw < 0) {
      errors.push(`Invalid amount for invoice ${label}.`)
      continue
    }
    const amt = toCents(raw)
    if (amt === 0) continue
    if (!isOpenReceivable(line)) {
      errors.push(`Invoice ${label} is not open (already paid or written off).`)
      continue
    }
    if (amt > toCents(receivableBalance(line))) {
      errors.push(`Amount for invoice ${label} exceeds its open balance.`)
      continue
    }
    allocations.push({ receivable_id: line.id, amount: fromCents(amt) })
    allocatedCents += amt
  }

  const amountCents = toCents(receiptAmount)
  if (allocations.length === 0) errors.push('Enter an amount on at least one invoice.')
  if (amountCents <= 0) errors.push('Receipt amount must be greater than zero.')
  else if (amountCents !== allocatedCents) errors.push('Receipt amount must equal the total allocated to invoices.')

  return {
    allocations,
    selectedCount: selected.length,
    allocated: fromCents(allocatedCents),
    amount: fromCents(amountCents),
    difference: fromCents(amountCents - allocatedCents),
    customerId,
    errors,
    valid: errors.length === 0,
  }
}

/** Plain allocation list check used by the RPC wrapper (sum == amount, each > 0). */
export function checkAllocationList(allocations: ArAllocation[], amount: unknown): string[] {
  const errors: string[] = []
  const list = allocations || []
  if (list.length === 0) errors.push('Select at least one invoice to settle.')
  let sum = 0
  const seen = new Set<string>()
  for (const a of list) {
    const c = toCents(a?.amount)
    if (!a?.receivable_id) errors.push('Allocation is missing its invoice.')
    else if (seen.has(a.receivable_id)) errors.push('An invoice appears twice in the allocation.')
    else seen.add(a.receivable_id)
    if (!(Number(a?.amount) > 0) || c <= 0) errors.push('Allocation amounts must be greater than zero.')
    sum += c
  }
  const amt = toCents(amount)
  if (amt <= 0) errors.push('Receipt amount must be greater than zero.')
  else if (list.length > 0 && sum !== amt) errors.push('Receipt amount must equal the total allocated to invoices.')
  return [...new Set(errors)]
}

// ── Bad-debt write-off ─────────────────────────────────────────────────────────
export interface WriteOffCheckInput {
  amount: unknown
  /** open balance of the invoice (total − paid) */
  balance: unknown
  reason?: string | null
  date?: string | null
}

/**
 * Validate a write-off before calling fn_ar_write_off. Mirrors the server:
 * 0 < amount ≤ open balance, reason required. Returns error messages.
 */
export function checkWriteOff(input: WriteOffCheckInput): string[] {
  const errors: string[] = []
  const raw = input.amount === '' || input.amount === null || input.amount === undefined ? NaN : Number(input.amount)
  const amt = toCents(raw)
  const bal = toCents(input.balance)
  if (!Number.isFinite(raw) || amt <= 0) errors.push('Write-off amount must be greater than zero.')
  else if (bal <= 0) errors.push('Nothing is open on this invoice.')
  else if (amt > bal) errors.push(`Write-off cannot exceed the open balance (${fromCents(bal).toFixed(2)}).`)
  if (!String(input.reason || '').trim()) errors.push('A reason is required.')
  if (input.date !== undefined && !input.date) errors.push('Write-off date is required.')
  return errors
}

// ── Customers ──────────────────────────────────────────────────────────────────
export interface CustomerLike {
  id?: string
  first_name?: string | null
  last_name?: string | null
  customer_code?: string | null
  phone?: string | null
  email?: string | null
}

export function customerDisplayName(c: CustomerLike | null | undefined): string {
  if (!c) return 'Walk-in / Unregistered'
  const name = `${c.first_name || ''} ${c.last_name || ''}`.trim()
  return name || c.customer_code || c.phone || c.email || 'Customer'
}

export interface CustomerBalanceRow {
  customer_id: string | null
  customer_name: string
  phone: string
  open_count: number
  balance: number
  overdue: number
  oldest_due: string | null
}

/** Open balance per customer (largest first). */
export function summarizeCustomerBalances(
  rows: (Partial<ReceivableLike> & { customers?: CustomerLike | null })[],
  today: unknown = localIsoDate(),
): CustomerBalanceRow[] {
  const map = new Map<string, CustomerBalanceRow & { _bal: number; _od: number }>()
  for (const r of rows || []) {
    if (!isOpenReceivable(r)) continue
    const key = r.customer_id || ''
    let row = map.get(key)
    if (!row) {
      row = {
        customer_id: r.customer_id || null,
        customer_name: customerDisplayName(r.customers),
        phone: r.customers?.phone || '',
        open_count: 0,
        balance: 0,
        overdue: 0,
        oldest_due: null,
        _bal: 0,
        _od: 0,
      }
      map.set(key, row)
    }
    const c = toCents(receivableBalance(r))
    row.open_count++
    row._bal += c
    if (daysPastDue(r.due_date, today) > 0) row._od += c
    if (r.due_date && (!row.oldest_due || r.due_date < row.oldest_due)) row.oldest_due = r.due_date
  }
  return [...map.values()]
    .map(({ _bal, _od, ...rest }) => ({ ...rest, balance: fromCents(_bal), overdue: fromCents(_od) }))
    .sort((a, b) => b.balance - a.balance || a.customer_name.localeCompare(b.customer_name))
}

// ── Customer statement ─────────────────────────────────────────────────────────
export interface StatementInvoice {
  id: string
  doc_number?: string | null
  doc_date?: string | null
  due_date?: string | null
  total_amount?: unknown
  description?: string | null
  status?: string | null
  created_at?: string | null
}
export interface StatementReceipt {
  id: string
  receipt_no?: string | null
  receipt_date?: string | null
  amount?: unknown
  payment_method?: string | null
  reference_no?: string | null
  status?: string | null
  created_at?: string | null
}
export interface StatementWriteOff {
  id: string
  write_off_no?: string | null
  write_off_date?: string | null
  amount?: unknown
  reason?: string | null
  status?: string | null
  created_at?: string | null
}
export interface StatementLine {
  date: string
  type: 'opening' | 'invoice' | 'receipt' | 'write_off'
  ref: string
  description: string
  debit: number
  credit: number
  balance: number
}
export interface CustomerStatement {
  opening_balance: number
  total_debit: number
  /** receipts + write-offs */
  total_credit: number
  /** receipts only */
  total_received: number
  /** bad-debt write-offs only */
  total_written_off: number
  closing_balance: number
  lines: StatementLine[]
}

/**
 * Customer statement: invoices (Dr), posted receipts (Cr) and posted bad-debt
 * write-offs (Cr) in date order with a running balance. Everything dated
 * before `dateFrom` is folded into the opening balance b/f; anything after
 * `dateTo` is ignored. Cancelled receipts / reversed write-offs are excluded
 * (their GL was reversed). On the same day invoices come first.
 */
export function buildCustomerStatement(
  invoices: StatementInvoice[],
  receipts: StatementReceipt[],
  dateFrom?: string | null,
  dateTo?: string | null,
  writeOffs: StatementWriteOff[] = [],
): CustomerStatement {
  type EvType = 'invoice' | 'receipt' | 'write_off'
  type Ev = { date: string; type: EvType; ref: string; description: string; dr: number; cr: number; tie: string }
  const events: Ev[] = []
  for (const i of invoices || []) {
    if (i.status === 'written_off' && toCents(i.total_amount) <= 0) continue
    const date = (i.doc_date || i.created_at || '').slice(0, 10)
    events.push({
      date,
      type: 'invoice',
      ref: i.doc_number || i.id.slice(0, 8),
      description: i.description || 'Customer invoice',
      dr: toCents(i.total_amount),
      cr: 0,
      tie: `${i.created_at || ''}${i.doc_number || ''}${i.id}`,
    })
  }
  for (const r of receipts || []) {
    if (r.status === 'cancelled') continue
    const date = (r.receipt_date || r.created_at || '').slice(0, 10)
    const via = [r.payment_method, r.reference_no].filter(Boolean).join(' ')
    events.push({
      date,
      type: 'receipt',
      ref: r.receipt_no || r.id.slice(0, 8),
      description: via ? `Payment received — ${via}` : 'Payment received',
      dr: 0,
      cr: toCents(r.amount),
      tie: `${r.created_at || ''}${r.receipt_no || ''}${r.id}`,
    })
  }
  for (const w of writeOffs || []) {
    if (w.status && w.status !== 'posted') continue
    const date = (w.write_off_date || w.created_at || '').slice(0, 10)
    events.push({
      date,
      type: 'write_off',
      ref: w.write_off_no || w.id.slice(0, 8),
      description: w.reason ? `Bad debt write-off — ${w.reason}` : 'Bad debt write-off',
      dr: 0,
      cr: toCents(w.amount),
      tie: `${w.created_at || ''}${w.write_off_no || ''}${w.id}`,
    })
  }
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.type !== b.type) return a.type === 'invoice' ? -1 : 1
    return a.tie < b.tie ? -1 : a.tie > b.tie ? 1 : 0
  })

  let opening = 0
  let running = 0
  let dr = 0
  let cr = 0
  let wo = 0
  const lines: StatementLine[] = []
  for (const e of events) {
    if (dateTo && e.date && e.date > dateTo) continue
    if (dateFrom && e.date && e.date < dateFrom) {
      opening += e.dr - e.cr
      continue
    }
    if (lines.length === 0) {
      running = opening
    }
    running += e.dr - e.cr
    dr += e.dr
    cr += e.cr
    if (e.type === 'write_off') wo += e.cr
    lines.push({
      date: e.date,
      type: e.type,
      ref: e.ref,
      description: e.description,
      debit: fromCents(e.dr),
      credit: fromCents(e.cr),
      balance: fromCents(running),
    })
  }
  const openingLine: StatementLine = {
    date: dateFrom || '',
    type: 'opening',
    ref: '',
    description: 'Opening balance b/f',
    debit: 0,
    credit: 0,
    balance: fromCents(opening),
  }
  return {
    opening_balance: fromCents(opening),
    total_debit: fromCents(dr),
    total_credit: fromCents(cr),
    total_received: fromCents(cr - wo),
    total_written_off: fromCents(wo),
    closing_balance: fromCents(opening + dr - cr),
    lines: [openingLine, ...lines],
  }
}

// ── GL control (sub-ledger vs ledger 1003) ─────────────────────────────────────
export interface ArControl {
  /** finance_ledgers 1003 current_balance (Dr +) */
  ledger_balance: number
  /** Σ open balance of open receivables (sub-ledger) */
  open_receivables_total: number
  /**
   * Σ total of POS credit receivables with gl_posted_at NULL. #145
   * fn_pos_post_sale posts the receivable and its Dr 1003 together, so this is
   * normally 0 — kept as a defensive reconciling item.
   */
  unposted_pos_credit_total: number
  /** open_receivables_total − ledger_balance */
  difference: number
  /** difference − unposted_pos_credit_total: what unposted POS credit does NOT explain */
  unexplained_difference: number
  reconciled: boolean
}

/**
 * Not-yet-in-GL POS credit = the FULL total of each pos_credit receivable with
 * gl_posted_at NULL: its receipts and write-offs already credited 1003, so the
 * whole invoice amount is what the GL is missing. A legacy 'written_off' row
 * with no booked write-off (written_off_amount 0) never touched 1003 → skipped.
 */
export function computeArControl(
  ledgerBalance: unknown,
  openRows: Partial<ReceivableLike>[],
  unpostedPosRows: Partial<ReceivableLike>[],
): ArControl {
  const ledger = toCents(ledgerBalance)
  const open = (openRows || []).filter(isOpenReceivable).reduce((s, r) => s + toCents(receivableBalance(r)), 0)
  const unposted = (unpostedPosRows || [])
    .filter(
      (r) =>
        r.source === 'pos_credit' &&
        !r.gl_posted_at &&
        (r.status !== 'written_off' || toCents(r.written_off_amount) > 0),
    )
    .reduce((s, r) => s + toCents(r.total_amount), 0)
  const diff = open - ledger
  const unexplained = diff - unposted
  return {
    ledger_balance: fromCents(ledger),
    open_receivables_total: fromCents(open),
    unposted_pos_credit_total: fromCents(unposted),
    difference: fromCents(diff),
    unexplained_difference: fromCents(unexplained),
    reconciled: unexplained === 0,
  }
}
