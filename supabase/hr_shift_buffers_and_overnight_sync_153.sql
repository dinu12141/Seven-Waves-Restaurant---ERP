-- =====================================================
-- HR SHIFT BUFFERS, OVERNIGHT SYNC & BIOMETRIC PIN MAPPING #153
-- Seven Waves Restaurant ERP — Sri Lanka (Asia/Colombo UTC+05:30)
-- =====================================================
-- 1. Adds configurable pre-shift and post-shift buffers to public.shifts:
--    - pre_shift_buffer_minutes (default 60 mins): allowed check-in window before shift.
--    - post_shift_buffer_minutes (default 120 mins): allowed check-out window after shift.
-- 2. Adds attendance_device_id to public.employees:
--    - Enables explicit mapping of physical ZKTeco machine User ID / PIN (e.g. 12)
--      to any employee (e.g. EMP000012 or CHEF-01), exactly like Frappe HRMS.
-- 3. Multi-tier Employee Matching Engine in process_attendance_logs_v2():
--    - Tier 1: Explicit attendance_device_id match (Frappe style PIN)
--    - Tier 2: Exact employee_code match (e.g. EMP000083)
--    - Tier 3: Zero-padded numeric code match (e.g. '83' -> 'EMP000083')
--    - Tier 4: Pure numeric digits match
--    - Tier 5: Direct employee_id link
-- 4. Advanced Overnight Punch Merging:
--    - When an employee punches out past midnight (00:00 - 11:00 AM), seamlessly
--      merges the punch into yesterday's open shift, preventing broken split records.
-- 5. Safe Healing of Historical Split Overnight Records.
-- =====================================================

-- ---------------------------------------------------------------------
-- 1. Schema Enhancements: Buffer Columns & Biometric PIN Column
-- ---------------------------------------------------------------------
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS pre_shift_buffer_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS post_shift_buffer_minutes INTEGER DEFAULT 120;

COMMENT ON COLUMN public.shifts.pre_shift_buffer_minutes IS 'Allowed check-in buffer before shift start (in minutes)';
COMMENT ON COLUMN public.shifts.post_shift_buffer_minutes IS 'Allowed check-out buffer after shift end (in minutes) for overnight shifts';

UPDATE public.shifts SET pre_shift_buffer_minutes = 60 WHERE pre_shift_buffer_minutes IS NULL;
UPDATE public.shifts SET post_shift_buffer_minutes = 120 WHERE post_shift_buffer_minutes IS NULL;
UPDATE public.shifts SET grace_minutes = 10 WHERE grace_minutes IS NULL;

-- Add attendance_device_id to employees (Frappe HRMS biometric terminal PIN)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS attendance_device_id TEXT;

COMMENT ON COLUMN public.employees.attendance_device_id IS 'Biometric terminal User ID / PIN on fingerprint machine';

-- Initialize attendance_device_id from numeric digits of employee_code where available
UPDATE public.employees
SET attendance_device_id = REGEXP_REPLACE(employee_code, '\D', '', 'g')
WHERE attendance_device_id IS NULL
  AND employee_code IS NOT NULL
  AND REGEXP_REPLACE(employee_code, '\D', '', 'g') <> '';

-- ---------------------------------------------------------------------
-- 2. Enhanced Biometric Processing Function: process_attendance_logs_v2
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_attendance_logs_v2()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  log_record        RECORD;
  emp_record        RECORD;
  att_record        RECORD;
  yest_att_record   RECORD;
  v_attendance_date DATE;
  v_local_date      DATE;
  v_yest_date       DATE;
  v_tz              TEXT := 'Asia/Colombo';
  v_local_time      TIMESTAMP;
  v_local_hour      NUMERIC;
  v_is_yest_merged  BOOLEAN;
  v_log_clean_code  TEXT;
  v_log_num_only    TEXT;
BEGIN
  FOR log_record IN
    SELECT * FROM attendance_logs WHERE is_processed = false ORDER BY punch_time ASC
  LOOP
    v_log_clean_code := TRIM(COALESCE(log_record.employee_code, ''));
    v_log_num_only   := REGEXP_REPLACE(v_log_clean_code, '\D', '', 'g');

    -- 1. Multi-tier Employee Lookup:
    -- Tier 1: Match attendance_device_id (Biometric PIN)
    -- Tier 2: Match employee_code (exact)
    -- Tier 3: Match padded EMP code (e.g. 83 -> EMP000083)
    -- Tier 4: Match numeric digits
    SELECT * INTO emp_record FROM employees
    WHERE (
      (attendance_device_id IS NOT NULL AND (attendance_device_id = v_log_clean_code OR attendance_device_id = v_log_num_only))
      OR (employee_code = v_log_clean_code)
      OR (v_log_num_only <> '' AND employee_code = ('EMP' || LPAD(v_log_num_only, 6, '0')))
      OR (v_log_num_only <> '' AND REGEXP_REPLACE(employee_code, '\D', '', 'g') = v_log_num_only)
    )
    AND is_active = true
    ORDER BY
      (attendance_device_id = v_log_clean_code) DESC,
      (employee_code = v_log_clean_code) DESC,
      (employee_code = ('EMP' || LPAD(v_log_num_only, 6, '0'))) DESC
    LIMIT 1;

    -- Tier 5: Direct employee_id fallback
    IF emp_record.id IS NULL AND log_record.employee_id IS NOT NULL THEN
      SELECT * INTO emp_record FROM employees WHERE id = log_record.employee_id;
    END IF;

    IF emp_record.id IS NOT NULL THEN
      -- Link employee_id if missing or mismatch
      IF log_record.employee_id IS NULL OR log_record.employee_id <> emp_record.id THEN
        UPDATE attendance_logs SET employee_id = emp_record.id WHERE id = log_record.id;
      END IF;

      -- Convert punch time to local Sri Lanka time and calendar date
      v_local_time      := log_record.punch_time AT TIME ZONE v_tz;
      v_local_date      := v_local_time::DATE;
      v_local_hour      := EXTRACT(HOUR FROM v_local_time) + (EXTRACT(MINUTE FROM v_local_time) / 60.0);
      v_yest_date       := (v_local_date - INTERVAL '1 day')::DATE;
      v_is_yest_merged  := false;

      -- 2. Overnight Shift Check:
      -- If punch is 'out' OR (unspecified punch in early morning hours before 11:00 AM):
      -- AND punch is NOT explicitly 'in' (explicit IN always starts a new day):
      -- Check if yesterday has an uncompleted attendance record (clock_in exists, clock_out is NULL).
      IF (log_record.punch_type = 'out' OR (COALESCE(log_record.punch_type, '') <> 'in' AND v_local_hour < 11.0)) THEN
        SELECT ar.*, s.end_time AS s_end_time, s.is_overnight AS s_is_overnight,
               COALESCE(s.post_shift_buffer_minutes, 120) AS s_post_buffer
        INTO yest_att_record
        FROM attendance_records ar
        LEFT JOIN shifts s ON s.id = ar.shift_id
        WHERE ar.employee_id = emp_record.id
          AND ar.attendance_date = v_yest_date
          AND ar.clock_in IS NOT NULL
          AND ar.clock_out IS NULL;

        IF yest_att_record.id IS NOT NULL THEN
          -- Verify elapsed time is within plausible overnight range (2 to 18 hours)
          -- and yesterday's shift was either an overnight shift or started after 12:00 PM noon.
          IF log_record.punch_time > yest_att_record.clock_in
             AND EXTRACT(EPOCH FROM (log_record.punch_time - yest_att_record.clock_in)) / 3600.0 BETWEEN 2.0 AND 18.0
             AND (
               COALESCE(yest_att_record.s_is_overnight, false) = true
               OR yest_att_record.s_end_time < '12:00:00'::TIME
               OR EXTRACT(HOUR FROM (yest_att_record.clock_in AT TIME ZONE v_tz)) >= 12.0
             ) THEN
            
            -- Merge as yesterday's clock_out!
            UPDATE attendance_records
            SET clock_out = log_record.punch_time
            WHERE id = yest_att_record.id;

            -- Mark yesterday's shift assignment completed
            UPDATE shift_assignments
            SET status = 'completed'
            WHERE employee_id = emp_record.id
              AND assignment_date = v_yest_date
              AND status = 'scheduled';

            v_is_yest_merged := true;
          END IF;
        END IF;
      END IF;

      -- 3. Standard flow if not merged into yesterday
      IF NOT v_is_yest_merged THEN
        v_attendance_date := v_local_date;

        -- Ensure attendance record exists for today
        INSERT INTO attendance_records (
          company_id, branch_id, employee_id, attendance_date, status
        ) VALUES (
          emp_record.company_id, emp_record.branch_id, emp_record.id,
          v_attendance_date, 'present'
        )
        ON CONFLICT (employee_id, attendance_date) DO NOTHING;

        -- Fetch existing record
        SELECT * INTO att_record FROM attendance_records
        WHERE employee_id = emp_record.id AND attendance_date = v_attendance_date;

        -- Update punch times (first IN, latest OUT)
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
        ELSE
          -- Undefined punch type: first punch of day is IN, subsequent is OUT
          IF att_record.clock_in IS NULL THEN
            UPDATE attendance_records SET clock_in = log_record.punch_time WHERE id = att_record.id;
          ELSE
            UPDATE attendance_records SET clock_out = log_record.punch_time WHERE id = att_record.id;
          END IF;
        END IF;

        -- Mark today's shift assignment as completed
        UPDATE shift_assignments
        SET status = 'completed'
        WHERE employee_id = emp_record.id
          AND assignment_date = v_attendance_date
          AND status = 'scheduled';
      END IF;

      -- 4. Mark log as processed
      UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
    ELSE
      -- Employee not found: log notice but mark processed to avoid infinite loops
      RAISE NOTICE '[ATT] Employee not found for code: %. Log ID: %', log_record.employee_code, log_record.id;
      UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_attendance_logs_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_attendance_logs_v2() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Biometric Processing Function v1 (Fallback Bridge)
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

REVOKE EXECUTE ON FUNCTION public.process_attendance_logs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_attendance_logs() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Safe Healing of Historical Split Overnight Records
-- ---------------------------------------------------------------------
WITH candidate_splits AS (
  SELECT 
    r_prev.id AS prev_id,
    r_curr.id AS curr_id,
    r_curr.clock_out AS healed_clock_out
  FROM public.attendance_records r_curr
  JOIN public.attendance_records r_prev 
    ON r_prev.employee_id = r_curr.employee_id
   AND r_prev.attendance_date = (r_curr.attendance_date - INTERVAL '1 day')::DATE
  WHERE r_curr.clock_in IS NULL 
    AND r_curr.clock_out IS NOT NULL
    AND r_prev.clock_in IS NOT NULL 
    AND r_prev.clock_out IS NULL
    AND r_curr.clock_out > r_prev.clock_in
    AND EXTRACT(EPOCH FROM (r_curr.clock_out - r_prev.clock_in)) / 3600.0 BETWEEN 2.0 AND 24.0
)
UPDATE public.attendance_records ar
SET clock_out = cs.healed_clock_out,
    remarks = COALESCE(ar.remarks, '') || ' [AUTO HEALED: Linked next-day overnight punch-out]'
FROM candidate_splits cs
WHERE ar.id = cs.prev_id;

-- Delete orphaned Day 2 records that had no clock_in and were merged into Day 1
DELETE FROM public.attendance_records r_curr
USING public.attendance_records r_prev
WHERE r_prev.employee_id = r_curr.employee_id
  AND r_prev.attendance_date = (r_curr.attendance_date - INTERVAL '1 day')::DATE
  AND r_curr.clock_in IS NULL
  AND r_curr.clock_out IS NOT NULL
  AND r_prev.clock_out = r_curr.clock_out
  AND r_prev.remarks LIKE '%[AUTO HEALED: Linked next-day overnight punch-out]%';

-- Trigger authoritative recalculation for all healed records
UPDATE public.attendance_records
SET clock_in = clock_in
WHERE remarks LIKE '%[AUTO HEALED: Linked next-day overnight punch-out]%';
