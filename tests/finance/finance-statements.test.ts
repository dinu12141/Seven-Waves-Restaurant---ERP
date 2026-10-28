// ═══════════════════════════════════════════════════════════════════════════════
// Financial statements — dynamic account_group layout (LKAS 1)
// Every ledger must show once under its own category: unknown groups get their
// own heading, NULL groups go to "Unclassified", contra ledgers are deductions,
// the balance sheet is cumulative and balances whenever the trial balance does.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calls } from '../helpers/supabaseMock'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})

import {
  computeLedgerBalances,
  buildTrialBalance,
  buildProfitLoss,
  buildBalanceSheet,
  visibleStatementItems,
  UNCLASSIFIED_GROUP,
  RETAINED_EARNINGS_BF_LABEL,
  OPENING_DIFF_LABEL,
} from 'src/modules/finance/services/finance-statements.builder'
import { financeStatementsService, STATEMENT_PAGE_SIZE } from 'src/modules/finance/services/finance-statements.service'
import { statementLines } from 'src/modules/finance/services/finance-export.service'

// ── Fixture helpers ──────────────────────────────────────────────────────────
let seq = 0
function ledger(code: string, name: string, type: string, group: string | null, over: Record<string, unknown> = {}) {
  return {
    id: `L-${code}`,
    ledger_code: code,
    ledger_name: name,
    ledger_type: type,
    ledger_nature: type === 'asset' || type === 'expense' ? 'debit' : 'credit',
    account_group: group,
    opening_balance: 0,
    opening_balance_type: 'debit',
    current_balance: 0,
    is_active: true,
    deleted_at: null,
    ...over,
  }
}
function entry(code: string, date: string, dr: number, cr: number) {
  seq += 1
  return { id: `E-${seq}`, ledger_id: `L-${code}`, entry_date: date, debit_amount: dr, credit_amount: cr }
}
/** A balanced double-entry posting. */
function post(date: string, drCode: string, crCode: string, amount: number) {
  return [entry(drCode, date, amount, 0), entry(crCode, date, 0, amount)]
}

function sectionOf(report: any, key: string) {
  return report.sections.find((s: any) => s.key === key)
}
function groupOf(report: any, sectionKey: string, name: string) {
  return sectionOf(report, sectionKey)?.groups.find((g: any) => g.name === name)
}
function ledgerLines(report: any) {
  return report.sections.flatMap((s: any) =>
    s.groups.flatMap((g: any) => g.items.filter((i: any) => i.kind === 'ledger' && !i.synthetic)),
  )
}

const CHART = [
  ledger('1013', 'Furniture and Fittings', 'asset', 'Assets-Non Current'),
  ledger('1020', 'Accumulated Depreciation', 'asset', 'Assets-Non Current', { ledger_nature: 'credit' }),
  ledger('1001', 'Main Cash', 'asset', 'Assets-Current'),
  ledger('1010', 'Staff Loans', 'asset', 'Assets-Current (Other Receivable)'),
  ledger('3100', 'Stated Capital', 'equity', 'Equity'),
  ledger('3101', 'Director Drawings', 'equity', 'Equity', { ledger_nature: 'debit' }),
  ledger('3102', 'General Reserve', 'equity', 'Equity'),
  ledger('3000', 'Bank Loan', 'liability', 'Non Current Liabilities'),
  ledger('2000', 'Accounts Payables', 'liability', 'Current Liabilities'),
  ledger('5000', 'Restaurant Food Sales', 'income', 'Revenue'),
  ledger('5001', 'Service Charge Income', 'income', 'Other Income'),
  ledger('6000', 'Food Cost', 'expense', 'Cost of Sales'),
  ledger('7001', 'Electricity', 'expense', 'Admin and Operation Expenses'),
  ledger('7043', 'Corporate Income Tax', 'expense', 'Admin and Operation Expenses'),
  ledger('8001', 'Advertising', 'expense', 'Selling and Distribution'),
  ledger('9000', 'Bank Charges', 'expense', 'Finance Expenses'),
  ledger('10000', 'Loss on Disposal', 'expense', 'Other Expenses'),
]

function balancedEntries() {
  return [
    ...post('2026-01-05', '1001', '3100', 1_000_000), // capital in
    ...post('2026-01-10', '1013', '1001', 300_000), // buy furniture
    ...post('2026-01-31', '1001', '3000', 200_000), // loan
    ...post('2026-02-15', '1001', '5000', 150_000), // sales (prior period)
    ...post('2026-02-16', '6000', '2000', 40_000), // food on credit
    ...post('2026-03-05', '1001', '5000', 90_000), // sales (current period)
    ...post('2026-03-06', '1001', '5001', 5_000),
    ...post('2026-03-07', '6000', '1001', 20_000),
    ...post('2026-03-08', '7001', '1001', 8_000),
    ...post('2026-03-09', '8001', '1001', 2_000),
    ...post('2026-03-10', '9000', '1001', 500),
    ...post('2026-03-11', '10000', '1001', 1_500),
    ...post('2026-03-20', '7043', '2000', 9_000), // income tax
    ...post('2026-03-25', '3101', '1001', 25_000), // drawings
    entry('1020', '2026-03-31', 0, 15_000), // depreciation: Dr admin / Cr acc depn
    entry('7001', '2026-03-31', 15_000, 0),
    ...post('2026-03-31', '1010', '1001', 4_000), // staff loan
  ]
}

const PERIOD = { date_from: '2026-03-01', date_to: '2026-03-31' }

// ═══════════════════════════════════════════════════════════════════════════════
describe('financial statements — categories', () => {
  it('shows an unknown account_group under its own heading in its ledger_type section (never dropped)', () => {
    const ledgers = [...CHART, ledger('1050', 'Petty Cash Float', 'asset', 'Cash & Cash Equivalents')]
    const entries = [...balancedEntries(), ...post('2026-03-15', '1050', '1001', 3_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, entries, PERIOD), PERIOD)

    const g = groupOf(bs, 'current_assets', 'Cash & Cash Equivalents')
    expect(g).toBeTruthy()
    expect(g.status).toBe('unknown')
    expect(g.items.map((i: any) => i.code)).toEqual(['1050'])
    expect(g.total).toBe(3_000)
    expect(bs.warnings.some((w: any) => w.code === 'unknown_group' && w.message.includes('1050'))).toBe(true)
    expect(bs.is_balanced).toBe(true)
  })

  it('routes an unknown non-current group to the non-current section', () => {
    const ledgers = [...CHART, ledger('1100', 'Long-term Deposit', 'asset', 'Non-Current Investments')]
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, [], PERIOD), PERIOD)
    expect(groupOf(bs, 'non_current_assets', 'Non-Current Investments')).toBeTruthy()
  })

  it('puts a NULL account_group under "Unclassified" with an error warning, still counted in totals', () => {
    const ledgers = [...CHART, ledger('1099', 'Mystery Asset', 'asset', null), ledger('7999', 'Misc', 'expense', '  ')]
    const entries = [...balancedEntries(), ...post('2026-03-12', '1099', '1001', 1_000), ...post('2026-03-12', '7999', '1001', 700)]
    const balances = computeLedgerBalances(ledgers, entries, PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    const pl = buildProfitLoss(balances, PERIOD)

    const ug = groupOf(bs, 'current_assets', UNCLASSIFIED_GROUP)
    expect(ug.status).toBe('unclassified')
    expect(ug.items[0].code).toBe('1099')
    expect(ug.total).toBe(1_000)
    expect(bs.warnings.some((w: any) => w.level === 'error' && w.code === 'unclassified')).toBe(true)
    expect(groupOf(pl, 'other_expenses', UNCLASSIFIED_GROUP).items[0].code).toBe('7999')
    expect(bs.is_balanced).toBe(true)
  })

  it('places every ledger exactly once and shows every standard category heading', () => {
    const balances = computeLedgerBalances(CHART, balancedEntries(), PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    const pl = buildProfitLoss(balances, PERIOD)
    const codes = [...ledgerLines(bs), ...ledgerLines(pl)].map((i: any) => i.code).sort()
    expect(codes).toEqual(CHART.map((l) => l.ledger_code).sort())
    expect(bs.checks.placed_count).toBe(bs.checks.ledger_count)
    expect(pl.checks.placed_count).toBe(pl.checks.ledger_count)
    expect(sectionOf(bs, 'current_assets').groups.map((g: any) => g.name)).toEqual([
      'Assets-Current',
      'Assets-Current (Other Receivable)',
    ])
  })

  it('lays out the Balance Sheet and P&L in LKAS 1 order', () => {
    const balances = computeLedgerBalances(CHART, balancedEntries(), PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    const pl = buildProfitLoss(balances, PERIOD)
    const keys = (r: any) => r.layout.map((b: any) => (b.kind === 'section' ? b.section.key : b.key || b.label))
    expect(keys(bs)).toEqual([
      'ASSETS',
      'non_current_assets',
      'current_assets',
      'total_assets',
      'EQUITY AND LIABILITIES',
      'equity',
      'non_current_liabilities',
      'current_liabilities',
      'total_liabilities',
      'total_equity_liabilities',
    ])
    expect(keys(pl)).toEqual([
      'revenue',
      'cost_of_sales',
      'gross_profit',
      'other_income',
      'admin_and_operation',
      'selling_and_distribution',
      'finance_expenses',
      'other_expenses',
      'profit_before_tax',
      'tax',
      'net_profit',
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('financial statements — amounts', () => {
  it('shows contra accounts (accumulated depreciation, drawings) as deductions', () => {
    const bs = buildBalanceSheet(computeLedgerBalances(CHART, balancedEntries(), PERIOD), PERIOD)
    const nca = sectionOf(bs, 'non_current_assets')
    const depn = nca.groups[0].items.find((i: any) => i.code === '1020')
    expect(depn.amount).toBe(-15_000)
    expect(depn.is_contra).toBe(true)
    expect(nca.total).toBe(300_000 - 15_000)

    const drawings = groupOf(bs, 'equity', 'Equity').items.find((i: any) => i.code === '3101')
    expect(drawings.amount).toBe(-25_000)
    expect(drawings.is_contra).toBe(true)
    // the export prints them as "Less:" lines
    expect(statementLines(bs).some((l: any) => l.kind === 'item' && l.name === 'Less: Director Drawings')).toBe(true)
  })

  it('does not force a contra sign: a wrong-signed drawings balance stays visible', () => {
    const entries = [...balancedEntries(), ...post('2026-03-26', '1001', '3101', 40_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(CHART, entries, PERIOD), PERIOD)
    const drawings = groupOf(bs, 'equity', 'Equity').items.find((i: any) => i.code === '3101')
    expect(drawings.amount).toBe(15_000) // net credit 15,000 — shown as is, not -abs()
  })

  it('shows every equity ledger, plus Retained Earnings b/f and profit for the period', () => {
    const entries = [...balancedEntries(), ...post('2026-03-30', '1001', '3102', 10_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(CHART, entries, PERIOD), PERIOD)
    const eq = groupOf(bs, 'equity', 'Equity').items.map((i: any) => i.code)
    expect(eq).toEqual(['3100', '3101', '3102'])
    const re = groupOf(bs, 'equity', 'Retained Earnings').items
    expect(re.map((i: any) => i.name)).toEqual([RETAINED_EARNINGS_BF_LABEL, 'Profit / (Loss) for the Period'])
  })

  it('brings forward all profit before date_from as Retained Earnings b/f', () => {
    const balances = computeLedgerBalances(CHART, balancedEntries(), PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    const pl = buildProfitLoss(balances, PERIOD)
    // Feb: sales 150,000 − food 40,000
    expect(bs.retained_earnings_bf).toBe(110_000)
    // March: 90,000 + 5,000 − 20,000 − (8,000 + 15,000) − 2,000 − 500 − 1,500 − tax 9,000
    expect(pl.net_profit).toBe(39_000)
    expect(bs.profit_for_period).toBe(pl.net_profit)
    expect(pl.revenue.total).toBe(90_000) // prior-period sales are not in this P&L
  })

  it('computes the P&L subtotals in LKAS 1 order with tax (7043) below profit before tax', () => {
    const pl = buildProfitLoss(computeLedgerBalances(CHART, balancedEntries(), PERIOD), PERIOD)
    expect(pl.gross_profit).toBe(70_000)
    expect(pl.net_profit_before_tax).toBe(48_000)
    expect(pl.tax.amount).toBe(9_000)
    const admin = sectionOf(pl, 'admin_and_operation').groups.flatMap((g: any) => g.items.map((i: any) => i.code))
    expect(admin).not.toContain('7043')
    expect(sectionOf(pl, 'tax').groups[0].items[0].code).toBe('7043')
    expect(sectionOf(pl, 'finance_expenses').total).toBe(500)
    expect(sectionOf(pl, 'other_expenses').total).toBe(1_500)
  })

  it('balances the balance sheet when the trial balance balances — with or without date_from', () => {
    const entries = balancedEntries()
    for (const f of [PERIOD, { date_to: '2026-03-31' }, { date_from: '2026-02-01', date_to: '2026-03-31' }]) {
      const balances = computeLedgerBalances(CHART, entries, f)
      const tb = buildTrialBalance(balances)
      const bs = buildBalanceSheet(balances, f)
      expect(tb.isBalanced).toBe(true)
      expect(bs.is_balanced).toBe(true)
      expect(bs.difference).toBe(0)
      // cumulative as at date_to: date_from never changes the balance sheet totals
      expect(bs.total_assets).toBe(1_373_000)
      expect(bs.total_equity_liabilities).toBe(1_373_000)
    }
  })

  it('shows unbalanced ledger openings as a separate suspense line (Tally-style) and warns', () => {
    const ledgers = CHART.map((l) => (l.ledger_code === '1001' ? { ...l, opening_balance: 5_000 } : l))
    const balances = computeLedgerBalances(ledgers, balancedEntries(), PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    expect(bs.opening_difference).toBe(5_000)
    expect(bs.is_balanced).toBe(true)
    expect(bs.warnings[0].code).toBe('opening_unbalanced')
    const eq = sectionOf(bs, 'equity')
    const sus = eq.groups.find((g: any) => g.key === 'equity:opening-difference')
    expect(sus.items[0]).toMatchObject({ name: OPENING_DIFF_LABEL, amount: 5_000, synthetic: true })

    const tb = buildTrialBalance(balances)
    expect(tb.opening_difference).toBe(5_000)
    expect(tb.isBalanced).toBe(true)
    const line = tb.rows.find((r: any) => r.id === 'opening-difference')
    expect(line).toMatchObject({ closing_debit: 0, closing_credit: 5_000, synthetic: true })
  })

  it('a credit-heavy opening difference goes to the debit side of the trial balance', () => {
    const ledgers = CHART.map((l) =>
      l.ledger_code === '3100' ? { ...l, opening_balance: 2_500, opening_balance_type: 'credit' } : l,
    )
    const tb = buildTrialBalance(computeLedgerBalances(ledgers, balancedEntries(), PERIOD))
    expect(tb.opening_difference).toBe(-2_500)
    expect(tb.rows.find((r: any) => r.id === 'opening-difference')).toMatchObject({ closing_debit: 2_500, closing_credit: 0 })
    expect(tb.isBalanced).toBe(true)
  })

  it('still reports a one-sided POSTING as unbalanced (the suspense line only absorbs openings)', () => {
    const entries = [...balancedEntries(), entry('1001', '2026-03-20', 700, 0)]
    const balances = computeLedgerBalances(CHART, entries, PERIOD)
    const bs = buildBalanceSheet(balances, PERIOD)
    expect(bs.opening_difference).toBe(0)
    expect(bs.is_balanced).toBe(false)
    expect(bs.difference).toBe(700)
    expect(bs.warnings[0].code).toBe('tb_unbalanced')
    expect(buildTrialBalance(balances).isBalanced).toBe(false)
  })

  it('excludes entries after date_to and ignores current_balance', () => {
    const ledgers = CHART.map((l) => (l.ledger_code === '1001' ? { ...l, current_balance: 999_999 } : l))
    const entries = [...balancedEntries(), ...post('2026-04-02', '1001', '5000', 77_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, entries, PERIOD), PERIOD)
    const cash = groupOf(bs, 'current_assets', 'Assets-Current').items.find((i: any) => i.code === '1001')
    expect(cash.amount).toBe(1_000_000 - 300_000 + 200_000 + 150_000 + 90_000 + 5_000 - 20_000 - 8_000 - 2_000 - 500 - 1_500 - 25_000 - 4_000)
    expect(bs.is_balanced).toBe(true)
  })

  it('keeps an inactive ledger that still carries a balance', () => {
    const ledgers = CHART.map((l) => (l.ledger_code === '1010' ? { ...l, is_active: false } : l))
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, balancedEntries(), PERIOD), PERIOD)
    const loan = groupOf(bs, 'current_assets', 'Assets-Current (Other Receivable)').items[0]
    expect(loan.code).toBe('1010')
    expect(loan.is_inactive).toBe(true)
    expect(bs.is_balanced).toBe(true)
  })

  it('flags two ledgers carrying the same opening balance (1001 / 10001 Main Cash)', () => {
    const ledgers = [
      ledger('1001', 'Main Cash', 'asset', 'Assets-Current', { opening_balance: 126136.75 }),
      ledger('10001', 'MAIN CASH -ACC', 'asset', 'Assets-Current', { opening_balance: 126136.75 }),
    ]
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, [], {}), {})
    // both are still shown — a data decision, not something the report hides
    expect(groupOf(bs, 'current_assets', 'Assets-Current').items).toHaveLength(2)
    expect(bs.warnings.some((w: any) => w.code === 'duplicate_opening')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('financial statements — header / sub-ledgers', () => {
  const banks = [
    ledger('1002', 'Bank Accounts', 'asset', 'Assets-Current'),
    ledger('1002-1', 'Commercial Bank', 'asset', 'Assets-Current'),
    ledger('1002-4', 'HNB', 'asset', 'Assets-Current'),
    ledger('3100', 'Stated Capital', 'equity', 'Equity'),
  ]

  it('shows the header as a sub-heading over its sub-ledgers without double counting a roll-up balance', () => {
    const entries = [
      ...post('2026-03-01', '1002-1', '3100', 60_000),
      ...post('2026-03-01', '1002-4', '3100', 40_000),
      // header carries a roll-up copy of its children (100,000) against capital
      ...post('2026-03-01', '1002', '3100', 100_000),
    ]
    const ledgers = banks
    const bs = buildBalanceSheet(computeLedgerBalances(ledgers, entries, {}), {})
    const items = groupOf(bs, 'current_assets', 'Assets-Current').items
    expect(items.map((i: any) => [i.kind, i.code])).toEqual([
      ['header', '1002'],
      ['ledger', '1002-1'],
      ['ledger', '1002-4'],
      ['header_total', ''],
    ])
    expect(items[3].amount).toBe(100_000)
    expect(sectionOf(bs, 'current_assets').total).toBe(100_000) // not 200,000
    expect(bs.warnings.some((w: any) => w.code === 'header_rollup')).toBe(true)
  })

  it('counts a header with zero own balance as the sum of its sub-ledgers, once', () => {
    const entries = [...post('2026-03-01', '1002-1', '3100', 60_000), ...post('2026-03-01', '3100', '1002-4', 10_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(banks, entries, {}), {})
    expect(sectionOf(bs, 'current_assets').total).toBe(50_000)
    expect(bs.is_balanced).toBe(true)
  })

  it('keeps a header ledger with its own postings as its own line', () => {
    const entries = [...post('2026-03-01', '1002-1', '3100', 60_000), ...post('2026-03-01', '1002', '3100', 7_000)]
    const bs = buildBalanceSheet(computeLedgerBalances(banks, entries, {}), {})
    const items = groupOf(bs, 'current_assets', 'Assets-Current').items
    expect(items.find((i: any) => i.name === 'Bank Accounts (own balance)').amount).toBe(7_000)
    expect(sectionOf(bs, 'current_assets').total).toBe(67_000)
    expect(bs.is_balanced).toBe(true)
  })

  it('hides zero-balance ledgers on request but keeps category headings', () => {
    const bs = buildBalanceSheet(computeLedgerBalances(banks, post('2026-03-01', '1002-1', '3100', 1_000), {}), {})
    const g = groupOf(bs, 'current_assets', 'Assets-Current')
    expect(visibleStatementItems(g, true).map((i: any) => i.code)).toEqual(['1002', '1002-1', ''])
    const lines = statementLines(bs, { hideZero: true })
    expect(lines.some((l: any) => l.kind === 'title' && l.label === 'Assets-Current (Other Receivable)')).toBe(true)
    expect(lines.some((l: any) => l.kind === 'item' && l.code === '1002-4')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
describe('financial statements service — data loading', () => {
  beforeEach(() => sb.mock.reset())

  it('pages through cashbook entries past the 1000-row PostgREST limit', async () => {
    const ledgers = [ledger('1001', 'Main Cash', 'asset', 'Assets-Current'), ledger('5000', 'Sales', 'income', 'Revenue')]
    const page1 = Array.from({ length: STATEMENT_PAGE_SIZE }, () => entry('1001', '2026-03-01', 10, 0))
    const page2 = Array.from({ length: 5 }, () => entry('1001', '2026-03-02', 10, 0))
    const credits = [entry('5000', '2026-03-02', 0, 10_050)]
    sb.mock.queue('finance_ledgers', { data: ledgers })
    sb.mock.queue('finance_cashbook_entries', { data: page1 }, { data: [...page2, ...credits] })

    const bs = await financeStatementsService.generateBalanceSheet({ date_to: '2026-03-31' })

    const q = sb.mock.on('finance_cashbook_entries')
    expect(q).toHaveLength(2)
    expect(calls(q[0], 'range')[0].args).toEqual([0, STATEMENT_PAGE_SIZE - 1])
    expect(calls(q[1], 'range')[0].args).toEqual([STATEMENT_PAGE_SIZE, 2 * STATEMENT_PAGE_SIZE - 1])
    expect(calls(q[0], 'lte')[0].args).toEqual(['entry_date', '2026-03-31'])
    // all 1,005 debit rows counted
    expect(groupOf(bs, 'current_assets', 'Assets-Current').total).toBe(10_050)
    expect(bs.profit_for_period).toBe(10_050)
    expect(bs.is_balanced).toBe(true)
  })

  it('applies the branch filter to entries, not to the company-level ledgers', async () => {
    sb.mock.queue('finance_ledgers', { data: [] })
    sb.mock.queue('finance_cashbook_entries', { data: [] })
    await financeStatementsService.generateTrialBalance({ branch_id: 'b1' })
    expect(calls(sb.mock.on('finance_ledgers')[0], 'eq')).toHaveLength(0)
    expect(calls(sb.mock.on('finance_cashbook_entries')[0], 'eq')[0].args).toEqual(['branch_id', 'b1'])
  })
})
