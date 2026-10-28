/**
 * Maps a generic Approvals Center action ('approved' | 'rejected') to the
 * status value each HR table actually allows.
 *
 * employee_loans.chk_loan_status (hr_payroll.sql):
 *   'pending' | 'active' | 'completed' | 'cancelled' | 'defaulted'
 * → there is no 'approved' / 'rejected' for loans. Writing them violated the
 *   CHECK constraint, so loan approvals always failed.
 */

export type HrApprovalType = 'leaves' | 'advances' | 'loans' | 'expenses'
export type HrApprovalAction = 'approved' | 'rejected'

export const LOAN_STATUSES = ['pending', 'active', 'completed', 'cancelled', 'defaulted'] as const

export function hrTargetStatus(type: HrApprovalType, action: HrApprovalAction): string {
  if (type === 'loans') return action === 'approved' ? 'active' : 'cancelled'
  return action
}

/**
 * Advances and loans are staff receivables: approving one means paying it out
 * (Finance #134b disburse_staff_receivable), never a bare status flip.
 */
export function requiresDisbursement(type: HrApprovalType, action: HrApprovalAction): boolean {
  return action === 'approved' && (type === 'advances' || type === 'loans')
}
