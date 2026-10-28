// ═══════════════════════════════════════════════════════════════════════════════
// Finance Payables: one payment settling many bills of one supplier
//   • per-bill allocation (partial allowed, over-allocation rejected / clamped)
//   • payment amount must equal the sum of allocations (cents)
//   • mixed suppliers and unpayable bills rejected
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'

vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  return { supabase: createSupabaseMock().client }
})
vi.mock('src/stores/auth', () => ({
  useAuthStore: () => ({ currentBranch: { id: 'br-1', company_id: 'co-1' }, user: { id: 'u-1' } }),
}))
vi.mock('src/services/inventoryService', () => ({ fetchDocumentById: vi.fn() }))

import {
  checkPaymentAllocations,
  allocateOldestFirst,
  clampAllocation,
  sumAmounts,
  type PaymentAllocationLine,
} from 'src/services/procurementService'

const line = (o: Partial<PaymentAllocationLine> & { id: string }): PaymentAllocationLine => ({
  supplier_id: 'sup-1',
  status: 'posted',
  balance_due: 100,
  selected: true,
  allocation: 0,
  ...o,
})

describe('checkPaymentAllocations', () => {
  it('accepts full + partial allocations when amount equals the sum', () => {
    const r = checkPaymentAllocations(
      [
        line({ id: 'a', balance_due: 100, allocation: 100 }),
        line({ id: 'b', balance_due: 250.5, allocation: 40.25, status: 'partial_paid' }),
      ],
      140.25,
    )
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.allocations).toEqual([
      { invoice_id: 'a', amount: 100 },
      { invoice_id: 'b', amount: 40.25 },
    ])
    expect(r.allocated).toBe(140.25)
    expect(r.difference).toBe(0)
    expect(r.selectedCount).toBe(2)
  })

  it('works in cents (no float drift: 0.1 + 0.2 == 0.3)', () => {
    const r = checkPaymentAllocations(
      [line({ id: 'a', allocation: 0.1 }), line({ id: 'b', allocation: 0.2 })],
      0.3,
    )
    expect(r.valid).toBe(true)
    expect(r.allocated).toBe(0.3)
  })

  it('rounds amounts to cents', () => {
    const r = checkPaymentAllocations([line({ id: 'a', allocation: 10.004 })], 10.001)
    expect(r.valid).toBe(true)
    expect(r.allocations).toEqual([{ invoice_id: 'a', amount: 10 }])
    expect(r.amount).toBe(10)
  })

  it('rejects an allocation above the bill balance (no silent clamp)', () => {
    const r = checkPaymentAllocations([line({ id: 'a', balance_due: 50, allocation: 50.01 })], 50.01)
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/exceeds its balance due/)
    expect(r.allocations).toEqual([])
  })

  it('reports the difference when amount != allocated (both directions)', () => {
    const under = checkPaymentAllocations([line({ id: 'a', allocation: 60 })], 80)
    expect(under.valid).toBe(false)
    expect(under.difference).toBe(20)
    expect(under.errors.join(' ')).toMatch(/must equal/)

    const over = checkPaymentAllocations([line({ id: 'a', allocation: 60 })], 59.99)
    expect(over.valid).toBe(false)
    expect(over.difference).toBe(-0.01)
  })

  it('ignores unticked lines and ticked lines with 0', () => {
    const r = checkPaymentAllocations(
      [
        line({ id: 'a', allocation: 30 }),
        line({ id: 'b', allocation: 0 }),
        line({ id: 'c', allocation: 70, selected: false }),
      ],
      30,
    )
    expect(r.valid).toBe(true)
    expect(r.allocations.map((a) => a.invoice_id)).toEqual(['a'])
    expect(r.selectedCount).toBe(2)
  })

  it('rejects bills from mixed suppliers', () => {
    const r = checkPaymentAllocations(
      [line({ id: 'a', allocation: 10 }), line({ id: 'b', allocation: 10, supplier_id: 'sup-2' })],
      20,
    )
    expect(r.valid).toBe(false)
    expect(r.errors.join(' ')).toMatch(/different suppliers/)
  })

  it('rejects draft / paid / zero-balance bills', () => {
    for (const bad of [{ status: 'draft' }, { status: 'approved' }, { status: 'paid' }, { balance_due: 0 }]) {
      const r = checkPaymentAllocations([line({ id: 'a', allocation: 10, ...bad })], 10)
      expect(r.valid).toBe(false)
    }
  })

  it('rejects negative / invalid amounts, nothing allocated, zero payment', () => {
    expect(checkPaymentAllocations([line({ id: 'a', allocation: -5 })], 0).valid).toBe(false)
    expect(checkPaymentAllocations([line({ id: 'a', allocation: 'abc' })], 0).valid).toBe(false)
    expect(checkPaymentAllocations([line({ id: 'a', allocation: 0 })], 0).errors.join(' ')).toMatch(/at least one bill/)
    expect(checkPaymentAllocations([], 10).valid).toBe(false)
  })
})

describe('dialog helpers used by Finance Payables', () => {
  const bills = [
    { id: 'new', balance_due: 300, doc_date: '2026-03-01' },
    { id: 'old', balance_due: 100, doc_date: '2026-01-01' },
    { id: 'mid', balance_due: 200, doc_date: '2026-02-01' },
  ]

  it('typing a total auto-allocates oldest-first with a partial last bill', () => {
    const r = allocateOldestFirst(bills, 250)
    expect(r.allocations).toEqual([
      { invoice_id: 'old', amount: 100 },
      { invoice_id: 'mid', amount: 150 },
    ])
    expect(r.unallocated).toBe(0)
  })

  it('a total above the open balance leaves an unallocated remainder', () => {
    const r = allocateOldestFirst(bills, 650.5)
    expect(r.allocated).toBe(600)
    expect(r.unallocated).toBe(50.5)
  })

  it('per-line edits are clamped to [0, balance] in cents', () => {
    expect(clampAllocation(150, 100)).toBe(100)
    expect(clampAllocation(-1, 100)).toBe(0)
    expect(clampAllocation(33.333, 100)).toBe(33.33)
    expect(sumAmounts([33.33, 33.33, 33.34])).toBe(100)
  })
})
