-- ═══════════════════════════════════════════════════════════════════════════════
-- apply_discount RPC — Server-Side Discount Validation
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-008 (DBauditor 2026-07-17)
--
-- PROBLEM:
--   Discount is applied entirely client-side in orderStore.js with no server guard.
--   A manipulated request can set discount_amount to any value (e.g., 200%)
--   producing a negative total, corrupting finance journal entries.
--
-- SOLUTION:
--   SECURITY DEFINER RPC that:
--   1. Validates discount % is 0–100
--   2. Checks the calling user has permission to apply discounts
--   3. Validates order is in a state where discount can still be applied
--   4. Updates the order and returns new totals
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_discount_to_order(
  p_order_id       UUID,
  p_discount_pct   NUMERIC,   -- 0 to 100
  p_discount_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order           RECORD;
  v_discount_amount NUMERIC;
  v_new_total       NUMERIC;
  v_service_charge  NUMERIC;
  v_has_permission  BOOLEAN;
BEGIN
  -- 1. Permission check — only admin, manager, or cashier can apply discounts
  v_has_permission := public.is_admin()
    OR public.is_manager()
    OR public.auth_has_role('cashier');

  IF NOT v_has_permission THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: only admin, manager, or cashier can apply discounts');
  END IF;

  -- 2. Validate discount percentage
  IF p_discount_pct < 0 OR p_discount_pct > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', format('Invalid discount: %s%%. Must be between 0 and 100.', p_discount_pct));
  END IF;

  -- 3. Load order
  SELECT id, status, subtotal, tax_amount, service_charge_amount, total_amount, discount_amount, order_type, branch_id
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- 4. Validate order state — can only discount before invoiced/paid
  IF v_order.status IN ('paid', 'refunded', 'cancelled') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot apply discount to order in status: %s', v_order.status)
    );
  END IF;

  -- 5. Calculate new amounts
  v_discount_amount := ROUND(v_order.subtotal * (p_discount_pct / 100.0), 2);

  -- Service charge applies to taxable amount (subtotal after discount), dine-in only
  IF v_order.order_type = 'dine-in' THEN
    -- Read service_charge_rate from order (set at order creation from branch settings)
    SELECT COALESCE(service_charge_rate, 0.10) INTO v_service_charge
    FROM orders WHERE id = p_order_id;
    v_service_charge := ROUND((v_order.subtotal - v_discount_amount) * v_service_charge, 2);
  ELSE
    v_service_charge := 0;
  END IF;

  -- Taxable = subtotal - discount
  -- Total = taxable + tax + service_charge
  v_new_total := (v_order.subtotal - v_discount_amount)
               + COALESCE(v_order.tax_amount, 0)
               + v_service_charge;

  -- Ensure total is never negative (defensive guard)
  IF v_new_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Discount would produce a negative total');
  END IF;

  -- 6. Apply the discount
  UPDATE orders
  SET
    discount_amount        = v_discount_amount,
    service_charge_amount  = v_service_charge,
    total_amount           = v_new_total,
    notes = CASE
      WHEN p_discount_reason IS NOT NULL
        THEN COALESCE(notes, '') || E'\n[Discount: ' || p_discount_pct || '% — ' || p_discount_reason || ']'
      ELSE notes
    END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success',          true,
    'order_id',         p_order_id,
    'discount_pct',     p_discount_pct,
    'discount_amount',  v_discount_amount,
    'service_charge',   v_service_charge,
    'new_total',        v_new_total
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_discount_to_order(UUID, NUMERIC, TEXT) TO authenticated;

-- ── Revoke from anon (should not be callable without auth) ──────────────────
REVOKE ALL ON FUNCTION public.apply_discount_to_order(UUID, NUMERIC, TEXT) FROM anon;
