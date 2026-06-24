-- ============================================================
-- Waiter: Add items to an existing active order + new KOT
-- ============================================================
CREATE OR REPLACE FUNCTION public.waiter_add_items_to_order(
  p_order_id UUID,
  p_items JSONB -- [{ menu_item_id, qty, notes }]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order RECORD;
  v_item JSONB;
  v_menu_item RECORD;
  v_kot_id UUID;
  v_new_subtotal NUMERIC(12,2);
BEGIN
  SELECT id, branch_id, company_id, subtotal, total_amount
    INTO v_order
    FROM orders
   WHERE id = p_order_id AND status NOT IN ('completed','cancelled');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or already closed');
  END IF;

  v_new_subtotal := 0;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, base_price, kitchen_id INTO v_menu_item
      FROM menu_items
     WHERE id = (v_item->>'menu_item_id')::UUID AND is_available = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Item ' || (v_item->>'menu_item_id') || ' not available');
    END IF;

    INSERT INTO order_items (
      order_id, menu_item_id, kitchen_id,
      quantity, unit_price, total_price, notes, status
    ) VALUES (
      p_order_id, v_menu_item.id, v_menu_item.kitchen_id,
      (v_item->>'qty')::INT,
      v_menu_item.base_price,
      v_menu_item.base_price * (v_item->>'qty')::INT,
      NULLIF(v_item->>'notes', ''),
      'queued'
    );

    v_new_subtotal := v_new_subtotal + v_menu_item.base_price * (v_item->>'qty')::INT;
  END LOOP;

  -- Update order totals
  UPDATE orders
     SET subtotal      = COALESCE(subtotal, 0) + v_new_subtotal,
         total_amount  = COALESCE(total_amount, 0) + v_new_subtotal
   WHERE id = p_order_id;

  -- Create one KOT per kitchen for the newly-queued items
  FOR v_menu_item IN
    SELECT DISTINCT oi.kitchen_id
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.status = 'queued'
       AND oi.kitchen_id IS NOT NULL
  LOOP
    INSERT INTO kot_tickets (order_id, kitchen_id, status)
    VALUES (p_order_id, v_menu_item.kitchen_id, 'created')
    RETURNING id INTO v_kot_id;

    INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
    SELECT v_kot_id, oi.id, oi.quantity, 'queued'
      FROM order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.kitchen_id = v_menu_item.kitchen_id
       AND oi.status = 'queued';
  END LOOP;

  -- Mark the newly-queued items as sent to kitchen
  UPDATE order_items
     SET status = 'sent_to_kitchen'
   WHERE order_id = p_order_id AND status = 'queued';

  RETURN jsonb_build_object('success', true, 'added_subtotal', v_new_subtotal);
END;
$$;

GRANT EXECUTE ON FUNCTION public.waiter_add_items_to_order(UUID, JSONB) TO authenticated;
