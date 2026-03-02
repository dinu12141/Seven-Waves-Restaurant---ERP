-- =====================================================
-- FIX: KOT Flow, Cashier Visibility & Inventory Linking
-- =====================================================

-- 1. Function to Deduct Inventory per KOT (instead of per Order)
-- This ensures that when a new KOT is generated for additional items,
-- those specific items are deducted immediately.
CREATE OR REPLACE FUNCTION deduct_inv_for_kot(p_kot_id UUID)
RETURNS VOID AS $$
DECLARE
    v_kot RECORD;
    v_order RECORD;
    v_company_id UUID;
    v_ki RECORD;
    v_oi RECORD;
    v_recipe RECORD;
    v_ri RECORD;
    v_needed_qty NUMERIC;
    v_doc_number TEXT;
    v_doc_id UUID;
    v_warehouse_id UUID;
BEGIN
    -- Get KOT and Order details
    SELECT * INTO v_kot FROM kot_tickets WHERE id = p_kot_id;
    SELECT * INTO v_order FROM orders WHERE id = v_kot.order_id;
    v_company_id := v_order.company_id;

    -- Module-enabled guard
    IF NOT is_module_enabled(v_company_id, 'AUTO_DEDUCT') THEN
        RETURN;
    END IF;

    -- 1. Idempotency Check (Don't deduct for the same KOT twice)
    PERFORM 1 FROM inventory_documents 
    WHERE reference_id = p_kot_id 
      AND reference_type = 'kot' 
      AND status != 'cancelled';
    
    IF FOUND THEN
        RETURN;
    END IF;

    -- 2. Find the primary warehouse for this kitchen
    SELECT id INTO v_warehouse_id 
    FROM warehouses 
    WHERE kitchen_id = v_kot.kitchen_id 
      AND company_id = v_company_id
      AND is_active = true
    LIMIT 1;

    IF v_warehouse_id IS NULL THEN
        -- Fallback to any active warehouse in the company if kitchen-specific not found
        SELECT id INTO v_warehouse_id 
        FROM warehouses 
        WHERE company_id = v_company_id 
          AND is_active = true 
        LIMIT 1;
    END IF;

    IF v_warehouse_id IS NULL THEN
        RAISE WARNING 'No active warehouse found for company %. Skipping inventory deduction.', v_company_id;
        RETURN;
    END IF;

    -- 3. Create Inventory Document Header
    v_doc_number := generate_inv_doc_number(v_company_id, 'BOM_DEDUCT');

    INSERT INTO inventory_documents (
        company_id, branch_id, doc_type, doc_number, doc_date,
        warehouse_id, reference_id, reference_type, status,
        remarks, created_by
    ) VALUES (
        v_company_id, v_order.branch_id, 'BOM_DEDUCT', v_doc_number, CURRENT_DATE,
        v_warehouse_id, p_kot_id, 'kot', 'draft',
        'Auto-deduction for KOT #' || v_kot.kot_number || ' (Order #' || v_order.order_number || ')', 
        v_order.waiter_id
    ) RETURNING id INTO v_doc_id;

    -- 4. Iterate KOT Items and process Recipes
    FOR v_ki IN 
        SELECT ki.*, oi.menu_item_id, oi.variant_id
        FROM kot_items ki
        JOIN order_items oi ON oi.id = ki.order_item_id
        WHERE ki.kot_id = p_kot_id
          AND ki.status != 'cancelled'
    LOOP
        -- Find Recipe (Variant > Base)
        v_recipe := NULL;
        IF v_ki.variant_id IS NOT NULL THEN
            SELECT * INTO v_recipe FROM recipes 
            WHERE menu_item_id = v_ki.menu_item_id 
              AND variant_id = v_ki.variant_id
              AND is_active = true;
        END IF;

        IF v_recipe IS NULL THEN
            SELECT * INTO v_recipe FROM recipes 
            WHERE menu_item_id = v_ki.menu_item_id 
              AND variant_id IS NULL
              AND is_active = true;
        END IF;

        -- If recipe exists, explode ingredients
        IF v_recipe IS NOT NULL THEN
            FOR v_ri IN 
                SELECT ri.*, i.inventory_uom_id, i.avg_cost
                FROM recipe_items ri
                JOIN items i ON i.id = ri.item_id
                WHERE ri.recipe_id = v_recipe.id
            LOOP
                v_needed_qty := (v_ri.qty_per_serving * v_ki.quantity);
                v_needed_qty := get_converted_qty(v_ri.uom_id, v_ri.inventory_uom_id, v_needed_qty);

                INSERT INTO inventory_document_lines (
                    document_id, line_number, item_id, uom_id, quantity, unit_cost
                ) VALUES (
                    v_doc_id,
                    (SELECT COALESCE(MAX(line_number), 0) + 1 FROM inventory_document_lines WHERE document_id = v_doc_id),
                    v_ri.item_id, v_ri.inventory_uom_id, v_needed_qty, COALESCE(v_ri.avg_cost, 0)
                );
            END LOOP;
        ELSE
            -- Fallback: If no recipe, maybe it's a direct item (e.g. Bottled Water)?
            -- Check if the menu_item is directly linked to an inventory item
            -- (This assumes a 1:1 link table might exist or we just log a warning)
            RAISE WARNING 'No recipe found for menu_item %. Direct deduction not implemented.', v_ki.menu_item_id;
        END IF;
    END LOOP;

    -- 5. Finalize Document (Posts and updates stock)
    -- Only post if we actually added lines
    IF EXISTS (SELECT 1 FROM inventory_document_lines WHERE document_id = v_doc_id) THEN
        UPDATE inventory_documents SET status = 'posted' WHERE id = v_doc_id;
    ELSE
        -- Delete empty draft
        DELETE FROM inventory_documents WHERE id = v_doc_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Update generate_kot_on_accept to trigger inventory deduction
CREATE OR REPLACE FUNCTION generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
    v_default_kitchen_id UUID;
BEGIN
    -- Fire on: pending → accepted, pending_waiter → accepted
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN

        -- Get a default kitchen for items with no kitchen_id
        SELECT id INTO v_default_kitchen_id
        FROM kitchens
        WHERE branch_id = NEW.branch_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        -- 1. Handle items WITH a kitchen_id
        FOR r IN
            SELECT DISTINCT kitchen_id
            FROM order_items
            WHERE order_id = NEW.id
              AND kitchen_id IS NOT NULL
              AND status = 'queued'
        LOOP
            -- Idempotency check 
            PERFORM 1 FROM kot_tickets 
            WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id;
            
            IF NOT FOUND THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (NEW.id, r.kitchen_id, 'created')
                RETURNING id INTO v_kot_id;

                INSERT INTO kot_items(kot_id, order_item_id, quantity)
                SELECT v_kot_id, oi.id, oi.quantity
                FROM order_items oi
                WHERE oi.order_id = NEW.id
                  AND oi.kitchen_id = r.kitchen_id
                  AND oi.status = 'queued';

                UPDATE order_items
                SET status = 'sent_to_kitchen'
                WHERE order_id = NEW.id
                  AND kitchen_id = r.kitchen_id
                  AND status = 'queued';

                -- DEDUCT INVENTORY IMMEDIATELY
                PERFORM deduct_inv_for_kot(v_kot_id);
            END IF;
        END LOOP;

        -- 2. Handle items WITHOUT a kitchen_id → assign to default
        IF v_default_kitchen_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM order_items WHERE order_id = NEW.id AND kitchen_id IS NULL AND status = 'queued') THEN
                PERFORM 1 FROM kot_tickets WHERE order_id = NEW.id AND kitchen_id = v_default_kitchen_id;
                
                IF NOT FOUND THEN
                    INSERT INTO kot_tickets(order_id, kitchen_id, status)
                    VALUES (NEW.id, v_default_kitchen_id, 'created')
                    RETURNING id INTO v_kot_id;

                    INSERT INTO kot_items(kot_id, order_item_id, quantity)
                    SELECT v_kot_id, oi.id, oi.quantity
                    FROM order_items oi
                    WHERE oi.order_id = NEW.id
                      AND oi.kitchen_id IS NULL
                      AND oi.status = 'queued';

                    UPDATE order_items
                    SET status = 'sent_to_kitchen', kitchen_id = v_default_kitchen_id
                    WHERE order_id = NEW.id AND kitchen_id IS NULL AND status = 'queued';

                    -- DEDUCT INVENTORY IMMEDIATELY
                    PERFORM deduct_inv_for_kot(v_kot_id);
                END IF;
            END IF;
        END IF;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. REMOVE the old payment-based trigger to avoid double deduction
-- (If the user wants deduction on KOT, we shouldn't do it again on payment)
DROP TRIGGER IF EXISTS trg_deduct_inv_on_pay ON orders;

-- 4. ENSURE Cashier Notifications are robust
-- This trigger already exists in notifications.sql, but let's reinforce it
-- to make sure Cashiers are alerted specifically about the mandate to bill.
CREATE OR REPLACE FUNCTION notify_order_accepted()
RETURNS TRIGGER AS $$
DECLARE
    v_msg TEXT;
BEGIN
    IF NEW.status = 'accepted'
       AND OLD.status IS DISTINCT FROM 'accepted' THEN

        v_msg := 'Order #' || NEW.order_number ||
                 ' accepted by ' || (SELECT full_name FROM profiles WHERE id = NEW.waiter_id) ||
                 '. KOT generated. Proceed for billing when ready.';

        -- Notify ALL cashiers in the branch
        PERFORM notify_role(
            NEW.branch_id,
            'cashier',
            'order_accepted',
            '⚠️ New Billing Task',
            v_msg,
            'point_of_sale',
            'deep-orange',
            '/pos',
            'order',
            NEW.id,
            NEW.waiter_id
        );

        -- Also notify management
        PERFORM notify_role(
            NEW.branch_id,
            'manager',
            'order_accepted',
            '📋 Order Accepted',
            v_msg,
            'soup_kitchen',
            'blue',
            '/pos',
            'order',
            NEW.id,
            NEW.waiter_id
        );

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
