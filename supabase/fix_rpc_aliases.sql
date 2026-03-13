-- ═══════════════════════════════════════════════════════════════════
-- RPC BACKWARD-COMPAT ALIASES
-- Seven Waves Restaurant ERP
-- Applied: 2026-03-13
--
-- kotDispatchService.js calls legacy RPC names that were renamed in
-- sprint1_kot_orchestration_engine.sql. These thin wrappers ensure the
-- service layer continues to work without a frontend deploy.
--
-- Canonical names (sprint1_kot_orchestration_engine.sql):
--   process_waiter_accept(p_order_id)
--   process_kitchen_start(p_kot_id)
--   process_kitchen_ready(p_kot_id)
--   process_cashier_invoice(p_order_id)
--   process_cashier_payment(p_order_id, p_payment_method, p_amount_paid)
--
-- Legacy names used in kotDispatchService.js:
--   accept_order_as_waiter(p_order_id)
--   kitchen_start_kot(p_kot_id)
--   kitchen_mark_ready(p_kot_id)
--   cashier_invoice_order(p_order_id)
--   cashier_pay_order(p_order_id, p_payment_method, p_amount_paid)
-- ═══════════════════════════════════════════════════════════════════

-- ── accept_order_as_waiter → process_waiter_accept ───────────────
CREATE OR REPLACE FUNCTION public.accept_order_as_waiter(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN process_waiter_accept(p_order_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID) TO authenticated;
COMMENT ON FUNCTION public.accept_order_as_waiter IS
  'Backward-compat alias for process_waiter_accept(). Used by kotDispatchService.js.';

-- ── kitchen_start_kot → process_kitchen_start ────────────────────
CREATE OR REPLACE FUNCTION public.kitchen_start_kot(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN process_kitchen_start(p_kot_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.kitchen_start_kot(UUID) TO authenticated;
COMMENT ON FUNCTION public.kitchen_start_kot IS
  'Backward-compat alias for process_kitchen_start(). Used by kotDispatchService.js.';

-- ── kitchen_mark_ready → process_kitchen_ready ───────────────────
CREATE OR REPLACE FUNCTION public.kitchen_mark_ready(p_kot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN process_kitchen_ready(p_kot_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.kitchen_mark_ready(UUID) TO authenticated;
COMMENT ON FUNCTION public.kitchen_mark_ready IS
  'Backward-compat alias for process_kitchen_ready(). Used by kotDispatchService.js.';

-- ── cashier_invoice_order → process_cashier_invoice ─────────────
CREATE OR REPLACE FUNCTION public.cashier_invoice_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN process_cashier_invoice(p_order_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cashier_invoice_order(UUID) TO authenticated;
COMMENT ON FUNCTION public.cashier_invoice_order IS
  'Backward-compat alias for process_cashier_invoice(). Used by kotDispatchService.js.';

-- ── cashier_pay_order → process_cashier_payment ─────────────────
-- DROP first because PostgreSQL does not allow renaming input parameters
-- via CREATE OR REPLACE (existing function used 'p_method' as parameter name).
DROP FUNCTION IF EXISTS public.cashier_pay_order(UUID, TEXT, NUMERIC);

CREATE FUNCTION public.cashier_pay_order(
    p_order_id       UUID,
    p_payment_method TEXT    DEFAULT 'cash',
    p_amount_paid    NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN process_cashier_payment(p_order_id, p_payment_method, p_amount_paid);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cashier_pay_order(UUID, TEXT, NUMERIC) TO authenticated;
COMMENT ON FUNCTION public.cashier_pay_order IS
  'Backward-compat alias for process_cashier_payment(). Used by kotDispatchService.js.';


-- ── mark_order_served (used by waiterOrderStore.markOrderServed) ─
-- If this doesn't exist yet, create a minimal wrapper.
CREATE OR REPLACE FUNCTION public.mark_order_served(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order   RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent
    IF v_order.status = 'served' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already served.');
    END IF;

    IF v_order.status NOT IN ('ready', 'accepted', 'preparing') THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Order cannot be marked served. Status: ' || v_order.status);
    END IF;

    UPDATE orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;

    -- Event log
    PERFORM log_erp_event(
        'order_served', 'order', p_order_id, v_user_id, 'waiter', v_order.branch_id,
        jsonb_build_object('waiter_id', v_user_id, 'order_number', v_order.order_number)
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'served');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_order_served(UUID) TO authenticated;
COMMENT ON FUNCTION public.mark_order_served IS
  'Marks an order as served by the assigned waiter.';
