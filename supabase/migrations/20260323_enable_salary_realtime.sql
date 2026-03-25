-- ═══════════════════════════════════════════════════════════════════
-- Enable Supabase Realtime for salary/payroll related tables
-- This is required for postgres_changes subscriptions to work
-- ═══════════════════════════════════════════════════════════════════

-- Set REPLICA IDENTITY FULL so realtime sends complete row data
ALTER TABLE IF EXISTS salary_structures REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS employee_allowances REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS salary_allowance_types REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS salary_deductions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS salary_additions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS payroll_cycles REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS payroll_records REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS payroll_line_items REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS payroll_payments REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication
-- (This is what actually enables realtime events)
DO $$
BEGIN
  -- salary_structures
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salary_structures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salary_structures;
  END IF;

  -- employee_allowances
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'employee_allowances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE employee_allowances;
  END IF;

  -- salary_allowance_types
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salary_allowance_types'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salary_allowance_types;
  END IF;

  -- salary_deductions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salary_deductions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salary_deductions;
  END IF;

  -- salary_additions
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'salary_additions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salary_additions;
  END IF;

  -- payroll_cycles
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payroll_cycles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_cycles;
  END IF;

  -- payroll_records
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payroll_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_records;
  END IF;

  -- payroll_line_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payroll_line_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_line_items;
  END IF;

  -- payroll_payments
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'payroll_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_payments;
  END IF;
END$$;
