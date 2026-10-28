// ═══════════════════════════════════════════════════════════════════════════════
// Accounts Receivable pure helpers (#144): aging by DUE date, oldest-due-first
// allocation in cents, receipt validation, customer statement, GL control.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import {
  AR_AGING_KEYS,
  agingBucketFor,
  daysPastDue,
  summarizeAging,
  receivableBalance,
  allocateOldestDueFirst,
  checkReceiptAllocations,
  checkAllocationList,
  clampAllocation,
  sumAmounts,
  buildCustomerStatement,
  checkWriteOff,
  computeArControl,
  summarizeCustomerBalances,
  customerDisplayName,
  localIsoDate,
} from 'src/services/finance/arAllocation'

const TODAY = '2026-10-28'

describe('aging by due date', () => {
  it('uses page bucket keys', () => {
    expect([...AR_AGING_KEYS]).toEqual(['current', '1-30 days', '31-60 days', '61-90 days', '90+ days'])
  })

  it('counts days past the DUE date, not the doc date', () => {
    expect(daysPastDue('2026-10-28', TODAY)).toBe(0)
    expect(daysPastDue('2026-11-15', TODAY)).toBe(0)
    expect(daysPastDue('2026-10-27', TODAY)).toBe(1)
    expect(daysPastDue(null, TODAY)).toBe(0)
    expect(daysPastDue('2026-10-27T23:00:00+05:30', TODAY)).toBe(1)
  })

  it('buckets boundaries', () => {
    expect(agingBucketFor('2026-10-28', TODAY)).toBe('current')
    expect(agingBucketFor('2026-10-27', TODAY)).toBe('1-30 days')
    expect(agingBucketFor('2026-09-28', TODAY)).toBe('1-30 days') // 30
    expect(agingBucketFor('2026-09-27', TODAY)).toBe('31-60 days') // 31
    expect(agingBucketFor('2026-08-29', TODAY)).toBe('31-60 days') // 60
    expect(agingBucketFor('2026-08-28', TODAY)).toBe('61-90 days') // 61
    expect(agingBucketFor('2026-07-30', TODAY)).toBe('61-90 days') // 90
    expect(agingBucketFor('2026-07-29', TODAY)).toBe('90+ days') // 91
    expect(agingBucketFor(undefined, TODAY)).toBe('current')
  })

  it('sums the OPEN balance of open receivables only', () => {
    const rows = [
      { id: 'a', status: 'outstanding', due_date: '2026-11-30', total_amount: 100, paid_amount: 0, balance: 100 },
      { id: 'b', status: 'partial', due_date: '2026-10-01', total_amount: 100, paid_amount: 40.1, balance: 59.9 },
      { id: 'c', status: 'overdue', due_date: '2026-06-01', total_amount: 0.3, paid_amount: 0.1 },
      { id: 'd', status: 'paid', due_date: '2026-06-01', total_amount: 50, paid_amount: 50, balance: 0 },
      { id: 'e', status: 'written_off', due_date: '2026-06-01', total_amount: 50, paid_amount: 0, balance: 50 },
    ]
    expect(summarizeAging(rows, TODAY)).toEqual({
      current: 100,
      '1-30 days': 59.9,
      '31-60 days': 0,
      '61-90 days': 0,
      '90+ days': 0.2,
    })
  })

  it('receivableBalance falls back to total - paid and never goes negative', () => {
    expect(receivableBalance({ total_amount: 0.3, paid_amount: 0.1 })).toBe(0.2)
    expect(receivableBalance({ total_amount: 10, paid_amount: 12 })).toBe(0)
    expect(receivableBalance({ balance: '12.50' })).toBe(12.5)
  })

  it('localIsoDate uses local calendar parts', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('allocateOldestDueFirst', () => {
  const rows = [
    { id: 'late', due_date: '2026-12-01', doc_date: '2026-10-01', balance: 50 },
    { id: 'old', due_date: '2026-09-01', doc_date: '2026-08-01', balance: 0.1 },
    { id: 'mid', due_date: '2026-10-01', doc_date: '2026-07-01', balance: 0.2 },
  ]

  it('fills oldest DUE first, in cents', () => {
    const r = allocateOldestDueFirst(rows, 10.3)
    expect(r.allocations).toEqual([
      { receivable_id: 'old', amount: 0.1 },
      { receivable_id: 'mid', amount: 0.2 },
      { receivable_id: 'late', amount: 10 },
    ])
    expect(r.allocated).toBe(10.3)
    expect(r.unallocated).toBe(0)
  })

  it('reports the unallocated remainder', () => {
    const r = allocateOldestDueFirst(rows, 100)
    expect(r.allocated).toBe(50.3)
    expect(r.unallocated).toBe(49.7)
  })

  it('zero / negative amounts allocate nothing', () => {
    expect(allocateOldestDueFirst(rows, 0).allocations).toEqual([])
    expect(allocateOldestDueFirst(rows, -5).allocations).toEqual([])
  })

  it('clampAllocation and sumAmounts work in cents', () => {
    expect(clampAllocation(99, 10.25)).toBe(10.25)
    expect(clampAllocation(-1, 10)).toBe(0)
    expect(sumAmounts([0.1, 0.2])).toBe(0.3)
  })
})

describe('checkReceiptAllocations', () => {
  const line = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    doc_number: 'AR-INV-1',
    customer_id: 'c1',
    status: 'outstanding',
    balance: 100,
    selected: true,
    allocation: 100,
    ...over,
  })

  it('valid when sum == amount and each line within balance', () => {
    const r = checkReceiptAllocations([line(), line({ id: 'r2', doc_number: 'AR-INV-2', balance: 0.3, allocation: 0.3 })], 100.3)
    expect(r.valid).toBe(true)
    expect(r.customerId).toBe('c1')
    expect(r.allocations).toEqual([
      { receivable_id: 'r1', amount: 100 },
      { receivable_id: 'r2', amount: 0.3 },
    ])
    expect(r.difference).toBe(0)
  })

  it('rejects mixed customers', () => {
    const r = checkReceiptAllocations([line(), line({ id: 'r2', customer_id: 'c2' })], 200)
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/different customers/)
  })

  it('rejects over-allocation and closed invoices', () => {
    expect(checkReceiptAllocations([line({ allocation: 100.01 })], 100.01).errors.join(' ')).toMatch(/exceeds/)
    expect(checkReceiptAllocations([line({ status: 'paid' })], 100).errors.join(' ')).toMatch(/not open/)
  })

  it('rejects amount != allocated, zero amount, negative line', () => {
    expect(checkReceiptAllocations([line()], 90).errors.join(' ')).toMatch(/must equal/)
    expect(checkReceiptAllocations([line({ allocation: 0 })], 0).valid).toBe(false)
    expect(checkReceiptAllocations([line({ allocation: -5 })], 5).errors.join(' ')).toMatch(/Invalid amount/)
  })

  it('ignores unticked lines', () => {
    const r = checkReceiptAllocations([line(), line({ id: 'r2', selected: false, allocation: 50 })], 100)
    expect(r.valid).toBe(true)
    expect(r.selectedCount).toBe(1)
  })

  it('checkAllocationList enforces sum, positivity and no duplicates', () => {
    expect(checkAllocationList([{ receivable_id: 'a', amount: 1 }], 1)).toEqual([])
    expect(checkAllocationList([], 1)[0]).toMatch(/at least one/)
    expect(checkAllocationList([{ receivable_id: 'a', amount: 1 }], 2).join(' ')).toMatch(/must equal/)
    expect(checkAllocationList([{ receivable_id: 'a', amount: 0 }], 0).join(' ')).toMatch(/greater than zero/)
    expect(
      checkAllocationList(
        [
          { receivable_id: 'a', amount: 1 },
          { receivable_id: 'a', amount: 1 },
        ],
        2,
      ).join(' '),
    ).toMatch(/twice/)
  })
})

describe('buildCustomerStatement', () => {
  const invoices = [
    { id: 'i1', doc_number: 'AR-INV-1', doc_date: '2026-08-10', total_amount: 1000, description: 'Hall' },
    { id: 'i2', doc_number: 'AR-INV-2', doc_date: '2026-10-05', total_amount: 500.5 },
  ]
  const receipts = [
    { id: 'p1', receipt_no: 'AR-RCPT-1', receipt_date: '2026-09-01', amount: 400, status: 'posted' },
    { id: 'p2', receipt_no: 'AR-RCPT-2', receipt_date: '2026-10-05', amount: 100, status: 'posted', payment_method: 'cash' },
    { id: 'p3', receipt_no: 'AR-RCPT-3', receipt_date: '2026-10-06', amount: 999, status: 'cancelled' },
    { id: 'p4', receipt_no: 'AR-RCPT-4', receipt_date: '2026-11-01', amount: 50, status: 'posted' },
  ]

  it('opening b/f, chronological running balance, invoice before receipt on same day', () => {
    const s = buildCustomerStatement(invoices, receipts, '2026-10-01', '2026-10-31')
    expect(s.opening_balance).toBe(600)
    expect(s.lines.map((l) => [l.type, l.ref, l.balance])).toEqual([
      ['opening', '', 600],
      ['invoice', 'AR-INV-2', 1100.5],
      ['receipt', 'AR-RCPT-2', 1000.5],
    ])
    expect(s.total_debit).toBe(500.5)
    expect(s.total_credit).toBe(100)
    expect(s.closing_balance).toBe(1000.5)
  })

  it('no date range = whole history, cancelled receipts excluded', () => {
    const s = buildCustomerStatement(invoices, receipts)
    expect(s.opening_balance).toBe(0)
    expect(s.closing_balance).toBe(1000 + 500.5 - 400 - 100 - 50)
    expect(s.lines.some((l) => l.ref === 'AR-RCPT-3')).toBe(false)
  })
})

describe('buildCustomerStatement — write-offs', () => {
  const invoices = [{ id: 'i1', doc_number: 'AR-INV-1', doc_date: '2026-08-10', total_amount: 1000 }]
  const receipts = [{ id: 'p1', receipt_no: 'AR-RCPT-1', receipt_date: '2026-09-01', amount: 400, status: 'posted' }]
  const writeOffs = [
    { id: 'w1', write_off_no: 'AR-WO-1', write_off_date: '2026-09-15', amount: 100, reason: 'Disputed', status: 'posted' },
    { id: 'w2', write_off_no: 'AR-WO-2', write_off_date: '2026-10-15', amount: 500, reason: 'Gone', status: 'posted' },
    { id: 'w3', write_off_no: 'AR-WO-3', write_off_date: '2026-10-16', amount: 999, status: 'reversed' },
  ]

  it('posted write-offs are credit lines; reversed ones are excluded', () => {
    const s = buildCustomerStatement(invoices, receipts, null, null, writeOffs)
    expect(s.lines.map((l) => [l.type, l.ref, l.debit, l.credit, l.balance])).toEqual([
      ['opening', '', 0, 0, 0],
      ['invoice', 'AR-INV-1', 1000, 0, 1000],
      ['receipt', 'AR-RCPT-1', 0, 400, 600],
      ['write_off', 'AR-WO-1', 0, 100, 500],
      ['write_off', 'AR-WO-2', 0, 500, 0],
    ])
    expect(s.lines[3].description).toBe('Bad debt write-off — Disputed')
    expect(s).toMatchObject({ total_credit: 1000, total_received: 400, total_written_off: 600, closing_balance: 0 })
  })

  it('write-offs before dateFrom fold into the opening balance', () => {
    const s = buildCustomerStatement(invoices, receipts, '2026-10-01', '2026-10-31', writeOffs)
    expect(s.opening_balance).toBe(500)
    expect(s.total_written_off).toBe(500)
    expect(s.total_received).toBe(0)
    expect(s.closing_balance).toBe(0)
  })

  it('without write-offs the credit total is receipts only', () => {
    const s = buildCustomerStatement(invoices, receipts)
    expect(s).toMatchObject({ total_credit: 400, total_received: 400, total_written_off: 0, closing_balance: 600 })
  })
})

describe('checkWriteOff', () => {
  it('accepts 0 < amount <= balance with a reason', () => {
    expect(checkWriteOff({ amount: 100, balance: 100, reason: 'x', date: '2026-10-28' })).toEqual([])
    expect(checkWriteOff({ amount: '0.01', balance: 100, reason: 'x' })).toEqual([])
  })

  it('rejects bad amounts, missing reason/date and closed invoices', () => {
    expect(checkWriteOff({ amount: 100.01, balance: 100, reason: 'x' })[0]).toMatch(/exceed the open balance \(100\.00\)/)
    expect(checkWriteOff({ amount: 0, balance: 100, reason: 'x' })[0]).toMatch(/greater than zero/)
    expect(checkWriteOff({ amount: '', balance: 100, reason: 'x' })[0]).toMatch(/greater than zero/)
    expect(checkWriteOff({ amount: -5, balance: 100, reason: 'x' })[0]).toMatch(/greater than zero/)
    expect(checkWriteOff({ amount: 10, balance: 100, reason: '  ' })).toEqual(['A reason is required.'])
    expect(checkWriteOff({ amount: 10, balance: 100, reason: 'x', date: '' })).toEqual(['Write-off date is required.'])
    expect(checkWriteOff({ amount: 10, balance: 0, reason: 'x' })).toEqual(['Nothing is open on this invoice.'])
  })

  it('compares in cents (0.1 + 0.2 == 0.3)', () => {
    expect(checkWriteOff({ amount: 0.1 + 0.2, balance: 0.3, reason: 'x' })).toEqual([])
  })
})

describe('computeArControl', () => {
  const open = [
    { id: 'a', status: 'outstanding', balance: 300 },
    { id: 'b', status: 'partial', total_amount: 200, paid_amount: 50 },
  ]

  it('reconciled when sub-ledger == GL', () => {
    const c = computeArControl(450, open, [])
    expect(c).toMatchObject({ open_receivables_total: 450, ledger_balance: 450, difference: 0, unposted_pos_credit_total: 0, reconciled: true })
  })

  it('unposted POS credit (gl_posted_at NULL) explains the difference by its full total', () => {
    const unposted = [
      { id: 'p', source: 'pos_credit', gl_posted_at: null, status: 'partial', total_amount: 100 },
      { id: 'q', source: 'pos_credit', gl_posted_at: '2026-10-01T00:00:00Z', status: 'outstanding', total_amount: 999 },
      { id: 'm', source: 'manual', gl_posted_at: null, status: 'outstanding', total_amount: 999 },
    ]
    const c = computeArControl(350, open, unposted)
    expect(c.difference).toBe(100)
    expect(c.unposted_pos_credit_total).toBe(100)
    expect(c.unexplained_difference).toBe(0)
    expect(c.reconciled).toBe(true)
  })

  it('flags an unexplained difference', () => {
    const c = computeArControl('400.01', open, [])
    expect(c.difference).toBe(49.99)
    expect(c.reconciled).toBe(false)
  })
})

describe('customers', () => {
  it('display name falls back to code / phone', () => {
    expect(customerDisplayName({ first_name: 'Ann', last_name: 'Lee' })).toBe('Ann Lee')
    expect(customerDisplayName({ customer_code: 'C-1' })).toBe('C-1')
    expect(customerDisplayName(null)).toBe('Walk-in / Unregistered')
  })

  it('summarizes open balance per customer, largest first', () => {
    const rows = [
      { id: '1', customer_id: 'c1', status: 'outstanding', balance: 10, due_date: '2026-10-01', customers: { first_name: 'A' } },
      { id: '2', customer_id: 'c1', status: 'partial', balance: 5, due_date: '2026-12-01', customers: { first_name: 'A' } },
      { id: '3', customer_id: 'c2', status: 'outstanding', balance: 50, due_date: '2026-12-01', customers: { first_name: 'B' } },
      { id: '4', customer_id: 'c2', status: 'paid', balance: 0, customers: { first_name: 'B' } },
    ]
    const out = summarizeCustomerBalances(rows, TODAY)
    expect(out.map((r) => [r.customer_id, r.open_count, r.balance, r.overdue, r.oldest_due])).toEqual([
      ['c2', 1, 50, 0, '2026-12-01'],
      ['c1', 2, 15, 10, '2026-10-01'],
    ])
  })
})
