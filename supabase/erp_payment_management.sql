-- ═══════════════════════════════════════════════════════════════════
-- ERP PAYMENT MANAGEMENT MODULE
-- Seven Waves Restaurant ERP
-- Created: 2026-03-21
--
-- CONTENTS:
--   STEP 1  — payment_transactions table (online payment tracking)
--   STEP 2  — branch_settings table (payment control configuration)
--   STEP 3  — Extend orders table (payment_method, gateway_ref columns)
--   STEP 4  — Payment control gate (configurable kitchen-hold for unpaid online)
--   STEP 5  — Refund system (manager_process_refund RPC)
--   STEP 6  — Payment callback handler (confirm_online_payment RPC)
--   STEP 7  — Duplicate payment prevention
--   STEP 8  — Payment reporting views
--   STEP 9  — RLS policies for new tables
--   STEP 10 — Realtime publication + indexes
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- STEP 1 — PAYMENT_TRANSACTIONS TABLE
-- ─────────────────────────────────────────────────────────────────
-- Tracks online payment gateway interactions (callbacks, status changes).
-- Each order may have MULTIPLE transaction attempts (retry, failure, success).

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_id          UUID REFERENCES payments(id) ON DELETE SET NULL,

    -- Gateway details
    gateway             TEXT NOT NULL DEFAULT 'cod',
    gateway_txn_id      TEXT,                         -- external transaction ID from gateway
    gateway_order_id    TEXT,                         -- gateway-side order reference
    gateway_status      TEXT,                         -- raw status string from gateway

    -- Transaction info
    txn_type            TEXT NOT NULL DEFAULT 'payment',
    amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency            TEXT NOT NULL DEFAULT 'LKR',
    status              TEXT NOT NULL DEFAULT 'pending',

    -- Metadata
    request_payload     JSONB,                        -- what we sent to gateway
    response_payload    JSONB,                        -- what gateway returned
    error_message       TEXT,
    ip_address          TEXT,

    -- Idempotency
    idempotency_key     TEXT UNIQUE,                  -- prevent duplicate processing

    -- Timestamps
    initiated_at        TIMESTAMPTZ DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    -- Constraints
    CONSTRAINT chk_pt_gateway CHECK (
        gateway IN ('cod', 'stripe', 'payhere', 'koko', 'bank_transfer', 'card_terminal', 'other')
    ),
    CONSTRAINT chk_pt_txn_type CHECK (
        txn_type IN ('payment', 'refund', 'partial_refund', 'void', 'authorization', 'capture')
    ),
    CONSTRAINT chk_pt_status CHECK (
        status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'expired')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pt_order       ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_pt_payment     ON payment_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_pt_gateway_txn ON payment_transactions(gateway_txn_id);
CREATE INDEX IF NOT EXISTS idx_pt_status      ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pt_gateway     ON payment_transactions(gateway, status);
CREATE INDEX IF NOT EXISTS idx_pt_created     ON payment_transactions(created_at DESC);

-- Auto-update timestamp trigger
DROP TRIGGER IF EXISTS trg_pt_updated ON payment_transactions;
CREATE TRIGGER trg_pt_updated
BEFORE UPDATE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────
-- STEP 2 — BRANCH_SETTINGS TABLE (PAYMENT CONTROL CONFIG)
-- ─────────────────────────────────────────────────────────────────
-- One row per branch. Stores configurable business rules.

CREATE TABLE IF NOT EXISTS public.branch_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    -- Payment control
    require_online_payment_before_kitchen   BOOLEAN NOT NULL DEFAULT false,
    -- When TRUE: website orders with payment_method='online' AND payment_status='unpaid'
    -- will be held in 'pending_payment' status until payment confirmed.
    -- When FALSE: all website orders proceed to kitchen immediately (COD behavior).

    default_website_payment_method          TEXT NOT NULL DEFAULT 'cod',
    -- 'cod' = Cash on Delivery (default)
    -- 'online' = Require online prepayment

    auto_accept_paid_website_orders         BOOLEAN NOT NULL DEFAULT true,
    -- When TRUE: website orders that arrive with payment_status='paid' skip manual review.

    -- Future settings
    max_cod_order_amount                    NUMERIC(12,2),  -- cap COD orders above this amount
    enable_partial_payments                 BOOLEAN NOT NULL DEFAULT false,

    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT uq_branch_settings UNIQUE (branch_id),
    CONSTRAINT chk_bs_default_method CHECK (
        default_website_payment_method IN ('cod', 'online', 'both')
    )
);

DROP TRIGGER IF EXISTS trg_bs_updated ON branch_settings;
CREATE TRIGGER trg_bs_updated
BEFORE UPDATE ON branch_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─────────────────────────────────────────────────────────────────
-- STEP 3 — EXTEND ORDERS TABLE
-- ─────────────────────────────────────────────────────────────────
-- Add payment_method and gateway_reference columns.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS payment_method   TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS gateway_ref      TEXT,
    ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refunded_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_amount    NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_reason    TEXT;

-- Update payment_status constraint to add 'pending_payment' and 'partially_refunded'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE orders ADD CONSTRAINT chk_payment_status CHECK (
    payment_status IN ('unpaid', 'pending_payment', 'partial', 'paid', 'refunded', 'partially_refunded')
);

-- Update order status constraint to add 'pending_payment'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;
ALTER TABLE orders ADD CONSTRAINT chk_order_status CHECK (
    status IN (
        'pending',
        'pending_waiter',
        'pending_payment',
        'accepted',
        'preparing',
        'ready',
        'served',
        'invoiced',
        'paid',
        'cancelled'
    )
);

-- Index for payment queries
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);


-- ─────────────────────────────────────────────────────────────────
-- STEP 4 — PAYMENT CONTROL GATE
-- ─────────────────────────────────────────────────────────────────
-- Modifies accept_website_order to respect branch payment settings.
-- If branch requires online payment AND order is unpaid → hold order.

CREATE OR REPLACE FUNCTION public.check_payment_gate(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order     RECORD;
    v_settings  RECORD;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Order not found');
    END IF;

    -- Only gate website orders
    IF v_order.order_source != 'website' THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'Non-website order');
    END IF;

    -- Load branch settings
    SELECT * INTO v_settings FROM branch_settings WHERE branch_id = v_order.branch_id;

    -- If no settings row or require_online_payment is FALSE → proceed normally
    IF NOT FOUND OR NOT v_settings.require_online_payment_before_kitchen THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'Payment gate disabled for branch');
    END IF;

    -- If payment method is COD → always allow through to kitchen
    IF COALESCE(v_order.payment_method, 'cod') = 'cod' THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'COD order');
    END IF;

    -- If already paid → allow
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('allowed', true, 'reason', 'Already paid');
    END IF;

    -- GATE: online order that requires payment but is unpaid → hold
    -- Update order to pending_payment status
    UPDATE orders
    SET status = 'pending_payment',
        payment_status = 'pending_payment',
        updated_at = now()
    WHERE id = p_order_id
      AND status IN ('pending', 'pending_waiter');

    RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'Awaiting online payment',
        'order_id', p_order_id,
        'payment_status', 'pending_payment'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_payment_gate(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_payment_gate(UUID) TO service_role;


-- ─────────────────────────────────────────────────────────────────
-- STEP 5 — REFUND SYSTEM
-- ─────────────────────────────────────────────────────────────────
-- Manager-initiated refund RPC with full audit trail.

CREATE OR REPLACE FUNCTION public.manager_process_refund(
    p_order_id      UUID,
    p_refund_amount NUMERIC DEFAULT NULL,   -- NULL = full refund
    p_reason        TEXT   DEFAULT 'Customer request',
    p_refund_to     TEXT   DEFAULT 'original_method'  -- 'original_method', 'cash', 'store_credit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id       UUID := auth.uid();
    v_order         RECORD;
    v_payment       RECORD;
    v_actual_refund NUMERIC(12,2);
    v_new_status    TEXT;
    v_txn_id        UUID;
BEGIN
    -- 1. Verify caller is admin or manager
    IF NOT (is_admin() OR is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: manager or admin role required');
    END IF;

    -- 2. Load order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Only paid/partially_refunded orders can be refunded
    IF v_order.payment_status NOT IN ('paid', 'partially_refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot refund: order payment status is ' || v_order.payment_status
        );
    END IF;

    -- 4. Calculate refund amount
    v_actual_refund := COALESCE(p_refund_amount, v_order.total_amount - COALESCE(v_order.refund_amount, 0));
    IF v_actual_refund <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount');
    END IF;

    -- 5. Check refund doesn't exceed paid amount
    IF (COALESCE(v_order.refund_amount, 0) + v_actual_refund) > v_order.total_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount exceeds order total',
            'max_refundable', v_order.total_amount - COALESCE(v_order.refund_amount, 0)
        );
    END IF;

    -- 6. Determine new payment status
    IF (COALESCE(v_order.refund_amount, 0) + v_actual_refund) >= v_order.total_amount THEN
        v_new_status := 'refunded';       -- full refund
    ELSE
        v_new_status := 'partially_refunded';  -- partial refund
    END IF;

    -- 7. Update order
    UPDATE orders
    SET payment_status = v_new_status,
        refund_amount  = COALESCE(refund_amount, 0) + v_actual_refund,
        refund_reason  = p_reason,
        refunded_at    = now(),
        updated_at     = now()
    WHERE id = p_order_id;

    -- 8. Update invoice payment_status
    UPDATE invoices
    SET payment_status = v_new_status, updated_at = now()
    WHERE order_id = p_order_id AND payment_status != 'voided';

    -- 9. Insert refund payment record (negative)
    INSERT INTO payments (
        order_id, invoice_id, amount, payment_method,
        status, notes, received_by, cashier_id,
        branch_id, company_id
    )
    SELECT
        p_order_id,
        i.id,
        -v_actual_refund,
        COALESCE(v_order.payment_method, 'cash'),
        'refunded',
        'REFUND: ' || p_reason || ' (via ' || p_refund_to || ')',
        v_user_id,
        v_user_id,
        v_order.branch_id,
        v_order.company_id
    FROM invoices i
    WHERE i.order_id = p_order_id
    LIMIT 1;

    -- 10. Create payment_transaction record for audit
    INSERT INTO payment_transactions (
        order_id, gateway, txn_type, amount, status,
        response_payload, completed_at
    ) VALUES (
        p_order_id,
        COALESCE(v_order.payment_method, 'cod'),
        CASE WHEN v_new_status = 'refunded' THEN 'refund' ELSE 'partial_refund' END,
        v_actual_refund,
        'completed',
        jsonb_build_object(
            'refund_reason', p_reason,
            'refund_to', p_refund_to,
            'refunded_by', v_user_id,
            'new_status', v_new_status
        ),
        now()
    ) RETURNING id INTO v_txn_id;

    -- 11. Insert void_transaction record
    INSERT INTO void_transactions (
        entity_type, entity_id, reason, voided_by, manager_approval_by
    ) VALUES (
        'payment', p_order_id, p_reason, v_user_id, v_user_id
    );

    -- 12. Audit event
    BEGIN
        INSERT INTO order_status_events (order_id, event_code, actor_user_id, payload)
        VALUES (
            p_order_id, 'order.refunded', v_user_id,
            jsonb_build_object(
                'refund_amount', v_actual_refund,
                'refund_reason', p_reason,
                'refund_to', p_refund_to,
                'new_payment_status', v_new_status,
                'transaction_id', v_txn_id
            )
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 13. Log to audit_logs
    INSERT INTO audit_logs (
        user_id, action, table_name, record_id,
        new_data, severity
    ) VALUES (
        v_user_id, 'REFUND', 'orders', p_order_id,
        jsonb_build_object(
            'amount', v_actual_refund,
            'reason', p_reason,
            'new_status', v_new_status,
            'order_number', v_order.order_number
        ),
        'critical'
    );

    RETURN jsonb_build_object(
        'success',          true,
        'order_id',         p_order_id,
        'refund_amount',    v_actual_refund,
        'payment_status',   v_new_status,
        'transaction_id',   v_txn_id,
        'total_refunded',   COALESCE(v_order.refund_amount, 0) + v_actual_refund
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Payment function error: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.manager_process_refund(UUID, NUMERIC, TEXT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- STEP 6 — ONLINE PAYMENT CALLBACK HANDLER
-- ─────────────────────────────────────────────────────────────────
-- Future-ready: processes payment gateway callbacks.
-- Uses idempotency_key to prevent duplicate processing.

CREATE OR REPLACE FUNCTION public.confirm_online_payment(
    p_order_id          UUID,
    p_gateway           TEXT DEFAULT 'payhere',
    p_gateway_txn_id    TEXT DEFAULT NULL,
    p_amount            NUMERIC DEFAULT NULL,
    p_gateway_status    TEXT DEFAULT 'success',
    p_idempotency_key   TEXT DEFAULT NULL,
    p_response_payload  JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order         RECORD;
    v_txn_id        UUID;
    v_existing_txn  UUID;
BEGIN
    -- 0. Payment authority gate. This RPC marks orders as PAID, so it must only
    --    ever run from the payment-handler Edge Function (service_role), which
    --    has already verified the gateway HMAC signature. A direct call from an
    --    anon/authenticated client cannot be trusted — p_gateway_status is
    --    attacker-controlled and would let anyone forge a paid order.
    IF current_setting('request.jwt.claims', true) IS NOT NULL
       AND COALESCE(
             (current_setting('request.jwt.claims', true)::jsonb ->> 'role'),
             ''
           ) <> 'service_role'
    THEN
        RAISE WARNING 'confirm_online_payment blocked non-service_role caller (role=%)',
            (current_setting('request.jwt.claims', true)::jsonb ->> 'role');
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment confirmation is not permitted from this context.'
        );
    END IF;

    -- 1. Idempotency check — if we already processed this callback, return success
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing_txn
        FROM payment_transactions
        WHERE idempotency_key = p_idempotency_key AND status = 'completed';

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'transaction_id', v_existing_txn
            );
        END IF;
    END IF;

    -- 2. Load order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Prevent double payment
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_paid', true,
            'order_id', p_order_id
        );
    END IF;

    -- 4. Handle payment result
    IF p_gateway_status IN ('success', 'completed', '2') THEN
        -- SUCCESS: mark order as paid at the payment level
        -- (billing still happens via cashier workflow)

        -- Create transaction record
        INSERT INTO payment_transactions (
            order_id, gateway, gateway_txn_id,
            txn_type, amount, status,
            gateway_status, response_payload,
            idempotency_key, completed_at
        ) VALUES (
            p_order_id, p_gateway, p_gateway_txn_id,
            'payment', COALESCE(p_amount, v_order.total_amount), 'completed',
            p_gateway_status, p_response_payload,
            p_idempotency_key, now()
        ) RETURNING id INTO v_txn_id;

        -- Update order payment status
        UPDATE orders
        SET payment_status = 'paid',
            payment_method = p_gateway,
            gateway_ref    = p_gateway_txn_id,
            paid_at        = now(),
            updated_at     = now()
        WHERE id = p_order_id;

        -- If order was held at pending_payment, release it to kitchen
        IF v_order.status = 'pending_payment' THEN
            UPDATE orders SET status = 'pending_waiter', updated_at = now()
            WHERE id = p_order_id;

            -- Trigger the auto-accept flow
            PERFORM accept_website_order(p_order_id);
        END IF;

        -- Audit
        BEGIN
            INSERT INTO order_status_events (order_id, event_code, actor_user_id, payload)
            VALUES (
                p_order_id, 'payment.confirmed', NULL,
                jsonb_build_object(
                    'gateway', p_gateway,
                    'gateway_txn_id', p_gateway_txn_id,
                    'amount', COALESCE(p_amount, v_order.total_amount),
                    'transaction_id', v_txn_id
                )
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'transaction_id', v_txn_id,
            'payment_status', 'paid',
            'released_to_kitchen', (v_order.status = 'pending_payment')
        );

    ELSE
        -- FAILURE: record the failed attempt
        INSERT INTO payment_transactions (
            order_id, gateway, gateway_txn_id,
            txn_type, amount, status,
            gateway_status, response_payload,
            error_message, idempotency_key,
            completed_at
        ) VALUES (
            p_order_id, p_gateway, p_gateway_txn_id,
            'payment', COALESCE(p_amount, v_order.total_amount), 'failed',
            p_gateway_status, p_response_payload,
            'Payment failed with status: ' || p_gateway_status,
            p_idempotency_key, now()
        ) RETURNING id INTO v_txn_id;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment failed',
            'gateway_status', p_gateway_status,
            'transaction_id', v_txn_id
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Payment function error: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- This RPC marks orders as PAID and must NEVER be callable by a client.
-- The only legitimate caller is the payment-handler Edge Function, which runs
-- as service_role AFTER verifying the gateway webhook HMAC signature. Any anon
-- or authenticated grant here is a payment-forgery vector (a client could send
-- p_gateway_status='success' and mark its own order paid without paying).
REVOKE EXECUTE ON FUNCTION public.confirm_online_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_online_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_online_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_online_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, JSONB) TO service_role;


-- ─────────────────────────────────────────────────────────────────
-- STEP 7 — DUPLICATE PAYMENT PREVENTION TRIGGER
-- ─────────────────────────────────────────────────────────────────
-- Prevents double-marking an order as paid via direct UPDATE.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only trigger on payment_status changing TO 'paid'
    IF NEW.payment_status = 'paid'
       AND OLD.payment_status = 'paid'
       AND TG_OP = 'UPDATE'
    THEN
        -- Already paid — silently ignore the update to prevent errors
        NEW.payment_status := OLD.payment_status;
        NEW.paid_at := OLD.paid_at;
    END IF;

    -- Populate paid_at timestamp on first transition to paid
    IF NEW.payment_status = 'paid'
       AND OLD.payment_status IS DISTINCT FROM 'paid'
       AND NEW.paid_at IS NULL
    THEN
        NEW.paid_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_dup_payment ON orders;
CREATE TRIGGER trg_prevent_dup_payment
BEFORE UPDATE OF payment_status ON orders
FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_payment();


-- ─────────────────────────────────────────────────────────────────
-- STEP 8 — PAYMENT REPORTING VIEWS
-- ─────────────────────────────────────────────────────────────────

-- 8a. Daily payment summary view per branch
CREATE OR REPLACE VIEW public.v_daily_payment_summary AS
SELECT
    o.branch_id,
    DATE(o.created_at AT TIME ZONE 'Asia/Colombo') AS order_date,
    COUNT(*)                                       AS total_orders,
    COUNT(*) FILTER (WHERE o.payment_status = 'paid')       AS paid_orders,
    COUNT(*) FILTER (WHERE o.payment_status = 'unpaid')     AS unpaid_orders,
    COUNT(*) FILTER (WHERE o.payment_status = 'refunded')   AS refunded_orders,
    COUNT(*) FILTER (WHERE o.payment_status = 'partially_refunded') AS partial_refund_orders,
    COALESCE(SUM(o.total_amount), 0)                        AS total_revenue,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0) AS paid_revenue,
    COALESCE(SUM(o.refund_amount), 0)                       AS total_refunds,
    -- By payment method
    COUNT(*) FILTER (WHERE COALESCE(o.payment_method, 'cash') = 'cash')     AS cash_orders,
    COUNT(*) FILTER (WHERE o.payment_method = 'cod')                        AS cod_orders,
    COUNT(*) FILTER (WHERE o.payment_method IN ('payhere', 'stripe', 'online')) AS online_orders,
    COALESCE(SUM(o.total_amount) FILTER (WHERE COALESCE(o.payment_method, 'cash') = 'cash'), 0) AS cash_total,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method = 'cod'), 0)  AS cod_total,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_method IN ('payhere', 'stripe', 'online')), 0) AS online_total,
    -- By source
    COUNT(*) FILTER (WHERE o.order_source = 'website')  AS website_orders,
    COUNT(*) FILTER (WHERE o.order_source = 'pos')      AS pos_orders,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_source = 'website'), 0) AS website_revenue,
    COALESCE(SUM(o.total_amount) FILTER (WHERE o.order_source = 'pos'), 0)     AS pos_revenue
FROM orders o
WHERE o.status != 'cancelled'
GROUP BY o.branch_id, DATE(o.created_at AT TIME ZONE 'Asia/Colombo');

-- 8b. Payment transactions log view (for admin/finance)
CREATE OR REPLACE VIEW public.v_payment_transactions_log AS
SELECT
    pt.id AS transaction_id,
    pt.order_id,
    o.order_number,
    o.customer_name,
    pt.gateway,
    pt.gateway_txn_id,
    pt.txn_type,
    pt.amount,
    pt.currency,
    pt.status AS txn_status,
    pt.error_message,
    pt.created_at,
    pt.completed_at,
    o.branch_id,
    o.order_source,
    o.payment_status AS order_payment_status
FROM payment_transactions pt
JOIN orders o ON o.id = pt.order_id
ORDER BY pt.created_at DESC;

-- 8c. Unpaid website orders (for manager dashboard)
CREATE OR REPLACE VIEW public.v_unpaid_website_orders AS
SELECT
    o.id,
    o.order_number,
    o.customer_name,
    o.customer_phone,
    o.total_amount,
    o.payment_status,
    o.payment_method,
    o.status AS order_status,
    o.branch_id,
    o.created_at,
    da.status AS delivery_status,
    da.rider_id
FROM orders o
LEFT JOIN delivery_assignments da ON da.order_id = o.id
WHERE o.order_source = 'website'
  AND o.payment_status IN ('unpaid', 'pending_payment')
  AND o.status NOT IN ('cancelled', 'paid')
ORDER BY o.created_at DESC;

-- 8d. RPC: get payment summary for a branch/date range
CREATE OR REPLACE FUNCTION public.get_payment_summary(
    p_branch_id     UUID,
    p_start_date    DATE DEFAULT CURRENT_DATE,
    p_end_date      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verify caller has access to branch
    IF NOT (is_admin() OR is_manager() OR is_finance() OR auth_has_role('cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT jsonb_build_object(
        'success', true,
        'branch_id', p_branch_id,
        'date_range', jsonb_build_object('start', p_start_date, 'end', p_end_date),
        'totals', jsonb_build_object(
            'total_orders',      COUNT(*),
            'paid_orders',       COUNT(*) FILTER (WHERE payment_status = 'paid'),
            'unpaid_orders',     COUNT(*) FILTER (WHERE payment_status IN ('unpaid', 'pending_payment')),
            'refunded_orders',   COUNT(*) FILTER (WHERE payment_status IN ('refunded', 'partially_refunded')),
            'total_revenue',     COALESCE(SUM(total_amount), 0),
            'paid_revenue',      COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0),
            'unpaid_revenue',    COALESCE(SUM(total_amount) FILTER (WHERE payment_status IN ('unpaid', 'pending_payment')), 0),
            'total_refunds',     COALESCE(SUM(refund_amount), 0)
        ),
        'by_method', jsonb_build_object(
            'cash',    COALESCE(SUM(total_amount) FILTER (WHERE COALESCE(payment_method, 'cash') = 'cash'), 0),
            'cod',     COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'cod'), 0),
            'online',  COALESCE(SUM(total_amount) FILTER (WHERE payment_method IN ('payhere', 'stripe', 'online')), 0),
            'card',    COALESCE(SUM(total_amount) FILTER (WHERE payment_method IN ('card', 'card_terminal')), 0)
        ),
        'by_source', jsonb_build_object(
            'website',    COALESCE(SUM(total_amount) FILTER (WHERE order_source = 'website'), 0),
            'pos',        COALESCE(SUM(total_amount) FILTER (WHERE order_source = 'pos'), 0),
            'qr',         COALESCE(SUM(total_amount) FILTER (WHERE order_source = 'qr'), 0)
        )
    ) INTO v_result
    FROM orders
    WHERE branch_id = p_branch_id
      AND status != 'cancelled'
      AND created_at::DATE BETWEEN p_start_date AND p_end_date;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_summary(UUID, DATE, DATE) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- STEP 9 — RLS POLICIES
-- ─────────────────────────────────────────────────────────────────

-- ── payment_transactions ──────────────────────────────────────
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pt_admin ON payment_transactions;
CREATE POLICY pt_admin ON payment_transactions FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS pt_manager ON payment_transactions;
CREATE POLICY pt_manager ON payment_transactions FOR SELECT
    USING (
        is_manager()
        AND EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = payment_transactions.order_id
              AND o.branch_id = ANY(auth_branch_ids())
        )
    );

DROP POLICY IF EXISTS pt_finance ON payment_transactions;
CREATE POLICY pt_finance ON payment_transactions FOR SELECT
    USING (
        is_finance()
        AND EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = payment_transactions.order_id
              AND o.branch_id = ANY(auth_branch_ids())
        )
    );

DROP POLICY IF EXISTS pt_cashier ON payment_transactions;
CREATE POLICY pt_cashier ON payment_transactions FOR SELECT
    USING (
        auth_has_role('cashier')
        AND EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = payment_transactions.order_id
              AND o.branch_id = ANY(auth_branch_ids())
        )
    );

-- Service role for gateway callbacks
DROP POLICY IF EXISTS pt_service ON payment_transactions;
CREATE POLICY pt_service ON payment_transactions FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- ── branch_settings ───────────────────────────────────────────
ALTER TABLE branch_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bs_admin ON branch_settings;
CREATE POLICY bs_admin ON branch_settings FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS bs_manager ON branch_settings;
CREATE POLICY bs_manager ON branch_settings FOR ALL
    USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
    WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));

DROP POLICY IF EXISTS bs_read ON branch_settings;
CREATE POLICY bs_read ON branch_settings FOR SELECT
    USING (branch_id = ANY(auth_branch_ids()));


-- ─────────────────────────────────────────────────────────────────
-- STEP 10 — REALTIME + INDEXES
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE payment_transactions REPLICA IDENTITY FULL;

-- Safely add to publication
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY['payment_transactions', 'branch_settings'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
           AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename=t)
        THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;

-- Audit trigger on payment_transactions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_record') THEN
        DROP TRIGGER IF EXISTS audit_payment_transactions ON payment_transactions;
        CREATE TRIGGER audit_payment_transactions
        AFTER INSERT OR UPDATE OR DELETE ON payment_transactions
        FOR EACH ROW EXECUTE FUNCTION public.audit_record();
    END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- DONE ✅
-- ═══════════════════════════════════════════════════════════════════
