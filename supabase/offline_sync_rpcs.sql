-- =====================================================
-- OFFLINE SYNC RPCs
-- Seven Waves Restaurant ERP — Phase 0 Fix P0-6
--
-- These RPCs are called by OfflineSyncEngine when
-- syncing queued offline operations back to the DB.
-- Route: offline_sync_{module}_{action}(payload JSONB)
-- =====================================================

-- ── POS: Create Order ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_sync_pos_create_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_idempotency_key TEXT;
  v_existing_id UUID;
BEGIN
  -- Idempotency: check if this order was already synced
  v_idempotency_key := payload->>'idempotency_key';
  IF v_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM orders
    WHERE idempotency_key = v_idempotency_key
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_synced', 'order_id', v_existing_id);
    END IF;
  END IF;

  -- Insert the order
  INSERT INTO orders (
    id,
    branch_id,
    company_id,
    order_type,
    status,
    table_id,
    assigned_waiter_id,
    customer_id,
    notes,
    discount_amount,
    discount_type,
    service_charge,
    tax_amount,
    subtotal,
    total_amount,
    idempotency_key,
    created_at
  )
  VALUES (
    COALESCE((payload->>'id')::UUID, gen_random_uuid()),
    (payload->>'branch_id')::UUID,
    (payload->>'company_id')::UUID,
    COALESCE(payload->>'order_type', 'dine_in'),
    'pending_waiter',
    (payload->>'table_id')::UUID,
    NULL,  -- always NULL from POS; goes to waiter inbox
    (payload->>'customer_id')::UUID,
    payload->>'notes',
    COALESCE((payload->>'discount_amount')::NUMERIC, 0),
    payload->>'discount_type',
    COALESCE((payload->>'service_charge')::NUMERIC, 0),
    COALESCE((payload->>'tax_amount')::NUMERIC, 0),
    COALESCE((payload->>'subtotal')::NUMERIC, 0),
    COALESCE((payload->>'total_amount')::NUMERIC, 0),
    v_idempotency_key,
    COALESCE((payload->>'created_at')::TIMESTAMPTZ, now())
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  IF payload->'items' IS NOT NULL THEN
    INSERT INTO order_items (
      id,
      order_id,
      menu_item_id,
      quantity,
      unit_price,
      total_price,
      notes,
      modifiers
    )
    SELECT
      COALESCE((item->>'id')::UUID, gen_random_uuid()),
      v_order_id,
      (item->>'menu_item_id')::UUID,
      (item->>'quantity')::INTEGER,
      (item->>'unit_price')::NUMERIC,
      (item->>'total_price')::NUMERIC,
      item->>'notes',
      item->'modifiers'
    FROM jsonb_array_elements(payload->'items') AS item;
  END IF;

  RETURN jsonb_build_object('status', 'created', 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.offline_sync_pos_create_order(JSONB)
  IS 'Offline sync: create a POS order from queued payload. Idempotency key prevents duplicates.';


-- ── Waiter: Accept Order ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_sync_waiter_accept_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_unavailable_ids UUID[];
  v_result JSONB;
BEGIN
  v_order_id := (payload->>'order_id')::UUID;

  -- Parse unavailable item IDs if provided
  IF payload->'unavailable_ids' IS NOT NULL THEN
    SELECT array_agg(item::UUID)
    INTO v_unavailable_ids
    FROM jsonb_array_elements_text(payload->'unavailable_ids') AS item;
  END IF;

  -- Check the order is still in a state we can accept
  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE id = v_order_id
    AND status = 'pending_waiter'
    AND assigned_waiter_id IS NULL
  ) THEN
    -- Already accepted or voided — treat as success (idempotent)
    RETURN jsonb_build_object('status', 'already_accepted', 'order_id', v_order_id);
  END IF;

  -- Delegate to the existing accept RPC
  SELECT accept_order_as_waiter(v_order_id, v_unavailable_ids) INTO v_result;

  RETURN jsonb_build_object('status', 'accepted', 'order_id', v_order_id, 'result', v_result);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.offline_sync_waiter_accept_order(JSONB)
  IS 'Offline sync: accept an order as the current waiter. Idempotent — safe to retry.';


-- ── POS: Void Order ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_sync_pos_void_order(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_reason TEXT;
BEGIN
  v_order_id := (payload->>'order_id')::UUID;
  v_reason   := COALESCE(payload->>'reason', 'Voided offline');

  -- Check order exists and is voidable
  IF NOT EXISTS (
    SELECT 1 FROM orders
    WHERE id = v_order_id
    AND status NOT IN ('paid', 'voided', 'cancelled')
  ) THEN
    RETURN jsonb_build_object('status', 'not_voidable', 'order_id', v_order_id);
  END IF;

  UPDATE orders
  SET
    status = 'voided',
    void_reason = v_reason,
    voided_at = now(),
    voided_by = auth.uid()
  WHERE id = v_order_id;

  -- Write audit log
  INSERT INTO audit_logs (
    table_name, record_id, action, old_data, new_data, performed_by
  ) VALUES (
    'orders', v_order_id, 'VOID',
    jsonb_build_object('status', 'pre_void'),
    jsonb_build_object('status', 'voided', 'reason', v_reason),
    auth.uid()
  );

  RETURN jsonb_build_object('status', 'voided', 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.offline_sync_pos_void_order(JSONB)
  IS 'Offline sync: void an order that was queued for voiding while offline.';


-- ── Kitchen: Update Item Status ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_sync_kitchen_update_item(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kot_item_id UUID;
  v_status TEXT;
BEGIN
  v_kot_item_id := (payload->>'kot_item_id')::UUID;
  v_status      := payload->>'status';  -- 'ready', 'bumped', etc.

  UPDATE kot_items
  SET
    status = v_status,
    updated_at = now()
  WHERE id = v_kot_item_id;

  RETURN jsonb_build_object('status', 'updated', 'kot_item_id', v_kot_item_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.offline_sync_kitchen_update_item(JSONB)
  IS 'Offline sync: update a KOT item status (ready/bumped) that was queued while offline.';


-- ── Delivery: Update Status ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_sync_delivery_update_status(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_status TEXT;
BEGIN
  v_delivery_id := (payload->>'delivery_id')::UUID;
  v_status      := payload->>'status';  -- 'picked_up', 'delivered', 'failed'

  UPDATE delivery_orders
  SET
    status = v_status,
    updated_at = now()
  WHERE id = v_delivery_id;

  RETURN jsonb_build_object('status', 'updated', 'delivery_id', v_delivery_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.offline_sync_delivery_update_status(JSONB)
  IS 'Offline sync: update delivery order status queued while rider was offline.';


-- ── Grant execute to authenticated role ───────────────────────────
GRANT EXECUTE ON FUNCTION public.offline_sync_pos_create_order(JSONB)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.offline_sync_waiter_accept_order(JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.offline_sync_pos_void_order(JSONB)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.offline_sync_kitchen_update_item(JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.offline_sync_delivery_update_status(JSONB) TO authenticated;

-- Register in ledger
INSERT INTO public.applied_migrations (filename, notes)
VALUES ('offline_sync_rpcs.sql', 'Phase 0 P0-6: offline sync RPCs for pos, waiter, kitchen, delivery')
ON CONFLICT (filename) DO NOTHING;
