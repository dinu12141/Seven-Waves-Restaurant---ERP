-- ═══════════════════════════════════════════════════════════════════
-- Finance Phase 4: Report Views & Audit Enhancements
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ 1. Account Balances View (Balance Sheet source) ═══════
DROP VIEW IF EXISTS v_account_balances CASCADE;
CREATE VIEW v_account_balances AS
SELECT
  ca.code,
  ca.name,
  ca.account_type,
  COALESCE(SUM(jl.dr_amount), 0) AS total_debit,
  COALESCE(SUM(jl.cr_amount), 0) AS total_credit,
  CASE
    WHEN ca.account_type IN ('Asset', 'Expense')
      THEN COALESCE(SUM(jl.dr_amount), 0) - COALESCE(SUM(jl.cr_amount), 0)
    ELSE COALESCE(SUM(jl.cr_amount), 0) - COALESCE(SUM(jl.dr_amount), 0)
  END AS balance
FROM chart_of_accounts ca
LEFT JOIN journal_lines jl ON jl.account_code = ca.code
LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.is_reversed = false
GROUP BY ca.code, ca.name, ca.account_type
ORDER BY ca.code;

-- ═══════ 2. Trial Balance View ═══════
DROP VIEW IF EXISTS v_trial_balance CASCADE;
CREATE VIEW v_trial_balance AS
SELECT
  ca.code,
  ca.name,
  ca.account_type,
  COALESCE(SUM(jl.dr_amount), 0) AS debit_total,
  COALESCE(SUM(jl.cr_amount), 0) AS credit_total
FROM chart_of_accounts ca
LEFT JOIN journal_lines jl ON jl.account_code = ca.code
LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.is_reversed = false
GROUP BY ca.code, ca.name, ca.account_type
HAVING COALESCE(SUM(jl.dr_amount), 0) > 0 OR COALESCE(SUM(jl.cr_amount), 0) > 0
ORDER BY ca.code;

-- ═══════ 3. Receivable Aging View ═══════
DROP VIEW IF EXISTS v_receivable_aging CASCADE;
CREATE VIEW v_receivable_aging AS
SELECT
  cr.id,
  COALESCE(c.name, 'Walk-in Customer') AS customer_name,
  c.email AS customer_email,
  SUM(CASE WHEN NOW() - cr.due_date <= INTERVAL '0 days' THEN cr.balance ELSE 0 END) AS current_amount,
  SUM(CASE WHEN NOW() - cr.due_date > INTERVAL '0 days' AND NOW() - cr.due_date <= INTERVAL '30 days' THEN cr.balance ELSE 0 END) AS days_1_30,
  SUM(CASE WHEN NOW() - cr.due_date > INTERVAL '30 days' AND NOW() - cr.due_date <= INTERVAL '60 days' THEN cr.balance ELSE 0 END) AS days_31_60,
  SUM(CASE WHEN NOW() - cr.due_date > INTERVAL '60 days' AND NOW() - cr.due_date <= INTERVAL '90 days' THEN cr.balance ELSE 0 END) AS days_61_90,
  SUM(CASE WHEN NOW() - cr.due_date > INTERVAL '90 days' THEN cr.balance ELSE 0 END) AS days_over_90,
  SUM(cr.balance) AS total_outstanding
FROM customer_receivables cr
LEFT JOIN customers c ON c.id = cr.customer_id
WHERE cr.status IN ('outstanding', 'partial', 'overdue')
GROUP BY cr.id, c.name, c.email
ORDER BY total_outstanding DESC;

-- ═══════ 4. Payable Aging View ═══════
DROP VIEW IF EXISTS v_payable_aging CASCADE;
CREATE VIEW v_payable_aging AS
SELECT
  ap.id,
  COALESCE(s.name, 'Unknown Supplier') AS customer_name,
  s.email AS customer_email,
  SUM(CASE WHEN NOW() - ap.due_date <= INTERVAL '0 days' THEN (ap.total_amount - ap.paid_amount) ELSE 0 END) AS current_amount,
  SUM(CASE WHEN NOW() - ap.due_date > INTERVAL '0 days' AND NOW() - ap.due_date <= INTERVAL '30 days' THEN (ap.total_amount - ap.paid_amount) ELSE 0 END) AS days_1_30,
  SUM(CASE WHEN NOW() - ap.due_date > INTERVAL '30 days' AND NOW() - ap.due_date <= INTERVAL '60 days' THEN (ap.total_amount - ap.paid_amount) ELSE 0 END) AS days_31_60,
  SUM(CASE WHEN NOW() - ap.due_date > INTERVAL '60 days' AND NOW() - ap.due_date <= INTERVAL '90 days' THEN (ap.total_amount - ap.paid_amount) ELSE 0 END) AS days_61_90,
  SUM(CASE WHEN NOW() - ap.due_date > INTERVAL '90 days' THEN (ap.total_amount - ap.paid_amount) ELSE 0 END) AS days_over_90,
  SUM(ap.total_amount - ap.paid_amount) AS total_outstanding
FROM ap_invoices ap
LEFT JOIN suppliers s ON s.id = ap.supplier_id
WHERE ap.status IN ('approved', 'partial')
GROUP BY ap.id, s.name, s.email
ORDER BY total_outstanding DESC;

-- ═══════ 5. Ensure audit log table has proper indexes ═══════
CREATE INDEX IF NOT EXISTS idx_finance_audit_entity_type ON finance_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_finance_audit_created ON finance_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_audit_user ON finance_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_code);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(doc_date);
CREATE INDEX IF NOT EXISTS idx_expense_entries_date ON expense_entries(expense_date);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_txn_date ON cash_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_tax_txn_date ON tax_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_payroll_cycles_period ON payroll_cycles(period_start, period_end);

-- ═══════ 6. Enable Realtime for audit logs ═══════
ALTER TABLE IF EXISTS finance_audit_logs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'finance_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE finance_audit_logs;
  END IF;
END$$;
