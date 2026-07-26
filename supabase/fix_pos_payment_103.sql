-- ═══════════════════════════════════════════════════════════════════════════
-- URGENT #103 — Fix POS payments (create-order RPC crash)
-- Seven Waves Restaurant ERP
--
-- SYMPTOM: every POS create/pay fails ("Failed to create order").
--
-- ROOT CAUSE: the client (orderStore.js sendToKitchen/processPayment,
-- POSPage.vue FOC) sends an order payload that includes `delivery_charge`
-- (and `service_charge` / `delivery_source` / `customer_id`). The atomic
-- creator `pos_create_order_with_items` built its INSERT column list from the
-- RAW JSON keys:
--     INSERT INTO public.orders (..., delivery_charge, ...)
--     SELECT              (..., delivery_charge, ...) FROM jsonb_populate_record(...)
-- On any live DB where the POS schema-gap migrations weren't applied, one of
-- those columns doesn't exist → "column \"delivery_charge\" does not exist" →
-- the whole INSERT (and therefore EVERY POS order) fails.
--
-- FIX (two layers, both idempotent):
--   1. Ensure the POS order columns actually exist (so values are PERSISTED,
--      not just tolerated) — mirrors fix_pos_order_flow.sql / fix_pos_schema_gaps.sql.
--   2. Redefine pos_create_order_with_items to intersect the payload keys with
--      the LIVE column list, so a stray/unknown key is silently dropped instead
--      of crashing the INSERT (defence-in-depth against future payload drift).
--
-- This file is the single self-contained apply artifact for #103. The same
-- corrected function also lives in p0_enterprise_hardening.sql (kept in sync).
-- Apply, then smoke-test: place a POS order + Quick-Pay (and a delivery order).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Idempotent POS order columns (persist the values the client sends) ───
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS service_charge   NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_charge  NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS delivery_source  TEXT,
    ADD COLUMN IF NOT EXISTS customer_id      UUID,
    ADD COLUMN IF NOT EXISTS payment_method   TEXT DEFAULT 'cash',
    ADD COLUMN IF NOT EXISTS paid_at          TIMESTAMPTZ;

-- ── 2) Resilient atomic creator ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_create_order_with_items(
    p_order jsonb,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order public.orders;
    v_item  jsonb;
    v_cols  text;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with no items';
    END IF;

    -- Insert ONLY the payload keys that are REAL columns of public.orders, so
    -- absent columns keep their DB DEFAULT and any unknown key (payload drift /
    -- un-applied schema-gap migration) is dropped instead of crashing the INSERT.
    SELECT string_agg(quote_ident(k), ', ')
      INTO v_cols
      FROM jsonb_object_keys(p_order) AS k
      WHERE EXISTS (
          SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name   = 'orders'
             AND c.column_name  = k
      );

    IF v_cols IS NULL THEN
        RAISE EXCEPTION 'Order payload has no columns that exist on public.orders';
    END IF;

    EXECUTE format(
        'INSERT INTO public.orders (%1$s) '
        'SELECT %1$s FROM jsonb_populate_record(NULL::public.orders, $1) '
        'RETURNING *',
        v_cols
    ) USING p_order INTO v_order;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.order_items (
            order_id, menu_item_id, variant_id, kitchen_id,
            quantity, unit_price, total_price, notes, status
        )
        VALUES (
            v_order.id,
            (v_item->>'menu_item_id')::uuid,
            NULLIF(v_item->>'variant_id','')::uuid,
            NULLIF(v_item->>'kitchen_id','')::uuid,
            COALESCE((v_item->>'quantity')::int, 1),
            COALESCE((v_item->>'unit_price')::numeric, 0),
            COALESCE((v_item->>'total_price')::numeric, 0),
            NULLIF(v_item->>'notes',''),
            COALESCE(NULLIF(v_item->>'status',''), 'queued')
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order', jsonb_build_object(
            'id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_create_order_with_items(jsonb, jsonb) IS
  'P0 #48/#49 + #103 — atomic order + order_items insert; column list intersected '
  'with live public.orders columns so stray payload keys never crash order creation.';

-- ── 3) Smoke-test (run manually as an authenticated cashier/manager) ────────
-- SELECT public.pos_create_order_with_items(
--   jsonb_build_object('branch_id', '<branch-uuid>', 'order_type','takeaway',
--                      'status','pending_waiter','total_amount',100,
--                      'delivery_charge',0,'service_charge',0),
--   jsonb_build_array(jsonb_build_object('menu_item_id','<item-uuid>',
--                      'quantity',1,'unit_price',100,'total_price',100)));
-- Expect: {"success": true, "order": {...}}
