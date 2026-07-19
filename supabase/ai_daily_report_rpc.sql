-- generate_daily_report RPC
-- Aggregates finance, operations, and HR metrics for a branch/date
-- and upserts into ai_daily_reports + ai_audit_checks.
-- Called by the AI System Audit page (manual) or a cron job (auto).

DROP FUNCTION IF EXISTS public.generate_daily_report(UUID, DATE, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.generate_daily_report(
  p_branch_id  UUID,
  p_date       DATE    DEFAULT CURRENT_DATE,
  p_report_type TEXT   DEFAULT 'end_of_day',
  p_user_id    UUID    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_report_id  UUID;
  v_day_start  TIMESTAMPTZ;
  v_day_end    TIMESTAMPTZ;

  -- Finance
  v_total_revenue  NUMERIC := 0;
  v_total_expenses NUMERIC := 0;
  v_total_orders   INT     := 0;
  v_paid_orders    INT     := 0;
  v_void_orders    INT     := 0;
  v_avg_order      NUMERIC := 0;
  v_cash           NUMERIC := 0;
  v_card           NUMERIC := 0;
  v_visa           NUMERIC := 0;
  v_master         NUMERIC := 0;
  v_qr             NUMERIC := 0;
  v_bank           NUMERIC := 0;
  v_credit         NUMERIC := 0;
  v_online         NUMERIC := 0;
  v_unposted_count INT     := 0;
  v_unposted_value NUMERIC := 0;

  -- HR
  v_scheduled INT := 0;
  v_present   INT := 0;
  v_absent    INT := 0;
  v_late      INT := 0;
  v_on_leave  INT := 0;

  -- Operations
  v_total_kots       INT     := 0;
  v_avg_kot_mins     NUMERIC := 0;
  v_tables_served    INT     := 0;
  v_delivery_orders  INT     := 0;
  v_takeaway_orders  INT     := 0;

  v_checks JSONB := '[]'::JSONB;
  v_flags  JSONB := '[]'::JSONB;

  -- temp for payment reconciliation
  v_invoice_total NUMERIC := 0;
  v_payment_total NUMERIC := 0;
  v_kot_rate      NUMERIC := 0;
BEGIN
  SELECT company_id INTO v_company_id FROM branches WHERE id = p_branch_id;

  v_day_start := p_date::TIMESTAMPTZ AT TIME ZONE 'UTC';
  v_day_end   := (p_date + 1)::TIMESTAMPTZ AT TIME ZONE 'UTC';

  -- ── FINANCE METRICS ──────────────────────────────────────────────────────

  SELECT
    COUNT(*) FILTER (WHERE status IN ('paid','completed')),
    COUNT(*) FILTER (WHERE status IN ('cancelled','void')),
    COUNT(*),
    COALESCE(SUM(total_amount) FILTER (WHERE status IN ('paid','completed')), 0)
  INTO v_paid_orders, v_void_orders, v_total_orders, v_total_revenue
  FROM orders
  WHERE branch_id = p_branch_id
    AND created_at >= v_day_start AND created_at < v_day_end;

  IF v_paid_orders > 0 THEN
    v_avg_order := v_total_revenue / v_paid_orders;
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) = 'cash'), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('card','credit card','debit card')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('visa')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('master','mastercard')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('qr','qr code','lankaqr')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('bank','bank transfer','direct bank transfer')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('credit','credit note')), 0),
    COALESCE(SUM(amount) FILTER (WHERE LOWER(payment_method) IN ('online','transfer')), 0)
  INTO v_cash, v_card, v_visa, v_master, v_qr, v_bank, v_credit, v_online
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE i.branch_id = p_branch_id
    AND p.created_at >= v_day_start AND p.created_at < v_day_end
    AND COALESCE(p.voided, false) = false;

  SELECT COUNT(*), COALESCE(SUM(o.total_amount), 0)
  INTO v_unposted_count, v_unposted_value
  FROM orders o
  LEFT JOIN finance_queue fq ON fq.order_id = o.id
  WHERE o.branch_id = p_branch_id
    AND o.status IN ('paid','completed')
    AND o.created_at >= v_day_start AND o.created_at < v_day_end
    AND (fq.id IS NULL OR fq.status NOT IN ('posted','completed'));

  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_expenses
    FROM expenses
    WHERE branch_id = p_branch_id AND expense_date = p_date;
  EXCEPTION WHEN undefined_table THEN
    v_total_expenses := 0;
  END;

  -- ── OPERATIONS METRICS ───────────────────────────────────────────────────

  SELECT COUNT(*) INTO v_total_kots
  FROM kot_tickets kt
  JOIN orders o ON o.id = kt.order_id
  WHERE o.branch_id = p_branch_id
    AND kt.created_at >= v_day_start AND kt.created_at < v_day_end;

  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 60), 0)
  INTO v_avg_kot_mins
  FROM kot_tickets kt
  JOIN orders o ON o.id = kt.order_id
  WHERE o.branch_id = p_branch_id
    AND kt.created_at >= v_day_start AND kt.created_at < v_day_end
    AND kt.completed_at IS NOT NULL;

  SELECT COUNT(DISTINCT o.table_id) INTO v_tables_served
  FROM orders o
  WHERE o.branch_id = p_branch_id
    AND o.status IN ('paid','completed')
    AND o.created_at >= v_day_start AND o.created_at < v_day_end
    AND o.table_id IS NOT NULL;

  SELECT
    COUNT(*) FILTER (WHERE order_type = 'delivery'),
    COUNT(*) FILTER (WHERE order_type IN ('takeaway','pickup'))
  INTO v_delivery_orders, v_takeaway_orders
  FROM orders
  WHERE branch_id = p_branch_id
    AND created_at >= v_day_start AND created_at < v_day_end;

  -- ── HR METRICS ───────────────────────────────────────────────────────────

  BEGIN
    SELECT COUNT(DISTINCT employee_id) INTO v_scheduled
    FROM shifts
    WHERE branch_id = p_branch_id AND shift_date = p_date;

    SELECT COUNT(DISTINCT employee_id) INTO v_present
    FROM attendance_logs
    WHERE branch_id = p_branch_id
      AND DATE(check_in) = p_date
      AND check_in IS NOT NULL;

    SELECT COUNT(*) INTO v_late
    FROM attendance_logs al
    JOIN shifts s ON s.employee_id = al.employee_id AND s.shift_date = p_date
    WHERE al.branch_id = p_branch_id
      AND DATE(al.check_in) = p_date
      AND EXTRACT(EPOCH FROM (al.check_in - s.start_time::TIMESTAMPTZ)) / 60 > 15;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_scheduled := 0; v_present := 0; v_late := 0;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_on_leave
    FROM leave_requests
    WHERE branch_id = p_branch_id
      AND leave_date = p_date
      AND status = 'approved';
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_on_leave := 0;
  END;

  v_absent := GREATEST(v_scheduled - v_present - v_on_leave, 0);

  -- ── AUDIT CHECKS ─────────────────────────────────────────────────────────

  -- FIN_001: Unposted orders
  v_checks := v_checks || jsonb_build_object(
    'department',    'finance',
    'check_code',    'FIN_001',
    'check_name',    'Finance Posting Complete',
    'status',        CASE WHEN v_unposted_count = 0 THEN 'pass'
                          WHEN v_unposted_count <= 2 THEN 'warning'
                          ELSE 'fail' END,
    'severity',      CASE WHEN v_unposted_count = 0 THEN 'info'
                          WHEN v_unposted_count <= 2 THEN 'medium'
                          ELSE 'high' END,
    'message',       CASE WHEN v_unposted_count = 0
                          THEN 'All paid orders are correctly posted to Finance.'
                          ELSE v_unposted_count || ' paid order(s) not yet posted to Finance (LKR ' || v_unposted_value || ')' END,
    'actual_value',  v_unposted_count::TEXT,
    'expected_value','0'
  );

  -- FIN_002: Payment reconciliation
  SELECT COALESCE(SUM(total), 0) INTO v_invoice_total
  FROM invoices
  WHERE branch_id = p_branch_id
    AND payment_status = 'paid'
    AND created_at >= v_day_start AND created_at < v_day_end;

  v_payment_total := v_cash + v_card + v_online;

  v_checks := v_checks || jsonb_build_object(
    'department',    'finance',
    'check_code',    'FIN_002',
    'check_name',    'Payment Reconciliation',
    'status',        CASE WHEN ABS(v_invoice_total - v_payment_total) < 1 THEN 'pass' ELSE 'warning' END,
    'severity',      CASE WHEN ABS(v_invoice_total - v_payment_total) < 1 THEN 'info' ELSE 'high' END,
    'message',       'Invoice total LKR ' || v_invoice_total || ' vs Payments collected LKR ' || v_payment_total,
    'actual_value',  v_payment_total::TEXT,
    'expected_value',v_invoice_total::TEXT
  );

  -- OPS_001: KOT generation rate
  IF v_paid_orders > 0 THEN
    v_kot_rate := (v_total_kots::NUMERIC / v_paid_orders) * 100;
  END IF;

  v_checks := v_checks || jsonb_build_object(
    'department',    'operations',
    'check_code',    'OPS_001',
    'check_name',    'KOT Generation',
    'status',        CASE WHEN v_total_kots >= v_paid_orders THEN 'pass'
                          WHEN v_total_kots > 0 THEN 'warning'
                          ELSE 'fail' END,
    'severity',      CASE WHEN v_total_kots >= v_paid_orders THEN 'info' ELSE 'high' END,
    'message',       v_total_kots || ' KOTs generated for ' || v_paid_orders || ' paid orders',
    'actual_value',  v_total_kots::TEXT,
    'expected_value','>= ' || v_paid_orders
  );

  -- OPS_002: Avg KOT completion time
  v_checks := v_checks || jsonb_build_object(
    'department',    'operations',
    'check_code',    'OPS_002',
    'check_name',    'Kitchen Completion Time',
    'status',        CASE WHEN v_avg_kot_mins = 0 THEN 'info'
                          WHEN v_avg_kot_mins <= 20 THEN 'pass'
                          WHEN v_avg_kot_mins <= 35 THEN 'warning'
                          ELSE 'fail' END,
    'severity',      CASE WHEN v_avg_kot_mins <= 20 THEN 'info'
                          WHEN v_avg_kot_mins <= 35 THEN 'medium'
                          ELSE 'high' END,
    'message',       'Average KOT completion: ' || ROUND(v_avg_kot_mins, 1) || ' minutes',
    'actual_value',  ROUND(v_avg_kot_mins, 1)::TEXT || ' min',
    'expected_value','<= 20 min'
  );

  -- HR_001: Staff attendance
  v_checks := v_checks || jsonb_build_object(
    'department',    'hr',
    'check_code',    'HR_001',
    'check_name',    'Staff Attendance',
    'status',        CASE WHEN v_absent = 0 THEN 'pass'
                          WHEN v_absent <= 1 THEN 'warning'
                          ELSE 'fail' END,
    'severity',      CASE WHEN v_absent = 0 THEN 'info'
                          WHEN v_absent <= 1 THEN 'low'
                          ELSE 'medium' END,
    'message',       v_present || '/' || v_scheduled || ' staff present. ' ||
                     v_absent || ' absent, ' || v_late || ' late, ' || v_on_leave || ' on approved leave.',
    'actual_value',  v_present::TEXT || ' present',
    'expected_value',v_scheduled::TEXT || ' scheduled'
  );

  -- HR_002: Late arrivals
  v_checks := v_checks || jsonb_build_object(
    'department',    'hr',
    'check_code',    'HR_002',
    'check_name',    'Punctuality',
    'status',        CASE WHEN v_late = 0 THEN 'pass'
                          WHEN v_late <= 2 THEN 'warning'
                          ELSE 'fail' END,
    'severity',      CASE WHEN v_late = 0 THEN 'info'
                          WHEN v_late <= 2 THEN 'low'
                          ELSE 'medium' END,
    'message',       v_late || ' staff arrived late (>15 min after shift start)',
    'actual_value',  v_late::TEXT || ' late',
    'expected_value','0'
  );

  -- ── UPSERT REPORT ────────────────────────────────────────────────────────

  INSERT INTO ai_daily_reports (
    company_id, branch_id, report_date, report_type,
    generated_by, generated_by_user,
    total_revenue, total_expenses, gross_profit, net_profit,
    total_orders, paid_orders, void_cancelled_orders, average_order_value,
    cash_collected, card_collected, visa_collected, master_collected, qr_collected, bank_collected, credit_collected, online_collected,
    scheduled_staff, present_staff, absent_staff, late_arrivals, on_leave,
    total_kots, avg_kot_completion_mins, tables_served, delivery_orders, takeaway_orders,
    finance_unposted_count, finance_unposted_value,
    department_checks, ai_flags, status
  ) VALUES (
    v_company_id, p_branch_id, p_date, p_report_type,
    CASE WHEN p_user_id IS NULL THEN 'auto' ELSE 'manual' END, p_user_id,
    v_total_revenue, v_total_expenses,
    v_total_revenue - v_total_expenses,
    v_total_revenue - v_total_expenses,
    v_total_orders, v_paid_orders, v_void_orders, v_avg_order,
    v_cash, v_card, v_visa, v_master, v_qr, v_bank, v_credit, v_online,
    v_scheduled, v_present, v_absent, v_late, v_on_leave,
    v_total_kots, v_avg_kot_mins, v_tables_served, v_delivery_orders, v_takeaway_orders,
    v_unposted_count, v_unposted_value,
    v_checks, v_flags, 'generated'
  )
  ON CONFLICT (branch_id, report_date, report_type) DO UPDATE SET
    total_revenue            = EXCLUDED.total_revenue,
    total_expenses           = EXCLUDED.total_expenses,
    gross_profit             = EXCLUDED.gross_profit,
    net_profit               = EXCLUDED.net_profit,
    total_orders             = EXCLUDED.total_orders,
    paid_orders              = EXCLUDED.paid_orders,
    void_cancelled_orders    = EXCLUDED.void_cancelled_orders,
    average_order_value      = EXCLUDED.average_order_value,
    cash_collected           = EXCLUDED.cash_collected,
    card_collected           = EXCLUDED.card_collected,
    visa_collected           = EXCLUDED.visa_collected,
    master_collected         = EXCLUDED.master_collected,
    qr_collected             = EXCLUDED.qr_collected,
    bank_collected           = EXCLUDED.bank_collected,
    credit_collected         = EXCLUDED.credit_collected,
    online_collected         = EXCLUDED.online_collected,
    scheduled_staff          = EXCLUDED.scheduled_staff,
    present_staff            = EXCLUDED.present_staff,
    absent_staff             = EXCLUDED.absent_staff,
    late_arrivals            = EXCLUDED.late_arrivals,
    on_leave                 = EXCLUDED.on_leave,
    total_kots               = EXCLUDED.total_kots,
    avg_kot_completion_mins  = EXCLUDED.avg_kot_completion_mins,
    tables_served            = EXCLUDED.tables_served,
    delivery_orders          = EXCLUDED.delivery_orders,
    takeaway_orders          = EXCLUDED.takeaway_orders,
    finance_unposted_count   = EXCLUDED.finance_unposted_count,
    finance_unposted_value   = EXCLUDED.finance_unposted_value,
    department_checks        = EXCLUDED.department_checks,
    generated_by             = EXCLUDED.generated_by,
    generated_by_user        = EXCLUDED.generated_by_user,
    updated_at               = now()
  RETURNING id INTO v_report_id;

  -- Refresh individual check rows
  DELETE FROM ai_audit_checks WHERE report_id = v_report_id;
  INSERT INTO ai_audit_checks (report_id, department, check_name, check_code, status, severity, message, detail)
  SELECT
    v_report_id,
    c->>'department', c->>'check_name', c->>'check_code',
    c->>'status', c->>'severity', c->>'message', c
  FROM jsonb_array_elements(v_checks) AS c;

  RETURN jsonb_build_object(
    'success',     true,
    'report_id',   v_report_id,
    'report_date', p_date,
    'summary', jsonb_build_object(
      'total_revenue',   v_total_revenue,
      'total_expenses',  v_total_expenses,
      'net_profit',      v_total_revenue - v_total_expenses,
      'total_orders',    v_total_orders,
      'paid_orders',     v_paid_orders,
      'present_staff',   v_present,
      'scheduled_staff', v_scheduled,
      'total_kots',      v_total_kots,
      'audit_checks',    jsonb_array_length(v_checks),
      'checks_failed',   (SELECT COUNT(*) FROM jsonb_array_elements(v_checks) c WHERE c->>'status' = 'fail'),
      'checks_warning',  (SELECT COUNT(*) FROM jsonb_array_elements(v_checks) c WHERE c->>'status' = 'warning')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_daily_report(UUID, DATE, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.generate_daily_report IS
  'Generates/refreshes EOD audit report for a branch. Aggregates finance, operations, and HR metrics. Upserts ai_daily_reports + ai_audit_checks rows.';
