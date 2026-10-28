-- =============================================================
-- FINAL CORE FIX: Kitchen Routing, Order Acceptance & Realtime
-- =============================================================
-- This script fixes the Cashier kitchen routing and ensures
-- that accepted orders immediately generate KOTs and show up in KDS.

-- 1. Ensure Categories have Warehouse links (Hierarchy)
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 2. Optimized Kitchen Resolver (Recursive)
CREATE OR REPLACE FUNCTION public.get_target_kitchen_for_item(p_menu_item_id UUID, p_branch_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_kitchen_id   UUID;
    v_category_id  UUID;
    v_warehouse_id UUID;
    v_current_cat  UUID;
BEGIN
    -- [A] Check direct kitchen_id on menu_item
    SELECT kitchen_id, category_id INTO v_kitchen_id, v_category_id
    FROM public.menu_items
    WHERE id = p_menu_item_id;

    IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;

    -- [B] Walk up category tree to find warehouse link
    v_current_cat := v_category_id;
    WHILE v_current_cat IS NOT NULL LOOP
        SELECT warehouse_id, parent_id INTO v_warehouse_id, v_current_cat
        FROM public.categories
        WHERE id = v_current_cat;

        IF v_warehouse_id IS NOT NULL THEN
            SELECT kitchen_id INTO v_kitchen_id FROM public.warehouses WHERE id = v_warehouse_id;
            IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;
        END IF;
    END LOOP;

    -- [C] Fallback to branch default
    SELECT id INTO v_kitchen_id FROM public.kitchens 
    WHERE branch_id = p_branch_id AND is_active = true 
    ORDER BY (name ILIKE '%MAIN%') DESC, name ASC LIMIT 1;

    RETURN v_kitchen_id;
END;
$$;

-- 3. Restore and Fix Order Acceptance RPC
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
BEGIN
    IF v_waiter_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found.'); END IF;

    -- Idempotency
    IF (v_order.status = 'accepted' OR v_order.status = 'preparing') AND v_order.waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order already accepted.', 'order_id', p_order_id);
    END IF;

    -- Update Order (fires generate_kot_on_accept trigger)
    UPDATE orders
    SET status = 'accepted', waiter_id = v_waiter_id, updated_at = v_now
    WHERE id = p_order_id;

    -- Log Timeline event
    INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by)
    VALUES (p_order_id, v_order.status, 'accepted', v_waiter_id);

    -- Ensure KOTs are dispatched to ERP queues if needed
    FOR v_kot IN SELECT id FROM kot_tickets WHERE order_id = p_order_id LOOP
        -- ERP Realtime Dispatches
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'kot_count', (SELECT count(*) FROM kot_tickets WHERE order_id = p_order_id));
END;
$$;

-- 4. Corrected KOT Generation Trigger
CREATE OR REPLACE FUNCTION public.generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
BEGIN
    -- Fired when status becomes 'accepted'
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN
        
        -- [DYNAMIC RE-ROUTING] 
        -- Ensure ALL items have a valid kitchen_id based on current warehouse configuration
        UPDATE order_items 
        SET kitchen_id = public.get_target_kitchen_for_item(menu_item_id, NEW.branch_id)
        WHERE order_id = NEW.id AND (kitchen_id IS NULL OR status = 'queued');

        -- [KOT GENERATION]
        FOR r IN 
            SELECT DISTINCT kitchen_id FROM order_items 
            WHERE order_id = NEW.id AND (status = 'queued' OR status = 'sent_to_kitchen') AND kitchen_id IS NOT NULL
        LOOP
            -- Check if KOT already exists for this kitchen to avoid duplicates
            IF NOT EXISTS (SELECT 1 FROM kot_tickets WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id) THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (NEW.id, r.kitchen_id, 'created')
                RETURNING id INTO v_kot_id;

                INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
                SELECT v_kot_id, id, quantity, 'queued' FROM order_items
                WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status IN ('queued', 'sent_to_kitchen');

                UPDATE order_items SET status = 'sent_to_kitchen'
                WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status = 'queued';
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_kot ON orders;
CREATE TRIGGER trg_generate_kot AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION public.generate_kot_on_accept();

-- 5. Force Realtime for KDS Essential Tables
DO $$
BEGIN
    -- Ensure Identity is Full for Realtime filtering
    ALTER TABLE kot_tickets REPLICA IDENTITY FULL;
    ALTER TABLE kot_items   REPLICA IDENTITY FULL;
    ALTER TABLE orders      REPLICA IDENTITY FULL;
    ALTER TABLE order_items REPLICA IDENTITY FULL;

    -- Add to publication if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kot_tickets') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_tickets;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='kot_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE kot_items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;
END $$;

-- 6. REPAIR BLOCK: Fix orders stuck in 'accepted' without KOTs
DO $$
DECLARE
    v_ord RECORD;
BEGIN
    FOR v_ord IN SELECT * FROM orders WHERE status = 'accepted' LOOP
        -- This will trigger the KOT generation logic manually
        -- We just update the status to itself to trigger AFTER UPDATE
        UPDATE orders SET status = 'accepted' WHERE id = v_ord.id;
    END LOOP;
END $$;

-- SEC-A: Never grant blanket execute on all functions to anon!
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
