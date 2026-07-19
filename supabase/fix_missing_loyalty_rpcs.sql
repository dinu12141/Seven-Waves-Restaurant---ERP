DROP FUNCTION IF EXISTS public.get_loyalty_customer_list;
DROP FUNCTION IF EXISTS public.get_loyalty_customer_detail;

CREATE OR REPLACE FUNCTION public.get_loyalty_customer_list(
  p_search TEXT DEFAULT NULL,
  p_tier_code TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_total INTEGER;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.customers c
  JOIN public.loyalty_accounts la ON la.customer_id = c.id
  WHERE (p_search IS NULL OR c.first_name ILIKE '%' || p_search || '%' OR c.last_name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
    AND (p_tier_code IS NULL OR la.current_tier = p_tier_code);

  -- Get paginated data
  SELECT json_build_object(
    'success', true,
    'total', v_total,
    'data', COALESCE(
      (
        SELECT json_agg(
          json_build_object(
            'id', c.id,
            'first_name', c.first_name,
            'last_name', c.last_name,
            'phone', c.phone,
            'email', c.email,
            'loyalty_account', json_build_object(
              'current_tier', la.current_tier,
              'current_coins', la.current_coins,
              'lifetime_coins', la.lifetime_coins
            )
          )
        )
        FROM (
          SELECT c.id, c.first_name, c.last_name, c.phone, c.email, la.current_tier, la.current_coins, la.lifetime_coins
          FROM public.customers c
          JOIN public.loyalty_accounts la ON la.customer_id = c.id
          WHERE (p_search IS NULL OR c.first_name ILIKE '%' || p_search || '%' OR c.last_name ILIKE '%' || p_search || '%' OR c.phone ILIKE '%' || p_search || '%')
            AND (p_tier_code IS NULL OR la.current_tier = p_tier_code)
          ORDER BY la.lifetime_coins DESC
          LIMIT p_limit
          OFFSET p_offset
        ) sub
      ),
      '[]'::json
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_loyalty_customer_detail(
  p_customer_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_customer RECORD;
  v_loyalty RECORD;
  v_tier RECORD;
  v_transactions JSON;
  v_order_count INTEGER;
BEGIN
  -- Get customer
  SELECT * INTO v_customer FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Customer not found');
  END IF;

  -- Get loyalty account
  SELECT * INTO v_loyalty FROM public.loyalty_accounts WHERE customer_id = p_customer_id;

  -- Get tier
  IF v_loyalty.current_tier IS NOT NULL THEN
    SELECT * INTO v_tier FROM public.loyalty_tiers WHERE code = v_loyalty.current_tier;
  END IF;

  -- Get transactions (last 50)
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_transactions
  FROM (
    SELECT * FROM public.loyalty_transactions
    WHERE loyalty_account_id = v_loyalty.id
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  -- Get order count
  SELECT COUNT(*) INTO v_order_count FROM public.orders WHERE customer_id = p_customer_id;

  RETURN json_build_object(
    'success', true,
    'customer', row_to_json(v_customer),
    'loyalty', row_to_json(v_loyalty),
    'tier', row_to_json(v_tier),
    'transactions', v_transactions,
    'order_count', v_order_count
  );
END;
$$;

-- Refresh cache
NOTIFY pgrst, 'reload schema';
