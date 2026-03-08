-- =============================================================
-- KITCHEN ROUTING REPAIR & DISPATCH FIX
-- =============================================================
-- This script:
-- 1. Updates get_target_kitchen_for_item to be more robust.
-- 2. Force-refreshes all active order_items to their correct kitchens.
-- 3. Ensures KOTs exist for all accepted orders.

-- 1. Improve Kitchen Resolver to be smarter about Branch Defaults
CREATE OR REPLACE FUNCTION public.get_target_kitchen_for_item(p_menu_item_id UUID, p_branch_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_kitchen_id   UUID;
    v_category_id  UUID;
    v_warehouse_id UUID;
    v_current_cat  UUID;
BEGIN
    -- [A] Primary: Check direct kitchen_id on menu_item
    SELECT kitchen_id, category_id INTO v_kitchen_id, v_category_id
    FROM public.menu_items
    WHERE id = p_menu_item_id;

    IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;

    -- [B] Secondary: Walk up category hierarchy to find warehouse -> kitchen link
    v_current_cat := v_category_id;
    WHILE v_current_cat IS NOT NULL LOOP
        SELECT warehouse_id, parent_id INTO v_warehouse_id, v_current_cat
        FROM public.categories
        WHERE id = v_current_cat;

        IF v_warehouse_id IS NOT NULL THEN
            SELECT kitchen_id INTO v_kitchen_id FROM public.warehouses WHERE id = v_warehouse_id;
            IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;
        END IF;
    END LOOP;

    -- [C] Fallback: Smart Branch Default
    -- Favor "CASHIER" if available, then "MAIN", then alphabetical
    SELECT id INTO v_kitchen_id FROM public.kitchens 
    WHERE branch_id = p_branch_id AND is_active = true 
    ORDER BY 
        (name ILIKE '%CASHIER%') DESC, 
        (name ILIKE '%MAIN%') DESC, 
        name ASC 
    LIMIT 1;

    RETURN v_kitchen_id;
END;
$$;

-- 2. RE-ROUTE ALL ACTIVE ORDER ITEMS
-- This fixes items that might be stuck in the wrong kitchen due to old inventory settings
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Update all items in orders that are not yet served/cancelled
    FOR r IN 
        SELECT oi.id, oi.menu_item_id, o.branch_id 
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('pending', 'pending_waiter', 'accepted', 'preparing')
    LOOP
        UPDATE order_items 
        SET kitchen_id = public.get_target_kitchen_for_item(r.menu_item_id, r.branch_id)
        WHERE id = r.id;
    END LOOP;
END $$;

-- 3. RE-GENERATE KOTS FOR ACCEPTED ORDERS
-- This ensures that if items moved kitchens, new KOTs are created
DO $$
DECLARE
    v_ord RECORD;
    v_item RECORD;
    v_kot_id UUID;
BEGIN
    FOR v_ord IN SELECT * FROM orders WHERE status IN ('accepted', 'preparing', 'ready') LOOP
        
        -- Create missing KOTs for any kitchen that has items but no ticket
        FOR v_item IN 
            SELECT DISTINCT kitchen_id 
            FROM order_items 
            WHERE order_id = v_ord.id AND kitchen_id IS NOT NULL
        LOOP
            IF NOT EXISTS (SELECT 1 FROM kot_tickets WHERE order_id = v_ord.id AND kitchen_id = v_item.kitchen_id) THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (v_ord.id, v_item.kitchen_id, 'created')
                RETURNING id INTO v_kot_id;
                
                -- Link items to this new KOT
                UPDATE kot_items SET kot_id = v_kot_id WHERE order_item_id IN (
                    SELECT id FROM order_items WHERE order_id = v_ord.id AND kitchen_id = v_item.kitchen_id
                );
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 4. ENSURE REALTIME DISPATCH IS TRIGGERED
-- Any 'accepted' order should have its dispatches forced to 'pending' to trigger KDS refresh
INSERT INTO kot_dispatches (order_id, kot_id, target_code, status)
SELECT order_id, id, 'KITCHEN', 'pending'
FROM kot_tickets
WHERE status IN ('created', 'preparing')
ON CONFLICT (kot_id, target_code) DO UPDATE SET status = 'pending', updated_at = now();
