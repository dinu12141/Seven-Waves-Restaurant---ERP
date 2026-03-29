CREATE OR REPLACE FUNCTION get_cogs_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
    menu_item_id UUID,
    kitchen_id UUID,
    table_id UUID,
    item_name TEXT,
    kitchen_name TEXT,
    table_name TEXT,
    quantity_sold NUMERIC,
    gross_sales NUMERIC,
    net_sales NUMERIC,
    total_cogs NUMERIC,
    gross_profit NUMERIC,
    gp_percent NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH item_recipes AS (
        -- For each order_item, find its matching recipe cost
        SELECT 
            oi.id AS order_item_id,
            COALESCE(
                (SELECT id FROM recipes 
                 WHERE recipes.menu_item_id = oi.menu_item_id 
                   AND recipes.variant_id = oi.variant_id 
                   AND is_active = true LIMIT 1),
                (SELECT id FROM recipes 
                 WHERE recipes.menu_item_id = oi.menu_item_id 
                   AND variant_id IS NULL 
                   AND is_active = true LIMIT 1)
            ) AS recipe_id,
            oi.quantity,
            oi.unit_price,
            oi.total_price,
            oi.menu_item_id,
            oi.kitchen_id,
            o.table_id,
            o.subtotal,
            o.discount_amount,
            o.total_amount
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status NOT IN ('cancelled')
          AND o.created_at >= p_start_date 
          AND o.created_at <= p_end_date
          AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    ),
    costed_items AS (
        SELECT 
            ir.*,
            -- Cost per unit
            COALESCE(public.calculate_recipe_cost(ir.recipe_id), 0) AS unit_cost,
            
            -- Apportion discount amount
            CASE WHEN ir.subtotal > 0 THEN (ir.total_price / ir.subtotal) * ir.discount_amount ELSE 0 END AS apportioned_discount
        FROM item_recipes ir
    ),
    aggregated AS (
        SELECT 
            c.menu_item_id,
            c.kitchen_id,
            c.table_id,
            SUM(c.quantity) AS quantity_sold,
            SUM(c.total_price) AS gross_sales,
            SUM(c.total_price - c.apportioned_discount) AS net_sales,
            SUM(c.quantity * c.unit_cost) AS total_cogs
        FROM costed_items c
        GROUP BY c.menu_item_id, c.kitchen_id, c.table_id
    )
    SELECT 
        a.menu_item_id,
        a.kitchen_id,
        a.table_id,
        COALESCE(mi.name, 'Unknown Item')::TEXT AS item_name,
        COALESCE(k.name, 'Unknown Kitchen')::TEXT AS kitchen_name,
        COALESCE(t.table_number, 'No Table')::TEXT AS table_name,
        a.quantity_sold::NUMERIC,
        a.gross_sales::NUMERIC,
        a.net_sales::NUMERIC,
        a.total_cogs::NUMERIC,
        (a.net_sales - a.total_cogs)::NUMERIC AS gross_profit,
        CASE WHEN a.net_sales > 0 THEN ((a.net_sales - a.total_cogs) / a.net_sales * 100) ELSE 0 END::NUMERIC AS gp_percent
    FROM aggregated a
    LEFT JOIN menu_items mi ON mi.id = a.menu_item_id
    LEFT JOIN kitchens k ON k.id = a.kitchen_id
    LEFT JOIN restaurant_tables t ON t.id = a.table_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
