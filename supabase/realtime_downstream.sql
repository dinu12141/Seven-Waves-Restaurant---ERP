-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: realtime_downstream
-- Purpose   : Realtime downstream propagation after waiter acceptance
-- Depends on: orders, kot_dispatches, order_status_events,
--             rpc_waiter_accept_order (kot_routing_engine.sql must run first)
-- Safe to re-run: YES — all DDL is idempotent
--
-- CREATES / REPLACES:
--   §0  order_status_events   — relax NOT NULL for system/trigger events
--   §1  cashier_queue         — POS billing target
--   §2  inventory_queue       — stock BOM deduction target (canonical)
--   §3  finance_queue         — cost/revenue posting target
--   §4  _queue_set_updated_at — shared updated_at trigger function
--   §5  _queue_audit_trigger  — INSERT → order_status_events (per queue)
--   §6  supabase_realtime     — publication membership for all downstream tables
--   §7  rpc_waiter_accept_order — full replacement:
--         STEP 5: stock_queue → inventory_queue
--         STEP 7: notify all 4 roles (kitchen, cashier, inventory, finance)
--   §8  stock_queue compat    — view alias if stock_queue is not already a table
--
-- ─────────────────────────────────────────────────────────────────────────
-- DOWNSTREAM FLOW (server-side, after rpc_waiter_accept_order):
--
--   Kitchen Display  ← realtime: kot_dispatches INSERT (target_code='KITCHEN')
--                      client joins: kot_tickets + kot_items for line details
--
--   POS / Cashier    ← realtime: cashier_queue INSERT (status='open')
--                      client joins: orders + order_items for invoice
--
--   Inventory        ← realtime: inventory_queue INSERT (status='pending')
--                      BOM deduction fires at issue_stage event
--
--   Finance          ← realtime: finance_queue INSERT (status='pending')
--                      cost/revenue posting fires on status change
--
-- ─────────────────────────────────────────────────────────────────────────
-- FRONTEND SUBSCRIPTION PATTERNS (Supabase JS):
--
--   Kitchen:
--     supabase.channel('kitchen-{kitchen_id}')
--       .on('postgres_changes', {
--             event: 'INSERT', schema: 'public',
--             table: 'kot_dispatches',
--             filter: 'target_code=eq.KITCHEN'
--          }, handler)
--       .subscribe()
--
--   POS:
--     supabase.channel('pos-{branch_id}')
--       .on('postgres_changes', {
--             event: 'INSERT', schema: 'public',
--             table: 'cashier_queue',
--             filter: 'branch_id=eq.<branch_id>'
--          }, handler)
--       .subscribe()
--
--   Inventory:
--     supabase.channel('inventory-{branch_id}')
--       .on('postgres_changes', {
--             event: '*', schema: 'public',
--             table: 'inventory_queue',
--             filter: 'branch_id=eq.<branch_id>'
--          }, handler)
--       .subscribe()
--
--   Finance:
--     supabase.channel('finance-{branch_id}')
--       .on('postgres_changes', {
--             event: '*', schema: 'public',
--             table: 'finance_queue',
--             filter: 'branch_id=eq.<branch_id>'
--          }, handler)
--       .subscribe()
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- §0 · order_status_events — relax NOT NULL constraints
--
-- Queue audit triggers write rows that are system-generated (no actor,
-- no old_status transition). These columns must accept NULL for that case.
-- ALTER COLUMN DROP NOT NULL is a no-op if already nullable — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE public.order_status_events ALTER COLUMN old_status  DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE public.order_status_events ALTER COLUMN new_status  DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END; $$;
DO $$ BEGIN ALTER TABLE public.order_status_events ALTER COLUMN created_by  DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END; $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · cashier_queue — POS billing target
--
-- One row per accepted order.  POS subscribes for INSERT events and joins
-- orders + order_items to generate the invoice.
-- Status lifecycle: open → invoiced → paid | cancelled
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cashier_queue (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID        NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
    branch_id           UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    status              TEXT        NOT NULL DEFAULT 'open',
    assigned_cashier_id UUID        REFERENCES public.profiles(id),
    invoice_id          UUID,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns that may be absent if the table pre-existed
ALTER TABLE public.cashier_queue
    ADD COLUMN IF NOT EXISTS assigned_cashier_id UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS invoice_id          UUID,
    ADD COLUMN IF NOT EXISTS notes               TEXT;

-- Recreate CHECK to cover full lifecycle (idempotent: drop then add)
DO $$ BEGIN
    ALTER TABLE public.cashier_queue DROP CONSTRAINT IF EXISTS cashier_queue_status_check;
    ALTER TABLE public.cashier_queue ADD  CONSTRAINT cashier_queue_status_check
        CHECK (status IN ('open','invoiced','paid','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- UNIQUE(order_id) — one cashier entry per order
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.cashier_queue'::regclass
          AND conname  = 'cashier_queue_order_id_key'
    ) THEN
        ALTER TABLE public.cashier_queue
            ADD CONSTRAINT cashier_queue_order_id_key UNIQUE (order_id);
    END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_cq_branch_status ON public.cashier_queue(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_cq_order         ON public.cashier_queue(order_id);

-- RLS
ALTER TABLE public.cashier_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cq_admin   ON public.cashier_queue;
DROP POLICY IF EXISTS cq_cashier ON public.cashier_queue;
DROP POLICY IF EXISTS cq_staff   ON public.cashier_queue;

CREATE POLICY cq_admin ON public.cashier_queue
    FOR ALL USING (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

CREATE POLICY cq_cashier ON public.cashier_queue
    FOR ALL USING (auth_has_role('cashier'))
    WITH CHECK (auth_has_role('cashier'));

CREATE POLICY cq_staff ON public.cashier_queue
    FOR SELECT USING (is_staff());

GRANT SELECT, INSERT, UPDATE ON public.cashier_queue TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · inventory_queue — stock BOM deduction target
--
-- One row per accepted order.  Inventory system subscribes for INSERT events.
-- issue_stage controls WHEN the BOM deduction fires:
--   'on_kitchen_start' — deduct when first KOT moves to preparing
--   'on_serve'         — deduct when order status → served
--   'on_invoice'       — deduct when invoice is created
-- Status lifecycle: pending → processing → deducted | cancelled
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_queue (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID        NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
    branch_id    UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','processing','deducted','cancelled')),
    issue_stage  TEXT        NOT NULL DEFAULT 'on_kitchen_start'
                             CHECK (issue_stage IN ('on_kitchen_start','on_serve','on_invoice')),
    deducted_at  TIMESTAMPTZ,
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE(order_id)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.inventory_queue'::regclass
          AND conname  = 'inventory_queue_order_id_key'
    ) THEN
        ALTER TABLE public.inventory_queue
            ADD CONSTRAINT inventory_queue_order_id_key UNIQUE (order_id);
    END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_iq_branch_status ON public.inventory_queue(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_iq_order         ON public.inventory_queue(order_id);
CREATE INDEX IF NOT EXISTS idx_iq_issue_stage   ON public.inventory_queue(issue_stage, status);

-- RLS
ALTER TABLE public.inventory_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iq_admin ON public.inventory_queue;
DROP POLICY IF EXISTS iq_staff ON public.inventory_queue;

CREATE POLICY iq_admin ON public.inventory_queue
    FOR ALL USING (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

CREATE POLICY iq_staff ON public.inventory_queue
    FOR SELECT USING (is_staff());

GRANT SELECT, INSERT, UPDATE ON public.inventory_queue TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · finance_queue — cost/revenue posting target
--
-- One row per accepted order.  Finance system subscribes for INSERT events.
-- Status lifecycle: pending → posting → posted | cancelled
-- posting_ref: external reference from finance/accounting system.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.finance_queue (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
    branch_id   UUID        NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    status      TEXT        NOT NULL DEFAULT 'pending',
    posted_at   TIMESTAMPTZ,
    posting_ref TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columns that may be absent if the table pre-existed
ALTER TABLE public.finance_queue
    ADD COLUMN IF NOT EXISTS posted_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS posting_ref TEXT,
    ADD COLUMN IF NOT EXISTS notes       TEXT;

-- Recreate CHECK with full lifecycle (idempotent)
DO $$ BEGIN
    ALTER TABLE public.finance_queue DROP CONSTRAINT IF EXISTS finance_queue_status_check;
    ALTER TABLE public.finance_queue ADD  CONSTRAINT finance_queue_status_check
        CHECK (status IN ('pending','posting','posted','cancelled'));
EXCEPTION WHEN OTHERS THEN NULL; END; $$;

-- UNIQUE(order_id)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.finance_queue'::regclass
          AND conname  = 'finance_queue_order_id_key'
    ) THEN
        ALTER TABLE public.finance_queue
            ADD CONSTRAINT finance_queue_order_id_key UNIQUE (order_id);
    END IF;
END; $$;

CREATE INDEX IF NOT EXISTS idx_fq_branch_status ON public.finance_queue(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_fq_order         ON public.finance_queue(order_id);

-- RLS
ALTER TABLE public.finance_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fq_admin ON public.finance_queue;
DROP POLICY IF EXISTS fq_staff ON public.finance_queue;

CREATE POLICY fq_admin ON public.finance_queue
    FOR ALL USING (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

CREATE POLICY fq_staff ON public.finance_queue
    FOR SELECT USING (is_staff());

GRANT SELECT, INSERT, UPDATE ON public.finance_queue TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · _queue_set_updated_at — shared updated_at maintenance trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._queue_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_cq_updated_at ON public.cashier_queue;
CREATE TRIGGER trg_cq_updated_at
    BEFORE UPDATE ON public.cashier_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_set_updated_at();

DROP TRIGGER IF EXISTS trg_iq_updated_at ON public.inventory_queue;
CREATE TRIGGER trg_iq_updated_at
    BEFORE UPDATE ON public.inventory_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_set_updated_at();

DROP TRIGGER IF EXISTS trg_fq_updated_at ON public.finance_queue;
CREATE TRIGGER trg_fq_updated_at
    BEFORE UPDATE ON public.finance_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · _queue_audit_trigger — INSERT → order_status_events
--
-- Fires AFTER INSERT on each queue table.
-- Writes one order_status_events row per queue entry.
-- event_code pattern: {table_name}_created
--   e.g. 'cashier_queue_created', 'inventory_queue_created', 'finance_queue_created'
--
-- SAFETY: wrapped in EXCEPTION WHEN OTHERS so audit failure NEVER blocks
-- queue creation. Queue rows are the source of truth; audit is supplemental.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._queue_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        INSERT INTO public.order_status_events (
            order_id,
            old_status,      -- NULL: this is not an order state transition
            new_status,      -- initial queue status ('open' / 'pending')
            event_code,      -- e.g. 'cashier_queue_created'
            actor_user_id,   -- NULL: system-generated by trigger
            payload,
            created_at
        ) VALUES (
            NEW.order_id,
            NULL,
            NEW.status,
            TG_TABLE_NAME || '_created',
            NULL,
            jsonb_build_object(
                'queue_table', TG_TABLE_NAME,
                'queue_id',    NEW.id,
                'branch_id',   NEW.branch_id,
                'status',      NEW.status
            ),
            now()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;   -- audit failure must never block queue creation
    END;
    RETURN NEW;
END;
$$;

-- Apply to all three queue tables
DROP TRIGGER IF EXISTS trg_cq_audit ON public.cashier_queue;
CREATE TRIGGER trg_cq_audit
    AFTER INSERT ON public.cashier_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_audit_trigger();

DROP TRIGGER IF EXISTS trg_iq_audit ON public.inventory_queue;
CREATE TRIGGER trg_iq_audit
    AFTER INSERT ON public.inventory_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_audit_trigger();

DROP TRIGGER IF EXISTS trg_fq_audit ON public.finance_queue;
CREATE TRIGGER trg_fq_audit
    AFTER INSERT ON public.finance_queue
    FOR EACH ROW EXECUTE FUNCTION public._queue_audit_trigger();


-- ─────────────────────────────────────────────────────────────────────────────
-- §6 · supabase_realtime publication — add downstream tables (idempotent)
--
-- Each table is added only if not already a member of supabase_realtime.
-- Clients subscribe to these tables for real-time INSERT/UPDATE events.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'cashier_queue',       -- POS subscribes: branch_id filter
        'inventory_queue',     -- Inventory subscribes: branch_id filter
        'finance_queue',       -- Finance subscribes: branch_id filter
        'kot_dispatches',      -- Kitchen subscribes: target_code=KITCHEN filter
        'kot_tickets',         -- Kitchen subscribes: kitchen_id filter
        'kot_items',           -- Kitchen subscribes: status updates
        'order_status_events', -- Admin/monitor: full audit stream
        'orders',              -- Waiter/floor/POS: status transitions
        'order_items'          -- Kitchen/waiter: per-item status
    ];
    v_t TEXT;
BEGIN
    FOREACH v_t IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname    = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename  = v_t
        ) THEN
            EXECUTE format(
                'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_t
            );
        END IF;
    END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §7 · rpc_waiter_accept_order — full replacement
--
-- Changes vs kot_routing_engine.sql §6:
--   STEP 5 · stock_queue replaced by inventory_queue (canonical table name)
--            queues_created response key updated (stock → inventory)
--   STEP 7 · notify_role added for 'inventory' and 'finance' roles
--            (kitchen + cashier notifications unchanged)
--
-- All other steps (auth checks, row lock, audit, KOT engine, ERP log)
-- are identical to the previous version.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_waiter_accept_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id       UUID        := auth.uid();
    v_actor_role     TEXT;
    v_actor_name     TEXT;
    v_order          RECORD;
    v_now            TIMESTAMPTZ := now();
    v_kot_result     JSONB;
    v_kot_count      INT := 0;
    v_dispatch_count INT := 0;
BEGIN

    -- ── CHECK 1 · Authentication ─────────────────────────────────────────
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 'code', 'NOT_AUTHENTICATED',
            'error', 'Authentication required.'
        );
    END IF;

    -- ── CHECK 2 · Role ────────────────────────────────────────────────────
    IF    auth_has_role('waiter')  THEN v_actor_role := 'waiter';
    ELSIF auth_has_role('manager') THEN v_actor_role := 'manager';
    ELSIF auth_has_role('admin')   THEN v_actor_role := 'admin';
    ELSE
        RETURN jsonb_build_object(
            'success', false, 'code', 'FORBIDDEN',
            'error', 'Insufficient role. Waiter, manager, or admin required.'
        );
    END IF;

    -- ── CHECK 3 · Lock order row (serialises concurrent accepts) ─────────
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'code', 'NOT_FOUND', 'error', 'Order not found.'
        );
    END IF;

    -- ── CHECK 4 · Idempotency ─────────────────────────────────────────────
    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id = v_actor_id THEN
        RETURN jsonb_build_object(
            'success', true, 'code', 'ALREADY_ACCEPTED',
            'message', 'You already accepted this order.',
            'order_id', p_order_id, 'assigned_waiter_id', v_actor_id
        );
    END IF;

    -- ── CHECK 5 · Taken by another waiter ────────────────────────────────
    IF v_order.status = 'accepted' AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 'code', 'ALREADY_TAKEN',
            'error', 'This order was just accepted by another waiter.'
        );
    END IF;

    -- ── CHECK 6 · Status must be pending_waiter ───────────────────────────
    IF v_order.status <> 'pending_waiter' THEN
        RETURN jsonb_build_object(
            'success', false, 'code', 'INVALID_STATUS',
            'error', 'Cannot accept order in status: ' || v_order.status || '.'
        );
    END IF;

    -- ── CHECK 7 · Shift + branch access ──────────────────────────────────
    IF v_actor_role = 'waiter' AND NOT auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object(
            'success', false, 'code', 'NOT_ON_SHIFT',
            'error', 'You are not currently on shift for this branch.'
        );
    END IF;

    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 1 · Accept the order
    -- ════════════════════════════════════════════════════════
    UPDATE orders
    SET status             = 'accepted',
        assigned_waiter_id = v_actor_id,
        accepted_at        = v_now,
        updated_at         = v_now
    WHERE id = p_order_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 2 · Audit: order-level status transition
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_status_events (
        order_id, old_status, new_status,
        created_by, event_code, actor_user_id, actor_role,
        payload, created_at
    ) VALUES (
        p_order_id, 'pending_waiter', 'accepted',
        v_actor_id, 'waiter_accepted', v_actor_id, v_actor_role,
        jsonb_build_object(
            'waiter_id',    v_actor_id,
            'waiter_name',  COALESCE(v_actor_name, 'Unknown'),
            'order_number', v_order.order_number,
            'branch_id',    v_order.branch_id,
            'table_id',     v_order.table_id
        ),
        v_now
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 3 · order_acceptance record (one winner via UNIQUE)
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_acceptance (order_id, accepted_by, accepted_at)
    VALUES (p_order_id, v_actor_id, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ════════════════════════════════════════════════════════
    -- STEP 4 · KOT routing + generation (dedicated engine)
    -- ════════════════════════════════════════════════════════
    v_kot_result := generate_kots_for_order(p_order_id, v_order.branch_id, v_actor_id);

    IF NOT (v_kot_result->>'success')::BOOLEAN THEN
        -- KOT failure is surfaced but does NOT roll back the accept.
        RETURN jsonb_build_object(
            'success', true,
            'code',    'ACCEPTED_KOT_ERROR',
            'order_id', p_order_id,
            'assigned_waiter_id', v_actor_id,
            'warning', 'Order accepted but KOT generation failed: '
                       || (v_kot_result->>'error')
        );
    END IF;

    v_kot_count      := (v_kot_result->>'kot_count')::INT;
    v_dispatch_count := (v_kot_result->>'dispatch_count')::INT;

    -- ════════════════════════════════════════════════════════
    -- STEP 5 · Downstream work queues
    --
    -- All three are idempotent (ON CONFLICT (order_id) DO NOTHING).
    -- Audit rows are written automatically by §5 triggers.
    -- ════════════════════════════════════════════════════════

    -- POS: full order queued for invoice generation
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- Inventory: BOM deduction queued (fires at on_kitchen_start event)
    INSERT INTO inventory_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- Finance: cost/revenue posting queued
    INSERT INTO finance_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ════════════════════════════════════════════════════════
    -- STEP 6 · ERP event log
    -- ════════════════════════════════════════════════════════
    PERFORM log_erp_event(
        'waiter_accepted', 'order', p_order_id,
        v_actor_id, v_actor_role, v_order.branch_id,
        jsonb_build_object(
            'waiter_name',      COALESCE(v_actor_name, 'Unknown'),
            'order_number',     v_order.order_number,
            'kot_count',        v_kot_count,
            'dispatch_count',   v_dispatch_count,
            'routing_warnings', v_kot_result->'warnings'
        )
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 7 · Real-time push notifications — all 4 downstream roles
    -- ════════════════════════════════════════════════════════

    -- Kitchen: per-KOT notification (kitchen display)
    PERFORM notify_role(
        v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter')
            || '. ' || v_kot_count || ' KOT(s) created.',
        'soup_kitchen', 'orange', '/kitchen',
        'order', p_order_id, v_actor_id
    );

    -- POS / Cashier: full order ready for invoicing
    PERFORM notify_role(
        v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️  Billing — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos',
        'order', p_order_id, v_actor_id
    );

    -- Inventory: BOM deduction queued
    PERFORM notify_role(
        v_order.branch_id, 'inventory', 'order_accepted',
        '📦 Stock Queue — Order #' || v_order.order_number,
        'BOM deduction pending at kitchen start.',
        'inventory_2', 'blue', '/inventory',
        'order', p_order_id, v_actor_id
    );

    -- Finance: cost/revenue posting queued
    PERFORM notify_role(
        v_order.branch_id, 'finance', 'order_accepted',
        '💰 Finance Queue — Order #' || v_order.order_number,
        'Cost/revenue posting pending.',
        'account_balance', 'teal', '/finance',
        'order', p_order_id, v_actor_id
    );

    -- ════════════════════════════════════════════════════════
    -- SUCCESS
    -- ════════════════════════════════════════════════════════
    RETURN jsonb_build_object(
        'success',            true,
        'code',               'ACCEPTED',
        'order_id',           p_order_id,
        'assigned_waiter_id', v_actor_id,
        'kot_count',          v_kot_count,
        'dispatch_count',     v_dispatch_count,
        'kots',               v_kot_result->'kots',
        'queues_created',     jsonb_build_object(
                                  'cashier',   true,
                                  'inventory', true,
                                  'finance',   true
                              ),
        'routing_warnings',   v_kot_result->'warnings',
        'warning_count',      (v_kot_result->>'warning_count')::INT
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 'code', 'INTERNAL_ERROR',
        'error', SQLERRM, 'detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID) FROM anon;

-- Aliases remain unchanged
CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;
GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;
GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §8 · stock_queue backward-compat view
--
-- If stock_queue exists as a TABLE (pre-existing data), leave it untouched.
-- If it does NOT exist at all, create a view alias over inventory_queue
-- so any code still referencing stock_queue continues to work.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- Only act if stock_queue does not exist as any object
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'stock_queue'
    ) THEN
        EXECUTE $sql$
            CREATE VIEW public.stock_queue AS
            SELECT
                id,
                order_id,
                branch_id,
                status,
                issue_stage,
                deducted_at  AS processed_at,
                notes,
                created_at,
                updated_at
            FROM public.inventory_queue;
        $sql$;
    END IF;
END;
$$;
