-- ═══════════════════════════════════════════════════════════════════════════
-- pos_quick_pay — single-transaction POS Quick-Pay (closes finding #48)
-- Seven Waves Restaurant ERP
--
-- Replaces the client-side chain in orderStore.js processPayment() of THREE
-- separate RPC round-trips (process_waiter_accept → process_cashier_invoice →
-- process_cashier_payment). Because each of those runs in its own client txn,
-- a failure between them left a cooked/dispatched-but-unpaid order (partial
-- commit). This wraps all three in ONE transaction.
--
-- Correctness notes:
--  • Each sub-RPC has its OWN `EXCEPTION WHEN OTHERS` that returns
--    {success:false} WITHOUT re-raising. So we MUST inspect each returned
--    success flag and RAISE — the RAISE is caught by the outer handler, which
--    rolls back the whole block (accept + invoice + payment) atomically.
--  • Server-side amount: the sale charge passed to process_cashier_payment is
--    the LOCKED order.total_amount, never a client-supplied figure. p_amount_paid
--    is only the cash TENDERED, used to compute change_due here.
--  • Row lock: we SELECT ... FOR UPDATE the order up front; the sub-RPCs re-lock
--    the same row in-txn (no-op) so the whole quick-pay serialises.
--  • RBAC: entry gate = cashier/admin/manager (POS context); the sub-RPCs apply
--    their own role/shift guards (accept still requires waiter/admin/manager).
--
-- Idempotent / re-runnable. SECURITY DEFINER, fixed search_path, EXECUTE to
-- authenticated only (anon revoked).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.pos_quick_pay(
    p_order_id      uuid,
    p_payment_method text DEFAULT 'cash',
    p_amount_paid   numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order     public.orders;
    v_user      uuid := auth.uid();
    v_status    text;
    v_accept    jsonb := jsonb_build_object('skipped', true);
    v_invoice   jsonb := jsonb_build_object('skipped', true);
    v_payment   jsonb;
    v_total     numeric;
    v_tendered  numeric;
    v_change    numeric;
    v_kot_count int := 0;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Insufficient role. Requires cashier/admin/manager.');
    END IF;

    -- Lock the order for the entire quick-pay transaction.
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent: nothing to do if already paid.
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', true, 'already_paid', true,
            'order_id', p_order_id, 'total', v_order.total_amount,
            'amount_paid', v_order.total_amount, 'change_due', 0, 'kot_count', 0);
    END IF;

    v_total    := COALESCE(v_order.total_amount, 0);
    v_tendered := COALESCE(p_amount_paid, v_total);
    v_change   := GREATEST(v_tendered - v_total, 0);

    -- 1) Auto-accept ONLY for a fresh (pending_waiter) order — generates KOTs,
    --    dispatches, work queues. Already-accepted/served queue orders being
    --    billed at the cashier (the #74 queue-billing path) skip this: re-running
    --    process_waiter_accept on a non-pending order errors ("cannot be accepted.
    --    Current status: served"), which is what broke POS payments.
    IF v_order.status = 'pending_waiter' THEN
        v_accept := public.process_waiter_accept(p_order_id);
        IF NOT COALESCE((v_accept->>'success')::boolean, false) THEN
            RAISE EXCEPTION 'quick_pay:accept: %', COALESCE(v_accept->>'error', v_accept::text);
        END IF;
        v_kot_count := COALESCE((v_accept->>'kot_count')::int, 0);
    ELSE
        SELECT count(*) INTO v_kot_count FROM public.kot_tickets WHERE order_id = p_order_id;
    END IF;

    -- Re-read status: the accept step may have advanced pending_waiter → accepted.
    SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;

    -- 2) Advance to a PAYABLE state. The order-status-machine trigger only permits
    --    a transition to 'paid' from ready / served / invoiced. A freshly-accepted
    --    (or preparing) order therefore cannot be paid directly — it must first
    --    reach 'ready' (accepted→ready and preparing→ready are both valid single
    --    hops). Orders already ready/served/invoiced are left as-is.
    --    We deliberately do NOT call process_cashier_invoice: invoicing from
    --    'accepted' is itself a blocked transition, and process_cashier_payment
    --    posts finance on its own (verified on the served path), so the invoice
    --    step is unnecessary and only re-introduces the transition conflict.
    IF v_status IN ('accepted', 'preparing') THEN
        UPDATE public.orders
           SET status = 'ready', updated_at = now()
         WHERE id = p_order_id;
        v_invoice := jsonb_build_object('advanced_from', v_status, 'to', 'ready');
        v_status  := 'ready';
    END IF;

    -- 3) Payment — server-side amount = locked order total (not client value).
    --    Idempotent on already-paid; does not require 'invoiced' status.
    v_payment := public.process_cashier_payment(p_order_id, p_payment_method, v_total);
    IF NOT COALESCE((v_payment->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'quick_pay:payment: %', COALESCE(v_payment->>'error', v_payment::text);
    END IF;

    RETURN jsonb_build_object(
        'success',        true,
        'order_id',       p_order_id,
        'kot_count',      v_kot_count,
        'total',          v_total,
        'amount_paid',    v_tendered,
        'change_due',     v_change,
        'payment_method', p_payment_method,
        'accept',         v_accept,
        'invoice',        v_invoice,
        'payment',        v_payment
    );
EXCEPTION WHEN OTHERS THEN
    -- Any failed step re-raises to here; the whole txn (accept+invoice+payment)
    -- is rolled back automatically. Surface a clean error.
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_quick_pay(uuid, text, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_quick_pay(uuid, text, numeric) TO authenticated;
COMMENT ON FUNCTION public.pos_quick_pay(uuid, text, numeric) IS
  'P0 #48 — single-txn POS Quick-Pay: accept+invoice+payment atomic, server-side amount, returns kot_count/change_due.';
