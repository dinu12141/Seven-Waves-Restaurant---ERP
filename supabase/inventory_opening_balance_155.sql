-- =====================================================
-- Migration 155: Inventory Opening Balance Support
-- =====================================================
-- 1. Add opening_balance column to items table if not exists
-- 2. Update v_stock_on_hand view to include opening_balance
-- =====================================================

-- 1. Add opening_balance column to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.items.opening_balance IS 'Initial / opening stock balance quantity established when item is created';

-- 2. Update v_stock_on_hand view
DROP VIEW IF EXISTS public.v_low_stock_alerts CASCADE;
DROP VIEW IF EXISTS public.v_stock_on_hand CASCADE;

CREATE OR REPLACE VIEW public.v_stock_on_hand AS
SELECT
    soh.company_id,
    soh.warehouse_id,
    w.code AS warehouse_code,
    w.name AS warehouse_name,
    w.warehouse_type,
    w.branch_id,
    soh.item_id,
    i.code AS item_code,
    i.name AS item_name,
    ic.name AS category_name,
    u.code AS uom_code,
    COALESCE(i.opening_balance, 0) AS opening_balance,
    soh.qty_on_hand,
    soh.total_value,
    COALESCE(iws.reorder_level, i.reorder_level, 0) AS reorder_level,
    COALESCE(iws.min_stock, 0) AS min_stock,
    COALESCE(iws.max_stock, 0) AS max_stock,
    CASE
        WHEN soh.qty_on_hand <= 0
            THEN 'out_of_stock'
        WHEN soh.qty_on_hand <= COALESCE(iws.reorder_level, i.reorder_level, 0)
            THEN 'low_stock'
        WHEN COALESCE(iws.max_stock, 0) > 0
             AND soh.qty_on_hand >= iws.max_stock
            THEN 'overstock'
        ELSE 'normal'
    END AS stock_status,
    soh.last_movement_at
FROM public.stock_on_hand soh
JOIN public.warehouses w ON w.id = soh.warehouse_id
JOIN public.items i ON i.id = soh.item_id
LEFT JOIN public.item_categories ic ON ic.id = i.category_id
LEFT JOIN public.uom u ON u.id = i.inventory_uom_id
LEFT JOIN public.item_warehouse_settings iws
    ON iws.item_id = soh.item_id
   AND iws.warehouse_id = soh.warehouse_id;

-- 3. Recreate dependent view v_low_stock_alerts
CREATE OR REPLACE VIEW public.v_low_stock_alerts AS
SELECT * FROM public.v_stock_on_hand
WHERE stock_status IN ('low_stock', 'out_of_stock');

-- 4. Grant permissions
GRANT SELECT ON public.v_stock_on_hand TO authenticated, service_role, anon;
GRANT SELECT ON public.v_low_stock_alerts TO authenticated, service_role;
