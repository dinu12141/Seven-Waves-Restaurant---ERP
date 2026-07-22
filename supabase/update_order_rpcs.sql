-- =============================================================
-- Update create_kiosk_order and create_order_from_session
-- to support menu item size variants (M/L sizes)
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_kiosk_order(
    p_table_id UUID,
    p_items    JSONB,       -- [{menu_item_id, qty, notes?, variant_id?}]
    p_source   TEXT DEFAULT 'table_screen'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_table     RECORD;
    v_order_id  UUID;
    v_subtotal  NUMERIC(12,2) := 0;
    v_item      JSONB;
    v_menu_item RECORD;
    v_variant   RECORD;
    v_item_price NUMERIC(12,2);
    v_item_variant_id UUID;
BEGIN
    IF p_source NOT IN ('qr', 'table_screen') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid order source');
    END IF;

    -- Resolve table → branch + company
    SELECT rt.id AS table_id, rt.branch_id, b.company_id
      INTO v_table
      FROM restaurant_tables rt
      JOIN branches b ON b.id = rt.branch_id
     WHERE rt.id = p_table_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found');
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- Validate items & build subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        -- Fetch menu item
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items
         WHERE id = (v_item->>'menu_item_id')::UUID AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Menu item not available: ' || (v_item->>'menu_item_id')
            );
        END IF;

        -- Check variant if provided
        v_item_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_item_price := v_menu_item.base_price;

        IF v_item_variant_id IS NOT NULL THEN
            SELECT id, price INTO v_variant
              FROM item_variants
             WHERE id = v_item_variant_id AND menu_item_id = v_menu_item.id AND is_active = true;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error',   'Variant not available: ' || v_item_variant_id
                );
            END IF;
            v_item_price := v_variant.price;
        END IF;

        v_subtotal := v_subtotal + v_item_price * (v_item->>'qty')::INT;
    END LOOP;

    -- Create order
    INSERT INTO orders (
        company_id, branch_id, table_id, order_type, order_source,
        status, payment_status, subtotal, total_amount
    ) VALUES (
        v_table.company_id, v_table.branch_id, v_table.table_id,
        'dine_in', p_source, 'pending_waiter', 'unpaid', v_subtotal, v_subtotal
    ) RETURNING id INTO v_order_id;

    -- Insert order items (prices from DB, never from client)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID;

        v_item_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_item_price := v_menu_item.base_price;

        IF v_item_variant_id IS NOT NULL THEN
            SELECT id, price INTO v_variant
              FROM item_variants
             WHERE id = v_item_variant_id AND menu_item_id = v_menu_item.id AND is_active = true;
            IF FOUND THEN
                v_item_price := v_variant.price;
            ELSE
                v_item_variant_id := NULL; -- fallback if not found
            END IF;
        END IF;

        INSERT INTO order_items (
            order_id, menu_item_id, variant_id, kitchen_id, quantity,
            unit_price, total_price, notes, status
        ) VALUES (
            v_order_id, v_menu_item.id, v_item_variant_id, v_menu_item.kitchen_id,
            (v_item->>'qty')::INT,
            v_item_price,
            v_item_price * (v_item->>'qty')::INT,
            v_item->>'notes',
            'queued'
        );
    END LOOP;

    -- Mark table occupied
    UPDATE restaurant_tables
       SET status = 'occupied'
     WHERE id = v_table.table_id;

    RETURN jsonb_build_object(
        'success',   true,
        'order_id',  v_order_id,
        'table_id',  v_table.table_id,
        'branch_id', v_table.branch_id,
        'subtotal',  v_subtotal,
        'status',    'pending_waiter'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


CREATE OR REPLACE FUNCTION public.create_order_from_session(
    p_session_token TEXT,
    p_items         JSONB,       -- [{menu_item_id, qty, notes?, variant_id?}]
    p_source        TEXT DEFAULT 'qr'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_session   RECORD;
    v_table     RECORD;
    v_order_id  UUID;
    v_subtotal  NUMERIC(12,2) := 0;
    v_item      JSONB;
    v_menu_item RECORD;
    v_variant   RECORD;
    v_item_price NUMERIC(12,2);
    v_item_variant_id UUID;
    v_kot_id    UUID;
    v_k_record  RECORD;
BEGIN
    -- 1. Resolve session
    SELECT id, table_id, active
      INTO v_session
      FROM table_sessions
     WHERE session_token = p_session_token;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid session');
    END IF;

    IF NOT v_session.active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session is closed');
    END IF;

    -- 2. Resolve table
    SELECT rt.id AS table_id, rt.branch_id, b.company_id
      INTO v_table
      FROM restaurant_tables rt
      JOIN branches b ON b.id = rt.branch_id
     WHERE rt.id = v_session.table_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found');
    END IF;

    -- 3. Validate cart is non-empty
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- 4. Validate every cart item & build subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items
         WHERE id = (v_item->>'menu_item_id')::UUID AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Menu item not available: ' || (v_item->>'menu_item_id')
            );
        END IF;

        -- Check variant if provided
        v_item_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_item_price := v_menu_item.base_price;

        IF v_item_variant_id IS NOT NULL THEN
            SELECT id, price INTO v_variant
              FROM item_variants
             WHERE id = v_item_variant_id AND menu_item_id = v_menu_item.id AND is_active = true;

            IF NOT FOUND THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error',   'Variant not available: ' || v_item_variant_id
                );
            END IF;
            v_item_price := v_variant.price;
        END IF;

        v_subtotal := v_subtotal + v_item_price * (v_item->>'qty')::INT;
    END LOOP;

    -- 5. Create order
    INSERT INTO orders (
        company_id, branch_id, table_id, order_type, order_source,
        status, payment_status, subtotal, total_amount
    ) VALUES (
        v_table.company_id, v_table.branch_id, v_table.table_id,
        'dine_in', p_source, 'pending_waiter', 'unpaid', v_subtotal, v_subtotal
    ) RETURNING id INTO v_order_id;

    -- 6. Insert order items (prices from DB)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items WHERE id = (v_item->>'menu_item_id')::UUID;

        v_item_variant_id := NULLIF(v_item->>'variant_id', '')::UUID;
        v_item_price := v_menu_item.base_price;

        IF v_item_variant_id IS NOT NULL THEN
            SELECT id, price INTO v_variant
              FROM item_variants
             WHERE id = v_item_variant_id AND menu_item_id = v_menu_item.id AND is_active = true;
            IF FOUND THEN
                v_item_price := v_variant.price;
            ELSE
                v_item_variant_id := NULL;
            END IF;
        END IF;

        INSERT INTO order_items (
            order_id, menu_item_id, variant_id, kitchen_id, quantity,
            unit_price, total_price, notes, status
        ) VALUES (
            v_order_id, v_menu_item.id, v_item_variant_id, v_menu_item.kitchen_id,
            (v_item->>'qty')::INT,
            v_item_price,
            v_item_price * (v_item->>'qty')::INT,
            v_item->>'notes',
            'queued'
        );
    END LOOP;

    -- 7. Generate KOT tickets for the order
    FOR v_k_record IN 
        SELECT DISTINCT kitchen_id 
          FROM order_items 
         WHERE order_id = v_order_id 
           AND kitchen_id IS NOT NULL 
    LOOP
        INSERT INTO kot_tickets (order_id, kitchen_id, status)
        VALUES (v_order_id, v_k_record.kitchen_id, 'created')
        RETURNING id INTO v_kot_id;

        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, id, quantity, 'queued'
          FROM order_items
         WHERE order_id = v_order_id 
           AND kitchen_id = v_k_record.kitchen_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success',   true,
        'order_id',  v_order_id,
        'table_id',  v_table.table_id,
        'branch_id', v_table.branch_id,
        'subtotal',  v_subtotal,
        'status',    'pending_waiter'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
