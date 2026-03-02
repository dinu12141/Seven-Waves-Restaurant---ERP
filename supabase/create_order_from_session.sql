-- =============================================================
-- Customer UI Order Creation via Session
-- Migration: create_order_from_session_rpc
-- =============================================================
--
-- Security model:
--   • Customer supplies only: session_token, cart items (menu_item_id + qty + notes)
--   • table_id, branch_id, company_id are resolved SERVER-SIDE from customer_sessions
--   • Item prices are re-validated from menu_items.base_price (client price ignored)
--   • Session validated via bcrypt crypt() — token never stored plaintext
--   • order_source must be 'qr' or 'table_screen' (enforced in RPC)
--   • table_id is always non-null (session always has one)
--   • Runs as SECURITY DEFINER so anon role can create orders without
--     direct INSERT grants on orders/order_items tables
--
-- DB constraint fixes applied alongside:
--   • chk_order_status now includes 'pending_waiter'
--   • chk_order_source now includes 'table_screen'
-- =============================================================

-- ── Fix CHECK constraints ─────────────────────────────────────────────────────

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS chk_order_status;

ALTER TABLE orders
    ADD CONSTRAINT chk_order_status CHECK (
        status IN (
            'pending',
            'pending_waiter',
            'accepted',
            'preparing',
            'ready',
            'served',
            'invoiced',
            'paid',
            'cancelled'
        )
    );

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS chk_order_source;

ALTER TABLE orders
    ADD CONSTRAINT chk_order_source CHECK (
        order_source IN ('pos', 'qr', 'table_screen', 'website', 'uber_eats', 'pickme', 'other')
    );

ALTER TABLE kot_tickets
    DROP CONSTRAINT IF EXISTS chk_kot_status;

ALTER TABLE kot_tickets
    ADD CONSTRAINT chk_kot_status CHECK (
        status IN ('created', 'pending', 'accepted', 'preparing', 'ready', 'cancelled')
    );


-- ── RPC ───────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_order_from_session(
    p_session_token TEXT,
    p_items         JSONB,   -- [{menu_item_id, qty, unit_price, notes?}]
    p_source        TEXT DEFAULT 'qr'   -- 'qr' | 'table_screen'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_session    RECORD;
    v_table      RECORD;
    v_order_id   UUID;
    v_subtotal   NUMERIC(12,2) := 0;
    v_item       JSONB;
    v_menu_item  RECORD;
    v_k_record   RECORD;
    v_kot_id     UUID;
BEGIN
    -- 1. Validate source value
    IF p_source NOT IN ('qr', 'table_screen') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid order source');
    END IF;

    -- 2. Validate session token — active, non-expired
    SELECT cs.id,
           cs.table_id,
           cs.status,
           cs.expires_at
      INTO v_session
      FROM customer_sessions cs
     WHERE cs.status     = 'active'
       AND cs.expires_at  > now()
       AND cs.session_token_hash = crypt(p_session_token, cs.session_token_hash)
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
    END IF;

    -- 3. Resolve table → branch + company (never from client)
    SELECT rt.id         AS table_id,
           rt.branch_id,
           b.company_id
      INTO v_table
      FROM restaurant_tables rt
      JOIN branches           b  ON b.id = rt.branch_id
     WHERE rt.id = v_session.table_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Table not found');
    END IF;

    -- 4. Validate cart is non-empty
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- 5. Validate every cart item & build subtotal
    --    Prices re-confirmed from DB, not blindly trusted from client
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id
          INTO v_menu_item
          FROM menu_items
         WHERE id           = (v_item->>'menu_item_id')::UUID
           AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Menu item not available: ' || (v_item->>'menu_item_id')
            );
        END IF;

        v_subtotal := v_subtotal
                    + v_menu_item.base_price * (v_item->>'qty')::INT;
    END LOOP;

    -- 6. Create the order
    INSERT INTO orders (
        company_id,
        branch_id,
        table_id,
        order_type,
        order_source,
        status,
        payment_status,
        subtotal,
        total_amount
    ) VALUES (
        v_table.company_id,
        v_table.branch_id,
        v_table.table_id,   -- always from session, never from client
        'dine_in',
        p_source,
        'pending_waiter',
        'unpaid',
        v_subtotal,
        v_subtotal
    )
    RETURNING id INTO v_order_id;

    -- 7. Insert order items (prices come from DB)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id
          INTO v_menu_item
          FROM menu_items
         WHERE id = (v_item->>'menu_item_id')::UUID;

        INSERT INTO order_items (
            order_id,
            menu_item_id,
            kitchen_id,
            quantity,
            unit_price,
            total_price,
            notes,
            status
        ) VALUES (
            v_order_id,
            v_menu_item.id,
            v_menu_item.kitchen_id,
            (v_item->>'qty')::INT,
            v_menu_item.base_price,
            v_menu_item.base_price * (v_item->>'qty')::INT,
            v_item->>'notes',
            'queued'
        );
    END LOOP;

    -- 8. Generate KOT tickets for the order
    FOR v_k_record IN 
        SELECT DISTINCT kitchen_id 
          FROM order_items 
         WHERE order_id = v_order_id 
           AND kitchen_id IS NOT NULL 
    LOOP
        INSERT INTO kot_tickets (order_id, kitchen_id, status)
        VALUES (v_order_id, v_k_record.kitchen_id, 'created')
        RETURNING id INTO v_kot_id;
        
        -- Insert KOT items
        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, id, quantity, 'queued'
          FROM order_items
         WHERE order_id = v_order_id
           AND kitchen_id = v_k_record.kitchen_id;
    END LOOP;

    -- 9. Touch session activity
    UPDATE customer_sessions
       SET last_activity_at = now()
     WHERE id = v_session.id;

    -- 10. Lock the table (set status to occupied)
    UPDATE restaurant_tables
       SET status = 'occupied', updated_at = now()
     WHERE id = v_table.table_id;

    -- 11. Return success
    RETURN jsonb_build_object(
        'success',      true,
        'order_id',     v_order_id,
        'table_id',     v_table.table_id,
        'branch_id',    v_table.branch_id,
        'subtotal',     v_subtotal,
        'status',       'pending_waiter',
        'order_source', p_source
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_from_session(TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_order_from_session(TEXT, JSONB, TEXT) TO authenticated;
