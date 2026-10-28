import { describe, it, expect, vi } from 'vitest'
import {
  normalizeTenderMethod,
  normalizeTenders,
  tendersTotal,
  tenderBalance,
  isTendersBalanced,
  creditTenderAmount,
  tendersRequireCustomer,
  hasCashTender,
  splitDetailsToLines,
  paySplit,
  probeSplitPayRpc,
  MISSING_SPLIT_RPC_MSG,
  pickDefaultExpenseLedger,
  filterLedgers,
  ledgerLabel,
} from '../splitTenders'

describe('split tenders — method normalisation (mirrors pos_split_pay)', () => {
  it('accepts the 7 tender methods and maps aliases', () => {
    for (const m of ['cash', 'card', 'visa', 'master', 'qr', 'bank', 'credit']) {
      expect(normalizeTenderMethod(m)).toBe(m)
    }
    expect(normalizeTenderMethod('online')).toBe('qr')
    expect(normalizeTenderMethod('MasterCard')).toBe('master')
    expect(normalizeTenderMethod('bank_transfer')).toBe('bank')
    expect(normalizeTenderMethod('transfer')).toBe('bank')
    expect(normalizeTenderMethod('credit_card')).toBe('card')
    expect(normalizeTenderMethod(' Cash ')).toBe('cash')
    expect(normalizeTenderMethod('split')).toBeNull()
    expect(normalizeTenderMethod('')).toBeNull()
  })

  it('normalizeTenders drops zero lines, rounds, rejects unknown/negative', () => {
    const r = normalizeTenders([
      { method: 'cash', amount: 1000.004 },
      { method: 'visa', amount: '500' },
      { method: 'qr', amount: 0 },
    ])
    expect(r.errors).toEqual([])
    expect(r.tenders).toEqual([
      { method: 'cash', amount: 1000 },
      { method: 'visa', amount: 500 },
    ])
    expect(normalizeTenders([{ method: 'bitcoin', amount: 10 }]).errors[0]).toMatch(/Unknown/)
    expect(normalizeTenders([{ method: 'cash', amount: -5 }]).errors[0]).toMatch(/positive/)
    expect(normalizeTenders([]).errors[0]).toMatch(/at least one/)
  })
})

describe('split tenders — Σ check', () => {
  const lines = [
    { method: 'cash', amount: 2000 },
    { method: 'card', amount: 2999.995 },
  ]
  it('sums and balances within ±0.01', () => {
    expect(tendersTotal(lines)).toBe(5000)
    expect(isTendersBalanced(lines, 5000)).toBe(true)
    expect(isTendersBalanced(lines, 5000.01)).toBe(true)
    expect(isTendersBalanced(lines, 5000.5)).toBe(false)
  })
  it('balance is positive when short, negative when overpaid', () => {
    expect(tenderBalance([{ method: 'cash', amount: 400 }], 1000)).toBe(600)
    expect(tenderBalance([{ method: 'cash', amount: 1200 }], 1000)).toBe(-200)
  })
})

describe('split tenders — credit needs a registered customer', () => {
  it('only when a credit line has an amount', () => {
    expect(tendersRequireCustomer([{ method: 'cash', amount: 500 }])).toBe(false)
    expect(tendersRequireCustomer([{ method: 'credit', amount: 0 }])).toBe(false)
    expect(tendersRequireCustomer([{ method: 'cash', amount: 400 }, { method: 'credit', amount: 600 }])).toBe(true)
    expect(creditTenderAmount([{ method: 'credit', amount: 600 }, { method: 'credit', amount: 50 }])).toBe(650)
  })
  it('detects a cash tender (drawer kick)', () => {
    expect(hasCashTender([{ method: 'cash', amount: 1 }])).toBe(true)
    expect(hasCashTender([{ method: 'card', amount: 1 }])).toBe(false)
  })
  it('converts PaymentDialog split breakdown to lines', () => {
    const lines = splitDetailsToLines({ cash: 100, card: 0, qr: 50, bank: 0, credit: 25 })
    expect(normalizeTenders(lines).tenders).toEqual([
      { method: 'cash', amount: 100 },
      { method: 'qr', amount: 50 },
      { method: 'credit', amount: 25 },
    ])
    expect(splitDetailsToLines(null)).toEqual([])
  })
})

describe('paySplit / probeSplitPayRpc', () => {
  it('calls pos_split_pay with tenders and shift id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true, order_id: 'o1' }, error: null })
    const r = await paySplit({ rpc }, 'o1', [{ method: 'cash', amount: 10 }], 's1')
    expect(r.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('pos_split_pay', {
      p_order_id: 'o1',
      p_tenders: [{ method: 'cash', amount: 10 }],
      p_shift_id: 's1',
    })
  })
  it('reports a missing RPC (PGRST202)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    const r = await paySplit({ rpc }, 'o1', [], null)
    expect(r).toMatchObject({ success: false, missingRpc: true, error: MISSING_SPLIT_RPC_MSG })
    const p = await probeSplitPayRpc({ rpc })
    expect(p.missingRpc).toBe(true)
  })
  it('surfaces server validation errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: false, error: 'VALIDATION_ERROR: x' }, error: null })
    const r = await paySplit({ rpc }, 'o1', [{ method: 'cash', amount: 1 }])
    expect(r).toMatchObject({ success: false, error: 'VALIDATION_ERROR: x' })
  })
  it('probe passes on "Order not found", fails on insufficient role', async () => {
    const ok = vi.fn().mockResolvedValue({ data: { success: false, error: 'Order not found.' }, error: null })
    expect((await probeSplitPayRpc({ rpc: ok })).success).toBe(true)
    const role = vi.fn().mockResolvedValue({ data: { success: false, error: 'Insufficient role.' }, error: null })
    expect((await probeSplitPayRpc({ rpc: role })).success).toBe(false)
  })
})

describe('payout expense ledgers', () => {
  const ledgers = [
    { id: 'a', ledger_code: '7001', ledger_name: 'Rent' },
    { id: 'b', ledger_code: '7042', ledger_name: 'Miscellaneous Expense' },
  ]
  it('defaults to 7042', () => {
    expect(pickDefaultExpenseLedger(ledgers)?.id).toBe('b')
    expect(pickDefaultExpenseLedger([{ id: 'c', ledger_code: '9', ledger_name: 'Miscellaneous expense' }])?.id).toBe('c')
    expect(pickDefaultExpenseLedger([])).toBeNull()
  })
  it('filters by code or name', () => {
    expect(filterLedgers(ledgers, 'rent').map((l) => l.id)).toEqual(['a'])
    expect(filterLedgers(ledgers, '7042').map((l) => l.id)).toEqual(['b'])
    expect(filterLedgers(ledgers, '')).toHaveLength(2)
    expect(ledgerLabel(ledgers[1])).toBe('7042 — Miscellaneous Expense')
  })
})
