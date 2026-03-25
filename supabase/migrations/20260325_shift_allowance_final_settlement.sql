-- ═══════════════════════════════════════════════════════════════════════════
-- SHIFT ALLOWANCES + FULL & FINAL SETTLEMENT ENGINE
-- Extends existing payroll with:
--   §1  Night/shift allowance columns on shifts table
--   §2  shift_allowance_amount column on payslips
--   §3  Updated process_monthly_payroll (adds shift allowance step)
--   §4  Updated get_payslip_breakdown (includes shift allowance)
--   §5  resignation_settlements table (F&F)
--   §6  calculate_final_settlement(p_resignation_id) RPC
--   §7  RLS for resignation_settlements
-- Run AFTER: payroll_complete_engine.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  SHIFT TYPES & NIGHT ALLOWANCE on shifts table
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS shift_type TEXT NOT NULL DEFAULT 'day'
        CHECK (shift_type IN ('day', 'evening', 'night', 'split'));

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS night_allowance_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE shifts
    ADD COLUMN IF NOT EXISTS night_allowance_type TEXT NOT NULL DEFAULT 'fixed'
        CHECK (night_allowance_type IN ('fixed', 'percentage'));

COMMENT ON COLUMN shifts.shift_type IS
    'Shift category used to determine allowance eligibility: day | evening | night | split';
COMMENT ON COLUMN shifts.night_allowance_amount IS
    'Extra allowance per shift worked. If type=fixed, this is LKR amount. If type=percentage, this is % of basic_salary.';
COMMENT ON COLUMN shifts.night_allowance_type IS
    'fixed = flat LKR per shift; percentage = % of monthly basic_salary per shift worked';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  PAYSLIP COLUMN for shift allowance
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE payslips
    ADD COLUMN IF NOT EXISTS shift_allowance_amount NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN payslips.shift_allowance_amount IS
    'Total shift allowance (night/evening premium) earned for the payroll period';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  UPDATED process_monthly_payroll — adds shift allowance step (N in formula)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION process_monthly_payroll(
    p_branch_id     UUID,
    p_period_month  DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_shift_allowance NUMERIC;
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
    v_advance_ded  NUMERIC;
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

    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        v_basic            := 0; v_allowances    := 0; v_shift_allowance := 0;
        v_custom_add       := 0; v_commission    := 0;
        v_normal_ot_hours  := 0; v_normal_ot_amount  := 0;
        v_holiday_ot_hours := 0; v_holiday_ot_amount := 0;
        v_days_worked := 0; v_days_absent := 0; v_absent_ded := 0;
        v_late_minutes := 0; v_late_ded := 0;
        v_epf_emp := 0; v_epf_er := 0; v_etf_er := 0;
        v_loan_ded := 0; v_advance_ded := 0; v_welfare_ded := 0; v_custom_ded := 0;
        v_gross := 0; v_total_deductions := 0; v_net := 0;

        SELECT * INTO v_sal FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;
        IF v_sal.id IS NULL THEN CONTINUE; END IF;

        -- Hourly & daily rates
        v_hourly_rate := CASE WHEN COALESCE(v_sal.hourly_rate, 0) > 0
                              THEN v_sal.hourly_rate
                              ELSE COALESCE(v_sal.basic_salary, 0) / 240.0
                         END;
        v_daily_rate  := COALESCE(v_sal.basic_salary, 0) / 26.0;

        -- A. Basic Salary
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

        -- B. Absent Deduction
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

        -- C. Late Deductions
        SELECT COALESCE(SUM(late_minutes), 0) INTO v_late_minutes
        FROM attendance_records
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND late_minutes > 0;
        v_late_ded := (v_late_minutes / 60.0) * v_hourly_rate;

        -- D. Normal OT (1.5×)
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_normal_ot_hours
        FROM attendance_records
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = false;
        v_normal_ot_amount := v_normal_ot_hours * v_hourly_rate
                              * COALESCE(v_sal.overtime_rate_multiplier, 1.5);

        -- E. Holiday OT (2×)
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_holiday_ot_hours
        FROM attendance_records
        WHERE employee_id = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = true;
        v_holiday_ot_amount := v_holiday_ot_hours * v_hourly_rate
                               * COALESCE(v_sal.holiday_ot_multiplier, 2.0);

        -- F. Fixed Allowances (salary structure)
        v_allowances :=
            COALESCE(v_sal.housing_allowance,   0) +
            COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance,      0) +
            COALESCE(v_sal.other_allowances,    0);

        -- F2. Employee-specific allowances
        SELECT COALESCE(SUM(ea.amount), 0) INTO v_allowances
        FROM (
            SELECT 0 AS amount
            UNION ALL
            SELECT COALESCE(SUM(ea2.amount), 0)
            FROM employee_allowances ea2
            WHERE ea2.employee_id  = v_emp.id AND ea2.is_active = true
              AND ea2.effective_from <= v_period_end
              AND (ea2.effective_to IS NULL OR ea2.effective_to >= v_period_start)
        ) ea;
        v_allowances := v_allowances +
            COALESCE(v_sal.housing_allowance, 0) + COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance, 0)    + COALESCE(v_sal.other_allowances, 0);

        -- G. Shift Allowance (night/evening premiums from assigned shifts)
        SELECT COALESCE(SUM(
            CASE
                WHEN s.night_allowance_type = 'fixed'
                    THEN s.night_allowance_amount
                WHEN s.night_allowance_type = 'percentage'
                    THEN ROUND(v_basic * s.night_allowance_amount / 100.0, 2)
                ELSE 0
            END
        ), 0) INTO v_shift_allowance
        FROM shift_assignments sa
        JOIN shifts s ON s.id = sa.shift_id
        WHERE sa.employee_id = v_emp.id
          AND sa.assignment_date BETWEEN v_period_start AND v_period_end
          AND s.night_allowance_amount > 0
          AND COALESCE(s.shift_type, 'day') IN ('evening', 'night', 'split');

        -- H. Custom Additions
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id = v_emp.id
          AND start_date  <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- I. EPF / ETF
        v_epf_emp := v_basic * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0);
        v_epf_er  := v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0);
        v_etf_er  := v_basic * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0);

        -- J. Loan Deductions
        SELECT COALESCE(SUM(LEAST(monthly_installment, remaining_balance)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active'
          AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start);

        -- K. Salary Advance Deductions
        SELECT COALESCE(SUM(amount_per_installment), 0) INTO v_advance_ded
        FROM salary_advances
        WHERE employee_id = v_emp.id AND status = 'active' AND remaining_amount > 0;

        -- L. Welfare
        IF v_emp.welfare_active THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_welfare_ded
            FROM salary_deductions
            WHERE employee_id = v_emp.id AND deduction_type = 'welfare'
              AND start_date <= v_period_end
              AND (end_date IS NULL OR end_date >= v_period_start);
        END IF;

        -- M. Custom Deductions
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_ded
        FROM salary_deductions
        WHERE employee_id = v_emp.id AND deduction_type != 'welfare'
          AND start_date <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- N. Gross (Basic + Allowances + ShiftAllowance + OT + Additions + Commission – Absent – Late)
        v_gross :=
            v_basic
            + v_allowances
            + v_shift_allowance
            + v_normal_ot_amount
            + v_holiday_ot_amount
            + v_custom_add
            + v_commission
            - v_absent_ded
            - v_late_ded;

        -- O. Total Deductions
        v_total_deductions :=
            v_epf_emp
            + v_loan_ded
            + v_advance_ded
            + v_welfare_ded
            + v_custom_ded
            + COALESCE(v_sal.other_deductions, 0);

        v_net := v_gross - v_total_deductions;

        -- P. Insert Payslip
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
            welfare_deduction,
            custom_deductions,
            other_deductions,
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
            COALESCE(v_sal.other_allowances,    0),
            ROUND(v_allowances, 2),
            ROUND(v_shift_allowance, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_holiday_ot_hours, 2),  ROUND(v_holiday_ot_amount, 2),
            ROUND(v_commission, 2),        ROUND(v_custom_add, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2), ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2),
            ROUND(v_advance_ded, 2),
            ROUND(v_welfare_ded, 2),
            ROUND(v_custom_ded, 2),
            COALESCE(v_sal.other_deductions, 0),
            ROUND(v_total_deductions, 2),
            v_late_minutes, ROUND(v_late_ded, 2),
            v_days_worked,  v_days_absent,
            ROUND(v_net, 2),
            'pending'
        );

        -- Q. Recover salary advances
        DECLARE
            v_adv         RECORD;
            v_installment NUMERIC;
        BEGIN
            FOR v_adv IN
                SELECT * FROM salary_advances
                WHERE employee_id = v_emp.id AND status = 'active' AND remaining_amount > 0
                ORDER BY advance_date ASC
            LOOP
                v_installment := LEAST(v_adv.amount_per_installment, v_adv.remaining_amount);
                UPDATE salary_advances
                SET
                    recovered_amount = recovered_amount + v_installment,
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
        'success',          true,
        'payroll_run_id',   v_run_id,
        'employee_count',   v_count,
        'total_gross',      ROUND(v_total_gross, 2),
        'total_deductions', ROUND(v_total_ded,   2),
        'total_net',        ROUND(v_total_net,   2),
        'period',           v_period_start || ' to ' || v_period_end
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION process_monthly_payroll(UUID, DATE) TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  UPDATED get_payslip_breakdown — includes shift allowance
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_payslip_breakdown(p_payslip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_ps RECORD;
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

    RETURN jsonb_build_object(
        'employee',     v_ps.full_name,
        'code',         v_ps.employee_code,
        'designation',  v_ps.designation_title,
        'gross',        v_ps.gross_salary,
        'net',          v_ps.net_salary,
        'days_worked',  v_ps.days_worked,
        'days_absent',  v_ps.days_absent,
        'late_minutes', COALESCE(v_ps.late_minutes_total, COALESCE(v_ps.late_minutes, 0)),
        'payment_status', v_ps.payment_status,
        'earnings', jsonb_build_array(
            jsonb_build_object('label', 'Basic Salary',         'amount', COALESCE(v_ps.basic_salary, 0)),
            jsonb_build_object('label', 'Housing Allowance',    'amount', COALESCE(v_ps.housing_allowance, 0)),
            jsonb_build_object('label', 'Transport Allowance',  'amount', COALESCE(v_ps.transport_allowance, 0)),
            jsonb_build_object('label', 'Meal Allowance',       'amount', COALESCE(v_ps.meal_allowance, 0)),
            jsonb_build_object('label', 'Other Allowances',     'amount', COALESCE(v_ps.other_allowances, 0)),
            jsonb_build_object('label', 'Shift Allowance',      'amount', COALESCE(v_ps.shift_allowance_amount, 0)),
            jsonb_build_object('label', 'Normal OT (1.5×)',     'amount', COALESCE(v_ps.normal_ot_amount, COALESCE(v_ps.overtime_amount, 0))),
            jsonb_build_object('label', 'Holiday OT (2×)',      'amount', COALESCE(v_ps.holiday_ot_amount, 0)),
            jsonb_build_object('label', 'Commission',           'amount', COALESCE(v_ps.commission_amount, 0)),
            jsonb_build_object('label', 'Other Additions',      'amount', COALESCE(v_ps.custom_additions, 0))
        ),
        'deductions', jsonb_build_array(
            jsonb_build_object('label', 'Absent Deduction',   'amount', ROUND(v_ps.days_absent * (COALESCE(v_ps.basic_salary, 0) / 26.0), 2)),
            jsonb_build_object('label', 'Late Deduction',     'amount', COALESCE(v_ps.late_deduction_amount, COALESCE(v_ps.late_deduction, 0))),
            jsonb_build_object('label', 'EPF Employee (8%)',  'amount', COALESCE(v_ps.epf_employee, 0)),
            jsonb_build_object('label', 'Loan Deduction',     'amount', COALESCE(v_ps.loan_deduction, 0)),
            jsonb_build_object('label', 'Salary Advance',     'amount', COALESCE(v_ps.advance_deduction, 0)),
            jsonb_build_object('label', 'Welfare',            'amount', COALESCE(v_ps.welfare_deduction, 0)),
            jsonb_build_object('label', 'Other Deductions',   'amount', COALESCE(v_ps.other_deductions, 0))
        ),
        'employer_contributions', jsonb_build_array(
            jsonb_build_object('label', 'EPF Employer (12%)', 'amount', COALESCE(v_ps.epf_employer, 0)),
            jsonb_build_object('label', 'ETF Employer (3%)',  'amount', COALESCE(v_ps.etf_employer, 0))
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_payslip_breakdown(UUID) TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  RESIGNATION SETTLEMENTS TABLE (Full & Final)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS resignation_settlements (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resignation_id   UUID NOT NULL REFERENCES employee_resignations(id) ON DELETE CASCADE,
    employee_id      UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id        UUID NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,

    -- Earnings
    pro_rata_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
    leave_encashment     NUMERIC(12,2) NOT NULL DEFAULT 0,
    gratuity_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_earnings       NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Deductions
    advance_recovery     NUMERIC(12,2) NOT NULL DEFAULT 0,
    loan_recovery        NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Computed totals (stored for PDF/audit)
    total_earnings       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_deductions     NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_settlement       NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Calculation metadata
    years_of_service     NUMERIC(5,2)  NOT NULL DEFAULT 0,
    unused_leave_days    NUMERIC(5,1)  NOT NULL DEFAULT 0,
    days_worked_last_month INT         NOT NULL DEFAULT 0,
    last_basic_salary    NUMERIC(12,2) NOT NULL DEFAULT 0,
    daily_rate           NUMERIC(12,2) NOT NULL DEFAULT 0,

    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'approved', 'paid')),
    approved_by  UUID REFERENCES auth.users(id),
    approved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),

    UNIQUE (resignation_id)
);

CREATE INDEX IF NOT EXISTS idx_resign_settle_employee ON resignation_settlements(employee_id);
CREATE INDEX IF NOT EXISTS idx_resign_settle_branch   ON resignation_settlements(branch_id);

DROP TRIGGER IF EXISTS trg_resign_settle_updated ON resignation_settlements;
CREATE TRIGGER trg_resign_settle_updated
    BEFORE UPDATE ON resignation_settlements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  calculate_final_settlement(p_resignation_id UUID)
--
-- Sri Lanka F&F rules:
--   • Pro-rata salary   = (daily_rate × days_worked_in_last_partial_month)
--   • Leave encashment  = remaining annual leave days × daily_rate
--   • Gratuity          = 14 days × years_of_service × daily_rate
--                         (eligible only if service >= 5 years)
--   • Advances          = sum of remaining_amount on active salary_advances
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION calculate_final_settlement(p_resignation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resign          RECORD;
    v_emp             RECORD;
    v_sal             RECORD;
    v_hire_date       DATE;
    v_last_day        DATE;
    v_years           NUMERIC(5,2);
    v_basic           NUMERIC(12,2);
    v_daily           NUMERIC(12,2);
    v_days_worked     INT;
    v_pro_rata        NUMERIC(12,2);
    v_unused_leave    NUMERIC(5,1);
    v_leave_enc       NUMERIC(12,2);
    v_gratuity        NUMERIC(12,2);
    v_advance_rec     NUMERIC(12,2);
    v_loan_rec        NUMERIC(12,2);
    v_total_earn      NUMERIC(12,2);
    v_total_ded       NUMERIC(12,2);
    v_net             NUMERIC(12,2);
BEGIN
    SELECT * INTO v_resign FROM employee_resignations WHERE id = p_resignation_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Resignation record not found');
    END IF;

    SELECT * INTO v_emp FROM employees WHERE id = v_resign.employee_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Employee not found');
    END IF;

    v_hire_date := COALESCE(v_emp.hire_date, CURRENT_DATE - INTERVAL '1 year');
    v_last_day  := COALESCE(v_resign.last_working_day, CURRENT_DATE);

    -- Years of service (exact)
    v_years := ROUND(
        EXTRACT(EPOCH FROM (v_last_day::TIMESTAMPTZ - v_hire_date::TIMESTAMPTZ))
        / (365.25 * 86400), 2
    );

    -- Current salary structure
    SELECT * INTO v_sal FROM salary_structures
    WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

    v_basic := COALESCE(v_sal.basic_salary, 0);
    v_daily := ROUND(v_basic / 26.0, 2);

    -- Pro-rata: days worked in the last (partial) month
    v_days_worked := EXTRACT(DAY FROM v_last_day)::INT;
    v_pro_rata    := ROUND(v_daily * v_days_worked, 2);

    -- Unused annual leave encashment
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

    -- Gratuity (Sri Lanka: eligible after 5 years service)
    -- Formula: 14 days × years_of_service × daily_rate (capped at 26-day month basis)
    IF v_years >= 5 THEN
        v_gratuity := ROUND(14.0 * v_years * v_daily, 2);
    ELSE
        v_gratuity := 0;
    END IF;

    -- Outstanding salary advance recovery
    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_advance_rec
    FROM salary_advances
    WHERE employee_id = v_emp.id AND status = 'active';

    -- Outstanding loan recovery
    SELECT COALESCE(SUM(remaining_balance), 0) INTO v_loan_rec
    FROM employee_loans
    WHERE employee_id = v_emp.id AND status = 'active';

    v_total_earn := v_pro_rata + v_leave_enc + v_gratuity;
    v_total_ded  := v_advance_rec + v_loan_rec;
    v_net        := v_total_earn - v_total_ded;

    -- Upsert settlement record
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
        v_years, v_unused_leave, v_days_worked,
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
        updated_at         = now();

    RETURN jsonb_build_object(
        'resignation_id',       p_resignation_id,
        'employee_name',        v_emp.full_name,
        'employee_code',        v_emp.employee_code,
        'hire_date',            v_hire_date,
        'last_working_day',     v_last_day,
        'years_of_service',     v_years,
        'last_basic_salary',    v_basic,
        'daily_rate',           v_daily,
        'days_worked_last_month', v_days_worked,
        'pro_rata_salary',      v_pro_rata,
        'unused_leave_days',    v_unused_leave,
        'leave_encashment',     v_leave_enc,
        'gratuity_amount',      v_gratuity,
        'advance_recovery',     v_advance_rec,
        'loan_recovery',        v_loan_rec,
        'total_earnings',       v_total_earn,
        'total_deductions',     v_total_ded,
        'net_settlement',       v_net,
        'gratuity_eligible',    (v_years >= 5)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_final_settlement(UUID) TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  RLS for resignation_settlements
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE resignation_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rs_hr_all ON resignation_settlements;
CREATE POLICY rs_hr_all ON resignation_settlements
    USING (auth_has_role('admin') OR auth_has_role('hr'));
