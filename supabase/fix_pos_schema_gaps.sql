-- ═══════════════════════════════════════════════════════════════════
-- FIX: POS Schema Gaps
-- ═══════════════════════════════════════════════════════════════════
-- The POS (orderStore.js + POSPage.vue) writes columns that are
-- missing from the base orders.sql CREATE TABLE definition.
-- This file adds every missing column idempotently.
--
-- Root cause: orders.sql is the canonical DDL but was written before
-- the POS payload was finalized. Several ALTER TABLE migrations were
-- added in separate files (erp_payment_management.sql,
-- rpc_waiter_accept_order.sql, table_ordering_features.sql) but the
-- following columns have NO migration anywhere in the repo:
--   • table_number        — POS inserts numeric table reference
--   • customer_id         — POS links order to loyalty customer
--   • service_charge      — POS sends service charge amount
--   • delivery_source     — POS sends delivery platform (uber, etc.)
--   • foc_reason          — FOC (Free-of-Charge) order reason text
--   • foc_authorized_by   — UUID of manager who approved FOC
--
-- Additionally these columns are added by separate files but are
-- guarded here as a safety net for fresh DB installs:
--   • assigned_waiter_id  — also in rpc_waiter_accept_order.sql
--   • payment_method      — also in erp_payment_management.sql
--   • paid_at             — also in erp_payment_management.sql
--   • accepted_at         — also in orders.sql (already exists there)
--
-- STATUS CONSTRAINT: orders.sql only allows the base set of statuses.
-- The POS inserts with status = 'pending_waiter' which requires the
-- constraint to be updated. erp_payment_management.sql does this but
-- is guarded here for fresh DBs.
--
-- Apply via: Supabase dashboard → SQL editor → run this file
-- Date: 2026-06-23
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — Add missing columns to orders
-- ─────────────────────────────────────────────────────────────────

-- 1a. table_number: POS stores "Table 5" as an integer reference.
--     The orderStore writes: table_number: parseInt(tableNumber) || null
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS table_number INTEGER;

-- 1b. customer_id: links the order to the loyalty/customers table.
--     POS writes: customer_id: selectedCustomer?.id || selectedCustomer?.customer_id
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
    ON public.orders(customer_id)
    WHERE customer_id IS NOT NULL;

-- 1c. service_charge: the service-charge amount (not percentage).
--     POS writes: service_charge: parseFloat(serviceChargeAmount.toFixed(2))
--     NOTE: finance RPCs (finance_integration.sql, fix_journal_immutability.sql)
--     already SELECT this column assuming it exists — this fixes those too.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS service_charge NUMERIC(12,2) DEFAULT 0;

-- 1d. delivery_source: delivery platform identifier.
--     POS writes: delivery_source: deliverySource || null
--     Values: 'uber_eats', 'pickme', 'direct', null
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS delivery_source TEXT;

-- 1e. foc_reason: Free-Of-Charge order reason (FOC flow in POSPage.vue).
--     POSPage.vue writes: foc_reason: focReason
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS foc_reason TEXT;

-- 1f. foc_authorized_by: UUID of manager who approved the FOC.
--     POSPage.vue writes: foc_authorized_by: managerUserId
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS foc_authorized_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 1g. assigned_waiter_id: safety net — also in rpc_waiter_accept_order.sql
--     process_waiter_accept RPC writes this; orderStore sends it on insert.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS assigned_waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter
    ON public.orders(assigned_waiter_id)
    WHERE assigned_waiter_id IS NOT NULL;

-- 1h. payment_method: safety net — also in erp_payment_management.sql
--     FOC flow writes: payment_method: 'foc'
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';

-- 1i. paid_at: safety net — also in erp_payment_management.sql
--     FOC flow writes: paid_at: new Date().toISOString()
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- 1j. accepted_at: already in orders.sql column list (line 148) so this
--     is a pure safety net for any env where schema.sql ran instead.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;


-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — Fix the order status CHECK constraint
-- ─────────────────────────────────────────────────────────────────
-- The base orders.sql constraint does NOT include 'pending_waiter'.
-- The POS always inserts with status = 'pending_waiter'.
-- erp_payment_management.sql updates this but may not have been applied.
-- We drop and recreate it here with the full set.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE public.orders ADD CONSTRAINT chk_order_status CHECK (
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

-- Also expand payment_status to match erp_payment_management.sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE public.orders ADD CONSTRAINT chk_payment_status CHECK (
    payment_status IN ('unpaid', 'pending_payment', 'partial', 'paid', 'refunded', 'partially_refunded')
);


-- ─────────────────────────────────────────────────────────────────
-- STEP 3 — order_items: total_price already fixed by
--           fix_order_items_total_price.sql. Guard here anyway.
-- ─────────────────────────────────────────────────────────────────
-- The orderStore writes total_price on every order_item.
-- The base schema.sql has no total_price column; orders.sql does.
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2);

-- Back-fill any NULL total_price rows from unit_price × quantity
UPDATE public.order_items
SET total_price = unit_price * quantity
WHERE total_price IS NULL
  AND unit_price IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────
-- STEP 4 — Verify cashier_queue / stock_queue / finance_queue exist
-- ─────────────────────────────────────────────────────────────────
-- These tables are created by sprint1_kot_orchestration_engine.sql
-- and referenced by process_waiter_accept. They are NOT in schema.sql.
-- We create them here with IF NOT EXISTS as a safety net.

CREATE TABLE IF NOT EXISTS public.cashier_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    branch_id   UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'invoiced', 'paid', 'cancelled')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cq_status ON public.cashier_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cq_branch ON public.cashier_queue(branch_id);

ALTER TABLE public.cashier_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stock_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    branch_id   UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'issued', 'failed')),
    issue_stage TEXT NOT NULL DEFAULT 'on_paid'
                CHECK (issue_stage IN ('on_accept', 'on_kitchen_start', 'on_paid')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sq_status ON public.stock_queue(status);
CREATE INDEX IF NOT EXISTS idx_sq_branch ON public.stock_queue(branch_id);

ALTER TABLE public.stock_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.finance_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    branch_id   UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'posted', 'failed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fq_status ON public.finance_queue(status);
CREATE INDEX IF NOT EXISTS idx_fq_branch ON public.finance_queue(branch_id);

ALTER TABLE public.finance_queue ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- STEP 5 — Verify order_status_events exists
-- ─────────────────────────────────────────────────────────────────
-- process_waiter_accept inserts into order_status_events.
-- This table is created by sprint1_kot_orchestration_engine.sql.

CREATE TABLE IF NOT EXISTS public.order_status_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    old_status   TEXT,
    new_status   TEXT NOT NULL,
    created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_code   TEXT,
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    payload      JSONB DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ose_order_time ON public.order_status_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ose_event_code ON public.order_status_events(event_code);

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- STEP 6 — Verify kot_tickets and kot_items have required columns
-- ─────────────────────────────────────────────────────────────────
-- kot_tickets: order_id ✓, kitchen_id ✓, status ✓ (in orders.sql)
-- kot_items:   kot_id ✓, order_item_id ✓, quantity ✓, status ✓ (in orders.sql)
-- Safety: add quantity to kot_items in case schema.sql base was used
-- (schema.sql kot_items has no quantity column).

ALTER TABLE public.kot_items
    ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;


-- ─────────────────────────────────────────────────────────────────
-- STEP 7 — Verify kot_routing_targets and kot_dispatches exist
-- ─────────────────────────────────────────────────────────────────
-- process_waiter_accept inserts into both tables.

CREATE TABLE IF NOT EXISTS public.kot_routing_targets (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,   -- 'KITCHEN', 'CASHIER', 'INVENTORY', 'FINANCE'
    name TEXT NOT NULL
);

INSERT INTO public.kot_routing_targets (code, name) VALUES
    ('KITCHEN',   'Kitchen Display'),
    ('CASHIER',   'Cashier Billing Queue'),
    ('INVENTORY', 'Inventory Stock Queue'),
    ('FINANCE',   'Finance Revenue Queue')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.kot_dispatches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    kot_id       UUID NOT NULL REFERENCES public.kot_tickets(id) ON DELETE CASCADE,
    target_code  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'delivered', 'failed', 'cancelled')),
    delivered_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kot_id, target_code)
);

CREATE INDEX IF NOT EXISTS idx_kd_target_status ON public.kot_dispatches(target_code, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kd_order         ON public.kot_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_kd_kot           ON public.kot_dispatches(kot_id);

ALTER TABLE public.kot_dispatches ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────
-- STEP 8 — Realtime publication (safe conditional add)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'cashier_queue', 'stock_queue', 'finance_queue',
        'order_status_events', 'kot_dispatches', 'kot_routing_targets'
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


-- ═══════════════════════════════════════════════════════════════════
-- AUDIT SUMMARY
-- ═══════════════════════════════════════════════════════════════════
--
-- orders table — columns added by this fix:
--   ✅ table_number        INTEGER          — POS order insert payload
--   ✅ customer_id         UUID → customers  — POS order insert payload
--   ✅ service_charge      NUMERIC(12,2)    — POS order insert payload
--   ✅ delivery_source     TEXT             — POS order insert payload
--   ✅ foc_reason          TEXT             — FOC flow (POSPage.vue)
--   ✅ foc_authorized_by   UUID → profiles  — FOC flow (POSPage.vue)
--   ✅ assigned_waiter_id  UUID → profiles  — orderStore insert + RPC (safety net)
--   ✅ payment_method      TEXT             — erp_payment_management (safety net)
--   ✅ paid_at             TIMESTAMPTZ      — erp_payment_management (safety net)
--   ✅ accepted_at         TIMESTAMPTZ      — orders.sql (safety net for schema.sql envs)
--
-- orders status constraint — expanded to include:
--   ✅ pending_waiter   — POS always inserts with this status
--   ✅ pending_payment  — payment gate flow
--
-- order_items — safety nets:
--   ✅ total_price       NUMERIC(12,2)  — orderStore insert payload
--
-- Queue tables (created IF NOT EXISTS):
--   ✅ cashier_queue      — process_waiter_accept creates rows here
--   ✅ stock_queue        — process_waiter_accept creates rows here
--   ✅ finance_queue      — process_waiter_accept creates rows here
--   ✅ order_status_events — process_waiter_accept logs events here
--   ✅ kot_routing_targets — process_waiter_accept seeds these
--   ✅ kot_dispatches      — process_waiter_accept creates dispatch rows
--
-- RPC functions confirmed present in supabase/*.sql:
--   ✅ process_waiter_accept     (critical_fix_07, kot_routing_engine, etc.)
--   ✅ process_cashier_invoice   (kot_orchestration_v2, sprint1)
--   ✅ process_cashier_payment   (kot_orchestration_v2, sprint1, migration fix)
--   ✅ generate_kots_for_order   (kot_routing_engine.sql)
--   ✅ pos_close_shift           (pos_shift_management.sql)
--   ✅ pos_redeem_loyalty_coins  (pos_customer_loyalty.sql)
--   ✅ pos_search_customers      (pos_customer_loyalty.sql)
--
-- process_cashier_payment signature: (UUID, TEXT, NUMERIC) — matches POSPage call:
--   supabase.rpc('process_cashier_payment', {
--     p_order_id, p_payment_method, p_amount_paid })  ✅
--
-- kot_tickets verified columns: order_id ✓, kitchen_id ✓, status ✓
-- kot_items verified columns:   kot_id ✓, order_item_id ✓, quantity ✓, status ✓
-- ═══════════════════════════════════════════════════════════════════
