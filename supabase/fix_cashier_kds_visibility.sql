-- =============================================================
-- FIX: KOT VISIBILITY FOR CASHIER & KITCHEN ROLES
-- =============================================================
-- This fix ensures that both Cashier and Kitchen roles can see 
-- orders and KOTs during the preparation phase (Accepted/Preparing).
-- =============================================================

-- 1. Update ORDER visibility for Cashiers
-- Cashiers need to see orders from the moment they are accepted to track progress.
DROP POLICY IF EXISTS ord_cashier_select ON orders;
CREATE POLICY ord_cashier_select ON orders 
FOR SELECT 
TO authenticated 
USING (
    (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager'))
    AND branch_id = ANY(auth_branch_ids())
    AND status IN ('accepted', 'preparing', 'ready', 'served', 'invoiced', 'paid')
);

-- 2. Update ORDER ITEMS visibility for Cashiers
DROP POLICY IF EXISTS oi_cashier_select ON order_items;
CREATE POLICY oi_cashier_select ON order_items 
FOR SELECT 
TO authenticated 
USING (
    (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager'))
    AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = order_items.order_id
          AND o.branch_id = ANY(auth_branch_ids())
          AND o.status IN ('accepted', 'preparing', 'ready', 'served', 'invoiced', 'paid')
    )
);

-- 3. Add KOT TICKET visibility for Cashiers
DROP POLICY IF EXISTS kot_cashier_select ON kot_tickets;
CREATE POLICY kot_cashier_select ON kot_tickets 
FOR SELECT 
TO authenticated 
USING (
    (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager'))
    AND EXISTS (
        SELECT 1 FROM orders o
        WHERE o.id = kot_tickets.order_id
          AND o.branch_id = ANY(auth_branch_ids())
    )
);

-- 4. Add KOT ITEM visibility for Cashiers
DROP POLICY IF EXISTS ki_cashier_select ON kot_items;
CREATE POLICY ki_cashier_select ON kot_items 
FOR SELECT 
TO authenticated 
USING (
    (auth_has_role('cashier') OR auth_has_role('admin') OR auth_has_role('manager'))
    AND EXISTS (
        SELECT 1 FROM kot_tickets kt
        JOIN orders o ON o.id = kt.order_id
        WHERE kt.id = kot_items.kot_id
          AND o.branch_id = ANY(auth_branch_ids())
    )
);

-- 5. Ensure Kitchen role can also see all orders in their branch
-- (Sometimes they are restricted to only their specific items, which is good for prep 
--  but bad for a master monitor display).
DROP POLICY IF EXISTS ord_kitchen_select ON orders;
CREATE POLICY ord_kitchen_select ON orders 
FOR SELECT 
TO authenticated 
USING (
    auth_has_role('kitchen')
    AND branch_id = ANY(auth_branch_ids())
);

-- 6. Ensure KOTs are 'created' by default and visible
-- (Waiters sometimes create them as 'pending', we want 'created' for the KDS)
UPDATE kot_tickets SET status = 'created' WHERE status = 'pending';

-- 7. Grant permissions
GRANT SELECT ON public.kot_tickets TO authenticated;
GRANT SELECT ON public.kot_items TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
