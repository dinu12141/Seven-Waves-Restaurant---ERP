-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS — MISSING TABLE POLICIES (Supplement to fix_missing_rls_policies.sql)
-- Seven Waves Restaurant ERP
-- Bug: BUG-DB-002 (DBauditor 2026-07-17)
--
-- Covers tables NOT handled by fix_missing_rls_policies.sql:
--   kitchens, restaurant_tables, categories, menu_items, ingredients, recipes,
--   stock_movements, payments, order_items, kot_tickets, kot_items,
--   order_status_logs, roles, role_permissions, user_branches
--
-- PREREQUISITE: erp_security_lockdown.sql + fix_missing_rls_policies.sql must
--               already be applied (they define is_admin, is_manager, auth_has_role,
--               auth_branch_ids, and user_branches_manage_admin policy).
--
-- HOW TO APPLY:
--   Paste into Supabase Dashboard → SQL Editor and run.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- kitchens — admin/manager manage; all staff read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kitchens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchens_read_authenticated   ON public.kitchens;
DROP POLICY IF EXISTS kitchens_manage_admin_manager ON public.kitchens;

CREATE POLICY kitchens_read_authenticated ON public.kitchens
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY kitchens_manage_admin_manager ON public.kitchens
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- restaurant_tables — admin/manager manage; waiter/cashier read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tables_read_authenticated    ON public.restaurant_tables;
DROP POLICY IF EXISTS tables_manage_admin_manager  ON public.restaurant_tables;

CREATE POLICY tables_read_authenticated ON public.restaurant_tables
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY tables_manage_admin_manager ON public.restaurant_tables
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- categories — admin/manager write; all staff read (needed for menu display)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_read_authenticated   ON public.categories;
DROP POLICY IF EXISTS categories_manage_admin_manager ON public.categories;

CREATE POLICY categories_read_authenticated ON public.categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY categories_manage_admin_manager ON public.categories
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- menu_items — admin/manager write; all staff read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_items_read_authenticated    ON public.menu_items;
DROP POLICY IF EXISTS menu_items_manage_admin_manager  ON public.menu_items;

CREATE POLICY menu_items_read_authenticated ON public.menu_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY menu_items_manage_admin_manager ON public.menu_items
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- ingredients — admin/manager/inventory write; staff read (for recipes/KOT)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredients_read_authenticated    ON public.ingredients;
DROP POLICY IF EXISTS ingredients_manage_admin_manager  ON public.ingredients;
DROP POLICY IF EXISTS ing_admin  ON public.ingredients;
DROP POLICY IF EXISTS ing_inventory ON public.ingredients;
DROP POLICY IF EXISTS ing_read   ON public.ingredients;

CREATE POLICY ingredients_read_authenticated ON public.ingredients
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY ingredients_manage_admin_manager ON public.ingredients
  FOR ALL
  USING  (is_admin() OR is_manager() OR auth_has_role('inventory'))
  WITH CHECK (is_admin() OR is_manager() OR auth_has_role('inventory'));


-- ─────────────────────────────────────────────────────────────────────────────
-- recipes — admin/manager write; kitchen/waiter read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipes_read_authenticated   ON public.recipes;
DROP POLICY IF EXISTS recipes_manage_admin_manager ON public.recipes;

CREATE POLICY recipes_read_authenticated ON public.recipes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY recipes_manage_admin_manager ON public.recipes
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- stock_movements — admin/manager/inventory write; inventory/finance read
-- (supplements fix_missing_rls_policies.sql Section 3 which covers stock_levels)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_mvt_read_inventory_roles ON public.stock_movements;
DROP POLICY IF EXISTS stock_mvt_insert_system        ON public.stock_movements;
DROP POLICY IF EXISTS sm_admin    ON public.stock_movements;
DROP POLICY IF EXISTS sm_inventory ON public.stock_movements;

CREATE POLICY stock_mvt_read_inventory_roles ON public.stock_movements
  FOR SELECT
  USING (
    is_admin() OR is_manager()
    OR auth_has_role('inventory')
    OR auth_has_role('finance')
  );

CREATE POLICY stock_mvt_insert_system ON public.stock_movements
  FOR INSERT
  WITH CHECK (is_admin() OR auth_has_role('inventory'));

CREATE POLICY stock_mvt_admin_manage ON public.stock_movements
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- payments — cashier insert; cashier/finance/admin read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_read_cashier_roles ON public.payments;
DROP POLICY IF EXISTS payments_insert_cashier     ON public.payments;
DROP POLICY IF EXISTS payments_admin_all          ON public.payments;

CREATE POLICY payments_admin_all ON public.payments
  FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY payments_read_cashier_roles ON public.payments
  FOR SELECT
  USING (
    is_manager()
    OR auth_has_role('cashier')
    OR auth_has_role('finance')
  );

-- Cashier inserts go via process_cashier_payment SECURITY DEFINER RPC,
-- but allow direct insert for cashier role as fallback
CREATE POLICY payments_insert_cashier ON public.payments
  FOR INSERT
  WITH CHECK (auth_has_role('cashier') OR is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- order_items — waiter/cashier/kitchen read; waiter/pos insert; kitchen update
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_read_operational  ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_waiter_pos ON public.order_items;
DROP POLICY IF EXISTS order_items_update_kitchen    ON public.order_items;
DROP POLICY IF EXISTS order_items_admin_all         ON public.order_items;

CREATE POLICY order_items_admin_all ON public.order_items
  FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY order_items_read_operational ON public.order_items
  FOR SELECT
  USING (
    is_manager()
    OR auth_has_role('waiter')
    OR auth_has_role('cashier')
    OR auth_has_role('kitchen')
    OR auth_has_role('finance')
  );

CREATE POLICY order_items_insert_waiter_pos ON public.order_items
  FOR INSERT
  WITH CHECK (
    auth_has_role('waiter') OR auth_has_role('cashier') OR is_admin()
  );

CREATE POLICY order_items_update_kitchen ON public.order_items
  FOR UPDATE
  USING (
    auth_has_role('kitchen') OR auth_has_role('waiter')
    OR auth_has_role('cashier') OR is_admin()
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- kot_tickets — kitchen/waiter/cashier read; kitchen update (status changes)
-- INSERT is done by trigger (SECURITY DEFINER context) — no INSERT policy needed
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kot_tickets_read_kitchen_cashier ON public.kot_tickets;
DROP POLICY IF EXISTS kot_tickets_update_kitchen       ON public.kot_tickets;
DROP POLICY IF EXISTS kot_tickets_admin_all            ON public.kot_tickets;

CREATE POLICY kot_tickets_admin_all ON public.kot_tickets
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY kot_tickets_read_kitchen_cashier ON public.kot_tickets
  FOR SELECT
  USING (
    auth_has_role('kitchen')
    OR auth_has_role('cashier')
    OR auth_has_role('waiter')
  );

CREATE POLICY kot_tickets_update_kitchen ON public.kot_tickets
  FOR UPDATE
  USING (
    auth_has_role('kitchen') OR is_admin() OR is_manager()
  );

-- Triggers insert KOT tickets in SECURITY DEFINER context — they bypass RLS
-- Allow service_role for trigger-driven inserts
CREATE POLICY kot_tickets_service_insert ON public.kot_tickets
  FOR INSERT
  TO service_role
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- kot_items — same access as kot_tickets
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kot_items_read_kitchen  ON public.kot_items;
DROP POLICY IF EXISTS kot_items_update_kitchen ON public.kot_items;
DROP POLICY IF EXISTS kot_items_admin_all      ON public.kot_items;

CREATE POLICY kot_items_admin_all ON public.kot_items
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY kot_items_read_kitchen ON public.kot_items
  FOR SELECT
  USING (
    auth_has_role('kitchen')
    OR auth_has_role('cashier')
    OR auth_has_role('waiter')
  );

CREATE POLICY kot_items_update_kitchen ON public.kot_items
  FOR UPDATE
  USING (auth_has_role('kitchen') OR is_admin());

CREATE POLICY kot_items_service_insert ON public.kot_items
  FOR INSERT
  TO service_role
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- order_status_logs — append-only audit trail; triggers insert; roles read
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osl_read_operational ON public.order_status_logs;
DROP POLICY IF EXISTS osl_insert_system    ON public.order_status_logs;
DROP POLICY IF EXISTS osl_admin_all        ON public.order_status_logs;

CREATE POLICY osl_admin_all ON public.order_status_logs
  FOR ALL
  USING  (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY osl_read_operational ON public.order_status_logs
  FOR SELECT
  USING (
    auth_has_role('waiter')
    OR auth_has_role('cashier')
    OR auth_has_role('finance')
  );

-- Triggers insert via SECURITY DEFINER or default session context
CREATE POLICY osl_insert_system ON public.order_status_logs
  FOR INSERT
  WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- roles — all authenticated can read; admin manages
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_read_all_authenticated ON public.roles;
DROP POLICY IF EXISTS roles_manage_admin           ON public.roles;

CREATE POLICY roles_read_all_authenticated ON public.roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY roles_manage_admin ON public.roles
  FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- role_permissions — all authenticated can read; admin manages
-- (fix_missing_rls_policies.sql Section 5 covers permissions and role_permissions
--  but may not have dropped naming conflicts — safe to re-apply idempotently)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_read_all    ON public.role_permissions;
DROP POLICY IF EXISTS rp_manage_admin ON public.role_permissions;
DROP POLICY IF EXISTS rp_admin       ON public.role_permissions;
DROP POLICY IF EXISTS rp_read        ON public.role_permissions;

CREATE POLICY rp_read_all ON public.role_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY rp_manage_admin ON public.role_permissions
  FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- user_branches — own/admin read; admin write
-- (fix_missing_rls_policies.sql Section 17 adds user_branches_manage_admin for ALL,
--  but lacks the read-own-or-admin SELECT policy — adding it here)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ub_read_own_or_admin    ON public.user_branches;
DROP POLICY IF EXISTS user_branches_manage_admin ON public.user_branches;

-- Re-create to avoid collision with the one from fix_missing_rls_policies.sql
CREATE POLICY user_branches_manage_admin ON public.user_branches
  FOR ALL
  USING  (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY ub_read_own_or_admin ON public.user_branches
  FOR SELECT
  USING (user_id = auth.uid() OR is_admin() OR is_manager());


-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS — ensure authenticated role can exercise the new RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kitchens             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kot_tickets          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kot_items            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_status_logs    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_branches        TO authenticated;

-- Block anon from all operational tables
REVOKE ALL ON public.order_items          FROM anon;
REVOKE ALL ON public.kot_tickets          FROM anon;
REVOKE ALL ON public.kot_items            FROM anon;
REVOKE ALL ON public.payments             FROM anon;
REVOKE ALL ON public.order_status_logs    FROM anon;
REVOKE ALL ON public.roles                FROM anon;
REVOKE ALL ON public.role_permissions     FROM anon;
REVOKE ALL ON public.user_branches        FROM anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- After applying, run:
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
-- Expected: only qr_rate_limits (intentionally excluded)
