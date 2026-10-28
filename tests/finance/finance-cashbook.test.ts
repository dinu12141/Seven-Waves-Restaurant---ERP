// ═══════════════════════════════════════════════════════════════════════════════
// Cashbook / Petty Cash Book — read from the GL (finance_cashbook_entries)
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock, calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})

import { buildCashbook, classifyCashLedgers, inPeriod } from 'src/modules/finance/services/finance-cashbook.builder'
import { financeCashbookService } from 'src/modules/finance/services/finance-cashbook.service'

const MAIN = { id: 'L-main', ledger_code: '10001', ledger_name: 'MAIN CASH', opening_balance: 1000, opening_balance_type: 'debit', current_balance: 1000 + 5000 - 17740 + 300, is_cashbook_ledger: true }
const BANK = { id: 'L-bank', ledger_code: '1020', ledger_name: 'Commercial Bank', opening_balance: 0, current_balance: 0, is_bank_ledger: true }
const PETTY = { id: 'L-petty', ledger_code: '10011', ledger_name: 'Petty Cash -HR', opening_balance: 0, current_balance: 0 }
const CHANGE = { id: 'L-chg', ledger_code: '10012', ledger_name: 'Change Fund', opening_balance: 0, current_balance: 0 }
const IOU = { id: 'L-iou', ledger_code: '100005', ledger_name: 'IOU', opening_balance: 0, current_balance: 17740 }

const e = (id: string, date: string, ledger: string, dr: number, cr: number, source = 'pos_sale', created = '') => ({
  id, entry_date: date, ledger_id: ledger, debit_amount: dr, credit_amount: cr, source_type: source, source_id: `s-${id}`, created_at: created || `${date}T00:00:00Z`, description: `${source} ${id}`,
})

describe('classifyCashLedgers', () => {
  it('splits cash/bank from petty cash using flags, linked accounts and names', () => {
    const accounts = [
      { id: 'a1', ledger_id: 'L-petty', account_type: 'petty_cash' },
      { id: 'a2', ledger_id: 'L-chg', account_type: 'cash' },
    ]
    const { cash, petty } = classifyCashLedgers([IOU, BANK, MAIN, PETTY, CHANGE], accounts)
    expect(cash.map((l) => l.ledger_code)).toEqual(['1020', '10001'])
    expect(petty.map((l) => l.ledger_code)).toEqual(['10011', '10012'])
  })
})

describe('buildCashbook', () => {
  const entries = [
    e('1', '2026-09-30', 'L-main', 300, 0, 'pos_sale'),
    e('2', '2026-10-02', 'L-main', 5000, 0, 'received_voucher'),
    e('3', '2026-10-05', 'L-main', 0, 17740, 'pay_voucher'),
    e('4', '2026-10-05', 'L-iou', 17740, 0, 'pay_voucher'), // not a cash ledger → ignored
  ]

  it('carries the balance b/f and a per-ledger Dr-positive running balance', () => {
    const r = buildCashbook({ ledgers: [MAIN], entries, dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(r.ledgers[0]).toMatchObject({ opening: 1300, debit: 5000, credit: 17740, closing: -11440, drift: 0, has_drift: false })
    expect(r.rows.map((x) => [x.kind, x.running_balance])).toEqual([
      ['opening', 1300],
      ['entry', 6300],
      ['entry', -11440],
    ])
    expect(r.rows[2]).toMatchObject({ source_label: 'Payment Voucher', credit: 17740 })
  })

  it('a source filter hides rows but never changes the balances', () => {
    const r = buildCashbook({ ledgers: [MAIN], entries, dateFrom: '2026-10-01', sourceType: 'pay_voucher' })
    expect(r.rows.filter((x) => x.kind === 'entry')).toHaveLength(1)
    expect(r.rows[1].running_balance).toBe(-11440)
    expect(r.totals).toMatchObject({ closing: -11440, shown_debit: 0, shown_credit: 17740, debit: 5000 })
  })

  it('flags drift against the stored ledger balance (not with a branch filter)', () => {
    const drifted = { ...MAIN, current_balance: 0 }
    expect(buildCashbook({ ledgers: [drifted], entries }).ledgers[0].has_drift).toBe(true)
    expect(buildCashbook({ ledgers: [drifted], entries, compareStored: false }).ledgers[0].drift).toBeNull()
  })

  it('credit-type openings are negative and silent ledgers are hidden', () => {
    const od = { ...BANK, opening_balance: 250, opening_balance_type: 'credit' }
    const r = buildCashbook({ ledgers: [od, PETTY], entries: [] })
    expect(r.ledgers).toHaveLength(1)
    expect(r.ledgers[0].closing).toBe(-250)
  })

  it('inPeriod is inclusive', () => {
    expect(inPeriod({ entry_date: '2026-10-01' }, '2026-10-01', '2026-10-01')).toBe(true)
    expect(inPeriod({ entry_date: '2026-10-02' }, '2026-10-01', '2026-10-01')).toBe(false)
  })
})

describe('financeCashbookService.getReport', () => {
  let m: ReturnType<typeof createSupabaseMock>
  beforeEach(() => {
    m = sb.mock
    m.reset()
  })

  it('reads every page of GL entries for the cash ledgers only', async () => {
    m.queue('finance_ledgers', { data: [MAIN, IOU, PETTY] })
    m.queue('finance_accounts', { data: [{ id: 'a1', ledger_id: 'L-main', account_type: 'cash' }] })
    const page1 = Array.from({ length: 1000 }, (_, i) => e(`p${String(i).padStart(4, '0')}`, '2026-10-10', 'L-main', 1, 0))
    m.queue('finance_cashbook_entries', { data: page1 }, { data: [e('last', '2026-10-11', 'L-main', 0, 5)] })

    const r = await financeCashbookService.getReport({ date_from: '2026-10-01' })

    const q = m.on('finance_cashbook_entries')
    expect(q).toHaveLength(2)
    expect(calls(q[0], 'in')[0].args).toEqual(['ledger_id', ['L-main']])
    expect(calls(q[1], 'range')[0].args).toEqual([1000, 1999])
    expect(r.rows.filter((x) => x.kind === 'entry')).toHaveLength(1001)
    expect(r.books.petty.map((l) => l.id)).toEqual(['L-petty'])
  })

  it('the petty cash book reads the petty cash ledgers from the GL, not finance_petty_cash_entries', async () => {
    m.queue('finance_ledgers', { data: [MAIN, PETTY] })
    m.queue('finance_accounts', { data: [] })
    m.queue('finance_cashbook_entries', { data: [e('x', '2026-10-03', 'L-petty', 0, 750, 'pay_voucher')] })

    const r = await financeCashbookService.getPettyCashReport({})

    expect(m.on('finance_petty_cash_entries')).toHaveLength(0)
    expect(calls(m.on('finance_cashbook_entries')[0], 'in')[0].args).toEqual(['ledger_id', ['L-petty']])
    expect(r.totals.closing).toBe(-750)
  })
})
