-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #122 — finance_ledgers.current_balance ignores opening_balance
-- Seven Waves Restaurant ERP
--
-- BUG: ledger create set current_balance=0 (never seeded from opening_balance),
-- and only voucher-post deltas moved it. So Ledger Registration showed 0 balance
-- even for a ledger opened with e.g. LKR 25,000. current_balance must be
-- opening balance (signed by opening_balance_type) + net of posted cashbook
-- deltas for that ledger.
--
-- FIX: recompute current_balance for every ledger =
--   signed_opening + SUM(posted cashbook debit - credit for that ledger).
-- Cashbook debit = money out (pay voucher), credit = money in (received). A
-- ledger's running position mirrors finance_cashbook_entries (which post_finance_
-- voucher already writes). Client create path now seeds current_balance too.
--
-- Idempotent / re-runnable. Applied 2026-07-26.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.finance_ledgers l
   SET current_balance = signed_opening + cb.net,
       updated_at = now()
  FROM (
    SELECT gl.id,
           CASE WHEN gl.opening_balance_type = 'credit'
                THEN -COALESCE(gl.opening_balance, 0)
                ELSE  COALESCE(gl.opening_balance, 0) END AS signed_opening,
           COALESCE((
             SELECT SUM(COALESCE(c.debit_amount,0) - COALESCE(c.credit_amount,0))
               FROM public.finance_cashbook_entries c
              WHERE c.ledger_id = gl.id
           ), 0) AS net
      FROM public.finance_ledgers gl
  ) cb
 WHERE cb.id = l.id
   AND l.current_balance IS DISTINCT FROM (cb.signed_opening + cb.net);
