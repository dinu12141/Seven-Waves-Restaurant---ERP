-- ═══════════════════════════════════════════════════════════════════════════════
-- MISSING FK INDEXES — Core Schema Performance Fix
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-009 (DBauditor 2026-07-17)
--
-- 13 FK columns in core schema.sql tables have no indexes.
-- Under production load, queries filtering by category_id, ingredient_id,
-- role_id, permission_id, store_id, order_item_id, order_id will full-scan.
-- Slowest cases: role_permissions (RBAC load on every auth), stock_levels
-- (inventory check per order), payments (cashier invoice lookup).
--
-- All CREATE INDEX statements use IF NOT EXISTS — safe to re-apply.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Menu / Category ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_menu_items_category
  ON public.menu_items(category_id);

-- ── Recipes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item
  ON public.recipes(menu_item_id);


-- ── RBAC ──────────────────────────────────────────────────────────────────────
-- Critical: loaded on every authenticated request via auth store permission check
CREATE INDEX IF NOT EXISTS idx_role_permissions_role
  ON public.role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_role_permissions_perm
  ON public.role_permissions(permission_id);

-- ── Stock ─────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stock_levels_store
  ON public.stock_levels(store_id);

CREATE INDEX IF NOT EXISTS idx_stock_levels_ingr
  ON public.stock_levels(ingredient_id);

CREATE INDEX IF NOT EXISTS idx_stock_mvt_store
  ON public.stock_movements(store_id);

CREATE INDEX IF NOT EXISTS idx_stock_mvt_ingr
  ON public.stock_movements(ingredient_id);

CREATE INDEX IF NOT EXISTS idx_stock_mvt_ref
  ON public.stock_movements(reference_id);

-- ── KOT ───────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kot_items_order_item
  ON public.kot_items(order_item_id);

-- ── Order Status Logs ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_osl_changed_by
  ON public.order_status_logs(changed_by);

-- ── Payments ──────────────────────────────────────────────────────────────────
-- Critical: cashier payment-by-order lookup during checkout
CREATE INDEX IF NOT EXISTS idx_payments_order
  ON public.payments(order_id);

-- ── Additional high-value indexes discovered during audit ─────────────────────

-- orders: waiter inbox query filters by status + assigned_waiter_id
CREATE INDEX IF NOT EXISTS idx_orders_status
  ON public.orders(status)
  WHERE status IN ('pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced');

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter
  ON public.orders(assigned_waiter_id)
  WHERE assigned_waiter_id IS NOT NULL;

-- orders: branch-filtered queries (manager dashboard, reports)
CREATE INDEX IF NOT EXISTS idx_orders_branch_created
  ON public.orders(branch_id, created_at DESC);

-- kot_tickets: kitchen display query (status filter by kitchen_id)
CREATE INDEX IF NOT EXISTS idx_kot_tickets_kitchen_status
  ON public.kot_tickets(kitchen_id, status);

-- order_items: kitchen routing reads kitchen_id before KOT generation
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_kitchen
  ON public.order_items(kitchen_id)
  WHERE kitchen_id IS NOT NULL;

-- Note: company_id indexes are in fix_company_id_columns.sql (column added there first)
