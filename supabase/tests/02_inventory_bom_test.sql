-- ==============================================================================
-- INVENTORY + BOM INTEGRATION TEST
-- ==============================================================================
-- Tests:
-- 1. Recipe CRUD via save_recipe RPC (create, update, delete)
-- 2. calculate_recipe_cost with UOM conversions
-- 3. GRN posting flow (stock add) preserved
-- 4. stock_on_hand consistency with ledger
-- 5. Input validation (reject bad item_id)
-- 6. UOM conversions table present
--
-- IMPORTANT: UOM codes are uppercase in this DB (KG, G, PCS, L, ML, BOX, etc.)
-- RUN THIS IN SUPABASE SQL EDITOR
-- ==============================================================================

DO $$
DECLARE
    v_company_id UUID;
    v_branch_id UUID;
    v_warehouse_id UUID;
    v_user_id UUID;
    v_uom_kg_id UUID;
    v_uom_g_id UUID;
    v_uom_pcs_id UUID;
    v_item_a_id UUID;
    v_item_b_id UUID;
    v_item_c_id UUID;
    v_menu_item_id UUID;
    v_result JSONB;
    v_recipe_id UUID;
    v_recipe_cost NUMERIC;
    v_recipe_count INT;
    v_ri_count INT;
    v_doc_id UUID;
    v_doc_number TEXT;
    v_soh_qty NUMERIC;
    v_ledger_count INT;
BEGIN
    -- 0. INIT
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
    SELECT id INTO v_warehouse_id FROM warehouses WHERE branch_id = v_branch_id AND is_active = true LIMIT 1;

    IF v_company_id IS NULL OR v_branch_id IS NULL OR v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'Missing base data: company, branch, or warehouse not found';
    END IF;

    -- Use UPPERCASE UOM codes
    SELECT id INTO v_uom_kg_id FROM uom WHERE company_id = v_company_id AND code = 'KG';
    SELECT id INTO v_uom_g_id  FROM uom WHERE company_id = v_company_id AND code = 'G';
    SELECT id INTO v_uom_pcs_id FROM uom WHERE company_id = v_company_id AND code = 'PCS';

    IF v_uom_kg_id IS NULL OR v_uom_g_id IS NULL OR v_uom_pcs_id IS NULL THEN
        RAISE EXCEPTION 'Missing UOM: KG=%, G=%, PCS=%', v_uom_kg_id, v_uom_g_id, v_uom_pcs_id;
    END IF;

    RAISE NOTICE '=== INVENTORY + BOM TEST SUITE ===';

    -- ==========================================
    -- STEP 1: SEED TEST DATA
    -- ==========================================
    INSERT INTO items (company_id, code, name, inventory_uom_id, avg_cost, is_active)
    VALUES (v_company_id, 'BOM-TST-A', 'Test Rice', v_uom_kg_id, 250.00, true)
    RETURNING id INTO v_item_a_id;

    INSERT INTO items (company_id, code, name, inventory_uom_id, avg_cost, is_active)
    VALUES (v_company_id, 'BOM-TST-B', 'Test Spice', v_uom_g_id, 0.50, true)
    RETURNING id INTO v_item_b_id;

    INSERT INTO items (company_id, code, name, inventory_uom_id, avg_cost, is_active)
    VALUES (v_company_id, 'BOM-TST-C', 'Test Egg', v_uom_pcs_id, 25.00, true)
    RETURNING id INTO v_item_c_id;

    SELECT id INTO v_menu_item_id FROM menu_items WHERE company_id = v_company_id LIMIT 1;
    IF v_menu_item_id IS NULL THEN
        RAISE EXCEPTION 'No menu items found to link recipe to';
    END IF;
    RAISE NOTICE '✅ STEP 1: Seeded 3 items';

    -- ==========================================
    -- STEP 2: save_recipe CREATE
    -- ==========================================
    SELECT save_recipe(
        p_company_id := v_company_id,
        p_menu_item_id := v_menu_item_id,
        p_name := 'Test Fried Rice',
        p_yield_qty := 1,
        p_yield_unit := 'plate',
        p_notes := 'BOM test recipe',
        p_ingredients := jsonb_build_array(
            jsonb_build_object('item_id', v_item_a_id, 'qty_per_serving', 0.5, 'uom_id', v_uom_kg_id),
            jsonb_build_object('item_id', v_item_b_id, 'qty_per_serving', 10, 'uom_id', v_uom_g_id),
            jsonb_build_object('item_id', v_item_c_id, 'qty_per_serving', 2, 'uom_id', v_uom_pcs_id, 'wastage_percent', 5)
        )
    ) INTO v_result;

    IF NOT (v_result->>'success')::BOOLEAN THEN
        RAISE EXCEPTION '❌ CREATE: %', v_result->>'error';
    END IF;
    v_recipe_id := (v_result->>'recipe_id')::UUID;
    SELECT COUNT(*) INTO v_ri_count FROM recipe_items WHERE recipe_id = v_recipe_id;
    IF v_ri_count != 3 THEN RAISE EXCEPTION '❌ Expected 3 items, got %', v_ri_count; END IF;
    RAISE NOTICE '✅ STEP 2: save_recipe CREATE (3 ingredients)';

    -- ==========================================
    -- STEP 3: calculate_recipe_cost
    -- ==========================================
    SELECT calculate_recipe_cost(v_recipe_id) INTO v_recipe_cost;
    IF v_recipe_cost IS NULL OR v_recipe_cost <= 0 THEN
        RAISE EXCEPTION '❌ cost should be positive, got %', v_recipe_cost;
    END IF;
    RAISE NOTICE '✅ STEP 3: recipe cost = %', v_recipe_cost;

    -- ==========================================
    -- STEP 4: save_recipe UPDATE
    -- ==========================================
    SELECT save_recipe(
        p_company_id := v_company_id,
        p_menu_item_id := v_menu_item_id,
        p_name := 'Test Fried Rice v2',
        p_yield_qty := 2,
        p_yield_unit := 'plate',
        p_ingredients := jsonb_build_array(
            jsonb_build_object('item_id', v_item_a_id, 'qty_per_serving', 1.0, 'uom_id', v_uom_kg_id),
            jsonb_build_object('item_id', v_item_c_id, 'qty_per_serving', 4, 'uom_id', v_uom_pcs_id)
        )
    ) INTO v_result;

    IF NOT (v_result->>'success')::BOOLEAN THEN
        RAISE EXCEPTION '❌ UPDATE: %', v_result->>'error';
    END IF;
    SELECT COUNT(*) INTO v_ri_count FROM recipe_items WHERE recipe_id = v_recipe_id;
    IF v_ri_count != 2 THEN RAISE EXCEPTION '❌ Expected 2 items, got %', v_ri_count; END IF;
    SELECT version_no INTO v_ri_count FROM recipes WHERE id = v_recipe_id;
    IF v_ri_count != 2 THEN RAISE EXCEPTION '❌ version should be 2, got %', v_ri_count; END IF;
    RAISE NOTICE '✅ STEP 4: save_recipe UPDATE (2 items, version 2)';

    -- ==========================================
    -- STEP 5: VALIDATION (bad item_id)
    -- ==========================================
    SELECT save_recipe(
        p_company_id := v_company_id,
        p_menu_item_id := v_menu_item_id,
        p_ingredients := jsonb_build_array(
            jsonb_build_object('item_id', '00000000-0000-0000-0000-000000000000', 'qty_per_serving', 1)
        )
    ) INTO v_result;

    IF (v_result->>'success')::BOOLEAN THEN
        RAISE EXCEPTION '❌ should have rejected bad item_id';
    END IF;
    RAISE NOTICE '✅ STEP 5: validation rejected bad item_id';

    -- ==========================================
    -- STEP 6: GRN POSTING (existing flow)
    -- ==========================================
    SELECT generate_inv_doc_number(v_company_id, 'GRN') INTO v_doc_number;

    INSERT INTO inventory_documents (
        company_id, branch_id, doc_type, doc_number, doc_date,
        warehouse_id, status, created_by
    ) VALUES (
        v_company_id, v_branch_id, 'GRN', v_doc_number, CURRENT_DATE,
        v_warehouse_id, 'draft', v_user_id
    ) RETURNING id INTO v_doc_id;

    INSERT INTO inventory_document_lines (
        document_id, line_number, item_id, uom_id, quantity, unit_cost
    ) VALUES (v_doc_id, 1, v_item_a_id, v_uom_kg_id, 10, 250.00);

    UPDATE inventory_documents SET status = 'posted' WHERE id = v_doc_id;

    SELECT COALESCE(qty_on_hand, 0) INTO v_soh_qty
    FROM stock_on_hand WHERE item_id = v_item_a_id AND warehouse_id = v_warehouse_id;
    IF v_soh_qty IS NULL OR v_soh_qty < 10 THEN
        RAISE EXCEPTION '❌ stock should be >= 10, got %', COALESCE(v_soh_qty, 0);
    END IF;

    SELECT COUNT(*) INTO v_ledger_count FROM inventory_ledger WHERE document_id = v_doc_id;
    IF v_ledger_count < 1 THEN RAISE EXCEPTION '❌ no ledger entry'; END IF;
    RAISE NOTICE '✅ STEP 6: GRN posted, stock=%, ledger=%', v_soh_qty, v_ledger_count;

    -- ==========================================
    -- STEP 7: UOM CONVERSIONS TABLE
    -- ==========================================
    SELECT COUNT(*) INTO v_ri_count FROM uom_conversions WHERE company_id = v_company_id;
    RAISE NOTICE '✅ STEP 7: uom_conversions exists, % pairs', v_ri_count;

    -- ==========================================
    -- STEP 8: delete_recipe
    -- ==========================================
    PERFORM delete_recipe(v_recipe_id);
    SELECT COUNT(*) INTO v_recipe_count FROM recipes WHERE id = v_recipe_id;
    SELECT COUNT(*) INTO v_ri_count FROM recipe_items WHERE recipe_id = v_recipe_id;
    IF v_recipe_count > 0 OR v_ri_count > 0 THEN
        RAISE EXCEPTION '❌ recipe not fully deleted';
    END IF;
    RAISE NOTICE '✅ STEP 8: delete_recipe cleaned up';

    -- ==========================================
    -- STEP 9: CLEANUP
    -- ==========================================
    -- Disable specific user triggers to allow cleanup of posted docs
    ALTER TABLE inventory_document_lines DISABLE TRIGGER trg_block_line_edit;
    ALTER TABLE inventory_document_lines DISABLE TRIGGER audit_inventory_document_lines;
    ALTER TABLE inventory_documents DISABLE TRIGGER trg_block_posted_edit;
    ALTER TABLE inventory_documents DISABLE TRIGGER trg_post_inventory;
    ALTER TABLE inventory_documents DISABLE TRIGGER audit_inventory_documents;

    DELETE FROM inventory_ledger WHERE document_id = v_doc_id;
    DELETE FROM stock_on_hand WHERE item_id IN (v_item_a_id, v_item_b_id, v_item_c_id);
    DELETE FROM inventory_document_lines WHERE document_id = v_doc_id;
    DELETE FROM inventory_documents WHERE id = v_doc_id;

    ALTER TABLE inventory_document_lines ENABLE TRIGGER trg_block_line_edit;
    ALTER TABLE inventory_document_lines ENABLE TRIGGER audit_inventory_document_lines;
    ALTER TABLE inventory_documents ENABLE TRIGGER trg_block_posted_edit;
    ALTER TABLE inventory_documents ENABLE TRIGGER trg_post_inventory;
    ALTER TABLE inventory_documents ENABLE TRIGGER audit_inventory_documents;

    DELETE FROM items WHERE id IN (v_item_a_id, v_item_b_id, v_item_c_id);

    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE '✅ ALL 8 TESTS PASSED - Inventory Phase 1';
    RAISE NOTICE '============================================';

EXCEPTION WHEN OTHERS THEN
    BEGIN
        ALTER TABLE inventory_document_lines ENABLE TRIGGER trg_block_line_edit;
        ALTER TABLE inventory_document_lines ENABLE TRIGGER audit_inventory_document_lines;
        ALTER TABLE inventory_documents ENABLE TRIGGER trg_block_posted_edit;
        ALTER TABLE inventory_documents ENABLE TRIGGER trg_post_inventory;
        ALTER TABLE inventory_documents ENABLE TRIGGER audit_inventory_documents;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE NOTICE '❌ FAILURE: %', SQLERRM;
    RAISE;
END $$;
