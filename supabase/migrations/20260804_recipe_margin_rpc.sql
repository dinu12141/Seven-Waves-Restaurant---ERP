-- Migration: 20260804_recipe_margin_rpc.sql
-- Description: Adds RPC to calculate BOM margins using GRN costs.

CREATE OR REPLACE FUNCTION public.get_recipe_margin_report(
    p_company_id uuid,
    p_start_date date DEFAULT NULL,
    p_end_date date DEFAULT NULL
)
RETURNS TABLE (
    recipe_id uuid,
    menu_item_name text,
    category_name text,
    kitchen_name text,
    real_menu_price numeric,
    real_cost numeric,
    margin numeric,
    margin_pct numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH item_costs AS (
        SELECT 
            i.id AS item_id,
            COALESCE(
                -- 1. Average GRN unit cost in period (if dates provided)
                CASE WHEN p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
                    (
                        SELECT SUM(grl.quantity * grl.unit_cost) / NULLIF(SUM(grl.quantity), 0)
                        FROM public.goods_receipt_lines grl
                        JOIN public.goods_receipts gr ON gr.id = grl.grn_id
                        WHERE grl.item_id = i.id
                          AND gr.company_id = p_company_id
                          AND gr.status = 'posted'
                          AND gr.doc_date >= p_start_date
                          AND gr.doc_date <= p_end_date
                    )
                ELSE NULL END,
                -- 2. Latest GRN unit cost before end_date (if end_date provided)
                CASE WHEN p_end_date IS NOT NULL THEN
                    (
                        SELECT grl.unit_cost
                        FROM public.goods_receipt_lines grl
                        JOIN public.goods_receipts gr ON gr.id = grl.grn_id
                        WHERE grl.item_id = i.id
                          AND gr.company_id = p_company_id
                          AND gr.status = 'posted'
                          AND gr.doc_date <= p_end_date
                        ORDER BY gr.doc_date DESC, gr.created_at DESC
                        LIMIT 1
                    )
                ELSE NULL END,
                -- 3. Latest GRN unit cost overall (if no dates provided or fallback)
                (
                    SELECT grl.unit_cost
                    FROM public.goods_receipt_lines grl
                    JOIN public.goods_receipts gr ON gr.id = grl.grn_id
                    WHERE grl.item_id = i.id
                      AND gr.company_id = p_company_id
                      AND gr.status = 'posted'
                    ORDER BY gr.doc_date DESC, gr.created_at DESC
                    LIMIT 1
                ),
                -- 4. Fallback to item's avg_cost
                i.avg_cost
            ) AS period_cost
        FROM public.items i
        WHERE i.company_id = p_company_id
    ),
    recipe_costs AS (
        SELECT 
            r.id AS recipe_id,
            SUM(
                ri.qty_per_serving 
                * (1 + COALESCE(ri.wastage_percent, 0) / 100.0) 
                * (COALESCE(bom_uom.conversion_factor, 1) / COALESCE(NULLIF(stock_uom.conversion_factor, 0), 1))
                * COALESCE(ic.period_cost, 0)
            ) AS total_cost
        FROM public.recipes r
        JOIN public.recipe_items ri ON ri.recipe_id = r.id
        JOIN item_costs ic ON ic.item_id = ri.item_id
        JOIN public.items i ON i.id = ri.item_id
        LEFT JOIN public.uom bom_uom ON bom_uom.id = ri.uom_id
        LEFT JOIN public.uom stock_uom ON stock_uom.id = i.inventory_uom_id
        WHERE r.company_id = p_company_id
        GROUP BY r.id
    )
    SELECT 
        r.id AS recipe_id,
        mi.name::text AS menu_item_name,
        c.name::text AS category_name,
        k.name::text AS kitchen_name,
        COALESCE(mi.base_price, 0) AS real_menu_price,
        COALESCE(rc.total_cost, 0) AS real_cost,
        COALESCE(mi.base_price, 0) - COALESCE(rc.total_cost, 0) AS margin,
        CASE 
            WHEN COALESCE(mi.base_price, 0) > 0 
            THEN ((COALESCE(mi.base_price, 0) - COALESCE(rc.total_cost, 0)) / mi.base_price) * 100.0
            ELSE 0 
        END AS margin_pct
    FROM public.recipes r
    JOIN public.menu_items mi ON mi.id = r.menu_item_id
    LEFT JOIN public.categories c ON c.id = mi.category_id
    LEFT JOIN public.kitchens k ON k.id = mi.kitchen_id
    LEFT JOIN recipe_costs rc ON rc.recipe_id = r.id
    WHERE r.company_id = p_company_id;
END;
$$;
