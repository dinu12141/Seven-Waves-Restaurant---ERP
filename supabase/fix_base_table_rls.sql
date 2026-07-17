-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: RLS for Base Schema Tables Missing Policies
-- Addresses: BUG-DB-002 (DBaudit) — 15 base tables with no RLS at all
-- Note: fix_missing_rls_policies.sql must be applied FIRST (covers companies,
--       branches, stores, stock_levels, stock_movements, ingredients,
--       permissions, role_permissions, journal_entries, journal_lines).
--       This file covers the remaining tables not in that migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── kitchens ──────────────────────────────────────────────────────────────
ALTER TABLE public.kitchens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchens_read_authenticated ON public.kitchens;
DROP POLICY IF EXISTS kitchens_manage_admin_manager ON public.kitchens;

CREATE POLICY kitchens_read_authenticated ON public.kitchens
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY kitchens_manage_admin_manager ON public.kitchens
  FOR ALL USING (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ── restaurant_tables ─────────────────────────────────────────────────────
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tables_read_authenticated ON public.restaurant_tables;
DROP POLICY IF EXISTS tables_manage_admin_manager ON public.restaurant_tables;

CREATE POLICY tables_read_authenticated ON public.restaurant_tables
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY tables_manage_admin_manager ON public.restaurant_tables
  FOR ALL USING (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ── categories ────────────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_read_authenticated ON public.categories;
DROP POLICY IF EXISTS categories_manage_admin_manager ON public.categories;

CREATE POLICY categories_read_authenticated ON public.categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY categories_manage_admin_manager ON public.categories
  FOR ALL USING (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ── menu_items ────────────────────────────────────────────────────────────
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS menu_items_read_authenticated ON public.menu_items;
DROP POLICY IF EXISTS menu_items_manage_admin_manager ON public.menu_items;
-- Public (QR/kiosk) can read menu items for self-order
DROP POLICY IF EXISTS menu_items_read_anon ON public.menu_items;

CREATE POLICY menu_items_read_authenticated ON public.menu_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Anon can read menu items so QR/kiosk ordering works
CREATE POLICY menu_items_read_anon ON public.menu_items
  FOR SELECT USING (is_available = true);

CREATE POLICY menu_items_manage_admin_manager ON public.menu_items
  FOR ALL USING (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());


-- ── recipes ───────────────────────────────────────────────────────────────
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipes_read_authenticated ON public.recipes;
DROP POLICY IF EXISTS recipes_manage_admin_manager ON public.recipes;

CREATE POLICY recipes_read_authenticated ON public.recipes
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY recipes_manage_admin_manager ON public.recipes
  FOR ALL USING (is_admin() OR is_manager() OR auth_has_role('inventory'))
  WITH CHECK (is_admin() OR is_manager() OR auth_has_role('inventory'));


-- ── payments ──────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_read_cashier_roles ON public.payments;
DROP POLICY IF EXISTS payments_insert_cashier ON public.payments;

CREATE POLICY payments_read_cashier_roles ON public.payments
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('cashier') OR auth_has_role('finance')
  );

CREATE POLICY payments_insert_cashier ON public.payments
  FOR INSERT WITH CHECK (auth_has_role('cashier') OR is_admin());


-- ── order_items ───────────────────────────────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_read_operational ON public.order_items;
DROP POLICY IF EXISTS order_items_insert_waiter_pos ON public.order_items;
DROP POLICY IF EXISTS order_items_update_kitchen ON public.order_items;

CREATE POLICY order_items_read_operational ON public.order_items
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('waiter') OR auth_has_role('cashier') OR
    auth_has_role('kitchen') OR auth_has_role('finance')
  );

CREATE POLICY order_items_insert_waiter_pos ON public.order_items
  FOR INSERT WITH CHECK (
    auth_has_role('waiter') OR auth_has_role('cashier') OR is_admin()
  );

CREATE POLICY order_items_update_kitchen ON public.order_items
  FOR UPDATE USING (
    auth_has_role('kitchen') OR auth_has_role('waiter') OR
    auth_has_role('cashier') OR is_admin()
  );


-- ── kot_tickets ───────────────────────────────────────────────────────────
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kot_tickets_read_kitchen_cashier ON public.kot_tickets;
DROP POLICY IF EXISTS kot_tickets_update_kitchen ON public.kot_tickets;

CREATE POLICY kot_tickets_read_kitchen_cashier ON public.kot_tickets
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('kitchen') OR auth_has_role('cashier') OR auth_has_role('waiter')
  );

CREATE POLICY kot_tickets_update_kitchen ON public.kot_tickets
  FOR UPDATE USING (auth_has_role('kitchen') OR is_admin() OR is_manager());


-- ── kot_items ─────────────────────────────────────────────────────────────
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kot_items_read_kitchen ON public.kot_items;
DROP POLICY IF EXISTS kot_items_update_kitchen ON public.kot_items;

CREATE POLICY kot_items_read_kitchen ON public.kot_items
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('kitchen') OR auth_has_role('cashier') OR auth_has_role('waiter')
  );

CREATE POLICY kot_items_update_kitchen ON public.kot_items
  FOR UPDATE USING (auth_has_role('kitchen') OR is_admin());


-- ── order_status_logs (append-only audit) ─────────────────────────────────
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osl_read_operational ON public.order_status_logs;
DROP POLICY IF EXISTS osl_insert_system ON public.order_status_logs;

CREATE POLICY osl_read_operational ON public.order_status_logs
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('waiter') OR auth_has_role('cashier')
  );

CREATE POLICY osl_insert_system ON public.order_status_logs
  FOR INSERT WITH CHECK (true);  -- inserted by triggers/system


-- ── roles / permissions / role_permissions ────────────────────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_read_all_authenticated ON public.roles;
DROP POLICY IF EXISTS roles_manage_admin ON public.roles;

CREATE POLICY roles_read_all_authenticated ON public.roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY roles_manage_admin ON public.roles
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());


-- ── user_branches ─────────────────────────────────────────────────────────
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ub_read_own_or_admin ON public.user_branches;
DROP POLICY IF EXISTS ub_manage_admin ON public.user_branches;

CREATE POLICY ub_read_own_or_admin ON public.user_branches
  FOR SELECT USING (user_id = auth.uid() OR is_admin() OR is_manager());

CREATE POLICY ub_manage_admin ON public.user_branches
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());


-- ── PAYMENTS: Add missing constraints (VULN-006) ──────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payments' AND constraint_name = 'payments_amount_positive'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'amount' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.payments ALTER COLUMN amount SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payments' AND constraint_name = 'payments_method_valid'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_method_valid CHECK (
        payment_method IN (
          'cash', 'card', 'card_terminal', 'payhere', 'stripe',
          'koko', 'bank_transfer', 'loyalty_points', 'credit', 'cod'
        )
      );
  END IF;
END $$;


-- Record this migration
INSERT INTO applied_migrations (filename, notes)
VALUES ('fix_base_table_rls.sql', 'Security: RLS for 15 base schema tables missing policies + payments constraints')
ON CONFLICT DO NOTHING;
