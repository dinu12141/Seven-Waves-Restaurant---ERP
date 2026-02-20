-- =====================================================
-- LEAVE MANAGEMENT MODULE
-- =====================================================

-- 1. Updates to existing tables
-- Allow 'unpaid_leave' in attendance_records status
ALTER TABLE attendance_records 
DROP CONSTRAINT IF EXISTS chk_attendance_status;

ALTER TABLE attendance_records
ADD CONSTRAINT chk_attendance_status 
CHECK (status IN ('present', 'absent', 'half_day', 'late', 'on_leave', 'unpaid_leave', 'holiday', 'rest_day'));

-- 2. Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    year INT NOT NULL,
    total_entitlement NUMERIC(5,1) DEFAULT 0, -- Quota + Carry Forward
    used_days NUMERIC(5,1) DEFAULT 0,
    remaining_days NUMERIC(5,1) GENERATED ALWAYS AS (total_entitlement - used_days) STORED,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(employee_id, leave_type_id, year)
);

CREATE TRIGGER trg_leave_balances_updated
BEFORE UPDATE ON leave_balances
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Function to Initialize Balances for a Year
CREATE OR REPLACE FUNCTION initialize_leave_balances(p_year INT, p_employee_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    v_emp RECORD;
    v_type RECORD;
BEGIN
    -- Loop through active employees (or specific one)
    FOR v_emp IN 
        SELECT * FROM employees 
        WHERE is_active = true 
        AND (p_employee_id IS NULL OR id = p_employee_id)
    LOOP
        -- Loop through leave types
        FOR v_type IN SELECT * FROM leave_types WHERE company_id = v_emp.company_id AND is_active = true
        LOOP
            INSERT INTO leave_balances (
                company_id, employee_id, leave_type_id, year, total_entitlement, used_days
            ) VALUES (
                v_emp.company_id, v_emp.id, v_type.id, p_year, v_type.annual_quota, 0
            )
            ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
            -- Note: Carry forward logic would be complex (fetching previous year), omitting for MVP
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Approve Leave Request Function
CREATE OR REPLACE FUNCTION approve_leave_request(
    p_request_id UUID,
    p_approved_by UUID
) RETURNS VOID AS $$
DECLARE
    v_req RECORD;
    v_type RECORD;
    v_balance RECORD;
    v_current_year INT;
    v_date DATE;
    v_status TEXT;
BEGIN
    -- Get Request
    SELECT * INTO v_req FROM leave_requests WHERE id = p_request_id;
    
    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'Request is already %', v_req.status;
    END IF;

    v_current_year := EXTRACT(YEAR FROM v_req.start_date);

    -- Get Leave Type
    SELECT * INTO v_type FROM leave_types WHERE id = v_req.leave_type_id;

    -- Check Balance (if enabled/tracking)
    -- We try to find a balance record. If not found, we might auto-init or just proceed if strict checking isn't required.
    -- For MVP, let's enforce balance check if it exists.
    SELECT * INTO v_balance FROM leave_balances 
    WHERE employee_id = v_req.employee_id 
    AND leave_type_id = v_req.leave_type_id 
    AND year = v_current_year;

    IF v_balance.id IS NOT NULL AND v_balance.remaining_days < v_req.total_days THEN
        RAISE EXCEPTION 'Insufficient leave balance. Remaining: %, Requested: %', v_balance.remaining_days, v_req.total_days;
    END IF;

    -- Update Request Status
    UPDATE leave_requests 
    SET status = 'approved', approved_by = p_approved_by, approved_at = now()
    WHERE id = p_request_id;

    -- Deduct Balance
    IF v_balance.id IS NOT NULL THEN
        UPDATE leave_balances 
        SET used_days = used_days + v_req.total_days
        WHERE id = v_balance.id;
    ELSE
        -- Optionally create balance record on the fly
        INSERT INTO leave_balances (company_id, employee_id, leave_type_id, year, total_entitlement, used_days)
        VALUES (v_req.company_id, v_req.employee_id, v_req.leave_type_id, v_current_year, v_type.annual_quota, v_req.total_days);
    END IF;

    -- Apply to Attendance Records
    -- Determine status
    IF v_type.is_paid THEN
        v_status := 'on_leave';
    ELSE
        v_status := 'unpaid_leave';
    END IF;

    v_date := v_req.start_date;
    WHILE v_date <= v_req.end_date LOOP
        -- Insert or Update Attendance Record
        -- We overwrite whatever is there (even if they punched in? Maybe not if they worked half day? 
        -- For simplicity, leave overrides absent/missing. If present, maybe raise warning? 
        -- Overwriting is standard for full day leave).
        INSERT INTO attendance_records (
            company_id, branch_id, employee_id, attendance_date, status
        ) VALUES (
            v_req.company_id, v_req.branch_id, v_req.employee_id, v_date, v_status
        )
        ON CONFLICT (employee_id, attendance_date) 
        DO UPDATE SET status = v_status, updated_at = now();
        
        v_date := v_date + 1;
    END LOOP;

END;
$$ LANGUAGE plpgsql;
