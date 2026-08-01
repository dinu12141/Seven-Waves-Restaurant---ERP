-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: attendance_logs had RLS enabled (erp_security_lockdown.sql) but NO
-- policies at all — meaning zero access for any client, including the
-- Electron desktop app's ZKTeco fingerprint sync (which inserts real punches
-- as the logged-in HR/admin/manager user, not via a service-role key, since
-- shipping a service-role key inside a desktop binary would be a serious
-- security risk — it can be extracted from the installed app).
--
-- Also adds the same unique-punch dedup constraint used by
-- biometric_integration.sql's process_attendance_logs(), so re-syncing the
-- same device attendance log twice (e.g. after a connection retry) doesn't
-- create duplicate rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- Defensive: biometric_integration.sql adds this column, but re-assert here
-- in case that file was never applied live.
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS employee_code TEXT;

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS al_admin ON public.attendance_logs;
CREATE POLICY al_admin ON public.attendance_logs
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS al_hr ON public.attendance_logs;
CREATE POLICY al_hr ON public.attendance_logs
  FOR ALL
  USING (is_hr() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS al_manager ON public.attendance_logs;
CREATE POLICY al_manager ON public.attendance_logs
  FOR ALL
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));

-- Dedup: prevent the same device punch from being inserted twice on retry.
-- employee_code can be NULL on very old rows, so this only actively guards
-- rows where the sync path always supplies it (which the ZKTeco sync does).
ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_unique_punch;
ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_unique_punch
  UNIQUE (employee_code, punch_time, device_id);

-- device_id on attendance_logs is TEXT (not the devices.id UUID) — the ZKTeco
-- sync uses the device's IP/serial string as a human-readable identifier.
