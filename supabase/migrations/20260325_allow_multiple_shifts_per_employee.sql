-- ════════════════════════════════════════════════════════════════
-- Allow Multiple Shifts Per Employee Per Day
-- ────────────────────────────────────────────────────────────────
-- Previously: UNIQUE (employee_id, assignment_date)
--   → Only ONE shift per day per employee
--
-- Now: UNIQUE (employee_id, shift_id, assignment_date)
--   → Multiple DIFFERENT shifts per day per employeenp
-- ════════════════════════════════════════════════════════════════

-- Drop old constraint
ALTER TABLE shift_assignments 
  DROP CONSTRAINT IF EXISTS shift_assignments_employee_id_assignment_date_key;

-- Add new constraint: employee + shift + date must be unique
ALTER TABLE shift_assignments 
  ADD CONSTRAINT shift_assignments_employee_shift_date_key 
  UNIQUE (employee_id, shift_id, assignment_date);
