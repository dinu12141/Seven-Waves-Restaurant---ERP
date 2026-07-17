-- ==============================================================================
-- Migration: Create Customer Auth RPCs
-- Description: Adds register_customer_profile and get_customer_profile_by_auth
-- ==============================================================================

DROP FUNCTION IF EXISTS public.register_customer_profile(UUID, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.register_customer_profile(
    p_auth_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id UUID;
    v_customer_id UUID;
    v_customer RECORD;
    v_loyalty RECORD;
    v_tier_name TEXT;
    v_is_new BOOLEAN := false;
BEGIN
    -- 1. Get default company
    SELECT id INTO v_company_id FROM companies WHERE is_active = true ORDER BY created_at ASC LIMIT 1;
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active company found.');
    END IF;

    -- 2. Check if customer already exists by auth_user_id
    SELECT * INTO v_customer FROM customers WHERE auth_user_id = p_auth_user_id AND deleted_at IS NULL LIMIT 1;
    
    -- Or by email/phone if they previously ordered but weren't registered online
    IF NOT FOUND THEN
        IF p_email IS NOT NULL AND p_email <> '' THEN
            SELECT * INTO v_customer FROM customers WHERE email = p_email AND company_id = v_company_id AND deleted_at IS NULL LIMIT 1;
        END IF;
    END IF;
    
    IF NOT FOUND THEN
        IF p_phone IS NOT NULL AND p_phone <> '' THEN
            SELECT * INTO v_customer FROM customers WHERE phone = p_phone AND company_id = v_company_id AND deleted_at IS NULL LIMIT 1;
        END IF;
    END IF;

    -- 3. Insert or Update Customer
    IF NOT FOUND THEN
        INSERT INTO customers (company_id, auth_user_id, first_name, last_name, email, phone)
        VALUES (v_company_id, p_auth_user_id, split_part(p_full_name, ' ', 1), substring(p_full_name from position(' ' in p_full_name) + 1), p_email, p_phone)
        RETURNING * INTO v_customer;
        v_is_new := true;
    ELSE
        -- Update auth user if not linked
        IF v_customer.auth_user_id IS NULL THEN
            UPDATE customers 
            SET auth_user_id = p_auth_user_id, 
                first_name = COALESCE(first_name, split_part(p_full_name, ' ', 1)),
                last_name = COALESCE(last_name, substring(p_full_name from position(' ' in p_full_name) + 1)),
                email = COALESCE(email, p_email),
                phone = COALESCE(phone, p_phone),
                updated_at = now()
            WHERE id = v_customer.id
            RETURNING * INTO v_customer;
        END IF;
    END IF;

    -- 4. Get Loyalty Account (it should be auto-created by handle_customer_loyalty_init)
    SELECT * INTO v_loyalty FROM loyalty_accounts WHERE customer_id = v_customer.id;
    
    IF v_loyalty.current_tier_id IS NOT NULL THEN
        SELECT tier_code INTO v_tier_name FROM loyalty_tiers WHERE id = v_loyalty.current_tier_id;
    ELSE
        v_tier_name := COALESCE(v_loyalty.tier, 'bronze');
    END IF;

    -- 5. Return UpsertResult structure
    RETURN jsonb_build_object(
        'success', true,
        'is_new', v_is_new,
        'customer_id', v_customer.id,
        'full_name', trim(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')),
        'phone', v_customer.phone,
        'national_id', NULL,
        'email', v_customer.email,
        'loyalty_id', v_loyalty.id,
        'card_number', v_loyalty.loyalty_card_no,
        'loyalty_card_no', v_loyalty.loyalty_card_no,
        'points_balance', COALESCE(v_loyalty.points_balance, COALESCE(v_loyalty.current_coins, 0)),
        'loyalty_points', COALESCE(v_loyalty.points_balance, COALESCE(v_loyalty.current_coins, 0)),
        'loyalty_tier', COALESCE(v_tier_name, 'bronze'),
        'tier', COALESCE(v_tier_name, 'bronze')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_customer_profile(UUID, TEXT, TEXT, TEXT) TO authenticated, anon;


DROP FUNCTION IF EXISTS public.get_customer_profile_by_auth(UUID);
CREATE OR REPLACE FUNCTION public.get_customer_profile_by_auth(
    p_auth_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_customer RECORD;
    v_loyalty RECORD;
    v_tier_name TEXT;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE auth_user_id = p_auth_user_id AND deleted_at IS NULL LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer profile not found');
    END IF;

    SELECT * INTO v_loyalty FROM loyalty_accounts WHERE customer_id = v_customer.id;
    
    IF v_loyalty.current_tier_id IS NOT NULL THEN
        SELECT tier_code INTO v_tier_name FROM loyalty_tiers WHERE id = v_loyalty.current_tier_id;
    ELSE
        v_tier_name := COALESCE(v_loyalty.tier, 'bronze');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_new', false,
        'customer_id', v_customer.id,
        'full_name', trim(v_customer.first_name || ' ' || COALESCE(v_customer.last_name, '')),
        'phone', v_customer.phone,
        'national_id', NULL,
        'email', v_customer.email,
        'loyalty_id', v_loyalty.id,
        'card_number', v_loyalty.loyalty_card_no,
        'loyalty_card_no', v_loyalty.loyalty_card_no,
        'points_balance', COALESCE(v_loyalty.points_balance, COALESCE(v_loyalty.current_coins, 0)),
        'loyalty_points', COALESCE(v_loyalty.points_balance, COALESCE(v_loyalty.current_coins, 0)),
        'loyalty_tier', COALESCE(v_tier_name, 'bronze'),
        'tier', COALESCE(v_tier_name, 'bronze')
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_profile_by_auth(UUID) TO authenticated, anon;
