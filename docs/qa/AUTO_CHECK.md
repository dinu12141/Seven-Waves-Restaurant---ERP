# Automated QA Check Report
Date: 2026-07-17
Agent: AutoCheck

---

## Type Check Results

**Status: FAILED TO RUN — `vue-tsc` binary not found in `node_modules/.bin/`**

The `vue-tsc` package is listed as a dev dependency but is not installed/linked in the local `node_modules/.bin/` directory. This is likely a pnpm hoisting issue (the project has `shamefully-hoist` set but the binary is not exposed).

```
> vue-tsc --noEmit --skipLibCheck
'vue-tsc' is not recognized as an internal or external command
```

When run via `npx vue-tsc`, the process crashes with:
```
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
```

**Recommendation:** Install with `npm install` (not pnpm) or run `node --max-old-space-size=4096 $(which vue-tsc) --noEmit --skipLibCheck`. Fix the devDependency link before CI runs type-check gate.

**Type errors count: UNKNOWN (tool could not run)**

---

## Lint Results

**Status: PASSED (0 errors, 6 warnings)**

```
> eslint -c ./eslint.config.js "./src*/**/*.{js,cjs,mjs,vue}"

src/modules/devices/services/payment.terminal.service.js
  175:30  warning  '_amount' is defined but never used
  175:39  warning  '_currency' is defined but never used
  240:46  warning  'cfg' is defined but never used
  304:46  warning  '_cfg' is defined but never used

src/stores/kitchenDisplayStore.js
  218:11  warning  'branchId' is assigned a value but never used
  319:18  warning  'refreshTicketsForOrder' is defined but never used

✖ 6 problems (0 errors, 6 warnings)
```

**Summary:** 0 lint errors, 6 unused-variable warnings. Lint gate passes.

---

## Test Results

**Status: ALL PASSED ✅**

```
RUN  v4.1.6

Test Files  15 passed (15)
     Tests  440 passed (440)
  Start at  10:09:06
  Duration  787ms (transform 2.10s, setup 0ms, import 2.31s, tests 1.26s, environment 1ms)
```

**440/440 tests passing across 15 test files.**

---

## Build Results (last 30 lines of `quasar build`)

**Status: BUILD SUCCEEDED ✅**

```
 ║     assets/WebsiteReservationsPage-DZ3CJtaa.css ║     11.49 KB ║      2.02 KB ║
 ╟─────────────────────────────────────────────────╫──────────────╫──────────────╢
 ║                                      index.html ║      2.45 KB ║            - ║
 ╠═════════════════════════════════════════════════╬══════════════╬══════════════╣
 ║                            Total JS (249 files) ║   6344.29 KB ║            - ║
 ║                           Total CSS (158 files) ║   1622.96 KB ║            - ║
 ╚═════════════════════════════════════════════════╩══════════════╩══════════════╝

 Build succeeded

 Build mode............. spa
 Pkg quasar............. v2.18.7
 Pkg @quasar/app-vite... v2.5.2
 Pkg vite............... v8.0.1
 Debugging.............. no
 Publishing............. no
 Browser target......... es2022|firefox115|chrome115|safari14
 Output folder.......... dist/spa
```

**Bundle size:** 6,344 KB JS (249 files), 1,623 KB CSS (158 files). Total uncompressed JS is large — consider code-splitting.

---

## Console.log Statements (must be removed before production)

**Total: 441 occurrences across the codebase**

These leak customer PII (names, order totals, payment details, table assignments) to browser DevTools in production. Representative sample:

```
src/boot/auth.ts:217:          console.warn('[Auth] Branch access denied for path:', to.path)
src/boot/error-handler.ts:7:   console.error('[Global Error API]:', err)
src/boot/tauri-auth.ts:31:     console.log('[Tauri Auth] Received auth code, exchanging for session...')
src/components/common/GlobalSearch.vue:241: console.error('[GlobalSearch] RPC error:', err)
src/components/inventory/DocumentCreateTab.vue:276: console.log('Open POs:', openPOs.value)
src/components/inventory/DocumentCreateTab.vue:482: console.log('Fetched Open POs:', pos)
src/components/inventory/MenuItemsTab.vue:641: console.log(...)
src/components/inventory/MenuItemsTab.vue:652: console.log('[MenuItems] Found mapping:', mapping)
src/components/inventory/MenuItemsTab.vue:655: console.log('[MenuItems] Auto-filled kitchen_id:', mapping.kitchen_id)
src/components/inventory/WarehousesTab.vue:301: console.log('[WarehouseTab] Updating warehouse:...')
src/components/inventory/WarehousesTab.vue:305: console.log('[WarehouseTab] Creating warehouse:...')
src/components/inventory/MenuBookTab.vue:852: console.log('[MenuBook] Loaded', allMenuItems.value.length, 'menu items')
src/components/inventory/MenuItemsTab.vue:602: console.log('[MenuItems] Kitchen mappings loaded:...')
src/stores/orderStore.js: (multiple)
src/stores/kitchenDisplayStore.js: (multiple)
src/stores/waiterOrderStore.js: (multiple)
... (441 total)
```

**High-risk leaks (PII in console):**
- Order totals, customer names logged in `orderStore.js`
- Payment amounts in `cashierStore.js` / `BillDialog.vue`
- Employee salary data in `PayrollTab.vue`
- Auth token fragments in `tauri-auth.ts`

**Fix:** Add `"no-console": "error"` to `eslint.config.js`. The project has a structured `logger.ts` (`src/core/logging/logger.ts`) that respects `LogLevel` (DEBUG in dev, WARN in prod) — all `console.*` calls should migrate to this logger.

---

## TODO/FIXME Comments

**Total: 3 actionable TODOs found**

```
src/modules/devices/services/zkteco.service.js:336:
  // TODO: add 'biometric:sync' to ALLOWED_INVOKE in electron-preload.js
  → Biometric sync IPC channel not whitelisted — biometric devices will fail silently in Electron

src/pages/admin/PrintersPage.vue:650:
  // TODO: When print-agent is available, POST to http://localhost:6001/test-print
  → Print test button is a dead stub — no agent implemented

src/services/procurementService.ts:946:
  // TODO: Integrate with a reporting/PDF service
  → Procurement PDF export not implemented
```

---

## v-html Usage (XSS Risk)

**Total: 1 instance**

```
src/components/common/GlobalSearch.vue:78:
  <span class="gs-item__title" v-html="highlight(item.title)" />
```

**Assessment: SAFE** — `highlight()` calls `escapeHtml()` before injecting markup. The function escapes `<`, `>`, `&`, `"`, `'` before wrapping matches in `<mark>` tags. No raw user input passes to `v-html` unescaped.

**Recommendation:** Add a comment above this usage documenting why it is safe, to prevent future contributors from removing `escapeHtml()` unknowingly.

---

## localStorage Usage

**Total: 52 localStorage calls across 22 files**

| File | Keys Used | Risk |
|------|-----------|------|
| `src/stores/auth.ts` | `sw_profile_cache_{uid}` | Caches user roles/permissions — stale cache risk |
| `src/layouts/TouchMenuLayout.vue` | `tm_table_id`, `tm_session_token`, `tm_dark_mode`, `tm_customer_name`, `tm_loyalty_points` | QR session data, loyalty points in plain localStorage |
| `src/pages/QrEntryPage.vue` | `tm_table_id`, `tm_session_token`, `qr_session_token` | Session tokens in plain localStorage |
| `src/services/customerAuthService.ts` | `sw_customer_local` | Customer PII stored unencrypted |
| `src/stores/shiftStore.ts` | `sw_terminal_id` | POS terminal identifier |
| `src/stores/tableSessionStore.ts` | `table_active_orders`, `table_order_history`, `sw_device_code` | Order data persisted locally |
| `src/stores/managerAppStore.js` | `mgr_viewed_alerts` | Manager alert tracking |
| `src/stores/waiterAppStore.js` | `waiter_sound_enabled` | Preference — low risk |
| `src/pages/admin/TablesManagementPage.vue` | `sw_qr_base_url` | Admin override for QR URLs |
| `src/components/inventory/ItemsTab.vue` | `erp_item_types` | Caches item type enum |
| `src/modules/ai/stores/ai.store.js` | `sw_ai_chat_history` | AI chat history in plain text |
| `src/core/security/securityLogger.js` | `sw_security_escalations` | Security events stored in browser |

**Risks:**
- Session tokens (`tm_session_token`, `qr_session_token`) in localStorage are accessible to any JS on the page — XSS would steal sessions
- Customer PII (`sw_customer_local`) stored unencrypted
- Auth role cache (`sw_profile_cache_*`) could be stale after role change
- Security escalation logs in localStorage defeats their audit purpose if user can clear them

---

## Hardcoded Values

**Notable hardcoded values found in source:**

```
src/components/cashier/BillPrintTemplate.vue:312:
  return sub * 0.1   ← 10% service charge hardcoded

src/stores/orderStore.js (via WorkflowAuditor finding):
  serviceChargeRate = 0.1  ← 10% not configurable per branch

src/pages/POSPage.vue (via UIAuditor finding):
  "1 coin = LKR 500"  ← loyalty coin rate hardcoded

src/components/customer/OrderTrackingPanel.vue:185:
  message: 'Chefs are working their magic!'  ← hardcoded UI string (not i18n)
```

**Additional hardcoded rgba() values** (CSS only, not logic — lower risk):
- Multiple `rgba(255,255,255,0.1)` values in dark-mode-only components
- `background: linear-gradient(135deg, ...)` hardcoded in `DashboardPage.vue`

---

## Vue File Inventory

**Total: 325 Vue files**

```
Layouts (9):
  AuthLayout.vue, CustomerLayout.vue, DeliveryAppLayout.vue, KDSLayout.vue,
  MainLayout.vue, ManagerAppLayout.vue, ReportsLayout.vue, TouchMenuLayout.vue,
  WaiterAppLayout.vue

Pages (195+):
  src/pages/           — core pages (POS, Orders, Kitchen, Waiter, Cashier, etc.)
  src/pages/admin/     — admin management pages
  src/pages/auth/      — login, profile
  src/pages/dashboard/ — main dashboard
  src/pages/delivery-app/ — rider PWA
  src/pages/finance/   — finance module pages
  src/pages/hr/        — HR module pages
  src/pages/inventory/ — inventory pages
  src/pages/manager-app/ — manager PWA
  src/pages/procurement/ — procurement pages
  src/pages/reports/   — 40+ report pages
  src/pages/touch-menu/ — kiosk UI
  src/pages/waiter-app/ — waiter PWA
  src/pages/website/   — website/online ordering pages

Components (120+):
  src/components/cashier/   src/components/common/
  src/components/customer/  src/components/dashboard/
  src/components/delivery/  src/components/hr/
  src/components/inventory/ src/components/kitchen/
  src/components/orders/    src/components/pos/
  src/components/procurement/ src/components/touch-menu/
  src/components/waiter/

Modules (35+):
  src/modules/ai/components + pages
  src/modules/devices/components + pages
  src/modules/finance/components + pages
```

---

## Summary

| Check | Result | Details |
|-------|--------|---------|
| Type Check | ⚠️ COULD NOT RUN | `vue-tsc` binary not in `node_modules/.bin/` — OOM on `npx` fallback |
| Lint | ✅ PASSED | 0 errors, 6 warnings (unused vars) |
| Tests | ✅ PASSED | 440/440 tests passing, 15 test files |
| Build | ✅ PASSED | `quasar build` succeeded — SPA output in `dist/spa` |
| Console.log statements | ❌ 441 found | Must remove before production — PII leakage risk |
| TODO/FIXME comments | ⚠️ 3 found | 2 features incomplete, 1 IPC channel not whitelisted |
| v-html instances | ✅ SAFE | 1 instance in GlobalSearch.vue — properly sanitized |
| localStorage keys | ⚠️ 52 calls, 22 files | Session tokens + PII in plain localStorage |
| Hardcoded values | ⚠️ Multiple | Service charge 10%, loyalty rate, currency strings |
| Vue file count | ℹ️ 325 files | Large surface area for UI bugs |

---

## Critical Actions Required

1. **[BLOCKER] Fix `vue-tsc` install** — type checking is completely broken; CI type-check gate cannot run. Run `npm install` or pin `vue-tsc` to a version compatible with available Node.js heap.

2. **[HIGH] Remove 441 console.log/warn/error calls** — add `"no-console": "error"` to `eslint.config.js` and migrate to `src/core/logging/logger.ts`.

3. **[HIGH] Move session tokens off localStorage** — `tm_session_token`, `qr_session_token` should use `sessionStorage` or httpOnly cookies to prevent XSS token theft.

4. **[MEDIUM] Make service charge configurable** — `BillPrintTemplate.vue:312` and `orderStore.js` both hardcode 10%; pull from branch settings table.

5. **[LOW] Add IPC whitelist entry for biometric sync** — `zkteco.service.js:336` TODO will cause silent failure in Electron builds.
