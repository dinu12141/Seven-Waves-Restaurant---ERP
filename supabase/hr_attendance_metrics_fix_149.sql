-- =====================================================
-- HR ATTENDANCE METRICS TIMEZONE FIX #149
-- Seven Waves Restaurant ERP — Sri Lanka (Asia/Colombo UTC+05:30)
-- =====================================================
-- Fixes bug in att_shift_calc_112.sql fn_calc_attendance_metrics:
-- Previously converted p_clock_in / p_clock_out to 'UTC' wall clock
-- and compared against local Sri Lanka shift times (p_date + v_shift.start_time).
-- This caused an erroneous 5h 30m (330 minutes) shift in early departure
-- and late minutes calculation.
-- Now converts timestamps to 'Asia/Colombo' (+05:30) so shift start/end
-- match actual local punches accurately.
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
      v_late := ROUND(EXTRACT(EPOCH FROM (v_in - v_sched_start)) / 60.0)::int;
    END IF;

    -- Early departure: left before scheduled end
    IF v_out IS NOT NULL AND v_out < v_sched_end THEN
      v_early := ROUND(EXTRACT(EPOCH FROM (v_sched_end - v_out)) / 60.0)::int;
    END IF;

    -- Overtime: worked beyond the paid shift span (span minus break)
    v_span_hours     := EXTRACT(EPOCH FROM (v_sched_end - v_sched_start)) / 3600.0;
    v_expected_hours := GREATEST(v_span_hours - v_break_hours, 0);
    IF v_worked_hours > v_expected_hours THEN
      v_ot := ROUND((v_worked_hours - v_expected_hours)::numeric, 2);
    END IF;
  ELSE
    -- No shift assigned: do NOT fabricate a 09:00 reference (no late/early).
    -- OT only against a standard 8h day when both punches exist.
    IF v_worked_hours > 8 THEN
      v_ot := ROUND((v_worked_hours - 8)::numeric, 2);
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
  IS 'Migration #149: server-side attendance metric calc in Asia/Colombo (+05:30). Pure, no side effects.';
