-- =====================================================
-- FIX LOGIN AUDIT LOGS RLS POLICIES (FINAL PRODUCTION VERSION)
-- P0 finding #45 — login_audit_logs was readable by every authenticated
-- user (admin emails / IPs / PII) and anon could forge rows.
--
-- Hardened model:
--   • SELECT  → admins only (is_admin())
--   • INSERT  → authenticated users, only for their OWN user_id (no forging);
--               plus a narrow anon path for pre-auth FAILED-login records that
--               carry no user_id (needed so failed logins are still audited).
--   • No UPDATE / DELETE for app roles (audit trail is append-only).
--   • GRANT ALL revoked; only SELECT/INSERT granted.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.login_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT,
    status TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    ip_address TEXT,
    logged_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.login_audit_logs ENABLE ROW LEVEL SECURITY;

-- ── Drop the old permissive policies ────────────────────────────────
DROP POLICY IF EXISTS "Allow insert for authenticated and anon" ON public.login_audit_logs;
DROP POLICY IF EXISTS "Allow select for authenticated"          ON public.login_audit_logs;
-- Actual legacy policy names found live (2026-07-25): a public SELECT (PII leak)
-- and a service_role INSERT. Drop both so only the hardened lal_* policies remain.
DROP POLICY IF EXISTS "all_can_read_login_audit"   ON public.login_audit_logs;
DROP POLICY IF EXISTS "all_can_insert_login_audit" ON public.login_audit_logs;

-- ── SELECT: admins only ─────────────────────────────────────────────
DROP POLICY IF EXISTS "lal_select_admin" ON public.login_audit_logs;
CREATE POLICY "lal_select_admin" ON public.login_audit_logs
    FOR SELECT TO authenticated
    USING (is_admin());

-- ── INSERT: authenticated users may only log their OWN session ───────
DROP POLICY IF EXISTS "lal_insert_self" ON public.login_audit_logs;
CREATE POLICY "lal_insert_self" ON public.login_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

-- ── INSERT: anon may log ONLY pre-auth failures (no user_id) ─────────
--    This preserves failed-login auditing without allowing row forging
--    against a real user_id.
DROP POLICY IF EXISTS "lal_insert_anon_failed" ON public.login_audit_logs;
CREATE POLICY "lal_insert_anon_failed" ON public.login_audit_logs
    FOR INSERT TO anon
    WITH CHECK (user_id IS NULL AND status = 'failed');

-- ── Grants: revoke the blanket ALL, keep only what policies allow ────
REVOKE ALL ON public.login_audit_logs FROM authenticated, anon;
GRANT SELECT, INSERT ON public.login_audit_logs TO authenticated;
GRANT INSERT           ON public.login_audit_logs TO anon;
