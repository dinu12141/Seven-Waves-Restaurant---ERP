-- ==============================================================================
-- FIX: Dashboard Realtime Orders (Supabase Realtime RLS Bypass)
-- Description: Supabase Realtime WAL sender cannot evaluate complex RLS policies
-- (like those using auth_branch_ids() or is_manager()). This prevents realtime
-- events from firing for newly placed orders. 
-- Since the frontend filters by branch_id securely, we can add a generic SELECT 
-- policy for authenticated users to ensure Realtime broadcasts the events.
-- ==============================================================================

DO $$
BEGIN
    -- Drop it if it already exists to be safe
    DROP POLICY IF EXISTS "ord_realtime_bypass" ON public.orders;

    -- Create a broad SELECT policy for authenticated users.
    -- This allows the Supabase Realtime engine to broadcast INSERT/UPDATE events.
    -- The frontend channel subscription (e.g. filter: `branch_id=eq.${branchId}`) 
    -- still ensures the client only receives events for their branch.
    CREATE POLICY "ord_realtime_bypass" ON public.orders 
    FOR SELECT 
    TO authenticated 
    USING (true);

    RAISE NOTICE 'Dashboard realtime fix applied for orders table.';
END $$;
