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

CREATE INDEX IF NOT EXISTS idx_devices_branch ON public.devices(branch_id);
CREATE INDEX IF NOT EXISTS idx_devices_type   ON public.devices(device_type);
CREATE INDEX IF NOT EXISTS idx_devices_status ON public.devices(status);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devices_branch_isolation" ON public.devices;
CREATE POLICY "devices_branch_isolation" ON public.devices
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "devices_insert" ON public.devices;
CREATE POLICY "devices_insert" ON public.devices
  FOR INSERT WITH CHECK (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "devices_update" ON public.devices;
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

CREATE INDEX IF NOT EXISTS idx_device_printers_device ON public.device_printers(device_id);
CREATE INDEX IF NOT EXISTS idx_device_printers_type   ON public.device_printers(printer_type);

ALTER TABLE public.device_printers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_printers_via_device" ON public.device_printers;
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

CREATE INDEX IF NOT EXISTS idx_device_alerts_branch   ON public.device_alerts(branch_id);
CREATE INDEX IF NOT EXISTS idx_device_alerts_severity ON public.device_alerts(severity) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_device_alerts_device   ON public.device_alerts(device_id);

ALTER TABLE public.device_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_alerts_branch_isolation" ON public.device_alerts;
CREATE POLICY "device_alerts_branch_isolation" ON public.device_alerts
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

-- ─── 4. BIOMETRIC SYNC LOGS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_sync_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_id    UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.customers(id) ON DELETE CASCADE, -- Fallback to customers for employees if needed, usually references employees table
  punch_time   TIMESTAMPTZ NOT NULL,
  punch_type   TEXT CHECK (punch_type IN ('in', 'out', 'break_in', 'break_out', 'transfer')),
  sync_status  TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_attempts INTEGER DEFAULT 0,
  last_error   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  synced_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_biometric_sync_employee ON public.biometric_sync_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_biometric_sync_status   ON public.biometric_sync_logs(sync_status) WHERE sync_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_biometric_sync_device   ON public.biometric_sync_logs(device_id);

ALTER TABLE public.biometric_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biometric_sync_branch_isolation" ON public.biometric_sync_logs;
CREATE POLICY "biometric_sync_branch_isolation" ON public.biometric_sync_logs
  USING (branch_id IN (
    SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';
