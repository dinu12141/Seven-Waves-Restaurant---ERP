-- =====================================================================
-- Fix: SECURITY DEFINER views flagged by Supabase database linter
-- =====================================================================
-- v_supplier_aging, v_purchase_order_summary, v_supplier_balances, and
-- v_ap_ledger_detail (supabase/procurement.sql) were created without an
-- explicit security_invoker setting. Postgres views default to definer-style
-- behavior (security_invoker = false) unless set otherwise, which means
-- these views run with the view OWNER's permissions/RLS bypass rather than
-- the querying user's — exactly what the linter's "Security Definer View"
-- check flags as ERROR-level.
--
-- None of these views need definer privileges: they are plain aggregations
-- over ap_ledger / ap_invoices / purchase_orders / suppliers, all of which
-- already have their own company-scoped RLS policies. Setting
-- security_invoker = true makes each view enforce the querying user's own
-- RLS instead of the creator's, closing the gap with no functional loss.
--
-- Idempotent: CREATE OR REPLACE VIEW is safe to re-run.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_supplier_balances
WITH (security_invoker = true) AS
SELECT
    al.company_id,
    al.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    COALESCE(SUM(al.credit), 0) AS total_invoiced,
    COALESCE(SUM(al.debit), 0) AS total_paid,
    COALESCE(SUM(al.credit), 0) - COALESCE(SUM(al.debit), 0) AS outstanding_balance
FROM ap_ledger al
JOIN suppliers s ON s.id = al.supplier_id
GROUP BY al.company_id, al.supplier_id, s.code, s.name;

CREATE OR REPLACE VIEW public.v_supplier_aging
WITH (security_invoker = true) AS
SELECT
    i.company_id,
    i.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) <= 30 THEN i.balance_due ELSE 0 END), 0) AS current_0_30,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END), 0) AS days_31_60,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END), 0) AS days_61_90,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) BETWEEN 91 AND 120 THEN i.balance_due ELSE 0 END), 0) AS days_91_120,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 AND (CURRENT_DATE - i.due_date) > 120 THEN i.balance_due ELSE 0 END), 0) AS over_120,
    COALESCE(SUM(CASE WHEN i.balance_due > 0 THEN i.balance_due ELSE 0 END), 0) AS total_outstanding
FROM ap_invoices i
JOIN suppliers s ON s.id = i.supplier_id
WHERE i.status IN ('posted','partial_paid')
GROUP BY i.company_id, i.supplier_id, s.code, s.name;

CREATE OR REPLACE VIEW public.v_purchase_order_summary
WITH (security_invoker = true) AS
SELECT
    po.id,
    po.company_id,
    po.branch_id,
    po.doc_number,
    po.doc_date,
    po.status,
    s.name AS supplier_name,
    po.total_amount,
    COALESCE(SUM(pol.received_qty * pol.unit_price), 0) AS received_value,
    COALESCE(SUM(pol.invoiced_qty * pol.unit_price), 0) AS invoiced_value,
    COALESCE(SUM(pol.open_qty * pol.unit_price), 0) AS open_value
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
GROUP BY po.id, po.company_id, po.branch_id, po.doc_number,
         po.doc_date, po.status, s.name, po.total_amount;

CREATE OR REPLACE VIEW public.v_ap_ledger_detail
WITH (security_invoker = true) AS
SELECT
    al.id,
    al.company_id,
    al.branch_id,
    al.supplier_id,
    s.code AS supplier_code,
    s.name AS supplier_name,
    al.entry_type,
    al.doc_number,
    al.doc_date,
    al.due_date,
    al.debit,
    al.credit,
    al.description,
    p.full_name AS posted_by_name,
    al.posted_at
FROM ap_ledger al
JOIN suppliers s ON s.id = al.supplier_id
LEFT JOIN profiles p ON p.id = al.posted_by;
