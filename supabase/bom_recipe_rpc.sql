-- ═══════════════════════════════════════════════════════════════════
-- RECIPE / BOM MANAGER RPC
-- Seven Waves Restaurant ERP
--
-- This function allows creating/updating a recipe and its ingredients 
-- atomically using a single JSON payload.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.save_recipe(
  p_company_id    UUID,
  p_menu_item_id  UUID,
  p_variant_id    UUID DEFAULT NULL,
  p_name          TEXT DEFAULT NULL,
  p_yield_qty     NUMERIC DEFAULT 1,
  p_ingredients   JSONB DEFAULT '[]'::jsonb  
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id  UUID;
  v_ing        JSONB;
  v_item_id    UUID;
  v_qty        NUMERIC;
  v_uom_id     UUID;
  v_notes      TEXT;
BEGIN
  -- 1. Recipe එක තියෙනවද කියලා බලනවා
  SELECT id INTO v_recipe_id
  FROM recipes
  WHERE menu_item_id = p_menu_item_id
    AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID) = COALESCE(p_variant_id, '00000000-0000-0000-0000-000000000000'::UUID)
  LIMIT 1;

  -- 2. Upsert Recipe Header
  IF v_recipe_id IS NOT NULL THEN
    UPDATE recipes
    SET 
      name = COALESCE(p_name, name),
      yield_qty = COALESCE(p_yield_qty, 1),
      updated_at = now()
    WHERE id = v_recipe_id;
  ELSE
    INSERT INTO recipes (company_id, menu_item_id, variant_id, name, yield_qty)
    VALUES (p_company_id, p_menu_item_id, p_variant_id, p_name, COALESCE(p_yield_qty, 1))
    RETURNING id INTO v_recipe_id;
  END IF;

  -- 3. පරණ Items අයින් කරනවා (Atomically replace BOM)
  DELETE FROM recipe_items WHERE recipe_id = v_recipe_id;

  -- 4. අලුත් Items ටික දානවා
  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      v_item_id := (v_ing->>'item_id')::UUID;
      v_qty     := (v_ing->>'qty_per_serving')::NUMERIC;
      v_notes   := v_ing->>'notes';
      
      -- Default UOM From Items table (If not provided in JSON)
      IF (v_ing->>'uom_id') IS NULL THEN
        SELECT inventory_uom_id INTO v_uom_id FROM items WHERE id = v_item_id;
      ELSE
        v_uom_id := (v_ing->>'uom_id')::UUID;
      END IF;

      -- අමුද්‍රව්‍ය ප්‍රමාණය 0 ට වැඩිනම් විතරයි Save වෙන්නේ
      IF v_qty > 0 AND v_item_id IS NOT NULL THEN
        INSERT INTO recipe_items (recipe_id, item_id, qty_per_serving, uom_id, notes)
        VALUES (v_recipe_id, v_item_id, v_qty, v_uom_id, v_notes);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'recipe_id', v_recipe_id,
    'message', 'Recipe and items saved successfully.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Allow authenticated users to execute
GRANT EXECUTE ON FUNCTION public.save_recipe(UUID, UUID, UUID, TEXT, NUMERIC, JSONB) TO authenticated;
