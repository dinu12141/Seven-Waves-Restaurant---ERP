-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIX: pos_record_shift_payment — Missing Ownership Check
-- ═══════════════════════════════════════════════════════════════════
--
-- VULNERABILITY: The original pos_record_shift_payment() in
-- pos_shift_management.sql (line 256) did NOT verify that the caller
-- owns or is authorised for the shift being modified. Any authenticated
-- user could call this RPC with an arbitrary shift_id, injecting
-- payment records into another cashier's shift and inflating totals.
--
-- FIX: After loading the shift row, check that auth.uid() is either:
--   a) the cashier who opened the shift (cashier_id = auth.uid()), OR
--   b) a user with 'manager' or 'admin' role.
-- If neither condition is met, return an authorisation error before
-- touching any data.
--
-- Apply AFTER pos_shift_management.sql (this replaces the function
-- in-place; no schema changes required).
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.pos_record_shift_payment(UUID, UUID, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.pos_record_shift_payment(
    p_shift_id      UUID,
    p_order_id      UUID,
    p_payment_method TEXT,
    p_amount        NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift  RECORD;
    v_actor  UUID := auth.uid();
BEGIN
    -- 1. Lock and validate shift exists
    SELECT * INTO v_shift
    FROM pos_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found.');
    END IF;

    -- ══════════════════════════════════════════════════════════════
    -- SECURITY: Ownership / authorisation check (NEW — see header)
    -- The cashier who opened the shift may record payments on it.
    -- Managers and admins may record payments on any shift.
    -- Everyone else is denied.
    -- ══════════════════════════════════════════════════════════════
    IF v_shift.cashier_id IS DISTINCT FROM v_actor
       AND NOT public.auth_has_role('manager')
       AND NOT public.auth_has_role('admin') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Unauthorised: you can only record payments on your own shift.'
        );
    END IF;

    -- 2. Validate shift is still open
    IF v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift is not open. Cannot record payment.');
    END IF;

    -- 3. Insert payment record
    INSERT INTO pos_shift_payments (
        shift_id, order_id, branch_id, terminal_id,
        cashier_id, payment_method, amount
    ) VALUES (
        p_shift_id, p_order_id, v_shift.branch_id, v_shift.terminal_id,
        v_shift.cashier_id, p_payment_method, p_amount
    );

    -- 4. Update running totals on the shift
    CASE p_payment_method
        WHEN 'cash' THEN
            UPDATE pos_shifts SET cash_sales_total   = cash_sales_total   + p_amount WHERE id = p_shift_id;
        WHEN 'card' THEN
            UPDATE pos_shifts SET card_sales_total   = card_sales_total   + p_amount WHERE id = p_shift_id;
        WHEN 'qr'   THEN
            UPDATE pos_shifts SET qr_sales_total     = qr_sales_total     + p_amount WHERE id = p_shift_id;
        WHEN 'bank' THEN
            UPDATE pos_shifts SET bank_sales_total   = bank_sales_total   + p_amount WHERE id = p_shift_id;
        WHEN 'credit' THEN
            UPDATE pos_shifts SET credit_sales_total = credit_sales_total + p_amount WHERE id = p_shift_id;
        ELSE
            -- Unknown method: treat as cash
            UPDATE pos_shifts SET cash_sales_total   = cash_sales_total   + p_amount WHERE id = p_shift_id;
    END CASE;

    RETURN jsonb_build_object('success', true, 'payment_method', p_payment_method, 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_record_shift_payment(UUID, UUID, TEXT, NUMERIC) TO authenticated;
