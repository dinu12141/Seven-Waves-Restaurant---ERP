-- =====================================================
-- HR & PAYROLL ENHANCEMENTS
-- Seven Waves Restaurant ERP
-- Run AFTER: hr_payroll.sql, payroll_engine.sql,
--            biometric_integration.sql, leave_management.sql,
--            erp_security_lockdown.sql
-- =====================================================

-- =============================================================
-- PART 1: EMPLOYEE SELF-SERVICE RLS POLICIES
-- =============================================================
-- Allows employees to:
--   - View their own payslips
--   - View their own attendance records
--   - Submit leave requests
--   - View their own loans
--   - View their own salary structure (read-only)

-- ── 1A. payslips: employee can view own payslips ──────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payslips') THEN
    ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS ps_self ON payslips;
    CREATE POLICY ps_self ON payslips FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = payslips.employee_id
            AND e.profile_id = auth.uid()
            AND e.is_active = true
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Payslip self-service SELECT policy created';
  END IF;
END $$;


-- ── 1B. attendance_records: employee can view own attendance ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='attendance_records') THEN
    ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS ar_self ON attendance_records;
    CREATE POLICY ar_self ON attendance_records FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = attendance_records.employee_id
            AND e.profile_id = auth.uid()
            AND e.is_active = true
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Attendance self-service SELECT policy created';
  END IF;
END $$;


-- ── 1C. leave_requests: employee can INSERT own leave requests ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_requests') THEN
    ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

    -- Employee can create leave requests for themselves
    DROP POLICY IF EXISTS lr_self_insert ON leave_requests;
    CREATE POLICY lr_self_insert ON leave_requests FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = leave_requests.employee_id
            AND e.profile_id = auth.uid()
            AND e.is_active = true
        )
      );

    -- Employee can update own PENDING requests (cancel only)
    DROP POLICY IF EXISTS lr_self_update ON leave_requests;
    CREATE POLICY lr_self_update ON leave_requests FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = leave_requests.employee_id
            AND e.profile_id = auth.uid()
        )
        AND status = 'pending'
      )
      WITH CHECK (
        status IN ('pending', 'cancelled')
      );

    RAISE NOTICE '[HR-ENH] ✅ Leave self-service INSERT/UPDATE policies created';
  END IF;
END $$;


-- ── 1D. leave_balances: employee can view own balances ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leave_balances') THEN
    ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

    -- Admin full access
    DROP POLICY IF EXISTS lb_admin ON leave_balances;
    CREATE POLICY lb_admin ON leave_balances FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    -- HR full access (branch-scoped)
    DROP POLICY IF EXISTS lb_hr ON leave_balances;
    CREATE POLICY lb_hr ON leave_balances FOR ALL
      USING (
        public.auth_has_role('hr')
        AND company_id IN (
          SELECT company_id FROM employees WHERE profile_id = auth.uid()
        )
      )
      WITH CHECK (
        public.auth_has_role('hr')
      );

    -- Employee self-service (read only)
    DROP POLICY IF EXISTS lb_self ON leave_balances;
    CREATE POLICY lb_self ON leave_balances FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = leave_balances.employee_id
            AND e.profile_id = auth.uid()
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Leave balances self-service policies created';
  END IF;
END $$;


-- ── 1E. employee_loans: employee can view own loans ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_loans') THEN
    ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS el_admin ON employee_loans;
    CREATE POLICY el_admin ON employee_loans FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS el_hr ON employee_loans;
    CREATE POLICY el_hr ON employee_loans FOR ALL
      USING (
        public.auth_has_role('hr')
        AND branch_id = ANY(public.auth_branch_ids())
      )
      WITH CHECK (
        public.auth_has_role('hr')
        AND branch_id = ANY(public.auth_branch_ids())
      );

    DROP POLICY IF EXISTS el_self ON employee_loans;
    CREATE POLICY el_self ON employee_loans FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = employee_loans.employee_id
            AND e.profile_id = auth.uid()
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Employee loans self-service policies created';
  END IF;
END $$;


-- ── 1F. salary_structures: employee can view own current salary ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='salary_structures') THEN
    ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS ss_admin ON salary_structures;
    CREATE POLICY ss_admin ON salary_structures FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS ss_hr ON salary_structures;
    CREATE POLICY ss_hr ON salary_structures FOR ALL
      USING (
        public.auth_has_role('hr')
        AND company_id IN (
          SELECT company_id FROM employees WHERE profile_id = auth.uid() LIMIT 1
        )
      )
      WITH CHECK (public.auth_has_role('hr'));

    -- Employee can only see their own CURRENT salary (not history)
    DROP POLICY IF EXISTS ss_self ON salary_structures;
    CREATE POLICY ss_self ON salary_structures FOR SELECT
      USING (
        is_current = true
        AND EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = salary_structures.employee_id
            AND e.profile_id = auth.uid()
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Salary structure self-service policy created';
  END IF;
END $$;


-- ── 1G. employee_overtime: employee can view own OT records ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employee_overtime') THEN
    ALTER TABLE employee_overtime ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS eo_admin ON employee_overtime;
    CREATE POLICY eo_admin ON employee_overtime FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS eo_hr ON employee_overtime;
    CREATE POLICY eo_hr ON employee_overtime FOR ALL
      USING (
        public.auth_has_role('hr')
        AND branch_id = ANY(public.auth_branch_ids())
      )
      WITH CHECK (public.auth_has_role('hr'));

    -- Manager can approve/reject OT for their branch
    DROP POLICY IF EXISTS eo_manager ON employee_overtime;
    CREATE POLICY eo_manager ON employee_overtime FOR ALL
      USING (
        public.auth_has_role('manager')
        AND branch_id = ANY(public.auth_branch_ids())
      )
      WITH CHECK (
        public.auth_has_role('manager')
        AND branch_id = ANY(public.auth_branch_ids())
      );

    -- Employee can view own OT only
    DROP POLICY IF EXISTS eo_self ON employee_overtime;
    CREATE POLICY eo_self ON employee_overtime FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = employee_overtime.employee_id
            AND e.profile_id = auth.uid()
        )
      );

    RAISE NOTICE '[HR-ENH] ✅ Employee overtime self-service policy created';
  END IF;
END $$;


-- ── 1H. shifts & shift_assignments: employee can view schedules ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shifts') THEN
    ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS sh_admin ON shifts;
    CREATE POLICY sh_admin ON shifts FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS sh_hr ON shifts;
    CREATE POLICY sh_hr ON shifts FOR ALL
      USING (public.auth_has_role('hr') AND branch_id = ANY(public.auth_branch_ids()))
      WITH CHECK (public.auth_has_role('hr'));

    DROP POLICY IF EXISTS sh_manager ON shifts;
    CREATE POLICY sh_manager ON shifts FOR SELECT
      USING (public.auth_has_role('manager') AND branch_id = ANY(public.auth_branch_ids()));

    -- All authenticated users can read shifts for their branch
    DROP POLICY IF EXISTS sh_read ON shifts;
    CREATE POLICY sh_read ON shifts FOR SELECT
      USING (branch_id = ANY(public.auth_branch_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='shift_assignments') THEN
    ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS sa_admin ON shift_assignments;
    CREATE POLICY sa_admin ON shift_assignments FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS sa_hr ON shift_assignments;
    CREATE POLICY sa_hr ON shift_assignments FOR ALL
      USING (public.auth_has_role('hr') AND branch_id = ANY(public.auth_branch_ids()))
      WITH CHECK (public.auth_has_role('hr'));

    DROP POLICY IF EXISTS sa_manager ON shift_assignments;
    CREATE POLICY sa_manager ON shift_assignments FOR ALL
      USING (public.auth_has_role('manager') AND branch_id = ANY(public.auth_branch_ids()))
      WITH CHECK (public.auth_has_role('manager'));

    -- Employee can view own shift assignments
    DROP POLICY IF EXISTS sa_self ON shift_assignments;
    CREATE POLICY sa_self ON shift_assignments FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM employees e
          WHERE e.id = shift_assignments.employee_id
            AND e.profile_id = auth.uid()
        )
      );
  END IF;
  RAISE NOTICE '[HR-ENH] ✅ Shift & assignment self-service policies created';
END $$;


-- =============================================================
-- PART 2: ATTENDANCE CRON JOBS (Absent Marking + Missing Punch)
-- =============================================================

-- ── 2A. Mark absent employees (no punch for the day) ──
CREATE OR REPLACE FUNCTION mark_absent_employees()
RETURNS VOID AS $$
DECLARE
    v_emp RECORD;
    v_today DATE := CURRENT_DATE;
    v_has_attendance BOOLEAN;
    v_has_leave BOOLEAN;
BEGIN
    -- Loop through active employees who have a shift today
    FOR v_emp IN
        SELECT
            e.id AS employee_id,
            e.company_id,
            e.branch_id,
            sa.shift_id
        FROM employees e
        JOIN shift_assignments sa ON sa.employee_id = e.id
            AND sa.assignment_date = v_today
            AND sa.status = 'scheduled'
        WHERE e.is_active = true
          AND (e.termination_date IS NULL OR e.termination_date >= v_today)
    LOOP
        -- Check if attendance record already exists
        SELECT EXISTS (
            SELECT 1 FROM attendance_records
            WHERE employee_id = v_emp.employee_id
              AND attendance_date = v_today
        ) INTO v_has_attendance;

        -- Check if approved leave exists
        SELECT EXISTS (
            SELECT 1 FROM leave_requests
            WHERE employee_id = v_emp.employee_id
              AND status = 'approved'
              AND v_today BETWEEN start_date AND end_date
        ) INTO v_has_leave;

        -- If no attendance and no leave → mark absent
        IF NOT v_has_attendance AND NOT v_has_leave THEN
            INSERT INTO attendance_records (
                company_id, branch_id, employee_id,
                shift_id, attendance_date, status
            ) VALUES (
                v_emp.company_id, v_emp.branch_id, v_emp.employee_id,
                v_emp.shift_id, v_today, 'absent'
            )
            ON CONFLICT (employee_id, attendance_date) DO NOTHING;
        END IF;
    END LOOP;

    RAISE NOTICE '[CRON] ✅ Absent employees marked for %', v_today;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2B. Flag missing punch-out (clock_in but no clock_out) ──
CREATE OR REPLACE FUNCTION flag_missing_punch_out()
RETURNS VOID AS $$
DECLARE
    v_rec RECORD;
    v_shift RECORD;
    v_expected_end TIMESTAMPTZ;
BEGIN
    -- Find records from today (or yesterday for overnight) with clock_in but no clock_out
    FOR v_rec IN
        SELECT ar.*
        FROM attendance_records ar
        WHERE ar.attendance_date = CURRENT_DATE
          AND ar.clock_in IS NOT NULL
          AND ar.clock_out IS NULL
          AND ar.status NOT IN ('on_leave', 'unpaid_leave', 'holiday', 'rest_day', 'absent')
    LOOP
        -- Try to find the shift to estimate expected end time
        IF v_rec.shift_id IS NOT NULL THEN
            SELECT * INTO v_shift FROM shifts WHERE id = v_rec.shift_id;

            IF v_shift.id IS NOT NULL THEN
                v_expected_end := (v_rec.attendance_date || ' ' || v_shift.end_time)::TIMESTAMPTZ;
                IF v_shift.is_overnight THEN
                    v_expected_end := v_expected_end + INTERVAL '1 day';
                END IF;

                -- If current time is past shift end + 2 hours grace, flag it
                IF now() > v_expected_end + INTERVAL '2 hours' THEN
                    UPDATE attendance_records
                    SET remarks = COALESCE(remarks, '') || ' [AUTO] Missing punch-out detected. Expected end: ' || v_expected_end::TEXT,
                        updated_at = now()
                    WHERE id = v_rec.id
                      AND (remarks IS NULL OR remarks NOT LIKE '%Missing punch-out%');
                END IF;
            END IF;
        ELSE
            -- No shift assigned: if clock_in was more than 12 hours ago, flag
            IF now() > v_rec.clock_in + INTERVAL '12 hours' THEN
                UPDATE attendance_records
                SET remarks = COALESCE(remarks, '') || ' [AUTO] Missing punch-out detected (no shift assigned).',
                    updated_at = now()
                WHERE id = v_rec.id
                  AND (remarks IS NULL OR remarks NOT LIKE '%Missing punch-out%');
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE '[CRON] ✅ Missing punch-out check completed for %', CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2C. Initialize yearly leave balances ──
CREATE OR REPLACE FUNCTION auto_initialize_yearly_leave()
RETURNS VOID AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
    -- Only initializes if not already initialized
    PERFORM initialize_leave_balances(v_year);
    RAISE NOTICE '[CRON] ✅ Leave balances initialized for year %', v_year;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2D. Schedule the cron jobs ──
-- NOTE: pg_cron must be enabled in the Supabase project
-- These will only work if pg_cron extension is available

DO $$ BEGIN
    -- Check if pg_cron is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

        -- Job 1: Mark absent employees — every day at 11 PM
        PERFORM cron.schedule(
            'mark_absent_employees_daily',
            '0 23 * * *',
            'SELECT mark_absent_employees()'
        );
        RAISE NOTICE '[CRON] ✅ Scheduled: mark_absent_employees (daily 11 PM)';

        -- Job 2: Flag missing punch-out — every day at 11:30 PM
        PERFORM cron.schedule(
            'flag_missing_punch_out_daily',
            '30 23 * * *',
            'SELECT flag_missing_punch_out()'
        );
        RAISE NOTICE '[CRON] ✅ Scheduled: flag_missing_punch_out (daily 11:30 PM)';

        -- Job 3: Initialize yearly leave — January 1st midnight
        PERFORM cron.schedule(
            'auto_initialize_yearly_leave',
            '0 0 1 1 *',
            'SELECT auto_initialize_yearly_leave()'
        );
        RAISE NOTICE '[CRON] ✅ Scheduled: auto_initialize_yearly_leave (Jan 1st)';

    ELSE
        RAISE NOTICE '[CRON] ⚠️ pg_cron extension not enabled. Cron jobs NOT scheduled.';
        RAISE NOTICE '[CRON] Enable pg_cron in Supabase Dashboard > Database > Extensions';
    END IF;
END $$;


-- =============================================================
-- PART 3: ATTENDANCE GRACE PERIOD CONFIGURATION
-- =============================================================

-- Add a configurable grace period column to shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS grace_minutes INT DEFAULT 10;

-- Update the attendance processing to use grace period
CREATE OR REPLACE FUNCTION process_attendance_logs_v2()
RETURNS VOID AS $$
DECLARE
    log_record RECORD;
    emp_record RECORD;
    shift_record RECORD;
    att_record RECORD;

    v_attendance_date DATE;
    v_shift_start TIMESTAMPTZ;
    v_shift_end TIMESTAMPTZ;
    v_shift_hours NUMERIC(5,2);
    v_grace_minutes INT := 10;
    v_late_minutes INT := 0;
    v_early_minutes INT := 0;
    v_overtime_hours NUMERIC(5,2) := 0;
    v_total_hours NUMERIC(5,2) := 0;
    v_break_hours NUMERIC(5,2) := 0;
    v_status TEXT := 'present';
BEGIN
    FOR log_record IN
        SELECT * FROM attendance_logs WHERE is_processed = false ORDER BY punch_time ASC
    LOOP
        -- 1. Find Employee by code
        SELECT * INTO emp_record FROM employees
        WHERE employee_code = log_record.employee_code
          AND is_active = true
        LIMIT 1;

        IF emp_record.id IS NULL THEN
            -- Try matching by employee_id if code didn't work
            IF log_record.employee_id IS NOT NULL THEN
                SELECT * INTO emp_record FROM employees WHERE id = log_record.employee_id;
            END IF;
        END IF;

        IF emp_record.id IS NOT NULL THEN
            -- Link employee_id if missing
            IF log_record.employee_id IS NULL OR log_record.employee_id != emp_record.id THEN
                UPDATE attendance_logs SET employee_id = emp_record.id WHERE id = log_record.id;
            END IF;

            v_attendance_date := log_record.punch_time::DATE;

            -- 2. Create attendance record if not exists
            INSERT INTO attendance_records (
                company_id, branch_id, employee_id, attendance_date, status
            ) VALUES (
                emp_record.company_id, emp_record.branch_id, emp_record.id,
                v_attendance_date, 'present'
            )
            ON CONFLICT (employee_id, attendance_date) DO NOTHING;

            -- 3. Get the attendance record
            SELECT * INTO att_record FROM attendance_records
            WHERE employee_id = emp_record.id AND attendance_date = v_attendance_date;

            -- 4. Get Shift Assignment
            SELECT s.* INTO shift_record
            FROM shift_assignments sa
            JOIN shifts s ON s.id = sa.shift_id
            WHERE sa.employee_id = emp_record.id
              AND sa.assignment_date = v_attendance_date;

            -- Get grace from shift or default
            v_grace_minutes := COALESCE(shift_record.grace_minutes, 10);

            -- 5. Update punch times (first IN, last OUT)
            IF log_record.punch_type = 'in' THEN
                IF att_record.clock_in IS NULL OR log_record.punch_time < att_record.clock_in THEN
                    UPDATE attendance_records SET clock_in = log_record.punch_time WHERE id = att_record.id;
                END IF;
            ELSIF log_record.punch_type = 'out' THEN
                IF att_record.clock_out IS NULL OR log_record.punch_time > att_record.clock_out THEN
                    UPDATE attendance_records SET clock_out = log_record.punch_time WHERE id = att_record.id;
                END IF;
            END IF;

            -- 6. Recalculate stats if both IN and OUT exist
            SELECT * INTO att_record FROM attendance_records WHERE id = att_record.id;

            IF att_record.clock_in IS NOT NULL AND att_record.clock_out IS NOT NULL THEN
                v_total_hours := EXTRACT(EPOCH FROM (att_record.clock_out - att_record.clock_in)) / 3600;

                IF shift_record.id IS NOT NULL THEN
                    v_shift_start := (v_attendance_date || ' ' || shift_record.start_time)::TIMESTAMPTZ;
                    v_shift_end   := (v_attendance_date || ' ' || shift_record.end_time)::TIMESTAMPTZ;

                    -- Handle overnight shifts
                    IF shift_record.is_overnight OR v_shift_end < v_shift_start THEN
                        v_shift_end := v_shift_end + INTERVAL '1 day';
                    END IF;

                    v_shift_hours := EXTRACT(EPOCH FROM (v_shift_end - v_shift_start)) / 3600;
                    v_break_hours := COALESCE(shift_record.break_duration_minutes, 0) / 60.0;

                    -- Late calculation (WITH GRACE PERIOD)
                    IF att_record.clock_in > (v_shift_start + (v_grace_minutes || ' minutes')::INTERVAL) THEN
                        v_late_minutes := EXTRACT(EPOCH FROM (att_record.clock_in - v_shift_start)) / 60;
                    ELSE
                        v_late_minutes := 0;
                    END IF;

                    -- Early departure
                    IF att_record.clock_out < v_shift_end THEN
                        v_early_minutes := EXTRACT(EPOCH FROM (v_shift_end - att_record.clock_out)) / 60;
                    ELSE
                        v_early_minutes := 0;
                    END IF;

                    -- Overtime (worked more than shift duration)
                    IF v_total_hours > (v_shift_hours - v_break_hours) THEN
                        v_overtime_hours := v_total_hours - (v_shift_hours - v_break_hours);
                    ELSE
                        v_overtime_hours := 0;
                    END IF;

                    -- Determine status
                    IF v_late_minutes > 0 AND v_total_hours < (v_shift_hours / 2) THEN
                        v_status := 'half_day';
                    ELSIF v_late_minutes > 0 THEN
                        v_status := 'late';
                    ELSE
                        v_status := 'present';
                    END IF;

                    -- Update shift assignment to completed
                    UPDATE shift_assignments
                    SET status = 'completed'
                    WHERE employee_id = emp_record.id
                      AND assignment_date = v_attendance_date
                      AND status = 'scheduled';

                    UPDATE attendance_records SET
                        shift_id = shift_record.id,
                        scheduled_start = v_shift_start,
                        scheduled_end = v_shift_end,
                        total_hours = ROUND(v_total_hours, 2),
                        break_hours = ROUND(v_break_hours, 2),
                        late_minutes = ROUND(v_late_minutes),
                        early_departure_minutes = ROUND(v_early_minutes),
                        overtime_hours = ROUND(v_overtime_hours, 2),
                        status = v_status
                    WHERE id = att_record.id;
                ELSE
                    -- No shift, just record total hours
                    UPDATE attendance_records SET
                        total_hours = ROUND(v_total_hours, 2)
                    WHERE id = att_record.id;
                END IF;
            END IF;

            -- Mark log as processed
            UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
        ELSE
            -- Employee not found — log it but mark processed to avoid infinite loop
            RAISE NOTICE '[ATT] ⚠️ Employee not found for code: %. Log ID: %', log_record.employee_code, log_record.id;
            -- Don't mark as processed so it can be retried after employee is added
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update the pg_cron job to use v2
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Remove old job
        PERFORM cron.unschedule('process_attendance_logs_job');

        -- Add new v2 job
        PERFORM cron.schedule(
            'process_attendance_logs_v2_job',
            '*/5 * * * *',
            'SELECT process_attendance_logs_v2()'
        );
        RAISE NOTICE '[CRON] ✅ Updated attendance processing to v2 (with grace period)';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[CRON] ⚠️ Could not update cron job: %', SQLERRM;
END $$;


-- =============================================================
-- PART 4: SALARY CHANGE AUDIT VIEW
-- =============================================================

CREATE OR REPLACE VIEW salary_change_history AS
SELECT
    al.id AS audit_id,
    al.created_at AS changed_at,
    al.user_id AS changed_by,
    p.full_name AS changed_by_name,
    al.action,
    al.old_data->>'employee_id' AS employee_id,
    e.full_name AS employee_name,
    e.employee_code,
    (al.old_data->>'basic_salary')::NUMERIC AS old_basic,
    (al.new_data->>'basic_salary')::NUMERIC AS new_basic,
    (al.old_data->>'housing_allowance')::NUMERIC AS old_housing,
    (al.new_data->>'housing_allowance')::NUMERIC AS new_housing,
    (al.old_data->>'transport_allowance')::NUMERIC AS old_transport,
    (al.new_data->>'transport_allowance')::NUMERIC AS new_transport,
    (al.old_data->>'overtime_rate_multiplier')::NUMERIC AS old_ot_mult,
    (al.new_data->>'overtime_rate_multiplier')::NUMERIC AS new_ot_mult,
    al.severity
FROM audit_logs al
LEFT JOIN profiles p ON p.id = al.user_id
LEFT JOIN employees e ON e.id = (al.old_data->>'employee_id')::UUID
                      OR e.id = (al.new_data->>'employee_id')::UUID
WHERE al.table_name = 'salary_structures'
ORDER BY al.created_at DESC;


-- =============================================================
-- PART 5: PAYROLL SECURITY — PREVENT DOUBLE APPROVAL
-- =============================================================

CREATE OR REPLACE FUNCTION prevent_payroll_re_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Cannot re-approve an already approved/paid payroll
    IF OLD.status IN ('approved', 'paid') AND NEW.status = 'approved' THEN
        RAISE EXCEPTION 'PAYROLL_LOCKED: Payroll run % is already approved. Cannot re-approve.', OLD.id;
    END IF;

    -- Cannot modify a paid payroll
    IF OLD.status = 'paid' AND NEW.status NOT IN ('paid') THEN
        RAISE EXCEPTION 'PAYROLL_LOCKED: Payroll run % is already paid. Cannot modify.', OLD.id;
    END IF;

    -- Cannot cancel an approved payroll (must reverse first)
    IF OLD.status = 'approved' AND NEW.status = 'cancelled' THEN
        RAISE EXCEPTION 'PAYROLL_LOCKED: Cannot cancel approved payroll %. Reverse the approval first.', OLD.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_payroll_re_approval ON payroll_runs;
CREATE TRIGGER trg_prevent_payroll_re_approval
BEFORE UPDATE ON payroll_runs
FOR EACH ROW EXECUTE FUNCTION prevent_payroll_re_approval();


-- =============================================================
-- PART 6: DEPARTMENTS & DESIGNATIONS RLS
-- =============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='departments') THEN
    ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS dept_admin ON departments;
    CREATE POLICY dept_admin ON departments FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS dept_hr ON departments;
    CREATE POLICY dept_hr ON departments FOR ALL
      USING (public.auth_has_role('hr') AND branch_id = ANY(public.auth_branch_ids()))
      WITH CHECK (public.auth_has_role('hr'));

    DROP POLICY IF EXISTS dept_read ON departments;
    CREATE POLICY dept_read ON departments FOR SELECT
      USING (branch_id = ANY(public.auth_branch_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='designations') THEN
    ALTER TABLE designations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS desig_admin ON designations;
    CREATE POLICY desig_admin ON designations FOR ALL
      USING (public.auth_has_role('admin'))
      WITH CHECK (public.auth_has_role('admin'));

    DROP POLICY IF EXISTS desig_hr ON designations;
    CREATE POLICY desig_hr ON designations FOR ALL
      USING (public.auth_has_role('hr'))
      WITH CHECK (public.auth_has_role('hr'));

    DROP POLICY IF EXISTS desig_read ON designations;
    CREATE POLICY desig_read ON designations FOR SELECT
      USING (true);  -- designations are company-wide, readable by all
  END IF;

  RAISE NOTICE '[HR-ENH] ✅ Department & Designation RLS policies created';
END $$;


-- =============================================================
-- DONE ✅
-- =============================================================

-- Summary of what was applied:
-- ✅ PART 1: Employee self-service RLS (payslips, attendance, leave, loans, salary, OT, shifts)
-- ✅ PART 2: Cron jobs (absent marking, missing punch-out, yearly leave init)
-- ✅ PART 3: Attendance v2 with grace period & break hours & half-day detection
-- ✅ PART 4: Salary change audit view
-- ✅ PART 5: Payroll double-approval protection trigger
-- ✅ PART 6: Departments & Designations RLS
