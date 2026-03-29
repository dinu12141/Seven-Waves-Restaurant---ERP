-- Add bank columns to suppliers and customers
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_branch text,
ADD COLUMN IF NOT EXISTS bank_account_name text,
ADD COLUMN IF NOT EXISTS bank_account_number text;

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS bank_name text,
ADD COLUMN IF NOT EXISTS bank_branch text,
ADD COLUMN IF NOT EXISTS bank_account_name text,
ADD COLUMN IF NOT EXISTS bank_account_number text;

-- Drop and recreate views to include bank columns
DROP VIEW IF EXISTS v_payable_aging;
CREATE OR REPLACE VIEW v_payable_aging AS
SELECT
  al.id,
  al.supplier_id,
  s.name AS supplier_name,
  s.bank_name,
  s.bank_account_number,
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

DROP VIEW IF EXISTS v_receivable_aging;
CREATE OR REPLACE VIEW v_receivable_aging AS
SELECT
  cr.id,
  cr.customer_id,
  c.name AS customer_name,
  c.bank_name,
  c.bank_account_number,
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

-- Enable realtime for AP/AR tables
ALTER TABLE public.ap_ledger REPLICA IDENTITY FULL;
ALTER TABLE public.customer_receivables REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Add tables to supabase_realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ap_ledger'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ap_ledger;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customer_receivables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_receivables;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'suppliers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
  END IF;
END $$;

