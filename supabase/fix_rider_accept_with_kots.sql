-- Fix rider_accept_delivery to:
-- 1. Update order status to 'accepted' (so kitchen display shows it)
-- 2. Call generate_kots_for_order (so KOTs are created for kitchen)
CREATE OR REPLACE FUNCTION public.rider_accept_delivery(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_assignment RECORD;
    v_rider_id   UUID := auth.uid();
    v_now        TIMESTAMPTZ := now();
    v_rider_name TEXT;
    v_kot_result JSONB;
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

    -- Idempotent
    IF v_assignment.status = 'accepted' AND v_assignment.rider_id = v_rider_id THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already accepted by you.',
            'assignment_id', p_assignment_id);
    END IF;

    -- Only pending assignments can be accepted
    IF v_assignment.status != 'pending_rider' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Assignment cannot be accepted. Status: ' || v_assignment.status);
    END IF;

    -- Accept the delivery assignment
    UPDATE delivery_assignments
    SET rider_id = v_rider_id,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = p_assignment_id;

    -- ═══ NEW: Update order status to 'accepted' so kitchen display sees it ═══
    UPDATE orders
    SET status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = v_assignment.order_id
      AND status IN ('pending_waiter', 'pending', 'new');

    -- ═══ NEW: Generate KOTs for the kitchen ═══
    v_kot_result := generate_kots_for_order(v_assignment.order_id);

    -- Event log
    SELECT full_name INTO v_rider_name FROM profiles WHERE id = v_rider_id;

    PERFORM log_erp_event(
        'delivery_accepted', 'delivery', p_assignment_id, v_rider_id, 'delivery',
        v_assignment.branch_id,
        jsonb_build_object(
            'rider_name', COALESCE(v_rider_name, 'Unknown'),
            'order_id', v_assignment.order_id,
            'kots_generated', v_kot_result
        )
    );

    -- Notify manager
    PERFORM notify_role(v_assignment.branch_id, 'manager', 'delivery_accepted',
        '🚴 Delivery Accepted',
        'Rider ' || COALESCE(v_rider_name, 'Unknown') || ' accepted delivery for order.',
        'delivery_dining', 'green', '/manager-app/orders', 'delivery', p_assignment_id, v_rider_id);

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'rider_id', v_rider_id,
        'order_id', v_assignment.order_id,
        'status', 'accepted',
        'kots_generated', v_kot_result IS NOT NULL
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
