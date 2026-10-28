-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-B: Schedule cleanup_rate_limits via pg_cron
-- Seven Waves Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════════════════
-- Purges stale buckets from qr_rate_limits every 10 minutes to prevent table bloat.
-- Re-runnable / idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing job if already registered to avoid duplicates
        PERFORM cron.unschedule('cleanup-rate-limits')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limits');

        -- Schedule to run every 10 minutes
        PERFORM cron.schedule(
            'cleanup-rate-limits',
            '*/10 * * * *',
            'SELECT public.cleanup_rate_limits();'
        );
    ELSE
        RAISE NOTICE 'pg_cron extension not installed — scheduled cleanup omitted.';
    END IF;
END $$;
