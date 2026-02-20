-- =====================================================
-- BIOMETRIC INTEGRATION MODULE (ENHANCED)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 1. Update attendance_logs table
ALTER TABLE attendance_logs 
ADD COLUMN IF NOT EXISTS employee_code TEXT;

-- Add constraint to prevent duplicates
ALTER TABLE attendance_logs 
DROP CONSTRAINT IF EXISTS attendance_logs_unique_punch;

ALTER TABLE attendance_logs
ADD CONSTRAINT attendance_logs_unique_punch 
UNIQUE (employee_code, punch_time, device_id);

-- =====================================================
-- 2. Processing Function
-- =====================================================

CREATE OR REPLACE FUNCTION process_attendance_logs()
RETURNS VOID AS $$
DECLARE
    log_record RECORD;
    emp_record RECORD;
    shift_record RECORD;
    att_record RECORD;
    
    v_attendance_date DATE;
    v_shift_start TIMESTAMPTZ;
    v_shift_end TIMESTAMPTZ;
    v_shift_duration INTERVAL;
    v_shift_hours NUMERIC(5,2);
    v_late_minutes INT := 0;
    v_early_minutes INT := 0;
    v_overtime_hours NUMERIC(5,2) := 0;
    v_total_hours NUMERIC(5,2) := 0;
BEGIN
    -- Loop through unprocessed logs
    FOR log_record IN 
        SELECT * FROM attendance_logs WHERE is_processed = false ORDER BY punch_time ASC
    LOOP
        -- 1. Find Employee
        SELECT * INTO emp_record FROM employees WHERE employee_code = log_record.employee_code LIMIT 1;
        
        IF emp_record.id IS NOT NULL THEN
            -- Adjust log with employee_id if missing
            UPDATE attendance_logs SET employee_id = emp_record.id 
            WHERE id = log_record.id AND employee_id IS NULL;

            v_attendance_date := log_record.punch_time::DATE;

            -- 2. Find/Create Attendance Record for the day
            INSERT INTO attendance_records (
                company_id, branch_id, employee_id, attendance_date, status
            ) VALUES (
                emp_record.company_id, 
                emp_record.branch_id, 
                emp_record.id, 
                v_attendance_date, 
                'present'
            )
            ON CONFLICT (employee_id, attendance_date) DO NOTHING;

            -- 3. Get the record to update
            SELECT * INTO att_record FROM attendance_records 
            WHERE employee_id = emp_record.id AND attendance_date = v_attendance_date;

            -- 4. Get Shift Assignment
            SELECT s.* INTO shift_record 
            FROM shift_assignments sa
            JOIN shifts s ON s.id = sa.shift_id
            WHERE sa.employee_id = emp_record.id AND sa.assignment_date = v_attendance_date;
            
            -- 5. Update Times
            IF log_record.punch_type = 'in' THEN
                IF att_record.clock_in IS NULL OR log_record.punch_time < att_record.clock_in THEN
                   UPDATE attendance_records SET clock_in = log_record.punch_time WHERE id = att_record.id;
                END IF;
            ELSIF log_record.punch_type = 'out' THEN
                IF att_record.clock_out IS NULL OR log_record.punch_time > att_record.clock_out THEN
                   UPDATE attendance_records SET clock_out = log_record.punch_time WHERE id = att_record.id;
                END IF;
            END IF;

            -- 6. Calculate Stats (if both IN and OUT exist)
            SELECT * INTO att_record FROM attendance_records WHERE id = att_record.id; -- Refresh
            
            IF att_record.clock_in IS NOT NULL AND att_record.clock_out IS NOT NULL THEN
                -- Calculate Total Hours
                v_total_hours := EXTRACT(EPOCH FROM (att_record.clock_out - att_record.clock_in)) / 3600;
                
                -- Shift Logic
                IF shift_record.id IS NOT NULL THEN
                   -- Construct Shift Start/End
                   v_shift_start := (v_attendance_date || ' ' || shift_record.start_time)::TIMESTAMPTZ;
                   v_shift_end := (v_attendance_date || ' ' || shift_record.end_time)::TIMESTAMPTZ;
                   
                   -- Handle Overnight
                   IF shift_record.is_overnight OR v_shift_end < v_shift_start THEN
                       v_shift_end := v_shift_end + INTERVAL '1 day';
                       -- If clock_in is before shift start (e.g. previous day late night), adjust reference? 
                       -- Actually, attendance_date usually refers to shift start date.
                   END IF;
                   
                   -- Calculate Late Minutes
                   IF att_record.clock_in > v_shift_start THEN
                       v_late_minutes := EXTRACT(EPOCH FROM (att_record.clock_in - v_shift_start)) / 60;
                   ELSE
                       v_late_minutes := 0;
                   END IF;

                   -- Calculate Early Leave Minutes
                   IF att_record.clock_out < v_shift_end THEN
                       v_early_minutes := EXTRACT(EPOCH FROM (v_shift_end - att_record.clock_out)) / 60;
                   ELSE
                       v_early_minutes := 0;
                   END IF;
                   
                   -- Calculate Overtime (Total Hours > Shift Duration)
                   v_shift_duration := v_shift_end - v_shift_start;
                   v_shift_hours := EXTRACT(EPOCH FROM v_shift_duration) / 3600;
                   
                   IF v_total_hours > v_shift_hours THEN
                       v_overtime_hours := v_total_hours - v_shift_hours;
                   ELSE
                       v_overtime_hours := 0;
                   END IF;

                   -- Update Record with accurate calculations
                   UPDATE attendance_records SET 
                       total_hours = ROUND(v_total_hours, 2),
                       shift_id = shift_record.id,
                       late_minutes = ROUND(v_late_minutes),
                       early_departure_minutes = ROUND(v_early_minutes),
                       overtime_hours = ROUND(v_overtime_hours, 2),
                       status = CASE 
                           WHEN v_late_minutes > 0 THEN 'late' 
                           WHEN v_early_minutes > 0 THEN 'early_departure'
                           ELSE 'present' 
                       END
                   WHERE id = att_record.id;
                ELSE
                    -- No shift assigned, just update total hours
                    UPDATE attendance_records SET 
                       total_hours = ROUND(v_total_hours, 2)
                    WHERE id = att_record.id;
                END IF;
            END IF;

            -- Mark Log as Processed
            UPDATE attendance_logs SET is_processed = true WHERE id = log_record.id;
            
        ELSE
            -- Employee not found
            RAISE NOTICE 'Employee not found for code: %', log_record.employee_code;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. Automation (Run every 5 minutes)
-- =====================================================

SELECT cron.schedule(
    'process_attendance_logs_job',
    '*/5 * * * *',
    'SELECT process_attendance_logs()'
);
