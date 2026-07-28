-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #125 — Restore authenticated role EXECUTE permissions for ERP RPCs
-- Seven Waves Restaurant ERP
--
-- BUG: CRITICAL_fix_revoke_anon_functions.sql aggressively revoked 
-- EXECUTE on ALL functions from the `authenticated` role, and attempted to manually 
-- whitelist them. It missed dozens of critical functions including Finance, HR, 
-- Reporting, and core POS orchestration (e.g. fn_rpt_monthly_sales, 
-- next_voucher_no, post_finance_voucher).
--
-- FIX: In Supabase, the `authenticated` role SHOULD have EXECUTE permission 
-- on public schema functions by default. Security is enforced via RLS and 
-- SECURITY DEFINER internal role checks (is_admin, is_finance, etc.).
-- We restore the blanket grant to `authenticated` while ensuring `anon` 
-- remains revoked from all but the explicitly safe functions.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Restore standard execution rights to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- 2. Ensure anon has absolutely no blanket access (Defense in depth)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 3. Re-grant anon to ONLY the specific public-facing endpoints (Kiosk/QR)
GRANT EXECUTE ON FUNCTION public.create_table_session(TEXT, TEXT)           TO anon;
GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER)   TO anon;
GRANT EXECUTE ON FUNCTION public.create_kiosk_order(UUID, JSONB, TEXT)         TO anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_session(TEXT, JSONB, TEXT)  TO anon;
