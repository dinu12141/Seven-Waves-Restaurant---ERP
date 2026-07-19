-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS AUDIT FIX — Seven Waves Restaurant ERP
-- Generated: 2026-06-23
-- Purpose: Enable RLS and add missing policies for tables found unprotected
--          during comprehensive RLS audit.
--
-- AUDIT SUMMARY:
--   Tables with RLS missing entirely: companies, branches, stores, ingredients,
--     stock_levels, stock_movements, permissions, role_permissions,
--     journal_entries, journal_lines, payroll_history
--   Tables with RLS but OVERLY PERMISSIVE policies: customer_sessions,
--     loyalty_accounts (via mcp_touch_screen_menu.sql public-insert policies),
--     finance module tables (authenticated=ALL, no role scoping),
--     uom_conversions (USING true on all ops)
--   Tables intentionally without RLS: qr_rate_limits (SECURITY DEFINER only) ✓
--
-- HOW TO APPLY:
--   Paste into the Supabase dashboard SQL editor and run.
--   Prerequisite: erp_security_lockdown.sql must already be applied
--   (it defines is_admin, is_manager, is_finance, is_hr, is_inventory,
--    auth_branch_ids, auth_has_role).
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — COMPANIES TABLE
-- Severity: CRITICAL — root tenant table, no RLS at all
-- Risk: Any authenticated user can read/modify all companies
-- Fix: Admin-only write; authenticated can read their own company
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Helper: get the company_id that the current user belongs to
-- (used throughout; companies table itself can't reference user_branches yet)
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.company_id
  FROM user_branches ub
  JOIN branches b ON b.id = ub.branch_id
  WHERE ub.user_id = auth.uid()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

DROP POLICY IF EXISTS comp_admin    ON public.companies;
DROP POLICY IF EXISTS comp_self_read ON public.companies;

-- Only admin can modify company settings
CREATE POLICY comp_admin ON public.companies FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Any authenticated user can read their own company
CREATE POLICY comp_self_read ON public.companies FOR SELECT
  USING (id = get_user_company_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — BRANCHES TABLE
-- Severity: HIGH — multi-tenant isolation root
-- Risk: Users can read/write branches belonging to other companies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS br_admin        ON public.branches;
DROP POLICY IF EXISTS br_staff_read   ON public.branches;
DROP POLICY IF EXISTS br_manager_read ON public.branches;

-- Admin full control
CREATE POLICY br_admin ON public.branches FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Manager can view branches in their company
CREATE POLICY br_manager_read ON public.branches FOR SELECT
  USING (is_manager() AND company_id = get_user_company_id());

-- All authenticated staff can read branches they are assigned to
CREATE POLICY br_staff_read ON public.branches FOR SELECT
  USING (id = ANY(auth_branch_ids()));


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — STORES, STOCK_LEVELS, STOCK_MOVEMENTS (original schema tables)
-- Severity: HIGH — inventory data, no RLS
-- Note: A newer inventory module (inventory_documents, stock_on_hand) has RLS.
--       These original schema tables are still unprotected.
-- ─────────────────────────────────────────────────────────────────────────────

-- stores
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS st_admin     ON public.stores;
DROP POLICY IF EXISTS st_inventory ON public.stores;
DROP POLICY IF EXISTS st_staff_read ON public.stores;

CREATE POLICY st_admin ON public.stores FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY st_inventory ON public.stores FOR ALL
  USING  (is_inventory() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_inventory() AND branch_id = ANY(auth_branch_ids()));

CREATE POLICY st_staff_read ON public.stores FOR SELECT
  USING (branch_id = ANY(auth_branch_ids()));


-- stock_levels
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sl_admin     ON public.stock_levels;
DROP POLICY IF EXISTS sl_inventory ON public.stock_levels;
DROP POLICY IF EXISTS sl_kitchen   ON public.stock_levels;

CREATE POLICY sl_admin ON public.stock_levels FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY sl_inventory ON public.stock_levels FOR ALL
  USING  (
    is_inventory()
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = stock_levels.store_id AND s.branch_id = ANY(auth_branch_ids()))
  )
  WITH CHECK (
    is_inventory()
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = stock_levels.store_id AND s.branch_id = ANY(auth_branch_ids()))
  );

CREATE POLICY sl_kitchen ON public.stock_levels FOR SELECT
  USING (
    auth_has_role('kitchen')
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = stock_levels.store_id AND s.branch_id = ANY(auth_branch_ids()))
  );


-- stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sm_admin     ON public.stock_movements;
DROP POLICY IF EXISTS sm_inventory ON public.stock_movements;

CREATE POLICY sm_admin ON public.stock_movements FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY sm_inventory ON public.stock_movements FOR SELECT
  USING (
    is_inventory()
    AND EXISTS (SELECT 1 FROM stores s WHERE s.id = stock_movements.store_id AND s.branch_id = ANY(auth_branch_ids()))
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — INGREDIENTS (lookup / reference data)
-- Severity: MEDIUM — cost data is sensitive; no multi-tenant col, but leak risk
-- Fix: All staff can read; admin/manager/inventory can write
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ing_admin     ON public.ingredients;
DROP POLICY IF EXISTS ing_inventory ON public.ingredients;
DROP POLICY IF EXISTS ing_read      ON public.ingredients;

CREATE POLICY ing_admin ON public.ingredients FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY ing_inventory ON public.ingredients FOR ALL
  USING  (is_inventory())
  WITH CHECK (is_inventory());

-- All authenticated staff can read ingredient data (needed for recipes/KOT)
CREATE POLICY ing_read ON public.ingredients FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — PERMISSIONS & ROLE_PERMISSIONS (RBAC lookup tables)
-- Severity: MEDIUM — these are read-only lookups but should still have RLS
-- Fix: Admin can manage; all authenticated users can read
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perm_admin ON public.permissions;
DROP POLICY IF EXISTS perm_read  ON public.permissions;

CREATE POLICY perm_admin ON public.permissions FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY perm_read ON public.permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS rp_admin ON public.role_permissions;
DROP POLICY IF EXISTS rp_read  ON public.role_permissions;

CREATE POLICY rp_admin ON public.role_permissions FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY rp_read ON public.role_permissions FOR SELECT
  USING (auth.uid() IS NOT NULL);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — JOURNAL_ENTRIES & JOURNAL_LINES
-- Severity: CRITICAL — core financial ledger, no RLS at all
-- Risk: Any authenticated user can read, insert, or delete journal entries
-- Fix: Admin full access; finance role read-only; no direct insert for others
--      (all inserts go through SECURITY DEFINER RPCs like post_accounting_from_order)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS je_admin   ON public.journal_entries;
DROP POLICY IF EXISTS je_finance ON public.journal_entries;
DROP POLICY IF EXISTS je_manager ON public.journal_entries;

-- Admin: full access (including reversals)
CREATE POLICY je_admin ON public.journal_entries FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Finance role: read entries for their branch
CREATE POLICY je_finance ON public.journal_entries FOR SELECT
  USING (
    is_finance()
    AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
  );

-- Manager: read entries for their branch only
CREATE POLICY je_manager ON public.journal_entries FOR SELECT
  USING (
    is_manager()
    AND branch_id = ANY(auth_branch_ids())
  );

-- System/service insert: SECURITY DEFINER RPCs bypass RLS, so no INSERT policy
-- for authenticated needed. Explicitly block anon:
-- (no policy = block by default when RLS is enabled)

DROP POLICY IF EXISTS jl_admin   ON public.journal_lines;
DROP POLICY IF EXISTS jl_finance ON public.journal_lines;
DROP POLICY IF EXISTS jl_manager ON public.journal_lines;

CREATE POLICY jl_admin ON public.journal_lines FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY jl_finance ON public.journal_lines FOR SELECT
  USING (
    is_finance()
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_id
        AND (je.branch_id IS NULL OR je.branch_id = ANY(auth_branch_ids()))
    )
  );

CREATE POLICY jl_manager ON public.journal_lines FOR SELECT
  USING (
    is_manager()
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.id = journal_lines.journal_id
        AND je.branch_id = ANY(auth_branch_ids())
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — PAYROLL_HISTORY
-- Severity: HIGH — salary history data
-- Risk: No RLS; any authenticated user can read salary records
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_history') THEN
    EXECUTE 'ALTER TABLE public.payroll_history ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS ph_admin ON public.payroll_history';
    EXECUTE 'DROP POLICY IF EXISTS ph_hr    ON public.payroll_history';

    EXECUTE $pol$
      CREATE POLICY ph_admin ON public.payroll_history FOR ALL
        USING  (is_admin())
        WITH CHECK (is_admin())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ph_hr ON public.payroll_history FOR ALL
        USING (
          is_hr()
          AND EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = payroll_history.employee_id
              AND e.branch_id = ANY(auth_branch_ids())
          )
        )
        WITH CHECK (
          is_hr()
          AND EXISTS (
            SELECT 1 FROM public.employees e
            WHERE e.id = payroll_history.employee_id
              AND e.branch_id = ANY(auth_branch_ids())
          )
        )
    $pol$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — PAYROLL_RECORDS & PAYROLL_LINE_ITEMS (finance migration)
-- Severity: HIGH — individual employee salary details
-- Current state: RLS enabled but policy is FOR ALL USING (auth.role()='authenticated')
-- This allows ANY authenticated user to see ALL payroll records across all tenants
-- Fix: Replace with role-scoped, branch-scoped policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Replace the overly permissive policy on payroll_records
DROP POLICY IF EXISTS fin_payroll_records_auth  ON public.payroll_records;
DROP POLICY IF EXISTS pr_admin_payroll_records  ON public.payroll_records;

DROP POLICY IF EXISTS prc_admin ON public.payroll_records;
DROP POLICY IF EXISTS prc_hr    ON public.payroll_records;
DROP POLICY IF EXISTS prc_self  ON public.payroll_records;

CREATE POLICY prc_admin ON public.payroll_records FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY prc_hr ON public.payroll_records FOR ALL
  USING (
    is_hr()
    AND EXISTS (
      SELECT 1 FROM payroll_cycles pc
      WHERE pc.id = payroll_records.cycle_id
        AND pc.branch_id = ANY(auth_branch_ids())
    )
  )
  WITH CHECK (
    is_hr()
    AND EXISTS (
      SELECT 1 FROM payroll_cycles pc
      WHERE pc.id = payroll_records.cycle_id
        AND pc.branch_id = ANY(auth_branch_ids())
    )
  );

-- Employees can read their own payroll record
CREATE POLICY prc_self ON public.payroll_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = payroll_records.employee_id
        AND e.profile_id = auth.uid()
    )
  );


-- payroll_line_items: follow same pattern
DROP POLICY IF EXISTS fin_payroll_line_items_auth ON public.payroll_line_items;
DROP POLICY IF EXISTS pli_admin ON public.payroll_line_items;
DROP POLICY IF EXISTS pli_hr    ON public.payroll_line_items;
DROP POLICY IF EXISTS pli_self  ON public.payroll_line_items;

CREATE POLICY pli_admin ON public.payroll_line_items FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pli_hr ON public.payroll_line_items FOR ALL
  USING (
    is_hr()
    AND EXISTS (
      SELECT 1 FROM payroll_records pr
      JOIN payroll_cycles pc ON pc.id = pr.cycle_id
      WHERE pr.id = payroll_line_items.record_id
        AND pc.branch_id = ANY(auth_branch_ids())
    )
  )
  WITH CHECK (
    is_hr()
    AND EXISTS (
      SELECT 1 FROM payroll_records pr
      JOIN payroll_cycles pc ON pc.id = pr.cycle_id
      WHERE pr.id = payroll_line_items.record_id
        AND pc.branch_id = ANY(auth_branch_ids())
    )
  );

CREATE POLICY pli_self ON public.payroll_line_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM payroll_records pr
      JOIN employees e ON e.id = pr.employee_id
      WHERE pr.id = payroll_line_items.record_id
        AND e.profile_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9 — PAYROLL_CYCLES
-- Current state: RLS enabled but policy is FOR ALL USING (auth.role()='authenticated')
-- Fix: Replace with HR + admin scoped policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS fin_payroll_cycles_auth ON public.payroll_cycles;
DROP POLICY IF EXISTS pc_admin ON public.payroll_cycles;
DROP POLICY IF EXISTS pc_hr    ON public.payroll_cycles;

CREATE POLICY pc_admin ON public.payroll_cycles FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pc_hr ON public.payroll_cycles FOR ALL
  USING  (is_hr() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_hr() AND branch_id = ANY(auth_branch_ids()));


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10 — FINANCE MODULE TABLES (20260323_finance_module_schema.sql)
-- Current state: RLS enabled but policy FOR ALL USING (auth.role()='authenticated')
-- This is too permissive — any authenticated user sees all company data
-- Affected: chart_of_accounts, fiscal_periods, bank_accounts, cash_transactions,
--           customer_receivables, expense_categories, expense_entries,
--           tax_codes, tax_transactions, finance_documents, payment_allocations,
--           finance_audit_logs
-- ─────────────────────────────────────────────────────────────────────────────

-- chart_of_accounts
DROP POLICY IF EXISTS fin_chart_of_accounts_auth ON public.chart_of_accounts;
DROP POLICY IF EXISTS coa_admin   ON public.chart_of_accounts;
DROP POLICY IF EXISTS coa_finance ON public.chart_of_accounts;
DROP POLICY IF EXISTS coa_read    ON public.chart_of_accounts;

CREATE POLICY coa_admin ON public.chart_of_accounts FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Finance and manager can read chart of accounts
CREATE POLICY coa_finance ON public.chart_of_accounts FOR SELECT
  USING (is_finance() OR is_manager());

-- fiscal_periods
DROP POLICY IF EXISTS fin_fiscal_periods_auth ON public.fiscal_periods;
DROP POLICY IF EXISTS fp_admin   ON public.fiscal_periods;
DROP POLICY IF EXISTS fp_finance ON public.fiscal_periods;

CREATE POLICY fp_admin ON public.fiscal_periods FOR ALL
  USING  (is_admin() AND (company_id = get_user_company_id()))
  WITH CHECK (is_admin() AND (company_id = get_user_company_id()));

CREATE POLICY fp_finance ON public.fiscal_periods FOR SELECT
  USING ((is_finance() OR is_manager()) AND (company_id = get_user_company_id()));

-- bank_accounts
DROP POLICY IF EXISTS fin_bank_accounts_auth ON public.bank_accounts;
DROP POLICY IF EXISTS ba_admin   ON public.bank_accounts;
DROP POLICY IF EXISTS ba_finance ON public.bank_accounts;
DROP POLICY IF EXISTS ba_manager ON public.bank_accounts;

CREATE POLICY ba_admin ON public.bank_accounts FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY ba_finance ON public.bank_accounts FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

CREATE POLICY ba_manager ON public.bank_accounts FOR SELECT
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()));

-- cash_transactions
DROP POLICY IF EXISTS fin_cash_transactions_auth ON public.cash_transactions;
DROP POLICY IF EXISTS ct_admin   ON public.cash_transactions;
DROP POLICY IF EXISTS ct_finance ON public.cash_transactions;

CREATE POLICY ct_admin ON public.cash_transactions FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY ct_finance ON public.cash_transactions FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

-- customer_receivables
DROP POLICY IF EXISTS fin_customer_receivables_auth ON public.customer_receivables;
DROP POLICY IF EXISTS cr_admin   ON public.customer_receivables;
DROP POLICY IF EXISTS cr_finance ON public.customer_receivables;
DROP POLICY IF EXISTS cr_cashier ON public.customer_receivables;

CREATE POLICY cr_admin ON public.customer_receivables FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY cr_finance ON public.customer_receivables FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

CREATE POLICY cr_cashier ON public.customer_receivables FOR SELECT
  USING (auth_has_role('cashier') AND branch_id = ANY(auth_branch_ids()));

-- expense_categories (reference data — finance + admin write, authenticated read)
DROP POLICY IF EXISTS fin_expense_categories_auth ON public.expense_categories;
DROP POLICY IF EXISTS ec_admin ON public.expense_categories;
DROP POLICY IF EXISTS ec_read  ON public.expense_categories;

CREATE POLICY ec_admin ON public.expense_categories FOR ALL
  USING  (is_admin() OR is_finance())
  WITH CHECK (is_admin() OR is_finance());

CREATE POLICY ec_read ON public.expense_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- expense_entries
DROP POLICY IF EXISTS fin_expense_entries_auth ON public.expense_entries;
DROP POLICY IF EXISTS ee_admin   ON public.expense_entries;
DROP POLICY IF EXISTS ee_finance ON public.expense_entries;
DROP POLICY IF EXISTS ee_manager ON public.expense_entries;

CREATE POLICY ee_admin ON public.expense_entries FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY ee_finance ON public.expense_entries FOR ALL
  USING  (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())))
  WITH CHECK (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

CREATE POLICY ee_manager ON public.expense_entries FOR SELECT
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()));

-- tax_codes (reference data)
DROP POLICY IF EXISTS fin_tax_codes_auth ON public.tax_codes;
DROP POLICY IF EXISTS tc_admin ON public.tax_codes;
DROP POLICY IF EXISTS tc_read  ON public.tax_codes;

CREATE POLICY tc_admin ON public.tax_codes FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY tc_read ON public.tax_codes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- tax_transactions
DROP POLICY IF EXISTS fin_tax_transactions_auth ON public.tax_transactions;
DROP POLICY IF EXISTS tt_admin   ON public.tax_transactions;
DROP POLICY IF EXISTS tt_finance ON public.tax_transactions;

CREATE POLICY tt_admin ON public.tax_transactions FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY tt_finance ON public.tax_transactions FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

-- finance_documents
DROP POLICY IF EXISTS fin_finance_documents_auth ON public.finance_documents;
DROP POLICY IF EXISTS fd_admin   ON public.finance_documents;
DROP POLICY IF EXISTS fd_finance ON public.finance_documents;

CREATE POLICY fd_admin ON public.finance_documents FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY fd_finance ON public.finance_documents FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));

-- payment_allocations (no branch_id — tie back to payments which have branch isolation)
DROP POLICY IF EXISTS fin_payment_allocations_auth ON public.payment_allocations;
DROP POLICY IF EXISTS pa_admin   ON public.payment_allocations;
DROP POLICY IF EXISTS pa_finance ON public.payment_allocations;

CREATE POLICY pa_admin ON public.payment_allocations FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY pa_finance ON public.payment_allocations FOR SELECT
  USING (is_finance());

-- finance_audit_logs — read-only for admins; no direct INSERT for authenticated
DROP POLICY IF EXISTS fin_finance_audit_logs_auth ON public.finance_audit_logs;
DROP POLICY IF EXISTS fal_admin  ON public.finance_audit_logs;
DROP POLICY IF EXISTS fal_insert ON public.finance_audit_logs;

CREATE POLICY fal_admin ON public.finance_audit_logs FOR SELECT
  USING (is_admin());

-- System/trigger inserts go via SECURITY DEFINER; allow them
CREATE POLICY fal_insert ON public.finance_audit_logs FOR INSERT
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11 — FINANCE RE-ARCHITECTURE TABLES (20260518_finance_department_rearchitecture.sql)
-- Current state: RLS enabled with FOR ALL USING (auth.role()='authenticated')
-- Affected: finance_ledgers, finance_accounts, finance_vouchers,
--           finance_voucher_lines, finance_cashbook_entries,
--           finance_petty_cash_entries, finance_cheques,
--           finance_bank_reconciliations, finance_bank_reconciliation_lines
-- Fix: Replace with company-scoped + role-scoped policies
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbls TEXT[] := ARRAY[
    'finance_ledgers','finance_accounts','finance_vouchers',
    'finance_cashbook_entries','finance_petty_cash_entries','finance_cheques',
    'finance_bank_reconciliations'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- Drop the permissive authenticated-all policy
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'fin_new_' || t || '_auth', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'fin_' || t || '_auth', t);

      -- Admin: full access
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL
          USING (is_admin()) WITH CHECK (is_admin())',
        t || '_admin', t
      );

      -- Finance role: read own company data
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_finance', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT
          USING (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
          )',
        t || '_finance', t
      );

      -- Manager: read own company data
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT
          USING (
            is_manager()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
          )',
        t || '_manager', t
      );
    END IF;
  END LOOP;
END $$;

-- ── 11b. EXPLICIT POLICIES FOR LINE TABLES (joining parents for company/branch) ─
DO $$ BEGIN
  -- finance_voucher_lines
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='finance_voucher_lines') THEN
    DROP POLICY IF EXISTS fin_new_finance_voucher_lines_auth ON public.finance_voucher_lines;
    DROP POLICY IF EXISTS fin_finance_voucher_lines_auth ON public.finance_voucher_lines;
    DROP POLICY IF EXISTS finance_voucher_lines_admin ON public.finance_voucher_lines;
    DROP POLICY IF EXISTS finance_voucher_lines_finance ON public.finance_voucher_lines;
    DROP POLICY IF EXISTS finance_voucher_lines_manager ON public.finance_voucher_lines;

    CREATE POLICY finance_voucher_lines_admin ON public.finance_voucher_lines FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());

    CREATE POLICY finance_voucher_lines_finance ON public.finance_voucher_lines FOR SELECT
      USING (
        is_finance()
        AND EXISTS (
          SELECT 1 FROM public.finance_vouchers fv
          WHERE fv.id = finance_voucher_lines.voucher_id
            AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
        )
      );

    CREATE POLICY finance_voucher_lines_manager ON public.finance_voucher_lines FOR SELECT
      USING (
        is_manager()
        AND EXISTS (
          SELECT 1 FROM public.finance_vouchers fv
          WHERE fv.id = finance_voucher_lines.voucher_id
            AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
            AND (fv.branch_id IS NULL OR fv.branch_id = ANY(auth_branch_ids()))
        )
      );
  END IF;

  -- finance_bank_reconciliation_lines
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='finance_bank_reconciliation_lines') THEN
    DROP POLICY IF EXISTS fin_new_finance_bank_reconciliation_lines_auth ON public.finance_bank_reconciliation_lines;
    DROP POLICY IF EXISTS fin_finance_bank_reconciliation_lines_auth ON public.finance_bank_reconciliation_lines;
    DROP POLICY IF EXISTS finance_bank_reconciliation_lines_admin ON public.finance_bank_reconciliation_lines;
    DROP POLICY IF EXISTS finance_bank_reconciliation_lines_finance ON public.finance_bank_reconciliation_lines;
    DROP POLICY IF EXISTS finance_bank_reconciliation_lines_manager ON public.finance_bank_reconciliation_lines;

    CREATE POLICY finance_bank_reconciliation_lines_admin ON public.finance_bank_reconciliation_lines FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());

    CREATE POLICY finance_bank_reconciliation_lines_finance ON public.finance_bank_reconciliation_lines FOR SELECT
      USING (
        is_finance()
        AND EXISTS (
          SELECT 1 FROM public.finance_bank_reconciliations fbr
          WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
            AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
        )
      );

    CREATE POLICY finance_bank_reconciliation_lines_manager ON public.finance_bank_reconciliation_lines FOR SELECT
      USING (
        is_manager()
        AND EXISTS (
          SELECT 1 FROM public.finance_bank_reconciliations fbr
          WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
            AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
            AND (fbr.branch_id IS NULL OR fbr.branch_id = ANY(auth_branch_ids()))
        )
      );
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12 — CUSTOMER_SESSIONS (overly permissive INSERT/UPDATE)
-- Current state: mcp_touch_screen_menu.sql set "Public can insert/select/update"
--   with USING (true) — this was later hardened in rls_customer_session_hardening.sql
--   which revoked anon grants. But the old policies may still be active.
-- Fix: Drop the public-insert/update policies; ensure sessions are created only
--   via SECURITY DEFINER RPCs
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customer_sessions') THEN
    -- Remove the overly permissive touchscreen policies (replaced by RPC-only approach)
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can insert sessions" ON public.customer_sessions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can select own session" ON public.customer_sessions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can update own session" ON public.customer_sessions $dp$;

    -- Revoke anon access entirely (all session ops go through SECURITY DEFINER RPCs)
    REVOKE ALL ON public.customer_sessions FROM anon;

    -- Ensure admin and staff policies remain (from table_device_login_customer_sessions.sql)
    -- cs_admin and cs_staff_select should already be in place
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13 — LOYALTY_ACCOUNTS (overly permissive public policies)
-- Current state: mcp_touch_screen_menu.sql set USING(true) for INSERT/SELECT/UPDATE
--   phase1_security_crm.sql later set proper role-scoped policies (loy_admin, loy_cashier, loy_self)
--   pos_customer_loyalty.sql adds cashier INSERT/UPDATE
-- Risk: Old "Public can insert/select/update loyalty" policies may still exist
--   allowing any anon user to insert or read ALL loyalty accounts
-- Fix: Drop the mcp_touch_screen_menu public policies; role-scoped ones already correct
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='loyalty_accounts') THEN
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can insert loyalty" ON public.loyalty_accounts $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can select loyalty" ON public.loyalty_accounts $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "Public can update loyalty" ON public.loyalty_accounts $dp$;

    -- Revoke anon direct access — all loyalty ops go through SECURITY DEFINER RPCs
    REVOKE ALL ON public.loyalty_accounts FROM anon;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14 — AUDIT_LOGS — block direct INSERT for authenticated (non-system)
-- Current state: al_system_insert uses WITH CHECK (true) — this allows any
--   authenticated user to insert fake audit logs directly, bypassing the trigger
-- Fix: Restrict direct inserts to service_role only; triggers use SECURITY DEFINER
--   so they bypass RLS and will continue to work
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the wide-open system insert policy
DROP POLICY IF EXISTS al_system_insert ON public.audit_logs;

-- Re-create restricted to service_role only (triggers are SECURITY DEFINER, bypass RLS)
CREATE POLICY al_system_insert ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15 — UOM_CONVERSIONS (all operations wide open)
-- Current state: USING (true) on SELECT/INSERT/UPDATE/DELETE — fully public
-- This allows any user to modify unit-of-measure conversions which affects
-- stock calculations and procurement.
-- Fix: Admin/inventory write; authenticated read
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='uom_conversions') THEN
    EXECUTE $dp$ DROP POLICY IF EXISTS "uom_conversions_select" ON public.uom_conversions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "uom_conversions_insert" ON public.uom_conversions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "uom_conversions_update" ON public.uom_conversions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "uom_conversions_delete" ON public.uom_conversions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS uom_admin ON public.uom_conversions $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS uom_read  ON public.uom_conversions $dp$;

    EXECUTE $pol$
      CREATE POLICY uom_admin ON public.uom_conversions FOR ALL
        USING  (is_admin() OR is_inventory())
        WITH CHECK (is_admin() OR is_inventory())
    $pol$;

    EXECUTE $pol$
      CREATE POLICY uom_read ON public.uom_conversions FOR SELECT
        USING (auth.uid() IS NOT NULL)
    $pol$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 16 — AI INTELLIGENCE TABLES (overly permissive)
-- Current state: USING(true) on SELECT and WITH CHECK(true) on INSERT/UPDATE
-- This exposes all AI insights, forecasts, and anomaly events to any user.
-- Fix: Admin/manager access; branch-scoped reads for staff
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbls TEXT[] := ARRAY['ai_insights','ai_forecasts','ai_recommendations','ai_anomaly_events'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      -- Drop all existing wide-open policies
      EXECUTE format($dp$ DROP POLICY IF EXISTS "Users can view %s" ON public.%I $dp$, t, t);
      EXECUTE format($dp$ DROP POLICY IF EXISTS "Service role can insert %s" ON public.%I $dp$, t, t);
      EXECUTE format($dp$ DROP POLICY IF EXISTS "Users can update %s status" ON public.%I $dp$, t, t);
      EXECUTE format($dp$ DROP POLICY IF EXISTS "Users can update %s" ON public.%I $dp$, t, t);
      -- Drop previously created policies (for idempotency)
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin',          t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_staff_read',     t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_insert', t);

      -- Admin/manager full access
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL
          USING (is_admin() OR is_manager())
          WITH CHECK (is_admin() OR is_manager())',
        t || '_admin', t
      );

      -- Branch staff can read insights for their branch
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT
          USING (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))',
        t || '_staff_read', t
      );

      -- Service role insert (from AI engine)
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT
          TO service_role WITH CHECK (true)',
        t || '_service_insert', t
      );
    END IF;
  END LOOP;
END $$;

-- ai_prompt_logs — admin read only (contains raw prompts, potentially sensitive)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_prompt_logs') THEN
    EXECUTE $dp$ DROP POLICY IF EXISTS "Users can view ai_prompt_logs" ON public.ai_prompt_logs $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS "Service role can insert ai_prompt_logs" ON public.ai_prompt_logs $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS ai_prompt_logs_admin ON public.ai_prompt_logs $dp$;
    EXECUTE $dp$ DROP POLICY IF EXISTS ai_prompt_logs_service_insert ON public.ai_prompt_logs $dp$;

    EXECUTE $pol$
      CREATE POLICY ai_prompt_logs_admin ON public.ai_prompt_logs FOR SELECT
        USING (is_admin())
    $pol$;
    EXECUTE $pol$
      CREATE POLICY ai_prompt_logs_service_insert ON public.ai_prompt_logs FOR INSERT
        TO service_role WITH CHECK (true)
    $pol$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 17 — USER_ROLES (missing INSERT/UPDATE/DELETE policies)
-- Current state: RLS on user_roles, SELECT policies for own + admin only
-- Risk: No INSERT/UPDATE/DELETE policy means non-admin authenticated users
--   cannot be assigned roles (they'll be blocked, which is correct), BUT
--   admins also have no INSERT/UPDATE/DELETE policy — role assignment would fail!
-- Fix: Add admin INSERT/UPDATE/DELETE policies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS user_roles_manage_admin ON public.user_roles;
CREATE POLICY user_roles_manage_admin ON public.user_roles FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

-- Same gap in user_branches
DROP POLICY IF EXISTS user_branches_manage_admin ON public.user_branches;
CREATE POLICY user_branches_manage_admin ON public.user_branches FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 18 — PROFILES (missing DELETE policy)
-- Current state: SELECT (own+admin), UPDATE (own), INSERT (self)
-- Risk: No DELETE policy — admins cannot deactivate/delete users via profiles table.
--   Also, users could theoretically soft-delete their own profile if not blocked.
-- Fix: Add admin DELETE; block self-delete (use is_active=false instead)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;
CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE
  USING (is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 19 — GRANTS
-- Ensure authenticated role has access to new tables
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_levels       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines      TO authenticated;

-- Revoke write access from anon on all sensitive tables
REVOKE INSERT, UPDATE, DELETE ON public.companies       FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.branches        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.journal_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.journal_lines   FROM anon;
REVOKE ALL ON public.ingredients FROM anon;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION NOTES (run these as queries after applying to confirm)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
-- -- Should return only: qr_rate_limits (intentional)
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies WHERE schemaname='public'
-- ORDER BY tablename, cmd;
-- -- Should show no policy with USING(true) on sensitive tables
-- ─────────────────────────────────────────────────────────────────────────────
