-- ═══════════════════════════════════════════════════════════════════════════════
-- PAYROLL COMPLETE ENGINE
-- Net Salary = (Basic + Allowances + OT) – (Absent + Late + EPF + Advances + Deductions)
-- Features:
--   §1  Holiday OT column on attendance_records (2× rate)
--   §2  holiday_ot_multiplier on salary_structures
--   §3  Salary Advances table (simpler than employee_loans)
--   §4  Payslip columns for all new items
--   §5  Updated process_monthly_payroll with full formula
--   §6  RLS for salary_advances
-- Run AFTER: hr_payroll.sql, hrms_complete_module.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  ATTENDANCE: Flag public-holiday worked days for 2× OT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE attendance_records
    ADD COLUMN IF NOT EXISTS is_public_holiday BOOLEAN DEFAULT false;

COMMENT ON COLUMN attendance_records.is_public_holiday IS
  'True when the employee worked on a declared public holiday → overtime earns 2× rate';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  SALARY STRUCTURES: Holiday OT multiplier
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE salary_structures
    ADD COLUMN IF NOT EXISTS holiday_ot_multiplier NUMERIC(4,2) DEFAULT 2.0;

COMMENT ON COLUMN salary_structures.holiday_ot_multiplier IS
  'OT rate multiplier for public holidays (default 2.0 = double time)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  SALARY ADVANCES TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS salary_advances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
    employee_id         UUID NOT NULL REFERENCES employees(id)  ON DELETE CASCADE,
    advance_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason              TEXT,
    installments        INT NOT NULL DEFAULT 1 CHECK (installments >= 1),
    amount_per_installment NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(amount / installments, 2)) STORED,
    recovered_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    remaining_amount    NUMERIC(12,2) GENERATED ALWAYS AS (amount - recovered_amount) STORED,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'fully_recovered', 'written_off')),
    approved_by         UUID REFERENCES auth.users(id),
    approved_at         TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advances_employee  ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_advances_branch    ON salary_advances(branch_id);
CREATE INDEX IF NOT EXISTS idx_advances_status    ON salary_advances(status) WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_salary_advances_updated ON salary_advances;
CREATE TRIGGER trg_salary_advances_updated
    BEFORE UPDATE ON salary_advances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  PAYSLIP COLUMNS for new items
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Holiday OT
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS holiday_ot_hours   NUMERIC(5,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS holiday_ot_amount  NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS normal_ot_hours    NUMERIC(5,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS normal_ot_amount   NUMERIC(12,2) DEFAULT 0;

-- Late deduction (from attendance_records.late_minutes)
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_minutes_total    INT          DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_deduction_amount NUMERIC(12,2) DEFAULT 0;

-- Salary advance deduction
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(12,2) DEFAULT 0;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  UPDATED process_monthly_payroll
--     Formula: Net = (Basic + Allowances + NormalOT + HolidayOT + Additions + Commission)
--                  – (AbsentDeduction + LateDeduction + EPF_Emp + Loans
--                     + Advances + Welfare + CustomDeductions)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION process_monthly_payroll(
    p_branch_id     UUID,
    p_period_month  DATE   -- first day of month e.g. '2026-03-01'
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

    -- Employee / salary
    v_emp RECORD;
    v_sal RECORD;

    -- Rates
    v_hourly_rate   NUMERIC;
    v_daily_rate    NUMERIC;
    v_basic         NUMERIC;

    -- Earnings
    v_allowances    NUMERIC;
    v_custom_add    NUMERIC;
    v_commission    NUMERIC;

    -- Normal OT (1.5×)
    v_normal_ot_hours  NUMERIC;
    v_normal_ot_amount NUMERIC;

    -- Holiday OT (2×)
    v_holiday_ot_hours  NUMERIC;
    v_holiday_ot_amount NUMERIC;

    -- Absence
    v_days_worked   INT;
    v_days_absent   INT;
    v_absent_ded    NUMERIC;

    -- Late
    v_late_minutes  INT;
    v_late_ded      NUMERIC;

    -- Deductions
    v_epf_emp      NUMERIC;
    v_epf_er       NUMERIC;
    v_etf_er       NUMERIC;
    v_loan_ded     NUMERIC;
    v_advance_ded  NUMERIC;
    v_welfare_ded  NUMERIC;
    v_custom_ded   NUMERIC;

    -- Totals
    v_gross            NUMERIC;
    v_total_deductions NUMERIC;
    v_net              NUMERIC;

    -- Run accumulators
    v_count       INT     := 0;
    v_total_gross NUMERIC := 0;
    v_total_net   NUMERIC := 0;
    v_total_ded   NUMERIC := 0;
BEGIN
    -- ── Auth guard ─────────────────────────────────────────────────────────────
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('admin') OR auth_has_role('hr')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only HR/Admin can run payroll.');
    END IF;

    -- ── Period ─────────────────────────────────────────────────────────────────
    v_period_start := date_trunc('month', p_period_month)::DATE;
    v_period_end   := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT company_id INTO v_company_id FROM branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Branch not found.');
    END IF;

    -- ── Create / update payroll run ────────────────────────────────────────────
    INSERT INTO payroll_runs (company_id, branch_id, period_start, period_end, status, processed_by)
    VALUES (v_company_id, p_branch_id, v_period_start, v_period_end, 'processing', v_user_id)
    ON CONFLICT (branch_id, period_start, period_end) DO UPDATE SET
        status = 'processing', processed_by = v_user_id, updated_at = now()
    RETURNING id INTO v_run_id;

    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- ── Employee loop ──────────────────────────────────────────────────────────
    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= v_period_start)
    LOOP
        -- Reset
        v_basic            := 0; v_allowances   := 0; v_custom_add   := 0; v_commission   := 0;
        v_normal_ot_hours  := 0; v_normal_ot_amount := 0;
        v_holiday_ot_hours := 0; v_holiday_ot_amount := 0;
        v_days_worked := 0; v_days_absent := 0; v_absent_ded := 0;
        v_late_minutes := 0; v_late_ded := 0;
        v_epf_emp := 0; v_epf_er := 0; v_etf_er := 0;
        v_loan_ded := 0; v_advance_ded := 0; v_welfare_ded := 0; v_custom_ded := 0;
        v_gross := 0; v_total_deductions := 0; v_net := 0;

        -- Get salary structure
        SELECT * INTO v_sal FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true LIMIT 1;

        IF v_sal.id IS NULL THEN CONTINUE; END IF;

        -- ── Derive hourly & daily rate ─────────────────────────────────────────
        v_hourly_rate := CASE WHEN COALESCE(v_sal.hourly_rate, 0) > 0
                              THEN v_sal.hourly_rate
                              ELSE COALESCE(v_sal.basic_salary, 0) / 240.0
                         END;
        v_daily_rate  := COALESCE(v_sal.basic_salary, 0) / 26.0;  -- 26 working days (SL standard)

        -- ── A. Basic Salary (by method) ────────────────────────────────────────
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

        -- ── B. Absent Deduction (basic_salary method only) ────────────────────
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

        -- ── C. Late Deductions ─────────────────────────────────────────────────
        SELECT COALESCE(SUM(late_minutes), 0) INTO v_late_minutes
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND late_minutes   > 0;

        -- 1 minute late = hourly_rate / 60
        v_late_ded := (v_late_minutes / 60.0) * v_hourly_rate;

        -- ── D. Normal OT (1.5×) on regular days ───────────────────────────────
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_normal_ot_hours
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = false;

        v_normal_ot_amount := v_normal_ot_hours * v_hourly_rate
                              * COALESCE(v_sal.overtime_rate_multiplier, 1.5);

        -- ── E. Holiday OT (2×) on public holiday worked days ──────────────────
        SELECT COALESCE(SUM(overtime_hours), 0) INTO v_holiday_ot_hours
        FROM attendance_records
        WHERE employee_id    = v_emp.id
          AND attendance_date BETWEEN v_period_start AND v_period_end
          AND COALESCE(is_public_holiday, false) = true;

        v_holiday_ot_amount := v_holiday_ot_hours * v_hourly_rate
                               * COALESCE(v_sal.holiday_ot_multiplier, 2.0);

        -- ── F. Allowances (fixed from structure + employee-specific) ───────────
        v_allowances :=
            COALESCE(v_sal.housing_allowance,   0) +
            COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance,      0) +
            COALESCE(v_sal.other_allowances,    0);

        -- Employee-specific allowances
        SELECT COALESCE(SUM(amount), 0) INTO v_allowances
        FROM (
            -- Fixed structure allowances (already in v_allowances above, skip double-count)
            SELECT 0 AS amount
            UNION ALL
            SELECT COALESCE(SUM(ea.amount), 0)
            FROM employee_allowances ea
            WHERE ea.employee_id  = v_emp.id AND ea.is_active = true
              AND ea.effective_from <= v_period_end
              AND (ea.effective_to IS NULL OR ea.effective_to >= v_period_start)
        ) sub;

        -- Re-add fixed structure allowances (the query above only gets employee_allowances)
        v_allowances := v_allowances +
            COALESCE(v_sal.housing_allowance, 0) + COALESCE(v_sal.transport_allowance, 0) +
            COALESCE(v_sal.meal_allowance, 0)    + COALESCE(v_sal.other_allowances, 0);

        -- ── G. Custom Additions (salary_additions table) ───────────────────────
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_add
        FROM salary_additions
        WHERE employee_id  = v_emp.id
          AND start_date  <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- ── H. EPF / ETF ───────────────────────────────────────────────────────
        v_epf_emp := v_basic * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0);
        v_epf_er  := v_basic * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0);
        v_etf_er  := v_basic * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0);

        -- ── I. Loan Deductions (employee_loans) ────────────────────────────────
        SELECT COALESCE(SUM(LEAST(monthly_installment, remaining_balance)), 0) INTO v_loan_ded
        FROM employee_loans
        WHERE employee_id = v_emp.id AND status = 'active'
          AND (expected_completion_date IS NULL OR expected_completion_date >= v_period_start);

        -- ── J. Salary Advance Deductions ───────────────────────────────────────
        SELECT COALESCE(SUM(amount_per_installment), 0) INTO v_advance_ded
        FROM salary_advances
        WHERE employee_id = v_emp.id AND status = 'active'
          AND remaining_amount > 0;

        -- ── K. Welfare Deduction ───────────────────────────────────────────────
        IF v_emp.welfare_active THEN
            SELECT COALESCE(SUM(amount), 0) INTO v_welfare_ded
            FROM salary_deductions
            WHERE employee_id = v_emp.id AND deduction_type = 'welfare'
              AND start_date <= v_period_end
              AND (end_date IS NULL OR end_date >= v_period_start);
        END IF;

        -- ── L. Custom Deductions (salary_deductions, excluding welfare) ────────
        SELECT COALESCE(SUM(amount), 0) INTO v_custom_ded
        FROM salary_deductions
        WHERE employee_id = v_emp.id AND deduction_type != 'welfare'
          AND start_date <= v_period_end
          AND (end_date IS NULL OR end_date >= v_period_start);

        -- ── M. Gross & Net ─────────────────────────────────────────────────────
        -- Gross = Basic + Allowances + NormalOT + HolidayOT + Additions + Commission
        --       – AbsentDeduction – LateDeduction
        v_gross :=
            v_basic
            + v_allowances
            + v_normal_ot_amount
            + v_holiday_ot_amount
            + v_custom_add
            + v_commission
            - v_absent_ded
            - v_late_ded;

        -- Total employee-side deductions
        v_total_deductions :=
            v_epf_emp
            + v_loan_ded
            + v_advance_ded
            + v_welfare_ded
            + v_custom_ded
            + COALESCE(v_sal.other_deductions, 0);

        v_net := v_gross - v_total_deductions;

        -- ── N. Insert Payslip ──────────────────────────────────────────────────
        INSERT INTO payslips (
            company_id, branch_id, payroll_run_id, employee_id,
            basic_salary,
            housing_allowance, transport_allowance, meal_allowance, other_allowances,
            total_allowances,
            -- Normal OT
            overtime_hours,    overtime_amount,
            normal_ot_hours,   normal_ot_amount,
            -- Holiday OT
            holiday_ot_hours,  holiday_ot_amount,
            -- Commission & Additions
            commission_amount, custom_additions,
            -- Gross
            gross_salary,
            -- Deductions
            epf_employee, epf_employer, etf_employer,
            loan_deduction,
            advance_deduction,
            welfare_deduction,
            custom_deductions,
            other_deductions,
            total_deductions,
            -- Late
            late_minutes_total,  late_deduction_amount,
            -- Attendance
            days_worked, days_absent,
            -- Net
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
            -- Normal OT (backward-compat: overtime_hours / overtime_amount = normal OT)
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_normal_ot_hours, 2),   ROUND(v_normal_ot_amount, 2),
            ROUND(v_holiday_ot_hours, 2),  ROUND(v_holiday_ot_amount, 2),
            ROUND(v_commission, 2),        ROUND(v_custom_add, 2),
            ROUND(v_gross, 2),
            ROUND(v_epf_emp, 2),  ROUND(v_epf_er, 2), ROUND(v_etf_er, 2),
            ROUND(v_loan_ded, 2),
            ROUND(v_advance_ded, 2),
            ROUND(v_welfare_ded, 2),
            ROUND(v_custom_ded, 2),
            COALESCE(v_sal.other_deductions, 0),
            ROUND(v_total_deductions, 2),
            v_late_minutes,  ROUND(v_late_ded, 2),
            v_days_worked,   v_days_absent,
            ROUND(v_net, 2),
            'pending'
        );

        -- ── O. Recover salary advances ─────────────────────────────────────────
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
                SET
                    recovered_amount = recovered_amount + v_installment,
                    status = CASE WHEN (remaining_amount - v_installment) <= 0
                                  THEN 'fully_recovered'
                                  ELSE 'active' END,
                    updated_at = now()
                WHERE id = v_adv.id;
            END LOOP;
        END;

        v_count       := v_count       + 1;
        v_total_gross := v_total_gross + v_gross;
        v_total_net   := v_total_net   + v_net;
        v_total_ded   := v_total_ded   + v_total_deductions;
    END LOOP;

    -- ── Finalise payroll run ───────────────────────────────────────────────────
    UPDATE payroll_runs SET
        total_gross      = ROUND(v_total_gross, 2),
        total_deductions = ROUND(v_total_ded,   2),
        total_net        = ROUND(v_total_net,   2),
        employee_count   = v_count,
        status           = 'processed',
        updated_at       = now()
    WHERE id = v_run_id;

    -- Audit
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
$$;

GRANT EXECUTE ON FUNCTION process_monthly_payroll(UUID, DATE) TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  RLS FOR SALARY ADVANCES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

-- HR/Admin: full access
DROP POLICY IF EXISTS sa_hr_all ON salary_advances;
CREATE POLICY sa_hr_all ON salary_advances
  USING (auth_has_role('admin') OR auth_has_role('hr'));

-- Employee: view own advances only
DROP POLICY IF EXISTS sa_self_select ON salary_advances;
CREATE POLICY sa_self_select ON salary_advances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = salary_advances.employee_id
        AND e.profile_id = auth.uid()
        AND e.is_active  = true
    )
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  RPC: get_payslip_breakdown — detailed formula for UI
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_payslip_breakdown(p_payslip_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_ps RECORD;
    v_emp RECORD;
BEGIN
    SELECT ps.*, e.full_name, e.employee_code
    INTO v_ps
    FROM payslips ps
    JOIN employees e ON e.id = ps.employee_id
    WHERE ps.id = p_payslip_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Payslip not found');
    END IF;

    RETURN jsonb_build_object(
        'employee',  v_ps.full_name,
        'code',      v_ps.employee_code,
        'earnings', jsonb_build_array(
            jsonb_build_object('label', 'Basic Salary',         'amount', v_ps.basic_salary),
            jsonb_build_object('label', 'Housing Allowance',    'amount', v_ps.housing_allowance),
            jsonb_build_object('label', 'Transport Allowance',  'amount', v_ps.transport_allowance),
            jsonb_build_object('label', 'Meal Allowance',       'amount', v_ps.meal_allowance),
            jsonb_build_object('label', 'Other Allowances',     'amount', v_ps.other_allowances),
            jsonb_build_object('label', 'Normal OT',            'amount', COALESCE(v_ps.normal_ot_amount, v_ps.overtime_amount)),
            jsonb_build_object('label', 'Holiday OT (2×)',      'amount', COALESCE(v_ps.holiday_ot_amount, 0)),
            jsonb_build_object('label', 'Commission',           'amount', COALESCE(v_ps.commission_amount, 0)),
            jsonb_build_object('label', 'Other Additions',      'amount', COALESCE(v_ps.custom_additions, 0))
        ),
        'deductions', jsonb_build_array(
            jsonb_build_object('label', 'Absent Deduction',        'amount', (v_ps.days_absent * (v_ps.basic_salary / 26.0))),
            jsonb_build_object('label', 'Late Deduction',          'amount', COALESCE(v_ps.late_deduction_amount, COALESCE(v_ps.late_deduction, 0))),
            jsonb_build_object('label', 'EPF (Employee 8%)',       'amount', v_ps.epf_employee),
            jsonb_build_object('label', 'Loan Deduction',          'amount', v_ps.loan_deduction),
            jsonb_build_object('label', 'Salary Advance',          'amount', COALESCE(v_ps.advance_deduction, 0)),
            jsonb_build_object('label', 'Welfare',                 'amount', COALESCE(v_ps.welfare_deduction, 0)),
            jsonb_build_object('label', 'Other Deductions',        'amount', v_ps.other_deductions)
        ),
        'employer_contributions', jsonb_build_array(
            jsonb_build_object('label', 'EPF Employer (12%)', 'amount', v_ps.epf_employer),
            jsonb_build_object('label', 'ETF Employer (3%)',  'amount', v_ps.etf_employer)
        ),
        'gross_salary', v_ps.gross_salary,
        'total_deductions', v_ps.total_deductions,
        'net_salary', v_ps.net_salary,
        'days_worked', v_ps.days_worked,
        'days_absent', v_ps.days_absent,
        'late_minutes', COALESCE(v_ps.late_minutes_total, COALESCE(v_ps.late_minutes, 0)),
        'payment_status', v_ps.payment_status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_payslip_breakdown(UUID) TO authenticated;

DO $$ BEGIN
  RAISE NOTICE '[PAYROLL] ✅ Migration 20260325_payroll_complete_engine applied';
END $$;
