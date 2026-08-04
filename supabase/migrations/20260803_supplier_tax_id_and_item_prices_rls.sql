-- =====================================================================
-- Migration: 20260803_supplier_tax_id_and_item_prices_rls.sql
-- Purpose:
--   1. Sub-task A (bug fix support): suppliers.tax_id already exists in
--      schema and is already read/written by procurementService.ts
--      (listSuppliers SELECT + upsertSupplier payload both include it).
--      No column change needed. This migration instead makes sure RLS
--      does not silently block INSERT/UPDATE on `suppliers` (no explicit
--      policy exists anywhere in the current SQL history for this table
--      as of this migration — confirmed by repo-wide search). If RLS is
--      enabled on `suppliers` with zero policies, ALL writes fail closed,
--      which would explain "tax_id doesn't save" (in fact nothing saves,
--      but the symptom the user notices first is the tax field wiping
--      out because a subsequent read-back looks unaffected by their edit
--      until they realize the whole row didn't persist).
--   2. Sub-task B: `supplier_item_prices` already exists as a table
--      (procurement.sql) with ZERO RLS policies applied anywhere in SQL
--      history. This migration adds company-scoped RLS so the new
--      "Items Supplied" UI can read/write it safely.
--
-- Idempotent: safe to re-run.
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. SUPPLIERS — ensure RLS is enabled with correct company-scoped
--    policies (defensive: create if missing, replace if too permissive)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sup_admin       ON public.suppliers;
DROP POLICY IF EXISTS sup_write       ON public.suppliers;
DROP POLICY IF EXISTS sup_read        ON public.suppliers;
DROP POLICY IF EXISTS suppliers_admin ON public.suppliers;
DROP POLICY IF EXISTS suppliers_all   ON public.suppliers;

-- Admin: full access
CREATE POLICY sup_admin ON public.suppliers FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Manager / Inventory / Procurement roles: full access, scoped to own company
CREATE POLICY sup_write ON public.suppliers FOR ALL
  USING (
    (is_manager() OR is_inventory() OR auth_has_role('procurement'))
    AND company_id = public.get_user_company_id()
  )
  WITH CHECK (
    (is_manager() OR is_inventory() OR auth_has_role('procurement'))
    AND company_id = public.get_user_company_id()
  );

-- Any authenticated staff in the same company can read supplier master data
-- (needed for PO/GRN/AP screens that just need supplier name/terms, read-only)
CREATE POLICY sup_read ON public.suppliers FOR SELECT
  USING (company_id = public.get_user_company_id());


-- ─────────────────────────────────────────────────────────────────────
-- 2. SUPPLIER_ITEM_PRICES — add company-scoped RLS (none existed)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.supplier_item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sip_admin ON public.supplier_item_prices;
DROP POLICY IF EXISTS sip_write ON public.supplier_item_prices;
DROP POLICY IF EXISTS sip_read  ON public.supplier_item_prices;

CREATE POLICY sip_admin ON public.supplier_item_prices FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY sip_write ON public.supplier_item_prices FOR ALL
  USING (
    (is_manager() OR is_inventory() OR auth_has_role('procurement'))
    AND company_id = public.get_user_company_id()
  )
  WITH CHECK (
    (is_manager() OR is_inventory() OR auth_has_role('procurement'))
    AND company_id = public.get_user_company_id()
  );

CREATE POLICY sip_read ON public.supplier_item_prices FOR SELECT
  USING (company_id = public.get_user_company_id());
