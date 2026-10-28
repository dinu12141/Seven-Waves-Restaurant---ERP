-- ═══════════════════════════════════════════════════════════════════════════
-- HR #135 — Payroll integrity (loans, advance installments, re-processing)
--           + hardened Full & Final settlement
-- Seven Waves Restaurant ERP
--
-- Apply AFTER #129 and #132 (this redefines process_monthly_payroll on top of
-- the #132 body; signature unchanged (uuid, date) → no new overload).
--
-- 1. process_monthly_payroll
--    • REFUSES to re-process a run that is 'approved' / 'paid', or that has
--      any payslip already posted to finance (payslips.finance_posted_at, #129).
--      Previously only 'paid' was blocked (trg_prevent_payroll_re_approval), so
--      posted payslips could be deleted while their ledger/journal rows stayed.
--    • employee_loans: the monthly installment is now actually applied
--      (total_paid += x, remaining_balance -= x, status → 'completed' at 0).
--      #118/#132 deducted it on the payslip but never reduced the balance, so
--      loans were deducted every month indefinitely.
--    • salary_advances: installments are unchanged but now logged.
--    • Every loan / installment applied is written to payroll_recovery_log
--      (run, source, source_id, amount). Re-processing the same run first
--      REVERSES its logged recoveries, so a second "Process" never recovers a
--      second installment (it did for salary_advances before).
--
-- 2. calculate_final_settlement
--    • Admin / HR only (was callable by any authenticated user, SECURITY
--      DEFINER). search_path hardened.
--    • Pro-rata = basic × days_worked / days_in_month (was basic/26 × day of
--      month → up to 31/26 of a month). 0 when a payslip already exists for
--      that employee and month (final month was paid through payroll).
--    • Advance recovery also includes employee_advances that are approved and
--      not yet deducted by payroll (previously ignored).
--    • Gratuity uses COMPLETED years of service.
--    • An approved / paid settlement is never recalculated (returns stored).
--
-- Idempotent / re-runnable. NOT yet applied.
--
-- Review fixes (HR, 2026-10-26) — verified against the live schema read-only:
--   R1. Pre-flight: aborts unless #129 is applied (payslips.finance_posted_at
--       does NOT exist live yet; without it every payroll run would error).
--   R2. #132's body was based on #118 and silently dropped features of the
--       LIVE body (migrations/20260924_hr_payroll_enhancements_and_fixes.sql:
--       fn_mark_absentees sweep, shift_allowance_amount, absent_deduction,
--       salary_advance_deduction / employee_advance_deduction split columns —
--       all present on live payslips and read by PayrollPage.vue). Restored.
--   R3. Loans taken AFTER the payroll period are no longer deducted
--       (loan_date <= period_end); salary_advance payslip deduction uses
--       LEAST(installment, remaining) to match what is actually recovered.
--   R4. payroll_recovery_log: explicit REVOKE ALL / GRANT SELECT, branch-scoped
--       read policy for non-admins, index on (source, source_id).
--   R5. resignation_settlements does NOT exist live (nor does
--       calculate_final_settlement) — created here with RLS + grants, so
--       ResignationPage.vue's F&F calculation works at all.
--   R6. "Today" is Asia/Colombo (absentee sweep, settlement defaults,
--       employee_advances.deducted_date) instead of the server's CURRENT_DATE.
--   S1. process_monthly_payroll: non-admin HR limited to auth_branch_ids().
--   S2. Refuses to re-process a pre-#135 run whose payslips carry unlogged
--       salary-advance recoveries (would recover them twice).
--   S3. resignation_settlements: trigger restricts direct client updates to
--       draft → approved (approved_by/at forced to caller/now) + notes.
--
-- Apply order: #129 → #132 → #135 → #137 (loan backfill; same window, before
-- anyone processes payroll again).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- R1: hard prerequisite — #129 must be applied first.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'payslips'
                      AND column_name = 'finance_posted_at') THEN
        RAISE EXCEPTION '#135 requires #129 (payslips.finance_posted_at). Apply fix_hr_finance_linkage_129.sql first.';
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Recovery log
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_recovery_log (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
    employee_id    UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    source         TEXT NOT NULL CHECK (source IN ('employee_loan', 'salary_advance')),
    source_id      UUID NOT NULL,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_recovery_log_run    ON public.payroll_recovery_log(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_recovery_log_source ON public.payroll_recovery_log(source, source_id);

ALTER TABLE public.payroll_recovery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prl_admin_hr_read ON public.payroll_recovery_log;
CREATE POLICY prl_admin_hr_read ON public.payroll_recovery_log FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR ((public.auth_has_role('hr') OR public.auth_has_role('finance'))
            AND EXISTS (SELECT 1 FROM public.employees e
                         WHERE e.id = payroll_recovery_log.employee_id
                           AND e.branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))))
    );
-- writes only via SECURITY DEFINER process_monthly_payroll / service_role
REVOKE ALL ON public.payroll_recovery_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payroll_recovery_log TO authenticated;
GRANT ALL    ON public.payroll_recovery_log TO service_role;

-- R5: resignation_settlements (missing on live) — same shape as
-- migrations/20260325_shift_allowance_final_settlement.sql §5.
CREATE TABLE IF NOT EXISTS public.resignation_settlements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resignation_id   UUID NOT NULL REFERENCES public.employee_resignations(id) ON DELETE CASCADE,
    employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    branch_id        UUID NOT NULL REFERENCES public.branches(id)  ON DELETE CASCADE,
    pro_rata_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
    leave_encashment     NUMERIC(12,2) NOT NULL DEFAULT 0,
    gratuity_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_earnings       NUMERIC(12,2) NOT NULL DEFAULT 0,
    advance_recovery     NUMERIC(12,2) NOT NULL DEFAULT 0,
    loan_recovery        NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_earnings       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_settlement       NUMERIC(12,2) NOT NULL DEFAULT 0,
    years_of_service     NUMERIC(5,2)  NOT NULL DEFAULT 0,
    unused_leave_days    NUMERIC(5,1)  NOT NULL DEFAULT 0,
    days_worked_last_month INT         NOT NULL DEFAULT 0,
    last_basic_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
    daily_rate           NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
    approved_by  UUID REFERENCES auth.users(id),
    approved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE (resignation_id)
);
CREATE INDEX IF NOT EXISTS idx_resign_settle_employee ON public.resignation_settlements(employee_id);
CREATE INDEX IF NOT EXISTS idx_resign_settle_branch   ON public.resignation_settlements(branch_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'set_updated_at' AND p.pronargs = 0) THEN
        DROP TRIGGER IF EXISTS trg_resign_settle_updated ON public.resignation_settlements;
        CREATE TRIGGER trg_resign_settle_updated
            BEFORE UPDATE ON public.resignation_settlements
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;

ALTER TABLE public.resignation_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rs_hr_read   ON public.resignation_settlements;
DROP POLICY IF EXISTS rs_hr_update ON public.resignation_settlements;
CREATE POLICY rs_hr_read ON public.resignation_settlements FOR SELECT TO authenticated
    USING (public.is_admin()
           OR ((public.auth_has_role('hr') OR public.auth_has_role('finance'))
               AND branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))));
-- approve / mark paid / notes from ResignationPage (HR/Admin, own branches).
-- Rows are INSERTed only by calculate_final_settlement (SECURITY DEFINER).
CREATE POLICY rs_hr_update ON public.resignation_settlements FOR UPDATE TO authenticated
    USING (public.is_admin()
           OR (public.auth_has_role('hr')
               AND branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))))
    WITH CHECK (public.is_admin()
           OR (public.auth_has_role('hr')
               AND branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))));
REVOKE ALL ON public.resignation_settlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resignation_settlements TO authenticated;
-- column-level: HR may approve/annotate, never edit the computed amounts.
GRANT UPDATE (status, notes, approved_by, approved_at) ON public.resignation_settlements TO authenticated;
GRANT ALL ON public.resignation_settlements TO service_role;

-- S3: the column grant above lets a client UPDATE status / approved_by. This
-- trigger restricts DIRECT client updates (current_user = authenticated/anon)
-- to: draft → approved by HR/Admin (approved_by/at forced to the caller/now),
-- and notes while draft/approved. Everything else (→ paid, back to draft,
-- edits after payment) only via SECURITY DEFINER functions
-- (calculate_final_settlement, #134b post_final_settlement_to_finance), which
-- run as the function owner and are not restricted here.
CREATE OR REPLACE FUNCTION public.trg_fn_resign_settle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER          -- must see the CALLER's role, not the owner's
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;       -- definer functions / service_role / migrations
    END IF;

    IF NOT (public.is_admin() OR public.auth_has_role('hr')) THEN
        RAISE EXCEPTION 'Only HR / Admin can change a final settlement.' USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'paid' THEN
        RAISE EXCEPTION 'A paid final settlement cannot be changed.' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
            RAISE EXCEPTION 'Settlement status % → % is not allowed here (only draft → approved; payment goes through Finance).',
                OLD.status, NEW.status USING ERRCODE = '42501';
        END IF;
        NEW.approved_by := auth.uid();
        NEW.approved_at := now();
    ELSE
        -- approval stamp can't be forged / edited without a status change
        NEW.approved_by := OLD.approved_by;
        NEW.approved_at := OLD.approved_at;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_fn_resign_settle_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resign_settle_transition ON public.resignation_settlements;
CREATE TRIGGER trg_resign_settle_transition
    BEFORE UPDATE ON public.resignation_settlements
    FOR EACH ROW EXECUTE FUNCTION public.trg_fn_resign_settle_transition();

-- ───────────────────────────────────────────────────────────────────────────
-- 1. process_monthly_payroll — #132 body + #135 changes (marked "#135")
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_monthly_payroll(p_branch_id uuid, p_period_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
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
    v_shift_allowance NUMERIC;   -- R2 (live 20260924 body)
    v_custom_add    NUMERIC;
    v_commission    NUMERIC;

    v_normal_ot_hours  NUMERIC;
    v_normal_ot_amount NUMERIC;
    v_holiday_ot_hours  NUMERIC;
    v_holiday_ot_amount NUMERIC;

    v_days_worked   NUMERIC;     -- #132: NUMERIC (half_day = 0.5)
    v_days_absent   NUMERIC;     -- #132: NUMERIC (half_day = 0.5)
    v_absent_ded    NUMERIC;

    v_late_minutes  INT;
    v_late_ded      NUMERIC;

    v_epf_emp      NUMERIC;
    v_epf_er       NUMERIC;
    v_etf_er       NUMERIC;
    v_loan_ded     NUMERIC;
    v_advance_ded  NUMERIC;      -- salary_advances installments
    v_emp_adv_ded  NUMERIC;      -- employee_advances lump-sum (#118)
    v_welfare_ded  NUMERIC;
    v_custom_ded   NUMERIC;

    v_gross            NUMERIC;
    v_total_deductions NUMERIC;
    v_net              NUMERIC;

    v_count       INT     := 0;
    v_total_gross NUMERIC := 0;
    v_total_net   NUMERIC := 0;
    v_total_ded   NUMERIC := 0;

    v_existing    RECORD;        -- #135
    v_rec         RECORD;        -- #135
    v_installment NUMERIC;       -- #135
    v_today       DATE := (now() AT TIME ZONE 'Asia/Colombo')::DATE;  -- R6
    v_day_iter    DATE;          -- R2
    v_sweep_end   DATE;          -- R2
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

    -- S1: HR may only run payroll for branches they are assigned to; admin unrestricted.
    IF NOT public.is_admin()
       AND NOT (p_branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'You do not have access to this branch''s payroll.');
    END IF;

    -- #135: never re-process a run that is approved/paid or partly posted.
    SELECT id, status INTO v_existing
      FROM payroll_runs
     WHERE branch_id = p_branch_id
       AND period_start = v_period_start AND period_end = v_period_end
     FOR UPDATE;
    IF v_existing.id IS NOT NULL THEN
        IF v_existing.status IN ('approved', 'paid') THEN
            RETURN jsonb_build_object('success', false, 'error',
                'Payroll for this month is already ' || v_existing.status || ' and cannot be re-processed.');
        END IF;
        IF EXISTS (SELECT 1 FROM payslips
                    WHERE payroll_run_id = v_existing.id AND finance_posted_at IS NOT NULL) THEN
            RETURN jsonb_build_object('success', false, 'error',
                'Payslips of this run are already posted to Finance; it cannot be re-processed.');
        END IF;
        -- S2: runs processed BEFORE #135 recovered salary_advances installments
        -- without a payroll_recovery_log entry, so re-processing would recover
        -- them a second time. Refuse when a payslip of this run carries a
        -- salary-advance deduction (advance_deduction minus the employee_advances
        -- linked to the run) that is not logged for that employee.
        IF EXISTS (
            SELECT 1
              FROM payslips ps
             WHERE ps.payroll_run_id = v_existing.id
               AND COALESCE(ps.advance_deduction, 0)
                   - COALESCE((SELECT SUM(ea.amount) FROM employee_advances ea
                                WHERE ea.payroll_run_id = v_existing.id
                                  AND ea.employee_id    = ps.employee_id), 0) > 0.01
               AND NOT EXISTS (SELECT 1 FROM payroll_recovery_log rl
                                WHERE rl.payroll_run_id = v_existing.id
                                  AND rl.employee_id    = ps.employee_id
                                  AND rl.source         = 'salary_advance')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error',
                'This run was processed before the recovery log existed and already recovered salary-advance '
                || 'installments; re-processing would recover them twice. Ask an admin to reverse those '
                || 'installments (salary_advances.recovered_amount) before re-processing.');
        END IF;
    END IF;

    -- R2: auto-sweep scheduled-but-unclocked days as no_pay (live behaviour
    -- since 20260924) so absent deductions are not missed.
    v_day_iter  := v_period_start;
    v_sweep_end := LEAST(v_period_end, v_today);
    WHILE v_day_iter <= v_sweep_end LOOP
        BEGIN
            PERFORM public.fn_mark_absentees(v_day_iter, p_branch_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;   -- ignore single-day sweep errors (e.g. no shifts that day)
        END;
        v_day_iter := v_day_iter + 1;
    END LOOP;

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

    -- #135: reverse loan / installment recoveries applied by a prior pass of
    -- THIS run, so they are re-applied exactly once below.
    FOR v_rec IN
        SELECT source, source_id, SUM(amount) AS amount
          FROM payroll_recovery_log
         WHERE payroll_run_id = v_run_id
         GROUP BY source, source_id
    LOOP
        IF v_rec.source = 'employee_loan' THEN
            UPDATE employee_loans
               SET total_paid        = GREATEST(COALESCE(total_paid, 0) - v_rec.amount, 0),
                   remaining_balance = remaining_balance + v_rec.amount,
                   status            = CASE WHEN status = 'completed' THEN 'active' ELSE status END,
                   updated_at        = now()
             WHERE id = v_rec.source_id;
        ELSE
            UPDATE salary_advances
               SET recovered_amount = GREATEST(recovered_amount - v_rec.amount, 0),
                   status           = CASE WHEN status = 'fully_recovered' THEN 'active' ELSE status END,
                   updated_at       = now()
             WHERE id = v_rec.source_id;
        END IF;
    END LOOP;
    DELETE FROM payroll_recovery_log WHERE payroll_run_id = v_run_id;

    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        v_basic            := 0; v_allowances   := 0; v_custom_add   := 0; v_commission   := 0;
        v_shift_allowance  := 0;
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
                -- #132: half_day pays half a day (was 0).
                SELECT COALESCE(SUM(CASE WHEN status = 'half_day' THEN 0.5 ELSE 1 END), 0)
                  INTO v_days_worked
                FROM attendance_records
                WHERE employee_id = v_emp.id
                  AND attendance_date BETWEEN v_period_start AND v_period_end
                  AND status IN ('present', 'late', 'half_day');
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
            -- #132: unpaid leave ('no_pay', legacy 'unpaid_leave') is deducted
            -- exactly like 'absent'; a 'half_day' is half a day absent.
            SELECT COALESCE(SUM(CASE WHEN status = 'half_day' THEN 0.5 ELSE 1 END), 0)
              INTO v_days_absent
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status IN ('absent', 'no_pay', 'unpaid_leave', 'half_day');

            -- #132: a 'half_day' is half a day worked.
            SELECT COALESCE(SUM(CASE WHEN status = 'half_day' THEN 0.5 ELSE 1 END), 0)
              INTO v_days_worked
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

        -- R2: night/special shift allowance (live 20260924 body).
        SELECT COALESCE(SUM(
            CASE
                WHEN COALESCE(s.night_allowance_type, 'fixed') = 'fixed'
                    THEN COALESCE(s.night_allowance_amount, 0)
                WHEN s.night_allowance_type = 'percentage'
                    THEN ROUND(v_basic * COALESCE(s.night_allowance_amount, 0) / 100.0, 2)
                ELSE 0
            END
        ), 0) INTO v_shift_allowance
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        WHERE sa.employee_id = v_emp.id
          AND sa.assignment_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(s.night_allowance_amount, 0) > 0;

        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id  = v_emp.id
          AND start_date  <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        v_epf_emp := v_basic * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0);
        v_epf_er  := v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0);
        v_etf_er  := v_basic * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0);

        SELECT COALESCE(SUM(GREATEST(LEAST(monthly_installment, remaining_balance), 0)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active'
          AND loan_date <= v_period_end                                   -- R3
          AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start);

        -- Salary advances (installment table). R3: LEAST(...) = exactly what
        -- the recovery loop below applies (last installment is not over-deducted).
        SELECT COALESCE(SUM(LEAST(amount_per_installment, remaining_amount)), 0) INTO v_advance_ded
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
                   deducted_date = v_today, updated_at = now()
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
            v_basic + v_allowances + v_shift_allowance + v_normal_ot_amount + v_holiday_ot_amount
            + v_custom_add + v_commission - v_absent_ded - v_late_ded;

        v_total_deductions :=
            v_epf_emp + v_loan_ded + v_advance_ded + v_emp_adv_ded
            + v_welfare_ded + v_custom_ded + COALESCE(v_sal.other_deductions, 0);

        v_net := v_gross - v_total_deductions;

        INSERT INTO payslips (
            company_id, branch_id, payroll_run_id, employee_id,
            basic_salary,
            housing_allowance, transport_allowance, meal_allowance, other_allowances,
            total_allowances,
            shift_allowance_amount,
            overtime_hours,    overtime_amount,
            normal_ot_hours,   normal_ot_amount,
            holiday_ot_hours,  holiday_ot_amount,
            commission_amount, custom_additions,
            gross_salary,
            epf_employee, epf_employer, etf_employer,
            loan_deduction,
            advance_deduction,
            salary_advance_deduction,
            employee_advance_deduction,
            welfare_deduction,
            custom_deductions,
            other_deductions,
            absent_deduction,
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
            ROUND(v_shift_allowance, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_holiday_ot_hours, 2),  ROUND(v_holiday_ot_amount, 2),
            ROUND(v_commission, 2),        ROUND(v_custom_add, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2),  ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2),
            -- advance_deduction column reflects BOTH advance systems.
            ROUND(v_advance_ded + v_emp_adv_ded, 2),
            ROUND(v_advance_ded, 2),
            ROUND(v_emp_adv_ded, 2),
            ROUND(v_welfare_ded, 2),
            ROUND(v_custom_ded, 2),
            COALESCE(v_sal.other_deductions, 0),
            ROUND(v_absent_ded, 2),
            ROUND(v_total_deductions, 2),
            v_late_minutes,  ROUND(v_late_ded, 2),
            v_days_worked,   v_days_absent,
            ROUND(v_net, 2),
            'pending'
        );

        -- Recover salary_advances installments (#135: logged for reversal).
        FOR v_rec IN
            SELECT * FROM salary_advances
            WHERE employee_id = v_emp.id AND status = 'active' AND remaining_amount > 0
            ORDER BY advance_date ASC
        LOOP
            v_installment := LEAST(v_rec.amount_per_installment, v_rec.remaining_amount);
            CONTINUE WHEN COALESCE(v_installment, 0) <= 0;
            UPDATE salary_advances
            SET recovered_amount = recovered_amount + v_installment,
                status = CASE WHEN (remaining_amount - v_installment) <= 0
                              THEN 'fully_recovered' ELSE 'active' END,
                updated_at = now()
            WHERE id = v_rec.id;
            INSERT INTO payroll_recovery_log (payroll_run_id, employee_id, source, source_id, amount)
            VALUES (v_run_id, v_emp.id, 'salary_advance', v_rec.id, ROUND(v_installment, 2));
        END LOOP;

        -- #135: apply employee_loans installments (same rows/amounts that were
        -- summed into v_loan_ded above), logged for reversal.
        FOR v_rec IN
            SELECT * FROM employee_loans
            WHERE employee_id = v_emp.id AND status = 'active'
              AND loan_date <= v_period_end                               -- R3
              AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start)
            FOR UPDATE
        LOOP
            v_installment := LEAST(v_rec.monthly_installment, v_rec.remaining_balance);
            CONTINUE WHEN COALESCE(v_installment, 0) <= 0;
            UPDATE employee_loans
            SET total_paid        = COALESCE(total_paid, 0) + v_installment,
                remaining_balance = remaining_balance - v_installment,
                status            = CASE WHEN (remaining_balance - v_installment) <= 0
                                         THEN 'completed' ELSE 'active' END,
                updated_at        = now()
            WHERE id = v_rec.id;
            INSERT INTO payroll_recovery_log (payroll_run_id, employee_id, source, source_id, amount)
            VALUES (v_run_id, v_emp.id, 'employee_loan', v_rec.id, ROUND(v_installment, 2));
        END LOOP;

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

REVOKE ALL ON FUNCTION public.process_monthly_payroll(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_monthly_payroll(uuid, date) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. calculate_final_settlement — hardened (signature unchanged (uuid))
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_final_settlement(p_resignation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_resign          RECORD;
    v_emp             RECORD;
    v_sal             RECORD;
    v_existing        RECORD;
    v_hire_date       DATE;
    v_last_day        DATE;
    v_month_start     DATE;
    v_days_in_month   INT;
    v_years           NUMERIC(5,2);
    v_full_years      INT;
    v_basic           NUMERIC(12,2);
    v_daily           NUMERIC(12,2);
    v_days_worked     INT;
    v_pro_rata        NUMERIC(12,2);
    v_month_paid      BOOLEAN;
    v_unused_leave    NUMERIC(5,1);
    v_leave_enc       NUMERIC(12,2);
    v_gratuity        NUMERIC(12,2);
    v_advance_rec     NUMERIC(12,2);
    v_emp_adv_rec     NUMERIC(12,2);
    v_loan_rec        NUMERIC(12,2);
    v_total_earn      NUMERIC(12,2);
    v_total_ded       NUMERIC(12,2);
    v_net             NUMERIC(12,2);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin() OR public.auth_has_role('hr')) THEN
        RAISE EXCEPTION 'Only HR / Admin can calculate a final settlement.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_resign FROM employee_resignations WHERE id = p_resignation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Resignation record not found');
    END IF;

    SELECT * INTO v_emp FROM employees WHERE id = v_resign.employee_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Employee not found');
    END IF;

    -- Non-admin HR: only employees of their own branches
    IF NOT public.is_admin()
       AND NOT (v_emp.branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RAISE EXCEPTION 'You do not have access to this employee''s branch.' USING ERRCODE = '42501';
    END IF;

    -- R6: Sri Lanka local date, not the server's CURRENT_DATE
    v_hire_date := COALESCE(v_emp.hire_date, ((now() AT TIME ZONE 'Asia/Colombo')::DATE - INTERVAL '1 year')::DATE);
    v_last_day  := COALESCE(v_resign.last_working_day, (now() AT TIME ZONE 'Asia/Colombo')::DATE);

    v_years := ROUND(
        EXTRACT(EPOCH FROM (v_last_day::TIMESTAMPTZ - v_hire_date::TIMESTAMPTZ))
        / (365.25 * 86400), 2
    );
    v_full_years := GREATEST(EXTRACT(YEAR FROM age(v_last_day, v_hire_date))::INT, 0);

    SELECT * INTO v_sal FROM salary_structures
    WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

    v_basic := COALESCE(v_sal.basic_salary, 0);
    v_daily := ROUND(v_basic / 26.0, 2);   -- leave encashment / gratuity basis (unchanged)

    -- Pro-rata for the final (partial) month: calendar-day basis, never > 1 month.
    v_month_start   := date_trunc('month', v_last_day)::DATE;
    v_days_in_month := EXTRACT(DAY FROM (v_month_start + INTERVAL '1 month' - INTERVAL '1 day'))::INT;
    v_days_worked   := (v_last_day - GREATEST(v_month_start, v_hire_date)) + 1;
    v_days_worked   := LEAST(GREATEST(v_days_worked, 0), v_days_in_month);

    -- Final month already paid through payroll → no pro-rata.
    SELECT EXISTS (
        SELECT 1 FROM payslips ps
        JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
        WHERE ps.employee_id = v_emp.id
          AND pr.period_start <= v_last_day AND pr.period_end >= v_month_start
          AND COALESCE(ps.payment_status, 'pending') <> 'cancelled'
    ) INTO v_month_paid;

    v_pro_rata := CASE WHEN v_month_paid THEN 0
                       ELSE ROUND(v_basic * v_days_worked / v_days_in_month, 2) END;

    -- Approved / paid settlements are never recalculated: return stored figures.
    SELECT * INTO v_existing FROM resignation_settlements WHERE resignation_id = p_resignation_id;
    IF v_existing.id IS NOT NULL AND v_existing.status IN ('approved', 'paid') THEN
        RETURN to_jsonb(v_existing) || jsonb_build_object(
            'employee_name',     v_emp.full_name,
            'employee_code',     v_emp.employee_code,
            'hire_date',         v_hire_date,
            'last_working_day',  v_last_day,
            'gratuity_eligible', (v_full_years >= 5),
            'locked',            true
        );
    END IF;

    SELECT COALESCE(lb.remaining_days, 0)
    INTO v_unused_leave
    FROM leave_balances lb
    JOIN leave_types lt ON lt.id = lb.leave_type_id
    WHERE lb.employee_id = v_emp.id
      AND lb.year        = EXTRACT(YEAR FROM v_last_day)::INT
      AND lt.name ILIKE '%annual%'
    ORDER BY lb.remaining_days DESC
    LIMIT 1;
    v_unused_leave := COALESCE(v_unused_leave, 0);
    v_leave_enc    := ROUND(v_unused_leave * v_daily, 2);

    -- Gratuity: completed years of service, eligible from 5 completed years.
    v_gratuity := CASE WHEN v_full_years >= 5
                       THEN ROUND(14.0 * v_full_years * v_daily, 2) ELSE 0 END;

    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_advance_rec
    FROM salary_advances
    WHERE employee_id = v_emp.id AND status = 'active';

    -- employee_advances approved but not yet withheld by payroll
    SELECT COALESCE(SUM(amount), 0) INTO v_emp_adv_rec
    FROM employee_advances
    WHERE employee_id = v_emp.id AND status = 'approved' AND payroll_run_id IS NULL;

    -- remaining_balance is kept current by process_monthly_payroll (#135)
    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_loan_rec
    FROM employee_loans
    WHERE employee_id = v_emp.id AND status = 'active';

    v_advance_rec := v_advance_rec + v_emp_adv_rec;
    v_total_earn  := v_pro_rata + v_leave_enc + v_gratuity;
    v_total_ded   := v_advance_rec + v_loan_rec;
    v_net         := v_total_earn - v_total_ded;

    INSERT INTO resignation_settlements (
        resignation_id, employee_id, company_id, branch_id,
        pro_rata_salary, leave_encashment, gratuity_amount, other_earnings,
        advance_recovery, loan_recovery, other_deductions,
        total_earnings, total_deductions, net_settlement,
        years_of_service, unused_leave_days, days_worked_last_month,
        last_basic_salary, daily_rate, status
    ) VALUES (
        p_resignation_id, v_emp.id, v_emp.company_id, v_emp.branch_id,
        v_pro_rata, v_leave_enc, v_gratuity, 0,
        v_advance_rec, v_loan_rec, 0,
        v_total_earn, v_total_ded, v_net,
        v_years, v_unused_leave, CASE WHEN v_month_paid THEN 0 ELSE v_days_worked END,
        v_basic, v_daily, 'draft'
    )
    ON CONFLICT (resignation_id) DO UPDATE SET
        pro_rata_salary    = EXCLUDED.pro_rata_salary,
        leave_encashment   = EXCLUDED.leave_encashment,
        gratuity_amount    = EXCLUDED.gratuity_amount,
        advance_recovery   = EXCLUDED.advance_recovery,
        loan_recovery      = EXCLUDED.loan_recovery,
        total_earnings     = EXCLUDED.total_earnings,
        total_deductions   = EXCLUDED.total_deductions,
        net_settlement     = EXCLUDED.net_settlement,
        years_of_service   = EXCLUDED.years_of_service,
        unused_leave_days  = EXCLUDED.unused_leave_days,
        days_worked_last_month = EXCLUDED.days_worked_last_month,
        last_basic_salary  = EXCLUDED.last_basic_salary,
        daily_rate         = EXCLUDED.daily_rate,
        updated_at         = now()
    WHERE resignation_settlements.status = 'draft';

    RETURN jsonb_build_object(
        'resignation_id',       p_resignation_id,
        'employee_name',        v_emp.full_name,
        'employee_code',        v_emp.employee_code,
        'hire_date',            v_hire_date,
        'last_working_day',     v_last_day,
        'years_of_service',     v_years,
        'completed_years',      v_full_years,
        'last_basic_salary',    v_basic,
        'daily_rate',           v_daily,
        'days_worked_last_month', CASE WHEN v_month_paid THEN 0 ELSE v_days_worked END,
        'final_month_paid_by_payroll', v_month_paid,
        'pro_rata_salary',      v_pro_rata,
        'unused_leave_days',    v_unused_leave,
        'leave_encashment',     v_leave_enc,
        'gratuity_amount',      v_gratuity,
        'advance_recovery',     v_advance_rec,
        'loan_recovery',        v_loan_rec,
        'total_earnings',       v_total_earn,
        'total_deductions',     v_total_ded,
        'net_settlement',       v_net,
        'gratuity_eligible',    (v_full_years >= 5)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_final_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_final_settlement(uuid) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
