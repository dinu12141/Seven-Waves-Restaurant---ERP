-- =============================================================
-- create_kiosk_order: Place an order directly from a known table UUID
-- ZERO pgcrypto dependency — designed for tablet/kiosk mode where
-- the device is physically at the table and a session token is not needed.
-- =============================================================

CREATE OR REPLACE FUNCTION create_kiosk_order(
    p_table_id UUID,
    p_items    JSONB,       -- [{menu_item_id, qty, notes?}]
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
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items
         WHERE id = (v_item->>'menu_item_id')::UUID AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Menu item not available: ' || (v_item->>'menu_item_id')
            );
        END IF;

        v_subtotal := v_subtotal + v_menu_item.base_price * (v_item->>'qty')::INT;
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

        INSERT INTO order_items (
            order_id, menu_item_id, kitchen_id, quantity,
            unit_price, total_price, notes, status
        ) VALUES (
            v_order_id, v_menu_item.id, v_menu_item.kitchen_id,
            (v_item->>'qty')::INT,
            v_menu_item.base_price,
            v_menu_item.base_price * (v_item->>'qty')::INT,
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

-- Allow both anon (guest tablet) and authenticated users
GRANT EXECUTE ON FUNCTION create_kiosk_order(UUID, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_kiosk_order(UUID, JSONB, TEXT) TO authenticated;
