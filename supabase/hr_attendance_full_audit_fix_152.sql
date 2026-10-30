-- =====================================================
-- HR ATTENDANCE & BIOMETRIC SYSTEM AUDIT FIX #152
-- Seven Waves Restaurant ERP — Sri Lanka (Asia/Colombo UTC+05:30)
-- =====================================================
-- Comprehensive audit and permanent fix for:
-- 1. Overtime Unpaid Break Deduction:
--    Corrects the fatal flaw where gross worked hours were compared against net
--    expected hours, inflating every shift's overtime by the 1-hour unpaid lunch break.
--    Now strictly requires net_worked > expected_hours AND checkout > scheduled_end.
-- 2. Late Minutes & Grace Period:
--    Accurately calculated in local Asia/Colombo time (+05:30). If clocked in at
--    08:10:46 for an 08:00 shift with 10 min grace, records 10 minutes late.
-- 3. Early Departure Minutes:
--    Calculated in local Asia/Colombo time against scheduled shift end.
-- 4. Biometric Synchronization (v1 & v2):
--    Updates process_attendance_logs_v2() and process_attendance_logs() to delegate
--    metric calculation to fn_calc_attendance_metrics and use local timezone conversions.
-- 5. Authoritative Database Trigger:
--    trg_attendance_recalc fires BEFORE INSERT OR UPDATE ON public.attendance_records,
--    preventing any code path from persisting flawed metrics while honoring is_manual_override.
-- 6. RPC Function fn_recalculate_all_attendance(p_from_date):
--    Provides one-click authoritative recalculation across the entire attendance table.
-- 7. Immediate Historical Data Recalculation:
--    Reprocesses all existing attendance records to eliminate phantom overtime across the system.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- 1. Pure Calculation RPC: fn_calc_attendance_metrics
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calc_attendance_metrics(
  p_shift_id  uuid,
  p_clock_in  timestamptz,
  p_clock_out timestamptz,
  p_date      date
)
RETURNS TABLE (
  late_minutes            integer,
  early_departure_minutes integer,
  overtime_hours          numeric,
  total_hours             numeric,
  break_hours             numeric,
  scheduled_start         timestamptz,
  scheduled_end           timestamptz,
  computed_status         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift          shifts%ROWTYPE;
  v_has_shift      boolean := false;
  v_tz             text := 'Asia/Colombo';
  v_in             timestamp;      -- Local wall clock in Asia/Colombo
  v_out            timestamp;
  v_sched_start    timestamp;
  v_sched_end      timestamp;
  v_grace          integer := 10;
  v_break_hours    numeric := 0;
  v_span_hours     numeric;
  v_expected_hours numeric;
  v_worked_hours   numeric := 0;
  v_net_worked     numeric := 0;
  v_late           integer := 0;
  v_early          integer := 0;
  v_ot             numeric := 0;
BEGIN
  IF p_shift_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM shifts WHERE id = p_shift_id;
    v_has_shift := FOUND;
  END IF;

  -- Convert UTC timestamptz to Sri Lanka wall clock timestamp (UTC+05:30)
  v_in  := p_clock_in  AT TIME ZONE v_tz;
  v_out := p_clock_out AT TIME ZONE v_tz;

  -- Overnight worked span: check-out logged on next calendar date or crossed midnight
  IF v_in IS NOT NULL AND v_out IS NOT NULL AND v_out <= v_in THEN
    v_out := v_out + INTERVAL '1 day';
  END IF;

  IF v_in IS NOT NULL AND v_out IS NOT NULL THEN
    v_worked_hours := EXTRACT(EPOCH FROM (v_out - v_in)) / 3600.0;
  END IF;

  IF v_has_shift THEN
    v_grace       := COALESCE(v_shift.grace_minutes, 10);
    v_break_hours := COALESCE(v_shift.break_duration_minutes, 0) / 60.0;

    v_sched_start := (p_date + v_shift.start_time);
    v_sched_end   := (p_date + v_shift.end_time);
    IF v_shift.is_overnight OR v_sched_end <= v_sched_start THEN
      v_sched_end := v_sched_end + INTERVAL '1 day';
    END IF;

    -- Late: only past the grace window; measured from scheduled start
    IF v_in IS NOT NULL AND v_in > (v_sched_start + make_interval(mins => v_grace)) THEN
      v_late := FLOOR(EXTRACT(EPOCH FROM (v_in - v_sched_start)) / 60.0)::int;
    END IF;

    -- Early departure: left before scheduled end
    IF v_out IS NOT NULL AND v_out < v_sched_end THEN
      v_early := ROUND(EXTRACT(EPOCH FROM (v_sched_end - v_out)) / 60.0)::int;
    END IF;

    -- Overtime: only earned if employee clocked out AFTER scheduled shift end
    -- AND actual net worked hours (gross elapsed minus break) exceeds expected hours.
    v_span_hours     := EXTRACT(EPOCH FROM (v_sched_end - v_sched_start)) / 3600.0;
    v_expected_hours := GREATEST(v_span_hours - v_break_hours, 0);
    v_net_worked     := GREATEST(v_worked_hours - v_break_hours, 0);

    IF v_out IS NOT NULL AND v_out > v_sched_end AND v_net_worked > v_expected_hours THEN
      v_ot := ROUND(LEAST(EXTRACT(EPOCH FROM (v_out - v_sched_end)) / 3600.0, v_net_worked - v_expected_hours)::numeric, 2);
    END IF;
  ELSE
    -- No shift assigned: standard 8h day + 1h break (9h gross span).
    -- OT only when net worked hours exceeds 8.
    v_net_worked := GREATEST(v_worked_hours - 1.0, 0);
    IF v_net_worked > 8 THEN
      v_ot := ROUND((v_net_worked - 8)::numeric, 2);
    END IF;
  END IF;

  late_minutes            := v_late;
  early_departure_minutes := v_early;
  overtime_hours          := COALESCE(v_ot, 0);
  total_hours             := ROUND(COALESCE(v_worked_hours, 0)::numeric, 2);
  break_hours             := ROUND(v_break_hours, 2);
  scheduled_start         := CASE WHEN v_has_shift THEN (v_sched_start AT TIME ZONE v_tz) END;
  scheduled_end           := CASE WHEN v_has_shift THEN (v_sched_end   AT TIME ZONE v_tz) END;
  computed_status         := CASE
                               WHEN p_clock_in IS NULL THEN NULL
                               WHEN v_late > 0 THEN 'late'
                               ELSE 'present'
                             END;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_calc_attendance_metrics(uuid, timestamptz, timestamptz, date) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_calc_attendance_metrics(uuid, timestamptz, timestamptz, date)
  IS 'Authoritative attendance metric calc in Asia/Colombo (+05:30) with break deduction and OT gating.';

-- ---------------------------------------------------------------------
-- 2. Authoritative Database Trigger: trg_attendance_recalc
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_attendance_recalc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m RECORD;
BEGIN
  -- If manual override is explicitly turned on, preserve manual HR values
  IF NEW.is_manual_override IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Resolve the assigned shift for this employee/date if not supplied
  IF NEW.shift_id IS NULL THEN
    SELECT sa.shift_id INTO NEW.shift_id
    FROM shift_assignments sa
    WHERE sa.employee_id = NEW.employee_id
      AND sa.assignment_date = NEW.attendance_date
      AND COALESCE(sa.status, 'scheduled') <> 'cancelled'
    ORDER BY sa.created_at DESC
    LIMIT 1;
  END IF;

  SELECT * INTO m
  FROM public.fn_calc_attendance_metrics(
    NEW.shift_id, NEW.clock_in, NEW.clock_out, NEW.attendance_date
  );

  NEW.late_minutes            := m.late_minutes;
  NEW.early_departure_minutes := m.early_departure_minutes;
  NEW.overtime_hours          := m.overtime_hours;
  NEW.total_hours             := m.total_hours;
  NEW.break_hours             := m.break_hours;
  IF m.scheduled_start IS NOT NULL THEN
    NEW.scheduled_start := m.scheduled_start;
    NEW.scheduled_end   := m.scheduled_end;
  END IF;

  -- Only auto-toggle between present/late; preserve explicit statuses
  -- (absent, on_leave, unpaid_leave, no_pay, holiday, rest_day, half_day).
  IF NEW.clock_in IS NOT NULL
     AND NEW.status IN ('present', 'late')
     AND m.computed_status IS NOT NULL THEN
    NEW.status := m.computed_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_recalc ON public.attendance_records;
CREATE TRIGGER trg_attendance_recalc
  BEFORE INSERT OR UPDATE
  ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_attendance_recalc();

-- ---------------------------------------------------------------------
-- 3. Biometric Processing Function v2 (Clean & Authoritative)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_attendance_logs_v2()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  log_record RECORD;
  emp_record RECORD;
  att_record RECORD;
  v_attendance_date DATE;
  v_tz TEXT := 'Asia/Colombo';
BEGIN
  FOR log_record IN
    SELECT * FROM attendance_logs WHERE is_processed = false ORDER BY punch_time ASC
  LOOP
    -- 1. Find employee by code or ID
    SELECT * INTO emp_record FROM employees
    WHERE employee_code = log_record.employee_code AND is_active = true
    LIMIT 1;

    IF emp_record.id IS NULL AND log_record.employee_id IS NOT NULL THEN
      SELECT * INTO emp_record FROM employees WHERE id = log_record.employee_id;
    END IF;

    IF emp_record.id IS NOT NULL THEN
      -- Link employee_id if missing
      IF log_record.employee_id IS NULL OR log_record.employee_id <> emp_record.id THEN
        UPDATE attendance_logs SET employee_id = emp_record.id WHERE id = log_record.id;
      END IF;

      -- Convert punch time to local Sri Lanka date
      v_attendance_date := (log_record.punch_time AT TIME ZONE v_tz)::DATE;

      -- 2. Ensure attendance record exists
      INSERT INTO attendance_records (
        company_id, branch_id, employee_id, attendance_date, status
      ) VALUES (
        emp_record.company_id, emp_record.branch_id, emp_record.id,
        v_attendance_date, 'present'
      )
      ON CONFLICT (employee_id, attendance_date) DO NOTHING;

      -- 3. Get existing record
      SELECT * INTO att_record FROM attendance_records
      WHERE employee_id = emp_record.id AND attendance_date = v_attendance_date;

      -- 4. Update punches (first IN, latest OUT)
      -- The BEFORE trigger trg_attendance_recalc will automatically calculate
      -- late_minutes, early_departure_minutes, overtime_hours, total_hours, and status!
      IF log_record.punch_type = 'in' THEN
        IF att_record.clock_in IS NULL OR log_record.punch_time < att_record.clock_in THEN
          UPDATE attendance_records
          SET clock_in = log_record.punch_time
          WHERE id = att_record.id;
        END IF;
      ELSIF log_record.punch_type = 'out' THEN
        IF att_record.clock_out IS NULL OR log_record.punch_time > att_record.clock_out THEN
          UPDATE attendance_records
          SET clock_out = log_record.punch_time
          WHERE id = att_record.id;
        END IF;
      END IF;

      -- Mark shift assignment as completed if present
      UPDATE shift_assignments
      SET status = 'completed'
      WHERE employee_id = emp_record.id
        AND assignment_date = v_attendance_date
        AND status = 'scheduled';

      -- Mark log as processed
      UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
    ELSE
      -- Employee not found: log notice but mark processed to avoid infinite loop
      RAISE NOTICE '[ATT] Employee not found for code: %. Log ID: %', log_record.employee_code, log_record.id;
      UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_attendance_logs_v2() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Biometric Processing Function v1 (Fallback Sync)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_attendance_logs()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.process_attendance_logs_v2();
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_attendance_logs() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Batch Recalculation Engine RPC: fn_recalculate_all_attendance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recalculate_all_attendance(
  p_from_date date DEFAULT NULL
)
RETURNS TABLE (
  recalculated_count integer,
  message            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Touching clock_in fires trg_attendance_recalc on every record,
  -- recomputing all metrics cleanly in Sri Lanka time with zero break inflation.
  UPDATE public.attendance_records
  SET clock_in = clock_in
  WHERE is_manual_override IS NOT TRUE
    AND clock_in IS NOT NULL
    AND (p_from_date IS NULL OR attendance_date >= p_from_date);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, ('Successfully recalculated ' || v_count || ' attendance records.') :: text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_recalculate_all_attendance(date) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_recalculate_all_attendance(date)
  IS 'Authoritative batch recalculator: triggers trg_attendance_recalc across all attendance rows.';

-- ---------------------------------------------------------------------
-- 6. Immediate Recalculation on All Existing Historical Records
-- ---------------------------------------------------------------------
UPDATE public.attendance_records
SET clock_in = clock_in
WHERE is_manual_override IS NOT TRUE
  AND clock_in IS NOT NULL;
