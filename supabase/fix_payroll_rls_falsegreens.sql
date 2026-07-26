-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — payroll RLS false-greens (findings #70 / #71)
-- Seven Waves Restaurant ERP
--
-- Two payroll tables had RLS ENABLED but effectively wide-open policies on
-- high-PII data (any authenticated user could read/write all companies'
-- payroll). Replaced with the scoping pattern used by payroll_records/payslips:
--   admin (is_admin) | HR/finance + branch scope | employee self-read.
--
-- Applied to live DB 2026-07-25 (DBA, task #82 follow-up) via Management API.
-- Approved by Security (#71) and QA (#70). Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- #71 — payroll_finance_postings: broken correlated-subquery "company isolation"
--   (SELECT payroll_finance_postings.company_id FROM profiles ...) referenced the
--   OUTER row's own column (profiles has no company_id) => USING(true) in effect.
--   Table has branch_id directly, so scope on it.
DROP POLICY IF EXISTS payroll_finance_postings_company_isolation ON public.payroll_finance_postings;
DROP POLICY IF EXISTS pfp_admin ON public.payroll_finance_postings;
DROP POLICY IF EXISTS pfp_finance ON public.payroll_finance_postings;
CREATE POLICY pfp_admin ON public.payroll_finance_postings FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pfp_finance ON public.payroll_finance_postings FOR ALL TO authenticated
  USING ((is_finance() OR is_hr()) AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK ((is_finance() OR is_hr()) AND branch_id = ANY(auth_branch_ids()));

-- #70 — payroll_payments: only policy was FOR ALL TO public USING (auth.role()='authenticated')
--   => any logged-in user (waiter/cashier/kitchen) could read/write all payroll payments.
--   No branch_id column; scope via cycle_id -> payroll_cycles.branch_id, plus employee self-read.
DROP POLICY IF EXISTS fin_payroll_payments_auth ON public.payroll_payments;
DROP POLICY IF EXISTS pp_admin ON public.payroll_payments;
DROP POLICY IF EXISTS pp_hr_finance ON public.payroll_payments;
DROP POLICY IF EXISTS pp_self ON public.payroll_payments;
CREATE POLICY pp_admin ON public.payroll_payments FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pp_hr_finance ON public.payroll_payments FOR ALL TO authenticated
  USING ((is_hr() OR is_finance()) AND EXISTS (
    SELECT 1 FROM public.payroll_cycles pc
     WHERE pc.id = payroll_payments.cycle_id AND pc.branch_id = ANY(auth_branch_ids())))
  WITH CHECK ((is_hr() OR is_finance()) AND EXISTS (
    SELECT 1 FROM public.payroll_cycles pc
     WHERE pc.id = payroll_payments.cycle_id AND pc.branch_id = ANY(auth_branch_ids())));
CREATE POLICY pp_self ON public.payroll_payments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
     WHERE e.id = payroll_payments.employee_id AND e.profile_id = auth.uid()));
