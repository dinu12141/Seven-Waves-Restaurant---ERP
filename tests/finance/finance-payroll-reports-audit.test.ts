// Payroll → GL posting, GL-based reports (monthly / cash flow / COGS), audit log merge.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sb = vi.hoisted(() => ({ mock: null as any }))
vi.mock('src/boot/supabase', async () => {
  const { createSupabaseMock } = await import('../helpers/supabaseMock')
  sb.mock = createSupabaseMock()
  return { supabase: sb.mock.client }
})

import {
  summarizeRunSlips,
  runGlStatus,
  canPostRun,
  projectMonthlySalary,
  payslipLines,
  payingAccountOptions,
  financePayrollService,
} from 'src/modules/finance/services/finance-payroll.service'
import {
  buildMonthlySummary,
  buildCashFlow,
  buildGlCogs,
  cashFlowActivity,
} from 'src/modules/finance/services/finance-reports.builder'
import { normalizeAuditRows, actionKind, auditDateBounds } from 'src/modules/finance/services/finance-audit.service'
import { postPayrollToJournal } from 'src/services/financeService'

const L = (id: string, code: string, name: string, type: string, group: string | null, over = {}) => ({
  id, ledger_code: code, ledger_name: name, ledger_type: type, account_group: group,
  opening_balance: 0, opening_balance_type: 'debit', is_active: true, ...over,
})
let n = 0
const E = (ledger: string, date: string, dr: number, cr: number, src = 'x', sid: string | null = 's1') => ({
  id: `e${++n}`, ledger_id: ledger, entry_date: date, debit_amount: dr, credit_amount: cr,
  source_type: src, source_id: sid, created_at: `${date}T10:00:00Z`,
})

const ledgers = [
  L('cash', '1001', 'Cash', 'asset', 'Assets-Current', { is_cashbook_ledger: true, opening_balance: 1000 }),
  L('bank', '1002', 'Bank', 'asset', 'Assets-Current', { is_bank_ledger: true }),
  L('rev', '4000', 'Food Sales', 'income', 'Revenue'),
  L('cos', '5000', 'Food Cost', 'expense', 'Cost of Sales'),
  L('sal', '7000', 'Salaries', 'expense', 'Admin and Operation Expenses'),
  L('rent', '7100', 'Rent', 'expense', 'Admin and Operation Expenses'),
  L('ppe', '1500', 'Kitchen Equipment', 'asset', 'Assets-Non Current'),
  L('loan', '2500', 'Bank Loan', 'liability', 'Non Current Liabilities'),
  L('cap', '3000', 'Capital', 'equity', 'Equity'),
  L('ap', '2001', 'Creditors', 'liability', 'Current Liabilities'),
]

describe('payroll GL helpers', () => {
  const slips = [
    { gross_salary: 100, net_salary: 80, total_deductions: 20, epf_employee: 8, epf_employer: 12, etf_employer: 3, finance_posted_at: '2026-10-01' },
    { gross_salary: 200, net_salary: 150, total_deductions: 50, epf_employee: 16, epf_employer: 24, etf_employer: 6 },
    { gross_salary: 50, net_salary: 40, total_deductions: 10, is_held: true },
    { gross_salary: 999, net_salary: 999, payment_status: 'cancelled' },
  ]
  it('summarises posted / pending / held / cancelled', () => {
    const s = summarizeRunSlips(slips)
    expect(s).toMatchObject({ count: 4, posted: 1, pending: 1, held: 1, cancelled: 1, pendingNet: 150, heldNet: 40, net: 270 })
    expect(s.pendingEpfEmployer).toBe(24)
  })
  it('only approved/paid runs with pending slips are postable', () => {
    const s = summarizeRunSlips(slips)
    expect(canPostRun({ status: 'approved' }, s)).toBe(true)
    expect(canPostRun({ status: 'processed' }, s)).toBe(false)
    expect(runGlStatus({ status: 'approved' }, s)).toBe('partial')
    expect(runGlStatus({ status: 'paid' }, summarizeRunSlips([slips[0]]))).toBe('posted')
  })
  it('payslip lines reconcile to gross and total deductions', () => {
    const p = { basic_salary: 50000, total_allowances: 5000, overtime_amount: 1000, gross_salary: 55500,
      epf_employee: 4000, loan_deduction: 1000, total_deductions: 5500 }
    const { earnings, deductions } = payslipLines(p)
    expect(earnings.reduce((a, l) => a + l.amount, 0)).toBe(55500)
    expect(earnings.at(-1)?.label).toMatch(/Attendance/)
    expect(deductions.reduce((a, l) => a + l.amount, 0)).toBe(5500)
  })
  it('salary projection mirrors the payroll engine (EPF on basic, in-range items only)', () => {
    const r = projectMonthlySalary({
      structure: { basic_salary: 50000, housing_allowance: 2000, other_deductions: 500 },
      allowances: [{ amount: 3000, effective_from: '2026-01-01' }, { amount: 999, is_active: false }],
      additions: [{ amount: 1000, start_date: '2026-10-05' }, { amount: 7, start_date: '2026-12-01' }],
      deductions: [{ amount: 1500, start_date: '2026-09-01', end_date: '2026-10-31' }, { amount: 9, start_date: '2026-01-01', end_date: '2026-02-01' }],
      periodStart: '2026-10-01', periodEnd: '2026-10-31',
    })
    expect(r).toMatchObject({ gross: 56000, epfEmployee: 4000, totalDeductions: 6000, net: 50000, employerCost: 63500 })
  })
  it('paying accounts are finance_accounts with a ledger, filtered by method', () => {
    const accs = [
      { id: 'a1', ledger_id: 'cash', account_type: 'cash', registered_name: 'Main Cash' },
      { id: 'a2', ledger_id: 'bank', account_type: 'bank', registered_name: 'BOC' },
      { id: 'a3', ledger_id: null, account_type: 'bank', registered_name: 'No ledger' },
    ]
    expect(payingAccountOptions(accs, 'cash').map((o) => o.value)).toEqual(['a1'])
    expect(payingAccountOptions(accs, 'bank_transfer').map((o) => o.value)).toEqual(['a2'])
  })
})

describe('payroll posting service', () => {
  beforeEach(() => sb.mock.reset())
  it('posts only through fn_post_payroll_run (→ post_payroll_to_finance_v2)', async () => {
    sb.mock.queueRpc('fn_post_payroll_run', { data: { success: true, slips_paid: 3 } })
    const r = await financePayrollService.postRunToFinance({ runId: 'r1', accountId: 'a1', paymentMethod: 'cash', postingDate: '2026-09-30' })
    expect(r.slips_paid).toBe(3)
    expect(sb.mock.rpcCalls).toEqual([{ name: 'fn_post_payroll_run', args: {
      p_payroll_run_id: 'r1', p_cash_bank_account_id: 'a1', p_payment_method: 'cash', p_posting_date: '2026-09-30' } }])
    expect(sb.mock.on('journal_entries')).toHaveLength(0)
  })
  it('surfaces RPC errors and payload failures, never falls back', async () => {
    sb.mock.queueRpc('fn_post_payroll_run', { error: { message: 'already posted' } })
    await expect(financePayrollService.postRunToFinance({ runId: 'r1', accountId: 'a1' })).rejects.toMatchObject({ message: 'already posted' })
    sb.mock.queueRpc('fn_post_payroll_run', { data: { success: false, error: 'imbalance' } })
    await expect(financePayrollService.postRunToFinance({ runId: 'r1', accountId: 'a1' })).rejects.toThrow('imbalance')
    expect(sb.mock.rpcCalls.every((c: any) => c.name === 'fn_post_payroll_run')).toBe(true)
  })
  it('requires an account and refuses payment references on unposted slips', async () => {
    await expect(financePayrollService.postRunToFinance({ runId: 'r1', accountId: null })).rejects.toThrow(/Cash\/Bank/)
    await expect(financePayrollService.recordSlipPaymentReference({ id: 'p1' }, { payment_method: 'cash', payment_reference: 'x', payment_date: '2026-10-01' })).rejects.toThrow(/not booked/)
    expect(sb.mock.on('payslips')).toHaveLength(0)
  })
  it('legacy postPayrollToJournal is retired and writes nothing', async () => {
    const r = await postPayrollToJournal('c1', { total_gross: 1 })
    expect(r.error).toBeTruthy()
    expect(sb.mock.on('journal_entries')).toHaveLength(0)
  })
})

describe('GL reports', () => {
  const entries = [
    E('cash', '2026-10-02', 1000, 0, 'pos', 'o1'), E('rev', '2026-10-02', 0, 1000, 'pos', 'o1'),
    E('cos', '2026-10-02', 300, 0, 'inv', 'i1'), E('ap', '2026-10-02', 0, 300, 'inv', 'i1'),
    E('ap', '2026-10-03', 300, 0, 'pay', 'p1'), E('bank', '2026-10-03', 0, 300, 'pay', 'p1'),
    E('sal', '2026-10-25', 400, 0, 'payroll', 'r1'), E('bank', '2026-10-25', 0, 400, 'payroll', 'r1'),
    E('ppe', '2026-10-10', 2000, 0, 'v', 'v1'), E('bank', '2026-10-10', 0, 2000, 'v', 'v1'),
    E('bank', '2026-10-11', 5000, 0, 'v', 'v2'), E('loan', '2026-10-11', 0, 5000, 'v', 'v2'),
    E('bank', '2026-10-12', 500, 0, 't', 't1'), E('cash', '2026-10-12', 0, 500, 't', 't1'),
    E('cash', '2026-09-30', 200, 0, 'v', 'old'), E('cap', '2026-09-30', 0, 200, 'v', 'old'),
  ]
  it('monthly summary splits income, cost of sales, wages and other expenses', () => {
    const m = buildMonthlySummary(ledgers, entries, 2026)
    const oct = m.monthly[9]
    expect(oct).toMatchObject({ revenue: 1000, cost_of_sales: 300, wages: 400, expenses: 0, profit: 300 })
    expect(m.yearProfit).toBe(300)
  })
  it('cash flow classifies counterparties and reconciles to cash ledgers', () => {
    const cf = buildCashFlow({ ledgers, accounts: [], entries, dateFrom: '2026-10-01', dateTo: '2026-10-31' })
    expect(cf.opening_balance).toBe(1200)
    expect(cf.net_operating).toBe(300) // +1000 sales −300 creditors −400 salaries
    expect(cf.net_investing).toBe(-2000)
    expect(cf.net_financing).toBe(5000)
    expect(cf.closing_balance).toBe(1200 + 3300)
    expect(cf.reconciliation_difference).toBe(0)
    expect(cf.operating_activities.find((r: any) => /Food Sales/.test(r.category))?.amount).toBe(1000)
  })
  it('cash flow activity mapping', () => {
    expect(cashFlowActivity(ledgers[6])).toBe('investing')
    expect(cashFlowActivity(ledgers[7])).toBe('financing')
    expect(cashFlowActivity(ledgers[8])).toBe('financing')
    expect(cashFlowActivity(ledgers[9])).toBe('operating')
  })
  it('COGS = Cost of Sales ledger movements vs revenue', () => {
    const c = buildGlCogs(ledgers, entries, '2026-10-01', '2026-10-31')
    expect(c).toMatchObject({ revenue: 1000, total_cogs: 300, gross_profit: 700, gp_percent: 70 })
    expect(c.rows).toHaveLength(1)
  })
})

describe('finance audit log', () => {
  it('merges client, server and payroll-posting rows newest first', () => {
    const rows = normalizeAuditRows({
      financeLogs: [{ id: 1, action: 'voucher_posted', entity_type: 'finance_voucher', created_at: '2026-10-02T00:00:00Z', new_values: { voucher_no: 'PV-1', amount: 10 } }],
      serverLogs: [{ id: 2, action: 'cheque_bounced', table_name: 'finance_cheques', created_at: '2026-10-03T00:00:00Z', new_data: { cheque_no: '77' } }],
      payrollPostings: [{ id: 3, payroll_run_id: 'r1', posted_at: '2026-10-01T00:00:00Z', total_gross: 5, total_net: 4, posting_version: 'v2', slips_posted: 2 }],
    })
    expect(rows.map((r) => r.source)).toEqual(['server', 'finance', 'payroll'])
    expect(rows[1].description).toContain('PV-1')
    expect(rows[2].action).toBe('payroll_posted')
  })
  it('action badges and inclusive date bounds', () => {
    expect(actionKind('voucher_cancelled')).toBe('danger')
    expect(actionKind('voucher_posted')).toBe('info')
    expect(actionKind('account_created')).toBe('success')
    const b = auditDateBounds('2026-10-01', '2026-10-01')
    expect(new Date(b.to!).getTime() - new Date(b.from!).getTime()).toBeGreaterThan(86_000_000)
  })
})
