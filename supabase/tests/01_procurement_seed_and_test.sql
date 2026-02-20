-- ==============================================================================
-- PROCUREMENT MODULE TEST SCENARIO
-- ==============================================================================
-- 1. Seeds 2 Suppliers & 10 Items
-- 2. Executes full PO -> Partial GRN -> Invoice -> Partial Pay -> Return workflow
-- 3. Verifies balances at each step
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ==============================================================================

DO $$
DECLARE
    -- Context
    v_company_id UUID;
    v_branch_id UUID;
    v_warehouse_id UUID;
    v_user_id UUID;
    v_uom_id UUID;

    -- Data IDs
    v_sup_a_id UUID;
    v_sup_b_id UUID;
    v_item_ids UUID[] := ARRAY[]::UUID[];
    v_po_id UUID;
    v_grn_id UUID;
    v_inv_id UUID;
    v_pay_id UUID;
    v_ret_id UUID;
    v_temp_id UUID;

    -- Workflow Variables
    v_po_num TEXT;
    v_grn_num TEXT;
    v_inv_num TEXT;
    v_pay_num TEXT;
    v_ret_num TEXT;
    v_inv_total NUMERIC;
    v_pay_amount NUMERIC;
    v_ret_amount NUMERIC;
    v_final_balance NUMERIC;
    v_supplier_balance NUMERIC;
    v_expected_balance NUMERIC;
    v_actual_balance NUMERIC;
    i INT;
BEGIN
    -- 0. INITIALIZE CONTEXT
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_user_id FROM profiles LIMIT 1; -- Any user for 'created_by'

    -- Get a warehouse (default or first one)
    SELECT id INTO v_warehouse_id FROM warehouses WHERE branch_id = v_branch_id LIMIT 1;
    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'No warehouse found for branch %', v_branch_id;
    END IF;

    -- Get/Create 'Unit' UOM
    SELECT id INTO v_uom_id FROM uom WHERE company_id = v_company_id AND code = 'unit';
    IF v_uom_id IS NULL THEN
        INSERT INTO uom (company_id, code, name) VALUES (v_company_id, 'unit', 'Unit')
        RETURNING id INTO v_uom_id;
    END IF;


    -- ==============================================================================
    -- STEP 1: ENABLE APPROVAL SETTINGS (For Test)
    -- ==============================================================================
    RAISE NOTICE '--- STEP 1: Enabling Approval Workflows ---';
    
    INSERT INTO module_settings (company_id, module_code, setting_key, setting_value)
    VALUES 
        (v_company_id, 'PROCUREMENT', 'po_approval_required', 'true'::jsonb),
        (v_company_id, 'PROCUREMENT', 'grn_approval_required', 'true'::jsonb),
        (v_company_id, 'PROCUREMENT', 'invoice_approval_required', 'true'::jsonb)
    ON CONFLICT (company_id, module_code, setting_key) 
    DO UPDATE SET setting_value = 'true'::jsonb;


    -- ==============================================================================
    -- STEP 2: SEED DATA (Suppliers & Items)
    -- ==============================================================================
    RAISE NOTICE '--- STEP 2: Seeding Suppliers & Items ---';

    -- Create Supplier A
    INSERT INTO suppliers (company_id, code, name, is_active)
    VALUES (v_company_id, 'SUP-TEST-A', 'Global Foods Ltd', true)
    RETURNING id INTO v_sup_a_id;

    -- Create Supplier B
    INSERT INTO suppliers (company_id, code, name, is_active)
    VALUES (v_company_id, 'SUP-TEST-B', 'Fresh Farms Inc', true)
    RETURNING id INTO v_sup_b_id;

    -- Seed 5 Items
    FOR i IN 1..5 LOOP
        INSERT INTO items (
            company_id, category_id, code, name, 
            inventory_uom_id, purchase_uom_id, is_active
        ) VALUES (
            v_company_id, NULL, 
            'ITEM-TEST-' || LPAD(i::text, 3, '0'), 
            'Test Item ' || i, 
            v_uom_id, v_uom_id, true
        )
        RETURNING id INTO v_temp_id;

        v_item_ids := array_append(v_item_ids, v_temp_id);

        -- Set Supplier Price (100.00) - INCLUDE uom_id
        INSERT INTO supplier_item_prices (company_id, supplier_id, item_id, uom_id, last_price)
        VALUES (v_company_id, v_sup_a_id, v_temp_id, v_uom_id, 100.00);
    END LOOP;

    RAISE NOTICE 'Seeded 5 items for Supplier A';

    -- ==============================================================================
    -- STEP 2: CREATE PURCHASE ORDER
    -- ==============================================================================
    RAISE NOTICE '--- STEP 2: Create Purchase Order ---';
    
    v_po_num := 'PO-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    INSERT INTO purchase_orders (
        company_id, branch_id, doc_number, doc_date, supplier_id, warehouse_id, status
    ) VALUES (
        v_company_id, v_branch_id, v_po_num, CURRENT_DATE, v_sup_a_id, v_warehouse_id, 'draft'
    ) RETURNING id INTO v_po_id;

    -- PO Lines (all 5 items, qty 10 each)
    FOR i IN 1..5 LOOP
        INSERT INTO purchase_order_lines (
            po_id, line_number, item_id, uom_id, quantity, unit_price
        ) VALUES (
            v_po_id, i, v_item_ids[i], v_uom_id, 10, 100.00
        );
    END LOOP;

    -- Approve PO
    PERFORM approve_po(v_po_id);
    
    RAISE NOTICE 'PO Created & Approved: %', v_po_num;


    -- ==============================================================================
    -- STEP 3: GOODS RECEIPT (Full Receipt)
    -- ==============================================================================
    RAISE NOTICE '--- STEP 3: Goods Receipt (Full) ---';

    v_grn_num := 'GRN-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    INSERT INTO goods_receipts (
        company_id, branch_id, doc_number, doc_date, po_id, supplier_id, warehouse_id, status
    ) VALUES (
        v_company_id, v_branch_id, v_grn_num, CURRENT_DATE, v_po_id, v_sup_a_id, v_warehouse_id, 'draft'
    ) RETURNING id INTO v_grn_id;

    -- Copy Lines from PO
    INSERT INTO goods_receipt_lines (
        grn_id, line_number, po_line_id, item_id, uom_id, quantity, unit_cost
    )
    SELECT v_grn_id, line_number, id, item_id, uom_id, quantity, unit_price
    FROM purchase_order_lines WHERE po_id = v_po_id;

    -- Post GRN
    PERFORM post_grn(v_grn_id);

    RAISE NOTICE 'GRN Posted: % (Stock Updated)', v_grn_num;


    -- ==============================================================================
    -- STEP 4: AP INVOICE
    -- ==============================================================================
    RAISE NOTICE '--- STEP 4: AP Invoice ---';

    v_inv_num := 'INV-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    INSERT INTO ap_invoices (
        company_id, branch_id, doc_number, doc_date, supplier_id, grn_id, 
        total_amount, status
    ) VALUES (
        v_company_id, v_branch_id, v_inv_num, CURRENT_DATE, v_sup_a_id, v_grn_id, 
        5000.00, 'draft'
    ) RETURNING id INTO v_inv_id;

    -- Invoice Lines from GRN
    INSERT INTO ap_invoice_lines (
        invoice_id, line_number, grn_line_id, item_id, uom_id, quantity, unit_price
    )
    SELECT v_inv_id, line_number, id, item_id, uom_id, quantity, unit_cost
    FROM goods_receipt_lines WHERE grn_id = v_grn_id;

    -- Post Invoice
    PERFORM post_ap_invoice_rpc(v_inv_id);

    RAISE NOTICE 'Invoice Posted: % (Liability Created: 5000.00)', v_inv_num;


    -- ==============================================================================
    -- STEP 5: SUPPLIER PAYMENT
    -- ==============================================================================
    RAISE NOTICE '--- STEP 5: Supplier Payment ---';

    v_pay_num := 'PAY-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    INSERT INTO supplier_payments (
        company_id, branch_id, doc_number, doc_date, supplier_id, 
        payment_method, total_amount, status
    ) VALUES (
        v_company_id, v_branch_id, v_pay_num, CURRENT_DATE, v_sup_a_id, 
        'cash', 2500.00, 'draft'
    ) RETURNING id INTO v_pay_id;

    -- Allocate to Invoice
    INSERT INTO supplier_payment_allocations (
        payment_id, invoice_id, amount
    ) VALUES (
        v_pay_id, v_inv_id, 2500.00
    );

    -- Post Payment
    PERFORM post_supplier_payment_rpc(v_pay_id);

    RAISE NOTICE 'Payment Posted: % (Paid 2500.00)', v_pay_num;


    -- ==============================================================================
    -- STEP 6: PURCHASE RETURN
    -- ==============================================================================
    RAISE NOTICE '--- STEP 6: Purchase Return ---';

    v_ret_num := 'RET-TEST-' || to_char(now(), 'YYYYMMDD-HH24MISS');

    INSERT INTO purchase_returns (
        company_id, branch_id, doc_number, doc_date, grn_id, supplier_id, warehouse_id, 
        total_amount, status
    ) VALUES (
        v_company_id, v_branch_id, v_ret_num, CURRENT_DATE, v_grn_id, v_sup_a_id, v_warehouse_id, 
        500.00, 'draft'
    ) RETURNING id INTO v_ret_id;

    -- Return Line
    INSERT INTO purchase_return_lines (
        return_id, line_number, grn_line_id, item_id, uom_id, quantity, unit_cost
    ) SELECT 
        v_ret_id, 1, id, item_id, uom_id, 5, 100.00
      FROM goods_receipt_lines 
      WHERE grn_id = v_grn_id AND item_id = v_item_ids[1];

    -- Post Return (auto-creates Credit Note)
    PERFORM post_purchase_return_rpc(v_ret_id);

    RAISE NOTICE 'Return Posted: % (Value: 500.00)', v_ret_num;


    -- ==============================================================================
    -- STEP 8: FINAL VERIFICATION
    -- ==============================================================================
    RAISE NOTICE '--- STEP 8: Final Verification ---';

    -- Expected Balance Calculation
    -- Invoice (5000) - Payment (2500) - Return/Credit Note (500) = 2000
    v_expected_balance := 5000.00 - 2500.00 - 500.00;
    
    -- Verification from Suppliers table (updated by triggers)
    SELECT balance INTO v_actual_balance FROM suppliers WHERE id = v_sup_a_id;
    
    RAISE NOTICE 'Final Supplier Balance: %', v_actual_balance;
    RAISE NOTICE 'Expected Balance:       %', v_expected_balance;

    IF ABS(v_actual_balance - v_expected_balance) < 0.01 THEN
        RAISE NOTICE '✅ SUCCESS: Balances match!';
    ELSE
        RAISE NOTICE '❌ FAILURE: Balances do not match!';
        RAISE EXCEPTION 'Balance mismatch: Actual %, Expected %', v_actual_balance, v_expected_balance;
    END IF;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ ERROR: %', SQLERRM;
    RAISE;
END $$;
