-- =============================================================
-- FIX: Waiter Dashboard Visibility (Full RLS & Logic Restore)
-- This script ensures Waiters can see Orders, Items, and KOTs.
-- =============================================================

-- 1. Ensure assigned_waiter_id exists (safety check)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_waiter_id') THEN
        ALTER TABLE orders ADD COLUMN assigned_waiter_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Restore the FULL ERP Dispatch version of accept_order_as_waiter
-- This version generates KOT tickets and dispatches them to ERP queues.
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
    IF v_waiter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotency
    IF (v_order.status = 'accepted' OR v_order.status = 'preparing') AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order already accepted.', 'order_id', p_order_id);
    END IF;

    IF v_order.status != 'pending_waiter' AND v_order.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order no longer pending. Status: ' || v_order.status);
    END IF;

    -- Verify Shift
    IF NOT public.auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not on shift for this branch.');
    END IF;

    -- Accept (fires generate_kot_on_accept trigger)
    UPDATE orders
    SET status = 'accepted', assigned_waiter_id = v_waiter_id, updated_at = v_now
    WHERE id = p_order_id;

    -- Log timeline
    INSERT INTO order_status_events (order_id, event_code, old_status, new_status, actor_user_id)
    VALUES (p_order_id, 'waiter_accepted', v_order.status, 'accepted', v_waiter_id);

    -- Dispatch KOTs to Queues
    FOR v_kot IN SELECT * FROM kot_tickets WHERE order_id = p_order_id LOOP
        -- KITCHEN
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;
        
        -- Others (Immediate Delivered)
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        SELECT p_order_id, v_kot.id, t, 'delivered', v_now, v_now
        FROM unnest(ARRAY['CASHIER', 'INVENTORY', 'FINANCE']) t
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_dispatch_count := v_dispatch_count + 4;
    END LOOP;

    -- Work Queues
    INSERT INTO cashier_queue (order_id, branch_id, status) VALUES (p_order_id, v_order.branch_id, 'open') ON CONFLICT (order_id) DO NOTHING;
    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage) VALUES (p_order_id, v_order.branch_id, 'pending', 'on_paid') ON CONFLICT (order_id) DO NOTHING;
    INSERT INTO finance_queue (order_id, branch_id, status) VALUES (p_order_id, v_order.branch_id, 'pending') ON CONFLICT (order_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'kot_count', (SELECT count(*) FROM kot_tickets WHERE order_id = p_order_id));
END;
$$;

-- 3. Update RLS Policies to be Shift-Aware (Crucial for visibility)

-- Enable RLS
ALTER TABLE order_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kot_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE kot_items    ENABLE ROW LEVEL SECURITY;

-- ORDER ITEMS Policy (Shift-Aware)
DROP POLICY IF EXISTS "waiter_select_order_items" ON order_items;
CREATE POLICY "waiter_select_order_items" ON order_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders o 
        WHERE o.id = order_items.order_id 
        AND (
            public.auth_is_on_shift(o.branch_id) 
            OR o.assigned_waiter_id = auth.uid()
        )
    )
    OR public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR kitchen_id = ANY(public.auth_kitchen_ids())
);

-- KOT TICKETS Policy (Shift-Aware)
DROP POLICY IF EXISTS "waiter_select_kot_tickets" ON kot_tickets;
CREATE POLICY "waiter_select_kot_tickets" ON kot_tickets FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM orders o 
        WHERE o.id = kot_tickets.order_id 
        AND (
            public.auth_is_on_shift(o.branch_id) 
            OR o.assigned_waiter_id = auth.uid()
        )
    )
    OR public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR kitchen_id = ANY(public.auth_kitchen_ids())
);

-- KOT ITEMS Policy (Shift-Aware)
DROP POLICY IF EXISTS "waiter_select_kot_items" ON kot_items;
CREATE POLICY "waiter_select_kot_items" ON kot_items FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM kot_tickets kt
        JOIN orders o ON o.id = kt.order_id
        WHERE kt.id = kot_items.kot_id
        AND (
            public.auth_is_on_shift(o.branch_id)
            OR o.assigned_waiter_id = auth.uid()
        )
    )
    OR public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR EXISTS (
        SELECT 1 FROM kot_tickets kt 
        WHERE kt.id = kot_items.kot_id 
        AND kt.kitchen_id = ANY(public.auth_kitchen_ids())
    )
);

-- 4. Fix KOT Generation Trigger (ensure it handles existing pending items)
CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN
        FOR r IN 
            SELECT DISTINCT kitchen_id FROM order_items 
            WHERE order_id = NEW.id AND status = 'queued' AND kitchen_id IS NOT NULL
        LOOP
            INSERT INTO kot_tickets(order_id, kitchen_id, status)
            VALUES (NEW.id, r.kitchen_id, 'created')
            RETURNING id INTO v_kot_id;

            INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
            SELECT v_kot_id, id, quantity, 'queued' FROM order_items
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status = 'queued';

            UPDATE order_items SET status = 'sent_to_kitchen'
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status = 'queued';
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_kot ON orders;
CREATE TRIGGER trg_generate_kot AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION generate_kot_on_accept();

-- Helper for manual generation (Defined before DO block)
CREATE OR REPLACE FUNCTION generate_kot_on_accept_manual(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
    v_branch_id UUID;
BEGIN
    SELECT branch_id INTO v_branch_id FROM orders WHERE id = p_order_id;
    
    FOR r IN 
        SELECT DISTINCT kitchen_id FROM order_items 
        WHERE order_id = p_order_id AND status = 'queued' AND kitchen_id IS NOT NULL
    LOOP
        INSERT INTO kot_tickets(order_id, kitchen_id, status)
        VALUES (p_order_id, r.kitchen_id, 'created')
        RETURNING id INTO v_kot_id;

        INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, id, quantity, 'queued' FROM order_items
        WHERE order_id = p_order_id AND kitchen_id = r.kitchen_id AND status = 'queued';

        UPDATE order_items SET status = 'sent_to_kitchen'
        WHERE order_id = p_order_id AND kitchen_id = r.kitchen_id AND status = 'queued';
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. REPAIR EXISTING DATA
-- If an order was accepted but has no KOTs, generate them now
DO $$
DECLARE
    v_ord RECORD;
BEGIN
    FOR v_ord IN SELECT * FROM orders WHERE status = 'accepted' AND id NOT IN (SELECT order_id FROM kot_tickets) LOOP
        -- Simulate trigger logic manually for missed orders
        PERFORM public.generate_kot_on_accept_manual(v_ord.id);
    END LOOP;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
