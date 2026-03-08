-- =============================================================
-- FINAL PRODUCTION KITCHEN FLOW & RLS REPAIR
-- =============================================================
-- This script fixes critical RLS bugs in kot_tickets and ensures
-- that Cashier/Kitchen users can see orders.

-- 1. FIX kot_tickets RLS (Remove non-existent branch_id column reference)
DROP POLICY IF EXISTS kot_admin ON kot_tickets;
CREATE POLICY kot_admin ON kot_tickets FOR ALL
TO authenticated
USING (
    is_admin() OR 
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = kot_tickets.order_id
          AND o.branch_id = ANY(auth_branch_ids())
    )
);

-- 2. FIX kot_items RLS (Ensure staff can see kots in their branch)
DROP POLICY IF EXISTS ki_staff_select ON kot_items;
CREATE POLICY ki_staff_select ON kot_items FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM kot_tickets kt
        JOIN orders o ON o.id = kt.order_id
        WHERE kt.id = kot_items.kot_id
          AND o.branch_id = ANY(auth_branch_ids())
    )
);

-- 3. ENSURE ALL STAFF CAN SEE PROFILES (Waiter names)
DROP POLICY IF EXISTS "profiles_lookup" ON profiles;
CREATE POLICY "profiles_lookup" ON profiles FOR SELECT
TO authenticated
USING (true);

-- 4. SMART KITCHEN DISPATCHER (Favor CASHIER)
CREATE OR REPLACE FUNCTION public.get_target_kitchen_for_item(p_menu_item_id UUID, p_branch_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_kitchen_id   UUID;
    v_category_id  UUID;
BEGIN
    -- [A] Primary: Check direct kitchen_id on menu_item
    SELECT kitchen_id, category_id INTO v_kitchen_id, v_category_id
    FROM public.menu_items
    WHERE id = p_menu_item_id;

    IF v_kitchen_id IS NOT NULL THEN RETURN v_kitchen_id; END IF;

    -- [B] Fallback: Favor "CASHIER" for this branch if it exists, then "MAIN"
    SELECT id INTO v_kitchen_id FROM public.kitchens 
    WHERE branch_id = p_branch_id AND is_active = true 
    ORDER BY (name ILIKE '%CASHIER%') DESC, (name ILIKE '%MAIN%') DESC, name ASC LIMIT 1;

    RETURN v_kitchen_id;
END;
$$;

-- 5. REPAIR: Force update all Accepted orders to generate KOTs if missing
DO $$
DECLARE
    v_ord RECORD;
    v_kot_id UUID;
BEGIN
    FOR v_ord IN SELECT * FROM orders WHERE status IN ('accepted', 'preparing', 'ready') LOOP
        -- Trigger manual re-generation by "touching" the order status
        UPDATE orders SET status = status WHERE id = v_ord.id;
        
        -- Force dispatch signal for realtime
        INSERT INTO kot_dispatches (order_id, kot_id, target_code, status)
        SELECT order_id, id, 'KITCHEN', 'pending'
        FROM kot_tickets
        WHERE order_id = v_ord.id
        ON CONFLICT (kot_id, target_code) DO UPDATE SET status = 'pending';
    END LOOP;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
