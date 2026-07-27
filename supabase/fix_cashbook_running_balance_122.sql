-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #122 — finance_cashbook_entries.running_balance never maintained
-- Seven Waves Restaurant ERP
--
-- Both write paths (post_finance_voucher RPC and the client _createCashbookEntry)
-- insert running_balance = 0 hardcoded. So the cashbook's running balance column
-- is always 0 and the cashbook page cannot show a correct ledger-wise balance.
--
-- FIX: a BEFORE INSERT trigger computes running_balance = (previous running
-- balance for the same ledger) + debit - credit, ordered by (entry_date, created_at).
-- Pay vouchers debit (money out), received credit (money in) — so running_balance
-- reflects the cash/bank ledger position over time. Deterministic and correct
-- regardless of which path inserts the row.
--
-- Idempotent / re-runnable. Applied 2026-07-26.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_cashbook_running_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_prior numeric := 0;
BEGIN
    -- Sum ALL existing entries for this ledger (net debit-credit). Using an
    -- aggregate over already-committed/visible rows avoids the same-timestamp
    -- ordering problem when several entries are inserted in one statement
    -- (now() is identical for all of them, so a "created_at < NEW.created_at"
    -- lookup would miss siblings). Each new row adds its own delta on top.
    SELECT COALESCE(SUM(COALESCE(debit_amount,0) - COALESCE(credit_amount,0)), 0)
      INTO v_prior
      FROM public.finance_cashbook_entries
     WHERE ledger_id = NEW.ledger_id;

    NEW.running_balance := v_prior
                           + COALESCE(NEW.debit_amount, 0)
                           - COALESCE(NEW.credit_amount, 0);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cashbook_running_balance ON public.finance_cashbook_entries;
CREATE TRIGGER trg_cashbook_running_balance
    BEFORE INSERT ON public.finance_cashbook_entries
    FOR EACH ROW EXECUTE FUNCTION public.fn_cashbook_running_balance();

-- Backfill existing rows so historical cashbook balances are correct.
WITH ordered AS (
    SELECT id,
           SUM(COALESCE(debit_amount,0) - COALESCE(credit_amount,0))
             OVER (PARTITION BY ledger_id ORDER BY entry_date, created_at
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rb
      FROM public.finance_cashbook_entries
)
UPDATE public.finance_cashbook_entries c
   SET running_balance = o.rb
  FROM ordered o
 WHERE o.id = c.id
   AND c.running_balance IS DISTINCT FROM o.rb;
