-- ═══════════════════════════════════════════════════════════════════════════
-- #143 — Correct the opening-balance SIDE of 1002-1 and 3100
--
-- Live opening balances (the only reason the TB / Balance Sheet did not
-- balance — every cashbook posting is Dr = Cr):
--   1002-1 Commercial-1000725139  credit 765,207.34   ← bank HAD money (user, 2026-10-28) → DEBIT
--   1002-4 HNB -043010160698      debit  112,529.00
--   3100   Stated Capital          debit  400,404.84   ← capital → CREDIT (user, 2026-10-28)
--   10001  MAIN CASH -ACC          debit  126,136.75
--
-- After this fix: Dr openings 1,003,873.09 vs Cr openings 400,404.84 →
-- 603,468.25 of CREDIT openings is still missing (e.g. retained earnings b/f,
-- supplier balances / owner loan at go-live). The statements show it as
-- "Difference in Opening Balances (Suspense)" until finance enters it.
--
-- Only the side flips; amounts are unchanged. current_balance of the two
-- ledgers and the Commercial bank account is recomputed with the #122 rule
-- (signed opening + Σ Dr − Cr). Guarded: nothing changes unless the rows
-- still hold the values above. The Supabase editor commits per statement —
-- PART A is read-only, PART B is one atomic DO block.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART A — preview (read-only) ───────────────────────────────────────────
SELECT fl.ledger_code, fl.ledger_name, fl.account_group, fl.opening_balance_type, fl.opening_balance,
       fl.current_balance,
       CASE WHEN fl.ledger_code IN ('1002-1') THEN 'debit'
            WHEN fl.ledger_code IN ('3100')   THEN 'credit'
            ELSE fl.opening_balance_type END AS new_opening_type,
       (CASE WHEN fl.ledger_code = '3100' THEN -1
             WHEN fl.ledger_code = '1002-1' THEN 1
             WHEN fl.opening_balance_type = 'credit' THEN -1 ELSE 1 END) * COALESCE(fl.opening_balance, 0)
       + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount) FROM public.finance_cashbook_entries c
                    WHERE c.ledger_id = fl.id), 0) AS new_current_balance
  FROM public.finance_ledgers fl
 WHERE fl.deleted_at IS NULL AND COALESCE(fl.opening_balance, 0) <> 0
 ORDER BY fl.ledger_code;

-- ── PART B — apply ─────────────────────────────────────────────────────────
DO $$
DECLARE
    v_bank  public.finance_ledgers%ROWTYPE;
    v_cap   public.finance_ledgers%ROWTYPE;
    v_n     INT;
    v_diff  NUMERIC;
BEGIN
    SELECT COUNT(*) INTO v_n FROM public.finance_ledgers WHERE ledger_code = '1002-1' AND deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION '#143: expected exactly one live ledger 1002-1, found %', v_n; END IF;
    SELECT COUNT(*) INTO v_n FROM public.finance_ledgers WHERE ledger_code = '3100' AND deleted_at IS NULL;
    IF v_n <> 1 THEN RAISE EXCEPTION '#143: expected exactly one live ledger 3100, found %', v_n; END IF;

    SELECT * INTO v_bank FROM public.finance_ledgers WHERE ledger_code = '1002-1' AND deleted_at IS NULL FOR UPDATE;
    SELECT * INTO v_cap  FROM public.finance_ledgers WHERE ledger_code = '3100'   AND deleted_at IS NULL FOR UPDATE;

    IF v_bank.opening_balance_type = 'debit' AND v_cap.opening_balance_type = 'credit' THEN
        RAISE NOTICE '#143 already applied — nothing to do.';
        RETURN;
    END IF;
    IF v_bank.opening_balance_type <> 'credit' OR ABS(COALESCE(v_bank.opening_balance, 0) - 765207.34) > 0.005 THEN
        RAISE EXCEPTION '#143: 1002-1 opening is % % (expected credit 765207.34) — changed since the review; stopping.',
            v_bank.opening_balance_type, v_bank.opening_balance;
    END IF;
    IF v_cap.opening_balance_type <> 'debit' OR ABS(COALESCE(v_cap.opening_balance, 0) - 400404.84) > 0.005 THEN
        RAISE EXCEPTION '#143: 3100 opening is % % (expected debit 400404.84) — changed since the review; stopping.',
            v_cap.opening_balance_type, v_cap.opening_balance;
    END IF;

    UPDATE public.finance_ledgers SET opening_balance_type = 'debit',  updated_at = now() WHERE id = v_bank.id;
    UPDATE public.finance_ledgers SET opening_balance_type = 'credit', updated_at = now() WHERE id = v_cap.id;

    -- #122 recompute for the two ledgers
    UPDATE public.finance_ledgers fl
       SET current_balance = CASE WHEN fl.opening_balance_type = 'credit' THEN -1 ELSE 1 END * COALESCE(fl.opening_balance, 0)
                             + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
                                           FROM public.finance_cashbook_entries c WHERE c.ledger_id = fl.id), 0),
           updated_at = now()
     WHERE fl.id IN (v_bank.id, v_cap.id);

    -- Cash/bank accounts registered on 1002-1 (opening_balance on accounts is signed, Dr +)
    UPDATE public.finance_accounts fa
       SET current_balance = COALESCE(fa.opening_balance, 0)
                             + COALESCE((SELECT SUM(c.debit_amount - c.credit_amount)
                                           FROM public.finance_cashbook_entries c
                                          WHERE c.account_id = fa.id AND c.ledger_id = fa.ledger_id), 0),
           updated_at = now()
     WHERE fa.ledger_id = v_bank.id AND fa.deleted_at IS NULL;

    SELECT SUM(CASE WHEN opening_balance_type = 'credit' THEN -1 ELSE 1 END * COALESCE(opening_balance, 0))
      INTO v_diff FROM public.finance_ledgers WHERE deleted_at IS NULL;
    RAISE NOTICE '#143 applied. Remaining opening difference (Dr + / Cr −): %', v_diff;
END $$;

-- ── PART C — check (read-only) ─────────────────────────────────────────────
--   SELECT SUM(CASE WHEN opening_balance_type = 'credit' THEN -1 ELSE 1 END * COALESCE(opening_balance, 0)) AS opening_difference
--     FROM public.finance_ledgers WHERE deleted_at IS NULL;
--   -- expect 603468.25 until the missing credit openings are entered
