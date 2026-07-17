# RLS Design — Seven Waves Restaurant ERP

> Row Level Security policies for PostgreSQL 17 / Supabase

---

## 1. Auth Helper Functions

All RLS policies rely on these SECURITY DEFINER helper functions:

| Function | Returns | Purpose |
|----------|---------|---------|
| `auth.uid()` | uuid | Supabase built-in — current user ID |
| `auth.role()` | text | `'anon'` or `'authenticated'` |
| `auth_has_role(role_name)` | bool | User has given role via `user_roles` |
| `auth_branch_ids()` | uuid[] | All branch IDs user is assigned to |
| `auth_kitchen_ids()` | uuid[] | Kitchens in user's assigned branches |
| `is_admin()` | bool | Shorthand `auth_has_role('admin')` |
| `is_manager()` | bool | Shorthand `auth_has_role('manager')` |
| `is_staff()` | bool | Any authenticated user with a role |
| `is_hr()` | bool | Shorthand `auth_has_role('hr')` |
| `is_finance()` | bool | Shorthand `auth_has_role('finance')` |
| `is_inventory()` | bool | Shorthand `auth_has_role('inventory')` |
| `auth_is_on_shift(branch_id)` | bool | Waiter/cashier on active shift |
| `auth_has_access_to_branch(id)` | bool | User assigned to specific branch |
| `auth_has_permission(perm)` | bool | Per-user permission override |
| `auth_get_shift_branches()` | table | Branches user has active shifts for |
| `auth_user_branch_ids()` | uuid[] | Alias for `auth_branch_ids()` |

### Missing Helper Functions Needed

| Function | Purpose |
|----------|---------|
| `get_user_company_id()` | Return company_id for current user (needed for multi-tenant isolation) |
| `auth_is_procurement()` | Shorthand for `auth_has_role('procurement')` |
| `auth_is_delivery()` | Shorthand for `auth_has_role('delivery')` |

---

## 2. RLS Status by Table

### Tables WITH RLS Enabled

| Table | Policies Defined | Notes |
|-------|-----------------|-------|
| `orders` | admin, manager, waiter_select, waiter_insert, waiter_update, kitchen_select, cashier_select, cashier_update, customer_select, shift-aware variants | Duplicate policies from rls_restaurant_flow.sql + shift_access_control.sql — RISK: policy accumulation |
| `order_items` | admin, waiter_select/insert/update, kitchen_select/update, cashier_select, customer_select | ✓ |
| `order_status_logs` | admin, staff_select, staff_insert | ✓ |
| `kot_tickets` | admin, kitchen_select/update, waiter_select/insert, customer_select | ✓ |
| `kot_items` | admin, kitchen_select/update, waiter_select/insert, customer_select | ✓ |
| `categories` | select (public), admin | ✓ |
| `menu_items` | select (public), admin | ✓ |
| `item_variants` | select (public), admin | ✓ |
| `restaurant_tables` | select (public), admin | ✓ |
| `kitchens` | staff_select, admin | ✓ |
| `payment_methods` | select (public), admin | ✓ |
| `pos_invoices` | admin, cashier, waiter_select | via rls_restaurant_flow.sql |
| `invoices` | admin, finance, cashier | via erp_security_lockdown.sql |
| `invoice_items` | admin, finance, cashier | ✓ |
| `payments` | admin, finance, cashier | ✓ |
| `ap_invoices` | admin/manager, finance, inventory | ✓ |
| `ap_invoice_lines` | admin, finance | ✓ |
| `supplier_payments` | admin, finance, manager | ✓ |
| `ap_ledger` | admin, finance | ✓ |
| `goods_receipts` | admin, manager, inventory | ✓ |
| `goods_receipt_lines` | admin/manager, inventory | ✓ |
| `purchase_orders` | admin, manager, inventory, finance | ✓ |
| `purchase_order_lines` | admin/manager, inventory | ✓ |
| `inventory_documents` | admin, manager, inventory | ✓ |
| `inventory_document_lines` | admin/manager, inventory | ✓ |
| `inventory_ledger` | admin, inventory, finance | ✓ |
| `stock_on_hand` | admin, inventory, manager, kitchen | ✓ |
| `employees` | admin, hr, manager | ✓ |
| `payroll_runs` | admin, hr | ✓ |
| `payslips` | admin, hr | ✓ |
| `leave_types` | admin, hr, all_select | ✓ |
| `leave_requests` | admin, hr, self_select | ✓ |
| `attendance_records` | admin, hr | ✓ |
| `recipes` | admin, manager, kitchen, inventory | ✓ |
| `recipe_items` | admin, manager, kitchen | ✓ |
| `user_permissions` | admin, self_select | ✓ |
| `audit_logs` | admin_all, system_insert | ✓ |
| `erp_event_log` | admin/manager_all, staff_select, system_insert | ✓ |
| `chart_of_accounts` | authenticated (loose) | via finance migration |
| `fiscal_periods` | authenticated (loose) | via finance migration |
| `bank_accounts` | authenticated (loose) | via finance migration |
| `expense_entries` | authenticated (loose) | via finance migration |
| `payroll_cycles` | authenticated (loose) | via finance migration |
| `finance_audit_logs` | authenticated (loose) | via finance migration |

### Tables WITHOUT RLS (Security Gaps)

| Table | Risk Level | Recommendation |
|-------|-----------|----------------|
| `companies` | LOW — admin only | Add admin-only policy |
| `branches` | MEDIUM | Add company-scoped policy |
| `kitchens` | LOW — is_staff() ✓ | Already has RLS |
| `profiles` | **HIGH** | Users can read all profiles! Add RLS |
| `roles` | LOW | Read-only reference |
| `permissions` | LOW | Read-only reference |
| `role_permissions` | MEDIUM | Expose permission structure |
| `user_roles` | **HIGH** | Users can see role assignments! Add RLS |
| `user_branches` | MEDIUM | Branch assignments visible |
| `stores` | MEDIUM | Add inventory/manager policy |
| `stock_items` | LOW | Add inventory/manager policy |
| `stock_levels` | MEDIUM | Add inventory/kitchen policy |
| `stock_movements` | MEDIUM | Add inventory policy |
| `grn`, `grn_items` | MEDIUM | Legacy — superseded by goods_receipts |
| `stock_transfers` | MEDIUM | Add inventory policy |
| `salary_structures` | **HIGH** | Salary data fully exposed! |
| `employee_loans` | HIGH | Financial data exposed |
| `employee_overtime` | MEDIUM | Should be HR-gated |
| `attendance_logs` | MEDIUM | Add HR policy |
| `loyalty_accounts` | MEDIUM | Customer financial data |
| `loyalty_transactions` | MEDIUM | Transaction history |
| `customers` | MEDIUM | PII exposed |
| `departments` | LOW | Non-sensitive |
| `designations` | LOW | Non-sensitive |
| `shifts` | LOW | Non-sensitive |
| `shift_assignments` | LOW | Non-sensitive |
| `payment_terms` | LOW | Non-sensitive |
| `supplier_contacts` | LOW | Business contact |
| `supplier_item_prices` | MEDIUM | Pricing data |
| `ap_balance_snapshot` | MEDIUM | AP financial data |
| `procurement_doc_sequences` | LOW | Sequence counters |
| `void_transactions` | MEDIUM | Financial mutations |
| `payment_allocations` | MEDIUM | Payment data |
| `qr_rate_limits` | LOW — disabled intentionally | ✓ |

---

## 3. Policy Accumulation Problem

**Critical Issue**: Both `rls_restaurant_flow.sql` and `shift_access_control.sql` define RLS policies on the `orders` table. PostgreSQL ORs all policies of the same type — this can grant MORE access than intended.

**From rls_restaurant_flow.sql:**
- `ord_waiter_select` — waiter sees orders in their branches
- `ord_cashier_select` — cashier sees ready/served/invoiced
- `ord_customer_select` — anon sees own QR order

**From shift_access_control.sql:**
- `waiter_select_orders_on_shift` — replaces the above, adds shift gate

**Result**: Both policy sets are active simultaneously. The shift-unaware `ord_waiter_select` policy from `rls_restaurant_flow.sql` still allows waiters to see ALL orders in their branch regardless of shift.

**Fix**: Drop the overlapping policies from `rls_restaurant_flow.sql`:

```sql
DROP POLICY IF EXISTS ord_waiter_select ON orders;
DROP POLICY IF EXISTS ord_waiter_insert ON orders;
DROP POLICY IF EXISTS ord_waiter_update ON orders;
DROP POLICY IF EXISTS ord_cashier_select ON orders;
DROP POLICY IF EXISTS ord_cashier_update ON orders;
-- Keep only the shift-aware versions from shift_access_control.sql
```

---

## 4. Target RLS Policy Set (Complete)

### Core Pattern

```sql
-- Admin: full access to everything
CREATE POLICY "{table}_admin" ON {table} FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Manager: full access to their branches
CREATE POLICY "{table}_manager" ON {table} FOR ALL
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_manager() AND branch_id = ANY(auth_branch_ids()));
```

### profiles

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY profiles_self ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admin/HR can read all profiles
CREATE POLICY profiles_admin ON profiles FOR ALL
  USING (is_admin() OR is_hr()) WITH CHECK (is_admin() OR is_hr());

-- Users can update their own non-sensitive fields
CREATE POLICY profiles_self_update ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
```

### user_roles

```sql
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_admin ON user_roles FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- Users can see their own roles (needed for auth)
CREATE POLICY user_roles_self ON user_roles FOR SELECT
  USING (user_id = auth.uid());
```

### salary_structures

```sql
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY ss_admin ON salary_structures FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY ss_hr ON salary_structures FOR ALL
  USING (is_hr() AND company_id = (SELECT company_id FROM employees WHERE id = salary_structures.employee_id))
  WITH CHECK (is_hr());

-- Employee can see their own salary structure
CREATE POLICY ss_self ON salary_structures FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = salary_structures.employee_id AND e.profile_id = auth.uid())
  );
```

### loyalty_accounts

```sql
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY la_admin ON loyalty_accounts FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

-- Customer can see their own loyalty account
CREATE POLICY la_self ON loyalty_accounts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id = loyalty_accounts.customer_id AND c.email = auth.email())
  );
```

### customers

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY cust_admin ON customers FOR ALL
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY cust_cashier ON customers FOR SELECT
  USING (auth_has_role('cashier') AND company_id = ANY(
    SELECT c.id FROM companies c
    JOIN branches b ON b.company_id = c.id
    WHERE b.id = ANY(auth_branch_ids())
  ));
```

---

## 5. Finance Module RLS Concern

The `20260323_finance_module_schema.sql` migration applies this blanket policy to **all finance tables**:

```sql
CREATE POLICY fin_{table}_auth ON {table} FOR ALL USING (auth.role() = 'authenticated');
```

**This means any authenticated user can read/write all financial data including payroll, journal entries, and expense records.** This is a critical security gap.

**Fix needed**: Replace blanket policy with role-based policies:

```sql
-- chart_of_accounts
DROP POLICY fin_chart_of_accounts_auth ON chart_of_accounts;

CREATE POLICY coa_admin ON chart_of_accounts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY coa_finance ON chart_of_accounts FOR SELECT USING (is_finance() OR is_manager());
CREATE POLICY coa_read_all ON chart_of_accounts FOR SELECT USING (is_staff()); -- read for GL code lookups

-- journal_entries
DROP POLICY fin_journal_entries_auth ON journal_entries;

CREATE POLICY je_admin ON journal_entries FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY je_finance ON journal_entries FOR ALL
  USING (is_finance()) WITH CHECK (is_finance());
CREATE POLICY je_read ON journal_entries FOR SELECT USING (is_manager());

-- payroll_cycles / payroll_records
DROP POLICY fin_payroll_cycles_auth ON payroll_cycles;
DROP POLICY fin_payroll_records_auth ON payroll_records;

CREATE POLICY pc_admin ON payroll_cycles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pc_hr ON payroll_cycles FOR ALL USING (is_hr()) WITH CHECK (is_hr());
CREATE POLICY pr_admin ON payroll_records FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY pr_hr ON payroll_records FOR ALL USING (is_hr()) WITH CHECK (is_hr());
```

---

## 6. Anonymous User Access

Anonymous (QR kiosk / customer-facing) access is tightly controlled:

| What anon can access | Via |
|---------------------|-----|
| `categories` SELECT | Public policy |
| `menu_items` SELECT | Public policy |
| `item_variants` SELECT | Public policy |
| `restaurant_tables` SELECT | Public policy |
| `payment_methods` SELECT | Public policy |
| `orders` SELECT (own order only) | JWT `app_metadata.table_id` check |
| `order_items` SELECT (own order) | Via order customer policy |
| `kot_tickets` SELECT (own order) | Via order customer policy |
| `kot_items` SELECT (own order) | Via order customer policy |

**Post-security-lockdown** (`erp_security_lockdown.sql`):
- `REVOKE SELECT ON orders FROM anon` — access to orders now via SECURITY DEFINER RPCs only
- This supersedes the customer RLS policies above — QR kiosk uses `get_kiosk_orders()` RPC

---

## 7. RLS Performance Impact

These policies involve subqueries that can cause sequential scans:

| Policy | Potential Seq Scan | Mitigation |
|--------|-------------------|------------|
| `ord_kitchen_select` — `EXISTS (SELECT 1 FROM order_items WHERE kitchen_id = ANY(...))` | order_items full scan | Index on `(order_id, kitchen_id)` ✓ |
| `oi_waiter_select` — `EXISTS (SELECT 1 FROM orders WHERE branch_id = ANY(...))` | orders scan | Index on `(id, branch_id)` needed |
| `ki_waiter_select` — `JOIN orders ON kot.order_id + branch_id check` | Double join | Indexes on kot_tickets(order_id) + orders(branch_id) ✓ |
| `auth_branch_ids()` — called per row | ARRAY construction | Result cached within query; acceptable |
| `auth_is_on_shift(branch_id)` — dynamic SQL | shift_assignments scan | Index on `(employee_id, assignment_date)` ✓ |
| `lr_self` — `EXISTS (SELECT 1 FROM employees WHERE profile_id = auth.uid())` | employees scan | Index on `idx_employees_profile_id` ✓ |

**Critical**: `auth_is_on_shift()` is called once per row evaluated in the `orders` RLS policy. For a waiter viewing the order list, this triggers one dynamic SQL execution per order row. This will be slow at scale (100+ orders per page). Mitigation: cache shift status in JWT claims via a Supabase Auth hook.
