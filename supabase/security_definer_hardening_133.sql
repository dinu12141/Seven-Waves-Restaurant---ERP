-- =============================================================================
-- security_definer_hardening_133.sql
-- -----------------------------------------------------------------------------
-- Idempotent, transactional. Apply manually (Supabase SQL editor / MCP) AFTER
-- security_hardening_131.sql. Every change is reported with RAISE NOTICE —
-- read the NOTICE output after applying.
--
--   A. Pin search_path on every SECURITY DEFINER function in `public` that has
--      none (catalog-driven, so it covers functions added after this file).
--      Uses `public, extensions, pg_temp` — the same resolution order PostgREST
--      sessions already had ("$user", public, extensions), so unqualified calls
--      to pgcrypto / uuid-ossp / pg_net helpers keep working.
--   B. Revoke EXECUTE from anon (and from PUBLIC, re-granting authenticated +
--      service_role first so staff keep access) on SECURITY DEFINER functions,
--      EXCEPT:
--        * the pre-auth / QR / kiosk allowlist below (verified by grepping src/
--          for RPCs reached before login: auth.ts signInWithCode, QrEntryPage,
--          TableLoginPage, TableMenuPage, TouchMenuLayout + touch-menu/*,
--          CustomerAuthPage, tableAuthService, customerAuthService,
--          customerOrderStore, loyaltyService),
--        * helpers referenced by an RLS policy that applies to anon/public
--          (revoking those would make anon reads of e.g. menu tables error),
--        * functions called from the body of an allowlisted function (in case
--          an allowlisted function is SECURITY INVOKER),
--        * functions used in a column DEFAULT expression,
--        * trigger / event-trigger functions and extension-owned functions.
--   C. Table exposures confirmed by a live read-only anon probe (2026-10-26:
--      GET /rest/v1/<table>?limit=1 with the anon key returned rows):
--        table_qr_tokens         all 57 QR secrets readable by anyone
--                                -> anyone could open a session on any table
--        restaurant_tables       qr_token / qr_code columns readable by anon
--        customer_table_sessions customer <-> table links
--        kot_routing_targets, designations, leave_types  (internal/HR data)
--      None of these are read directly by anon-time client code (only
--      restaurant_tables.{id,table_number,section,is_active}); SECURITY DEFINER
--      RPCs (get_or_create_session_by_qr, ...) are unaffected by table grants.
--   D. Report (NOTICE only, no change) of public tables with RLS disabled, so
--      the DBA can add policies table by table. Enabling RLS blindly would
--      lock the app out of tables that have no policies yet.
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- -----------------------------------------------------------------------------
-- A. search_path on SECURITY DEFINER functions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r record;
    n int := 0;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public'
          AND p.prosecdef
          AND p.prokind = 'f'
          AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
                          WHERE c LIKE 'search_path=%')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
        n := n + 1;
        RAISE NOTICE '[133-A] search_path pinned: %', r.sig;
    END LOOP;
    RAISE NOTICE '[133-A] % SECURITY DEFINER function(s) pinned', n;
END $$;

-- -----------------------------------------------------------------------------
-- B. anon EXECUTE on SECURITY DEFINER functions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    -- Pre-auth / customer-facing RPCs that MUST stay anon-callable.
    v_allow text[] := ARRAY[
        -- staff login by user code (runs before a session exists)
        'get_email_by_user_code',
        -- QR / table session
        'get_or_create_session_by_qr', 'create_table_session', 'heartbeat_session',
        'check_qr_rate_limit',
        -- kiosk / table ordering + tracking
        'create_kiosk_order', 'create_order_from_session', 'add_items_to_order',
        'get_kiosk_orders', 'get_session_orders',
        -- customer self-registration / linking at the table
        'register_customer_profile', 'upsert_customer_by_phone', 'get_customer_by_phone',
        'link_customer_to_session', 'link_customer_to_session_v2',
        -- loyalty at the table (customerStore / loyaltyService)
        'get_my_loyalty_account', 'rpc_apply_loyalty_reward',
        -- public menu helpers (no-op if absent)
        'get_public_menu', 'get_menu_items', 'get_menu_book'
    ];
    r record;
    n int := 0;
    k int := 0;
BEGIN
    FOR r IN
        SELECT p.oid, p.oid::regprocedure AS sig, p.proname,
               -- does PUBLIC hold EXECUTE? (NULL acl = default = PUBLIC has it)
               (p.proacl IS NULL OR EXISTS (
                    SELECT 1 FROM aclexplode(p.proacl) a
                    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_has
        FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public'
          AND p.prosecdef
          AND p.prokind = 'f'
          AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d
                          WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
    LOOP
        -- keep: allowlisted
        IF r.proname = ANY (v_allow) THEN
            CONTINUE;
        END IF;

        -- keep: used by an RLS policy that anon can hit (roles anon or public),
        -- in ANY schema (storage.objects / realtime.messages policies often call
        -- public.is_admin() etc., and anon reads public menu images from storage)
        IF EXISTS (
            SELECT 1 FROM pg_policies pol
            WHERE (pol.roles && ARRAY['anon','public']::name[])
              AND (coalesce(pol.qual, '') ~* ('\m' || r.proname || '\s*\(')
                   OR coalesce(pol.with_check, '') ~* ('\m' || r.proname || '\s*\('))
        ) THEN
            k := k + 1;
            RAISE NOTICE '[133-B] kept (anon policy helper): %', r.sig;
            CONTINUE;
        END IF;

        -- keep: used in a column DEFAULT (evaluated with the inserting role's privileges)
        IF EXISTS (
            SELECT 1 FROM pg_attrdef ad
            WHERE pg_get_expr(ad.adbin, ad.adrelid) ~* ('\m' || r.proname || '\s*\(')
        ) THEN
            k := k + 1;
            RAISE NOTICE '[133-B] kept (column default): %', r.sig;
            CONTINUE;
        END IF;

        -- keep: called from the body of an allowlisted function
        IF EXISTS (
            SELECT 1 FROM pg_proc a
            JOIN pg_namespace an ON an.oid = a.pronamespace AND an.nspname = 'public'
            WHERE a.proname = ANY (v_allow)
              AND a.prosrc ~* ('\m' || r.proname || '\s*\(')
        ) THEN
            k := k + 1;
            RAISE NOTICE '[133-B] kept (called by allowlisted RPC): %', r.sig;
            CONTINUE;
        END IF;

        IF r.public_has THEN
            -- preserve staff access that previously came via PUBLIC
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
        END IF;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
        n := n + 1;
        RAISE NOTICE '[133-B] anon EXECUTE revoked: %', r.sig;
    END LOOP;
    RAISE NOTICE '[133-B] revoked anon on % function(s); kept % helper(s) beyond the allowlist', n, k;
END $$;

-- Future functions created by this role: do not hand EXECUTE to PUBLIC/anon by
-- default. NOTE for teammates: any NEW pre-auth / kiosk RPC must now carry an
-- explicit `GRANT EXECUTE ON FUNCTION public.<fn>(<argtypes>) TO anon;`.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- C. Tables readable by anon that must not be
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['table_qr_tokens', 'customer_table_sessions',
                             'kot_routing_targets', 'designations', 'leave_types']
    LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
            RAISE NOTICE '[133-C] anon privileges revoked on public.%', t;
        END IF;
    END LOOP;

    -- restaurant_tables: anon (kiosk / QR pages) only needs the non-secret
    -- columns; the qr_token / qr_code secrets become staff-only.
    IF to_regclass('public.restaurant_tables') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON TABLE public.restaurant_tables FROM anon';
        EXECUTE (
            SELECT format('GRANT SELECT (%s) ON TABLE public.restaurant_tables TO anon',
                          string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position))
            FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.table_name = 'restaurant_tables'
              AND c.column_name IN ('id', 'company_id', 'branch_id', 'table_number', 'capacity',
                                    'status', 'section', 'is_active', 'created_at', 'updated_at')
        );
        RAISE NOTICE '[133-C] restaurant_tables: anon limited to non-secret columns (qr_token/qr_code hidden)';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- D. Report RLS-disabled tables (no change)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT c.relname,
               has_table_privilege('anon', c.oid, 'SELECT')          AS anon_sel,
               has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') AS anon_write,
               (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
        ORDER BY c.relname
    LOOP
        RAISE WARNING '[133-D] RLS DISABLED on public.% (anon select=%, anon write=%, policies defined=%)',
            r.relname, r.anon_sel, r.anon_write, r.policies;
    END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Pre-flight (run BEFORE applying, read-only) — what A/B would touch:
-- -----------------------------------------------------------------------------
-- SELECT p.oid::regprocedure, p.proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
--    AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
--         OR has_function_privilege('anon', p.oid, 'EXECUTE'))
--  ORDER BY 1;
--
-- Verification (after applying):
-- SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE');
--   -> expect only the allowlist + anon-policy helpers
-- SELECT has_table_privilege('anon', 'public.table_qr_tokens', 'SELECT');               -- false
-- SELECT has_column_privilege('anon', 'public.restaurant_tables', 'qr_token', 'SELECT'); -- false
-- Smoke test: scan a table QR (/c/<token>), place a kiosk order, log in by user code.
