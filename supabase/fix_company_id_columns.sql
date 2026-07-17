-- ═══════════════════════════════════════════════════════════════════════════════
-- MULTI-TENANCY: Add company_id to 7 Core Tables
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-004 (DBauditor 2026-07-17)
--
-- PROBLEM:
--   menu_items, categories, ingredients, recipes, stores,
--   stock_levels, stock_movements have no company_id column.
--   In multi-company deployments, all companies share the same menu/stock data.
--   RLS cannot scope by company without this column.
--
-- APPROACH:
--   1. ADD COLUMN IF NOT EXISTS (safe no-op if already exists)
--   2. Backfill from existing branch relationship (stores → branches → company_id)
--   3. Note: menu_items/categories/ingredients have no branch_id — backfill
--      uses the single-company assumption (get first company). For multi-company
--      deployments, a manual review is required after applying.
--
-- ⚠️  IMPORTANT: After applying this migration, you MUST also update:
--   - The menu management RPCs to filter by get_user_company_id()
--   - The frontend menu fetch queries to include company_id filter
--   - Run fix_rls_missing_tables.sql AFTER this file (it adds company-scoped policies)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. ADD COLUMNS ────────────────────────────────────────────────────────────

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.stock_levels
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;


-- ── 2. BACKFILL ────────────────────────────────────────────────────────────────

-- stores → company_id via branch
UPDATE public.stores s
SET company_id = b.company_id
FROM public.branches b
WHERE s.branch_id = b.id
  AND s.company_id IS NULL;

-- stock_levels → company_id via store → branch
UPDATE public.stock_levels sl
SET company_id = b.company_id
FROM public.stores s
JOIN public.branches b ON b.id = s.branch_id
WHERE sl.store_id = s.id
  AND sl.company_id IS NULL;

-- stock_movements → company_id via store → branch
UPDATE public.stock_movements sm
SET company_id = b.company_id
FROM public.stores s
JOIN public.branches b ON b.id = s.branch_id
WHERE sm.store_id = s.id
  AND sm.company_id IS NULL;

-- For menu_items, categories, ingredients, recipes:
-- These have no branch_id. If this is a single-company deployment,
-- backfill with the first company. For multi-company, set manually.
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    UPDATE public.menu_items   SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE public.categories   SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE public.ingredients  SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE public.recipes      SET company_id = v_company_id WHERE company_id IS NULL;
    RAISE NOTICE '[CompanyID] ✅ Backfilled % as default company for menu/ingredient tables', v_company_id;
  ELSE
    RAISE WARNING '[CompanyID] ⚠️ No companies found — backfill skipped. Set company_id manually.';
  END IF;
END $$;


-- ── 3. INDEXES ────────────────────────────────────────────────────────────────
-- (also created by fix_missing_indexes.sql — IF NOT EXISTS makes this idempotent)

CREATE INDEX IF NOT EXISTS idx_menu_items_company    ON public.menu_items(company_id);
CREATE INDEX IF NOT EXISTS idx_categories_company    ON public.categories(company_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_company   ON public.ingredients(company_id);
CREATE INDEX IF NOT EXISTS idx_recipes_company       ON public.recipes(company_id);
CREATE INDEX IF NOT EXISTS idx_stores_company        ON public.stores(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_company  ON public.stock_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON public.stock_movements(company_id);


-- ── 4. VERIFICATION ───────────────────────────────────────────────────────────
-- SELECT 'menu_items' AS tbl, COUNT(*) AS total, COUNT(company_id) AS with_company FROM menu_items
-- UNION ALL
-- SELECT 'categories', COUNT(*), COUNT(company_id) FROM categories
-- UNION ALL
-- SELECT 'ingredients', COUNT(*), COUNT(company_id) FROM ingredients
-- UNION ALL
-- SELECT 'stores', COUNT(*), COUNT(company_id) FROM stores
-- UNION ALL
-- SELECT 'stock_levels', COUNT(*), COUNT(company_id) FROM stock_levels;
-- Expected: total = with_company for each table
