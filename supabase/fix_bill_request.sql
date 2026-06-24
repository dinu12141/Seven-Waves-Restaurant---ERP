-- ============================================================
-- Bill Request: add columns + RPC
-- ============================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_requested BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bill_requested_at TIMESTAMPTZ;

-- Function to set the bill-requested flag
CREATE OR REPLACE FUNCTION public.waiter_request_bill(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE orders
     SET bill_requested    = true,
         bill_requested_at = now()
   WHERE id = p_order_id
     AND status NOT IN ('completed','cancelled');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found or already closed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.waiter_request_bill(UUID) TO authenticated;
