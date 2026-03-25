-- ============================================================================
-- SEVEN WAVES ERP — Finance Phase 3: Enterprise Payroll Enhancement
-- Migration: 20260323_finance_phase3_payroll
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PAYROLL PAYMENTS — individual salary disbursement records
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
  record_id       uuid NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id),
  amount          numeric NOT NULL CHECK (amount > 0),
  payment_method  text NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('bank_transfer','cash','cheque','mobile_wallet')),
  bank_reference  text,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','reversed')),
  notes           text,
  processed_by    uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_pay_cycle ON payroll_payments(cycle_id);
CREATE INDEX IF NOT EXISTS idx_payroll_pay_record ON payroll_payments(record_id);
CREATE INDEX IF NOT EXISTS idx_payroll_pay_employee ON payroll_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_pay_date ON payroll_payments(payment_date);
ALTER TABLE payroll_payments ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Add payment tracking columns to payroll_records
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS payment_batch_id uuid;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PAYROLL SUMMARY VIEW — for journal posting & management
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_payroll_summary AS
SELECT
  pc.id AS cycle_id,
  pc.cycle_name,
  pc.period_start,
  pc.period_end,
  pc.status,
  pc.total_gross,
  pc.total_deductions,
  pc.total_net,
  pc.total_employees,
  pc.journal_entry_id,
  pc.posted_at,
  COUNT(CASE WHEN pr.payment_status = 'paid' THEN 1 END) AS paid_count,
  COUNT(CASE WHEN pr.payment_status = 'pending' THEN 1 END) AS pending_count,
  SUM(CASE WHEN pr.payment_status = 'paid' THEN pr.net_salary ELSE 0 END) AS total_paid,
  SUM(CASE WHEN pr.payment_status = 'pending' THEN pr.net_salary ELSE 0 END) AS total_unpaid
FROM payroll_cycles pc
LEFT JOIN payroll_records pr ON pr.cycle_id = pc.id
GROUP BY pc.id, pc.cycle_name, pc.period_start, pc.period_end, pc.status,
         pc.total_gross, pc.total_deductions, pc.total_net, pc.total_employees,
         pc.journal_entry_id, pc.posted_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS for payroll_payments
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    CREATE POLICY fin_payroll_payments_auth ON payroll_payments
      FOR ALL USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
