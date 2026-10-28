-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE #134c — Pay / Receive voucher posting: true double entry, DB-only
-- Seven Waves Restaurant ERP                                   (NOT yet applied)
--
-- Apply order: #128 → #129 → #131 → #132 → #133 → #135 → #137 → #138 → #134 → #134b → #134c → #136 → #139
--   (needs #128's fn_fin_post_leg /
-- fn_fin_reverse_source). Ship together with the finance-voucher.service.js
-- change (client no longer writes header balances; it only completes a cancel
-- when the RPC does not report reversal_v3).
--
-- Bugs fixed (latest definitions: #127 post, #98 cancel)
--  1. #127 wrote ONE cashbook row (category ledger, carrying the cash
--     account_id) and moved the cash ledger/account directly → the cashbook
--     never balances (live: Dr 17,740 / Cr 0) and a #122 recompute loses the
--     cash side. Now: two legs via fn_fin_post_leg —
--       pay      : Dr category ledger            / Cr cash-bank ledger (+account)
--       received : Dr cash-bank ledger (+account) / Cr category ledger
--     plus one leg per finance_voucher_lines row (lines must balance).
--  2. #127 received vouchers added +amount to the income ledger; under #122
--     (balance += debit − credit) a credit must subtract. Fixed by (1).
--  3. #98 cancel only reversed the category ledger, with the #122-era sign
--     (pay +amount) — the cash side was never reversed. Now: v3 vouchers are
--     mirror-reversed with fn_fin_reverse_source; vouchers posted before this
--     migration get an explicit mirror of #127's math. Both return
--     reversal_v3 = true so the client applies nothing.
--  4. Missing ledger / cash account → RAISE (returned as {success:false}),
--     never a half-posted voucher. Voucher lines are now posted by the DB
--     (ledger_v3 = true), not by the client.
--  5. A voucher whose cheque has cleared cannot be cancelled.
--
-- Signatures unchanged: post_finance_voucher(uuid), cancel_finance_voucher(uuid, text).
-- Re-runnable. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
    IF to_regprocedure('public.fn_fin_post_leg(uuid,uuid,text,uuid,date,uuid,uuid,text,numeric,numeric)') IS NULL
       OR to_regprocedure('public.fn_fin_reverse_source(text,uuid,date,text)') IS NULL THEN
        RAISE EXCEPTION '#134c precondition: apply #128 first (fn_fin_post_leg / fn_fin_reverse_source missing).';
    END IF;
END $$;

-- Which posting engine posted the voucher (NULL = legacy #127 / client math)
ALTER TABLE public.finance_vouchers ADD COLUMN IF NOT EXISTS posting_version TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. post_finance_voucher
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.post_finance_voucher(p_voucher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
    v          public.finance_vouchers;
    v_user     uuid := auth.uid();
    v_debit    numeric := 0;
    v_credit   numeric := 0;
    v_cash     public.finance_accounts;
    v_cat      public.finance_ledgers;
    v_cat_acc  uuid;
    v_src      text;
    v_desc     text;
    r          record;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    SELECT * INTO v FROM public.finance_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;

    -- AuthZ (SECURITY DEFINER + granted to authenticated → must check here):
    --   admin: any voucher
    --   finance: vouchers of own branches
    --   cashier: ONLY the shift-close cash hand-over (shiftStore.ts:310) —
    --            a received, cash voucher they created themselves, own branch
    IF NOT (
        public.is_admin()
        OR (v.branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))
            AND (public.is_finance()
                 OR (public.auth_has_role('cashier')
                     AND v.voucher_type = 'received'
                     AND COALESCE(v.payment_method, '') = 'cash'
                     AND v.created_by = v_user)))
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised to post this voucher.');
    END IF;

    IF v.status = 'posted' THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true, 'ledger_v3', v.posting_version = 'v3');
    END IF;
    IF v.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only approved vouchers can be posted');
    END IF;
    IF v.voucher_type NOT IN ('pay', 'received') THEN
        RAISE EXCEPTION 'Unknown voucher type %.', v.voucher_type;
    END IF;
    IF COALESCE(v.amount, 0) <= 0 THEN
        RAISE EXCEPTION 'Voucher amount must be positive.';
    END IF;

    SELECT COALESCE(sum(debit_amount), 0), COALESCE(sum(credit_amount), 0)
      INTO v_debit, v_credit
      FROM public.finance_voucher_lines WHERE voucher_id = v.id;
    IF (v_debit + v_credit) > 0 AND abs(v_debit - v_credit) > 0.01 THEN
        RAISE EXCEPTION 'Double-entry imbalance on voucher lines: Debit % <> Credit %', v_debit, v_credit;
    END IF;

    -- Category ledger (company-scoped)
    SELECT * INTO v_cat FROM public.finance_ledgers
     WHERE id = v.ledger_id AND deleted_at IS NULL
       AND (company_id = v.company_id OR company_id IS NULL OR v.company_id IS NULL);
    IF v_cat.id IS NULL THEN
        RAISE EXCEPTION 'LEDGER_MISSING: voucher % has no valid category ledger.', v.voucher_no;
    END IF;

    -- Paying / receiving cash-bank account with a linked ledger
    SELECT * INTO v_cash FROM public.finance_accounts
     WHERE id = COALESCE(v.account_id, v.bank_id) AND deleted_at IS NULL
       AND (company_id = v.company_id OR company_id IS NULL OR v.company_id IS NULL)
     FOR UPDATE;
    IF v_cash.id IS NULL OR v_cash.ledger_id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_MISSING: voucher % needs a cash/bank account with a linked ledger.', v.voucher_no;
    END IF;
    IF v_cash.ledger_id = v_cat.id THEN
        RAISE EXCEPTION 'Voucher % debits and credits the same ledger.', v.voucher_no;
    END IF;

    -- A cash/bank account registered on the category ledger itself (e.g. a
    -- transfer to another bank) moves with it — #127 did this for all of them.
    SELECT fa.id INTO v_cat_acc FROM public.finance_accounts fa
     WHERE fa.ledger_id = v_cat.id AND fa.deleted_at IS NULL AND fa.id <> v_cash.id
     ORDER BY fa.is_default DESC, fa.created_at LIMIT 1;

    v_src  := CASE WHEN v.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END;
    v_desc := v.voucher_no || ' — ' || COALESCE(NULLIF(v.remark, ''), NULLIF(v.narration, ''),
              CASE WHEN v.voucher_type = 'pay' THEN COALESCE(v.pay_to, '') ELSE COALESCE(v.received_from, '') END);

    UPDATE public.finance_vouchers
       SET status = 'posted', posted_by = v_user, posted_at = now(),
           posting_version = 'v3', updated_at = now()
     WHERE id = v.id;

    IF v.voucher_type = 'pay' THEN
        PERFORM public.fn_fin_post_leg(v.company_id, v.branch_id, v_src, v.id, v.voucher_date,
            v_cat.id, v_cat_acc, v_desc, v.amount, 0);
        PERFORM public.fn_fin_post_leg(v.company_id, v.branch_id, v_src, v.id, v.voucher_date,
            v_cash.ledger_id, v_cash.id, v_desc, 0, v.amount);
    ELSE
        PERFORM public.fn_fin_post_leg(v.company_id, v.branch_id, v_src, v.id, v.voucher_date,
            v_cash.ledger_id, v_cash.id, v_desc, v.amount, 0);
        PERFORM public.fn_fin_post_leg(v.company_id, v.branch_id, v_src, v.id, v.voucher_date,
            v_cat.id, v_cat_acc, v_desc, 0, v.amount);
    END IF;

    -- Additional balanced lines (previously applied by the client)
    FOR r IN
        SELECT l.ledger_id, l.description, l.debit_amount, l.credit_amount
          FROM public.finance_voucher_lines l
         WHERE l.voucher_id = v.id
           AND (COALESCE(l.debit_amount, 0) <> 0 OR COALESCE(l.credit_amount, 0) <> 0)
    LOOP
        PERFORM public.fn_fin_post_leg(v.company_id, v.branch_id, v_src, v.id, v.voucher_date,
            r.ledger_id, NULL, v_desc || COALESCE(' / ' || r.description, ''),
            COALESCE(r.debit_amount, 0), COALESCE(r.credit_amount, 0));
    END LOOP;

    IF COALESCE(v.payment_method, '') ILIKE '%cheque%' THEN
        INSERT INTO public.finance_cheques (
            company_id, branch_id, voucher_id, bank_account_id,
            cheque_no, cheque_date, issued_to, amount, status
        ) VALUES (
            -- same account the cash/bank GL leg above was posted to
            v.company_id, v.branch_id, v.id, v_cash.id,
            'CHQ-' || v.voucher_no, v.voucher_date,
            COALESCE(v.pay_to, v.received_from), v.amount, 'issued'
        );
    END IF;

    RETURN jsonb_build_object('success', true, 'voucher_id', v.id, 'status', 'posted',
                              'double_entry_v2', true, 'ledger_v3', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.post_finance_voucher(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_finance_voucher(uuid) TO authenticated;
COMMENT ON FUNCTION public.post_finance_voucher(uuid) IS
  '#134c: posts an approved voucher as balanced cashbook legs (Dr/Cr category vs cash-bank + voucher lines) via fn_fin_post_leg. The client must not apply any balance deltas (ledger_v3).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cancel_finance_voucher
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_finance_voucher(
    p_voucher_id uuid,
    p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v        public.finance_vouchers;
    v_user   uuid := auth.uid();
    v_src    text;
    v_cash   public.finance_accounts;
    v_sign   numeric;   -- +1 pay, −1 received (legacy mirror of #127 cash side)
    r        record;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;
    IF NOT (public.is_admin() OR public.is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role. Requires finance/admin.');
    END IF;

    SELECT * INTO v FROM public.finance_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;
    IF NOT public.is_admin()
       AND NOT (v.branch_id = ANY (COALESCE(public.auth_branch_ids(), ARRAY[]::uuid[]))) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authorised for this branch.');
    END IF;
    IF v.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'voucher_id', v.id, 'reversal_v3', true);
    END IF;

    v_src := CASE WHEN v.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END;

    IF v.status = 'posted' THEN
        IF EXISTS (SELECT 1 FROM public.finance_cheques WHERE voucher_id = v.id AND status = 'cleared') THEN
            RAISE EXCEPTION 'CHEQUE_CLEARED: the cheque of voucher % has cleared — cancel is not allowed; post a reversing voucher instead.', v.voucher_no;
        END IF;
        IF EXISTS (SELECT 1 FROM public.finance_cheques WHERE voucher_id = v.id AND status = 'bounced') THEN
            RAISE EXCEPTION 'CHEQUE_BOUNCED: voucher % was already reversed by its cheque bounce.', v.voucher_no;
        END IF;

        IF v.posting_version = 'v3' THEN
            -- Mirror-reverse every leg (header + lines), append-only.
            PERFORM public.fn_fin_reverse_source(v_src, v.id, CURRENT_DATE, v.voucher_no || COALESCE(' (' || NULLIF(btrim(p_reason), '') || ')', ''));
        ELSE
            -- Legacy voucher (#127 math + client-applied lines): undo EXACTLY what
            -- was applied — a mirror, not a #122-convention reversal. #127 (L86-131)
            -- applied, for both voucher types, +amt to the category ledger and to
            -- every account on it; and to the cash account + its ledger −amt (pay)
            -- / +amt (received). The mirror is therefore:
            --                     pay     received
            --   category ledger   −amt    −amt
            --   category accounts −amt    −amt
            --   cash acc + ledger +amt    −amt     (v_sign)
            -- (A #122-convention reversal of a received voucher would Dr income
            -- +amt and leave it at +2amt, because #127 posted it with the wrong
            -- sign.) Same table as voucherLegacyCancelDeltas() + #98's own delta
            -- in finance-voucher.service.js, covered by tests/finance.
            v_sign := CASE WHEN v.voucher_type = 'pay' THEN 1 ELSE -1 END;

            INSERT INTO public.finance_cashbook_entries (
                company_id, branch_id, source_type, source_id, entry_date,
                ledger_id, account_id, description, debit_amount, credit_amount, running_balance
            ) VALUES (
                v.company_id, v.branch_id, v_src, v.id, CURRENT_DATE, v.ledger_id, v.account_id,
                'REVERSAL: ' || v.voucher_no || COALESCE(' — ' || NULLIF(btrim(p_reason), ''), ''),
                CASE WHEN v.voucher_type = 'received' THEN v.amount ELSE 0 END,
                CASE WHEN v.voucher_type = 'pay'      THEN v.amount ELSE 0 END,
                0);

            -- #127 added +amount to the category ledger and its accounts for BOTH types
            UPDATE public.finance_ledgers  SET current_balance = COALESCE(current_balance, 0) - v.amount, updated_at = now() WHERE id = v.ledger_id;
            UPDATE public.finance_accounts SET current_balance = COALESCE(current_balance, 0) - v.amount, updated_at = now() WHERE ledger_id = v.ledger_id;

            -- #127 moved cash by −amount (pay) / +amount (received)
            SELECT * INTO v_cash FROM public.finance_accounts WHERE id = COALESCE(v.account_id, v.bank_id);
            IF v_cash.id IS NOT NULL THEN
                UPDATE public.finance_accounts SET current_balance = COALESCE(current_balance, 0) + v_sign * v.amount, updated_at = now() WHERE id = v_cash.id;
                IF v_cash.ledger_id IS NOT NULL THEN
                    UPDATE public.finance_ledgers SET current_balance = COALESCE(current_balance, 0) + v_sign * v.amount, updated_at = now() WHERE id = v_cash.ledger_id;
                END IF;
            END IF;

            -- Lines were applied by the client on post (Σ debit − credit)
            FOR r IN SELECT ledger_id, debit_amount, credit_amount FROM public.finance_voucher_lines WHERE voucher_id = v.id LOOP
                UPDATE public.finance_ledgers
                   SET current_balance = COALESCE(current_balance, 0) - (COALESCE(r.debit_amount, 0) - COALESCE(r.credit_amount, 0)),
                       updated_at = now()
                 WHERE id = r.ledger_id;
            END LOOP;
        END IF;

        UPDATE public.finance_cheques
           SET status = 'cancelled', cancelled_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Voucher ' || v.voucher_no || ' cancelled'),
               updated_at = now()
         WHERE voucher_id = v.id AND status IN ('planned', 'issued', 'stale');
    END IF;

    UPDATE public.finance_vouchers
       SET status = 'cancelled', updated_by = v_user, updated_at = now()
     WHERE id = v.id;

    RETURN jsonb_build_object('success', true, 'voucher_id', v.id, 'status', 'cancelled',
                              'was_posted', (v.status = 'posted'), 'reversal_v3', true,
                              'reason', NULLIF(btrim(p_reason), ''));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_finance_voucher(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_finance_voucher(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.cancel_finance_voucher(uuid, text) IS
  '#134c: atomic voucher cancel. v3 vouchers: fn_fin_reverse_source; legacy vouchers: explicit mirror of #127. Returns reversal_v3 so the client applies nothing.';

COMMIT;

NOTIFY pgrst, 'reload schema';
