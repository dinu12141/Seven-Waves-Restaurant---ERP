-- ═══════════════════════════════════════════════════════════════════════════
-- #123 — Restrict DELETE on finance_accounts / finance_ledgers to ADMIN only
-- Seven Waves Restaurant ERP
--
-- The #120 finance-write policies were FOR ALL, which let the finance role also
-- DELETE accounts/ledgers. Business rule: accounts and ledgers may be created/
-- edited by finance, but DELETED only by admin (destructive, master data).
--
-- Fix: replace the finance-role FOR ALL policy on these two tables with explicit
-- INSERT + UPDATE policies (no DELETE). admin_* (FOR ALL) already covers admin
-- delete. All other finance_* tables keep FOR ALL (transactional data).
--
-- Company + branch scoping preserved. Idempotent / re-runnable.
--
-- NOTE: dropping/creating policies takes AccessExclusiveLock on the table. On a
-- live, in-use DB that can DEADLOCK against app reads. lock_timeout makes this
-- fail fast+clean (retry a moment later) instead of deadlocking; wrapped in one
-- txn so it's all-or-nothing. Already applied live 2026-07-26 (this re-run is
-- safe/idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

BEGIN;

-- ── finance_accounts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_accounts_finance_write ON public.finance_accounts;
DROP POLICY IF EXISTS finance_accounts_finance_insert ON public.finance_accounts;
DROP POLICY IF EXISTS finance_accounts_finance_update ON public.finance_accounts;

CREATE POLICY finance_accounts_finance_insert ON public.finance_accounts
    FOR INSERT TO authenticated
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    );

CREATE POLICY finance_accounts_finance_update ON public.finance_accounts
    FOR UPDATE TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    );

-- ── finance_ledgers ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS finance_ledgers_finance_write ON public.finance_ledgers;
DROP POLICY IF EXISTS finance_ledgers_finance_insert ON public.finance_ledgers;
DROP POLICY IF EXISTS finance_ledgers_finance_update ON public.finance_ledgers;

CREATE POLICY finance_ledgers_finance_insert ON public.finance_ledgers
    FOR INSERT TO authenticated
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    );

CREATE POLICY finance_ledgers_finance_update ON public.finance_ledgers
    FOR UPDATE TO authenticated
    USING (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    )
    WITH CHECK (
        is_finance()
        AND (company_id IS NULL OR company_id = get_user_company_id())
        AND (branch_id  IS NULL OR branch_id  = ANY (auth_branch_ids()))
    );

-- admin_* FOR ALL policies (incl DELETE) remain; only admin can delete these two.

COMMIT;
