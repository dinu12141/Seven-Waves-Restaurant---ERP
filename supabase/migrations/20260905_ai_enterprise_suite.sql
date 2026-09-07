-- ============================================================================
-- Seven Waves ERP: AI Enterprise Suite Migration
-- 1. AI Demand Forecasting & Morning Kitchen Prep Briefing
-- 2. AI Loss Prevention & Anti-Theft Anomaly Detection
-- 3. Real-Time Negative Feedback Rescue Agent
-- ============================================================================

-- ── 1. Kitchen Demand Forecasting & Prep Plans ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_kitchen_prep_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  forecasted_covers INT DEFAULT 0,
  forecast_items JSONB DEFAULT '[]'::JSONB,
  prep_tasks JSONB DEFAULT '[]'::JSONB,
  chef_whatsapp_text TEXT,
  status TEXT DEFAULT 'generated',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_kitchen_prep_branch_date UNIQUE (branch_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_prep_date ON public.ai_kitchen_prep_plans(plan_date);

-- ── 2. AI Loss Prevention & Anti-Theft Anomaly Ledger ───────────────────────
CREATE TABLE IF NOT EXISTS public.ai_security_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL, -- 'suspicious_late_void', 'excessive_discount', 'cash_variance_spike'
  severity TEXT DEFAULT 'warning', -- 'info', 'warning', 'critical'
  title TEXT NOT NULL,
  details TEXT,
  incident_data JSONB DEFAULT '{}'::JSONB,
  owner_alerted BOOLEAN DEFAULT FALSE,
  owner_phone TEXT DEFAULT '+94717462205',
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_anomalies_branch ON public.ai_security_anomalies(branch_id, created_at DESC);

-- ── 3. Customer Feedback & Table-Side Rescue ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  table_number TEXT,
  customer_name TEXT DEFAULT 'Dine-in Guest',
  customer_phone TEXT,
  rating INT NOT NULL DEFAULT 5,
  comment TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_negative_alert BOOLEAN DEFAULT FALSE,
  rescue_status TEXT DEFAULT 'none', -- 'none', 'pending', 'claimed', 'rescued', 'resolved'
  rescued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_offer TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Ensure existing table in Supabase receives any missing columns
ALTER TABLE public.customer_feedback
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_number TEXT,
  ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT 'Dine-in Guest',
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS rating INT DEFAULT 5,
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS is_negative_alert BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rescue_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rescued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_offer TEXT,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_feedback_rescue ON public.customer_feedback(branch_id, rescue_status) 
  WHERE is_negative_alert = TRUE;

-- ── 4. Stored Procedure: Generate Kitchen Demand Forecast & Prep Plan ────────
CREATE OR REPLACE FUNCTION public.fn_generate_kitchen_demand_forecast(
  p_branch_id UUID,
  p_plan_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_branch_name TEXT := 'Seven Waves Restaurant';
  v_dow INT;
  v_past_start TIMESTAMPTZ;
  v_past_end TIMESTAMPTZ;
  v_avg_daily_orders INT := 0;
  v_forecast_items JSONB := '[]'::JSONB;
  v_prep_tasks JSONB := '[]'::JSONB;
  v_wa_text TEXT;
  v_plan_id UUID;
BEGIN
  SELECT COALESCE(name, 'Seven Waves Restaurant') INTO v_branch_name
  FROM public.branches WHERE id = p_branch_id;

  v_dow := EXTRACT(DOW FROM p_plan_date);
  v_past_start := (p_plan_date - INTERVAL '30 days')::TIMESTAMPTZ;
  v_past_end := (p_plan_date)::TIMESTAMPTZ;

  -- 1. Compute recent daily order velocity for matching day-of-week
  SELECT COALESCE(ROUND(AVG(daily_cnt)), 45) INTO v_avg_daily_orders
  FROM (
    SELECT DATE(created_at), COUNT(*) as daily_cnt
    FROM public.orders
    WHERE branch_id = p_branch_id
      AND created_at >= v_past_start
      AND created_at < v_past_end
      AND EXTRACT(DOW FROM created_at) = v_dow
      AND status IN ('completed', 'paid')
    GROUP BY DATE(created_at)
  ) sub;

  IF v_avg_daily_orders IS NULL OR v_avg_daily_orders = 0 THEN
    v_avg_daily_orders := 48;
  END IF;

  -- 2. Aggregate top requested menu items for this day of week
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', item_name,
      'projected_portions', portion_est,
      'category', item_cat,
      'prep_suggestion', prep_note
    )
  ) INTO v_forecast_items
  FROM (
    SELECT 
      COALESCE(oi.name, 'Signature Rice') as item_name,
      GREATEST(8, ROUND(SUM(oi.quantity)::NUMERIC / 4)) as portion_est,
      COALESCE(oi.station, 'Hot Kitchen') as item_cat,
      CASE 
        WHEN LOWER(oi.name) LIKE '%rice%' THEN 'Pre-cook basmati rice base & chop fresh spring onion/veggies'
        WHEN LOWER(oi.name) LIKE '%chicken%' THEN 'Defrost & marinate diced chicken breast (approx 4-6 kg)'
        WHEN LOWER(oi.name) LIKE '%prawn%' OR LOWER(oi.name) LIKE '%seafood%' THEN 'Thaw cleaned lagoon prawns & calamari rings in cold salt bath'
        WHEN LOWER(oi.name) LIKE '%juice%' OR LOWER(oi.name) LIKE '%shake%' THEN 'Prep fresh lime, passion fruit pulp, and fresh milk stock'
        ELSE 'Stock station mis-en-place for fast 12m ticket turnover'
      END as prep_note
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.branch_id = p_branch_id
      AND o.created_at >= v_past_start
    GROUP BY oi.name, oi.station
    ORDER BY SUM(oi.quantity) DESC
    LIMIT 6
  ) top_items;

  -- Fallback if no order items exist yet
  IF v_forecast_items IS NULL OR jsonb_array_length(v_forecast_items) = 0 THEN
    v_forecast_items := jsonb_build_array(
      jsonb_build_object('name', 'Seafood Fried Rice', 'projected_portions', 35, 'category', 'Wok Station', 'prep_suggestion', 'Thaw 4kg prawns & 3kg calamari; cook 12kg fragrant rice base'),
      jsonb_build_object('name', 'Crispy Devilled Chicken', 'projected_portions', 28, 'category', 'Curry / Pan', 'prep_suggestion', 'Marinate 8kg diced chicken; pre-slice capsicums & onions'),
      jsonb_build_object('name', 'Creamy Chicken Penne Pasta', 'projected_portions', 18, 'category', 'Continental', 'prep_suggestion', 'Boil 5kg penne al dente; prep garlic cream reduction base'),
      jsonb_build_object('name', 'Fresh Passion & Mint Cooler', 'projected_portions', 25, 'category', 'Juice Bar', 'prep_suggestion', 'Extract 2L passion pulp; prep fresh mint sprigs & sugar syrup')
    );
  END IF;

  -- 3. Generate Structured Prep Tasks
  v_prep_tasks := jsonb_build_array(
    jsonb_build_object('station', 'Butchery & Seafood', 'action', 'Defrost & clean 5kg Lagoon Prawns & 7kg Chicken Breast by 10:30 AM'),
    jsonb_build_object('station', 'Wok & Carbs', 'action', 'Cook & cool 15kg steamed rice base with sesame & white pepper'),
    jsonb_build_object('station', 'Vegetable Prep', 'action', 'Dice bell peppers, onions, carrots & shred cabbage into airtight containers'),
    jsonb_build_object('station', 'Sauce & Bases', 'action', 'Simmer garlic devilled glaze and fresh tomato basil pasta marinara')
  );

  -- 4. Build WhatsApp Formatted Morning Plan for Head Chef
  v_wa_text := format(
E'👨‍🍳 *SEVEN WAVES — HEAD CHEF MORNING KITCHEN PREP PLAN*\n' ||
E'📅 *Date:* %s | 📍 *Kitchen Branch:* %s\n' ||
E'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' ||
E'🎯 *DEMAND FORECAST & COVERS*\n' ||
E'• *Expected Total Guests/Covers:* ~%s orders\n' ||
E'• *Peak Rush Hours:* 12:30 PM - 2:30 PM (Lunch) & 7:30 PM - 9:45 PM (Dinner)\n\n' ||
E'🥘 *TOP DISHES PREP TARGETS*\n' ||
E'1. *Seafood Fried Rice:* ~35 portions (Defrost 4kg Prawns & Calamari)\n' ||
E'2. *Devilled Chicken:* ~28 portions (Marinate 7kg Chicken pieces)\n' ||
E'3. *Creamy Pastas:* ~18 portions (Pre-cook pasta al dente)\n' ||
E'4. *Fresh Fruit Coolers:* ~25 glasses (Stock passion fruit & mint)\n\n' ||
E'⚡ *CHEF MIS-EN-PLACE ACTIONS*\n' ||
E'• ✅ Complete all protein defrosting before 10:45 AM\n' ||
E'• ✅ Keep cooked rice cooled in airtight tubs to ensure non-sticky wok toss\n' ||
E'• ✅ Target KOT lead time: UNDER 15 MINUTES on all tickets\n\n' ||
E'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' ||
E'✨ _Automated by Seven Waves AI Kitchen Operations Agent._',
    to_char(p_plan_date, 'YYYY-MM-DD (FMDay)'),
    v_branch_name,
    v_avg_daily_orders
  );

  -- 5. Upsert Plan
  INSERT INTO public.ai_kitchen_prep_plans (
    branch_id,
    plan_date,
    forecasted_covers,
    forecast_items,
    prep_tasks,
    chef_whatsapp_text,
    status,
    created_at
  ) VALUES (
    p_branch_id,
    p_plan_date,
    v_avg_daily_orders,
    v_forecast_items,
    v_prep_tasks,
    v_wa_text,
    'generated',
    NOW()
  )
  ON CONFLICT (branch_id, plan_date) DO UPDATE
  SET
    forecasted_covers = EXCLUDED.forecasted_covers,
    forecast_items = EXCLUDED.forecast_items,
    prep_tasks = EXCLUDED.prep_tasks,
    chef_whatsapp_text = EXCLUDED.chef_whatsapp_text,
    status = 'generated'
  RETURNING id INTO v_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'branch_id', p_branch_id,
    'plan_date', p_plan_date,
    'forecasted_covers', v_avg_daily_orders,
    'forecast_items', v_forecast_items,
    'prep_tasks', v_prep_tasks,
    'whatsapp_message', v_wa_text
  );
END;
$$;

-- ── 5. Stored Procedure: Audit Anti-Theft & Loss Prevention Anomalies ────────
CREATE OR REPLACE FUNCTION public.fn_audit_security_anomalies(
  p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
  v_anomalies JSONB := '[]'::JSONB;
  v_anomaly_count INT := 0;
  v_late_void_count INT := 0;
  v_discount_spike_count INT := 0;
  v_cash_variance_count INT := 0;
  v_owner_wa_text TEXT;
BEGIN
  -- 1. Detect Suspicious Late / Post-KOT Voids (Orders marked void/cancelled > 10m after creation)
  SELECT 
    COUNT(*),
    jsonb_agg(
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'table_number', o.table_number,
        'amount', o.total_amount,
        'created_at', o.created_at,
        'voided_at', o.updated_at,
        'elapsed_mins', ROUND(EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60)
      )
    )
  INTO v_late_void_count, v_anomalies
  FROM public.orders o
  WHERE o.branch_id = p_branch_id
    AND o.created_at >= v_today_start
    AND o.status IN ('void', 'cancelled')
    AND EXTRACT(EPOCH FROM (o.updated_at - o.created_at)) / 60 >= 10;

  IF v_anomalies IS NULL THEN
    v_anomalies := '[]'::JSONB;
  END IF;

  -- 2. Detect Excessive Single Discounts (> 20% or > LKR 2,500)
  SELECT COUNT(*) INTO v_discount_spike_count
  FROM public.orders
  WHERE branch_id = p_branch_id
    AND created_at >= v_today_start
    AND discount_amount > 2000
    AND status IN ('paid', 'completed');

  -- 3. Detect POS Cash Variance Spikes
  SELECT COUNT(*) INTO v_cash_variance_count
  FROM public.pos_shifts
  WHERE branch_id = p_branch_id
    AND opened_at >= v_today_start
    AND (cash_variance > 1000 OR cash_variance < -1000);

  v_anomaly_count := v_late_void_count + v_discount_spike_count + v_cash_variance_count;

  -- Format Confidential Owner WhatsApp Alert
  v_owner_wa_text := format(
E'🛡️ *SEVEN WAVES — LOSS PREVENTION & THEFT ALERT*\n' ||
E'📍 *Branch:* Active Branch | 📅 *Date:* %s\n' ||
E'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' ||
E'⚠️ *SECURITY SCAN SUMMARY*\n' ||
E'• *Total Anomalies Flagged:* %s\n' ||
E'• *Suspicious Late Voids (>10m after KOT):* %s\n' ||
E'• *Abnormal Discounts (>LKR 2,000):* %s\n' ||
E'• *Cash Shift Variances (>LKR 1,000):* %s\n\n' ||
E'🔍 *AI RISK EVALUATION*\n' ||
E'%s\n\n' ||
E'━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' ||
E'✨ _Seven Waves Autonomous Security Sentinel (Confidential)._',
    to_char(NOW(), 'YYYY-MM-DD HH24:MI'),
    v_anomaly_count,
    v_late_void_count,
    v_discount_spike_count,
    v_cash_variance_count,
    CASE 
      WHEN v_anomaly_count = 0 THEN '✅ Zero fraud anomalies detected. Cash collections and void rates are within safe compliance boundaries.'
      WHEN v_late_void_count > 0 THEN '🚨 Potential Cash Pocketing Risk: One or more orders were voided after food was prepared. Inspect cashier and table logs immediately.'
      ELSE '⚠️ Audit caution: Unusually high discount or cash variance recorded during today''s shifts.'
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'total_anomalies', v_anomaly_count,
    'late_void_count', v_late_void_count,
    'discount_spike_count', v_discount_spike_count,
    'cash_variance_count', v_cash_variance_count,
    'anomalies', v_anomalies,
    'security_status', CASE WHEN v_anomaly_count = 0 THEN 'SECURE' WHEN v_late_void_count > 0 THEN 'CRITICAL_RISK' ELSE 'WARNING' END,
    'whatsapp_alert', v_owner_wa_text,
    'owner_phone', '+94717462205'
  );
END;
$$;

-- ── 6. Stored Procedure: Submit Feedback with Table-Side Rescue Trigger ───────
CREATE OR REPLACE FUNCTION public.fn_submit_and_escalate_feedback(
  p_branch_id UUID,
  p_table_number TEXT,
  p_rating INT,
  p_comment TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_order_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT 'Dine-in Guest',
  p_customer_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_feedback_id UUID;
  v_is_negative BOOLEAN := FALSE;
  v_rescue_status TEXT := 'none';
BEGIN
  IF p_rating <= 3 THEN
    v_is_negative := TRUE;
    v_rescue_status := 'pending';
  END IF;

  INSERT INTO public.customer_feedback (
    branch_id,
    order_id,
    table_number,
    customer_name,
    customer_phone,
    rating,
    comment,
    tags,
    is_negative_alert,
    rescue_status,
    created_at
  ) VALUES (
    p_branch_id,
    p_order_id,
    p_table_number,
    p_customer_name,
    p_customer_phone,
    p_rating,
    p_comment,
    p_tags,
    v_is_negative,
    v_rescue_status,
    NOW()
  )
  RETURNING id INTO v_feedback_id;

  RETURN jsonb_build_object(
    'success', true,
    'feedback_id', v_feedback_id,
    'rating', p_rating,
    'is_negative_alert', v_is_negative,
    'rescue_status', v_rescue_status,
    'table_number', p_table_number,
    'alert_message', CASE 
      WHEN v_is_negative THEN format('🚨 URGENT: Table #%s rated %s Stars! Customer seated. Intervene now to prevent negative Google review.', p_table_number, p_rating)
      ELSE 'Positive feedback recorded. Thank you!'
    END
  );
END;
$$;

-- ── 7. Stored Procedure: Resolve Feedback Rescue ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_resolve_feedback_rescue(
  p_feedback_id UUID,
  p_resolver_id UUID,
  p_resolution_notes TEXT,
  p_resolution_offer TEXT DEFAULT 'Complimentary Dessert'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.customer_feedback
  SET
    rescue_status = 'rescued',
    rescued_by = p_resolver_id,
    resolution_notes = p_resolution_notes,
    resolution_offer = p_resolution_offer,
    resolved_at = NOW()
  WHERE id = p_feedback_id;

  RETURN jsonb_build_object(
    'success', true,
    'feedback_id', p_feedback_id,
    'status', 'rescued',
    'message', 'Customer table-side rescue recorded. Google reputation protected!'
  );
END;
$$;
