// ═══════════════════════════════════════════════════════════════════════════════
// Supplier Payments: bill selection (#140)
//   • payable gate: only posted / partial_paid bills with balance_due > 0
//   • oldest-first deterministic ordering
//   • oldest-first auto-allocation in cents, clamped per line
//   • latest-request-wins guard (supplier switch race)
//   • empty-state summary of draft bills
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

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
  getOpenInvoicesForSupplier,
  getUnpostedBillsForSupplier,
  getSupplierBillsForPayment,
  allocateOldestFirst,
  clampAllocation,
  sumAmounts,
  compareBillsOldestFirst,
  createLatestRequestGuard,
  describeUnpostedBills,
  isPayableBill,
  PAYABLE_AP_INVOICE_STATUSES,
} from 'src/services/procurementService'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
  auth.state = { currentBranch: { id: 'br-1', company_id: 'co-1' }, user: { id: 'u-1' } }
})

const bill = (id: string, doc_date: string | null, balance: number, extra: Record<string, unknown> = {}) => ({
  id,
  doc_number: `AP-${id}`,
  doc_date,
  total_amount: balance,
  paid_amount: 0,
  balance_due: balance,
  status: 'posted',
  ...extra,
})

describe('payable gate', () => {
  it('payable statuses are exactly posted + partial_paid (drafts never payable)', () => {
    expect([...PAYABLE_AP_INVOICE_STATUSES]).toEqual(['posted', 'partial_paid'])
  })

  it('getOpenInvoicesForSupplier filters status, balance > 0, supplier and company server-side', async () => {
    m.queue('ap_invoices', { data: [] })
    await getOpenInvoicesForSupplier('sup-1')
    const q = m.on('ap_invoices')[0]
    expect(call(q, 'in')?.args).toEqual(['status', ['posted', 'partial_paid']])
    expect(call(q, 'gt')?.args).toEqual(['balance_due', 0])
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['supplier_id', 'sup-1'],
      ['company_id', 'co-1'],
    ])
    // GRN number joined for display
    expect(String(call(q, 'select')?.args[0])).toContain('goods_receipts(id, doc_number)')
  })

  it('orders server-side by doc_date, then due_date, then doc_number', async () => {
    m.queue('ap_invoices', { data: [] })
    await getOpenInvoicesForSupplier('sup-1')
    expect(calls(m.on('ap_invoices')[0], 'order').map((c) => c.args[0])).toEqual(['doc_date', 'due_date', 'doc_number'])
  })

  it('maps the GRN number and re-sorts oldest first deterministically', async () => {
    m.queue('ap_invoices', {
      data: [
        bill('c', '2026-10-02', 50, { doc_number: 'AP-002' }),
        bill('b', '2026-10-01', 50, { doc_number: 'AP-009', goods_receipts: { id: 'g9', doc_number: 'GRN-9' } }),
        bill('a', '2026-10-01', 50, { doc_number: 'AP-001', goods_receipts: [{ id: 'g1', doc_number: 'GRN-1' }] }),
      ],
    })
    const rows = await getOpenInvoicesForSupplier('sup-1')
    expect(rows.map((r) => [r.id, r.grn_number])).toEqual([
      ['a', 'GRN-1'],
      ['b', 'GRN-9'],
      ['c', null],
    ])
  })

  it('isPayableBill rejects draft / approved / cancelled / paid / zero-balance / unknown status', () => {
    expect(isPayableBill({ status: 'posted', balance_due: 10 })).toBe(true)
    expect(isPayableBill({ status: 'partial_paid', balance_due: '0.01' })).toBe(true)
    expect(isPayableBill({ status: 'posted', balance: 5 })).toBe(true) // aging row shape
    for (const status of ['draft', 'approved', 'cancelled', 'paid', undefined, null]) {
      expect(isPayableBill({ status: status as any, balance_due: 100 })).toBe(false)
    }
    expect(isPayableBill({ status: 'posted', balance_due: 0 })).toBe(false)
    expect(isPayableBill({ status: 'posted', balance_due: 0.004 })).toBe(false)
    expect(isPayableBill(null)).toBe(false)
  })
})

describe('compareBillsOldestFirst', () => {
  it('doc_date → due_date (undated last) → doc_number → id', () => {
    const rows = [
      { id: '5', doc_date: null, doc_number: 'A' },
      { id: '4', doc_date: '2026-10-01', due_date: null, doc_number: 'A' },
      { id: '3', doc_date: '2026-10-01', due_date: '2026-10-31', doc_number: 'B' },
      { id: '2', doc_date: '2026-10-01', due_date: '2026-10-31', doc_number: 'A' },
      { id: '1', doc_date: '2026-10-01', due_date: '2026-10-31', doc_number: 'A' },
    ]
    expect([...rows].sort(compareBillsOldestFirst).map((r) => r.id)).toEqual(['1', '2', '3', '4', '5'])
  })
})

describe('allocateOldestFirst', () => {
  const bills = [bill('new', '2026-10-20', 300), bill('old', '2026-09-01', 100.1), bill('mid', '2026-10-01', 200.2)]

  it('settles the oldest bills first and part-pays the next one', () => {
    const r = allocateOldestFirst(bills, 250)
    expect(r.allocations).toEqual([
      { invoice_id: 'old', amount: 100.1 },
      { invoice_id: 'mid', amount: 149.9 },
    ])
    expect(r).toMatchObject({ allocated: 250, unallocated: 0 })
  })

  it('exact total settles everything (cents, no float drift)', () => {
    const r = allocateOldestFirst(bills, 600.3)
    expect(r.allocations.map((a) => a.amount)).toEqual([100.1, 200.2, 300])
    expect(r.unallocated).toBe(0)
    expect(sumAmounts(r.allocations.map((a) => a.amount))).toBe(600.3)
  })

  it('never allocates above a balance; the excess is reported as unallocated', () => {
    const r = allocateOldestFirst(bills, 1000)
    expect(r.allocations.map((a) => a.amount)).toEqual([100.1, 200.2, 300])
    expect(r).toMatchObject({ allocated: 600.3, unallocated: 399.7 })
  })

  it('skips zero-balance bills; zero / negative / invalid amounts allocate nothing', () => {
    expect(allocateOldestFirst([bill('z', '2026-01-01', 0), bill('x', '2026-02-01', 10)], 5).allocations).toEqual([
      { invoice_id: 'x', amount: 5 },
    ])
    for (const amt of [0, -5, 'abc', null, undefined]) {
      expect(allocateOldestFirst(bills, amt).allocations).toEqual([])
    }
  })

  it('does not mutate or depend on the input order', () => {
    const copy = JSON.parse(JSON.stringify(bills))
    const a = allocateOldestFirst(bills, 150)
    const b = allocateOldestFirst([...bills].reverse(), 150)
    expect(a).toEqual(b)
    expect(bills).toEqual(copy)
  })
})

describe('clampAllocation (manual per-line edits)', () => {
  it('clamps to [0, balance] and rounds to cents', () => {
    expect(clampAllocation(500, 120.5)).toBe(120.5)
    expect(clampAllocation(-3, 120.5)).toBe(0)
    expect(clampAllocation('', 120.5)).toBe(0)
    expect(clampAllocation(10.006, 120.5)).toBe(10.01)
    expect(clampAllocation(50, 0)).toBe(0)
  })
})

describe('createLatestRequestGuard (supplier switch race)', () => {
  it('only the latest request is current; invalidate drops everything in flight', () => {
    const g = createLatestRequestGuard()
    const a = g.begin()
    const b = g.begin()
    expect(g.isCurrent(a)).toBe(false)
    expect(g.isCurrent(b)).toBe(true)
    g.invalidate()
    expect(g.isCurrent(b)).toBe(false)
  })

  it('a slow response for supplier A is discarded after switching to B', async () => {
    const g = createLatestRequestGuard()
    let shown: string | null = null
    const deferred = () => {
      let resolve!: (v: string) => void
      const p = new Promise<string>((r) => (resolve = r))
      return { p, resolve }
    }
    const reqA = deferred()
    const reqB = deferred()
    const load = async (req: { p: Promise<string> }) => {
      const t = g.begin()
      const v = await req.p
      if (g.isCurrent(t)) shown = v
    }
    const la = load(reqA) // user picks A
    const lb = load(reqB) // …then B before A returns
    reqB.resolve('bills of B')
    await lb
    reqA.resolve('bills of A') // A lands last
    await la
    expect(shown).toBe('bills of B')
  })
})

describe('empty state: unposted (draft) bills', () => {
  it('getUnpostedBillsForSupplier counts draft/approved bills with an outstanding amount', async () => {
    m.queue('ap_invoices', {
      data: [
        bill('d1', '2026-10-01', 1000.1, { status: 'draft' }),
        bill('d2', '2026-10-02', 2000.2, { status: 'approved' }),
        bill('d3', '2026-10-03', 0, { status: 'draft' }),
      ],
    })
    const s = await getUnpostedBillsForSupplier('sup-1')
    expect(s).toMatchObject({ count: 2, total: 3000.3 })
    const q = m.on('ap_invoices')[0]
    expect(call(q, 'in')?.args).toEqual(['status', ['draft', 'approved']])
    expect(calls(q, 'eq').map((c) => c.args)).toEqual([
      ['supplier_id', 'sup-1'],
      ['company_id', 'co-1'],
    ])
  })

  it('getSupplierBillsForPayment never lists drafts as payable and survives a failing summary', async () => {
    m.queue('ap_invoices', { data: [bill('p1', '2026-10-01', 10)] }, { error: { message: 'boom' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await getSupplierBillsForPayment('sup-1')
    warn.mockRestore()
    expect(r.payable.map((b) => b.id)).toEqual(['p1'])
    expect(r.unposted).toBeNull()
  })

  it('describeUnpostedBills explains drafts, with a plain fallback', () => {
    const fmt = (v: number) => `LKR ${v.toFixed(2)}`
    expect(describeUnpostedBills({ count: 3, total: 4500 }, fmt)).toEqual({
      title: '3 bills (LKR 4500.00) are still draft',
      detail: expect.stringContaining('must be posted (Procurement → AP Invoices) before payment'),
    })
    expect(describeUnpostedBills({ count: 1, total: 10 }, fmt).title).toBe('1 bill (LKR 10.00) is still draft')
    expect(describeUnpostedBills({ count: 0, total: 0 }, fmt)).toEqual({
      title: 'No posted bills with a balance due for this supplier',
      detail: null,
    })
    expect(describeUnpostedBills(null).detail).toBeNull()
  })
})
