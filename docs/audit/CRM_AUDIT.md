# CRM Section Audit — Seven Waves Restaurant ERP
**Agent:** CRMFix | **Date:** 2026-07-18 | **Scope:** Customer Management, Loyalty, Customer Auth Service

---

## CRITICAL Issues

### BUG-CRM-001 — `admin_get_customers` ignores `p_active` filter
**File:** `supabase/migrations/20260717_customer_management_rpcs.sql:31`
**Root cause:** Comment in SQL says "p_active filter is skipped because customers don't have an is_active flag" — but `fix_is_active_column.sql` adds exactly this column. Both the COUNT query and the paged data query never apply `AND c.is_active = p_active`. The `statusFilter` toggle on `CustomersPage.vue:48` sends `active: true/false` but the RPC ignores it.
**Fix:** Add `AND (p_active IS NULL OR c.is_active = p_active)` to both WHERE clauses in `admin_get_customers`.

### BUG-CRM-002 — `admin_get_customers` omits `is_active` from response JSON
**File:** `supabase/migrations/20260717_customer_management_rpcs.sql:35-46`
**Root cause:** The `jsonb_build_object` for each row never includes `'is_active'`. `CustomersPage.vue:144` renders `props.row.is_active ? 'Active' : 'Inactive'` — the field is always `undefined` (falsy) so every customer shows **"Inactive"** regardless of their real status.
**Fix:** Add `'is_active', c.is_active` to the response JSON.

### BUG-CRM-003 — `admin_get_customers` omits `total_orders` and `total_spent`
**File:** `supabase/migrations/20260717_customer_management_rpcs.sql:35-46`
**Root cause:** The response JSON never includes `total_orders` or `total_spent`. `CustomersPage.vue:133` reads `props.row.total_orders` and `props.row.total_spent` to show the Orders/Spent column — these always display `0 / LKR 0` for every customer.
**Fix:** Add `'total_orders', c.total_orders, 'total_spent', c.total_spent` to the response JSON.

### BUG-CRM-004 — `admin_get_customer_detail` omits `is_active`, `total_orders`, `total_spent`, `national_id`
**File:** `supabase/migrations/20260717_customer_management_rpcs.sql:125-141` (and same in `fix_customer_loyalty_automation.sql:208-228`)
**Root cause:** The detail RPC only returns customer_id, full_name, email, phone, created_at, loyalty_id, loyalty_card_no, loyalty_points, loyalty_tier. `CustomerDetailPage.vue` uses `customer.is_active` (line 37, status chip), `customer.national_id` (line 60), `customer.total_orders` (line 113), `customer.total_spent` (line 122) — all render `undefined`/`0`.
**Fix:** Add these four fields to the `jsonb_build_object` in the detail RPC.

---

## HIGH Issues

### BUG-CRM-005 — `saveLoyaltySettings` silently ignores DB errors
**File:** `src/pages/admin/CustomersPage.vue:474-484`
**Root cause:** Both `supabase.from('loyalty_rules').update(...)` and `.insert(...)` calls are awaited but their `error` return value is never checked. If the DB rejects the write (RLS violation, constraint, network), the UI still shows "Loyalty settings updated successfully".
**Fix:** Destructure `{ error }` from both calls and throw if error is truthy.

### BUG-CRM-006 — `adminDeleteCustomer` hard-deletes instead of soft-deleting
**File:** `src/services/customerAuthService.ts:425`
**Root cause:** `.delete().eq('id', customerId)` permanently removes the row. But the `admin_get_customers` RPC filters `WHERE deleted_at IS NULL`, and `fix_soft_delete.sql` (from BugFixer session) established soft-delete as the ERP pattern. Hard-deleting a customer with orders causes a FK violation (error code 23503 caught but reported as "cannot delete"), when the correct answer is to soft-delete so the order history is preserved.
**Fix:** Change to `UPDATE customers SET deleted_at = NOW() WHERE id = customerId`.

---

## MEDIUM Issues

### BUG-CRM-007 — Hardcoded dark hex colors in CustomersPage.vue SCSS
**File:** `src/pages/admin/CustomersPage.vue:507-569`
**Root cause:** `.customer-search`, `.customers-table`, `.customers-table-card` all use hardcoded rgba/hex values (`rgba(255,255,255,0.06)`, `#e5e7eb`, `#6b7280`, etc.) instead of Quasar dark-mode aware CSS variables. Breaks completely in light theme.
**Severity:** MEDIUM (dark mode is the primary ERP theme; light mode is secondary).

### BUG-CRM-008 — `admin_get_customers` COUNT ignores `p_active` filter (count mismatch)
**File:** `supabase/migrations/20260717_customer_management_rpcs.sql:27-31`
**Root cause:** When `p_active` filter is fixed (BUG-CRM-001), the COUNT query must also include the filter or pagination totals will be wrong (e.g., filtering for Active = 5, but total says 100 customers → extra blank pages).
**Note:** Addressed as part of BUG-CRM-001 fix.

### BUG-CRM-009 — `fix_customer_loyalty_automation.sql` loyalty_accounts auto-INSERT missing columns
**File:** `supabase/fix_customer_loyalty_automation.sql:78`
**Root cause:** `INSERT INTO loyalty_accounts (company_id, customer_id, current_coins, total_earned_coins, total_spent)` may fail if the table has NOT NULL columns without defaults (e.g., `card_number`, `points_balance`). Depends on actual schema.
**Severity:** MEDIUM (only fires when a customer pays who has no loyalty account yet).

---

## LOW Issues

### BUG-CRM-010 — Emoji strings in `getActivityTitle()` map
**File:** `src/pages/admin/CustomerDetailPage.vue:340-344`
**Note:** `'📋 Customer Registered'` etc. Project style guide (CLAUDE.md) discourages emojis in code. Low impact cosmetic issue.

### BUG-CRM-011 — `openLoyaltySettings` double-fires on every click (no loading guard)
**File:** `src/pages/admin/CustomersPage.vue:435`
**Root cause:** No `loading` flag on `openLoyaltySettings` — double-clicking the Loyalty Settings button fires two parallel Supabase queries. Low probability, minor.

---

## Fixes Applied

### FIX-CRM-001 + 002 + 003 + 004: Updated `admin_get_customers` and `admin_get_customer_detail` RPCs
- `supabase/migrations/20260717_customer_management_rpcs.sql` — both functions patched
- Also patched duplicate definition in `supabase/fix_customer_loyalty_automation.sql`
- Added `is_active`, `total_orders`, `total_spent`, `national_id` to responses
- Added `p_active` filter to both COUNT and data queries in `admin_get_customers`

### FIX-CRM-005: Loyalty settings save now checks DB errors
- `src/pages/admin/CustomersPage.vue:saveLoyaltySettings` — error destructured from both update/insert

### FIX-CRM-006: `adminDeleteCustomer` changed to soft-delete
- `src/services/customerAuthService.ts:adminDeleteCustomer` — uses UPDATE `deleted_at = NOW()` not `.delete()`
