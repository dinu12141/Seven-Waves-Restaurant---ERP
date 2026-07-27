-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #122 — post_finance_voucher crashes on cheque vouchers (uuid/text COALESCE)
-- Seven Waves Restaurant ERP
--
-- BUG: posting a voucher with payment_method='cheque' returned
-- {success:false, error:"COALESCE types uuid and text cannot be matched"}.
-- Cause: line built cheque_no as COALESCE(v.cheque_id, 'CHQ-'||v.voucher_no),
-- but finance_vouchers.cheque_id is UUID while finance_cheques.cheque_no is TEXT.
-- COALESCE cannot mix uuid + text → the whole post aborted (no cashbook, no
-- ledger update). Every cheque payment voucher failed to post.
--
-- FIX: cheque_no is a human text number → use 'CHQ-' || voucher_no directly.
-- (cheque_id is a uuid reference, not the printed number.) Everything else
-- unchanged. running_balance stays 0 here because trg_cashbook_running_balance
-- (BEFORE INSERT) computes it.
--
-- Idempotent (CREATE OR REPLACE). Applied 2026-07-27.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.post_finance_voucher(p_voucher_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v public.finance_vouchers;
    v_debit  numeric := 0;
    v_credit numeric := 0;
    v_delta  numeric;
    v_user   uuid := auth.uid();
BEGIN
    SELECT * INTO v FROM public.finance_vouchers WHERE id = p_voucher_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Voucher not found');
    END IF;

    IF v.status = 'posted' THEN
        RETURN jsonb_build_object('success', true, 'already_posted', true);
    END IF;
    IF v.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only approved vouchers can be posted');
    END IF;

    SELECT COALESCE(sum(debit_amount),0), COALESCE(sum(credit_amount),0)
      INTO v_debit, v_credit
      FROM public.finance_voucher_lines
     WHERE voucher_id = p_voucher_id;
    IF (v_debit + v_credit) > 0 AND abs(v_debit - v_credit) > 0.01 THEN
        RETURN jsonb_build_object('success', false,
               'error', format('Double-entry imbalance: Debit %s <> Credit %s', v_debit, v_credit));
    END IF;

    UPDATE public.finance_vouchers
       SET status = 'posted', posted_by = v_user, posted_at = now(), updated_at = now()
     WHERE id = p_voucher_id;

    INSERT INTO public.finance_cashbook_entries (
        company_id, branch_id, source_type, source_id, entry_date,
        ledger_id, account_id, description, debit_amount, credit_amount, running_balance
    ) VALUES (
        v.company_id, v.branch_id,
        CASE WHEN v.voucher_type = 'pay' THEN 'pay_voucher' ELSE 'received_voucher' END,
        v.id, v.voucher_date, v.ledger_id, v.account_id,
        v.voucher_no || ' — ' || COALESCE(v.remark, v.narration, ''),
        CASE WHEN v.voucher_type = 'pay'      THEN v.amount ELSE 0 END,
        CASE WHEN v.voucher_type = 'received' THEN v.amount ELSE 0 END,
        0
    );

    IF v.payment_method = 'cheque' THEN
        INSERT INTO public.finance_cheques (
            company_id, branch_id, voucher_id, bank_account_id,
            cheque_no, cheque_date, issued_to, amount, status
        ) VALUES (
            v.company_id, v.branch_id, v.id, COALESCE(v.bank_id, v.account_id),
            'CHQ-' || v.voucher_no,          -- text cheque number (was uuid/text COALESCE crash)
            v.voucher_date, v.pay_to, v.amount, 'issued'
        );
    END IF;

    v_delta := CASE WHEN v.voucher_type = 'pay' THEN -v.amount ELSE v.amount END;
    UPDATE public.finance_ledgers
       SET current_balance = COALESCE(current_balance, 0) + v_delta, updated_at = now()
     WHERE id = v.ledger_id;

    RETURN jsonb_build_object('success', true, 'voucher_id', v.id, 'status', 'posted');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
