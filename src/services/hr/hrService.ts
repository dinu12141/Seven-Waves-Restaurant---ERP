// Seven Waves ERP — HR & Payroll Service
// @deprecated QA 2026-10-28: not imported anywhere. hr_run_payroll / hr_approve_payroll RPCs
// do not exist live and attendance_records has no `source` column. Use process_monthly_payroll,
// approve_salary_final and fn_post_payroll_run (see PayrollPage.vue). Do not wire this up as-is.
import { supabase } from 'src/boot/supabase'
import { localYmd } from './hrDates'
import type { Employee, PayrollRun, Payslip, AttendanceRecord, LeaveRequest, RpcResult, UUID } from 'src/types/erp.types'

export async function runPayroll(branchId: UUID, periodStart: string, periodEnd: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('hr_run_payroll', { p_branch_id: branchId, p_period_start: periodStart, p_period_end: periodEnd })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function approvePayroll(runId: UUID): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('hr_approve_payroll', { p_run_id: runId })
  if (error) return { success: false, error: error.message }
  return data as RpcResult
}

export async function getEmployees(branchId: UUID): Promise<Employee[]> {
  const { data } = await supabase.from('employees').select('*, departments(name), designations(title)')
    .eq('branch_id', branchId).eq('is_active', true).order('first_name')
  return (data || []) as unknown as Employee[]
}

export async function getPayrollRuns(branchId: UUID): Promise<PayrollRun[]> {
  const { data } = await supabase.from('payroll_runs').select('*').eq('branch_id', branchId).order('period_start', { ascending: false })
  return (data || []) as PayrollRun[]
}

export async function getPayslips(runId: UUID): Promise<Payslip[]> {
  const { data } = await supabase.from('payslips').select('*, employees(first_name, last_name)').eq('payroll_run_id', runId)
  return (data || []) as unknown as Payslip[]
}

export async function getAttendance(branchId: UUID, date: string): Promise<AttendanceRecord[]> {
  const { data } = await supabase.from('attendance_records').select('*, employees(first_name, last_name)')
    .eq('branch_id', branchId).eq('attendance_date', date)
  return (data || []) as unknown as AttendanceRecord[]
}

export async function clockIn(employeeId: UUID, branchId: UUID, companyId: UUID): Promise<RpcResult> {
  const { error } = await supabase.from('attendance_records').upsert({
    company_id: companyId, branch_id: branchId, employee_id: employeeId,
    attendance_date: localYmd(), clock_in: new Date().toISOString(), status: 'present', source: 'app',
  }, { onConflict: 'employee_id,attendance_date' })
  return error ? { success: false, error: error.message } : { success: true }
}

export async function getLeaveRequests(branchId: UUID, status?: string): Promise<LeaveRequest[]> {
  let query = supabase.from('leave_requests').select('*, employees(first_name, last_name)')
    .eq('branch_id', branchId).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data || []) as unknown as LeaveRequest[]
}

export async function approveLeave(requestId: UUID): Promise<RpcResult> {
  const { error } = await supabase.from('leave_requests').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', requestId)
  return error ? { success: false, error: error.message } : { success: true }
}
