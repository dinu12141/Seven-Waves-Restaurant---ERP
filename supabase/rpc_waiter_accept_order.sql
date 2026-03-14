-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: rpc_waiter_accept_order
-- Purpose   : Canonical, concurrency-safe waiter order acceptance
-- Depends on: auth_has_role, auth_is_on_shift, get_target_kitchen_for_item,
--             log_erp_event, notify_role
-- Safe to re-run: YES — all DDL is idempotent
--
-- CREATES / REPLACES:
--   §1  order_status_events  — audit table (CREATE IF NOT EXISTS + ALTER)
--   §2  orders column guards — assigned_waiter_id, accepted_at
--   §3  order_acceptance     — unique-per-order acceptance record
--   §4  rpc_waiter_accept_order(UUID) → JSONB  [canonical function]
--   §5  process_waiter_accept(UUID)            [backward-compat alias]
--   §6  accept_order_as_waiter(UUID)           [backward-compat alias]
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · order_status_events — audit event table
--
-- Base table may already exist from earlier migrations with fewer columns.
-- CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS makes this safe to
-- re-run on a database where the table already exists in any state.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_status_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    old_status    TEXT,                   -- NULL is valid for creation events
    new_status    TEXT        NOT NULL,
    created_by    UUID,                   -- legacy alias for actor_user_id
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bring the table to the full canonical schema (idempotent)
ALTER TABLE public.order_status_events
    ADD COLUMN IF NOT EXISTS event_code    TEXT,
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS actor_role    TEXT,
    ADD COLUMN IF NOT EXISTS payload       JSONB NOT NULL DEFAULT '{}';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ose_order_id   ON public.order_status_events(order_id);
CREATE INDEX IF NOT EXISTS idx_ose_order_time ON public.order_status_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ose_event_code ON public.order_status_events(event_code);

-- Realtime
ALTER TABLE public.order_status_events REPLICA IDENTITY FULL;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- RLS
ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ose_admin        ON public.order_status_events;
DROP POLICY IF EXISTS ose_staff_select ON public.order_status_events;
DROP POLICY IF EXISTS ose_system_insert ON public.order_status_events;

-- Admins / managers: full access
CREATE POLICY ose_admin ON public.order_status_events
    FOR ALL
    USING     (is_admin() OR is_manager())
    WITH CHECK(is_admin() OR is_manager());

-- Staff (waiter, kitchen, cashier): read-only, own branch only
CREATE POLICY ose_staff_select ON public.order_status_events
    FOR SELECT
    USING (
        is_staff()
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id         = order_status_events.order_id
              AND o.branch_id  = ANY(auth_branch_ids())
        )
    );

-- Direct INSERT restricted to staff; SECURITY DEFINER RPCs bypass RLS anyway
CREATE POLICY ose_system_insert ON public.order_status_events
    FOR INSERT
    WITH CHECK (is_staff());


-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · orders column guards
--     assigned_waiter_id and accepted_at should already exist.
--     Add idempotently in case this is a fresh DB.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS assigned_waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS accepted_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter
    ON public.orders(assigned_waiter_id)
    WHERE assigned_waiter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_status
    ON public.orders(branch_id, status);


-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · order_acceptance — one row per accepted order
--     UNIQUE(order_id) is the database-level "only one winner" guarantee.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_acceptance (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    accepted_by UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_acceptance_order
    ON public.order_acceptance(order_id);
CREATE INDEX IF NOT EXISTS idx_order_acceptance_waiter
    ON public.order_acceptance(accepted_by);

ALTER TABLE public.order_acceptance REPLICA IDENTITY FULL;
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_acceptance;
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

ALTER TABLE public.order_acceptance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oa_admin         ON public.order_acceptance;
DROP POLICY IF EXISTS oa_staff_select  ON public.order_acceptance;
DROP POLICY IF EXISTS oa_system_insert ON public.order_acceptance;

CREATE POLICY oa_admin ON public.order_acceptance
    FOR ALL
    USING     (is_admin() OR is_manager())
    WITH CHECK(is_admin() OR is_manager());

CREATE POLICY oa_staff_select ON public.order_acceptance
    FOR SELECT
    USING (
        is_staff()
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id        = order_acceptance.order_id
              AND o.branch_id = ANY(auth_branch_ids())
        )
    );

CREATE POLICY oa_system_insert ON public.order_acceptance
    FOR INSERT WITH CHECK (is_staff());


-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · rpc_waiter_accept_order — canonical implementation
--
-- SECURITY MODEL
--   SECURITY DEFINER + SET search_path = public: runs as DB owner.
--   All access-control checks are explicit inside the body.
--   No direct table access by the caller; only this function mutates state.
--
-- CONCURRENCY MODEL
--   SELECT … FOR UPDATE serialises concurrent accepts on the same order row.
--   Transaction A (first waiter): acquires lock → validates → commits.
--   Transaction B (second waiter): waits for A → re-reads committed state →
--     sees status='accepted' + assigned_waiter_id set → returns ALREADY_TAKEN.
--   Result: exactly one waiter wins; the loser gets a clear, accurate error.
--
-- KOT ORCHESTRATION
--   Included because cashier_queue / billing pipeline are tightly coupled.
--   All KOT sub-steps are individually idempotent (ON CONFLICT DO NOTHING /
--   explicit existence checks) so re-running after a partial failure is safe.
--
-- RETURN CODES
--   success=true  + code='ACCEPTED'          normal accept
--   success=true  + code='ALREADY_ACCEPTED'  caller already owns this order (idempotent)
--   success=false + code='NOT_AUTHENTICATED' no JWT
--   success=false + code='FORBIDDEN'         wrong role
--   success=false + code='NOT_FOUND'         order_id does not exist
--   success=false + code='INVALID_STATUS'    order not in pending_waiter state
--   success=false + code='ALREADY_TAKEN'     another waiter just accepted
--   success=false + code='NOT_ON_SHIFT'      waiter not on an active shift
--   success=false + code='INTERNAL_ERROR'    unexpected exception (SQLERRM included)
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
    -- KOT state
    v_kot_id         UUID;
    v_kot_rec        RECORD;
    v_default_kitchen UUID;
    v_kot_count      INT  := 0;
    v_dispatch_count INT  := 0;
BEGIN

    -- ────────────────────────────────────────────────────────
    -- CHECK 1 · Authentication
    -- ────────────────────────────────────────────────────────
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'NOT_AUTHENTICATED',
            'error',   'Authentication required.'
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 2 · Role authorisation
    --           Priority: waiter > manager > admin (tightest first)
    -- ────────────────────────────────────────────────────────
    IF    auth_has_role('waiter')  THEN v_actor_role := 'waiter';
    ELSIF auth_has_role('manager') THEN v_actor_role := 'manager';
    ELSIF auth_has_role('admin')   THEN v_actor_role := 'admin';
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'code',    'FORBIDDEN',
            'error',   'Insufficient role. Waiter, manager, or admin required.'
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 3 · Order existence + exclusive row lock
    --
    --   FOR UPDATE blocks any concurrent transaction that also
    --   tries to lock this row, serialising all accept attempts.
    --   The second transaction waits, then re-reads the committed
    --   state from the winning transaction.
    -- ────────────────────────────────────────────────────────
    SELECT * INTO v_order
    FROM   orders
    WHERE  id = p_order_id
    FOR UPDATE;               -- row-level exclusive lock

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'NOT_FOUND',
            'error',   'Order not found.'
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 4 · Idempotency — caller already owns this order
    -- ────────────────────────────────────────────────────────
    IF v_order.status = 'accepted'
       AND v_order.assigned_waiter_id = v_actor_id
    THEN
        RETURN jsonb_build_object(
            'success',            true,
            'code',               'ALREADY_ACCEPTED',
            'message',            'You already accepted this order.',
            'order_id',           p_order_id,
            'assigned_waiter_id', v_actor_id
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 5 · Order already taken by another waiter
    --           (concurrency loser sees this after lock released)
    -- ────────────────────────────────────────────────────────
    IF v_order.status = 'accepted'
       AND v_order.assigned_waiter_id IS NOT NULL
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'ALREADY_TAKEN',
            'error',   'This order was just accepted by another waiter.'
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 6 · Order must be in pending_waiter state
    -- ────────────────────────────────────────────────────────
    IF v_order.status <> 'pending_waiter' THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_STATUS',
            'error',   'Cannot accept order in status: ' || v_order.status || '.'
        );
    END IF;

    -- ────────────────────────────────────────────────────────
    -- CHECK 7 · Shift + branch access
    --           Managers and admins bypass via auth_is_on_shift internals.
    --           Waiters must have an active shift assignment for this branch.
    -- ────────────────────────────────────────────────────────
    IF v_actor_role = 'waiter' THEN
        IF NOT auth_is_on_shift(v_order.branch_id) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code',    'NOT_ON_SHIFT',
                'error',   'You are not currently on shift for this branch.'
            );
        END IF;
    END IF;

    -- Resolve actor display name (best-effort; NULL falls back to 'Waiter')
    SELECT full_name INTO v_actor_name
    FROM   profiles
    WHERE  id = v_actor_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 1 · Accept the order
    -- ════════════════════════════════════════════════════════
    UPDATE orders
    SET
        status             = 'accepted',
        assigned_waiter_id = v_actor_id,
        accepted_at        = v_now,
        updated_at         = v_now
    WHERE id = p_order_id;

    -- ════════════════════════════════════════════════════════
    -- STEP 2 · Audit: write order_status_events row
    --
    --   Direct INSERT (not via log_erp_event) so we capture the
    --   precise old_status='pending_waiter' → new_status='accepted'
    --   transition. log_erp_event sets old_status='' which loses
    --   the state-machine context needed for timeline queries.
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_status_events (
        order_id,
        old_status,
        new_status,
        created_by,       -- legacy column; same value as actor_user_id
        event_code,
        actor_user_id,
        actor_role,
        payload,
        created_at
    ) VALUES (
        p_order_id,
        'pending_waiter',
        'accepted',
        v_actor_id,
        'waiter_accepted',
        v_actor_id,
        v_actor_role,
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
    -- STEP 3 · order_acceptance record
    --
    --   ON CONFLICT DO NOTHING: if this record already exists
    --   (re-run scenario) we skip silently. The UNIQUE(order_id)
    --   constraint is the hard DB-level "one winner" guarantee —
    --   if two transactions race past CHECK 5 (extremely unlikely
    --   with FOR UPDATE), only one INSERT succeeds.
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_acceptance (order_id, accepted_by, accepted_at)
    VALUES (p_order_id, v_actor_id, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ════════════════════════════════════════════════════════
    -- STEP 4 · KOT Orchestration
    --   Tightly coupled: cashier_queue entry (created in step 5)
    --   is what puts the order into the billing queue. KOTs must
    --   exist before the cashier can act. All sub-steps idempotent.
    -- ════════════════════════════════════════════════════════

    -- 4-a. Route unrouted order_items to their target kitchen
    UPDATE order_items
    SET kitchen_id = get_target_kitchen_for_item(menu_item_id, v_order.branch_id)
    WHERE order_id = p_order_id
      AND (kitchen_id IS NULL OR status = 'queued');

    -- 4-b. Fallback kitchen: first active kitchen for this branch
    SELECT id INTO v_default_kitchen
    FROM   kitchens
    WHERE  branch_id = v_order.branch_id
      AND  is_active  = true
    ORDER BY created_at ASC
    LIMIT 1;

    -- 4-c. One KOT per distinct target kitchen (idempotent per order+kitchen)
    FOR v_kot_rec IN
        SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
        FROM   order_items
        WHERE  order_id = p_order_id
          AND  status   = 'queued'
    LOOP
        CONTINUE WHEN v_kot_rec.kit_id IS NULL;

        -- Skip if KOT already exists for this order + kitchen
        IF EXISTS (
            SELECT 1 FROM kot_tickets
            WHERE order_id  = p_order_id
              AND kitchen_id = v_kot_rec.kit_id
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO kot_tickets (order_id, kitchen_id, status, batch_number, created_at)
        VALUES (p_order_id, v_kot_rec.kit_id, 'created', 1, v_now)
        RETURNING id INTO v_kot_id;

        -- Attach queued items to this KOT
        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, oi.id, oi.quantity, 'queued'
        FROM   order_items oi
        WHERE  oi.order_id  = p_order_id
          AND  COALESCE(oi.kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
          AND  oi.status    = 'queued';

        -- Advance order_items status
        UPDATE order_items
        SET
            status     = 'sent_to_kitchen',
            kitchen_id = COALESCE(kitchen_id, v_default_kitchen)
        WHERE order_id = p_order_id
          AND COALESCE(kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
          AND status   = 'queued';

        v_kot_count := v_kot_count + 1;
    END LOOP;

    -- 4-d. Dispatch each KOT to four routing targets (idempotent)
    FOR v_kot_rec IN
        SELECT id FROM kot_tickets WHERE order_id = p_order_id
    LOOP
        -- KITCHEN: pending — kitchen display must acknowledge
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- CASHIER: pre-delivered — billing queue visible immediately
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- INVENTORY: pre-delivered — stock deduction pipeline can start
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- FINANCE: pre-delivered — cost accrual pipeline can start
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_rec.id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_dispatch_count := v_dispatch_count + 4;
    END LOOP;

    -- ════════════════════════════════════════════════════════
    -- STEP 5 · Downstream work queues (idempotent)
    -- ════════════════════════════════════════════════════════
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, issue_stage, created_at, updated_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', 'on_kitchen_start', v_now, v_now)
    ON CONFLICT (order_id) DO NOTHING;

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
            'waiter_name',    COALESCE(v_actor_name, 'Unknown'),
            'order_number',   v_order.order_number,
            'kot_count',      v_kot_count,
            'dispatch_count', v_dispatch_count
        )
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 7 · Real-time push notifications
    -- ════════════════════════════════════════════════════════
    PERFORM notify_role(
        v_order.branch_id, 'kitchen', 'order_accepted',
        '📋 New KOT — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter')
            || '. ' || v_kot_count || ' KOT(s) created.',
        'soup_kitchen', 'orange', '/kitchen',
        'order', p_order_id, v_actor_id
    );

    PERFORM notify_role(
        v_order.branch_id, 'cashier', 'order_accepted',
        '⚠️  Billing — Order #' || v_order.order_number,
        'Accepted by ' || COALESCE(v_actor_name, 'Waiter') || '. Prepare invoice.',
        'point_of_sale', 'deep-orange', '/pos',
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
        'queues_created',     jsonb_build_object(
                                  'cashier',   true,
                                  'stock',     true,
                                  'finance',   true
                              )
    );

EXCEPTION WHEN OTHERS THEN
    -- Surface full diagnostic info; caller decides how to present it
    RETURN jsonb_build_object(
        'success', false,
        'code',    'INTERNAL_ERROR',
        'error',   SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID) FROM anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · Backward-compatible aliases
--     Frontend currently calls process_waiter_accept / accept_order_as_waiter.
--     Both are now thin wrappers — one canonical implementation to maintain.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;
