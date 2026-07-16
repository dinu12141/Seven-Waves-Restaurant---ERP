-- ═══════════════════════════════════════════════════════════════════
-- ERP SECURITY LOCKDOWN — Full Production Migration
-- Seven Waves Restaurant ERP
-- Applied: 2026-03-01
--
-- CONTENTS:
--   STEP 1  — Helper functions (auth_has_access_to_branch, auth_user_branch_ids)
--   STEP 2  — Upgrade audit_logs (add ip_address, session_id, branch_id, duration_ms)
--   STEP 3  — audit_record() trigger function
--   STEP 4  — Attach audit triggers to sensitive tables
--   STEP 5  — Enable RLS on all unprotected business tables
--   STEP 6  — Finance module policies (invoices, ap_invoices, payments, supplier_payments)
--   STEP 7  — Inventory/Procurement policies (inventory_documents, GRN, PO, stock_on_hand)
--   STEP 8  — HR/Payroll policies (employees, payroll_runs, payslips)
--   STEP 9  — Recipes / BOM policies
--   STEP 10 — Rate limiting (qr_rate_limits table + RPC check)
--   STEP 11 — user_permissions table + RLS
--   STEP 12 — Realtime publish for audit_logs (admin only via RLS)
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — ADDITIONAL HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────

-- auth_has_access_to_branch: checks if current user is assigned to branch
CREATE OR REPLACE FUNCTION public.auth_has_access_to_branch(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_branches
    WHERE user_id = auth.uid() AND branch_id = p_branch_id
  );
$$;
GRANT EXECUTE ON FUNCTION public.auth_has_access_to_branch(UUID) TO authenticated;

-- auth_user_branch_ids: alias for auth_branch_ids (for naming consistency)
CREATE OR REPLACE FUNCTION public.auth_user_branch_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT branch_id FROM user_branches WHERE user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.auth_user_branch_ids() TO authenticated;

-- is_hr: shorthand for HR role check
CREATE OR REPLACE FUNCTION public.is_hr()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth_has_role('hr');
$$;
GRANT EXECUTE ON FUNCTION public.is_hr() TO authenticated;

-- is_finance: shorthand for finance role check
CREATE OR REPLACE FUNCTION public.is_finance()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth_has_role('finance');
$$;
GRANT EXECUTE ON FUNCTION public.is_finance() TO authenticated;

-- is_inventory: shorthand for inventory role check
CREATE OR REPLACE FUNCTION public.is_inventory()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth_has_role('inventory');
$$;
GRANT EXECUTE ON FUNCTION public.is_inventory() TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — UPGRADE audit_logs TABLE
-- ─────────────────────────────────────────────────────────────────

-- Add missing ERP-grade audit columns
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_address   TEXT,
  ADD COLUMN IF NOT EXISTS session_id   TEXT,
  ADD COLUMN IF NOT EXISTS branch_id    UUID REFERENCES branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_ms  INTEGER,
  ADD COLUMN IF NOT EXISTS severity     TEXT DEFAULT 'info'
                                        CHECK (severity IN ('info','warning','critical'));

-- Indexes for queryability
CREATE INDEX IF NOT EXISTS idx_al_user      ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_table     ON audit_logs(table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_branch    ON audit_logs(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_severity  ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_al_action    ON audit_logs(action);

-- REPLICA IDENTITY for realtime (admin monitoring)
ALTER TABLE audit_logs REPLICA IDENTITY FULL;

-- Enable RLS (admin-only view)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS al_admin_all    ON audit_logs;
CREATE POLICY al_admin_all ON audit_logs FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS al_system_insert ON audit_logs;
CREATE POLICY al_system_insert ON audit_logs FOR INSERT
  WITH CHECK (true);   -- triggers insert as the row owner; SECURITY DEFINER bypasses


-- ─────────────────────────────────────────────────────────────────
-- STEP 3 — AUDIT TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data  JSONB;
  v_new_data  JSONB;
  v_action    TEXT;
  v_severity  TEXT;
  v_branch_id UUID;
BEGIN
  v_action := TG_OP;  -- INSERT / UPDATE / DELETE

  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_severity := 'warning';
    -- Try to extract branch_id from old row
    BEGIN v_branch_id := (v_old_data->>'branch_id')::UUID; EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_severity := 'info';
    BEGIN v_branch_id := (v_new_data->>'branch_id')::UUID; EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSE  -- INSERT
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_severity := 'info';
    BEGIN v_branch_id := (v_new_data->>'branch_id')::UUID; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Elevate severity for payment mutations
  IF TG_TABLE_NAME IN ('payments','supplier_payments','ap_invoices','invoices') THEN
    v_severity := CASE WHEN TG_OP = 'DELETE' THEN 'critical' ELSE 'warning' END;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id,
    old_data, new_data, branch_id, severity, created_at
  ) VALUES (
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN (v_old_data->>'id')::UUID
         ELSE (v_new_data->>'id')::UUID END,
    v_old_data,
    v_new_data,
    v_branch_id,
    v_severity,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 4 — ATTACH AUDIT TRIGGERS TO SENSITIVE TABLES
-- ─────────────────────────────────────────────────────────────────

-- Helper macro: create audit trigger if table exists
DO $$
DECLARE
  sensitive_tables TEXT[] := ARRAY[
    'orders', 'payments', 'invoices', 'invoice_items',
    'ap_invoices', 'ap_invoice_lines', 'supplier_payments',
    'goods_receipts', 'goods_receipt_lines',
    'purchase_orders', 'purchase_order_lines',
    'inventory_documents', 'inventory_document_lines',
    'inventory_ledger', 'stock_on_hand',
    'payroll_runs', 'payslips', 'employees'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY sensitive_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('
        DROP TRIGGER IF EXISTS audit_%I ON %I;
        CREATE TRIGGER audit_%I
        AFTER INSERT OR UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION public.audit_record();
      ', t, t, t, t);
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 5 — ENABLE RLS ON ALL UNPROTECTED BUSINESS TABLES
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbls TEXT[] := ARRAY[
    'invoices','invoice_items','payments',
    'ap_invoices','ap_invoice_lines','supplier_payments','ap_ledger',
    'goods_receipts','goods_receipt_lines',
    'purchase_orders','purchase_order_lines',
    'inventory_documents','inventory_document_lines',
    'inventory_ledger','stock_on_hand',
    'recipes','recipe_items',
    'employees','payroll_runs','payslips',
    'employee_loans','employee_overtime','leave_requests','leave_types',
    'attendance_records','attendance_logs'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 6 — FINANCE MODULE POLICIES
-- ─────────────────────────────────────────────────────────────────

-- ── invoices (customer-facing billing) ──────────────────────────
DROP POLICY IF EXISTS inv_admin        ON invoices;
DROP POLICY IF EXISTS inv_finance      ON invoices;
DROP POLICY IF EXISTS inv_cashier      ON invoices;
DROP POLICY IF EXISTS inv_waiter       ON invoices;

CREATE POLICY inv_admin ON invoices FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY inv_finance ON invoices FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY inv_cashier ON invoices FOR SELECT
  USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));

-- Cashier can only INSERT invoices via RPC (direct insert blocked by no INSERT policy)

-- ── invoice_items ─────────────────────────────────────────────
DROP POLICY IF EXISTS invi_admin   ON invoice_items;
DROP POLICY IF EXISTS invi_finance ON invoice_items;
DROP POLICY IF EXISTS invi_cashier ON invoice_items;

CREATE POLICY invi_admin ON invoice_items FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY invi_finance ON invoice_items FOR SELECT
  USING (
    is_finance()
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id
                AND i.branch_id = ANY(auth_branch_ids()))
  );

CREATE POLICY invi_cashier ON invoice_items FOR SELECT
  USING (
    auth_has_role('cashier')
    AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id
                AND i.branch_id = ANY(auth_branch_ids()))
  );

-- ── payments ──────────────────────────────────────────────────
DROP POLICY IF EXISTS pay_admin    ON payments;
DROP POLICY IF EXISTS pay_finance  ON payments;
DROP POLICY IF EXISTS pay_cashier  ON payments;

CREATE POLICY pay_admin ON payments FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY pay_finance ON payments FOR SELECT
  USING (
    is_finance()
    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id
                AND o.branch_id = ANY(auth_branch_ids()))
  );

CREATE POLICY pay_cashier ON payments FOR SELECT
  USING (
    auth_has_role('cashier')
    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id
                AND o.branch_id = ANY(auth_branch_ids()))
  );

-- ── ap_invoices (supplier invoices) ──────────────────────────
DROP POLICY IF EXISTS api_admin     ON ap_invoices;
DROP POLICY IF EXISTS api_finance   ON ap_invoices;
DROP POLICY IF EXISTS api_inventory ON ap_invoices;

CREATE POLICY api_admin ON ap_invoices FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY api_finance ON ap_invoices FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY api_inventory ON ap_invoices FOR SELECT
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()));

-- ── ap_invoice_lines ─────────────────────────────────────────
DROP POLICY IF EXISTS apil_admin   ON ap_invoice_lines;
DROP POLICY IF EXISTS apil_finance ON ap_invoice_lines;

CREATE POLICY apil_admin ON ap_invoice_lines FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY apil_finance ON ap_invoice_lines FOR SELECT
  USING (
    is_finance()
    AND EXISTS (SELECT 1 FROM ap_invoices ai WHERE ai.id = ap_invoice_lines.invoice_id
                AND ai.branch_id = ANY(auth_branch_ids()))
  );

-- ── supplier_payments ─────────────────────────────────────────
DROP POLICY IF EXISTS sp_admin    ON supplier_payments;
DROP POLICY IF EXISTS sp_finance  ON supplier_payments;
DROP POLICY IF EXISTS sp_manager  ON supplier_payments;

CREATE POLICY sp_admin ON supplier_payments FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY sp_finance ON supplier_payments FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY sp_manager ON supplier_payments FOR SELECT
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()));

-- ── ap_ledger ─────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ap_ledger') THEN
    DROP POLICY IF EXISTS apl_admin   ON ap_ledger;
    DROP POLICY IF EXISTS apl_finance ON ap_ledger;
    CREATE POLICY apl_admin   ON ap_ledger FOR ALL USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY apl_finance ON ap_ledger FOR SELECT
      USING (is_finance() AND branch_id = ANY(auth_branch_ids()));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 7 — INVENTORY / PROCUREMENT POLICIES
-- ─────────────────────────────────────────────────────────────────

-- ── goods_receipts (GRN) ──────────────────────────────────────
DROP POLICY IF EXISTS grn_admin     ON goods_receipts;
DROP POLICY IF EXISTS grn_inventory ON goods_receipts;
DROP POLICY IF EXISTS grn_manager   ON goods_receipts;

CREATE POLICY grn_admin ON goods_receipts FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY grn_manager ON goods_receipts FOR ALL
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY grn_inventory ON goods_receipts FOR SELECT
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()));

-- ── goods_receipt_lines ───────────────────────────────────────
DROP POLICY IF EXISTS grnl_admin     ON goods_receipt_lines;
DROP POLICY IF EXISTS grnl_inventory ON goods_receipt_lines;

CREATE POLICY grnl_admin ON goods_receipt_lines FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY grnl_inventory ON goods_receipt_lines FOR SELECT
  USING (
    is_inventory()
    AND EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.id = goods_receipt_lines.grn_id
                AND gr.branch_id = ANY(auth_branch_ids()))
  );

-- ── purchase_orders ───────────────────────────────────────────
DROP POLICY IF EXISTS po_admin     ON purchase_orders;
DROP POLICY IF EXISTS po_manager   ON purchase_orders;
DROP POLICY IF EXISTS po_inventory ON purchase_orders;
DROP POLICY IF EXISTS po_finance   ON purchase_orders;

CREATE POLICY po_admin ON purchase_orders FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY po_manager ON purchase_orders FOR ALL
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY po_inventory ON purchase_orders FOR SELECT
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY po_finance ON purchase_orders FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

-- ── purchase_order_lines ──────────────────────────────────────
DROP POLICY IF EXISTS pol_admin     ON purchase_order_lines;
DROP POLICY IF EXISTS pol_inventory ON purchase_order_lines;

CREATE POLICY pol_admin ON purchase_order_lines FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY pol_inventory ON purchase_order_lines FOR SELECT
  USING (
    is_inventory()
    AND EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_lines.po_id
                AND po.branch_id = ANY(auth_branch_ids()))
  );

-- ── inventory_documents (GIN/TRANSFER/ADJUSTMENT) ─────────────
DROP POLICY IF EXISTS id_admin     ON inventory_documents;
DROP POLICY IF EXISTS id_manager   ON inventory_documents;
DROP POLICY IF EXISTS id_inventory ON inventory_documents;

CREATE POLICY id_admin ON inventory_documents FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY id_manager ON inventory_documents FOR ALL
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY id_inventory ON inventory_documents FOR ALL
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_inventory() AND branch_id = ANY(auth_branch_ids()));

-- ── inventory_document_lines ──────────────────────────────────
DROP POLICY IF EXISTS idl_admin     ON inventory_document_lines;
DROP POLICY IF EXISTS idl_inventory ON inventory_document_lines;

CREATE POLICY idl_admin ON inventory_document_lines FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY idl_inventory ON inventory_document_lines FOR ALL
  USING (
    is_inventory()
    AND EXISTS (SELECT 1 FROM inventory_documents id2 WHERE id2.id = inventory_document_lines.document_id
                AND id2.branch_id = ANY(auth_branch_ids()))
  )
  WITH CHECK (
    is_inventory()
    AND EXISTS (SELECT 1 FROM inventory_documents id2 WHERE id2.id = inventory_document_lines.document_id
                AND id2.branch_id = ANY(auth_branch_ids()))
  );

-- ── inventory_ledger (READ ONLY for all — mutations via RPC) ──
DROP POLICY IF EXISTS il_admin     ON inventory_ledger;
DROP POLICY IF EXISTS il_inventory ON inventory_ledger;
DROP POLICY IF EXISTS il_finance   ON inventory_ledger;

CREATE POLICY il_admin ON inventory_ledger FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY il_inventory ON inventory_ledger FOR SELECT
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY il_finance ON inventory_ledger FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

-- ── stock_on_hand (read by kitchen/inventory/manager) ─────────
DROP POLICY IF EXISTS soh_admin     ON stock_on_hand;
DROP POLICY IF EXISTS soh_inventory ON stock_on_hand;
DROP POLICY IF EXISTS soh_manager   ON stock_on_hand;
DROP POLICY IF EXISTS soh_kitchen   ON stock_on_hand;

CREATE POLICY soh_admin ON stock_on_hand FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY soh_inventory ON stock_on_hand FOR SELECT
  USING (is_inventory());

CREATE POLICY soh_manager ON stock_on_hand FOR SELECT
  USING (is_manager());

CREATE POLICY soh_kitchen ON stock_on_hand FOR SELECT
  USING (auth_has_role('kitchen'));


-- ─────────────────────────────────────────────────────────────────
-- STEP 8 — HR / PAYROLL POLICIES
-- ─────────────────────────────────────────────────────────────────

-- ── employees ─────────────────────────────────────────────────
DROP POLICY IF EXISTS emp_admin   ON employees;
DROP POLICY IF EXISTS emp_hr      ON employees;
DROP POLICY IF EXISTS emp_manager ON employees;

CREATE POLICY emp_admin ON employees FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY emp_hr ON employees FOR ALL
  USING (is_hr() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY emp_manager ON employees FOR SELECT
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()));

-- ── payroll_runs ───────────────────────────────────────────────
DROP POLICY IF EXISTS pr_admin ON payroll_runs;
DROP POLICY IF EXISTS pr_hr    ON payroll_runs;

CREATE POLICY pr_admin ON payroll_runs FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY pr_hr ON payroll_runs FOR ALL
  USING (is_hr() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));

-- ── payslips ───────────────────────────────────────────────────
DROP POLICY IF EXISTS ps_admin ON payslips;
DROP POLICY IF EXISTS ps_hr    ON payslips;

CREATE POLICY ps_admin ON payslips FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY ps_hr ON payslips FOR SELECT
  USING (is_hr() AND branch_id = ANY(auth_branch_ids()));

-- ── leave_types ───────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='leave_types') THEN
    ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS lt_admin   ON leave_types;
    DROP POLICY IF EXISTS lt_hr      ON leave_types;
    DROP POLICY IF EXISTS lt_all     ON leave_types;
    CREATE POLICY lt_admin ON leave_types FOR ALL USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY lt_hr ON leave_types FOR ALL
      USING (is_hr())
      WITH CHECK (is_hr());
    CREATE POLICY lt_all ON leave_types FOR SELECT USING (true);
  END IF;
END $$;

-- ── leave_requests ─────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='leave_requests') THEN
    ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS lr_admin   ON leave_requests;
    DROP POLICY IF EXISTS lr_hr      ON leave_requests;
    DROP POLICY IF EXISTS lr_self    ON leave_requests;
    CREATE POLICY lr_admin ON leave_requests FOR ALL USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY lr_hr ON leave_requests FOR ALL
      USING (is_hr() AND branch_id = ANY(auth_branch_ids()))
      WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));
    CREATE POLICY lr_self ON leave_requests FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM employees e WHERE e.id = leave_requests.employee_id
                AND e.profile_id = auth.uid())
      );
  END IF;
END $$;

-- ── attendance_records ─────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='attendance_records') THEN
    ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ar_admin   ON attendance_records;
    DROP POLICY IF EXISTS ar_hr      ON attendance_records;
    CREATE POLICY ar_admin ON attendance_records FOR ALL USING (is_admin()) WITH CHECK (is_admin());
    CREATE POLICY ar_hr ON attendance_records FOR ALL
      USING (is_hr() AND branch_id = ANY(auth_branch_ids()))
      WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 9 — RECIPES / BOM POLICIES
-- ─────────────────────────────────────────────────────────────────
-- Recipes are read by kitchen; written only by admin/manager

DROP POLICY IF EXISTS rec_admin   ON recipes;
DROP POLICY IF EXISTS rec_manager ON recipes;
DROP POLICY IF EXISTS rec_kitchen ON recipes;
DROP POLICY IF EXISTS rec_inventory ON recipes;

CREATE POLICY rec_admin ON recipes FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY rec_manager ON recipes FOR ALL
  USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY rec_kitchen ON recipes FOR SELECT
  USING (auth_has_role('kitchen'));

CREATE POLICY rec_inventory ON recipes FOR SELECT
  USING (is_inventory());

-- recipe_items
DROP POLICY IF EXISTS ri_admin   ON recipe_items;
DROP POLICY IF EXISTS ri_manager ON recipe_items;
DROP POLICY IF EXISTS ri_kitchen ON recipe_items;

CREATE POLICY ri_admin ON recipe_items FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY ri_manager ON recipe_items FOR ALL
  USING (is_manager()) WITH CHECK (is_manager());

CREATE POLICY ri_kitchen ON recipe_items FOR SELECT
  USING (auth_has_role('kitchen'));


-- ─────────────────────────────────────────────────────────────────
-- STEP 10 — RATE LIMITING (QR endpoint abuse protection)
-- ─────────────────────────────────────────────────────────────────

-- NOTE: minute_bucket is a TEXT column ('YYYY-MM-DD HH24:MI') to avoid the
-- IMMUTABLE restriction that prevents date_trunc() in a unique index expression.
CREATE TABLE IF NOT EXISTS public.qr_rate_limits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier    TEXT NOT NULL,   -- table_id or client IP
  endpoint      TEXT NOT NULL,
  minute_bucket TEXT NOT NULL,   -- e.g. '2026-03-01 15:30'
  hit_count     INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (identifier, endpoint, minute_bucket)
);

CREATE INDEX IF NOT EXISTS idx_qrl_bucket ON qr_rate_limits(minute_bucket);

-- No RLS for rate limits — fully controlled by SECURITY DEFINER RPC
ALTER TABLE qr_rate_limits DISABLE ROW LEVEL SECURITY;

-- RPC: check_qr_rate_limit — allow max 30 hits/min per identifier+endpoint
CREATE OR REPLACE FUNCTION public.check_qr_rate_limit(
  p_identifier TEXT,
  p_endpoint   TEXT,
  p_limit      INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket TEXT;
  v_hits   INTEGER;
BEGIN
  v_bucket := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI');

  -- Upsert into current minute bucket
  INSERT INTO qr_rate_limits (identifier, endpoint, minute_bucket, hit_count)
  VALUES (p_identifier, p_endpoint, v_bucket, 1)
  ON CONFLICT (identifier, endpoint, minute_bucket)
  DO UPDATE SET hit_count = qr_rate_limits.hit_count + 1;

  -- Read current count
  SELECT hit_count INTO v_hits
  FROM qr_rate_limits
  WHERE identifier    = p_identifier
    AND endpoint      = p_endpoint
    AND minute_bucket = v_bucket;

  IF v_hits > p_limit THEN
    -- Log abuse attempt
    INSERT INTO audit_logs (user_id, action, table_name, new_data, severity, created_at)
    VALUES (
      auth.uid(), 'RATE_LIMITED', 'qr_rate_limits',
      jsonb_build_object('identifier', p_identifier, 'endpoint', p_endpoint, 'hits', v_hits),
      'critical',
      now()
    );
    RETURN jsonb_build_object('allowed', false, 'hits', v_hits, 'limit', p_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'hits', v_hits, 'limit', p_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- Cleanup: purge bucket entries older than 10 minutes
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM qr_rate_limits
  WHERE minute_bucket < to_char(
    (now() - INTERVAL '10 minutes') AT TIME ZONE 'UTC',
    'YYYY-MM-DD HH24:MI'
  );
$$;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- STEP 11 — user_permissions (per-user overrides)
-- ─────────────────────────────────────────────────────────────────

-- NOTE: column is `is_granted` (not `granted`) to avoid reserved-word conflicts.
-- auth_has_permission uses plpgsql (not sql) to prevent parse-time column
-- resolution failures when the table is created in the same transaction.
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  is_granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_up_user ON user_permissions(user_id);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS up_admin ON user_permissions;
CREATE POLICY up_admin ON user_permissions FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS up_self_select ON user_permissions;
CREATE POLICY up_self_select ON user_permissions FOR SELECT
  USING (user_id = auth.uid());

-- Helper: check explicit per-user permission override
-- Uses plpgsql (not sql) so column resolution is deferred to runtime.
CREATE OR REPLACE FUNCTION public.auth_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT is_granted INTO v_result
  FROM user_permissions
  WHERE user_id = auth.uid() AND permission = p_permission
  LIMIT 1;
  RETURN COALESCE(v_result, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.auth_has_permission(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- STEP 12 — REALTIME PUBLICATION (safe)
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['audit_logs', 'qr_rate_limits'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t)
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- STEP 13 — REVOKE anon SELECT on operational order/KOT tables
-- ─────────────────────────────────────────────────────────────────
-- The anon role must never read live order or kitchen data. Access for
-- QR/kiosk flows is mediated exclusively via SECURITY DEFINER RPCs.

REVOKE SELECT ON public.orders      FROM anon;
REVOKE SELECT ON public.order_items FROM anon;
REVOKE SELECT ON public.kot_tickets FROM anon;
REVOKE SELECT ON public.kot_items   FROM anon;
