-- ============================================================================
-- Seven Waves ERP: Security Audit Remediation & Hardening Migration
-- 1. Enable Row Level Security (RLS) & Policies on Exposed Tables
-- 2. Restrict Critical Database Backup/Restore RPCs to Authenticated Super Admins
-- 3. Dynamically Enforce search_path = public, pg_temp on SECURITY DEFINER Functions
-- ============================================================================

-- ── 1. Enable RLS and define policies on exposed tables (Idempotent) ────────

DO $$
BEGIN
  -- 1.1 Payroll History
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payroll_history') THEN
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
  END IF;

  -- 1.2 AI Kitchen Prep Plans
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_kitchen_prep_plans') THEN
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
  END IF;

  -- 1.3 AI Security Anomalies (Anti-theft & void alerts)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_security_anomalies') THEN
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
  END IF;

  -- 1.4 Customer Feedback
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_feedback') THEN
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
  END IF;

  -- 1.5 Owner Daily Briefings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'owner_daily_briefings') THEN
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
  END IF;

  -- 1.6 Waiter Points Ledger
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waiter_points_ledger') THEN
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
  END IF;
END $$;


-- ── 2. Harden Critical Database Backup/Restore Functions ───────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'export_database') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.export_database() FROM PUBLIC, anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'restore_database') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.restore_database(jsonb) FROM PUBLIC, anon';
  END IF;
END $$;

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


-- ── 3. Dynamically Enforce search_path = public, pg_temp on SECURITY DEFINER functions ─
-- Uses pg_proc.oid::regprocedure to get the EXACT argument signature from the DB catalog.
-- Never fails with signature mismatch error 42883!

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT p.oid::regprocedure AS func_sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'notify_inventory_alerts',
        'notify_order_status_change',
        'fn_generate_kitchen_demand_forecast',
        'fn_audit_security_anomalies',
        'fn_submit_and_escalate_feedback',
        'fn_resolve_feedback_rescue',
        'fn_generate_owner_daily_briefing',
        'fn_assign_order_waiter',
        'fn_audit_unassigned_waiter_orders',
        'fn_audit_erp_reporting_integrity',
        'fn_award_waiter_order_points',
        'trg_fn_order_points_auto_award',
        'fn_audit_waiter_points_realtime',
        'fn_get_monthly_waiter_performance'
      )
  ) LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.func_sig);
  END LOOP;
END $$;
