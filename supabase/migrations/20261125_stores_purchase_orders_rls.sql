-- ═══════════════════════════════════════════════════════════════════════════════
-- Stores & Inventory Purchase Orders RLS Policy Hardening
-- Seven Waves Restaurant (Pvt) Ltd
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Ensure 'stores' and 'inventory' roles can insert and update purchase_orders for their branch
DROP POLICY IF EXISTS po_stores_create ON public.purchase_orders;
DROP POLICY IF EXISTS po_stores_update ON public.purchase_orders;

CREATE POLICY po_stores_create ON public.purchase_orders FOR INSERT
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  );

CREATE POLICY po_stores_update ON public.purchase_orders FOR UPDATE
  USING (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  )
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND branch_id = ANY(auth_branch_ids())
  );

-- 2. Ensure line items can be inserted and updated for branch-accessible POs
DROP POLICY IF EXISTS pol_stores_create ON public.purchase_order_lines;
DROP POLICY IF EXISTS pol_stores_update ON public.purchase_order_lines;

CREATE POLICY pol_stores_create ON public.purchase_order_lines FOR INSERT
  WITH CHECK (
    (auth_has_role('stores') OR auth_has_role('inventory') OR auth_has_role('procurement'))
    AND EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_lines.po_id
      AND po.branch_id = ANY(auth_branch_ids())
    )
  );

CREATE POLICY pol_stores_update ON public.purchase_order_lines FOR UPDATE
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

COMMIT;
