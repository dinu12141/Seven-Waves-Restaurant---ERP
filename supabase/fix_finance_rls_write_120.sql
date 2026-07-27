-- Task #120: Finance RLS — grant finance role WRITE access across all finance_* tables
-- Root cause: every finance_* table had *_finance policies with CMD='SELECT' only.
-- Finance officers could read but never INSERT/UPDATE/DELETE any finance record.
-- Fix: add *_finance_write ALL policies scoped to company_id + branch_id per table.
-- Idempotent: DROP POLICY IF EXISTS before each CREATE (Postgres has no CREATE IF NOT EXISTS for policies).

-- ─────────────────────────────────────────────────────────────────
-- 1. finance_accounts (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_accounts_finance_write ON public.finance_accounts;
CREATE POLICY finance_accounts_finance_write ON public.finance_accounts
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 2. finance_bank_reconciliations (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_bank_reconciliations_finance_write ON public.finance_bank_reconciliations;
CREATE POLICY finance_bank_reconciliations_finance_write ON public.finance_bank_reconciliations
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 3. finance_bank_reconciliation_lines (join-based via reconciliation_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_bank_reconciliation_lines_finance_write ON public.finance_bank_reconciliation_lines;
CREATE POLICY finance_bank_reconciliation_lines_finance_write ON public.finance_bank_reconciliation_lines
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND EXISTS (
            SELECT 1 FROM public.finance_bank_reconciliations fbr
            WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
              AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
        )
    )
    WITH CHECK (
        is_finance()
        AND EXISTS (
            SELECT 1 FROM public.finance_bank_reconciliations fbr
            WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
              AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
        )
    );

-- ─────────────────────────────────────────────────────────────────
-- 4. finance_cashbook_entries (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_cashbook_entries_finance_write ON public.finance_cashbook_entries;
CREATE POLICY finance_cashbook_entries_finance_write ON public.finance_cashbook_entries
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 5. finance_cheques (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_cheques_finance_write ON public.finance_cheques;
CREATE POLICY finance_cheques_finance_write ON public.finance_cheques
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 6. finance_documents (branch_id only — no company_id column)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_documents_finance_write ON public.finance_documents;
CREATE POLICY finance_documents_finance_write ON public.finance_documents
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 7. finance_ledgers (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_ledgers_finance_write ON public.finance_ledgers;
CREATE POLICY finance_ledgers_finance_write ON public.finance_ledgers
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 8. finance_petty_cash_entries (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_petty_cash_entries_finance_write ON public.finance_petty_cash_entries;
CREATE POLICY finance_petty_cash_entries_finance_write ON public.finance_petty_cash_entries
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 9. finance_vouchers (company_id + branch_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_vouchers_finance_write ON public.finance_vouchers;
CREATE POLICY finance_vouchers_finance_write ON public.finance_vouchers
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- 10. finance_voucher_lines (join-based via voucher_id)
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_voucher_lines_finance_write ON public.finance_voucher_lines;
CREATE POLICY finance_voucher_lines_finance_write ON public.finance_voucher_lines
    FOR ALL TO authenticated
    USING (
        is_finance()
        AND EXISTS (
            SELECT 1 FROM public.finance_vouchers fv
            WHERE fv.id = finance_voucher_lines.voucher_id
              AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
        )
    )
    WITH CHECK (
        is_finance()
        AND EXISTS (
            SELECT 1 FROM public.finance_vouchers fv
            WHERE fv.id = finance_voucher_lines.voucher_id
              AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
        )
    );

-- ─────────────────────────────────────────────────────────────────
-- 11. finance_queue: add finance INSERT + UPDATE (finance can queue items and update status)
--     Finance already has SELECT via fq_finance_select; add a write policy.
-- ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fq_finance_write ON public.finance_queue;
CREATE POLICY fq_finance_write ON public.finance_queue
    FOR ALL TO authenticated
    USING (
        auth_has_role('finance')
        AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
    )
    WITH CHECK (
        auth_has_role('finance')
        AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
    );

-- ─────────────────────────────────────────────────────────────────
-- NOTE: finance_audit_logs intentionally excluded.
--       It has blanket INSERT=true (system audit trail) + admin SELECT.
--       Finance should not directly write audit logs.
-- ─────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────
-- AUDIT: non-finance_* tables needed by finance workflow
-- ─────────────────────────────────────────────────────────────────
-- journal_entries: already has je_finance_insert (INSERT blanket) + je_finance_update (UPDATE for unposted)
--   Finance can insert new journal entries and update drafts. ✅
-- journal_lines: already has jl_finance_insert (INSERT blanket). ✅
-- payroll_finance_postings: pfp_finance ALL (finance+hr branch-scoped). ✅
-- expense_entries: ee_finance ALL (finance branch-scoped). ✅
-- expense_categories: ec_admin ALL (admin OR finance). ✅
-- supplier_ledger: supplier_ledger_write_finance ALL (admin+finance+procurement). ✅
-- ap_ledger: apl_finance SELECT only — finance reads AP; writes typically via RPC (acceptable).
--
-- FINDING: cashbook running_balance is always 0.
--   post_finance_voucher (SECURITY DEFINER) hard-codes running_balance=0 on insert.
--   No trigger on finance_cashbook_entries to recompute it.
--   Running balance is therefore stale/incorrect — it should be computed as
--   SUM of prior debit_amount - credit_amount for the same ledger_id + account_id.
--   Flagged for FinFrontend to display computed balance from SUM query,
--   or for DBA to add a trigger. Not fixed here to keep scope tight.
