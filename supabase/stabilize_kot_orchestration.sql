-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: stabilize_kot_orchestration
-- Applied after: sprint1_kot_orchestration_engine.sql + fix_rpc_aliases.sql
--
-- FIXES:
--   1. Drop legacy trg_generate_kot trigger (sprint1 RPC handles KOT inline)
--   2. Fix process_waiter_accept: kot_items status 'pending' → 'queued'
--   3. Harden erp_event_log INSERT policy
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- FIX 0: Consolidate stock_queue constraints
-- The original table was created with an auto-named constraint
-- "stock_queue_issue_stage_check" that has a different/more restrictive
-- set than what kot_dispatch_queues.sql intended. Both coexist in the
-- DB causing INSERT failures. Drop both and recreate one canonical one.
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_queue DROP CONSTRAINT IF EXISTS stock_queue_issue_stage_check;
ALTER TABLE public.stock_queue DROP CONSTRAINT IF EXISTS chk_sq_stage;
ALTER TABLE public.stock_queue ADD CONSTRAINT chk_sq_stage
    CHECK (issue_stage IN ('on_accept', 'on_kitchen_start', 'on_paid'));

-- Also consolidate status constraint (same auto-named vs explicit issue)
ALTER TABLE public.stock_queue DROP CONSTRAINT IF EXISTS stock_queue_status_check;
ALTER TABLE public.stock_queue DROP CONSTRAINT IF EXISTS chk_sq_status;
ALTER TABLE public.stock_queue ADD CONSTRAINT chk_sq_status
    CHECK (status IN ('pending', 'issued', 'failed'));


-- ─────────────────────────────────────────────────────────────────────
-- FIX 1: Drop the legacy trigger that races with process_waiter_accept
-- ─────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_generate_kot ON public.orders;

-- Keep the function — it is still referenced in other migration files
-- and dropping it would cause those files to fail on re-run.
-- The function is now orphaned (no trigger calls it) but harmless.


-- ─────────────────────────────────────────────────────────────────────
-- FIX 2: Correct process_waiter_accept — 'pending' → 'queued'
--        (Only the broken INSERT line changes; everything else identical)
-- ─────────────────────────────────────────────────────────────────────
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

    -- 2. Re-assess kitchen routing for all queued items
    UPDATE order_items
    SET kitchen_id = get_target_kitchen_for_item(menu_item_id, v_order.branch_id)
    WHERE order_id = p_order_id AND (kitchen_id IS NULL OR status = 'queued');

    SELECT id INTO v_default_kitchen FROM kitchens
    WHERE branch_id = v_order.branch_id AND is_active = true
    ORDER BY created_at ASC LIMIT 1;

    -- 3. Generate one KOT per kitchen (items still 'queued' — trigger is now gone)
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

            -- FIX: was 'pending' — violates chk_ki_status; corrected to 'queued'
            INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
            SELECT v_kot_id, oi.id, oi.quantity, 'queued'
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

    -- 4. Dispatch all KOTs to 4 routing targets
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

    -- 5. Create downstream work queues
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- 6. Backward-compat acceptance log
    BEGIN
        INSERT INTO order_acceptance (order_id, accepted_by) VALUES (p_order_id, v_waiter_id);
    EXCEPTION WHEN unique_violation THEN NULL;
              WHEN undefined_table  THEN NULL;
    END;

    -- 7. Event log
    SELECT full_name INTO v_waiter_name FROM profiles WHERE id = v_waiter_id;

    PERFORM log_erp_event(
        'waiter_accepted', 'order', p_order_id, v_waiter_id, 'waiter', v_order.branch_id,
        jsonb_build_object(
            'waiter_name',    COALESCE(v_waiter_name, 'Unknown'),
            'order_number',   v_order.order_number,
            'kot_count',      v_kot_count,
            'dispatch_count', v_dispatch_count
        )
    );

    -- 8. Notifications
    PERFORM notify_role(v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. ' || v_kot_count || ' KOT(s).',
        'soup_kitchen', 'orange', '/kitchen', 'order', p_order_id, v_waiter_id);

    PERFORM notify_role(v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️ Billing — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_waiter_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos', 'order', p_order_id, v_waiter_id);

    RETURN jsonb_build_object(
        'success',            true,
        'order_id',           p_order_id,
        'assigned_waiter_id', v_waiter_id,
        'kot_count',          v_kot_count,
        'dispatch_count',     v_dispatch_count,
        'queues_created',     jsonb_build_object('cashier', true, 'inventory', true, 'finance', true)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;

-- Refresh alias to point to corrected function
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT process_waiter_accept(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- FIX 3: Harden erp_event_log INSERT policy
-- log_erp_event() is SECURITY DEFINER so it bypasses RLS.
-- This blocks direct client-side INSERTs.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS eel_system_insert ON erp_event_log;
CREATE POLICY eel_system_insert ON erp_event_log FOR INSERT
    WITH CHECK (is_admin() OR is_manager() OR is_staff());
