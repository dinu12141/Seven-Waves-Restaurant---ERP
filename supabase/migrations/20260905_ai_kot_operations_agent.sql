-- ═══════════════════════════════════════════════════════════════════════════════
-- SEVEN WAVES ERP — Autonomous KOT & Operations AI Agent Schema
-- ═══════════════════════════════════════════════════════════════════════════════
-- Implements:
-- 1. ai_agent_alerts table (Realtime operations stream with deep JSONB metadata)
-- 2. fn_audit_kot_and_operations() RPC (24/7 cloud watchdog for KOTs & sales)
-- 3. fn_auto_reroute_kot() RPC (Allows agent/manager to reroute misrouted tickets)
-- 4. Realtime publication & RLS policies
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. AI Agent Alerts Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_agent_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL DEFAULT 'kot_operations' 
        CHECK (agent_type IN ('kot_operations', 'inventory', 'finance', 'hr')),
    alert_type TEXT NOT NULL 
        CHECK (alert_type IN ('routing_error', 'prep_delay', 'pickup_delay', 'void_spike', 'sales_anomaly', 'station_overload', 'order_auto_recovered')),
    severity TEXT NOT NULL DEFAULT 'warning' 
        CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ultra-fast realtime queries
CREATE INDEX IF NOT EXISTS idx_ai_agent_alerts_branch_resolved 
    ON public.ai_agent_alerts(branch_id, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_alerts_agent_type 
    ON public.ai_agent_alerts(agent_type, alert_type);
CREATE INDEX IF NOT EXISTS idx_ai_agent_alerts_created 
    ON public.ai_agent_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE public.ai_agent_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view ai_agent_alerts" ON public.ai_agent_alerts;
CREATE POLICY "Users can view ai_agent_alerts" 
    ON public.ai_agent_alerts FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Service role can manage ai_agent_alerts" ON public.ai_agent_alerts;
CREATE POLICY "Service role can manage ai_agent_alerts" 
    ON public.ai_agent_alerts FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update ai_agent_alerts status" ON public.ai_agent_alerts;
CREATE POLICY "Authenticated users can update ai_agent_alerts status" 
    ON public.ai_agent_alerts FOR UPDATE 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

-- Ensure Realtime publication includes ai_agent_alerts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'ai_agent_alerts'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_alerts;
    END IF;
END $$;


-- ── 2. Core Audit Function (Runs in Cloud 24/7) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_kot_and_operations(
    p_branch_id UUID,
    p_auto_create_alerts BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
    v_company_id UUID;
    
    v_routing_errors JSONB := '[]'::jsonb;
    v_delayed_kots JSONB := '[]'::jsonb;
    v_pickup_delays JSONB := '[]'::jsonb;
    v_station_loads JSONB := '[]'::jsonb;
    v_sales_summary JSONB;
    
    v_rec RECORD;
    v_severity TEXT;
    v_alert_title TEXT;
    v_alert_msg TEXT;
    v_elapsed_mins NUMERIC;
    
    -- Sales & Order metrics
    v_total_orders INT := 0;
    v_total_sales NUMERIC(14,2) := 0;
    v_void_orders INT := 0;
    v_void_value NUMERIC(14,2) := 0;
    v_void_rate NUMERIC(5,2) := 0;
    v_unpaid_orders INT := 0;
    v_active_tables INT := 0;
    v_void_spike BOOLEAN := false;
    v_recent_voids INT := 0;
BEGIN
    -- Get company_id from branch
    SELECT company_id INTO v_company_id FROM public.branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM public.companies LIMIT 1;
    END IF;

    -- ── A. AUDIT KOT DELAYS (> 15m Warning, > 25m Critical) ───────────────────
    FOR v_rec IN 
        SELECT 
            kt.id AS kot_id,
            kt.kot_number,
            kt.order_id,
            kt.kitchen_id,
            k.name AS kitchen_name,
            kt.status AS kot_status,
            kt.created_at,
            o.order_number,
            o.order_type,
            o.table_number,
            ROUND(EXTRACT(EPOCH FROM (v_now - kt.created_at)) / 60.0, 1) AS elapsed_mins,
            COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'name', COALESCE(mi.name, 'Item'), 
                    'qty', COALESCE(oi.quantity, 1)
                ))
                FROM public.order_items oi
                LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
                WHERE oi.order_id = kt.order_id 
                  AND (oi.kitchen_id = kt.kitchen_id OR oi.kitchen_id IS NULL)
                ), '[]'::jsonb
            ) AS items
        FROM public.kot_tickets kt
        JOIN public.orders o ON o.id = kt.order_id
        LEFT JOIN public.kitchens k ON k.id = kt.kitchen_id
        WHERE o.branch_id = p_branch_id
          AND kt.status IN ('created', 'pending', 'preparing', 'queued')
          AND kt.created_at >= (v_now - INTERVAL '12 hours')
          AND EXTRACT(EPOCH FROM (v_now - kt.created_at)) / 60.0 >= 15.0
        ORDER BY kt.created_at ASC
    LOOP
        v_elapsed_mins := v_rec.elapsed_mins;
        IF v_elapsed_mins >= 25.0 THEN
            v_severity := 'critical';
            v_alert_title := '🚨 Critical KOT Delay: ' || COALESCE(v_rec.kitchen_name, 'Kitchen') || ' (' || v_elapsed_mins || ' min)';
        ELSE
            v_severity := 'warning';
            v_alert_title := '⚠️ KOT Delay: ' || COALESCE(v_rec.kitchen_name, 'Kitchen') || ' (' || v_elapsed_mins || ' min)';
        END IF;

        v_alert_msg := 'Order #' || COALESCE(v_rec.order_number, 'N/A') || 
                       ' (Table: ' || COALESCE(v_rec.table_number, 'Takeaway') || 
                       ') has been preparing for ' || v_elapsed_mins || ' minutes at ' || 
                       COALESCE(v_rec.kitchen_name, 'Kitchen') || '.';

        v_delayed_kots := v_delayed_kots || jsonb_build_object(
            'kot_id', v_rec.kot_id,
            'kot_number', v_rec.kot_number,
            'order_id', v_rec.order_id,
            'order_number', v_rec.order_number,
            'kitchen_id', v_rec.kitchen_id,
            'kitchen_name', v_rec.kitchen_name,
            'table_number', v_rec.table_number,
            'order_type', v_rec.order_type,
            'elapsed_minutes', v_elapsed_mins,
            'severity', v_severity,
            'status', v_rec.kot_status,
            'items', v_rec.items
        );

        -- Auto create alert in ai_agent_alerts if enabled and not already alerted in last 10 minutes
        IF p_auto_create_alerts THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.ai_agent_alerts 
                WHERE branch_id = p_branch_id 
                  AND alert_type = 'prep_delay' 
                  AND (metadata->>'kot_id')::text = v_rec.kot_id::text
                  AND is_resolved = false
                  AND created_at >= (v_now - INTERVAL '10 minutes')
            ) THEN
                INSERT INTO public.ai_agent_alerts (
                    branch_id, company_id, agent_type, alert_type, severity, title, message, metadata
                ) VALUES (
                    p_branch_id, v_company_id, 'kot_operations', 'prep_delay', v_severity, v_alert_title, v_alert_msg,
                    jsonb_build_object(
                        'kot_id', v_rec.kot_id,
                        'order_id', v_rec.order_id,
                        'kitchen_id', v_rec.kitchen_id,
                        'kitchen_name', v_rec.kitchen_name,
                        'elapsed_minutes', v_elapsed_mins,
                        'table_number', v_rec.table_number,
                        'order_number', v_rec.order_number
                    )
                );

                -- Also insert into manager_alerts for unified manager notification
                INSERT INTO public.manager_alerts (
                    branch_id, alert_type, severity, title, body, ref_type, ref_id
                ) VALUES (
                    p_branch_id, 'kot_delay', v_severity, v_alert_title, v_alert_msg, 'kot_ticket', v_rec.kot_id
                );
            END IF;
        END IF;
    END LOOP;

    -- ── B. AUDIT PICKUP DELAYS (Status = 'ready' for > 5 mins) ───────────────
    FOR v_rec IN 
        SELECT 
            kt.id AS kot_id,
            kt.kot_number,
            kt.order_id,
            kt.kitchen_id,
            k.name AS kitchen_name,
            o.order_number,
            o.table_number,
            o.waiter_id,
            ROUND(EXTRACT(EPOCH FROM (v_now - kt.updated_at)) / 60.0, 1) AS elapsed_mins
        FROM public.kot_tickets kt
        JOIN public.orders o ON o.id = kt.order_id
        LEFT JOIN public.kitchens k ON k.id = kt.kitchen_id
        WHERE o.branch_id = p_branch_id
          AND kt.status = 'ready'
          AND kt.updated_at >= (v_now - INTERVAL '6 hours')
          AND EXTRACT(EPOCH FROM (v_now - kt.updated_at)) / 60.0 >= 5.0
        ORDER BY kt.updated_at ASC
    LOOP
        v_elapsed_mins := v_rec.elapsed_mins;
        v_alert_title := '🛎️ Food Ready — Pickup Delay (' || v_elapsed_mins || ' min)';
        v_alert_msg := 'Order #' || COALESCE(v_rec.order_number, 'N/A') || 
                       ' (Table: ' || COALESCE(v_rec.table_number, 'N/A') || 
                       ') ready at ' || COALESCE(v_rec.kitchen_name, 'Pass') || 
                       ' but not picked up for ' || v_elapsed_mins || ' minutes.';

        v_pickup_delays := v_pickup_delays || jsonb_build_object(
            'kot_id', v_rec.kot_id,
            'order_id', v_rec.order_id,
            'order_number', v_rec.order_number,
            'kitchen_id', v_rec.kitchen_id,
            'kitchen_name', v_rec.kitchen_name,
            'table_number', v_rec.table_number,
            'elapsed_minutes', v_elapsed_mins
        );

        IF p_auto_create_alerts THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.ai_agent_alerts 
                WHERE branch_id = p_branch_id 
                  AND alert_type = 'pickup_delay' 
                  AND (metadata->>'kot_id')::text = v_rec.kot_id::text
                  AND is_resolved = false
                  AND created_at >= (v_now - INTERVAL '5 minutes')
            ) THEN
                INSERT INTO public.ai_agent_alerts (
                    branch_id, company_id, agent_type, alert_type, severity, title, message, metadata
                ) VALUES (
                    p_branch_id, v_company_id, 'kot_operations', 'pickup_delay', 'warning', v_alert_title, v_alert_msg,
                    jsonb_build_object(
                        'kot_id', v_rec.kot_id,
                        'order_id', v_rec.order_id,
                        'kitchen_id', v_rec.kitchen_id,
                        'table_number', v_rec.table_number,
                        'elapsed_minutes', v_elapsed_mins
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- ── C. AUDIT KOT ROUTING INTEGRITY ───────────────────────────────────────
    -- Check order items of active orders that lack a valid KOT ticket
    FOR v_rec IN 
        SELECT 
            oi.id AS order_item_id,
            oi.order_id,
            o.order_number,
            oi.menu_item_id,
            mi.name AS item_name,
            mi.category_id,
            mi.kitchen_id AS direct_kitchen_id,
            ksm.kitchen_id AS map_kitchen_id,
            COALESCE(oi.kitchen_id, mi.kitchen_id, ksm.kitchen_id) AS expected_kitchen_id,
            k.name AS target_kitchen_name
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN public.kitchen_subcategory_map ksm 
            ON ksm.subcategory_id = mi.sub_category_id AND ksm.branch_id = p_branch_id AND ksm.is_active = true
        LEFT JOIN public.kitchens k 
            ON k.id = COALESCE(oi.kitchen_id, mi.kitchen_id, ksm.kitchen_id)
        WHERE o.branch_id = p_branch_id
          AND o.created_at >= (v_now - INTERVAL '6 hours')
          AND o.status IN ('pending', 'confirmed', 'in_progress', 'ready')
          AND NOT EXISTS (
              SELECT 1 FROM public.kot_tickets kt 
              WHERE kt.order_id = o.id 
                AND kt.kitchen_id = COALESCE(oi.kitchen_id, mi.kitchen_id, ksm.kitchen_id)
                AND kt.status != 'cancelled'
          )
        LIMIT 20
    LOOP
        v_alert_title := '⚠️ KOT Routing Missing: ' || COALESCE(v_rec.item_name, 'Item');
        v_alert_msg := 'Order #' || COALESCE(v_rec.order_number, 'N/A') || ' item "' || 
                       COALESCE(v_rec.item_name, 'Item') || '" has not reached ' || 
                       COALESCE(v_rec.target_kitchen_name, 'its assigned Kitchen Display') || '.';

        v_routing_errors := v_routing_errors || jsonb_build_object(
            'order_item_id', v_rec.order_item_id,
            'order_id', v_rec.order_id,
            'order_number', v_rec.order_number,
            'item_name', v_rec.item_name,
            'expected_kitchen_id', v_rec.expected_kitchen_id,
            'expected_kitchen_name', v_rec.target_kitchen_name
        );

        IF p_auto_create_alerts AND v_rec.expected_kitchen_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.ai_agent_alerts 
                WHERE branch_id = p_branch_id 
                  AND alert_type = 'routing_error' 
                  AND (metadata->>'order_item_id')::text = v_rec.order_item_id::text
                  AND is_resolved = false
            ) THEN
                INSERT INTO public.ai_agent_alerts (
                    branch_id, company_id, agent_type, alert_type, severity, title, message, metadata
                ) VALUES (
                    p_branch_id, v_company_id, 'kot_operations', 'routing_error', 'warning', v_alert_title, v_alert_msg,
                    jsonb_build_object(
                        'order_item_id', v_rec.order_item_id,
                        'order_id', v_rec.order_id,
                        'item_name', v_rec.item_name,
                        'expected_kitchen_id', v_rec.expected_kitchen_id,
                        'target_kitchen_name', v_rec.target_kitchen_name
                    )
                );
            END IF;
        END IF;
    END LOOP;

    -- ── D. STATION LOAD ANALYSIS ─────────────────────────────────────────────
    FOR v_rec IN 
        SELECT 
            k.id AS kitchen_id,
            k.name AS kitchen_name,
            COUNT(kt.id) FILTER (WHERE kt.status IN ('created', 'pending', 'preparing', 'queued')) AS active_tickets,
            COUNT(kt.id) FILTER (WHERE kt.status IN ('created', 'pending', 'preparing') AND EXTRACT(EPOCH FROM (v_now - kt.created_at))/60.0 >= 15.0) AS delayed_tickets,
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (kt.completed_at - kt.created_at))/60.0) 
                FILTER (WHERE kt.status = 'completed' AND kt.completed_at >= v_today_start), 1), 0) AS avg_prep_time_today
        FROM public.kitchens k
        LEFT JOIN public.kot_tickets kt 
            ON kt.kitchen_id = k.id 
           AND kt.created_at >= (v_now - INTERVAL '12 hours')
        WHERE k.branch_id = p_branch_id
          AND k.is_active = true
        GROUP BY k.id, k.name
        ORDER BY active_tickets DESC
    LOOP
        v_station_loads := v_station_loads || jsonb_build_object(
            'kitchen_id', v_rec.kitchen_id,
            'kitchen_name', v_rec.kitchen_name,
            'active_tickets', v_rec.active_tickets,
            'delayed_tickets', v_rec.delayed_tickets,
            'avg_prep_time_today', v_rec.avg_prep_time_today,
            'is_overloaded', (v_rec.active_tickets >= 6 OR v_rec.delayed_tickets >= 2)
        );
    END LOOP;

    -- ── E. LIVE SALES & VOID ANOMALY AUDIT ───────────────────────────────────
    SELECT 
        COUNT(*) AS total_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('completed', 'paid')), 0) AS sales_sum,
        COUNT(*) FILTER (WHERE status IN ('void', 'cancelled')) AS void_count,
        COALESCE(SUM(total_amount) FILTER (WHERE status IN ('void', 'cancelled')), 0) AS void_sum,
        COUNT(*) FILTER (WHERE payment_status = 'pending' AND status NOT IN ('void', 'cancelled')) AS unpaid_count,
        COUNT(DISTINCT table_id) FILTER (WHERE status IN ('pending', 'confirmed', 'in_progress', 'ready')) AS active_tables_count,
        COUNT(*) FILTER (WHERE status IN ('void', 'cancelled') AND created_at >= (v_now - INTERVAL '2 hours')) AS recent_voids_count
    INTO 
        v_total_orders, v_total_sales, v_void_orders, v_void_value, v_unpaid_orders, v_active_tables, v_recent_voids
    FROM public.orders
    WHERE branch_id = p_branch_id
      AND created_at >= v_today_start;

    IF (v_total_orders + v_void_orders) > 0 THEN
        v_void_rate := ROUND((v_void_orders::NUMERIC / (v_total_orders + v_void_orders)::NUMERIC) * 100.0, 2);
    END IF;

    -- Void spike condition: >= 3 voids in last 2 hours OR void_rate > 8%
    IF v_recent_voids >= 3 OR (v_total_orders >= 10 AND v_void_rate > 8.0) THEN
        v_void_spike := true;
        IF p_auto_create_alerts THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.ai_agent_alerts 
                WHERE branch_id = p_branch_id 
                  AND alert_type = 'void_spike' 
                  AND is_resolved = false
                  AND created_at >= (v_now - INTERVAL '1 hour')
            ) THEN
                INSERT INTO public.ai_agent_alerts (
                    branch_id, company_id, agent_type, alert_type, severity, title, message, metadata
                ) VALUES (
                    p_branch_id, v_company_id, 'kot_operations', 'void_spike', 'critical',
                    '🚨 Suspicious Void/Cancellation Spike Detected',
                    'High cancellation volume detected (' || v_recent_voids || ' voided orders in the last 2 hours, total void value: LKR ' || v_void_value || '). Audit required.',
                    jsonb_build_object(
                        'recent_voids_2h', v_recent_voids,
                        'total_voids_today', v_void_orders,
                        'void_value', v_void_value,
                        'void_rate', v_void_rate
                    )
                );
            END IF;
        END IF;
    END IF;

    v_sales_summary := jsonb_build_object(
        'today_orders_count', v_total_orders,
        'today_sales_total', v_total_sales,
        'today_void_count', v_void_orders,
        'today_void_value', v_void_value,
        'void_percentage', v_void_rate,
        'recent_voids_2h', v_recent_voids,
        'unpaid_active_orders', v_unpaid_orders,
        'active_tables_count', v_active_tables,
        'is_void_spike', v_void_spike
    );

    -- ── RETURN COMPREHENSIVE AUDIT RESULT ────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'audit_timestamp', v_now,
        'branch_id', p_branch_id,
        'delayed_kots', v_delayed_kots,
        'pickup_delays', v_pickup_delays,
        'routing_errors', v_routing_errors,
        'station_loads', v_station_loads,
        'sales_summary', v_sales_summary,
        'summary', jsonb_build_object(
            'delayed_kot_count', jsonb_array_length(v_delayed_kots),
            'pickup_delay_count', jsonb_array_length(v_pickup_delays),
            'routing_error_count', jsonb_array_length(v_routing_errors),
            'health_score', CASE 
                WHEN jsonb_array_length(v_delayed_kots) = 0 AND NOT v_void_spike THEN 100
                WHEN jsonb_array_length(v_delayed_kots) <= 2 AND NOT v_void_spike THEN 85
                WHEN jsonb_array_length(v_delayed_kots) <= 5 THEN 65
                ELSE 40
            END
        )
    );
END;
$$;


-- ── 3. Helper Function: Auto Reroute KOT to another station ──────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_reroute_kot(
    p_kot_id UUID,
    p_target_kitchen_id UUID,
    p_reason TEXT DEFAULT 'AI rebalancing'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_kot RECORD;
    v_target_kitchen_name TEXT;
BEGIN
    SELECT * INTO v_kot FROM public.kot_tickets WHERE id = p_kot_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'KOT ticket not found');
    END IF;

    SELECT name INTO v_target_kitchen_name FROM public.kitchens WHERE id = p_target_kitchen_id;

    -- Update the ticket
    UPDATE public.kot_tickets 
    SET kitchen_id = p_target_kitchen_id,
        updated_at = NOW()
    WHERE id = p_kot_id;

    -- Also update order_items associated
    UPDATE public.order_items 
    SET kitchen_id = p_target_kitchen_id
    WHERE order_id = v_kot.order_id 
      AND (kitchen_id = v_kot.kitchen_id OR kitchen_id IS NULL);

    -- Log action in ai_agent_alerts as resolved re-route
    INSERT INTO public.ai_agent_alerts (
        branch_id, agent_type, alert_type, severity, title, message, metadata, is_resolved
    ) VALUES (
        (SELECT branch_id FROM public.orders WHERE id = v_kot.order_id),
        'kot_operations', 'station_overload', 'info',
        '🔄 Ticket Re-routed to ' || COALESCE(v_target_kitchen_name, 'Station'),
        'KOT #' || COALESCE(v_kot.kot_number::text, p_kot_id::text) || ' re-routed to ' || 
        COALESCE(v_target_kitchen_name, 'Station') || '. Reason: ' || p_reason,
        jsonb_build_object('kot_id', p_kot_id, 'target_kitchen_id', p_target_kitchen_id, 'reason', p_reason),
        true
    );

    RETURN jsonb_build_object(
        'success', true, 
        'kot_id', p_kot_id, 
        'new_kitchen_id', p_target_kitchen_id,
        'new_kitchen_name', v_target_kitchen_name
    );
END;
$$;

-- Grant execution to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.fn_audit_kot_and_operations(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_reroute_kot(UUID, UUID, TEXT) TO authenticated, service_role;

-- ── 4. QR Order Guardian: Autonomous Self-Healing Engine ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_ai_auto_heal_qr_orders(
    p_branch_id UUID,
    p_timeout_seconds INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_cutoff TIMESTAMPTZ := v_now - (p_timeout_seconds || ' seconds')::INTERVAL;
    v_default_kitchen UUID;
    v_healed_orders JSONB := '[]'::jsonb;
    v_order RECORD;
    v_item RECORD;
    v_k_rec RECORD;
    v_kot_id UUID;
    v_company_id UUID;
    v_target_kitchen UUID;
    v_healed_count INT := 0;
BEGIN
    SELECT company_id INTO v_company_id FROM public.branches WHERE id = p_branch_id;
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM public.companies LIMIT 1;
    END IF;

    -- Get default kitchen for fallback
    SELECT id INTO v_default_kitchen FROM public.kitchens 
    WHERE branch_id = p_branch_id AND is_active = true 
    ORDER BY created_at ASC LIMIT 1;

    -- ── 1. SCAN PENDING_WAITER QR ORDERS OLDER THAN TIMEOUT (Default: 90s) ───
    FOR v_order IN
        SELECT o.id, o.order_number, o.table_id, o.table_number, o.created_at, o.subtotal,
               ROUND(EXTRACT(EPOCH FROM (v_now - o.created_at))) AS elapsed_seconds
        FROM public.orders o
        WHERE o.branch_id = p_branch_id
          AND o.status = 'pending_waiter'
          AND (o.order_source = 'qr' OR o.table_id IS NOT NULL)
          AND o.created_at <= v_cutoff
          AND o.created_at >= (v_now - INTERVAL '6 hours')
        ORDER BY o.created_at ASC
    LOOP
        -- Promote order to confirmed
        UPDATE public.orders
        SET status = 'confirmed',
            accepted_at = v_now,
            updated_at = v_now,
            notes = COALESCE(notes, '') || ' [AI Auto-Dispatched: Waiter 90s timeout]'
        WHERE id = v_order.id;

        -- Ensure all order items have kitchen_id resolved
        FOR v_item IN
            SELECT oi.id, oi.menu_item_id, oi.kitchen_id, mi.category_id, mi.sub_category_id, mi.name AS item_name
            FROM public.order_items oi
            LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = v_order.id
        LOOP
            IF v_item.kitchen_id IS NULL THEN
                -- Try to find kitchen from subcategory map
                SELECT ksm.kitchen_id INTO v_target_kitchen
                FROM public.kitchen_subcategory_map ksm
                WHERE ksm.subcategory_id = v_item.sub_category_id 
                  AND ksm.branch_id = p_branch_id 
                  AND ksm.is_active = true
                LIMIT 1;

                IF v_target_kitchen IS NULL THEN
                    v_target_kitchen := v_default_kitchen;
                END IF;

                UPDATE public.order_items
                SET kitchen_id = v_target_kitchen, status = 'queued'
                WHERE id = v_item.id;
            END IF;
        END LOOP;

        -- Generate missing KOT tickets for each distinct kitchen_id in this order
        FOR v_k_rec IN
            SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
            FROM public.order_items
            WHERE order_id = v_order.id
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.kot_tickets
                WHERE order_id = v_order.id AND kitchen_id = v_k_rec.kit_id AND status != 'cancelled'
            ) THEN
                INSERT INTO public.kot_tickets (order_id, kitchen_id, status, created_at, updated_at)
                VALUES (v_order.id, v_k_rec.kit_id, 'created', v_now, v_now)
                RETURNING id INTO v_kot_id;
            END IF;
        END LOOP;

        -- Log audit event in order_status_events if exists
        BEGIN
            INSERT INTO public.order_status_events (
                order_id, old_status, new_status, event_code, payload
            ) VALUES (
                v_order.id, 'pending_waiter', 'confirmed', 'AI_AUTO_HEALED_QR_TIMEOUT',
                jsonb_build_object(
                    'auto_healed', true,
                    'elapsed_seconds', v_order.elapsed_seconds,
                    'reason', 'No waiter response within ' || p_timeout_seconds || ' seconds'
                )
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- safe if table doesn't match
        END;

        -- Create realtime alert in ai_agent_alerts
        INSERT INTO public.ai_agent_alerts (
            branch_id, company_id, agent_type, alert_type, severity, title, message, metadata, is_resolved
        ) VALUES (
            p_branch_id, v_company_id, 'kot_operations', 'order_auto_recovered', 'info',
            '🤖 AI Auto-Dispatched Order #' || COALESCE(v_order.order_number, 'N/A'),
            'Table ' || COALESCE(v_order.table_number, 'N/A') || ' QR order was auto-confirmed and dispatched to kitchen after ' || v_order.elapsed_seconds || 's without waiter response.',
            jsonb_build_object(
                'order_id', v_order.id,
                'order_number', v_order.order_number,
                'table_number', v_order.table_number,
                'elapsed_seconds', v_order.elapsed_seconds,
                'auto_healed', true
            ),
            true
        );

        -- Also notify manager alerts
        INSERT INTO public.manager_alerts (
            branch_id, alert_type, severity, title, body, ref_type, ref_id
        ) VALUES (
            p_branch_id, 'qr_auto_dispatched', 'info',
            '🤖 Table ' || COALESCE(v_order.table_number, 'N/A') || ' Auto-Dispatched to Kitchen',
            'QR Order #' || COALESCE(v_order.order_number, 'N/A') || ' was auto-confirmed by AI Agent (no waiter accepted in ' || v_order.elapsed_seconds || 's).',
            'order', v_order.id
        );

        v_healed_count := v_healed_count + 1;
        v_healed_orders := v_healed_orders || jsonb_build_object(
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'table_number', v_order.table_number,
            'elapsed_seconds', v_order.elapsed_seconds
        );
    END LOOP;

    -- ── 2. REPAIR ANY ACTIVE QR ORDERS MISSING KOT TICKETS (ORPHANED ITEMS) ─
    FOR v_order IN
        SELECT DISTINCT o.id, o.order_number, o.table_number
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.branch_id = p_branch_id
          AND o.status IN ('confirmed', 'in_progress', 'ready')
          AND (o.order_source = 'qr' OR o.table_id IS NOT NULL)
          AND o.created_at >= (v_now - INTERVAL '6 hours')
          AND NOT EXISTS (
              SELECT 1 FROM public.kot_tickets kt
              WHERE kt.order_id = o.id AND kt.kitchen_id = COALESCE(oi.kitchen_id, v_default_kitchen) AND kt.status != 'cancelled'
          )
    LOOP
        -- Auto create missing KOT ticket
        FOR v_k_rec IN
            SELECT DISTINCT COALESCE(kitchen_id, v_default_kitchen) AS kit_id
            FROM public.order_items
            WHERE order_id = v_order.id
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.kot_tickets
                WHERE order_id = v_order.id AND kitchen_id = v_k_rec.kit_id AND status != 'cancelled'
            ) THEN
                INSERT INTO public.kot_tickets (order_id, kitchen_id, status, created_at, updated_at)
                VALUES (v_order.id, v_k_rec.kit_id, 'created', v_now, v_now)
                RETURNING id INTO v_kot_id;

                v_healed_count := v_healed_count + 1;
                v_healed_orders := v_healed_orders || jsonb_build_object(
                    'order_id', v_order.id,
                    'order_number', v_order.order_number,
                    'table_number', v_order.table_number,
                    'action', 'missing_kot_created',
                    'kitchen_id', v_k_rec.kit_id
                );
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', v_now,
        'healed_count', v_healed_count,
        'healed_orders', v_healed_orders
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_ai_auto_heal_qr_orders(UUID, INT) TO authenticated, service_role;

-- ── 5. Omnichannel 8-Stage Order Flow Pipeline Watchdog ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_omnichannel_pipeline(
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
    v_company_id UUID;
    
    -- Pipeline Stages
    v_s1_broadcast_orders INT := 0;
    v_s2_pending_waiter INT := 0;
    v_s3_kitchen_preparing INT := 0;
    v_s4_ready_for_pickup INT := 0;
    v_s5_billing_discrepancies INT := 0;
    v_s6_avg_lead_time_mins NUMERIC(6,1) := 0;
    v_s7_late_orders_count INT := 0;
    v_s8_healed_orders_count INT := 0;

    v_late_orders JSONB := '[]'::jsonb;
    v_billing_errors JSONB := '[]'::jsonb;
    v_source_breakdown JSONB;
    v_rec RECORD;
BEGIN
    SELECT company_id INTO v_company_id FROM public.branches WHERE id = p_branch_id;

    -- Stage 1 & 2: Active incoming orders
    SELECT 
        COUNT(*) FILTER (WHERE status = 'pending_waiter'),
        COUNT(*) FILTER (WHERE status IN ('created', 'pending'))
    INTO v_s2_pending_waiter, v_s1_broadcast_orders
    FROM public.orders
    WHERE branch_id = p_branch_id AND created_at >= (v_now - INTERVAL '6 hours');

    -- Stage 3: Kitchen preparation
    SELECT COUNT(*) INTO v_s3_kitchen_preparing
    FROM public.kot_tickets kt
    JOIN public.orders o ON o.id = kt.order_id
    WHERE o.branch_id = p_branch_id AND kt.status IN ('created', 'pending', 'preparing', 'queued');

    -- Stage 4: Food Ready on Pass
    SELECT COUNT(*) INTO v_s4_ready_for_pickup
    FROM public.kot_tickets kt
    JOIN public.orders o ON o.id = kt.order_id
    WHERE o.branch_id = p_branch_id AND kt.status = 'ready';

    -- Stage 5: Billing integrity check (item sum vs order subtotal)
    FOR v_rec IN
        SELECT o.id, o.order_number, o.subtotal, 
               COALESCE(SUM(oi.total_price), 0) AS calculated_items_total
        FROM public.orders o
        LEFT JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.branch_id = p_branch_id 
          AND o.created_at >= v_today_start
          AND o.status NOT IN ('void', 'cancelled')
        GROUP BY o.id, o.order_number, o.subtotal
        HAVING ABS(COALESCE(o.subtotal, 0) - COALESCE(SUM(oi.total_price), 0)) > 1.00
        LIMIT 10
    LOOP
        v_s5_billing_discrepancies := v_s5_billing_discrepancies + 1;
        v_billing_errors := v_billing_errors || jsonb_build_object(
            'order_id', v_rec.id,
            'order_number', v_rec.order_number,
            'order_subtotal', v_rec.subtotal,
            'items_sum', v_rec.calculated_items_total,
            'difference', v_rec.subtotal - v_rec.calculated_items_total
        );
    END LOOP;

    -- Stage 6: Average End-to-End Fulfillment Lead Time (Created to Paid/Completed)
    SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60.0), 1), 0)
    INTO v_s6_avg_lead_time_mins
    FROM public.orders
    WHERE branch_id = p_branch_id 
      AND created_at >= v_today_start
      AND status IN ('completed', 'paid');

    -- Stage 7: Late Order Escalation (> 20 mins from order placement and still not served)
    FOR v_rec IN
        SELECT o.id, o.order_number, o.table_number, o.order_source, o.status,
               ROUND(EXTRACT(EPOCH FROM (v_now - o.created_at))/60.0, 1) AS elapsed_mins
        FROM public.orders o
        WHERE o.branch_id = p_branch_id
          AND o.status IN ('pending', 'pending_waiter', 'confirmed', 'in_progress', 'ready')
          AND o.created_at >= (v_now - INTERVAL '6 hours')
          AND EXTRACT(EPOCH FROM (v_now - o.created_at))/60.0 >= 20.0
        ORDER BY o.created_at ASC
    LOOP
        v_s7_late_orders_count := v_s7_late_orders_count + 1;
        v_late_orders := v_late_orders || jsonb_build_object(
            'order_id', v_rec.id,
            'order_number', v_rec.order_number,
            'table_number', v_rec.table_number,
            'order_source', v_rec.order_source,
            'elapsed_minutes', v_rec.elapsed_mins,
            'status', v_rec.status
        );

        -- Escalate to manager_alerts if not already escalated in last 15 minutes
        IF NOT EXISTS (
            SELECT 1 FROM public.manager_alerts
            WHERE branch_id = p_branch_id 
              AND alert_type = 'order_lead_time_exceeded'
              AND ref_id = v_rec.id
              AND created_at >= (v_now - INTERVAL '15 minutes')
        ) THEN
            INSERT INTO public.manager_alerts (
                branch_id, alert_type, severity, title, body, ref_type, ref_id
            ) VALUES (
                p_branch_id, 'order_lead_time_exceeded', 'critical',
                '🚨 Order #' || COALESCE(v_rec.order_number, 'N/A') || ' Exceeded 20m Lead Time',
                'Order from ' || COALESCE(v_rec.order_source, 'Table') || ' (Table: ' || COALESCE(v_rec.table_number, 'Takeaway') || ') has taken ' || v_rec.elapsed_mins || ' minutes. Floor manager intervention required.',
                'order', v_rec.id
            );
        END IF;
    END LOOP;

    -- Stage 8: Auto-healed count today
    SELECT COUNT(*) INTO v_s8_healed_orders_count
    FROM public.ai_agent_alerts
    WHERE branch_id = p_branch_id 
      AND alert_type = 'order_auto_recovered'
      AND created_at >= v_today_start;

    -- Source breakdown
    SELECT jsonb_build_object(
        'qr_orders', COUNT(*) FILTER (WHERE order_source = 'qr'),
        'pos_orders', COUNT(*) FILTER (WHERE order_source = 'pos' OR order_source IS NULL),
        'website_orders', COUNT(*) FILTER (WHERE order_source = 'website')
    ) INTO v_source_breakdown
    FROM public.orders
    WHERE branch_id = p_branch_id AND created_at >= v_today_start;

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', v_now,
        'pipeline_health', CASE 
            WHEN v_s7_late_orders_count = 0 AND v_s5_billing_discrepancies = 0 THEN 'optimal'
            WHEN v_s7_late_orders_count <= 2 THEN 'warning'
            ELSE 'critical'
        END,
        'stages', jsonb_build_object(
            'stage_1_broadcast_orders', v_s1_broadcast_orders,
            'stage_2_pending_waiter', v_s2_pending_waiter,
            'stage_3_kitchen_preparing', v_s3_kitchen_preparing,
            'stage_4_ready_on_pass', v_s4_ready_for_pickup,
            'stage_5_billing_discrepancies', v_s5_billing_discrepancies,
            'stage_6_avg_lead_time_mins', v_s6_avg_lead_time_mins,
            'stage_7_late_orders_count', v_s7_late_orders_count,
            'stage_8_auto_healed_count', v_s8_healed_orders_count
        ),
        'late_orders', v_late_orders,
        'billing_errors', v_billing_errors,
        'sources', v_source_breakdown
    );
END;
$$;

-- ── 6. Customer Menu Context Provider for AI Assistant ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_customer_menu_context(
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_items JSONB;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', mi.id,
        'name', mi.name,
        'category', COALESCE(c.name, 'General'),
        'price', mi.base_price,
        'is_veg', COALESCE(mi.is_veg, false),
        'is_available', COALESCE(mi.is_available, true),
        'image_url', mi.image_url
    ))
    INTO v_items
    FROM public.menu_items mi
    LEFT JOIN public.categories c ON c.id = mi.category_id
    WHERE mi.is_available = true
    LIMIT 60;

    RETURN COALESCE(v_items, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_audit_omnichannel_pipeline(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_customer_menu_context(UUID) TO authenticated, anon, service_role;


