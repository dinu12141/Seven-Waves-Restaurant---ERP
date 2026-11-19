-- ═══════════════════════════════════════════════════════════════════════════════
-- SEVEN WAVES RESTAURANT (PVT) LTD — HR & PAYROLL POLICY ENGINE (#160)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Official Rules Implemented:
--   1. Monthly Working Days Calculation:
--      - 30-Day Month -> 26 Days Required
--      - 31-Day Month -> 27 Days Required
--      - Other Months -> (Calendar Days - 4) Required
--   2. No-Pay Calculation:
--      - 1 Day No-Pay = (Basic Salary + Allowances + Service Charge) / 30
--      - No-Pay Deduction = Total No-Pay Days * 1 Day No-Pay Rate
--   3. Attendance Allowance Deduction:
--      - If No-Pay Days > 0 during the payroll period, full Attendance Allowance
--        is forfeited (deducted to 0).
--   4. Additional Working Day Payment (Extra Days):
--      - For days worked beyond required days:
--        Additional Working Day Payment: Rs. 1,300
--        Additional Service Charge: Rs. 1,000
--        Total Additional Payment: Rs. 2,300 per extra working day
--   5. Overtime (OT) Calculation:
--      - OT Rate Per Hour = (Basic Salary / 208) * 1.5
--      - Total OT Payment = OT Rate Per Hour * Total Approved OT Hours
--   6. EPF & ETF:
--      - EPF Employee: 8% on Basic Salary
--      - EPF Employer: 12% on Basic Salary
--      - ETF Employer: 3% on Basic Salary
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Complete, robust process_monthly_payroll function
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
    v_days_in_month INT;
    v_req_working_days INT;
    v_run_id        UUID;

    v_emp RECORD;
    v_sal RECORD;

    -- Salary & Additions
    v_basic             NUMERIC;
    v_grade_code        TEXT;
    v_grade_variable    NUMERIC;
    v_grade_service     NUMERIC;
    v_grade_attendance  NUMERIC;
    v_grade_extra_rate  NUMERIC;
    v_actual_attendance NUMERIC;

    v_allowances        NUMERIC;
    v_shift_allowance   NUMERIC;
    v_custom_add        NUMERIC;
    v_commission        NUMERIC;

    -- Overtime & Extra Days
    v_normal_ot_hours   NUMERIC;
    v_normal_ot_amount  NUMERIC;
    v_ot_rate_per_hour  NUMERIC;
    v_extra_days        INT;
    v_total_extra_pay   NUMERIC;

    -- Days & Deductions
    v_days_worked   INT;
    v_days_absent   INT;
    v_no_pay_rate   NUMERIC;
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

    v_day_iter    DATE;
    v_sweep_end   DATE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('admin') OR auth_has_role('hr')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin can run payroll.');
    END IF;

    v_period_start := date_trunc('month', p_period_month)::DATE;
    v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_days_in_month := EXTRACT(DAY FROM v_period_end)::INT;

    -- Rule 1: Monthly Working Days Calculation
    -- 30-Day Month -> 26 Days Required
    -- 31-Day Month -> 27 Days Required
    -- Other months -> (Days - 4) Required
    v_req_working_days := CASE
        WHEN v_days_in_month = 31 THEN 27
        WHEN v_days_in_month = 30 THEN 26
        ELSE GREATEST(1, v_days_in_month - 4)
    END;

    SELECT company_id INTO v_company_id FROM branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch not found.');
    END IF;

    -- Step A: Auto-sweep absentees up to today / period_end
    v_day_iter  := v_period_start;
    v_sweep_end := LEAST(v_period_end, CURRENT_DATE);
    WHILE v_day_iter <= v_sweep_end LOOP
        BEGIN
            PERFORM public.fn_mark_absentees(v_day_iter, p_branch_id);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
        v_day_iter := v_day_iter + INTERVAL '1 day';
    END LOOP;

    -- Step B: Initialize or reset payroll run record
    INSERT INTO payroll_runs (company_id, branch_id, period_start, period_end, status, processed_by)
    VALUES (v_company_id, p_branch_id, v_period_start, v_period_end, 'processing', v_user_id)
    ON CONFLICT (branch_id, period_start, period_end) DO UPDATE SET
        status = 'processing', processed_by = v_user_id, updated_at = now()
    RETURNING id INTO v_run_id;

    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- Re-processing safety: release employee_advances previously tied to THIS run
    UPDATE employee_advances
       SET payroll_run_id = NULL, deducted_date = NULL,
           status = 'approved', updated_at = now()
     WHERE payroll_run_id = v_run_id;

    -- Step C: Loop through all active employees
    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        v_basic             := 0;
        v_grade_code        := NULL;
        v_grade_variable    := 0;
        v_grade_service     := 0;
        v_grade_attendance  := 0;
        v_grade_extra_rate  := 1300;
        v_actual_attendance := 0;

        v_allowances        := 0;
        v_shift_allowance   := 0;
        v_custom_add        := 0;
        v_commission        := 0;

        v_normal_ot_hours   := 0;
        v_normal_ot_amount  := 0;
        v_ot_rate_per_hour  := 0;
        v_extra_days        := 0;
        v_total_extra_pay   := 0;

        v_days_worked := 0; v_days_absent := 0; v_no_pay_rate := 0; v_absent_ded := 0;
        v_late_minutes := 0; v_late_ded := 0;
        v_epf_emp := 0; v_epf_er := 0; v_etf_er := 0;
        v_loan_ded := 0; v_advance_ded := 0; v_emp_adv_ded := 0; v_welfare_ded := 0; v_custom_ded := 0;
        v_gross := 0; v_total_deductions := 0; v_net := 0;

        SELECT * INTO v_sal FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

        IF v_sal.id IS NULL THEN CONTINUE; END IF;

        -- 1. Base Salary Method
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

        -- 2. Extract Pay Grade Additions (Variable, Service Charge, Attendance, Extra Rate)
        SELECT setting_value->'assignments'->>v_emp.id::text INTO v_grade_code
        FROM system_settings WHERE setting_key = 'hr_employee_pay_grade_assignments';

        IF v_grade_code IS NOT NULL AND v_grade_code <> '' THEN
            SELECT 
                COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '01' OR elem->>'additionName' ILIKE '%VARIABLE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '02' OR elem->>'additionName' ILIKE '%SERVICE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '05' OR elem->>'additionName' ILIKE '%ATTENDANCE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0),
                COALESCE(MAX(CASE WHEN (elem->>'additionCode' = '06' OR elem->>'additionName' ILIKE '%EXTRA%') THEN (elem->>'amount')::NUMERIC ELSE NULL END), 1300)
            INTO v_grade_variable, v_grade_service, v_grade_attendance, v_grade_extra_rate
            FROM system_settings s,
                 jsonb_to_recordset(s.setting_value->'grades') AS g(code text, additions jsonb),
                 jsonb_array_elements(g.additions) AS elem
            WHERE s.setting_key = 'hr_pay_grades_data'
              AND g.code = v_grade_code;
        ELSE
            -- Fallback if no pay grade assigned: treat other_allowances as variable
            v_grade_variable   := COALESCE(v_sal.other_allowances, 0);
            v_grade_service    := 0;
            v_grade_attendance := 0;
            v_grade_extra_rate := 1300;
        END IF;

        -- 3. Absent and Attendance Days
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

        -- Rule 3: Attendance Allowance Deduction
        -- If an employee takes any no-pay leave during the period, full Attendance Allowance is deducted (0)
        IF v_days_absent > 0 THEN
            v_actual_attendance := 0;
        ELSE
            v_actual_attendance := v_grade_attendance;
        END IF;

        -- Rule 2: No-Pay Calculation
        -- 1 Day No-Pay = (Basic Salary + Allowances + Service Charge) / 30
        -- No-Pay Deduction = Total No-Pay Days * 1 Day No-Pay Rate
        v_no_pay_rate := (v_basic + v_grade_variable + v_grade_service
                          + COALESCE(v_sal.housing_allowance, 0)
                          + COALESCE(v_sal.transport_allowance, 0)
                          + COALESCE(v_sal.meal_allowance, 0)) / 30.0;
        v_absent_ded := ROUND(v_days_absent * v_no_pay_rate, 2);

        -- Rule 4: Additional Working Day Payment (Extra Days)
        -- Employees working beyond required monthly days (26 for 30d, 27 for 31d)
        -- Total Additional Payment = Rs. 1,300 (Work) + Rs. 1,000 (SC) = Rs. 2,300 per extra working day
        v_extra_days := GREATEST(0, v_days_worked - v_req_working_days);
        v_total_extra_pay := ROUND(v_extra_days * 2300.0, 2);

        -- Rule 5 (6 in policy doc): Overtime (OT) Calculation
        -- OT Rate Per Hour = (Basic Salary / 208) * 1.5
        -- Total OT Payment = OT Rate Per Hour * Total Approved OT Hours
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_normal_ot_hours
        FROM attendance_records
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end;

        v_ot_rate_per_hour := (v_basic / 208.0) * 1.5;
        v_normal_ot_amount := ROUND(v_normal_ot_hours * v_ot_rate_per_hour, 2);

        -- Late Deductions
        SELECT COALESCE(SUM(late_minutes), 0) INTO v_late_minutes
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND late_minutes   > 0;
        v_late_ded := ROUND((v_late_minutes / 60.0) * (v_basic / 208.0), 2);

        -- Shift Allowance (Night/Special shift premiums)
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

        -- Custom Additions
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id  = v_emp.id
          AND start_date  <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- Rule 6: EPF & ETF (Strictly calculated on Basic Salary)
        v_epf_emp := ROUND(v_basic * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0), 2);
        v_epf_er  := ROUND(v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0), 2);
        v_etf_er  := ROUND(v_basic * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0), 2);

        -- Staff Loans (EMI)
        SELECT COALESCE(SUM(LEAST(monthly_installment, remaining_balance)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active'
          AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start);

        -- Salary advances (installment table)
        SELECT COALESCE(SUM(amount_per_installment), 0) INTO v_advance_ded
        FROM salary_advances
        WHERE employee_id = v_emp.id AND status = 'active'
          AND remaining_amount > 0;

        -- Employee advances (lump-sum from Employee Finances UI)
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

        -- Welfare & Custom Deductions
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

        -- Total Allowances (Variable + Service Charge + Attendance + Housing/Transport/Meal)
        v_allowances := v_grade_variable + v_grade_service + v_actual_attendance
            + COALESCE(v_sal.housing_allowance, 0)
            + COALESCE(v_sal.transport_allowance, 0)
            + COALESCE(v_sal.meal_allowance, 0);

        -- Gross Salary = Basic + Allowances + Shift Allowance + OT + Extra Day Work + Additions + Commission - No-Pay - Late
        v_gross := v_basic + v_allowances + v_shift_allowance + v_normal_ot_amount
            + v_total_extra_pay + v_custom_add + v_commission - v_absent_ded - v_late_ded;

        -- Deductions from Gross: EPF + Loan + Advances + Welfare + Custom
        v_total_deductions := v_epf_emp + v_loan_ded + v_advance_ded + v_emp_adv_ded
            + v_welfare_ded + v_custom_ded + COALESCE(v_sal.other_deductions, 0);

        v_net := v_gross - v_total_deductions;

        -- Insert into payslips table
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
            late_minutes_total, late_deduction_amount,
            days_worked, days_absent,
            net_salary,
            payment_status
        ) VALUES (
            v_company_id, p_branch_id, v_run_id, v_emp.id,
            ROUND(v_basic, 2),
            COALESCE(v_sal.housing_allowance,   0),
            COALESCE(v_sal.transport_allowance, 0),
            COALESCE(v_sal.meal_allowance,      0),
            ROUND(v_grade_variable, 2),
            ROUND(v_allowances, 2),
            ROUND(v_shift_allowance, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_extra_days, 2),        ROUND(v_total_extra_pay, 2), -- Extra Day Work
            ROUND(v_commission, 2),        ROUND(v_custom_add, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2),  ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2),
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

        -- Recover salary_advances installments
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

    -- Update summary on payroll_runs
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
        'period',         v_period_start || ' to ' || v_period_end,
        'req_working_days', v_req_working_days
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_monthly_payroll(uuid, date) TO authenticated;


-- 2. Comprehensive get_payslip_breakdown matching legacy payslip & policy
CREATE OR REPLACE FUNCTION public.get_payslip_breakdown(p_payslip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_ps RECORD;
    v_grade_code       TEXT;
    v_grade_variable   NUMERIC := 0;
    v_grade_service    NUMERIC := 0;
    v_grade_attendance NUMERIC := 0;
    v_actual_attendance NUMERIC := 0;
BEGIN
    SELECT ps.*, e.full_name, e.employee_code,
           d.title AS designation_title
    INTO v_ps
    FROM payslips ps
    JOIN employees    e ON e.id = ps.employee_id
    LEFT JOIN designations d ON d.id = e.designation_id
    WHERE ps.id = p_payslip_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Payslip not found');
    END IF;

    -- Extract Pay Grade additions if mapped
    SELECT setting_value->'assignments'->>v_ps.employee_id::text INTO v_grade_code
    FROM system_settings WHERE setting_key = 'hr_employee_pay_grade_assignments';

    IF v_grade_code IS NOT NULL AND v_grade_code <> '' THEN
        SELECT 
            COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '01' OR elem->>'additionName' ILIKE '%VARIABLE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '02' OR elem->>'additionName' ILIKE '%SERVICE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN (elem->>'additionCode' = '05' OR elem->>'additionName' ILIKE '%ATTENDANCE%') THEN (elem->>'amount')::NUMERIC ELSE 0 END), 0)
        INTO v_grade_variable, v_grade_service, v_grade_attendance
        FROM system_settings s,
             jsonb_to_recordset(s.setting_value->'grades') AS g(code text, additions jsonb),
             jsonb_array_elements(g.additions) AS elem
        WHERE s.setting_key = 'hr_pay_grades_data'
          AND g.code = v_grade_code;
    ELSE
        v_grade_variable   := COALESCE(v_ps.other_allowances, 0);
        v_grade_service    := 0;
        v_grade_attendance := 0;
    END IF;

    -- Rule 3: Forfeit attendance allowance if absent > 0
    IF COALESCE(v_ps.days_absent, 0) > 0 THEN
        v_actual_attendance := 0;
    ELSE
        v_actual_attendance := v_grade_attendance;
    END IF;

    RETURN jsonb_build_object(
        'employee',         v_ps.full_name,
        'code',             v_ps.employee_code,
        'designation',      v_ps.designation_title,
        'gross',            v_ps.gross_salary,
        'gross_salary',     v_ps.gross_salary,
        'net',              v_ps.net_salary,
        'net_salary',       v_ps.net_salary,
        'total_deductions', v_ps.total_deductions,
        'total_allowances', v_ps.total_allowances,
        'basic_salary',     v_ps.basic_salary,
        'days_worked',      v_ps.days_worked,
        'days_absent',      v_ps.days_absent,
        'absent_deduction', COALESCE(v_ps.absent_deduction, 0),
        'late_minutes',     COALESCE(v_ps.late_minutes_total, COALESCE(v_ps.late_minutes, 0)),
        'late_deduction',   COALESCE(v_ps.late_deduction_amount, COALESCE(v_ps.late_deduction, 0)),
        'payment_status',   v_ps.payment_status,
        'earnings', jsonb_build_array(
            jsonb_build_object('label', 'Basic Salary',          'amount', COALESCE(v_ps.basic_salary, 0)),
            jsonb_build_object('label', 'Attendance Allowance',  'amount', v_actual_attendance),
            jsonb_build_object('label', 'Variable Allowance',    'amount', v_grade_variable),
            jsonb_build_object('label', 'Service Charge',        'amount', v_grade_service),
            jsonb_build_object('label', 'Extra Day Work',        'amount', COALESCE(v_ps.holiday_ot_amount, 0), 'days', COALESCE(v_ps.holiday_ot_hours, 0)),
            jsonb_build_object('label', 'Normal OT (1.5×)',      'amount', COALESCE(v_ps.normal_ot_amount, COALESCE(v_ps.overtime_amount, 0)), 'hours', COALESCE(v_ps.normal_ot_hours, 0)),
            jsonb_build_object('label', 'Housing Allowance',     'amount', COALESCE(v_ps.housing_allowance, 0)),
            jsonb_build_object('label', 'Transport Allowance',   'amount', COALESCE(v_ps.transport_allowance, 0)),
            jsonb_build_object('label', 'Meal Allowance',        'amount', COALESCE(v_ps.meal_allowance, 0)),
            jsonb_build_object('label', 'Shift Allowance',       'amount', COALESCE(v_ps.shift_allowance_amount, 0)),
            jsonb_build_object('label', 'Commission',            'amount', COALESCE(v_ps.commission_amount, 0)),
            jsonb_build_object('label', 'Other Additions',       'amount', COALESCE(v_ps.custom_additions, 0))
        ),
        'deductions', jsonb_build_array(
            jsonb_build_object('label', '(Less) No Pay',         'amount', COALESCE(v_ps.absent_deduction, 0), 'days', COALESCE(v_ps.days_absent, 0)),
            jsonb_build_object('label', 'Late Deduction',        'amount', COALESCE(v_ps.late_deduction_amount, COALESCE(v_ps.late_deduction, 0))),
            jsonb_build_object('label', 'EPF Employee (8%)',     'amount', COALESCE(v_ps.epf_employee, 0)),
            jsonb_build_object('label', 'Staff Loan',            'amount', COALESCE(v_ps.loan_deduction, 0)),
            jsonb_build_object('label', 'Salary Advance',        'amount', COALESCE(v_ps.advance_deduction, 0)),
            jsonb_build_object('label', 'Welfare',               'amount', COALESCE(v_ps.welfare_deduction, 0)),
            jsonb_build_object('label', 'Other Deductions',      'amount', COALESCE(v_ps.other_deductions, 0) + COALESCE(v_ps.custom_deductions, 0))
        ),
        'employer_contributions', jsonb_build_array(
            jsonb_build_object('label', 'EPF Employer (12%)', 'amount', COALESCE(v_ps.epf_employer, 0)),
            jsonb_build_object('label', 'ETF Employer (3%)',  'amount', COALESCE(v_ps.etf_employer, 0))
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payslip_breakdown(UUID) TO authenticated;
