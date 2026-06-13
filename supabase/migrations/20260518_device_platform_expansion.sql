-- ═══════════════════════════════════════════════════════════════════
-- Seven Waves ERP — Step 06: Device & Platform Expansion
-- Database Migration: Device Management Infrastructure
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. DEVICES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_type   TEXT NOT NULL CHECK (device_type IN (
    'printer', 'scanner', 'cash_drawer', 'biometric',
    'kds_display', 'pos_terminal', 'tablet', 'kiosk'
  )),
  device_name   TEXT NOT NULL,
  serial_number TEXT,
  ip_address    TEXT,
  mac_address   TEXT,
  port          INTEGER,
  connection    TEXT NOT NULL DEFAULT 'usb' CHECK (connection IN ('usb', 'network', 'bluetooth', 'serial')),
  status        TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
  last_seen_at  TIMESTAMPTZ,
  assigned_to   UUID REFERENCES auth.users(id),
  firmware_version TEXT,
  config        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_devices_branch ON public.devices(branch_id);
CREATE INDEX idx_devices_type   ON public.devices(device_type);
CREATE INDEX idx_devices_status ON public.devices(status);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devices_branch_isolation" ON public.devices
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

CREATE POLICY "devices_insert" ON public.devices
  FOR INSERT WITH CHECK (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

CREATE POLICY "devices_update" ON public.devices
  FOR UPDATE USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));


-- ─── 2. DEVICE PRINTERS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_printers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  printer_type  TEXT NOT NULL CHECK (printer_type IN ('receipt', 'kitchen', 'label', 'report')),
  printer_name  TEXT NOT NULL,
  printer_ip    TEXT,
  printer_port  INTEGER DEFAULT 9100,
  paper_width   INTEGER DEFAULT 80 CHECK (paper_width IN (58, 80)),
  station_id    TEXT,
  is_default    BOOLEAN DEFAULT false,
  queue_status  TEXT NOT NULL DEFAULT 'idle' CHECK (queue_status IN ('idle', 'printing', 'error', 'paused')),
  last_print_at TIMESTAMPTZ,
  print_count   BIGINT DEFAULT 0,
  config        JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_printers_device ON public.device_printers(device_id);
CREATE INDEX idx_device_printers_type   ON public.device_printers(printer_type);

ALTER TABLE public.device_printers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_printers_via_device" ON public.device_printers
  USING (device_id IN (SELECT id FROM public.devices WHERE branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  )));


-- ─── 3. DEVICE ALERTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_id    UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  alert_type   TEXT NOT NULL CHECK (alert_type IN (
    'printer_offline', 'printer_error', 'scanner_disconnect',
    'drawer_failure', 'biometric_sync_fail', 'kds_offline',
    'device_offline', 'heartbeat_miss', 'print_queue_stuck'
  )),
  severity     TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message      TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}'::jsonb,
  resolved     BOOLEAN DEFAULT false,
  resolved_by  UUID REFERENCES auth.users(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_device_alerts_branch   ON public.device_alerts(branch_id);
CREATE INDEX idx_device_alerts_severity ON public.device_alerts(severity) WHERE NOT resolved;
CREATE INDEX idx_device_alerts_device   ON public.device_alerts(device_id);

ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_alerts_branch_isolation" ON public.device_alerts
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));


-- ─── 4. BIOMETRIC SYNC LOGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_id     UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL,
  sync_status   TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'duplicate')),
  punch_type    TEXT NOT NULL DEFAULT 'clock_in' CHECK (punch_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  punch_time    TIMESTAMPTZ NOT NULL,
  raw_data      JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  synced_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_biometric_sync_employee ON public.biometric_sync_logs(employee_id);
CREATE INDEX idx_biometric_sync_status   ON public.biometric_sync_logs(sync_status) WHERE sync_status = 'pending';
CREATE INDEX idx_biometric_sync_device   ON public.biometric_sync_logs(device_id);

ALTER TABLE public.biometric_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "biometric_sync_branch_isolation" ON public.biometric_sync_logs
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));


-- ─── 5. PRINT JOBS (QUEUE TABLE) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_id    UUID REFERENCES public.device_printers(id) ON DELETE SET NULL,
  job_type      TEXT NOT NULL CHECK (job_type IN ('receipt', 'kitchen_ticket', 'invoice', 'report', 'label', 'test')),
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'printing', 'printed', 'failed', 'cancelled')),
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count   INTEGER DEFAULT 0,
  max_retries   INTEGER DEFAULT 3,
  error_message TEXT,
  created_by    UUID REFERENCES auth.users(id),
  printed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_print_jobs_branch  ON public.print_jobs(branch_id);
CREATE INDEX idx_print_jobs_status  ON public.print_jobs(status) WHERE status IN ('queued', 'printing');
CREATE INDEX idx_print_jobs_printer ON public.print_jobs(printer_id);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "print_jobs_branch_isolation" ON public.print_jobs
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));


-- ─── 6. DEVICE HEARTBEAT FUNCTION ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.device_heartbeat(
  p_device_id UUID,
  p_status TEXT DEFAULT 'online'
)
RETURNS void AS $$
BEGIN
  UPDATE public.devices
  SET status = p_status,
      last_seen_at = now(),
      updated_at = now()
  WHERE id = p_device_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 7. RESOLVE DEVICE ALERT FUNCTION ──────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_device_alert(
  p_alert_id UUID,
  p_user_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.device_alerts
  SET resolved = true,
      resolved_by = p_user_id,
      resolved_at = now()
  WHERE id = p_alert_id AND NOT resolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
