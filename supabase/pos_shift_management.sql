-- =====================================================
-- POS SHIFT MANAGEMENT & CASH DRAWER RECONCILIATION
-- (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. pos_shifts — Core shift lifecycle
-- =====================================================

CREATE TABLE IF NOT EXISTS pos_shifts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id         TEXT NOT NULL DEFAULT 'POS-1',
    cashier_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),

    opening_cash_float  NUMERIC(12,2) NOT NULL DEFAULT 0,
    opening_note        TEXT,

    cash_sales_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
    card_sales_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
    qr_sales_total      NUMERIC(12,2) NOT NULL DEFAULT 0,
    bank_sales_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
    credit_sales_total  NUMERIC(12,2) NOT NULL DEFAULT 0,

    refunds_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
    discounts_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
    void_total          NUMERIC(12,2) NOT NULL DEFAULT 0,

    cash_drops_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
    cash_in_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
    cash_out_total      NUMERIC(12,2) NOT NULL DEFAULT 0,

    expected_cash       NUMERIC(12,2),
    counted_cash        NUMERIC(12,2),
    counted_card_slips  NUMERIC(12,2),
    counted_qr_total    NUMERIC(12,2),
    counted_bank_total  NUMERIC(12,2),
    variance            NUMERIC(12,2),
    closing_note        TEXT,

    approved_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    approval_note       TEXT,

    journal_entry_id    UUID REFERENCES journal_entries(id) ON DELETE SET NULL,

    opened_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one open shift per branch + terminal + cashier
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_shifts_active_unique
    ON pos_shifts (branch_id, terminal_id, cashier_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_pos_shifts_branch_status
    ON pos_shifts (branch_id, terminal_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_cashier_status
    ON pos_shifts (cashier_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_opened_at
    ON pos_shifts (opened_at DESC);

CREATE TRIGGER trg_pos_shifts_updated
    BEFORE UPDATE ON pos_shifts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. pos_shift_cash_movements — Cash drops, in, out
-- =====================================================

CREATE TABLE IF NOT EXISTS pos_shift_cash_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id        UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('cash_drop', 'cash_in', 'cash_out')),
    amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    reason          TEXT,
    approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_cash_movements_shift
    ON pos_shift_cash_movements (shift_id);

-- =====================================================
-- 3. pos_shift_payments — Payment tracking per shift
-- =====================================================

CREATE TABLE IF NOT EXISTS pos_shift_payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shift_id        UUID NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
    order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    terminal_id     TEXT NOT NULL,
    cashier_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'qr', 'bank', 'credit')),
    amount          NUMERIC(12,2) NOT NULL,
    payment_time    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_payments_shift
    ON pos_shift_payments (shift_id, payment_method);

CREATE INDEX IF NOT EXISTS idx_shift_payments_order
    ON pos_shift_payments (order_id);

-- =====================================================
-- 4. pos_shift_audit_logs — Shift-specific audit trail
-- =====================================================

CREATE TABLE IF NOT EXISTS pos_shift_audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    terminal_id     TEXT,
    shift_id        UUID REFERENCES pos_shifts(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    device_info     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_audit_logs_shift
    ON pos_shift_audit_logs (shift_id);

CREATE INDEX IF NOT EXISTS idx_shift_audit_logs_action
    ON pos_shift_audit_logs (action, created_at DESC);

-- =====================================================
-- 5. RPC: pos_get_active_shift
-- =====================================================

DROP FUNCTION IF EXISTS public.pos_get_active_shift(UUID, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.pos_get_active_shift(
    p_branch_id UUID,
    p_terminal_id TEXT DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL
)
RETURNS SETOF pos_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
    RETURN QUERY
        SELECT *
        FROM pos_shifts
        WHERE branch_id = p_branch_id
          AND status = 'open'
          AND (p_terminal_id IS NULL OR terminal_id = p_terminal_id)
          AND (p_cashier_id IS NULL OR cashier_id = p_cashier_id)
        ORDER BY opened_at DESC
        LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_get_active_shift(UUID, TEXT, UUID) TO authenticated;

-- =====================================================
-- 6. RPC: pos_open_shift
-- =====================================================

DROP FUNCTION IF EXISTS public.pos_open_shift(UUID, TEXT, UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.pos_open_shift(
    p_branch_id UUID,
    p_terminal_id TEXT,
    p_cashier_id UUID,
    p_opening_cash_float NUMERIC DEFAULT 0,
    p_opening_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing RECORD;
    v_shift RECORD;
BEGIN
    -- 1. Check for existing open shift
    SELECT id INTO v_existing
    FROM pos_shifts
    WHERE branch_id = p_branch_id
      AND terminal_id = p_terminal_id
      AND cashier_id = p_cashier_id
      AND status = 'open'
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'An open shift already exists for this terminal and cashier.',
            'existing_shift_id', v_existing.id
        );
    END IF;

    -- 2. Create the shift
    INSERT INTO pos_shifts (
        branch_id, terminal_id, cashier_id,
        opening_cash_float, opening_note,
        status, opened_at
    ) VALUES (
        p_branch_id, p_terminal_id, p_cashier_id,
        COALESCE(p_opening_cash_float, 0), p_opening_note,
        'open', now()
    )
    RETURNING * INTO v_shift;

    -- 3. Audit log
    INSERT INTO pos_shift_audit_logs (
        user_id, branch_id, terminal_id, shift_id,
        action, new_value
    ) VALUES (
        p_cashier_id, p_branch_id, p_terminal_id, v_shift.id,
        'shift_opened',
        jsonb_build_object(
            'opening_cash_float', p_opening_cash_float,
            'opening_note', p_opening_note,
            'opened_at', v_shift.opened_at
        )
    );

    -- 4. Return success
    RETURN jsonb_build_object(
        'success', true,
        'shift_id', v_shift.id,
        'opened_at', v_shift.opened_at,
        'opening_cash_float', v_shift.opening_cash_float
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_open_shift(UUID, TEXT, UUID, NUMERIC, TEXT) TO authenticated;

-- =====================================================
-- 7. RPC: pos_record_shift_payment
-- =====================================================

DROP FUNCTION IF EXISTS public.pos_record_shift_payment(UUID, UUID, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.pos_record_shift_payment(
    p_shift_id UUID,
    p_order_id UUID,
    p_payment_method TEXT,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_col TEXT;
BEGIN
    -- 1. Lock and validate shift
    SELECT * INTO v_shift
    FROM pos_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found.');
    END IF;

    IF v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift is not open. Cannot record payment.');
    END IF;

    -- 2. Insert payment record
    INSERT INTO pos_shift_payments (
        shift_id, order_id, branch_id, terminal_id,
        cashier_id, payment_method, amount
    ) VALUES (
        p_shift_id, p_order_id, v_shift.branch_id, v_shift.terminal_id,
        v_shift.cashier_id, p_payment_method, p_amount
    );

    -- 3. Update running totals on the shift
    CASE p_payment_method
        WHEN 'cash' THEN
            UPDATE pos_shifts SET cash_sales_total = cash_sales_total + p_amount WHERE id = p_shift_id;
        WHEN 'card' THEN
            UPDATE pos_shifts SET card_sales_total = card_sales_total + p_amount WHERE id = p_shift_id;
        WHEN 'qr' THEN
            UPDATE pos_shifts SET qr_sales_total = qr_sales_total + p_amount WHERE id = p_shift_id;
        WHEN 'bank' THEN
            UPDATE pos_shifts SET bank_sales_total = bank_sales_total + p_amount WHERE id = p_shift_id;
        WHEN 'credit' THEN
            UPDATE pos_shifts SET credit_sales_total = credit_sales_total + p_amount WHERE id = p_shift_id;
        ELSE
            -- Unknown method: treat as cash
            UPDATE pos_shifts SET cash_sales_total = cash_sales_total + p_amount WHERE id = p_shift_id;
    END CASE;

    RETURN jsonb_build_object('success', true, 'payment_method', p_payment_method, 'amount', p_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_record_shift_payment(UUID, UUID, TEXT, NUMERIC) TO authenticated;

-- =====================================================
-- 8. RPC: pos_cash_movement
-- =====================================================

DROP FUNCTION IF EXISTS public.pos_cash_movement(UUID, TEXT, NUMERIC, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.pos_cash_movement(
    p_shift_id UUID,
    p_type TEXT,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT NULL,
    p_approved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shift RECORD;
    v_movement_id UUID;
    v_actor UUID := auth.uid();
BEGIN
    -- 1. Validate type
    IF p_type NOT IN ('cash_drop', 'cash_in', 'cash_out') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid movement type. Must be cash_drop, cash_in, or cash_out.');
    END IF;

    -- 2. Lock and validate shift
    SELECT * INTO v_shift
    FROM pos_shifts
    WHERE id = p_shift_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift not found.');
    END IF;

    IF v_shift.status != 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Shift is not open.');
    END IF;

    -- 3. Insert the movement
    INSERT INTO pos_shift_cash_movements (
        shift_id, type, amount, reason, approved_by, created_by
    ) VALUES (
        p_shift_id, p_type, p_amount, p_reason, p_approved_by, v_actor
    ) RETURNING id INTO v_movement_id;

    -- 4. Update shift totals
    CASE p_type
        WHEN 'cash_drop' THEN
            UPDATE pos_shifts SET cash_drops_total = cash_drops_total + p_amount WHERE id = p_shift_id;
        WHEN 'cash_in' THEN
            UPDATE pos_shifts SET cash_in_total = cash_in_total + p_amount WHERE id = p_shift_id;
        WHEN 'cash_out' THEN
            UPDATE pos_shifts SET cash_out_total = cash_out_total + p_amount WHERE id = p_shift_id;
    END CASE;

    -- 5. Audit log
    INSERT INTO pos_shift_audit_logs (
        user_id, branch_id, terminal_id, shift_id,
        action, new_value
    ) VALUES (
        v_actor, v_shift.branch_id, v_shift.terminal_id, p_shift_id,
        CASE p_type
            WHEN 'cash_drop' THEN 'cash_drop_created'
            ELSE 'cash_in_out_created'
        END,
        jsonb_build_object(
            'movement_id', v_movement_id,
            'type', p_type,
            'amount', p_amount,
            'reason', p_reason,
            'approved_by', p_approved_by
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'movement_id', v_movement_id,
        'type', p_type,
        'amount', p_amount
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_cash_movement(UUID, TEXT, NUMERIC, TEXT, UUID) TO authenticated;

-- =====================================================
-- 9. RPC: pos_close_shift
-- =====================================================

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
            'expected_cash', v_expected,
            'counted_cash', p_counted_cash,
            'variance', v_variance,
            'approved_by', p_approved_by,
            'closed_at', now()
        )
    );

    -- 9. If variance was approved, log that separately
    IF v_variance != 0 AND p_approved_by IS NOT NULL THEN
        INSERT INTO pos_shift_audit_logs (
            user_id, branch_id, terminal_id, shift_id,
            action, new_value
        ) VALUES (
            p_approved_by, v_shift.branch_id, v_shift.terminal_id, p_shift_id,
            'shift_variance_approved',
            jsonb_build_object(
                'variance', v_variance,
                'approval_note', p_approval_note,
                'approved_at', now()
            )
        );
    END IF;

    -- 10. Return full summary
    RETURN jsonb_build_object(
        'success', true,
        'shift_id', p_shift_id,
        'expected_cash', v_expected,
        'counted_cash', p_counted_cash,
        'variance', v_variance,
        'cash_sales_total', v_shift.cash_sales_total,
        'card_sales_total', v_shift.card_sales_total,
        'qr_sales_total', v_shift.qr_sales_total,
        'bank_sales_total', v_shift.bank_sales_total,
        'credit_sales_total', v_shift.credit_sales_total,
        'cash_drops_total', v_shift.cash_drops_total,
        'cash_in_total', v_shift.cash_in_total,
        'cash_out_total', v_shift.cash_out_total,
        'opening_cash_float', v_shift.opening_cash_float,
        'closed_at', now()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_close_shift(UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO authenticated;

-- =====================================================
-- 10. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shift_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shift_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shift_audit_logs ENABLE ROW LEVEL SECURITY;

-- ── pos_shifts ──────────────────────────────────────

DROP POLICY IF EXISTS "pos_shifts_select" ON pos_shifts;
CREATE POLICY "pos_shifts_select"
ON pos_shifts FOR SELECT
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR cashier_id = auth.uid()
);

DROP POLICY IF EXISTS "pos_shifts_insert" ON pos_shifts;
CREATE POLICY "pos_shifts_insert"
ON pos_shifts FOR INSERT
TO authenticated
WITH CHECK (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR public.auth_has_role('cashier')
);

DROP POLICY IF EXISTS "pos_shifts_update" ON pos_shifts;
CREATE POLICY "pos_shifts_update"
ON pos_shifts FOR UPDATE
TO authenticated
USING (
    public.auth_has_role('admin')
    OR (
        (public.auth_has_role('manager') OR public.auth_has_role('cashier'))
        AND status != 'closed'
    )
    OR (
        cashier_id = auth.uid()
        AND status != 'closed'
    )
)
WITH CHECK (
    public.auth_has_role('admin')
    OR (
        (public.auth_has_role('manager') OR public.auth_has_role('cashier'))
        AND status != 'closed'
    )
    OR (
        cashier_id = auth.uid()
    )
);

-- ── pos_shift_cash_movements ────────────────────────

DROP POLICY IF EXISTS "shift_cash_movements_select" ON pos_shift_cash_movements;
CREATE POLICY "shift_cash_movements_select"
ON pos_shift_cash_movements FOR SELECT
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "shift_cash_movements_insert" ON pos_shift_cash_movements;
CREATE POLICY "shift_cash_movements_insert"
ON pos_shift_cash_movements FOR INSERT
TO authenticated
WITH CHECK (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR public.auth_has_role('cashier')
);

-- ── pos_shift_payments ──────────────────────────────

DROP POLICY IF EXISTS "shift_payments_select" ON pos_shift_payments;
CREATE POLICY "shift_payments_select"
ON pos_shift_payments FOR SELECT
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR cashier_id = auth.uid()
);

DROP POLICY IF EXISTS "shift_payments_insert" ON pos_shift_payments;
CREATE POLICY "shift_payments_insert"
ON pos_shift_payments FOR INSERT
TO authenticated
WITH CHECK (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
    OR public.auth_has_role('cashier')
);

-- ── pos_shift_audit_logs ────────────────────────────

DROP POLICY IF EXISTS "shift_audit_select" ON pos_shift_audit_logs;
CREATE POLICY "shift_audit_select"
ON pos_shift_audit_logs FOR SELECT
TO authenticated
USING (
    public.auth_has_role('admin')
    OR public.auth_has_role('manager')
);

DROP POLICY IF EXISTS "shift_audit_insert" ON pos_shift_audit_logs;
CREATE POLICY "shift_audit_insert"
ON pos_shift_audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- =====================================================
-- DONE ✅
-- =====================================================
