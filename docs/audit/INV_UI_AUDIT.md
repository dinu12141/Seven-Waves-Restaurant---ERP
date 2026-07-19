# INV_UI_AUDIT.md — Inventory & Procurement UI Audit

**Auditor:** InvUI  
**Date:** 2026-07-19  
**Scope:** All inventory and procurement UI pages

---

## Files Audited

| File | Status |
|------|--------|
| `src/pages/InventoryPage.vue` | ✅ Fixed |
| `src/pages/inventory/InventoryDashboard.vue` | ✅ Fixed |
| `src/pages/inventory/ItemsPage.vue` | ✅ Fixed |
| `src/pages/inventory/StockAdjustmentPage.vue` | ✅ Fixed |
| `src/pages/inventory/StockTakePage.vue` | ✅ Fixed |
| `src/pages/procurement/GRNPage.vue` | ✅ Fixed |
| `src/pages/procurement/PurchaseOrdersPage.vue` | ✅ Fixed |
| `src/pages/procurement/ProcurementDashboard.vue` | ✅ Fixed |
| `src/router/routes.js` | ✅ All inventory routes present |

---

## Findings & Fixes Applied

### CRITICAL

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| C1 | `StockAdjustmentPage.vue` | Adjustments only decremented stock (`-Math.abs(qty)` hardcoded). No way to increase stock via adjustment — broke "Stocktake Correction" use case. | Added `adjustmentDirection` ref + UI dropdown (Decrease/Increase). `postAdjustment` now applies `signedQty = isIncrease ? +qty : -qty`. Stock level computed as `currentQty + signedQty`. |

### HIGH

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| H1 | `GRNPage.vue` | Page header was a raw `<div>` with hardcoded text, not using the ERP design system `ErpPageHeader` component. | Replaced with `<ErpPageHeader>` (title, subtitle, icon, breadcrumbs, actions slot). Added `ErpPageHeader` import. |
| H2 | `PurchaseOrdersPage.vue` | Same as H1 — custom div header instead of `ErpPageHeader`. | Same fix — `<ErpPageHeader>` with breadcrumbs and New PO action in `#actions` slot. |
| H3 | `InventoryPage.vue` | Main card used `class="bg-dark text-white"` — hardcoded dark background not using design system vars. Tab panel also had `class="bg-dark text-white"`. | Changed to `flat bordered` on the card, removed hardcoded color class from `<q-tab-panels>`. |
| H4 | `ProcurementDashboard.vue` | Supplier Alerts panel used `class="bg-dark text-white"` — hardcoded colors. | Changed to `flat bordered` (uses CSS var `--erp-bg-card` via Quasar theming). |
| H5 | `InventoryDashboard.vue` | Data fetch error caught with `console.error` only — user sees nothing if data fails to load. | Added `$q.notify({ type: 'negative', ... })` in the catch block. Added `useQuasar` import. |

### MEDIUM

| # | File | Issue | Fix Applied |
|---|------|-------|-------------|
| M1 | `ItemsPage.vue` | `<q-table>` missing `class="erp-table"` — ERP design system table style not applied. | Added `class="erp-table"` to the q-table. |
| M2 | `StockAdjustmentPage.vue` | Both tables (lines + history) missing `class="erp-table"` and `bordered`. | Added `flat bordered class="erp-table"` to both. |
| M3 | `StockTakePage.vue` | Both tables (count sheet + history) missing `class="erp-table"` and `bordered`. | Added `flat bordered class="erp-table"` to both. |
| M4 | `InventoryDashboard.vue` | Chart options had `theme: { mode: 'dark' }` hardcoded — ignores light mode. | Changed to `theme: { mode: $q.dark.isActive ? 'dark' : 'light' }`. |
| M5 | `InventoryDashboard.vue` | `.detail-card` used `background: #0d1117 !important` — hardcoded dark hex. | Changed to `background: var(--erp-bg-card) !important`. |
| M6 | `InventoryDashboard.vue` | `.alert-panel` used `background: var(--erp-bg-panel, #161b22)` and `border: 1px solid var(--erp-border, rgba(255,255,255,0.08))` — hex fallbacks. | Updated to use `var(--erp-bg-card)` and `var(--erp-border)` as fallbacks. |
| M7 | `InventoryDashboard.vue` | `.alert-panel__header` had `border-bottom: 1px solid rgba(255,255,255,0.07)` and `background: rgba(255,255,255,0.03)` — raw RGBA. | Changed to `var(--erp-border)` and `var(--erp-bg-hover)`. |

### LOW / INFO

| # | File | Issue | Status |
|---|------|-------|--------|
| L1 | `GRNPage.vue` | `printGRN()` is an empty stub. | Left as-is — print is a future feature, not a bug. |
| L2 | `PurchaseOrdersPage.vue` | `cancelPO()` and `printPO()` are placeholder stubs. | Left as-is — same reason. |
| L3 | `PurchaseOrdersPage.vue` | Editing an existing PO shows "PO edits coming soon" notification. | Left as-is — design decision, not UI bug. |
| L4 | `ItemsPage.vue` | Category options are hardcoded (Raw Material, Finished Goods, etc.) instead of fetched from DB. | Left as-is — simple fixed taxonomy, may be intentional. |
| L5 | `StockAdjustmentPage.vue` | `adjustmentReason` defaults to 'Wastage' so the reason guard at line 341 never actually triggers. | Left as-is — harmless dead guard, default value prevents null. |

---

## Design System Compliance — Final State

| Check | Before | After |
|-------|--------|-------|
| Page headers use `ErpPageHeader` or `ERPToolbar` | ❌ GRN, PO used raw divs | ✅ All pages use ERP header |
| Tables have `class="erp-table"` | ❌ 5 tables missing | ✅ All inventory tables fixed |
| No hardcoded `bg-dark`/`text-white` | ❌ 3 pages violated | ✅ All use design vars |
| Loading states shown | ✅ All pages had loading | ✅ |
| Error notifications via `$q.notify` | ❌ Dashboard used console.error only | ✅ |
| Confirm on delete | ✅ ItemsPage, GRNPage confirmed | ✅ |
| Empty states handled | ✅ All pages had empty states | ✅ |
| Dark mode chart reactive | ❌ Hardcoded `'dark'` | ✅ Reactive to `$q.dark.isActive` |

---

## Lint

```
0 errors, 0 warnings
```
