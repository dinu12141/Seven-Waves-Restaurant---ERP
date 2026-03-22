-- ═══════════════════════════════════════════════════════════
-- Fix: Allow cashiers to INSERT/UPDATE order_items for POS orders
-- Problem: Only waiters and website had INSERT policy on order_items.
-- Cashiers using POS create orders directly and need to 
-- insert order_items for their branch's orders.
-- Applied: 2026-03-21
-- ═══════════════════════════════════════════════════════════

-- Drop if exists for idempotency
DROP POLICY IF EXISTS "oi_cashier_insert" ON order_items;

-- Allow cashiers to insert order_items for orders in their branch
CREATE POLICY "oi_cashier_insert" ON order_items
  FOR INSERT
  TO public
  WITH CHECK (
    auth_has_role('cashier')
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.branch_id = ANY(auth_branch_ids())
    )
  );

-- Also ensure cashiers can UPDATE order_items (e.g. status changes)
DROP POLICY IF EXISTS "oi_cashier_update" ON order_items;

CREATE POLICY "oi_cashier_update" ON order_items
  FOR UPDATE
  TO public
  USING (
    auth_has_role('cashier')
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.branch_id = ANY(auth_branch_ids())
    )
  )
  WITH CHECK (
    auth_has_role('cashier')
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.branch_id = ANY(auth_branch_ids())
    )
  );
