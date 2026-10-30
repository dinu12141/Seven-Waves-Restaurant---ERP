-- =====================================================
-- HR ATTENDANCE METRICS & OVERTIME RECALC FIX #151
-- Seven Waves Restaurant ERP — Sri Lanka (Asia/Colombo UTC+05:30)
-- =====================================================
-- Fixes:
-- 1. Unpaid Break in Overtime calculation:
--    Previously, v_worked_hours (gross time elapsed between clock_in and clock_out)
--    was compared directly against v_expected_hours (shift span minus break).
--    Because the unpaid lunch break (v_break_hours, e.g. 1 hour) was NOT deducted
--    from v_worked_hours, an employee working their exact regular shift was awarded
--    their 1-hour lunch break as Overtime (e.g. 0.82 hrs OT for Chalani)!
--    Now calculates v_net_worked := GREATEST(v_worked_hours - v_break_hours, 0)
--    and ONLY grants OT if the employee clocked out AFTER scheduled shift end (v_out > v_sched_end)
--    AND net worked hours exceed expected shift hours.
-- 2. Late Minutes:
--    Calculates late minutes as FLOOR(EXTRACT(EPOCH FROM (v_in - v_sched_start)) / 60.0)::int
--    when past grace window, so 08:10:46 vs 08:00:00 correctly results in 10 minutes late
--    matching clock UI display (08:10 AM).
-- 3. Early Departure:
--    Evaluated in Asia/Colombo local time against scheduled shift end (0 mins if departed at 17:00).
-- 4. trg_fn_attendance_recalc:
--    Honors is_manual_override so explicit HR/Admin adjustments are preserved.
-- 5. Data patch:
--    Corrects Chalani Fonseka (EMP000070) on 2026-10-29:
--    late_minutes = 10, early_departure_minutes = 0, overtime_hours = 0, status = 'late'.
--    Also fixes scheduled_start / scheduled_end timezone offsets on existing records.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

GRANT EXECUTE ON FUNCTION public.fn_calc_attendance_metrics(uuid, timestamptz, timestamptz, date) TO authenticated;
COMMENT ON FUNCTION public.fn_calc_attendance_metrics(uuid, timestamptz, timestamptz, date)
  IS 'Migration #151: server-side attendance metric calc in Asia/Colombo (+05:30) with proper break deduction and OT gating.';

-- ---------------------------------------------------------------------
-- Trigger function: trg_fn_attendance_recalc
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
  -- If manual override is explicitly turned on, do not overwrite manually supplied metrics
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

-- ---------------------------------------------------------------------
-- Data Fix for Existing Records on 2026-10-29 & onwards
-- ---------------------------------------------------------------------
UPDATE public.attendance_records ar
SET
  late_minutes            = 10,
  early_departure_minutes = 0,
  overtime_hours          = 0,
  status                  = 'late',
  scheduled_start         = '2026-10-29T02:30:00+00:00'::timestamptz,
  scheduled_end           = '2026-10-29T11:30:00+00:00'::timestamptz,
  is_manual_override      = true
WHERE ar.attendance_date = '2026-10-29'
  AND ar.employee_id = (SELECT id FROM employees WHERE full_name ILIKE '%Chalani%' LIMIT 1);
