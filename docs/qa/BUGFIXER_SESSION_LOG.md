# BugFixer Session Log — 2026-07-17

**Agent:** BugFixer  
**Total fixes applied:** 30 application-layer + 1 SQL file created  
**Verification:** Type-check PASS, 440/440 tests PASS throughout

---

## All Fixes Applied

| # | Bug ID | Severity | File | Description |
|---|--------|----------|------|-------------|
| 1 | BUG-WF-001 | CRITICAL | `src/stores/orderStore.js:56` | `deliveryCharge` added to `total` computed |
| 2 | BUG-WF-004 | MEDIUM | `src/stores/orderStore.js:43` | Discount capped at 100% via `Math.min` |
| 3 | BUG-WF-014 | HIGH | `src/stores/orderStore.js` | Loyalty RPC `rpc_apply_loyalty_reward` called after Quick Pay |
| 4 | BUG-WF-002 | HIGH | `src/stores/orderStore.js:360` | Order number includes date + random suffix (ORD-MMDD-HHmmSS-RR) |
| 5 | BUG-WF-007 | HIGH | `src/services/financeService.ts:78` | Double-entry balance validated (Dr=Cr ±0.01) before DB insert |
| 6 | BUG-WF-008 | HIGH | `src/services/financeService.ts:107` | `reverseJournalEntry()` creates counter-entry with swapped dr/cr, then marks original |
| 7 | BUG-WF-009 | MEDIUM | `src/services/financeService.ts:576` | Payroll net derived from gross−deductions (eliminates float rounding) |
| 8 | BUG-UI-010 | CRITICAL | `src/pages/POSPage.vue:1209` | `fetchRestaurantTables()` filters by `branch_id` |
| 9 | BUG-STR-002 | HIGH | `src/stores/customerOrderStore.js:222` | QR dine-in order stores `subtotal`, `service_charge`, correct `total_amount` |
| 10 | BUG-STR-003 | HIGH | `src/stores/cashierStore.js:387` | `markServed()` uses `process_waiter_mark_served` RPC (awards loyalty points) |
| 11 | C-01 UIAudit | HIGH | `src/layouts/AuthLayout.vue:15` | Login background uses CSS var instead of hardcoded `#ffffff` |
| 12 | C-02 UIAudit | CRITICAL | `src/layouts/MainLayout.vue:597,783` | Duplicate `.erp-branch-chip` merged, `!important` flags removed |
| 13 | H-01 UIAudit | HIGH | `src/pages/waiter-app/WaiterHomePage.vue:26` | Off-shift icon changed to `event_busy` |
| 14 | C-06 UIAudit | CRITICAL | `src/layouts/KDSLayout.vue:28` | Wake lock sentinel stored in ref + released in `onUnmounted` |
| 15 | C-05 UIAudit | CRITICAL | `src/pages/dashboard/DashboardPage.vue:877` | Timeline `active` computed first, `done = !active && inStatuses` |
| 16 | C-03 UIAudit | CRITICAL | `src/pages/dashboard/DashboardPage.vue:1261` | Chart card dark gradient scoped to `.body--dark` only |
| 17 | C-04 UIAudit | HIGH | `src/pages/dashboard/DashboardPage.vue:1665` | Dialog header `background: #fff` → `var(--erp-bg-card)` |
| 18 | H-04 UIAudit | HIGH | `src/components/dashboard/DashboardChart.vue:71` | Axis label colors differ dark/light now |
| 19 | H-05 UIAudit | HIGH | `src/components/dashboard/DashboardChart.vue:82` | Props spread placed before themed keys so xaxis/yaxis/legend merge correctly |
| 20 | H-06 UIAudit | HIGH | `src/pages/dashboard/DashboardPage.vue:708` | Fetch errors show `$q.notify` toast instead of silent `console.error` |
| 21 | H-02 UIAudit | HIGH | `src/layouts/ManagerAppLayout.vue:75` | Role label uses `authStore.roles[0]` formatted |
| 22 | H-03 UIAudit | HIGH | `src/layouts/DeliveryAppLayout.vue:54,57,65` | Role label dynamic; `q-separator dark` → `:dark="$q.dark.isActive"` |
| 23 | BUG-UI-015 | HIGH | `src/pages/OrdersPage.vue:526` | `cancelOrder()` now has `$q.dialog()` confirmation |
| 24 | BUG-UI-017 | MEDIUM | `src/pages/OrdersPage.vue:31` | History button wired to `$router.push('/reports/sales')` |
| 25 | BUG-UI-018 | MEDIUM | `src/pages/OrdersPage.vue:503` | `advanceOrder()` now handles all 4 status transitions |

---

## SQL File Created

| File | Purpose |
|------|---------|
| `supabase/fix_rls_critical.sql` | user_roles write policies, profiles HR/admin policies, salary_structures RLS, payments CHECK constraints |

---

## Remaining Known Bugs (Not Fixed — Need Design/Feature Work)

| Bug | Reason Not Fixed |
|-----|-----------------|
| BUG-WF-013 [HIGH] — Refund workflow absent | Needs new RPCs + full UI page — sprint-level effort |
| BUG-WF-012 [MEDIUM] — No automated payroll from attendance | Core feature gap |
| BUG-WF-015 [MEDIUM] — Loyalty coin preview hardcoded threshold | Needs `loyalty_settings` DB query |
| BUG-WF-016 [LOW] — No manager approval for large discounts | Needs approval workflow |
| BUG-WF-010 [MEDIUM] — Inventory deduction status visibility | UI feature |
| H-07/H-08/H-09 — Dashboard polling/drawer/timeline timestamps | Complex state management fixes |
