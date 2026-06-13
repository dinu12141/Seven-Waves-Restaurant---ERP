-- ═══════════════════════════════════════════════════════════════════
-- CRITICAL FIX #05: PROCUREMENT APPROVAL HARDENING
-- CRITICAL FIX #06: CRM LOYALTY LEDGER SAFETY
-- Seven Waves Restaurant ERP — Step 02 Hardening
-- Applied: 2026-05-15
-- ═══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════
-- FIX #05: PROCUREMENT MULTI-LEVEL APPROVAL
-- ══════════════════════════════════════════════════

-- 1. APPROVAL THRESHOLDS TABLE
CREATE TABLE IF NOT EXISTS public.procurement_approval_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    doc_type TEXT NOT NULL,
    min_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    max_amount NUMERIC(14,2),
    required_role TEXT NOT NULL,
    approval_level INT NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_pat_doctype CHECK (doc_type IN ('PO', 'GRN', 'AP_INVOICE', 'PAYMENT')),
    CONSTRAINT chk_pat_role CHECK (required_role IN ('manager', 'finance', 'admin', 'branch_manager'))
);

ALTER TABLE procurement_approval_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pat_admin ON procurement_approval_thresholds;
CREATE POLICY pat_admin ON procurement_approval_thresholds FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2. CRYPTOGRAPHIC APPROVAL LOG
CREATE TABLE IF NOT EXISTS public.procurement_approval_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type TEXT NOT NULL,
    doc_id UUID NOT NULL,
    doc_number TEXT,
    approval_level INT NOT NULL DEFAULT 1,
    action TEXT NOT NULL,
    approved_by UUID NOT NULL REFERENCES auth.users(id),
    approver_role TEXT NOT NULL,
    amount NUMERIC(14,2),
    doc_hash TEXT NOT NULL,  -- SHA256 of doc state at approval time
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_pal_action CHECK (action IN ('approved', 'rejected', 'escalated'))
);

CREATE INDEX IF NOT EXISTS idx_pal_doc ON procurement_approval_log(doc_type, doc_id);
CREATE INDEX IF NOT EXISTS idx_pal_approver ON procurement_approval_log(approved_by);

ALTER TABLE procurement_approval_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pal_admin ON procurement_approval_log;
CREATE POLICY pal_admin ON procurement_approval_log FOR ALL USING (is_admin() OR is_manager());
DROP POLICY IF EXISTS pal_finance ON procurement_approval_log;
CREATE POLICY pal_finance ON procurement_approval_log FOR SELECT USING (is_finance());

-- 3. APPROVE PO WITH MULTI-LEVEL CHECK
CREATE OR REPLACE FUNCTION approve_po_with_threshold(
    p_po_id UUID,
    p_comments TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_po RECORD;
    v_user_id UUID := auth.uid();
    v_threshold RECORD;
    v_current_level INT;
    v_max_level INT;
    v_doc_hash TEXT;
    v_user_role TEXT;
BEGIN
    IF NOT (is_admin() OR is_manager() OR is_finance()) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO not found');
    END IF;

    IF v_po.status NOT IN ('draft', 'pending_approval') THEN
        RETURN jsonb_build_object('success', false, 'error', 'PO is already ' || v_po.status);
    END IF;

    -- Determine user's highest role
    v_user_role := CASE
        WHEN is_admin() THEN 'admin'
        WHEN is_finance() THEN 'finance'
        WHEN is_manager() THEN 'manager'
        ELSE 'staff'
    END;

    -- Get current approval level
    SELECT COALESCE(MAX(approval_level), 0) INTO v_current_level
    FROM procurement_approval_log
    WHERE doc_type = 'PO' AND doc_id = p_po_id AND action = 'approved';

    -- Get max required level for this PO amount
    SELECT COALESCE(MAX(approval_level), 1) INTO v_max_level
    FROM procurement_approval_thresholds
    WHERE company_id = v_po.company_id AND doc_type = 'PO' AND is_active = true
      AND v_po.total_amount >= min_amount
      AND (max_amount IS NULL OR v_po.total_amount <= max_amount);

    -- Check if user's role satisfies the next level
    SELECT * INTO v_threshold
    FROM procurement_approval_thresholds
    WHERE company_id = v_po.company_id AND doc_type = 'PO' AND is_active = true
      AND approval_level = v_current_level + 1
      AND required_role = v_user_role
      AND v_po.total_amount >= min_amount
      AND (max_amount IS NULL OR v_po.total_amount <= max_amount);

    -- Admin can always approve
    IF v_user_role != 'admin' AND NOT FOUND AND v_max_level > 1 THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Your role (' || v_user_role || ') cannot approve at level ' || (v_current_level + 1));
    END IF;

    -- Generate cryptographic hash of PO state
    v_doc_hash := encode(digest(
        v_po.id::TEXT || v_po.total_amount::TEXT || v_po.doc_number || now()::TEXT,
        'sha256'
    ), 'hex');

    -- Log approval
    INSERT INTO procurement_approval_log (
        doc_type, doc_id, doc_number, approval_level, action,
        approved_by, approver_role, amount, doc_hash, comments
    ) VALUES (
        'PO', p_po_id, v_po.doc_number, v_current_level + 1, 'approved',
        v_user_id, v_user_role, v_po.total_amount, v_doc_hash, p_comments
    );

    -- Check if all levels satisfied
    IF v_current_level + 1 >= v_max_level OR v_user_role = 'admin' THEN
        -- Fully approved — use existing approve_po
        BEGIN
            PERFORM approve_po(p_po_id);
        EXCEPTION WHEN OTHERS THEN
            UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
        END;

        RETURN jsonb_build_object('success', true, 'status', 'approved',
            'level', v_current_level + 1, 'hash', v_doc_hash);
    ELSE
        -- Needs higher-level approval
        UPDATE purchase_orders SET status = 'pending_approval' WHERE id = p_po_id;

        RETURN jsonb_build_object('success', true, 'status', 'pending_approval',
            'current_level', v_current_level + 1, 'required_level', v_max_level);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_po_with_threshold(UUID, TEXT) TO authenticated;

-- 4. SEED DEFAULT THRESHOLDS
DO $$
DECLARE v_company_id UUID;
BEGIN
    FOR v_company_id IN SELECT id FROM companies LOOP
        INSERT INTO procurement_approval_thresholds (company_id, doc_type, min_amount, max_amount, required_role, approval_level)
        VALUES
            (v_company_id, 'PO', 0, 50000, 'manager', 1),
            (v_company_id, 'PO', 50000, 200000, 'finance', 2),
            (v_company_id, 'PO', 200000, NULL, 'admin', 3)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;


-- ══════════════════════════════════════════════════
-- FIX #06: CRM LOYALTY LEDGER-BASED SAFETY
-- ══════════════════════════════════════════════════

-- 1. ADD LOCKING TO rpc_apply_loyalty_reward
-- The existing function uses current_coins (mutable balance).
-- We add FOR UPDATE locking to prevent double-spend.

CREATE OR REPLACE FUNCTION rpc_redeem_loyalty_coins(
    p_customer_id UUID,
    p_coins_to_redeem INT,
    p_order_id UUID DEFAULT NULL,
    p_note TEXT DEFAULT 'Redemption'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_account RECORD;
    v_available INT;
BEGIN
    IF NOT (is_admin() OR is_manager() OR auth_has_role('cashier')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_coins_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coins must be positive');
    END IF;

    -- CRITICAL: Lock the loyalty account row to prevent concurrent redemption
    SELECT * INTO v_account
    FROM loyalty_accounts
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No loyalty account found');
    END IF;

    -- Calculate available coins from LEDGER (not mutable balance)
    SELECT COALESCE(SUM(
        CASE WHEN transaction_type = 'earn' THEN coins
             WHEN transaction_type = 'adjust' THEN coins
             WHEN transaction_type = 'redeem' THEN -coins
             WHEN transaction_type = 'expire' THEN -coins
             ELSE 0 END
    ), 0) INTO v_available
    FROM loyalty_transactions
    WHERE loyalty_account_id = v_account.id;

    -- Anti-double-spend: verify against BOTH ledger and balance
    IF v_available < p_coins_to_redeem OR v_account.current_coins < p_coins_to_redeem THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Insufficient coins. Available: ' || LEAST(v_available, v_account.current_coins));
    END IF;

    -- Idempotency: check for duplicate redemption on same order
    IF p_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM loyalty_transactions
        WHERE loyalty_account_id = v_account.id
          AND order_id = p_order_id
          AND transaction_type = 'redeem'
    ) THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already redeemed for this order');
    END IF;

    -- Create redemption transaction (append-only ledger entry)
    INSERT INTO loyalty_transactions (
        loyalty_account_id, customer_id, order_id,
        transaction_type, coins, note, created_by
    ) VALUES (
        v_account.id, p_customer_id, p_order_id,
        'redeem', p_coins_to_redeem, p_note, auth.uid()
    );

    -- Update mutable balance (kept in sync with ledger)
    UPDATE loyalty_accounts
    SET current_coins = current_coins - p_coins_to_redeem,
        total_redeemed_coins = total_redeemed_coins + p_coins_to_redeem,
        updated_at = now()
    WHERE id = v_account.id;

    -- Recalculate tier
    BEGIN
        PERFORM rpc_recalculate_loyalty_tier(v_account.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Audit
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_data, severity)
    VALUES (auth.uid(), 'LOYALTY_REDEEM', 'loyalty_accounts', v_account.id,
        jsonb_build_object('coins', p_coins_to_redeem, 'order_id', p_order_id,
            'remaining', v_account.current_coins - p_coins_to_redeem), 'info');

    RETURN jsonb_build_object(
        'success', true,
        'redeemed', p_coins_to_redeem,
        'remaining', v_account.current_coins - p_coins_to_redeem
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_redeem_loyalty_coins(UUID, INT, UUID, TEXT) TO authenticated;

-- 2. LOYALTY LEDGER RECONCILIATION
CREATE OR REPLACE FUNCTION reconcile_loyalty_balances(p_fix BOOLEAN DEFAULT false)
RETURNS TABLE (
    account_id UUID, customer_name TEXT,
    stored_balance INT, ledger_balance INT, drift INT, fixed BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT
        la.id AS account_id,
        COALESCE(p.full_name, c.name, 'Unknown') AS customer_name,
        la.current_coins AS stored_balance,
        COALESCE(SUM(
            CASE WHEN lt.transaction_type IN ('earn', 'adjust') THEN lt.coins
                 WHEN lt.transaction_type IN ('redeem', 'expire') THEN -lt.coins
                 ELSE 0 END
        ), 0)::INT AS ledger_balance,
        (la.current_coins - COALESCE(SUM(
            CASE WHEN lt.transaction_type IN ('earn', 'adjust') THEN lt.coins
                 WHEN lt.transaction_type IN ('redeem', 'expire') THEN -lt.coins
                 ELSE 0 END
        ), 0))::INT AS drift,
        CASE WHEN p_fix THEN true ELSE false END AS fixed
    FROM loyalty_accounts la
    LEFT JOIN loyalty_transactions lt ON lt.loyalty_account_id = la.id
    LEFT JOIN profiles p ON p.id = la.customer_id
    LEFT JOIN customers c ON c.id = la.customer_id
    GROUP BY la.id, p.full_name, c.name
    HAVING ABS(la.current_coins - COALESCE(SUM(
        CASE WHEN lt.transaction_type IN ('earn', 'adjust') THEN lt.coins
             WHEN lt.transaction_type IN ('redeem', 'expire') THEN -lt.coins
             ELSE 0 END
    ), 0)) > 0;

    IF p_fix THEN
        UPDATE loyalty_accounts la
        SET current_coins = sub.calc_balance, updated_at = now()
        FROM (
            SELECT lt2.loyalty_account_id,
                   SUM(CASE WHEN lt2.transaction_type IN ('earn','adjust') THEN lt2.coins
                            WHEN lt2.transaction_type IN ('redeem','expire') THEN -lt2.coins
                            ELSE 0 END)::INT AS calc_balance
            FROM loyalty_transactions lt2 GROUP BY lt2.loyalty_account_id
        ) sub
        WHERE la.id = sub.loyalty_account_id
          AND la.current_coins != sub.calc_balance;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_loyalty_balances(BOOLEAN) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- END OF CRITICAL FIXES #05 & #06
-- ═══════════════════════════════════════════════════════════════════
