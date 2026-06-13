-- ═══════════════════════════════════════════════════════════════════
-- Seven Waves ERP — Step 07: Production Hardening
-- Database Reliability & Performance Optimization
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. STATEMENT & TRANSACTION TIMEOUTS ─────────────────────────
ALTER DATABASE postgres SET statement_timeout = '30s';
ALTER DATABASE postgres SET idle_in_transaction_session_timeout = '60s';
ALTER DATABASE postgres SET lock_timeout = '10s';

-- ─── 2. CRITICAL INDEX OPTIMIZATION ─────────────────────────────

-- Orders: hot path for POS and KDS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_branch_status
  ON public.orders(branch_id, status) WHERE status NOT IN ('completed', 'cancelled');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at_desc
  ON public.orders(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_table_active
  ON public.orders(table_id, branch_id) WHERE status IN ('pending', 'preparing', 'ready');

-- Order Items: KDS display queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_station
  ON public.order_items(order_id, station);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_status
  ON public.order_items(status) WHERE status != 'served';

-- Inventory: stock lookup & alerts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_branch_item
  ON public.inventory(branch_id, item_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_low_stock
  ON public.inventory(branch_id, current_stock) WHERE current_stock <= reorder_level;

-- Finance: voucher & ledger queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vouchers_posted
  ON public.vouchers(company_id, voucher_date, is_posted);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_voucher_entries_account
  ON public.voucher_entries(account_id, voucher_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ledger_accounts_type
  ON public.ledger_accounts(company_id, account_type, is_active);

-- Print Jobs: queue processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_print_jobs_queue
  ON public.print_jobs(branch_id, status, created_at)
  WHERE status IN ('queued', 'printing');

-- Devices: health monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_health
  ON public.devices(branch_id, status, last_seen_at);

-- AI: insight & anomaly lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_insights_active
  ON public.ai_insights(branch_id, status, severity)
  WHERE status = 'new';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_anomalies_open
  ON public.ai_anomaly_events(branch_id, status, severity)
  WHERE status = 'open';

-- Audit logs: compliance queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_date
  ON public.audit_logs(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id);

-- Sessions: active session lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_user_active
  ON auth.sessions(user_id) WHERE not_after > now();

-- ─── 3. RETRY-SAFE VOUCHER POSTING ──────────────────────────────

CREATE OR REPLACE FUNCTION public.safe_post_voucher(
  p_voucher_id UUID,
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '10s'
AS $$
DECLARE
  v_voucher RECORD;
  v_lock_key BIGINT;
  v_balance NUMERIC;
BEGIN
  -- Generate advisory lock key from voucher ID
  v_lock_key := ('x' || left(replace(p_voucher_id::text, '-', ''), 15))::bit(64)::bigint;

  -- Acquire advisory lock (prevents double-posting)
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher is being posted by another user');
  END IF;

  -- Fetch voucher with lock
  SELECT * INTO v_voucher
  FROM public.vouchers
  WHERE id = p_voucher_id
  FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
  END IF;

  IF v_voucher.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher already posted');
  END IF;

  IF v_voucher.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher must be approved before posting');
  END IF;

  -- Validate debit/credit balance
  SELECT COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) INTO v_balance
  FROM public.voucher_entries
  WHERE voucher_id = p_voucher_id;

  IF ABS(v_balance) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher entries not balanced');
  END IF;

  -- Post the voucher
  UPDATE public.vouchers SET
    is_posted = true,
    posted_by = p_user_id,
    posted_at = NOW(),
    status = 'posted'
  WHERE id = p_voucher_id;

  -- Log audit
  INSERT INTO public.audit_logs (entity_type, entity_id, action, user_id, details)
  VALUES ('voucher', p_voucher_id, 'posted', p_user_id,
    jsonb_build_object('voucher_number', v_voucher.voucher_number));

  RETURN jsonb_build_object('success', true, 'voucher_id', p_voucher_id);
END;
$$;

-- ─── 4. LOYALTY DOUBLE-SPEND PROTECTION ─────────────────────────

CREATE OR REPLACE FUNCTION public.safe_redeem_loyalty(
  p_customer_id UUID,
  p_points_to_redeem INT,
  p_order_id UUID,
  p_branch_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  v_current_points INT;
  v_lock_key BIGINT;
BEGIN
  -- Advisory lock on customer
  v_lock_key := ('x' || left(replace(p_customer_id::text, '-', ''), 15))::bit(64)::bigint;

  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Redemption in progress');
  END IF;

  -- Get current points with row lock
  SELECT loyalty_points INTO v_current_points
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF v_current_points IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
  END IF;

  IF v_current_points < p_points_to_redeem THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient points: have %s, need %s', v_current_points, p_points_to_redeem));
  END IF;

  -- Deduct points
  UPDATE public.customers
  SET loyalty_points = loyalty_points - p_points_to_redeem
  WHERE id = p_customer_id;

  -- Log redemption
  INSERT INTO public.loyalty_transactions (customer_id, points, type, order_id, branch_id)
  VALUES (p_customer_id, -p_points_to_redeem, 'redemption', p_order_id, p_branch_id);

  RETURN jsonb_build_object('success', true, 'redeemed', p_points_to_redeem,
    'remaining', v_current_points - p_points_to_redeem);
END;
$$;

-- ─── 5. INVENTORY CONCURRENCY PROTECTION ────────────────────────

CREATE OR REPLACE FUNCTION public.safe_deduct_inventory(
  p_branch_id UUID,
  p_item_id UUID,
  p_quantity NUMERIC,
  p_order_id UUID,
  p_reason TEXT DEFAULT 'order_deduction'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  v_current_stock NUMERIC;
  v_lock_key BIGINT;
BEGIN
  -- Advisory lock on branch+item
  v_lock_key := ('x' || left(replace(p_branch_id::text || p_item_id::text, '-', ''), 15))::bit(64)::bigint;

  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inventory update in progress');
  END IF;

  SELECT current_stock INTO v_current_stock
  FROM public.inventory
  WHERE branch_id = p_branch_id AND item_id = p_item_id
  FOR UPDATE;

  IF v_current_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inventory record not found');
  END IF;

  IF v_current_stock < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Insufficient stock: have %s, need %s', v_current_stock, p_quantity));
  END IF;

  UPDATE public.inventory
  SET current_stock = current_stock - p_quantity,
      updated_at = NOW()
  WHERE branch_id = p_branch_id AND item_id = p_item_id;

  INSERT INTO public.inventory_transactions (branch_id, item_id, quantity, type, reference_id, reason)
  VALUES (p_branch_id, p_item_id, -p_quantity, 'deduction', p_order_id, p_reason);

  RETURN jsonb_build_object('success', true, 'remaining', v_current_stock - p_quantity);
END;
$$;

-- ─── 6. IMMUTABLE AUDIT LOG PROTECTION ──────────────────────────

-- Prevent UPDATE/DELETE on audit_logs (append-only)
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable — updates and deletes are not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_immutable_update ON public.audit_logs;
CREATE TRIGGER trg_audit_immutable_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_audit_immutable_delete ON public.audit_logs;
CREATE TRIGGER trg_audit_immutable_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- ─── 7. POSTED VOUCHER IMMUTABILITY ─────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_posted_voucher_edit()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_posted = true AND NEW.is_posted = true THEN
    -- Allow status changes by admin, but block data changes
    IF OLD.voucher_number != NEW.voucher_number
       OR OLD.voucher_date != NEW.voucher_date
       OR OLD.total_amount != NEW.total_amount
       OR OLD.narration != NEW.narration THEN
      RAISE EXCEPTION 'Posted vouchers cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voucher_immutable ON public.vouchers;
CREATE TRIGGER trg_voucher_immutable
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_voucher_edit();

-- ─── 8. SECURITY EVENT TABLE ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.security_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity     TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'alert')),
  category     TEXT NOT NULL,
  message      TEXT NOT NULL,
  user_id      UUID REFERENCES auth.users(id),
  branch_id    UUID,
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB DEFAULT '{}',
  resolved     BOOLEAN DEFAULT FALSE,
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ
);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security events"
  ON public.security_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON public.security_events(severity, timestamp DESC)
  WHERE NOT resolved;

CREATE INDEX IF NOT EXISTS idx_security_events_user
  ON public.security_events(user_id, timestamp DESC);

-- ─── 9. DB HEALTH CHECK FUNCTION ────────────────────────────────

CREATE OR REPLACE FUNCTION public.db_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
DECLARE
  v_active_connections INT;
  v_db_size TEXT;
  v_table_count INT;
  v_pending_syncs INT;
  v_failed_print_jobs INT;
BEGIN
  SELECT count(*) INTO v_active_connections FROM pg_stat_activity WHERE state = 'active';
  SELECT pg_size_pretty(pg_database_size(current_database())) INTO v_db_size;
  SELECT count(*) INTO v_table_count FROM information_schema.tables WHERE table_schema = 'public';
  SELECT count(*) INTO v_pending_syncs FROM public.biometric_sync_logs WHERE sync_status = 'pending';
  SELECT count(*) INTO v_failed_print_jobs FROM public.print_jobs WHERE status = 'failed';

  RETURN jsonb_build_object(
    'status', 'healthy',
    'timestamp', NOW(),
    'active_connections', v_active_connections,
    'database_size', v_db_size,
    'table_count', v_table_count,
    'pending_biometric_syncs', v_pending_syncs,
    'failed_print_jobs', v_failed_print_jobs
  );
END;
$$;
