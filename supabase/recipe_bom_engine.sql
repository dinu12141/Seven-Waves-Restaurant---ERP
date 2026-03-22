-- ═══════════════════════════════════════════════════════════════════
-- RECIPE / BOM ENGINE — COMPLETE MIGRATION
-- Seven Waves Restaurant ERP
-- Applied: 2026-03-17
--
-- BUILDS ON TOP OF EXISTING:
--   ✅ recipes, recipe_items tables (already created)
--   ✅ save_recipe() RPC (already deployed)
--   ✅ bom_inventory_completion.sql (already applied)
--
-- THIS FILE ADDS:
--   1) recipes: yield_unit, version_no, notes columns
--   2) recipe_items: wastage_percent, updated_at columns
--   3) UNIQUE(recipe_id, item_id) constraint
--   4) CHECK(qty_per_serving > 0) constraint
--   5) calculate_recipe_cost() helper function
--   6) Updated save_recipe() with new parameters
--   7) delete_recipe() function
-- ═══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- 1) EXTEND RECIPES TABLE
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS yield_unit TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes TEXT;


-- ─────────────────────────────────────────────────────────────────
-- 2) EXTEND RECIPE_ITEMS TABLE
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS wastage_percent NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Unique constraint: no duplicate ingredient per recipe
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_recipe_item'
  ) THEN
    ALTER TABLE recipe_items ADD CONSTRAINT uq_recipe_item 
      UNIQUE (recipe_id, item_id);
  END IF;
END $$;

-- Check constraint: quantity must be positive
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_qty_positive'
  ) THEN
    ALTER TABLE recipe_items ADD CONSTRAINT chk_qty_positive 
      CHECK (qty_per_serving > 0);
  END IF;
END $$;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_id ON recipes(menu_item_id);


-- ─────────────────────────────────────────────────────────────────
-- 3) RECIPE COST CALCULATION HELPER
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_recipe_cost(p_recipe_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    ri.qty_per_serving 
    * (1 + COALESCE(ri.wastage_percent, 0) / 100.0)
    * COALESCE(i.avg_cost, 0)
  ), 0)
  FROM recipe_items ri
  JOIN items i ON i.id = ri.item_id
  WHERE ri.recipe_id = p_recipe_id;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_recipe_cost(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 4) UPDATED save_recipe() RPC
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.save_recipe(
  p_company_id    UUID,
  p_menu_item_id  UUID,
  p_variant_id    UUID DEFAULT NULL,
  p_name          TEXT DEFAULT NULL,
  p_yield_qty     NUMERIC DEFAULT 1,
  p_yield_unit    TEXT DEFAULT NULL,
  p_notes         TEXT DEFAULT NULL,
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
  v_wastage    NUMERIC;
BEGIN
  -- 1. Check if recipe exists for this menu item + variant
  SELECT id INTO v_recipe_id
  FROM recipes
  WHERE menu_item_id = p_menu_item_id
    AND COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID) 
      = COALESCE(p_variant_id, '00000000-0000-0000-0000-000000000000'::UUID)
  LIMIT 1;

  -- 2. Upsert Recipe Header
  IF v_recipe_id IS NOT NULL THEN
    UPDATE recipes
    SET 
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

  -- 3. Delete existing items (atomic BOM replace)
  DELETE FROM recipe_items WHERE recipe_id = v_recipe_id;

  -- 4. Insert new ingredient lines
  IF p_ingredients IS NOT NULL AND jsonb_array_length(p_ingredients) > 0 THEN
    FOR v_ing IN SELECT * FROM jsonb_array_elements(p_ingredients)
    LOOP
      v_item_id := (v_ing->>'item_id')::UUID;
      v_qty     := (v_ing->>'qty_per_serving')::NUMERIC;
      v_notes   := v_ing->>'notes';
      v_wastage := COALESCE((v_ing->>'wastage_percent')::NUMERIC, 0);
      
      -- Default UOM from items table if not provided
      IF (v_ing->>'uom_id') IS NULL THEN
        SELECT inventory_uom_id INTO v_uom_id FROM items WHERE id = v_item_id;
      ELSE
        v_uom_id := (v_ing->>'uom_id')::UUID;
      END IF;

      -- Only save if quantity is positive
      IF v_qty > 0 AND v_item_id IS NOT NULL THEN
        INSERT INTO recipe_items (recipe_id, item_id, qty_per_serving, uom_id, notes, wastage_percent)
        VALUES (v_recipe_id, v_item_id, v_qty, v_uom_id, v_notes, v_wastage);
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

GRANT EXECUTE ON FUNCTION public.save_recipe(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- 5) DELETE RECIPE
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_recipe(p_recipe_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM recipe_items WHERE recipe_id = p_recipe_id;
  DELETE FROM recipes WHERE id = p_recipe_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recipe deleted successfully.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_recipe(UUID) TO authenticated;
