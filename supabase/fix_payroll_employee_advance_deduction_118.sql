-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #118 — payroll never withholds employee_advances (lump-sum advances)
-- Seven Waves Restaurant ERP
--
-- BUG: the "New Advance" form (EmployeeFinancesPage) writes lump-sum advances to
-- public.employee_advances. On payroll APPROVAL, approve_payroll_run marks those
-- rows status='deducted' + payroll_run_id — BUT process_monthly_payroll NEVER
-- subtracts their amount from net salary. So the advance is flagged "deducted"
-- while the employee was actually paid the full salary → the money was never
-- withheld. (Note: v_advance_ded only summed salary_advances installments, a
-- DIFFERENT table.)
--
-- FIX (user choice: deduct full amount from next payroll):
--   In process_monthly_payroll, add the sum of APPROVED employee_advances that
--   are not yet tied to a run into the employee's advance deduction, and LINK
--   those rows to this run (payroll_run_id + deducted_date + status='deducted')
--   so they are withheld exactly once. This keeps approve_payroll_run's marking
--   idempotent (rows already linked here are skipped by its
--   "payroll_run_id IS NULL" filter).
--
-- Finance posting is intentionally left as the separate manual PayrollPage step
-- (post_payroll_to_finance needs GL-account selection) — unchanged.
--
-- Re-runnable (CREATE OR REPLACE). Applied 2026-07-26.
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-existing latent blocker also fixed here: process_monthly_payroll writes
-- salary_audit_logs.action='process', but chk_audit_action did NOT allow
-- 'process' → EVERY payroll run aborted (caught by the function's EXCEPTION
-- handler and returned success:false, rolling back the whole run). Add 'process'.
ALTER TABLE public.salary_audit_logs DROP CONSTRAINT IF EXISTS chk_audit_action;
ALTER TABLE public.salary_audit_logs ADD CONSTRAINT chk_audit_action
  CHECK (action = ANY (ARRAY['hold','release','edit_gross','edit_net','edit_deduction',
    'approve','reject','mark_paid','bank_ref_update','final_approve','process']));

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
    v_emp_adv_ded  NUMERIC;      -- NEW: employee_advances lump-sum
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
            SELECT COUNT(*) INTO v_days_absent
            FROM attendance_records
            WHERE employee_id = v_emp.id
              AND attendance_date BETWEEN v_period_start AND v_period_end
              AND status = 'absent';

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

        -- NEW: employee_advances (lump-sum from the "New Advance" UI). Deduct the
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
            -- advance_deduction column now reflects BOTH advance systems.
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
