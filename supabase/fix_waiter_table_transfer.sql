-- ============================================================
-- Waiter: Transfer an active order from one table to another
-- ============================================================
CREATE OR REPLACE FUNCTION public.waiter_transfer_table(
  p_order_id UUID,
  p_new_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_table_id UUID;
  v_branch_id UUID;
  v_other_orders INT;
BEGIN
  -- Get current table
  SELECT table_id, branch_id INTO v_old_table_id, v_branch_id
    FROM orders WHERE id = p_order_id AND status NOT IN ('completed','cancelled');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or already closed');
  END IF;

  -- Verify new table is in same branch and available
  IF NOT EXISTS (
    SELECT 1 FROM restaurant_tables
    WHERE id = p_new_table_id AND branch_id = v_branch_id AND status = 'available'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target table not available');
  END IF;

  -- Move order
  UPDATE orders SET table_id = p_new_table_id WHERE id = p_order_id;

  -- Mark new table occupied
  UPDATE restaurant_tables SET status = 'occupied' WHERE id = p_new_table_id;

  -- Release old table if no other active orders
  SELECT COUNT(*) INTO v_other_orders
    FROM orders
   WHERE table_id = v_old_table_id
     AND status NOT IN ('completed','cancelled','invoiced','paid')
     AND id != p_order_id;

  IF v_other_orders = 0 THEN
    UPDATE restaurant_tables SET status = 'available' WHERE id = v_old_table_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'old_table_id', v_old_table_id, 'new_table_id', p_new_table_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.waiter_transfer_table(UUID, UUID) TO authenticated;
