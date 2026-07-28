-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #124 — finance_*_finance_write RLS policies block admin
-- Seven Waves Restaurant ERP
--
-- BUG: fix_finance_rls_write_120.sql added *_finance_write policies scoped to
-- is_finance() only ("USING (is_finance() AND ...)"). An admin who does NOT
-- also hold the explicit 'finance' role is blocked from INSERT/UPDATE/DELETE
-- on every finance_* table — including finance_vouchers, which is why
-- creating a Pay Voucher (e.g. a cheque payment) as admin fails with
-- "You need finance or admin permission for this action."
--
-- Every other RLS policy in this codebase treats is_admin() as an unconditional
-- bypass (cross-branch, cross-company). These finance write policies were the
-- one place that never got the admin OR-clause.
--
-- FIX: add "OR is_admin()" to both USING and WITH CHECK on all 9 policies
-- from fix_finance_rls_write_120.sql. Admin keeps full cross-branch access
-- (branch/company filters only apply to the is_finance() branch); finance
-- role keeps its existing branch/company-scoped access unchanged.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. finance_accounts
DROP POLICY IF EXISTS finance_accounts_finance_write ON public.finance_accounts;
CREATE POLICY finance_accounts_finance_write ON public.finance_accounts
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 2. finance_bank_reconciliations
DROP POLICY IF EXISTS finance_bank_reconciliations_finance_write ON public.finance_bank_reconciliations;
CREATE POLICY finance_bank_reconciliations_finance_write ON public.finance_bank_reconciliations
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 3. finance_bank_reconciliation_lines
DROP POLICY IF EXISTS finance_bank_reconciliation_lines_finance_write ON public.finance_bank_reconciliation_lines;
CREATE POLICY finance_bank_reconciliation_lines_finance_write ON public.finance_bank_reconciliation_lines
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND EXISTS (
                SELECT 1 FROM public.finance_bank_reconciliations fbr
                WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
                  AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
            )
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND EXISTS (
                SELECT 1 FROM public.finance_bank_reconciliations fbr
                WHERE fbr.id = finance_bank_reconciliation_lines.reconciliation_id
                  AND (fbr.company_id IS NULL OR fbr.company_id = get_user_company_id())
            )
        )
    );

-- 4. finance_cashbook_entries
DROP POLICY IF EXISTS finance_cashbook_entries_finance_write ON public.finance_cashbook_entries;
CREATE POLICY finance_cashbook_entries_finance_write ON public.finance_cashbook_entries
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 5. finance_cheques
DROP POLICY IF EXISTS finance_cheques_finance_write ON public.finance_cheques;
CREATE POLICY finance_cheques_finance_write ON public.finance_cheques
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 6. finance_documents (branch_id only — no company_id column)
DROP POLICY IF EXISTS finance_documents_finance_write ON public.finance_documents;
CREATE POLICY finance_documents_finance_write ON public.finance_documents
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
        )
    );

-- 7. finance_ledgers
DROP POLICY IF EXISTS finance_ledgers_finance_write ON public.finance_ledgers;
CREATE POLICY finance_ledgers_finance_write ON public.finance_ledgers
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 8. finance_petty_cash_entries
DROP POLICY IF EXISTS finance_petty_cash_entries_finance_write ON public.finance_petty_cash_entries;
CREATE POLICY finance_petty_cash_entries_finance_write ON public.finance_petty_cash_entries
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 9. finance_vouchers
DROP POLICY IF EXISTS finance_vouchers_finance_write ON public.finance_vouchers;
CREATE POLICY finance_vouchers_finance_write ON public.finance_vouchers
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND (company_id IS NULL OR company_id = get_user_company_id())
            AND (branch_id  IS NULL OR branch_id  = ANY(auth_branch_ids()))
        )
    );

-- 10. finance_voucher_lines
DROP POLICY IF EXISTS finance_voucher_lines_finance_write ON public.finance_voucher_lines;
CREATE POLICY finance_voucher_lines_finance_write ON public.finance_voucher_lines
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            is_finance()
            AND EXISTS (
                SELECT 1 FROM public.finance_vouchers fv
                WHERE fv.id = finance_voucher_lines.voucher_id
                  AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
            )
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            is_finance()
            AND EXISTS (
                SELECT 1 FROM public.finance_vouchers fv
                WHERE fv.id = finance_voucher_lines.voucher_id
                  AND (fv.company_id IS NULL OR fv.company_id = get_user_company_id())
            )
        )
    );

-- 11. finance_queue
DROP POLICY IF EXISTS fq_finance_write ON public.finance_queue;
CREATE POLICY fq_finance_write ON public.finance_queue
    FOR ALL TO authenticated
    USING (
        is_admin()
        OR (
            auth_has_role('finance')
            AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
        )
    )
    WITH CHECK (
        is_admin()
        OR (
            auth_has_role('finance')
            AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids()))
        )
    );
