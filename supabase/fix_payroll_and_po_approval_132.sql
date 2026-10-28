-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #132 — Payroll no-pay / half-day, salary deductions table, PO approval
--            hardening, low-stock alert spam
-- Seven Waves Restaurant ERP
--
-- 1. process_monthly_payroll (latest body = fix_payroll_employee_advance_deduction_118.sql)
--    • Only status='absent' was deducted. Approved UNPAID leave writes 'no_pay'
--      attendance rows (att_leave_attendance_116.sql) and those days were paid
--      in full. 'no_pay' and legacy 'unpaid_leave' are now deducted like
--      'absent' (this matches get_attendance_payroll_summary in
--      att_shift_calc_112.sql and the 20260803/20260924 payroll versions,
--      which #118 had regressed).
--    • 'half_day' counted as a full worked day. It now counts as 0.5 worked
--      day + 0.5 absent day (deducted at the daily rate). For day_salary
--      employees a half_day now pays 0.5 × day_rate (previously 0).
--    • Body otherwise copied verbatim from #118; signature unchanged
--      (uuid, date) → no new overload (PGRST203). search_path hardened.
--    • payslips.days_worked / days_absent are widened INT → NUMERIC(6,1) so
--      half days are stored exactly (guarded; if a dependency blocks the
--      ALTER, the values are rounded on insert and a NOTICE is raised).
--
-- 2. Salary deductions: EmployeesPage.vue wrote to employee_deductions, which
--    NOTHING else reads. salary_deductions is canonical (read by
--    process_monthly_payroll, financeService.ts, PayrollRunPage.vue, has
--    HR/admin/finance RLS + realtime). The UI now writes salary_deductions;
--    existing employee_deductions rows are copied across idempotently below.
--    employee_deductions itself is left in place (not dropped).
--
-- 3. approve_po was SECURITY DEFINER with no role / maker-checker check and
--    ignored procurement_approval_thresholds. approve_po_with_threshold
--    existed but (a) set status 'pending_approval', which chk_po_status does
--    not allow (→ always failed for multi-level POs), (b) called approve_po
--    (would recurse once approve_po delegates), (c) used pgcrypto digest()
--    with search_path=public (pgcrypto lives in `extensions` on Supabase).
--    Both are rewritten here around one shared engine; signatures unchanged.
--
-- 4. check_reorder_level_alert / trg_stock_reorder_alert notified on EVERY
--    decrement while at/below reorder level and inserted columns
--    (company_id, entity_type, entity_id) that are not in the notifications
--    schema (notifications.sql: user_id NOT NULL). Now: fires only when stock
--    CROSSES from above to at/below the reorder level, dedupes against an
--    unread alert for the same stock row in the last 24h, fans out to
--    inventory/manager/admin users with the real notifications columns, and
--    can never abort the stock movement.
--
-- Idempotent / re-runnable. NOT yet applied.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1a. Allow fractional days on payslips (half days)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payslips'
          AND column_name = 'days_worked' AND data_type IN ('integer', 'bigint', 'smallint')
    ) THEN
        BEGIN
            ALTER TABLE public.payslips ALTER COLUMN days_worked TYPE NUMERIC(6,1);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '#132: could not widen payslips.days_worked (%). Half days will be rounded.', SQLERRM;
        END;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'payslips'
          AND column_name = 'days_absent' AND data_type IN ('integer', 'bigint', 'smallint')
    ) THEN
        BEGIN
            ALTER TABLE public.payslips ALTER COLUMN days_absent TYPE NUMERIC(6,1);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '#132: could not widen payslips.days_absent (%). Half days will be rounded.', SQLERRM;
        END;
    END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1b. process_monthly_payroll — #118 body + no_pay / half_day fix
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

REVOKE ALL ON FUNCTION public.process_monthly_payroll(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_monthly_payroll(uuid, date) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. employee_deductions → salary_deductions (one-time, idempotent copy)
--    Each copied row carries a "[employee_deductions:<id>]" marker in notes so
--    re-running never duplicates. One-off semantics: end_date = start_date
--    (a NULL end_date would deduct every month forever).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_copied INT;
BEGIN
    IF to_regclass('public.employee_deductions') IS NULL
       OR to_regclass('public.salary_deductions') IS NULL THEN
        RAISE NOTICE '#132: employee_deductions or salary_deductions missing — copy skipped.';
        RETURN;
    END IF;

    INSERT INTO public.salary_deductions (
        company_id, branch_id, employee_id,
        description, deduction_type, amount, total_amount,
        start_date, end_date, is_recurring, notes, created_at
    )
    SELECT
        COALESCE(ed.company_id, e.company_id, b.company_id),
        COALESCE(ed.branch_id, e.branch_id),
        ed.employee_id,
        COALESCE(NULLIF(trim(ed.deduction_type), ''), 'Deduction'),
        CASE ed.deduction_type
            WHEN 'Loan Recovery'    THEN 'installment'
            WHEN 'Advance Recovery' THEN 'installment'
            WHEN 'Damage'           THEN 'penalty'
            WHEN 'Absence'          THEN 'penalty'
            ELSE CASE WHEN lower(ed.deduction_type) IN
                           ('emergency','recurring','installment','welfare','penalty','other')
                      THEN lower(ed.deduction_type) ELSE 'other' END
        END,
        ed.amount,
        ed.amount,
        ed.effective_date,
        ed.effective_date,
        false,
        concat_ws(' ', NULLIF(ed.notes, ''), '[employee_deductions:' || ed.id || ']'),
        COALESCE(ed.created_at, now())
    FROM public.employee_deductions ed
    JOIN public.employees e ON e.id = ed.employee_id
    LEFT JOIN public.branches b ON b.id = COALESCE(ed.branch_id, e.branch_id)
    WHERE ed.amount > 0
      AND COALESCE(ed.company_id, e.company_id, b.company_id) IS NOT NULL
      AND COALESCE(ed.branch_id, e.branch_id) IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.salary_deductions sd
          WHERE sd.employee_id = ed.employee_id
            AND sd.notes LIKE '%[employee_deductions:' || ed.id || ']%'
      );

    GET DIAGNOSTICS v_copied = ROW_COUNT;
    RAISE NOTICE '#132: copied % employee_deductions row(s) into salary_deductions.', v_copied;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PO approval — one engine, role + maker-checker + thresholds
--
--    Rules (enforced by approve_po_with_threshold; approve_po delegates):
--      • caller must be admin, manager, finance or procurement
--        (finance is included because the seeded level-2 threshold requires it)
--      • PO must be 'draft' (chk_po_status has no 'pending_approval'; partial
--        multi-level approvals are tracked in procurement_approval_log and the
--        PO stays 'draft' until the final level)
--      • non-admins must have access to the PO's branch
--      • maker-checker: creator cannot approve own PO (admin exempt); the same
--        user cannot sign two levels of one PO (admin exempt)
--      • thresholds: if active PO thresholds cover the amount, the next level's
--        required_role must be one the caller holds; admin satisfies all levels
--        at once. If none cover the amount → single-level approval.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_po_with_threshold(
    p_po_id UUID,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_po            RECORD;
    v_user_id       UUID := auth.uid();
    v_is_admin      BOOLEAN;
    v_has_thresholds BOOLEAN;
    v_current_level INT;
    v_max_level     INT;
    v_next_level    INT;
    v_required_role TEXT;
    v_user_role     TEXT;
    v_doc_hash      TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    v_is_admin := COALESCE(is_admin(), false);

    IF NOT (v_is_admin OR COALESCE(is_manager(), false) OR COALESCE(is_finance(), false)
            OR auth_has_role('procurement')) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Unauthorized: only admin, manager, finance or procurement can approve POs');
    END IF;

    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO not found: ' || p_po_id);
    END IF;

    IF v_po.status <> 'draft' THEN
        RETURN jsonb_build_object('success', false,
            'error', 'PO "' || v_po.doc_number || '" is ' || v_po.status || '. Only draft POs can be approved.');
    END IF;

    IF NOT v_is_admin
       AND NOT (v_po.branch_id = ANY (COALESCE(auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You do not have access to this PO''s branch');
    END IF;

    -- Maker-checker
    IF NOT v_is_admin AND v_po.created_by = v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Maker-checker: you cannot approve a PO you created');
    END IF;

    IF NOT v_is_admin AND EXISTS (
        SELECT 1 FROM procurement_approval_log
        WHERE doc_type = 'PO' AND doc_id = p_po_id
          AND action = 'approved' AND approved_by = v_user_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'You already approved a level of this PO; another approver must sign the next level');
    END IF;

    -- Levels already signed
    SELECT COALESCE(MAX(approval_level), 0) INTO v_current_level
    FROM procurement_approval_log
    WHERE doc_type = 'PO' AND doc_id = p_po_id AND action = 'approved';
    v_next_level := v_current_level + 1;

    -- Levels required for this amount
    SELECT COUNT(*) > 0, COALESCE(MAX(approval_level), 1)
      INTO v_has_thresholds, v_max_level
    FROM procurement_approval_thresholds
    WHERE company_id = v_po.company_id AND doc_type = 'PO' AND is_active = true
      AND COALESCE(v_po.total_amount, 0) >= min_amount
      AND (max_amount IS NULL OR COALESCE(v_po.total_amount, 0) <= max_amount);

    -- Seeded bands are disjoint (0-50k L1, 50k-200k L2, 200k+ L3); a PO in a
    -- higher band must still pass every lower level, so the required role for
    -- level N is looked up by level, regardless of amount band.
    IF v_is_admin THEN
        v_user_role := 'admin';
    ELSIF v_has_thresholds THEN
        SELECT t.required_role INTO v_required_role
        FROM procurement_approval_thresholds t
        WHERE t.company_id = v_po.company_id AND t.doc_type = 'PO' AND t.is_active = true
          AND t.approval_level = v_next_level
          AND (
                (t.required_role = 'manager' AND (is_manager() OR auth_has_role('manager')))
             OR (t.required_role = 'finance' AND (is_finance() OR auth_has_role('finance')))
             OR (t.required_role NOT IN ('manager', 'finance') AND auth_has_role(t.required_role))
          )
        ORDER BY t.min_amount
        LIMIT 1;

        IF v_required_role IS NULL THEN
            SELECT string_agg(DISTINCT t.required_role, '/') INTO v_required_role
            FROM procurement_approval_thresholds t
            WHERE t.company_id = v_po.company_id AND t.doc_type = 'PO' AND t.is_active = true
              AND t.approval_level = v_next_level;
            RETURN jsonb_build_object('success', false, 'error',
                'Approval level ' || v_next_level || ' of ' || v_max_level
                || ' for PO "' || v_po.doc_number || '" requires role: '
                || COALESCE(v_required_role, 'admin'));
        END IF;
        v_user_role := v_required_role;
    ELSE
        v_user_role := CASE
            WHEN is_manager()                THEN 'manager'
            WHEN is_finance()                THEN 'finance'
            ELSE 'procurement'
        END;
    END IF;

    -- Audit hash of PO state (built-in sha256 — no pgcrypto dependency)
    v_doc_hash := encode(sha256(convert_to(
        v_po.id::TEXT || '|' || COALESCE(v_po.total_amount, 0)::TEXT || '|'
        || v_po.doc_number || '|' || now()::TEXT, 'UTF8')), 'hex');

    INSERT INTO procurement_approval_log (
        doc_type, doc_id, doc_number, approval_level, action,
        approved_by, approver_role, amount, doc_hash, comments
    ) VALUES (
        'PO', p_po_id, v_po.doc_number,
        CASE WHEN v_is_admin THEN GREATEST(v_next_level, v_max_level) ELSE v_next_level END,
        'approved', v_user_id, v_user_role, v_po.total_amount, v_doc_hash, p_comments
    );

    IF v_is_admin OR v_next_level >= v_max_level THEN
        UPDATE purchase_orders
           SET status = 'approved', approved_by = v_user_id, approved_at = now()
         WHERE id = p_po_id;

        RETURN jsonb_build_object(
            'success', true, 'status', 'approved',
            'doc_number', v_po.doc_number,
            'level', CASE WHEN v_is_admin THEN GREATEST(v_next_level, v_max_level) ELSE v_next_level END,
            'required_level', v_max_level,
            'hash', v_doc_hash);
    END IF;

    -- Partially approved: PO stays 'draft' until the final level signs.
    RETURN jsonb_build_object(
        'success', true, 'status', 'pending_approval',
        'doc_number', v_po.doc_number,
        'current_level', v_next_level, 'required_level', v_max_level,
        'message', 'Level ' || v_next_level || ' of ' || v_max_level
                   || ' approved; further approval required');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- approve_po: same signature, keeps its "po_approval_required" gate, then
-- delegates to the threshold engine above (which no longer calls approve_po).
CREATE OR REPLACE FUNCTION public.approve_po(p_po_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc_number TEXT;
    v_company_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT doc_number, company_id INTO v_doc_number, v_company_id
    FROM purchase_orders WHERE id = p_po_id;

    IF v_doc_number IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO not found: ' || p_po_id);
    END IF;

    IF NOT procurement_setting_bool(v_company_id, 'po_approval_required') THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO approval is not enabled for this company.');
    END IF;

    RETURN public.approve_po_with_threshold(p_po_id, NULL);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_po(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_po(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_po_with_threshold(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_po_with_threshold(uuid, text) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Low-stock alert: notify on threshold CROSSING only, deduped, non-fatal
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_reorder_level_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item_name      TEXT;
    v_reorder_level  NUMERIC;
    v_branch_id      UUID;
    v_warehouse_name TEXT;
BEGIN
    -- Only on a decrease
    IF NEW.qty_on_hand IS NULL OR OLD.qty_on_hand IS NULL
       OR NEW.qty_on_hand >= OLD.qty_on_hand THEN
        RETURN NEW;
    END IF;

    SELECT name, reorder_level INTO v_item_name, v_reorder_level
    FROM items WHERE id = NEW.item_id;

    IF COALESCE(v_reorder_level, 0) <= 0 THEN
        RETURN NEW;
    END IF;

    -- Only when stock CROSSES from above the reorder level to at/below it.
    IF NOT (OLD.qty_on_hand > v_reorder_level AND NEW.qty_on_hand <= v_reorder_level) THEN
        RETURN NEW;
    END IF;

    -- A notification problem must never block a stock movement.
    BEGIN
        SELECT branch_id, name INTO v_branch_id, v_warehouse_name
        FROM warehouses WHERE id = NEW.warehouse_id;

        -- Dedupe: skip if an unread alert for this stock row exists in the last 24h
        IF EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.ref_type = 'stock_on_hand'
              AND n.ref_id   = NEW.id
              AND COALESCE(n.is_read, false) = false
              AND n.created_at > now() - INTERVAL '24 hours'
        ) THEN
            RETURN NEW;
        END IF;

        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, ref_type, ref_id)
        SELECT DISTINCT ur.user_id,
               v_branch_id,
               'warning',
               'Low Stock Alert: ' || COALESCE(v_item_name, 'item'),
               'Stock for ' || COALESCE(v_item_name, 'item')
                   || COALESCE(' in ' || v_warehouse_name, '')
                   || ' has dropped to ' || NEW.qty_on_hand
                   || ', at or below the reorder level of ' || v_reorder_level,
               'inventory_2',
               'orange',
               'stock_on_hand',
               NEW.id
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        LEFT JOIN user_branches ub ON ub.user_id = ur.user_id AND ub.branch_id = v_branch_id
        WHERE (r.name IN ('inventory', 'manager') AND ub.user_id IS NOT NULL)
           OR r.name = 'admin';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '#132 check_reorder_level_alert: notification skipped (%)', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_reorder_level_alert() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_stock_reorder_alert ON public.stock_on_hand;
CREATE TRIGGER trg_stock_reorder_alert
    AFTER UPDATE OF qty_on_hand ON public.stock_on_hand
    FOR EACH ROW
    WHEN (NEW.qty_on_hand < OLD.qty_on_hand)
    EXECUTE FUNCTION public.check_reorder_level_alert();

COMMIT;
