-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIX: Remove internal tables from supabase_realtime
-- ═══════════════════════════════════════════════════════════════════
--
-- VULNERABILITY: erp_security_lockdown.sql (STEP 12, line 764–776)
-- added BOTH qr_rate_limits AND audit_logs to the supabase_realtime
-- publication. This means Supabase Realtime streams changes from
-- these tables to connected browser clients, exposing:
--
--   qr_rate_limits — internal rate-limit counters (hit_count per
--     identifier+endpoint+minute). A client subscribed to this table
--     can observe how close other clients are to the rate limit, tune
--     attacks accordingly, and verify that cleanup_rate_limits() was
--     called. This table has RLS disabled (by design), so all rows
--     are visible.
--
--   audit_logs — security audit trail. Streaming audit events to
--     browser clients allows any authenticated user to watch in
--     real-time which actions other users are taking, which rows are
--     being modified, and which severity events are firing. Audit
--     logs must only be accessible to admins through controlled
--     queries, never broadcast.
--
-- FIX: Remove both tables from the supabase_realtime publication.
-- pg_publication_tables is checked first so the statement is
-- idempotent (safe to re-run even if already removed).
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- Remove qr_rate_limits from realtime if present
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'qr_rate_limits'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.qr_rate_limits;
        RAISE NOTICE 'Removed qr_rate_limits from supabase_realtime publication.';
    ELSE
        RAISE NOTICE 'qr_rate_limits was not in supabase_realtime — nothing to do.';
    END IF;

    -- Remove audit_logs from realtime if present
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'audit_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_logs;
        RAISE NOTICE 'Removed audit_logs from supabase_realtime publication.';
    ELSE
        RAISE NOTICE 'audit_logs was not in supabase_realtime — nothing to do.';
    END IF;
END $$;
