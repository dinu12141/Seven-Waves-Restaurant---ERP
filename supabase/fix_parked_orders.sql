-- =====================================================
-- PARKED ORDERS (Hold / Park feature for POS)
-- Allows cashiers to save a mid-order cart and
-- recall it later without losing items.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.parked_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  parked_by UUID REFERENCES auth.users(id),
  label TEXT, -- e.g. "Table 5 customer waiting"
  cart_items JSONB NOT NULL, -- snapshot of cart
  order_type TEXT DEFAULT 'dine-in', -- 'dine-in' | 'takeaway' | 'delivery'
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  table_number TEXT,
  selected_table UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  delivery_charge NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parked_orders ENABLE ROW LEVEL SECURITY;

-- Branch-scoped policy: staff can only see parked orders for their branch
DROP POLICY IF EXISTS po_branch ON public.parked_orders;
CREATE POLICY po_branch ON public.parked_orders
  FOR ALL
  USING (branch_id = ANY(auth_branch_ids()));

-- Index for fast lookup by branch
CREATE INDEX IF NOT EXISTS idx_parked_orders_branch_id ON public.parked_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_parked_orders_created_at ON public.parked_orders(created_at DESC);
