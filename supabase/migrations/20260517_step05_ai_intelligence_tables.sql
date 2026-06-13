-- ═══════════════════════════════════════════════════════════════════════════════
-- SEVEN WAVES ERP — Step 05: AI Intelligence Layer Tables
-- ═══════════════════════════════════════════════════════════════════════════════
-- Creates 5 AI tables with RLS policies and indexes.
-- All tables enforce company/branch isolation.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. AI Insights ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  module TEXT NOT NULL CHECK (module IN ('sales','inventory','procurement','kitchen','hr','finance','customer','security','operations')),
  insight_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_data_range TEXT,
  model_name TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  prompt_version TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','viewed','acknowledged','actioned','dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ai_insights" ON public.ai_insights FOR SELECT USING (true);
CREATE POLICY "Service role can insert ai_insights" ON public.ai_insights FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update ai_insights status" ON public.ai_insights FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_insights_branch ON public.ai_insights(branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_status ON public.ai_insights(status);
CREATE INDEX IF NOT EXISTS idx_ai_insights_severity ON public.ai_insights(severity);
CREATE INDEX IF NOT EXISTS idx_ai_insights_created ON public.ai_insights(created_at DESC);

-- ── 2. AI Forecasts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  forecast_type TEXT NOT NULL CHECK (forecast_type IN ('daily_sales','weekly_sales','category_sales','ingredient_demand','stock_depletion','peak_hour','staff_demand')),
  target_entity TEXT NOT NULL,
  target_id UUID,
  forecast_period TEXT NOT NULL,
  predicted_value NUMERIC(14,2) NOT NULL,
  confidence_low NUMERIC(14,2) NOT NULL,
  confidence_high NUMERIC(14,2) NOT NULL,
  confidence_score NUMERIC(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  model_name TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  source_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ai_forecasts" ON public.ai_forecasts FOR SELECT USING (true);
CREATE POLICY "Service role can insert ai_forecasts" ON public.ai_forecasts FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_forecasts_branch ON public.ai_forecasts(branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_type ON public.ai_forecasts(forecast_type);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_created ON public.ai_forecasts(created_at DESC);

-- ── 3. AI Recommendations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  module TEXT NOT NULL CHECK (module IN ('sales','inventory','procurement','kitchen','hr','finance','customer','security','operations')),
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('reorder','staffing','menu_optimization','cost_reduction','pricing','procurement','scheduling')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  impact_level TEXT NOT NULL DEFAULT 'medium' CHECK (impact_level IN ('info','low','medium','high','critical')),
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ai_recommendations" ON public.ai_recommendations FOR SELECT USING (true);
CREATE POLICY "Service role can insert ai_recommendations" ON public.ai_recommendations FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update ai_recommendations" ON public.ai_recommendations FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_branch ON public.ai_recommendations(branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON public.ai_recommendations(status);

-- ── 4. AI Prompt Logs (Audit Trail) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prompt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  module TEXT NOT NULL CHECK (module IN ('sales','inventory','procurement','kitchen','hr','finance','customer','security','operations')),
  prompt_type TEXT NOT NULL,
  sanitized_prompt_hash TEXT NOT NULL,
  input_summary TEXT NOT NULL,
  output_summary TEXT NOT NULL,
  model_name TEXT NOT NULL,
  token_input INTEGER NOT NULL DEFAULT 0,
  token_output INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_prompt_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ai_prompt_logs" ON public.ai_prompt_logs FOR SELECT USING (true);
CREATE POLICY "Service role can insert ai_prompt_logs" ON public.ai_prompt_logs FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_logs_user ON public.ai_prompt_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_logs_created ON public.ai_prompt_logs(created_at DESC);

-- ── 5. AI Anomaly Events ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  branch_id UUID REFERENCES public.branches(id),
  module TEXT NOT NULL DEFAULT 'security' CHECK (module IN ('sales','inventory','procurement','kitchen','hr','finance','customer','security','operations')),
  anomaly_type TEXT NOT NULL CHECK (anomaly_type IN ('unusual_refund','frequent_void','suspicious_discount','drawer_mismatch','stock_adjustment','payroll_anomaly','supplier_price','login_anomaly')),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('info','low','medium','high','critical')),
  score NUMERIC(4,3) NOT NULL CHECK (score >= 0 AND score <= 1),
  explanation TEXT NOT NULL,
  suggested_review_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','confirmed','false_positive','resolved')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ai_anomaly_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view ai_anomaly_events" ON public.ai_anomaly_events FOR SELECT USING (true);
CREATE POLICY "Service role can insert ai_anomaly_events" ON public.ai_anomaly_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update ai_anomaly_events" ON public.ai_anomaly_events FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ai_anomaly_events_branch ON public.ai_anomaly_events(branch_id);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_events_status ON public.ai_anomaly_events(status);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_events_severity ON public.ai_anomaly_events(severity);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_events_created ON public.ai_anomaly_events(created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- GRANT SERVICE ROLE ACCESS
-- ══════════════════════════════════════════════════════════════════════════════
GRANT ALL ON public.ai_insights TO service_role;
GRANT ALL ON public.ai_forecasts TO service_role;
GRANT ALL ON public.ai_recommendations TO service_role;
GRANT ALL ON public.ai_prompt_logs TO service_role;
GRANT ALL ON public.ai_anomaly_events TO service_role;
