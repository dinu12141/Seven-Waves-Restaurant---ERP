// ═══════════════════════════════════════════════════════════════════════════════
// Ledger / account registration integrity + GL-based Finance Dashboard.
//  • balance = signed opening + Σ(Dr − Cr) (#122); stored drift is detected
//  • type ↔ account_group mismatches are flagged (equity in Assets-Current)
//  • openings must balance Dr = Cr company-wide
//  • ledger edits never take a typed-in balance; account edits never write the ledger
//  • dashboard revenue / expenses / profit / cash come from the GL
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { call } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})
vi.mock('src/stores/auth', () => ({
  useAuthStore: () => ({ user: { id: 'U1' }, userRole: 'admin', profile: { role: 'admin' }, currentBranch: null }),
}))

import {
  accountGroupOptions,
  accountLinkIssue,
  annotateLedgers,
  ledgerClassificationIssue,
  openingBalanceDifference,
  recomputeLedgerBalance,
  signedOpening,
  sumEntriesByLedger,
  formatDrCr,
} from 'src/modules/finance/services/finance-ledger-integrity'
import { buildDashboardFigures, localDateKey } from 'src/modules/finance/services/finance-dashboard.builder'
import { financeLedgerService, pickLedgerFields } from 'src/modules/finance/services/finance-ledger.service'
import { financeAccountService } from 'src/modules/finance/services/finance-account.service'

const L = (id: string, code: string, type: string, group: string | null, over: Record<string, unknown> = {}) => ({
  id,
  ledger_code: code,
  ledger_name: `Ledger ${code}`,
  ledger_type: type,
  account_group: group,
  opening_balance: 0,
  opening_balance_type: 'debit',
  current_balance: 0,
  is_active: true,
  ...over,
})
const E = (ledger_id: string, debit: number, credit: number, entry_date = '2026-10-10', over: Record<string, unknown> = {}) => ({
  id: `E-${Math.random()}`,
  ledger_id,
  debit_amount: debit,
  credit_amount: credit,
  entry_date,
  source_type: 'pos_sale',
  source_id: 'S1',
  ...over,
})

beforeEach(() => sb.mock.reset())

describe('ledger balance rule (#122)', () => {
  it('signs openings: debit +, credit −', () => {
    expect(signedOpening({ opening_balance: 100, opening_balance_type: 'debit' })).toBe(100)
    expect(signedOpening({ opening_balance: 100, opening_balance_type: 'credit' })).toBe(-100)
  })

  it('recomputes balance from opening + Σ(Dr − Cr) and flags stored drift (ledger 5000 sign drift)', () => {
    const l = L('A', '5000', 'expense', 'Cost of Sales', { opening_balance: 0, current_balance: 318520 })
    const totals = sumEntriesByLedger([E('A', 0, 318520)])
    expect(recomputeLedgerBalance(l, totals.get('A'))).toBe(-318520)
    const [row] = annotateLedgers([l], totals)
    expect(row.gl_balance).toBe(-318520)
    expect(row.balance_drift).toBe(637040)
    expect(formatDrCr(row.gl_balance)).toBe('318,520.00 Cr')
  })
})

describe('classification', () => {
  it('flags an equity ledger filed under Assets-Current (12000 Director Drawings)', () => {
    const issue = ledgerClassificationIssue(L('X', '12000', 'equity', 'Assets-Current'))
    expect(issue?.kind).toBe('mismatch')
  })
  it('accepts canonical groups and flags unknown / missing ones', () => {
    expect(ledgerClassificationIssue(L('X', '1', 'asset', 'Assets-Current'))).toBeNull()
    expect(ledgerClassificationIssue(L('X', '1', 'asset', null))?.kind).toBe('unclassified')
    expect(ledgerClassificationIssue(L('X', '1', 'income', 'Misc Stuff'))?.kind).toBe('unknown')
  })
  it('offers only the statement groups of the ledger type', () => {
    expect(accountGroupOptions('equity')).toEqual(['Equity'])
    expect(accountGroupOptions('expense')).toContain('Cost of Sales')
    expect(accountGroupOptions('expense')).toContain('Income Tax Expense')
    expect(accountGroupOptions('asset')).not.toContain('Equity')
  })
})

describe('opening difference', () => {
  it('is Σ signed openings; a form override replaces the edited ledger', () => {
    const rows = [
      L('A', '1', 'asset', 'Assets-Current', { opening_balance: 500 }),
      L('B', '2', 'equity', 'Equity', { opening_balance: 400, opening_balance_type: 'credit' }),
    ]
    expect(openingBalanceDifference(rows)).toEqual({ difference: 100, debit: 500, credit: 400 })
    const fixed = openingBalanceDifference(rows, {
      excludeId: 'B',
      override: { opening_balance: 500, opening_balance_type: 'credit' },
    })
    expect(fixed.difference).toBe(0)
  })
})

describe('account → ledger link', () => {
  it('requires an asset ledger used by no other account', () => {
    const cash = L('C', '1001', 'asset', 'Assets-Current')
    const eq = L('Q', '12000', 'equity', 'Assets-Current')
    expect(accountLinkIssue({ id: 'a1', ledger_id: 'Q' }, eq, [])).toMatch(/equity ledger/)
    expect(accountLinkIssue({ id: 'a1', ledger_id: 'C' }, cash, [{ id: 'a2', ledger_id: 'C', registered_name: 'Till' }])).toMatch(/also linked/)
    expect(accountLinkIssue({ id: 'a1', ledger_id: 'C' }, cash, [{ id: 'a1', ledger_id: 'C' }])).toBeNull()
    expect(accountLinkIssue({ id: 'a1', ledger_id: null }, null, [])).toMatch(/No linked ledger/)
  })
})

describe('financeLedgerService', () => {
  it('never writes a typed-in balance and drops non-columns', () => {
    const out = pickLedgerFields({ ledger_code: ' 100 ', current_balance: 999, id: 'x', gl_balance: 1, account_group: '  ' })
    expect(out).toEqual({ ledger_code: '100', account_group: null })
    expect(() => pickLedgerFields({ opening_balance: -5 })).toThrow(/negative/)
  })

  it('update recomputes current_balance from the GL and syncs the linked account', async () => {
    const old = L('A', '1001', 'asset', 'Assets-Current', { opening_balance: 100, current_balance: 42 })
    sb.mock.queue('finance_ledgers', { data: old }, { data: { ...old, opening_balance: 200 } })
    sb.mock.queue('finance_cashbook_entries', { data: [E('A', 50, 20)] })
    sb.mock.queue('finance_accounts', { data: [{ id: 'acc1', opening_balance: 100, current_balance: 42 }] }, { data: null })

    await financeLedgerService.update('A', { opening_balance: 200, current_balance: 123456 })

    const upd = sb.mock.on('finance_ledgers').find((q: any) => call(q, 'update'))
    const payload = call(upd, 'update')!.args[0] as any
    expect(payload.current_balance).toBe(230) // 200 + 50 − 20, not the typed 123456
    const accUpd = sb.mock.on('finance_accounts').find((q: any) => call(q, 'update'))
    expect(call(accUpd, 'update')!.args[0]).toMatchObject({ opening_balance: 200, current_balance: 230 })
  })

  it('rejects a duplicate ledger code on create', async () => {
    sb.mock.queue('finance_ledgers', { data: [{ id: 'other', ledger_code: '1001', ledger_name: 'Cash' }] })
    await expect(financeLedgerService.create({ ledger_code: '1001', ledger_name: 'X', ledger_type: 'asset' })).rejects.toThrow(/already used/)
  })

  it('blocks deleting a ledger linked to an account', async () => {
    sb.mock.queue('finance_ledgers', { data: L('A', '1', 'asset', 'Assets-Current') })
    sb.mock.queue('finance_accounts', { data: [{ id: 'acc', registered_name: 'Main Cash' }] })
    await expect(financeLedgerService.remove('A')).rejects.toThrow(/linked to account/)
    expect(sb.mock.on('finance_ledgers').some((q: any) => call(q, 'delete'))).toBe(false)
  })
})

describe('financeAccountService', () => {
  it('rejects linking an account to a non-asset ledger', async () => {
    sb.mock.queue('finance_ledgers', { data: L('Q', '12000', 'equity', 'Assets-Current') })
    sb.mock.queue('finance_accounts', { data: [] })
    await expect(
      financeAccountService.create({ ledger_id: 'Q', registered_name: 'Main Cash office', account_type: 'cash' }),
    ).rejects.toThrow(/asset ledger/)
  })

  it('update mirrors the ledger and never writes finance_ledgers', async () => {
    const ledger = L('C', '1001', 'asset', 'Assets-Current', { opening_balance: 10 })
    sb.mock.queue('finance_accounts', { data: { id: 'a1', ledger_id: 'C', ledger, current_balance: 5 } }, { data: { id: 'a1' } })
    sb.mock.queue('finance_cashbook_entries', { data: [E('C', 30, 0)] })
    await financeAccountService.update('a1', { registered_name: 'Till', current_balance: 99999, opening_balance: 77 })
    const upd = sb.mock.on('finance_accounts').find((q: any) => call(q, 'update'))
    expect(call(upd, 'update')!.args[0]).toMatchObject({ registered_name: 'Till', opening_balance: 10, current_balance: 40 })
    expect(sb.mock.on('finance_ledgers').some((q: any) => call(q, 'update'))).toBe(false)
  })
})

describe('dashboard figures (GL)', () => {
  const ledgers = [
    L('INC', '4000', 'income', 'Revenue'),
    L('EXP', '6000', 'expense', 'Admin and Operation Expenses'),
    L('CASH', '1001', 'asset', 'Assets-Current', { opening_balance: 1000 }),
    L('DRW', '12000', 'equity', 'Assets-Current'),
  ]
  const entries = [
    E('CASH', 500, 0, '2026-10-05'),
    E('INC', 0, 500, '2026-10-05'),
    E('INC', 50, 0, '2026-10-06'), // refund
    E('CASH', 0, 50, '2026-10-06'),
    E('EXP', 120, 0, '2026-10-07'),
    E('CASH', 0, 120, '2026-10-07'),
    E('INC', 0, 999, '2026-09-30'), // before the KPI period
    E('CASH', 999, 0, '2026-09-30'),
  ]
  it('revenue / expenses / profit match the P&L for the period; cash = ledger GL balance', () => {
    const f = buildDashboardFigures({
      ledgers,
      entries,
      accounts: [
        { id: 'a1', registered_name: 'Till', ledger_id: 'CASH', account_type: 'cash' },
        { id: 'a2', registered_name: 'Main Cash office', ledger_id: 'DRW', account_type: 'cash' },
      ],
      kpiFrom: '2026-10-01',
      kpiTo: '2026-10-31',
      bucketCount: 2,
      bucketOf: (e: any) => (e.entry_date.slice(0, 7) === '2026-09' ? 0 : 1),
    })
    expect(f.revenue).toBe(450)
    expect(f.expenses).toBe(120)
    expect(f.netProfit).toBe(330)
    expect(f.cashAndBank).toBe(1000 + 999 + 500 - 50 - 120)
    expect(f.revenueSeries).toEqual([999, 450])
    expect(f.expenseSeries).toEqual([0, 120])
    expect(f.expenseBreakdown).toEqual([expect.objectContaining({ code: '6000', amount: 120 })])
    expect(f.warnings.join(' ')).toMatch(/Main Cash office.*equity ledger/)
  })

  it('localDateKey uses local time, not UTC', () => {
    const d = new Date(2026, 0, 2, 0, 30)
    expect(localDateKey(d)).toBe('2026-01-02')
  })
})
