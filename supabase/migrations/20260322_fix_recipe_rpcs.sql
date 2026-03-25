-- ==============================================================================
-- FIX DUPLICATE save_recipe + HARDEN RECIPE RPCs
-- ==============================================================================

-- 1. Drop old 6-arg overload
DROP FUNCTION IF EXISTS public.save_recipe(uuid, uuid, uuid, text, numeric, jsonb);

-- 2. Hardened save_recipe with validation
CREATE OR REPLACE FUNCTION public.save_recipe(
  p_company_id   UUID,
  p_menu_item_id UUID,
  p_variant_id   UUID DEFAULT NULL,
  p_name         TEXT DEFAULT NULL,
  p_yield_qty    NUMERIC DEFAULT 1,
  p_yield_unit   TEXT DEFAULT NULL,
  p_notes        TEXT DEFAULT NULL,
  p_ingredients  JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_recipe_id  UUID;
  v_ing        JSONB;
  v_item_id    UUID;
  v_qty        NUMERIC;
  v_uom_id     UUID;
  v_notes      TEXT;
  v_wastage    NUMERIC;
  v_item_check UUID;
  v_uom_check  UUID;
  v_menu_check UUID;
BEGIN
  -- Validate menu_item_id exists
  SELECT id INTO v_menu_check FROM menu_items WHERE id = p_menu_item_id;
  IF v_menu_check IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Menu item not found: ' || p_menu_item_id);
  END IF;

  -- Validate all ingredients
  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      v_item_id := (v_ing->>'item_id')::UUID;
      IF v_item_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ingredient missing item_id');
      END IF;

      SELECT id INTO v_item_check FROM items WHERE id = v_item_id AND is_active = true;
      IF v_item_check IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found or inactive: ' || v_item_id);
      END IF;

      IF (v_ing->>'uom_id') IS NOT NULL THEN
        SELECT id INTO v_uom_check FROM uom WHERE id = (v_ing->>'uom_id')::UUID;
        IF v_uom_check IS NULL THEN
          RETURN jsonb_build_object('success', false, 'error', 'UOM not found: ' || (v_ing->>'uom_id'));
        END IF;
      END IF;

      v_qty := (v_ing->>'qty_per_serving')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid qty_per_serving for item: ' || v_item_id);
      END IF;
    END LOOP;
  END IF;

  -- Upsert recipe header
  SELECT id INTO v_recipe_id
  FROM recipes
  WHERE menu_item_id = p_menu_item_id
    AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID) 
      = COALESCE(p_variant_id, '00000000-0000-0000-0000-000000000000'::UUID)
  LIMIT 1;

  IF v_recipe_id IS NOT NULL THEN
    UPDATE recipes SET 
      name = COALESCE(p_name, name),
      yield_qty = COALESCE(p_yield_qty, 1),
      yield_unit = COALESCE(p_yield_unit, yield_unit),
      notes = COALESCE(p_notes, notes),
      version_no = version_no + 1,
      updated_at = now()
    WHERE id = v_recipe_id;
  ELSE
    INSERT INTO recipes (company_id, menu_item_id, variant_id, name, yield_qty, yield_unit, notes)
    VALUES (p_company_id, p_menu_item_id, p_variant_id, p_name, COALESCE(p_yield_qty, 1), p_yield_unit, p_notes)
    RETURNING id INTO v_recipe_id;
  END IF;

  -- Atomic BOM replace
  DELETE FROM recipe_items WHERE recipe_id = v_recipe_id;

  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      v_item_id := (v_ing->>'item_id')::UUID;
      v_qty     := (v_ing->>'qty_per_serving')::NUMERIC;
      v_notes   := v_ing->>'notes';
      v_wastage := COALESCE((v_ing->>'wastage_percent')::NUMERIC, 0);
      
      IF (v_ing->>'uom_id') IS NULL THEN
        SELECT inventory_uom_id INTO v_uom_id FROM items WHERE id = v_item_id;
      ELSE
        v_uom_id := (v_ing->>'uom_id')::UUID;
      END IF;

      INSERT INTO recipe_items (recipe_id, item_id, qty_per_serving, uom_id, notes, wastage_percent)
      VALUES (v_recipe_id, v_item_id, v_qty, v_uom_id, v_notes, v_wastage);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'recipe_id', v_recipe_id, 'message', 'Recipe and items saved successfully.');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- 3. Updated calculate_recipe_cost with UOM conversion support
CREATE OR REPLACE FUNCTION public.calculate_recipe_cost(p_recipe_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_total NUMERIC := 0;
  v_line  RECORD;
  v_conv  NUMERIC;
  v_cost  NUMERIC;
BEGIN
  FOR v_line IN
    SELECT ri.qty_per_serving, ri.wastage_percent, ri.uom_id AS recipe_uom_id,
           i.avg_cost, i.inventory_uom_id, i.company_id
    FROM recipe_items ri
    JOIN items i ON i.id = ri.item_id
    WHERE ri.recipe_id = p_recipe_id
  LOOP
    v_conv := 1;
    IF v_line.recipe_uom_id IS DISTINCT FROM v_line.inventory_uom_id THEN
      SELECT factor INTO v_conv
      FROM uom_conversions
      WHERE company_id = v_line.company_id
        AND from_uom_id = v_line.recipe_uom_id
        AND to_uom_id = v_line.inventory_uom_id;
      IF v_conv IS NULL THEN v_conv := 1; END IF;
    END IF;

    v_cost := v_line.qty_per_serving * v_conv * COALESCE(v_line.avg_cost, 0) 
              * (1 + COALESCE(v_line.wastage_percent, 0) / 100.0);
    v_total := v_total + v_cost;
  END LOOP;

  RETURN ROUND(v_total, 2);
END;
$fn$;

COMMENT ON FUNCTION save_recipe IS 'Atomic upsert recipe + BOM items with input validation.';
COMMENT ON FUNCTION calculate_recipe_cost IS 'Calculate total ingredient cost for a recipe using avg_cost and UOM conversions.';
