-- ═══════════════════════════════════════════════════════════════════
-- process_refund_rpc.sql
-- Enhances manager_process_refund with:
--   • Finance journal entry reversal (debit Cash/Bank, credit Revenue)
--   • Loyalty coin reversal (best-effort)
-- Apply AFTER erp_payment_management.sql is already in place.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_refund(
    p_order_id      UUID,
    p_refund_amount NUMERIC DEFAULT NULL,
    p_reason        TEXT    DEFAULT 'Customer request',
    p_refund_to     TEXT    DEFAULT 'cash'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id        UUID := auth.uid();
    v_order          RECORD;
    v_actual_refund  NUMERIC(12,2);
    v_new_status     TEXT;
    v_txn_id         UUID;
    v_payment_account TEXT;
    v_rev_account    TEXT;
    v_journal_id     UUID;
    v_existing_journal UUID;
    v_loyalty_id     UUID;
    v_coins_earned   INT := 0;
BEGIN
    -- 1. Authorization: manager or admin only
    IF NOT (is_admin() OR is_manager()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: manager or admin role required');
    END IF;

    -- 2. Load order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Only paid / partially_refunded orders can be refunded
    IF v_order.payment_status NOT IN ('paid', 'partially_refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot refund: order payment_status is ' || COALESCE(v_order.payment_status, 'null')
        );
    END IF;

    -- 4. Determine amount
    v_actual_refund := COALESCE(p_refund_amount, v_order.total_amount - COALESCE(v_order.refund_amount, 0));
    v_actual_refund := ROUND(v_actual_refund, 2);

    IF v_actual_refund <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be greater than zero');
    END IF;

    -- 5. Guard against over-refund
    IF (COALESCE(v_order.refund_amount, 0) + v_actual_refund) > v_order.total_amount + 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund exceeds order total',
            'max_refundable', ROUND(v_order.total_amount - COALESCE(v_order.refund_amount, 0), 2)
        );
    END IF;

    -- 6. New payment status
    v_new_status := CASE
        WHEN (COALESCE(v_order.refund_amount, 0) + v_actual_refund) >= v_order.total_amount - 0.01
        THEN 'refunded'
        ELSE 'partially_refunded'
    END;

    -- 7. Update order
    UPDATE orders
    SET payment_status  = v_new_status,
        refund_amount   = ROUND(COALESCE(refund_amount, 0) + v_actual_refund, 2),
        refund_reason   = p_reason,
        refunded_at     = now(),
        updated_at      = now()
    WHERE id = p_order_id;

    -- 8. Update invoice
    UPDATE invoices
    SET payment_status = v_new_status,
        updated_at     = now()
    WHERE order_id = p_order_id
      AND payment_status <> 'voided';

    -- 9. Record negative payment row
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
        'REFUND: ' || p_reason || ' — via ' || p_refund_to,
        v_user_id,
        v_user_id,
        v_order.branch_id,
        v_order.company_id
    FROM invoices i
    WHERE i.order_id = p_order_id
    LIMIT 1;

    -- 10. Payment transaction audit row
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

    -- 11. Finance journal reversal
    --     Only if a journal entry already exists for this order (from post_accounting_from_order)
    --     Avoid creating a dangling reversal for orders with no prior accounting entry.
    SELECT id INTO v_existing_journal
    FROM journal_entries
    WHERE reference_id = p_order_id
      AND reference_type = 'order'
      AND is_reversed = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_journal IS NOT NULL THEN
        -- Determine accounts (mirror finance_integration.sql logic)
        IF COALESCE(v_order.payment_method, 'cash') IN ('cash', 'cod') THEN
            v_payment_account := '1000';
        ELSE
            v_payment_account := '1010';
        END IF;

        IF v_order.order_type = 'takeaway'  THEN v_rev_account := '4010';
        ELSIF v_order.order_type = 'delivery' THEN v_rev_account := '4020';
        ELSE v_rev_account := '4000';
        END IF;

        INSERT INTO journal_entries (
            company_id, branch_id,
            reference_id, reference_type,
            description, entry_type,
            total_dr, total_cr
        ) VALUES (
            v_order.company_id,
            v_order.branch_id,
            p_order_id,
            'refund',
            'Refund on Order #' || v_order.order_number || ' — ' || p_reason,
            'refund',
            v_actual_refund,
            v_actual_refund
        ) RETURNING id INTO v_journal_id;

        -- Credit Cash/Bank (cash going out)
        INSERT INTO journal_lines (journal_id, account_code, cr_amount, memo)
        VALUES (v_journal_id, v_payment_account, v_actual_refund, 'Cash/bank out for refund');

        -- Debit Revenue (reverse the sale)
        INSERT INTO journal_lines (journal_id, account_code, dr_amount, memo)
        VALUES (v_journal_id, v_rev_account, v_actual_refund, 'Revenue reversed for refund');

        -- Mark original journal as reversed
        UPDATE journal_entries
        SET is_reversed = true, reversal_id = v_journal_id
        WHERE id = v_existing_journal;
    END IF;

    -- 12. Loyalty coin reversal (best-effort; non-fatal if loyalty system not present)
    BEGIN
        -- Find the earn transaction for this order
        SELECT id, COALESCE(coins, 0)
        INTO v_loyalty_id, v_coins_earned
        FROM loyalty_transactions
        WHERE order_id = p_order_id
          AND transaction_type = 'earn'
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_loyalty_id IS NOT NULL AND v_coins_earned > 0 THEN
            -- Deduct coins from loyalty_account balance
            UPDATE loyalty_accounts la
            SET current_coins = GREATEST(0, current_coins - v_coins_earned),
                updated_at    = now()
            FROM orders o
            WHERE o.id = p_order_id
              AND la.customer_id = o.customer_id;

            -- Record a reversal adjustment transaction
            INSERT INTO loyalty_transactions (
                loyalty_account_id, order_id,
                transaction_type, type, coins,
                note
            )
            SELECT
                la.id,
                p_order_id,
                'adjust', 'adjust',
                -v_coins_earned,
                'Coins reversed due to refund: ' || p_reason
            FROM loyalty_accounts la
            JOIN orders o ON o.customer_id = la.customer_id
            WHERE o.id = p_order_id
            LIMIT 1;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Loyalty tables may not be present; non-fatal
        NULL;
    END;

    -- 13. Audit log
    BEGIN
        INSERT INTO audit_logs (
            user_id, action, table_name, record_id,
            new_data, severity
        ) VALUES (
            v_user_id, 'REFUND', 'orders', p_order_id,
            jsonb_build_object(
                'amount', v_actual_refund,
                'reason', p_reason,
                'refund_to', p_refund_to,
                'new_payment_status', v_new_status,
                'transaction_id', v_txn_id
            ),
            'critical'
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object(
        'success',          true,
        'order_id',         p_order_id,
        'refund_amount',    v_actual_refund,
        'payment_status',   v_new_status,
        'transaction_id',   v_txn_id,
        'journal_reversed', v_journal_id IS NOT NULL,
        'total_refunded',   ROUND(COALESCE(v_order.refund_amount, 0) + v_actual_refund, 2)
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[process_refund] Error: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION public.process_refund(UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_refund(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- Add refund columns to orders table if not present
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS refund_amount   NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS refund_reason   TEXT,
    ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ;

-- Add reversal_id to journal_entries if not present
ALTER TABLE public.journal_entries
    ADD COLUMN IF NOT EXISTS reversal_id  UUID REFERENCES journal_entries(id),
    ADD COLUMN IF NOT EXISTS total_dr     NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_cr     NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS entry_type   TEXT;

-- Index for fast refund lookups
CREATE INDEX IF NOT EXISTS idx_orders_refund_status
    ON public.orders(payment_status)
    WHERE payment_status IN ('refunded', 'partially_refunded');

-- Normalize legacy 'SALE' entry_type to 'revenue' for consistent reporting
-- (process_finance_queue legacy path used 'SALE'; primary trigger path uses 'revenue')
UPDATE public.journal_entries
SET entry_type = 'revenue'
WHERE entry_type = 'SALE';
