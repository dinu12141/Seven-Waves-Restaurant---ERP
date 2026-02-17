-- =====================================================
-- MENU & RECIPES (FINAL PRODUCTION VERSION)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- AUTO UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. CATEGORIES
-- =====================================================

DROP TABLE IF EXISTS categories CASCADE;
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    image_url   TEXT,
    sort_order  INT DEFAULT 0,
    is_active   BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_company ON categories(company_id);

CREATE TRIGGER trg_categories_updated
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 2. MENU ITEMS
-- =====================================================

DROP TABLE IF EXISTS menu_items CASCADE;
CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
    kitchen_id      UUID REFERENCES kitchens(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    image_url       TEXT,
    base_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
    preparation_time_minutes INT,
    is_available    BOOLEAN DEFAULT true,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_menu_items_company  ON menu_items(company_id);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_kitchen  ON menu_items(kitchen_id);

CREATE TRIGGER trg_menu_items_updated
BEFORE UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 3. ITEM VARIANTS
-- =====================================================

DROP TABLE IF EXISTS item_variants CASCADE;
CREATE TABLE item_variants (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    price        NUMERIC(10,2) NOT NULL,
    sort_order   INT DEFAULT 0,
    is_active    BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(menu_item_id, name)
);

CREATE INDEX idx_item_variants_menu_item
ON item_variants(menu_item_id);

-- =====================================================
-- 4. RECIPES
-- =====================================================

DROP TABLE IF EXISTS recipes CASCADE;
CREATE TABLE recipes (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    variant_id   UUID REFERENCES item_variants(id) ON DELETE CASCADE,
    name         TEXT,
    yield_qty    NUMERIC(10,4) DEFAULT 1,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now(),
    UNIQUE(menu_item_id, variant_id)
);

CREATE INDEX idx_recipes_menu_item ON recipes(menu_item_id);
CREATE INDEX idx_recipes_variant   ON recipes(variant_id);

CREATE TRIGGER trg_recipes_updated
BEFORE UPDATE ON recipes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- 5. RECIPE ITEMS
-- =====================================================

DROP TABLE IF EXISTS recipe_items CASCADE;
CREATE TABLE recipe_items (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity      NUMERIC(10,4) NOT NULL,
    unit          TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(recipe_id, ingredient_id)
);

CREATE INDEX idx_recipe_items_recipe
ON recipe_items(recipe_id);

CREATE INDEX idx_recipe_items_ingredient
ON recipe_items(ingredient_id);

-- =====================================================
-- STOCK DEDUCTION FUNCTION (FIXED)
-- =====================================================

CREATE OR REPLACE FUNCTION deduct_stock_for_order_item(
    p_order_item_id UUID,
    p_store_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_menu_item_id UUID;
    v_variant_id UUID;
    v_recipe_id UUID;
    v_order_qty INT;
    r RECORD;
BEGIN

    -- Fetch order item
    SELECT menu_item_id, variant_id, quantity
    INTO v_menu_item_id, v_variant_id, v_order_qty
    FROM order_items
    WHERE id = p_order_item_id;

    IF v_menu_item_id IS NULL THEN
        RETURN;
    END IF;

    -- Priority:
    -- 1️⃣ Variant recipe
    -- 2️⃣ Base recipe
    SELECT id INTO v_recipe_id
    FROM recipes
    WHERE menu_item_id = v_menu_item_id
    ORDER BY
        CASE
            WHEN variant_id = v_variant_id THEN 1
            WHEN variant_id IS NULL THEN 2
            ELSE 3
        END
    LIMIT 1;

    IF v_recipe_id IS NULL THEN
        RETURN;
    END IF;

    -- Deduct ingredients
    FOR r IN
        SELECT ingredient_id, quantity
        FROM recipe_items
        WHERE recipe_id = v_recipe_id
    LOOP

        -- Prevent negative stock (optional safety)
        UPDATE stock_levels
        SET quantity = GREATEST(
            quantity - (r.quantity * v_order_qty),
            0
        )
        WHERE store_id = p_store_id
          AND ingredient_id = r.ingredient_id;

        INSERT INTO stock_movements(
            store_id,
            ingredient_id,
            quantity,
            movement_type,
            reference_id,
            created_at
        )
        VALUES (
            p_store_id,
            r.ingredient_id,
            -(r.quantity * v_order_qty),
            'recipe_deduction',
            p_order_item_id,
            now()
        );

    END LOOP;

END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- REALTIME
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE item_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE recipes;

-- =====================================================
-- 6. RESTORE FOREIGN KEYS (Dropped by CASCADE)
-- =====================================================

DO $$
BEGIN
    -- Only if order_items exists (from schema.sql)
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_items') THEN
        
        -- Clean up orphaned references (set to NULL) or delete
        UPDATE order_items 
        SET menu_item_id = NULL 
        WHERE menu_item_id IS NOT NULL 
          AND menu_item_id NOT IN (SELECT id FROM menu_items);

        -- Re-add FK Constraint
        ALTER TABLE order_items 
        DROP CONSTRAINT IF EXISTS order_items_menu_item_id_fkey;

        ALTER TABLE order_items
        ADD CONSTRAINT order_items_menu_item_id_fkey
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL;
        
    END IF;
END $$;
