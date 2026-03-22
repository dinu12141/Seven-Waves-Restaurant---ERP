-- ═══════════════════════════════════════════════════════════════════════════════
-- DELIVERY ASSIGNMENTS & WEBSITE ORDER INTEGRATION
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Applied: 2026-03-21
--
-- CONTENTS:
--   §1  Schema — delivery_assignments table
--   §2  Auto-Accept Website Orders (trigger + RPC)
--   §3  Delivery Rider RPCs (accept, picked_up, delivered)
--   §4  Kitchen-Ready → Rider Notification trigger
--   §5  Indexes, Realtime, Grants
-- ═══════════════════════════════════════════════════════════════════════════════


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  SCHEMA — DELIVERY ASSIGNMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.delivery_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    rider_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'pending_rider',
    customer_name       TEXT,
    customer_phone      TEXT,
    delivery_address    TEXT,
    delivery_notes      TEXT,
    estimated_minutes   INT DEFAULT 30,
    assigned_at         TIMESTAMPTZ DEFAULT now(),
    accepted_at         TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_delivery_status CHECK (
        status IN ('pending_rider', 'accepted', 'picked_up', 'delivered', 'cancelled')
    ),
    CONSTRAINT uq_delivery_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_da_order        ON delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_da_rider        ON delivery_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_da_branch_status ON delivery_assignments(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_da_status       ON delivery_assignments(status);
CREATE INDEX IF NOT EXISTS idx_da_created      ON delivery_assignments(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_delivery_assignments_updated
BEFORE UPDATE ON delivery_assignments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  AUTO-ACCEPT WEBSITE ORDERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- When a website order is inserted with order_source='website' and status='pending_waiter',
-- auto-accept it: generate KOTs, create dispatch queues, and create a delivery assignment.

CREATE OR REPLACE FUNCTION public.accept_website_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order          RECORD;
    v_now            TIMESTAMPTZ := now();
    v_kot_id         UUID;
    v_kot_rec        RECORD;
    v_default_kitchen UUID;
    v_kot_count      INT := 0;
    v_dispatch_count INT := 0;
BEGIN
    -- Lock order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Only process website orders in pending_waiter status
    IF v_order.order_source != 'website' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not a website order.');
    END IF;

    -- Idempotent: if already accepted, skip
    IF v_order.status != 'pending_waiter' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order already processed.',
            'order_id', p_order_id);
    END IF;

    -- 1. Update order status to accepted (bypass waiter)
    UPDATE orders
    SET status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

    -- 2. Re-assess kitchen routing for all queued items
    UPDATE order_items
    SET kitchen_id = get_target_kitchen_for_item(menu_item_id, v_order.branch_id)
    WHERE order_id = p_order_id AND (kitchen_id IS NULL OR status = 'queued');

    -- 3. Get default kitchen fallback
    SELECT id INTO v_default_kitchen FROM kitchens
    WHERE branch_id = v_order.branch_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    -- 4. Generate KOT tickets per kitchen
    FOR v_kot_rec IN
        SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
        FROM order_items WHERE order_id = p_order_id AND status = 'queued'
    LOOP
        CONTINUE WHEN v_kot_rec.kit_id IS NULL;

        -- Skip if KOT already exists for this kitchen
        PERFORM 1 FROM kot_tickets
        WHERE order_id = p_order_id AND kitchen_id = v_kot_rec.kit_id;
        IF NOT FOUND THEN
            INSERT INTO kot_tickets (order_id, kitchen_id, status, batch_number, created_at)
            VALUES (p_order_id, v_kot_rec.kit_id, 'created', 1, v_now)
            RETURNING id INTO v_kot_id;

            INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
            SELECT v_kot_id, oi.id, oi.quantity, 'pending'
            FROM order_items oi
            WHERE oi.order_id = p_order_id
              AND COALESCE(oi.kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
              AND oi.status = 'queued';

            UPDATE order_items
            SET status = 'sent_to_kitchen',
                kitchen_id = COALESCE(kitchen_id, v_default_kitchen)
            WHERE order_id = p_order_id
              AND COALESCE(kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
              AND status = 'queued';

            v_kot_count := v_kot_count + 1;
        END IF;
    END LOOP;

    -- 5. Dispatch all KOTs to all 4 routing targets
    FOR v_kot_rec IN SELECT id FROM kot_tickets WHERE order_id = p_order_id LOOP
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_dispatch_count := v_dispatch_count + 4;
    END LOOP;

    -- 6. Create downstream work queues
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- 7. Create delivery assignment
    INSERT INTO delivery_assignments (
        order_id, branch_id, status,
        customer_name, customer_phone, delivery_address, delivery_notes,
        assigned_at, created_at, updated_at
    ) VALUES (
        p_order_id, v_order.branch_id, 'pending_rider',
        v_order.customer_name, v_order.customer_phone, v_order.delivery_address, v_order.notes,
        v_now, v_now, v_now
    ) ON CONFLICT (order_id) DO NOTHING;

    -- 8. Event log
    PERFORM log_erp_event(
        'website_order_auto_accepted', 'order', p_order_id, NULL, 'system', v_order.branch_id,
        jsonb_build_object(
            'order_number', v_order.order_number,
            'order_source', 'website',
            'kot_count', v_kot_count,
            'dispatch_count', v_dispatch_count,
            'delivery_assignment', true
        )
    );

    -- 9. Notify kitchen
    PERFORM notify_role(v_order.branch_id, 'kitchen', 'website_order',
        '🌐 Website Order — #' || v_order.order_number,
        'Auto-accepted delivery order. ' || v_kot_count || ' KOT(s).',
        'language', 'deep-purple', '/kitchen', 'order', p_order_id, NULL);

    -- 10. Notify manager
    PERFORM notify_role(v_order.branch_id, 'manager', 'website_order',
        '🌐 New Website Order — #' || v_order.order_number,
        'Delivery order auto-accepted. Customer: ' || COALESCE(v_order.customer_name, 'N/A'),
        'language', 'blue', '/manager-app/orders', 'order', p_order_id, NULL);

    -- 11. Notify cashier
    PERFORM notify_role(v_order.branch_id, 'cashier', 'website_order',
        '🌐 Website Billing — #' || v_order.order_number,
        'Delivery order queued for billing.',
        'point_of_sale', 'deep-orange', '/pos', 'order', p_order_id, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'kot_count', v_kot_count,
        'dispatch_count', v_dispatch_count,
        'delivery_assignment', true,
        'queues_created', jsonb_build_object('cashier', true, 'inventory', true, 'finance', true)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_website_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_website_order(UUID) TO service_role;


-- Trigger: auto-fire accept_website_order on INSERT for website orders
CREATE OR REPLACE FUNCTION public.trg_fn_auto_accept_website_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_source = 'website' AND NEW.status = 'pending_waiter' THEN
        PERFORM accept_website_order(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_accept_website_order ON orders;
CREATE TRIGGER trg_auto_accept_website_order
AFTER INSERT ON orders
FOR EACH ROW
WHEN (NEW.order_source = 'website')
EXECUTE FUNCTION trg_fn_auto_accept_website_order();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  DELIVERY RIDER RPCs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 3A. Rider accepts a delivery assignment
CREATE OR REPLACE FUNCTION public.rider_accept_delivery(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_assignment RECORD;
    v_rider_id   UUID := auth.uid();
    v_now        TIMESTAMPTZ := now();
    v_rider_name TEXT;
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

    -- Accept
    UPDATE delivery_assignments
    SET rider_id = v_rider_id,
        status = 'accepted',
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = p_assignment_id;

    -- Event log
    SELECT full_name INTO v_rider_name FROM profiles WHERE id = v_rider_id;

    PERFORM log_erp_event(
        'delivery_accepted', 'delivery', p_assignment_id, v_rider_id, 'delivery',
        v_assignment.branch_id,
        jsonb_build_object(
            'rider_name', COALESCE(v_rider_name, 'Unknown'),
            'order_id', v_assignment.order_id
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
        'status', 'accepted'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_accept_delivery(UUID) TO authenticated;


-- 3B. Rider marks picked up (collected food from kitchen)
CREATE OR REPLACE FUNCTION public.rider_mark_picked_up(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_assignment RECORD;
    v_rider_id   UUID := auth.uid();
    v_now        TIMESTAMPTZ := now();
BEGIN
    IF v_rider_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    SELECT * INTO v_assignment FROM delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Assignment not found.');
    END IF;

    -- Only the assigned rider or admin/manager can mark picked up
    IF v_assignment.rider_id != v_rider_id
       AND NOT (auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not your delivery.');
    END IF;

    -- Idempotent
    IF v_assignment.status = 'picked_up' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already marked as picked up.');
    END IF;

    IF v_assignment.status != 'accepted' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Cannot mark picked up. Status: ' || v_assignment.status);
    END IF;

    UPDATE delivery_assignments
    SET status = 'picked_up', picked_up_at = v_now, updated_at = v_now
    WHERE id = p_assignment_id;

    PERFORM log_erp_event(
        'delivery_picked_up', 'delivery', p_assignment_id, v_rider_id, 'delivery',
        v_assignment.branch_id,
        jsonb_build_object('order_id', v_assignment.order_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'order_id', v_assignment.order_id,
        'status', 'picked_up'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_mark_picked_up(UUID) TO authenticated;


-- 3C. Rider marks delivered (delivery completed)
CREATE OR REPLACE FUNCTION public.rider_mark_delivered(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_assignment RECORD;
    v_rider_id   UUID := auth.uid();
    v_now        TIMESTAMPTZ := now();
    v_rider_name TEXT;
BEGIN
    IF v_rider_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    SELECT * INTO v_assignment FROM delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Assignment not found.');
    END IF;

    -- Only the assigned rider or admin/manager
    IF v_assignment.rider_id != v_rider_id
       AND NOT (auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not your delivery.');
    END IF;

    -- Idempotent
    IF v_assignment.status = 'delivered' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already marked as delivered.');
    END IF;

    IF v_assignment.status NOT IN ('accepted', 'picked_up') THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Cannot mark delivered. Status: ' || v_assignment.status);
    END IF;

    -- Mark delivery as completed
    UPDATE delivery_assignments
    SET status = 'delivered', delivered_at = v_now, updated_at = v_now
    WHERE id = p_assignment_id;

    -- Also update the order status to 'served' (delivered = served for delivery orders)
    -- Include 'invoiced' because cashier may invoice before delivery completes
    UPDATE orders
    SET status = 'served', updated_at = v_now
    WHERE id = v_assignment.order_id
      AND status IN ('accepted', 'preparing', 'ready', 'invoiced');

    -- Event log
    SELECT full_name INTO v_rider_name FROM profiles WHERE id = v_rider_id;

    PERFORM log_erp_event(
        'delivery_completed', 'delivery', p_assignment_id, v_rider_id, 'delivery',
        v_assignment.branch_id,
        jsonb_build_object(
            'rider_name', COALESCE(v_rider_name, 'Unknown'),
            'order_id', v_assignment.order_id,
            'delivery_time_minutes', EXTRACT(EPOCH FROM (v_now - v_assignment.assigned_at)) / 60
        )
    );

    -- Notify manager + cashier
    PERFORM notify_role(v_assignment.branch_id, 'manager', 'delivery_completed',
        '✅ Delivery Completed',
        'Order delivered by ' || COALESCE(v_rider_name, 'Rider') || '.',
        'check_circle', 'green', '/manager-app/orders', 'delivery', p_assignment_id, v_rider_id);

    PERFORM notify_role(v_assignment.branch_id, 'cashier', 'delivery_completed',
        '✅ Delivery Done — Ready for Billing',
        'Delivery completed. Order ready for invoicing.',
        'point_of_sale', 'green', '/pos', 'order', v_assignment.order_id, v_rider_id);

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'order_id', v_assignment.order_id,
        'status', 'delivered'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rider_mark_delivered(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  KITCHEN-READY → RIDER NOTIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- When an order goes to 'ready' status AND it has a delivery assignment,
-- notify the assigned rider.

CREATE OR REPLACE FUNCTION public.trg_fn_notify_rider_order_ready()
RETURNS TRIGGER AS $$
DECLARE
    v_assignment RECORD;
    v_kitchen_name TEXT;
BEGIN
    -- Only fire when order becomes 'ready' AND it's a website/delivery order
    IF NEW.status = 'ready'
       AND OLD.status IN ('accepted', 'preparing')
       AND NEW.order_source = 'website'
    THEN
        -- Find the delivery assignment
        SELECT * INTO v_assignment
        FROM delivery_assignments
        WHERE order_id = NEW.id
          AND status IN ('pending_rider', 'accepted');

        IF FOUND AND v_assignment.rider_id IS NOT NULL THEN
            -- Direct notification to the assigned rider
            INSERT INTO notifications (
                user_id, branch_id, type, title, message,
                icon, color, action_url, ref_type, ref_id
            ) VALUES (
                v_assignment.rider_id,
                NEW.branch_id,
                'delivery_food_ready',
                '🔔 Food Ready for Pickup!',
                'Order #' || NEW.order_number || ' is ready. Go to kitchen for collection.',
                'local_fire_department',
                'green',
                '/delivery-app/active',
                'delivery',
                v_assignment.id
            );
        END IF;

        -- Also notify all delivery role users (broadcast for unassigned or backup)
        PERFORM notify_role(NEW.branch_id, 'delivery', 'food_ready_for_delivery',
            '🍽️ Order #' || NEW.order_number || ' Ready!',
            'Delivery order food is ready for pickup.',
            'local_fire_department', 'green', '/delivery-app', 'order', NEW.id, NULL);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_rider_order_ready ON orders;
CREATE TRIGGER trg_notify_rider_order_ready
AFTER UPDATE OF status ON orders
FOR EACH ROW
WHEN (NEW.status = 'ready' AND NEW.order_source = 'website')
EXECUTE FUNCTION trg_fn_notify_rider_order_ready();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  INDEXES, REALTIME, GRANTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Ensure 'delivery' role exists in RBAC
INSERT INTO roles (name) VALUES ('delivery')
ON CONFLICT (name) DO NOTHING;

-- Ensure 'delivery' is in user_roles if using the auth_has_role pattern
-- (The auth_has_role function already reads from user_roles, so this is
-- handled at user-creation time in the admin panel.)

-- Realtime publication
ALTER TABLE delivery_assignments REPLICA IDENTITY FULL;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_assignments;
EXCEPTION WHEN duplicate_object THEN
    -- Already added
    NULL;
END $$;

-- RLS Policies for delivery_assignments
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view delivery assignments for their branch
DROP POLICY IF EXISTS "delivery_assignments_select" ON delivery_assignments;
CREATE POLICY "delivery_assignments_select"
ON delivery_assignments FOR SELECT
TO authenticated
USING (
    -- Delivery riders, managers, admins can see their branch assignments
    branch_id IN (
        SELECT branch_id FROM user_roles
        WHERE user_id = auth.uid()
    )
    OR auth_has_role('admin')
);

-- Delivery riders can update their own assignments (accept, pick up, deliver)
DROP POLICY IF EXISTS "delivery_assignments_update" ON delivery_assignments;
CREATE POLICY "delivery_assignments_update"
ON delivery_assignments FOR UPDATE
TO authenticated
USING (
    rider_id = auth.uid()
    OR rider_id IS NULL  -- pending assignments can be claimed
    OR auth_has_role('admin')
    OR auth_has_role('manager')
);

-- System/service_role can insert (auto-accept trigger)
DROP POLICY IF EXISTS "delivery_assignments_insert" ON delivery_assignments;
CREATE POLICY "delivery_assignments_insert"
ON delivery_assignments FOR INSERT
TO authenticated
WITH CHECK (
    auth_has_role('admin')
    OR auth_has_role('manager')
);

-- Allow service_role full access (for triggers)
DROP POLICY IF EXISTS "delivery_assignments_service" ON delivery_assignments;
CREATE POLICY "delivery_assignments_service"
ON delivery_assignments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DONE ✅
-- ═══════════════════════════════════════════════════════════════════════════════
