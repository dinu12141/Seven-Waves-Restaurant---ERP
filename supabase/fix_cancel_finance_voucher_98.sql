-- ═══════════════════════════════════════════════════════════════════════════
-- #98 (part) — Atomic finance voucher cancellation
-- Seven Waves Restaurant ERP
--
-- BEFORE: finance-voucher.service.js cancelVoucher() reversed a POSTED voucher
-- from the CLIENT in THREE separate round-trips:
--   _createReversalCashbookEntry() → _reverseLedgerBalance() → update status.
-- Same non-atomic partial-commit family as #50/#51 (post_finance_voucher).
-- If any step failed mid-way you got a half-reversed voucher (reversal cashbook
-- written but ledger not adjusted, or status stuck). The ledger reversal was
-- ALSO a racy read-modify-write (lost update under concurrency).
--
-- AFTER: cancel_finance_voucher() does it in ONE transaction, row-locked,
-- status-guarded, with an atomic in-DB ledger delta (no read-modify-write).
-- Mirrors post_finance_voucher's reversal exactly (opposite cashbook signs,
-- opposite ledger delta) and voids any issued cheque.
--
-- Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_finance_voucher(
    p_voucher_id uuid,
    p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v       public.finance_vouchers;
    v_user  uuid := auth.uid();
    v_delta numeric;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (is_admin() OR is_manager() OR is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Insufficient role. Requires finance/manager/admin.');
    END IF;

    -- Lock the voucher so concurrent cancel/post serialise.
    SELECT * INTO v FROM public.finance_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;

    -- Idempotent.
    IF v.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'voucher_id', v.id);
    END IF;

    -- Only reverse financial effects if the voucher was actually POSTED.
    IF v.status = 'posted' THEN
        -- Reversal cashbook entry — opposite signs to the original post.
        INSERT INTO public.finance_cashbook_entries (
            company_id, branch_id, source_type, source_id, entry_date,
            ledger_id, account_id, description, debit_amount, credit_amount, running_balance
        ) VALUES (
            v.company_id, v.branch_id,
            CASE WHEN v.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END,
            v.id, CURRENT_DATE, v.ledger_id, v.account_id,
            'REVERSAL: ' || v.voucher_no || COALESCE(' — ' || NULLIF(btrim(p_reason), ''), ''),
            CASE WHEN v.voucher_type = 'received' THEN v.amount ELSE 0 END,
            CASE WHEN v.voucher_type = 'pay'      THEN v.amount ELSE 0 END,
            0
        );

        -- Ledger balance: atomic in-DB delta = exact inverse of the post delta
        -- (post was pay:-amount / received:+amount; reversal is pay:+amount / received:-amount).
        v_delta := CASE WHEN v.voucher_type = 'pay' THEN v.amount ELSE -v.amount END;
        UPDATE public.finance_ledgers
           SET current_balance = COALESCE(current_balance, 0) + v_delta,
               updated_at = now()
         WHERE id = v.ledger_id;

        -- Void any issued cheque tied to this voucher. (Only `status` is touched
        -- — post_finance_voucher proves status/voucher_id exist; we don't assume
        -- an updated_at column on finance_cheques.)
        UPDATE public.finance_cheques
           SET status = 'cancelled'
         WHERE voucher_id = v.id AND status = 'issued';
    END IF;

    -- Mark cancelled.
    UPDATE public.finance_vouchers
       SET status = 'cancelled', updated_by = v_user, updated_at = now()
     WHERE id = v.id;

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v.id,
        'status', 'cancelled',
        'was_posted', (v.status = 'posted'),
        'reason', NULLIF(btrim(p_reason), '')
    );
EXCEPTION WHEN OTHERS THEN
    -- Whole reversal rolls back atomically.
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_finance_voucher(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_finance_voucher(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.cancel_finance_voucher(uuid, text) IS
  '#98 — atomic voucher cancel: row-locked, status-guarded; reverses cashbook + '
  'ledger (in-DB delta) + voids cheque for POSTED vouchers, else just cancels. '
  'Replaces the client 3-txn reversal in finance-voucher.service.js.';
