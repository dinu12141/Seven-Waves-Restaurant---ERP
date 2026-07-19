-- AI Audit Schema
-- Creates ai_daily_reports + ai_audit_checks tables,
-- patches missing columns on existing AI tables,
-- applies RLS, indexes, and realtime publication.

-- ── PATCH EXISTING AI TABLES ─────────────────────────────────────────────────

ALTER TABLE public.ai_insights
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.ai_anomaly_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ── NEW TABLE: ai_daily_reports ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_daily_reports (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id                UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id                 UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  report_date               DATE NOT NULL,
  report_type               TEXT DEFAULT 'end_of_day' CHECK (report_type IN ('end_of_day','mid_day','custom')),
  generated_by              TEXT DEFAULT 'auto' CHECK (generated_by IN ('auto','manual')),
  generated_by_user         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                    TEXT DEFAULT 'generated' CHECK (status IN ('generating','generated','failed')),

  -- Finance Summary
  total_revenue             NUMERIC(14,2) DEFAULT 0,
  total_expenses            NUMERIC(14,2) DEFAULT 0,
  gross_profit              NUMERIC(14,2) DEFAULT 0,
  net_profit                NUMERIC(14,2) DEFAULT 0,
  total_orders              INTEGER DEFAULT 0,
  paid_orders               INTEGER DEFAULT 0,
  void_cancelled_orders     INTEGER DEFAULT 0,
  average_order_value       NUMERIC(10,2) DEFAULT 0,

  -- Payment Breakdown
  cash_collected            NUMERIC(14,2) DEFAULT 0,
  card_collected            NUMERIC(14,2) DEFAULT 0,
  online_collected          NUMERIC(14,2) DEFAULT 0,

  -- HR Summary
  scheduled_staff           INTEGER DEFAULT 0,
  present_staff             INTEGER DEFAULT 0,
  absent_staff              INTEGER DEFAULT 0,
  late_arrivals             INTEGER DEFAULT 0,
  on_leave                  INTEGER DEFAULT 0,

  -- Operations Summary
  total_kots                INTEGER DEFAULT 0,
  avg_kot_completion_mins   NUMERIC(6,2) DEFAULT 0,
  tables_served             INTEGER DEFAULT 0,
  delivery_orders           INTEGER DEFAULT 0,
  takeaway_orders           INTEGER DEFAULT 0,

  -- Finance Audit
  finance_unposted_count    INTEGER DEFAULT 0,
  finance_unposted_value    NUMERIC(14,2) DEFAULT 0,

  -- Full department-wise JSON report
  department_checks         JSONB DEFAULT '{}',
  ai_summary                TEXT,
  ai_recommendations        JSONB DEFAULT '[]',
  ai_flags                  JSONB DEFAULT '[]',

  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),

  UNIQUE (branch_id, report_date, report_type)
);

-- ── NEW TABLE: ai_audit_checks ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_audit_checks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id      UUID REFERENCES public.ai_daily_reports(id) ON DELETE CASCADE,
  department     TEXT NOT NULL CHECK (department IN ('finance','operations','hr','crm','inventory','security')),
  check_name     TEXT NOT NULL,
  check_code     TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pass','fail','warning','info','skipped')),
  severity       TEXT DEFAULT 'info' CHECK (severity IN ('critical','high','medium','low','info')),
  message        TEXT,
  detail         JSONB,
  expected_value TEXT,
  actual_value   TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

ALTER TABLE public.ai_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_checks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_reports_policy ON public.ai_daily_reports;
DROP POLICY IF EXISTS ai_checks_policy  ON public.ai_audit_checks;

CREATE POLICY ai_reports_policy ON public.ai_daily_reports
  FOR ALL TO authenticated USING (is_admin() OR is_manager());

CREATE POLICY ai_checks_policy ON public.ai_audit_checks
  FOR ALL TO authenticated USING (is_admin() OR is_manager());

-- ── INDEXES ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_insights_branch
  ON public.ai_insights(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_anomaly_branch
  ON public.ai_anomaly_events(branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reports_branch_date
  ON public.ai_daily_reports(branch_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_checks_report
  ON public.ai_audit_checks(report_id, department);

-- ── REALTIME ─────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_daily_reports REPLICA IDENTITY FULL;
ALTER TABLE public.ai_audit_checks  REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_daily_reports;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_audit_checks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
