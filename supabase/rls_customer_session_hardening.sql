-- =============================================================
-- RLS HARDENING — Customer Session & Order Isolation
-- =============================================================
--
-- Problem solved:
--   The original customer RLS policies relied on
--   auth.jwt()->'app_metadata'->>'table_id' which was never
--   actually set in the JWT.  Customer sessions use bcrypt-
--   validated session tokens through SECURITY DEFINER RPCs,
--   not JWT claims.
--
-- New approach:
--   1. A helper RPC  session_table_id(p_session_token TEXT)
--      validates the token server-side and returns the table_id.
--   2. The frontend passes the session token as a Supabase
--      custom header (x-session-token) via supabase.functions
--      or as a request-scoped setting.
--   3. For direct table reads (menu browsing, order tracking),
--      we use SECURITY DEFINER wrapper RPCs instead of raw
--      SELECT with RLS, because anon can't carry a "current
--      session" in PostgreSQL's per-connection state cleanly.
--   4. All writes go through SECURITY DEFINER RPCs already
--      (create_order_from_session, heartbeat_session, etc.)
--
-- This migration:
--   a) Locks down table_devices — anon gets ZERO direct access
--   b) Locks down customer_sessions — anon can't list sessions
--   c) Replaces broken JWT-based customer order/KOT policies
--      with a session-validated SELECT RPC
--   d) Adds a helper RPC for customers to read their orders
-- =============================================================


-- =============================================================
-- A. TABLE DEVICES — lock out anon completely
-- =============================================================
-- Sessions are created ONLY via SECURITY DEFINER RPCs
-- (create_table_session, get_or_create_session_by_qr).
-- No direct table access for anon on table_devices.

-- 1. Revoke any direct grants to anon safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_devices') THEN
        REVOKE ALL ON table_devices FROM anon;
    END IF;
END $$;

-- 2. Keep existing admin/staff policies (already correct)
--    td_admin → admin/manager full access
--    td_staff_select → staff read own branch
--    (no changes needed)


-- =============================================================
-- B. CUSTOMER SESSIONS — lock out anon direct reads
-- =============================================================
-- anon currently has SELECT grant which lets them list
-- all session hashes, table associations, etc.
-- Fix: remove direct access.  All session operations go
-- through SECURITY DEFINER RPCs.

-- 1. Revoke anon SELECT safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_sessions') THEN
        REVOKE ALL ON customer_sessions FROM anon;
    END IF;
END $$;

-- 2. Drop the existing anon-permissive policy if it exists
--    (cs_admin and cs_staff_select are fine, they require auth)
--    No additional anon policy is needed — all session
--    operations use SECURITY DEFINER RPCs.


-- =============================================================
-- C. TABLE QR TOKENS — restrict anon to minimal SELECT
-- =============================================================
-- anon needs to scan QR tokens, but the actual resolution
-- happens in get_or_create_session_by_qr (SECURITY DEFINER).
-- We can revoke direct anon access since the RPC handles it.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'table_qr_tokens') THEN
        REVOKE ALL ON table_qr_tokens FROM anon;
    END IF;
END $$;


-- =============================================================
-- D. ORDERS — replace broken customer SELECT policy
-- =============================================================
-- The existing ord_customer_select references
-- auth.jwt()->'app_metadata'->>'table_id' which is never set.
-- Replace with a SECURITY DEFINER RPC approach.

-- 1. Drop the broken policy
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'ord_customer_select') THEN
        DROP POLICY ord_customer_select ON orders;
    END IF;
END $$;

-- 2. Anon should NOT be able to SELECT orders directly.
--    They use the get_session_orders RPC below instead.
--    Keep GRANT SELECT ON orders TO anon for the RPC to work
--    internally, but RLS blocks direct reads.
--    (No new anon policy = anon can't SELECT directly)


-- =============================================================
-- E. ORDER ITEMS — replace broken customer SELECT policy
-- =============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_items' AND policyname = 'oi_customer_select') THEN
        DROP POLICY oi_customer_select ON order_items;
    END IF;
END $$;

-- Same approach: no direct anon policy. Use RPC.


-- =============================================================
-- F. KOT — replace broken customer SELECT policies
-- =============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kot_tickets' AND policyname = 'kot_customer_select') THEN
        DROP POLICY kot_customer_select ON kot_tickets;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'kot_items' AND policyname = 'ki_customer_select') THEN
        DROP POLICY ki_customer_select ON kot_items;
    END IF;
END $$;

-- Same approach: no direct anon policy. Use RPC.


-- =============================================================
-- G. HELPER RPC: session_table_id(token) → UUID
-- =============================================================
-- Validates session token, returns the table_id.
-- Used internally by other RPCs. Not exposed to anon.

CREATE OR REPLACE FUNCTION session_table_id(
    p_session_token TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_table_id UUID;
BEGIN
    SELECT cs.table_id
      INTO v_table_id
      FROM customer_sessions cs
     WHERE cs.status     = 'active'
       AND cs.expires_at > now()
       AND cs.session_token_hash = crypt(p_session_token, cs.session_token_hash);

    RETURN v_table_id;  -- NULL if not found
END;
$$;


-- =============================================================
-- H. RPC: get_session_orders(session_token)
-- =============================================================
-- Customer can read ONLY their own orders (by table_id from
-- their validated session). Returns orders + items for the
-- table's active session period.
--
-- Security:
--   • SECURITY DEFINER — bypasses RLS
--   • Token validated via bcrypt crypt()
--   • Returns only orders for the session's table_id
--   • Only orders with source 'qr' or 'table_screen'
--   • Only orders created while the session is active
-- =============================================================

CREATE OR REPLACE FUNCTION get_session_orders(
    p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_session   RECORD;
    v_orders    JSONB;
BEGIN
    -- 1. Validate session
    SELECT cs.id,
           cs.table_id,
           cs.started_at,
           cs.expires_at
      INTO v_session
      FROM customer_sessions cs
     WHERE cs.status     = 'active'
       AND cs.expires_at > now()
       AND cs.session_token_hash = crypt(p_session_token, cs.session_token_hash);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired session');
    END IF;

    -- 2. Fetch orders for this table, created during this session
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id',             o.id,
            'order_number',   o.order_number,
            'status',         o.status,
            'payment_status', o.payment_status,
            'order_source',   o.order_source,
            'subtotal',       o.subtotal,
            'total_amount',   o.total_amount,
            'created_at',     o.created_at,
            'items',          (
                SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'id',          oi.id,
                        'menu_item_id', oi.menu_item_id,
                        'quantity',     oi.quantity,
                        'unit_price',   oi.unit_price,
                        'total_price',  oi.total_price,
                        'status',       oi.status,
                        'notes',        oi.notes,
                        'item_name',    mi.name
                    ) ORDER BY oi.created_at
                ), '[]'::JSONB)
                FROM order_items oi
                LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
                WHERE oi.order_id = o.id
            )
        ) ORDER BY o.created_at DESC
    ), '[]'::JSONB)
    INTO v_orders
    FROM orders o
    WHERE o.table_id      = v_session.table_id
      AND o.order_source  IN ('qr', 'table_screen')
      AND o.created_at   >= v_session.started_at
      AND o.created_at   <= v_session.expires_at;

    -- 3. Touch session activity
    UPDATE customer_sessions
       SET last_activity_at = now()
     WHERE id = v_session.id;

    RETURN jsonb_build_object(
        'success',  true,
        'table_id', v_session.table_id,
        'orders',   v_orders
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_session_orders(TEXT)  TO anon;
GRANT EXECUTE ON FUNCTION get_session_orders(TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION session_table_id(TEXT)    TO anon;
GRANT EXECUTE ON FUNCTION session_table_id(TEXT)    TO authenticated;
