-- ═══════════════════════════════════════════════════════════════════════════
-- FIX #127 — Double-entry Ledger & Account updates for Vouchers
-- Seven Waves Restaurant ERP
--
-- 1. For Pay Vouchers:
--    - Expense / Category Ledger (v.ledger_id): +v.amount (DEBIT - Expense increases)
--    - Cash / Bank Account (v.account_id): -v.amount (CREDIT - Cash decreases)
--    - Linked Ledger of Cash/Bank Account: -v.amount (CREDIT - Cash ledger decreases)
-- 2. For Received Vouchers:
--    - Cash / Bank Account (v.account_id): +v.amount (DEBIT - Cash increases)
--    - Linked Ledger of Cash/Bank Account: +v.amount (DEBIT - Cash ledger increases)
--    - Income / Category Ledger (v.ledger_id): +v.amount
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
    v_user   uuid := auth.uid();
    v_cash_acc public.finance_accounts;
    v_pay_acc_id uuid;
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

    -- 1. Cashbook Entry
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
            'CHQ-' || v.voucher_no,
            v.voucher_date, v.pay_to, v.amount, 'issued'
        );
    END IF;

    -- 2. Double-entry Ledger & Account updates
    v_pay_acc_id := COALESCE(v.account_id, v.bank_id);
    IF v_pay_acc_id IS NOT NULL THEN
        SELECT * INTO v_cash_acc FROM public.finance_accounts WHERE id = v_pay_acc_id;
    END IF;

    IF v.voucher_type = 'pay' THEN
        -- Category / Expense Ledger: DEBIT (+amount)
        UPDATE public.finance_ledgers
           SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
         WHERE id = v.ledger_id;

        -- Corresponding account if any (e.g. Electricity Expenses Account)
        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
         WHERE ledger_id = v.ledger_id;

        -- Paying Cash/Bank Account: CREDIT (-amount)
        IF v_cash_acc.id IS NOT NULL THEN
            UPDATE public.finance_accounts
               SET current_balance = COALESCE(current_balance, 0) - v.amount, updated_at = now()
             WHERE id = v_cash_acc.id;

            IF v_cash_acc.ledger_id IS NOT NULL THEN
                UPDATE public.finance_ledgers
                   SET current_balance = COALESCE(current_balance, 0) - v.amount, updated_at = now()
                 WHERE id = v_cash_acc.ledger_id;
            END IF;
        END IF;
    ELSE
        -- Received Voucher:
        -- Cash/Bank Account: DEBIT (+amount)
        IF v_cash_acc.id IS NOT NULL THEN
            UPDATE public.finance_accounts
               SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
             WHERE id = v_cash_acc.id;

            IF v_cash_acc.ledger_id IS NOT NULL THEN
                UPDATE public.finance_ledgers
                   SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
                 WHERE id = v_cash_acc.ledger_id;
            END IF;
        END IF;

        -- Category / Income Ledger: CREDIT (+amount)
        UPDATE public.finance_ledgers
           SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
         WHERE id = v.ledger_id;

        UPDATE public.finance_accounts
           SET current_balance = COALESCE(current_balance, 0) + v.amount, updated_at = now()
         WHERE ledger_id = v.ledger_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'voucher_id', v.id, 'status', 'posted', 'double_entry_v2', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
