-- =====================================================================
-- Migration: 20260803_menu_items_inventory_rls.sql
-- Purpose:
--   Allow users with the 'inventory' role to manage menu items (specifically, 
--   to update menu item prices and availability from the inventory module).
-- =====================================================================

DO $$
BEGIN
    -- Drop existing restrictive policies on menu_items
    DROP POLICY IF EXISTS menu_items_manage_admin_manager ON public.menu_items;
    DROP POLICY IF EXISTS mi_admin ON public.menu_items;
    DROP POLICY IF EXISTS menu_items_manage_all ON public.menu_items;

    -- Create new policy allowing admin, manager, and inventory roles
    CREATE POLICY menu_items_manage_all ON public.menu_items
    FOR ALL
    USING (
        is_admin() OR is_manager() OR is_inventory()
    )
    WITH CHECK (
        is_admin() OR is_manager() OR is_inventory()
    );
    -- Drop existing restrictive policies on item_variants
    DROP POLICY IF EXISTS iv_admin ON public.item_variants;
    DROP POLICY IF EXISTS iv_manage_all ON public.item_variants;

    -- Create new policy allowing admin, manager, and inventory roles for item_variants
    CREATE POLICY iv_manage_all ON public.item_variants
    FOR ALL
    USING (
        is_admin() OR is_manager() OR is_inventory()
    )
    WITH CHECK (
        is_admin() OR is_manager() OR is_inventory()
    );
END $$;
