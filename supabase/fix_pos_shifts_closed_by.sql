-- Add closed_by column if it doesn't exist
ALTER TABLE pos_shifts ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Update the RPC to record the closer
DROP FUNCTION IF EXISTS public.pos_close_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.pos_close_shift(
    p_shift_id UUID,
    p_counted_cash NUMERIC,
    p_counted_card_slips NUMERIC DEFAULT 0,
    p_counted_qr_total NUMERIC DEFAULT 0,
    p_counted_bank_total NUMERIC DEFAULT 0,
    p_closing_note TEXT DEFAULT NULL,
    p_approved_by UUID DEFAULT NULL,
    p_approval_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_expected NUMERIC(12,2);
    v_variance NUMERIC(12,2);
    v_actor UUID := auth.uid();
    v_cash_refunds NUMERIC(12,2) := 0;
BEGIN
    -- 1. Lock and validate shift
    SELECT * INTO v_shift
    FROM pos_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found.');
    END IF;

    IF v_shift.status = 'closed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift is already closed. Cannot close again.');
    END IF;

    -- 2. Verify ownership: cashier can only close own shift, manager/admin can close any
    IF v_shift.cashier_id != v_actor
       AND NOT public.auth_has_role('admin')
       AND NOT public.auth_has_role('manager') THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only close your own shift.');
    END IF;

    -- 3. Audit: shift_close_attempted
    INSERT INTO pos_shift_audit_logs (
        user_id, branch_id, terminal_id, shift_id,
        action, new_value
    ) VALUES (
        v_actor, v_shift.branch_id, v_shift.terminal_id, p_shift_id,
        'shift_close_attempted',
        jsonb_build_object(
            'counted_cash', p_counted_cash,
            'counted_card_slips', p_counted_card_slips,
            'counted_qr_total', p_counted_qr_total,
            'counted_bank_total', p_counted_bank_total
        )
    );

    -- 4. Calculate expected cash
    -- expected_cash = opening_cash_float + cash_sales_total - cash_refunds - cash_drops_total + cash_in_total - cash_out_total
    v_expected := v_shift.opening_cash_float
                + v_shift.cash_sales_total
                - v_cash_refunds
                - v_shift.cash_drops_total
                + v_shift.cash_in_total
                - v_shift.cash_out_total;

    -- 5. Calculate variance
    v_variance := p_counted_cash - v_expected;

    -- 6. If variance exists and no approval provided, reject
    IF v_variance != 0 AND p_approved_by IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Variance detected. Manager approval is required to close this shift.',
            'requires_approval', true,
            'expected_cash', v_expected,
            'counted_cash', p_counted_cash,
            'variance', v_variance
        );
    END IF;

    -- 7. Close the shift
    UPDATE pos_shifts SET
        status = 'closed',
        expected_cash = v_expected,
        counted_cash = p_counted_cash,
        counted_card_slips = p_counted_card_slips,
        counted_qr_total = p_counted_qr_total,
        counted_bank_total = p_counted_bank_total,
        variance = v_variance,
        closing_note = p_closing_note,
        approved_by = p_approved_by,
        approved_at = CASE WHEN p_approved_by IS NOT NULL THEN now() ELSE NULL END,
        approval_note = p_approval_note,
        closed_by = v_actor,
        closed_at = now()
    WHERE id = p_shift_id;

    -- 8. Audit: shift_closed
    INSERT INTO pos_shift_audit_logs (
        user_id, branch_id, terminal_id, shift_id,
        action, old_value, new_value
    ) VALUES (
        v_actor, v_shift.branch_id, v_shift.terminal_id, p_shift_id,
        'shift_closed',
        jsonb_build_object(
            'status', v_shift.status,
            'opening_cash_float', v_shift.opening_cash_float
        ),
        jsonb_build_object(
            'status', 'closed',
            'expected_cash', v_expected,
            'counted_cash', p_counted_cash,
            'variance', v_variance,
            'closed_by', v_actor
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'variance', v_variance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_close_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO authenticated;
