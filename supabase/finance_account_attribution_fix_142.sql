-- ═══════════════════════════════════════════════════════════════════════════
-- #142 — Cash/bank account attribution of old cashbook legs + account recompute
--
-- Why: vouchers posted before #134c (e.g. PV-000036 "Janith IOU", 17,740)
-- wrote the CATEGORY leg (Dr 100005 IOU) with the PAYING account's id
-- (MAIN CASH). So:
--   • the IOU account's statement shows nothing (its leg carries another
--     account_id), while its stored balance was bumped twice (#127 RPC +
--     legacy client) → 35,480 instead of 17,740;
--   • per-account statements / reconciliation pick the wrong rows.
-- A leg belongs to the account registered on the leg's OWN ledger.
--
-- What:
--   B1  legs whose account_id points to an account of ANOTHER ledger are
--       re-attributed to the single live account of the leg's ledger (or
--       account_id = NULL when that ledger has no account / several).
--   B2  finance_accounts.current_balance recomputed (opening + Σ Dr−Cr of its
--       own legs) for every account touched by B1 — nothing else.
-- Ledger balances are NOT touched (ledger_id never changes here).
--
-- The Supabase SQL editor commits statement by statement: PART A is read-only;
-- PART B is ONE DO block (atomic on its own).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART A — dry run (read-only). Run first, send me the result. ───────────
SELECT c.id, c.source_type, c.entry_date, c.description,
       l.ledger_code AS leg_ledger, a.registered_name AS current_account,
       la.ledger_code AS current_account_ledger,
       (SELECT string_agg(fa.registered_name, ', ') FROM public.finance_accounts fa
         WHERE fa.ledger_id = c.ledger_id AND fa.deleted_at IS NULL) AS accounts_on_leg_ledger,
       c.debit_amount, c.credit_amount
  FROM public.finance_cashbook_entries c
  JOIN public.finance_accounts a  ON a.id = c.account_id
  LEFT JOIN public.finance_ledgers l  ON l.id = c.ledger_id
  LEFT JOIN public.finance_ledgers la ON la.id = a.ledger_id
 WHERE a.ledger_id IS DISTINCT FROM c.ledger_id
 ORDER BY c.entry_date, c.created_at;

-- Accounts whose stored balance ≠ opening + Σ own legs (after B1 these should be 0 rows)
SELECT fa.registered_name, fl.ledger_code, fa.current_balance,
       COALESCE(fa.opening_balance, 0) + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
           FROM public.finance_cashbook_entries c
          WHERE c.account_id = fa.id AND c.ledger_id = fa.ledger_id), 0) AS recomputed
  FROM public.finance_accounts fa
  LEFT JOIN public.finance_ledgers fl ON fl.id = fa.ledger_id
 WHERE fa.deleted_at IS NULL
   AND ABS(COALESCE(fa.current_balance, 0) - (COALESCE(fa.opening_balance, 0) + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
           FROM public.finance_cashbook_entries c
          WHERE c.account_id = fa.id AND c.ledger_id = fa.ledger_id), 0))) > 0.01;

-- ── PART B — apply (only after you have checked PART A) ────────────────────
DO $$
DECLARE
    r        RECORD;
    v_new    UUID;
    v_n      INT := 0;
    v_bal    NUMERIC;
    v_touch  UUID[] := '{}';
BEGIN
    FOR r IN
        SELECT c.id, c.ledger_id, c.account_id, c.description
          FROM public.finance_cashbook_entries c
          JOIN public.finance_accounts a ON a.id = c.account_id
         WHERE a.ledger_id IS DISTINCT FROM c.ledger_id
         FOR UPDATE OF c
    LOOP
        v_new := NULL;
        IF (SELECT COUNT(*) FROM public.finance_accounts
             WHERE ledger_id = r.ledger_id AND deleted_at IS NULL) = 1 THEN
            SELECT id INTO v_new FROM public.finance_accounts
             WHERE ledger_id = r.ledger_id AND deleted_at IS NULL;
        END IF;

        UPDATE public.finance_cashbook_entries SET account_id = v_new WHERE id = r.id;
        v_touch := v_touch || r.account_id;
        IF v_new IS NOT NULL THEN v_touch := v_touch || v_new; END IF;
        v_n := v_n + 1;
        RAISE NOTICE 'B1 leg % (%): account % → %', r.id, left(r.description, 60), r.account_id, COALESCE(v_new::text, 'NULL');
    END LOOP;

    FOR r IN SELECT DISTINCT unnest(v_touch) AS id LOOP
        SELECT COALESCE(fa.opening_balance, 0) + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
                   FROM public.finance_cashbook_entries c
                  WHERE c.account_id = fa.id AND c.ledger_id = fa.ledger_id), 0)
          INTO v_bal
          FROM public.finance_accounts fa WHERE fa.id = r.id;
        UPDATE public.finance_accounts SET current_balance = v_bal, updated_at = now() WHERE id = r.id;
        RAISE NOTICE 'B2 account % balance → %', r.id, v_bal;
    END LOOP;

    RAISE NOTICE '#142: % leg(s) re-attributed, % account(s) recomputed.', v_n, COALESCE(array_length(ARRAY(SELECT DISTINCT unnest(v_touch)), 1), 0);
END $$;
