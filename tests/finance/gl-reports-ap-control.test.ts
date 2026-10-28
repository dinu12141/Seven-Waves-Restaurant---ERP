// ═══════════════════════════════════════════════════════════════════════════════
// Expenses / VAT read from the GL (finance_cashbook_entries), AP control vs 2000,
// AP aging by days past due, and paging past PostgREST's 1000-row cap.
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
  buildExpenseReport,
  buildVatReport,
  sumApBillTax,
  fetchExpenseReport,
  fetchVatReport,
} from 'src/services/finance/glReports'
import {
  computeApControl,
  fetchApControl,
  fetchApInvoices,
  apAgingBucket,
  apDaysPastDue,
  AP_PAGE_SIZE,
} from 'src/services/financeService'
import { listReceivables, AR_PAGE_SIZE } from 'src/services/finance/arService'

let m: ReturnType<typeof createSupabaseMock>
beforeEach(() => {
  m = sb.mock
  m.reset()
})

const LEDGERS = [
  { id: 'L1', ledger_code: '7001', ledger_name: 'Electricity', ledger_type: 'expense', account_group: 'Admin and Operation Expenses' },
  { id: 'L2', ledger_code: '5000', ledger_name: 'COGS', ledger_type: 'expense', account_group: 'Cost of Sales' },
]

describe('buildExpenseReport', () => {
  it('nets debits − credits per ledger, cents-exact, newest first', () => {
    const r = buildExpenseReport(LEDGERS, [
      { id: 'e1', ledger_id: 'L1', entry_date: '2026-10-01', debit_amount: '0.1', credit_amount: 0 },
      { id: 'e2', ledger_id: 'L1', entry_date: '2026-10-03', debit_amount: '0.2', credit_amount: 0 },
      { id: 'e3', ledger_id: 'L1', entry_date: '2026-10-02', debit_amount: 0, credit_amount: '0.05' },
      { id: 'x', ledger_id: 'OTHER', entry_date: '2026-10-02', debit_amount: 999 },
    ])
    expect(r.total).toBe(0.25)
    expect(r.totalCredit).toBe(0.05)
    expect(r.rows.map((x) => x.id)).toEqual(['e2', 'e3', 'e1'])
    expect(r.byLedger).toEqual([
      expect.objectContaining({ ledger_code: '7001', debit: 0.3, credit: 0.05, net: 0.25, count: 3 }),
    ])
  })
})

describe('fetchExpenseReport', () => {
  it('excludes Cost of Sales by default and filters GL entries by expense ledgers + period', async () => {
    m.queue('finance_ledgers', { data: LEDGERS })
    m.queue('finance_cashbook_entries', {
      data: [{ id: 'e1', ledger_id: 'L1', entry_date: '2026-10-05', debit_amount: 500, credit_amount: 0 }],
    })
    const r = await fetchExpenseReport({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(r.total).toBe(500)
    expect(r.ledgers).toHaveLength(2)
    const led = m.on('finance_ledgers')[0]
    expect(call(led, 'eq')?.args).toEqual(['ledger_type', 'expense'])
    const q = m.on('finance_cashbook_entries')[0]
    expect(call(q, 'in')?.args).toEqual(['ledger_id', ['L1']])
    expect(call(q, 'gte')?.args).toEqual(['entry_date', '2026-10-01'])
    expect(call(q, 'lte')?.args).toEqual(['entry_date', '2026-10-31'])
    expect(call(q, 'range')?.args).toEqual([0, 999])
  })

  it('pages through more than 1000 GL rows', async () => {
    m.queue('finance_ledgers', { data: LEDGERS })
    const page = (n: number, off: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `e${off + i}`, ledger_id: 'L1', entry_date: '2026-10-01', debit_amount: 1 }))
    m.queue('finance_cashbook_entries', { data: page(1000, 0) }, { data: page(5, 1000) })
    const r = await fetchExpenseReport({ includeCostOfSales: true })
    expect(r.rows).toHaveLength(1005)
    expect(r.total).toBe(1005)
    const qs = m.on('finance_cashbook_entries')
    expect(qs).toHaveLength(2)
    expect(call(qs[1], 'range')?.args).toEqual([1000, 1999])
    expect(call(qs[0], 'in')?.args).toEqual(['ledger_id', ['L1', 'L2']])
  })
})

describe('buildVatReport', () => {
  const VAT_LEDGERS = [
    { id: 'O', ledger_code: '2006', ledger_name: 'Output VAT Payable', current_balance: -1800 },
    { id: 'I', ledger_code: '1010', ledger_name: 'Input VAT - Recoverable', current_balance: 300 },
  ]
  it('output = 2006 Cr − Dr, input = 1010 Dr − Cr, net payable, monthly split', () => {
    const r = buildVatReport(VAT_LEDGERS, [
      { id: '1', ledger_id: 'O', entry_date: '2026-09-30', credit_amount: 1000, debit_amount: 0 },
      { id: '2', ledger_id: 'O', entry_date: '2026-10-01', credit_amount: 900, debit_amount: 0 },
      { id: '3', ledger_id: 'O', entry_date: '2026-10-02', credit_amount: 0, debit_amount: 100 }, // refund
      { id: '4', ledger_id: 'I', entry_date: '2026-10-03', credit_amount: 0, debit_amount: 300 },
    ])
    expect(r.outputVat).toBe(1800)
    expect(r.inputVat).toBe(300)
    expect(r.netPayable).toBe(1500)
    expect(r.outputLedgerBalance).toBe(1800)
    expect(r.inputLedgerBalance).toBe(300)
    expect(r.byMonth).toEqual([
      { month: '2026-09', output: 1000, input: 0, net: 1000 },
      { month: '2026-10', output: 800, input: 300, net: 500 },
    ])
    expect(r.rows[0].id).toBe('4')
  })

  it('flags missing VAT ledgers', () => {
    const r = buildVatReport([], [])
    expect(r.outputLedgerFound).toBe(false)
    expect(r.inputLedgerFound).toBe(false)
    expect(r.netPayable).toBe(0)
  })

  it('sums supplier-bill tax that never reached 1010', () => {
    expect(sumApBillTax([{ tax_amount: '0.1' }, { tax_amount: 0.2 }, { tax_amount: 0 }])).toEqual({ count: 2, total: 0.3 })
  })
})

describe('fetchVatReport', () => {
  it('reads 2006 / 1010 from finance_ledgers and their GL movements in the period', async () => {
    m.queue('finance_ledgers', { data: [{ id: 'O', ledger_code: '2006', current_balance: -50 }] })
    m.queue('finance_cashbook_entries', {
      data: [{ id: '1', ledger_id: 'O', entry_date: '2026-10-01', credit_amount: 50, debit_amount: 0 }],
    })
    m.queue('ap_invoices', { data: [{ id: 'b1', tax_amount: 18 }] })
    const r = await fetchVatReport({ dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(call(m.on('finance_ledgers')[0], 'in')?.args).toEqual(['ledger_code', ['2006', '1010']])
    expect(r.outputVat).toBe(50)
    expect(r.inputLedgerFound).toBe(false)
    expect(r.apBillTax).toEqual({ count: 1, total: 18 })
    expect(call(m.on('ap_invoices')[0], 'gte')?.args).toEqual(['doc_date', '2026-10-01'])
  })
})

describe('AP control vs GL 2000', () => {
  it('reconciles when open bills = Σ supplier balance = GL 2000 credit balance', () => {
    const c = computeApControl(
      [{ current_balance: -19124566.26 }],
      [{ balance_due: 19124566.16 }, { balance_due: 0.1 }, { balance_due: 0 }],
      [{ balance: 19124566.26 }],
    )
    expect(c).toMatchObject({
      open_bills_total: 19124566.26,
      open_bills_count: 2,
      ledger_balance: 19124566.26,
      suppliers_balance_total: 19124566.26,
      difference: 0,
      reconciled: true,
    })
  })

  it('reports a difference and a missing ledger', () => {
    expect(computeApControl([{ current_balance: -90 }], [{ balance_due: 100 }], [{ balance: 100 }])).toMatchObject({
      difference: 10,
      reconciled: false,
    })
    expect(computeApControl([], [{ balance_due: 1 }], [{ balance: 1 }])).toMatchObject({ ledger_found: false, reconciled: false })
  })

  it('fetchApControl reuses supplied bills and reads ledger 2000 + suppliers', async () => {
    m.queue('finance_ledgers', { data: [{ id: 'g', current_balance: -60 }] })
    m.queue('suppliers', { data: [{ id: 's', balance: 60 }] })
    const { data } = await fetchApControl([{ balance_due: 60 }])
    expect(m.on('ap_invoices')).toHaveLength(0)
    expect(call(m.on('finance_ledgers')[0], 'eq')?.args).toEqual(['ledger_code', '2000'])
    expect(data?.reconciled).toBe(true)
  })
})

describe('fetchApInvoices paging', () => {
  it('reads every page of open bills', async () => {
    const page = (n: number, off: number) => Array.from({ length: n }, (_, i) => ({ id: `b${off + i}`, balance_due: 1 }))
    m.queue('ap_invoices', { data: page(AP_PAGE_SIZE, 0) }, { data: page(3, AP_PAGE_SIZE) })
    const { data, error } = await fetchApInvoices()
    expect(error).toBeNull()
    expect(data).toHaveLength(AP_PAGE_SIZE + 3)
    const qs = m.on('ap_invoices')
    expect(calls(qs[1], 'range')[0].args).toEqual([AP_PAGE_SIZE, 2 * AP_PAGE_SIZE - 1])
  })
})

describe('AP aging by days past due', () => {
  it('a bill inside its terms is current; buckets by days overdue', () => {
    expect(apDaysPastDue('2026-11-15', '2026-10-28')).toBe(-18)
    expect(apAgingBucket(apDaysPastDue('2026-11-15', '2026-10-28'))).toBe('current')
    expect(apAgingBucket(apDaysPastDue('2026-10-28', '2026-10-28'))).toBe('current')
    expect(apAgingBucket(apDaysPastDue('2026-10-27', '2026-10-28'))).toBe('1-30 days')
    expect(apAgingBucket(apDaysPastDue('2026-08-29', '2026-10-28'))).toBe('31-60 days')
    expect(apAgingBucket(91)).toBe('90+ days')
    expect(apDaysPastDue('2026-03-28', '2026-03-30')).toBe(2) // DST-safe
  })
})

describe('AR paging', () => {
  it('listReceivables reads every page', async () => {
    const page = (n: number, off: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `r${off + i}`, total_amount: 1, paid_amount: 0, balance: 1, status: 'outstanding' }))
    m.queue('customer_receivables', { data: page(AR_PAGE_SIZE, 0) }, { data: page(2, AR_PAGE_SIZE) })
    const rows = await listReceivables()
    expect(rows).toHaveLength(AR_PAGE_SIZE + 2)
  })
})
