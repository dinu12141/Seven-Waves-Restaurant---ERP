-- ═══════════════════════════════════════════════════════════════════
-- Stock Queue Orchestration  (migration: stock_queue_orchestration)
-- Applied: 2026-02-28
--
-- Centralizes all stock issuance through stock_queue with configurable
-- issue_stage: on_accept | on_kitchen_start | on_paid
--
-- Replaces the old trg_deduct_inv_on_pay → deduct_inv_for_order direct
-- trigger with a stock_queue-aware orchestration layer.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Core function: issue_stock_for_order ─────────────────────
-- Resolves BOM/recipe for each order_item, creates inventory_documents
-- (BOM_DEDUCT), posts them, marks stock_queue.status='issued'
-- Fully idempotent: skips if already issued or document exists.

CREATE OR REPLACE FUNCTION public.issue_stock_for_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_company_id UUID;
    v_sq RECORD;
    v_item RECORD;
    v_recipe RECORD;
    v_ri RECORD;
    v_needed_qty NUMERIC;
    v_doc_number TEXT;
    v_doc_id UUID;
    rec_wh RECORD;
    v_docs_created INT := 0;
    v_lines_created INT := 0;
    v_warnings JSONB := '[]'::jsonb;
BEGIN
    -- Fetch order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;
    v_company_id := v_order.company_id;

    -- Check stock_queue status (idempotency)
    SELECT * INTO v_sq FROM stock_queue WHERE order_id = p_order_id FOR UPDATE SKIP LOCKED;
    IF v_sq IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'No pending stock_queue entry for order', 'docs_created', 0);
    END IF;

    IF v_sq.status IN ('issued', 'processed', 'completed') THEN
        RETURN jsonb_build_object('success', true, 'message', 'Stock already issued', 'docs_created', 0);
    END IF;

    -- Module guard
    IF NOT is_module_enabled(v_company_id, 'AUTO_DEDUCT') THEN
        UPDATE stock_queue SET status = 'issued', updated_at = now() WHERE id = v_sq.id;
        RETURN jsonb_build_object('success', true, 'message', 'AUTO_DEDUCT disabled, skipped', 'docs_created', 0);
    END IF;

    -- Secondary idempotency: check if inventory_documents already exist for this order
    PERFORM 1 FROM inventory_documents
    WHERE reference_id = p_order_id
      AND reference_type = 'order'
      AND doc_type = 'BOM_DEDUCT'
      AND status != 'cancelled';
    IF FOUND THEN
        UPDATE stock_queue SET status = 'issued', updated_at = now() WHERE id = v_sq.id;
        RETURN jsonb_build_object('success', true, 'message', 'Documents already exist', 'docs_created', 0);
    END IF;

    -- Build BOM requirements into temp table
    CREATE TEMPORARY TABLE IF NOT EXISTS _temp_bom_reqs (
        warehouse_id UUID,
        item_id UUID,
        uom_id UUID,
        qty NUMERIC,
        unit_cost NUMERIC DEFAULT 0
    ) ON COMMIT DROP;
    DELETE FROM _temp_bom_reqs;

    -- Iterate order items -> resolve recipe -> accumulate ingredient requirements
    FOR v_item IN
        SELECT oi.*, w.id AS resolved_warehouse_id
        FROM order_items oi
        LEFT JOIN warehouses w ON w.kitchen_id = oi.kitchen_id
                          AND w.company_id = v_company_id
                          AND w.is_active = true
        WHERE oi.order_id = p_order_id
          AND oi.status != 'cancelled'
    LOOP
        v_recipe := NULL;

        -- Try variant-specific recipe first
        IF v_item.variant_id IS NOT NULL THEN
            SELECT * INTO v_recipe FROM recipes
            WHERE menu_item_id = v_item.menu_item_id
              AND variant_id = v_item.variant_id
              AND is_active = true;
        END IF;

        -- Fallback to base recipe
        IF v_recipe IS NULL THEN
            SELECT * INTO v_recipe FROM recipes
            WHERE menu_item_id = v_item.menu_item_id
              AND variant_id IS NULL
              AND is_active = true;
        END IF;

        IF v_recipe IS NULL THEN
            CONTINUE;
        END IF;

        -- Fallback warehouse resolution
        IF v_item.resolved_warehouse_id IS NULL THEN
            SELECT id INTO v_item.resolved_warehouse_id
            FROM warehouses
            WHERE company_id = v_company_id AND branch_id = v_order.branch_id
              AND is_default = true AND is_active = true LIMIT 1;
        END IF;
        IF v_item.resolved_warehouse_id IS NULL THEN
            SELECT id INTO v_item.resolved_warehouse_id
            FROM warehouses
            WHERE company_id = v_company_id AND branch_id = v_order.branch_id
              AND warehouse_type = 'main_store' AND is_active = true LIMIT 1;
        END IF;
        IF v_item.resolved_warehouse_id IS NULL THEN
            CONTINUE;
        END IF;

        FOR v_ri IN
            SELECT ri.*, i.inventory_uom_id, COALESCE(i.avg_cost, 0) AS avg_cost
            FROM recipe_items ri
            JOIN items i ON i.id = ri.item_id
            WHERE ri.recipe_id = v_recipe.id
        LOOP
            v_needed_qty := (v_ri.qty_per_serving / GREATEST(v_recipe.yield_qty, 1)) * v_item.quantity;
            IF v_ri.uom_id IS DISTINCT FROM v_ri.inventory_uom_id AND v_ri.inventory_uom_id IS NOT NULL THEN
                v_needed_qty := get_converted_qty(v_ri.uom_id, v_ri.inventory_uom_id, v_needed_qty);
            END IF;

            IF EXISTS (SELECT 1 FROM _temp_bom_reqs WHERE warehouse_id = v_item.resolved_warehouse_id AND item_id = v_ri.item_id) THEN
                UPDATE _temp_bom_reqs
                SET qty = qty + v_needed_qty
                WHERE warehouse_id = v_item.resolved_warehouse_id AND item_id = v_ri.item_id;
            ELSE
                INSERT INTO _temp_bom_reqs VALUES (v_item.resolved_warehouse_id, v_ri.item_id, v_ri.inventory_uom_id, v_needed_qty, v_ri.avg_cost);
            END IF;
        END LOOP;
    END LOOP;

    -- Generate inventory documents per warehouse
    FOR rec_wh IN SELECT DISTINCT warehouse_id FROM _temp_bom_reqs LOOP
        v_doc_number := generate_inv_doc_number(v_company_id, 'BOM_DEDUCT');

        -- 1. INSERT AS DRAFT
        INSERT INTO inventory_documents (
            company_id, branch_id, doc_type, doc_number, doc_date,
            warehouse_id, reference_id, reference_type, status,
            remarks, created_by
        ) VALUES (
            v_company_id, v_order.branch_id, 'BOM_DEDUCT', v_doc_number, CURRENT_DATE,
            rec_wh.warehouse_id, p_order_id, 'order', 'draft',
            'Auto BOM deduction for Order #' || v_order.order_number,
            v_order.assigned_waiter_id
        ) RETURNING id INTO v_doc_id;

        -- 2. INSERT LINES (no trigger violation on draft)
        WITH inserted AS (
            INSERT INTO inventory_document_lines (
                document_id, line_number, item_id, uom_id, quantity, unit_cost
            )
            SELECT
                v_doc_id,
                ROW_NUMBER() OVER (ORDER BY t.item_id),
                t.item_id, t.uom_id, t.qty, t.unit_cost
            FROM _temp_bom_reqs t
            WHERE t.warehouse_id = rec_wh.warehouse_id
            RETURNING 1
        )
        SELECT count(*) INTO v_lines_created FROM inserted;

        -- Update document totals before posting
        UPDATE inventory_documents 
        SET total_qty = (SELECT COALESCE(SUM(quantity), 0) FROM inventory_document_lines WHERE document_id = v_doc_id),
            total_cost = (SELECT COALESCE(SUM(quantity * unit_cost), 0) FROM inventory_document_lines WHERE document_id = v_doc_id)
        WHERE id = v_doc_id;

        -- 3. POST THE DOCUMENT (This triggers trg_post_inventory which does ledger and stock update math)
        UPDATE inventory_documents
        SET status = 'posted'
        WHERE id = v_doc_id;

        v_docs_created := v_docs_created + 1;
    END LOOP;

    -- Mark stock_queue as issued
    UPDATE stock_queue SET status = 'issued', updated_at = now() WHERE id = v_sq.id;

    -- Log order event
    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, created_at)
    VALUES (p_order_id, 'stock_pending', 'stock_issued', v_order.assigned_waiter_id, now());

    RETURN jsonb_build_object(
        'success', true,
        'docs_created', v_docs_created,
        'lines_created', v_lines_created,
        'message', 'Stock issued successfully via trigger orchestration'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_stock_for_order(uuid) TO authenticated;

-- ── 2. Dispatcher: try_issue_stock_by_stage ─────────────────────
CREATE OR REPLACE FUNCTION public.try_issue_stock_by_stage(
    p_order_id uuid,
    p_current_stage text  -- 'on_accept' | 'on_kitchen_start' | 'on_paid'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sq RECORD;
BEGIN
    SELECT * INTO v_sq
    FROM stock_queue
    WHERE order_id = p_order_id
      AND status = 'pending'
      AND issue_stage = p_current_stage;

    IF v_sq IS NOT NULL THEN
        BEGIN
            PERFORM issue_stock_for_order(p_order_id);
        EXCEPTION WHEN OTHERS THEN
            PERFORM mark_stock_queue_failed(p_order_id, SQLERRM);
        END;
    END IF;
END;
$$;

-- ── 3. Trigger: on_accept stage ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_stock_on_order_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
        PERFORM try_issue_stock_by_stage(NEW.id, 'on_accept');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_on_order_accept ON public.orders;
CREATE TRIGGER trg_stock_on_order_accept
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    EXECUTE FUNCTION trg_fn_stock_on_order_accept();

-- ── 4. Trigger: on_kitchen_start stage ──────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_stock_on_kot_preparing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'preparing' AND (OLD.status IS DISTINCT FROM 'preparing') THEN
        PERFORM try_issue_stock_by_stage(NEW.order_id, 'on_kitchen_start');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_on_kot_preparing ON public.kot_tickets;
CREATE TRIGGER trg_stock_on_kot_preparing
    AFTER UPDATE OF status ON public.kot_tickets
    FOR EACH ROW
    WHEN (NEW.status = 'preparing' AND OLD.status IS DISTINCT FROM 'preparing')
    EXECUTE FUNCTION trg_fn_stock_on_kot_preparing();

-- ── 5. Trigger: on_paid stage (replaces old trg_deduct_inv_on_pay) ──
CREATE OR REPLACE FUNCTION public.trg_fn_stock_on_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid') THEN
        PERFORM try_issue_stock_by_stage(NEW.id, 'on_paid');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deduct_inv_on_pay ON public.orders;
DROP TRIGGER IF EXISTS trg_stock_on_order_paid ON public.orders;
CREATE TRIGGER trg_stock_on_order_paid
    AFTER UPDATE OF payment_status ON public.orders
    FOR EACH ROW
    WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
    EXECUTE FUNCTION trg_fn_stock_on_order_paid();

-- ── 6. Failure marker ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_stock_queue_failed(p_order_id uuid, p_reason text DEFAULT 'unknown')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE stock_queue
    SET status = 'failed', updated_at = now()
    WHERE order_id = p_order_id AND status = 'pending';

    INSERT INTO order_status_events (order_id, old_status, new_status, created_by, created_at)
    VALUES (p_order_id, 'stock_pending', 'stock_failed:' || p_reason, null, now());
END;
$$;

-- ── 7. Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_queue_stage ON public.stock_queue(issue_stage);
CREATE INDEX IF NOT EXISTS idx_stock_queue_pending ON public.stock_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inv_docs_ref ON public.inventory_documents(reference_id, reference_type);
