-- ═══════════════════════════════════════════════════════════════════════════════
-- HR MODULE ENHANCEMENTS
-- Features: Document Management · Leave-Payroll Integration · Attendance-Payroll
-- Run AFTER: hrms_complete_module.sql, payroll_engine.sql, leave_management.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  EMPLOYEE DOCUMENTS — Add contract_letter & bank_statement doc types
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE employee_documents DROP CONSTRAINT IF EXISTS chk_doc_type;
ALTER TABLE employee_documents
  ADD CONSTRAINT chk_doc_type CHECK (
    doc_type IN (
      'nic_front', 'nic_back', 'photo', 'gs_letter', 'police_report',
      'driving_license', 'passport', 'birth_certificate', 'cv',
      'educational_cert', 'experience_letter', 'contract_letter',
      'bank_statement', 'other'
    )
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  RLS FOR EMPLOYEE DOCUMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- HR / Admin: full access to all documents in their company
DROP POLICY IF EXISTS edoc_hr_all ON employee_documents;
CREATE POLICY edoc_hr_all ON employee_documents
  USING (
    (auth_has_role('admin') OR auth_has_role('hr'))
  );

-- Employee: view own documents only
DROP POLICY IF EXISTS edoc_self_select ON employee_documents;
CREATE POLICY edoc_self_select ON employee_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = employee_documents.employee_id
        AND e.profile_id = auth.uid()
        AND e.is_active = true
    )
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  PAYSLIP COLUMNS FOR ATTENDANCE & LEAVE TRACKING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_minutes      INT            DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_deduction    NUMERIC(12,2)  DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS short_leave_hours NUMERIC(5,2)   DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS short_leave_deduction NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS unpaid_leave_days NUMERIC(5,1)   DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS paid_leave_days   NUMERIC(5,1)   DEFAULT 0;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  UPDATED PAYROLL ENGINE — Includes Late Deductions & Leave Integration
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION generate_payroll(
    p_company_id   UUID,
    p_branch_id    UUID,
    p_period_start DATE,
    p_period_end   DATE,
    p_processed_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_run_id UUID;
    v_emp    RECORD;
    v_sal    RECORD;

    -- Basic rate variables
    v_basic          NUMERIC;
    v_daily_rate     NUMERIC;
    v_hourly_rate    NUMERIC;

    -- Overtime
    v_ot_hours  NUMERIC;
    v_ot_amount NUMERIC;

    -- Attendance deductions
    v_absent_days          INT;
    v_late_minutes         INT;
    v_late_deduction       NUMERIC;
    v_short_leave_hours    NUMERIC;
    v_short_leave_deduction NUMERIC;
    v_no_pay_deduction     NUMERIC;

    -- Leave
    v_unpaid_leave_days NUMERIC;
    v_paid_leave_days   NUMERIC;

    -- Allowances & EPF
    v_total_allowances NUMERIC;
    v_epf_base         NUMERIC;
    v_epf_employee     NUMERIC;
    v_epf_employer     NUMERIC;
    v_etf_employer     NUMERIC;

    -- Loan
    v_loan_deduction NUMERIC;

    -- Totals
    v_gross            NUMERIC;
    v_total_deductions NUMERIC;
    v_net              NUMERIC;

    -- Run accumulators
    v_run_total_gross NUMERIC := 0;
    v_run_total_net   NUMERIC := 0;
    v_run_emp_count   INT     := 0;
BEGIN
    -- ── 1. Create / Update Payroll Run Header ──────────────────────────────────
    INSERT INTO payroll_runs (
        company_id, branch_id, period_start, period_end, status, processed_by
    ) VALUES (
        p_company_id, p_branch_id, p_period_start, p_period_end, 'processing', p_processed_by
    )
    ON CONFLICT (branch_id, period_start, period_end)
    DO UPDATE SET
        status        = 'processing',
        processed_by  = p_processed_by,
        updated_at    = now()
    RETURNING id INTO v_run_id;

    -- Clear existing payslips (allow re-generation)
    DELETE FROM payslips WHERE payroll_run_id = v_run_id;

    -- ── 2. Loop through Active Employees ──────────────────────────────────────
    FOR v_emp IN
        SELECT * FROM employees
        WHERE branch_id = p_branch_id
          AND is_active = true
          AND (termination_date IS NULL OR termination_date >= p_period_start)
    LOOP
        -- Reset
        v_basic               := 0;
        v_ot_hours            := 0;
        v_ot_amount           := 0;
        v_absent_days         := 0;
        v_late_minutes        := 0;
        v_late_deduction      := 0;
        v_short_leave_hours   := 0;
        v_short_leave_deduction := 0;
        v_no_pay_deduction    := 0;
        v_unpaid_leave_days   := 0;
        v_paid_leave_days     := 0;
        v_total_allowances    := 0;
        v_loan_deduction      := 0;
        v_epf_employee        := 0;
        v_epf_employer        := 0;
        v_etf_employer        := 0;
        v_gross               := 0;
        v_total_deductions    := 0;
        v_net                 := 0;

        -- Get Current Salary Structure
        SELECT * INTO v_sal
        FROM salary_structures
        WHERE employee_id = v_emp.id AND is_current = true
        LIMIT 1;

        IF v_sal.id IS NOT NULL THEN
            v_basic := COALESCE(v_sal.basic_salary, 0);

            -- Derive hourly & daily rates
            v_hourly_rate := CASE WHEN COALESCE(v_sal.hourly_rate, 0) > 0
                                  THEN v_sal.hourly_rate
                                  ELSE v_basic / 240.0   -- 26 working days × ~9.2 h ≈ 240 h/month
                             END;
            v_daily_rate  := v_basic / 26.0;             -- Sri Lanka standard: 26 working days

            -- ── A. Overtime ────────────────────────────────────────────────────
            SELECT COALESCE(SUM(overtime_hours), 0) INTO v_ot_hours
            FROM attendance_records
            WHERE employee_id    = v_emp.id
              AND attendance_date BETWEEN p_period_start AND p_period_end;

            v_ot_amount := v_ot_hours * v_hourly_rate
                           * COALESCE(v_sal.overtime_rate_multiplier, 1.5);

            -- ── B. Absent / No-Pay Days ────────────────────────────────────────
            --    Count absent days from attendance_records
            SELECT COUNT(*) INTO v_absent_days
            FROM attendance_records
            WHERE employee_id    = v_emp.id
              AND attendance_date BETWEEN p_period_start AND p_period_end
              AND status IN ('absent', 'unpaid_leave');

            --    Also count approved unpaid leave requests (status=approved, leave is_paid=false)
            SELECT COALESCE(SUM(lr.total_days), 0) INTO v_unpaid_leave_days
            FROM leave_requests lr
            JOIN leave_types    lt ON lt.id = lr.leave_type_id
            WHERE lr.employee_id = v_emp.id
              AND lr.status      = 'approved'
              AND lt.is_paid     = false
              AND lr.start_date  BETWEEN p_period_start AND p_period_end;

            --    Count approved paid leave days (for reporting only, no deduction)
            SELECT COALESCE(SUM(lr.total_days), 0) INTO v_paid_leave_days
            FROM leave_requests lr
            JOIN leave_types    lt ON lt.id = lr.leave_type_id
            WHERE lr.employee_id = v_emp.id
              AND lr.status      = 'approved'
              AND lt.is_paid     = true
              AND lr.start_date  BETWEEN p_period_start AND p_period_end;

            v_no_pay_deduction := (v_absent_days + v_unpaid_leave_days) * v_daily_rate;

            -- ── C. Late Deductions ─────────────────────────────────────────────
            --    Total late minutes for the period
            SELECT COALESCE(SUM(late_minutes), 0) INTO v_late_minutes
            FROM attendance_records
            WHERE employee_id    = v_emp.id
              AND attendance_date BETWEEN p_period_start AND p_period_end
              AND late_minutes   > 0;

            -- Deduct per minute = hourly_rate / 60
            v_late_deduction := (v_late_minutes / 60.0) * v_hourly_rate;

            -- ── D. Short Leave Deductions (half-day / early out) ───────────────
            --    half_day rows where employee worked < full shift
            SELECT COALESCE(SUM(
                CASE WHEN status = 'half_day' THEN 0.5 * 8 ELSE 0 END  -- assume 8h shift
            ), 0) INTO v_short_leave_hours
            FROM attendance_records
            WHERE employee_id    = v_emp.id
              AND attendance_date BETWEEN p_period_start AND p_period_end
              AND status         = 'half_day';

            v_short_leave_deduction := v_short_leave_hours * v_hourly_rate;

            -- ── E. Fixed Allowances ────────────────────────────────────────────
            v_total_allowances :=
                COALESCE(v_sal.housing_allowance,   0) +
                COALESCE(v_sal.transport_allowance, 0) +
                COALESCE(v_sal.meal_allowance,      0) +
                COALESCE(v_sal.other_allowances,    0);

            -- ── F. Loan Deductions ─────────────────────────────────────────────
            SELECT COALESCE(SUM(
                LEAST(monthly_installment, remaining_balance)
            ), 0) INTO v_loan_deduction
            FROM employee_loans
            WHERE employee_id             = v_emp.id
              AND status                  = 'active'
              AND (expected_completion_date IS NULL
                   OR expected_completion_date >= p_period_start);

            -- ── G. EPF / ETF ───────────────────────────────────────────────────
            v_epf_base     := v_basic;
            v_epf_employee := v_epf_base * (COALESCE(v_sal.epf_employee_pct, 8)  / 100.0);
            v_epf_employer := v_epf_base * (COALESCE(v_sal.epf_employer_pct, 12) / 100.0);
            v_etf_employer := v_epf_base * (COALESCE(v_sal.etf_employer_pct, 3)  / 100.0);

            -- ── H. Gross & Net ─────────────────────────────────────────────────
            -- Gross = Basic + Allowances + OT - NoPay - Late - ShortLeave
            v_gross :=
                v_basic
                + v_total_allowances
                + v_ot_amount
                - v_no_pay_deduction
                - v_late_deduction
                - v_short_leave_deduction;

            -- Total employee-side deductions (EPF + Loans + Other)
            v_total_deductions :=
                v_epf_employee
                + v_loan_deduction
                + COALESCE(v_sal.other_deductions, 0);

            v_net := v_gross - v_total_deductions;

            -- ── I. Insert Payslip ──────────────────────────────────────────────
            INSERT INTO payslips (
                company_id, branch_id, payroll_run_id, employee_id,
                basic_salary,
                housing_allowance, transport_allowance, meal_allowance,
                other_allowances,  total_allowances,
                overtime_hours,    overtime_amount,
                gross_salary,
                epf_employee,      epf_employer,        etf_employer,
                loan_deduction,    other_deductions,    total_deductions,
                net_salary,
                days_absent,       days_worked,
                late_minutes,      late_deduction,
                short_leave_hours, short_leave_deduction,
                unpaid_leave_days, paid_leave_days,
                payment_status
            ) VALUES (
                p_company_id, p_branch_id, v_run_id, v_emp.id,
                ROUND(v_basic, 2),
                COALESCE(v_sal.housing_allowance,   0),
                COALESCE(v_sal.transport_allowance, 0),
                COALESCE(v_sal.meal_allowance,      0),
                COALESCE(v_sal.other_allowances,    0),
                ROUND(v_total_allowances, 2),
                ROUND(v_ot_hours,   2), ROUND(v_ot_amount, 2),
                ROUND(v_gross, 2),
                ROUND(v_epf_employee, 2), ROUND(v_epf_employer, 2), ROUND(v_etf_employer, 2),
                ROUND(v_loan_deduction, 2),
                COALESCE(v_sal.other_deductions, 0),
                ROUND(v_total_deductions, 2),
                ROUND(v_net, 2),
                v_absent_days,     0,
                v_late_minutes,    ROUND(v_late_deduction,       2),
                ROUND(v_short_leave_hours, 2), ROUND(v_short_leave_deduction, 2),
                ROUND(v_unpaid_leave_days, 1), ROUND(v_paid_leave_days, 1),
                'pending'
            );

            v_run_total_gross := v_run_total_gross + v_gross;
            v_run_total_net   := v_run_total_net   + v_net;
            v_run_emp_count   := v_run_emp_count   + 1;
        END IF;
    END LOOP;

    -- ── 3. Finalise Run ────────────────────────────────────────────────────────
    UPDATE payroll_runs
    SET
        total_gross    = ROUND(v_run_total_gross, 2),
        total_net      = ROUND(v_run_total_net,   2),
        employee_count = v_run_emp_count,
        status         = 'processed',
        updated_at     = now()
    WHERE id = v_run_id;

    RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  AUTO-INITIALIZE LEAVE BALANCES ON EMPLOYEE INSERT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION fn_auto_init_leave_balances()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
    v_type RECORD;
BEGIN
    FOR v_type IN
        SELECT * FROM leave_types
        WHERE company_id = NEW.company_id AND is_active = true
    LOOP
        INSERT INTO leave_balances (
            company_id, employee_id, leave_type_id, year, total_entitlement, used_days
        ) VALUES (
            NEW.company_id, NEW.id, v_type.id, v_year, v_type.annual_quota, 0
        )
        ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_init_leave_balances ON employees;
CREATE TRIGGER trg_auto_init_leave_balances
    AFTER INSERT ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_auto_init_leave_balances();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  RPC: Get Employee Leave Summary (Annual/Casual/Sick)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_employee_leave_summary(
    p_employee_id UUID,
    p_year        INT DEFAULT NULL
)
RETURNS TABLE (
    leave_type_id      UUID,
    leave_type_name    TEXT,
    is_paid            BOOLEAN,
    total_entitlement  NUMERIC,
    used_days          NUMERIC,
    remaining_days     NUMERIC,
    pending_days       NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_year INT := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE));
BEGIN
    RETURN QUERY
    SELECT
        lt.id                                          AS leave_type_id,
        lt.name                                        AS leave_type_name,
        lt.is_paid,
        COALESCE(lb.total_entitlement, lt.annual_quota) AS total_entitlement,
        COALESCE(lb.used_days, 0)                      AS used_days,
        COALESCE(lb.remaining_days, lt.annual_quota)  AS remaining_days,
        COALESCE((
            SELECT SUM(lreq.total_days)
            FROM leave_requests lreq
            WHERE lreq.employee_id   = p_employee_id
              AND lreq.leave_type_id = lt.id
              AND lreq.status        = 'pending'
              AND EXTRACT(YEAR FROM lreq.start_date) = v_year
        ), 0)                                          AS pending_days
    FROM leave_types lt
    LEFT JOIN leave_balances lb
           ON lb.leave_type_id = lt.id
          AND lb.employee_id   = p_employee_id
          AND lb.year          = v_year
    WHERE lt.company_id = (SELECT company_id FROM employees WHERE id = p_employee_id)
      AND lt.is_active  = true
    ORDER BY lt.name;
END;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  RPC: Get Attendance Payroll Summary (late / short-leave aggregates)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION get_attendance_payroll_summary(
    p_branch_id    UUID,
    p_period_start DATE,
    p_period_end   DATE
)
RETURNS TABLE (
    employee_id        UUID,
    full_name          TEXT,
    days_present       BIGINT,
    days_absent        BIGINT,
    days_on_leave      BIGINT,
    days_half          BIGINT,
    total_late_minutes BIGINT,
    total_ot_hours     NUMERIC
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
    SELECT
        ar.employee_id,
        e.full_name,
        COUNT(*) FILTER (WHERE ar.status = 'present')                   AS days_present,
        COUNT(*) FILTER (WHERE ar.status IN ('absent','unpaid_leave'))   AS days_absent,
        COUNT(*) FILTER (WHERE ar.status = 'on_leave')                  AS days_on_leave,
        COUNT(*) FILTER (WHERE ar.status = 'half_day')                  AS days_half,
        COALESCE(SUM(ar.late_minutes), 0)                               AS total_late_minutes,
        COALESCE(SUM(ar.overtime_hours), 0)                             AS total_ot_hours
    FROM attendance_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.branch_id      = p_branch_id
      AND ar.attendance_date BETWEEN p_period_start AND p_period_end
    GROUP BY ar.employee_id, e.full_name
    ORDER BY e.full_name;
$$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §8  STORAGE BUCKET SETUP NOTES (run via Supabase dashboard or CLI)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Bucket name  : employee-documents
-- Public       : false
-- Allowed MIME : image/jpeg, image/png, image/webp, application/pdf
-- Max size     : 10 MB
--
-- Storage policies (SQL):
--   INSERT: auth_has_role(uid, '{admin,hr}', NULL, NULL)
--   SELECT: auth_has_role(uid, '{admin,hr}', NULL, NULL)
--           OR (document belongs to employee where employee.profile_id = uid)
--   DELETE: auth_has_role(uid, '{admin,hr}', NULL, NULL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Bucket helper — creates bucket if Supabase extensions are available
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'employee-documents',
    'employee-documents',
    false,
    10485760,   -- 10 MB
    ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for employee-documents bucket
DROP POLICY IF EXISTS "hr_upload_docs" ON storage.objects;
CREATE POLICY "hr_upload_docs" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'employee-documents'
        AND (auth_has_role('admin') OR auth_has_role('hr'))
    );

DROP POLICY IF EXISTS "hr_view_docs" ON storage.objects;
CREATE POLICY "hr_view_docs" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'employee-documents'
        AND (
            (auth_has_role('admin') OR auth_has_role('hr'))
            OR EXISTS (
                SELECT 1 FROM employees e
                WHERE e.profile_id = auth.uid()
                  AND e.is_active  = true
                  AND storage.objects.name LIKE (e.id::TEXT || '/%')
            )
        )
    );

DROP POLICY IF EXISTS "hr_delete_docs" ON storage.objects;
CREATE POLICY "hr_delete_docs" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'employee-documents'
        AND (auth_has_role('admin') OR auth_has_role('hr'))
    );

-- ── Done ──────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  RAISE NOTICE '[HR-FEATURES] ✅ Migration 20260325_hr_documents_leave_attendance_payroll applied';
END $$;
