-- ============================================================================
-- Seven Waves ERP: Security Audit Remediation & Hardening Migration
-- Generated based on Cloudflare Security Audit findings:
-- 1. Enable Row Level Security (RLS) on unshielded tables
-- 2. Restrict Critical Database Backup/Restore RPCs to Authenticated Super Admins
-- 3. Fix Search Path Hijacking on SECURITY DEFINER Functions
-- ============================================================================

-- ── 1. Enable RLS and define policies on exposed tables ─────────────────────

-- 1.1 Payroll History
ALTER TABLE public.payroll_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read payroll_history" ON public.payroll_history;
CREATE POLICY "Allow authenticated read payroll_history" 
  ON public.payroll_history 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'accountant', 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "Allow HR and managers manage payroll_history" ON public.payroll_history;
CREATE POLICY "Allow HR and managers manage payroll_history" 
  ON public.payroll_history 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'hr_manager', 'general_manager')
    )
  );

-- 1.2 AI Kitchen Prep Plans
ALTER TABLE public.ai_kitchen_prep_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read ai_kitchen_prep_plans" ON public.ai_kitchen_prep_plans;
CREATE POLICY "Allow authenticated read ai_kitchen_prep_plans" 
  ON public.ai_kitchen_prep_plans 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Allow kitchen managers manage ai_kitchen_prep_plans" ON public.ai_kitchen_prep_plans;
CREATE POLICY "Allow kitchen managers manage ai_kitchen_prep_plans" 
  ON public.ai_kitchen_prep_plans 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'executive_chef', 'kitchen_manager')
    )
  );

-- 1.3 AI Security Anomalies (Anti-theft & void alerts)
ALTER TABLE public.ai_security_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow managers read ai_security_anomalies" ON public.ai_security_anomalies;
CREATE POLICY "Allow managers read ai_security_anomalies" 
  ON public.ai_security_anomalies 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS "Allow managers manage ai_security_anomalies" ON public.ai_security_anomalies;
CREATE POLICY "Allow managers manage ai_security_anomalies" 
  ON public.ai_security_anomalies 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager')
    )
  );

-- 1.4 Customer Feedback
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert customer_feedback" ON public.customer_feedback;
CREATE POLICY "Allow public insert customer_feedback" 
  ON public.customer_feedback 
  FOR INSERT 
  TO anon, authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read customer_feedback" ON public.customer_feedback;
CREATE POLICY "Allow authenticated read customer_feedback" 
  ON public.customer_feedback 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Allow staff update customer_feedback" ON public.customer_feedback;
CREATE POLICY "Allow staff update customer_feedback" 
  ON public.customer_feedback 
  FOR UPDATE 
  TO authenticated 
  USING (true);

-- 1.5 Owner Daily Briefings
ALTER TABLE public.owner_daily_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow owners and admin read owner_daily_briefings" ON public.owner_daily_briefings;
CREATE POLICY "Allow owners and admin read owner_daily_briefings" 
  ON public.owner_daily_briefings 
  FOR SELECT 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'owner')
    )
  );

DROP POLICY IF EXISTS "Allow owners and admin manage owner_daily_briefings" ON public.owner_daily_briefings;
CREATE POLICY "Allow owners and admin manage owner_daily_briefings" 
  ON public.owner_daily_briefings 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'owner')
    )
  );

-- 1.6 Waiter Points Ledger
ALTER TABLE public.waiter_points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read waiter_points_ledger" ON public.waiter_points_ledger;
CREATE POLICY "Allow authenticated read waiter_points_ledger" 
  ON public.waiter_points_ledger 
  FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Allow supervisors manage waiter_points_ledger" ON public.waiter_points_ledger;
CREATE POLICY "Allow supervisors manage waiter_points_ledger" 
  ON public.waiter_points_ledger 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON ur.role_id = r.id 
      WHERE ur.user_id = auth.uid() 
        AND r.name IN ('admin', 'super_admin', 'general_manager', 'floor_manager')
    )
  );


-- ── 2. Harden Critical Database Backup/Restore Functions ───────────────────

-- Revoke execution from PUBLIC and unauthenticated clients
REVOKE EXECUTE ON FUNCTION public.export_database() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_database(jsonb) FROM PUBLIC, anon;

-- Secure export_database: require admin role + enforce search_path
CREATE OR REPLACE FUNCTION public.export_database()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    t record;
    result jsonb := '{}'::jsonb;
    table_data jsonb;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only Super Admins can export the database';
    END IF;

    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM public.%I t', t.table_name) INTO table_data;
        result := jsonb_set(result, ARRAY[t.table_name], table_data);
    END LOOP;
    RETURN result::json;
END;
$$;

-- Secure restore_database: require admin role + enforce search_path
CREATE OR REPLACE FUNCTION public.restore_database(dump_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    t record;
BEGIN
    -- Authorization check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only Super Admins can restore the database';
    END IF;

    -- Disable triggers and constraints temporarily
    SET session_replication_role = 'replica';
    
    -- Truncate all tables to prepare for clean restore
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DELETE FROM public.%I', t.table_name);
    END LOOP;
    
    -- Insert data into each table from the JSON dump
    FOR t IN 
        SELECT key AS table_name, value AS rows 
        FROM jsonb_each(dump_data)
    LOOP
        IF jsonb_array_length(t.rows) > 0 THEN
            EXECUTE format('
                INSERT INTO public.%I 
                SELECT * FROM jsonb_populate_recordset(NULL::public.%I, %L)
            ', t.table_name, t.table_name, t.rows);
        END IF;
    END LOOP;
    
    -- Re-enable triggers and constraints
    SET session_replication_role = 'origin';
END;
$$;


-- ── 3. Enforce search_path = public, pg_temp on SECURITY DEFINER functions ─

DO $$
BEGIN
  -- Webhook notification triggers
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_inventory_alerts') THEN
    ALTER FUNCTION public.notify_inventory_alerts() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_order_status_change') THEN
    ALTER FUNCTION public.notify_order_status_change() SET search_path = public, pg_temp;
  END IF;

  -- AI Enterprise functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_generate_kitchen_demand_forecast') THEN
    ALTER FUNCTION public.fn_generate_kitchen_demand_forecast(UUID, DATE) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_security_anomalies') THEN
    ALTER FUNCTION public.fn_audit_security_anomalies(UUID) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_submit_and_escalate_feedback') THEN
    ALTER FUNCTION public.fn_submit_and_escalate_feedback(UUID, TEXT, INT, TEXT, TEXT[], TEXT, TEXT) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_resolve_feedback_rescue') THEN
    ALTER FUNCTION public.fn_resolve_feedback_rescue(UUID, UUID, TEXT, TEXT) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_generate_owner_daily_briefing') THEN
    ALTER FUNCTION public.fn_generate_owner_daily_briefing(UUID, DATE, TEXT, TEXT) SET search_path = public, pg_temp;
  END IF;

  -- Waiter assignment & auditing functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_assign_order_waiter') THEN
    ALTER FUNCTION public.fn_assign_order_waiter(UUID, UUID, UUID) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_unassigned_waiter_orders') THEN
    ALTER FUNCTION public.fn_audit_unassigned_waiter_orders(UUID) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_erp_reporting_integrity') THEN
    ALTER FUNCTION public.fn_audit_erp_reporting_integrity(UUID) SET search_path = public, pg_temp;
  END IF;

  -- Waiter points & performance functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_award_waiter_order_points') THEN
    ALTER FUNCTION public.fn_award_waiter_order_points(UUID) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_fn_order_points_auto_award') THEN
    ALTER FUNCTION public.trg_fn_order_points_auto_award() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_waiter_points_realtime') THEN
    ALTER FUNCTION public.fn_audit_waiter_points_realtime(UUID) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_get_monthly_waiter_performance') THEN
    ALTER FUNCTION public.fn_get_monthly_waiter_performance(UUID, INT, INT) SET search_path = public, pg_temp;
  END IF;
END $$;
