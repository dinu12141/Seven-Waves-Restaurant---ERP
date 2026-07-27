-- =====================================================================
-- Task #112 — Attendance shift-based calc: server-side RPC + no_pay + absentee sweep
-- Seven Waves Restaurant ERP
--
-- Delivers:
--   1. Extend chk_attendance_status to allow 'no_pay'
--   2. fn_calc_attendance_metrics(shift_id, clock_in, clock_out, date)  [pure calc RPC]
--   3. trg_attendance_recalc  BEFORE INSERT/UPDATE  [server is source of truth]
--   4. fn_mark_absentees(date, branch)  [creates no_pay rows for assigned-but-not-clocked]
--   5. get_attendance_payroll_summary — count 'no_pay' as absent day
--
-- All time math is done in a single UTC wall-clock frame. Stored clock_in/out
-- are timestamptz saved from naive "YYYY-MM-DDTHH:MM:SS" strings (UTC session tz),
-- and shift start/end are `time` values anchored on attendance_date; comparing
-- differences is tz-invariant, so we normalise everything AT TIME ZONE 'UTC'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Allow the 'no_pay' status
-- ---------------------------------------------------------------------
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS chk_attendance_status;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT chk_attendance_status CHECK (
    status = ANY (ARRAY[
      'present'::text, 'absent'::text, 'half_day'::text, 'late'::text,
      'on_leave'::text, 'unpaid_leave'::text, 'holiday'::text,
      'rest_day'::text, 'no_pay'::text
    ])
  );

-- ---------------------------------------------------------------------
-- 2. Pure calculation RPC — no side effects, safe to call for a live preview
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
  v_in             timestamp;      -- UTC wall clock
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

  v_in  := p_clock_in  AT TIME ZONE 'UTC';
  v_out := p_clock_out AT TIME ZONE 'UTC';

  -- Overnight worked span: check-out logged on same calendar date
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
  scheduled_start         := CASE WHEN v_has_shift THEN v_sched_start AT TIME ZONE 'UTC' END;
  scheduled_end           := CASE WHEN v_has_shift THEN v_sched_end   AT TIME ZONE 'UTC' END;
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
  IS 'Task #112: server-side attendance metric calc (late/early/OT/total). Pure, no side effects. Used by AttendancePage preview; the trigger recomputes on save.';

-- ---------------------------------------------------------------------
-- 3. Trigger — recompute stored metrics on every write (server authoritative)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_attendance_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m RECORD;
BEGIN
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
  BEFORE INSERT OR UPDATE OF clock_in, clock_out, shift_id, status, attendance_date
  ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_attendance_recalc();

-- ---------------------------------------------------------------------
-- 4. Absentee sweep — no_pay rows for assigned-but-not-clocked employees
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mark_absentees(
  p_date      date,
  p_branch_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created integer := 0;
BEGIN
  -- Authorization: admin, manager, or HR — and (unless admin) branch must be in scope
  IF NOT (
    is_admin()
    OR ( (is_manager() OR auth_has_role('hr')) AND p_branch_id = ANY (auth_branch_ids()) )
  ) THEN
    RAISE EXCEPTION 'not authorized to mark absentees for this branch'
      USING ERRCODE = '42501';
  END IF;

  WITH scheduled AS (
    SELECT DISTINCT ON (sa.employee_id)
           sa.employee_id,
           sa.company_id,
           sa.branch_id,
           sa.shift_id,
           (p_date + s.start_time) AT TIME ZONE 'UTC' AS sched_start,
           (p_date + s.end_time
             + CASE WHEN s.is_overnight OR s.end_time <= s.start_time
                    THEN INTERVAL '1 day' ELSE INTERVAL '0' END) AT TIME ZONE 'UTC' AS sched_end
    FROM shift_assignments sa
    JOIN shifts s      ON s.id = sa.shift_id
    JOIN employees e   ON e.id = sa.employee_id
    WHERE sa.assignment_date = p_date
      AND sa.branch_id = p_branch_id
      AND COALESCE(sa.status, 'scheduled') <> 'cancelled'
      AND COALESCE(e.is_active, true) = true
      -- Skip employees on APPROVED leave covering this date (do not dock as no_pay)
      AND NOT EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.employee_id = sa.employee_id
          AND lr.status = 'approved'
          AND p_date BETWEEN lr.start_date AND lr.end_date
      )
    ORDER BY sa.employee_id, sa.created_at DESC
  ),
  ins AS (
    INSERT INTO attendance_records (
      company_id, branch_id, employee_id, shift_id, attendance_date,
      scheduled_start, scheduled_end, status, remarks
    )
    SELECT sc.company_id, sc.branch_id, sc.employee_id, sc.shift_id, p_date,
           sc.sched_start, sc.sched_end, 'no_pay',
           'Auto: no punch for assigned shift'
    FROM scheduled sc
    ON CONFLICT (employee_id, attendance_date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM ins;

  RETURN v_created;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_mark_absentees(date, uuid) TO authenticated;
COMMENT ON FUNCTION public.fn_mark_absentees(date, uuid)
  IS 'Task #112: create no_pay attendance rows for employees with a shift assignment on the date but no attendance record. Authz: admin/manager/hr within branch scope. Idempotent via UNIQUE(employee_id,attendance_date).';

-- ---------------------------------------------------------------------
-- 5. Roll no_pay into the payroll absent count
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_payroll_summary(
  p_branch_id uuid, p_period_start date, p_period_end date
)
RETURNS TABLE(
  employee_id uuid, full_name text, days_present bigint, days_absent bigint,
  days_on_leave bigint, days_half bigint, total_late_minutes bigint, total_ot_hours numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT
        ar.employee_id,
        e.full_name,
        COUNT(*) FILTER (WHERE ar.status = 'present')                        AS days_present,
        COUNT(*) FILTER (WHERE ar.status IN ('absent','unpaid_leave','no_pay')) AS days_absent,
        COUNT(*) FILTER (WHERE ar.status = 'on_leave')                       AS days_on_leave,
        COUNT(*) FILTER (WHERE ar.status = 'half_day')                       AS days_half,
        COALESCE(SUM(ar.late_minutes), 0)                                    AS total_late_minutes,
        COALESCE(SUM(ar.overtime_hours), 0)                                  AS total_ot_hours
    FROM attendance_records ar
    JOIN employees e ON e.id = ar.employee_id
    WHERE ar.branch_id      = p_branch_id
      AND ar.attendance_date BETWEEN p_period_start AND p_period_end
    GROUP BY ar.employee_id, e.full_name
    ORDER BY e.full_name;
$$;
