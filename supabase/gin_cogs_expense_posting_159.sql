-- ═══════════════════════════════════════════════════════════════════════════
-- #159 — GIN Cost of Goods Sold (COGS) & Operating Expenses Integration
-- Seven Waves Restaurant (Pvt) Ltd
--
-- Accounting Architecture:
-- 1. Daily Kitchen Issues (Food & Beverage Raw Materials):
--    - When chicken, fish, vegetables, dairy, rice, spices, etc. are issued
--      from Main Store to Kitchen Sections (Italian, Indian, Juice Bar, Benmar):
--      Dr: 6000 Food Cost (Cost of Sales / COGS)
--      Cr: 1005 Inventory - Raw Materials (or 1006 Inventory - Beverages Stock)
--    - Accumulates in General Ledger Account 6000 throughout the month.
--    - In the Income Statement (P&L), subtracted directly from Revenue (5000)
--      to determine the true Gross Profit!
--
-- 2. Consumables & Operational Supplies (Chemicals, Detergents, Brooms, Coir):
--    - When cleaning agents, dishwash liquids, bleaches, brooms (idal),
--      coir (kohu), paper towels, or sanitizers are issued:
--      Dr: 7044 Cleaning & Sanitation Expenses (Admin & Operation Expenses)
--      Cr: 1009 Inventory - Cleaning Materials (or 1005 Asset)
--    - In the Income Statement (P&L), appears under Administrative & Operation
--      Expenses (Other Expenses), completely separated from Cost of Goods Sold.
--
-- 3. Cooking Fuels & Gas (LPG):
--    - Dr: 7011 Gas Expense (Admin & Operation Expenses)
--    - Cr: 1005 Inventory - Raw Materials (Asset)
--
-- 4. Packaging Materials:
--    - Dr: 6001 Packaging Cost (Cost of Sales / COGS)
--    - Cr: 1008 Inventory - Packaging Materials (Asset)
--
-- 5. Special Purposes:
--    - Staff Meal    → Dr 7005 Staff Welfare (Operating Expense)
--    - Wastage       → Dr 6003 Kitchen Wastage (Cost of Sales / COGS)
--    - Damaged Goods → Dr 6004 Inventory Adjustment (Cost of Sales / COGS)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Ensure Ledgers 7044, 7011, 6000, 6001, 1009, 1005 exist ─────────────
INSERT INTO public.finance_ledgers (
    company_id, ledger_code, ledger_name, ledger_type, ledger_nature,
    account_group, opening_balance, opening_balance_type, current_balance,
    is_system_ledger, is_active
)
SELECT c.id, '7044', 'Cleaning & Sanitation Expenses', 'expense', 'debit',
       'Admin and Operation Expenses', 0, 'debit', 0, true, true
  FROM public.companies c
 WHERE NOT EXISTS (
     SELECT 1 FROM public.finance_ledgers l 
      WHERE l.company_id = c.id AND l.ledger_code = '7044' AND l.deleted_at IS NULL
 );

INSERT INTO public.finance_ledgers (
    company_id, ledger_code, ledger_name, ledger_type, ledger_nature,
    account_group, opening_balance, opening_balance_type, current_balance,
    is_system_ledger, is_active
)
SELECT c.id, '1009', 'Inventory - Cleaning Materials', 'asset', 'debit',
       'Assets-Current', 0, 'debit', 0, true, true
  FROM public.companies c
 WHERE NOT EXISTS (
     SELECT 1 FROM public.finance_ledgers l 
      WHERE l.company_id = c.id AND l.ledger_code = '1009' AND l.deleted_at IS NULL
 );

-- ── 2. Core RPC Function: Post GIN to Finance ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fin_post_gin(p_doc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc       public.inventory_documents%ROWTYPE;
    v_line      RECORD;
    v_co        UUID;
    v_dr_id     UUID;
    v_cr_id     UUID;
    v_dr_code   TEXT;
    v_cr_code   TEXT;
    v_purpose   TEXT;
    v_desc      TEXT;
    v_target_wh TEXT;
    v_line_cost NUMERIC;
    v_posted_count INT := 0;
BEGIN
    SELECT * INTO v_doc FROM public.inventory_documents WHERE id = p_doc_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;

    -- Only process outbound consumption issue documents
    IF v_doc.doc_type NOT IN ('GIN', 'GIN_ISSUE', 'WASTAGE') THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'Not a GIN document');
    END IF;

    -- Idempotency check: prevent duplicate posting
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries 
                WHERE source_type IN ('gin_issue', 'manual_adjustment') AND source_id = p_doc_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;

    v_co := v_doc.company_id;
    v_purpose := TRIM(SPLIT_PART(COALESCE(v_doc.remarks, ''), '—', 1));
    v_purpose := TRIM(SPLIT_PART(v_purpose, '|', 1));

    -- Get target warehouse/kitchen name if specified
    IF v_doc.target_warehouse_id IS NOT NULL THEN
        SELECT name INTO v_target_wh FROM public.warehouses WHERE id = v_doc.target_warehouse_id;
    END IF;

    FOR v_line IN
        SELECT l.id AS line_id, l.quantity, l.unit_cost, (l.quantity * l.unit_cost) AS total_cost,
               i.name AS item_name, i.code AS item_code,
               ic.name AS category_name,
               ic.expense_ledger_id AS cat_exp_id,
               ic.asset_ledger_id   AS cat_ast_id
          FROM public.inventory_document_lines l
          JOIN public.items i ON i.id = l.item_id
          LEFT JOIN public.item_categories ic ON ic.id = i.category_id
         WHERE l.document_id = p_doc_id
           AND l.quantity > 0 AND l.unit_cost > 0
    LOOP
        v_line_cost := ROUND(COALESCE(v_line.total_cost, 0), 2);
        IF v_line_cost <= 0 THEN CONTINUE; END IF;

        -- ── A. Resolve Debit Leg (COGS vs Operating Expenses) ──
        IF v_purpose ILIKE '%staff meal%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7005', 'Staff Welfare');
            v_dr_code := '7005';
        ELSIF v_purpose ILIKE '%wastage%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6003', 'Kitchen Wastage');
            v_dr_code := '6003';
        ELSIF v_purpose ILIKE '%damaged%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6004', 'Inventory Adjustment');
            v_dr_code := '6004';
        -- Cleaning / Chemicals / Detergents / Washing supplies
        ELSIF v_purpose ILIKE '%clean%' OR v_purpose ILIKE '%maint%'
           OR v_line.category_name ILIKE '%clean%'
           OR v_line.category_name ILIKE '%hygiene%'
           OR (v_line.category_name ILIKE '%chemical%' AND v_line.category_name NOT ILIKE '%food%')
           OR v_line.item_name ILIKE '%bleach%'
           OR v_line.item_name ILIKE '%soap%'
           OR v_line.item_name ILIKE '%detergent%'
           OR v_line.item_name ILIKE '%clean%'
           OR v_line.item_name ILIKE '%wash%'
           OR v_line.item_name ILIKE '%dishwash%'
           OR v_line.item_name ILIKE '%handwash%'
           OR v_line.item_name ILIKE '%sanit%'
           OR v_line.item_name ILIKE '%disinfect%'
           OR v_line.item_name ILIKE '%harpic%'
           OR v_line.item_name ILIKE '%vim%'
           OR v_line.item_name ILIKE '%toilet%'
           OR v_line.item_name ILIKE '%broom%'
           OR v_line.item_name ILIKE '%brush%'
           OR v_line.item_name ILIKE '%idal%'
           OR v_line.item_name ILIKE '%kohu%'
           OR v_line.item_name ILIKE '%coir%'
           OR v_line.item_name ILIKE '%mop%'
           OR v_line.item_name ILIKE '%scrubber%'
           OR (v_line.item_name ILIKE '%sponge%' AND v_line.item_name NOT ILIKE '%mix%' AND v_line.item_name NOT ILIKE '%cake%')
           OR v_line.item_name ILIKE '%serviette%'
           OR v_line.item_name ILIKE '%paper towel%'
           OR v_line.item_name ILIKE '%tissue%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7044', 'Cleaning & Sanitation Expenses');
            v_dr_code := '7044';
        -- Cooking Gas / Fuel
        ELSIF v_purpose ILIKE '%fuel%' OR v_purpose ILIKE '%gas%'
           OR v_line.category_name ILIKE '%fuel%' OR v_line.category_name ILIKE '%gas%'
           OR v_line.item_name ILIKE '%gas%' OR v_line.item_name ILIKE '%lpg%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7011', 'Gas Expense');
            v_dr_code := '7011';
        -- Packaging Materials
        ELSIF v_purpose ILIKE '%packag%' OR v_purpose ILIKE '%delivery%'
           OR v_line.category_name ILIKE '%packag%'
           OR v_line.item_name ILIKE '%box%' OR v_line.item_name ILIKE '%container%' OR v_line.item_name ILIKE '%wrapper%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6001', 'Packaging Cost');
            v_dr_code := '6001';
        ELSIF v_line.cat_exp_id IS NOT NULL THEN
            v_dr_id := v_line.cat_exp_id;
            v_dr_code := 'CAT';
        ELSE
            -- Default Food Cost (Cost of Sales / COGS)
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6000', 'Food Cost');
            v_dr_code := '6000';
        END IF;

        -- ── B. Resolve Credit Leg (Inventory Asset) ──
        IF v_dr_code = '7044' THEN
            v_cr_id := public.fn_fin_ledger_by_code(v_co, '1009', 'Inventory - Cleaning Materials');
            v_cr_code := '1009';
        ELSIF v_dr_code = '6001' THEN
            v_cr_id := public.fn_fin_ledger_by_code(v_co, '1008', 'Inventory - Packaging Materials');
            v_cr_code := '1008';
        ELSIF v_line.category_name ILIKE '%beverage%' OR v_line.category_name ILIKE '%syrup%' THEN
            v_cr_id := public.fn_fin_ledger_by_code(v_co, '1006', 'Inventory - Beverages Stock');
            v_cr_code := '1006';
        ELSIF v_line.cat_ast_id IS NOT NULL THEN
            v_cr_id := v_line.cat_ast_id;
            v_cr_code := 'CAT';
        ELSE
            v_cr_id := public.fn_fin_ledger_by_code(v_co, '1005', 'Inventory - Raw Materials');
            v_cr_code := '1005';
        END IF;

        -- ── C. Build Narration & Post Legs ──
        v_desc := 'GIN ' || v_doc.doc_number || ' — ' || v_line.item_name || ' (' || v_dr_code || ')';
        IF v_target_wh IS NOT NULL THEN
            v_desc := v_desc || ' [' || v_target_wh || ']';
        END IF;

        -- Debit Leg (COGS / Operating Expense)
        PERFORM public.fn_fin_post_leg(
            v_co, v_doc.branch_id, 'manual_adjustment', p_doc_id, v_doc.doc_date,
            v_dr_id, NULL, v_desc, v_line_cost, 0
        );

        -- Credit Leg (Inventory Asset)
        PERFORM public.fn_fin_post_leg(
            v_co, v_doc.branch_id, 'manual_adjustment', p_doc_id, v_doc.doc_date,
            v_cr_id, NULL, v_desc, 0, v_line_cost
        );

        v_posted_count := v_posted_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'lines_posted', v_posted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_fin_post_gin(UUID) TO authenticated, service_role;

-- ── 3. Database Trigger: Auto-post GIN to Finance on Status Change ───────────
CREATE OR REPLACE FUNCTION public.trg_fn_auto_post_gin_to_finance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Post when status becomes 'posted'
    IF NEW.status = 'posted' AND OLD.status = 'draft' AND NEW.doc_type IN ('GIN', 'GIN_ISSUE', 'WASTAGE') THEN
        PERFORM public.fn_fin_post_gin(NEW.id);
    END IF;

    -- Reverse if status is cancelled
    IF NEW.status = 'cancelled' AND OLD.status = 'posted' AND NEW.doc_type IN ('GIN', 'GIN_ISSUE', 'WASTAGE') THEN
        PERFORM public.fn_fin_reverse_source('manual_adjustment', NEW.id, 'GIN Cancellation: ' || NEW.doc_number);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gin_auto_post_finance ON public.inventory_documents;
CREATE TRIGGER trg_gin_auto_post_finance
AFTER UPDATE OF status ON public.inventory_documents
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_auto_post_gin_to_finance();

COMMIT;

