-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL SECURITY FIX: Revoke Blanket Function Grants to anon
-- Seven Waves Restaurant ERP
-- Applied: 2026-06-23
--
-- ROOT CAUSE:
--   Two migration files used a lazy shortcut during development:
--     fix_cashier_kot_realtime.sql:173
--       GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
--     fix_kitchen_routing_hierarchy.sql:232
--       GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;
--
--   This silently gave the anonymous (unauthenticated) Supabase role
--   EXECUTE permission on EVERY function in the public schema, including:
--     - rpc_manager_process_refund()
--     - pos_close_shift()
--     - is_admin(), is_manager(), is_hr(), is_finance()
--     - audit_record() (SECURITY DEFINER)
--
--   Additionally, three other files granted authenticated users blanket
--   access to ALL functions:
--     fix_kds_visibility_final.sql:85
--     fix_kitchen_routing_and_visibility.sql:130
--     fix_waiter_visibility_fully.sql:221
--
-- APPLY THIS FILE FIRST before any other migrations in this sprint.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — REVOKE ALL FROM anon (CRITICAL)
-- ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — REVOKE BLANKET authenticated GRANT
-- ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- ─────────────────────────────────────────────────────────────────
-- STEP 3 — RE-GRANT ONLY SAFE FUNCTIONS TO anon
-- ─────────────────────────────────────────────────────────────────

-- QR table session (anon customer scans QR -> creates session)
-- Actual signature: create_table_session(p_device_code TEXT, p_device_secret TEXT)
GRANT EXECUTE ON FUNCTION public.create_table_session(TEXT, TEXT)           TO anon;

-- Rate limit check (anon-callable — used inside SECURITY DEFINER order RPCs)
GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER)   TO anon;

-- Kiosk/QR order placement (SECURITY DEFINER — anon can call, rate limit enforced inside)
-- Rate limit is wired in via fix_rate_limit_enforcement.sql
GRANT EXECUTE ON FUNCTION public.create_kiosk_order(UUID, JSONB, TEXT)         TO anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_session(TEXT, JSONB, TEXT)  TO anon;

-- ─────────────────────────────────────────────────────────────────
-- STEP 4 — RE-GRANT SAFE FUNCTIONS TO authenticated
-- Only grant what actually exists; per-function, not blanket.
-- ─────────────────────────────────────────────────────────────────

-- Auth helpers — used by RLS policies
GRANT EXECUTE ON FUNCTION public.auth_has_role(TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_access_to_branch(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_branch_ids()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_has_permission(TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_branch_ids()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager()                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hr()                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance()                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_inventory()                             TO authenticated;

-- Rate limiting
GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER)   TO authenticated;

-- POS / Orders
-- Handle overloaded waiter accept order RPC gracefully
DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.rpc_waiter_accept_order(UUID, UUID[]) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_redeem_loyalty_coins(UUID, INT, UUID)   TO authenticated;

-- POS shift management
GRANT EXECUTE ON FUNCTION public.pos_close_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO authenticated;

-- Cleanup (used by pg_cron scheduled job)
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits()                      TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- STEP 5 — CONDITIONAL GRANTS (applied when dependent SQL files run)
-- These functions are created by fix_price_and_discount_security.sql.
-- Grant them here only if they already exist.
-- ─────────────────────────────────────────────────────────────────

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.rpc_manager_price_override(UUID, NUMERIC, TEXT)    TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'rpc_manager_price_override not yet deployed — grant skipped (apply fix_price_and_discount_security.sql first)';
END $$;

DO $$
BEGIN
  GRANT EXECUTE ON FUNCTION public.rpc_manager_discount_override(UUID, NUMERIC, TEXT) TO authenticated;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'rpc_manager_discount_override not yet deployed — grant skipped (apply fix_price_and_discount_security.sql first)';
END $$;

-- ─────────────────────────────────────────────────────────────────
-- STEP 6 — VERIFY
-- Run this after applying to confirm anon grants are minimal:
--
--   SELECT routine_name
--     FROM information_schema.role_routine_grants
--    WHERE grantee = 'anon' AND specific_schema = 'public'
--    ORDER BY routine_name;
--
-- Expected result (4 rows):
--   check_qr_rate_limit
--   create_kiosk_order
--   create_order_from_session
--   create_table_session
-- ─────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════
-- AFTER APPLYING:
--   1. Run the verification query above
--   2. Apply fix_rate_limit_enforcement.sql (wires rate limit into order RPCs)
--   3. Apply fix_price_and_discount_security.sql (then re-run this file OR
--      manually GRANT the two rpc_manager_* functions to authenticated)
--   4. Schedule cleanup via pg_cron:
--        SELECT cron.schedule('cleanup-rate-limits', '*/10 * * * *',
--          'SELECT cleanup_rate_limits()');
-- ═══════════════════════════════════════════════════════════════════
