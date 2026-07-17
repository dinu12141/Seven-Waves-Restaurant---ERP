# Migrations — Seven Waves Restaurant ERP

> Migration strategy, gap analysis, and dependency-safe application order

---

## 1. Current State

### Migration Approach

**No migration runner is in use.** All SQL is applied manually via:
- Supabase Dashboard SQL Editor
- Supabase MCP tool (`mcp__supabase__execute_sql` with `project_id="clykwuzajtwvwuavmtzs"`)
- Direct psql connection

### Applied Migration Files (in `supabase/migrations/`)

| File | Date | Purpose | Status |
|------|------|---------|--------|
| `20260314130000_kot_inventory_deduction_engine.sql` | 2026-03-14 | KOT inventory deduction | Applied |
| `20260322_inventory_indexes.sql` | 2026-03-22 | Inventory performance indexes | Applied |
| `20260322_fix_recipe_rpcs.sql` | 2026-03-22 | Recipe RPC fixes | Applied |
| `20260322_uom_conversions.sql` | 2026-03-22 | Unit of measure conversions | Applied |
| `20260323_create_payroll_history.sql` | 2026-03-23 | Payroll history table | Applied |
| `20260323_create_order_notifier_webhook.sql` | 2026-03-23 | Order webhook | Applied |
| `20260323_create_inventory_alerts_webhook.sql` | 2026-03-23 | Inventory alerts webhook | Applied |
| `20260323_finance_module_schema.sql` | 2026-03-23 | Finance module tables | Applied |
| `20260323_finance_phase3_payroll.sql` | 2026-03-23 | Finance payroll integration | Applied |
| `20260323_enable_salary_realtime.sql` | 2026-03-23 | Realtime for salary data | Applied |
| `20260323_finance_phase4_reports.sql` | 2026-03-23 | Finance report views | Applied |
| `20260324_create_delivery_tracking.sql` | 2026-03-24 | Delivery tracking tables | Applied |
| `20260325_fix_rider_accept_full_pipeline.sql` | 2026-03-25 | Rider accept RPC fix | Applied |
| `20260325_fix_website_order_flow.sql` | 2026-03-25 | Website order fixes | Applied |
| `20260325_allow_multiple_shifts_per_employee.sql` | 2026-03-25 | Drop UNIQUE on (employee_id, date) | Applied |
| `20260325_hr_documents_leave_attendance_payroll.sql` | 2026-03-25 | HR extended schema | Applied |
| `20260325_payroll_complete_engine.sql` | 2026-03-25 | Full payroll engine | Applied |
| `20260325_shift_allowance_final_settlement.sql` | 2026-03-25 | Shift allowances | Applied |
| `20260328164004_finance_banks_update.sql` | 2026-03-28 | Bank account updates | Applied |
| `20260328183516_create_cogs_report_rpc.sql` | 2026-03-28 | COGS report RPC | Applied |
| `20260404_procurement_bill_allocation.sql` | 2026-04-04 | AP bill allocation | Applied |

### Root SQL Files (Applied at Initial Setup)

| File | Purpose |
|------|---------|
| `schema.sql` | Base tables (companies, branches, profiles, orders) |
| `orders.sql` | Enhanced orders + triggers + KOT |
| `billing.sql` | Invoices, payments |
| `inventory.sql` | Inventory module |
| `inventory_module.sql` | Advanced inventory (items, warehouses, ledger) |
| `hr_payroll.sql` | HR + payroll tables |
| `hrms_complete_module.sql` | Extended HRMS |
| `procurement.sql` | Procurement module |
| `rbac.sql` | Legacy RBAC (superseded by schema.sql) |
| `rbac_rls.sql` | RLS for RBAC |
| `rls_restaurant_flow.sql` | Core RLS policies |
| `shift_access_control.sql` | Shift-aware waiter access |
| `erp_security_lockdown.sql` | Security hardening + audit |
| `kot_orchestration_v2.sql` | KOT orchestration engine |
| `sprint1_kot_orchestration_engine.sql` | KOT pipeline v1 |
| `customer_loyalty_system.sql` | Loyalty schema documentation |
| `notifications.sql` | Notification queue |
| `printers.sql` | Printer management |
| `biometric_integration.sql` | Biometric device integration |
| `menu_management.sql` | Menu management RPCs |
| `menu_recipes.sql` | Recipe management |
| `recipe_bom_engine.sql` | BOM cost calculation |
| `mcp_warehouse_engine.sql` | Warehouse management |
| `mcp_touch_screen_menu.sql` | Touch menu integration |
| `table_ordering_features.sql` | QR ordering features |
| `table_device_login_customer_sessions.sql` | Customer session management |

---

## 2. Gap Analysis

### Critical Missing Migrations

| Gap | Priority | SQL Needed |
|-----|---------|-----------|
| **RLS on `profiles`** | CRITICAL | Add self-read + admin-all policy |
| **RLS on `user_roles`** | CRITICAL | Add self-read + admin-all policy |
| **RLS on `salary_structures`** | HIGH | Self-read + hr-all + admin-all |
| **Finance module RLS hardening** | HIGH | Replace `authenticated` blanket policies |
| **`company_id` on `menu_items`** | HIGH | Add column + backfill + RLS update |
| **`company_id` on `categories`** | HIGH | Add column + backfill |
| **Policy accumulation cleanup** | HIGH | Drop duplicate order policies |
| **`pg_trgm` extension + indexes** | MEDIUM | Full-text search setup |
| **`orders` partitioning** | MEDIUM | Convert to partitioned table |
| **Missing indexes** | MEDIUM | See DATABASE_DESIGN.md §3 |
| **Optimistic locking** | LOW | Add `version` column to orders |
| **`get_user_company_id()` helper** | MEDIUM | New auth helper function |
| **Customer sessions table** | HIGH | QR kiosk session persistence |
| **`reservations` table** | MEDIUM | Table reservation feature |
| **`delivery_assignments` table** | MEDIUM | Rider-to-order assignments |
| **Soft delete for orders** | LOW | Add `deleted_at` or rely on status |

---

## 3. Migration Order (Dependency-Safe)

When applying to a fresh database, execute in this order:

### Phase 0: Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search
```

### Phase 1: Core Org Structure

```
1.1  schema.sql              -- companies, branches, kitchens, profiles, roles
1.2  rbac_rls.sql            -- auth_has_role() function
1.3  auth_has_role.sql       -- auth helper functions
```

### Phase 2: Menu & Restaurant

```
2.1  schema.sql (menu section) -- categories, menu_items, ingredients, recipes
2.2  menu_management.sql       -- menu RPCs
2.3  missing_menu_columns.sql  -- add missing columns
```

### Phase 3: Orders & KOT

```
3.1  orders.sql              -- orders, order_items, order_status_logs, kot_tickets, kot_items
3.2  shift_access_control.sql -- shifts tables + auth_is_on_shift()
3.3  rls_restaurant_flow.sql  -- core RLS policies
3.4  kot_orchestration_v2.sql -- orchestration engine
3.5  sprint1_kot_orchestration_engine.sql
3.6  rpc_waiter_accept_order.sql
3.7  stabilize_kot_orchestration.sql
```

### Phase 4: Billing & Payments

```
4.1  billing.sql             -- payment_methods, invoices, invoice_items, payments
4.2  system_modules.sql      -- POS invoice tables if needed
```

### Phase 5: Inventory

```
5.1  inventory.sql           -- suppliers, stock_items, stock_levels, stock_movements, grn
5.2  inventory_module.sql    -- items, uom, warehouses, stock_on_hand, inventory_ledger
5.3  mcp_warehouse_engine.sql
5.4  bom_recipe_rpc.sql
5.5  recipe_bom_engine.sql
5.6  migrations/20260314130000_kot_inventory_deduction_engine.sql
5.7  migrations/20260322_inventory_indexes.sql
5.8  migrations/20260322_uom_conversions.sql
5.9  migrations/20260322_fix_recipe_rpcs.sql
```

### Phase 6: Procurement

```
6.1  procurement_settings.sql
6.2  procurement.sql
6.3  procurement_functions.sql
6.4  migrations/20260404_procurement_bill_allocation.sql
```

### Phase 7: HR & Payroll

```
7.1  hr_payroll.sql
7.2  hrms_complete_module.sql
7.3  hr_payroll_enhancements.sql
7.4  leave_management.sql
7.5  employee_advances_expenses.sql
7.6  payroll_engine.sql
7.7  migrations/20260323_create_payroll_history.sql
7.8  migrations/20260325_allow_multiple_shifts_per_employee.sql
7.9  migrations/20260325_hr_documents_leave_attendance_payroll.sql
7.10 migrations/20260325_payroll_complete_engine.sql
7.11 migrations/20260325_shift_allowance_final_settlement.sql
```

### Phase 8: Finance

```
8.1  migrations/20260323_finance_module_schema.sql
8.2  migrations/20260323_finance_phase3_payroll.sql
8.3  migrations/20260323_finance_phase4_reports.sql
8.4  migrations/20260328164004_finance_banks_update.sql
8.5  migrations/20260328183516_create_cogs_report_rpc.sql
8.6  finance_integration.sql
8.7  fix_payroll_finance_post.sql
```

### Phase 9: CRM & Loyalty

```
9.1  table_device_login_customer_sessions.sql
9.2  table_ordering_features.sql
9.3  customer_loyalty_system.sql (schema docs — actual schema via migrations)
```

### Phase 10: Delivery & Notifications

```
10.1 notifications.sql
10.2 migrations/20260324_create_delivery_tracking.sql
10.3 delivery_assignments_migration.sql
10.4 migrations/20260325_fix_rider_accept_full_pipeline.sql
```

### Phase 11: Security Hardening

```
11.1 erp_security_lockdown.sql
11.2 rls_customer_session_hardening.sql
11.3 fix_cashier_kot_realtime.sql
11.4 cashier_order_items_rls_fix.sql
11.5 cashier_accept_rpc_fix.sql
```

### Phase 12: Device Integration

```
12.1 printers.sql
12.2 biometric_integration.sql
```

### Phase 13: Webhooks & Realtime

```
13.1 migrations/20260323_create_order_notifier_webhook.sql
13.2 migrations/20260323_create_inventory_alerts_webhook.sql
13.3 migrations/20260323_enable_salary_realtime.sql
13.4 realtime_downstream.sql
```

### Phase 14: Admin & Reporting

```
14.1 erp_reporting_module.sql
14.2 admin_setup.sql
14.3 check_roles.sql
```

---

## 4. Rollback Strategy

### For Additive Changes (new tables, new columns)

```sql
-- Rollback: drop new table
DROP TABLE IF EXISTS new_table CASCADE;

-- Rollback: drop new column
ALTER TABLE existing_table DROP COLUMN IF EXISTS new_column;

-- Rollback: drop new function
DROP FUNCTION IF EXISTS new_function(arg_types);

-- Rollback: drop new index
DROP INDEX IF EXISTS idx_new_index;
```

### For Destructive Changes (column renames, type changes)

Always create a backup before applying:

```sql
-- Backup a table before migration
CREATE TABLE orders_backup_20260716 AS SELECT * FROM orders;

-- After verifying migration success, drop backup
-- DROP TABLE orders_backup_20260716;
```

### For RLS Policy Changes

```sql
-- Rollback: drop new policy, re-enable old
DROP POLICY IF EXISTS new_policy ON target_table;

-- Re-create old policy if needed
CREATE POLICY old_policy ON target_table FOR SELECT USING (...);
```

---

## 5. Data Seeding Plan

### Required Seed Data (Mandatory)

```sql
-- 1. Default roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'System Administrator'),
  ('manager', 'Branch Manager'),
  ('waiter', 'Wait Staff'),
  ('cashier', 'Cashier'),
  ('kitchen', 'Kitchen Staff'),
  ('hr', 'Human Resources'),
  ('inventory', 'Inventory Manager'),
  ('finance', 'Finance Manager'),
  ('delivery', 'Delivery Rider'),
  ('procurement', 'Procurement Officer')
ON CONFLICT (name) DO NOTHING;

-- 2. Default payment methods
INSERT INTO payment_methods (name, description) VALUES
  ('Cash', 'Cash payment'),
  ('Card', 'Credit/Debit Card'),
  ('Online', 'Online Transfer'),
  ('Loyalty', 'Loyalty coin redemption')
ON CONFLICT (name) DO NOTHING;

-- 3. Default loyalty tiers
INSERT INTO loyalty_tiers (tier_code, tier_name, min_coins, max_coins, badge_color, rank_order) VALUES
  ('STANDARD', 'Standard', 0, 99, '#9E9E9E', 1),
  ('SILVER', 'Silver', 100, 249, '#C0C0C0', 2),
  ('GOLD', 'Gold', 250, 999999, '#FFD700', 3)
ON CONFLICT (tier_code) DO NOTHING;

-- 4. Default loyalty rules
INSERT INTO loyalty_rules (rule_name, spend_amount, coins_earned, is_active) VALUES
  ('DEFAULT_EARN', 5000, 1, true)
ON CONFLICT DO NOTHING;

-- 5. Default tax codes
INSERT INTO tax_codes (code, name, rate, tax_type) VALUES
  ('VAT-OUT', 'VAT Output 15%', 15, 'output'),
  ('VAT-IN', 'VAT Input 15%', 15, 'input'),
  ('SVC-TAX', 'Service Tax 10%', 10, 'output'),
  ('EXEMPT', 'Tax Exempt', 0, 'exempt')
ON CONFLICT (code) DO NOTHING;
```

### Demo Seed Data (For Testing)

```sql
-- Demo company + branch + admin user
INSERT INTO companies (id, name, phone, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Seven Waves Restaurant', '+94 11 234 5678', 'admin@sevenwaves.lk')
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, company_id, name, address, is_main) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Main Branch', 'Colombo 03, Sri Lanka', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO kitchens (id, company_id, branch_id, name, is_active) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Main Kitchen', true)
ON CONFLICT (id) DO NOTHING;

-- Demo menu categories + items
INSERT INTO categories (id, name, sort_order) VALUES
  ('aaaa0001-0000-0000-0000-000000000001', 'Starters', 1),
  ('aaaa0001-0000-0000-0000-000000000002', 'Main Course', 2),
  ('aaaa0001-0000-0000-0000-000000000003', 'Beverages', 3),
  ('aaaa0001-0000-0000-0000-000000000004', 'Desserts', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO menu_items (id, category_id, name, price, kitchen_id, is_available) VALUES
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000001', 'Spring Rolls', 850.00, '33333333-3333-3333-3333-333333333333', true),
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000002', 'Grilled Chicken', 2400.00, '33333333-3333-3333-3333-333333333333', true),
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000002', 'Fish & Chips', 2800.00, '33333333-3333-3333-3333-333333333333', true),
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000003', 'Fresh Lime Soda', 350.00, '33333333-3333-3333-3333-333333333333', true),
  (gen_random_uuid(), 'aaaa0001-0000-0000-0000-000000000004', 'Chocolate Lava Cake', 950.00, '33333333-3333-3333-3333-333333333333', true)
ON CONFLICT DO NOTHING;

-- Demo restaurant tables
INSERT INTO restaurant_tables (company_id, branch_id, table_number, section, capacity, status)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'T0' || generate_series::text,
  'Main Hall',
  4,
  'available'
FROM generate_series(1, 10)
ON CONFLICT (branch_id, table_number) DO NOTHING;
```

---

## 6. Next Migrations to Write

Priority order for upcoming sprints:

### CRITICAL (security fixes)

```sql
-- M-001: Fix profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_admin ON profiles FOR ALL USING (is_admin() OR is_hr()) WITH CHECK (is_admin() OR is_hr());
CREATE POLICY profiles_self_update ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- M-002: Fix user_roles RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_roles_admin ON user_roles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY user_roles_self ON user_roles FOR SELECT USING (user_id = auth.uid());

-- M-003: Fix salary_structures RLS
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_admin ON salary_structures FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY ss_hr ON salary_structures FOR ALL USING (is_hr()) WITH CHECK (is_hr());
CREATE POLICY ss_self ON salary_structures FOR SELECT
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = salary_structures.employee_id AND e.profile_id = auth.uid()));

-- M-004: Fix finance module blanket policies
-- Replace 'authenticated' policies on: chart_of_accounts, journal_entries, fiscal_periods,
-- bank_accounts, expense_entries, payroll_cycles, payroll_records, payroll_line_items
```

### HIGH (multi-tenancy)

```sql
-- M-005: Add company_id to menu_items
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
-- Backfill from branch via kitchen
UPDATE menu_items SET company_id = k.company_id
FROM kitchens k WHERE k.id = menu_items.kitchen_id;
-- Update RLS to include company_id check

-- M-006: Add company_id to categories  
ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
```

### MEDIUM (performance)

```sql
-- M-007: Full-text search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm ON menu_items USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stock_items_name_trgm ON stock_items USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING GIN (name gin_trgm_ops);

-- M-008: Missing FK indexes
CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter ON orders(assigned_waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_card_no ON loyalty_accounts(loyalty_card_no);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code ON journal_lines(account_code);
```
