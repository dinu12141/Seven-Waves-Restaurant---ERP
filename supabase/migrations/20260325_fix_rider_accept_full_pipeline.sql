-- ═══════════════════════════════════════════════════════════════════════════
-- Fix rider_accept_delivery — Full ERP Pipeline Integration
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEM: When delivery rider accepts an order, KOTs were created BUT:
--   1. cashier_queue row was NOT created → POS never shows the order for billing
--   2. inventory_queue / finance_queue rows were NOT created
--   3. No notifications were sent to cashier / kitchen / inventory / finance
--
-- FIX: Add all missing downstream side-effects that rpc_waiter_accept_order does.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rider_accept_delivery(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_assignment   RECORD;
    v_rider_id     UUID := auth.uid();
    v_now          TIMESTAMPTZ := now();
    v_rider_name   TEXT;
    v_kot_result   JSONB;
    v_order        RECORD;
    v_order_number TEXT;
BEGIN
    IF v_rider_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('delivery') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role. Delivery role required.');
    END IF;

    -- Lock assignment
    SELECT * INTO v_assignment FROM delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Delivery assignment not found.');
    END IF;

    -- Idempotent — already accepted by this rider
    IF v_assignment.status = 'accepted' AND v_assignment.rider_id = v_rider_id THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already accepted by you.',
            'assignment_id', p_assignment_id);
    END IF;

    -- Only pending assignments can be accepted
    IF v_assignment.status != 'pending_rider' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Assignment cannot be accepted. Status: ' || v_assignment.status);
    END IF;

    -- Get rider name for notifications
    SELECT full_name INTO v_rider_name FROM profiles WHERE id = v_rider_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 1: Accept the delivery assignment
    -- ════════════════════════════════════════════════════════
    UPDATE delivery_assignments
    SET rider_id    = v_rider_id,
        status      = 'accepted',
        accepted_at = v_now,
        updated_at  = v_now
    WHERE id = p_assignment_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 2: Update order status to 'accepted'
    -- ════════════════════════════════════════════════════════
    UPDATE orders
    SET status      = 'accepted',
        accepted_at = v_now,
        updated_at  = v_now
    WHERE id = v_assignment.order_id
      AND status IN ('pending_waiter', 'pending', 'new');

    -- Fetch the order for downstream use
    SELECT * INTO v_order FROM orders WHERE id = v_assignment.order_id;
    v_order_number := v_order.order_number;

    -- ════════════════════════════════════════════════════════
    -- STEP 3: Generate KOTs for the kitchen
    -- ════════════════════════════════════════════════════════
    v_kot_result := generate_kots_for_order(
        v_assignment.order_id,
        v_assignment.branch_id,
        v_rider_id
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 4: Create downstream work queues (CRITICAL FIX)
    -- ════════════════════════════════════════════════════════

    -- POS / Cashier queue — this makes the order appear in POS for billing
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (v_assignment.order_id, v_assignment.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- Inventory queue — BOM deduction
    INSERT INTO inventory_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (v_assignment.order_id, v_assignment.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- Finance queue — cost/revenue posting
    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (v_assignment.order_id, v_assignment.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ════════════════════════════════════════════════════════
    -- STEP 5: Audit event
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_status_events (
        order_id, old_status, new_status,
        created_by, event_code, actor_user_id,
        payload, created_at
    ) VALUES (
        v_assignment.order_id,
        'pending_waiter',
        'accepted',
        v_rider_id,
        'delivery_accepted',
        v_rider_id,
        jsonb_build_object(
            'rider_id',      v_rider_id,
            'rider_name',    COALESCE(v_rider_name, 'Unknown'),
            'assignment_id', p_assignment_id,
            'order_number',  v_order_number,
            'kots_generated', v_kot_result
        ),
        v_now
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 6: ERP event log
    -- ════════════════════════════════════════════════════════
    PERFORM log_erp_event(
        'delivery_accepted', 'delivery', p_assignment_id, v_rider_id, 'delivery',
        v_assignment.branch_id,
        jsonb_build_object(
            'rider_name', COALESCE(v_rider_name, 'Unknown'),
            'order_id', v_assignment.order_id,
            'order_number', v_order_number,
            'kots_generated', v_kot_result
        )
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 7: Real-time push notifications (CRITICAL FIX)
    -- ════════════════════════════════════════════════════════

    -- → Kitchen: "New KOT from delivery order"
    PERFORM notify_role(
        v_assignment.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Delivery Order #' || COALESCE(v_order_number, '?'),
        'Delivery accepted by ' || COALESCE(v_rider_name, 'Rider')
            || '. KOTs sent to kitchen.',
        'soup_kitchen', 'orange', '/kitchen',
        'order', v_assignment.order_id, v_rider_id
    );

    -- → POS / Cashier: "Prepare invoice for delivery order"
    PERFORM notify_role(
        v_assignment.branch_id, 'cashier', 'delivery_accepted',
        '🛵 Delivery Bill — Order #' || COALESCE(v_order_number, '?'),
        'Rider ' || COALESCE(v_rider_name, 'Unknown') || ' accepted delivery. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos',
        'order', v_assignment.order_id, v_rider_id
    );

    -- → Manager
    PERFORM notify_role(
        v_assignment.branch_id, 'manager', 'delivery_accepted',
        '🚴 Delivery Accepted — Order #' || COALESCE(v_order_number, '?'),
        'Rider ' || COALESCE(v_rider_name, 'Unknown') || ' accepted delivery.',
        'delivery_dining', 'green', '/manager-app/orders',
        'delivery', p_assignment_id, v_rider_id
    );

    -- → Inventory
    PERFORM notify_role(
        v_assignment.branch_id, 'inventory', 'order_accepted',
        '📦 Stock Queue — Delivery #' || COALESCE(v_order_number, '?'),
        'BOM deduction pending at kitchen start.',
        'inventory_2', 'blue', '/inventory',
        'order', v_assignment.order_id, v_rider_id
    );

    -- → Finance
    PERFORM notify_role(
        v_assignment.branch_id, 'finance', 'order_accepted',
        '💰 Finance Queue — Delivery #' || COALESCE(v_order_number, '?'),
        'Cost/revenue posting pending.',
        'account_balance', 'teal', '/finance',
        'order', v_assignment.order_id, v_rider_id
    );

    -- ════════════════════════════════════════════════════════
    -- SUCCESS
    -- ════════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'success',          true,
        'assignment_id',    p_assignment_id,
        'rider_id',         v_rider_id,
        'order_id',         v_assignment.order_id,
        'order_number',     v_order_number,
        'status',           'accepted',
        'kots_generated',   v_kot_result IS NOT NULL,
        'kot_count',        (v_kot_result->>'kot_count')::INT,
        'queues_created',   jsonb_build_object(
                                'cashier',   true,
                                'inventory', true,
                                'finance',   true
                            )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
