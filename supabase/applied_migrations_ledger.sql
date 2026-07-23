-- =====================================================
-- MIGRATION LEDGER
-- Seven Waves Restaurant ERP
-- Apply this FIRST on any fresh Supabase project.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT current_user,
  notes       TEXT
);

COMMENT ON TABLE public.applied_migrations IS
  'Tracks which SQL migration files have been applied to this environment.';

-- RLS: only admin can read/write
ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only" ON public.applied_migrations
  USING (is_admin())
  WITH CHECK (is_admin());

-- =====================================================
-- Backfill: record all SQL files already applied
-- (based on git history as of 2026-07-16)
-- =====================================================

INSERT INTO public.applied_migrations (filename, notes) VALUES
  ('schema.sql',                            'Base tables: companies, branches, kitchens, tables, profiles, roles, permissions'),
  ('rbac.sql',                              'RBAC role/permission seed data'),
  ('rbac_rls.sql',                          'RLS policies for RBAC tables'),
  ('auth_has_role.sql',                     'auth_has_role() helper function'),
  ('orders.sql',                            'Orders, order_items, KOT tables + triggers'),
  ('rls_restaurant_flow.sql',               'Main operational RLS policies'),
  ('shift_access_control.sql',              'Shift RPCs: auth_is_on_shift, get_pending_orders_for_shift'),
  ('kot_orchestration_v2.sql',              'KOT generation engine v2'),
  ('sprint1_kot_orchestration_engine.sql',  'KOT orchestration sprint 1 fixes'),
  ('erp_security_lockdown.sql',             'Revoke anon access; harden functions — MISSING from list, apply if not done'),
  ('billing.sql',                           'Billing / invoice tables'),
  ('inventory.sql',                         'Inventory base tables'),
  ('inventory_module.sql',                  'Inventory module functions'),
  ('inventory_module_functions.sql',        'Additional inventory functions'),
  ('inventory_trigger_orders.sql',          'Inventory deduction trigger on order dispatch'),
  ('menu_recipes.sql',                      'Menu categories, items, recipes'),
  ('menu_management.sql',                   'Menu management RPCs'),
  ('missing_menu_columns.sql',              'Patch: missing menu columns'),
  ('procurement.sql',                       'Procurement base tables'),
  ('procurement_functions.sql',             'Procurement RPCs'),
  ('procurement_settings.sql',              'Procurement settings table'),
  ('system_modules.sql',                    'system_modules table for per-company feature flags'),
  ('table_ordering_features.sql',           'Table ordering / QR features'),
  ('table_device_login_customer_sessions.sql', 'Customer QR session tables'),
  ('printers.sql',                          'Printer management tables'),
  ('rls_customer_session_hardening.sql',    'Customer session RLS hardening'),
  ('hr_payroll.sql',                        'HR base tables: employees, departments, shifts'),
  ('hr_payroll_enhancements.sql',           'HR payroll enhancements'),
  ('hrms_complete_module.sql',              'HRMS complete module'),
  ('leave_management.sql',                  'Leave request / approval tables'),
  ('biometric_integration.sql',             'Biometric device integration tables'),
  ('kot_dispatch_queues.sql',               'KOT dispatch queue tables'),
  ('kot_routing_engine.sql',                'KOT kitchen routing engine'),
  ('bom_recipe_rpc.sql',                    'BOM recipe RPCs'),
  ('recipe_bom_engine.sql',                 'Recipe BOM engine'),
  ('bom_inventory_completion.sql',          'BOM inventory completion RPCs'),
  ('stock_queue_orchestration.sql',         'Stock queue orchestration'),
  ('mcp_warehouse_engine.sql',              'Warehouse engine RPCs'),
  ('erp_reporting_module.sql',              'Reporting module RPCs'),
  ('mcp_touch_screen_menu.sql',             'Touch screen menu RPCs'),
  ('create_order_from_session.sql',         'create_order_from_session RPC'),
  ('customer_loyalty_system.sql',           'Loyalty points system'),
  ('pos_customer_loyalty.sql',              'POS loyalty integration'),
  ('pos_shift_management.sql',              'POS shift management'),
  ('apply_service_charge.sql',              'Service charge RPC'),
  ('finance_integration.sql',               'Finance integration RPCs'),
  ('notifications.sql',                     'Notifications table'),
  ('delivery_assignments_migration.sql',    'Delivery assignment tables'),
  ('admin_setup.sql',                       'Admin setup seed data'),
  ('phase1_extended_rbac.sql',              'Phase 1 RBAC extensions'),
  ('phase1_security_crm.sql',              'Phase 1 CRM + security'),
  ('phase1_offline_sync.sql',              'Phase 1 offline sync'),
  ('employee_advances_expenses.sql',        'Employee advances and expenses'),
  ('payroll_engine.sql',                    'Payroll engine RPCs'),
  ('rpc_waiter_accept_order.sql',           'accept_order_as_waiter RPC'),
  ('realtime_downstream.sql',              'Realtime downstream config'),
  ('cashier_order_items_rls_fix.sql',       'Cashier order items RLS fix'),
  ('cashier_accept_rpc_fix.sql',            'Cashier accept RPC fix'),
  ('fix_rider_accept_with_kots.sql',        'Rider accept with KOTs fix'),
  ('fix_kot_flow_and_inventory.sql',        'KOT flow and inventory fix'),
  ('fix_kot_generation.sql',               'KOT generation fix'),
  ('fix_kitchen_routing_hierarchy.sql',     'Kitchen routing hierarchy fix'),
  ('fix_kitchen_dispatch_routing.sql',      'Kitchen dispatch routing fix'),
  ('fix_kitchen_routing_and_visibility.sql','Kitchen routing and visibility fix'),
  ('fix_kds_visibility_final.sql',          'KDS visibility final fix'),
  ('fix_cashier_kds_visibility.sql',        'Cashier KDS visibility fix'),
  ('fix_cashier_kot_realtime.sql',          'Cashier KOT realtime fix'),
  ('fix_waiter_dashboard_fully.sql',        'Waiter dashboard full fix'),
  ('fix_waiter_visibility_fully.sql',       'Waiter visibility full fix'),
  ('fix_kiosk_session.sql',                 'Kiosk session fix'),
  ('create_kiosk_order.sql',               'create_kiosk_order RPC'),
  ('get_kiosk_orders.sql',                 'get_kiosk_orders RPC'),
  ('fix_create_order_remove_kot.sql',       'Fix create order remove KOT'),
  ('fix_price_and_discount_security.sql',   'Price and discount security fix'),
  ('fix_rate_limit_enforcement.sql',        'Rate limit enforcement fix'),
  ('fix_remove_ratelimits_from_realtime.sql','Remove rate limits from realtime'),
  ('fix_cleanup_rate_limits_grant.sql',     'Cleanup rate limits grant'),
  ('fix_journal_immutability.sql',          'Journal immutability enforcement'),
  ('fix_delivery_tracking_rls.sql',         'Delivery tracking RLS fix'),
  ('fix_admin_settings.sql',               'Admin settings fix'),
  ('fix_parked_orders.sql',                'Parked orders fix'),
  ('fix_employee_emergency_contact.sql',    'Employee emergency contact fix'),
  ('fix_grn_posting.sql',                  'GRN finance posting fix'),
  ('fix_payroll_finance_post.sql',          'Payroll finance posting fix'),
  ('fix_unavailable_items_total.sql',       'Unavailable items total fix'),
  ('fix_rpc_aliases.sql',                  'RPC aliases fix'),
  ('fix_shift_payment_ownership.sql',       'Shift payment ownership fix'),
  ('stabilize_kot_orchestration.sql',       'KOT orchestration stabilization'),
  ('critical_fix_01_inventory_concurrency.sql', 'Critical: inventory concurrency fix'),
  ('critical_fix_02_finance_safety.sql',    'Critical: finance safety fix'),
  ('critical_fix_03_reporting_engine.sql',  'Critical: reporting engine fix'),
  ('critical_fix_04_notification_outbox.sql','Critical: notification outbox fix'),
  ('critical_fix_05_06_procurement_loyalty.sql','Critical: procurement and loyalty fix'),
  ('critical_fix_07_kds_concurrency.sql',   'Critical: KDS concurrency fix'),
  ('CRITICAL_fix_revoke_anon_functions.sql','Critical: revoke anon function access'),
  ('check_roles.sql',                       'Role check utilities'),
  ('verify_realtime_downstream.sql',        'Verify realtime downstream'),
  ('erp_security_lockdown.sql',             'Security lockdown: revoke anon, harden')
ON CONFLICT (filename) DO NOTHING;


-- =====================================================
-- PENDING MIGRATIONS — NOT YET APPLIED TO SUPABASE
-- Apply these via Supabase Dashboard → SQL Editor
-- in the order listed below.
-- =====================================================

-- APPLY IN ORDER (each depends on helpers from erp_security_lockdown.sql):

-- [1] CRITICAL SECURITY — Apply first
-- fix_missing_rls_policies.sql
--   19-section RLS hardening (companies, branches, journal_entries, finance,
--   payroll, AI tables, user_roles, customer_sessions, loyalty, audit_logs, uom)
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_missing_rls_policies.sql', 'Security: 19-section RLS hardening')
--     ON CONFLICT DO NOTHING;

-- [1b] CRITICAL SECURITY — Apply after fix_price_and_discount_security.sql
-- security_lockdown_apply.sql   (ERP-DB-Fixer, task #73 + #38, 2026-07-23)
--   Master delta file. Closes gaps not covered by [1]/[3]:
--     • #38 variant-aware POS unit_price validation (fixes base_price-only gap)
--       + process_cashier_payment ignores client p_amount_paid (charges
--       server-side orders.total_amount).
--     • #34 revoke anon writes on notifications/delivery_tracking/kot_items/
--       kot_tickets; drop delivery_tracking WITH CHECK(true) INSERT (dt_ins).
--     • #35 testimonials public SELECT limited to moderated rows.
--   Prereqs: erp_security_lockdown.sql, fix_missing_rls_policies.sql,
--            fix_price_and_discount_security.sql. Idempotent / re-runnable.
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('security_lockdown_apply.sql', 'Security: #38 variant price + payment recompute, #34 anon-write revoke, #35 testimonials')
--     ON CONFLICT DO NOTHING;

-- [2] CRITICAL — Apply after fix_missing_rls_policies.sql
-- fix_rls_missing_tables.sql
--   RLS for 15 base-schema tables with no policies at all:
--   kitchens, restaurant_tables, categories, menu_items, ingredients, recipes,
--   stock_movements, payments, order_items, kot_tickets, kot_items,
--   order_status_logs, roles, role_permissions, user_branches
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_rls_missing_tables.sql', 'Security: RLS for 15 unprotected operational tables')
--     ON CONFLICT DO NOTHING;

-- [3] CRITICAL — Apply before onboarding any waiters
-- fix_accept_order_overload.sql
--   Drop 1-arg accept_order_as_waiter overload to prevent PGRST203.
--   Then re-run rpc_waiter_accept_order.sql to ensure canonical 2-arg version.
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_accept_order_overload.sql', 'Fix: drop 1-arg overload of accept_order_as_waiter')
--     ON CONFLICT DO NOTHING;

-- [4] CRITICAL FUNCTIONALITY
-- offline_sync_rpcs.sql
--   5 offline sync RPCs (pos_create_order, waiter_accept_order, etc.)
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('offline_sync_rpcs.sql', 'Offline sync RPCs: pos_create_order, waiter_accept_order, etc.')
--     ON CONFLICT DO NOTHING;

-- [5] HIGH — Performance (safe to apply anytime, all IF NOT EXISTS)
-- fix_missing_indexes.sql
--   13 missing FK indexes on core schema tables + additional high-value indexes
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_missing_indexes.sql', 'Perf: 13 missing FK indexes + additional query indexes')
--     ON CONFLICT DO NOTHING;

-- [6] HIGH — Data integrity constraints
-- fix_order_data_integrity.sql
--   payments: amount > 0, valid method CHECK constraints
--   orders: discount non-negative cap, service_charge_rate column
--   Remove duplicate trg_order_status trigger (double audit log entries)
--   ⚠️ Check for zero-amount payments first: SELECT COUNT(*) FROM payments WHERE amount <= 0;
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_order_data_integrity.sql', 'Data integrity: payment constraints, discount cap, duplicate trigger')
--     ON CONFLICT DO NOTHING;

-- [7] HIGH — Server-side discount RPC (replaces client-side discount logic)
-- fix_apply_discount_rpc.sql
--   apply_discount_to_order(order_id, pct, reason) — validates 0-100%, checks state
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_apply_discount_rpc.sql', 'Security: server-side discount validation RPC')
--     ON CONFLICT DO NOTHING;

-- [8] MEDIUM — Multi-tenancy (requires data review for multi-company deployments)
-- fix_company_id_columns.sql
--   Adds company_id to menu_items, categories, ingredients, recipes,
--   stores, stock_levels, stock_movements + backfill + indexes
--   ⚠️ Review backfill logic for multi-company setups before applying
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_company_id_columns.sql', 'Multi-tenancy: company_id on 7 core tables')
--     ON CONFLICT DO NOTHING;

-- [9] MEDIUM — Order status guard
-- fix_order_status_machine.sql
--   BEFORE UPDATE trigger: blocks invalid order status transitions
--   ⚠️ Test on staging first — will reject non-sequential status changes
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_order_status_machine.sql', 'Data integrity: order status transition guard trigger')
--     ON CONFLICT DO NOTHING;

-- [10] LOW — Soft delete for menu items / categories / ingredients
-- fix_soft_delete.sql
--   Adds deleted_at column + partial indexes + soft_delete_menu_item() RPC
--   After applying:
--     INSERT INTO applied_migrations (filename, notes)
--     VALUES ('fix_soft_delete.sql', 'Feature: soft delete for menu_items, categories, ingredients, recipes')
--     ON CONFLICT DO NOTHING;
