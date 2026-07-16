-- Fix KOT Visibility for Cashier
-- This migration ensures that cashiers can see orders as soon as they are accepted by a waiter.

-- 1. Update orders policy for cashier select
DROP POLICY IF EXISTS ord_cashier_select ON orders;
CREATE POLICY ord_cashier_select ON orders
    FOR SELECT
    TO public
    USING (
        auth_has_role('cashier'::text) AND 
        branch_id = ANY (auth_branch_ids()) AND 
        status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'invoiced'::text])
    );

-- 2. Update orders policy for cashier update
DROP POLICY IF EXISTS ord_cashier_update ON orders;
CREATE POLICY ord_cashier_update ON orders
    FOR UPDATE
    TO public
    USING (
        auth_has_role('cashier'::text) AND 
        branch_id = ANY (auth_branch_ids()) AND 
        status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'invoiced'::text])
    )
    WITH CHECK (
        auth_has_role('cashier'::text) AND 
        branch_id = ANY (auth_branch_ids())
    );

-- 3. Update order_items policy for cashier select
DROP POLICY IF EXISTS oi_cashier_select ON order_items;
CREATE POLICY oi_cashier_select ON order_items
    FOR SELECT
    TO public
    USING (
        auth_has_role('cashier'::text) AND 
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id 
              AND o.branch_id = ANY (auth_branch_ids())
              AND o.status = ANY (ARRAY['accepted'::text, 'preparing'::text, 'ready'::text, 'served'::text, 'invoiced'::text])
        )
    );

-- 4. Add kot_tickets policy for cashier select
DROP POLICY IF EXISTS kot_cashier_select ON kot_tickets;
CREATE POLICY kot_cashier_select ON kot_tickets
    FOR SELECT
    TO authenticated
    USING (
        auth_has_role('cashier'::text) AND
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = kot_tickets.order_id
              AND o.branch_id = ANY (auth_branch_ids())
        )
    );

-- 5. Track changes in order_items for realtime? (Usually handled by RDS)
-- No changes needed to triggers, just the RLS policies.
