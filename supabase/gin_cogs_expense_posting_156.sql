-- ═══════════════════════════════════════════════════════════════════════════
-- #156 — GIN (Goods Issue Notes) Cost of Goods Sold & Operating Expenses Integration
-- Seven Waves Restaurant (Pvt) Ltd
--
-- Accounting Flow:
-- 1. When Food / Raw Materials / Beverage ingredients are issued to Kitchen/Bar via GIN:
--      Dr: 6000 Food Cost (Cost of Sales / COGS)
--      Cr: 1005 Inventory - Raw Materials (Asset)
-- 2. When Consumables / Operational supplies (brooms/idal, coir/kohu, cleaning soap/chemicals) are issued:
--      Dr: 7044 Cleaning & Sanitation Expenses (Admin & Operation Expenses)
--      Cr: 1009 Inventory - Cleaning Materials (Asset)
-- 3. When Cooking Fuels / Gas (LPG) are issued:
--      Dr: 7011 Gas Expense (Admin & Operation Expenses)
--      Cr: 1005 Inventory - Raw Materials (Asset)
-- 4. When Packaging materials are issued:
--      Dr: 6001 Packaging Cost (Cost of Sales / COGS)
--      Cr: 1008 Inventory - Packaging Materials (Asset)
-- 5. Special Purpose Overrides:
--      Staff Meal    → Dr 7005 Staff Welfare (Operating Expense)
--      Wastage       → Dr 6003 Kitchen Wastage (Cost of Sales)
--      Damaged Goods → Dr 6004 Inventory Adjustment (Cost of Sales)
--
-- This ensures that when POS orders/invoices are placed (Revenue in Account 5000),
-- the matching Food Cost in Account 6000 reflects the true Gross Profit!
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Ensure Ledger 7044 (Cleaning & Sanitation Expenses) exists ────────────
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

-- ── 2. Widen cashbook source_type check to allow 'gin_issue' ─────────────────
DO $$
DECLARE
    v_def  TEXT;
    v_vals TEXT[] := ARRAY['gin_issue', 'pos_sale', 'pos_refund', 'pos_shift', 'pos_payout', 'invoice', 'pay_voucher', 'received_voucher', 'payroll', 'supplier_payment', 'purchase_return', 'ar_receipt', 'ar_write_off', 'manual_adjustment'];
BEGIN
    SELECT pg_get_constraintdef(c.oid) INTO v_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.finance_cashbook_entries'::regclass
       AND c.conname  = 'finance_cashbook_entries_source_type_check';
    IF v_def IS NOT NULL THEN
        v_vals := v_vals || ARRAY(SELECT m[1] FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m);
    END IF;
    v_vals := v_vals || ARRAY(SELECT DISTINCT source_type FROM public.finance_cashbook_entries WHERE source_type IS NOT NULL);
    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_vals FROM unnest(v_vals) x;

    EXECUTE 'ALTER TABLE public.finance_cashbook_entries DROP CONSTRAINT IF EXISTS finance_cashbook_entries_source_type_check';
    EXECUTE format('ALTER TABLE public.finance_cashbook_entries ADD CONSTRAINT finance_cashbook_entries_source_type_check CHECK (source_type IN (%s))',
                   (SELECT string_agg(quote_literal(x), ',') FROM unnest(v_vals) x));
END $$;

-- ── 3. Add Category Mapping Columns ──────────────────────────────────────────
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS expense_ledger_id UUID REFERENCES public.finance_ledgers(id);
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS asset_ledger_id   UUID REFERENCES public.finance_ledgers(id);

-- ── 4. Set Default Ledger Mappings for Categories ────────────────────────────
UPDATE public.item_categories ic
   SET expense_ledger_id = l_exp.id,
       asset_ledger_id   = l_ast.id
  FROM public.finance_ledgers l_exp,
       public.finance_ledgers l_ast
 WHERE ic.name ILIKE '%clean%'
   AND l_exp.ledger_code = '7044' AND l_exp.company_id = ic.company_id AND l_exp.deleted_at IS NULL
   AND l_ast.ledger_code = '1009' AND l_ast.company_id = ic.company_id AND l_ast.deleted_at IS NULL;

UPDATE public.item_categories ic
   SET expense_ledger_id = l_exp.id,
       asset_ledger_id   = l_ast.id
  FROM public.finance_ledgers l_exp,
       public.finance_ledgers l_ast
 WHERE (ic.name ILIKE '%fuel%' OR ic.name ILIKE '%gas%')
   AND l_exp.ledger_code = '7011' AND l_exp.company_id = ic.company_id AND l_exp.deleted_at IS NULL
   AND l_ast.ledger_code = '1005' AND l_ast.company_id = ic.company_id AND l_ast.deleted_at IS NULL;

UPDATE public.item_categories ic
   SET expense_ledger_id = l_exp.id,
       asset_ledger_id   = l_ast.id
  FROM public.finance_ledgers l_exp,
       public.finance_ledgers l_ast
 WHERE ic.name ILIKE '%packag%'
   AND l_exp.ledger_code = '6001' AND l_exp.company_id = ic.company_id AND l_exp.deleted_at IS NULL
   AND l_ast.ledger_code = '1008' AND l_ast.company_id = ic.company_id AND l_ast.deleted_at IS NULL;

UPDATE public.item_categories ic
   SET expense_ledger_id = l_exp.id,
       asset_ledger_id   = l_ast.id
  FROM public.finance_ledgers l_exp,
       public.finance_ledgers l_ast
 WHERE (ic.name ILIKE '%beverage%' OR ic.name ILIKE '%syrup%' OR ic.name ILIKE '%flavour%')
   AND l_exp.ledger_code = '6000' AND l_exp.company_id = ic.company_id AND l_exp.deleted_at IS NULL
   AND l_ast.ledger_code = '1006' AND l_ast.company_id = ic.company_id AND l_ast.deleted_at IS NULL;

UPDATE public.item_categories ic
   SET expense_ledger_id = l_exp.id,
       asset_ledger_id   = l_ast.id
  FROM public.finance_ledgers l_exp,
       public.finance_ledgers l_ast
 WHERE ic.expense_ledger_id IS NULL
   AND l_exp.ledger_code = '6000' AND l_exp.company_id = ic.company_id AND l_exp.deleted_at IS NULL
   AND l_ast.ledger_code = '1005' AND l_ast.company_id = ic.company_id AND l_ast.deleted_at IS NULL;

-- ── 5. Stored Procedure: Post GIN to Finance ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fin_post_gin(p_doc_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doc      public.inventory_documents%ROWTYPE;
    v_line     RECORD;
    v_co       UUID;
    v_dr_id    UUID;
    v_cr_id    UUID;
    v_dr_code  TEXT;
    v_cr_code  TEXT;
    v_purpose  TEXT;
    v_desc     TEXT;
    v_line_cost NUMERIC;
    v_posted_count INT := 0;
BEGIN
    SELECT * INTO v_doc FROM public.inventory_documents WHERE id = p_doc_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Document not found');
    END IF;

    IF v_doc.doc_type <> 'GIN' THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'Not a GIN document');
    END IF;

    -- If this is an internal transfer between stores, stock moves but cost remains in inventory asset
    IF v_doc.target_warehouse_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'skipped', 'Internal transfer — no expense recognition');
    END IF;

    -- Idempotency check: has this GIN already been posted to finance?
    IF EXISTS (SELECT 1 FROM public.finance_cashbook_entries 
                WHERE source_type IN ('gin_issue', 'manual_adjustment') AND source_id = p_doc_id) THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;

    v_co := v_doc.company_id;
    v_purpose := TRIM(SPLIT_PART(COALESCE(v_doc.remarks, ''), '—', 1));
    v_purpose := TRIM(SPLIT_PART(v_purpose, '|', 1));

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

        -- 1. Determine Debit Ledger (COGS vs Operating Expense)
        IF v_purpose ILIKE '%staff meal%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7005', 'Staff Welfare');
            v_dr_code := '7005';
        ELSIF v_purpose ILIKE '%wastage%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6003', 'Kitchen Wastage');
            v_dr_code := '6003';
        ELSIF v_purpose ILIKE '%damaged%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6004', 'Inventory Adjustment');
            v_dr_code := '6004';
        ELSIF v_line.category_name ILIKE '%clean%' 
           OR v_line.item_name ILIKE '%bleach%' 
           OR v_line.item_name ILIKE '%serviette%' 
           OR v_line.item_name ILIKE '%soap%'
           OR v_line.item_name ILIKE '%chemical%'
           OR v_line.item_name ILIKE '%broom%'
           OR v_line.item_name ILIKE '%idal%'
           OR v_line.item_name ILIKE '%kohu%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7044', 'Cleaning & Sanitation Expenses');
            v_dr_code := '7044';
        ELSIF v_line.category_name ILIKE '%fuel%' 
           OR v_line.category_name ILIKE '%gas%' 
           OR v_line.item_name ILIKE '%lpg%' 
           OR v_line.item_name ILIKE '%gas%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '7011', 'Gas Expense');
            v_dr_code := '7011';
        ELSIF v_line.category_name ILIKE '%packag%' THEN
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6001', 'Packaging Cost');
            v_dr_code := '6001';
        ELSIF v_line.cat_exp_id IS NOT NULL THEN
            v_dr_id := v_line.cat_exp_id;
            v_dr_code := 'CAT';
        ELSE
            -- Default Food Cost (COGS)
            v_dr_id := public.fn_fin_ledger_by_code(v_co, '6000', 'Food Cost');
            v_dr_code := '6000';
        END IF;

        -- 2. Determine Credit Ledger (Inventory Asset)
        IF v_line.category_name ILIKE '%clean%' THEN
            v_cr_id := public.fn_fin_ledger_by_code(v_co, '1009', 'Inventory - Cleaning Materials');
            v_cr_code := '1009';
        ELSIF v_line.category_name ILIKE '%packag%' THEN
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

        -- 3. Post Double Entry
        v_desc := 'GIN ' || v_doc.doc_number || ' — ' || v_line.item_name || ' (' || v_dr_code || ')';
        IF v_purpose <> '' THEN
            v_desc := v_desc || ' | ' || v_purpose;
        END IF;

        -- Debit Leg (Expense / COGS)
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

COMMIT;

