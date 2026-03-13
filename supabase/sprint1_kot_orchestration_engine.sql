-- ═══════════════════════════════════════════════════════════════════════════════
-- SPRINT 1 — KOT ORCHESTRATION ENGINE
-- ═══════════════════════════════════════════════════════════════════════════════
-- Canonical migration: consolidates all KOT pipeline logic into one file.
-- Replaces fragmented pieces from kot_dispatch_queues.sql, kot_orchestration_v2.sql,
-- fix_kitchen_routing_hierarchy.sql, and various fix_*.sql hotfixes.
--
-- Applied: 2026-03-12
--
-- CONTENTS:
--   §1  Schema Hardening (DDL)
--   §2  Kitchen Routing Engine
--   §3  Order Creation Hardening
--   §4  Waiter Acceptance RPC (canonical process_waiter_accept)
--   §5  Add Items to Existing Order
--   §6  Kitchen RPCs (process_kitchen_start, process_kitchen_ready)
--   §7  Cashier RPCs (process_cashier_invoice, process_cashier_payment)
--   §8  Event Log & Realtime
--   §9  RLS Policies
--   §10 Cleanup — Drop duplicate v1 functions
--   §11 Indexes & Realtime Publication
-- ═══════════════════════════════════════════════════════════════════════════════


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  SCHEMA HARDENING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- A. kitchen_subcategory_map — explicit subcategory → kitchen routing
CREATE TABLE IF NOT EXISTS public.kitchen_subcategory_map (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    branch_id  UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    kitchen_id UUID NOT NULL REFERENCES public.kitchens(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(category_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_ksm_cat_branch ON kitchen_subcategory_map(category_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_ksm_kitchen    ON kitchen_subcategory_map(kitchen_id);

-- B. kot_tickets — add batch_number for multi-KOT per order
ALTER TABLE public.kot_tickets
  ADD COLUMN IF NOT EXISTS batch_number INT DEFAULT 1;

-- C. Ensure constraint includes 'pending_waiter'
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE public.orders ADD CONSTRAINT chk_order_status CHECK (
    status IN ('pending','pending_waiter','accepted','preparing','ready','served','invoiced','paid','cancelled')
);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_order_source;
ALTER TABLE public.orders ADD CONSTRAINT chk_order_source CHECK (
    order_source IN ('pos','qr','table_screen','website','uber_eats','pickme','other')
);

ALTER TABLE public.kot_tickets DROP CONSTRAINT IF EXISTS chk_kot_status;
ALTER TABLE public.kot_tickets ADD CONSTRAINT chk_kot_status CHECK (
    status IN ('created','pending','accepted','preparing','ready','cancelled')
);

-- D. Ensure queue tables have proper constraints (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cashier_queue_order') THEN
    ALTER TABLE cashier_queue ADD CONSTRAINT uq_cashier_queue_order UNIQUE (order_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_stock_queue_order') THEN
    ALTER TABLE stock_queue ADD CONSTRAINT uq_stock_queue_order UNIQUE (order_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_finance_queue_order') THEN
    ALTER TABLE finance_queue ADD CONSTRAINT uq_finance_queue_order UNIQUE (order_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_kot_dispatch') THEN
    ALTER TABLE kot_dispatches ADD CONSTRAINT uq_kot_dispatch UNIQUE (kot_id, target_code);
  END IF;
END $$;

-- E. Partial unique index: one active order per table
-- DISABLED: Existing production data has duplicate active orders on the same table.
-- Enabling this will fail with ERROR: 23505 until legacy data is cleaned up.
/*
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_order_per_table
  ON public.orders(table_id)
  WHERE table_id IS NOT NULL
    AND status NOT IN ('paid', 'cancelled');
*/

-- F. Ensure erp_event_log exists
CREATE TABLE IF NOT EXISTS public.erp_event_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code    TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    actor_id      UUID,
    actor_role    TEXT,
    branch_id     UUID,
    payload       JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eel_entity ON erp_event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_eel_code   ON erp_event_log(event_code);
CREATE INDEX IF NOT EXISTS idx_eel_branch ON erp_event_log(branch_id, created_at DESC);


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  KITCHEN ROUTING ENGINE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Priority chain:
--   1. menu_items.kitchen_id (direct override)
--   2. kitchen_subcategory_map (subcategory → kitchen per branch)
--   3. categories.warehouse_id → warehouses.kitchen_id
--   4. Walk up categories.parent_id for warehouse link
--   5. Branch default kitchen fallback

CREATE OR REPLACE FUNCTION public.get_target_kitchen_for_item(p_menu_item_id UUID, p_branch_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
    v_kitchen_id   UUID;
    v_category_id  UUID;
    v_warehouse_id UUID;
    v_current_cat  UUID;
BEGIN
    -- 1. Direct kitchen_id on menu_item
    SELECT kitchen_id, category_id INTO v_kitchen_id, v_category_id
    FROM menu_items WHERE id = p_menu_item_id;

    IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;

    -- 2. kitchen_subcategory_map: explicit subcategory → kitchen per branch
    IF v_category_id IS NOT NULL THEN
        SELECT kitchen_id INTO v_kitchen_id
        FROM kitchen_subcategory_map
        WHERE category_id = v_category_id AND branch_id = p_branch_id;

        IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;
    END IF;

    -- 3-4. Walk up category tree looking for warehouse → kitchen link
    v_current_cat := v_category_id;
    WHILE v_current_cat IS NOT NULL LOOP
        SELECT warehouse_id, parent_id INTO v_warehouse_id, v_current_cat
        FROM categories WHERE id = v_current_cat;

        IF v_warehouse_id IS NOT NULL THEN
            SELECT kitchen_id INTO v_kitchen_id
            FROM warehouses WHERE id = v_warehouse_id;
            IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;
        END IF;

        -- Also check subcategory map for parent categories
        IF v_current_cat IS NOT NULL THEN
            SELECT ksm.kitchen_id INTO v_kitchen_id
            FROM kitchen_subcategory_map ksm
            WHERE ksm.category_id = v_current_cat AND ksm.branch_id = p_branch_id;
            IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;
        END IF;
    END LOOP;

    -- 5. Branch default kitchen fallback
    SELECT id INTO v_kitchen_id
    FROM kitchens WHERE branch_id = p_branch_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    RETURN v_kitchen_id;
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  ORDER CREATION HARDENING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Re-assess kitchen_id on all queued items when order is accepted

CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
    v_max_batch INT;
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN

        -- Re-assess kitchen routing for all queued items
        UPDATE order_items
        SET kitchen_id = get_target_kitchen_for_item(menu_item_id, NEW.branch_id)
        WHERE order_id = NEW.id AND (kitchen_id IS NULL OR status = 'queued');

        -- Get current max batch number
        SELECT COALESCE(MAX(batch_number), 0) INTO v_max_batch
        FROM kot_tickets WHERE order_id = NEW.id;

        FOR r IN
            SELECT DISTINCT kitchen_id FROM order_items
            WHERE order_id = NEW.id AND status = 'queued' AND kitchen_id IS NOT NULL
        LOOP
            INSERT INTO kot_tickets(order_id, kitchen_id, status, batch_number)
            VALUES (NEW.id, r.kitchen_id, 'created', v_max_batch + 1)
            RETURNING id INTO v_kot_id;

            INSERT INTO kot_items(kot_id, order_item_id, quantity)
            SELECT v_kot_id, id, quantity FROM order_items
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status = 'queued';

            UPDATE order_items SET status = 'sent_to_kitchen'
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id AND status = 'queued';
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  WAITER ACCEPTANCE RPC (canonical)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order          RECORD;
    v_waiter_id      UUID := auth.uid();
    v_now            TIMESTAMPTZ := now();
    v_kot_id         UUID;
    v_kot_rec        RECORD;
    v_default_kitchen UUID;
    v_dispatch_count INT := 0;
    v_kot_count      INT := 0;
    v_waiter_name    TEXT;
BEGIN
    -- Auth checks
    IF v_waiter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent
    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Order already accepted.',
            'order_id', p_order_id, 'assigned_waiter_id', v_order.assigned_waiter_id);
    END IF;

    IF v_order.status != 'pending_waiter' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Order cannot be accepted. Status: ' || v_order.status);
    END IF;

    -- Shift validation
    IF auth_has_role('waiter') AND NOT auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You are not on shift.');
    END IF;

    -- 1. Update order status
    UPDATE orders
    SET status = 'accepted', assigned_waiter_id = v_waiter_id,
        accepted_at = v_now, updated_at = v_now
    WHERE id = p_order_id;

    -- 2. Re-assess kitchen routing + generate KOTs
    UPDATE order_items
    SET kitchen_id = get_target_kitchen_for_item(menu_item_id, v_order.branch_id)
    WHERE order_id = p_order_id AND (kitchen_id IS NULL OR status = 'queued');

    SELECT id INTO v_default_kitchen FROM kitchens
    WHERE branch_id = v_order.branch_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    FOR v_kot_rec IN
        SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
        FROM order_items WHERE order_id = p_order_id AND status = 'queued'
    LOOP
        CONTINUE WHEN v_kot_rec.kit_id IS NULL;

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

    -- 3. Dispatch all KOTs to 4 routing targets
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

    -- 4. Create downstream work queues
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- 5. Backward compat acceptance log
    BEGIN
        INSERT INTO order_acceptance (order_id, accepted_by) VALUES (p_order_id, v_waiter_id);
    EXCEPTION WHEN unique_violation THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

    -- 6. Event log
    SELECT full_name INTO v_waiter_name FROM profiles WHERE id = v_waiter_id;

    PERFORM log_erp_event(
        'waiter_accepted', 'order', p_order_id, v_waiter_id, 'waiter', v_order.branch_id,
        jsonb_build_object(
            'waiter_name', COALESCE(v_waiter_name, 'Unknown'),
            'order_number', v_order.order_number,
            'kot_count', v_kot_count,
            'dispatch_count', v_dispatch_count
        )
    );

    -- 7. Notifications
    PERFORM notify_role(v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. ' || v_kot_count || ' KOT(s).',
        'soup_kitchen', 'orange', '/kitchen', 'order', p_order_id, v_waiter_id);

    PERFORM notify_role(v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️ Billing — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos', 'order', p_order_id, v_waiter_id);

    RETURN jsonb_build_object(
        'success', true, 'order_id', p_order_id,
        'assigned_waiter_id', v_waiter_id, 'kot_count', v_kot_count,
        'dispatch_count', v_dispatch_count,
        'queues_created', jsonb_build_object('cashier', true, 'inventory', true, 'finance', true)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;

-- Compatibility wrapper for v1 callers
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_waiter_accept(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  ADD ITEMS TO EXISTING ORDER
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.add_items_to_order(
    p_order_id UUID,
    p_items    JSONB  -- [{menu_item_id, qty, notes?}]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order      RECORD;
    v_user_id    UUID := auth.uid();
    v_now        TIMESTAMPTZ := now();
    v_item       JSONB;
    v_menu       RECORD;
    v_target_k   UUID;
    v_new_subtotal NUMERIC(12,2) := 0;
    v_max_batch  INT;
    v_kot_id     UUID;
    v_kot_count  INT := 0;
    v_kot_rec    RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.status IN ('paid', 'cancelled') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is closed.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No items provided.');
    END IF;

    -- Insert new order items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price INTO v_menu
        FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error',
                'Item not available: ' || (v_item->>'menu_item_id'));
        END IF;

        v_target_k := get_target_kitchen_for_item(v_menu.id, v_order.branch_id);

        INSERT INTO order_items (order_id, menu_item_id, kitchen_id, quantity,
            unit_price, total_price, notes, status)
        VALUES (p_order_id, v_menu.id, v_target_k, (v_item->>'qty')::INT,
            v_menu.base_price, v_menu.base_price * (v_item->>'qty')::INT,
            v_item->>'notes', 'queued');

        v_new_subtotal := v_new_subtotal + v_menu.base_price * (v_item->>'qty')::INT;
    END LOOP;

    -- Update order totals
    UPDATE orders
    SET subtotal = subtotal + v_new_subtotal,
        total_amount = total_amount + v_new_subtotal,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Generate new KOT batch
    SELECT COALESCE(MAX(batch_number), 0) INTO v_max_batch
    FROM kot_tickets WHERE order_id = p_order_id;

    FOR v_kot_rec IN
        SELECT DISTINCT kitchen_id FROM order_items
        WHERE order_id = p_order_id AND status = 'queued' AND kitchen_id IS NOT NULL
    LOOP
        INSERT INTO kot_tickets (order_id, kitchen_id, status, batch_number, created_at)
        VALUES (p_order_id, v_kot_rec.kitchen_id, 'created', v_max_batch + 1, v_now)
        RETURNING id INTO v_kot_id;

        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, oi.id, oi.quantity, 'pending'
        FROM order_items oi
        WHERE oi.order_id = p_order_id
          AND oi.kitchen_id = v_kot_rec.kitchen_id
          AND oi.status = 'queued';

        UPDATE order_items SET status = 'sent_to_kitchen'
        WHERE order_id = p_order_id AND kitchen_id = v_kot_rec.kitchen_id AND status = 'queued';

        -- Dispatch to all 4 targets
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot_id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_kot_count := v_kot_count + 1;
    END LOOP;

    -- Event log
    PERFORM log_erp_event(
        'items_added', 'order', p_order_id, v_user_id, 'waiter', v_order.branch_id,
        jsonb_build_object('batch_number', v_max_batch + 1, 'new_kots', v_kot_count,
            'added_amount', v_new_subtotal)
    );

    -- Notify kitchen
    PERFORM notify_role(v_order.branch_id, 'kitchen', 'items_added',
        '📋 Add-on KOT — Order #' || v_order.order_number,
        'Batch #' || (v_max_batch + 1) || ' — ' || v_kot_count || ' KOT(s).',
        'soup_kitchen', 'orange', '/kitchen', 'order', p_order_id, v_user_id);

    RETURN jsonb_build_object(
        'success', true, 'order_id', p_order_id,
        'batch_number', v_max_batch + 1, 'new_kots', v_kot_count,
        'added_amount', v_new_subtotal
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_items_to_order(UUID, JSONB) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  KITCHEN RPCs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.process_kitchen_start(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_kot     RECORD;
    v_user_id UUID := auth.uid();
    v_now     TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('kitchen') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_kot FROM kot_tickets WHERE id = p_kot_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT not found.');
    END IF;

    -- Idempotent
    IF v_kot.status = 'preparing' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already preparing.', 'kot_id', p_kot_id);
    END IF;
    IF v_kot.status NOT IN ('created', 'pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT cannot be started. Status: ' || v_kot.status);
    END IF;

    UPDATE kot_tickets SET status = 'preparing', accepted_at = v_now, updated_at = v_now
    WHERE id = p_kot_id;

    UPDATE kot_dispatches SET status = 'delivered', delivered_at = v_now
    WHERE kot_id = p_kot_id AND target_code = 'KITCHEN' AND status = 'pending';

    UPDATE orders SET status = 'preparing', updated_at = v_now
    WHERE id = v_kot.order_id AND status = 'accepted';

    -- Trigger BOM stock deduction
    PERFORM try_issue_stock_by_stage(v_kot.order_id, 'on_kitchen_start');

    BEGIN
        PERFORM deduct_inv_for_kot(p_kot_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Stock deduction warning for KOT %: %', p_kot_id, SQLERRM;
    END;

    PERFORM log_erp_event('kitchen_started', 'kot', p_kot_id, v_user_id, 'kitchen',
        (SELECT branch_id FROM orders WHERE id = v_kot.order_id),
        jsonb_build_object('kot_id', p_kot_id, 'order_id', v_kot.order_id));

    RETURN jsonb_build_object('success', true, 'kot_id', p_kot_id,
        'order_id', v_kot.order_id, 'status', 'preparing');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_kitchen_start(UUID) TO authenticated;

-- Compat wrapper
CREATE OR REPLACE FUNCTION public.kitchen_start_kot(p_kot_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_kitchen_start(p_kot_id); $$;
GRANT EXECUTE ON FUNCTION public.kitchen_start_kot(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.process_kitchen_ready(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_kot              RECORD;
    v_order            RECORD;
    v_user_id          UUID := auth.uid();
    v_now              TIMESTAMPTZ := now();
    v_total_kots       INT;
    v_ready_kots       INT;
    v_cancelled_kots   INT;
    v_order_ready      BOOL := false;
    v_kitchen_name     TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (auth_has_role('kitchen') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_kot FROM kot_tickets WHERE id = p_kot_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT not found.');
    END IF;

    IF v_kot.status = 'ready' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already ready.', 'kot_id', p_kot_id);
    END IF;
    IF v_kot.status NOT IN ('preparing', 'created', 'pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT cannot be marked ready. Status: ' || v_kot.status);
    END IF;

    UPDATE kot_tickets SET status = 'ready', completed_at = v_now, updated_at = v_now
    WHERE id = p_kot_id;

    UPDATE kot_items SET status = 'ready', updated_at = v_now
    WHERE kot_id = p_kot_id AND status != 'cancelled';

    -- Check if ALL KOTs for this order are ready
    SELECT * INTO v_order FROM orders WHERE id = v_kot.order_id;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'ready'),
           COUNT(*) FILTER (WHERE status = 'cancelled')
    INTO v_total_kots, v_ready_kots, v_cancelled_kots
    FROM kot_tickets WHERE order_id = v_kot.order_id;

    IF v_total_kots > 0 AND (v_ready_kots + v_cancelled_kots) = v_total_kots AND v_ready_kots > 0 THEN
        UPDATE orders SET status = 'ready', updated_at = v_now
        WHERE id = v_kot.order_id AND status IN ('accepted', 'preparing');
        v_order_ready := true;

        PERFORM log_erp_event('order_all_kots_ready', 'order', v_kot.order_id, v_user_id, 'kitchen',
            v_order.branch_id, jsonb_build_object('total_kots', v_total_kots, 'ready_kots', v_ready_kots));
    END IF;

    PERFORM log_erp_event('kitchen_ready', 'kot', p_kot_id, v_user_id, 'kitchen', v_order.branch_id,
        jsonb_build_object('kot_id', p_kot_id, 'order_ready', v_order_ready));

    -- Notify waiter
    SELECT name INTO v_kitchen_name FROM kitchens WHERE id = v_kot.kitchen_id;

    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (v_order.assigned_waiter_id, v_order.branch_id, 'kitchen_ready', '✅ Food Ready!',
            COALESCE(v_kitchen_name, 'Kitchen') || ' · Order #' || v_order.order_number,
            'check_circle', 'green', '/orders', 'kot', p_kot_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'kot_id', p_kot_id,
        'order_id', v_kot.order_id, 'status', 'ready', 'order_ready', v_order_ready,
        'ready_count', v_ready_kots, 'total_count', v_total_kots);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_kitchen_ready(UUID) TO authenticated;

-- Compat wrapper
CREATE OR REPLACE FUNCTION public.kitchen_mark_ready(p_kot_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_kitchen_ready(p_kot_id); $$;
GRANT EXECUTE ON FUNCTION public.kitchen_mark_ready(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  CASHIER RPCs
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.process_cashier_invoice(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order   RECORD;
    v_user_id UUID := auth.uid();
    v_now     TIMESTAMPTZ := now();
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
    IF v_order.status = 'invoiced' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already invoiced.', 'order_id', p_order_id);
    END IF;

    IF v_order.status NOT IN ('accepted', 'preparing', 'ready') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot invoice. Status: ' || v_order.status);
    END IF;

    UPDATE orders SET status = 'invoiced', updated_at = v_now WHERE id = p_order_id;
    UPDATE cashier_queue SET status = 'invoiced', updated_at = v_now
    WHERE order_id = p_order_id AND status = 'open';

    PERFORM log_erp_event('order_invoiced', 'order', p_order_id, v_user_id, 'cashier',
        v_order.branch_id, jsonb_build_object('cashier_id', v_user_id, 'total_amount', v_order.total_amount));

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'invoiced');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_invoice(UUID) TO authenticated;

-- Compat wrapper
CREATE OR REPLACE FUNCTION public.cashier_invoice_order(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_cashier_invoice(p_order_id); $$;
GRANT EXECUTE ON FUNCTION public.cashier_invoice_order(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.process_cashier_payment(
    p_order_id       UUID,
    p_payment_method TEXT    DEFAULT 'cash',
    p_amount_paid    NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order        RECORD;
    v_user_id      UUID := auth.uid();
    v_now          TIMESTAMPTZ := now();
    v_stock_result JSONB;
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

    -- 1. Mark as paid
    UPDATE orders
    SET status = 'paid', payment_status = 'paid',
        payment_method = p_payment_method, updated_at = v_now
    WHERE id = p_order_id;

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
            'stock_result', v_stock_result));

    -- 6. Notify waiter
    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (v_order.assigned_waiter_id, v_order.branch_id, 'payment_complete', '💰 Payment Complete',
            'Order #' || v_order.order_number || ' — ' || UPPER(p_payment_method) ||
            ' · LKR ' || TO_CHAR(COALESCE(p_amount_paid, v_order.total_amount), 'FM999,999.00'),
            'payments', 'green', '/orders', 'order', p_order_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'order_id', p_order_id, 'status', 'paid',
        'payment_status', 'paid', 'payment_method', p_payment_method,
        'finance_posted', true, 'stock_result', v_stock_result
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_payment(UUID, TEXT, NUMERIC) TO authenticated;

-- Compat wrapper
CREATE OR REPLACE FUNCTION public.cashier_pay_order(p_order_id UUID, p_method TEXT DEFAULT 'cash', p_amount NUMERIC DEFAULT NULL)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_cashier_payment(p_order_id, p_method, p_amount); $$;
GRANT EXECUTE ON FUNCTION public.cashier_pay_order(UUID, TEXT, NUMERIC) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §8  EVENT LOG & REALTIME
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Event logger helper
CREATE OR REPLACE FUNCTION public.log_erp_event(
    p_event_code TEXT, p_entity_type TEXT, p_entity_id UUID,
    p_actor_id UUID, p_actor_role TEXT, p_branch_id UUID,
    p_payload JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
    INSERT INTO erp_event_log (event_code, entity_type, entity_id, actor_id, actor_role, branch_id, payload)
    VALUES (p_event_code, p_entity_type, p_entity_id, p_actor_id, p_actor_role, p_branch_id, p_payload)
    RETURNING id INTO v_id;

    IF p_entity_type = 'order' THEN
        INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
        VALUES (p_entity_id, '', p_event_code, p_actor_id, p_event_code, p_actor_id, p_payload, now())
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_id;
END;
$$;

-- Realtime broadcaster trigger
CREATE OR REPLACE FUNCTION public.broadcast_erp_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    PERFORM pg_notify('erp_events', jsonb_build_object(
        'event_code', NEW.event_code, 'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id, 'branch_id', NEW.branch_id,
        'actor_id', NEW.actor_id, 'payload', NEW.payload,
        'timestamp', NEW.created_at)::text);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_erp_event ON erp_event_log;
CREATE TRIGGER trg_broadcast_erp_event
    AFTER INSERT ON erp_event_log
    FOR EACH ROW EXECUTE FUNCTION broadcast_erp_event();

-- Auto stock deduction trigger on KOT preparing
CREATE OR REPLACE FUNCTION public.auto_stock_deduct()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'preparing' AND (OLD.status IS DISTINCT FROM 'preparing') THEN
        BEGIN
            PERFORM deduct_inv_for_kot(NEW.id);
            PERFORM log_erp_event('stock_deducted', 'kot', NEW.id, NULL, 'system',
                (SELECT branch_id FROM orders WHERE id = NEW.order_id),
                jsonb_build_object('kot_id', NEW.id, 'order_id', NEW.order_id));
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[auto_stock_deduct] Failed for KOT %: %', NEW.id, SQLERRM;
            INSERT INTO erp_event_log (event_code, entity_type, entity_id, actor_role, branch_id, payload)
            VALUES ('stock_deduct_failed', 'kot', NEW.id, 'system',
                (SELECT branch_id FROM orders WHERE id = NEW.order_id),
                jsonb_build_object('error', SQLERRM, 'kot_id', NEW.id));
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_stock_deduct ON kot_tickets;
CREATE TRIGGER trg_auto_stock_deduct
    AFTER UPDATE OF status ON kot_tickets
    FOR EACH ROW
    WHEN (NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing')
    EXECUTE FUNCTION auto_stock_deduct();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §9  RLS POLICIES — KOT Orchestration Tables
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- kitchen_subcategory_map
ALTER TABLE kitchen_subcategory_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ksm_select ON kitchen_subcategory_map;
CREATE POLICY ksm_select ON kitchen_subcategory_map FOR SELECT USING (true);

DROP POLICY IF EXISTS ksm_admin ON kitchen_subcategory_map;
CREATE POLICY ksm_admin ON kitchen_subcategory_map FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

-- erp_event_log
ALTER TABLE erp_event_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eel_admin ON erp_event_log;
CREATE POLICY eel_admin ON erp_event_log FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS eel_staff_select ON erp_event_log;
CREATE POLICY eel_staff_select ON erp_event_log FOR SELECT
    USING (is_staff() AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS eel_system_insert ON erp_event_log;
CREATE POLICY eel_system_insert ON erp_event_log FOR INSERT WITH CHECK (true);

-- kot_dispatches
ALTER TABLE kot_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kd_admin ON kot_dispatches;
CREATE POLICY kd_admin ON kot_dispatches FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS kd_kitchen_select ON kot_dispatches;
CREATE POLICY kd_kitchen_select ON kot_dispatches FOR SELECT
    USING (auth_has_role('kitchen') AND target_code = 'KITCHEN'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kot_dispatches.order_id
                       AND o.branch_id = ANY(auth_branch_ids())));

DROP POLICY IF EXISTS kd_cashier_select ON kot_dispatches;
CREATE POLICY kd_cashier_select ON kot_dispatches FOR SELECT
    USING (auth_has_role('cashier') AND target_code = 'CASHIER'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kot_dispatches.order_id
                       AND o.branch_id = ANY(auth_branch_ids())));

DROP POLICY IF EXISTS kd_inventory_select ON kot_dispatches;
CREATE POLICY kd_inventory_select ON kot_dispatches FOR SELECT
    USING (auth_has_role('inventory') AND target_code = 'INVENTORY'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kot_dispatches.order_id
                       AND o.branch_id = ANY(auth_branch_ids())));

DROP POLICY IF EXISTS kd_finance_select ON kot_dispatches;
CREATE POLICY kd_finance_select ON kot_dispatches FOR SELECT
    USING (auth_has_role('finance') AND target_code = 'FINANCE'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kot_dispatches.order_id
                       AND o.branch_id = ANY(auth_branch_ids())));

DROP POLICY IF EXISTS kd_waiter_select ON kot_dispatches;
CREATE POLICY kd_waiter_select ON kot_dispatches FOR SELECT
    USING (auth_has_role('waiter')
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kot_dispatches.order_id
                       AND o.branch_id = ANY(auth_branch_ids())));

-- cashier_queue
ALTER TABLE cashier_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cq_admin ON cashier_queue;
CREATE POLICY cq_admin ON cashier_queue FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS cq_cashier_select ON cashier_queue;
CREATE POLICY cq_cashier_select ON cashier_queue FOR SELECT
    USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS cq_cashier_update ON cashier_queue;
CREATE POLICY cq_cashier_update ON cashier_queue FOR UPDATE
    USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()))
    WITH CHECK (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS cq_waiter_select ON cashier_queue;
CREATE POLICY cq_waiter_select ON cashier_queue FOR SELECT
    USING (auth_has_role('waiter') AND branch_id = ANY(auth_branch_ids()));

-- stock_queue
ALTER TABLE stock_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sq_admin ON stock_queue;
CREATE POLICY sq_admin ON stock_queue FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS sq_inventory_select ON stock_queue;
CREATE POLICY sq_inventory_select ON stock_queue FOR SELECT
    USING (auth_has_role('inventory') AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS sq_kitchen_select ON stock_queue;
CREATE POLICY sq_kitchen_select ON stock_queue FOR SELECT
    USING (auth_has_role('kitchen') AND branch_id = ANY(auth_branch_ids()));

-- finance_queue
ALTER TABLE finance_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fq_admin ON finance_queue;
CREATE POLICY fq_admin ON finance_queue FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS fq_finance_select ON finance_queue;
CREATE POLICY fq_finance_select ON finance_queue FOR SELECT
    USING (auth_has_role('finance') AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS fq_cashier_select ON finance_queue;
CREATE POLICY fq_cashier_select ON finance_queue FOR SELECT
    USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §10  CLEANUP — Compatibility Note
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- v1 functions are now thin wrappers calling v2 equivalents (see §4, §6, §7).
-- No functions are dropped — backward compatibility maintained.
-- Canonical RPCs:
--   process_waiter_accept()      ← accept_order_as_waiter() wrapper
--   process_kitchen_start()      ← kitchen_start_kot() wrapper
--   process_kitchen_ready()      ← kitchen_mark_ready() wrapper
--   process_cashier_invoice()    ← cashier_invoice_order() wrapper
--   process_cashier_payment()    ← cashier_pay_order() wrapper
--   add_items_to_order()         ← NEW


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §11  INDEXES & REALTIME PUBLICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_kot_order_status     ON kot_tickets(order_id, status);
CREATE INDEX IF NOT EXISTS idx_kot_items_kot        ON kot_items(kot_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id, status);
CREATE INDEX IF NOT EXISTS idx_kd_target_status     ON kot_dispatches(target_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kd_order             ON kot_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_cq_status            ON cashier_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sq_status            ON stock_queue(status);
CREATE INDEX IF NOT EXISTS idx_fq_status            ON finance_queue(status);

-- Replica Identity for Realtime
ALTER TABLE erp_event_log      REPLICA IDENTITY FULL;
ALTER TABLE kitchen_subcategory_map REPLICA IDENTITY FULL;

-- Safe conditional add to Realtime publication
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'orders', 'order_items', 'kot_tickets', 'kot_items', 'kot_dispatches',
        'cashier_queue', 'stock_queue', 'finance_queue',
        'order_status_events', 'notifications', 'erp_event_log',
        'kitchen_subcategory_map'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t)
           AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                           WHERE pubname = 'supabase_realtime' AND tablename = t)
        THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF SPRINT 1 — KOT ORCHESTRATION ENGINE
-- ═══════════════════════════════════════════════════════════════════════════════
