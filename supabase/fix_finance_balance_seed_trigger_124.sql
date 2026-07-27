-- ═══════════════════════════════════════════════════════════════════════════
-- #124 — Seed current_balance from opening_balance at the DB (client-proof)
-- Seven Waves Restaurant ERP
--
-- The client-side seed (finance-ledger/account service) only helps if the app
-- is rebuilt/deployed. A ledger created 2026-07-27 still showed current_balance=0
-- while the opening_balance was 4,000,000 → the running client is the OLD build.
--
-- Fix at the DB so it is ALWAYS correct regardless of client version: a BEFORE
-- INSERT trigger sets current_balance from the signed opening balance WHEN the
-- client did not supply a non-zero current_balance. On finance_ledgers the sign
-- follows opening_balance_type (credit => negative). finance_accounts has no
-- balance type (asset-style) so current = opening.
--
-- Idempotent / re-runnable. lock_timeout guards against deadlock on the live table.
-- ═══════════════════════════════════════════════════════════════════════════

SET lock_timeout = '5s';

-- ── finance_ledgers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_seed_ledger_current_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(NEW.current_balance, 0) = 0 AND COALESCE(NEW.opening_balance, 0) <> 0 THEN
        NEW.current_balance := CASE
            WHEN NEW.opening_balance_type = 'credit' THEN -NEW.opening_balance
            ELSE NEW.opening_balance
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_ledger_balance ON public.finance_ledgers;
CREATE TRIGGER trg_seed_ledger_balance
    BEFORE INSERT ON public.finance_ledgers
    FOR EACH ROW EXECUTE FUNCTION public.fn_seed_ledger_current_balance();

-- ── finance_accounts ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_seed_account_current_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF COALESCE(NEW.current_balance, 0) = 0 AND COALESCE(NEW.opening_balance, 0) <> 0 THEN
        NEW.current_balance := NEW.opening_balance;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_account_balance ON public.finance_accounts;
CREATE TRIGGER trg_seed_account_balance
    BEFORE INSERT ON public.finance_accounts
    FOR EACH ROW EXECUTE FUNCTION public.fn_seed_account_current_balance();

-- ── Backfill any rows that slipped through with 0 (created by the old client) ─
UPDATE public.finance_ledgers
   SET current_balance = CASE WHEN opening_balance_type = 'credit'
                              THEN -opening_balance ELSE opening_balance END,
       updated_at = now()
 WHERE COALESCE(current_balance,0) = 0 AND COALESCE(opening_balance,0) <> 0
   AND id NOT IN (SELECT DISTINCT ledger_id FROM public.finance_cashbook_entries WHERE ledger_id IS NOT NULL);

UPDATE public.finance_accounts
   SET current_balance = opening_balance, updated_at = now()
 WHERE COALESCE(current_balance,0) = 0 AND COALESCE(opening_balance,0) <> 0;
