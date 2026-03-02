-- ═══════════════════════════════════════════════════════════════════
-- KOT DISPATCH & QUEUES — Full ERP Migration
-- ERP-standard: Routes accepted KOT to Kitchen, Cashier, Inventory, Finance
-- Applied: 2026-03-01
--
-- CONTENTS:
--   STEP 1 — Schema: kot_routing_targets, kot_dispatches, cashier_queue,
--            stock_queue (inventory_queue), finance_queue, order_status_events
--   STEP 2 — RPC: accept_order_as_waiter (upgraded)
--   STEP 3 — RPC: kitchen_start_kot, kitchen_mark_ready
--   STEP 4 — RPC: cashier_invoice_order, cashier_pay_order
--   STEP 5 — RPC: issue_stock_for_order (upgraded v2)
--   STEP 6 — RLS policies (least privilege per department)
--   STEP 7 — Realtime publication (safe conditional add)
-- ═══════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 1 — SCHEMA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- A. kot_routing_targets: UNIQUE on code
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_kot_routing_code') THEN
    ALTER TABLE kot_routing_targets ADD CONSTRAINT uq_kot_routing_code UNIQUE (code);
  END IF;
END $$;

-- Seed / upsert all 4 targets
INSERT INTO kot_routing_targets (code, name) VALUES
  ('KITCHEN',   'Kitchen Display'),
  ('CASHIER',   'Cashier Billing Queue'),
  ('INVENTORY', 'Inventory Stock Queue'),
  ('FINANCE',   'Finance Revenue Queue')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- B. kot_dispatches — add missing columns
ALTER TABLE kot_dispatches
  ADD COLUMN IF NOT EXISTS order_id   UUID REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_kot_dispatch') THEN
    ALTER TABLE kot_dispatches ADD CONSTRAINT uq_kot_dispatch UNIQUE (kot_id, target_code);
  END IF;
END $$;

ALTER TABLE kot_dispatches DROP CONSTRAINT IF EXISTS chk_kd_status;
ALTER TABLE kot_dispatches ADD CONSTRAINT chk_kd_status
  CHECK (status IN ('pending', 'delivered', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_kd_target_status ON kot_dispatches(target_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kd_order ON kot_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_kd_kot   ON kot_dispatches(kot_id);

-- C. cashier_queue — add missing branch_id
ALTER TABLE cashier_queue
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_cashier_queue_order') THEN
    ALTER TABLE cashier_queue ADD CONSTRAINT uq_cashier_queue_order UNIQUE (order_id);
  END IF;
END $$;

ALTER TABLE cashier_queue DROP CONSTRAINT IF EXISTS chk_cq_status;
ALTER TABLE cashier_queue ADD CONSTRAINT chk_cq_status
  CHECK (status IN ('open', 'invoiced', 'paid', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_cq_status ON cashier_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cq_branch ON cashier_queue(branch_id);

-- D. stock_queue (= inventory_queue) — add branch_id
ALTER TABLE stock_queue
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE stock_queue DROP CONSTRAINT IF EXISTS chk_sq_stage;
ALTER TABLE stock_queue ADD CONSTRAINT chk_sq_stage
  CHECK (issue_stage IN ('on_accept', 'on_kitchen_start', 'on_paid'));

ALTER TABLE stock_queue DROP CONSTRAINT IF EXISTS chk_sq_status;
ALTER TABLE stock_queue ADD CONSTRAINT chk_sq_status
  CHECK (status IN ('pending', 'issued', 'failed'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_stock_queue_order') THEN
    ALTER TABLE stock_queue ADD CONSTRAINT uq_stock_queue_order UNIQUE (order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sq_status ON stock_queue(status);
CREATE INDEX IF NOT EXISTS idx_sq_branch ON stock_queue(branch_id);

-- E. finance_queue — add branch_id
ALTER TABLE finance_queue
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_finance_queue_order') THEN
    ALTER TABLE finance_queue ADD CONSTRAINT uq_finance_queue_order UNIQUE (order_id);
  END IF;
END $$;

ALTER TABLE finance_queue DROP CONSTRAINT IF EXISTS chk_fq_status;
ALTER TABLE finance_queue ADD CONSTRAINT chk_fq_status
  CHECK (status IN ('pending', 'posted', 'failed'));

CREATE INDEX IF NOT EXISTS idx_fq_status ON finance_queue(status);
CREATE INDEX IF NOT EXISTS idx_fq_branch ON finance_queue(branch_id);

-- F. order_status_events — add ERP-standard columns
ALTER TABLE order_status_events
  ADD COLUMN IF NOT EXISTS event_code     TEXT,
  ADD COLUMN IF NOT EXISTS actor_user_id  UUID,
  ADD COLUMN IF NOT EXISTS payload        JSONB DEFAULT '{}';

UPDATE order_status_events
SET event_code = CASE
  WHEN new_status = 'accepted'   THEN 'waiter_accepted'
  WHEN new_status = 'preparing'  THEN 'kitchen_started'
  WHEN new_status = 'ready'      THEN 'kot_ready'
  WHEN new_status = 'invoiced'   THEN 'invoiced'
  WHEN new_status = 'paid'       THEN 'paid'
  WHEN new_status = 'cancelled'  THEN 'order_cancelled'
  ELSE COALESCE(new_status, 'unknown')
END
WHERE event_code IS NULL;

CREATE INDEX IF NOT EXISTS idx_ose_order_time ON order_status_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ose_event_code ON order_status_events(event_code);

-- G. Replica Identity for Realtime
ALTER TABLE kot_dispatches      REPLICA IDENTITY FULL;
ALTER TABLE cashier_queue       REPLICA IDENTITY FULL;
ALTER TABLE stock_queue         REPLICA IDENTITY FULL;
ALTER TABLE finance_queue       REPLICA IDENTITY FULL;
ALTER TABLE order_status_events REPLICA IDENTITY FULL;
ALTER TABLE kot_routing_targets REPLICA IDENTITY FULL;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 2 — RPC: accept_order_as_waiter (FULL ERP DISPATCH)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent
    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 'message', 'Order already accepted (idempotent).',
            'order_id', p_order_id, 'assigned_waiter_id', v_order.assigned_waiter_id
        );
    END IF;

    IF v_order.status != 'pending_waiter' THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Order is no longer pending. Current status: ' || v_order.status);
    END IF;

    IF auth_has_role('waiter') AND NOT public.auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'You are not on shift for this branch.');
    END IF;

    -- 2. Accept the order (fires generate_kot_on_accept trigger)
    UPDATE orders
    SET status = 'accepted', assigned_waiter_id = v_waiter_id,
        accepted_at = v_now, updated_at = v_now
    WHERE id = p_order_id;

    -- 3. Log acceptance event
    INSERT INTO order_status_events (
        order_id, old_status, new_status, created_by,
        event_code, actor_user_id, payload, created_at
    ) VALUES (
        p_order_id, 'pending_waiter', 'accepted', v_waiter_id,
        'waiter_accepted', v_waiter_id,
        jsonb_build_object('waiter_id', v_waiter_id, 'branch_id', v_order.branch_id),
        v_now
    );

    -- Backward compat
    BEGIN
        INSERT INTO order_acceptance (order_id, accepted_by) VALUES (p_order_id, v_waiter_id);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- 4 & 5. For each KOT: create dispatch rows for all 4 targets
    FOR v_kot IN SELECT * FROM kot_tickets WHERE order_id = p_order_id LOOP
        -- KITCHEN: stays 'pending' until kitchen_start_kot
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- CASHIER: delivered immediately
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- INVENTORY: delivered immediately
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- FINANCE: delivered immediately
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot.id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_dispatch_count := v_dispatch_count + 4;
    END LOOP;

    -- 6. Create downstream work queues (idempotent ON CONFLICT DO NOTHING)
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

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 3 — RPC: kitchen_start_kot, kitchen_mark_ready
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.kitchen_start_kot(p_kot_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_kot     RECORD;
    v_user_id UUID := auth.uid();
    v_now     TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF;
    SELECT * INTO v_kot FROM kot_tickets WHERE id = p_kot_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'KOT not found.'); END IF;
    IF NOT (auth_has_role('kitchen') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;
    IF v_kot.status = 'preparing' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already preparing.', 'kot_id', p_kot_id);
    END IF;
    IF v_kot.status NOT IN ('created', 'pending') THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT cannot be started. Status: ' || v_kot.status);
    END IF;

    UPDATE kot_tickets SET status = 'preparing', accepted_at = v_now, updated_at = v_now WHERE id = p_kot_id;
    UPDATE kot_dispatches SET status = 'delivered', delivered_at = v_now
        WHERE kot_id = p_kot_id AND target_code = 'KITCHEN' AND status = 'pending';

    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
    VALUES (v_kot.order_id, 'created', 'preparing', v_user_id, 'kitchen_started', v_user_id,
            jsonb_build_object('kot_id', p_kot_id, 'kitchen_id', v_kot.kitchen_id), v_now);

    UPDATE orders SET status = 'preparing', updated_at = v_now
        WHERE id = v_kot.order_id AND status = 'accepted';

    PERFORM try_issue_stock_by_stage(v_kot.order_id, 'on_kitchen_start');

    RETURN jsonb_build_object('success', true, 'kot_id', p_kot_id, 'order_id', v_kot.order_id, 'status', 'preparing');
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_start_kot(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_mark_ready(p_kot_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_kot              RECORD;
    v_user_id          UUID := auth.uid();
    v_now              TIMESTAMPTZ := now();
    v_total_kots       INT;
    v_ready_kots       INT;
    v_cancelled_kots   INT;
    v_order_ready      BOOL := false;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF;
    SELECT * INTO v_kot FROM kot_tickets WHERE id = p_kot_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'KOT not found.'); END IF;
    IF NOT (auth_has_role('kitchen') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;
    IF v_kot.status = 'ready' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already ready.', 'kot_id', p_kot_id);
    END IF;

    UPDATE kot_tickets SET status = 'ready', completed_at = v_now, updated_at = v_now WHERE id = p_kot_id;
    UPDATE kot_items SET status = 'ready', updated_at = v_now WHERE kot_id = p_kot_id AND status != 'cancelled';

    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
    VALUES (v_kot.order_id, 'preparing', 'ready', v_user_id, 'kot_ready', v_user_id,
            jsonb_build_object('kot_id', p_kot_id), v_now);

    SELECT COUNT(*), COUNT(*) FILTER (WHERE status='ready'), COUNT(*) FILTER (WHERE status='cancelled')
    INTO v_total_kots, v_ready_kots, v_cancelled_kots
    FROM kot_tickets WHERE order_id = v_kot.order_id;

    IF v_total_kots > 0 AND (v_ready_kots + v_cancelled_kots) = v_total_kots AND v_ready_kots > 0 THEN
        UPDATE orders SET status = 'ready', updated_at = v_now
            WHERE id = v_kot.order_id AND status IN ('accepted', 'preparing');
        INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
        VALUES (v_kot.order_id, 'preparing', 'ready', v_user_id, 'order_ready', v_user_id,
                jsonb_build_object('all_kots_ready', true), v_now);
        v_order_ready := true;
    END IF;

    RETURN jsonb_build_object('success', true, 'kot_id', p_kot_id, 'order_id', v_kot.order_id,
                               'status', 'ready', 'order_ready', v_order_ready);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kitchen_mark_ready(UUID) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 4 — RPC: cashier_invoice_order, cashier_pay_order
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION public.cashier_invoice_order(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order   RECORD;
    v_user_id UUID := auth.uid();
    v_now     TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF;
    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found.'); END IF;
    IF v_order.status = 'invoiced' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already invoiced.', 'order_id', p_order_id);
    END IF;

    UPDATE orders SET status = 'invoiced', updated_at = v_now WHERE id = p_order_id;
    UPDATE cashier_queue SET status = 'invoiced', updated_at = v_now WHERE order_id = p_order_id AND status = 'open';

    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
    VALUES (p_order_id, v_order.status, 'invoiced', v_user_id, 'invoiced', v_user_id,
            jsonb_build_object('cashier_id', v_user_id), v_now);

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'invoiced');
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashier_invoice_order(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cashier_pay_order(
    p_order_id       UUID,
    p_payment_method TEXT    DEFAULT 'cash',
    p_amount_paid    NUMERIC DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_order        RECORD;
    v_user_id      UUID := auth.uid();
    v_now          TIMESTAMPTZ := now();
    v_stock_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF;
    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found.'); END IF;
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already paid.', 'order_id', p_order_id);
    END IF;

    UPDATE orders SET status = 'paid', payment_status = 'paid', updated_at = v_now WHERE id = p_order_id;
    UPDATE cashier_queue SET status = 'paid', updated_at = v_now WHERE order_id = p_order_id AND status IN ('open','invoiced');
    UPDATE finance_queue  SET status = 'posted', updated_at = v_now WHERE order_id = p_order_id AND status = 'pending';

    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, event_code, actor_user_id, payload, created_at)
    VALUES (p_order_id, v_order.status, 'paid', v_user_id, 'paid', v_user_id,
            jsonb_build_object('cashier_id', v_user_id, 'payment_method', p_payment_method,
                               'amount_paid', COALESCE(p_amount_paid, v_order.total_amount)), v_now);

    v_stock_result := issue_stock_for_order(p_order_id);

    RETURN jsonb_build_object(
        'success', true, 'order_id', p_order_id, 'status', 'paid',
        'payment_status', 'paid', 'finance_posted', true, 'stock_result', v_stock_result
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashier_pay_order(UUID, TEXT, NUMERIC) TO authenticated;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 5 — RPC: issue_stock_for_order (Placeholder when BOM missing)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- See: stock_queue_orchestration.sql for the full BOM deduction version.
-- The upgraded version is applied separately.

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 6 — RLS POLICIES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALTER TABLE kot_routing_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kot_dispatches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_events ENABLE ROW LEVEL SECURITY;

-- kot_routing_targets
DROP POLICY IF EXISTS krt_select ON kot_routing_targets;
CREATE POLICY krt_select ON kot_routing_targets FOR SELECT USING (true);
DROP POLICY IF EXISTS krt_admin ON kot_routing_targets;
CREATE POLICY krt_admin ON kot_routing_targets FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- kot_dispatches
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
DROP POLICY IF EXISTS fq_admin ON finance_queue;
CREATE POLICY fq_admin ON finance_queue FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS fq_finance_select ON finance_queue;
CREATE POLICY fq_finance_select ON finance_queue FOR SELECT
    USING (auth_has_role('finance') AND branch_id = ANY(auth_branch_ids()));
DROP POLICY IF EXISTS fq_cashier_select ON finance_queue;
CREATE POLICY fq_cashier_select ON finance_queue FOR SELECT
    USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));

-- order_status_events
DROP POLICY IF EXISTS ose_admin ON order_status_events;
CREATE POLICY ose_admin ON order_status_events FOR ALL
    USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());
DROP POLICY IF EXISTS ose_staff_select ON order_status_events;
CREATE POLICY ose_staff_select ON order_status_events FOR SELECT
    USING (is_staff() AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_status_events.order_id
                                  AND o.branch_id = ANY(auth_branch_ids())));
DROP POLICY IF EXISTS ose_system_insert ON order_status_events;
CREATE POLICY ose_system_insert ON order_status_events FOR INSERT WITH CHECK (is_staff());


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- STEP 7 — REALTIME PUBLICATION (safe conditional)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'orders', 'kot_tickets', 'kot_dispatches',
        'cashier_queue', 'stock_queue', 'finance_queue',
        'order_status_events'
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
