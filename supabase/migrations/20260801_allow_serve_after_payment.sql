-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Allow marking an order "served" after it has already been paid
--
-- PROBLEM:
--   Quick Pay (pos_quick_pay) intentionally jumps orders.status straight from
--   ready/accepted/preparing to 'paid', skipping 'served' (see fix_pos_order_flow.sql
--   / pos_quick_pay.sql comments — "Quick Pay skips invoiced"). But the transition
--   guard trigger (fix_order_status_machine.sql) only allows paid -> refunded, so
--   once an order is paid there is NO valid transition to 'served'. Combined with
--   the waiter app's "Mark as Served" button only appearing when status = 'ready',
--   waiters are permanently unable to mark a paid order as served.
--
--   NOTE: The primary RPC the client calls is process_waiter_mark_served, which
--   only exists live in the DB (not versioned in this repo) — it is NOT modified
--   here since its full implementation (loyalty points, KOT/item status updates,
--   cashier notifications) can't be safely guessed. Whatever status update it
--   performs internally is still gated by the trigger below, so fixing the
--   trigger unblocks it regardless of its internal logic. mark_order_served
--   (fix_rpc_aliases.sql) — a simpler fallback wrapper that IS versioned here —
--   is also patched for the same reason, in case it's used as a fallback anywhere.
--
-- FIX:
--   Add paid -> served and invoiced -> served to the valid transition table.
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
    (OLD.status = 'invoiced'       AND NEW.status IN ('paid', 'served', 'cancelled'))           OR
    (OLD.status = 'paid'           AND NEW.status IN ('served', 'refunded'))                    OR
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

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;

CREATE TRIGGER trg_validate_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

GRANT EXECUTE ON FUNCTION public.validate_order_status_transition() TO authenticated;

-- ── mark_order_served: widen its own status allow-list to match ─────────────
CREATE OR REPLACE FUNCTION public.mark_order_served(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order   RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
    END IF;

    IF NOT (auth_has_role('waiter') OR auth_has_role('admin') OR auth_has_role('manager')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient role.');
    END IF;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    -- Idempotent
    IF v_order.status = 'served' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already served.');
    END IF;

    IF v_order.status NOT IN ('ready', 'accepted', 'preparing', 'paid', 'invoiced') THEN
        RETURN jsonb_build_object('success', false, 'error',
            'Order cannot be marked served. Status: ' || v_order.status);
    END IF;

    UPDATE orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;

    -- Event log
    PERFORM log_erp_event(
        'order_served', 'order', p_order_id, v_user_id, 'waiter', v_order.branch_id,
        jsonb_build_object('waiter_id', v_user_id, 'order_number', v_order.order_number)
    );

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'status', 'served');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_order_served(UUID) TO authenticated;
COMMENT ON FUNCTION public.mark_order_served IS
  'Marks an order as served by the assigned waiter. Allowed from ready/accepted/preparing/paid/invoiced.';
