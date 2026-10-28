// ═══════════════════════════════════════════════════════════════════════════════
// Ledger / account statement drill-down
// Balance b/f = signed opening (credit → negative) + prior-period movements,
// running balance in GL order, totals, closing, drift vs stored current_balance,
// account entries must match BOTH account_id and the account's ledger_id, and
// entries are read page by page (PostgREST 1000-row cap).
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calls, call } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})

import {
  buildStatement,
  signedLedgerOpening,
  filterAccountEntries,
  formatDrCr,
  resolveSource,
  statementToAoa,
} from 'src/modules/finance/services/finance-ledger-statement.builder'
import { financeLedgerStatementService } from 'src/modules/finance/services/finance-ledger-statement.service'
import { STATEMENT_PAGE_SIZE } from 'src/modules/finance/services/finance-statements.service'

let seq = 0
function e(date: string, dr: number, cr: number, over: Record<string, unknown> = {}) {
  seq += 1
  return {
    id: `E-${String(seq).padStart(4, '0')}`,
    entry_date: date,
    created_at: `${date}T10:00:00Z`,
    ledger_id: 'L1',
    account_id: null,
    source_type: 'manual_adjustment',
    source_id: null,
    description: `entry ${seq}`,
    debit_amount: dr,
    credit_amount: cr,
    ...over,
  }
}

beforeEach(() => {
  seq = 0
  sb.mock.reset()
})

describe('builder — opening balance b/f', () => {
  it('signs ledger openings: debit positive, credit negative', () => {
    expect(signedLedgerOpening({ opening_balance: 500, opening_balance_type: 'debit' })).toBe(500)
    expect(signedLedgerOpening({ opening_balance: 500, opening_balance_type: 'credit' })).toBe(-500)
    expect(signedLedgerOpening({ opening_balance: null })).toBe(0)
  })

  it('debit opening + prior-period entries roll into balance b/f', () => {
    const st = buildStatement({
      subject: { type: 'ledger' },
      openingBase: signedLedgerOpening({ opening_balance: 1000, opening_balance_type: 'debit' }),
      entries: [e('2026-02-10', 300, 0), e('2026-02-20', 0, 100), e('2026-03-05', 50, 0)],
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    })
    expect(st.opening).toBe(1200)
    expect(st.rows).toHaveLength(1)
    expect(st.rows[0].running_balance).toBe(1250)
    expect(st.closing).toBe(1250)
  })

  it('credit opening goes negative (Cr) and is never flipped', () => {
    const st = buildStatement({
      subject: { type: 'ledger' },
      openingBase: signedLedgerOpening({ opening_balance: 2000, opening_balance_type: 'credit' }),
      entries: [e('2026-01-15', 0, 500), e('2026-03-02', 200, 0)],
      dateFrom: '2026-03-01',
    })
    expect(st.opening).toBe(-2500)
    expect(st.closing).toBe(-2300)
    expect(formatDrCr(st.opening)).toBe('2,500.00 Cr')
    expect(formatDrCr(1234.5)).toBe('1,234.50 Dr')
    expect(formatDrCr(0)).toBe('0.00')
  })

  it('all time: opening b/f is the opening balance alone', () => {
    const st = buildStatement({ subject: {}, openingBase: 100, entries: [e('2020-01-01', 10, 0)] })
    expect(st.opening).toBe(100)
    expect(st.rows).toHaveLength(1)
    expect(st.closing).toBe(110)
  })
})

describe('builder — running balance, ordering, totals', () => {
  it('orders by entry_date, then created_at, then id and accumulates', () => {
    const a = e('2026-03-02', 100, 0, { id: 'Z', created_at: '2026-03-02T09:00:00Z' })
    const b = e('2026-03-02', 0, 30, { id: 'A', created_at: '2026-03-02T11:00:00Z' })
    const c = e('2026-03-02', 0, 20, { id: 'B', created_at: '2026-03-02T11:00:00Z' })
    const d = e('2026-03-01', 5, 0)
    const st = buildStatement({ subject: {}, openingBase: 0, entries: [c, b, a, d], dateFrom: '2026-03-01' })
    expect(st.rows.map((r) => r.id)).toEqual([d.id, 'Z', 'A', 'B'])
    expect(st.rows.map((r) => r.running_balance)).toEqual([5, 105, 75, 55])
    expect(st.totals).toEqual({ debit: 105, credit: 50 })
    expect(st.closing).toBe(st.opening + st.totals.debit - st.totals.credit)
  })

  it('excludes entries after dateTo from rows and closing', () => {
    const st = buildStatement({
      subject: {},
      entries: [e('2026-03-10', 100, 0), e('2026-04-02', 999, 0)],
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    })
    expect(st.rows).toHaveLength(1)
    expect(st.closing).toBe(100)
    expect(st.recomputed_balance).toBe(1099)
  })

  it('empty period: closing equals opening', () => {
    const st = buildStatement({ subject: {}, openingBase: 40, entries: [e('2026-01-01', 10, 0)], dateFrom: '2026-03-01' })
    expect(st.rows).toEqual([])
    expect(st.opening).toBe(50)
    expect(st.closing).toBe(50)
    expect(st.totals).toEqual({ debit: 0, credit: 0 })
  })
})

describe('builder — drift vs stored current_balance', () => {
  it('flags drift > 0.01 using all entries regardless of the period', () => {
    const entries = [e('2026-01-01', 100, 0), e('2026-05-01', 50, 0)]
    const st = buildStatement({ subject: {}, entries, dateFrom: '2026-03-01', dateTo: '2026-03-31', storedCurrentBalance: 120 })
    expect(st.recomputed_balance).toBe(150)
    expect(st.drift).toBe(30)
    expect(st.has_drift).toBe(true)
  })

  it('no drift within tolerance; no comparison when branch-filtered', () => {
    const entries = [e('2026-01-01', 100, 0)]
    expect(buildStatement({ subject: {}, entries, storedCurrentBalance: 100.004 }).has_drift).toBe(false)
    const br = buildStatement({ subject: {}, entries, storedCurrentBalance: 5, compareStored: false })
    expect(br.drift).toBeNull()
    expect(br.has_drift).toBe(false)
  })
})

describe('builder — account filter and sources', () => {
  it('keeps only entries with account_id AND ledger_id matching the account', () => {
    const acct = { id: 'A1', ledger_id: 'L1' }
    const rows = [
      e('2026-03-01', 10, 0, { account_id: 'A1', ledger_id: 'L1' }),
      e('2026-03-01', 0, 10, { account_id: 'A1', ledger_id: 'L-OTHER' }), // contra leg tagged with the account
      e('2026-03-01', 7, 0, { account_id: 'A2', ledger_id: 'L1' }),
      e('2026-03-01', 3, 0, { account_id: null, ledger_id: 'L1' }),
    ]
    const kept = filterAccountEntries(rows, acct)
    expect(kept).toHaveLength(1)
    expect(kept[0].debit_amount).toBe(10)
    expect(filterAccountEntries(rows, { id: 'A1', ledger_id: null })).toEqual([])
  })

  it('maps source_type to labels and doc numbers, flags reversals', () => {
    const refs = { ap_invoices: { S1: 'INV-0001' }, finance_vouchers: { V1: 'PV-0009' } }
    expect(resolveSource({ source_type: 'invoice', source_id: 'S1' }, refs)).toMatchObject({
      source_label: 'Supplier Invoice',
      doc_ref: 'INV-0001',
    })
    expect(resolveSource({ source_type: 'pay_voucher', source_id: 'V1' }, refs).doc_ref).toBe('PV-0009')
    expect(resolveSource({ source_type: 'manual_adjustment', source_id: 'abcdef12-3456' }, refs).doc_ref).toBe('JE-abcdef12')
    expect(resolveSource({ source_type: 'cheque_bounced', source_id: null }).source_label).toBe('Cheque Bounced')
    expect(resolveSource({ source_type: 'invoice', description: 'REVERSAL of INV-1' }).is_reversal).toBe(true)
  })

  it('exports a b/f row, every entry, totals and closing', () => {
    const st = buildStatement({ subject: { type: 'ledger', code: '1001', name: 'Cash' }, openingBase: -10, entries: [e('2026-03-01', 25, 0)] })
    const aoa = statementToAoa(st)
    expect(aoa.find((r) => r[3] === 'Balance b/f')).toEqual(['', '', '', 'Balance b/f', '', '', 10, 'Cr'])
    expect(aoa.find((r) => r[3] === 'Closing balance c/f')).toEqual(['', '', '', 'Closing balance c/f', '', '', 15, 'Dr'])
  })
})

describe('service', () => {
  it('getLedgerStatement paginates entries and resolves doc numbers', async () => {
    sb.mock.queue('finance_ledgers', {
      data: { id: 'L1', ledger_code: '1001', ledger_name: 'Main Cash', account_group: 'Assets-Current', opening_balance: 100, opening_balance_type: 'debit', current_balance: 100 + STATEMENT_PAGE_SIZE + 5 },
    })
    const page1 = Array.from({ length: STATEMENT_PAGE_SIZE }, () => e('2026-03-01', 1, 0))
    const page2 = [e('2026-03-02', 5, 0, { source_type: 'invoice', source_id: 'INV1' })]
    sb.mock.queue('finance_cashbook_entries', { data: page1 }, { data: page2 })
    sb.mock.queue('ap_invoices', { data: [{ id: 'INV1', doc_number: 'AP-INV-77' }] })

    const st = await financeLedgerStatementService.getLedgerStatement({ ledgerId: 'L1' })

    const q = sb.mock.on('finance_cashbook_entries')
    expect(q).toHaveLength(2)
    expect(calls(q[0], 'range')[0].args).toEqual([0, STATEMENT_PAGE_SIZE - 1])
    expect(calls(q[1], 'range')[0].args).toEqual([STATEMENT_PAGE_SIZE, 2 * STATEMENT_PAGE_SIZE - 1])
    expect(call(q[0], 'eq')?.args).toEqual(['ledger_id', 'L1'])

    expect(st.rows).toHaveLength(STATEMENT_PAGE_SIZE + 1)
    expect(st.opening).toBe(100)
    expect(st.closing).toBe(100 + STATEMENT_PAGE_SIZE + 5)
    expect(st.has_drift).toBe(false)
    expect(st.subject).toMatchObject({ code: '1001', name: 'Main Cash', group: 'Assets-Current' })
    expect(st.rows.at(-1)).toMatchObject({ source_label: 'Supplier Invoice', doc_ref: 'AP-INV-77' })
  })

  it('getAccountStatement filters by account_id and the account ledger, applies branch filter', async () => {
    sb.mock.queue('finance_accounts', {
      data: { id: 'A1', registered_name: 'BOC Current', account_number: '123', ledger_id: 'L9', opening_balance: 50, current_balance: 999, ledger: { ledger_code: '1002', ledger_name: 'Bank', account_group: 'Assets-Current' } },
    })
    sb.mock.queue('finance_cashbook_entries', {
      data: [
        e('2026-03-01', 20, 0, { account_id: 'A1', ledger_id: 'L9' }),
        e('2026-03-01', 0, 20, { account_id: 'A1', ledger_id: 'L-X' }),
      ],
    })

    const st = await financeLedgerStatementService.getAccountStatement({ accountId: 'A1', branchId: 'B1', dateFrom: '2026-03-01' })
    const eqArgs = calls(sb.mock.on('finance_cashbook_entries')[0], 'eq').map((c) => c.args)
    expect(eqArgs).toEqual(expect.arrayContaining([['ledger_id', 'L9'], ['account_id', 'A1'], ['branch_id', 'B1']]))
    expect(st.rows).toHaveLength(1)
    expect(st.opening).toBe(50)
    expect(st.closing).toBe(70)
    expect(st.drift).toBeNull() // branch-filtered: stored balance is company-wide
  })

  it('getAccountStatement flags drift when unfiltered', async () => {
    sb.mock.queue('finance_accounts', { data: { id: 'A1', registered_name: 'Cash', ledger_id: 'L1', opening_balance: 0, current_balance: 10 } })
    sb.mock.queue('finance_cashbook_entries', { data: [e('2026-03-01', 25, 0, { account_id: 'A1' })] })
    const st = await financeLedgerStatementService.getAccountStatement({ accountId: 'A1' })
    expect(st.drift).toBe(15)
    expect(st.has_drift).toBe(true)
  })
})
