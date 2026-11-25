-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores & Procurement Purchase Orders RLS + Doc Sequence Security Fix
-- Seven Waves Restaurant (Pvt) Ltd
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Allow supplier_id to be optional for internal store POs when needed
ALTER TABLE public.purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;

-- 2. Ensure 'stores', 'inventory', and 'procurement' roles can SELECT, INSERT, and UPDATE
--    purchase_orders in their assigned branch(es)
DROP POLICY IF EXISTS po_stores_select ON public.purchase_orders;
DROP POLICY IF EXISTS po_stores_create ON public.purchase_orders;
DROP POLICY IF EXISTS po_stores_update ON public.purchase_orders;

CREATE POLICY po_stores_select ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  );

CREATE POLICY po_stores_create ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  );

CREATE POLICY po_stores_update ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  )
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  );

-- 3. Ensure line items can be selected, inserted, and updated for branch-accessible POs
DROP POLICY IF EXISTS pol_stores_select ON public.purchase_order_lines;
DROP POLICY IF EXISTS pol_stores_create ON public.purchase_order_lines;
DROP POLICY IF EXISTS pol_stores_update ON public.purchase_order_lines;

CREATE POLICY pol_stores_select ON public.purchase_order_lines FOR SELECT
  TO authenticated
  USING (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_lines.po_id
        AND po.branch_id = ANY(auth_branch_ids())
    )
  );

CREATE POLICY pol_stores_create ON public.purchase_order_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_lines.po_id
        AND po.branch_id = ANY(auth_branch_ids())
    )
  );

CREATE POLICY pol_stores_update ON public.purchase_order_lines FOR UPDATE
  TO authenticated
  USING (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_lines.po_id
        AND po.branch_id = ANY(auth_branch_ids())
    )
  )
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_lines.po_id
        AND po.branch_id = ANY(auth_branch_ids())
    )
  );

-- 4. Fix generate_proc_doc_number failing with RLS 42501 on procurement_doc_sequences
--    for 'stores' and 'procurement' roles by running as SECURITY DEFINER with safe search_path
CREATE OR REPLACE FUNCTION public.generate_proc_doc_number(
    p_company_id UUID,
    p_branch_id UUID,
    p_doc_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefix TEXT;
    v_next BIGINT;
    v_year INT := EXTRACT(YEAR FROM now());
BEGIN
    IF auth.uid() IS NOT NULL AND NOT (
        is_admin() OR is_manager() OR is_inventory()
        OR auth_has_role('stores') OR auth_has_role('procurement') OR is_finance()
    ) THEN
        RAISE EXCEPTION 'Permission denied for procurement document sequence';
    END IF;

    UPDATE public.procurement_doc_sequences
    SET current_number = current_number + 1
    WHERE company_id = p_company_id
      AND branch_id = p_branch_id
      AND doc_type = p_doc_type
      AND fiscal_year = v_year
    RETURNING prefix, current_number INTO v_prefix, v_next;

    IF v_prefix IS NULL THEN
        INSERT INTO public.procurement_doc_sequences (company_id, branch_id, doc_type, prefix, current_number, fiscal_year)
        VALUES (p_company_id, p_branch_id, p_doc_type, p_doc_type || '-', 1, v_year)
        RETURNING prefix, current_number INTO v_prefix, v_next;
    END IF;

    RETURN v_prefix || v_year || '-' || LPAD(v_next::TEXT, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_proc_doc_number(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_proc_doc_number(UUID, UUID, TEXT) TO authenticated, service_role;

COMMIT;
