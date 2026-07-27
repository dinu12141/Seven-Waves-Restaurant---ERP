-- =====================================================================
-- Task #116 — Leave → Attendance: approved leave creates PAID on_leave rows
-- Seven Waves Restaurant ERP
--
-- When a leave_request is APPROVED, every date in [start_date, end_date]
-- becomes an explicit attendance day so payroll treats it correctly:
--   • leave_types.is_paid = true  → status 'on_leave' (PAID)
--   • leave_types.is_paid = false → status 'no_pay'   (unpaid)
-- Actually-worked days (clock_in present, or present/late/half_day) are
-- NEVER overwritten. Un-approving (reject/cancel/pending) removes the rows
-- this created (remarks 'Leave:%' AND no clock_in).
--
-- Depends on att_shift_calc_112.sql (chk_attendance_status incl no_pay,
-- UNIQUE(employee_id,attendance_date), trg_attendance_recalc).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. Internal applier — NO authz (only for definer/trigger use).
--     Not granted to authenticated, so it is NOT callable via PostgREST.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._apply_leave_attendance_rows(p_leave_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lr      leave_requests%ROWTYPE;
  v_paid    boolean;
  v_type    text;
  v_status  text;
  v_count   integer := 0;
BEGIN
  SELECT * INTO v_lr FROM leave_requests WHERE id = p_leave_request_id;
  IF NOT FOUND OR v_lr.status <> 'approved' THEN
    RETURN 0;
  END IF;

  SELECT lt.name, COALESCE(lt.is_paid, true)
    INTO v_type, v_paid
  FROM leave_types lt
  WHERE lt.id = v_lr.leave_type_id;

  v_status := CASE WHEN v_paid THEN 'on_leave' ELSE 'no_pay' END;

  INSERT INTO attendance_records (
    company_id, branch_id, employee_id, attendance_date, status,
    clock_in, clock_out, late_minutes, overtime_hours,
    early_departure_minutes, total_hours, break_hours, remarks
  )
  SELECT v_lr.company_id, v_lr.branch_id, v_lr.employee_id, d::date, v_status,
         NULL, NULL, 0, 0, 0, 0, 0, 'Leave: ' || COALESCE(v_type, 'leave')
  FROM generate_series(v_lr.start_date, v_lr.end_date, INTERVAL '1 day') d
  ON CONFLICT (employee_id, attendance_date) DO UPDATE
    SET status  = EXCLUDED.status,
        remarks = EXCLUDED.remarks
    WHERE attendance_records.clock_in IS NULL
      AND attendance_records.status NOT IN ('present', 'late', 'half_day');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Supabase default privileges grant EXECUTE to authenticated on public funcs,
-- so revoking from PUBLIC alone is not enough — revoke the callable roles too.
REVOKE ALL ON FUNCTION public._apply_leave_attendance_rows(uuid) FROM PUBLIC, authenticated, anon;
COMMENT ON FUNCTION public._apply_leave_attendance_rows(uuid)
  IS 'Task #116 internal: upsert on_leave/no_pay attendance rows for an approved leave range. No authz — trigger/definer use only. Not exposed to PostgREST.';

-- ---------------------------------------------------------------------
-- 1b. Public RPC wrapper — authz then apply. Callable via PostgREST.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_apply_leave_attendance(p_leave_request_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch uuid;
BEGIN
  SELECT branch_id INTO v_branch FROM leave_requests WHERE id = p_leave_request_id;
  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'leave request not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    is_admin()
    OR ( (is_hr() OR is_manager()) AND v_branch = ANY (auth_branch_ids()) )
  ) THEN
    RAISE EXCEPTION 'not authorized to apply leave attendance' USING ERRCODE = '42501';
  END IF;

  RETURN public._apply_leave_attendance_rows(p_leave_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_apply_leave_attendance(uuid) TO authenticated;
COMMENT ON FUNCTION public.fn_apply_leave_attendance(uuid)
  IS 'Task #116: manually (re)apply attendance rows for an approved leave request. Authz admin/hr/manager in branch scope. Idempotent.';

-- ---------------------------------------------------------------------
-- 2. leave_requests trigger — auto-apply on approval, remove on un-approval
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_leave_apply_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      PERFORM public._apply_leave_attendance_rows(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status = 'approved' THEN
    -- Clear any prior leave rows in the (possibly changed) OLD range, then re-apply
    DELETE FROM attendance_records ar
    WHERE ar.employee_id = OLD.employee_id
      AND ar.attendance_date BETWEEN OLD.start_date AND OLD.end_date
      AND ar.clock_in IS NULL
      AND ar.remarks LIKE 'Leave:%';
    PERFORM public._apply_leave_attendance_rows(NEW.id);
  ELSIF OLD.status = 'approved' AND NEW.status IS DISTINCT FROM 'approved' THEN
    -- Transitioned away from approved → remove the rows we created
    DELETE FROM attendance_records ar
    WHERE ar.employee_id = OLD.employee_id
      AND ar.attendance_date BETWEEN OLD.start_date AND OLD.end_date
      AND ar.clock_in IS NULL
      AND ar.remarks LIKE 'Leave:%';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_apply_attendance ON public.leave_requests;
CREATE TRIGGER trg_leave_apply_attendance
  AFTER INSERT OR UPDATE OF status, start_date, end_date, leave_type_id
  ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_leave_apply_attendance();

-- ---------------------------------------------------------------------
-- 3. get_attendance_payroll_summary already separates on_leave (paid) from
--    absent/unpaid_leave/no_pay (unpaid) — reasserted here for clarity.
--    (No functional change vs #112; on_leave => days_on_leave = PAID bucket.)
-- ---------------------------------------------------------------------
-- (left as applied in att_shift_calc_112.sql)
