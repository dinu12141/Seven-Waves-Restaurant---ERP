-- ═══════════════════════════════════════════════════════════════════════════════
-- SOFT DELETE COLUMNS — menu_items, categories, ingredients
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-019 (DBauditor 2026-07-17)
--
-- PROBLEM:
--   Hard deletes on menu_items/ingredients that appear in past orders will either:
--   (a) fail with FK constraint violation (safe but disruptive), or
--   (b) orphan order_items.menu_item_id (if ON DELETE SET NULL)
--   No archive mechanism exists — items can only be hard-deleted.
--
-- SOLUTION:
--   Add `deleted_at TIMESTAMPTZ` column.
--   Application filters WHERE deleted_at IS NULL for active items.
--   Items referenced by orders can be safely "deleted" by setting deleted_at.
--
-- NOTE: After applying, update menu queries in the frontend to add:
--   .is('deleted_at', null)   (Supabase client)
--   or WHERE deleted_at IS NULL  (SQL)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── menu_items ────────────────────────────────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index: the 99% query is "active items" (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_menu_items_not_deleted
  ON public.menu_items(id)
  WHERE deleted_at IS NULL;

-- ── categories ────────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_categories_not_deleted
  ON public.categories(id)
  WHERE deleted_at IS NULL;

-- ── ingredients ───────────────────────────────────────────────────────────────
ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ingredients_not_deleted
  ON public.ingredients(id)
  WHERE deleted_at IS NULL;

-- ── recipes ───────────────────────────────────────────────────────────────────
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_recipes_not_deleted
  ON public.recipes(id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: soft-delete RPC for menu items (callable by admin/manager only)
-- Avoids hard delete; returns error if item has active orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_menu_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count INT;
BEGIN
  IF NOT (public.is_admin() OR public.is_manager()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Check for active orders referencing this item
  SELECT COUNT(*) INTO v_active_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.menu_item_id = p_item_id
    AND o.status NOT IN ('paid', 'cancelled', 'refunded');

  IF v_active_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot delete: item has %s active order(s)', v_active_count)
    );
  END IF;

  UPDATE menu_items
  SET deleted_at = now()
  WHERE id = p_item_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_menu_item(UUID) TO authenticated;
