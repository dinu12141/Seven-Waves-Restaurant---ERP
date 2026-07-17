# UI / UX Audit — Seven Waves Restaurant ERP

**Auditor:** UIAuditor agent  
**Date:** 2026-07-17  
**Scope:** All Vue layouts, pages, and components in `src/`  
**Total Vue files inventoried:** ~155 (layouts: 8, pages: ~100, components: ~47)

---

## Executive Summary

The Seven Waves ERP has a well-structured multi-layout architecture covering six distinct app "worlds" (MainLayout ERP, WaiterApp PWA, ManagerApp PWA, DeliveryApp PWA, TouchMenu kiosk, CustomerLayout). Dark-mode support is implemented throughout via CSS custom properties (`--erp-*`) and `body--dark` / `body--light` class overrides.

**However, a number of critical and high-severity bugs were found:**

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 4 |
| MEDIUM | 8 |
| LOW | 5 |
| **Total** | **18** |

Additionally, a **system-wide** issue: **257 `console.log/error/warn` calls exist across 127 Vue files** — all will leak sensitive business data (order totals, customer names, payment amounts) to browser DevTools in production.

---

## Bug Registry

### BUG-UI-010 · CRITICAL · POSPage.vue:1181–1193

**Title:** `fetchRestaurantTables()` loads ALL tables from ALL branches — no `branch_id` filter

**Impact:** In a multi-branch deployment, the POS table selection shows every table from every branch. A cashier at Branch A sees Branch B and Branch C tables and can assign orders to them, causing cross-branch order confusion and mis-routing to the wrong kitchen.

**File:** `src/pages/POSPage.vue` ~line 1181  
**Code (approximate):**
```js
const { data } = await supabase
  .from('restaurant_tables')
  .select('id, table_number, status, capacity')
  .eq('is_active', true)
```

**Fix:** Add `.eq('branch_id', currentBranchId)` filter. Ensure `currentBranchId` is read from `authStore.activeBranchId` or the shift's branch.

---

### BUG-UI-001 · HIGH · AuthLayout.vue:15

**Title:** `background: #ffffff` hardcoded — auth pages always white, dark mode never applied

**Impact:** When a user has dark mode enabled, the entire login flow (login, forgot-password, profile pages) remains white. This is jarring and makes the auth area feel broken.

**File:** `src/layouts/AuthLayout.vue`  
**Code:**
```css
.auth-layout {
  background: #ffffff; /* ← hardcoded */
  min-height: 100vh;
}
```

**Fix:** Replace with `background: var(--erp-bg-page)` or rely on `q-layout` default background. Remove the hardcoded value.

---

### BUG-UI-002 · HIGH · DeliveryAppLayout.vue:57,65

**Title:** `<q-separator dark />` hardcoded — separators in user dropdown always appear dark even in light mode

**Impact:** In light mode, the two separator lines in the delivery rider user dropdown have a dark Quasar separator style, appearing as strong dark lines on a white/light background. Visually inconsistent.

**File:** `src/layouts/DeliveryAppLayout.vue` lines 57 and 65  
**Code:**
```html
<q-separator dark />
```

**Fix:** Remove the `dark` prop. The separator will inherit the current theme automatically:
```html
<q-separator />
```

---

### BUG-UI-004 · HIGH · DashboardPage.vue:1258–1263

**Title:** Revenue chart card has hardcoded dark gradient — always dark, invisible in light mode

**Impact:** The revenue area chart card uses a hard-coded CSS gradient `linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c1a2e 100%)`. In light mode the card appears as a dark block, making the white chart labels invisible against the dark card background.

**File:** `src/pages/dashboard/DashboardPage.vue` ~line 1258  
**Code:**
```css
.dash-card--chart {
  background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c1a2e 100%);
}
```

**Fix:** Either wrap the gradient in `.body--dark .dash-card--chart { ... }` and provide a neutral light-mode alternative, or use a CSS variable that resolves to the gradient only in dark mode.

---

### BUG-UI-015 · HIGH · OrdersPage.vue:~526

**Title:** `cancelOrder()` fires immediately with no confirmation dialog — one click cancels live orders

**Impact:** A single accidental click on the Cancel button permanently cancels an accepted order with food already being prepared in the kitchen. No undo exists. This is a high-severity operational risk in a busy restaurant setting.

**File:** `src/pages/OrdersPage.vue` ~line 526  
**Fix:** Wrap the action in a `$q.dialog({ title: 'Cancel Order?', message: '...', cancel: true })` confirmation. Only call the cancel RPC on confirmation.

---

### BUG-UI-003 · MEDIUM · KDSLayout.vue

**Title:** Missing `<OfflineBanner />` — kitchen displays have no offline awareness

**Impact:** The KDS (kitchen display system) is a critical operational screen. When the kitchen display goes offline (network drop, Supabase outage), the staff have no visual indication. Orders silently stop arriving. Every other layout (Waiter, Manager, Delivery) shows an `<OfflineBanner />`.

**File:** `src/layouts/KDSLayout.vue`  
**Fix:** Import and add `<OfflineBanner />` to the layout template, after `<NotificationToast />`.

---

### BUG-UI-005 · MEDIUM · DashboardPage.vue:~527

**Title:** ApexCharts tooltip theme hardcoded as `'dark'` — tooltip always dark regardless of user theme

**Impact:** In light mode, chart tooltips appear with a dark background and white text, clashing with the overall light UI.

**File:** `src/pages/dashboard/DashboardPage.vue`  
**Code:**
```js
tooltip: { theme: 'dark' }
```

**Fix:**
```js
import { useQuasar } from 'quasar'
const $q = useQuasar()
// in chart options computed:
tooltip: { theme: $q.dark.isActive ? 'dark' : 'light' }
```
Make chart options a `computed()` so they react to dark mode toggling.

---

### BUG-UI-006 · MEDIUM · DashboardPage.vue:~1648

**Title:** Table order dialog panel header has `background: #fff` hardcoded — dark mode gap

**Impact:** The order-detail slide-out panel that opens when clicking a table on the live floor map has a white header in dark mode, showing as a bright white block in an otherwise dark UI.

**File:** `src/pages/dashboard/DashboardPage.vue` ~line 1648  
**Fix:** Replace `background: #fff` with `background: var(--erp-bg-card)` or the appropriate CSS variable.

---

### BUG-UI-007 · MEDIUM · DashboardPage.vue:~1803

**Title:** Order items list rows have `background: #fff` hardcoded — dark mode gap

**Impact:** Inside the same table order detail panel, each order item row renders with a white background in dark mode, making text near-invisible.

**File:** `src/pages/dashboard/DashboardPage.vue` ~line 1803  
**Fix:** Replace with `background: var(--erp-bg-input)` or similar.

---

### BUG-UI-011 · MEDIUM · POSPage.vue:~654

**Title:** Loyalty coin redemption rate hardcoded as `1 coin = LKR 500` — not configurable

**Impact:** The POS displays "1 coin = LKR 500" in the redemption dialog as a hardcoded string and in the calculation `redeemCoinsInput * 500`. If the operator changes the loyalty rate, the POS will still calculate and display the wrong rate without a code change.

**File:** `src/pages/POSPage.vue` ~line 654  
**Fix:** Read the rate from a settings table (e.g. `restaurant_settings.loyalty_coin_value`) and expose it via a store getter. Use the dynamic value in both display and calculation.

---

### BUG-UI-014 · MEDIUM · LoginPage.vue

**Title:** No "Forgot Password" link or functionality anywhere in the auth flow

**Impact:** Users who forget their password have no self-service recovery path. An admin must manually reset passwords. This is a significant UX gap for a multi-user system.

**File:** `src/pages/auth/LoginPage.vue`  
**Fix:** Add a "Forgot password?" link below the password field. Implement a `forgotPassword()` method that calls `supabase.auth.resetPasswordForEmail(email)`. Create a `ResetPasswordPage.vue` and add its route under `/auth/reset-password`.

---

### BUG-UI-016 · MEDIUM · OrdersPage.vue:~487

**Title:** `window.__orderDetailTab` global variable used to communicate dialog tab state — anti-pattern

**Impact:** The `viewOrderKot()` and `viewOrderInvoice()` functions set `window.__orderDetailTab = 'kot'` or `'invoice'` before opening a dialog. The dialog reads this global on mount. This is fragile — multiple tabs or race conditions will read stale values, and it's impossible to test.

**File:** `src/pages/OrdersPage.vue` ~lines 487–499  
**Fix:** Pass the tab as a prop or via a reactive `ref` in the parent. Example: `<OrderDetailDialog v-model="showDialog" :initial-tab="activeTab" />`.

---

### BUG-UI-017 · MEDIUM · OrdersPage.vue:~31

**Title:** "History" button in toolbar has no `@click` handler — dead UI element

**Impact:** Users can see and click a "History" button in the Orders page toolbar, but nothing happens. This is a visible non-functional control that creates confusion.

**File:** `src/pages/OrdersPage.vue` ~line 31–38  
**Fix:** Either wire up the handler (e.g. navigate to the completed orders filter or a separate history page), or remove the button if the feature is not yet implemented.

---

### BUG-UI-018 · MEDIUM · OrdersPage.vue:~503

**Title:** `advanceOrder()` missing `'preparing' → 'ready'` transition — kitchen stage unreachable from this page

**Impact:** The advance order button on the Orders kanban handles `pending → accepted` and `ready → served`, but skips the `preparing → ready` transition. If a manager is using OrdersPage to advance orders (e.g., kitchen staff do not use KDS), orders get stuck in the "Preparing" column indefinitely.

**File:** `src/pages/OrdersPage.vue` ~lines 503–528  
**Fix:** Add the missing `case 'preparing':` branch that calls the appropriate RPC or status update to transition the order to `'ready'`.

---

### BUG-UI-008 · LOW · DashboardPage.vue:708,932

**Title:** `console.error()` calls in production code

**Impact:** Error details (including Supabase error payloads with table names, RLS policy names, column values) are logged to browser DevTools in production, leaking internal schema information.

**File:** `src/pages/dashboard/DashboardPage.vue` lines 708, 932  
**Fix:** Replace with the project's `ErrorHandler` or `logger` from `src/core/logging/`. Remove or guard behind `import.meta.env.DEV`.

---

### BUG-UI-009 · LOW · DashboardPage.vue:799–809

**Title:** Busy-wait polling (8 × 500ms setTimeout) while waiting for branch ID — poor pattern

**Impact:** During dashboard mount, code retries 8 times at 500ms intervals waiting for `authStore.activeBranchId` to be set. This is fragile: on slow connections the 4-second window expires before auth resolves, causing a silent empty dashboard with no error shown to the user.

**File:** `src/pages/dashboard/DashboardPage.vue`  
**Fix:** Use `watch(authStore, () => ..., { once: true })` or `await authStore.initialize()` (if the store exposes a readiness promise) rather than a retry loop.

---

### BUG-UI-012 · LOW · POSPage.vue (multiple locations)

**Title:** 15+ `console.log / console.error / console.warn` calls in production POS code

**Impact:** POS is the highest-sensitivity area of the application. Console statements expose: customer names, order totals, payment method details, cart contents, and table assignments.

**File:** `src/pages/POSPage.vue` ~lines 960, 984, 1134, 1175, 1192, 1286 (and more)  
**Fix:** Remove all console statements. For error paths, use `ErrorHandler.capture(err)` from `src/core/errors/`.

---

### BUG-UI-013 · LOW · KitchenPage.vue:~415

**Title:** `window.addEventListener('online', store.fetchTickets)` not removed in `onUnmounted` — memory leak

**Impact:** Every time KitchenPage mounts, a new `online` event listener is added to `window`. Navigating away and back accumulates listeners that each trigger a `fetchTickets()` call when the device reconnects, causing duplicate fetches.

**File:** `src/pages/KitchenPage.vue` ~line 415  
**Fix:**
```js
onMounted(() => {
  window.addEventListener('online', store.fetchTickets)
})
onUnmounted(() => {
  window.removeEventListener('online', store.fetchTickets)
})
```

---

## System-Wide Issues

### SW-001 · Console Statements in Production (127 files)

A repository-wide scan found **257 `console.log / console.error / console.warn / console.debug` calls** spread across **127 Vue files**. Files with the highest counts:

| File | Count |
|------|-------|
| `src/pages/hr/EmployeesPage.vue` | 13 |
| `src/components/inventory/MenuItemsTab.vue` | 8 |
| `src/components/reports/InvoiceViewDialog.vue` | 8 |
| `src/pages/POSPage.vue` | 15 |
| `src/pages/admin/UsersPage.vue` | 9 |
| `src/components/pos/PaymentDialog.vue` | 4 |
| (and 121 more files) | — |

**Recommendation:** Add an ESLint rule `"no-console": "error"` to `eslint.config.js` and replace all console calls with `src/core/logging/` logger or `src/core/errors/ErrorHandler`. This is a pre-production blocker.

### SW-002 · `v-html` Usage — Safe (Confirmed)

One `v-html` usage found: `src/components/common/GlobalSearch.vue:78`. The `highlight()` function properly calls `escapeHtml()` on both the text content and the search query before constructing the `<mark>` tag. **This is safe — no XSS risk.**

### SW-003 · Emoji in Template Code (POSPage.vue)

`src/pages/POSPage.vue` uses raw emoji characters (`📞`, `🆔`, `🪙`, `➕`) in template labels instead of Material Icons or Quasar icon names. This causes inconsistent rendering across platforms and breaks screen readers.

**Fix:** Replace with `<q-icon name="phone" />`, `<q-icon name="badge" />`, etc.

---

## Layout-by-Layout Summary

| Layout | Dark Mode | Offline Banner | Auth Guard | Notes |
|--------|-----------|----------------|------------|-------|
| `MainLayout.vue` | ✅ Full | ✅ | ✅ | Well-implemented |
| `WaiterAppLayout.vue` | ✅ Full | ✅ | ✅ | Shift guard active, audio primed |
| `ManagerAppLayout.vue` | ✅ Full | ✅ | ✅ | Manager role guard on mount |
| `DeliveryAppLayout.vue` | ✅ (light overrides) | ✅ | ✅ | **BUG-UI-002** hardcoded separators |
| `KDSLayout.vue` | Always dark (intentional) | ❌ Missing | Partial (onMounted only) | **BUG-UI-003** |
| `AuthLayout.vue` | ❌ Always white | N/A | N/A | **BUG-UI-001** |
| `TouchMenuLayout.vue` | ✅ | Unknown | N/A (public) | Appears theme-aware |
| `CustomerLayout.vue` | ✅ | N/A | N/A (public) | Standard layout |
| `ReportsLayout.vue` | ✅ | N/A | ✅ | No issues found |

---

## Page-by-Page Summary

| Page | Severity | Key Bugs |
|------|----------|----------|
| `DashboardPage.vue` | HIGH | BUG-UI-004, -005, -006, -007, -008, -009 |
| `POSPage.vue` | CRITICAL | BUG-UI-010, -011, -012, SW-003 |
| `OrdersPage.vue` | HIGH | BUG-UI-015, -016, -017, -018 |
| `KitchenPage.vue` | LOW | BUG-UI-013 |
| `LoginPage.vue` | MEDIUM | BUG-UI-014, compound with BUG-UI-001 |
| `CashierPage.vue` | OK | No critical issues found |
| `TablesManagementPage.vue` | OK | Has branch filter ✅ |

---

## Top 10 Critical UI Bugs (Priority Order)

| Rank | ID | Description | Severity |
|------|----|-------------|----------|
| 1 | BUG-UI-010 | POS tables unfiltered by branch — cross-branch order assignment possible | CRITICAL |
| 2 | BUG-UI-015 | Cancel order — no confirmation dialog, one-click destroys live orders | HIGH |
| 3 | SW-001 | 257 console statements across 127 files leak business data in production | HIGH |
| 4 | BUG-UI-001 | Auth pages always white — dark mode never applies to login | HIGH |
| 5 | BUG-UI-004 | Dashboard revenue chart hardcoded dark gradient — broken in light mode | HIGH |
| 6 | BUG-UI-003 | KDS layout missing OfflineBanner — kitchen has no connectivity warning | MEDIUM |
| 7 | BUG-UI-014 | No forgot-password flow on login page | MEDIUM |
| 8 | BUG-UI-018 | `advanceOrder()` missing preparing→ready transition — orders get stuck | MEDIUM |
| 9 | BUG-UI-017 | Dead "History" button on Orders page — visible but unresponsive | MEDIUM |
| 10 | BUG-UI-002 | DeliveryApp separators hardcoded dark — broken in light mode | HIGH |

---

## Recommendations for Fixer Agent

### Fix Group A — Dark Mode Corrections (2–3h)

1. `AuthLayout.vue:15` — remove `background: #ffffff`, use CSS variable
2. `DeliveryAppLayout.vue:57,65` — remove `dark` prop from `<q-separator>`
3. `DashboardPage.vue` — replace all hardcoded `#fff` / `#0f172a` background values with `var(--erp-bg-card)` / `var(--erp-bg-page)`
4. `DashboardPage.vue` — make ApexCharts options a `computed()` so `tooltip.theme` reacts to dark mode

### Fix Group B — Critical Functional (1–2h)

5. `POSPage.vue:fetchRestaurantTables()` — add `.eq('branch_id', activeBranchId)` filter
6. `OrdersPage.vue:cancelOrder()` — add `$q.dialog()` confirmation before executing cancel
7. `OrdersPage.vue:advanceOrder()` — add `'preparing' → 'ready'` case

### Fix Group C — UX Gaps (2–3h)

8. `OrdersPage.vue` — wire or remove "History" button; replace `window.__orderDetailTab` with prop
9. `LoginPage.vue` — add Forgot Password link + `supabase.auth.resetPasswordForEmail()` flow
10. `KDSLayout.vue` — add `<OfflineBanner />` import and usage

### Fix Group D — Housekeeping (1h + ESLint config)

11. Add `"no-console": "error"` to `eslint.config.js`
12. Replace all `console.*` calls with logger / ErrorHandler (run lint --fix where possible)
13. `KitchenPage.vue` — add `removeEventListener` in `onUnmounted`
14. `POSPage.vue` — replace emoji with Quasar icon names

---

*Report generated by UIAuditor agent. See MASTER_AUDIT_REPORT.md for cross-team findings.*
