-- ════════════════════════════════════════════════════════════════
-- FIX 1: Disable auto-accept for website orders
-- ────────────────────────────────────────────────────────────────
-- PROBLEM: trg_auto_accept_website_order fires on INSERT to orders
--          when order_source = 'website', immediately calling
--          accept_website_order() which sets status to 'accepted',
--          generates KOTs, creates queues — ALL before any rider
--          has accepted the delivery.
--
-- FIX: Disable this trigger. Orders should stay 'pending_waiter'
--      until a delivery boy explicitly accepts via
--      rider_accept_delivery(). That function already does the
--      full pipeline (KOTs, queues, notifications).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE orders DISABLE TRIGGER trg_auto_accept_website_order;


-- ════════════════════════════════════════════════════════════════
-- FIX 2: Update place_website_order to create delivery_assignments
-- ────────────────────────────────────────────────────────────────
-- Previously, accept_website_order() created the delivery_assignment.
-- Now that auto-accept is disabled, we need place_website_order
-- to create the delivery_assignment so riders can see pending
-- deliveries. The order remains in 'pending_waiter' status.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.place_website_order(
  p_company_id     uuid,
  p_branch_id      uuid,
  p_order_type     text,
  p_customer_name  text,
  p_customer_phone text,
  p_delivery_address text DEFAULT NULL,
  p_notes          text DEFAULT NULL,
  p_items          jsonb DEFAULT '[]'::jsonb,
  p_delivery_charge numeric DEFAULT 0,
  p_customer_id    uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cod',
  p_payment_status text DEFAULT 'unpaid'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order_id     uuid;
  v_order_number integer;
  v_subtotal     numeric := 0;
  v_total        numeric := 0;
  v_item         jsonb;
BEGIN
  -- Ensure user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Calculate subtotal from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := v_subtotal + ((v_item->>'unit_price')::numeric * (v_item->>'quantity')::integer);
  END LOOP;

  -- Total = subtotal + delivery charge
  v_total := v_subtotal + COALESCE(p_delivery_charge, 0);

  -- Insert the order (status stays 'pending_waiter' until rider accepts)
  INSERT INTO orders (
    company_id, branch_id, order_source, order_type,
    status, payment_status, payment_method,
    customer_name, customer_phone, delivery_address,
    subtotal, total_amount, notes, customer_id
  ) VALUES (
    p_company_id, p_branch_id, 'website', p_order_type,
    'pending_waiter', p_payment_status, p_payment_method,
    p_customer_name, p_customer_phone, p_delivery_address,
    v_subtotal, v_total, p_notes, p_customer_id
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  -- Insert order items
  INSERT INTO order_items (
    order_id, menu_item_id, variant_id, quantity,
    unit_price, total_price, notes, status
  )
  SELECT
    v_order_id,
    (item->>'menu_item_id')::uuid,
    NULLIF(item->>'variant_id', '')::uuid,
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric * (item->>'quantity')::integer,
    NULLIF(item->>'notes', ''),
    'queued'
  FROM jsonb_array_elements(p_items) AS item;

  -- ════════════════════════════════════════════════════════
  -- NEW: Create delivery assignment immediately so riders
  -- can see and accept the pending delivery order
  -- ════════════════════════════════════════════════════════
  IF p_order_type IN ('delivery', 'website_delivery') THEN
    INSERT INTO delivery_assignments (
      order_id, branch_id, status,
      customer_name, customer_phone, delivery_address, delivery_notes,
      assigned_at, created_at, updated_at
    ) VALUES (
      v_order_id, p_branch_id, 'pending_rider',
      p_customer_name, p_customer_phone, p_delivery_address, p_notes,
      now(), now(), now()
    ) ON CONFLICT (order_id) DO NOTHING;
  END IF;

  -- Insert initial order_status_events row
  INSERT INTO order_status_events (
    order_id,
    old_status,
    new_status,
    event_code,
    event_type,
    actor_role,
    actor_user_id,
    created_by,
    payload
  ) VALUES (
    v_order_id,
    NULL,
    'pending_waiter',
    'ORDER_PLACED',
    'status_change',
    'customer',
    auth.uid(),
    auth.uid(),
    jsonb_build_object(
      'source', 'website',
      'payment_method', p_payment_method,
      'payment_status', p_payment_status,
      'delivery_charge', p_delivery_charge,
      'order_type', p_order_type
    )
  );

  -- ════════════════════════════════════════════════════════
  -- NEW: Notify delivery riders about pending delivery
  -- ════════════════════════════════════════════════════════
  IF p_order_type IN ('delivery', 'website_delivery') THEN
    PERFORM notify_role(p_branch_id, 'delivery', 'new_delivery',
      '🛵 New Delivery Order — #' || v_order_number,
      COALESCE(p_customer_name, 'Customer') || ' — ' || COALESCE(p_delivery_address, 'N/A'),
      'delivery_dining', 'orange', '/delivery-app',
      'order', v_order_id, NULL);

    -- Also notify managers about new website order
    PERFORM notify_role(p_branch_id, 'manager', 'website_order',
      '🌐 New Website Order — #' || v_order_number,
      'Delivery pending rider acceptance. Customer: ' || COALESCE(p_customer_name, 'N/A'),
      'language', 'blue', '/manager-app/orders',
      'order', v_order_id, NULL);
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$function$;


-- ════════════════════════════════════════════════════════════════
-- FIX 3: process_cashier_payment should NOT change order status
--        to 'paid' for delivery orders. It should only set
--        payment_status = 'paid'. The order status should remain
--        at its current state (e.g., 'accepted', 'preparing',
--        'ready'). Only the delivery rider confirming delivery
--        should set status = 'delivered'.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_cashier_payment(
  p_order_id       uuid,
  p_payment_method text DEFAULT 'cash',
  p_amount_paid    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_order        RECORD;
    v_user_id      UUID := auth.uid();
    v_now          TIMESTAMPTZ := now();
    v_stock_result JSONB;
    v_is_delivery  BOOLEAN;
    v_final_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already paid.', 'order_id', p_order_id);
    END IF;

    -- Check if this is a delivery order
    v_is_delivery := (v_order.order_type IN ('delivery', 'website_delivery'))
                  OR (v_order.order_source = 'website' AND v_order.delivery_address IS NOT NULL);

    -- ════════════════════════════════════════════════════════
    -- For DELIVERY orders:
    --   - Set payment_status = 'paid' (billing complete)
    --   - Keep order status as-is (don't jump to 'paid')
    --   - Order becomes 'delivered' only when rider confirms
    --
    -- For DINE-IN / TAKEAWAY orders:
    --   - Set both status = 'paid' and payment_status = 'paid'
    -- ════════════════════════════════════════════════════════
    IF v_is_delivery THEN
        -- Delivery: only mark payment, keep order status
        v_final_status := v_order.status;
        UPDATE orders
        SET payment_status = 'paid',
            payment_method = p_payment_method,
            updated_at = v_now
        WHERE id = p_order_id;
    ELSE
        -- Dine-in / Takeaway: mark fully paid
        v_final_status := 'paid';
        UPDATE orders
        SET status = 'paid',
            payment_status = 'paid',
            payment_method = p_payment_method,
            updated_at = v_now
        WHERE id = p_order_id;
    END IF;

    -- 2. Update work queues
    UPDATE cashier_queue SET status = 'paid', updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('open', 'invoiced');

    UPDATE finance_queue SET status = 'posted', updated_at = v_now
    WHERE order_id = p_order_id AND status = 'pending';

    -- 3. Stock deduction (on_paid stage)
    BEGIN
        v_stock_result := issue_stock_for_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        v_stock_result := jsonb_build_object('success', false, 'error', SQLERRM);
        PERFORM mark_stock_queue_failed(p_order_id, SQLERRM);
    END;

    -- 4. Auto-post journal entry
    BEGIN
        PERFORM post_accounting_from_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Journal posting warning for order %: %', p_order_id, SQLERRM;
    END;

    -- 5. Event log
    PERFORM log_erp_event('payment_received', 'order', p_order_id, v_user_id, 'cashier',
        v_order.branch_id,
        jsonb_build_object('cashier_id', v_user_id, 'payment_method', p_payment_method,
            'amount_paid', COALESCE(p_amount_paid, v_order.total_amount),
            'is_delivery', v_is_delivery,
            'stock_result', v_stock_result));

    -- 6. Notify waiter / rider
    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (v_order.assigned_waiter_id, v_order.branch_id, 'payment_complete', '💰 Payment Complete',
            'Order #' || v_order.order_number || ' — ' || UPPER(p_payment_method) ||
            ' · LKR ' || TO_CHAR(COALESCE(p_amount_paid, v_order.total_amount), 'FM999,999.00'),
            'payments', 'green', '/orders', 'order', p_order_id);
    END IF;

    -- For delivery: notify rider that billing is complete
    IF v_is_delivery THEN
        PERFORM notify_role(v_order.branch_id, 'delivery', 'payment_complete',
            '💰 Bill Paid — Order #' || v_order.order_number,
            'Payment received via ' || UPPER(p_payment_method) || '. Deliver to complete.',
            'payments', 'green', '/delivery-app',
            'order', p_order_id, NULL);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'order_id', p_order_id,
        'status', v_final_status,
        'payment_status', 'paid', 'payment_method', p_payment_method,
        'is_delivery', v_is_delivery,
        'finance_posted', true, 'stock_result', v_stock_result
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;


-- ════════════════════════════════════════════════════════════════
-- VERIFICATION: Confirm trigger is disabled
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
    RAISE NOTICE '✅ trg_auto_accept_website_order has been DISABLED';
    RAISE NOTICE '✅ place_website_order now creates delivery_assignments with pending_rider';
    RAISE NOTICE '✅ process_cashier_payment now preserves order status for delivery orders';
    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'Correct delivery flow:';
    RAISE NOTICE '  1. Customer places order → pending_waiter + delivery_assignment(pending_rider)';
    RAISE NOTICE '  2. Rider accepts → rider_accept_delivery → accepted + KOTs + queues';
    RAISE NOTICE '  3. Kitchen cooks → preparing → ready';
    RAISE NOTICE '  4. POS pays bill → payment_status=paid (order status stays)';
    RAISE NOTICE '  5. Rider delivers → rider confirms → status=delivered';
END $$;
