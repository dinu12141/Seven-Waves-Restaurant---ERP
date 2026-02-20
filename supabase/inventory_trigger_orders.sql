-- =====================================================
-- TRIGGER: AUTO-DEDUCT INVENTORY ON RECIPE (BOM)
-- =====================================================
-- 1. Helper: UOM Conversion
-- 2. Function: Process Deduction per Order
-- 3. Trigger: Monitor Order Payment Status

-- -------------------------------------------------------------------------
-- 1. CONVERT QUANTITY (Simple Base Conversion)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_converted_qty(
    p_uom_id UUID, 
    p_target_uom_id UUID, 
    p_qty NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
    v_from_factor NUMERIC DEFAULT 1;
    v_to_factor NUMERIC DEFAULT 1;
    v_from_base UUID;
    v_to_base UUID;
BEGIN
    -- Short circuit
    IF p_uom_id = p_target_uom_id THEN
        RETURN p_qty;
    END IF;

    -- Check validation
    IF p_target_uom_id IS NULL THEN
        RAISE EXCEPTION 'Target UOM cannot be null';
    END IF;

    -- Get factors (Source)
    SELECT conversion_factor, COALESCE(base_uom_id, id) 
    INTO v_from_factor, v_from_base 
    FROM uom WHERE id = p_uom_id;
    
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Source UOM % not found', p_uom_id; 
    END IF;

    -- Get factors (Target)
    SELECT conversion_factor, COALESCE(base_uom_id, id) 
    INTO v_to_factor, v_to_base 
    FROM uom WHERE id = p_target_uom_id;

    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Target UOM % not found', p_target_uom_id; 
    END IF;

    -- Validate families
    IF v_from_base != v_to_base THEN
        RAISE EXCEPTION 'UOM_CONVERSION_ERROR: Incompatible UOMs (Item UOM vs Recipe UOM)';
    END IF;

    -- Convert: (Qty * FromFactor) / ToFactor
    RETURN (p_qty * v_from_factor) / v_to_factor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------------------------
-- 2. PROCESS DEDUCTION (The Core Logic)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deduct_inv_for_order(p_order_id UUID)
RETURNS VOID AS $$
DECLARE
    v_order RECORD;
    v_company_id UUID;
    v_item RECORD;
    v_recipe RECORD;
    v_ri RECORD;
    v_needed_qty NUMERIC;
    v_doc_number TEXT;
    v_doc_id UUID;
    rec_wh RECORD;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    v_company_id := v_order.company_id;

    -- Module-enabled guard
    IF NOT is_module_enabled(v_company_id, 'AUTO_DEDUCT') THEN
        RETURN; -- Auto-deduction is disabled for this company
    END IF;

    -- 1. Idempotency Check
    PERFORM 1 FROM inventory_documents 
    WHERE reference_id = p_order_id 
      AND reference_type = 'order' 
      AND status != 'cancelled';
    
    IF FOUND THEN
        RETURN; -- Already processed
    END IF;

    -- 2. Build Requirements (Temp Table)
    CREATE TEMPORARY TABLE IF NOT EXISTS temp_bom_reqs (
        warehouse_id UUID,
        item_id UUID,
        uom_id UUID,
        qty NUMERIC
    ) ON COMMIT DROP;
    
    DELETE FROM temp_bom_reqs;

    -- 3. Iterate Order Items
    FOR v_item IN 
        SELECT oi.*, w.id AS warehouse_id
        FROM order_items oi
        JOIN warehouses w ON w.kitchen_id = oi.kitchen_id 
                         AND w.company_id = v_company_id
                         AND w.is_active = true
        WHERE oi.order_id = p_order_id
          AND oi.status != 'cancelled'
    LOOP
        -- Find Recipe (Variant > Base)
        v_recipe := NULL;
        
        IF v_item.variant_id IS NOT NULL THEN
            SELECT * INTO v_recipe FROM recipes 
            WHERE menu_item_id = v_item.menu_item_id 
              AND variant_id = v_item.variant_id
              AND is_active = true;
        END IF;

        IF v_recipe IS NULL THEN
            SELECT * INTO v_recipe FROM recipes 
            WHERE menu_item_id = v_item.menu_item_id 
              AND variant_id IS NULL
              AND is_active = true;
        END IF;

        -- Process Ingredients
        IF v_recipe IS NOT NULL THEN
            FOR v_ri IN 
                SELECT ri.*, i.inventory_uom_id 
                FROM recipe_items ri
                JOIN items i ON i.id = ri.item_id
                WHERE ri.recipe_id = v_recipe.id
            LOOP
                -- Calculate Qty: qty_per_serving * order_qty
                v_needed_qty := (v_ri.qty_per_serving * v_item.quantity);
                
                -- Convert UOM
                v_needed_qty := get_converted_qty(v_ri.uom_id, v_ri.inventory_uom_id, v_needed_qty);

                -- Upsert into Temp
                IF EXISTS (SELECT 1 FROM temp_bom_reqs WHERE warehouse_id = v_item.warehouse_id AND item_id = v_ri.item_id) THEN
                    UPDATE temp_bom_reqs 
                    SET qty = qty + v_needed_qty 
                    WHERE warehouse_id = v_item.warehouse_id AND item_id = v_ri.item_id;
                ELSE
                    INSERT INTO temp_bom_reqs 
                    VALUES (v_item.warehouse_id, v_ri.item_id, v_ri.inventory_uom_id, v_needed_qty);
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    -- 4. Generate Documents (One per Warehouse)
    FOR rec_wh IN SELECT DISTINCT warehouse_id FROM temp_bom_reqs LOOP
        
        -- Get Next Doc Number
        v_doc_number := generate_inv_doc_number(v_company_id, 'BOM_DEDUCT');

        -- Insert Header (Draft)
        INSERT INTO inventory_documents (
            company_id, branch_id, doc_type, doc_number, doc_date,
            warehouse_id, reference_id, reference_type, status,
            remarks, created_by
        ) VALUES (
            v_company_id, v_order.branch_id, 'BOM_DEDUCT', v_doc_number, CURRENT_DATE,
            rec_wh.warehouse_id, p_order_id, 'order', 'draft',
            'Auto-deduction for Order #' || v_order.order_number, v_order.waiter_id
        ) RETURNING id INTO v_doc_id;

        -- Insert Lines (Fetch cost from items table for GIN valuation)
        INSERT INTO inventory_document_lines (
            document_id, line_number, item_id, uom_id, quantity, unit_cost
        )
        SELECT 
            v_doc_id,
            ROW_NUMBER() OVER (ORDER BY t.item_id),
            t.item_id, t.uom_id, t.qty, COALESCE(i.avg_cost, 0)
        FROM temp_bom_reqs t
        JOIN items i ON i.id = t.item_id
        WHERE t.warehouse_id = rec_wh.warehouse_id;

        -- Post Document (Triggers Stock Deduction)
        -- NOTE: If insufficient stock and allow_negative=false, this RAISES EXCEPTION
        -- and rolls back the transaction (blocking the payment).
        UPDATE inventory_documents 
        SET status = 'posted' 
        WHERE id = v_doc_id;

    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------------------------
-- 3. TRIGGER WRAPPER
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_func_deduct_inv()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM deduct_inv_for_order(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------------------------
-- 4. TRIGGER
-- -------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_deduct_inv_on_pay ON orders;

CREATE TRIGGER trg_deduct_inv_on_pay
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND OLD.payment_status != 'paid')
EXECUTE FUNCTION trg_func_deduct_inv();
