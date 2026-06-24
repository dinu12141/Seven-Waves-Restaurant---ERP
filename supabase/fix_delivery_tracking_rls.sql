-- ═══════════════════════════════════════════════════════════════════
-- SECURITY FIX: delivery_tracking — Overly Permissive INSERT Policy
-- ═══════════════════════════════════════════════════════════════════
--
-- VULNERABILITY FOUND in phase1_offline_sync.sql (line 440):
--
--   CREATE POLICY dt_ins ON delivery_tracking
--     FOR INSERT WITH CHECK (true);
--
-- WITH CHECK (true) allows ANY authenticated user to insert tracking
-- rows for ANY delivery order, including orders they were never
-- assigned to. An attacker could forge GPS coordinates for other
-- riders' deliveries, pollute tracking history, or trigger fake
-- delivery-completion events.
--
-- FIX: Replace WITH CHECK (true) with a subquery that confirms
-- the inserting user is the rider assigned to the delivery_order
-- referenced by the new tracking row. The pattern mirrors the
-- existing do_rider SELECT policy which joins through the riders
-- table using profile_id = auth.uid().
--
-- The dt_admin policy (FOR ALL, admin/manager) remains unchanged
-- and covers admin-side inserts.
--
-- Apply AFTER phase1_offline_sync.sql.
-- ═══════════════════════════════════════════════════════════════════

-- Drop the insecure blanket INSERT policy
DROP POLICY IF EXISTS dt_ins ON public.delivery_tracking;

-- Replace with a rider-scoped INSERT policy
-- A rider may only insert tracking rows for delivery_orders where
-- they are the assigned rider (confirmed via the riders table).
CREATE POLICY dt_rider_ins ON public.delivery_tracking
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.delivery_orders do_
            JOIN public.riders r ON r.id = do_.rider_id
            WHERE do_.id  = delivery_tracking.delivery_id
              AND r.profile_id = auth.uid()
        )
    );
