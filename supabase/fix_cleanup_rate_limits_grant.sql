-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIX: cleanup_rate_limits() — Over-Privileged Grant
-- ═══════════════════════════════════════════════════════════════════
--
-- VULNERABILITY: erp_security_lockdown.sql (line 707) grants
-- EXECUTE on cleanup_rate_limits() to the `authenticated` role:
--
--   GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated;
--
-- Any logged-in user can call this function directly via RPC
-- (e.g. supabase.rpc('cleanup_rate_limits')) and DELETE all rows
-- from qr_rate_limits older than 10 minutes — effectively wiping
-- the current rate-limit counters and resetting their own rate limit
-- window on demand. This completely defeats the rate limiting.
--
-- The function is intended to be called only by pg_cron (which runs
-- as superuser) on a scheduled basis to purge stale buckets.
-- Superuser and service_role do not need an explicit GRANT, but
-- granting to service_role explicitly is the correct pattern for
-- Supabase scheduled jobs that use the service-role key.
--
-- FIX:
--   1. Revoke EXECUTE from `authenticated`.
--   2. Grant EXECUTE to `service_role` (for Supabase cron jobs /
--      admin Edge Functions that use the service-role key).
--   pg_cron runs as superuser and is unaffected by either change.
-- ═══════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_rate_limits() TO   service_role;
