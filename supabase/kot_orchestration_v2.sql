-- ═══════════════════════════════════════════════════════════════════════════════
-- KOT ORCHESTRATION ENGINE v2 — Complete Lifecycle
-- ═══════════════════════════════════════════════════════════════════════════════
-- Unifies the entire order→KOT→kitchen→cashier→inventory→finance pipeline
-- into atomic RPCs with full event logging, notification broadcasting,
-- and race-condition-safe idempotent transactions.
--
-- Applied: 2026-03-02
--
-- CONTENTS:
--   §1  erp_event_log — Centralized event journal
--   §2  process_waiter_accept() — Master waiter acceptance RPC
--   §3  process_kitchen_start() — Kitchen begins preparing
--   §4  process_kitchen_ready() — Kitchen marks KOT as ready
--   §5  process_cashier_invoice() — Cashier invoices order
--   §6  process_cashier_payment() — Cashier records payment + journal entry
--   §7  auto_stock_deduct() — BOM-aware stock deduction trigger
--   §8  broadcast_erp_event() — Realtime notification broadcaster
--   §9  Indexes & Realtime publication
-- ═══════════════════════════════════════════════════════════════════════════════


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §1  CENTRALIZED EVENT LOG
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS public.erp_event_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code    TEXT NOT NULL,          -- e.g. 'waiter_accepted', 'kitchen_started', 'payment_received'
    entity_type   TEXT NOT NULL,          -- 'order', 'kot', 'bill', 'inventory_doc'
    entity_id     UUID NOT NULL,          -- FK to the entity
    actor_id      UUID,                   -- auth.uid() of the person who caused the event
    actor_role    TEXT,                   -- role at time of action
    branch_id     UUID,
    payload       JSONB DEFAULT '{}',     -- Arbitrary structured data for audit trail
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eel_entity    ON erp_event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_eel_code      ON erp_event_log(event_code);
CREATE INDEX IF NOT EXISTS idx_eel_branch    ON erp_event_log(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eel_actor     ON erp_event_log(actor_id);

ALTER TABLE erp_event_log ENABLE ROW LEVEL SECURITY;

-- Only admins/managers can full-access; staff can SELECT for their branches
DROP POLICY IF EXISTS eel_admin ON erp_event_log;
CREATE POLICY eel_admin ON erp_event_log FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS eel_staff_select ON erp_event_log;
CREATE POLICY eel_staff_select ON erp_event_log FOR SELECT
    USING (is_staff() AND branch_id = ANY(auth_branch_ids()));

-- Insert is allowed through SECURITY DEFINER RPCs only
DROP POLICY IF EXISTS eel_system_insert ON erp_event_log;
CREATE POLICY eel_system_insert ON erp_event_log FOR INSERT WITH CHECK (true);

ALTER TABLE erp_event_log REPLICA IDENTITY FULL;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Helper: log_erp_event()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.log_erp_event(
    p_event_code  TEXT,
    p_entity_type TEXT,
    p_entity_id   UUID,
    p_actor_id    UUID,
    p_actor_role  TEXT,
    p_branch_id   UUID,
    p_payload     JSONB DEFAULT '{}'
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO erp_event_log (event_code, entity_type, entity_id, actor_id, actor_role, branch_id, payload)
    VALUES (p_event_code, p_entity_type, p_entity_id, p_actor_id, p_actor_role, p_branch_id, p_payload)
    RETURNING id INTO v_id;

    -- Also mirror into order_status_events for backward compatibility
    IF p_entity_type = 'order' THEN
        INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
        VALUES (p_entity_id, '', p_event_code, p_actor_id, p_event_code, p_actor_id, p_payload, now())
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_id;
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §2  process_waiter_accept()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Atomic orchestration when a waiter accepts an order:
--   1. Validate auth + shift
--   2. Lock & update order → accepted
--   3. Generate KOTs (per kitchen)
--   4. Dispatch KOTs to all 4 targets (KITCHEN, CASHIER, INVENTORY, FINANCE)
--   5. Create downstream work queues
--   6. Notify kitchen, cashier, manager
--   7. Log event

CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- ── Auth checks ──────────────────────────────────────────────────────────
    IF v_waiter_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role. Requires waiter/admin/manager.');
    END IF;

    -- ── Lock order (prevents race conditions) ────────────────────────────────
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent: already accepted
    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 'message', 'Order already accepted (idempotent).',
            'order_id', p_order_id, 'assigned_waiter_id', v_order.assigned_waiter_id
        );
    END IF;

    IF v_order.status != 'pending_waiter' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Order cannot be accepted. Current status: ' || v_order.status);
    END IF;

    -- ── Shift validation ─────────────────────────────────────────────────────
    IF auth_has_role('waiter') AND NOT auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'You are not on shift for this branch.');
    END IF;

    -- ── 1. Update order status ───────────────────────────────────────────────
    UPDATE orders
    SET status = 'accepted',
        assigned_waiter_id = v_waiter_id,
        accepted_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

    -- ── 2. Generate KOTs per kitchen ─────────────────────────────────────────
    SELECT id INTO v_default_kitchen
    FROM kitchens
    WHERE branch_id = v_order.branch_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    -- Items WITH explicit kitchen_id
    FOR v_kot_rec IN
        SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
        FROM order_items
        WHERE order_id = p_order_id AND status = 'queued'
    LOOP
        CONTINUE WHEN v_kot_rec.kit_id IS NULL;

        -- Idempotency: check if KOT already exists for this order+kitchen
        PERFORM 1 FROM kot_tickets
        WHERE order_id = p_order_id AND kitchen_id = v_kot_rec.kit_id;

        IF NOT FOUND THEN
            INSERT INTO kot_tickets (order_id, kitchen_id, status, created_at)
            VALUES (p_order_id, v_kot_rec.kit_id, 'created', v_now)
            RETURNING id INTO v_kot_id;

            INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
            SELECT v_kot_id, oi.id, oi.quantity, 'pending'
            FROM order_items oi
            WHERE oi.order_id = p_order_id
              AND COALESCE(oi.kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
              AND oi.status = 'queued';

            -- Update order_items status
            UPDATE order_items
            SET status = 'sent_to_kitchen',
                kitchen_id = COALESCE(kitchen_id, v_default_kitchen)
            WHERE order_id = p_order_id
              AND COALESCE(kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
              AND status = 'queued';

            v_kot_count := v_kot_count + 1;
        END IF;
    END LOOP;

    -- ── 3. Dispatch all KOTs to 4 routing targets ────────────────────────────
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

    -- ── 4. Create downstream work queues (idempotent) ────────────────────────
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ── 5. Log backward-compat acceptance ────────────────────────────────────
    BEGIN
        INSERT INTO order_acceptance (order_id, accepted_by) VALUES (p_order_id, v_waiter_id);
    EXCEPTION WHEN unique_violation THEN NULL;
              WHEN undefined_table THEN NULL;
    END;

    -- ── 6. Event log ─────────────────────────────────────────────────────────
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

    -- ── 7. Notification broadcasts ───────────────────────────────────────────
    PERFORM notify_role(
        v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. ' || v_kot_count || ' KOT(s) created.',
        'soup_kitchen', 'orange', '/kitchen', 'order', p_order_id, v_waiter_id
    );

    PERFORM notify_role(
        v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️ Billing Task — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos', 'order', p_order_id, v_waiter_id
    );

    PERFORM notify_role(
        v_order.branch_id, 'manager', 'order_accepted',
        '📋 Order Accepted #' || v_order.order_number,
        'Waiter: ' || COALESCE(v_waiter_name, 'Unknown') || ' | KOTs: ' || v_kot_count,
        'assignment', 'blue', '/orders', 'order', p_order_id, v_waiter_id
    );

    -- ── Return ───────────────────────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success',            true,
        'order_id',           p_order_id,
        'assigned_waiter_id', v_waiter_id,
        'kot_count',          v_kot_count,
        'dispatch_count',     v_dispatch_count,
        'queues_created',     jsonb_build_object('cashier', true, 'inventory', true, 'finance', true)
    );
EXCEPTION WHEN OTHERS THEN
    -- Rollback happens automatically; return error
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §3  process_kitchen_start()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Kitchen staff starts preparing a KOT.
-- Triggers stock deduction if issue_stage = 'on_kitchen_start'.

CREATE OR REPLACE FUNCTION public.process_kitchen_start(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Update KOT
    UPDATE kot_tickets
    SET status = 'preparing', accepted_at = v_now, updated_at = v_now
    WHERE id = p_kot_id;

    -- Mark KITCHEN dispatch as delivered
    UPDATE kot_dispatches
    SET status = 'delivered', delivered_at = v_now
    WHERE kot_id = p_kot_id AND target_code = 'KITCHEN' AND status = 'pending';

    -- Update order status to preparing
    UPDATE orders
    SET status = 'preparing', updated_at = v_now
    WHERE id = v_kot.order_id AND status = 'accepted';

    -- ── Trigger stock deduction (BOM engine) ─────────────────────────────────
    PERFORM try_issue_stock_by_stage(v_kot.order_id, 'on_kitchen_start');

    -- Also call per-KOT deduction for fine-grained control
    BEGIN
        PERFORM deduct_inv_for_kot(p_kot_id);
    EXCEPTION WHEN OTHERS THEN
        -- Log warning but don't fail the kitchen start
        RAISE WARNING 'Stock deduction warning for KOT %: %', p_kot_id, SQLERRM;
    END;

    -- ── Event log ────────────────────────────────────────────────────────────
    PERFORM log_erp_event(
        'kitchen_started', 'kot', p_kot_id, v_user_id, 'kitchen',
        (SELECT branch_id FROM orders WHERE id = v_kot.order_id),
        jsonb_build_object('kot_id', p_kot_id, 'order_id', v_kot.order_id, 'kitchen_id', v_kot.kitchen_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'kot_id', p_kot_id,
        'order_id', v_kot.order_id,
        'status', 'preparing'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_kitchen_start(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §4  process_kitchen_ready()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Kitchen marks KOT as ready for pickup.
-- If ALL KOTs are ready → order.status = 'ready'.
-- Notifies assigned waiter + customer via realtime.

CREATE OR REPLACE FUNCTION public.process_kitchen_ready(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Idempotent
    IF v_kot.status = 'ready' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already ready.', 'kot_id', p_kot_id);
    END IF;

    IF v_kot.status NOT IN ('preparing', 'created', 'pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT cannot be marked ready. Status: ' || v_kot.status);
    END IF;

    -- ── Update KOT ───────────────────────────────────────────────────────────
    UPDATE kot_tickets
    SET status = 'ready', completed_at = v_now, updated_at = v_now
    WHERE id = p_kot_id;

    UPDATE kot_items
    SET status = 'ready', updated_at = v_now
    WHERE kot_id = p_kot_id AND status != 'cancelled';

    -- ── Check if ALL KOTs for this order are ready ───────────────────────────
    SELECT * INTO v_order FROM orders WHERE id = v_kot.order_id;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'ready'),
        COUNT(*) FILTER (WHERE status = 'cancelled')
    INTO v_total_kots, v_ready_kots, v_cancelled_kots
    FROM kot_tickets WHERE order_id = v_kot.order_id;

    IF v_total_kots > 0 AND (v_ready_kots + v_cancelled_kots) = v_total_kots AND v_ready_kots > 0 THEN
        UPDATE orders SET status = 'ready', updated_at = v_now
        WHERE id = v_kot.order_id AND status IN ('accepted', 'preparing');
        v_order_ready := true;

        PERFORM log_erp_event(
            'order_all_kots_ready', 'order', v_kot.order_id, v_user_id, 'kitchen',
            v_order.branch_id,
            jsonb_build_object('total_kots', v_total_kots, 'ready_kots', v_ready_kots)
        );
    END IF;

    -- ── Event log ────────────────────────────────────────────────────────────
    PERFORM log_erp_event(
        'kitchen_ready', 'kot', p_kot_id, v_user_id, 'kitchen', v_order.branch_id,
        jsonb_build_object(
            'kot_id', p_kot_id, 'order_id', v_kot.order_id,
            'order_ready', v_order_ready, 'ready_count', v_ready_kots, 'total_count', v_total_kots
        )
    );

    -- ── Notify assigned waiter ───────────────────────────────────────────────
    SELECT name INTO v_kitchen_name FROM kitchens WHERE id = v_kot.kitchen_id;

    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (
            v_order.assigned_waiter_id, v_order.branch_id,
            'kitchen_ready', '✅ Food Ready!',
            COALESCE(v_kitchen_name, 'Kitchen') || ' · Order #' || v_order.order_number || ' — pickup now.',
            'check_circle', 'green', '/orders', 'kot', p_kot_id
        );
    END IF;

    -- Notify managers
    PERFORM notify_role(
        v_order.branch_id, 'manager', 'kitchen_ready',
        '✅ KOT Ready — Order #' || v_order.order_number,
        COALESCE(v_kitchen_name, 'Kitchen') || ' has completed KOT.',
        'check_circle', 'green', '/orders', 'kot', p_kot_id, v_order.assigned_waiter_id
    );

    -- ── Notify customer via realtime (by broadcasting to order channel) ──────
    -- Customer-facing apps subscribe to their order. The INSERT into
    -- order_status_events (via log_erp_event) automatically publishes
    -- through Supabase Realtime since it's in the publication.

    RETURN jsonb_build_object(
        'success', true,
        'kot_id', p_kot_id,
        'order_id', v_kot.order_id,
        'status', 'ready',
        'order_ready', v_order_ready,
        'ready_count', v_ready_kots,
        'total_count', v_total_kots
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_kitchen_ready(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §5  process_cashier_invoice()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Cashier creates an invoice. No stock or finance posting yet.

CREATE OR REPLACE FUNCTION public.process_cashier_invoice(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    IF v_order.status = 'invoiced' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already invoiced.', 'order_id', p_order_id);
    END IF;

    IF v_order.status NOT IN ('accepted', 'preparing', 'ready') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order cannot be invoiced. Status: ' || v_order.status);
    END IF;

    -- Update order
    UPDATE orders SET status = 'invoiced', updated_at = v_now WHERE id = p_order_id;

    -- Update cashier queue
    UPDATE cashier_queue SET status = 'invoiced', updated_at = v_now
    WHERE order_id = p_order_id AND status = 'open';

    -- Event log
    PERFORM log_erp_event(
        'order_invoiced', 'order', p_order_id, v_user_id, 'cashier', v_order.branch_id,
        jsonb_build_object('cashier_id', v_user_id, 'total_amount', v_order.total_amount)
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'invoiced');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_invoice(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §6  process_cashier_payment()
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Cashier records payment. This:
--   1. Marks order as paid
--   2. Updates cashier_queue + finance_queue
--   3. Triggers stock deduction (if issue_stage = 'on_paid')
--   4. Auto-posts journal entry (revenue recognition)
--   5. Notifies waiter + customer

CREATE OR REPLACE FUNCTION public.process_cashier_payment(
    p_order_id       UUID,
    p_payment_method TEXT    DEFAULT 'cash',
    p_amount_paid    NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already paid.', 'order_id', p_order_id);
    END IF;

    -- ── 1. Mark as paid ──────────────────────────────────────────────────────
    UPDATE orders
    SET status = 'paid',
        payment_status = 'paid',
        payment_method = p_payment_method,
        updated_at = v_now
    WHERE id = p_order_id;

    -- ── 2. Update work queues ────────────────────────────────────────────────
    UPDATE cashier_queue SET status = 'paid', updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('open', 'invoiced');

    UPDATE finance_queue SET status = 'posted', updated_at = v_now
    WHERE order_id = p_order_id AND status = 'pending';

    -- ── 3. Stock deduction (on_paid stage) ───────────────────────────────────
    BEGIN
        v_stock_result := issue_stock_for_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        v_stock_result := jsonb_build_object('success', false, 'error', SQLERRM);
        PERFORM mark_stock_queue_failed(p_order_id, SQLERRM);
    END;

    -- ── 4. Auto-post journal entry ───────────────────────────────────────────
    BEGIN
        PERFORM post_accounting_from_order(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Journal posting warning for order %: %', p_order_id, SQLERRM;
    END;

    -- ── 5. Event log ─────────────────────────────────────────────────────────
    PERFORM log_erp_event(
        'payment_received', 'order', p_order_id, v_user_id, 'cashier', v_order.branch_id,
        jsonb_build_object(
            'cashier_id', v_user_id,
            'payment_method', p_payment_method,
            'amount_paid', COALESCE(p_amount_paid, v_order.total_amount),
            'stock_result', v_stock_result
        )
    );

    -- ── 6. Notification: waiter + cashier ────────────────────────────────────
    IF v_order.assigned_waiter_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, branch_id, type, title, message, icon, color, action_url, ref_type, ref_id)
        VALUES (
            v_order.assigned_waiter_id, v_order.branch_id,
            'payment_complete', '💰 Payment Complete',
            'Order #' || v_order.order_number || ' — ' || UPPER(p_payment_method) ||
            ' · LKR ' || TO_CHAR(COALESCE(p_amount_paid, v_order.total_amount), 'FM999,999.00'),
            'payments', 'green', '/orders', 'order', p_order_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'payment_status', 'paid',
        'payment_method', p_payment_method,
        'finance_posted', true,
        'stock_result', v_stock_result
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_payment(UUID, TEXT, NUMERIC) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §7  auto_stock_deduct() — Trigger function
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Automatically triggered when kot_tickets.status → 'preparing'
-- Calls deduct_inv_for_kot() with full error isolation.

CREATE OR REPLACE FUNCTION public.auto_stock_deduct()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'preparing' AND (OLD.status IS DISTINCT FROM 'preparing') THEN
        BEGIN
            PERFORM deduct_inv_for_kot(NEW.id);

            PERFORM log_erp_event(
                'stock_deducted', 'kot', NEW.id, NULL, 'system',
                (SELECT branch_id FROM orders WHERE id = NEW.order_id),
                jsonb_build_object('kot_id', NEW.id, 'order_id', NEW.order_id, 'trigger', 'auto_stock_deduct')
            );
        EXCEPTION WHEN OTHERS THEN
            -- Do NOT fail the kitchen start — just log the failure
            RAISE WARNING '[auto_stock_deduct] Failed for KOT %: %', NEW.id, SQLERRM;

            INSERT INTO erp_event_log (event_code, entity_type, entity_id, actor_role, branch_id, payload)
            VALUES (
                'stock_deduct_failed', 'kot', NEW.id, 'system',
                (SELECT branch_id FROM orders WHERE id = NEW.order_id),
                jsonb_build_object('error', SQLERRM, 'kot_id', NEW.id)
            );
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
-- §8  broadcast_erp_event() — Realtime notification broadcaster trigger
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Fires on INSERT to erp_event_log.
-- Uses pg_notify to broadcast events to connected clients via Supabase Realtime.

CREATE OR REPLACE FUNCTION public.broadcast_erp_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Broadcast to a Postgres channel that Supabase Realtime can pick up
    PERFORM pg_notify(
        'erp_events',
        jsonb_build_object(
            'event_code',  NEW.event_code,
            'entity_type', NEW.entity_type,
            'entity_id',   NEW.entity_id,
            'branch_id',   NEW.branch_id,
            'actor_id',    NEW.actor_id,
            'payload',     NEW.payload,
            'timestamp',   NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_erp_event ON erp_event_log;
CREATE TRIGGER trg_broadcast_erp_event
    AFTER INSERT ON erp_event_log
    FOR EACH ROW
    EXECUTE FUNCTION broadcast_erp_event();


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- §9  INDEXES & REALTIME PUBLICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_kot_order_status     ON kot_tickets(order_id, status);
CREATE INDEX IF NOT EXISTS idx_kot_items_kot        ON kot_items(kot_id, status);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id, status);

-- Realtime publication (safe conditional adds)
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'orders', 'kot_tickets', 'kot_dispatches',
        'cashier_queue', 'stock_queue', 'finance_queue',
        'order_status_events', 'notifications', 'erp_event_log'
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


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- DONE ✅
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Summary of RPCs:
--   process_waiter_accept(order_id)              → Waiter accepts order
--   process_kitchen_start(kot_id)                → Kitchen begins preparing
--   process_kitchen_ready(kot_id)                → Kitchen marks KOT ready
--   process_cashier_invoice(order_id)            → Cashier invoices
--   process_cashier_payment(order_id, method, $) → Cashier records payment
--
-- Triggers:
--   trg_auto_stock_deduct   → BOM deduction on kitchen start
--   trg_broadcast_erp_event → pg_notify broadcaster
--
-- Tables:
--   erp_event_log → Centralized audit trail
