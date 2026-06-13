-- ═══════════════════════════════════════════════════════════════════
-- ENTERPRISE TEST SUITE — Seven Waves ERP Step 02  (v5)
-- ROBUST CLEANUP & UI ERROR REPORTING EDITION
-- Applied: 2026-05-15
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_company_id    UUID;
    v_branch_id     UUID;
    v_warehouse_id  UUID;
    v_user_id       UUID;
    v_uom_id        UUID;
    v_item_a        UUID;
    v_doc_id        UUID;
    v_doc_number    TEXT;
    v_journal_id    UUID;
    v_count         INT;
    v_total_dr      NUMERIC;
    v_total_cr      NUMERIC;
    v_pass          INT := 0;
    v_fail          INT := 0;
    v_name          TEXT;
    v_done          BOOLEAN;
    v_has_is_posted BOOLEAN;
    v_has_pgcrypto  BOOLEAN;
    v_error_log     TEXT := ''; -- Collects errors to display in Supabase UI popup
BEGIN
    -- ── EXTENSION CHECK ─────────────────────────────────────────────
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') INTO v_has_pgcrypto;
    
    -- ── INIT ────────────────────────────────────────────────────────
    SELECT id INTO v_company_id FROM public.companies LIMIT 1;
    SELECT id INTO v_branch_id  FROM public.branches  WHERE company_id = v_company_id LIMIT 1;
    SELECT id INTO v_user_id    FROM public.profiles  LIMIT 1;
    SELECT id INTO v_warehouse_id FROM public.warehouses
        WHERE branch_id = v_branch_id AND is_active = true LIMIT 1;
    SELECT id INTO v_uom_id FROM public.uom WHERE company_id = v_company_id LIMIT 1;

    IF v_company_id IS NULL OR v_branch_id IS NULL OR v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL: Missing base data. Please ensure companies, branches, and warehouses are seeded.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'is_posted'
    ) INTO v_has_is_posted;

    -- ════════════════════════════════════════════════════════════════
    -- T01 Negative stock prevention
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T01 Negative stock prevention';
    v_done := false;
    BEGIN
        INSERT INTO public.items (company_id, code, name, inventory_uom_id, is_active)
        VALUES (v_company_id, 'TST-NEG-STOCK', 'Neg Stock Test', v_uom_id, true)
        RETURNING id INTO v_item_a;

        INSERT INTO public.stock_on_hand (company_id, warehouse_id, item_id, qty_on_hand, total_value)
        VALUES (v_company_id, v_warehouse_id, v_item_a, 5, 500)
        ON CONFLICT (warehouse_id, item_id) DO UPDATE SET qty_on_hand = 5, total_value = 500;

        BEGIN
            PERFORM public.validate_sufficient_stock(v_warehouse_id, v_item_a, 10);
            v_fail := v_fail + 1;
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Expected failure but it passed.';
        EXCEPTION WHEN OTHERS THEN
            IF SQLERRM LIKE '%INSUFFICIENT_STOCK%' THEN
                v_pass := v_pass + 1;
            ELSE
                v_fail := v_fail + 1;
                v_error_log := v_error_log || E'\n❌ ' || v_name || ': Wrong error -> ' || SQLERRM;
            END IF;
        END;
        v_done := true;

        DELETE FROM public.stock_on_hand WHERE item_id = v_item_a;
        DELETE FROM public.items WHERE id = v_item_a;
    EXCEPTION WHEN OTHERS THEN
        IF NOT v_done THEN 
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ' (Setup): ' || SQLERRM; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T02 GRN Idempotency
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T02 Stock movement idempotency';
    v_done := false;
    BEGIN
        INSERT INTO public.items (company_id, code, name, inventory_uom_id, is_active)
        VALUES (v_company_id, 'TST-IDEM', 'Idem Test', v_uom_id, true)
        RETURNING id INTO v_item_a;

        v_doc_number := public.generate_inv_doc_number(v_company_id, 'ADJUSTMENT');
        INSERT INTO public.inventory_documents (company_id, branch_id, doc_type, doc_number, doc_date, warehouse_id, status, created_by)
        VALUES (v_company_id, v_branch_id, 'ADJUSTMENT', v_doc_number, CURRENT_DATE, v_warehouse_id, 'draft', v_user_id)
        RETURNING id INTO v_doc_id;

        INSERT INTO public.inventory_document_lines (document_id, line_number, item_id, uom_id, quantity, unit_cost)
        VALUES (v_doc_id, 1, v_item_a, v_uom_id, 10, 100);

        UPDATE public.inventory_documents SET status = 'posted' WHERE id = v_doc_id;

        SELECT COUNT(*) INTO v_count FROM public.inventory_ledger WHERE document_id = v_doc_id;
        IF v_count = 1 THEN
            v_pass := v_pass + 1;
        ELSE
            v_fail := v_fail + 1;
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Expected 1 ledger entry, found ' || v_count;
        END IF;
        v_done := true;

        -- CLEANUP (using specific triggers to avoid permission issues)
        BEGIN ALTER TABLE public.inventory_document_lines DISABLE TRIGGER trg_block_line_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents DISABLE TRIGGER trg_block_posted_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents DISABLE TRIGGER trg_post_inventory; EXCEPTION WHEN OTHERS THEN NULL; END;
        
        DELETE FROM public.inventory_ledger WHERE document_id = v_doc_id;
        DELETE FROM public.stock_on_hand WHERE item_id = v_item_a;
        DELETE FROM public.inventory_document_lines WHERE document_id = v_doc_id;
        DELETE FROM public.inventory_documents WHERE id = v_doc_id;
        
        BEGIN ALTER TABLE public.inventory_document_lines ENABLE TRIGGER trg_block_line_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents ENABLE TRIGGER trg_block_posted_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents ENABLE TRIGGER trg_post_inventory; EXCEPTION WHEN OTHERS THEN NULL; END;
        DELETE FROM public.items WHERE id = v_item_a;
    EXCEPTION WHEN OTHERS THEN
        BEGIN ALTER TABLE public.inventory_document_lines ENABLE TRIGGER trg_block_line_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents ENABLE TRIGGER trg_block_posted_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.inventory_documents ENABLE TRIGGER trg_post_inventory; EXCEPTION WHEN OTHERS THEN NULL; END;
        IF NOT v_done THEN 
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ' (System): ' || SQLERRM; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T03 Finance: Trigger Check
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T03 Finance trigger presence';
    BEGIN
        IF NOT v_has_is_posted THEN
            v_fail := v_fail + 1;
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Column is_posted missing. Run fix_02.';
        ELSIF EXISTS (
            SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = 'public.journal_entries'::regclass AND t.tgname = 'trg_validate_journal'
        ) THEN
            v_pass := v_pass + 1;
        ELSE
            v_fail := v_fail + 1;
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Trigger trg_validate_journal not found.';
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T04 Finance: Imbalance Reject
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T04 Finance imbalance rejection';
    v_done := false;
    BEGIN
        IF NOT v_has_is_posted THEN
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Skipped (fix_02 missing)';
        ELSE
            INSERT INTO public.journal_entries (company_id, branch_id, description, entry_type, is_posted)
            VALUES (v_company_id, v_branch_id, 'TST: Imbalance', 'test', false)
            RETURNING id INTO v_journal_id;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount)
            VALUES (v_journal_id, '1000', 1000, 0), (v_journal_id, '4000', 0, 500);
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;

            BEGIN
                UPDATE public.journal_entries SET is_posted = true WHERE id = v_journal_id;
                v_fail := v_fail + 1;
                v_error_log := v_error_log || E'\n❌ ' || v_name || ': Update should have failed due to imbalance';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%JOURNAL_IMBALANCE%' THEN
                    v_pass := v_pass + 1; 
                ELSE
                    v_fail := v_fail + 1; 
                    v_error_log := v_error_log || E'\n❌ ' || v_name || ': Wrong error -> ' || SQLERRM;
                END IF;
            END;
            v_done := true;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
            
            DELETE FROM public.journal_lines WHERE journal_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
            
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        IF NOT v_done THEN 
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ' (System): ' || SQLERRM; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T05 Finance: Balanced Post
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T05 Finance balanced post';
    v_done := false;
    BEGIN
        IF NOT v_has_is_posted THEN
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Skipped';
        ELSE
            INSERT INTO public.journal_entries (company_id, branch_id, description, entry_type, is_posted)
            VALUES (v_company_id, v_branch_id, 'TST: Balanced', 'test', false)
            RETURNING id INTO v_journal_id;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount)
            VALUES (v_journal_id, '1000', 1000, 0), (v_journal_id, '4000', 0, 1000);
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;

            UPDATE public.journal_entries SET is_posted = true WHERE id = v_journal_id;
            
            SELECT total_dr, total_cr INTO v_total_dr, v_total_cr FROM public.journal_entries WHERE id = v_journal_id;
            IF v_total_dr = 1000 AND v_total_cr = 1000 THEN
                v_pass := v_pass + 1; 
            ELSE
                v_fail := v_fail + 1; 
                v_error_log := v_error_log || E'\n❌ ' || v_name || ': DR=' || COALESCE(v_total_dr,0) || ' CR=' || COALESCE(v_total_cr,0);
            END IF;
            v_done := true;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
            
            DELETE FROM public.journal_lines WHERE journal_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
            
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        IF NOT v_done THEN 
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ' (System): ' || SQLERRM; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T06 Finance: Immutability
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T06 Finance immutability';
    v_done := false;
    BEGIN
        IF NOT v_has_is_posted THEN
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Skipped';
        ELSE
            INSERT INTO public.journal_entries (company_id, branch_id, description, entry_type, is_posted)
            VALUES (v_company_id, v_branch_id, 'TST: Immutable', 'test', false)
            RETURNING id INTO v_journal_id;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            INSERT INTO public.journal_lines (journal_id, account_code, dr_amount, cr_amount)
            VALUES (v_journal_id, '1000', 100, 0), (v_journal_id, '4000', 0, 100);
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;

            UPDATE public.journal_entries SET is_posted = true WHERE id = v_journal_id;

            BEGIN
                UPDATE public.journal_entries SET description = 'TAMPERED' WHERE id = v_journal_id;
                v_fail := v_fail + 1; 
                v_error_log := v_error_log || E'\n❌ ' || v_name || ': Edit was allowed';
            EXCEPTION WHEN OTHERS THEN
                IF SQLERRM LIKE '%IMMUTABLE_JOURNAL%' THEN
                    v_pass := v_pass + 1; 
                ELSE
                    v_fail := v_fail + 1; 
                    v_error_log := v_error_log || E'\n❌ ' || v_name || ': Wrong error -> ' || SQLERRM;
                END IF;
            END;
            v_done := true;

            BEGIN ALTER TABLE public.journal_lines DISABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries DISABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
            
            DELETE FROM public.journal_lines WHERE journal_id = v_journal_id;
            DELETE FROM public.journal_entries WHERE id = v_journal_id;
            
            BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
            BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        BEGIN ALTER TABLE public.journal_lines ENABLE TRIGGER trg_block_jl_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_block_journal_edit; EXCEPTION WHEN OTHERS THEN NULL; END;
        BEGIN ALTER TABLE public.journal_entries ENABLE TRIGGER trg_validate_journal; EXCEPTION WHEN OTHERS THEN NULL; END;
        IF NOT v_done THEN 
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ' (System): ' || SQLERRM; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T07 Finance: Periods
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T07 Finance periods seeded';
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounting_periods') THEN
            SELECT COUNT(*) INTO v_count FROM public.accounting_periods WHERE company_id = v_company_id;
            IF v_count >= 12 THEN
                v_pass := v_pass + 1; 
            ELSE
                v_fail := v_fail + 1; 
                v_error_log := v_error_log || E'\n❌ ' || v_name || ': Found only ' || v_count || ' periods';
            END IF;
        ELSE
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Table accounting_periods missing';
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T08 Notifications: Outbox
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T08 Notification outbox presence';
    BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notification_outbox') THEN
            v_pass := v_pass + 1; 
        ELSE
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Table missing';
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T09 Reporting: Materialized Views
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T09 Materialized views (3/3)';
    BEGIN
        v_count := 0;
        IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_daily_sales_summary') THEN v_count := v_count + 1; END IF;
        IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_category_sales') THEN v_count := v_count + 1; END IF;
        IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'mv_inventory_valuation') THEN v_count := v_count + 1; END IF;
        IF v_count = 3 THEN
            v_pass := v_pass + 1; 
        ELSE
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Found ' || v_count || '/3';
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T10 Procurement: Approval Log
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T10 Procurement log + crypto';
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'procurement_approval_log') THEN
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Table missing';
        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'procurement_approval_log' AND column_name = 'doc_hash') THEN
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Column doc_hash missing';
        ELSE
            v_pass := v_pass + 1; 
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T11 Inventory: Recon Function
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T11 Stock reconciliation check';
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reconcile_stock_on_hand') THEN
            PERFORM public.reconcile_stock_on_hand(v_company_id, false);
            v_pass := v_pass + 1; 
        ELSE
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': Function reconcile_stock_on_hand missing';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_fail := v_fail + 1; 
        v_error_log := v_error_log || E'\n❌ ' || v_name || ': ' || SQLERRM;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- T12 KDS: FOR UPDATE check
    -- ════════════════════════════════════════════════════════════════
    v_name := 'T12 KDS FOR UPDATE lock check';
    BEGIN
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_waiter_accept' AND prosrc LIKE '%FOR UPDATE%') THEN
            v_pass := v_pass + 1; 
        ELSE
            v_fail := v_fail + 1; 
            v_error_log := v_error_log || E'\n❌ ' || v_name || ': FOR UPDATE not found in process_waiter_accept';
        END IF;
    END;

    -- ════════════════════════════════════════════════════════════════
    -- FINAL SUMMARY
    -- ════════════════════════════════════════════════════════════════
    IF v_fail > 0 THEN
        RAISE EXCEPTION 'TEST SUITE FAILED with % errors. Details:%', v_fail, v_error_log;
    END IF;

    RAISE NOTICE '════════════════════════════════════════════';
    RAISE NOTICE '  SUCCESS: ALL 12 TESTS PASSED!';
    RAISE NOTICE '════════════════════════════════════════════';

END $$;
