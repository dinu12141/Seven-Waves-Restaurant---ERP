// ═══════════════════════════════════════════════════════════════════════════════
// Finance Dashboard service — loads the GL + sub-ledgers and hands them to the
// pure builder. Revenue / expenses / profit / cash & bank come from the GL
// (finance_cashbook_entries), AR / AP from their posted sub-ledgers.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { fetchAllPages } from './finance-statements.service'
import { buildDashboardFigures, localDateKey, recentPostings } from './finance-dashboard.builder'
import { AR_OPEN_STATUSES, receivableBalance, sumAmounts } from 'src/services/finance/arAllocation'

/** AP bills that are in the GL and still owed (same rule as Payables). */
export const DASHBOARD_AP_STATUSES = ['posted', 'partial_paid']
/** Payroll runs whose net pay is still owed to staff. */
export const PAYROLL_DUE_STATUSES = ['approved', 'processed', 'posted']

function check(res, what) {
  if (res.error) throw new Error(`${what}: ${res.error.message || res.error}`)
  return res.data || []
}

export const financeDashboardService = {
  /**
   * @param {object} p
   * @param {string} [p.branchId]
   * @param {string} p.kpiFrom   KPI period start (YYYY-MM-DD)
   * @param {string} [p.kpiTo]   KPI period end (default: today)
   * @param {number} [p.bucketCount]
   * @param {(e:object)=>number} [p.bucketOf]
   */
  async load({ branchId = null, kpiFrom, kpiTo, bucketCount = 0, bucketOf = null } = {}) {
    const to = kpiTo || localDateKey()
    const [ledgers, entries, accountsRes, arRes, apRes, payrollRes] = await Promise.all([
      fetchAllPages(() =>
        supabase
          .from('finance_ledgers')
          .select('id, ledger_code, ledger_name, ledger_type, account_group, opening_balance, opening_balance_type, deleted_at')
          .order('ledger_code')
          .order('id'),
      ),
      fetchAllPages(() => {
        let q = supabase
          .from('finance_cashbook_entries')
          .select('id, branch_id, source_type, source_id, entry_date, ledger_id, account_id, description, debit_amount, credit_amount, created_at')
          .lte('entry_date', to)
          .order('entry_date')
          .order('id')
        if (branchId) q = q.eq('branch_id', branchId)
        return q
      }),
      supabase
        .from('finance_accounts')
        .select('id, registered_name, account_type, ledger_id, current_balance, deleted_at')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('registered_name'),
      supabase
        .from('customer_receivables')
        .select('balance, total_amount, paid_amount, written_off_amount, status')
        .in('status', [...AR_OPEN_STATUSES]),
      supabase
        .from('ap_invoices')
        .select('balance_due, status')
        .in('status', DASHBOARD_AP_STATUSES)
        .gt('balance_due', 0),
      supabase
        .from('payroll_runs')
        .select('total_net, status, period_end')
        .in('status', PAYROLL_DUE_STATUSES),
    ])

    const accounts = check(accountsRes, 'Accounts')
    const figures = buildDashboardFigures({ ledgers, entries, accounts, kpiFrom, kpiTo: to, bucketCount, bucketOf })

    // Sub-ledgers: a failure here must not blank the GL figures.
    const outstandingAR = arRes.error ? null : sumAmounts((arRes.data || []).map((r) => receivableBalance(r)))
    const outstandingAP = apRes.error
      ? null
      : Math.round((apRes.data || []).reduce((s, p) => s + Number(p.balance_due || 0), 0) * 100) / 100
    const payrollDue = payrollRes.error
      ? null
      : Math.round((payrollRes.data || []).reduce((s, r) => s + Number(r.total_net || 0), 0) * 100) / 100

    const warnings = [...figures.warnings]
    if (arRes.error) warnings.push(`Receivables could not be loaded: ${arRes.error.message}`)
    if (apRes.error) warnings.push(`Payables could not be loaded: ${apRes.error.message}`)
    if (payrollRes.error) warnings.push(`Payroll could not be loaded: ${payrollRes.error.message}`)

    return {
      ...figures,
      warnings,
      outstandingAR,
      outstandingAP,
      payrollDue,
      recent: recentPostings(entries, ledgers, 5),
    }
  },
}
