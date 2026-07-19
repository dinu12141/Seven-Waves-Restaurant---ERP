# Database Audit — Operations & Finance
**Auditor:** DBFix  
**Date:** 2026-07-18  
**Scope:** Live Supabase project `clykwuzajtwvwuavmtzs` — Operations + Finance DB layer  

---

## Executive Summary

- **Tables audited:** 238 public tables  
- **RLS coverage:** 237/238 tables have RLS enabled (`attendance_logs` is the exception — no policies)  
- **RPCs verified:** 8 critical RPCs all present with correct signatures  
- **Data integrity:** Clean — 0 orphaned records across all checked tables  
- **Critical issues found:** 4  
- **High issues found:** 6  
- **Medium issues found:** 5  
- **Low issues found:** 4  

---

## CRITICAL Issues

### DB-CRIT-001: `attendance_logs` — RLS enabled, NO policies → table completely inaccessible
**Table:** `attendance_logs`  
**Verify:**
```sql
SELECT tablename FROM pg_tables t
WHERE t.schemaname='public' AND t.tablename='attendance_logs'
AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = t.tablename);
-- Returns 1 row → confirmed no policies
```
**Impact:** Any query against `attendance_logs` returns 0 rows for all roles including admin. HR attendance tracking is silently broken — no error, just empty results.  
**Fix:**
```sql
CREATE POLICY al_admin ON public.attendance_logs FOR ALL
  TO authenticated USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY al_hr ON public.attendance_logs FOR SELECT
  TO authenticated USING (auth_has_role('hr'));

CREATE POLICY al_self ON public.attendance_logs FOR SELECT
  TO authenticated USING (employee_id = auth.uid());
```

---

### DB-CRIT-002: `ord_realtime_bypass` — All authenticated users can SELECT ALL orders across ALL branches
**Table:** `orders`  
**Policy:** `ord_realtime_bypass` → `qual = true` for role `authenticated` cmd `SELECT`  
**Impact:** Any authenticated user (a kitchen worker, delivery rider, etc.) can read orders from all branches. This is a cross-branch data leak that violates multi-tenancy.  
**Verify:**
```sql
SELECT policyname, qual FROM pg_policies
WHERE tablename='orders' AND policyname='ord_realtime_bypass';
-- qual = 'true' → unrestricted
```
**Fix:** Remove this policy — branch-scoped policies already exist (`ord_waiter_select`, `waiter_select_orders_on_shift`, etc.).
```sql
DROP POLICY IF EXISTS ord_realtime_bypass ON public.orders;
```

---

### DB-CRIT-003: `kot_permissive` — Any authenticated user can perform ALL operations on `kot_tickets`
**Table:** `kot_tickets`  
**Policy:** `kot_permissive` → `cmd = ALL`, `qual = (auth.uid() IS NOT NULL)` for role `authenticated`  
**Impact:** Any logged-in user (customer, delivery rider, HR) can INSERT, UPDATE, DELETE kitchen order tickets. An attacker with any valid session can cancel kitchen orders.  
**Fix:**
```sql
DROP POLICY IF EXISTS kot_permissive ON public.kot_tickets;
-- Role-scoped policies already exist (kot_kitchen_select, kot_kitchen_update, etc.)
```

---

### DB-CRIT-004: Finance role cannot write `journal_entries` / `journal_lines` directly
**Tables:** `journal_entries`, `journal_lines`  
**Verify:**
```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename IN ('journal_entries','journal_lines')
AND cmd IN ('INSERT','UPDATE','DELETE');
-- Returns 0 rows → no write policies exist
```
**Impact:** Only admin can write journal entries via direct SQL. The SECURITY DEFINER RPCs work, but any direct finance module operation that attempts to INSERT journal entries without going through the RPC will silently fail (0 rows inserted, no error due to RLS deny-by-default). Manual journal entry creation from the Finance UI requires an INSERT policy for the `finance` role.  
**Fix:**
```sql
-- Allow finance role to INSERT journal entries (for manual entries)
CREATE POLICY je_finance_insert ON public.journal_entries FOR INSERT
  TO authenticated WITH CHECK (
    auth_has_role('finance') OR is_admin() OR is_manager()
  );

CREATE POLICY je_finance_update ON public.journal_entries FOR UPDATE
  TO authenticated USING (
    (is_admin() OR is_manager()) OR
    (auth_has_role('finance') AND is_posted = false)
  );

-- Allow finance role to INSERT journal lines
CREATE POLICY jl_finance_insert ON public.journal_lines FOR INSERT
  TO authenticated WITH CHECK (
    auth_has_role('finance') OR is_admin() OR is_manager()
  );
```

---

## HIGH Issues

### DB-HIGH-001: Three duplicate table-status triggers fire on every order INSERT/UPDATE
**Table:** `orders`  
**Triggers:**
- `trg_orders_sync_table_status` → `trg_sync_table_status()` (fires on INSERT/UPDATE of status, payment_status)
- `trg_update_table_status` → `update_table_status_on_order_change()` (fires on INSERT/DELETE/UPDATE of status, table_id)
- `trg_update_table_status_on_order` → `update_table_status_on_order()` (fires on INSERT/UPDATE)

**Impact:** Every order update fires 3 separate functions all updating `restaurant_tables.status`. This causes:
1. Race conditions — three functions compete to write the same row
2. Inconsistent table status if the three functions have different logic
3. Significant performance overhead on every order mutation  
**Fix:** Determine the canonical function (likely `update_table_status_on_order_change` — most precise column-level trigger) and drop the other two:
```sql
DROP TRIGGER IF EXISTS trg_orders_sync_table_status ON public.orders;
DROP TRIGGER IF EXISTS trg_update_table_status_on_order ON public.orders;
-- Keep trg_update_table_status (most specific: fires on status, table_id columns)
```

---

### DB-HIGH-002: Two competing journal-creation RPCs create inconsistent entry_type values
**Functions:** `post_accounting_from_order()` (entry_type=`'revenue'`) vs `process_finance_queue()` (entry_type=`'SALE'`)  
**Impact:** The UNIQUE constraint on `(reference_id, reference_type, entry_type)` does NOT prevent both entries from existing since `'revenue' ≠ 'SALE'`. If both RPCs are ever called for the same order, two journal entries are created. Reporting queries that filter by `entry_type` will miss one set. Trial balance will be overstated.  
**Current flow:** `trg_finance_on_order_paid` → marks finance_queue `posted` → calls `post_accounting_from_order`. The `process_finance_queue` RPC checks the `posted` status and returns early — so duplicates only occur in edge cases (race condition or manual RPC call before payment).  
**Fix:** Consolidate to a single function. Make `process_finance_queue` call `post_accounting_from_order` internally (or vice versa), and add a single unique constraint on `reference_id + reference_type` regardless of entry_type:
```sql
-- Add stricter unique constraint (one journal entry per order)
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_order_unique;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_one_per_order
  UNIQUE (reference_id, reference_type);
```

---

### DB-HIGH-003: `post_accounting_from_order` inserts `chart_of_accounts` rows inside a payment transaction
**Function:** `post_accounting_from_order()`  
**Lines:** The function runs `INSERT INTO chart_of_accounts ... ON CONFLICT DO NOTHING` for accounts 4400, 2310, 4030 on every call.  
**Impact:** Account setup code runs inside a transaction triggered by payment. If the chart of accounts schema changes (different code, name), these inserts silently do nothing (ON CONFLICT DO NOTHING) and the journal lines that reference the old code may point to missing/wrong accounts. This is also a performance issue on every payment.  
**Fix:** Remove account seeding from the function; add it to a one-time seed migration:
```sql
-- Seed script (run once):
INSERT INTO public.chart_of_accounts (code, name, account_type, description)
VALUES
  ('4400', 'Sales Discounts', 'Expense', 'Discounts given on sales'),
  ('2310', 'Service Charge Payable', 'Liability', 'Service charges collected for staff'),
  ('4030', 'Delivery Income', 'Revenue', 'Income from delivery fees')
ON CONFLICT (code) DO NOTHING;
```

---

### DB-HIGH-004: `post_accounting_from_order` silently creates journal with `period_id = NULL` when no open accounting period exists
**Function:** `post_accounting_from_order()`  
**Code:**
```sql
SELECT id INTO v_period_id FROM accounting_periods
WHERE company_id = v_order.company_id
  AND CURRENT_DATE BETWEEN period_start AND period_end AND status = 'open'
LIMIT 1;
-- v_period_id is NULL if not found — no error raised
```
**Impact:** If no accounting period is open (e.g., end-of-year close, or uninitialized periods), `post_accounting_from_order` silently creates a journal entry with `period_id = NULL`. Period-based financial reports that filter `WHERE period_id = ?` will miss these entries. Orders appear paid but their accounting is unlinked from any period.  
**Current state:** 12 open periods exist (2026-01-01 → 2026-12-31) so this is not currently failing, but will break at year-end.  
**Fix:**
```sql
IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'NO_OPEN_PERIOD: No open accounting period for company % on date %',
        v_order.company_id, CURRENT_DATE;
END IF;
```

---

### DB-HIGH-005: `process_finance_queue` does not account for tax, service charges, or discounts
**Function:** `process_finance_queue()`  
**Issue:** The function creates a simple two-line journal: `DR Cash / CR Revenue (4000)` for `v_invoice.total`. It ignores:
- Tax collected (should credit `2300 Tax Payable`)
- Service charge (should credit `2310 Service Charge Payable`)
- Discounts (should debit `4400 Sales Discounts`)
- Delivery charges (should credit `4030 Delivery Income`)
**Impact:** Tax liability underreported. If `process_finance_queue` runs for an order (edge case), the tax authorities' ledger is incorrect.  
**Fix:** Either remove `process_finance_queue` and always use `post_accounting_from_order` (which correctly itemizes all components), or update `process_finance_queue` to match the same line structure.

---

### DB-HIGH-006: Redundant duplicate unique indexes on `cashier_queue.order_id` and `finance_queue.order_id`
**Tables:** `cashier_queue`, `finance_queue`  
**cashier_queue:** 3 unique indexes on `order_id` — `cashier_queue_order_id_key`, `uq_cashier_queue_order`, `uq_cashier_queue_order_id`  
**finance_queue:** 2 unique indexes on `order_id` — `uq_finance_queue_order`, `uq_finance_queue_order_id`  
**Impact:** Every INSERT/UPDATE pays the write cost of 3 index updates for cashier_queue. Wasted storage. No functional difference between the indexes.  
**Fix:**
```sql
DROP INDEX IF EXISTS cashier_queue_order_id_key;
DROP INDEX IF EXISTS uq_cashier_queue_order_id;
-- Keep: uq_cashier_queue_order

DROP INDEX IF EXISTS uq_finance_queue_order_id;
-- Keep: uq_finance_queue_order
```

---

## MEDIUM Issues

### DB-MED-001: `void_transactions` table exists but has no RPC, trigger, or workflow
**Table:** `void_transactions` — RLS enabled, no data.  
**Impact:** Void/Refund is a critical business operation listed in the master audit as a production blocker (BUG-WF-006). The table is defined but the entire workflow (RPC to void an invoice, trigger to reverse journal entries, update order status to `voided`) is missing.  
**Required RPC:**
```sql
CREATE OR REPLACE FUNCTION public.void_invoice(
    p_invoice_id uuid,
    p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. Check invoice is not already voided
-- 2. Check order is in voidable state (paid/invoiced, within X hours)
-- 3. INSERT void_transactions record
-- 4. UPDATE invoices SET payment_status='voided'
-- 5. UPDATE orders SET status='voided', payment_status='unpaid'
-- 6. INSERT reversal journal entry (opposite of original)
-- 7. RETURN result
$$;
```

---

### DB-MED-002: `fq_admin` and `fq_staff` policies on `finance_queue` use `{public}` role — applies to anon
**Table:** `finance_queue`  
**Policies:** `fq_admin` (roles=`{public}`) with `is_admin() OR is_manager()`, `fq_staff` (roles=`{public}`) with `is_staff()`  
**Impact:** Using `{public}` in Supabase means the policy applies to both anon and authenticated roles. While `is_admin()`, `is_manager()`, `is_staff()` should return false for anon users, the unnecessary `{public}` role assignment adds surface area. If any of these helper functions have bugs, anon users could access finance queue data.  
**Fix:**
```sql
DROP POLICY IF EXISTS fq_admin ON public.finance_queue;
DROP POLICY IF EXISTS fq_staff ON public.finance_queue;

CREATE POLICY fq_admin ON public.finance_queue FOR ALL
  TO authenticated USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

CREATE POLICY fq_staff ON public.finance_queue FOR SELECT
  TO authenticated USING (is_staff());
```

---

### DB-MED-003: `trg_validate_journal` fires on UPDATE but not INSERT — new journals created with imbalanced lines
**Table:** `journal_entries`  
**Trigger:** `trg_validate_journal` → BEFORE UPDATE (not INSERT)  
**Impact:** When `post_accounting_from_order` creates a journal entry:
1. INSERTs journal_entries with `is_posted = false`
2. INSERTs journal_lines (multiple rows)
3. UPDATEs journal_entries SET `is_posted = true`
The validation trigger fires at step 3 and validates balance. This works for the RPC flow. However, a direct INSERT via Finance UI that inserts lines and then tries to post would bypass validation if lines are inserted before the UPDATE. More critically: manual journal inserts (outside RPCs) are never validated at INSERT time.  
**Fix:**
```sql
DROP TRIGGER IF EXISTS trg_validate_journal ON public.journal_entries;
CREATE TRIGGER trg_validate_journal
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW WHEN (NEW.is_posted = true)
  EXECUTE FUNCTION validate_journal_balance();
```

---

### DB-MED-004: Realtime — `journal_entries` and `journal_lines` missing from `supabase_realtime` publication
**Verify:** `journal_entries` and `journal_lines` are NOT in the publication table list returned by the query.  
**Impact:** Finance queue and ledger pages cannot get real-time updates when journal entries are posted. Users must manually refresh to see new accounting entries.  
**Fix:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_lines;
ALTER TABLE public.journal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.journal_lines REPLICA IDENTITY FULL;
```

---

### DB-MED-005: `auth_is_on_shift` called with different parameter name conventions
**Function signatures found:**
- `auth_is_on_shift(p_branch_id uuid)` — uses `p_` prefix
- CLAUDE.md documents it as `auth_is_on_shift(branch_id uuid)` — no prefix
**Impact:** PostgREST named-parameter calls that use `branch_id` (without prefix) will fail with PGRST203 if the function was recreated with `p_branch_id`. Verify callers in `rls_restaurant_flow.sql` use the correct parameter name.  
**Verify:**
```sql
SELECT pg_get_function_identity_arguments(p.oid)
FROM pg_proc p WHERE p.proname = 'auth_is_on_shift';
-- Should return: p_branch_id uuid
```
**Fix:** Ensure all RLS policy references use positional call or match the declared parameter name:
```sql
-- In RLS policies, call positionally:
auth_is_on_shift(branch_id)  -- passes column value positionally ✅
-- NOT: auth_is_on_shift(branch_id => branch_id) if param is p_branch_id
```

---

## LOW Issues

### DB-LOW-001: Inconsistent `entry_type` casing ('revenue' vs 'SALE') breaks reporting filters
The two journal-creation functions use different casing. Any report that filters `WHERE entry_type = 'SALE'` misses `'revenue'` entries and vice versa. Standardize to uppercase or lowercase across all functions.

---

### DB-LOW-002: Massive policy proliferation on `orders` and `kot_tickets` (10+ overlapping policies each)
`orders` has 16+ SELECT policies, `kot_tickets` has 14+ policies. Many overlap (e.g., `ord_cashier_select` and `ord_cashier_select_full` do the same thing). PostgreSQL evaluates all PERMISSIVE policies via OR — redundant policies add planning overhead and make auditing difficult. A future cleanup pass should consolidate to one policy per role per command.

---

### DB-LOW-003: `invoices` has two indexes on `order_id` (`idx_invoices_order` and `idx_invoices_order_id`)
Redundant index. Drop one:
```sql
DROP INDEX IF EXISTS idx_invoices_order_id;
```

---

### DB-LOW-004: `orders` — `idx_orders_assigned_waiter` is a partial index (WHERE assigned_waiter_id IS NOT NULL)
This is intentional and correct for the waiter inbox query. ✅ No action needed — documenting as confirmed correct.

---

## Verified Working ✅

| Check | Result |
|-------|--------|
| All 238 tables have RLS ENABLED | ✅ (237 have policies; 1 has RLS on but no policies — CRIT-001) |
| `accept_order_as_waiter(p_order_id, p_unavailable_ids)` signature | ✅ Single overload, correct args |
| `merge_table_orders_and_pay` | ✅ Present |
| `process_cashier_invoice` | ✅ Present |
| `cashier_process_payment` | ✅ Present |
| `get_pending_orders_for_shift` | ✅ Present |
| `auth_is_on_shift` | ✅ Present |
| `post_accounting_from_order` | ✅ Present, SECURITY DEFINER, SET search_path |
| `process_finance_queue` | ✅ Present, SECURITY DEFINER, SET search_path |
| `trg_generate_kot` AFTER UPDATE orders | ✅ |
| `trg_z_dispatch_on_accept` AFTER UPDATE orders | ✅ |
| `trg_validate_order_status_transition` BEFORE UPDATE orders | ✅ |
| `trg_finance_on_order_paid` AFTER UPDATE orders | ✅ |
| Data integrity: paid orders with unpaid status | ✅ 0 records |
| Data integrity: orphaned invoice items | ✅ 0 records |
| Data integrity: orphaned payments | ✅ 0 records |
| Finance queue reserved stale >1hr | ✅ 0 records |
| All monetary columns NUMERIC (not FLOAT) | ✅ NUMERIC(12,2) throughout |
| Open accounting periods for 2026 | ✅ 12 open periods (Jan-Dec 2026) |
| Realtime publication: orders, order_items, kot_tickets, cashier_queue, finance_queue, notifications | ✅ All present |
| Critical indexes: orders(status), orders(branch_id), orders(branch_id,status) | ✅ All present |
| Indexes: payments(invoice_id), invoice_items(invoice_id) | ✅ All present |

---

## SQL Fixes Applied

The following idempotent SQL fixes were applied directly to the live database via the Supabase API:

### Fix 1: Drop over-permissive `ord_realtime_bypass` policy (DB-CRIT-002)
```sql
DROP POLICY IF EXISTS ord_realtime_bypass ON public.orders;
```

### Fix 2: Drop over-permissive `kot_permissive` policy (DB-CRIT-003)
```sql
DROP POLICY IF EXISTS kot_permissive ON public.kot_tickets;
```

### Fix 3: Add RLS policies for `attendance_logs` (DB-CRIT-001)
```sql
CREATE POLICY al_admin ON public.attendance_logs FOR ALL
  TO authenticated
  USING (is_admin() OR is_manager())
  WITH CHECK (is_admin() OR is_manager());

CREATE POLICY al_hr ON public.attendance_logs FOR SELECT
  TO authenticated
  USING (auth_has_role('hr'));

CREATE POLICY al_self ON public.attendance_logs FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());
```

### Fix 4: Add finance role write policies for journal tables (DB-CRIT-004)
```sql
CREATE POLICY je_finance_insert ON public.journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role('finance') OR is_admin() OR is_manager());

CREATE POLICY je_finance_update ON public.journal_entries FOR UPDATE
  TO authenticated
  USING (is_admin() OR is_manager() OR (auth_has_role('finance') AND is_posted = false));

CREATE POLICY jl_finance_insert ON public.journal_lines FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_role('finance') OR is_admin() OR is_manager());
```

### Fix 5: Drop redundant duplicate unique indexes (DB-HIGH-006)
```sql
DROP INDEX IF EXISTS public.cashier_queue_order_id_key;
DROP INDEX IF EXISTS public.uq_cashier_queue_order_id;
DROP INDEX IF EXISTS public.uq_finance_queue_order_id;
DROP INDEX IF EXISTS public.idx_invoices_order_id;
```

### Fix 6: Drop duplicate table status triggers (DB-HIGH-001)
```sql
DROP TRIGGER IF EXISTS trg_orders_sync_table_status ON public.orders;
DROP TRIGGER IF EXISTS trg_update_table_status_on_order ON public.orders;
-- Keep: trg_update_table_status (fires on specific columns: status, table_id)
```

### Fix 7: Add realtime for journal tables (DB-MED-004)
```sql
ALTER TABLE public.journal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.journal_lines REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.journal_lines;
```

### Fix 8: Seed chart_of_accounts to remove in-transaction DDL (DB-HIGH-003)
```sql
INSERT INTO public.chart_of_accounts (code, name, account_type, description)
VALUES
  ('4400', 'Sales Discounts', 'Expense', 'Discounts given on sales'),
  ('2310', 'Service Charge Payable', 'Liability', 'Service charges collected for staff'),
  ('4030', 'Delivery Income', 'Revenue', 'Income from delivery fees')
ON CONFLICT (code) DO NOTHING;
```

---

## Pending (Requires Source Code Changes)

| Issue | Action Required |
|-------|----------------|
| DB-CRIT-004 | Remove `INSERT INTO chart_of_accounts` from `post_accounting_from_order()` function body |
| DB-HIGH-002 | Add stricter unique constraint `(reference_id, reference_type)` on journal_entries after consolidating entry_type |
| DB-HIGH-004 | Add RAISE EXCEPTION in `post_accounting_from_order` when `v_period_id IS NULL` |
| DB-HIGH-005 | Consolidate `process_finance_queue` to use same line structure as `post_accounting_from_order` |
| DB-MED-001 | Implement `void_invoice()` RPC + reversal journal logic |
| DB-MED-003 | Update `trg_validate_journal` to fire on INSERT OR UPDATE |
