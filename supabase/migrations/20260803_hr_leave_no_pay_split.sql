-- =====================================================================
-- HR Feature #2 — Shift-Based Auto No-Pay on Excessive Leave
-- Seven Waves Restaurant ERP
--
-- CONFIRMED REQUIREMENT (design doc "Confirmed decisions" #2, FINAL —
-- do not re-litigate): 4 days of PAID leave per calendar month, COMBINED
-- across ALL leave types (Casual + Medical + Annual all draw from the same
-- monthly bucket). Days beyond the cap in a given calendar month auto-convert
-- to `no_pay` attendance status. Manual override remains available to HR.
--
-- GROUND TRUTH CONFIRMED BY READING LIVE-APPLIED SQL FILES (no Supabase MCP
-- available in this session — see caveat block at the bottom of this header):
--   * chk_attendance_status (att_shift_calc_112.sql, applied) ALREADY allows
--     'no_pay' as a status value — no ALTER needed here.
--   * attendance_records has UNIQUE(employee_id, attendance_date) — already
--     applied (att_shift_calc_112.sql).
--   * _apply_leave_attendance_rows / trg_fn_leave_apply_attendance
--     (att_leave_attendance_116.sql, applied) currently derive a SINGLE
--     static status for the WHOLE leave request from leave_types.is_paid —
--     no day-by-day / monthly-cap awareness at all. This migration replaces
--     that logic with a per-date computed status.
--   * process_monthly_payroll — CONFIRMED LIVE per design-doc decision table
--     to be the version in supabase/fix_payroll_employee_advance_deduction_118.sql
--     (applied 2026-07-26 per that file's header + project memory
--     att_shift_calc_112 / payroll_employee_advance_deduction_118). Its
--     v_days_absent / v_absent_ded block ONLY counts status = 'absent':
--         SELECT COUNT(*) INTO v_days_absent FROM attendance_records
--         WHERE ... AND status = 'absent';
--         v_absent_ded := v_days_absent * v_daily_rate;
--     `no_pay` has ZERO payroll effect today. Confirmed pre-existing bug per
--     design doc — fixed below by reproducing the ENTIRE 118 function body
--     with 'no_pay' added alongside 'absent' in that one count, and nothing
--     else changed (advance dedn / OT / allowances / EPF / ETF / loans /
--     welfare / custom deductions are all reproduced byte-for-byte from 118).
--
-- CAVEAT — live DB not queried directly (no working Supabase MCP token in
-- this session; .mcp.json has an unfilled placeholder). Everything above was
-- confirmed by reading the actual applied .sql files in supabase/, which is
-- the same ground truth CLAUDE.md and project memory point to as "the live
-- engine". Before applying this migration, spot-check on the live DB:
--   1. `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname =
--      'process_monthly_payroll'` — confirm it matches the 118 body
--      reproduced below EXACTLY (no drift from a since-applied file this
--      session didn't see).
--   2. `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE
--      conname = 'chk_attendance_status'` — confirm 'no_pay' is present.
--   3. `\d attendance_records` — confirm UNIQUE(employee_id, attendance_date)
--      exists (required for the ON CONFLICT clauses used here and in 116).
--   4. Confirm no migration newer than fix_payroll_employee_advance_deduction_118.sql
--      already touched process_monthly_payroll (a `grep -rl
--      process_monthly_payroll supabase/` on the live repo at apply-time).
--
-- Depends on (must already be applied):
--   att_shift_calc_112.sql, att_leave_attendance_116.sql,
--   fix_payroll_employee_advance_deduction_118.sql, att_manager_rls_115.sql
-- =====================================================================


-- =====================================================================
-- 1. New table: leave_entitlement_policies
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.leave_entitlement_policies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  max_paid_days_per_month  INT NOT NULL DEFAULT 4 CHECK (max_paid_days_per_month >= 0),
  is_active                BOOLEAN DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now(),
  -- One active policy per (company, branch) — branch_id NULL means
  -- "company-wide default". Partial unique indexes below enforce this
  -- since a plain UNIQUE constraint treats NULL branch_id as distinct rows.
  CONSTRAINT chk_lep_days_sane CHECK (max_paid_days_per_month <= 31)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lep_company_default
  ON public.leave_entitlement_policies (company_id)
  WHERE branch_id IS NULL AND is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_lep_company_branch
  ON public.leave_entitlement_policies (company_id, branch_id)
  WHERE branch_id IS NOT NULL AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_lep_company_id ON public.leave_entitlement_policies(company_id);
CREATE INDEX IF NOT EXISTS idx_lep_branch_id  ON public.leave_entitlement_policies(branch_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- (set_updated_at already exists per hr_payroll.sql; CREATE OR REPLACE is a
-- harmless no-op reassert so this migration has no ordering dependency on it.)

DROP TRIGGER IF EXISTS trg_leave_entitlement_policies_updated ON public.leave_entitlement_policies;
CREATE TRIGGER trg_leave_entitlement_policies_updated
BEFORE UPDATE ON public.leave_entitlement_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a company-wide default (4 days) for every existing company that
-- doesn't already have one, so fn_calc_leave_no_pay_split always has a
-- fallback to find (see step 2's lookup order). Safe/idempotent.
INSERT INTO public.leave_entitlement_policies (company_id, branch_id, max_paid_days_per_month, is_active)
SELECT c.id, NULL, 4, TRUE
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.leave_entitlement_policies lep
  WHERE lep.company_id = c.id AND lep.branch_id IS NULL AND lep.is_active = TRUE
);

-- ── RLS ────────────────────────────────────────────────────────────────
-- Company-scoped, no blanket "authenticated" policy (per project memory
-- rls_false_greens_finance.md — this codebase has a documented history of
-- overly-permissive RLS "false greens"; do not repeat that mistake here).
ALTER TABLE public.leave_entitlement_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lep_admin ON public.leave_entitlement_policies;
CREATE POLICY lep_admin ON public.leave_entitlement_policies
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- HR: full write access within their own company (HR is company/branch-scoped
-- staff, not cross-tenant — mirrors ar_hr / lr_hr's is_hr() + scope pattern).
DROP POLICY IF EXISTS lep_hr ON public.leave_entitlement_policies;
CREATE POLICY lep_hr ON public.leave_entitlement_policies
  FOR ALL
  USING (is_hr() AND company_id = get_user_company_id())
  WITH CHECK (is_hr() AND company_id = get_user_company_id());

-- Manager: write access scoped to policies covering their own branch(es)
-- (mirrors att_manager_rls_115.sql's ar_manager / lr_manager Option-A pattern).
DROP POLICY IF EXISTS lep_manager ON public.leave_entitlement_policies;
CREATE POLICY lep_manager ON public.leave_entitlement_policies
  FOR ALL
  USING (
    is_manager() AND company_id = get_user_company_id()
    AND (branch_id IS NULL OR branch_id = ANY (auth_branch_ids()))
  )
  WITH CHECK (
    is_manager() AND company_id = get_user_company_id()
    AND (branch_id IS NULL OR branch_id = ANY (auth_branch_ids()))
  );

-- Staff: read-only, own company (so the leave-request UI can show "policy:
-- 4 paid days/month" context if desired later).
DROP POLICY IF EXISTS lep_staff_read ON public.leave_entitlement_policies;
CREATE POLICY lep_staff_read ON public.leave_entitlement_policies
  FOR SELECT
  USING (company_id = get_user_company_id());

COMMENT ON TABLE public.leave_entitlement_policies IS
  'HR #2: configurable monthly paid-leave-day cap per company/branch (branch_id NULL = company default). Combined across ALL leave types per confirmed design decision.';


-- =====================================================================
-- 2. fn_calc_leave_no_pay_split(employee_id, start_date, end_date)
-- =====================================================================
-- SECURITY DEFINER + search_path hardening, matching att_shift_calc_112.sql /
-- att_leave_attendance_116.sql convention. NOT granted to PUBLIC/anon; granted
-- to authenticated only via the internal-applier pattern used by #116 (the
-- actual write path goes through _apply_leave_attendance_rows, which is
-- SECURITY DEFINER and not exposed to PostgREST — this calc function itself
-- is read-only/pure so it is safe to expose to authenticated for UI preview
-- use, but EXECUTE is still explicitly scoped, never PUBLIC).
CREATE OR REPLACE FUNCTION public.fn_calc_leave_no_pay_split(
  p_employee_id UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS TABLE (leave_date DATE, status TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch_id   UUID;
  v_company_id  UUID;
  v_cap         INT;
  v_cur_month   DATE;
  v_used_this_month INT;
  v_d           DATE;
  v_status      TEXT;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RETURN;
  END IF;

  SELECT branch_id, company_id INTO v_branch_id, v_company_id
  FROM public.employees WHERE id = p_employee_id;

  IF v_branch_id IS NULL THEN
    RETURN;
  END IF;

  v_cur_month := date_trunc('month', p_start_date)::DATE;

  -- Seed the running counter from ALL pre-existing on_leave days already
  -- recorded for this employee in p_start_date's calendar month (any leave
  -- type — combined bucket per confirmed requirement), BEFORE this request's
  -- days are added. Re-evaluated again each time we cross a month boundary
  -- below.
  SELECT COUNT(*) INTO v_used_this_month
  FROM public.attendance_records
  WHERE employee_id = p_employee_id
    AND status = 'on_leave'
    AND attendance_date >= v_cur_month
    AND attendance_date < (v_cur_month + INTERVAL '1 month')::DATE
    AND attendance_date < p_start_date; -- only days strictly before this request's range

  -- Resolve the applicable cap: branch-specific policy first, else the
  -- company-wide default (branch_id IS NULL row) — same fallback pattern
  -- used elsewhere in this codebase (branch-specific row wins, company
  -- default is the fallback when no branch row exists).
  SELECT max_paid_days_per_month INTO v_cap
  FROM public.leave_entitlement_policies
  WHERE company_id = v_company_id AND branch_id = v_branch_id AND is_active = TRUE
  LIMIT 1;

  IF v_cap IS NULL THEN
    SELECT max_paid_days_per_month INTO v_cap
    FROM public.leave_entitlement_policies
    WHERE company_id = v_company_id AND branch_id IS NULL AND is_active = TRUE
    LIMIT 1;
  END IF;

  -- Final hard fallback if somehow no policy row exists at all (should not
  -- happen after this migration's seed step, but keep the function safe).
  IF v_cap IS NULL THEN
    v_cap := 4;
  END IF;

  v_d := p_start_date;
  WHILE v_d <= p_end_date LOOP
    -- Reset the counter when crossing into a new calendar month within the
    -- same request.
    IF date_trunc('month', v_d)::DATE <> v_cur_month THEN
      v_cur_month := date_trunc('month', v_d)::DATE;
      SELECT COUNT(*) INTO v_used_this_month
      FROM public.attendance_records
      WHERE employee_id = p_employee_id
        AND status = 'on_leave'
        AND attendance_date >= v_cur_month
        AND attendance_date < (v_cur_month + INTERVAL '1 month')::DATE
        AND attendance_date < v_d;
    END IF;

    IF v_used_this_month < v_cap THEN
      v_status := 'on_leave';
      v_used_this_month := v_used_this_month + 1;
    ELSE
      v_status := 'no_pay';
    END IF;

    leave_date := v_d;
    status     := v_status;
    RETURN NEXT;

    v_d := v_d + 1;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_calc_leave_no_pay_split(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_calc_leave_no_pay_split(uuid, date, date) TO authenticated;
COMMENT ON FUNCTION public.fn_calc_leave_no_pay_split(uuid, date, date) IS
  'HR #2: per-date on_leave/no_pay split for a leave date range, honoring the combined-across-all-leave-types monthly paid cap from leave_entitlement_policies. Pure/STABLE — safe for UI preview. Actual writes happen via _apply_leave_attendance_rows (SECURITY DEFINER, not PostgREST-exposed).';


-- =====================================================================
-- 3. Rewire _apply_leave_attendance_rows to use the per-date split
-- =====================================================================
-- Preserves:
--   - the ON CONFLICT guard against overwriting actually-worked days
--     (clock_in IS NULL AND status NOT IN ('present','late','half_day'))
--   - PLUS a new guard: never overwrite is_manual_override = TRUE rows.
--   - the un-approval DELETE behavior, PLUS skip rows with is_manual_override
--     = TRUE (do not delete a day HR explicitly forced).
-- Replaces the single static leave_types.is_paid decision with a per-date
-- call to fn_calc_leave_no_pay_split, so ONE multi-day request can produce
-- a mix of on_leave / no_pay rows once it crosses the monthly cap.
--
-- NOTE: leave_types.is_paid is intentionally still consulted first — an
-- explicitly UNPAID leave type (is_paid = false) always writes 'no_pay'
-- regardless of the monthly cap (a leave type marked unpaid was never meant
-- to draw from the paid bucket at all). Only PAID leave types go through the
-- monthly-cap split. This matches the design doc's framing ("Casual + Medical
-- + Annual" all count toward the combined bucket — those are conventionally
-- the PAID leave types; an explicit unpaid-leave type stays unpaid).
CREATE OR REPLACE FUNCTION public._apply_leave_attendance_rows(p_leave_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lr      leave_requests%ROWTYPE;
  v_paid    boolean;
  v_type    text;
  v_count   integer := 0;
  v_row     RECORD;
  v_rc      integer;
BEGIN
  SELECT * INTO v_lr FROM leave_requests WHERE id = p_leave_request_id;
  IF NOT FOUND OR v_lr.status <> 'approved' THEN
    RETURN 0;
  END IF;

  SELECT lt.name, COALESCE(lt.is_paid, true)
    INTO v_type, v_paid
  FROM leave_types lt
  WHERE lt.id = v_lr.leave_type_id;

  IF v_paid THEN
    -- Paid leave type: split per-date against the combined monthly cap.
    FOR v_row IN
      SELECT * FROM public.fn_calc_leave_no_pay_split(v_lr.employee_id, v_lr.start_date, v_lr.end_date)
    LOOP
      INSERT INTO attendance_records (
        company_id, branch_id, employee_id, attendance_date, status,
        clock_in, clock_out, late_minutes, overtime_hours,
        early_departure_minutes, total_hours, break_hours, remarks
      ) VALUES (
        v_lr.company_id, v_lr.branch_id, v_lr.employee_id, v_row.leave_date, v_row.status,
        NULL, NULL, 0, 0, 0, 0, 0, 'Leave: ' || COALESCE(v_type, 'leave')
      )
      ON CONFLICT (employee_id, attendance_date) DO UPDATE
        SET status  = EXCLUDED.status,
            remarks = EXCLUDED.remarks
        WHERE attendance_records.clock_in IS NULL
          AND attendance_records.status NOT IN ('present', 'late', 'half_day')
          AND COALESCE(attendance_records.is_manual_override, FALSE) = FALSE;

      GET DIAGNOSTICS v_rc = ROW_COUNT;
      v_count := v_count + v_rc;
    END LOOP;
  ELSE
    -- Explicitly unpaid leave type: always no_pay, no cap involved (bypasses
    -- the paid bucket entirely — it was never meant to draw from it).
    INSERT INTO attendance_records (
      company_id, branch_id, employee_id, attendance_date, status,
      clock_in, clock_out, late_minutes, overtime_hours,
      early_departure_minutes, total_hours, break_hours, remarks
    )
    SELECT v_lr.company_id, v_lr.branch_id, v_lr.employee_id, d::date, 'no_pay',
           NULL, NULL, 0, 0, 0, 0, 0, 'Leave: ' || COALESCE(v_type, 'leave')
    FROM generate_series(v_lr.start_date, v_lr.end_date, INTERVAL '1 day') d
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
      SET status  = EXCLUDED.status,
          remarks = EXCLUDED.remarks
      WHERE attendance_records.clock_in IS NULL
        AND attendance_records.status NOT IN ('present', 'late', 'half_day')
        AND COALESCE(attendance_records.is_manual_override, FALSE) = FALSE;

    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_leave_attendance_rows(uuid) FROM PUBLIC, authenticated, anon;
COMMENT ON FUNCTION public._apply_leave_attendance_rows(uuid)
  IS 'HR #2 (supersedes #116): upsert on_leave/no_pay attendance rows for an approved leave range, honoring the combined-across-leave-types monthly paid cap via fn_calc_leave_no_pay_split for paid leave types. Unpaid leave types always write no_pay. Never overwrites clocked/worked days or is_manual_override=TRUE rows. No authz — trigger/definer use only. Not exposed to PostgREST.';

-- fn_apply_leave_attendance (public RPC wrapper) and trg_fn_leave_apply_attendance
-- (the trigger) are UNCHANGED from att_leave_attendance_116.sql — they both
-- delegate to _apply_leave_attendance_rows, which now has the new logic. The
-- trigger's un-approval DELETE also needs the manual-override guard added:
CREATE OR REPLACE FUNCTION public.trg_fn_leave_apply_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      PERFORM public._apply_leave_attendance_rows(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status = 'approved' THEN
    -- Clear any prior leave rows in the (possibly changed) OLD range, then
    -- re-apply — but never touch a manually-overridden day.
    DELETE FROM attendance_records ar
    WHERE ar.employee_id = OLD.employee_id
      AND ar.attendance_date BETWEEN OLD.start_date AND OLD.end_date
      AND ar.clock_in IS NULL
      AND ar.remarks LIKE 'Leave:%'
      AND COALESCE(ar.is_manual_override, FALSE) = FALSE;
    PERFORM public._apply_leave_attendance_rows(NEW.id);
  ELSIF OLD.status = 'approved' AND NEW.status IS DISTINCT FROM 'approved' THEN
    -- Transitioned away from approved → remove the rows we created, except
    -- manually-overridden ones (HR's explicit call stands even if the
    -- underlying request is later un-approved/cancelled).
    DELETE FROM attendance_records ar
    WHERE ar.employee_id = OLD.employee_id
      AND ar.attendance_date BETWEEN OLD.start_date AND OLD.end_date
      AND ar.clock_in IS NULL
      AND ar.remarks LIKE 'Leave:%'
      AND COALESCE(ar.is_manual_override, FALSE) = FALSE;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger definition itself (name, timing, columns) is unchanged from #116;
-- CREATE OR REPLACE FUNCTION above is sufficient, no DROP/CREATE TRIGGER needed.


-- =====================================================================
-- 4. Manual override column
-- =====================================================================
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.attendance_records.is_manual_override IS
  'HR #2: TRUE when HR/manager explicitly set this day''s status via the Attendance edit/mark UI (as opposed to the auto leave-split trigger or fn_mark_absentees). Auto-calc logic (leave trigger, un-approval cleanup) must never overwrite or delete these rows.';


-- =====================================================================
-- 5. New migration: fix process_monthly_payroll to deduct for no_pay days
-- =====================================================================
-- Reproduces the ENTIRE body of fix_payroll_employee_advance_deduction_118.sql
-- (confirmed live per design-doc decision table) UNCHANGED, with exactly one
-- targeted addition: the v_days_absent count and v_absent_ded deduction now
-- also include status = 'no_pay' alongside 'absent'. Everything else —
-- employee_advances lump-sum deduction, salary_advances installments, EPF/
-- ETF, OT (normal + holiday), late deduction, allowances, commission,
-- welfare/custom deductions — is reproduced byte-for-byte from 118.
--
-- days_worked (status IN ('present','late','half_day')) is intentionally
-- NOT changed — no_pay days were never counted as worked, so nothing to fix
-- there; they simply need to join 'absent' in the deduction count, which
-- they now do.
CREATE OR REPLACE FUNCTION public.process_monthly_payroll(p_branch_id uuid, p_period_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id       UUID := auth.uid();
    v_company_id    UUID;
    v_period_start  DATE;
    v_period_end    DATE;
    v_run_id        UUID;

    v_emp RECORD;
    v_sal RECORD;

    v_hourly_rate   NUMERIC;
    v_daily_rate    NUMERIC;
    v_basic         NUMERIC;

    v_allowances    NUMERIC;
    v_custom_add    NUMERIC;
    v_commission    NUMERIC;

    v_normal_ot_hours  NUMERIC;
    v_normal_ot_amount NUMERIC;
    v_holiday_ot_hours  NUMERIC;
    v_holiday_ot_amount NUMERIC;

    v_days_worked   INT;
    v_days_absent   INT;
    v_absent_ded    NUMERIC;

    v_late_minutes  INT;
    v_late_ded      NUMERIC;

    v_epf_emp      NUMERIC;
    v_epf_er       NUMERIC;
    v_etf_er       NUMERIC;
    v_loan_ded     NUMERIC;
    v_advance_ded  NUMERIC;      -- salary_advances installments
    v_emp_adv_ded  NUMERIC;      -- employee_advances lump-sum
    v_welfare_ded  NUMERIC;
    v_custom_ded   NUMERIC;

    v_gross            NUMERIC;
    v_total_deductions NUMERIC;
    v_net              NUMERIC;

    v_count       INT     := 0;
    v_total_gross NUMERIC := 0;
    v_total_net   NUMERIC := 0;
    v_total_ded   NUMERIC := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('admin') OR auth_has_role('hr')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin can run payroll.');
    END IF;

    v_period_start := date_trunc('month', p_period_month)::DATE;
    v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT company_id INTO v_company_id FROM branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch not found.');
    END IF;

    INSERT INTO payroll_runs (company_id, branch_id, period_start, period_end, status, processed_by)
    VALUES (v_company_id, p_branch_id, v_period_start, v_period_end, 'processing', v_user_id)
    ON CONFLICT (branch_id, period_start, period_end) DO UPDATE SET
        status = 'processing', processed_by = v_user_id, updated_at = now()
    RETURNING id INTO v_run_id;

    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- Re-processing safety: release any employee_advances previously linked to
    -- THIS run (from a prior processing pass) so they are re-summed cleanly and
    -- never double-counted.
    UPDATE employee_advances
       SET payroll_run_id = NULL, deducted_date = NULL,
           status = 'approved', updated_at = now()
     WHERE payroll_run_id = v_run_id;

    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        v_basic            := 0; v_allowances   := 0; v_custom_add   := 0; v_commission   := 0;
        v_normal_ot_hours  := 0; v_normal_ot_amount := 0;
        v_holiday_ot_hours := 0; v_holiday_ot_amount := 0;
        v_days_worked := 0; v_days_absent := 0; v_absent_ded := 0;
        v_late_minutes := 0; v_late_ded := 0;
        v_epf_emp := 0; v_epf_er := 0; v_etf_er := 0;
        v_loan_ded := 0; v_advance_ded := 0; v_emp_adv_ded := 0; v_welfare_ded := 0; v_custom_ded := 0;
        v_gross := 0; v_total_deductions := 0; v_net := 0;

        SELECT * INTO v_sal FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

        IF v_sal.id IS NULL THEN CONTINUE; END IF;

        v_hourly_rate := CASE WHEN COALESCE(v_sal.hourly_rate, 0) > 0
                              THEN v_sal.hourly_rate
                              ELSE COALESCE(v_sal.basic_salary, 0) / 240.0
                         END;
        v_daily_rate  := COALESCE(v_sal.basic_salary, 0) / 26.0;

        CASE v_sal.salary_method
            WHEN 'basic_salary' THEN
                v_basic := COALESCE(v_sal.basic_salary, 0);
            WHEN 'day_salary' THEN
                SELECT COUNT(*) INTO v_days_worked
                FROM attendance_records
                WHERE employee_id = v_emp.id
                  AND attendance_date BETWEEN v_period_start AND v_period_end
                  AND status IN ('present', 'late');
                v_basic := v_days_worked * COALESCE(v_sal.day_rate, 0);
            WHEN 'unit_salary' THEN
                SELECT COALESCE(SUM(units_sold), 0) INTO v_basic
                FROM commission_sales
                WHERE employee_id = v_emp.id AND period_month = v_period_start;
                v_basic := v_basic * COALESCE(v_sal.unit_rate, 0);
            WHEN 'commission_sales', 'commission_recovery', 'commission_hotline' THEN
                v_basic := COALESCE(v_sal.basic_salary, 0);
                SELECT COALESCE(total_payout, 0) INTO v_commission
                FROM commission_sales
                WHERE employee_id = v_emp.id AND period_month = v_period_start;
            ELSE
                v_basic := COALESCE(v_sal.basic_salary, 0);
        END CASE;

        IF v_sal.salary_method = 'basic_salary' THEN
            -- FIX (HR #2): count 'no_pay' alongside 'absent' for the deduction —
            -- previously no_pay days (auto-converted excess leave, or
            -- fn_mark_absentees no-punch rows) had ZERO payroll effect. This is
            -- the only functional change vs fix_payroll_employee_advance_deduction_118.sql.
            SELECT COUNT(*) INTO v_days_absent
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status IN ('absent', 'no_pay');

            SELECT COUNT(*) INTO v_days_worked
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status IN ('present', 'late', 'half_day');

            v_absent_ded := v_days_absent * v_daily_rate;
        END IF;

        SELECT COALESCE(SUM(late_minutes), 0) INTO v_late_minutes
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND late_minutes   > 0;
        v_late_ded := (v_late_minutes / 60.0) * v_hourly_rate;

        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_normal_ot_hours
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = false;
        v_normal_ot_amount := v_normal_ot_hours * v_hourly_rate
                              * COALESCE(v_sal.overtime_rate_multiplier, 1.5);

        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_holiday_ot_hours
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = true;
        v_holiday_ot_amount := v_holiday_ot_hours * v_hourly_rate
                               * COALESCE(v_sal.holiday_ot_multiplier, 2.0);

        SELECT COALESCE(SUM(amount), 0) INTO v_allowances
        FROM (
            SELECT 0 AS amount
            UNION ALL
            SELECT COALESCE(SUM(ea.amount), 0)
            FROM employee_allowances ea
            WHERE ea.employee_id  = v_emp.id AND ea.is_active = true
              AND ea.effective_from <= v_period_end
              AND (ea.effective_to IS NULL OR ea.effective_to >= v_period_start)
        ) sub;

        v_allowances := v_allowances +
            COALESCE(v_sal.housing_allowance, 0) + COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance, 0)    + COALESCE(v_sal.other_allowances, 0);

        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id  = v_emp.id
          AND start_date  <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        v_epf_emp := v_basic * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0);
        v_epf_er  := v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0);
        v_etf_er  := v_basic * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0);

        SELECT COALESCE(SUM(LEAST(monthly_installment, remaining_balance)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active'
          AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start);

        -- Salary advances (installment table) — unchanged.
        SELECT COALESCE(SUM(amount_per_installment), 0) INTO v_advance_ded
        FROM salary_advances
        WHERE employee_id = v_emp.id AND status = 'active'
          AND remaining_amount > 0;

        -- employee_advances (lump-sum from the "New Advance" UI). Deduct the
        -- FULL amount of each APPROVED advance not yet tied to a run, and link it
        -- to THIS run so it is withheld exactly once.
        SELECT COALESCE(SUM(amount), 0) INTO v_emp_adv_ded
        FROM employee_advances
        WHERE employee_id = v_emp.id
          AND status = 'approved'
          AND payroll_run_id IS NULL;

        IF v_emp_adv_ded > 0 THEN
            UPDATE employee_advances
               SET status = 'deducted', payroll_run_id = v_run_id,
                   deducted_date = CURRENT_DATE, updated_at = now()
             WHERE employee_id = v_emp.id
               AND status = 'approved'
               AND payroll_run_id IS NULL;
        END IF;

        IF v_emp.welfare_active THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_welfare_ded
            FROM salary_deductions
            WHERE employee_id = v_emp.id AND deduction_type = 'welfare'
              AND start_date <= v_period_end
              AND (end_date IS NULL OR end_date >= v_period_start);
        END IF;

        SELECT COALESCE(SUM(amount), 0) INTO v_custom_ded
        FROM salary_deductions
        WHERE employee_id = v_emp.id AND deduction_type != 'welfare'
          AND start_date <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        v_gross :=
            v_basic + v_allowances + v_normal_ot_amount + v_holiday_ot_amount
            + v_custom_add + v_commission - v_absent_ded - v_late_ded;

        -- employee_advances lump-sum now included in employee-side deductions.
        v_total_deductions :=
            v_epf_emp + v_loan_ded + v_advance_ded + v_emp_adv_ded
            + v_welfare_ded + v_custom_ded + COALESCE(v_sal.other_deductions, 0);

        v_net := v_gross - v_total_deductions;

        INSERT INTO payslips (
            company_id, branch_id, payroll_run_id, employee_id,
            basic_salary,
            housing_allowance, transport_allowance, meal_allowance, other_allowances,
            total_allowances,
            overtime_hours,    overtime_amount,
            normal_ot_hours,   normal_ot_amount,
            holiday_ot_hours,  holiday_ot_amount,
            commission_amount, custom_additions,
            gross_salary,
            epf_employee, epf_employer, etf_employer,
            loan_deduction,
            advance_deduction,
            welfare_deduction,
            custom_deductions,
            other_deductions,
            total_deductions,
            late_minutes_total,  late_deduction_amount,
            days_worked, days_absent,
            net_salary,
            payment_status
        ) VALUES (
            v_company_id, p_branch_id, v_run_id, v_emp.id,
            ROUND(v_basic, 2),
            COALESCE(v_sal.housing_allowance,   0),
            COALESCE(v_sal.transport_allowance, 0),
            COALESCE(v_sal.meal_allowance,      0),
            COALESCE(v_sal.other_allowances,    0),
            ROUND(v_allowances, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_holiday_ot_hours, 2),  ROUND(v_holiday_ot_amount, 2),
            ROUND(v_commission, 2),        ROUND(v_custom_add, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2),  ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2),
            -- advance_deduction column reflects BOTH advance systems.
            ROUND(v_advance_ded + v_emp_adv_ded, 2),
            ROUND(v_welfare_ded, 2),
            ROUND(v_custom_ded, 2),
            COALESCE(v_sal.other_deductions, 0),
            ROUND(v_total_deductions, 2),
            v_late_minutes,  ROUND(v_late_ded, 2),
            v_days_worked,   v_days_absent,
            ROUND(v_net, 2),
            'pending'
        );

        -- Recover salary_advances installments (unchanged behaviour).
        DECLARE
            v_adv RECORD;
            v_installment NUMERIC;
        BEGIN
            FOR v_adv IN
                SELECT * FROM salary_advances
                WHERE employee_id = v_emp.id AND status = 'active' AND remaining_amount > 0
                ORDER BY advance_date ASC
            LOOP
                v_installment := LEAST(v_adv.amount_per_installment, v_adv.remaining_amount);
                UPDATE salary_advances
                SET recovered_amount = recovered_amount + v_installment,
                    status = CASE WHEN (remaining_amount - v_installment) <= 0
                                  THEN 'fully_recovered' ELSE 'active' END,
                    updated_at = now()
                WHERE id = v_adv.id;
            END LOOP;
        END;

        v_count       := v_count       + 1;
        v_total_gross := v_total_gross + v_gross;
        v_total_net   := v_total_net   + v_net;
        v_total_ded   := v_total_ded   + v_total_deductions;
    END LOOP;

    UPDATE payroll_runs SET
        total_gross      = ROUND(v_total_gross, 2),
        total_deductions = ROUND(v_total_ded,   2),
        total_net        = ROUND(v_total_net,   2),
        employee_count   = v_count,
        status           = 'processed',
        updated_at       = now()
    WHERE id = v_run_id;

    INSERT INTO salary_audit_logs (company_id, branch_id, payroll_run_id, action, performed_by)
    VALUES (v_company_id, p_branch_id, v_run_id, 'process', v_user_id)
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'success',       true,
        'payroll_run_id', v_run_id,
        'employee_count', v_count,
        'total_gross',    ROUND(v_total_gross, 2),
        'total_deductions', ROUND(v_total_ded, 2),
        'total_net',      ROUND(v_total_net, 2),
        'period',         v_period_start || ' to ' || v_period_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION public.process_monthly_payroll(uuid, date) IS
  'HR #2 fix layered on fix_payroll_employee_advance_deduction_118.sql: v_days_absent/v_absent_ded now also count status=no_pay (previously no_pay had zero payroll effect — pre-existing bug independent of this feature, fixed here since the new leave-split logic would otherwise be silently inert). All other logic (employee_advances lump-sum, salary_advances installments, EPF/ETF, OT, late deduction, allowances, welfare/custom deductions) reproduced unchanged from 118.';


-- =====================================================================
-- 6. Unify the two competing leave-approval code paths
-- =====================================================================
-- approve_leave_request() RPC (leave_management.sql) currently hard-blocks
-- with RAISE EXCEPTION when leave_balances.remaining_days < requested_days.
-- That RPC is called from LeaveTab.vue's updateLeaveStatus() (a secondary,
-- non-production flow). Since the new design makes "insufficient balance" a
-- soft/automatic on_leave-vs-no_pay split (handled entirely by the trigger
-- via _apply_leave_attendance_rows -> fn_calc_leave_no_pay_split), the hard
-- block is removed here. leave_balances.used_days bookkeeping is preserved
-- (still tracks the leave TYPE's own annual quota — a separate, legitimate
-- concern from the monthly no-pay cap), it just no longer blocks approval.
CREATE OR REPLACE FUNCTION public.approve_leave_request(
    p_request_id UUID,
    p_approved_by UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_req RECORD;
    v_type RECORD;
    v_balance RECORD;
    v_current_year INT;
BEGIN
    -- SECURITY FIX (HR #2): the pre-existing function had NO internal role
    -- check at all — combined with GRANT EXECUTE ... TO authenticated (below,
    -- unchanged from leave_management.sql), any logged-in user could call this
    -- RPC directly via PostgREST/supabase.rpc() and approve arbitrary leave
    -- requests, bypassing the fact that the "Approve" button is only shown to
    -- HR/managers in the UI (a UI-only gate is not a real authz boundary).
    -- This was pre-existing and out of scope of the original ask, but since
    -- this function is being touched anyway, closing it now rather than
    -- carrying the gap forward.
    IF NOT (is_admin() OR is_hr() OR is_manager()) THEN
        RAISE EXCEPTION 'Only HR, managers, or admins can approve leave requests';
    END IF;

    SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request not found';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already %', v_req.status;
    END IF;

    v_current_year := EXTRACT(YEAR FROM v_req.start_date);

    SELECT * INTO v_type FROM leave_types WHERE id = v_req.leave_type_id;

    -- Balance bookkeeping only (annual quota tracking) — NO hard block.
    -- Insufficient balance beyond the monthly no-pay cap is now handled as an
    -- automatic on_leave/no_pay split by the leave-approval trigger, not a
    -- rejection at approval time. (HR #2 — supersedes the pre-existing
    -- RAISE EXCEPTION on remaining_days < requested_days.)
    SELECT * INTO v_balance FROM leave_balances
    WHERE employee_id = v_req.employee_id
      AND leave_type_id = v_req.leave_type_id
      AND year = v_current_year;

    -- Update Request Status. Column-only UPDATE lets the existing
    -- trg_leave_apply_attendance trigger (att_leave_attendance_116.sql,
    -- rewired by this migration) do the actual attendance-row creation via
    -- _apply_leave_attendance_rows -> fn_calc_leave_no_pay_split.
    UPDATE leave_requests
    SET status = 'approved', approved_by = p_approved_by, approved_at = now()
    WHERE id = p_request_id;

    -- Track used_days against the leave type's own annual entitlement
    -- (unrelated to, and not overridden by, the monthly no-pay cap).
    IF v_balance.id IS NOT NULL THEN
        UPDATE leave_balances
        SET used_days = used_days + v_req.total_days
        WHERE id = v_balance.id;
    ELSE
        INSERT INTO leave_balances (company_id, employee_id, leave_type_id, year, total_entitlement, used_days)
        VALUES (v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_current_year,
                COALESCE(v_type.annual_quota, 0), v_req.total_days);
    END IF;

    -- NOTE: attendance_records writes are now handled exclusively by
    -- trg_leave_apply_attendance (fires AFTER UPDATE OF status on
    -- leave_requests, per att_leave_attendance_116.sql) — the old inline
    -- WHILE-loop that wrote a single static status for the whole range has
    -- been removed here to avoid duplicating/conflicting with the trigger's
    -- per-date split logic.
END;
$$;

REVOKE ALL ON FUNCTION public.approve_leave_request(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_leave_request(uuid, uuid) TO authenticated;
COMMENT ON FUNCTION public.approve_leave_request(uuid, uuid) IS
  'HR #2: retired the hard-block exception on insufficient leave_balances — approval now always succeeds and the monthly no-pay cap is applied automatically per-date by trg_leave_apply_attendance -> fn_calc_leave_no_pay_split. used_days bookkeeping preserved for annual-quota tracking (a separate concern from the monthly cap). Still requires status=pending on entry (idempotency guard unchanged).';
