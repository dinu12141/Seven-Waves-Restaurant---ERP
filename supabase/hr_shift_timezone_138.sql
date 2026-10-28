-- ═══════════════════════════════════════════════════════════════════════════
-- HR #138 — Shift gating in Sri Lanka local time + overnight shifts (finding #7)
-- Seven Waves Restaurant ERP
--
-- Bugs in shift_access_control.sql (auth_is_on_shift :57-58, :83-93 and
-- auth_get_shift_branches :128, :166):
--   1. CURRENT_DATE / CURRENT_TIME are evaluated in the DB session TimeZone
--      (Supabase default UTC). Sri Lanka is UTC+05:30, so from 00:00 to 05:30
--      local the "today" used is YESTERDAY, and every shift window is compared
--      against a clock 5h30 behind.
--   2. Overnight shifts started yesterday are never matched after midnight
--      (only assignment_date = today is checked).
--   3. TIME ± INTERVAL wraps at midnight: a shift ending 00:00 gives the window
--      14:30 .. 00:30, and "x BETWEEN 14:30 AND 00:30" is always false.
--   4. Live data (read 2026-10-26): shifts.is_overnight is unreliable —
--      'Night Shift' 15:00–00:00 is_overnight=false (never matches → waiters on
--      it never see the inbox), 'Evening Shift' 12:00–21:00 is_overnight=true
--      (OR-branch → on shift 24h). Overnight is therefore derived from the
--      times: end_time <= start_time.
--
-- Fix: compare full local timestamps.
--   window = [assignment_date + start_time − 30 min,
--             assignment_date + end_time (+1 day if end <= start) + 30 min]
--   checked against now() AT TIME ZONE 'Asia/Colombo', for assignments dated
--   yesterday, today or tomorrow (local) — tomorrow so a shift starting just
--   after midnight keeps its 30-min pre-start grace before 00:00.
--
-- Signatures UNCHANGED: auth_is_on_shift(uuid) → boolean,
-- auth_get_shift_branches() → TABLE(branch_id uuid, branch_name text,
-- shift_name text, shift_start time, shift_end time).
-- CREATE OR REPLACE only — NO DROP … CASCADE (the original file's DROP CASCADE
-- would drop every RLS policy that calls auth_is_on_shift). Existing EXECUTE
-- grants are preserved by CREATE OR REPLACE and deliberately not touched
-- (policies evaluated for other roles must keep working).
--
-- Callers checked (all call auth_is_on_shift(<branch uuid>) and only need a
-- boolean — unaffected by the body change): get_pending_orders_for_shift,
-- accept_order_as_waiter / rpc_waiter_accept_order, orders RLS
-- (security_hardening_131.sql:68, fix_waiter_visibility_fully.sql,
-- fix_waiter_dashboard_fully.sql, rls_restaurant_flow-era policies), KOT
-- dispatch/orchestration policies, realtime_downstream.sql;
-- waiterOrderStore.js uses auth_get_shift_branches + the RPCs above.
-- Independent of #135/#137. NOT yet applied.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.auth_is_on_shift(p_branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now_local TIMESTAMP := (now() AT TIME ZONE 'Asia/Colombo');
    v_today     DATE      := (now() AT TIME ZONE 'Asia/Colombo')::DATE;
    v_buffer    INTERVAL  := INTERVAL '30 minutes';
BEGIN
    -- Admins and managers bypass shift checks (unchanged)
    IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
        RETURN true;
    END IF;

    IF auth.uid() IS NULL OR p_branch_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
          FROM shift_assignments sa
          JOIN employees e ON e.id = sa.employee_id
          JOIN shifts    s ON s.id = sa.shift_id
         WHERE e.profile_id = auth.uid()
           AND e.is_active  = true
           AND sa.branch_id = p_branch_id
           AND sa.status    = 'scheduled'
           AND s.is_active  = true
           -- yesterday's shift still running past midnight, today's shift, or
           -- tomorrow's shift starting just after midnight (30-min pre-start grace)
           AND sa.assignment_date IN (v_today - 1, v_today, v_today + 1)
           AND v_now_local BETWEEN
                   (sa.assignment_date + s.start_time) - v_buffer
               AND (sa.assignment_date + s.end_time
                    + CASE WHEN s.end_time <= s.start_time THEN INTERVAL '1 day'
                           ELSE INTERVAL '0' END) + v_buffer
    );
EXCEPTION WHEN OTHERS THEN
    -- Fail closed (unchanged behaviour)
    RAISE WARNING 'auth_is_on_shift error: %', SQLERRM;
    RETURN false;
END;
$$;

COMMENT ON FUNCTION public.auth_is_on_shift(uuid) IS
  '#138: true if caller is admin/manager, or has a scheduled shift at p_branch_id whose window (±30 min) contains the current Asia/Colombo time. Overnight = end_time <= start_time (shifts.is_overnight is ignored); yesterday''s overnight shift counts after midnight.';


CREATE OR REPLACE FUNCTION public.auth_get_shift_branches()
RETURNS TABLE (
    branch_id   uuid,
    branch_name text,
    shift_name  text,
    shift_start time,
    shift_end   time
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now_local TIMESTAMP := (now() AT TIME ZONE 'Asia/Colombo');
    v_today     DATE      := (now() AT TIME ZONE 'Asia/Colombo')::DATE;
BEGIN
    -- Admins/managers: all branches they belong to (unchanged)
    IF public.auth_has_role('admin') OR public.auth_has_role('manager') THEN
        RETURN QUERY
            SELECT ub.branch_id, b.name::text, 'All Shifts'::text, '00:00'::time, '23:59'::time
              FROM user_branches ub
              JOIN branches b ON b.id = ub.branch_id
             WHERE ub.user_id = auth.uid()
               AND b.is_active = true;
        RETURN;
    END IF;

    -- Today's assignments (local date) as before, PLUS yesterday's overnight
    -- shift while it is still running (incl. the 30-min grace after its end),
    -- so the waiter app keeps its realtime subscription after midnight.
    RETURN QUERY
        SELECT sa.branch_id, br.name::text, s.name::text, s.start_time, s.end_time
          FROM shift_assignments sa
          JOIN employees e  ON e.id  = sa.employee_id
          JOIN shifts    s  ON s.id  = sa.shift_id
          JOIN branches  br ON br.id = sa.branch_id
         WHERE e.profile_id = auth.uid()
           AND e.is_active  = true
           AND sa.status    = 'scheduled'
           AND s.is_active  = true
           AND (
                 sa.assignment_date = v_today
              OR (sa.assignment_date = v_today - 1
                  AND s.end_time <= s.start_time
                  AND v_now_local <= (sa.assignment_date + s.end_time + INTERVAL '1 day' + INTERVAL '30 minutes'))
              -- tomorrow's shift whose 30-min pre-start grace has begun (e.g. 00:15 start)
              OR (sa.assignment_date = v_today + 1
                  AND v_now_local >= (sa.assignment_date + s.start_time - INTERVAL '30 minutes'))
           );
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-apply check (read-only), as a waiter on the Night Shift at ~00:15 LK:
--   SELECT public.auth_is_on_shift('<branch uuid>');   -- expect true
--   SELECT * FROM public.auth_get_shift_branches();      -- expect the branch
-- Data clean-up for HR (optional, not required by this fix):
--   shifts.is_overnight should be true only where end_time <= start_time.
