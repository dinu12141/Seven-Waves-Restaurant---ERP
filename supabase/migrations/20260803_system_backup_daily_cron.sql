-- =====================================================================
-- System Backup v2 — daily automatic full-database dump via pg_cron
-- =====================================================================
-- Calls the system-backup Edge Function's `trigger` action once a day.
-- Uses the same net.http_post + service-role-bearer pattern already
-- established in 20260801_web_push_infrastructure.sql for pg_cron/trigger ->
-- Edge Function calls. The Edge Function's requireAdmin() explicitly allows
-- a service-role bearer through for exactly this unattended/cron path (see
-- supabase/functions/system-backup/index.ts).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trigger_daily_system_backup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _edge_fn_url TEXT;
  _service_role_key TEXT;
BEGIN
  _edge_fn_url := coalesce(
    current_setting('app.settings.edge_function_url', true),
    'https://clykwuzajtwvwuavmtzs.supabase.co'
  ) || '/functions/v1/system-backup';

  _service_role_key := coalesce(
    current_setting('app.settings.service_role_key', true),
    current_setting('supabase.service_role_key', true)
  );

  PERFORM net.http_post(
    url     := _edge_fn_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    ),
    body    := jsonb_build_object('action', 'trigger')::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_daily_system_backup() TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_daily_system_backup() TO service_role;
REVOKE ALL ON FUNCTION public.trigger_daily_system_backup() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.trigger_daily_system_backup() IS
  'System Backup v2: fires the system-backup Edge Function''s trigger action daily via pg_cron, producing a full-database gzipped JSON dump in the system-backups Storage bucket.';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('system_backup_daily_job')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'system_backup_daily_job');

        PERFORM cron.schedule(
            'system_backup_daily_job',
            '0 2 * * *',  -- 02:00 every day (off-peak for a restaurant)
            'SELECT public.trigger_daily_system_backup()'
        );
        RAISE NOTICE '[CRON] Scheduled system_backup_daily_job (daily @ 02:00)';
    ELSE
        RAISE NOTICE '[CRON] pg_cron extension not installed — skipped scheduling system_backup_daily_job. Trigger backups manually via the "Backup Now" button instead.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[CRON] Could not schedule system_backup_daily_job: %', SQLERRM;
END $$;
