-- ═══════════════════════════════════════════════════════════════════
-- BOM / INVENTORY SYSTEM COMPLETION
-- Seven Waves Restaurant ERP
-- Applied: 2026-03-01
--
-- BUILDS ON TOP OF EXISTING:
--   ✅ warehouses, items, uom, recipes, recipe_items
--   ✅ inventory_documents + trigger (post_inventory_document)
--   ✅ inventory_ledger, stock_on_hand
--   ✅ issue_stock_for_order() with BOM resolution
--   ✅ post_grn(), validate_sufficient_stock(), etc.
--
-- THIS FILE ADDS:
--   1) reorder_rules table + RLS
--   2) Link kitchens → warehouses
--   3) post_transfer() RPC
--   4) post_adjustment() RPC (handles WASTAGE too)
--   5) Report views: stock_on_hand, movements, consumption, low stock
--   6) low_stock_alerts() RPC
--   7) QA test data + verification queries
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1) REORDER RULES TABLE
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reorder_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  item_id       UUID NOT NULL REFERENCES items(id),
  min_level     NUMERIC NOT NULL DEFAULT 0,
  max_level     NUMERIC NOT NULL DEFAULT 0,
  reorder_qty   NUMERIC NOT NULL DEFAULT 0,
  auto_reorder  BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (warehouse_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_rr_warehouse ON reorder_rules(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_rr_item      ON reorder_rules(item_id);

ALTER TABLE reorder_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rr_admin     ON reorder_rules;
DROP POLICY IF EXISTS rr_manager   ON reorder_rules;
DROP POLICY IF EXISTS rr_inventory ON reorder_rules;

CREATE POLICY rr_admin     ON reorder_rules FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY rr_manager   ON reorder_rules FOR ALL USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY rr_inventory ON reorder_rules FOR ALL USING (is_inventory()) WITH CHECK (is_inventory());


-- ─────────────────────────────────────────────────────────────────
-- 2) LINK KITCHENS → WAREHOUSES
-- ─────────────────────────────────────────────────────────────────
-- The warehouses table already has kitchen_id column but all are NULL.
-- We need to link them for BOM deduction to find the right warehouse.

-- Link Kitchen 1 → Hot Kitchen warehouse, etc. (safe idempotent updates)
DO $$
DECLARE
  v_kitchens  RECORD;
  v_wh        RECORD;
  v_counter   INT := 0;
  v_wh_names  TEXT[] := ARRAY['Hot Kitchen','Cold Kitchen','Bakery','Grill Station','Prep Kitchen','Bar Store'];
BEGIN
  FOR v_kitchens IN
    SELECT id, name FROM kitchens
    WHERE branch_id = '340efb20-513a-4d99-b1e7-f32f938e31a8'
    ORDER BY name
  LOOP
    v_counter := v_counter + 1;
    -- Find the kitchen warehouse by index
    IF v_counter <= array_length(v_wh_names, 1) THEN
      UPDATE warehouses
      SET kitchen_id = v_kitchens.id
      WHERE name = v_wh_names[v_counter]
        AND warehouse_type IN ('kitchen','bar')
        AND kitchen_id IS NULL;
    END IF;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────
-- 3) post_transfer() — STOCK TRANSFER RPC
-- ─────────────────────────────────────────────────────────────────
-- Creates a TRANSFER inventory_document and posts it immediately.
-- On posting, the trigger handles OUT from source, IN to target.

CREATE OR REPLACE FUNCTION public.post_transfer(
  p_company_id         UUID,
  p_branch_id          UUID,
  p_source_warehouse   UUID,
  p_target_warehouse   UUID,
  p_lines              JSONB,    -- [{item_id, quantity, uom_id?, unit_cost?}, ...]
  p_remarks            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id      UUID;
  v_doc_number  TEXT;
  v_line        JSONB;
  v_line_num    INT := 0;
  v_item_id     UUID;
  v_qty         NUMERIC;
  v_uom_id      UUID;
  v_unit_cost   NUMERIC;
BEGIN
  -- Validations
  IF p_source_warehouse = p_target_warehouse THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source and target warehouse cannot be the same');
  END IF;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No transfer lines provided');
  END IF;

  -- Generate document number
  v_doc_number := generate_inv_doc_number(p_company_id, 'TRANSFER');

  -- Create header
  INSERT INTO inventory_documents (
    company_id, branch_id, doc_type, doc_number, doc_date,
    warehouse_id, target_warehouse_id, status, remarks, created_by
  ) VALUES (
    p_company_id, p_branch_id, 'TRANSFER', v_doc_number, CURRENT_DATE,
    p_source_warehouse, p_target_warehouse, 'draft', p_remarks, auth.uid()
  ) RETURNING id INTO v_doc_id;

  -- Create lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_num := v_line_num + 1;
    v_item_id  := (v_line->>'item_id')::UUID;
    v_qty      := (v_line->>'quantity')::NUMERIC;
    v_uom_id   := COALESCE((v_line->>'uom_id')::UUID,
                   (SELECT inventory_uom_id FROM items WHERE id = v_item_id));
    v_unit_cost := COALESCE((v_line->>'unit_cost')::NUMERIC,
                    (SELECT COALESCE(avg_cost, 0) FROM items WHERE id = v_item_id));

    IF v_qty <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Line ' || v_line_num || ': quantity must be positive');
    END IF;

    INSERT INTO inventory_document_lines (
      document_id, line_number, item_id, uom_id, quantity, unit_cost
    ) VALUES (
      v_doc_id, v_line_num, v_item_id, v_uom_id, v_qty, v_unit_cost
    );
  END LOOP;

  -- Post (triggers post_inventory_document which does ledger + SOH)
  UPDATE inventory_documents SET status = 'posted' WHERE id = v_doc_id;

  RETURN jsonb_build_object(
    'success', true,
    'doc_id', v_doc_id,
    'doc_number', v_doc_number,
    'lines', v_line_num,
    'message', 'Transfer posted successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_transfer(UUID, UUID, UUID, UUID, JSONB, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 4) post_adjustment() — ADJUSTMENT / WASTAGE RPC
-- ─────────────────────────────────────────────────────────────────
-- doc_type can be 'ADJUSTMENT' or 'WASTAGE' (WASTAGE = negative adjustment)

CREATE OR REPLACE FUNCTION public.post_adjustment(
  p_company_id    UUID,
  p_branch_id     UUID,
  p_warehouse_id  UUID,
  p_doc_type      TEXT,          -- 'ADJUSTMENT' or 'WASTAGE'
  p_lines         JSONB,         -- [{item_id, quantity, uom_id?, unit_cost?, notes?}, ...]
  p_remarks       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id      UUID;
  v_doc_number  TEXT;
  v_line        JSONB;
  v_line_num    INT := 0;
  v_item_id     UUID;
  v_qty         NUMERIC;
  v_uom_id      UUID;
  v_unit_cost   NUMERIC;
  v_effective_type TEXT;
BEGIN
  -- Normalize doc_type
  v_effective_type := CASE
    WHEN upper(p_doc_type) = 'WASTAGE' THEN 'ADJUSTMENT'
    ELSE COALESCE(upper(p_doc_type), 'ADJUSTMENT')
  END;

  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No adjustment lines provided');
  END IF;

  v_doc_number := generate_inv_doc_number(p_company_id, v_effective_type);

  -- Create header
  INSERT INTO inventory_documents (
    company_id, branch_id, doc_type, doc_number, doc_date,
    warehouse_id, status, remarks, created_by
  ) VALUES (
    p_company_id, p_branch_id, v_effective_type, v_doc_number, CURRENT_DATE,
    p_warehouse_id, 'draft',
    COALESCE(p_remarks, CASE WHEN upper(p_doc_type) = 'WASTAGE' THEN 'Wastage adjustment' ELSE 'Manual adjustment' END),
    auth.uid()
  ) RETURNING id INTO v_doc_id;

  -- Create lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_num := v_line_num + 1;
    v_item_id  := (v_line->>'item_id')::UUID;
    v_qty      := (v_line->>'quantity')::NUMERIC;
    v_uom_id   := COALESCE((v_line->>'uom_id')::UUID,
                   (SELECT inventory_uom_id FROM items WHERE id = v_item_id));
    v_unit_cost := COALESCE((v_line->>'unit_cost')::NUMERIC,
                    (SELECT COALESCE(avg_cost, 0) FROM items WHERE id = v_item_id));

    -- For wastage, ensure quantity is negative
    IF upper(p_doc_type) = 'WASTAGE' AND v_qty > 0 THEN
      v_qty := -v_qty;
    END IF;

    INSERT INTO inventory_document_lines (
      document_id, line_number, item_id, uom_id, quantity, unit_cost,
      notes
    ) VALUES (
      v_doc_id, v_line_num, v_item_id, v_uom_id, v_qty, v_unit_cost,
      v_line->>'notes'
    );
  END LOOP;

  -- Post
  UPDATE inventory_documents SET status = 'posted' WHERE id = v_doc_id;

  RETURN jsonb_build_object(
    'success', true,
    'doc_id', v_doc_id,
    'doc_number', v_doc_number,
    'doc_type', v_effective_type,
    'lines', v_line_num,
    'message', p_doc_type || ' posted successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_adjustment(UUID, UUID, UUID, TEXT, JSONB, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 5) REPORT VIEWS
-- ─────────────────────────────────────────────────────────────────

-- 5a. v_stock_on_hand — Stock on hand by warehouse with item names
CREATE OR REPLACE VIEW public.v_stock_on_hand AS
SELECT
  soh.id,
  soh.company_id,
  w.branch_id,
  soh.warehouse_id,
  w.name           AS warehouse_name,
  w.warehouse_type,
  soh.item_id,
  i.code           AS item_code,
  i.name           AS item_name,
  u.name           AS uom_name,
  u.code           AS uom_code,
  soh.qty_on_hand,
  soh.total_value,
  i.avg_cost,
  soh.last_movement_at,
  -- Reorder indicators
  COALESCE(rr.min_level, i.reorder_level, 0) AS min_level,
  COALESCE(rr.max_level, 0)                  AS max_level,
  CASE
    WHEN soh.qty_on_hand <= 0 THEN 'OUT_OF_STOCK'
    WHEN soh.qty_on_hand <= COALESCE(rr.min_level, i.reorder_level, 0) THEN 'LOW_STOCK'
    WHEN COALESCE(rr.max_level, 0) > 0
     AND soh.qty_on_hand >= rr.max_level THEN 'OVER_STOCK'
    ELSE 'OK'
  END AS stock_status
FROM stock_on_hand soh
JOIN warehouses w ON w.id = soh.warehouse_id
JOIN items i      ON i.id = soh.item_id
LEFT JOIN uom u   ON u.id = i.inventory_uom_id
LEFT JOIN reorder_rules rr ON rr.warehouse_id = soh.warehouse_id
                            AND rr.item_id = soh.item_id AND rr.is_active = true;


-- 5b. v_stock_movements — Ledger with readable context
CREATE OR REPLACE VIEW public.v_stock_movements AS
SELECT
  il.id,
  il.company_id,
  il.branch_id,
  il.warehouse_id,
  w.name            AS warehouse_name,
  il.item_id,
  i.code            AS item_code,
  i.name            AS item_name,
  il.document_id,
  il.doc_type,
  il.doc_number,
  il.direction,
  il.quantity,
  il.unit_cost,
  il.total_cost,
  il.batch_no,
  il.expiry_date,
  il.posted_at,
  il.posted_by,
  p.full_name       AS posted_by_name,
  -- Reference info
  il.reference_id,
  il.reference_type
FROM inventory_ledger il
JOIN warehouses w ON w.id = il.warehouse_id
JOIN items i      ON i.id = il.item_id
LEFT JOIN profiles p ON p.id = il.posted_by;


-- 5c. v_kitchen_consumption — Per-kitchen daily consumption
CREATE OR REPLACE VIEW public.v_kitchen_consumption AS
SELECT
  il.warehouse_id,
  w.name                           AS kitchen_name,
  il.item_id,
  i.code                           AS item_code,
  i.name                           AS item_name,
  il.posted_at::DATE               AS consumption_date,
  SUM(il.quantity)                 AS total_qty_consumed,
  SUM(il.total_cost)              AS total_cost,
  COUNT(DISTINCT il.document_id)  AS num_orders
FROM inventory_ledger il
JOIN warehouses w ON w.id = il.warehouse_id AND w.warehouse_type IN ('kitchen','bar')
JOIN items i      ON i.id = il.item_id
WHERE il.doc_type = 'BOM_DEDUCT'
  AND il.direction = 'OUT'
GROUP BY il.warehouse_id, w.name, il.item_id, i.code, i.name, il.posted_at::DATE;


-- ─────────────────────────────────────────────────────────────────
-- 6) low_stock_alerts() — Returns items below min level
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.low_stock_alerts(
  p_company_id    UUID DEFAULT NULL,
  p_branch_id     UUID DEFAULT NULL,
  p_warehouse_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  warehouse_id    UUID,
  warehouse_name  TEXT,
  warehouse_type  TEXT,
  item_id         UUID,
  item_code       TEXT,
  item_name       TEXT,
  qty_on_hand     NUMERIC,
  min_level       NUMERIC,
  reorder_qty     NUMERIC,
  deficit         NUMERIC,
  stock_status    TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.warehouse_id,
    v.warehouse_name,
    v.warehouse_type,
    v.item_id,
    v.item_code,
    v.item_name,
    v.qty_on_hand,
    v.min_level,
    COALESCE(rr.reorder_qty, i.reorder_qty, 0) AS reorder_qty,
    v.min_level - v.qty_on_hand                 AS deficit,
    v.stock_status
  FROM v_stock_on_hand v
  JOIN items i ON i.id = v.item_id
  LEFT JOIN reorder_rules rr ON rr.warehouse_id = v.warehouse_id
                              AND rr.item_id = v.item_id AND rr.is_active = true
  WHERE v.stock_status IN ('LOW_STOCK','OUT_OF_STOCK')
    AND (p_company_id IS NULL    OR v.company_id   = p_company_id)
    AND (p_branch_id IS NULL     OR v.branch_id    = p_branch_id)
    AND (p_warehouse_id IS NULL  OR v.warehouse_id = p_warehouse_id)
  ORDER BY
    CASE v.stock_status WHEN 'OUT_OF_STOCK' THEN 0 ELSE 1 END,
    (v.min_level - v.qty_on_hand) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.low_stock_alerts(UUID, UUID, UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 7) Enhanced post_grn() — Wraps existing with ledger posting
-- ─────────────────────────────────────────────────────────────────
-- The existing post_grn only sets status='posted' on goods_receipts.
-- It does NOT create inventory_documents or update stock_on_hand.
-- This upgrade makes it also create a GRN inventory document.

CREATE OR REPLACE FUNCTION public.post_grn(p_grn_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grn          RECORD;
  v_doc_id       UUID;
  v_doc_number   TEXT;
  v_line         RECORD;
  v_line_num     INT := 0;
BEGIN
  -- Fetch GRN
  SELECT * INTO v_grn FROM goods_receipts WHERE id = p_grn_id;
  IF v_grn IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'GRN not found: ' || p_grn_id);
  END IF;

  IF v_grn.status != 'draft' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'GRN "' || v_grn.doc_number || '" is already ' || v_grn.status);
  END IF;

  -- Idempotency: check if inventory doc already exists for this GRN
  IF EXISTS (
    SELECT 1 FROM inventory_documents
    WHERE reference_id = p_grn_id AND reference_type = 'grn'
      AND doc_type = 'GRN' AND status != 'cancelled'
  ) THEN
    -- Already posted, just mark GRN
    UPDATE goods_receipts SET status = 'posted', posted_at = now(), posted_by = auth.uid()
    WHERE id = p_grn_id;
    RETURN jsonb_build_object('success', true, 'doc_number', v_grn.doc_number,
      'message', 'GRN already has inventory doc, marked as posted');
  END IF;

  -- Create inventory document
  v_doc_number := generate_inv_doc_number(v_grn.company_id, 'GRN');

  INSERT INTO inventory_documents (
    company_id, branch_id, doc_type, doc_number, doc_date,
    warehouse_id, supplier_id, reference_id, reference_type,
    status, remarks, created_by
  ) VALUES (
    v_grn.company_id, v_grn.branch_id, 'GRN', v_doc_number, v_grn.doc_date,
    v_grn.warehouse_id, v_grn.supplier_id, p_grn_id, 'grn',
    'draft', 'Auto-generated from GRN ' || v_grn.doc_number, auth.uid()
  ) RETURNING id INTO v_doc_id;

  -- Copy lines
  FOR v_line IN
    SELECT * FROM goods_receipt_lines WHERE grn_id = p_grn_id ORDER BY line_number
  LOOP
    v_line_num := v_line_num + 1;
    INSERT INTO inventory_document_lines (
      document_id, line_number, item_id, uom_id, quantity, unit_cost,
      batch_no, expiry_date, notes
    ) VALUES (
      v_doc_id, v_line_num, v_line.item_id, v_line.uom_id, v_line.quantity,
      v_line.unit_cost, v_line.batch_no, v_line.expiry_date, v_line.notes
    );
  END LOOP;

  -- Post the inventory document (triggers ledger + SOH updates)
  UPDATE inventory_documents SET status = 'posted' WHERE id = v_doc_id;

  -- Mark GRN as posted
  UPDATE goods_receipts SET status = 'posted', posted_at = now(), posted_by = auth.uid()
  WHERE id = p_grn_id;

  RETURN jsonb_build_object(
    'success', true,
    'grn_doc_number', v_grn.doc_number,
    'inv_doc_number', v_doc_number,
    'inv_doc_id', v_doc_id,
    'lines', v_line_num,
    'message', 'GRN posted and stock updated'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
