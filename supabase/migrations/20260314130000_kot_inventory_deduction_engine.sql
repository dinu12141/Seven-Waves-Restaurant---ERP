-- ============================================================
-- Migration: KOT Inventory Deduction Engine
-- Date: 2026-03-14
-- 
-- AUDIT FINDINGS:
--   ✗ deduct_inv_for_kot() joined against `kot_items` (table doesn't exist).
--   ✗ No idempotency mechanism at KOT batch level.
--   ✗ No reversal logic for order/KOT cancellations.
-- ============================================================

-- ── STEP 1: Idempotency + audit log ──────────────────────────────
CREATE TABLE IF NOT EXISTS kot_deduction_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kot_batch_id    UUID NOT NULL REFERENCES kot_batches(id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    kitchen_id      UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
    warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    inv_document_id UUID REFERENCES inventory_documents(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'deducted', -- deducted|reversed|failed
    item_count      INT  DEFAULT 0,
    deducted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reversed_at     TIMESTAMPTZ,
    reversal_doc_id UUID REFERENCES inventory_documents(id) ON DELETE SET NULL,
    error_msg       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_kdl_active_batch
  ON kot_deduction_log(kot_batch_id) WHERE status = 'deducted';

CREATE INDEX IF NOT EXISTS idx_kdl_order   ON kot_deduction_log(order_id);
CREATE INDEX IF NOT EXISTS idx_kdl_branch  ON kot_deduction_log(branch_id);
CREATE INDEX IF NOT EXISTS idx_kdl_status  ON kot_deduction_log(status, deducted_at);
CREATE INDEX IF NOT EXISTS idx_kdl_kitchen ON kot_deduction_log(kitchen_id, deducted_at);

ALTER TABLE kot_deduction_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kdl_admin_all ON kot_deduction_log;
DROP POLICY IF EXISTS kdl_inventory_select ON kot_deduction_log;
DROP POLICY IF EXISTS kdl_finance_select ON kot_deduction_log;

CREATE POLICY kdl_admin_all ON kot_deduction_log FOR ALL USING (is_admin() OR is_manager());
CREATE POLICY kdl_inventory_select ON kot_deduction_log FOR SELECT
  USING (auth_has_role('inventory') AND branch_id = ANY(auth_branch_ids()));
CREATE POLICY kdl_finance_select ON kot_deduction_log FOR SELECT
  USING (is_finance() AND branch_id = ANY(auth_branch_ids()));

-- ── STEP 2: Supporting indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kot_lines_batch ON kot_lines(kot_batch_id);
CREATE INDEX IF NOT EXISTS idx_kot_lines_oi    ON kot_lines(order_item_id);
CREATE INDEX IF NOT EXISTS idx_invdoc_ref      ON inventory_documents(reference_id, reference_type, status);
CREATE INDEX IF NOT EXISTS idx_il_reference    ON inventory_ledger(reference_id, reference_type);

-- ── STEP 3: process_kot_inventory() ──────────────────────────────
CREATE OR REPLACE FUNCTION public.process_kot_inventory(p_kot_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_batch         RECORD;
    v_order         RECORD;
    v_company_id    UUID;
    v_warehouse_id  UUID;
    v_doc_id        UUID;
    v_doc_number    TEXT;
    v_log_id        UUID;
    v_line_no       INT := 0;
    v_lines_added   INT := 0;
    v_kl            RECORD;
    v_oi            RECORD;
    v_recipe        RECORD;
    v_ri            RECORD;
    v_needed_qty    NUMERIC;
    v_now           TIMESTAMPTZ := now();
BEGIN
    SELECT kb.*, b.company_id AS co_id INTO v_batch FROM kot_batches kb JOIN branches b ON b.id = kb.branch_id WHERE kb.id = p_kot_batch_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'KOT batch not found'); END IF;
    
    v_company_id := v_batch.co_id;
    SELECT * INTO v_order FROM orders WHERE id = v_batch.order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;

    IF EXISTS (SELECT 1 FROM kot_deduction_log WHERE kot_batch_id = p_kot_batch_id AND status = 'deducted') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already deducted.', 'kot_batch_id', p_kot_batch_id);
    END IF;

    BEGIN
        IF NOT is_module_enabled(v_company_id, 'AUTO_DEDUCT') THEN RETURN jsonb_build_object('success', true, 'message', 'AUTO_DEDUCT disabled'); END IF;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    SELECT id INTO v_warehouse_id FROM warehouses WHERE kitchen_id = v_batch.kitchen_id AND is_active = true AND company_id = v_company_id ORDER BY is_default DESC LIMIT 1;
    IF v_warehouse_id IS NULL THEN SELECT id INTO v_warehouse_id FROM warehouses WHERE branch_id = v_batch.branch_id AND is_active = true AND is_default = true AND company_id = v_company_id LIMIT 1; END IF;
    IF v_warehouse_id IS NULL THEN SELECT id INTO v_warehouse_id FROM warehouses WHERE company_id = v_company_id AND is_active = true ORDER BY is_default DESC LIMIT 1; END IF;
    IF v_warehouse_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'No active warehouse found'); END IF;

    v_doc_number := 'KOT-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-' || LPAD(v_batch.kot_number::TEXT, 5, '0') || '-' || LEFT(p_kot_batch_id::TEXT, 8);

    INSERT INTO inventory_documents (company_id, branch_id, doc_type, doc_number, doc_date, warehouse_id, reference_id, reference_type, status, remarks, created_by, posting_date)
    VALUES (v_company_id, v_batch.branch_id, 'KOT_CONSUMPTION', v_doc_number, CURRENT_DATE, v_warehouse_id, p_kot_batch_id, 'kot_batch', 'draft', 'KOT #' || v_batch.kot_number, auth.uid(), CURRENT_DATE)
    RETURNING id INTO v_doc_id;

    FOR v_kl IN SELECT kl.id, kl.qty, kl.status, kl.order_item_id FROM kot_lines kl WHERE kl.kot_batch_id = p_kot_batch_id AND COALESCE(kl.status, '') != 'cancelled' LOOP
        SELECT * INTO v_oi FROM order_items WHERE id = v_kl.order_item_id;
        IF NOT FOUND THEN CONTINUE; END IF;

        v_recipe := NULL;
        IF v_oi.variant_id IS NOT NULL THEN SELECT * INTO v_recipe FROM recipes WHERE menu_item_id = v_oi.menu_item_id AND variant_id = v_oi.variant_id AND is_active = true; END IF;
        IF v_recipe IS NULL THEN SELECT * INTO v_recipe FROM recipes WHERE menu_item_id = v_oi.menu_item_id AND variant_id IS NULL AND is_active = true; END IF;
        IF v_recipe IS NULL THEN CONTINUE; END IF;

        FOR v_ri IN SELECT ri.item_id, ri.qty_per_serving, ri.uom_id, i.inventory_uom_id, i.avg_cost FROM recipe_items ri JOIN items i ON i.id = ri.item_id WHERE ri.recipe_id = v_recipe.id LOOP
            v_needed_qty := v_kl.qty * v_ri.qty_per_serving;
            BEGIN
                IF v_ri.uom_id IS NOT NULL AND v_ri.uom_id IS DISTINCT FROM v_ri.inventory_uom_id THEN v_needed_qty := get_converted_qty(v_ri.uom_id, v_ri.inventory_uom_id, v_needed_qty); END IF;
            EXCEPTION WHEN OTHERS THEN NULL; END;

            v_line_no := v_line_no + 1;
            INSERT INTO inventory_document_lines (document_id, line_number, item_id, uom_id, quantity, unit_cost)
            VALUES (v_doc_id, v_line_no, v_ri.item_id, COALESCE(v_ri.inventory_uom_id, v_ri.uom_id), v_needed_qty, COALESCE(v_ri.avg_cost, 0));

            INSERT INTO inventory_ledger (company_id, branch_id, warehouse_id, item_id, document_id, doc_type, doc_number, direction, quantity, unit_cost, total_cost, reference_id, reference_type, posted_by, posted_at)
            VALUES (v_company_id, v_batch.branch_id, v_warehouse_id, v_ri.item_id, v_doc_id, 'KOT_CONSUMPTION', v_doc_number, 'OUT', v_needed_qty, COALESCE(v_ri.avg_cost, 0), v_needed_qty * COALESCE(v_ri.avg_cost, 0), p_kot_batch_id, 'kot_batch', auth.uid(), v_now);

            INSERT INTO stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value, last_movement_at, updated_at)
            VALUES (v_company_id, v_warehouse_id, v_ri.item_id, -v_needed_qty, -(v_needed_qty * COALESCE(v_ri.avg_cost, 0)), v_now, v_now)
            ON CONFLICT (warehouse_id, item_id) DO UPDATE SET qty_on_hand = stock_on_hand.qty_on_hand - EXCLUDED.qty_on_hand * -1, total_value = stock_on_hand.total_value - EXCLUDED.total_value * -1, last_movement_at = v_now, updated_at = v_now;
            v_lines_added := v_lines_added + 1;
        END LOOP;
    END LOOP;

    IF v_lines_added > 0 THEN
        UPDATE inventory_documents SET status = 'posted', posted_at = v_now, total_qty = v_lines_added::NUMERIC, total_cost = (SELECT COALESCE(SUM(quantity * unit_cost), 0) FROM inventory_document_lines WHERE document_id = v_doc_id) WHERE id = v_doc_id;
    ELSE
        UPDATE inventory_documents SET status = 'draft_empty' WHERE id = v_doc_id;
    END IF;

    INSERT INTO kot_deduction_log (kot_batch_id, order_id, branch_id, kitchen_id, warehouse_id, inv_document_id, status, item_count, deducted_at)
    VALUES (p_kot_batch_id, v_batch.order_id, v_batch.branch_id, v_batch.kitchen_id, v_warehouse_id, v_doc_id, 'deducted', v_lines_added, v_now) RETURNING id INTO v_log_id;

    BEGIN
        INSERT INTO order_status_events (order_id, event_code, payload) VALUES (v_batch.order_id, 'kot_inv_deducted', jsonb_build_object('batch', p_kot_batch_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('success', true, 'lines_deducted', v_lines_added);
EXCEPTION WHEN OTHERS THEN
    BEGIN
        UPDATE inventory_documents SET status = 'failed' WHERE id = v_doc_id;
        INSERT INTO kot_deduction_log (kot_batch_id, order_id, branch_id, kitchen_id, warehouse_id, status, error_msg) VALUES (p_kot_batch_id, v_batch.order_id, v_batch.branch_id, v_batch.kitchen_id, v_warehouse_id, 'failed', SQLERRM);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── STEP 4: reverse_kot_inventory() ──────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_kot_inventory(p_kot_batch_id UUID, p_reason TEXT DEFAULT 'KOT cancelled')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_log           RECORD;
    v_batch         RECORD;
    v_rev_doc_id    UUID;
    v_rev_doc_no    TEXT;
    v_line_no       INT := 0;
    v_lines_rev     INT := 0;
    v_il            RECORD;
    v_now           TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_log FROM kot_deduction_log WHERE kot_batch_id = p_kot_batch_id AND status = 'deducted' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', true, 'message', 'Nothing reversed'); END IF;

    SELECT * INTO v_batch FROM kot_batches WHERE id = p_kot_batch_id;
    v_rev_doc_no := 'KOT-REV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LEFT(p_kot_batch_id::TEXT, 8);

    INSERT INTO inventory_documents (company_id, branch_id, doc_type, doc_number, doc_date, warehouse_id, reference_id, reference_type, status, remarks, posting_date, cancels_document_id)
    SELECT company_id, branch_id, 'KOT_REVERSAL', v_rev_doc_no, CURRENT_DATE, warehouse_id, p_kot_batch_id, 'kot_batch', 'draft', 'Reversal: ' || p_reason, CURRENT_DATE, id
    FROM inventory_documents WHERE id = v_log.inv_document_id RETURNING id INTO v_rev_doc_id;

    FOR v_il IN SELECT * FROM inventory_ledger WHERE reference_id = p_kot_batch_id AND reference_type = 'kot_batch' AND direction = 'OUT' LOOP
        v_line_no := v_line_no + 1;
        INSERT INTO inventory_ledger (company_id, branch_id, warehouse_id, item_id, document_id, doc_type, doc_number, direction, quantity, unit_cost, total_cost, reference_id, reference_type, posted_at)
        VALUES (v_il.company_id, v_il.branch_id, v_il.warehouse_id, v_il.item_id, v_rev_doc_id, 'KOT_REVERSAL', v_rev_doc_no, 'IN', v_il.quantity, v_il.unit_cost, v_il.total_cost, p_kot_batch_id, 'kot_batch', v_now);

        INSERT INTO stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value, last_movement_at, updated_at)
        VALUES (v_il.company_id, v_il.warehouse_id, v_il.item_id, v_il.quantity, v_il.total_cost, v_now, v_now)
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET qty_on_hand = stock_on_hand.qty_on_hand + EXCLUDED.qty_on_hand, total_value = stock_on_hand.total_value + EXCLUDED.total_value, last_movement_at = v_now, updated_at = v_now;

        INSERT INTO inventory_document_lines (document_id, line_number, item_id, uom_id, quantity, unit_cost)
        SELECT v_rev_doc_id, v_line_no, idl.item_id, idl.uom_id, idl.quantity, idl.unit_cost FROM inventory_document_lines idl WHERE idl.document_id = v_log.inv_document_id AND idl.item_id = v_il.item_id AND idl.line_number = v_line_no LIMIT 1 ON CONFLICT DO NOTHING;
        v_lines_rev := v_lines_rev + 1;
    END LOOP;

    UPDATE inventory_documents SET status = 'posted', posted_at = v_now, total_qty = v_lines_rev::NUMERIC WHERE id = v_rev_doc_id;
    UPDATE inventory_documents SET status = 'cancelled', cancelled_at = v_now WHERE id = v_log.inv_document_id;
    UPDATE kot_deduction_log SET status = 'reversed', reversed_at = v_now, reversal_doc_id = v_rev_doc_id WHERE id = v_log.id;
    
    RETURN jsonb_build_object('success', true, 'lines_reversed', v_lines_rev);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ── STEP 5: Triggers ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_kot_batch_inventory() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status IN ('sent', 'preparing', 'accepted') AND (OLD.status IS DISTINCT FROM NEW.status) AND OLD.status NOT IN ('sent', 'preparing', 'accepted') THEN
        BEGIN PERFORM public.process_kot_inventory(NEW.id); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
        BEGIN PERFORM public.reverse_kot_inventory(NEW.id, 'KOT batch cancelled'); EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kot_batch_inventory ON kot_batches;
CREATE TRIGGER trg_kot_batch_inventory AFTER UPDATE ON kot_batches FOR EACH ROW EXECUTE FUNCTION public.trg_fn_kot_batch_inventory();

CREATE OR REPLACE FUNCTION public.trg_fn_order_cancel_inventory() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch_id UUID;
BEGIN
    IF NEW.status IN ('cancelled', 'voided') AND OLD.status NOT IN ('cancelled', 'voided') THEN
        FOR v_batch_id IN SELECT id FROM kot_batches WHERE order_id = NEW.id AND status NOT IN ('cancelled') LOOP
            BEGIN PERFORM public.reverse_kot_inventory(v_batch_id, 'Order ' || NEW.status); EXCEPTION WHEN OTHERS THEN NULL; END;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_cancel_inventory ON orders;
CREATE TRIGGER trg_order_cancel_inventory AFTER UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION public.trg_fn_order_cancel_inventory();

-- ── STEP 6: RPC wrappers ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_process_kot_inventory(p_kot_batch_id UUID) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN public.process_kot_inventory(p_kot_batch_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reverse_kot_inventory(p_kot_batch_id UUID, p_reason TEXT DEFAULT 'Manual reversal') RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN public.reverse_kot_inventory(p_kot_batch_id, p_reason);
END;
$$;

-- ── STEP 7: deduct_inv_for_kot() fixed ───────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_inv_for_kot(p_kot_id UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.process_kot_inventory(kb.id) FROM kot_batches kb JOIN kot_lines kl ON kl.kot_batch_id = kb.id WHERE kb.order_id IN (SELECT order_id FROM kot_tickets WHERE id = p_kot_id) GROUP BY kb.id;
END;
$$;
