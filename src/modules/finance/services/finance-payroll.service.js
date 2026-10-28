// ═══════════════════════════════════════════════════════════════════════════════
// Finance — Payroll service (payroll_runs / payslips → General Ledger)
// Seven Waves Restaurant (Pvt) Ltd
//
// HR processes and approves payroll (process_monthly_payroll → payroll_runs +
// payslips). Finance books it to the GL of record (finance_cashbook_entries +
// finance_ledgers) ONLY through the server RPC post_payroll_to_finance_v2
// (migration #129):
//     Dr 7000 Salaries / 7003 EPF 12% / 7004 ETF 3%
//     Cr 2003 EPF payable / 2004 ETF payable / 1004 staff recoveries /
//        2008 welfare / 2009 other deductions / paying cash-bank account (net)
// The RPC is idempotent per payslip (finance_posted_at) and marks posted slips
// paid, so nothing here writes ledgers, journals or payment rows itself.
//
// The legacy payroll_cycles / payroll_records tables and the client-side
// postPayrollToJournal (journal_entries only) are NOT part of the GL and must
// not be used.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (n) => Number(n) || 0

/** Run statuses post_payroll_to_finance_v2 accepts. */
export const POSTABLE_RUN_STATUSES = ['approved', 'paid']

export const isSlipHeld = (s) => s?.is_held === true || s?.payment_status === 'held'
export const isSlipCancelled = (s) => s?.payment_status === 'cancelled'
export const isSlipPosted = (s) => !!s?.finance_posted_at

/**
 * GL status of a run's payslips.
 *  posted   – already booked to the GL by v2
 *  pending  – released (not held, not cancelled) and still to be booked
 *  held     – on salary hold (excluded until HR releases them)
 */
export function summarizeRunSlips(slips = []) {
  const s = {
    count: 0,
    posted: 0,
    pending: 0,
    held: 0,
    cancelled: 0,
    gross: 0,
    deductions: 0,
    net: 0,
    pendingGross: 0,
    pendingNet: 0,
    pendingEpfEmployee: 0,
    pendingEpfEmployer: 0,
    pendingEtf: 0,
    postedNet: 0,
    heldNet: 0,
  }
  for (const p of slips || []) {
    if (!p) continue
    s.count += 1
    if (isSlipCancelled(p)) {
      s.cancelled += 1
      continue
    }
    s.gross += num(p.gross_salary)
    s.deductions += num(p.total_deductions)
    s.net += num(p.net_salary)
    if (isSlipPosted(p)) {
      s.posted += 1
      s.postedNet += num(p.net_salary)
    } else if (isSlipHeld(p)) {
      s.held += 1
      s.heldNet += num(p.net_salary)
    } else {
      s.pending += 1
      s.pendingGross += num(p.gross_salary)
      s.pendingNet += num(p.net_salary)
      s.pendingEpfEmployee += num(p.epf_employee)
      s.pendingEpfEmployer += num(p.epf_employer)
      s.pendingEtf += num(p.etf_employer)
    }
  }
  for (const k of ['gross', 'deductions', 'net', 'pendingGross', 'pendingNet', 'postedNet', 'heldNet',
    'pendingEpfEmployee', 'pendingEpfEmployer', 'pendingEtf']) s[k] = round2(s[k])
  return s
}

/** GL posting state of a run: 'not_approved' | 'nothing' | 'pending' | 'partial' | 'posted'. */
export function runGlStatus(run, summary) {
  if (!run || !POSTABLE_RUN_STATUSES.includes(run.status)) return 'not_approved'
  if (!summary || summary.count === 0) return 'nothing'
  if (summary.pending > 0) return summary.posted > 0 ? 'partial' : 'pending'
  if (summary.posted > 0) return summary.held > 0 ? 'partial' : 'posted'
  return 'nothing'
}

export function canPostRun(run, summary) {
  return !!run && POSTABLE_RUN_STATUSES.includes(run.status) && (summary?.pending || 0) > 0
}

/** Accounts the RPC accepts as the paying account (finance_accounts with a ledger). */
export function payingAccountOptions(accounts = [], paymentMethod = 'bank_transfer') {
  const wantCash = paymentMethod === 'cash'
  const usable = (accounts || []).filter((a) => a && a.ledger_id && a.is_active !== false && !a.deleted_at)
  const matches = usable.filter((a) => {
    const t = String(a.account_type || '').toLowerCase()
    const isCash = t === 'cash' || t === 'petty_cash' || t === 'cash_drawer'
    return wantCash ? isCash : !isCash
  })
  return (matches.length ? matches : usable).map((a) => ({
    value: a.id,
    label: [a.registered_name, a.bank_name, a.account_number].filter(Boolean).join(' · '),
    balance: num(a.current_balance),
    account_type: a.account_type,
  }))
}

/**
 * Projected monthly pay for one employee, mirroring process_monthly_payroll
 * (#135) for the given month: structure allowances + active employee
 * allowances + salary additions in range; EPF employee % on basic + salary
 * deductions in range + structure other_deductions. Attendance-driven items
 * (OT, late, no-pay, commission, loans/advances) are not projected.
 */
export function projectMonthlySalary({ structure, allowances = [], additions = [], deductions = [], periodStart, periodEnd }) {
  const inRange = (from, to) => (!from || !periodEnd || from <= periodEnd) && (!to || !periodStart || to >= periodStart)
  const basic = num(structure?.basic_salary)
  const structureAllowances =
    num(structure?.housing_allowance) + num(structure?.transport_allowance) +
    num(structure?.meal_allowance) + num(structure?.other_allowances)
  const activeAllowances = (allowances || []).filter(
    (a) => a && a.is_active !== false && inRange(a.effective_from, a.effective_to),
  )
  const allowanceTotal = structureAllowances + activeAllowances.reduce((s, a) => s + num(a.amount), 0)
  const additionTotal = (additions || [])
    .filter((a) => a && inRange(a.start_date, a.end_date))
    .reduce((s, a) => s + num(a.amount), 0)
  const dedRows = (deductions || []).filter((d) => d && inRange(d.start_date, d.end_date))
  const deductionTotal = dedRows.reduce((s, d) => s + num(d.amount), 0) + num(structure?.other_deductions)
  const epfEmployee = (basic * (structure?.epf_employee_pct ?? 8)) / 100
  const epfEmployer = (basic * (structure?.epf_employer_pct ?? 12)) / 100
  const etfEmployer = (basic * (structure?.etf_employer_pct ?? 3)) / 100
  const gross = basic + allowanceTotal + additionTotal
  const totalDeductions = deductionTotal + epfEmployee
  return {
    basic: round2(basic),
    structureAllowances: round2(structureAllowances),
    allowances: round2(allowanceTotal),
    additions: round2(additionTotal),
    deductions: round2(deductionTotal),
    epfEmployee: round2(epfEmployee),
    epfEmployer: round2(epfEmployer),
    etfEmployer: round2(etfEmployer),
    gross: round2(gross),
    totalDeductions: round2(totalDeductions),
    net: round2(gross - totalDeductions),
    employerCost: round2(gross + epfEmployer + etfEmployer),
  }
}

/** Month bounds (YYYY-MM-DD) for a local date. */
export function monthBounds(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` }
}

const SLIP_SUMMARY_COLUMNS =
  'id, payroll_run_id, gross_salary, total_deductions, net_salary, epf_employee, epf_employer, ' +
  'etf_employer, payment_status, is_held, finance_posted_at'

/** Itemised earnings / deductions of a payslip; remainders keep the totals exact. */
export function payslipLines(p) {
  if (!p) return { earnings: [], deductions: [] }
  const earnings = [
    ['Basic Salary', p.basic_salary],
    ['Allowances', p.total_allowances],
    ['Overtime', p.overtime_amount],
    ['Commission', p.commission_amount],
    ['Salary Additions', p.custom_additions],
  ]
    .filter(([, v]) => Math.abs(num(v)) >= 0.005)
    .map(([label, v]) => ({ label, amount: round2(v) }))
  const eRest = round2(num(p.gross_salary) - earnings.reduce((s, l) => s + l.amount, 0))
  if (Math.abs(eRest) >= 0.01) {
    earnings.push({
      label: eRest < 0 ? 'Attendance adjustments (late / no-pay)' : 'Other earnings (shift / adjustments)',
      amount: eRest,
    })
  }
  const deductions = [
    ['EPF Employee (8%)', p.epf_employee],
    ['Loan Recovery', p.loan_deduction],
    ['Advance Recovery', p.advance_deduction],
    ['Welfare', p.welfare_deduction],
    ['Salary Deductions', p.custom_deductions],
    ['Other Deductions', p.other_deductions],
  ]
    .filter(([, v]) => Math.abs(num(v)) >= 0.005)
    .map(([label, v]) => ({ label, amount: round2(v) }))
  const dRest = round2(num(p.total_deductions) - deductions.reduce((s, l) => s + l.amount, 0))
  if (Math.abs(dRest) >= 0.01) deductions.push({ label: 'Other recoveries', amount: dRest })
  return { earnings, deductions }
}

export const financePayrollService = {
  /** Payroll runs (newest first) with each run's payslip GL summary. */
  async listRuns({ status = null, branchId = null } = {}) {
    const runs = await fetchAllPages(() => {
      let q = supabase
        .from('payroll_runs')
        .select(
          'id, company_id, branch_id, period_start, period_end, run_date, status, total_gross, ' +
            'total_deductions, total_net, total_epf_employee, total_epf_employer, total_etf_employer, ' +
            'employee_count, approved_at, created_at',
        )
        .order('period_start', { ascending: false })
        .order('id')
      if (status) q = q.eq('status', status)
      if (branchId) q = q.eq('branch_id', branchId)
      return q
    })
    if (!runs.length) return []

    const ids = runs.map((r) => r.id)
    const [slips, branches] = await Promise.all([
      this.fetchSlipsForRuns(ids),
      supabase.from('branches').select('id, name'),
    ])
    const byRun = new Map()
    for (const s of slips) (byRun.get(s.payroll_run_id) || byRun.set(s.payroll_run_id, []).get(s.payroll_run_id)).push(s)
    const branchName = new Map((branches.data || []).map((b) => [b.id, b.name]))

    return runs.map((r) => {
      const summary = summarizeRunSlips(byRun.get(r.id) || [])
      return {
        ...r,
        cycle_name: `Payroll ${String(r.period_start || '').slice(0, 7)}`,
        branch_name: branchName.get(r.branch_id) || '',
        slip_summary: summary,
        gl_status: runGlStatus(r, summary),
      }
    })
  },

  async fetchSlipsForRuns(runIds, columns = SLIP_SUMMARY_COLUMNS) {
    const out = []
    // keep the IN() list short enough for the URL
    for (let i = 0; i < runIds.length; i += 50) {
      const chunk = runIds.slice(i, i + 50)
      const rows = await fetchAllPages(() =>
        supabase.from('payslips').select(columns).in('payroll_run_id', chunk).order('id'),
      )
      out.push(...rows)
    }
    return out
  },

  /** Payslips of one run with employee details. */
  async fetchRunPayslips(runId) {
    return fetchAllPages(() =>
      supabase
        .from('payslips')
        .select(
          '*, employees(first_name, last_name, full_name, employee_code, designations(title), departments(name))',
        )
        .eq('payroll_run_id', runId)
        .order('net_salary', { ascending: false })
        .order('id'),
    )
  },

  /** Active Finance cash/bank accounts (finance_accounts) — the RPC's paying account. */
  async fetchPayingAccounts() {
    const { data, error } = await supabase
      .from('finance_accounts')
      .select('id, registered_name, bank_name, account_type, account_number, current_balance, ledger_id, is_default, is_active, deleted_at')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('registered_name')
    if (error) throw error
    return data || []
  },

  /**
   * Books every released, not-yet-posted payslip of the run to the GL.
   * Throws on any error — never falls back to a client-side posting.
   */
  async postRunToFinance({ runId, accountId, paymentMethod = 'bank_transfer', postingDate = null }) {
    if (!runId) throw new Error('Select a payroll run.')
    if (!accountId) throw new Error('Select the Cash/Bank account the salaries are paid from.')
    // #146 wrapper: posts via post_payroll_to_finance_v2 dated on the run's
    // period end (or postingDate) and keeps payment_status='held' slips out.
    const { data, error } = await supabase.rpc('fn_post_payroll_run', {
      p_payroll_run_id: runId,
      p_cash_bank_account_id: accountId,
      p_payment_method: paymentMethod,
      p_posting_date: postingDate,
    })
    if (error) throw error
    if (data && data.success === false) throw new Error(data.error || 'Posting payroll to Finance failed.')
    return data
  },

  /**
   * Records the bank/cash reference of a payslip that is ALREADY booked to the
   * GL. It never touches ledgers: the cash credit was made by the v2 posting.
   */
  async recordSlipPaymentReference(slip, { payment_method, payment_reference, payment_date }, userId = null) {
    if (!slip?.id) throw new Error('Payslip missing.')
    if (!isSlipPosted(slip)) {
      throw new Error('This payslip is not booked to the General Ledger yet. Post the payroll run to Finance first.')
    }
    const { data, error } = await supabase
      .from('payslips')
      .update({
        payment_method: payment_method || slip.payment_method || 'bank_transfer',
        payment_reference: payment_reference || null,
        payment_date: payment_date || null,
        paid_by: slip.paid_by || userId || null,
      })
      .eq('id', slip.id)
      .not('finance_posted_at', 'is', null)
      .select('id')
    if (error) throw error
    if (!data || !data.length) throw new Error('Payslip was not updated (not posted to the GL, or no permission).')
    return data[0]
  },
}
