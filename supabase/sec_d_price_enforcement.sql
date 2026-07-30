-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-D: Server-side price enforcement for POS order creation
-- ───────────────────────────────────────────────────────────────────────────────
-- FINDING: pos_create_order_with_items trusted the client-supplied unit_price /
-- total_price directly, allowing a cashier to manipulate prices to any value
-- (confirmed revenue fraud vector from the security audit).
--
-- EXISTING DEFENCE: trg_validate_order_item_price fires BEFORE INSERT on
-- order_items and rejects deviations > 10% from menu_items.price /
-- item_variants.price (applied via security_lockdown_apply.sql). However:
--   1. 10% tolerance still allows meaningful under-charging.
--   2. The trigger may not be live on production yet.
--
-- THIS FIX (defence-in-depth, no tolerance): rewrite pos_create_order_with_items
-- so it resolves unit_price SERVER-SIDE from menu_items / item_variants and
-- ignores the client-supplied value entirely. The trigger remains as a backstop.
--
-- Apply: mcp__supabase__execute_sql project_id="clykwuzajtwvwuavmtzs"
-- ═══════════════════════════════════════════════════════════════════════════════

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
    v_order      public.orders;
    v_item       jsonb;
    v_cols       text;
    v_menu_price NUMERIC(10,2);
    v_unit_price NUMERIC(10,2);
    v_quantity   INT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with no items';
    END IF;

    -- Insert ONLY the payload keys that map to real orders columns, dropping
    -- any unknown key (payload drift defence from fix_pos_payment_103.sql).
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
        v_quantity := COALESCE((v_item->>'quantity')::int, 1);

        -- SEC-D: resolve the authoritative price from the DB.
        --   variant_id present → item_variants.price for that specific variant
        --   otherwise          → menu_items.price
        -- The client-supplied unit_price / total_price is intentionally ignored.
        IF (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') <> '' THEN
            SELECT iv.price INTO v_menu_price
              FROM public.item_variants iv
             WHERE iv.id          = (v_item->>'variant_id')::uuid
               AND iv.menu_item_id = (v_item->>'menu_item_id')::uuid
               AND iv.is_active   = true;
        END IF;

        IF v_menu_price IS NULL THEN
            SELECT mi.price INTO v_menu_price
              FROM public.menu_items mi
             WHERE mi.id = (v_item->>'menu_item_id')::uuid;
        END IF;

        -- Fail loudly if the menu item doesn't exist — prevents zero-price ghost items.
        IF v_menu_price IS NULL THEN
            RAISE EXCEPTION 'menu_item_id % not found or has no price',
                COALESCE(v_item->>'menu_item_id', 'NULL');
        END IF;

        v_unit_price := v_menu_price;

        INSERT INTO public.order_items (
            order_id, menu_item_id, variant_id, kitchen_id,
            quantity, unit_price, total_price, notes, status
        )
        VALUES (
            v_order.id,
            (v_item->>'menu_item_id')::uuid,
            NULLIF(v_item->>'variant_id', '')::uuid,
            NULLIF(v_item->>'kitchen_id', '')::uuid,
            v_quantity,
            v_unit_price,
            ROUND(v_quantity * v_unit_price, 2),
            NULLIF(v_item->>'notes', ''),
            COALESCE(NULLIF(v_item->>'status', ''), 'queued')
        );

        -- Reset for the next iteration (no carryover between items).
        v_menu_price := NULL;
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
  'P0 #48/#49 + #103 + SEC-D — atomic order + order_items insert. '
  'Column list intersected with live orders columns (no stray-key crash). '
  'unit_price resolved SERVER-SIDE from menu_items/item_variants; '
  'client-supplied price is ignored to eliminate revenue fraud vector.';
