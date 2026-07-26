-- ═══════════════════════════════════════════════════════════════════════════
-- P1 #96 — FOC (Free-of-Charge) server-side authorization + atomicity
-- Seven Waves Restaurant ERP  |  closes Security finding #76 (HIGH)
--
-- BEFORE: src/pages/POSPage.vue processFOCOrder ran, from the CLIENT:
--   • queue path : process_waiter_accept → process_cashier_invoice → then TWO
--     raw client UPDATEs (orders: total_amount=0/payment_method='foc'/
--     foc_authorized_by=<client UUID>; invoices: total=0). Non-atomic partial
--     commit + client-trusted authorizer + client-set price.
--   • new  path : pos_create_order_with_items(payload w/ client foc_authorized_by
--     & total_amount=0) → client invoice insert.
-- The authorization was 100% client-trusted: `foc_authorized_by` was a
-- client-supplied UUID (forgeable audit trail) and the cashier's own
-- ord_cashier_update RLS let ANY cashier raw-UPDATE a live bill to
-- total_amount=0 / payment_status='paid' / payment_method='foc' with NO real
-- manager approval → revenue fraud + non-repudiation loss.
--
-- AFTER (agreed contract, Security-approved 2026-07-25 — tasks #96 DBA / #97 Backend):
--   • The client calls these RPCs UNDER the live manager session (inside
--     ManagerAuthDialog, after the manager role check, before restoring the
--     cashier session) so auth.uid() == the verified manager. No forgeable UUID,
--     no replayable token.
--   • SECURITY DEFINER, gate auth_has_role('manager'|'admin'), p_reason required.
--   • SERVER sets foc_authorized_by = auth.uid(), total_amount = 0,
--     payment_method = 'foc', payment_status = 'paid', status = 'paid'.
--   • Atomic accept + invoice + FOC in ONE transaction.
--   • Audit BOTH: auth.uid() = authoritative approver; p_cashier_id stored as
--     claimed_initiator (client-supplied, informational only).
--   • RLS: tighten ord_cashier_update so a cashier can NO LONGER raw-UPDATE an
--     order into a paid / FOC / authorized end-state — all pay/void/FOC go
--     through SECURITY DEFINER RPCs (also hardens #38). SECURITY DEFINER RPCs
--     are owned by postgres and bypass RLS, so the legit payment path is
--     unaffected by this tightening.
--
-- Idempotent / re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- §1  process_foc_order — mark an EXISTING (queue) order Free-of-Charge
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_foc_order(
    p_order_id   uuid,
    p_reason     text,
    p_cashier_id uuid DEFAULT NULL   -- claimed initiator (informational only)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order   public.orders;
    v_user    uuid := auth.uid();     -- authoritative approver (the manager)
    v_accept  jsonb;
    v_invoice jsonb;
    v_now     timestamptz := now();
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    -- FOC is a MANAGER/ADMIN action. A cashier session cannot self-authorize.
    IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'FOC requires manager or admin authorization.');
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'FOC reason is required.');
    END IF;

    -- Lock the order for the whole FOC transaction.
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Already FOC/paid → idempotent success.
    IF v_order.status = 'paid' AND v_order.payment_method = 'foc' THEN
        RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
            'message', 'Already FOC.');
    END IF;

    -- 1) Accept if still awaiting the waiter (generates KOTs / dispatches).
    IF v_order.status = 'pending_waiter' THEN
        v_accept := public.process_waiter_accept(p_order_id);
        IF NOT COALESCE((v_accept->>'success')::boolean, false) THEN
            RAISE EXCEPTION 'foc:accept: %', COALESCE(v_accept->>'error', v_accept::text);
        END IF;
    END IF;

    -- 2) Invoice if not already invoiced/paid.
    IF v_order.status IN ('accepted', 'preparing', 'ready') THEN
        v_invoice := public.process_cashier_invoice(p_order_id);
        IF NOT COALESCE((v_invoice->>'success')::boolean, false) THEN
            RAISE EXCEPTION 'foc:invoice: %', COALESCE(v_invoice->>'error', v_invoice::text);
        END IF;
    END IF;

    -- 3) Mark FOC — every sensitive value is set SERVER-SIDE.
    UPDATE public.orders
       SET status            = 'paid',
           payment_status    = 'paid',
           payment_method    = 'foc',
           total_amount      = 0,
           foc_reason        = btrim(p_reason),
           foc_authorized_by = v_user,           -- verified manager, NOT client input
           paid_at           = v_now,
           updated_at        = v_now
     WHERE id = p_order_id;

    -- 4) Zero any invoice attached to the order.
    UPDATE public.invoices
       SET total          = 0,
           payment_status = 'paid'
     WHERE order_id = p_order_id;

    -- 5) Audit — approver = auth.uid(); claimed_initiator = client-supplied cashier.
    PERFORM public.log_erp_event(
        'order_foc', 'order', p_order_id, v_user, 'manager', v_order.branch_id,
        jsonb_build_object(
            'reason',            btrim(p_reason),
            'authorized_by',     v_user,
            'claimed_initiator', p_cashier_id,
            'original_total',    v_order.total_amount
        )
    );

    RETURN jsonb_build_object(
        'success',           true,
        'order_id',          p_order_id,
        'authorized_by',     v_user,
        'claimed_initiator', p_cashier_id,
        'total_amount',      0
    );
EXCEPTION WHEN OTHERS THEN
    -- Any failed step re-raises here; the whole txn is rolled back atomically.
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.process_foc_order(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_foc_order(uuid, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.process_foc_order(uuid, text, uuid) IS
  'P1 #96 (#76) — atomic FOC on an existing order. Manager/admin only; server sets '
  'foc_authorized_by=auth.uid(), total_amount=0, payment_method=foc, status=paid. '
  'p_cashier_id is claimed_initiator (informational).';

-- ───────────────────────────────────────────────────────────────────────────
-- §2  process_foc_order_new — create a NEW (manual POS) order as Free-of-Charge
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_foc_order_new(
    p_order      jsonb,
    p_items      jsonb,
    p_reason     text,
    p_cashier_id uuid DEFAULT NULL   -- claimed initiator (informational only)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user      uuid := auth.uid();  -- authoritative approver (the manager)
    v_now       timestamptz := now();
    v_create    jsonb;
    v_order_id  uuid;
    v_branch_id uuid;
    v_subtotal  numeric;
    v_order     jsonb;
BEGIN
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('manager') OR auth_has_role('admin')) THEN
        RETURN jsonb_build_object('success', false, 'error',
            'FOC requires manager or admin authorization.');
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'FOC reason is required.');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot create an order with no items.');
    END IF;

    -- Force every FOC/financial field SERVER-SIDE. Merging the server object LAST
    -- means any client-supplied status/total/authorizer is overridden — the
    -- client can never set the price or the approver.
    v_order := COALESCE(p_order, '{}'::jsonb) || jsonb_build_object(
        'status',            'paid',
        'payment_status',    'paid',
        'payment_method',    'foc',
        'total_amount',      0,
        'tax_amount',        0,
        'service_charge',    0,
        'discount_amount',   0,
        'foc_reason',        btrim(p_reason),
        'foc_authorized_by', v_user,
        'paid_at',           v_now
    );

    -- Atomic order + items insert (reuses the audited P0 #48/#49 creator).
    v_create := public.pos_create_order_with_items(v_order, p_items);
    IF NOT COALESCE((v_create->>'success')::boolean, false) THEN
        RAISE EXCEPTION 'foc_new:create: %', COALESCE(v_create->>'error', v_create::text);
    END IF;
    v_order_id := (v_create->'order'->>'id')::uuid;

    SELECT branch_id, COALESCE(subtotal, 0)
      INTO v_branch_id, v_subtotal
      FROM public.orders WHERE id = v_order_id;

    -- FOC invoice (total 0) in the same transaction.
    INSERT INTO public.invoices (order_id, branch_id, cashier_id, total, subtotal, payment_status)
    VALUES (v_order_id, v_branch_id, p_cashier_id, 0, v_subtotal, 'paid');

    PERFORM public.log_erp_event(
        'order_foc', 'order', v_order_id, v_user, 'manager', v_branch_id,
        jsonb_build_object(
            'reason',            btrim(p_reason),
            'authorized_by',     v_user,
            'claimed_initiator', p_cashier_id,
            'created_foc',       true
        )
    );

    RETURN jsonb_build_object(
        'success',           true,
        'order',             v_create->'order',
        'order_id',          v_order_id,
        'authorized_by',     v_user,
        'claimed_initiator', p_cashier_id,
        'total_amount',      0
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.process_foc_order_new(jsonb, jsonb, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.process_foc_order_new(jsonb, jsonb, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.process_foc_order_new(jsonb, jsonb, text, uuid) IS
  'P1 #96 (#76) — atomic create-new FOC order. Manager/admin only; server forces '
  'foc_authorized_by=auth.uid()/total=0/foc + creates zero invoice. '
  'p_cashier_id is claimed_initiator (informational).';

-- ───────────────────────────────────────────────────────────────────────────
-- §3  Tighten ord_cashier_update — no raw cashier path to a paid / FOC bill
--
-- A cashier keeps the ability to progress order STATUS (accepted → preparing →
-- ready → served → invoiced) for their branch, but the WITH CHECK now forbids a
-- raw UPDATE from landing the order in a completed-payment / FOC / authorized
-- end-state. Marking paid, applying FOC, and voiding must go through the
-- SECURITY DEFINER money RPCs (pos_quick_pay / process_cashier_payment /
-- process_foc_order[_new]) which are owned by postgres and bypass RLS — so this
-- change does NOT affect the legitimate payment path. Closes #76; hardens #38.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ord_cashier_update ON public.orders;
CREATE POLICY ord_cashier_update ON public.orders
    FOR UPDATE
    TO public
    USING (
        auth_has_role('cashier'::text)
        AND branch_id = ANY (auth_branch_ids())
        AND status = ANY (ARRAY['accepted','preparing','ready','served','invoiced']::text[])
    )
    WITH CHECK (
        auth_has_role('cashier'::text)
        AND branch_id = ANY (auth_branch_ids())
        -- Cashier raw-UPDATE may NOT complete payment / apply FOC / forge an
        -- authorizer. These transitions are RPC-only.
        AND status NOT IN ('paid')
        AND payment_status NOT IN ('paid', 'refunded', 'partially_refunded')
        AND payment_method IS DISTINCT FROM 'foc'
        AND foc_authorized_by IS NULL
        AND foc_reason IS NULL
    );

COMMENT ON POLICY ord_cashier_update ON public.orders IS
  'P1 #96 (#76/#38) — cashiers may progress order status but CANNOT raw-UPDATE an '
  'order into paid/refunded/FOC or set foc_authorized_by. Payment/FOC/void via '
  'SECURITY DEFINER RPCs only (which bypass RLS as postgres owner).';
