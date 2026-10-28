/**
 * Builds an employee_loans INSERT payload using the REAL table columns
 * (hr_payroll.sql: loan_amount, monthly_installment, total_paid,
 * remaining_balance, loan_date, expected_completion_date, status, reason).
 *
 * LoansTab previously sent remaining_amount / installments_paid /
 * total_installments / installment_amount / start_date, none of which exist,
 * so every insert failed.
 */

export interface LoanForm {
  employee_id: string | null
  loan_amount: number | string | null
  total_installments: number | string | null
  installment_amount: number | string | null
  start_date: string | null
  reason?: string | null
}

export interface BranchLike {
  id?: string | null
  company_id?: string | null
}

export interface LoanInsert {
  company_id: string
  branch_id: string
  employee_id: string
  loan_amount: number
  monthly_installment: number
  total_paid: number
  remaining_balance: number
  loan_date: string
  expected_completion_date: string
  status: 'pending'
  reason: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Last day of the month that is `monthsAhead` months after `isoDate`'s month. */
export function lastDayOfMonthOffset(isoDate: string, monthsAhead: number): string {
  const [y, m] = isoDate.split('-').map(Number)
  // Date.UTC(y, m + monthsAhead, 0) = day 0 of the following month = last day.
  const d = new Date(Date.UTC(y, m - 1 + monthsAhead + 1, 0))
  return d.toISOString().slice(0, 10)
}

export function buildLoanInsert(form: LoanForm, branch: BranchLike | null | undefined): LoanInsert {
  const amount = Number(form.loan_amount)
  const n = Math.trunc(Number(form.total_installments))
  let installment = Number(form.installment_amount)

  if (!form.employee_id) throw new Error('Select an employee')
  if (!branch?.id || !branch?.company_id) throw new Error('No branch selected')
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid loan amount')
  if (!Number.isFinite(n) || n < 1) throw new Error('Number of installments must be at least 1')
  if (!Number.isFinite(installment) || installment <= 0) installment = amount / n
  installment = round2(Math.min(installment, amount))

  const loanDate = form.start_date || new Date().toISOString().slice(0, 10)
  // installments needed at this installment amount (the last one may be smaller)
  const months = Math.ceil(round2(amount) / installment)

  return {
    company_id: branch.company_id,
    branch_id: branch.id,
    employee_id: form.employee_id,
    loan_amount: round2(amount),
    monthly_installment: installment,
    total_paid: 0,
    remaining_balance: round2(amount),
    loan_date: loanDate,
    // One month of slack: if the loan month's payroll already ran, recovery
    // starts next month. Payroll caps deductions at remaining_balance (#135),
    // so a later completion date can never over-deduct, while an early one
    // would stop recovery before the loan is repaid.
    expected_completion_date: lastDayOfMonthOffset(loanDate, months),
    status: 'pending',
    reason: form.reason ? String(form.reason) : null,
  }
}
