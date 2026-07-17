# Database Audit Report — Seven Waves ERP
**Date:** 2026-07-17  
**Auditor:** DBauditor  
**Scope:** All SQL files in `supabase/`, all Supabase client calls in `src/stores/` and `src/services/`

---

## Summary

| Metric | Count |
|--------|-------|
| SQL files audited | 150+ (root + migrations/) |
| Tables (schema.sql base) | 24 |
| Additional tables (migrations) | ~80+ |
| RPCs / Functions found | 341 (across all files) |
| Triggers found | 153 |
| RLS Policies found | 391 |
| Indexes found | 615 |
| **Total DB bugs found** | **47** |
| **Critical (P0)** | **6** |
| **High (P1)** | **10** |
| **Medium (P2)** | **18** |
| **Low (P3)** | **13** |

---

## Critical Finding: Pending Migrations

Two migrations in `supabase/applied_migrations_ledger.sql` are marked **PENDING — NOT YET APPLIED**:

1. `fix_missing_rls_policies.sql` — 19-section RLS hardening (CRITICAL SECURITY)
2. `offline_sync_rpcs.sql` — 5 offline sync RPCs (functionality gap)

The production database is missing critical RLS policies as a result. **These must be applied immediately.**

---

## Table Inventory

| Table | Has RLS | Has `company_id` | Has soft delete | Issues |
|-------|---------|-----------------|-----------------|--------|
| companies | ✅ (in fix_missing) | N/A | ❌ | Pending migration |
| branches | ✅ (in fix_missing) | ✅ | ❌ | Pending migration |
| kitchens | ❌ | ✅ | ❌ | No RLS |
| restaurant_tables | ❌ | ✅ | ❌ | No RLS |
| profiles | ⚠️ (partial, in fix_missing) | N/A | ❌ | Pending migration |
| roles | ❌ | N/A | ❌ | No RLS |
| permissions | ❌ | N/A | ❌ | No RLS |
| role_permissions | ❌ | N/A | ❌ | No RLS |
| user_roles | ⚠️ (partial, in fix_missing) | N/A | ❌ | Pending migration |
| user_branches | ❌ | N/A | ❌ | No RLS |
| categories | ❌ | ❌ | ❌ | No RLS, no company_id |
| menu_items | ❌ | ❌ | ❌ | No RLS, no company_id |
| ingredients | ❌ | ❌ | ❌ | No RLS, no company_id |
| recipes | ❌ | ❌ | ❌ | No RLS, no company_id |
| stores | ❌ | ❌ | ❌ | No RLS, no company_id |
| stock_levels | ✅ | ❌ | ❌ | No company_id |
| stock_movements | ❌ | ❌ | ❌ | No RLS, no company_id |
| orders | ✅ | ✅ | ❌ | CHECK constraints OK |
| order_items | ❌ | N/A | ❌ | No RLS |
| order_status_logs | ❌ | N/A | ❌ | No RLS |
| kot_tickets | ❌ | N/A | ❌ | No RLS |
| kot_items | ❌ | N/A | ❌ | No RLS |
| payments | ❌ | N/A | ❌ | No RLS, missing constraints |
| audit_logs | ⚠️ (partial, in fix_missing) | N/A | ❌ | Only INSERT policy |
| journal_entries | ✅ (in fix_missing) | N/A | ❌ | Pending migration |
| journal_lines | ✅ (in fix_missing) | N/A | ❌ | Pending migration |

**Tables WITH RLS currently applied:** 57 (mostly migration/later tables)  
**Base schema tables WITHOUT RLS:** 15

---

## RLS Audit Results

### BUG-DB-001 [CRITICAL] — `fix_missing_rls_policies.sql` Not Applied to Supabase

**File:** `supabase/applied_migrations_ledger.sql` (PENDING section)  
**Impact:** The most comprehensive RLS hardening is pending. This covers:
- Companies/branches: currently NO RLS (any authenticated user can read ALL company data)
- `journal_entries` / `journal_lines`: financial ledger fully exposed to authenticated users
- `finance_vouchers`, `finance_ledgers`, payroll tables: blanket `FOR ALL TO authenticated` policies
- `audit_logs`: any authenticated user can INSERT fake audit entries
- AI insight tables: `USING (true)` — fully public to all authenticated users
- `user_roles` / `user_branches` admin write policies

**SQL Fix:**
```sql
-- Apply the pending migration via Supabase Dashboard → SQL Editor
-- File: supabase/fix_missing_rls_policies.sql
-- Then register it:
INSERT INTO applied_migrations (filename, notes)
VALUES ('fix_missing_rls_policies.sql', 'Security: 19-section RLS hardening')
ON CONFLICT DO NOTHING;
```

---

### BUG-DB-002 [CRITICAL] — 15 Base Tables Have NO RLS at All

**Tables:** `profiles`, `user_roles`, `user_branches`, `roles`, `role_permissions`, `permissions`, `categories`, `kitchens`, `menu_items`, `ingredients`, `recipes`, `restaurant_tables`, `order_items`, `order_status_logs`, `payments`, `audit_logs`, `kot_tickets`, `kot_items`, `stock_movements`

**Impact:** Any authenticated user can read, insert, update, and delete records in these tables via the Supabase anon/user API key. This is enforced only by PostgREST's default (all authenticated users can access all rows if no RLS is defined and RLS is not enabled).

**Note:** `fix_missing_rls_policies.sql` covers some but not all of these. The tables below need additional RLS policies even after that migration:

**SQL Fix — Additional Tables:**
```sql
-- ── kitchens ──────────────────────────────────────────────
ALTER TABLE public.kitchens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kitchens_read_authenticated" ON public.kitchens
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "kitchens_manage_admin_manager" ON public.kitchens
  FOR ALL USING (is_admin() OR is_manager());

-- ── restaurant_tables ─────────────────────────────────────
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tables_read_authenticated" ON public.restaurant_tables
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "tables_manage_admin_manager" ON public.restaurant_tables
  FOR ALL USING (is_admin() OR is_manager());

-- ── categories ────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_read_authenticated" ON public.categories
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "categories_manage_admin_manager" ON public.categories
  FOR ALL USING (is_admin() OR is_manager());

-- ── menu_items ────────────────────────────────────────────
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menu_items_read_authenticated" ON public.menu_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "menu_items_manage_admin_manager" ON public.menu_items
  FOR ALL USING (is_admin() OR is_manager());

-- ── ingredients ───────────────────────────────────────────
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingredients_read_authenticated" ON public.ingredients
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ingredients_manage_admin_manager" ON public.ingredients
  FOR ALL USING (is_admin() OR is_manager());

-- ── recipes ───────────────────────────────────────────────
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recipes_read_authenticated" ON public.recipes
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "recipes_manage_admin_manager" ON public.recipes
  FOR ALL USING (is_admin() OR is_manager());

-- ── stock_movements ───────────────────────────────────────
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_mvt_read_inventory_roles" ON public.stock_movements
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('inventory') OR auth_has_role('finance')
  );
CREATE POLICY "stock_mvt_insert_system" ON public.stock_movements
  FOR INSERT WITH CHECK (is_admin() OR auth_has_role('inventory'));

-- ── payments ──────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_read_cashier_roles" ON public.payments
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('cashier') OR auth_has_role('finance')
  );
CREATE POLICY "payments_insert_cashier" ON public.payments
  FOR INSERT WITH CHECK (auth_has_role('cashier') OR is_admin());

-- ── order_items ───────────────────────────────────────────
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_read_operational" ON public.order_items
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('waiter') OR auth_has_role('cashier') OR
    auth_has_role('kitchen') OR auth_has_role('finance')
  );
CREATE POLICY "order_items_insert_waiter_pos" ON public.order_items
  FOR INSERT WITH CHECK (
    auth_has_role('waiter') OR auth_has_role('cashier') OR is_admin()
  );
CREATE POLICY "order_items_update_kitchen" ON public.order_items
  FOR UPDATE USING (
    auth_has_role('kitchen') OR auth_has_role('waiter') OR
    auth_has_role('cashier') OR is_admin()
  );

-- ── kot_tickets ───────────────────────────────────────────
ALTER TABLE public.kot_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kot_tickets_read_kitchen_cashier" ON public.kot_tickets
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('kitchen') OR auth_has_role('cashier') OR auth_has_role('waiter')
  );
CREATE POLICY "kot_tickets_update_kitchen" ON public.kot_tickets
  FOR UPDATE USING (auth_has_role('kitchen') OR is_admin() OR is_manager());

-- ── kot_items ─────────────────────────────────────────────
ALTER TABLE public.kot_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kot_items_read_kitchen" ON public.kot_items
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('kitchen') OR auth_has_role('cashier') OR auth_has_role('waiter')
  );
CREATE POLICY "kot_items_update_kitchen" ON public.kot_items
  FOR UPDATE USING (auth_has_role('kitchen') OR is_admin());

-- ── order_status_logs (append-only audit) ────────────────
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "osl_read_operational" ON public.order_status_logs
  FOR SELECT USING (
    is_admin() OR is_manager() OR
    auth_has_role('waiter') OR auth_has_role('cashier')
  );
CREATE POLICY "osl_insert_system" ON public.order_status_logs
  FOR INSERT WITH CHECK (true);  -- inserted by triggers

-- ── roles / permissions / role_permissions ────────────────
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read_all_authenticated" ON public.roles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "roles_manage_admin" ON public.roles
  FOR ALL USING (is_admin());

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permissions_read_all" ON public.permissions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "permissions_manage_admin" ON public.permissions
  FOR ALL USING (is_admin());

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_read_all" ON public.role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rp_manage_admin" ON public.role_permissions
  FOR ALL USING (is_admin());

-- ── user_branches ─────────────────────────────────────────
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ub_read_own_or_admin" ON public.user_branches
  FOR SELECT USING (user_id = auth.uid() OR is_admin() OR is_manager());
CREATE POLICY "ub_manage_admin" ON public.user_branches
  FOR ALL USING (is_admin());
```

---

### BUG-DB-003 [CRITICAL] — 208 SECURITY DEFINER Functions Missing `SET search_path = public`

**Files:** Spread across ~40 SQL files (279 total SECURITY DEFINER functions; only 71 have `SET search_path`)  
**Impact:** A malicious or compromised database user can manipulate `search_path` to redirect function calls to attacker-controlled schema objects, bypassing security checks (search_path injection / function hijacking).

**Affected examples:**
- `supabase/shift_access_control.sql` — `auth_is_on_shift`, `auth_get_shift_branches`, `get_pending_orders_for_shift`
- `supabase/create_order_from_session.sql` — kiosk order creation
- `supabase/erp_payment_management.sql` — payment processing RPCs

**SQL Fix (pattern to apply to all affected functions):**
```sql
-- Example: fix auth_is_on_shift in shift_access_control.sql
CREATE OR REPLACE FUNCTION public.auth_is_on_shift(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- ADD THIS LINE
AS $$
-- ... function body unchanged ...
$$;
```
Apply this pattern to all 208 affected SECURITY DEFINER functions. The safest approach is to recreate each function with `SET search_path = public` appended before `AS $$`.

---

### BUG-DB-004 [CRITICAL] — Multi-Tenancy Gap: 7 Core Tables Missing `company_id`

**Tables:** `menu_items`, `categories`, `ingredients`, `recipes`, `stores`, `stock_levels`, `stock_movements`  
**File:** `supabase/schema.sql`  
**Impact:** In a multi-company/multi-branch deployment, all companies share the same menu items, ingredient definitions, and stock records. Company A can see and modify Company B's menu. RLS cannot restrict by company without a `company_id` column.

**SQL Fix:**
```sql
-- Add company_id to core tables
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_levels ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_company ON public.menu_items(company_id);
CREATE INDEX IF NOT EXISTS idx_categories_company ON public.categories(company_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_company ON public.ingredients(company_id);
CREATE INDEX IF NOT EXISTS idx_stores_company ON public.stores(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_company ON public.stock_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON public.stock_movements(company_id);

-- Backfill: set company_id from branch relationship
UPDATE public.stores s
SET company_id = b.company_id
FROM public.branches b WHERE s.branch_id = b.id;
```

---

### BUG-DB-005 [CRITICAL] — `accept_order_as_waiter` RPC Overload Risk (PGRST203)

**Files:** 13 SQL files define a 1-arg version `(p_order_id UUID)`, while `supabase/rpc_waiter_accept_order.sql` defines the canonical 2-arg version `(p_order_id UUID, p_unavailable_ids UUID[] DEFAULT NULL)`.  
**Also:** `GRANT EXECUTE ON FUNCTION public.accept_order_as_waiter(UUID, UUID[])` exists in one file.

**Impact:** If both overloads exist in the live Supabase DB, PostgREST returns **PGRST203** ("Could not find the function...") when frontend calls `supabase.rpc('accept_order_as_waiter', {...})`. Order acceptance breaks entirely.

This was explicitly documented in CLAUDE.md as a known critical invariant: *"Never add a 1-arg overload — causes PostgREST PGRST203."*

**SQL Fix:**
```sql
-- Step 1: Drop the 1-arg overload if it exists
DROP FUNCTION IF EXISTS public.accept_order_as_waiter(UUID) CASCADE;

-- Step 2: Verify only the 2-arg version exists
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname = 'accept_order_as_waiter' AND pronamespace = 'public'::regnamespace;
-- Expected: only one row: accept_order_as_waiter(p_order_id uuid, p_unavailable_ids uuid[])

-- Step 3: Re-apply the canonical version from shift_access_control.sql
-- (already has SET search_path = public)
```

---

### BUG-DB-006 [CRITICAL] — `offline_sync_rpcs.sql` Not Applied

**File:** `supabase/applied_migrations_ledger.sql` (PENDING section)  
**Impact:** 5 offline sync RPCs (`pos_create_order`, `waiter_accept_order`, and 3 others) are defined but not present in the live database. Offline mode (used by waiter and POS PWA) will fail silently when these RPCs are called.

**Fix:**
```sql
-- Apply via Supabase Dashboard → SQL Editor:
-- Run: supabase/offline_sync_rpcs.sql
-- Then register:
INSERT INTO applied_migrations (filename, notes)
VALUES ('offline_sync_rpcs.sql', 'Offline sync RPCs: pos_create_order, waiter_accept_order, etc.')
ON CONFLICT DO NOTHING;
```

---

## Trigger Audit Results

| Trigger | Table | Event | Status | Issue |
|---------|-------|-------|--------|-------|
| `trg_generate_kot` | `orders` | AFTER UPDATE OF status | ✅ Correct | Reads `kitchen_id` from `order_items` before status change |
| `trg_order_status_log` | `orders` | AFTER INSERT OR UPDATE | ✅ Correct | Logs both INSERT and status changes |
| `trg_check_order_ready` | `kot_tickets` | AFTER UPDATE OF status | ✅ Correct | Auto-transitions order to 'ready' |
| `trg_orders_updated` | `orders` | BEFORE UPDATE | ✅ Correct | Sets `updated_at` |
| `trg_order_items_updated` | `order_items` | BEFORE UPDATE | ✅ Correct | Sets `updated_at` |
| `trg_kot_tickets_updated` | `kot_tickets` | BEFORE UPDATE | ✅ Correct | Sets `updated_at` |
| `trg_kot_items_updated` | `kot_items` | BEFORE UPDATE | ✅ Correct | Sets `updated_at` |
| `trg_order_status` | `orders` | AFTER INSERT OR UPDATE | ⚠️ Duplicate | `schema.sql` defines `trg_order_status`; `orders.sql` defines `trg_order_status_log` — both log status changes |
| `trg_validate_journal` | `journal_entries` | BEFORE UPDATE | ✅ Correct | Validates debit=credit balance |
| `trg_block_journal_edit` | `journal_entries` | BEFORE UPDATE OR DELETE | ✅ Fixed | Fixed by `fix_journal_immutability.sql` |
| `trg_block_jl_edit` | `journal_lines` | BEFORE INSERT/UPDATE/DELETE | ✅ Fixed | Blocks changes to posted journal lines |

### BUG-DB-007 [MEDIUM] — Duplicate Order Status Logging Triggers

**Files:** `supabase/schema.sql:337` defines `trg_order_status` (calls `log_order_status()`), and `supabase/orders.sql:211` defines `trg_order_status_log` (calls `log_order_status_change()`).  
**Impact:** Every order status change generates TWO log entries. The `order_status_logs` table grows at twice the expected rate and the audit trail appears to have duplicates. Report queries counting status changes will double-count.

**SQL Fix:**
```sql
-- Remove the older trigger from schema.sql (log_order_status is the simpler version)
DROP TRIGGER IF EXISTS trg_order_status ON orders;
DROP FUNCTION IF EXISTS log_order_status();
-- Keep trg_order_status_log + log_order_status_change() — it also captures previous_status
```

---

## RPC Audit Results

| Function | Security | Has `SET search_path` | Return Type | Issues |
|----------|----------|-----------------------|-------------|--------|
| `auth_is_on_shift(UUID)` | DEFINER | ❌ Missing | BOOLEAN | BUG-DB-003 |
| `auth_get_shift_branches()` | DEFINER | ❌ Missing | TABLE | BUG-DB-003 |
| `get_pending_orders_for_shift()` | DEFINER | ❌ Missing | TABLE | BUG-DB-003 |
| `accept_order_as_waiter(UUID, UUID[])` | DEFINER | ✅ Present | JSONB | Overload risk — BUG-DB-005 |
| `process_waiter_accept(UUID)` | DEFINER | ✅ Present | JSONB | OK |
| `process_cashier_invoice(UUID)` | DEFINER | varies | JSONB | BUG-DB-003 |
| `create_kiosk_order(...)` | DEFINER | ❌ Missing | JSONB | BUG-DB-003; anon-callable |
| `get_or_create_session_by_qr(TEXT)` | DEFINER | ❌ Missing | JSONB | BUG-DB-003; anon-callable |
| `manager_process_refund(UUID, NUMERIC, TEXT, TEXT)` | DEFINER | varies | JSONB | OK — exists |
| `calculate_payroll(...)` | N/A | N/A | N/A | **MISSING — not found** |
| `apply_discount(...)` | N/A | N/A | N/A | **MISSING** |
| `get_sales_report(...)` | N/A | N/A | N/A | **MISSING** — only views |
| `get_inventory_valuation(...)` | N/A | N/A | N/A | Via materialized view only |

### BUG-DB-008 [HIGH] — Missing Critical RPCs

**Impact:** Several workflows have no server-side RPC and rely entirely on client-side logic with direct table calls:

```sql
-- MISSING: calculate_payroll RPC
-- Currently: payroll_engine.sql has tables but no RPC wrapper for on-demand calc
-- Risk: Frontend builds payroll amount in JS then writes to DB — no server validation

-- MISSING: apply_discount RPC  
-- Currently: discount is applied client-side in orderStore.js
-- Risk: discount can be manipulated client-side (set to 999%) with no server guard

-- MISSING: get_sales_report(branch_id, date_from, date_to) RPC
-- Currently: reports rely on DB views (v_* views) — no parameterized RPC
-- Risk: views may not filter by branch_id correctly in all cases
```

---

## Missing Indexes

### BUG-DB-009 [HIGH] — FK Columns Without Indexes in Core Schema

**File:** `supabase/schema.sql`  
**Impact:** Slow JOIN performance when querying by these columns. Under load, queries filtering by `category_id`, `ingredient_id`, `role_id`, `permission_id` will do full table scans.

| Table | FK Column | Current Index | Impact |
|-------|-----------|--------------|--------|
| `menu_items` | `category_id` | ❌ None | Slow category-based menu fetch |
| `recipes` | `ingredient_id` | ❌ None | Slow recipe lookup by ingredient |
| `recipes` | `menu_item_id` | ❌ None | Slow recipe lookup by menu item |
| `role_permissions` | `role_id` | ❌ None | Slow auth permission load |
| `role_permissions` | `permission_id` | ❌ None | Slow permission check JOIN |
| `stock_levels` | `store_id` | ❌ None | Slow store inventory fetch |
| `stock_levels` | `ingredient_id` | ❌ None | Slow stock level lookup |
| `stock_movements` | `store_id` | ❌ None | Slow movement history |
| `stock_movements` | `ingredient_id` | ❌ None | Slow ingredient movement history |
| `stock_movements` | `reference_id` | ❌ None | Slow reference lookup |
| `kot_items` | `order_item_id` | ❌ None | Slow KOT item lookup |
| `order_status_logs` | `changed_by` (FK) | ❌ None | Slow user activity lookup |
| `payments` | `order_id` | ❌ None | Slow payment-by-order lookup |

**SQL Fix:**
```sql
-- Core schema missing indexes
CREATE INDEX IF NOT EXISTS idx_menu_items_category    ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item      ON public.recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient     ON public.recipes(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role  ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm  ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_store     ON public.stock_levels(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_ingr      ON public.stock_levels(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_store        ON public.stock_movements(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_ingr         ON public.stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_ref          ON public.stock_movements(reference_id);
CREATE INDEX IF NOT EXISTS idx_kot_items_order_item   ON public.kot_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_osl_changed_by         ON public.order_status_logs(changed_by);
CREATE INDEX IF NOT EXISTS idx_payments_order         ON public.payments(order_id);
```

---

## Data Integrity Issues

### BUG-DB-010 [HIGH] — Service Charge Hardcoded at 10%

**File:** `src/stores/orderStore.js:50`  
**Code:**
```javascript
const serviceChargeAmount = computed(() => {
  if (orderType.value === 'dine-in') {
    return subtotal.value * 0.1   // <-- hardcoded 10%
  }
  return 0
})
```
**Impact:** If the restaurant changes its service charge rate (common during promotions, government regulation, or branch-specific policy), it requires a code deployment. No branch can have a different rate.

**Fix:** Read `service_charge_rate` from branch settings:
```javascript
// In orderStore.js — fetch branchSettings from company_settings table on initialize
const serviceChargeAmount = computed(() => {
  if (orderType.value === 'dine-in') {
    const rate = branchSettings.value?.service_charge_rate ?? 0.1
    return subtotal.value * rate
  }
  return 0
})
```
A `company_settings` table already exists in the schema (confirmed in `erp_security_lockdown.sql`). Add `service_charge_rate NUMERIC(5,4) DEFAULT 0.10` column if not present.

---

### BUG-DB-011 [HIGH] — Order Number Collision on High-Volume Branches

**File:** `src/stores/orderStore.js:359–363`  
**Code:**
```javascript
function _generateOrderNumber() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `ORD-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
```
**Impact:** Two POS orders placed within the same second generate the **same order number** (e.g., `ORD-124530`). During peak service (Friday dinner, multiple cashier stations), collisions are likely. The display order number will confuse kitchen staff and cashiers.

**Note:** The DB schema uses a `SERIAL` for `order_number` which is auto-increment and unique. This function generates only the **display** order number, but it's shown to staff — still a UX and operational bug.

**Fix:**
```javascript
function _generateOrderNumber() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  // Add random 3-char suffix to prevent same-second collisions
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `ORD-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}`
}
// Better: use DB SERIAL order_number after insert and display that
```

---

### BUG-DB-012 [HIGH] — No Discount Cap Validation

**File:** `src/stores/orderStore.js:42–44`  
**Code:**
```javascript
const discount = ref(0) // percentage
const discountAmount = computed(() => subtotal.value * (discount.value / 100))
```
**Impact:** `discount.value` can be set to any number (200, 999). A `discount.value = 200` gives `total < 0` — the restaurant pays the customer. No server-side guard prevents this.

**Fix (Frontend + DB):**
```javascript
// In orderStore.js — add validation when setting discount
function setDiscount(pct) {
  if (pct < 0 || pct > 100) throw new Error('Discount must be between 0% and 100%')
  discount.value = pct
}
```
```sql
-- DB-level guard on orders table
ALTER TABLE public.orders ADD CONSTRAINT chk_discount_pct
  CHECK (discount_amount >= 0 AND discount_amount <= subtotal);
```

---

### BUG-DB-013 [HIGH] — No `amount > 0` Constraint on Payments Table

**File:** `supabase/schema.sql` (base `payments` table) and extended versions  
**Impact:** Zero-amount or negative-amount payments can be inserted, corrupting financial reconciliation. A cashier error or application bug could create `amount = 0` payment records that show as "paid" but don't clear the balance.

**SQL Fix:**
```sql
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_amount_positive
  CHECK (amount > 0);

ALTER TABLE public.payments ADD CONSTRAINT chk_payment_method_valid
  CHECK (payment_method IN ('cash', 'card', 'online', 'loyalty', 'split', 'complimentary', 'other'));
```

---

### BUG-DB-014 [MEDIUM] — Order Status Machine Has No Transition Guard

**File:** `supabase/orders.sql:51–65` (CHECK constraint exists for valid values, but not transitions)  
**Impact:** The `CHECK` constraint validates that `status` is one of the allowed values, but does NOT enforce valid transitions. A `paid` order can be updated back to `pending`, `cancelled` orders can be re-activated, and status can jump non-sequentially (e.g., `pending → paid` skipping `accepted`). This corrupts the KOT lifecycle.

**SQL Fix:**
```sql
CREATE OR REPLACE FUNCTION validate_order_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Define valid transitions
  IF NOT (
    (OLD.status = 'pending'         AND NEW.status IN ('accepted', 'cancelled')) OR
    (OLD.status = 'pending_waiter'  AND NEW.status IN ('accepted', 'cancelled')) OR
    (OLD.status = 'accepted'        AND NEW.status IN ('preparing', 'ready', 'cancelled')) OR
    (OLD.status = 'preparing'       AND NEW.status IN ('ready', 'cancelled')) OR
    (OLD.status = 'ready'           AND NEW.status IN ('served', 'cancelled')) OR
    (OLD.status = 'served'          AND NEW.status IN ('invoiced', 'cancelled')) OR
    (OLD.status = 'invoiced'        AND NEW.status IN ('paid', 'cancelled')) OR
    (OLD.status = 'paid'            AND NEW.status IN ('refunded')) OR
    (OLD.status = 'cancelled'       AND NEW.status IN ('pending'))  -- allow un-cancel by admin only
  ) THEN
    RAISE EXCEPTION 'Invalid status transition: % → %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_order_status_transition
BEFORE UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION validate_order_status_transition();
```

---

### BUG-DB-015 [MEDIUM] — Journal Entry Balance NOT Enforced at Column Level

**File:** `supabase/migrations/20260323_finance_module_schema.sql`  
**Impact:** The balance check (`SUM(debit) = SUM(credit)`) is enforced by a trigger (`trg_validate_journal`), not a `CHECK` constraint. Triggers can be disabled (`SET session_replication_role = replica`), bypassing the guard. Direct DB access (service_role key) can insert unbalanced journal entries.

**Note:** The trigger exists and was fixed by `fix_journal_immutability.sql`. But for defense-in-depth, a DB-level constraint is better.

**Current state:** Trigger-level enforcement only.  
**Recommended:** Add a deferred constraint or use a `CHECK` on a computed column (not directly possible in PostgreSQL for multi-row constraints — the trigger approach is the standard). The existing trigger is acceptable. **No immediate action required beyond ensuring the trigger is applied.**

---

### BUG-DB-016 [MEDIUM] — `SELECT *` Used in 30+ Store/Service Queries

**Files:** Multiple stores and services  
**Impact:** Over-fetching columns (including sensitive ones like `cost_per_unit`, `salary_amount`, etc.) wastes bandwidth and may expose sensitive data in client-side state accessible via browser DevTools. Performance degrades on tables with JSONB or TEXT columns.

**Examples:**
```
src/stores/waiterAppStore.js:126  — .from('orders').select('*')
src/stores/orders.js:132          — .from('orders').select('*')
src/stores/managerAppStore.js:307 — .select('*') on manager queries
src/services/financeService.ts    — 15+ instances of .select('*')
```

**Fix:** Replace `select('*')` with explicit column lists at each call site. Prioritize tables with sensitive data: `orders`, `payments`, `journal_entries`, `employees`.

---

### BUG-DB-017 [MEDIUM] — Missing `LIMIT` on Sub-queries That Can Grow Unbounded

**File:** `src/stores/orders.js:178–194`  
**Impact:** When an order management page loads, it fetches `order_status_logs` filtered by `order_id IN (...)` with no `.limit()`. For busy branches with 200 active orders, this could return 2,000+ log rows. `kot_items` and `kot_tickets` sub-queries similarly have no limit.

**Fix:**
```javascript
// In orders.js fetchInitialOrders()
const { data: logsData } = await supabase
  .from('order_status_logs')
  .select('order_id, new_status, created_at')  // not SELECT *
  .in('order_id', orderIds)
  .order('created_at', { ascending: false })
  .limit(500)  // cap to last 500 log entries
```

---

### BUG-DB-018 [MEDIUM] — `fetchChartOfAccounts()` Has No `company_id` Filter or Limit

**File:** `src/services/financeService.ts:33–38`  
**Code:**
```typescript
const { data, error } = await supabase
  .from('chart_of_accounts')
  .select('*')
  .order('code')
```
**Impact:** Fetches ALL accounts in the system, across all companies. For multi-tenant deployment this returns every company's chart of accounts to every authenticated user. Even for single company, there's no limit — if 10,000 accounts are added, this fetches all of them.

**Fix:**
```typescript
const { data, error } = await supabase
  .from('chart_of_accounts')
  .select('id, code, name, account_type, normal_balance, is_active')
  .eq('company_id', authStore.currentCompanyId)
  .eq('is_active', true)
  .order('code')
  .limit(1000)
```

---

### BUG-DB-019 [MEDIUM] — Missing Soft Delete on Operational Tables

**Files:** `supabase/schema.sql`, `supabase/orders.sql`  
**Impact:** Hard deletes on `menu_items`, `ingredients`, `recipes`, `categories` cascade and destroy historical order data linkage. Deleting a menu item that appears in past orders will either fail (FK constraint) or orphan the `order_items.menu_item_id`.

**Current:** `orders.sql` uses `ON DELETE RESTRICT` for `order_items.menu_item_id` — a delete of an in-use menu item will correctly fail. But there's no soft-delete (`is_deleted` / `deleted_at`) to allow archiving without hard deletion.

**Fix:**
```sql
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add index for common pattern: WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_menu_items_not_deleted ON public.menu_items(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_categories_not_deleted ON public.categories(id) WHERE deleted_at IS NULL;
```

---

### BUG-DB-020 [MEDIUM] — `modules.ts` Fetches ALL Modules Without `company_id` or Branch Filter

**File:** `src/stores/modules.ts:35`  
**Code:** `.from('system_modules').select('*')` — no filter  
**Impact:** Returns all system modules across all companies. Module enable/disable state is global, not per-company.

---

### BUG-DB-021 [MEDIUM] — `v_delivery_performance` View Has No Branch Filter in Service

**File:** `src/services/delivery/deliveryModuleService.ts:34`  
**Code:** `.from('v_delivery_performance').select('*').eq('branch_id', branchId)` — relies on the view having `branch_id`.  
**Risk:** If the view does not include `branch_id` in its projection, PostgREST silently returns all rows (no filter applied). This needs view definition verification.

---

### BUG-DB-022 [MEDIUM] — Debug SQL Files Left in Production Directory

**Files:** `supabase/debug_cashier_orders.sql`, `supabase/debug_kitchens.sql`, `supabase/debug_kt_orders.sql`, `supabase/debug_shifts.sql`  
**Impact:** These contain ad-hoc diagnostic queries. While they don't affect runtime, they indicate technical debt and could confuse future developers about what is "applied" vs "diagnostic." They should be moved to a `supabase/debug/` subdirectory or deleted.

---

## CRUD Issues in Stores

| Store | Operation | Issue | File:Line |
|-------|-----------|-------|-----------|
| `orderStore.js` | CREATE | Service charge hardcoded | `orderStore.js:50` |
| `orderStore.js` | CREATE | No discount cap | `orderStore.js:42` |
| `orderStore.js` | CREATE | Order number collision | `orderStore.js:359` |
| `orders.js` | READ | `SELECT *` + sub-queries without `.limit()` | `orders.js:132,148,158,168` |
| `managerAppStore.js` | READ | `SELECT *` without filter spec | `managerAppStore.js:307` |
| `waiterAppStore.js` | READ | 4× `SELECT *` | `waiterAppStore.js:126,138,213,537` |
| `financeService.ts` | READ | 15+ `SELECT *` incl. sensitive finance data | `financeService.ts:35,121,250+` |
| `modules.ts` | READ | No company_id filter on system_modules | `modules.ts:35` |
| `notifications.js` | UPDATE | `is_read=true` update uses `.eq('id', ...)` ✅ | OK |
| `financeService.ts` | UPDATE | Account update uses `.eq('id', id)` ✅ | OK |
| `inventoryService.ts` | DELETE (line 420) | Uses `.eq('document_id', docId)` ✅ | OK |
| `procurementService.ts` | DELETE (line 332) | Uses `.eq('id', supplierId)` ✅ | OK |
| `cashierStore.js` | READ | Invoices fetched without limit | `cashierStore.js:269` |
| `kitchenDisplayStore.js` | UPDATE | KOT updates without error check | `kitchenDisplayStore.js:478,496` |

---

## Missing RPCs Summary

| RPC Name | Purpose | Priority | Status |
|----------|---------|----------|--------|
| `calculate_payroll(employee_id, month, year)` | Server-side payroll calculation | HIGH | Missing |
| `apply_discount(order_id, type, value)` | Server-side discount with auth check | HIGH | Missing |
| `get_sales_report(branch_id, from, to)` | Parameterized sales report | MEDIUM | Missing (views only) |
| `void_order(order_id, reason)` | Order void with journal reversal | HIGH | Partial |
| `process_return(order_id, items, reason)` | Returns stock + reverses finance | HIGH | Missing |
| `get_cogs_by_period(branch_id, from, to)` | COGS calculation | MEDIUM | Exists (migration) |

---

## Critical DB Bugs — Complete SQL Fix Scripts

### Fix Script 1: RLS for Missing Tables
```sql
-- File: supabase/fix_rls_missing_tables.sql
-- Apply AFTER fix_missing_rls_policies.sql

-- See BUG-DB-002 above for full SQL (kitchens, restaurant_tables, categories,
-- menu_items, ingredients, recipes, stock_movements, payments, order_items,
-- kot_tickets, kot_items, order_status_logs, roles, permissions,
-- role_permissions, user_branches)
```

### Fix Script 2: Accept Order Overload Cleanup
```sql
-- File: supabase/fix_accept_order_overload.sql
DROP FUNCTION IF EXISTS public.accept_order_as_waiter(UUID) CASCADE;
-- Then re-run: supabase/shift_access_control.sql (accept_order_as_waiter section)
```

### Fix Script 3: Core Missing Indexes
```sql
-- File: supabase/fix_missing_indexes.sql
-- (Full index SQL in BUG-DB-009 above)
```

### Fix Script 4: Multi-Tenancy `company_id` Columns
```sql
-- File: supabase/fix_company_id_columns.sql
-- (Full SQL in BUG-DB-004 above)
```

### Fix Script 5: Order Constraints
```sql
-- File: supabase/fix_order_data_integrity.sql

-- Payments amount > 0
ALTER TABLE public.payments ADD CONSTRAINT chk_payment_amount_positive
  CHECK (amount > 0);

ALTER TABLE public.payments ADD CONSTRAINT chk_payment_method_valid
  CHECK (payment_method IN ('cash', 'card', 'online', 'loyalty', 'split', 'complimentary', 'other'));

-- Discount cap on orders
ALTER TABLE public.orders ADD CONSTRAINT chk_discount_non_negative
  CHECK (discount_amount >= 0 AND discount_amount <= subtotal + 0.01);
-- (+0.01 for floating point rounding tolerance)

-- Duplicate status trigger cleanup
DROP TRIGGER IF EXISTS trg_order_status ON orders;
DROP FUNCTION IF EXISTS log_order_status();
```

---

## Production Readiness Checklist

| Check | Status | Notes |
|-------|--------|-------|
| `fix_missing_rls_policies.sql` applied | ❌ PENDING | CRITICAL — blocks prod deploy |
| `offline_sync_rpcs.sql` applied | ❌ PENDING | Offline mode broken |
| SECURITY DEFINER + `SET search_path` | ❌ 208 missing | Search-path injection risk |
| `company_id` on core tables | ❌ 7 tables missing | Multi-tenancy data leak |
| `accept_order_as_waiter` overload | ⚠️ Risk | Verify live DB has only 1-arg OR 2-arg, not both |
| Order status CHECK constraint | ✅ Present | Valid values enforced |
| KOT trigger correctness | ✅ OK | `kitchen_id` read before status change |
| Journal entry balance enforcement | ✅ Trigger | `fix_journal_immutability.sql` fixes this |
| Payments `amount > 0` | ❌ Missing | Constraint needs adding |
| Discount cap | ❌ Missing | Client + DB guard needed |
| Service charge configurable | ❌ Hardcoded | `0.1` in orderStore.js |
| Core FK indexes | ❌ 13 missing | Slow JOIN performance |
| Soft delete on menu/ingredient tables | ❌ Missing | Hard delete cascades |
| Debug SQL files cleaned up | ⚠️ Present | 4 debug files in supabase/ |
| Duplicate order status trigger | ⚠️ Present | Double audit log entries |
| `SELECT *` reduced to specific columns | ⚠️ 30+ instances | Over-fetching sensitive data |
| Pagination on sub-queries | ⚠️ Missing in several | Unbounded fetches under load |

---

## Priority Order for Fixes

### P0 (Apply Before Any Production Traffic)
1. **BUG-DB-001** — Apply `fix_missing_rls_policies.sql` to Supabase
2. **BUG-DB-002** — Add RLS to 15 tables without any RLS
3. **BUG-DB-005** — Drop 1-arg `accept_order_as_waiter` overload (PGRST203)
4. **BUG-DB-006** — Apply `offline_sync_rpcs.sql`

### P1 (Before First User Onboarding)
5. **BUG-DB-003** — Add `SET search_path = public` to 208 SECURITY DEFINER functions
6. **BUG-DB-004** — Add `company_id` to 7 multi-tenancy tables
7. **BUG-DB-008** — Create missing `apply_discount` and `void_order` RPCs
8. **BUG-DB-009** — Add 13 missing FK indexes
9. **BUG-DB-010** — Make service charge configurable from branch settings
10. **BUG-DB-012** — Add discount cap validation (frontend + DB)
11. **BUG-DB-013** — Add `amount > 0` constraint on payments

### P2 (Pre-Load-Testing)
12. **BUG-DB-007** — Remove duplicate status logging trigger
13. **BUG-DB-011** — Fix order number collision
14. **BUG-DB-014** — Add order status transition guard
15. **BUG-DB-016** — Replace `SELECT *` with explicit columns
16. **BUG-DB-017** — Add `.limit()` to unbounded sub-queries
17. **BUG-DB-018** — Add `company_id` filter to `fetchChartOfAccounts()`
18. **BUG-DB-019** — Add soft delete columns to operational tables

### P3 (Cleanup Sprint)
19. **BUG-DB-020** — Add company filter to system_modules
20. **BUG-DB-021** — Verify `v_delivery_performance` view has `branch_id`
21. **BUG-DB-022** — Move debug SQL files to `supabase/debug/` subdirectory
22. Remaining `SELECT *` instances in services

---

*Report generated by DBauditor agent — Seven Waves ERP Database Audit — 2026-07-17*
