-- =============================================================================
-- security_hardening_131.sql
-- -----------------------------------------------------------------------------
-- Closes several over-broad grants found in the security audit. Idempotent:
-- safe to run more than once. Apply manually (Supabase SQL editor / MCP).
--
--   A. orders      : drop "ord_realtime_bypass" (SELECT USING(true) for every
--                    authenticated user, incl. customer accounts) and replace it
--                    with a branch-scoped staff policy + a customer-own policy.
--   B. profiles    : drop "profiles_lookup" / "profiles_select_staff"
--                    (USING(true)) and replace with branch-peer visibility.
--   C. get_email_by_user_code : still callable by anon (login-by-code runs
--                    BEFORE authentication, see src/stores/auth.ts signInWithCode)
--                    but no longer returns full_name, and is server-side rate
--                    limited via check_qr_rate_limit().
--                    get_kiosk_orders(uuid) is intentionally left unchanged: the
--                    fixed table tablet calls it with only a table UUID and no
--                    session token (TouchMenuLayout.vue / OrderProgressDrawer.vue).
--   D. qr_rate_limits : RLS on, no policies, no direct table privileges.
--   E. SECURITY DEFINER functions missing a pinned search_path.
--
-- Pre-reqs (already in the DB): is_admin(), is_manager(), auth_has_role(text),
-- auth_branch_ids(), auth_is_on_shift(uuid), check_qr_rate_limit(text,text,int).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- A. ORDERS — remove realtime "bypass", keep every operational role working
-- -----------------------------------------------------------------------------
-- Existing SELECT policies that remain after the drop (ORed together):
--   ord_admin                     admin, manager (own branches)      rls_restaurant_flow.sql
--   ord_waiter_select             waiter (own branches)              rls_restaurant_flow.sql
--   waiter_select_orders_on_shift admin/manager/cashier, waiter on   shift_access_control.sql
--                                 shift (incl. unassigned pending),
--                                 assigned waiter
--   ord_cashier_select[_full]     cashier (own branches)             fix_pos_rls_cashier.sql / fix_pos_order_flow.sql
--   ord_kitchen_select            kitchen (own branches)             fix_cashier_kds_visibility.sql
-- Roles NOT covered by any of those and previously relying on the bypass:
--   finance, delivery, inventory, hr, procurement (reports, delivery board,
--   finance dashboard) and logged-in customer accounts.
-- Supabase Realtime evaluates RLS per subscriber using their JWT, so the
-- SECURITY DEFINER helpers below work for postgres_changes too.

DROP POLICY IF EXISTS "ord_realtime_bypass" ON public.orders;

DROP POLICY IF EXISTS "ord_staff_branch_select" ON public.orders;
CREATE POLICY "ord_staff_branch_select" ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin()
        OR (
            branch_id = ANY (public.auth_branch_ids())
            AND (
                public.is_manager()
                OR public.auth_has_role('waiter')
                OR public.auth_has_role('cashier')
                OR public.auth_has_role('kitchen')
                OR public.auth_has_role('delivery')
                OR public.auth_has_role('finance')
                OR public.auth_has_role('inventory')
                OR public.auth_has_role('procurement')
                OR public.auth_has_role('hr')
            )
        )
        -- waiters on shift see the branch inbox (unassigned pending orders)
        OR (public.auth_has_role('waiter') AND public.auth_is_on_shift(branch_id))
        OR assigned_waiter_id = auth.uid()
    );

-- Logged-in customer accounts: only their own orders (order history / tracking).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'auth_user_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id')
    THEN
        EXECUTE $f$
            CREATE OR REPLACE FUNCTION public.auth_customer_ids()
            RETURNS uuid[]
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public, pg_temp
            AS $body$
                SELECT COALESCE(array_agg(c.id), '{}')
                FROM public.customers c
                WHERE c.auth_user_id = auth.uid()
            $body$;
        $f$;
        REVOKE ALL ON FUNCTION public.auth_customer_ids() FROM PUBLIC, anon;
        GRANT EXECUTE ON FUNCTION public.auth_customer_ids() TO authenticated;

        EXECUTE 'DROP POLICY IF EXISTS "ord_customer_own_select" ON public.orders';
        EXECUTE $p$
            CREATE POLICY "ord_customer_own_select" ON public.orders
                FOR SELECT
                TO authenticated
                USING (customer_id IS NOT NULL AND customer_id = ANY (public.auth_customer_ids()))
        $p$;
    ELSE
        RAISE NOTICE 'customers.auth_user_id / orders.customer_id missing — skipped ord_customer_own_select';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- B. PROFILES — branch peers instead of everyone
-- -----------------------------------------------------------------------------
-- Needs to keep working:
--   * own profile (auth.ts)                                -> profiles_select_own (rbac_rls.sql) + own clause below
--   * admin UsersPage / RolesPage / SystemDashboard        -> profiles_select_admin + is_admin()
--   * manager / hr / finance reports (waiter:profiles!…)   -> profiles_select_manager_hr (fix_rls_critical.sql)
--   * KDS / cashier / waiter app: waiter names on KOTs,    -> same-branch clause below
--     inventory document creators, audit log names
-- user_branches is itself RLS-protected, so the branch check goes through a
-- SECURITY DEFINER helper instead of an inline sub-select.

CREATE OR REPLACE FUNCTION public.auth_shares_branch_with(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_branches ub
        WHERE ub.user_id = p_user_id
          AND ub.branch_id = ANY (public.auth_branch_ids())
    );
$$;
REVOKE ALL ON FUNCTION public.auth_shares_branch_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_shares_branch_with(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_lookup"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;  -- same USING(true), fix_kitchen_routing_and_visibility.sql

DROP POLICY IF EXISTS "profiles_branch_peers_select" ON public.profiles;
CREATE POLICY "profiles_branch_peers_select" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        id = auth.uid()
        OR public.is_admin()
        OR public.is_manager()
        OR public.auth_shares_branch_with(id)
    );

-- -----------------------------------------------------------------------------
-- C. get_email_by_user_code — keep anon (pre-auth login), minimise + rate limit
-- -----------------------------------------------------------------------------
-- Why not REVOKE from anon: signInWithCode() in src/stores/auth.ts calls this RPC
-- before the user has a session, so revoking it would break login-by-user-code.
-- Instead: drop full_name from the result (frontend only reads email/is_active),
-- and throttle per user_code and per client IP using the existing
-- check_qr_rate_limit() buckets (qr_rate_limits table, 1-minute windows).
-- Return type changes, so the function must be dropped first.

DROP FUNCTION IF EXISTS public.get_email_by_user_code(text);

CREATE FUNCTION public.get_email_by_user_code(p_user_code text)
RETURNS TABLE (email text, is_active boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code    text := lower(btrim(coalesce(p_user_code, '')));
    v_ip      text;
    v_rl      jsonb;
BEGIN
    IF v_code = '' OR length(v_code) > 64 THEN
        RETURN;
    END IF;

    -- Per user_code: max 10 lookups / minute
    v_rl := public.check_qr_rate_limit('login_code:' || v_code, 'get_email_by_user_code', 10);
    IF NOT coalesce((v_rl ->> 'allowed')::boolean, false) THEN
        RAISE EXCEPTION 'Too many login attempts. Please wait a minute and try again.'
            USING ERRCODE = 'P0001';
    END IF;

    -- Per client IP (PostgREST exposes request headers): max 30 lookups / minute
    BEGIN
        v_ip := split_part(
                    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
                    ',', 1);
    EXCEPTION WHEN others THEN
        v_ip := NULL;
    END;
    IF v_ip IS NOT NULL AND btrim(v_ip) <> '' THEN
        v_rl := public.check_qr_rate_limit('login_ip:' || btrim(v_ip), 'get_email_by_user_code', 30);
        IF NOT coalesce((v_rl ->> 'allowed')::boolean, false) THEN
            RAISE EXCEPTION 'Too many login attempts. Please wait a minute and try again.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN QUERY
        SELECT p.email::text, p.is_active
        FROM public.profiles p
        WHERE p.user_code = p_user_code
        LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_user_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_user_code(text) TO anon, authenticated;
COMMENT ON FUNCTION public.get_email_by_user_code(text) IS
    'Pre-auth login-by-user-code lookup. Returns only email + is_active. Rate limited per code (10/min) and per IP (30/min). security_hardening_131.';

-- -----------------------------------------------------------------------------
-- D. qr_rate_limits — only SECURITY DEFINER functions may touch it
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.qr_rate_limits') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.qr_rate_limits ENABLE ROW LEVEL SECURITY';
        EXECUTE 'REVOKE ALL ON TABLE public.qr_rate_limits FROM anon, authenticated';
    ELSE
        RAISE NOTICE 'public.qr_rate_limits not found — skipped';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- E. Pin search_path on SECURITY DEFINER functions that lacked it
-- -----------------------------------------------------------------------------
--   rpc_apply_loyalty_reward(uuid)                    fix_customer_loyalty_automation.sql
--   merge_table_orders_and_pay(uuid[], text, numeric) fix_merged_table_billing.sql
--   generate_system_audit_report(date)                fix_system_audit_setup.sql
--   get_website_dashboard_stats(uuid)                 fix_website_dashboard_stats.sql
--   generate_inv_doc_number(uuid, text)               fix_inventory_rpc_auth.sql
--   generate_item_code(uuid)                          fix_inventory_rpc_auth.sql
--   generate_supplier_code(uuid)                      fix_inventory_rpc_auth.sql
-- Loops over pg_proc so a missing function (or any extra overload) is handled.
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.proname IN (
              'rpc_apply_loyalty_reward',
              'merge_table_orders_and_pay',
              'generate_system_audit_report',
              'get_website_dashboard_stats',
              'generate_inv_doc_number',
              'generate_item_code',
              'generate_supplier_code'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
        RAISE NOTICE 'search_path pinned on %', r.sig;
    END LOOP;
END $$;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification (run after applying)
-- -----------------------------------------------------------------------------
-- SELECT policyname, cmd, roles, qual FROM pg_policies
--  WHERE schemaname='public' AND tablename IN ('orders','profiles') ORDER BY 1;
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'qr_rate_limits';
-- SELECT p.oid::regprocedure, p.proconfig FROM pg_proc p
--  WHERE p.proname IN ('rpc_apply_loyalty_reward','merge_table_orders_and_pay',
--        'generate_system_audit_report','get_website_dashboard_stats',
--        'generate_inv_doc_number','generate_item_code','generate_supplier_code');
