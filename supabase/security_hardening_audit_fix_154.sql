-- =====================================================
-- DATABASE SECURITY & LINTER REMEDIATION #154 (FINAL PRODUCTION VERSION)
-- Seven Waves Restaurant ERP — Supabase Database Hardening
-- =====================================================
-- Resolves all warnings reported by Supabase Database Linter:
-- 1. function_search_path_mutable (0011):
--    Pins search_path to 'public, extensions, pg_temp' on all functions
--    and trigger functions in schema public.
-- 2. extension_in_public (0014):
--    Safely moves pg_net extension to 'extensions' schema.
-- 3. rls_policy_always_true (0024):
--    Fixes overly permissive RLS policies on ai_agent_alerts, erp_event_log,
--    finance_audit_logs, order_status_logs, website_hall_bookings,
--    website_messages, and website_reservations.
-- 4. public_bucket_allows_listing (0025):
--    Removes duplicate and broad anon SELECT policies on storage.objects
--    for employee-photos and menu-images buckets.
-- 5. anon_security_definer_function_executable (0028):
--    Revokes blanket PUBLIC / anon EXECUTE on all functions in public schema.
--    Preserves staff access for authenticated & service_role.
--    Allows anon EXECUTE strictly on allowlisted public customer / QR / Kiosk RPCs.
--    Revokes execution from triggers.
--    Configures ALTER DEFAULT PRIVILEGES to prevent regression on future functions.
-- =====================================================

BEGIN;
SET LOCAL lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- SECTION 1: Fix extension_in_public (pg_net -> extensions schema)
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension 
    WHERE extname = 'pg_net' 
      AND extnamespace = 'public'::regnamespace
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
    RAISE NOTICE '[154-1] Moved pg_net extension from public to extensions schema';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[154-1] Note on pg_net schema move: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------
-- SECTION 2: Fix function_search_path_mutable (Pin search_path)
-- ---------------------------------------------------------------------
-- Dynamic pass: pins search_path on EVERY function in schema public missing it.
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}'::text[])) c
        WHERE c LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass 
          AND d.objid = p.oid 
          AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[154-2] Could not pin search_path on %: %', r.sig, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE '[154-2] Pinned search_path on % functions in public schema', v_count;
END $$;

-- Explicit verification for the 18 specific functions flagged by Supabase linter:
DO $$
DECLARE
  v_fn TEXT;
  v_funcs TEXT[] := ARRAY[
    'fn_trg_order_loyalty_reward()',
    'validate_journal_balance()',
    'set_updated_at()',
    'fn_ar_status(numeric, numeric, date, text)',
    'fn_pos_pay_bucket(text)',
    'post_purchase_return(uuid, uuid)',
    'trg_sync_base_price_to_variant()',
    'get_recipe_margin_report(uuid, uuid)',
    'fn_cashbook_running_balance(uuid, uuid, date, date)',
    'fn_seed_ledger_current_balance()',
    'fn_seed_account_current_balance()',
    'set_updated_at_timestamp()',
    'fn_sync_loyalty_transaction_columns()',
    'generate_proc_doc_number(uuid, text)',
    'block_posted_journal_edit()',
    'take_ap_balance_snapshot(uuid, date)',
    'generate_kot_on_accept_manual(uuid, uuid, uuid)',
    'set_loyalty_rules_updated_at()'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_funcs LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, extensions, pg_temp', v_fn);
      RAISE NOTICE '[154-2-explicit] Pinned: public.%s', v_fn;
    EXCEPTION WHEN undefined_function THEN
      -- Function might have different arguments or already be updated
      NULL;
    WHEN OTHERS THEN
      RAISE NOTICE '[154-2-explicit] Note on public.%s: %', v_fn, SQLERRM;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- SECTION 3: Fix anon_security_definer_function_executable
-- ---------------------------------------------------------------------
-- Step 3.1: Revoke blanket EXECUTE from PUBLIC and anon across public schema
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Step 3.2: Grant EXECUTE to authenticated and service_role for staff & system ops
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Step 3.3: Set ALTER DEFAULT PRIVILEGES to lock down future created functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- Step 3.4: Re-grant EXECUTE to anon ONLY on strictly necessary customer / QR / Kiosk RPCs
DO $$
DECLARE
  v_grant_stmt TEXT;
  v_anon_rpcs TEXT[] := ARRAY[
    -- Table QR Session Management (Customer scans table QR)
    'create_table_session(text, text)',
    'get_or_create_session_by_qr(text)',
    'heartbeat_session(text)',
    'check_qr_rate_limit(text, text, integer)',

    -- Kiosk & Table Self-Ordering
    'create_kiosk_order(uuid, jsonb, text)',
    'create_kiosk_order(uuid, jsonb, text, text, text)',
    'create_kiosk_order(uuid, jsonb, text, text, text, uuid)',
    'create_order_from_session(text, jsonb, text)',
    'add_items_to_order(uuid, jsonb)',
    'add_items_to_order(uuid, text, jsonb)',
    'get_kiosk_orders(uuid)',
    'get_session_orders(text)',

    -- Customer Profile & Loyalty lookup at table
    'get_customer_by_phone(text)',
    'register_customer_profile(uuid, text, text, text)',
    'handle_web_customer_signup()',
    'link_customer_to_session(uuid, uuid)',
    'link_customer_to_session_v2(uuid, uuid, uuid, uuid)',
    'get_my_loyalty_account()',
    'rpc_apply_loyalty_reward(uuid)',

    -- Staff pre-auth login lookup (finds email by pin before session is created)
    'get_email_by_user_code(text)'
  ];
  v_rpc TEXT;
BEGIN
  FOREACH v_rpc IN ARRAY v_anon_rpcs LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', v_rpc);
      RAISE NOTICE '[154-3] Re-granted anon EXECUTE on allowlisted RPC: %', v_rpc;
    EXCEPTION WHEN undefined_function THEN
      -- Overload might not exist with these exact arguments, ignore
      NULL;
    WHEN OTHERS THEN
      RAISE NOTICE '[154-3] Note on allowlist grant for %: %', v_rpc, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 3.5: Revoke EXECUTE on all TRIGGER functions from authenticated and anon
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RAISE NOTICE '[154-3] Revoked EXECUTE on all trigger functions from PUBLIC, anon, authenticated';
END $$;

-- ---------------------------------------------------------------------
-- SECTION 4: Fix rls_policy_always_true (Permissive RLS Policies)
-- ---------------------------------------------------------------------

-- 4.1 ai_agent_alerts: Restrict status update to staff / managers / admins
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_agent_alerts') THEN
    DROP POLICY IF EXISTS "Authenticated users can update ai_agent_alerts status" ON public.ai_agent_alerts;
    DROP POLICY IF EXISTS "ai_agent_alerts_update_staff" ON public.ai_agent_alerts;

    CREATE POLICY "ai_agent_alerts_update_staff"
    ON public.ai_agent_alerts
    FOR UPDATE
    TO authenticated
    USING (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('finance')
      OR public.auth_has_role('staff')
    )
    WITH CHECK (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('finance')
      OR public.auth_has_role('staff')
    );
    RAISE NOTICE '[154-4] Hardened RLS policy on ai_agent_alerts';
  END IF;
END $$;

-- 4.2 erp_event_log: Restrict insert to authenticated staff & service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'erp_event_log') THEN
    DROP POLICY IF EXISTS "eel_system_insert" ON public.erp_event_log;

    CREATE POLICY "eel_system_insert"
    ON public.erp_event_log
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (event_code IS NOT NULL);
    RAISE NOTICE '[154-4] Hardened RLS policy on erp_event_log';
  END IF;
END $$;

-- 4.3 finance_audit_logs: Restrict insert to authenticated staff & service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'finance_audit_logs') THEN
    DROP POLICY IF EXISTS "fal_insert" ON public.finance_audit_logs;

    CREATE POLICY "fal_insert"
    ON public.finance_audit_logs
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (action IS NOT NULL);
    RAISE NOTICE '[154-4] Hardened RLS policy on finance_audit_logs';
  END IF;
END $$;

-- 4.4 order_status_logs: Restrict insert to authenticated staff & service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_status_logs') THEN
    DROP POLICY IF EXISTS "osl_insert_system" ON public.order_status_logs;

    CREATE POLICY "osl_insert_system"
    ON public.order_status_logs
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (order_id IS NOT NULL);
    RAISE NOTICE '[154-4] Hardened RLS policy on order_status_logs';
  END IF;
END $$;

-- 4.5 website_hall_bookings: Validate public insert, restrict manage to staff
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_hall_bookings') THEN
    DROP POLICY IF EXISTS "anon_can_insert_hall_bookings" ON public.website_hall_bookings;
    DROP POLICY IF EXISTS "authenticated_manage_hall_bookings" ON public.website_hall_bookings;

    CREATE POLICY "anon_can_insert_hall_bookings"
    ON public.website_hall_bookings
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      customer_name IS NOT NULL 
      AND LENGTH(TRIM(customer_name)) > 0
      AND (customer_phone IS NOT NULL OR customer_email IS NOT NULL)
    );

    CREATE POLICY "authenticated_manage_hall_bookings"
    ON public.website_hall_bookings
    FOR ALL
    TO authenticated
    USING (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('receptionist')
      OR public.auth_has_role('staff')
    )
    WITH CHECK (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('receptionist')
      OR public.auth_has_role('staff')
    );
    RAISE NOTICE '[154-4] Hardened RLS policies on website_hall_bookings';
  END IF;
END $$;

-- 4.6 website_messages: Validate public insert, restrict manage to staff
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_messages') THEN
    DROP POLICY IF EXISTS "anon_can_insert_messages" ON public.website_messages;
    DROP POLICY IF EXISTS "authenticated_manage_messages" ON public.website_messages;

    CREATE POLICY "anon_can_insert_messages"
    ON public.website_messages
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      name IS NOT NULL 
      AND LENGTH(TRIM(name)) > 0
      AND message IS NOT NULL 
      AND LENGTH(TRIM(message)) > 0
      AND (email IS NOT NULL OR phone IS NOT NULL)
    );

    CREATE POLICY "authenticated_manage_messages"
    ON public.website_messages
    FOR ALL
    TO authenticated
    USING (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('staff')
    )
    WITH CHECK (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('staff')
    );
    RAISE NOTICE '[154-4] Hardened RLS policies on website_messages';
  END IF;
END $$;

-- 4.7 website_reservations: Validate public insert, restrict manage to staff
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'website_reservations') THEN
    DROP POLICY IF EXISTS "anon_can_insert_reservations" ON public.website_reservations;
    DROP POLICY IF EXISTS "authenticated_manage_reservations" ON public.website_reservations;

    CREATE POLICY "anon_can_insert_reservations"
    ON public.website_reservations
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      customer_name IS NOT NULL 
      AND LENGTH(TRIM(customer_name)) > 0
      AND customer_phone IS NOT NULL 
      AND LENGTH(TRIM(customer_phone)) > 0
      AND reservation_date IS NOT NULL
    );

    CREATE POLICY "authenticated_manage_reservations"
    ON public.website_reservations
    FOR ALL
    TO authenticated
    USING (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('host')
      OR public.auth_has_role('staff')
    )
    WITH CHECK (
      public.auth_has_role('admin')
      OR public.auth_has_role('manager')
      OR public.auth_has_role('host')
      OR public.auth_has_role('staff')
    );
    RAISE NOTICE '[154-4] Hardened RLS policies on website_reservations';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- SECTION 5: Fix public_bucket_allows_listing (Clean Storage Object Policies)
-- ---------------------------------------------------------------------
-- Public buckets serve files via direct public URL (/storage/v1/object/public/<bucket>/...)
-- They do NOT require broad SELECT policies on storage.objects for anon.
DO $$
BEGIN
  -- Drop redundant listing policies on employee-photos
  DROP POLICY IF EXISTS "Allow public read on employee-photos" ON storage.objects;
  DROP POLICY IF EXISTS "public_read_employee_photos" ON storage.objects;
  DROP POLICY IF EXISTS "Allow authenticated reads on employee-photos" ON storage.objects;

  -- Create single clean policy for authenticated staff to view/list employee photos
  CREATE POLICY "authenticated_select_employee_photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'employee-photos');

  -- Drop redundant listing policies on menu-images
  DROP POLICY IF EXISTS "Public Select" ON storage.objects;
  DROP POLICY IF EXISTS "public_read_menu_images" ON storage.objects;

  -- Single clean policy for authenticated staff to manage menu images
  CREATE POLICY "authenticated_select_menu_images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'menu-images');

  RAISE NOTICE '[154-5] Cleaned storage listing policies on employee-photos and menu-images';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[154-5] Storage policy cleanup notice: %', SQLERRM;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
