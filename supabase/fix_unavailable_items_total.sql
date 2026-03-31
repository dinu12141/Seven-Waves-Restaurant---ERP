-- ============================================================
-- FIX: Recalculate order total excluding unavailable items
--       + Insert customer notification for unavailable items
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_waiter_accept_order(
    p_order_id UUID,
    p_unavailable_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id       UUID        := auth.uid();
    v_actor_role     TEXT;
    v_actor_name     TEXT;
    v_order          RECORD;
    v_now            TIMESTAMPTZ := now();
    v_kot_result     JSONB;
    v_kot_count      INT := 0;
    v_dispatch_count INT := 0;
    v_new_subtotal   NUMERIC;
    v_unavail_names  TEXT[];
BEGIN

    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_AUTHENTICATED', 'error', 'Authentication required.');
    END IF;

    IF    auth_has_role('waiter')  THEN v_actor_role := 'waiter';
    ELSIF auth_has_role('cashier') THEN v_actor_role := 'cashier';
    ELSIF auth_has_role('manager') THEN v_actor_role := 'manager';
    ELSIF auth_has_role('admin')   THEN v_actor_role := 'admin';
    ELSE
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Order not found.');
    END IF;

    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id = v_actor_id THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ACCEPTED', 'message', 'You already accepted this order.', 'order_id', p_order_id, 'assigned_waiter_id', v_actor_id);
    END IF;

    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_TAKEN', 'error', 'This order was just accepted by another waiter.');
    END IF;

    IF v_order.status <> 'pending_waiter' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS', 'error', 'Cannot accept order in status: ' || v_order.status || '.');
    END IF;

    IF v_actor_role = 'waiter' AND NOT auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ON_SHIFT', 'error', 'You are not currently on shift for this branch.');
    END IF;

    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor_id;

    -- ═══════════════════════════════════════════════════════
    -- ATOMIC AVAILABILITY MARKING (before KOT generation)
    -- ═══════════════════════════════════════════════════════
    IF p_unavailable_ids IS NOT NULL AND array_length(p_unavailable_ids, 1) > 0 THEN
        -- Mark specified items as unavailable
        UPDATE order_items
        SET    availability_status = 'unavailable'
        WHERE  order_id = p_order_id
          AND  id = ANY(p_unavailable_ids);

        -- Mark remaining items in this order as available
        UPDATE order_items
        SET    availability_status = 'available'
        WHERE  order_id = p_order_id
          AND  id <> ALL(p_unavailable_ids)
          AND  (availability_status IS NULL OR availability_status <> 'unavailable');

        -- ═══════════════════════════════════════════════════════
        -- RECALCULATE ORDER TOTAL (exclude unavailable items)
        -- Only available items count toward the bill
        -- ═══════════════════════════════════════════════════════
        SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
        INTO   v_new_subtotal
        FROM   order_items oi
        WHERE  oi.order_id = p_order_id
          AND  (oi.availability_status IS NULL OR oi.availability_status <> 'unavailable');

        UPDATE orders
        SET    subtotal     = v_new_subtotal,
               total_amount = v_new_subtotal + COALESCE(tax_amount, 0) + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
               updated_at   = v_now
        WHERE  id = p_order_id;

        -- Collect unavailable item names for customer notification
        SELECT array_agg(mi.name)
        INTO   v_unavail_names
        FROM   order_items oi
        JOIN   menu_items mi ON mi.id = oi.menu_item_id
        WHERE  oi.order_id = p_order_id
          AND  oi.availability_status = 'unavailable';

        -- ═══════════════════════════════════════════════════════
        -- CUSTOMER NOTIFICATION (real-time via order_notifications)
        -- ═══════════════════════════════════════════════════════
        IF v_unavail_names IS NOT NULL AND array_length(v_unavail_names, 1) > 0 THEN
            INSERT INTO order_notifications (
                order_id, notification_type, title, message, is_read, created_at
            ) VALUES (
                p_order_id,
                'item_unavailable',
                'Some Items Are Unavailable',
                'Sorry, the following items are currently unavailable: ' 
                    || array_to_string(v_unavail_names, ', ') 
                    || '. They have been removed from your bill. '
                    || 'If you''d like, you can order alternative items.',
                false,
                v_now
            );
        END IF;
    END IF;

    -- Accept the order
    UPDATE orders
    SET status             = 'accepted',
        assigned_waiter_id = v_actor_id,
        accepted_at        = v_now,
        updated_at         = v_now
    WHERE id = p_order_id;

    INSERT INTO order_status_events (
        order_id, old_status, new_status, created_by, event_code, actor_user_id, actor_role, payload, created_at
    ) VALUES (
        p_order_id, 'pending_waiter', 'accepted', v_actor_id, 'waiter_accepted', v_actor_id, v_actor_role,
        jsonb_build_object(
            'waiter_id', v_actor_id, 'waiter_name', COALESCE(v_actor_name, 'Unknown'),
            'order_number', v_order.order_number, 'branch_id', v_order.branch_id,
            'table_id', v_order.table_id,
            'unavailable_count', COALESCE(array_length(p_unavailable_ids, 1), 0)
        ),
        v_now
    );

    INSERT INTO order_acceptance (order_id, accepted_by, accepted_at)
    VALUES (p_order_id, v_actor_id, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- KOT generation (now sees correct availability_status values)
    v_kot_result := generate_kots_for_order(p_order_id, v_order.branch_id, v_actor_id);

    IF NOT (v_kot_result->>'success')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', true, 'code', 'ACCEPTED_KOT_ERROR',
            'order_id', p_order_id, 'assigned_waiter_id', v_actor_id,
            'warning', 'Order accepted but KOT generation failed: ' || (v_kot_result->>'error')
        );
    END IF;

    v_kot_count      := (v_kot_result->>'kot_count')::INT;
    v_dispatch_count := (v_kot_result->>'dispatch_count')::INT;

    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO inventory_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    PERFORM log_erp_event(
        'waiter_accepted', 'order', p_order_id, v_actor_id, v_actor_role, v_order.branch_id,
        jsonb_build_object(
            'waiter_name', COALESCE(v_actor_name, 'Unknown'), 'order_number', v_order.order_number,
            'kot_count', v_kot_count, 'dispatch_count', v_dispatch_count,
            'routing_warnings', v_kot_result->'warnings',
            'unavailable_count', COALESCE(array_length(p_unavailable_ids, 1), 0)
        )
    );

    PERFORM notify_role(v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter') || '. ' || v_kot_count || ' KOT(s) created.',
        'soup_kitchen', 'orange', '/kitchen', 'order', p_order_id, v_actor_id);

    PERFORM notify_role(v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️  Billing — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos', 'order', p_order_id, v_actor_id);

    PERFORM notify_role(v_order.branch_id, 'inventory', 'order_accepted',
        '📦 Stock Queue — Order #' || v_order.order_number,
        'BOM deduction pending at kitchen start.',
        'inventory_2', 'blue', '/inventory', 'order', p_order_id, v_actor_id);

    PERFORM notify_role(v_order.branch_id, 'finance', 'order_accepted',
        '💰 Finance Queue — Order #' || v_order.order_number,
        'Cost/revenue posting pending.',
        'account_balance', 'teal', '/finance', 'order', p_order_id, v_actor_id);

    RETURN jsonb_build_object(
        'success', true, 'code', 'ACCEPTED',
        'order_id', p_order_id, 'assigned_waiter_id', v_actor_id,
        'kot_count', v_kot_count, 'dispatch_count', v_dispatch_count,
        'unavailable_count', COALESCE(array_length(p_unavailable_ids, 1), 0),
        'kots', v_kot_result->'kots',
        'queues_created', jsonb_build_object('cashier', true, 'inventory', true, 'finance', true),
        'routing_warnings', v_kot_result->'warnings',
        'warning_count', (v_kot_result->>'warning_count')::INT
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'INTERNAL_ERROR', 'error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID, UUID[]) TO authenticated;

-- backward-compat alias
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(
    p_order_id UUID,
    p_unavailable_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rpc_waiter_accept_order(p_order_id, p_unavailable_ids);
$$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID, UUID[]) TO authenticated;
