-- Seven Waves ERP — Critical RLS Security Fixes
-- Applied: 2026-07-17
-- Purpose: Add missing write policies to user_roles and profiles,
--          and add RLS to salary_structures.
-- All fixes are idempotent (DROP IF EXISTS before CREATE).

-- ============================================================
-- FIX 1: user_roles — missing INSERT/UPDATE/DELETE for admins
--         (SELECT policies already exist in rbac_rls.sql)
-- ============================================================

DROP POLICY IF EXISTS "user_roles_insert_admin" ON public.user_roles;
CREATE POLICY "user_roles_insert_admin" ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "user_roles_update_admin" ON public.user_roles;
CREATE POLICY "user_roles_update_admin" ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- NOTE: last-admin protection added in 20260801_protect_last_admin.sql —
-- keep the USING clause here in sync with that migration if this file is
-- ever re-applied wholesale (a plain is_admin() check re-opens the hole that
-- let any admin strip the last admin's role grant via raw table DELETE).
DROP POLICY IF EXISTS "user_roles_delete_admin" ON public.user_roles;
CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (
    is_admin()
    AND NOT (
      EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.name = 'admin')
      AND public.count_active_admins() <= 1
    )
  );

-- ============================================================
-- FIX 2: profiles — add HR/manager read access (SELECT) and
--         admin-only DELETE (currently no DELETE policy exists)
-- ============================================================

-- Allow managers and HR to look up employee profiles (needed for scheduling, payroll UI)
DROP POLICY IF EXISTS "profiles_select_manager_hr" ON public.profiles;
CREATE POLICY "profiles_select_manager_hr" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    is_manager()
    OR auth_has_role('hr')
    OR auth_has_role('finance')
  );

-- Admin can delete profiles (e.g., deactivated employees).
-- NOTE: last-admin protection added in 20260801_protect_last_admin.sql — a
-- plain is_admin() check here would let any admin hard-delete the last
-- remaining admin's profile via raw table DELETE, locking the system out.
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE
  TO authenticated
  USING (is_admin() AND NOT public.is_last_active_admin(id));

-- ============================================================
-- FIX 3: salary_structures — no RLS existed; add full coverage
-- ============================================================

ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;

-- Employees can read their own salary structure
DROP POLICY IF EXISTS "salary_structures_read_own" ON public.salary_structures;
CREATE POLICY "salary_structures_read_own" ON public.salary_structures
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR auth_has_role('hr')
    OR employee_id IN (
      SELECT id FROM public.employees WHERE profile_id = auth.uid()
    )
  );

-- Only admin and HR can write salary data
DROP POLICY IF EXISTS "salary_structures_write_hr_admin" ON public.salary_structures;
CREATE POLICY "salary_structures_write_hr_admin" ON public.salary_structures
  FOR ALL
  TO authenticated
  USING (is_admin() OR auth_has_role('hr'))
  WITH CHECK (is_admin() OR auth_has_role('hr'));

-- ============================================================
-- FIX 4: payments table — add amount > 0 and payment_method check
--         (addresses VULN-006 from security audit)
-- ============================================================

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payment_amount_positive;
ALTER TABLE public.payments
  ADD CONSTRAINT chk_payment_amount_positive CHECK (amount > 0);

-- payment_method CHECK omitted: live data contains 15+ values (cash, card, credit_card,
-- debit_card, mobile, qr, bank, bank_transfer, cheque, voucher, loyalty, wowcher, etc.)
-- Validation is enforced at the application layer (PaymentMethod type in erp.types.ts).
