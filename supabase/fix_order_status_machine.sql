-- ═══════════════════════════════════════════════════════════════════════════════
-- ORDER STATUS TRANSITION GUARD
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-014 (DBauditor 2026-07-17)
--
-- PROBLEM:
--   The orders table has a CHECK constraint for valid status VALUES but no trigger
--   enforcing valid TRANSITIONS. A paid order can be moved back to pending, a
--   cancelled order can skip to invoiced, etc. This corrupts the KOT lifecycle.
--
-- SOLUTION:
--   BEFORE UPDATE trigger that validates the old → new status transition.
--   Invalid transitions raise an exception (transaction rolled back).
--
-- VALID TRANSITIONS:
--   pending_waiter → accepted | cancelled
--   pending        → accepted | cancelled
--   accepted       → preparing | ready | cancelled
--   preparing      → ready | cancelled
--   ready          → served | invoiced | paid | cancelled
--   served         → invoiced | paid | cancelled          ← paid allowed (Quick Pay skips invoiced)
--   invoiced       → paid | served | cancelled
--   paid           → served | refunded                     ← served allowed (Quick Pay skips served; must still be servable after payment)
--   cancelled      → pending_waiter | pending  (admin un-cancel only — checked via is_admin())
--   refunded       → (terminal — no further transitions)
--
-- NOTE: The KOT system transitions orders from pending_waiter → accepted via
--       accept_order_as_waiter (SECURITY DEFINER) which bypasses RLS but NOT
--       triggers. This trigger will fire on every status change including RPC calls.
--       Verify the transition list matches the RPC logic before applying.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No-op if status is not changing
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Validate transition
  IF NOT (
    (OLD.status = 'pending_waiter' AND NEW.status IN ('accepted', 'cancelled'))                OR
    (OLD.status = 'pending'        AND NEW.status IN ('accepted', 'cancelled'))                OR
    (OLD.status = 'accepted'       AND NEW.status IN ('preparing', 'ready', 'cancelled'))      OR
    (OLD.status = 'preparing'      AND NEW.status IN ('ready', 'cancelled'))                   OR
    (OLD.status = 'ready'          AND NEW.status IN ('served', 'invoiced', 'paid', 'cancelled'))  OR
    (OLD.status = 'served'         AND NEW.status IN ('invoiced', 'paid', 'cancelled'))         OR
    (OLD.status = 'invoiced'       AND NEW.status IN ('paid', 'served', 'cancelled'))          OR
    (OLD.status = 'paid'           AND NEW.status IN ('served', 'refunded'))                   OR
    -- Admin can un-cancel
    (OLD.status = 'cancelled'      AND NEW.status IN ('pending_waiter', 'pending') AND public.is_admin())
  ) THEN
    RAISE EXCEPTION
      'Invalid order status transition: % → % (order_id: %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists (safe re-apply)
DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;

CREATE TRIGGER trg_validate_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

GRANT EXECUTE ON FUNCTION public.validate_order_status_transition() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- Run after applying to test a rejected transition:
--
-- UPDATE orders SET status = 'pending_waiter' WHERE status = 'paid' LIMIT 1;
-- Expected: ERROR: Invalid order status transition: paid → pending_waiter
-- ─────────────────────────────────────────────────────────────────────────────
