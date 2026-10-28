// ═══════════════════════════════════════════════════════════════════════════════
// Finance → Accounts Payable: only POSTED bills are payable (#140)
// Draft/approved bills were never credited to AP; listing them as payables let
// AP_INV-2026-000118 / -000479 be paid with posted_at NULL.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, call, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
vi.mock('src/core/api/ApiClient', () => ({ api: {} }))

import {
  fetchApInvoices,
  fetchPayableAging,
  fetchUnpostedApSummary,
  AP_PAYABLE_STATUSES,
} from 'src/services/financeService'
import { PAYABLE_AP_INVOICE_STATUSES, compareBillsOldestFirst } from 'src/services/procurementService'

vi.mock('src/stores/auth', () => ({ useAuthStore: () => ({}) }))
vi.mock('src/services/inventoryService', () => ({ fetchDocumentById: vi.fn() }))

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
})

describe('fetchApInvoices gate', () => {
  it('uses the same payable rule as Procurement', () => {
    expect([...AP_PAYABLE_STATUSES]).toEqual([...PAYABLE_AP_INVOICE_STATUSES])
  })

  it('lists only posted / partial_paid bills with a balance, oldest first', async () => {
    m.queue('ap_invoices', { data: [] })
    await fetchApInvoices()
    const q = m.on('ap_invoices')[0]
    expect(call(q, 'in')?.args).toEqual(['status', ['posted', 'partial_paid']])
    expect(call(q, 'gt')?.args).toEqual(['balance_due', 0])
    // the old NOT IN (cancelled, paid) let drafts through
    expect(call(q, 'not')).toBeUndefined()
    expect(calls(q, 'order').map((c) => c.args)).toEqual([
      ['doc_date', { ascending: true }],
      ['doc_number', { ascending: true }],
      ['id', { ascending: true }],
    ])
  })

  it('aging rows carry status/doc_date so the page can re-check and sort them', async () => {
    m.queue('ap_invoices', {
      data: [
        {
          id: 'i1',
          supplier_id: 's1',
          doc_number: 'AP-1',
          doc_date: '2026-10-01',
          total_amount: 100,
          paid_amount: 40,
          balance_due: 60,
          status: 'partial_paid',
          suppliers: { name: 'Acme' },
        },
      ],
    })
    const { data } = await fetchPayableAging()
    expect(data[0]).toMatchObject({ id: 'i1', status: 'partial_paid', doc_date: '2026-10-01', balance: 60, debit: 40 })
  })

  it('oldest-first allocation order is independent of click order', () => {
    const clicked = [
      { id: 'b', doc_date: '2026-10-05', doc_number: 'AP-5' },
      { id: 'a', doc_date: '2026-10-01', doc_number: 'AP-1' },
    ]
    expect([...clicked].sort(compareBillsOldestFirst).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('fetchUnpostedApSummary', () => {
  it('counts draft/approved bills with an outstanding amount (cents-exact)', async () => {
    m.queue('ap_invoices', {
      data: [
        { id: '1', total_amount: 0.1, paid_amount: 0, balance_due: null },
        { id: '2', total_amount: 0.2, paid_amount: 0, balance_due: 0.2 },
        { id: '3', total_amount: 50, paid_amount: 50, balance_due: 0 },
      ],
    })
    const r = await fetchUnpostedApSummary()
    expect(r).toEqual({ count: 2, total: 0.3, error: null })
    expect(call(m.on('ap_invoices')[0], 'in')?.args).toEqual(['status', ['draft', 'approved']])
  })

  it('returns zero with the error on failure', async () => {
    m.queue('ap_invoices', { error: { message: 'denied' } })
    const r = await fetchUnpostedApSummary()
    expect(r.count).toBe(0)
    expect(r.error).toEqual({ message: 'denied' })
  })
})
