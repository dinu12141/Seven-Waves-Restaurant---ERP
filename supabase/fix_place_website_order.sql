-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: Website Orders Not Reaching Supabase DB & ERP (Fixes PGRST203)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this script ONCE in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs/sql
--
-- Why this is needed:
-- 1. In the database, place_website_order was created multiple times with
--    different signatures (json vs jsonb), causing PostgREST error PGRST203.
-- 2. Because of that error, all orders placed on the website failed to insert
--    into the `orders` table, so the ERP's Website Orders page showed 0 orders.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. DROP all duplicate / overloaded signatures ─────────────────────────────
DROP FUNCTION IF EXISTS public.place_website_order(uuid, uuid, text, text, text, text, text, numeric, uuid, text, text, json);
DROP FUNCTION IF EXISTS public.place_website_order(uuid, uuid, text, text, text, text, text, jsonb, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.place_website_order(uuid, uuid, text, text, text, text, text, jsonb, numeric, uuid, text, text);
DROP FUNCTION IF EXISTS public.place_website_order(uuid, uuid, text, text, text, text, text, numeric, uuid, text, text, jsonb);

-- ── 2. CREATE the definitive, clean function ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_website_order(
  p_company_id        uuid,
  p_branch_id         uuid,
  p_order_type        text,
  p_customer_name     text,
  p_customer_phone    text,
  p_delivery_address  text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_delivery_charge   numeric DEFAULT 0,
  p_customer_id       uuid DEFAULT NULL,
  p_payment_method    text DEFAULT 'cod',
  p_payment_status    text DEFAULT 'unpaid',
  p_items             jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id        uuid;
  v_order_number    integer;
  v_item            jsonb;
  v_menu_item_id    uuid;
  v_variant_id      uuid;
  v_quantity        integer;
  v_unit_price      numeric;
  v_subtotal        numeric := 0;
  v_total           numeric := 0;
  v_delivery_charge numeric := 0;
  v_customer_id     uuid;
  v_status          text;
BEGIN
  -- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cannot place an order with no items';
  END IF;

  v_delivery_charge := GREATEST(COALESCE(p_delivery_charge, 0), 0);

  -- Associate customer_id if user is logged in
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
  ELSE
    v_customer_id := NULL;
  END IF;

  -- ── Calculate prices & subtotal ─────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_variant_id   := NULLIF(v_item->>'variant_id', '')::uuid;
    v_quantity     := COALESCE((v_item->>'quantity')::integer, 1);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for menu item %', v_menu_item_id;
    END IF;

    -- Resolve unit price: first try variant, then base item, then payload fallback
    IF v_variant_id IS NOT NULL THEN
      SELECT iv.price INTO v_unit_price
      FROM item_variants iv
      WHERE iv.id = v_variant_id AND iv.menu_item_id = v_menu_item_id;
      
      IF v_unit_price IS NULL THEN
        SELECT base_price INTO v_unit_price FROM menu_items WHERE id = v_menu_item_id;
      END IF;
    ELSE
      SELECT base_price INTO v_unit_price
      FROM menu_items
      WHERE id = v_menu_item_id;
    END IF;

    IF v_unit_price IS NULL AND (v_item->>'unit_price') IS NOT NULL THEN
      v_unit_price := (v_item->>'unit_price')::numeric;
    END IF;

    IF v_unit_price IS NULL THEN
      v_unit_price := 0;
    END IF;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  END LOOP;

  v_total := v_subtotal + v_delivery_charge;

  -- ERP pending status: 'pending_waiter' so Cashier / Waiter see it as Pending
  v_status := 'pending_waiter';

  -- Order Number generation (per company lock)
  PERFORM pg_advisory_xact_lock(hashtext('place_website_order:' || p_company_id::text));
  SELECT COALESCE(MAX(order_number), 0) + 1 INTO v_order_number
  FROM orders
  WHERE company_id = p_company_id;

  -- Insert order
  INSERT INTO orders (
    company_id,
    branch_id,
    order_type,
    order_source,
    customer_name,
    customer_phone,
    delivery_address,
    notes,
    delivery_charge,
    subtotal,
    total_amount,
    customer_id,
    payment_method,
    payment_status,
    status,
    order_number
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_order_type,
    'website',
    p_customer_name,
    p_customer_phone,
    p_delivery_address,
    p_notes,
    v_delivery_charge,
    v_subtotal,
    v_total,
    v_customer_id,
    COALESCE(p_payment_method, 'cod'),
    COALESCE(p_payment_status, 'unpaid'),
    v_status,
    v_order_number
  )
  RETURNING id INTO v_order_id;

  -- Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_variant_id   := NULLIF(v_item->>'variant_id', '')::uuid;
    v_quantity     := COALESCE((v_item->>'quantity')::integer, 1);

    IF v_variant_id IS NOT NULL THEN
      SELECT iv.price INTO v_unit_price
      FROM item_variants iv
      WHERE iv.id = v_variant_id AND iv.menu_item_id = v_menu_item_id;
      
      IF v_unit_price IS NULL THEN
        SELECT base_price INTO v_unit_price FROM menu_items WHERE id = v_menu_item_id;
      END IF;
    ELSE
      SELECT base_price INTO v_unit_price
      FROM menu_items
      WHERE id = v_menu_item_id;
    END IF;

    IF v_unit_price IS NULL AND (v_item->>'unit_price') IS NOT NULL THEN
      v_unit_price := (v_item->>'unit_price')::numeric;
    END IF;

    IF v_unit_price IS NULL THEN
      v_unit_price := 0;
    END IF;

    INSERT INTO order_items (
      order_id,
      menu_item_id,
      variant_id,
      quantity,
      unit_price,
      total_price,
      notes,
      status
    ) VALUES (
      v_order_id,
      v_menu_item_id,
      v_variant_id,
      v_quantity,
      v_unit_price,
      v_unit_price * v_quantity,
      v_item->>'notes',
      'queued'
    );
  END LOOP;

  -- If delivery, create delivery assignment for riders
  IF p_order_type = 'delivery' THEN
    INSERT INTO delivery_assignments (
      order_id,
      customer_name,
      delivery_address,
      status,
      created_at
    ) VALUES (
      v_order_id,
      p_customer_name,
      p_delivery_address,
      'pending_rider',
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;

-- ── 3. Grant Permissions ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.place_website_order(uuid, uuid, text, text, text, text, text, numeric, uuid, text, text, jsonb) TO anon, authenticated, service_role;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT '✅ place_website_order successfully unified and granted' AS status;
