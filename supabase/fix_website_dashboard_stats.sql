CREATE OR REPLACE FUNCTION get_website_dashboard_stats(p_branch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_orders INT;
    v_unread_messages INT;
    v_pending_reservations INT;
    v_total_revenue NUMERIC(10,2);
BEGIN
    -- 1. Total Website Orders
    SELECT COUNT(id) INTO v_total_orders
    FROM orders
    WHERE branch_id = p_branch_id AND order_source = 'website';

    -- 2. Unread Website Messages
    SELECT COUNT(id) INTO v_unread_messages
    FROM website_messages
    WHERE status = 'unread';

    -- 3. Pending Website Reservations
    SELECT COUNT(id) INTO v_pending_reservations
    FROM website_reservations
    WHERE status = 'pending';

    -- 4. Total Website Revenue
    SELECT COALESCE(SUM(total_amount), 0) INTO v_total_revenue
    FROM orders
    WHERE branch_id = p_branch_id 
      AND order_source = 'website'
      AND status IN ('completed', 'paid', 'delivered', 'served');

    RETURN jsonb_build_object(
        'total_orders', v_total_orders,
        'unread_messages', v_unread_messages,
        'pending_reservations', v_pending_reservations,
        'total_revenue', v_total_revenue
    );
END;
$$;
