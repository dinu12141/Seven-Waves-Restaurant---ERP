-- ═══════════════════════════════════════════════════════════════════
-- POS CUSTOMER LOYALTY — Search & Redemption RPCs
-- Seven Waves Restaurant ERP
-- ═══════════════════════════════════════════════════════════════════

-- ── SCHEMA MODIFICATIONS ──────────────────────────────────────────
-- Ensure customers table has the required columns
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2) DEFAULT 0;

-- Ensure loyalty_accounts table has the coin-based columns if not present
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS current_coins INT DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS total_earned_coins INT DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS total_redeemed_coins INT DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS total_spent NUMERIC(14,2) DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS loyalty_card_no TEXT UNIQUE;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS current_tier_id UUID REFERENCES public.loyalty_tiers(id) ON DELETE SET NULL;

-- Ensure loyalty_transactions table has the required columns
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS coins INT DEFAULT 0;
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS loyalty_account_id UUID REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.loyalty_transactions ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE;

-- Sync columns and auto-populate company_id / balance_after to prevent constraint violations
CREATE OR REPLACE FUNCTION public.sync_loyalty_transaction_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_curr INT := 0;
BEGIN
    -- Sync loyalty_id and loyalty_account_id
    IF NEW.loyalty_account_id IS NOT NULL AND NEW.loyalty_id IS NULL THEN
        NEW.loyalty_id := NEW.loyalty_account_id;
    ELSIF NEW.loyalty_id IS NOT NULL AND NEW.loyalty_account_id IS NULL THEN
        NEW.loyalty_account_id := NEW.loyalty_id;
    END IF;

    -- Sync transaction_type and type
    IF NEW.type IS NOT NULL AND NEW.transaction_type IS NULL THEN
        NEW.transaction_type := NEW.type;
    ELSIF NEW.transaction_type IS NOT NULL AND NEW.type IS NULL THEN
        NEW.type := NEW.transaction_type;
    END IF;

    -- Sync points and coins
    IF NEW.coins IS NOT NULL AND NEW.points IS NULL THEN
        NEW.points := NEW.coins;
    ELSIF NEW.points IS NOT NULL AND NEW.coins IS NULL THEN
        NEW.coins := NEW.points;
    END IF;

    -- Sync description and note
    IF NEW.note IS NOT NULL AND NEW.description IS NULL THEN
        NEW.description := NEW.note;
    ELSIF NEW.description IS NOT NULL AND NEW.note IS NULL THEN
        NEW.note := NEW.description;
    END IF;

    -- Populate company_id if missing
    IF NEW.company_id IS NULL THEN
        SELECT company_id INTO NEW.company_id
        FROM public.loyalty_accounts
        WHERE id = NEW.loyalty_id;
    END IF;

    -- Auto-calculate balance_after if missing
    IF NEW.balance_after IS NULL THEN
        SELECT COALESCE(points_balance, current_coins, 0) INTO v_curr
        FROM public.loyalty_accounts
        WHERE id = NEW.loyalty_id;
        
        IF NEW.transaction_type IN ('redeem', 'expire') THEN
            NEW.balance_after := v_curr - COALESCE(NEW.points, 0);
        ELSE
            NEW.balance_after := v_curr + COALESCE(NEW.points, 0);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_loyalty_transaction_columns ON public.loyalty_transactions;
CREATE TRIGGER trg_sync_loyalty_transaction_columns
    BEFORE INSERT OR UPDATE ON public.loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_loyalty_transaction_columns();

-- ── RLS POLICIES FOR CASHIER ──────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cust_cashier_insert ON public.customers;
CREATE POLICY cust_cashier_insert ON public.customers FOR INSERT
    WITH CHECK (auth_has_role('cashier'));

DROP POLICY IF EXISTS cust_cashier_update ON public.customers;
CREATE POLICY cust_cashier_update ON public.customers FOR UPDATE
    USING (auth_has_role('cashier') AND deleted_at IS NULL)
    WITH CHECK (auth_has_role('cashier'));

DROP POLICY IF EXISTS loy_cashier_insert ON public.loyalty_accounts;
CREATE POLICY loy_cashier_insert ON public.loyalty_accounts FOR INSERT
    WITH CHECK (auth_has_role('cashier'));

DROP POLICY IF EXISTS loy_cashier_update ON public.loyalty_accounts;
CREATE POLICY loy_cashier_update ON public.loyalty_accounts FOR UPDATE
    USING (auth_has_role('cashier') AND deleted_at IS NULL)
    WITH CHECK (auth_has_role('cashier'));

-- ── INITIALIZE LOYALTY ACCOUNT FOR NEW CUSTOMERS ─────────────────
CREATE OR REPLACE FUNCTION public.handle_customer_loyalty_init()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.loyalty_accounts (
        company_id,
        customer_id,
        current_coins,
        points_balance,
        total_earned_coins,
        total_redeemed_coins,
        total_spent,
        tier,
        is_active,
        created_at,
        updated_at
    )
    VALUES (
        NEW.company_id,
        NEW.id,
        0,
        0,
        0,
        0,
        0,
        'bronze',
        true,
        now(),
        now()
    )
    ON CONFLICT (company_id, customer_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_customer_loyalty_init ON public.customers;
CREATE TRIGGER trg_customer_loyalty_init
    AFTER INSERT ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_customer_loyalty_init();

-- ──────────────────────────────────────────────────────────────────

-- ── 1. pos_search_customers ──────────────────────────────────────
-- Unified search by name, phone, or national_id.
-- Returns customer info + loyalty coins/tier inline.
-- Used by POS customer autocomplete dropdown.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_search_customers(
    p_search TEXT,
    p_limit  INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_results JSONB;
    v_search  TEXT;
BEGIN
    -- Sanitize search input
    v_search := TRIM(COALESCE(p_search, ''));
    IF LENGTH(v_search) < 1 THEN
        RETURN jsonb_build_object('success', true, 'data', '[]'::jsonb);
    END IF;

    -- Search customers + join loyalty_accounts for coins/tier
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_results
    FROM (
        SELECT jsonb_build_object(
            'id',            c.id,
            'customer_id',   c.id,
            'full_name',     c.full_name,
            'phone',         c.phone,
            'national_id',   c.national_id,
            'email',         c.email,
            'is_active',     COALESCE(c.is_active, true),
            'loyalty_coins', COALESCE(la.current_coins, 0),
            'points_balance', COALESCE(la.points_balance, COALESCE(la.current_coins, 0)),
            'loyalty_tier',  COALESCE(lt.tier_code, la.tier, 'STANDARD'),
            'tier_name',     COALESCE(lt.tier_name, 'Standard'),
            'tier_color',    COALESCE(lt.badge_color, '#9ca3af'),
            'loyalty_card_no', la.loyalty_card_no,
            'total_spent',   COALESCE(la.total_spent, 0),
            'credit_limit',  COALESCE(c.credit_limit, 0)
        ) AS row_data
        FROM customers c
        LEFT JOIN loyalty_accounts la ON la.customer_id = c.id
        LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
        WHERE (
            c.full_name ILIKE '%' || v_search || '%'
            OR c.phone ILIKE '%' || v_search || '%'
            OR c.national_id ILIKE '%' || v_search || '%'
            OR c.email ILIKE '%' || v_search || '%'
        )
        AND COALESCE(c.is_active, true) = true
        ORDER BY
            -- Exact matches first
            CASE WHEN c.phone = v_search THEN 0
                 WHEN c.national_id = v_search THEN 1
                 WHEN c.full_name ILIKE v_search THEN 2
                 ELSE 3
            END,
            c.full_name ASC
        LIMIT p_limit
    ) sub;

    RETURN jsonb_build_object('success', true, 'data', v_results);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_search_customers(TEXT, INT) TO authenticated;


-- ── 2. pos_redeem_loyalty_coins ──────────────────────────────────
-- Redeems coins from a customer's loyalty account.
-- 1 coin = LKR 500 discount (configurable via loyalty_rules if needed).
-- Creates a 'redeem' transaction and reduces current_coins.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_redeem_loyalty_coins(
    p_customer_id     UUID,
    p_coins_to_redeem INT,
    p_order_id        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account    RECORD;
    v_coin_value NUMERIC := 500; -- 1 coin = LKR 500
    v_discount   NUMERIC;
    v_new_coins  INT;
    v_tier_code  TEXT;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    -- Validate input
    IF p_coins_to_redeem <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Must redeem at least 1 coin.');
    END IF;

    -- Lock loyalty account
    SELECT * INTO v_account
    FROM loyalty_accounts
    WHERE customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No loyalty account found for this customer.');
    END IF;

    -- Check sufficient balance
    IF v_account.current_coins < p_coins_to_redeem THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient coins. Available: ' || v_account.current_coins || ', requested: ' || p_coins_to_redeem
        );
    END IF;

    -- Try to get configurable coin value from loyalty_rules
    BEGIN
        SELECT COALESCE((rule_config->>'coin_value_lkr')::NUMERIC, 500)
        INTO v_coin_value
        FROM loyalty_rules
        WHERE rule_code = 'COIN_REDEMPTION_VALUE' AND is_active = true
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_coin_value := 500; -- fallback
    END;

    -- Calculate discount
    v_discount := p_coins_to_redeem * v_coin_value;
    v_new_coins := v_account.current_coins - p_coins_to_redeem;

    -- Deduct coins
    UPDATE loyalty_accounts
    SET current_coins = v_new_coins,
        total_redeemed_coins = COALESCE(total_redeemed_coins, 0) + p_coins_to_redeem,
        updated_at = now()
    WHERE id = v_account.id;

    -- Record transaction
    INSERT INTO loyalty_transactions (
        company_id, customer_id, loyalty_account_id, order_id,
        transaction_type, type, coins, points,
        amount_reference, note, created_by
    ) VALUES (
        v_account.company_id, p_customer_id, v_account.id, p_order_id,
        'redeem', 'redeem', p_coins_to_redeem, p_coins_to_redeem,
        v_discount, 'POS loyalty redemption: ' || p_coins_to_redeem || ' coins = LKR ' || v_discount,
        auth.uid()
    );

    -- Recalculate tier
    BEGIN
        PERFORM rpc_recalculate_loyalty_tier(v_account.id);
    EXCEPTION WHEN OTHERS THEN
        -- Non-critical: tier update can fail silently
        NULL;
    END;

    -- Get updated tier
    SELECT COALESCE(lt.tier_code, 'STANDARD')
    INTO v_tier_code
    FROM loyalty_accounts la
    LEFT JOIN loyalty_tiers lt ON lt.id = la.current_tier_id
    WHERE la.id = v_account.id;

    RETURN jsonb_build_object(
        'success',          true,
        'coins_redeemed',   p_coins_to_redeem,
        'discount_amount',  v_discount,
        'coin_value_lkr',   v_coin_value,
        'new_coin_balance', v_new_coins,
        'tier',             COALESCE(v_tier_code, 'STANDARD')
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_redeem_loyalty_coins(UUID, INT, UUID) TO authenticated;
