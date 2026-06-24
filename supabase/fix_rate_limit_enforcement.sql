-- =============================================================
-- Rate Limit Enforcement Patch
-- Wires check_qr_rate_limit() into both public-facing order RPCs.
-- Infrastructure (qr_rate_limits table + check_qr_rate_limit RPC)
-- was deployed in erp_security_lockdown.sql but never invoked.
-- Apply AFTER CRITICAL_fix_revoke_anon_functions.sql
-- =============================================================

-- ── 1. create_kiosk_order — tablet/kiosk mode ────────────────────────────────
-- Rate limit: 10 orders per minute per table UUID
CREATE OR REPLACE FUNCTION create_kiosk_order(
    p_table_id UUID,
    p_items    JSONB,
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
    v_rl        JSONB;
BEGIN
    IF p_source NOT IN ('qr', 'table_screen') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid order source');
    END IF;

    -- Rate limit: 10 order submissions per minute per table
    v_rl := check_qr_rate_limit(p_table_id::TEXT, 'create_order', 10);
    IF NOT (v_rl->>'allowed')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Too many orders. Please wait a moment.',
            'rate_limited', true
        );
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

-- Restore grants (same as original; CRITICAL_fix file may have adjusted these)
GRANT EXECUTE ON FUNCTION create_kiosk_order(UUID, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_kiosk_order(UUID, JSONB, TEXT) TO authenticated;


-- ── 2. create_order_from_session — QR scan flow ──────────────────────────────
-- Rate limit: 10 orders per minute per table (resolved from session)
-- Note: check is after session validation so we know the table_id.
-- Full function re-declared to insert rate limit after session lookup.

-- First read the existing body to know where session lookup ends.
-- The session is validated at step 2, table resolved at step 3.
-- We insert the rate limit check between step 2 and step 3.

CREATE OR REPLACE FUNCTION create_order_from_session(
    p_session_token TEXT,
    p_items         JSONB,
    p_source        TEXT DEFAULT 'qr'
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
    v_rl         JSONB;
BEGIN
    -- 1. Validate source
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
     WHERE cs.status      = 'active'
       AND cs.expires_at  > now()
       AND cs.session_token_hash = crypt(p_session_token, cs.session_token_hash)
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
    END IF;

    -- 2b. Rate limit: 10 orders per minute per table
    v_rl := check_qr_rate_limit(v_session.table_id::TEXT, 'create_order', 10);
    IF NOT (v_rl->>'allowed')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Too many orders. Please wait a moment.',
            'rate_limited', true
        );
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

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cart is empty');
    END IF;

    -- 4. Validate items & compute subtotal (prices from DB)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT id, base_price, kitchen_id INTO v_menu_item
          FROM menu_items
         WHERE id = (v_item->>'menu_item_id')::UUID
           AND is_available = true;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error',   'Menu item not available: ' || (v_item->>'menu_item_id')
            );
        END IF;

        v_subtotal := v_subtotal + v_menu_item.base_price * (v_item->>'qty')::INT;
    END LOOP;

    -- 5. Create order
    INSERT INTO orders (
        company_id, branch_id, table_id,
        order_type, order_source,
        status, payment_status,
        subtotal, total_amount
    ) VALUES (
        v_table.company_id, v_table.branch_id, v_table.table_id,
        'dine_in', p_source,
        'pending_waiter', 'unpaid',
        v_subtotal, v_subtotal
    ) RETURNING id INTO v_order_id;

    -- 6. Insert order items (prices from DB, never from client)
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

    -- 7. Generate KOT tickets per kitchen
    FOR v_k_record IN
        SELECT DISTINCT kitchen_id
          FROM order_items
         WHERE order_id    = v_order_id
           AND kitchen_id IS NOT NULL
    LOOP
        INSERT INTO kot_tickets (order_id, kitchen_id, status)
        VALUES (v_order_id, v_k_record.kitchen_id, 'created')
        RETURNING id INTO v_kot_id;

        INSERT INTO kot_items (kot_id, order_item_id, quantity, status)
        SELECT v_kot_id, id, quantity, 'queued'
          FROM order_items
         WHERE order_id   = v_order_id
           AND kitchen_id = v_k_record.kitchen_id;
    END LOOP;

    -- 8. Touch session activity
    UPDATE customer_sessions
       SET last_activity_at = now()
     WHERE id = v_session.id;

    -- 9. Mark table occupied
    UPDATE restaurant_tables
       SET status = 'occupied', updated_at = now()
     WHERE id = v_table.table_id;

    RETURN jsonb_build_object(
        'success',      true,
        'order_id',     v_order_id,
        'table_id',     v_table.table_id,
        'branch_id',    v_table.branch_id,
        'subtotal',     v_subtotal,
        'status',       'pending_waiter',
        'order_source', p_source
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Restore grants
GRANT EXECUTE ON FUNCTION create_order_from_session(TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION create_order_from_session(TEXT, JSONB, TEXT) TO authenticated;


-- ── Verification ─────────────────────────────────────────────────────────────
-- After applying, simulate a rate-limit hit to verify the check fires:
--
-- SELECT check_qr_rate_limit('test-table-id', 'create_order', 0);
-- Expected: {"allowed": false, "hits": 1, "limit": 0}
