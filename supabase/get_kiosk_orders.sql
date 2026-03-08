-- =============================================================
-- get_kiosk_orders: Fetch active orders for a tablet/kiosk
-- ZERO pgcrypto dependency — designed for table mode
-- Returns orders from the last 12 hours for the specified table
-- =============================================================

CREATE OR REPLACE FUNCTION get_kiosk_orders(
    p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_orders JSONB;
BEGIN
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
    WHERE o.table_id      = p_table_id
      AND o.order_source  IN ('qr', 'table_screen')
      AND o.created_at   >= now() - INTERVAL '48 hours'
      AND o.status        NOT IN ('cancelled', 'completed');

    RETURN jsonb_build_object(
        'success',  true,
        'table_id', p_table_id,
        'orders',   v_orders
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_kiosk_orders(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_kiosk_orders(UUID) TO authenticated;
