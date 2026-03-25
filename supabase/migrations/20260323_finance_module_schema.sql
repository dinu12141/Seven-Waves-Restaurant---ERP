-- ============================================================================
-- SEVEN WAVES ERP — Finance Module Schema
-- Migration: 20260323_finance_module_schema
-- Description: Complete finance department data model
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. CHART OF ACCOUNTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  account_type  text NOT NULL CHECK (account_type IN ('Asset','Liability','Equity','Revenue','Expense')),
  parent_id     uuid REFERENCES chart_of_accounts(id),
  is_active     boolean NOT NULL DEFAULT true,
  description   text,
  branch_id     uuid REFERENCES branches(id),
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coa_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_id);
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. FISCAL PERIODS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_periods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        int NOT NULL,
  month       int NOT NULL CHECK (month BETWEEN 1 AND 12),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','locked')),
  closed_by   uuid REFERENCES profiles(id),
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. BANK / CASH ACCOUNTS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  account_type    text NOT NULL CHECK (account_type IN ('bank','cash','petty_cash')),
  account_number  text,
  bank_name       text,
  currency        text NOT NULL DEFAULT 'LKR',
  opening_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  gl_account_id   uuid REFERENCES chart_of_accounts(id),
  branch_id       uuid REFERENCES branches(id),
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. CASH TRANSACTIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id),
  txn_type        text NOT NULL CHECK (txn_type IN ('deposit','withdrawal','transfer_in','transfer_out')),
  amount          numeric NOT NULL CHECK (amount > 0),
  reference       text,
  description     text,
  counterparty    text,
  txn_date        date NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id uuid REFERENCES journal_entries(id),
  branch_id       uuid REFERENCES branches(id),
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_txn_account ON cash_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_cash_txn_date ON cash_transactions(txn_date);
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. CUSTOMER RECEIVABLES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_receivables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  invoice_id  uuid REFERENCES invoices(id),
  order_id    uuid REFERENCES orders(id),
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount  numeric NOT NULL DEFAULT 0,
  balance      numeric GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  due_date     date,
  status       text NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding','partial','paid','overdue','written_off')),
  branch_id    uuid REFERENCES branches(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recv_customer ON customer_receivables(customer_id);
CREATE INDEX IF NOT EXISTS idx_recv_status ON customer_receivables(status);
ALTER TABLE customer_receivables ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. EXPENSE CATEGORIES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  gl_account_id uuid REFERENCES chart_of_accounts(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. EXPENSE ENTRIES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL REFERENCES expense_categories(id),
  amount          numeric NOT NULL CHECK (amount > 0),
  expense_date    date NOT NULL DEFAULT CURRENT_DATE,
  description     text,
  reference       text,
  payment_method  text,
  branch_id       uuid REFERENCES branches(id),
  department_id   uuid REFERENCES departments(id),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','posted')),
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  journal_entry_id uuid REFERENCES journal_entries(id),
  is_recurring    boolean NOT NULL DEFAULT false,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_date ON expense_entries(expense_date);
CREATE INDEX IF NOT EXISTS idx_expense_category ON expense_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_branch ON expense_entries(branch_id);
ALTER TABLE expense_entries ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. TAX CODES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  rate          numeric NOT NULL CHECK (rate >= 0 AND rate <= 100),
  tax_type      text NOT NULL CHECK (tax_type IN ('output','input','exempt')),
  gl_account_id uuid REFERENCES chart_of_accounts(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tax_codes ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. TAX TRANSACTIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_code_id   uuid NOT NULL REFERENCES tax_codes(id),
  base_amount   numeric NOT NULL,
  tax_amount    numeric NOT NULL,
  document_ref  text,
  document_type text,
  document_id   uuid,
  direction     text NOT NULL CHECK (direction IN ('collected','paid')),
  txn_date      date NOT NULL DEFAULT CURRENT_DATE,
  branch_id     uuid REFERENCES branches(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_txn_code ON tax_transactions(tax_code_id);
CREATE INDEX IF NOT EXISTS idx_tax_txn_date ON tax_transactions(txn_date);
ALTER TABLE tax_transactions ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. FINANCE DOCUMENTS (Unified document references)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type      text NOT NULL CHECK (doc_type IN ('journal','invoice','payment','expense','payroll','tax','receipt','credit_note')),
  doc_number    text NOT NULL,
  reference_id  uuid,
  amount        numeric NOT NULL DEFAULT 0,
  doc_date      date NOT NULL DEFAULT CURRENT_DATE,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled','reversed')),
  description   text,
  branch_id     uuid REFERENCES branches(id),
  created_by    uuid REFERENCES profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_doc_type ON finance_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_fin_doc_date ON finance_documents(doc_date);
ALTER TABLE finance_documents ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. PAYMENT ALLOCATIONS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_allocations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid NOT NULL REFERENCES payments(id),
  invoice_id       uuid NOT NULL REFERENCES invoices(id),
  allocated_amount numeric NOT NULL CHECK (allocated_amount > 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. PAYROLL CYCLES
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_name    text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','confirmed','posted','cancelled')),
  total_gross   numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  total_net     numeric NOT NULL DEFAULT 0,
  total_employees int NOT NULL DEFAULT 0,
  processed_by  uuid REFERENCES profiles(id),
  processed_at  timestamptz,
  posted_by     uuid REFERENCES profiles(id),
  posted_at     timestamptz,
  journal_entry_id uuid REFERENCES journal_entries(id),
  branch_id     uuid REFERENCES branches(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_cycle_period ON payroll_cycles(period_start, period_end);
ALTER TABLE payroll_cycles ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. PAYROLL RECORDS (per employee per cycle)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id        uuid NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id),
  basic_salary    numeric NOT NULL DEFAULT 0,
  total_allowances numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  overtime_amount  numeric NOT NULL DEFAULT 0,
  commission       numeric NOT NULL DEFAULT 0,
  gross_salary     numeric NOT NULL DEFAULT 0,
  net_salary       numeric NOT NULL DEFAULT 0,
  payment_status   text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','held')),
  payment_date     date,
  payment_method   text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_rec_cycle ON payroll_records(cycle_id);
CREATE INDEX IF NOT EXISTS idx_payroll_rec_employee ON payroll_records(employee_id);
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. PAYROLL LINE ITEMS (allowance / deduction breakdown)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id   uuid NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  line_type   text NOT NULL CHECK (line_type IN ('allowance','deduction','overtime','commission','bonus')),
  description text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_line_record ON payroll_line_items(record_id);
ALTER TABLE payroll_line_items ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. FINANCE AUDIT LOGS
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  old_values      jsonb,
  new_values      jsonb,
  description     text,
  ip_address      text,
  user_id         uuid REFERENCES profiles(id),
  branch_id       uuid REFERENCES branches(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_entity ON finance_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_user ON finance_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_date ON finance_audit_logs(created_at);
ALTER TABLE finance_audit_logs ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ════════════════════════════════════════════════════════════════════════════

-- Account balances from journal lines
-- Uses account_code to link journal_lines → chart_of_accounts
CREATE OR REPLACE VIEW v_account_balances AS
SELECT
  coa.id AS account_id,
  coa.code,
  coa.name,
  coa.account_type,
  COALESCE(SUM(jl.dr_amount), 0) AS total_debit,
  COALESCE(SUM(jl.cr_amount), 0) AS total_credit,
  CASE
    WHEN coa.account_type IN ('Asset','Expense')
      THEN COALESCE(SUM(jl.dr_amount), 0) - COALESCE(SUM(jl.cr_amount), 0)
    ELSE COALESCE(SUM(jl.cr_amount), 0) - COALESCE(SUM(jl.dr_amount), 0)
  END AS balance
FROM chart_of_accounts coa
LEFT JOIN journal_lines jl ON jl.account_code = coa.code
LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.is_reversed = false
WHERE coa.is_active = true
GROUP BY coa.id, coa.code, coa.name, coa.account_type;

-- Trial balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  coa.code,
  coa.name,
  coa.account_type,
  COALESCE(SUM(jl.dr_amount), 0) AS debit_total,
  COALESCE(SUM(jl.cr_amount), 0) AS credit_total
FROM chart_of_accounts coa
LEFT JOIN journal_lines jl ON jl.account_code = coa.code
LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.is_reversed = false
WHERE coa.is_active = true
GROUP BY coa.code, coa.name, coa.account_type
HAVING COALESCE(SUM(jl.dr_amount), 0) != 0 OR COALESCE(SUM(jl.cr_amount), 0) != 0
ORDER BY coa.code;

-- Receivable aging
CREATE OR REPLACE VIEW v_receivable_aging AS
SELECT
  cr.id,
  cr.customer_id,
  c.name AS customer_name,
  cr.invoice_id,
  cr.total_amount,
  cr.paid_amount,
  cr.balance,
  cr.due_date,
  cr.status,
  CASE
    WHEN cr.due_date >= CURRENT_DATE THEN 'current'
    WHEN cr.due_date >= CURRENT_DATE - 30 THEN '1-30 days'
    WHEN cr.due_date >= CURRENT_DATE - 60 THEN '31-60 days'
    WHEN cr.due_date >= CURRENT_DATE - 90 THEN '61-90 days'
    ELSE '90+ days'
  END AS aging_bucket
FROM customer_receivables cr
LEFT JOIN customers c ON c.id = cr.customer_id
WHERE cr.status NOT IN ('paid','written_off');

-- Payable aging (from procurement AP)
CREATE OR REPLACE VIEW v_payable_aging AS
SELECT
  al.id,
  al.supplier_id,
  s.name AS supplier_name,
  al.entry_type,
  al.doc_number,
  al.debit,
  al.credit,
  al.doc_date,
  al.due_date,
  CASE
    WHEN al.due_date IS NULL OR al.due_date >= CURRENT_DATE THEN 'current'
    WHEN al.due_date >= CURRENT_DATE - 30 THEN '1-30 days'
    WHEN al.due_date >= CURRENT_DATE - 60 THEN '31-60 days'
    WHEN al.due_date >= CURRENT_DATE - 90 THEN '61-90 days'
    ELSE '90+ days'
  END AS aging_bucket
FROM ap_ledger al
LEFT JOIN suppliers s ON s.id = al.supplier_id;

-- ════════════════════════════════════════════════════════════════════════════
-- NOTE: journal_lines already uses account_code/account_name text columns.
-- Views above join on account_code → chart_of_accounts.code.
-- journal_entries uses is_reversed boolean (no separate status column).
-- No schema modifications needed for these existing tables.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- Chart of Accounts — Standard Restaurant Accounts
INSERT INTO chart_of_accounts (code, name, account_type, description) VALUES
  -- Assets
  ('1000', 'Cash on Hand',            'Asset',     'Physical cash in registers and safes'),
  ('1010', 'Bank Account - Main',     'Asset',     'Primary bank account'),
  ('1020', 'Petty Cash',              'Asset',     'Small cash fund for minor expenses'),
  ('1100', 'Accounts Receivable',     'Asset',     'Amounts owed by customers'),
  ('1200', 'Inventory',               'Asset',     'Food and beverage stock'),
  ('1300', 'Prepaid Expenses',        'Asset',     'Expenses paid in advance'),
  ('1500', 'Fixed Assets',            'Asset',     'Equipment, furniture, fixtures'),
  ('1510', 'Accumulated Depreciation','Asset',     'Depreciation of fixed assets'),
  -- Liabilities
  ('2000', 'Accounts Payable',        'Liability', 'Amounts owed to suppliers'),
  ('2100', 'Accrued Expenses',        'Liability', 'Expenses incurred but not yet paid'),
  ('2200', 'Salaries Payable',        'Liability', 'Unpaid employee salaries'),
  ('2300', 'Tax Payable - VAT',       'Liability', 'Value added tax collected'),
  ('2310', 'Tax Payable - Service',   'Liability', 'Service tax payable'),
  ('2400', 'Unearned Revenue',        'Liability', 'Advance payments from customers'),
  -- Equity
  ('3000', 'Owner Equity',            'Equity',    'Owner capital investment'),
  ('3100', 'Retained Earnings',       'Equity',    'Accumulated profits'),
  -- Revenue
  ('4000', 'Sales Revenue - Dine In', 'Revenue',   'Revenue from dine-in orders'),
  ('4010', 'Sales Revenue - Takeaway','Revenue',   'Revenue from takeaway orders'),
  ('4020', 'Sales Revenue - Delivery','Revenue',   'Revenue from delivery orders'),
  ('4100', 'Service Charge Revenue',  'Revenue',   'Service charges collected'),
  ('4200', 'Tips Revenue',            'Revenue',   'Tips received'),
  ('4300', 'Other Income',            'Revenue',   'Miscellaneous income'),
  -- Expenses
  ('5000', 'Cost of Goods Sold',      'Expense',   'Direct food and beverage costs'),
  ('5100', 'Salary Expense',          'Expense',   'Employee salaries and wages'),
  ('5110', 'Overtime Expense',        'Expense',   'Overtime wages'),
  ('5120', 'Employee Benefits',       'Expense',   'Insurance, meals, etc.'),
  ('5200', 'Rent Expense',            'Expense',   'Monthly rent payments'),
  ('5300', 'Utilities Expense',       'Expense',   'Electricity, water, gas'),
  ('5400', 'Marketing Expense',       'Expense',   'Advertising and promotions'),
  ('5500', 'Maintenance Expense',     'Expense',   'Repairs and maintenance'),
  ('5600', 'Depreciation Expense',    'Expense',   'Monthly depreciation charge'),
  ('5700', 'Insurance Expense',       'Expense',   'Business insurance premiums'),
  ('5800', 'Miscellaneous Expense',   'Expense',   'Other operating expenses')
ON CONFLICT (code) DO NOTHING;

-- Default expense categories
INSERT INTO expense_categories (name) VALUES
  ('Rent'),
  ('Utilities'),
  ('Salaries & Wages'),
  ('Food Supplies'),
  ('Beverage Supplies'),
  ('Cleaning & Hygiene'),
  ('Equipment & Maintenance'),
  ('Marketing & Advertising'),
  ('Insurance'),
  ('Transportation'),
  ('License & Permits'),
  ('Miscellaneous')
ON CONFLICT (name) DO NOTHING;

-- Default tax codes
INSERT INTO tax_codes (code, name, rate, tax_type) VALUES
  ('VAT-OUT', 'VAT Output (Sales)', 15, 'output'),
  ('VAT-IN',  'VAT Input (Purchases)', 15, 'input'),
  ('SVC-TAX', 'Service Tax', 10, 'output'),
  ('EXEMPT',  'Tax Exempt', 0, 'exempt')
ON CONFLICT (code) DO NOTHING;

-- Default fiscal periods for current year
INSERT INTO fiscal_periods (year, month, start_date, end_date, status)
SELECT
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  m,
  make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, m, 1),
  (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, m, 1) + INTERVAL '1 month - 1 day')::date,
  CASE WHEN m <= EXTRACT(MONTH FROM CURRENT_DATE) THEN 'open' ELSE 'open' END
FROM generate_series(1, 12) AS m
ON CONFLICT (year, month) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES — Service role bypass + authenticated users read
-- ════════════════════════════════════════════════════════════════════════════
-- Note: CREATE POLICY IF NOT EXISTS requires PG ≥ 15. Using DO block with exception handling.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'chart_of_accounts','fiscal_periods','bank_accounts','cash_transactions',
    'customer_receivables','expense_categories','expense_entries',
    'tax_codes','tax_transactions','finance_documents','payment_allocations',
    'payroll_cycles','payroll_records','payroll_line_items','finance_audit_logs'
  ])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'');',
        'fin_' || tbl || '_auth', tbl
      );
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- policy already exists
    END;
  END LOOP;
END
$$;
