-- fix_missing_loyalty_rpcs.sql

DROP FUNCTION IF EXISTS public.get_loyalty_customer_list(TEXT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.get_loyalty_customer_list(TEXT, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.get_loyalty_customer_list;
DROP FUNCTION IF EXISTS public.get_loyalty_customer_detail(UUID);
DROP FUNCTION IF EXISTS public.get_loyalty_customer_detail;

-- 1. get_loyalty_customer_list
CREATE OR REPLACE FUNCTION public.get_loyalty_customer_list(
  p_search TEXT DEFAULT NULL,
  p_tier_code TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_total INTEGER;
BEGIN
  -- Get total count
  SELECT count(*) INTO v_total
  FROM public.customers c
  JOIN public.loyalty_accounts la ON la.customer_id = c.id
  LEFT JOIN public.loyalty_tiers lt ON lt.id = la.current_tier_id
  WHERE (p_search IS NULL OR p_search = '' OR c.first_name ILIKE '%' || p_search || '%' OR c.last_name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
    AND (p_tier_code IS NULL OR p_tier_code = '' OR COALESCE(lt.tier_code, la.tier) = p_tier_code);

  -- Get paginated data
  SELECT jsonb_build_object(
    'success', true,
    'total', v_total,
    'data', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sub.id,
            'full_name', sub.full_name,
            'email', sub.email,
            'phone', sub.phone,
            'is_active', sub.is_active,
            'registered_at', sub.registered_at,
            'loyalty_id', sub.loyalty_id,
            'card_number', sub.card_number,
            'current_coins', sub.current_coins,
            'total_earned_coins', sub.total_earned_coins,
            'total_redeemed_coins', sub.total_redeemed_coins,
            'total_spent', sub.total_spent,
            'last_rewarded_at', sub.last_rewarded_at,
            'tier', sub.tier,
            'tier_code', sub.tier_code,
            'tier_name', sub.tier_name
          )
        )
        FROM (
          SELECT 
            c.id, 
            TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) AS full_name,
            c.email, 
            c.phone, 
            COALESCE(c.is_active, true) AS is_active,
            c.created_at AS registered_at,
            la.id AS loyalty_id,
            la.loyalty_card_no AS card_number,
            COALESCE(la.current_coins, la.points_balance, 0) AS current_coins,
            COALESCE(la.total_earned_coins, la.lifetime_points, 0) AS total_earned_coins,
            COALESCE(la.total_redeemed_coins, 0) AS total_redeemed_coins,
            COALESCE(c.total_spent, 0) AS total_spent,
            la.last_activity AS last_rewarded_at,
            COALESCE(lt.tier_code, la.tier, 'bronze') AS tier,
            COALESCE(lt.tier_code, la.tier, 'bronze') AS tier_code,
            COALESCE(lt.name, la.tier, 'Bronze') AS tier_name
          FROM public.customers c
          JOIN public.loyalty_accounts la ON la.customer_id = c.id
          LEFT JOIN public.loyalty_tiers lt ON lt.id = la.current_tier_id
          WHERE (p_search IS NULL OR p_search = '' OR c.first_name ILIKE '%' || p_search || '%' OR c.last_name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
            AND (p_tier_code IS NULL OR p_tier_code = '' OR COALESCE(lt.tier_code, la.tier) = p_tier_code)
          ORDER BY COALESCE(la.total_earned_coins, la.lifetime_points, 0) DESC
          LIMIT p_limit
          OFFSET p_offset
        ) sub
      ),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_customer_list(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- 2. get_loyalty_customer_detail
CREATE OR REPLACE FUNCTION public.get_loyalty_customer_detail(
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
    v_tier RECORD;
    v_transactions JSONB;
    v_order_count INT;
BEGIN
    SELECT * INTO v_customer FROM customers WHERE id = p_customer_id LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Customer not found');
    END IF;

    SELECT * INTO v_loyalty FROM loyalty_accounts WHERE customer_id = p_customer_id LIMIT 1;
    IF FOUND THEN
        IF v_loyalty.current_tier_id IS NOT NULL THEN
            SELECT * INTO v_tier FROM loyalty_tiers WHERE id = v_loyalty.current_tier_id LIMIT 1;
        END IF;
        
        SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY created_at DESC), '[]'::jsonb) 
        INTO v_transactions
        FROM loyalty_transactions t
        WHERE loyalty_account_id = v_loyalty.id OR customer_id = p_customer_id;
    ELSE
        v_transactions := '[]'::jsonb;
    END IF;

    SELECT COUNT(*) INTO v_order_count FROM orders WHERE customer_id = p_customer_id;

    RETURN jsonb_build_object(
        'success', true,
        'customer', row_to_json(v_customer),
        'loyalty', row_to_json(v_loyalty),
        'tier', row_to_json(v_tier),
        'transactions', v_transactions,
        'order_count', v_order_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_loyalty_customer_detail(UUID) TO authenticated;

-- Force PostgREST to reload schema and recognize new function signatures
NOTIFY pgrst, reload_schema;
