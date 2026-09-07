-- ============================================================================
-- Seven Waves ERP: Unassigned Waiter Escalation & Real-Time ERP Reporting Audit
-- ============================================================================

-- Ensure ai_agent_alerts exists and has resolution_notes column
CREATE TABLE IF NOT EXISTS public.ai_agent_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID,
  alert_type TEXT,
  severity TEXT DEFAULT 'warning',
  title TEXT,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_agent_alerts ADD COLUMN IF NOT EXISTS resolution_notes TEXT;

-- 1. Function: Atomically assign a waiter to an order from Manager / Watchdog
CREATE OR REPLACE FUNCTION public.fn_assign_order_waiter(
  p_order_id UUID,
  p_waiter_profile_id UUID,
  p_assigned_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id UUID;
  v_waiter_name TEXT;
  v_order_number TEXT;
  v_table_number TEXT;
  v_branch_id UUID;
  v_order_status TEXT;
BEGIN
  -- 1. Resolve waiter profile and linked user profile
  SELECT 
    COALESCE(e.profile_id, wp.id),
    COALESCE(wp.display_name, e.full_name, 'Staff')
  INTO v_profile_id, v_waiter_name
  FROM waiter_profiles wp
  LEFT JOIN employees e ON e.id = wp.employee_id
  WHERE wp.id = p_waiter_profile_id;

  IF v_profile_id IS NULL THEN
    -- Try direct profile lookup in case profile_id was passed directly
    SELECT id, full_name INTO v_profile_id, v_waiter_name
    FROM profiles
    WHERE id = p_waiter_profile_id;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Waiter profile not found');
  END IF;

  -- 2. Fetch order metadata
  SELECT order_number, table_number, branch_id, status
  INTO v_order_number, v_table_number, v_branch_id, v_order_status
  FROM orders
  WHERE id = p_order_id;

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- 3. Update order: set both assigned_waiter_id and waiter_id
  UPDATE orders
  SET 
    assigned_waiter_id = v_profile_id,
    waiter_id = v_profile_id,
    accepted_at = COALESCE(accepted_at, NOW()),
    updated_at = NOW()
  WHERE id = p_order_id;

  -- 4. Send notification to the assigned waiter
  INSERT INTO waiter_notifications (
    waiter_profile_id,
    notification_type,
    title,
    body,
    payload,
    is_read,
    created_at
  ) VALUES (
    p_waiter_profile_id,
    'order_assigned',
    '🛎️ Order Assigned by Manager',
    format('Order #%s (Table %s) has been assigned to you. Please supervise and serve when ready.', 
           COALESCE(v_order_number, 'N/A'), 
           COALESCE(v_table_number, 'N/A')),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order_number,
      'table_number', v_table_number,
      'assigned_by', p_assigned_by,
      'assigned_at', NOW()
    ),
    false,
    NOW()
  );

  -- 5. Mark any unassigned waiter alerts for this order as resolved
  UPDATE ai_agent_alerts
  SET 
    is_resolved = true,
    resolved_at = NOW(),
    resolution_notes = format('Assigned to waiter %s by manager', v_waiter_name)
  WHERE (metadata->>'order_id') = p_order_id::TEXT
    AND alert_type IN ('UNASSIGNED_WAITER', 'ORDER_SLA_BREACH', 'routing_error');

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'assigned_waiter_id', v_profile_id,
    'waiter_name', v_waiter_name,
    'message', format('Order #%s successfully assigned to %s', v_order_number, v_waiter_name)
  );
END;
$$;

-- 2. Function: Audit unassigned waiter orders across all channels (QR, Web, POS)
CREATE OR REPLACE FUNCTION public.fn_audit_unassigned_waiter_orders(
  p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unassigned JSONB := '[]'::JSONB;
  v_count INT := 0;
BEGIN
  SELECT 
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'order_id', o.id,
        'order_number', o.order_number,
        'table_number', o.table_number,
        'order_source', COALESCE(o.order_source, 'pos'),
        'order_type', o.order_type,
        'status', o.status,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'elapsed_minutes', ROUND(EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 60)
      ) ORDER BY o.created_at ASC
    ), '[]'::JSONB),
    COUNT(*)
  INTO v_unassigned, v_count
  FROM orders o
  WHERE o.branch_id = p_branch_id
    AND o.created_at >= CURRENT_DATE
    AND o.assigned_waiter_id IS NULL 
    AND o.waiter_id IS NULL
    AND o.status IN ('pending_waiter', 'confirmed', 'in_progress', 'ready');

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'unassigned_count', v_count,
    'unassigned_orders', v_unassigned,
    'requires_manager_action', v_count > 0
  );
END;
$$;

-- 3. Function: Real-time ERP Reporting Integrity Audit
CREATE OR REPLACE FUNCTION public.fn_audit_erp_reporting_integrity(
  p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_orders INT := 0;
  v_assigned_orders INT := 0;
  v_unassigned_orders INT := 0;
  v_waiter_attribution_pct NUMERIC := 100.0;
  v_total_items INT := 0;
  v_items_with_kot INT := 0;
  v_kitchen_sync_pct NUMERIC := 100.0;
  v_qr_count INT := 0;
  v_pos_count INT := 0;
  v_web_count INT := 0;
BEGIN
  -- Total orders today
  SELECT COUNT(*) INTO v_total_orders
  FROM orders
  WHERE branch_id = p_branch_id AND created_at >= CURRENT_DATE;

  -- Waiter attribution counts
  SELECT 
    COUNT(*) FILTER (WHERE assigned_waiter_id IS NOT NULL OR waiter_id IS NOT NULL),
    COUNT(*) FILTER (WHERE assigned_waiter_id IS NULL AND waiter_id IS NULL AND status IN ('confirmed', 'in_progress', 'ready', 'completed', 'paid')),
    COUNT(*) FILTER (WHERE order_source = 'qr'),
    COUNT(*) FILTER (WHERE order_source = 'website'),
    COUNT(*) FILTER (WHERE order_source NOT IN ('qr', 'website') OR order_source IS NULL)
  INTO v_assigned_orders, v_unassigned_orders, v_qr_count, v_web_count, v_pos_count
  FROM orders
  WHERE branch_id = p_branch_id AND created_at >= CURRENT_DATE;

  IF v_total_orders > 0 THEN
    v_waiter_attribution_pct := ROUND(((v_assigned_orders::NUMERIC / v_total_orders::NUMERIC) * 100), 1);
  END IF;

  -- Kitchen KOT sync check
  SELECT COUNT(*) INTO v_total_items
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.branch_id = p_branch_id AND o.created_at >= CURRENT_DATE;

  SELECT COUNT(DISTINCT kti.order_item_id) INTO v_items_with_kot
  FROM kot_ticket_items kti
  JOIN kot_tickets kt ON kt.id = kti.kot_ticket_id
  WHERE kt.created_at >= CURRENT_DATE;

  IF v_total_items > 0 THEN
    v_kitchen_sync_pct := LEAST(100.0, ROUND(((v_items_with_kot::NUMERIC / v_total_items::NUMERIC) * 100), 1));
  END IF;

  RETURN jsonb_build_object(
    'branch_id', p_branch_id,
    'audit_timestamp', NOW(),
    'waiter_reports', jsonb_build_object(
      'total_orders', v_total_orders,
      'assigned_orders', v_assigned_orders,
      'unassigned_orders', v_unassigned_orders,
      'attribution_rate_pct', v_waiter_attribution_pct,
      'status', CASE WHEN v_unassigned_orders = 0 THEN 'OPTIMAL' ELSE 'ACTION_REQUIRED' END
    ),
    'kitchen_reports', jsonb_build_object(
      'total_items_ordered', v_total_items,
      'items_with_kot', v_items_with_kot,
      'station_sync_rate_pct', v_kitchen_sync_pct,
      'status', 'OPTIMAL'
    ),
    'channel_breakdown', jsonb_build_object(
      'qr_orders', v_qr_count,
      'pos_orders', v_pos_count,
      'web_orders', v_web_count
    ),
    'is_healthy', (v_unassigned_orders = 0 AND v_kitchen_sync_pct >= 95.0)
  );
END;
$$;
