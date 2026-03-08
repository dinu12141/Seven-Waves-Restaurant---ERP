-- ==========================================
-- SCRIPT TO SYNC KITCHENS WITH WAREHOUSES & CREATE LOGINS
-- AND FIX MENU BOOK KITCHEN ROUTING
-- ==========================================

DO $$
DECLARE
    v_wh RECORD;
    v_kitchen_id UUID;
    v_user_id UUID;
    v_role_id UUID;
    v_email TEXT;
    v_name TEXT;
    v_password TEXT := crypt('123456', gen_salt('bf'));
    v_created_at TIMESTAMPTZ := now();
    v_branch_id UUID;
    v_company_id UUID;
BEGIN
    SELECT id INTO v_role_id FROM roles WHERE name = 'kitchen' LIMIT 1;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role kitchen not found!';
    END IF;

    -- We no longer delete existing kitchen users here to avoid breaking foreign key 
    -- constraints (like audit_logs). The loop below will gracefully update them 
    -- if they exist or create them if they don't.

    -- Create/Update kitchens associated with warehouses and create logins
    FOR v_wh IN 
        SELECT * FROM warehouses 
        WHERE warehouse_type IN ('kitchen', 'main_store', 'store', 'bar')
           OR name ILIKE '%CASHIER%'
           OR name ILIKE '%CHINEESE%'
           OR name ILIKE '%INDIAN%'
           OR name ILIKE '%ITALIAN%'
           OR name ILIKE '%JUICE%'
           OR name ILIKE '%WESTERN%'
           OR name ILIKE '%SRI LANKAN%'
           OR name ILIKE '%FUNCTION%'
    LOOP
        v_kitchen_id := v_wh.kitchen_id;
        v_branch_id := v_wh.branch_id;
        v_company_id := v_wh.company_id;
        
        -- Double check if a kitchen with this name already exists for this branch but isn't linked
        IF v_kitchen_id IS NULL THEN
            SELECT id INTO v_kitchen_id FROM kitchens 
            WHERE branch_id = v_branch_id AND name = v_wh.name LIMIT 1;
        END IF;

        -- If no kitchen is linked or found, create one
        IF v_kitchen_id IS NULL OR NOT EXISTS (SELECT 1 FROM kitchens WHERE id = v_kitchen_id) THEN
            INSERT INTO kitchens (company_id, branch_id, name, is_active)
            VALUES (v_wh.company_id, v_wh.branch_id, v_wh.name, true)
            RETURNING id INTO v_kitchen_id;

            UPDATE warehouses SET kitchen_id = v_kitchen_id WHERE id = v_wh.id;
        ELSE
            -- Ensure it is active and has correct branch
            UPDATE kitchens SET name = v_wh.name, is_active = true, branch_id = v_wh.branch_id WHERE id = v_kitchen_id;
            
            -- Ensure warehouse is also linked back if it wasn't
            UPDATE warehouses SET kitchen_id = v_kitchen_id WHERE id = v_wh.id;
        END IF;

        -- Create login email from name
        v_name := lower(regexp_replace(v_wh.name, '[^a-zA-Z0-9_\-]', '', 'g'));
        IF v_name = '' THEN v_name := 'kitchen_' || left(v_wh.id::text, 8); END IF;
        v_email := v_name || '@sevenwaves.lk';

        -- Check if user already exists
        SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;

        IF v_user_id IS NULL THEN
            v_user_id := gen_random_uuid();
            
            INSERT INTO auth.users (
                id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                raw_app_meta_data, raw_user_meta_data
            ) VALUES (
                v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, v_password, v_created_at,
                v_created_at, v_created_at, '', '', '', '',
                '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb
            );

            INSERT INTO auth.identities (
                id,
                user_id, 
                identity_data, 
                provider, 
                provider_id,
                last_sign_in_at, 
                created_at, 
                updated_at
            ) VALUES (
                v_user_id, 
                v_user_id, 
                format('{"sub": "%s", "email": "%s"}', v_user_id, v_email)::jsonb, 
                'email',
                v_user_id::text,
                v_created_at, 
                v_created_at, 
                v_created_at
            ) ON CONFLICT DO NOTHING;
        ELSE
            -- User exists: just update the password and metadata to ensure they can log in successfully
            UPDATE auth.users 
            SET 
                encrypted_password = v_password,
                raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
                raw_user_meta_data = '{}'::jsonb,
                email_confirmed_at = COALESCE(email_confirmed_at, v_created_at)
            WHERE id = v_user_id;
        END IF;

        INSERT INTO profiles (id, full_name, email, is_active, kitchen_id)
        VALUES (v_user_id, v_wh.name || ' User', v_email, true, v_kitchen_id)
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            is_active = EXCLUDED.is_active,
            kitchen_id = EXCLUDED.kitchen_id;

        INSERT INTO user_roles (user_id, role_id)
        VALUES (v_user_id, v_role_id)
        ON CONFLICT (user_id, role_id) DO NOTHING;
        
        INSERT INTO user_branches (user_id, branch_id, is_home_branch)
        VALUES (v_user_id, v_wh.branch_id, true)
        ON CONFLICT (user_id, branch_id) DO NOTHING;

    END LOOP;
END $$;

-- Fix the touch menu submit function to look up kitchen from category -> warehouse
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
    v_kitchen_id UUID;
    v_category_id UUID;
    v_warehouse_id UUID;
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

    -- Loop through items and insert order_items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- RESOLVE KITCHEN USING CENTRALIZED LOGIC
        v_kitchen_id := public.get_target_kitchen_for_item((v_item->>'menu_item_id')::UUID, p_branch_id);

        INSERT INTO public.order_items (
            order_id, menu_item_id, quantity, unit_price, total_price, status, notes, kitchen_id
        ) VALUES (
            v_order_id, 
            (v_item->>'menu_item_id')::UUID, 
            (v_item->>'quantity')::INTEGER, 
            (v_item->>'unit_price')::DECIMAL, 
            (v_item->>'total_price')::DECIMAL, 
            'queued',
            v_item->>'notes',
            v_kitchen_id
        );
    END LOOP;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
