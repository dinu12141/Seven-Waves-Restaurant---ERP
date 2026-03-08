-- =============================================================
-- FIX: Restore Waiter KOT generation & Full ERP Dispatch
-- This script combines shift awareness with full KOT orchestration.
-- =============================================================

-- Ensure assigned_waiter_id exists (redundant but safe)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_waiter_id') THEN
        ALTER TABLE orders ADD COLUMN assigned_waiter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 1. Correct the DUMB version of accept_order_as_waiter
-- This version was accidentally overwriting the full ERP dispatch version.
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order          RECORD;
    v_waiter_id      UUID := auth.uid();
    v_kot            RECORD;
    v_now            TIMESTAMPTZ := now();
    v_dispatch_count INT := 0;
BEGIN
    -- 1. Authentication & Role Check
    IF v_waiter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    -- 2. Lock and fetch order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- 3. Idempotency Check
    IF (v_order.status = 'accepted' OR v_order.status = 'preparing') 
        AND (v_order.assigned_waiter_id IS NOT NULL OR v_order.waiter_id IS NOT NULL) THEN
        RETURN jsonb_build_object(
            'success', true, 
            'message', 'Order already accepted.',
            'order_id', p_order_id
        );
    END IF;

    -- 4. Status Check
    IF v_order.status != 'pending_waiter' AND v_order.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is no longer pending. Status: ' || v_order.status);
    END IF;

    -- 5. Shift Awareness Check (WAITERS ONLY)
    -- Admins and managers can accept any order for their branches
    IF NOT public.auth_is_on_shift(v_order.branch_id) THEN
        -- Allow if user has admin/manager role (fallback for backoffice override)
        IF NOT (public.auth_has_role('admin') OR public.auth_has_role('manager')) THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are not on shift for this branch.');
        END IF;
    END IF;

    -- 6. ACCEPT THE ORDER
    -- This fires the generate_kot_on_accept trigger automatically
    UPDATE orders
    SET status = 'accepted', 
        assigned_waiter_id = v_waiter_id,
        waiter_id = v_waiter_id, -- Keep both synced for compatibility
        updated_at = v_now
    WHERE id = p_order_id;

    -- 7. Log acceptance event (for timeline)
    INSERT INTO order_status_events (
        order_id, old_status, new_status, created_by,
        event_code, actor_user_id, payload, created_at
    ) VALUES (
        p_order_id, v_order.status, 'accepted', v_waiter_id,
        'waiter_accepted', v_waiter_id,
        jsonb_build_object('waiter_id', v_waiter_id, 'branch_id', v_order.branch_id),
        v_now
    );

    -- 8. FETCH GENERATED KOTs & DISPATCH
    -- The trigger generate_kot_on_accept created the kot_tickets already.
    -- Now we create the dispatch records for the ERP queues.
    FOR v_kot IN SELECT * FROM kot_tickets WHERE order_id = p_order_id LOOP
        -- KITCHEN target
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- CASHIER target
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- INVENTORY target
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- FINANCE target
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_dispatch_count := v_dispatch_count + 4;
    END LOOP;

    -- 9. Create downstream work queues if they don't exist
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_paid', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success',            true,
        'order_id',           p_order_id,
        'assigned_waiter_id', v_waiter_id,
        'kot_count',          (SELECT count(*) FROM kot_tickets WHERE order_id = p_order_id),
        'dispatch_count',     v_dispatch_count,
        'queues_created',     jsonb_build_object('cashier', true, 'inventory', true, 'finance', true)
    );
END;
$$;

-- Grant permissions again
GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;

-- =============================================================
-- Ensure the KOT trigger handles items properly
-- =============================================================

CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
    v_default_kitchen_id UUID;
BEGIN
    -- This fires when the order is accepted
    IF NEW.status = 'accepted' AND (OLD.status = 'pending' OR OLD.status = 'pending_waiter') THEN

        -- 1. Find a default kitchen for this branch just in case items don't have one
        SELECT id INTO v_default_kitchen_id FROM kitchens WHERE branch_id = NEW.branch_id AND is_active = true LIMIT 1;

        -- 2. Group items by kitchen_id
        FOR r IN 
            SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen_id) as target_kitchen_id
            FROM order_items 
            WHERE order_id = NEW.id 
              AND status = 'queued'
        LOOP
            IF r.target_kitchen_id IS NOT NULL THEN
                -- Create KOT Ticket
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (NEW.id, r.target_kitchen_id, 'created')
                RETURNING id INTO v_kot_id;

                -- Link items to this KOT
                INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
                SELECT v_kot_id, id, quantity, 'queued'
                FROM order_items
                WHERE order_id = NEW.id
                  AND COALESCE(kitchen_id, v_default_kitchen_id) = r.target_kitchen_id
                  AND status = 'queued';

                -- Update item status
                UPDATE order_items
                SET status = 'sent_to_kitchen',
                    kitchen_id = COALESCE(kitchen_id, v_default_kitchen_id)
                WHERE order_id = NEW.id 
                  AND COALESCE(kitchen_id, v_default_kitchen_id) = r.target_kitchen_id
                  AND status = 'queued';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is correctly named and attached
DROP TRIGGER IF EXISTS trg_generate_kot ON orders;
CREATE TRIGGER trg_generate_kot
AFTER UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION generate_kot_on_accept();

-- =============================================================
-- Final check: Ensure Waiters can read all needed tables for dashboard
-- =============================================================
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
