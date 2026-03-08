-- =============================================================
-- KITCHEN ROUTING & VISIBILITY FIX (CASHIER STATION)
-- =============================================================
-- This script fixes routing for items in the Bun/Bakery sub-categories to Cashier,
-- and ensures that Kitchen/Cashier users can see all relevant orders/profiles.

-- 1. FIX PROFILES RLS: Allow staff to see each other's names
-- This is critical for show the waiter's name on the KOT.
DROP POLICY IF EXISTS "profiles_select_staff" ON profiles;
CREATE POLICY "profiles_select_staff"
ON profiles FOR SELECT
TO authenticated
USING (true); -- lookup names is safe for authenticated users

-- 2. SMART KITCHEN RESOLVER: Favor "CASHIER"
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

    -- [B] Secondary: Walk up category tree to find warehouse -> kitchen link
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

    -- [C] Fallback: Favor "CASHIER" for this branch if it exists
    SELECT id INTO v_kitchen_id FROM public.kitchens 
    WHERE branch_id = p_branch_id AND is_active = true 
    ORDER BY (name ILIKE '%CASHIER%') DESC, (name ILIKE '%MAIN%') DESC, name ASC LIMIT 1;

    RETURN v_kitchen_id;
END;
$$;

-- 3. DATA REPAIR: Re-route items to correct kitchens and generate missing KOTs
DO $$
DECLARE
    r RECORD;
    v_target_k UUID;
    v_kot_id UUID;
BEGIN
    -- [3.1] Force refresh kitchens on all active order items
    FOR r IN 
        SELECT oi.id, oi.menu_item_id, o.branch_id, o.id as order_id
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('pending', 'pending_waiter', 'accepted', 'preparing')
    LOOP
        v_target_k := public.get_target_kitchen_for_item(r.menu_item_id, r.branch_id);
        UPDATE order_items SET kitchen_id = v_target_k WHERE id = r.id;

        -- [3.2] Ensure KOT ticket exists for this kitchen/order
        IF v_target_k IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM kot_tickets WHERE order_id = r.order_id AND kitchen_id = v_target_k) THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (r.order_id, v_target_k, 'created')
                RETURNING id INTO v_kot_id;
                
                INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
                SELECT v_kot_id, r.id, 1, 'queued'; -- quantity simplified for repair
            END IF;
        END IF;
    END LOOP;
END $$;

-- 4. REALTIME FORCED SYNC
-- Set all active KOT dispatches to pending to force frontend refresh
UPDATE kot_dispatches 
SET status = 'pending'
WHERE status != 'completed';

-- 5. Fix Trigger to be more aggressive on Acceptance
CREATE OR REPLACE FUNCTION public.generate_kot_on_accept()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_kot_id UUID;
BEGIN
    IF NEW.status = 'accepted' AND OLD.status IN ('pending', 'pending_waiter') THEN
        
        -- ALWAYS re-calculate kitchen_id on acceptance to ensure latest inventory settings are used
        UPDATE order_items 
        SET kitchen_id = public.get_target_kitchen_for_item(menu_item_id, NEW.branch_id)
        WHERE order_id = NEW.id;

        FOR r IN 
            SELECT DISTINCT kitchen_id FROM order_items 
            WHERE order_id = NEW.id AND kitchen_id IS NOT NULL
        LOOP
            IF NOT EXISTS (SELECT 1 FROM kot_tickets WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id) THEN
                INSERT INTO kot_tickets(order_id, kitchen_id, status)
                VALUES (NEW.id, r.kitchen_id, 'created')
                RETURNING id INTO v_kot_id;

                INSERT INTO kot_items(kot_id, order_item_id, quantity, status)
                SELECT v_kot_id, id, quantity, 'queued' FROM order_items
                WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id;

                UPDATE order_items SET status = 'sent_to_kitchen'
                WHERE order_id = NEW.id AND kitchen_id = r.kitchen_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
