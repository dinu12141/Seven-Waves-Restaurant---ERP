-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 157: VAT Settlement & IRD Tax Remittance Engine
-- Allows recording periodic VAT returns where:
--   1. Output VAT Payable (2006 Liability) is cleared via Debit
--   2. Input VAT - Recoverable (1010 Asset) is offset via Credit
--   3. Net difference is remitted to IRD via Credit to Bank Account (or Dr if refund)
-- Seven Waves Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_fin_settle_vat(
    p_company_id UUID,
    p_branch_id UUID,
    p_period_date DATE,
    p_account_id UUID,          -- Paying bank or cash account
    p_payment_ref TEXT,         -- Cheque No or Transfer Ref
    p_output_vat_clear NUMERIC, -- Output VAT to clear (Dr 2006)
    p_input_vat_offset NUMERIC,  -- Input VAT to offset (Cr 1010)
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user UUID := auth.uid();
    v_out_ledger UUID;
    v_inp_ledger UUID;
    v_bank_acc public.finance_accounts;
    v_net_pay NUMERIC;
    v_desc TEXT;
    v_settle_id UUID := gen_random_uuid();
BEGIN
    IF auth.uid() IS NOT NULL AND NOT (public.is_admin() OR public.is_finance()) THEN
        RAISE EXCEPTION 'Not authorized to record tax settlements.';
    END IF;

    v_net_pay := ROUND(COALESCE(p_output_vat_clear, 0) - COALESCE(p_input_vat_offset, 0), 2);

    -- Resolve ledgers
    v_out_ledger := public.fn_fin_ledger_by_code(p_company_id, '2006', 'Output VAT Payable');
    v_inp_ledger := public.fn_fin_ledger_by_code(p_company_id, '1010', 'Input VAT - Recoverable');

    IF v_out_ledger IS NULL THEN
        RAISE EXCEPTION 'Output VAT ledger (2006) not found.';
    END IF;
    IF v_inp_ledger IS NULL THEN
        RAISE EXCEPTION 'Input VAT ledger (1010) not found.';
    END IF;

    -- Resolve paying/receiving bank account
    SELECT * INTO v_bank_acc FROM public.finance_accounts WHERE id = p_account_id;
    IF v_bank_acc.id IS NULL OR v_bank_acc.ledger_id IS NULL THEN
        RAISE EXCEPTION 'Selected bank/cash account not found or has no linked ledger.';
    END IF;

    v_desc := 'IRD VAT Settlement ' || to_char(COALESCE(p_period_date, CURRENT_DATE), 'YYYY-MM') || 
              CASE WHEN p_payment_ref IS NOT NULL AND p_payment_ref <> '' THEN ' | Ref: ' || p_payment_ref ELSE '' END ||
              CASE WHEN p_notes IS NOT NULL AND p_notes <> '' THEN ' — ' || p_notes ELSE '' END;

    -- 1. Debit Output VAT 2006 (clear liability)
    IF COALESCE(p_output_vat_clear, 0) > 0 THEN
        PERFORM public.fn_fin_post_leg(
            p_company_id, p_branch_id, 'manual_adjustment', v_settle_id, COALESCE(p_period_date, CURRENT_DATE),
            v_out_ledger, NULL, v_desc || ' (Clear Output VAT)', p_output_vat_clear, 0
        );
    END IF;

    -- 2. Credit Input VAT 1010 (offset asset credit)
    IF COALESCE(p_input_vat_offset, 0) > 0 THEN
        PERFORM public.fn_fin_post_leg(
            p_company_id, p_branch_id, 'manual_adjustment', v_settle_id, COALESCE(p_period_date, CURRENT_DATE),
            v_inp_ledger, NULL, v_desc || ' (Offset Input VAT Asset Credit)', 0, p_input_vat_offset
        );
    END IF;

    -- 3. Cash/Bank leg for the net difference
    IF v_net_pay > 0 THEN
        -- Net payment to IRD: Cr Bank
        PERFORM public.fn_fin_post_leg(
            p_company_id, p_branch_id, 'manual_adjustment', v_settle_id, COALESCE(p_period_date, CURRENT_DATE),
            v_bank_acc.ledger_id, v_bank_acc.id, v_desc || ' (Net Remittance to IRD)', 0, v_net_pay
        );
    ELSIF v_net_pay < 0 THEN
        -- Net refund from IRD: Dr Bank
        PERFORM public.fn_fin_post_leg(
            p_company_id, p_branch_id, 'manual_adjustment', v_settle_id, COALESCE(p_period_date, CURRENT_DATE),
            v_bank_acc.ledger_id, v_bank_acc.id, v_desc || ' (Net Refund Claimed)', abs(v_net_pay), 0
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'settlement_id', v_settle_id,
        'output_cleared', p_output_vat_clear,
        'input_offset', p_input_vat_offset,
        'net_paid', v_net_pay
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_fin_settle_vat(UUID, UUID, DATE, UUID, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated;

