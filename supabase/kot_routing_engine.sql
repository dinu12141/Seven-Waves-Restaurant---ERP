-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: kot_routing_engine
-- Purpose   : Correct, inspectable, auditable KOT routing
-- Depends on: kitchen_subcategory_map, kot_tickets, kot_items, order_items,
--             order_status_events, kot_dispatches, log_erp_event
-- Safe to re-run: YES — all DDL is idempotent
--
-- CREATES / REPLACES:
--   §1  kitchen_subcategory_map — integrity hardening + semantic view
--   §2  resolve_kitchen_for_item_full(menu_item_id, branch_id) → JSONB
--   §3  get_target_kitchen_for_item(menu_item_id, branch_id) → UUID  [thin wrapper]
--   §4  resolve_order_kot_routing(order_id) → TABLE  [read-only inspection]
--   §5  generate_kots_for_order(order_id, branch_id, actor_id) → JSONB [KOT engine]
--   §6  rpc_waiter_accept_order — replace inline KOT block with §5
--   §7  add_items_to_order — replace inline KOT block with §5, fix 'pending' bug
--   §8  process_waiter_accept / accept_order_as_waiter — thin aliases (compat)
--
-- BUGS FIXED:
--   BUG-1  get_target_kitchen_for_item: WHILE loop with no depth guard
--           (circular parent_id → infinite loop)
--   BUG-2  rpc_waiter_accept_order Step 4-a: `OR status='queued'` overwrites
--           kitchen_ids that were correctly set at order-creation time
--   BUG-3  rpc_waiter_accept_order Step 4-c: COALESCE silently swallows
--           unrouted items — no warning, no audit trail
--   BUG-4  process_waiter_accept: kot_items.status='pending' violates
--           chk_ki_status constraint ('queued' is the correct initial value)
--   BUG-5  add_items_to_order: same 'pending' bug + duplicated KOT logic
--   BUG-6  kitchen_subcategory_map: no is_active, routing never filters
--           disabled mappings
--   BUG-7  No per-KOT audit event written anywhere
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · kitchen_subcategory_map — integrity hardening
--
-- NAMING NOTE:
--   The column is called category_id for historical reasons.
--   In practice it holds the ID of the most specific (leaf) category a menu
--   item belongs to — i.e. what the business calls a "subcategory".
--   Top-level categories can be mapped too (flat-catalogue restaurants).
--   Do not rename the column; the semantic view below clarifies intent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure base table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.kitchen_subcategory_map (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID        NOT NULL REFERENCES public.categories(id)  ON DELETE CASCADE,
    branch_id   UUID        NOT NULL REFERENCES public.branches(id)    ON DELETE CASCADE,
    kitchen_id  UUID        NOT NULL REFERENCES public.kitchens(id)    ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category_id, branch_id)
);

-- Add management columns (idempotent)
ALTER TABLE public.kitchen_subcategory_map
    ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public._ksm_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ksm_updated_at ON public.kitchen_subcategory_map;
CREATE TRIGGER trg_ksm_updated_at
    BEFORE UPDATE ON public.kitchen_subcategory_map
    FOR EACH ROW EXECUTE FUNCTION public._ksm_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ksm_cat_branch  ON public.kitchen_subcategory_map(category_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_ksm_kitchen      ON public.kitchen_subcategory_map(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_ksm_branch_active ON public.kitchen_subcategory_map(branch_id, is_active);

-- RLS
ALTER TABLE public.kitchen_subcategory_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ksm_admin   ON public.kitchen_subcategory_map;
DROP POLICY IF EXISTS ksm_select  ON public.kitchen_subcategory_map;

CREATE POLICY ksm_admin ON public.kitchen_subcategory_map
    FOR ALL USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY ksm_select ON public.kitchen_subcategory_map
    FOR SELECT USING (is_staff());

-- Semantic view: clarifies that category_id IS the subcategory identifier
-- Guard: if subcategory_kitchen_map exists as a TABLE (legacy), drop it first.
-- CREATE OR REPLACE VIEW cannot replace a non-view object.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'subcategory_kitchen_map'
          AND c.relkind = 'r'   -- 'r' = ordinary table
    ) THEN
        DROP TABLE public.subcategory_kitchen_map CASCADE;
    END IF;
END;
$$;

CREATE OR REPLACE VIEW public.subcategory_kitchen_map AS
SELECT
    id,
    category_id   AS subcategory_id,    -- explicit alias
    branch_id,
    kitchen_id,
    is_active,
    created_at,
    updated_at
FROM public.kitchen_subcategory_map;

COMMENT ON VIEW public.subcategory_kitchen_map IS
    'Semantic alias for kitchen_subcategory_map. '
    'subcategory_id = the category_id column (most-specific category a menu item belongs to). '
    'Routing rule: menu_item.category_id → kitchen_subcategory_map → kitchen_id.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · resolve_kitchen_for_item_full — routing with metadata
--
-- Returns JSONB:
--   { kitchen_id, kitchen_name, routing_method, routing_path, is_fallback }
--
-- Routing priority chain (highest → lowest):
--   1. menu_items.kitchen_id          — direct admin pin
--   2. kitchen_subcategory_map        — item's own category (exact match)
--   3. Walk up categories.parent_id   — check map at each ancestor level
--      (max 10 levels, guards against circular parent_id)
--   4. Branch default kitchen         — first active kitchen for branch
--      (is_fallback = true, appears in warnings)
--   5. NULL                           — no kitchen exists at all for branch
--      (is_fallback = true, item is unroutable — caller must handle)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_kitchen_for_item_full(
    p_menu_item_id UUID,
    p_branch_id    UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_kitchen_id   UUID;
    v_kitchen_name TEXT;
    v_category_id  UUID;
    v_current_cat  UUID;
    v_cat_name     TEXT;
    v_depth        INT := 0;
    v_max_depth    CONSTANT INT := 10;
BEGIN
    -- ── Priority 1: Direct kitchen pin on menu_item ───────────────────────
    SELECT mi.kitchen_id, mi.category_id
    INTO   v_kitchen_id, v_category_id
    FROM   menu_items mi
    WHERE  mi.id = p_menu_item_id;

    IF v_kitchen_id IS NOT NULL THEN
        SELECT name INTO v_kitchen_name FROM kitchens WHERE id = v_kitchen_id;
        RETURN jsonb_build_object(
            'kitchen_id',     v_kitchen_id,
            'kitchen_name',   v_kitchen_name,
            'routing_method', 'direct_pin',
            'routing_path',   'menu_item → ' || COALESCE(v_kitchen_name, '(unnamed kitchen)'),
            'is_fallback',    false
        );
    END IF;

    -- ── Priority 2 & 3: Walk category tree, check map at each level ───────
    --   Depth 0 = item's own category (subcategory match)
    --   Depth 1+ = ancestor categories (parent match)
    --   Guard: stop after v_max_depth to prevent infinite loop on circular data
    v_current_cat := v_category_id;
    WHILE v_current_cat IS NOT NULL AND v_depth < v_max_depth LOOP

        SELECT ksm.kitchen_id, k.name, c.name
        INTO   v_kitchen_id, v_kitchen_name, v_cat_name
        FROM   kitchen_subcategory_map ksm
        JOIN   kitchens    k ON k.id = ksm.kitchen_id
        JOIN   categories  c ON c.id = ksm.category_id
        WHERE  ksm.category_id = v_current_cat
          AND  ksm.branch_id   = p_branch_id
          AND  ksm.is_active   = true        -- only active mappings
        LIMIT 1;

        IF v_kitchen_id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'kitchen_id',     v_kitchen_id,
                'kitchen_name',   v_kitchen_name,
                'routing_method', CASE v_depth WHEN 0 THEN 'subcategory_map' ELSE 'parent_map' END,
                'routing_path',   v_cat_name || ' → ' || v_kitchen_name,
                'is_fallback',    false
            );
        END IF;

        -- Walk to parent category
        SELECT parent_id INTO v_current_cat
        FROM   categories
        WHERE  id = v_current_cat;

        v_depth := v_depth + 1;
    END LOOP;

    -- ── Priority 4: Branch default kitchen (fallback) ─────────────────────
    SELECT id, name INTO v_kitchen_id, v_kitchen_name
    FROM   kitchens
    WHERE  branch_id = p_branch_id
      AND  is_active  = true
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_kitchen_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'kitchen_id',     v_kitchen_id,
            'kitchen_name',   v_kitchen_name,
            'routing_method', 'default_fallback',
            'routing_path',   'no category mapping → ' || v_kitchen_name || ' (branch default)',
            'is_fallback',    true
        );
    END IF;

    -- ── Priority 5: No kitchen at all ────────────────────────────────────
    RETURN jsonb_build_object(
        'kitchen_id',     NULL,
        'kitchen_name',   NULL,
        'routing_method', 'no_kitchen',
        'routing_path',   'no active kitchen configured for this branch',
        'is_fallback',    true
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_kitchen_for_item_full(UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · get_target_kitchen_for_item — thin wrapper (backward compatibility)
--
-- All existing callers (create_kiosk_order, create_order_from_session,
-- add_items_to_order) continue to work unchanged.
-- BUG-1 fixed: WHILE loop now inside resolve_kitchen_for_item_full with
-- depth guard.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_target_kitchen_for_item(
    p_menu_item_id UUID,
    p_branch_id    UUID
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT (public.resolve_kitchen_for_item_full(p_menu_item_id, p_branch_id) ->> 'kitchen_id')::UUID;
$$;

GRANT EXECUTE ON FUNCTION public.get_target_kitchen_for_item(UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · resolve_order_kot_routing — read-only inspection function
--
-- Returns one row per non-cancelled order_item showing how it would be /
-- has been routed to a kitchen. Use from:
--   - Admin UI to audit routing before / after acceptance
--   - Debugging unexpected KOT assignments
--   - Pre-flight checks in tests
--
-- Does NOT mutate any state.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_order_kot_routing(p_order_id UUID)
RETURNS TABLE (
    order_item_id      UUID,
    menu_item_id       UUID,
    menu_item_name     TEXT,
    quantity           INT,
    current_kitchen_id UUID,    -- kitchen_id already stored on the order_item
    target_kitchen_id  UUID,    -- kitchen_id the routing engine would assign
    kitchen_name       TEXT,
    routing_method     TEXT,    -- 'direct_pin'|'subcategory_map'|'parent_map'|'default_fallback'|'no_kitchen'
    routing_path       TEXT,    -- human-readable: e.g. "Burgers → Main Kitchen"
    is_fallback        BOOLEAN, -- true = no explicit mapping, fell back to default
    item_status        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_branch  UUID;
    v_item    RECORD;
    v_routing JSONB;
BEGIN
    SELECT branch_id INTO v_branch FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;

    FOR v_item IN
        SELECT oi.id, oi.menu_item_id, mi.name AS item_name,
               oi.quantity, oi.kitchen_id, oi.status
        FROM   order_items oi
        JOIN   menu_items  mi ON mi.id = oi.menu_item_id
        WHERE  oi.order_id = p_order_id
          AND  oi.status  <> 'cancelled'
        ORDER BY oi.created_at
    LOOP
        v_routing := resolve_kitchen_for_item_full(v_item.menu_item_id, v_branch);

        order_item_id      := v_item.id;
        menu_item_id       := v_item.menu_item_id;
        menu_item_name     := v_item.item_name;
        quantity           := v_item.quantity;
        current_kitchen_id := v_item.kitchen_id;
        target_kitchen_id  := (v_routing->>'kitchen_id')::UUID;
        kitchen_name       := v_routing->>'kitchen_name';
        routing_method     := v_routing->>'routing_method';
        routing_path       := v_routing->>'routing_path';
        is_fallback        := (v_routing->>'is_fallback')::BOOLEAN;
        item_status        := v_item.status;

        RETURN NEXT;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_order_kot_routing(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · generate_kots_for_order — KOT engine
--
-- Called from: rpc_waiter_accept_order (initial acceptance)
--              add_items_to_order (additional items mid-service)
--
-- CONTRACT:
--   1. Inspects all queued order_items for p_order_id
--   2. Resolves target kitchen for each item that has no kitchen_id yet
--      (items already routed at order-creation time are left untouched — BUG-2 fix)
--   3. Items that fall through to default kitchen → included in warnings
--   4. Items with no kitchen at all → included in warnings with 'UNROUTED' flag
--      (order acceptance proceeds; caller decides how to present warnings)
--   5. Groups remaining routed items by kitchen_id
--   6. Creates one kot_ticket per distinct kitchen (idempotent by order+kitchen+batch)
--   7. Creates kot_items for each ticket (status = 'queued' — BUG-4 fix)
--   8. Advances order_items.status → 'sent_to_kitchen'
--   9. Creates kot_dispatches to 4 targets (KITCHEN=pending, rest=delivered)
--  10. Writes one order_status_events row per KOT with event_code='kot_created'
--      (BUG-7 fix)
--
-- INVOICE:
--   This function does NOT touch invoices. One invoice = one order always.
--   KOT splitting is purely a kitchen-routing concern.
--
-- IDEMPOTENCY:
--   Safe to call twice. Duplicate calls produce no extra KOTs because of the
--   (order_id, kitchen_id, batch_number) existence check.
--
-- RETURN:
--   {
--     success: bool,
--     kot_count: int,
--     dispatch_count: int,
--     batch_number: int,
--     kots: [{kot_id, kitchen_id, kitchen_name, item_count, batch_number}],
--     warning_count: int,
--     warnings: [{order_item_id, menu_item_id, routing_method, warning}]
--   }
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_kots_for_order(
    p_order_id  UUID,
    p_branch_id UUID,
    p_actor_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item         RECORD;
    v_routing      JSONB;
    v_kitchen_id   UUID;
    v_kitchen_rec  RECORD;
    v_kot_id       UUID;
    v_now          TIMESTAMPTZ := now();
    v_batch_number INT;
    v_item_count   INT;
    v_kot_count    INT  := 0;
    v_disp_count   INT  := 0;
    v_warnings     JSONB := '[]'::JSONB;
    v_kots         JSONB := '[]'::JSONB;
BEGIN
    -- ── Determine batch number ────────────────────────────────────────────
    -- batch 1 on first acceptance; increments for add_items_to_order calls
    SELECT COALESCE(MAX(batch_number), 0) + 1 INTO v_batch_number
    FROM   kot_tickets
    WHERE  order_id = p_order_id;

    -- ── Step 1: Route unresolved items ───────────────────────────────────
    -- ONLY update items where kitchen_id IS NULL.
    -- Items pre-routed at order-creation time keep their kitchen_id. (BUG-2 fix)
    FOR v_item IN
        SELECT oi.id, oi.menu_item_id, oi.quantity
        FROM   order_items oi
        WHERE  oi.order_id   = p_order_id
          AND  oi.status     = 'queued'
          AND  oi.kitchen_id IS NULL
    LOOP
        v_routing    := resolve_kitchen_for_item_full(v_item.menu_item_id, p_branch_id);
        v_kitchen_id := (v_routing->>'kitchen_id')::UUID;

        IF v_kitchen_id IS NOT NULL THEN
            UPDATE order_items
            SET    kitchen_id = v_kitchen_id
            WHERE  id = v_item.id;

            -- Track fallbacks as warnings (BUG-3 fix)
            IF (v_routing->>'is_fallback')::BOOLEAN THEN
                v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
                    'order_item_id',  v_item.id,
                    'menu_item_id',   v_item.menu_item_id,
                    'routing_method', v_routing->>'routing_method',
                    'routing_path',   v_routing->>'routing_path',
                    'kitchen_name',   v_routing->>'kitchen_name',
                    'warning',        'No subcategory mapping found — routed to branch default kitchen'
                ));
            END IF;
        ELSE
            -- No kitchen at all — item cannot be sent to kitchen
            -- Fail safely: log as UNROUTED, do NOT abort the entire order
            v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
                'order_item_id',  v_item.id,
                'menu_item_id',   v_item.menu_item_id,
                'routing_method', 'no_kitchen',
                'routing_path',   v_routing->>'routing_path',
                'kitchen_name',   NULL,
                'warning',        'UNROUTED: no active kitchen configured for this branch — item not sent to kitchen'
            ));
        END IF;
    END LOOP;

    -- ── Step 2: Create one KOT per distinct kitchen ──────────────────────
    -- Only process items that are queued AND now have a resolved kitchen_id
    FOR v_kitchen_rec IN
        SELECT DISTINCT oi.kitchen_id, k.name AS kitchen_name
        FROM   order_items oi
        JOIN   kitchens    k ON k.id = oi.kitchen_id
        WHERE  oi.order_id   = p_order_id
          AND  oi.status     = 'queued'
          AND  oi.kitchen_id IS NOT NULL
        ORDER BY k.name
    LOOP
        -- Idempotency: skip if this batch already has a KOT for this kitchen
        IF EXISTS (
            SELECT 1 FROM kot_tickets
            WHERE  order_id    = p_order_id
              AND  kitchen_id  = v_kitchen_rec.kitchen_id
              AND  batch_number = v_batch_number
        ) THEN
            CONTINUE;
        END IF;

        -- ── 2a. Create KOT ticket ─────────────────────────────────────
        INSERT INTO kot_tickets (order_id, kitchen_id, status, batch_number, created_at)
        VALUES (p_order_id, v_kitchen_rec.kitchen_id, 'created', v_batch_number, v_now)
        RETURNING id INTO v_kot_id;

        -- ── 2b. Create KOT lines (status = 'queued') — BUG-4 fix ─────
        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, oi.id, oi.quantity, 'queued'   -- 'queued' is the correct initial value
        FROM   order_items oi
        WHERE  oi.order_id   = p_order_id
          AND  oi.kitchen_id = v_kitchen_rec.kitchen_id
          AND  oi.status     = 'queued';

        SELECT COUNT(*) INTO v_item_count
        FROM   kot_items
        WHERE  kot_id = v_kot_id;

        -- ── 2c. Advance order_items status ────────────────────────────
        UPDATE order_items
        SET    status = 'sent_to_kitchen'
        WHERE  order_id   = p_order_id
          AND  kitchen_id = v_kitchen_rec.kitchen_id
          AND  status     = 'queued';

        -- ── 2d. Dispatch to 4 routing targets ─────────────────────────
        -- KITCHEN → pending  (kitchen display must acknowledge)
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, created_at)
        VALUES (p_order_id, v_kot_id, 'KITCHEN', 'pending', v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- CASHIER → delivered (billing queue is visible immediately)
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'CASHIER', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- INVENTORY → delivered (stock deduction can start)
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'INVENTORY', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        -- FINANCE → delivered (cost accrual can start)
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status, delivered_at, created_at)
        VALUES (p_order_id, v_kot_id, 'FINANCE', 'delivered', v_now, v_now)
        ON CONFLICT (kot_id, target_code) DO NOTHING;

        v_disp_count := v_disp_count + 4;

        -- ── 2e. Per-KOT audit event — BUG-7 fix ──────────────────────
        INSERT INTO order_status_events (
            order_id,
            old_status,
            new_status,
            created_by,
            event_code,
            actor_user_id,
            payload,
            created_at
        ) VALUES (
            p_order_id,
            'accepted',
            'sent_to_kitchen',
            p_actor_id,
            'kot_created',
            p_actor_id,
            jsonb_build_object(
                'kot_id',       v_kot_id,
                'batch_number', v_batch_number,
                'kitchen_id',   v_kitchen_rec.kitchen_id,
                'kitchen_name', v_kitchen_rec.kitchen_name,
                'item_count',   v_item_count
            ),
            v_now
        );

        -- Accumulate KOT summary
        v_kots := v_kots || jsonb_build_array(jsonb_build_object(
            'kot_id',       v_kot_id,
            'batch_number', v_batch_number,
            'kitchen_id',   v_kitchen_rec.kitchen_id,
            'kitchen_name', v_kitchen_rec.kitchen_name,
            'item_count',   v_item_count
        ));

        v_kot_count := v_kot_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success',        true,
        'kot_count',      v_kot_count,
        'dispatch_count', v_disp_count,
        'batch_number',   v_batch_number,
        'kots',           v_kots,
        'warning_count',  jsonb_array_length(v_warnings),
        'warnings',       v_warnings
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_kots_for_order(UUID, UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §6 · rpc_waiter_accept_order — replace inline KOT block with §5
--
-- Changes vs previous version:
--   - DECLARE: adds v_kot_result JSONB
--   - Step 4 (inline KOT): replaced with generate_kots_for_order() call
--   - SUCCESS response: includes kots[], routing_warnings[]
--   - All other steps (auth, lock, audit, queues, notifications) unchanged
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
    -- KOT result from generate_kots_for_order
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

    -- Resolve display name for audit trail
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor_id;

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
    -- STEP 3 · order_acceptance record (one winner enforced by UNIQUE)
    -- ════════════════════════════════════════════════════════
    INSERT INTO order_acceptance (order_id, accepted_by, accepted_at)
    VALUES (p_order_id, v_actor_id, v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- ════════════════════════════════════════════════════════
    -- STEP 4 · KOT routing + generation (dedicated engine)
    --          Replaces the previous 60-line inline block.
    --          Per-KOT audit events are written inside the engine.
    -- ════════════════════════════════════════════════════════
    v_kot_result := generate_kots_for_order(p_order_id, v_order.branch_id, v_actor_id);

    IF NOT (v_kot_result->>'success')::BOOLEAN THEN
        -- KOT engine failure is surfaced but does NOT roll back the accept.
        -- The order IS accepted; kitchen routing failed. Operations can
        -- manually assign items. Return with a warning code.
        RETURN jsonb_build_object(
            'success', true,
            'code',    'ACCEPTED_KOT_ERROR',
            'order_id', p_order_id,
            'assigned_waiter_id', v_actor_id,
            'warning', 'Order accepted but KOT generation failed: ' || (v_kot_result->>'error')
        );
    END IF;

    v_kot_count      := (v_kot_result->>'kot_count')::INT;
    v_dispatch_count := (v_kot_result->>'dispatch_count')::INT;

    -- ════════════════════════════════════════════════════════
    -- STEP 5 · Downstream work queues
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
            'dispatch_count', v_dispatch_count,
            'routing_warnings', v_kot_result->'warnings'
        )
    );

    -- ════════════════════════════════════════════════════════
    -- STEP 7 · Real-time notifications
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
        'kots',               v_kot_result->'kots',
        'queues_created',     jsonb_build_object('cashier', true, 'stock', true, 'finance', true),
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


-- ─────────────────────────────────────────────────────────────────────────────
-- §7 · add_items_to_order — replace inline KOT logic with §5
--
-- Changes vs previous version:
--   - Removes inline FOR loop KOT generation (was also duplicating BUG-4)
--   - Calls generate_kots_for_order after inserting new order_items
--   - Routing is now consistent with acceptance path
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_items_to_order(
    p_order_id UUID,
    p_items    JSONB   -- [{menu_item_id, qty, notes?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order       RECORD;
    v_user_id     UUID := auth.uid();
    v_now         TIMESTAMPTZ := now();
    v_item        JSONB;
    v_menu        RECORD;
    v_target_k    UUID;
    v_new_subtotal NUMERIC(12,2) := 0;
    v_kot_result  JSONB;
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

    -- Insert new order items with kitchen routing applied at creation time
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price INTO v_menu
        FROM   menu_items
        WHERE  id = (v_item->>'menu_item_id')::UUID AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error',
                'Item not available: ' || (v_item->>'menu_item_id'));
        END IF;

        -- Pre-route at item creation so generate_kots_for_order skips re-routing
        v_target_k := get_target_kitchen_for_item(v_menu.id, v_order.branch_id);

        INSERT INTO order_items (
            order_id, menu_item_id, kitchen_id, quantity,
            unit_price, total_price, notes, status
        ) VALUES (
            p_order_id, v_menu.id, v_target_k,
            (v_item->>'qty')::INT,
            v_menu.base_price,
            v_menu.base_price * (v_item->>'qty')::INT,
            v_item->>'notes',
            'queued'
        );

        v_new_subtotal := v_new_subtotal + v_menu.base_price * (v_item->>'qty')::INT;
    END LOOP;

    -- Update order totals
    UPDATE orders
    SET subtotal     = subtotal     + v_new_subtotal,
        total_amount = total_amount + v_new_subtotal,
        updated_at   = v_now
    WHERE id = p_order_id;

    -- Generate KOTs via the shared engine (batch_number auto-increments)
    -- Items with kitchen_id already set are not re-routed (BUG-2 fix inherits here)
    v_kot_result := generate_kots_for_order(p_order_id, v_order.branch_id, v_user_id);

    -- Event log
    PERFORM log_erp_event(
        'items_added', 'order', p_order_id, v_user_id, 'waiter', v_order.branch_id,
        jsonb_build_object(
            'batch_number',     (v_kot_result->>'batch_number')::INT,
            'new_kots',         (v_kot_result->>'kot_count')::INT,
            'added_amount',     v_new_subtotal,
            'routing_warnings', v_kot_result->'warnings'
        )
    );

    -- Notify kitchen
    PERFORM notify_role(
        v_order.branch_id, 'kitchen', 'items_added',
        '📋 Add-on KOT — Order #' || v_order.order_number,
        'Batch #' || (v_kot_result->>'batch_number')
            || ' — ' || (v_kot_result->>'kot_count') || ' KOT(s).',
        'soup_kitchen', 'orange', '/kitchen',
        'order', p_order_id, v_user_id
    );

    RETURN jsonb_build_object(
        'success',          true,
        'order_id',         p_order_id,
        'batch_number',     (v_kot_result->>'batch_number')::INT,
        'new_kots',         (v_kot_result->>'kot_count')::INT,
        'kots',             v_kot_result->'kots',
        'added_amount',     v_new_subtotal,
        'routing_warnings', v_kot_result->'warnings',
        'warning_count',    (v_kot_result->>'warning_count')::INT
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_items_to_order(UUID, JSONB) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §8 · Backward-compatible aliases (unchanged thin wrappers)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id); $$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;
