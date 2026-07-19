# Fix Log — Seven Waves ERP
**Agent:** SQLfix  
**Date:** 2026-07-17  
**Scope:** SQL/DB fixes identified by DBauditor and WorkflowAuditor

---

## Status Summary

| Priority | Total Bugs | SQL Files Created | Verified Applied |
|----------|-----------|-------------------|-----------------|
| P0 Critical | 4 | 3 | ❌ Pending manual apply |
| P1 High | 5 | 4 | ❌ Pending manual apply |
| P2 Medium | 3 | 3 | ❌ Pending manual apply |
| Frontend Bugs | 4 | n/a | ✅ Already fixed in code |

---

## P0 — Critical Fixes (Apply Before Any Production Traffic)

| Fix ID | Bug ID | Description | SQL File | Status |
|--------|--------|-------------|----------|--------|
| SQL-001 | BUG-DB-001 | Apply 19-section RLS hardening | `supabase/fix_missing_rls_policies.sql` | ❌ PENDING — must be applied manually via Supabase Dashboard |
| SQL-002 | BUG-DB-002 | RLS for 15 base-schema tables with no policies | `supabase/fix_rls_missing_tables.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-003 | BUG-DB-005 | Drop 1-arg `accept_order_as_waiter` overload (PGRST203) | `supabase/fix_accept_order_overload.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-004 | BUG-DB-006 | Apply `offline_sync_rpcs.sql` (offline mode broken) | `supabase/offline_sync_rpcs.sql` | ❌ PENDING — pre-existing file, not yet applied |

---

## P1 — High Priority Fixes

| Fix ID | Bug ID | Description | SQL File | Status |
|--------|--------|-------------|----------|--------|
| SQL-005 | BUG-DB-009 | 13 missing FK indexes + query indexes | `supabase/fix_missing_indexes.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-006 | BUG-DB-013 | `payments.amount > 0` + valid method CHECK | `supabase/fix_order_data_integrity.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-007 | BUG-DB-012 | Discount non-negative cap on orders table | `supabase/fix_order_data_integrity.sql` | ❌ PENDING |
| SQL-008 | BUG-DB-008 | `apply_discount_to_order()` server-side RPC | `supabase/fix_apply_discount_rpc.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-009 | BUG-DB-004 | `company_id` on 7 multi-tenancy tables + backfill | `supabase/fix_company_id_columns.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |

---

## P2 — Medium Priority Fixes

| Fix ID | Bug ID | Description | SQL File | Status |
|--------|--------|-------------|----------|--------|
| SQL-010 | BUG-DB-007 | Remove duplicate `trg_order_status` trigger | `supabase/fix_order_data_integrity.sql` | ❌ PENDING |
| SQL-011 | BUG-DB-014 | Order status transition guard trigger | `supabase/fix_order_status_machine.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |
| SQL-012 | BUG-DB-019 | Soft delete (`deleted_at`) on menu/ingredient tables + RPC | `supabase/fix_soft_delete.sql` | ❌ PENDING — created by SQLfix 2026-07-17 |

---

## Frontend Bugs — Already Fixed in Current Code

> These were reported in the audit but `src/stores/orderStore.js` has already been updated.
> Verified by reading the file on 2026-07-17.

| Fix ID | Bug ID | Description | Location | Status |
|--------|--------|-------------|----------|--------|
| FE-001 | BUG-WF-001 | Delivery charge added to `total` computed | `orderStore.js:57` | ✅ ALREADY FIXED |
| FE-002 | BUG-WF-003 | `serviceChargeRate` loaded from `company_settings` DB | `orderStore.js:508–519` | ✅ ALREADY FIXED |
| FE-003 | BUG-WF-004 | Discount capped at 100% via `Math.min(discount.value, 100)` | `orderStore.js:43` | ✅ ALREADY FIXED |
| FE-004 | BUG-DB-011 | Order number includes date + 2-digit random suffix | `orderStore.js:368–373` | ✅ ALREADY FIXED |

---

## Remaining P1 Issues — Not SQL (Require Other Agents)

| Bug ID | Description | Owner | Notes |
|--------|-------------|-------|-------|
| BUG-DB-003 | 146 SECURITY DEFINER functions missing `SET search_path` | Backend/DBA | Most critical (shift, session, kiosk) already fixed. Batch fix needed for remainder. |
| BUG-DB-008 | Missing `calculate_payroll` and `get_sales_report` RPCs | Backend | Complex logic — dedicated sprint |
| BUG-DB-016 | `SELECT *` in 30+ store/service queries | Frontend | `financeService.ts` highest priority |
| BUG-DB-017 | Missing `.limit()` on unbounded sub-queries | Frontend | `orders.js:178–194` |
| BUG-DB-018 | `fetchChartOfAccounts()` missing company_id filter | Frontend | `financeService.ts:33–38` |

---

## Apply Order (Manual — via Supabase Dashboard SQL Editor)

```
1. fix_missing_rls_policies.sql      ← CRITICAL — apply first
2. fix_rls_missing_tables.sql        ← CRITICAL — apply second
3. fix_accept_order_overload.sql     ← then re-run rpc_waiter_accept_order.sql
4. offline_sync_rpcs.sql             ← offline mode
5. fix_missing_indexes.sql           ← performance (IF NOT EXISTS — safe)
6. fix_order_data_integrity.sql      ← verify no zero-amount payments first
7. fix_apply_discount_rpc.sql        ← server-side discount security
8. fix_company_id_columns.sql        ← review backfill for multi-company setups
9. fix_order_status_machine.sql      ← test on staging first
10. fix_soft_delete.sql              ← update frontend WHERE deleted_at IS NULL after
```

After each file, insert into `applied_migrations` (see `supabase/applied_migrations_ledger.sql`).

---

*SQLfix agent — Seven Waves ERP — 2026-07-17*

---

## FinanceQA Fixes — 2026-07-18

### Finance Module Audit & Fix Pass

| Fix ID | Bug ID | Severity | File | Description | Status |
|--------|--------|----------|------|-------------|--------|
| FQ-001 | BUG-DB-018 | LOW | `financeService.ts:32` | `fetchChartOfAccounts()` now accepts optional `companyId` filter | ✅ DONE |
| FQ-002 | BUG-WF-013 | HIGH | `supabase/process_refund_rpc.sql` | New `process_refund()` RPC with journal reversal + loyalty coin reversal | ✅ DONE — PENDING manual apply |
| FQ-003 | BUG-WF-013 | HIGH | `cashierStore.js` | `refundOrder(orderId, amount, reason, refundTo)` action added | ✅ DONE |
| FQ-004 | BUG-WF-013 | HIGH | `src/components/cashier/RefundDialog.vue` | Full/partial refund dialog with refund method picker | ✅ DONE (new file) |
| FQ-005 | BUG-WF-013 | HIGH | `src/pages/CashierPage.vue` | Refund button wired to paid orders; RefundDialog imported | ✅ DONE |
| FQ-006 | AutoCheck-001 | MEDIUM | `BillPrintTemplate.vue:315` | Verified already uses `orderStore.serviceChargeRate` — no change needed | ✅ ALREADY FIXED |

### Verification
- Lint: 0 errors ✅
- Tests: 440/440 passing ✅

### SQL Pending Apply
Add to Supabase migration apply order:
```
12. process_refund_rpc.sql    ← New process_refund() RPC with journal reversal
```

*FinanceQA agent — Seven Waves ERP — 2026-07-18*

---

## BugFixer Additions — 2026-07-17

### Application-Layer Fixes Applied (all verified: type-check PASS, 440/440 tests)

| Fix ID | Bug ID | Severity | File | Description | Status |
|--------|--------|----------|------|-------------|--------|
| BF-001 | BUG-WF-001 | CRITICAL | `orderStore.js:56` | `deliveryCharge` added to `total` computed | ✅ DONE |
| BF-002 | BUG-WF-004 | MEDIUM | `orderStore.js:43` | Discount capped at 100% (`Math.min`) | ✅ DONE |
| BF-003 | BUG-WF-014 | HIGH | `orderStore.js` | Loyalty RPC called after Quick Pay | ✅ DONE |
| BF-004 | BUG-WF-002 | HIGH | `orderStore.js:360` | Order number includes date + 2-digit random (ORD-MMDD-HHmmSS-RR) | ✅ DONE |
| BF-005 | BUG-WF-007 | HIGH | `financeService.ts:78` | Double-entry balance validated (Dr=Cr ±0.01) before insert | ✅ DONE |
| BF-006 | BUG-WF-008 | HIGH | `financeService.ts:107` | `reverseJournalEntry()` creates proper counter-entry + marks original reversed | ✅ DONE |
| BF-007 | BUG-WF-009 | MEDIUM | `financeService.ts:576` | Payroll net derived from gross−deductions (float-safe) | ✅ DONE |
| BF-008 | BUG-UI-010 | CRITICAL | `POSPage.vue:1209` | `fetchRestaurantTables()` now filters by `branch_id` | ✅ DONE |
| BF-009 | BUG-STR-002 | HIGH | `customerOrderStore.js:222` | QR dine-in order stores subtotal + 10% service charge in `total_amount` | ✅ DONE |
| BF-010 | BUG-STR-003 | HIGH | `cashierStore.js:387` | `markServed()` now calls `process_waiter_mark_served` RPC (awards loyalty) | ✅ DONE |
| BF-011 | C-01 (UIAudit) | HIGH | `AuthLayout.vue:15` | Login background uses CSS var instead of hardcoded `#ffffff` | ✅ DONE |
| BF-012 | C-02 (UIAudit) | CRITICAL | `MainLayout.vue:597,783` | Duplicate `.erp-branch-chip` CSS rule merged into one (removed `!important` conflicts) | ✅ DONE |
| BF-013 | H-01 (UIAudit) | HIGH | `WaiterHomePage.vue:26` | Off-shift icon changed from `'schedule'` to `'event_busy'` | ✅ DONE |
| BF-014 | C-06 (UIAudit) | CRITICAL | `KDSLayout.vue:28` | Wake lock sentinel now stored in ref and released in `onUnmounted` | ✅ DONE |

### SQL Files Created (pending manual apply to Supabase)

| File | Covers | Status |
|------|--------|--------|
| `supabase/fix_rls_critical.sql` | user_roles write policies, profiles HR-read + admin-delete, salary_structures RLS, payments CHECK constraints | ❌ PENDING apply |

### Auth Cache TTL
Auth cache TTL confirmed already correct at `300_000ms` (5 min) in `src/stores/auth.ts:112`. No change needed.

### Apply Order for New SQL File
```
11. fix_rls_critical.sql   ← after fix_missing_rls_policies.sql
```
