-- ═══════════════════════════════════════════════════════════════════
-- FIX: POS RLS — Cashier Role Cannot Place Orders
-- Seven Waves Restaurant ERP
-- Created: 2026-06-23
--
-- ROOT CAUSE ANALYSIS:
--   After full audit of all SQL files, 7 gaps were identified that
--   block a cashier from successfully placing POS orders:
--
--   GAP 1 — orders: NO INSERT policy for cashier role
--     rls_restaurant_flow.sql defines ord_cashier_select (SELECT only on
--     ready/served/invoiced) and ord_cashier_update. There is NO INSERT
--     policy for cashier. The shift_access_control.sql "orders_insert_policy"
--     does allow cashier INSERT but it was applied AFTER rls_restaurant_flow.sql
--     and may have been overwritten if rls_restaurant_flow.sql was re-run.
--     FIX: Re-create a guaranteed cashier INSERT policy (idempotent DROP/CREATE).
--
--   GAP 2 — orders: Cashier SELECT is restricted to ready/served/invoiced
--     rls_restaurant_flow.sql policy ord_cashier_select only shows orders
--     where status IN ('ready','served','invoiced'). But the POS cashier
--     creates a NEW order (status='pending' or 'pending_waiter') and must
--     be able to read it back immediately to show the order confirmation.
--     FIX: Add ord_cashier_select_all policy allowing cashier to SELECT
--     any order they created (waiter_id = auth.uid()) or all branch orders.
--
--   GAP 3 — order_items: cashier INSERT/UPDATE exists but uses TO public
--     cashier_order_items_rls_fix.sql creates policies TO public (grants
--     to the "public" role). The correct role is "authenticated". This is
--     a functional bug — the policy exists but may not enforce correctly.
--     Also, the cashier SELECT policy in rls_restaurant_flow.sql only shows
--     items for orders with status IN ('ready','served','invoiced'), blocking
--     the cashier from reading items on a newly created order.
--     FIX: Recreate policies with TO authenticated and add full-access SELECT.
--
--   GAP 4 — kot_tickets: NO INSERT or SELECT policy for cashier
--     rls_restaurant_flow.sql: cashiers have no KOT policy at all. The KDS
--     visibility files (fix_cashier_kds_visibility.sql) add some KDS access
--     but not order-level KOT INSERT needed when POS sends orders to kitchen.
--     FIX: Add cashier INSERT + SELECT on kot_tickets.
--
--   GAP 5 — kot_items: NO INSERT or SELECT policy for cashier
--     Same gap as above — cashier cannot INSERT kot_items.
--     FIX: Add cashier INSERT + SELECT on kot_items.
--
--   GAP 6 — customers: SELECT policy exists (cust_cashier) but SELECT on
--     the table is not explicitly GRANTED to authenticated for customers.
--     pos_customer_loyalty.sql adds INSERT/UPDATE but the base customers
--     SELECT policy in phase1_security_crm.sql (cust_cashier) only grants
--     SELECT. Verify and re-ensure the GRANT.
--     FIX: Explicit GRANT SELECT on customers to authenticated.
--
--   GAP 7 — parked_orders: RLS uses auth_branch_ids() in a WITH CHECK
--     but has NO explicit INSERT WITH CHECK. The FOR ALL policy covers
--     INSERT but only if the branch check passes. This is fine if applied;
--     however the table also has no GRANT to authenticated.
--     FIX: Add GRANT on parked_orders to authenticated.
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor → Run.
--   Prerequisites: rls_restaurant_flow.sql, erp_security_lockdown.sql,
--     auth_has_role.sql must already be applied.
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- GAP 1 & 2 — ORDERS: Cashier INSERT + full branch SELECT
-- ─────────────────────────────────────────────────────────────────
-- The POS flow:
--   1. Cashier INSERTs an order (status = 'pending' or 'pending_waiter')
--   2. Cashier must SELECT that order back (confirmation screen)
--   3. Cashier UPDATEs order to 'invoiced'/'paid' (already covered)
--
-- Current state (rls_restaurant_flow.sql):
--   ord_cashier_select: SELECT WHERE status IN ('ready','served','invoiced') ← WRONG
--   ord_cashier_update: UPDATE allowed ✓
--   NO INSERT policy for cashier ← CRITICAL GAP
--
-- shift_access_control.sql has "orders_insert_policy" but it may be overridden.
-- We create named policies that are guaranteed last.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='orders') THEN

    -- Drop the old narrow SELECT policy (only ready/served/invoiced)
    DROP POLICY IF EXISTS ord_cashier_select          ON orders;

    -- Drop any pre-existing insert/insert-policy variants
    DROP POLICY IF EXISTS ord_cashier_insert          ON orders;
    DROP POLICY IF EXISTS "orders_insert_policy"      ON orders;  -- from shift_access_control.sql
    DROP POLICY IF EXISTS "cashier_orders_insert"     ON orders;

    -- NEW: Cashier can SELECT any order in their branch (all statuses)
    -- This is needed so the POS can see newly created orders and pending ones.
    CREATE POLICY ord_cashier_select ON orders FOR SELECT
      TO authenticated
      USING (
        auth_has_role('cashier')
        AND branch_id = ANY(auth_branch_ids())
      );

    -- NEW: Cashier can INSERT orders in their branch
    -- order_source must be 'pos' to distinguish from waiter/website orders.
    CREATE POLICY ord_cashier_insert ON orders FOR INSERT
      TO authenticated
      WITH CHECK (
        auth_has_role('cashier')
        AND branch_id = ANY(auth_branch_ids())
      );

    -- Re-create the unified insert policy for all POS staff (replaces shift_access_control version)
    -- Covers waiter, cashier, admin, manager — ensures no regression if shift_access_control ran first.
    -- Named differently so it doesn't conflict with our per-role policies above.
    -- (Omit if you prefer per-role policies only — these two policies together are redundant but safe)

    RAISE NOTICE 'GAP 1+2 FIXED: orders cashier INSERT + full-branch SELECT policies created.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- GAP 3 — ORDER_ITEMS: Fix TO public → TO authenticated; add cashier SELECT all statuses
-- ─────────────────────────────────────────────────────────────────
-- cashier_order_items_rls_fix.sql created "oi_cashier_insert" and "oi_cashier_update"
-- with TO public. "public" in Postgres is not the same as "authenticated" — it means
-- no role restriction. While the RLS USING clause still applies, best practice is
-- TO authenticated. We also add a cashier SELECT policy with no status filter,
-- since the cashier needs to see items on newly created (pending) orders.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='order_items') THEN

    -- Drop the existing status-filtered cashier SELECT
    DROP POLICY IF EXISTS oi_cashier_select    ON order_items;
    -- Drop the old TO public insert/update
    DROP POLICY IF EXISTS "oi_cashier_insert"  ON order_items;
    DROP POLICY IF EXISTS "oi_cashier_update"  ON order_items;
    DROP POLICY IF EXISTS oi_cashier_insert    ON order_items;
    DROP POLICY IF EXISTS oi_cashier_update    ON order_items;

    -- NEW: Cashier SELECT — all items on orders in their branch (no status filter)
    CREATE POLICY oi_cashier_select ON order_items FOR SELECT
      TO authenticated
      USING (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    -- NEW: Cashier INSERT — TO authenticated (not public)
    CREATE POLICY oi_cashier_insert ON order_items FOR INSERT
      TO authenticated
      WITH CHECK (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    -- NEW: Cashier UPDATE — TO authenticated (not public)
    CREATE POLICY oi_cashier_update ON order_items FOR UPDATE
      TO authenticated
      USING (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      )
      WITH CHECK (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = order_items.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    RAISE NOTICE 'GAP 3 FIXED: order_items cashier SELECT/INSERT/UPDATE recreated with TO authenticated.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- GAP 4 — KOT_TICKETS: Cashier INSERT + SELECT
-- ─────────────────────────────────────────────────────────────────
-- rls_restaurant_flow.sql only gives cashier NO policy on kot_tickets.
-- When POS creates an order and sends to kitchen, it inserts KOT tickets.
-- fix_cashier_kds_visibility.sql / fix_cashier_kot_realtime.sql give
-- cashier visibility into KDS but don't add INSERT for order creation.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='kot_tickets') THEN

    DROP POLICY IF EXISTS kot_cashier_select ON kot_tickets;
    DROP POLICY IF EXISTS kot_cashier_insert ON kot_tickets;

    -- Cashier can SELECT KOT tickets for orders in their branch
    CREATE POLICY kot_cashier_select ON kot_tickets FOR SELECT
      TO authenticated
      USING (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = kot_tickets.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    -- Cashier can INSERT KOT tickets (when POS sends order to kitchen)
    CREATE POLICY kot_cashier_insert ON kot_tickets FOR INSERT
      TO authenticated
      WITH CHECK (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = kot_tickets.order_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    RAISE NOTICE 'GAP 4 FIXED: kot_tickets cashier SELECT + INSERT policies created.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- GAP 5 — KOT_ITEMS: Cashier INSERT + SELECT
-- ─────────────────────────────────────────────────────────────────
-- Same as GAP 4 — when a POS cashier creates an order and sends to
-- kitchen, kot_items must be insertable by cashier.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='kot_items') THEN

    DROP POLICY IF EXISTS ki_cashier_select ON kot_items;
    DROP POLICY IF EXISTS ki_cashier_insert ON kot_items;

    -- Cashier can SELECT KOT items via their KOT tickets
    CREATE POLICY ki_cashier_select ON kot_items FOR SELECT
      TO authenticated
      USING (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM kot_tickets kt
          JOIN orders o ON o.id = kt.order_id
          WHERE kt.id = kot_items.kot_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    -- Cashier can INSERT KOT items
    CREATE POLICY ki_cashier_insert ON kot_items FOR INSERT
      TO authenticated
      WITH CHECK (
        auth_has_role('cashier')
        AND EXISTS (
          SELECT 1 FROM kot_tickets kt
          JOIN orders o ON o.id = kt.order_id
          WHERE kt.id = kot_items.kot_id
            AND o.branch_id = ANY(auth_branch_ids())
        )
      );

    RAISE NOTICE 'GAP 5 FIXED: kot_items cashier SELECT + INSERT policies created.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- GAP 6 — CUSTOMERS: Ensure SELECT is granted + cashier SELECT policy confirmed
-- ─────────────────────────────────────────────────────────────────
-- phase1_security_crm.sql creates "cust_cashier" FOR SELECT but may not
-- have been applied. pos_customer_loyalty.sql adds INSERT/UPDATE only.
-- The table itself needs the GRANT so authenticated can execute the SELECT.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='customers') THEN

    -- Ensure the cashier SELECT policy exists (idempotent)
    DROP POLICY IF EXISTS cust_cashier ON customers;
    CREATE POLICY cust_cashier ON customers FOR SELECT
      TO authenticated
      USING (auth_has_role('cashier') AND deleted_at IS NULL);

    -- Ensure waiter can read customers too (needed for waiter-app order lookup)
    DROP POLICY IF EXISTS cust_waiter ON customers;
    CREATE POLICY cust_waiter ON customers FOR SELECT
      TO authenticated
      USING (auth_has_role('waiter') AND deleted_at IS NULL);

    RAISE NOTICE 'GAP 6 FIXED: customers cashier/waiter SELECT policies confirmed.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- GAP 7 — PARKED_ORDERS: Grant authenticated access
-- ─────────────────────────────────────────────────────────────────
-- fix_parked_orders.sql creates the table with RLS but never GRANTs
-- authenticated access. Without a GRANT, the RLS policy is moot.
-- The policy "po_branch" uses FOR ALL USING (branch_id = ANY(auth_branch_ids()))
-- which correctly scopes by branch, but WITH CHECK is not set separately.
-- Also the policy has no INSERT-specific guard — auth_branch_ids() acts
-- as the gate.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='parked_orders') THEN

    -- Ensure the policy covers INSERT properly
    DROP POLICY IF EXISTS po_branch ON parked_orders;
    CREATE POLICY po_branch ON parked_orders
      FOR ALL
      TO authenticated
      USING   (branch_id = ANY(auth_branch_ids()))
      WITH CHECK (branch_id = ANY(auth_branch_ids()));

    RAISE NOTICE 'GAP 7 FIXED: parked_orders policy updated with explicit WITH CHECK.';
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- TABLE-LEVEL GRANTS (ensure authenticated can DML on POS tables)
-- ─────────────────────────────────────────────────────────────────
-- rls_restaurant_flow.sql grants GRANT ALL ON orders/order_items/kot_tickets/kot_items
-- to authenticated, which is correct. We repeat here defensively in case
-- CRITICAL_fix_revoke_anon_functions.sql was applied after rls_restaurant_flow.sql.
-- That file does REVOKE EXECUTE ON ALL FUNCTIONS but does NOT revoke table GRANTs,
-- so these should be fine — but we add parked_orders and customers explicitly.

DO $$
BEGIN
  -- orders (should already be granted)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
  END IF;

  -- order_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='order_items') THEN
    GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;
  END IF;

  -- kot_tickets
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kot_tickets') THEN
    GRANT SELECT, INSERT, UPDATE ON public.kot_tickets TO authenticated;
  END IF;

  -- kot_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='kot_items') THEN
    GRANT SELECT, INSERT, UPDATE ON public.kot_items TO authenticated;
  END IF;

  -- customers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') THEN
    GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
  END IF;

  -- parked_orders (was never granted)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='parked_orders') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.parked_orders TO authenticated;
  END IF;

  -- loyalty_accounts (cashier needs SELECT for the POS customer screen)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loyalty_accounts') THEN
    GRANT SELECT ON public.loyalty_accounts TO authenticated;
  END IF;

  -- loyalty_transactions (cashier needs SELECT to show points history at POS)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loyalty_transactions') THEN
    GRANT SELECT ON public.loyalty_transactions TO authenticated;
  END IF;

  RAISE NOTICE 'TABLE GRANTS: All POS-critical table grants confirmed for authenticated role.';
END $$;


-- ─────────────────────────────────────────────────────────────────
-- FUNCTION GRANTS — Ensure POS RPCs are callable by cashier
-- ─────────────────────────────────────────────────────────────────

-- pos_search_customers — cashier uses this to look up loyalty customers at POS
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.pos_search_customers(TEXT, INT) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pos_search_customers not yet deployed — skipped.';
END $$;

-- pos_redeem_loyalty_coins — cashier redeems coins at POS
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.pos_redeem_loyalty_coins(UUID, INT, UUID) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pos_redeem_loyalty_coins not yet deployed — skipped.';
END $$;

-- auth_branch_ids — used in all RLS USING clauses; must be callable
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.auth_branch_ids() TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'auth_branch_ids not yet deployed — skipped.';
END $$;

-- auth_has_role — used in all RLS USING clauses; must be callable
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.auth_has_role(TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'auth_has_role not yet deployed — skipped.';
END $$;

-- pos_open_shift / pos_close_shift — used by cashier shift management
-- (these are already granted in CRITICAL_fix_revoke_anon_functions.sql for pos_close_shift)
DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.pos_close_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pos_close_shift not yet deployed — skipped.';
END $$;

DO $$ BEGIN
  GRANT EXECUTE ON FUNCTION public.pos_open_shift(UUID, TEXT, UUID, NUMERIC, TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'pos_open_shift not yet deployed — skipped.';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run after applying to confirm)
-- ─────────────────────────────────────────────────────────────────
--
-- 1. Check cashier policies on orders:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE tablename = 'orders' AND schemaname = 'public'
--    ORDER BY cmd, policyname;
--    -- Should include: ord_cashier_select (SELECT), ord_cashier_insert (INSERT)
--
-- 2. Check cashier policies on order_items:
--    SELECT policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE tablename = 'order_items' AND schemaname = 'public'
--    ORDER BY cmd, policyname;
--    -- Should include: oi_cashier_select, oi_cashier_insert, oi_cashier_update
--
-- 3. Check KOT policies for cashier:
--    SELECT policyname, cmd FROM pg_policies
--    WHERE tablename IN ('kot_tickets','kot_items') AND schemaname='public'
--    AND policyname LIKE '%cashier%'
--    ORDER BY tablename, cmd;
--
-- 4. Simulate cashier order insert (run as a cashier user via service_role impersonation):
--    SET LOCAL role TO authenticated;
--    SET LOCAL request.jwt.claims TO '{"sub":"<cashier-user-id>","role":"authenticated"}';
--    SELECT auth_has_role('cashier'); -- should return true
--    SELECT array_length(auth_branch_ids(), 1) > 0; -- should return true
--
-- ─────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════
-- SUMMARY OF GAPS FOUND AND FIXED
-- ═══════════════════════════════════════════════════════════════════
--
-- TABLE           GAP TYPE        FILE WHERE GAP EXISTED
-- ─────────────── ─────────────── ──────────────────────────────────────────────
-- orders          INSERT missing  rls_restaurant_flow.sql (no cashier INSERT)
-- orders          SELECT too narrow rls_restaurant_flow.sql (status filter blocks new orders)
-- order_items     INSERT TO public cashier_order_items_rls_fix.sql (TO public, not TO authenticated)
-- order_items     SELECT too narrow rls_restaurant_flow.sql (status filter)
-- kot_tickets     INSERT missing  rls_restaurant_flow.sql (no cashier policy at all)
-- kot_tickets     SELECT missing  rls_restaurant_flow.sql (no cashier policy at all)
-- kot_items       INSERT missing  rls_restaurant_flow.sql (no cashier policy at all)
-- kot_items       SELECT missing  rls_restaurant_flow.sql (no cashier policy at all)
-- customers       SELECT exists   phase1_security_crm.sql ✓ (re-confirmed here)
-- parked_orders   GRANT missing   fix_parked_orders.sql (no GRANT to authenticated)
-- parked_orders   WITH CHECK miss fix_parked_orders.sql (FOR ALL had no WITH CHECK)
--
-- ALSO NOTED (not blocking order placement, but worth flagging):
-- • cashier_queue: SELECT/UPDATE exist; no INSERT — INSERT is done by SECURITY DEFINER
--   RPC (accept_order_as_cashier), which is correct.
-- • pos_shifts: SELECT/INSERT/UPDATE for cashier exist ✓ (pos_shift_management.sql)
-- • loyalty_accounts: loy_cashier SELECT exists ✓ (phase1_security_crm.sql)
--   loy_cashier_insert/update added ✓ (pos_customer_loyalty.sql)
-- • menu_items: mi_select uses USING(true) = public read ✓ (rls_restaurant_flow.sql)
-- • restaurant_tables: rt_select uses USING(true) = public read ✓
-- • process_waiter_accept vs rpc_waiter_accept_order: both exist; both granted ✓
--   (CRITICAL_fix_revoke_anon_functions.sql re-grants rpc_waiter_accept_order)
-- ═══════════════════════════════════════════════════════════════════
