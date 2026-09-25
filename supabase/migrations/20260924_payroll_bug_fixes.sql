-- =====================================================================
-- Migration: 20260924_payroll_bug_fixes.sql
-- Fixes:
--   1. Add salary_advance_deduction and employee_advance_deduction columns
--      to payslips so the two advance systems are separately visible in UI.
--   2. Backfill existing rows.
--   3. Fix day_salary absent deduction (now tracks absent days for display).
--   4. Update process_monthly_payroll with both new columns.
--   5. Update get_payslip_breakdown to return both advance amounts separately.
-- =====================================================================

-- 1. Add new columns
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS salary_advance_deduction  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_advance_deduction NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN public.payslips.salary_advance_deduction  IS 'Installment deductions from salary_advances table.';
COMMENT ON COLUMN public.payslips.employee_advance_deduction IS 'Lump-sum deductions from employee_advances table.';

-- 2. Backfill existing rows
UPDATE public.payslips
SET salary_advance_deduction  = COALESCE(advance_deduction, 0),
    employee_advance_deduction = 0
WHERE salary_advance_deduction = 0
  AND employee_advance_deduction = 0
  AND COALESCE(advance_deduction, 0) > 0;
