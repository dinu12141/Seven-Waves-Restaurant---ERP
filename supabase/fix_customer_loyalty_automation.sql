-- =================================================================================
-- Customer Loyalty and Metrics Automation
-- 1. Updates customers table (total_spent, total_orders) upon payment.
-- 2. Calculates and awards loyalty points based on base_rate rules.
-- =================================================================================

-- Ensure required columns exist on loyalty_accounts just in case
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS current_coins INT DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS total_earned_coins INT DEFAULT 0;
ALTER TABLE public.loyalty_accounts ADD COLUMN IF NOT EXISTS total_spent NUMERIC(14,2) DEFAULT 0;

-- rpc_recalculate_loyalty_tier already exists, so we don't need to stub it.

-- CREATE THE APPLY FUNCTION
DROP FUNCTION IF EXISTS public.rpc_apply_loyalty_reward(UUID);
CREATE OR REPLACE FUNCTION public.rpc_apply_loyalty_reward(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_coins_per_lkr NUMERIC;
    v_coins_earned INT := 0;
    v_loyalty_account_id UUID;
    v_already_awarded BOOLEAN;
BEGIN
    -- 1. Get the order details
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    
    IF v_order.id IS NULL OR v_order.customer_id IS NULL THEN
        RETURN; -- No customer attached, or order not found
    END IF;

    -- 2. Update customer aggregate metrics (Orders and Spent)
    UPDATE public.customers
    SET total_orders = COALESCE(total_orders, 0) + 1,
        total_spent = COALESCE(total_spent, 0) + COALESCE(v_order.total_amount, 0),
        last_order_at = NOW(),
        updated_at = NOW()
    WHERE id = v_order.customer_id;

    -- 3. Check if loyalty points already awarded for this order
    SELECT EXISTS (
        SELECT 1 FROM public.loyalty_transactions 
        WHERE order_id = p_order_id AND (type = 'earned' OR type = 'earn' OR transaction_type = 'earn')
    ) INTO v_already_awarded;

    IF v_already_awarded THEN
        RETURN;
    END IF;

    -- 4. Calculate Points using loyalty_rules
    SELECT coins_per_lkr INTO v_coins_per_lkr 
    FROM public.loyalty_rules 
    WHERE company_id = v_order.company_id AND rule_type = 'base_rate' AND is_active = true
    LIMIT 1;

    -- If no active rule, do not award points
    IF v_coins_per_lkr IS NULL OR v_coins_per_lkr <= 0 THEN
        RETURN;
    END IF;

    v_coins_earned := FLOOR(COALESCE(v_order.total_amount, 0) * v_coins_per_lkr);

    IF v_coins_earned <= 0 THEN
        RETURN;
    END IF;

    -- 5. Ensure Loyalty Account Exists
    SELECT id INTO v_loyalty_account_id 
    FROM public.loyalty_accounts 
    WHERE customer_id = v_order.customer_id
    LIMIT 1;

    IF v_loyalty_account_id IS NULL THEN
        -- Call the initializer if it doesn't exist
        INSERT INTO public.loyalty_accounts (company_id, customer_id, current_coins, total_earned_coins, total_spent)
        VALUES (v_order.company_id, v_order.customer_id, 0, 0, 0)
        RETURNING id INTO v_loyalty_account_id;
    END IF;

    -- 6. Insert Loyalty Transaction
    INSERT INTO public.loyalty_transactions (
        company_id,
        loyalty_account_id,
        customer_id,
        order_id,
        type,
        transaction_type,
        coins,
        points,
        note
    ) VALUES (
        v_order.company_id,
        v_loyalty_account_id,
        v_order.customer_id,
        p_order_id,
        'earn',
        'earn',
        v_coins_earned,
        v_coins_earned,
        'Earned from order #' || COALESCE(v_order.order_number::text, 'Unknown')
    );

    -- 7. Update Loyalty Account Balances
    UPDATE public.loyalty_accounts
    SET current_coins = COALESCE(current_coins, 0) + v_coins_earned,
        total_earned_coins = COALESCE(total_earned_coins, 0) + v_coins_earned,
        total_spent = COALESCE(total_spent, 0) + COALESCE(v_order.total_amount, 0),
        updated_at = NOW()
    WHERE id = v_loyalty_account_id;

    -- 8. Try to recalculate tier
    BEGIN
        PERFORM public.rpc_recalculate_loyalty_tier(v_loyalty_account_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

END;
$$;

-- CREATE THE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.fn_trg_order_loyalty_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only run when status changes to 'paid'
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS DISTINCT FROM 'paid') THEN
        IF NEW.customer_id IS NOT NULL THEN
            PERFORM public.rpc_apply_loyalty_reward(NEW.id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ATTACH TRIGGER TO ORDERS TABLE
DROP TRIGGER IF EXISTS trg_order_loyalty_reward_exec ON public.orders;
CREATE TRIGGER trg_order_loyalty_reward_exec
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_order_loyalty_reward();

-- Insert a default base rule for all companies if they don't have one
INSERT INTO public.loyalty_rules (company_id, rule_type, rule_code, coins_per_lkr, min_spend)
SELECT id, 'base_rate', 'DEFAULT_BASE', 0.01, 0 FROM public.companies
WHERE NOT EXISTS (
    SELECT 1 FROM public.loyalty_rules lr WHERE lr.company_id = public.companies.id AND lr.rule_type = 'base_rate'
);

-- ==============================================================================
-- FIX: admin_get_customer_detail failing for customers with no loyalty account
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_customer_detail(
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer RECORD;
    v_loyalty RECORD;
    v_tier_name TEXT := 'bronze';
    v_orders JSONB;
    v_loyalty_id UUID := NULL;
    v_loyalty_card_no TEXT := NULL;
    v_loyalty_points INT := 0;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id AND deleted_at IS NULL LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
    END IF;

    SELECT * INTO v_loyalty FROM loyalty_accounts WHERE customer_id = v_customer.id LIMIT 1;
    IF FOUND THEN
        v_loyalty_id := v_loyalty.id;
        v_loyalty_card_no := COALESCE(v_loyalty.card_number, v_loyalty.loyalty_card_no);
        v_loyalty_points := COALESCE(v_loyalty.points_balance, COALESCE(v_loyalty.current_coins, 0));
        IF v_loyalty.current_tier_id IS NOT NULL THEN
            SELECT tier_code INTO v_tier_name FROM loyalty_tiers WHERE id = v_loyalty.current_tier_id;
        ELSE
            v_tier_name := COALESCE(v_loyalty.tier, 'bronze');
        END IF;
    END IF;

    -- Get recent orders
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'total_amount', o.total_amount,
            'status', o.status,
            'created_at', o.created_at,
            'order_type', o.order_type
        )
    ), '[]'::jsonb) INTO v_orders
    FROM (
        SELECT * FROM orders
        WHERE customer_id = p_customer_id
        ORDER BY created_at DESC
        LIMIT 10
    ) o;

    RETURN jsonb_build_object(
        'success', true,
        'customer', jsonb_build_object(
            'customer_id', v_customer.id,
            'full_name', trim(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')),
            'email', v_customer.email,
            'phone', v_customer.phone,
            'national_id', v_customer.national_id,
            'is_active', COALESCE(v_customer.is_active, true),
            'total_orders', COALESCE(v_customer.total_orders, 0),
            'total_spent', COALESCE(v_customer.total_spent, 0),
            'created_at', v_customer.created_at,
            'loyalty_id', v_loyalty_id,
            'loyalty_card_no', v_loyalty_card_no,
            'loyalty_points', v_loyalty_points,
            'loyalty_tier', COALESCE(v_tier_name, 'bronze')
        ),
        'orders', v_orders,
        'sessions', '[]'::jsonb,
        'activity', '[]'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_customer_detail(UUID) TO authenticated;

