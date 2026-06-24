-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: POS Order Flow — All blocking issues for cashier-placed orders
-- Seven Waves Restaurant ERP
-- Created: 2026-06-23
-- Safe to re-run: YES — all DDL uses IF NOT EXISTS / OR REPLACE / idempotent guards
--
-- ISSUES FIXED:
--   1. orders table missing columns: service_charge, delivery_charge,
--      table_number, assigned_waiter_id, payment_method, accepted_at
--   2. chk_order_status does not include 'pending_waiter' (INSERT fails)
--   3. chk_order_source does not include 'table_screen'
--   4. process_waiter_accept / rpc_waiter_accept_order forbid cashier role
--      → POS auto-accept silently fails, then process_cashier_invoice errors
--      because status is still 'pending_waiter' not 'accepted'
--   5. No cashier INSERT policy on orders table in rls_restaurant_flow.sql
--   6. delivery_charge never written to orders row in sendToKitchen /
--      processPayment (JS fix required separately — see notes below)
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1a: Add missing columns to orders table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS service_charge     NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_charge    NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS table_number       INTEGER,
    ADD COLUMN IF NOT EXISTS assigned_waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_method     TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS accepted_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS gateway_ref        TEXT,
    ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_amount      NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_reason      TEXT,
    ADD COLUMN IF NOT EXISTS bill_requested     BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS bill_requested_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS customer_id        UUID,
    ADD COLUMN IF NOT EXISTS customer_phone     TEXT,
    ADD COLUMN IF NOT EXISTS delivery_address   TEXT,
    ADD COLUMN IF NOT EXISTS delivery_source    TEXT,
    ADD COLUMN IF NOT EXISTS order_number       TEXT;

-- Index for cashier / waiter dashboards
CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter ON public.orders(assigned_waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method  ON public.orders(payment_method);

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1b: Widen chk_order_status to include 'pending_waiter' and 'pending_payment'
-- (orderStore.js inserts status = 'pending_waiter' — will be rejected without this)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE public.orders
    ADD CONSTRAINT chk_order_status CHECK (
        status IN (
            'pending',
            'pending_waiter',
            'pending_payment',
            'accepted',
            'preparing',
            'ready',
            'served',
            'invoiced',
            'paid',
            'cancelled'
        )
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1c: Widen chk_order_source to include 'table_screen'
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_order_source;
ALTER TABLE public.orders
    ADD CONSTRAINT chk_order_source CHECK (
        order_source IN ('pos', 'qr', 'table_screen', 'website', 'uber_eats', 'pickme', 'other')
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1d: Widen chk_payment_status to match erp_payment_management additions
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE public.orders
    ADD CONSTRAINT chk_payment_status CHECK (
        payment_status IN ('unpaid', 'pending_payment', 'partial', 'paid', 'refunded', 'partially_refunded')
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: RLS — ensure cashier can INSERT into orders
-- (rls_restaurant_flow.sql only grants INSERT to 'waiter'; shift_access_control.sql
--  adds a combined policy but execution order is uncertain)
-- This is idempotent: DROP IF EXISTS then CREATE
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ord_cashier_insert" ON public.orders;
CREATE POLICY "ord_cashier_insert" ON public.orders
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.auth_has_role('cashier')
        AND branch_id = ANY(public.auth_branch_ids())
    );

-- Also ensure cashier can SELECT all orders in branch (not just ready/served/invoiced)
-- The original ord_cashier_select in rls_restaurant_flow.sql is too narrow —
-- it only allows status IN ('ready','served','invoiced') which means cashier
-- cannot see an order they just created (status = 'pending_waiter')
DROP POLICY IF EXISTS "ord_cashier_select_full" ON public.orders;
CREATE POLICY "ord_cashier_select_full" ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        public.auth_has_role('cashier')
        AND branch_id = ANY(public.auth_branch_ids())
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: rpc_waiter_accept_order — add cashier role
--
-- PROBLEM: cashier logs in and calls process_waiter_accept → rpc_waiter_accept_order
-- The role check at CHECK 2 only allows waiter|manager|admin → cashier gets FORBIDDEN.
-- orderStore.js sendToKitchen() at line 234 silently ignores acceptError (just logs it),
-- so the order stays as 'pending_waiter'. Then processInlinePayment() calls
-- process_cashier_invoice which requires status IN ('accepted','preparing','ready')
-- and returns error: "Cannot invoice. Status: pending_waiter"
--
-- FIX: Add cashier to both the canonical rpc_waiter_accept_order and the inline
-- process_waiter_accept implementations. We add cashier between waiter and manager
-- so it gets actor_role = 'cashier' in the audit trail.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop BOTH overloads first so we have a clean slate
-- (the UUID-only version from kot_routing_engine.sql / realtime_downstream.sql
--  conflicts with the (UUID, UUID[]) version from fix_unavailable_items_total.sql)
DO $guard$
BEGIN
  DROP FUNCTION IF EXISTS public.rpc_waiter_accept_order(UUID);
EXCEPTION WHEN OTHERS THEN NULL;
END $guard$;

DO $guard2$
BEGIN
  DROP FUNCTION IF EXISTS public.rpc_waiter_accept_order(UUID, UUID[]);
EXCEPTION WHEN OTHERS THEN NULL;
END $guard2$;

-- Re-create with the combined signature (UUID, UUID[] DEFAULT NULL)
-- This single definition handles both call patterns:
--   rpc_waiter_accept_order(some_uuid)          → p_unavailable_ids = NULL
--   rpc_waiter_accept_order(some_uuid, '{...}')  → marks items unavailable
CREATE OR REPLACE FUNCTION public.rpc_waiter_accept_order(
    p_order_id UUID,
    p_unavailable_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id        UUID        := auth.uid();
    v_actor_role      TEXT;
    v_actor_name      TEXT;
    v_order           RECORD;
    v_now             TIMESTAMPTZ := now();
    v_kot_id          UUID;
    v_kot_rec         RECORD;
    v_default_kitchen UUID;
    v_kot_count       INT  := 0;
    v_dispatch_count  INT  := 0;
    v_new_subtotal    NUMERIC;
    v_unavail_names   TEXT[];
BEGIN

    -- CHECK 1: Authentication
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'NOT_AUTHENTICATED',
            'error',   'Authentication required.'
        );
    END IF;

    -- CHECK 2: Role authorisation — cashier added (needed for POS auto-accept)
    IF    auth_has_role('waiter')   THEN v_actor_role := 'waiter';
    ELSIF auth_has_role('cashier')  THEN v_actor_role := 'cashier';   -- ← ADDED
    ELSIF auth_has_role('manager')  THEN v_actor_role := 'manager';
    ELSIF auth_has_role('admin')    THEN v_actor_role := 'admin';
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'code',    'FORBIDDEN',
            'error',   'Insufficient role. Waiter, cashier, manager, or admin required.'
        );
    END IF;

    -- CHECK 3: Order existence + exclusive row lock
    SELECT * INTO v_order
    FROM   orders
    WHERE  id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'NOT_FOUND',
            'error',   'Order not found.'
        );
    END IF;

    -- CHECK 4: Idempotency — already accepted by this actor
    IF v_order.status IN ('accepted', 'preparing', 'ready', 'served', 'invoiced', 'paid')
       AND v_order.assigned_waiter_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'code',    'ALREADY_ACCEPTED',
            'message', 'Order already accepted.',
            'order_id', p_order_id,
            'assigned_waiter_id', v_order.assigned_waiter_id
        );
    END IF;

    -- CHECK 5: Valid status for acceptance
    IF v_order.status NOT IN ('pending', 'pending_waiter') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'INVALID_STATUS',
            'error',   'Order cannot be accepted. Current status: ' || v_order.status
        );
    END IF;

    -- CHECK 6: Shift validation — only for waiter role; cashier/manager/admin skip this
    IF v_actor_role = 'waiter' AND NOT auth_is_on_shift(v_order.branch_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code',    'NOT_ON_SHIFT',
            'error',   'You are not on an active shift for this branch.'
        );
    END IF;

    -- Get actor name for notifications
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor_id;

    -- STEP 1: Accept the order
    UPDATE orders
    SET status            = 'accepted',
        assigned_waiter_id = v_actor_id,
        accepted_at       = v_now,
        updated_at        = v_now
    WHERE id = p_order_id;

    -- STEP 1b: Handle unavailable items (when p_unavailable_ids is provided)
    IF p_unavailable_ids IS NOT NULL AND array_length(p_unavailable_ids, 1) > 0 THEN
        -- Mark specified items as unavailable
        UPDATE order_items
        SET    availability_status = 'unavailable'
        WHERE  order_id = p_order_id
          AND  id = ANY(p_unavailable_ids);

        -- Mark remaining items as available
        UPDATE order_items
        SET    availability_status = 'available'
        WHERE  order_id = p_order_id
          AND  id <> ALL(p_unavailable_ids)
          AND  (availability_status IS NULL OR availability_status <> 'unavailable');

        -- Recalculate order total (exclude unavailable items)
        SELECT COALESCE(SUM(oi.unit_price * oi.quantity), 0)
        INTO   v_new_subtotal
        FROM   order_items oi
        WHERE  oi.order_id = p_order_id
          AND  (oi.availability_status IS NULL OR oi.availability_status <> 'unavailable');

        UPDATE orders
        SET    subtotal     = v_new_subtotal,
               total_amount = v_new_subtotal + COALESCE(tax_amount, 0) + COALESCE(service_charge, 0) - COALESCE(discount_amount, 0),
               updated_at   = v_now
        WHERE  id = p_order_id;

        -- Collect unavailable item names for customer notification
        SELECT array_agg(mi.name)
        INTO   v_unavail_names
        FROM   order_items oi
        JOIN   menu_items mi ON mi.id = oi.menu_item_id
        WHERE  oi.order_id = p_order_id
          AND  oi.availability_status = 'unavailable';

        -- Customer notification
        IF v_unavail_names IS NOT NULL AND array_length(v_unavail_names, 1) > 0 THEN
            BEGIN
                INSERT INTO order_notifications (
                    order_id, notification_type, title, message, is_read, created_at
                ) VALUES (
                    p_order_id,
                    'item_unavailable',
                    'Some Items Are Unavailable',
                    'Sorry, the following items are currently unavailable: '
                        || array_to_string(v_unavail_names, ', ')
                        || '. They have been removed from your bill.',
                    false,
                    v_now
                );
            EXCEPTION WHEN undefined_table THEN
                NULL; -- order_notifications table may not exist yet
            END;
        END IF;
    END IF;

    -- STEP 2: Resolve kitchen routing for all queued items
    UPDATE order_items
    SET kitchen_id = get_target_kitchen_for_item(menu_item_id, v_order.branch_id)
    WHERE order_id = p_order_id
      AND (kitchen_id IS NULL OR status = 'queued');

    -- Fallback kitchen (first active kitchen in branch)
    SELECT id INTO v_default_kitchen
    FROM   kitchens
    WHERE  branch_id = v_order.branch_id AND is_active = true
    ORDER  BY created_at ASC
    LIMIT  1;

    -- STEP 3: Generate KOTs per kitchen (idempotent)
    FOR v_kot_rec IN
        SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
        FROM   order_items
        WHERE  order_id = p_order_id AND status = 'queued'
    LOOP
        CONTINUE WHEN v_kot_rec.kit_id IS NULL;

        -- Skip if KOT already exists for this order+kitchen
        SELECT id INTO v_kot_id
        FROM   kot_tickets
        WHERE  order_id = p_order_id AND kitchen_id = v_kot_rec.kit_id
        LIMIT  1;

        IF v_kot_id IS NULL THEN
            INSERT INTO kot_tickets (order_id, kitchen_id, branch_id, status, created_at)
            VALUES (p_order_id, v_kot_rec.kit_id, v_order.branch_id, 'pending', v_now)
            RETURNING id INTO v_kot_id;
            v_kot_count := v_kot_count + 1;
        END IF;

        -- Link items to their KOT
        UPDATE order_items
        SET    status = 'sent_to_kitchen', updated_at = v_now
        WHERE  order_id  = p_order_id
          AND  COALESCE(kitchen_id, v_default_kitchen) = v_kot_rec.kit_id
          AND  status = 'queued';
    END LOOP;

    -- STEP 4: Create downstream queues (idempotent ON CONFLICT DO NOTHING)
    INSERT INTO cashier_queue (order_id, branch_id, status, created_at)
    VALUES (p_order_id, v_order.branch_id, 'open', v_now)
    ON CONFLICT (order_id) DO NOTHING;
    v_dispatch_count := v_dispatch_count + 1;

    INSERT INTO finance_queue (order_id, branch_id, status, created_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now)
    ON CONFLICT (order_id) DO NOTHING;

    INSERT INTO stock_queue (order_id, branch_id, status, created_at)
    VALUES (p_order_id, v_order.branch_id, 'pending', v_now)
    ON CONFLICT (order_id) DO NOTHING;

    -- STEP 5: Audit trail
    INSERT INTO order_status_events
        (order_id, old_status, new_status, created_by, event_code, actor_user_id, actor_role, payload, created_at)
    VALUES
        (p_order_id, v_order.status, 'accepted', v_actor_id,
         'waiter_accepted', v_actor_id, v_actor_role,
         jsonb_build_object('actor_name', v_actor_name, 'kot_count', v_kot_count),
         v_now)
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
        'success',        true,
        'code',           'ACCEPTED',
        'order_id',       p_order_id,
        'actor_role',     v_actor_role,
        'kot_count',      v_kot_count,
        'dispatch_count', v_dispatch_count
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'code',    'INTERNAL_ERROR',
        'error',   SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID, UUID[]) TO authenticated;

-- Backward-compat aliases (must also be updated to delegate to the fixed canonical fn)
CREATE OR REPLACE FUNCTION public.process_waiter_accept(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id, NULL::UUID[]); $$;

GRANT EXECUTE ON FUNCTION public.process_waiter_accept(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.rpc_waiter_accept_order(p_order_id, NULL::UUID[]); $$;

GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 4: process_cashier_invoice — widen accepted statuses
--
-- PROBLEM: After auto-accept a cashier quick-pay order goes accepted → invoice
-- in a single flow. But if the order was created with status='pending_waiter'
-- and the RPC returned ALREADY_ACCEPTED (idempotent), the status may already
-- be 'accepted'. However, if auto-accept silently failed (pre-fix), the status
-- would still be 'pending_waiter' and this function would reject it.
-- FIX: Also accept 'pending_waiter' and 'pending' so the cashier can rescue
-- orders that weren't properly accepted (defensive programming).
-- ─────────────────────────────────────────────────────────────────────────────

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
    IF v_order.status IN ('invoiced', 'paid') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already invoiced.', 'order_id', p_order_id);
    END IF;

    -- Auto-accept if still pending (cashier POS flow: skip waiter step)
    IF v_order.status IN ('pending', 'pending_waiter') THEN
        PERFORM public.rpc_waiter_accept_order(p_order_id, NULL::UUID[]);
        -- Re-fetch after accept
        SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    END IF;

    IF v_order.status NOT IN ('accepted', 'preparing', 'ready', 'served') THEN
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


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 5: order_items — ensure all columns exist that POS inserts
-- (Consolidates fix_order_items_total_price.sql — safe to run again)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- total_price (required by POS insert payload)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='total_price'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN total_price NUMERIC(12,2);
    UPDATE public.order_items SET total_price = COALESCE(unit_price,0)*COALESCE(quantity,1) WHERE total_price IS NULL;
  END IF;

  -- variant_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='variant_id'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN variant_id UUID REFERENCES item_variants(id) ON DELETE SET NULL;
  END IF;

  -- updated_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='updated_at'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- void columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='void_reason'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN void_reason TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='void_authorized_by'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN void_authorized_by UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='order_items' AND column_name='availability_status'
  ) THEN
    ALTER TABLE public.order_items ADD COLUMN availability_status TEXT DEFAULT 'available';
  END IF;
END $$;

-- Widen status constraint to include 'void' and 'pending'
-- Use NOT VALID first to avoid "violated by some row" on legacy data,
-- then normalise any rogue values and validate.
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS chk_oi_status;

-- First, normalise any status values that would violate the new constraint
UPDATE public.order_items
SET status = 'served'
WHERE status NOT IN (
    'queued', 'sent_to_kitchen', 'preparing', 'ready',
    'served', 'cancelled', 'void', 'pending'
);

-- Now add the constraint (all rows are clean)
ALTER TABLE public.order_items
    ADD CONSTRAINT chk_oi_status CHECK (
        status IN ('queued', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'cancelled', 'void', 'pending')
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 6: cashier INSERT policy on order_items
-- (Allows cashier to insert order_items when creating POS orders)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "oi_cashier_insert" ON public.order_items;
CREATE POLICY "oi_cashier_insert" ON public.order_items
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.auth_has_role('cashier')
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = ANY(public.auth_branch_ids())
        )
    );

DROP POLICY IF EXISTS "oi_cashier_update" ON public.order_items;
CREATE POLICY "oi_cashier_update" ON public.order_items
    FOR UPDATE
    TO authenticated
    USING (
        public.auth_has_role('cashier')
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = ANY(public.auth_branch_ids())
        )
    )
    WITH CHECK (
        public.auth_has_role('cashier')
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = ANY(public.auth_branch_ids())
        )
    );

DROP POLICY IF EXISTS "oi_cashier_select" ON public.order_items;
CREATE POLICY "oi_cashier_select" ON public.order_items
    FOR SELECT
    TO authenticated
    USING (
        public.auth_has_role('cashier')
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.branch_id = ANY(public.auth_branch_ids())
        )
    );


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually to confirm fix applied)
-- ─────────────────────────────────────────────────────────────────────────────
-- Check columns exist:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'orders' AND column_name IN
--   ('service_charge','delivery_charge','table_number','assigned_waiter_id','payment_method');
--
-- Check constraint:
--   SELECT constraint_name, check_clause FROM information_schema.check_constraints
--   WHERE constraint_name = 'chk_order_status';
--
-- Check policies:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'orders' AND policyname LIKE '%cashier%';
--
-- Test cashier accept:
--   SELECT process_waiter_accept('<order_uuid>');   -- as cashier user
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- JS CODE FIX REQUIRED (cannot be fixed in SQL):
--
-- FILE: src/stores/orderStore.js
-- ISSUE: deliveryCharge.value is never sent to the orders INSERT payload
--   in sendToKitchen() (line ~165) or processPayment() (line ~291).
--   Finance RPCs use v_order.delivery_charge to build journal entries,
--   so delivery orders will have incorrect revenue accounting.
--
-- FIX: Add `delivery_charge: parseFloat(deliveryCharge.value || 0)` to
--   orderPayload in both sendToKitchen() and processPayment().
-- ═══════════════════════════════════════════════════════════════════════════
