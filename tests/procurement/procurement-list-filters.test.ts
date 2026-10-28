// ═══════════════════════════════════════════════════════════════════════════════
// Procurement list filters & data-integrity helpers (audit 2026-10-28)
//   • lists paginate past the PostgREST 1000-row cap (.range pages)
//   • "Unpaid" AP filter includes partial_paid / approved bills
//   • local (UTC+5:30-safe) date keys — never toISOString()
//   • client-side list filter: exact status, string date range, search
//   • supplier payment report total counts POSTED payments only
//   • purchase-return line validation (qty ≤ received, ≥ 1 line)
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
const auth = vi.hoisted(() => ({
  state: { currentBranch: { id: 'br-1', company_id: 'co-1' } as any, user: { id: 'u-1' } as any },
}))
vi.mock('src/stores/auth', () => ({ useAuthStore: () => auth.state }))
vi.mock('src/services/inventoryService', () => ({ fetchDocumentById: vi.fn() }))

import {
  PROC_PAGE_SIZE,
  UNPAID_AP_INVOICE_STATUSES,
  fetchAllProcRows,
  filterProcRows,
  getAPAging,
  getSupplierStatement,
  listInvoices,
  listPayments,
  localDateKey,
  sumPostedPayments,
  validateReturnLines,
} from 'src/services/procurementService'

const rows = (n: number, prefix = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))

beforeEach(() => sb.mock.reset())
afterEach(() => vi.useRealTimers())

describe('pagination past 1000 rows', () => {
  it('fetchAllProcRows keeps paging until a short page', async () => {
    sb.mock.queue('ap_invoices', { data: rows(3, 'a') }, { data: rows(3, 'b') }, { data: rows(1, 'c') })
    const out = await fetchAllProcRows(() => sb.mock.client.from('ap_invoices').select('id'), 3)
    expect(out).toHaveLength(7)
    const ranges = sb.mock.on('ap_invoices').map((q: any) => call(q, 'range')?.args)
    expect(ranges).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ])
  })

  it('listInvoices returns > PROC_PAGE_SIZE bills (no silent truncation)', async () => {
    sb.mock.queue('ap_invoices', { data: rows(PROC_PAGE_SIZE, 'p1') }, { data: rows(237, 'p2') })
    const out = await listInvoices()
    expect(out).toHaveLength(PROC_PAGE_SIZE + 237)
    const q = sb.mock.on('ap_invoices')[0]
    // deterministic order for stable paging: doc_date desc, then id
    expect(calls(q, 'order').map((c) => c.args[0])).toEqual(['doc_date', 'id'])
    expect(call(q, 'eq')?.args).toEqual(['company_id', 'co-1'])
  })

  it('propagates page errors', async () => {
    sb.mock.queue('supplier_payments', { error: { message: 'boom' } })
    await expect(listPayments()).rejects.toThrow('boom')
  })
})

describe('Unpaid AP filter', () => {
  it('includes partial_paid and approved bills, balance_due > 0', async () => {
    sb.mock.queue('ap_invoices', { data: [] })
    await listInvoices({ status: 'UNPAID' })
    const q = sb.mock.on('ap_invoices')[0]
    expect(call(q, 'in')?.args).toEqual(['status', [...UNPAID_AP_INVOICE_STATUSES]])
    expect(UNPAID_AP_INVOICE_STATUSES).toEqual(expect.arrayContaining(['partial_paid', 'posted', 'approved', 'draft']))
    expect(call(q, 'gt')?.args).toEqual(['balance_due', 0])
  })

  it('a concrete status is an exact eq filter', async () => {
    sb.mock.queue('ap_invoices', { data: [] })
    await listInvoices({ status: 'partial_paid', from_date: '2026-10-01', to_date: '2026-10-28' })
    const q = sb.mock.on('ap_invoices')[0]
    expect(calls(q, 'eq').map((c) => c.args)).toContainEqual(['status', 'partial_paid'])
    expect(call(q, 'gte')?.args).toEqual(['doc_date', '2026-10-01'])
    expect(call(q, 'lte')?.args).toEqual(['doc_date', '2026-10-28'])
  })
})

describe('localDateKey (Sri Lanka UTC+5:30)', () => {
  it('uses local calendar fields, not UTC', () => {
    // 00:30 local on 28 Oct — toISOString() would give the 27th in LK.
    const d = new Date(2026, 9, 28, 0, 30, 0)
    expect(localDateKey(d)).toBe('2026-10-28')
  })
  it('zero-pads month and day', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('AP aging / statement', () => {
  it('aging buckets by whole days from local today', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 28, 1, 0, 0)) // 01:00 local
    sb.mock.queue('ap_invoices', {
      data: [
        { id: '1', due_date: '2026-10-28' },
        { id: '2', due_date: '2026-10-27' },
        { id: '3', due_date: '2026-08-01' },
      ],
    })
    const out = await getAPAging()
    expect(out.map((r: any) => [r.daysOverdue, r.bucket])).toEqual([
      [0, 'current'],
      [1, '1-30'],
      [88, '61-90'],
    ])
  })

  it('statement totals coerce numeric strings (no string concatenation)', async () => {
    sb.mock.queue('ap_ledger', {
      data: [
        { id: '1', debit: '0', credit: '1500.50' },
        { id: '2', debit: '500.25', credit: '0' },
      ],
    })
    const out = await getSupplierStatement('s-1', '2026-10-01', '2026-10-31')
    expect(out.totalCredit).toBeCloseTo(1500.5)
    expect(out.totalDebit).toBeCloseTo(500.25)
    expect(out.balance).toBeCloseTo(1000.25)
  })
})

describe('filterProcRows', () => {
  const data = [
    { id: '1', doc_number: 'PAY-001', status: 'posted', supplier_id: 's1', doc_date: '2026-10-01', suppliers: { name: 'Ceylon Foods' } },
    { id: '2', doc_number: 'PAY-002', status: 'partial_paid', supplier_id: 's2', doc_date: '2026-10-15', suppliers: { name: 'Lanka Dairy' } },
    { id: '3', doc_number: 'PAY-003', status: 'paid', supplier_id: 's1', doc_date: '2026-10-28', suppliers: { name: 'Ceylon Foods' } },
  ]
  const search = [(r: any) => r.doc_number, (r: any) => r.suppliers?.name]

  it('status is an exact match (paid ≠ partial_paid)', () => {
    expect(filterProcRows(data, { status: 'paid' }, search).map((r) => r.id)).toEqual(['3'])
  })
  it('date range is inclusive on both ends (string compare, no TZ shift)', () => {
    expect(filterProcRows(data, { from_date: '2026-10-15', to_date: '2026-10-28' }, search).map((r) => r.id)).toEqual(['2', '3'])
    expect(filterProcRows(data, { to_date: '2026-10-01' }, search).map((r) => r.id)).toEqual(['1'])
  })
  it('supplier + case-insensitive search', () => {
    expect(filterProcRows(data, { supplier_id: 's1', search: 'pay-003' }, search).map((r) => r.id)).toEqual(['3'])
    expect(filterProcRows(data, { search: 'dairy' }, search).map((r) => r.id)).toEqual(['2'])
  })
  it('empty filter returns everything', () => {
    expect(filterProcRows(data, { search: '  ', status: null }, search)).toHaveLength(3)
  })
})

describe('sumPostedPayments', () => {
  it('ignores draft and cancelled payments; sums in cents', () => {
    expect(
      sumPostedPayments([
        { status: 'posted', total_amount: '0.10' },
        { status: 'posted', total_amount: 0.2 },
        { status: 'cancelled', total_amount: 1000 },
        { status: 'draft', total_amount: 500 },
      ]),
    ).toBe(0.3)
  })
})

describe('validateReturnLines', () => {
  it('rejects qty above the received GRN qty', () => {
    expect(validateReturnLines([{ item_id: 'i1', item_name: 'Rice', quantity: 6, max_qty: 5 }])).toMatch(/exceeds/)
  })
  it('requires at least one line with qty > 0', () => {
    expect(validateReturnLines([{ item_id: 'i1', quantity: 0, max_qty: 5 }])).toMatch(/at least one/)
  })
  it('rejects negative qty and lines without an item', () => {
    expect(validateReturnLines([{ item_id: 'i1', quantity: -1 }])).toMatch(/Invalid/)
    expect(validateReturnLines([{ item_id: null, quantity: 2 }])).toMatch(/needs an item/)
  })
  it('accepts partial returns (zero-qty lines are skipped by the caller)', () => {
    expect(
      validateReturnLines([
        { item_id: 'i1', quantity: 2, max_qty: 5 },
        { item_id: 'i2', quantity: 0, max_qty: 3 },
      ]),
    ).toBeNull()
  })
})
