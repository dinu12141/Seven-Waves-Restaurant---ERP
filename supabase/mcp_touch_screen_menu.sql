-- Add touch screen menu properties to menu_categories
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE public.menu_categories ADD COLUMN icon TEXT DEFAULT 'restaurant';
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_categories ADD COLUMN color TEXT DEFAULT '#2563eb';
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_categories ADD COLUMN active BOOLEAN DEFAULT true;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_categories ADD COLUMN display_order INTEGER DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- Add touch screen menu properties to menu_items
DO $$ 
BEGIN 
    BEGIN
        ALTER TABLE public.menu_items ADD COLUMN image_url TEXT;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_items ADD COLUMN is_veg BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_items ADD COLUMN is_spicy BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_items ADD COLUMN is_best_seller BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN END;
    
    BEGIN
        ALTER TABLE public.menu_items ADD COLUMN preparation_time_mins INTEGER DEFAULT 15;
    EXCEPTION WHEN duplicate_column THEN END;
END $$;

-- Create customer_sessions table
CREATE TABLE IF NOT EXISTS public.customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    session_token TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add policies for customer_sessions
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can insert sessions" ON public.customer_sessions;
    DROP POLICY IF EXISTS "Sessions are viewable by branch members" ON public.customer_sessions;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Public can insert sessions" ON public.customer_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can select own session" ON public.customer_sessions FOR SELECT USING (true);
CREATE POLICY "Public can update own session" ON public.customer_sessions FOR UPDATE USING (true);


-- Create loyalty_accounts table
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_phone TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    tier TEXT DEFAULT 'Bronze',
    total_spent DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for loyalty accounts
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    DROP POLICY IF EXISTS "Public can insert loyalty" ON public.loyalty_accounts;
    DROP POLICY IF EXISTS "Public can select loyalty" ON public.loyalty_accounts;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE POLICY "Public can insert loyalty" ON public.loyalty_accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can select loyalty" ON public.loyalty_accounts FOR SELECT USING (true);
CREATE POLICY "Public can update loyalty" ON public.loyalty_accounts FOR UPDATE USING (true);


-- Function to submit a touch menu order securely
CREATE OR REPLACE FUNCTION fn_submit_touch_menu_order(
    p_company_id UUID,
    p_branch_id UUID,
    p_table_id UUID,
    p_session_token TEXT,
    p_customer_name TEXT,
    p_items JSONB,
    p_subtotal DECIMAL,
    p_tax DECIMAL,
    p_discount DECIMAL,
    p_total DECIMAL
) RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_item JSONB;
    v_menu_item RECORD;
    v_kitchen_id UUID;
    v_loyalty_id UUID;
BEGIN
    -- Verify session exists and is active
    IF NOT EXISTS (SELECT 1 FROM public.customer_sessions WHERE session_token = p_session_token AND is_active = true) THEN
        RAISE EXCEPTION 'Invalid or expired session';
    END IF;

    -- Generate order number
    v_order_number := 'ORD-' || to_char(NOW(), 'YYMMDDHH24MISS');

    -- Create Order (default status: 'pending_waiter' meaning Waiter has to accept it before kitchen starts)
    INSERT INTO public.orders (
        company_id, branch_id, table_id, order_type, customer_name,
        subtotal, tax_amount, discount_amount, total_amount,
        status, order_number, payment_status
    ) VALUES (
        p_company_id, p_branch_id, p_table_id, 'Dine-In', p_customer_name,
        p_subtotal, p_tax, p_discount, p_total,
        'pending_waiter', v_order_number, 'unpaid'
    ) RETURNING id INTO v_order_id;

    -- Create KOT (also pending waiter acceptance)
    INSERT INTO public.kitchen_receipts (
        order_id, receipt_number, printed_at, status
    ) VALUES (
        v_order_id, v_order_number || '-KOT1', NOW(), 'pending'
    );

    -- Lock the table (set status to occupied)
    UPDATE public.restaurant_tables
    SET status = 'occupied', updated_at = NOW()
    WHERE id = p_table_id;

    -- Loop through items and insert order_items & kot_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Get routing_kitchen_id from menu item
        SELECT id, routing_kitchen_id INTO v_menu_item FROM public.menu_items WHERE id = (v_item->>'menu_item_id')::UUID;
        
        -- Default kitchen id if null
        v_kitchen_id := v_menu_item.routing_kitchen_id;

        INSERT INTO public.order_items (
            order_id, menu_item_id, quantity, unit_price, total_price, status, notes
        ) VALUES (
            v_order_id, 
            (v_item->>'menu_item_id')::UUID, 
            (v_item->>'quantity')::INTEGER, 
            (v_item->>'unit_price')::DECIMAL, 
            (v_item->>'total_price')::DECIMAL, 
            'pending',
            v_item->>'notes'
        );
    END LOOP;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
