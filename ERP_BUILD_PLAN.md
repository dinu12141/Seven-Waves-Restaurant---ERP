# Seven Waves ERP — Module-by-Module Build Plan
**Date:** 2026-06-23 | **Audited by:** 4-agent team

---

## Execution Order (Priority → Impact)

| # | Module | Status | Key Gap | Sprint |
|---|---|---|---|---|
| 1 | Admin / Settings | Stub | Fake saves, KitchensPage no DB, no company info | NOW |
| 2 | POS | Partial | No split payment, no hold order, no refund flow | NOW |
| 3 | Finance | Partial | No period lock, bank recon shell, voucher # missing | 2 |
| 4 | Inventory | Shell | Zero operational pages (no item master, adjust, transfer) | 2 |
| 5 | HR | Partial | Dashboard mock data, no leave calendar, no emergency contact | 2 |
| 6 | Procurement | Partial | Dashboard mock data, reports placeholder, PO edit stub | 3 |
| 7 | Waiter App | Partial | No table transfer, no add-to-existing-order | 3 |
| 8 | CRM / Loyalty | Partial | No campaign mgmt, earning rules not configurable | 3 |
| 9 | Delivery | Partial | No dispatcher view, no zone config, no COD reconciliation | 4 |
| 10 | AI Analytics | Working | No actual-vs-predicted, no chat persistence | 4 |
| 11 | UI Design System | Mixed | 3 header styles, 3 modal patterns, 3 color systems | Ongoing |
| 12 | Media / Images | Missing | No ImageUploader, no WebP pipeline, no lazy skeleton | Ongoing |

---

## Module 1 — Admin / Settings

### What to build
- [ ] `SettingsPage` — wire `saveGeneralSettings()` to Supabase `company_settings` table; add company name, address, TRN, VAT rate, currency, date format, receipt footer, logo upload
- [ ] `KitchensPage` — full Supabase CRUD (replace in-memory array with real DB); add printer assignment, category routing rules, branch filter from DB
- [ ] `BranchesPage` — add branch-specific settings (tax rate, operating hours, currency)
- [ ] `RolesPage` — add "Create Role" button
- [ ] `UsersPage` — add branch assignment in user dialog

### UI standards to apply
- Standardize all admin pages on `PageHeader` (deprecate `ERPToolbar` in admin)
- Introduce `ErpDialog.vue` base component for all modals

---

## Module 2 — POS

### What to build
- [ ] **Hold/Park Order** — "Park" button saves cart to `parked_orders` table; "Recall" loads it back; multiple parks per terminal
- [ ] **Split Payment dialog** — let cashier add multiple payment lines (Cash LKR X + Card LKR Y), validates total = order total
- [ ] **Refund / Return flow** — select paid order → pick items to return → creates negative transaction + loyalty coin reversal
- [ ] **Delivery charge input** — replace hardcoded `0.00` with editable field in order summary
- [ ] **Loyalty coin rate config** — pull `COIN_REDEMPTION_VALUE` from `loyalty_rules` table (already exists in DB)
- [ ] **Product images in main grid** — show thumbnail in item button, lazy-loaded WebP

---

## Module 3 — Finance

### What to build
- [ ] **Period Lock page** — fiscal periods table; lock/unlock with admin approval; block posting to locked periods in all voucher forms
- [ ] **Bank Reconciliation matching** — line-by-line UI: import bank statement CSV → match against system entries → mark cleared/outstanding
- [ ] **VoucherForm** — show auto-generated voucher number (read-only); add debit=credit running total bar; add Journal Entry voucher type
- [ ] **Finance Dashboard** — replace hardcoded chart with real journal aggregation query
- [ ] **LedgerRegistrationPage** — fix type filter bug (filtered computed ignores `ledger_type`)
- [ ] **Petty Cash** — add "New Petty Cash Entry" button that creates a pay voucher with `petty_cash` payment method
- [ ] **Cashbook** — add PDF/Excel export (same pattern as other finance pages)
- [ ] **Tax** — add VAT return period report (sum tax collected vs paid by period)

---

## Module 4 — Inventory

### What to build (from scratch)
- [ ] **Item Master page** (`/inventory/items`) — CRUD for ingredients/items: code, name, UOM, category, reorder level, valuation method, storage location
- [ ] **Stock Adjustment page** (`/inventory/adjustments`) — create adjustment/wastage document: select items, enter qty, select reason (damage/wastage/theft/stocktake), post → updates `stock_levels`
- [ ] **Stock Take page** (`/inventory/stocktake`) — create physical count sheet: system qty (read-only) vs physical qty (input), calculate variance, post adjustment
- [ ] **Stock Transfer page** (`/inventory/transfer`) — move items between warehouses/branches: from location, to location, items + qty, post → creates GIN + GRN pair
- [ ] **Warehouse Management page** (`/inventory/warehouses`) — CRUD for warehouses/locations with branch assignment
- [ ] **Item Ledger / Movement History** — per-item movement log with running balance
- [ ] **Fix InventoryDashboard** — replace hardcoded "Total Warehouses: 4" with real query

---

## Module 5 — HR

### What to build
- [ ] **HR Dashboard** — replace all `setTimeout` mocks with real Supabase queries for KPIs (headcount, on leave today, pending leaves, today's attendance rate)
- [ ] **Employee Master** — add emergency contact fields (name, relationship, phone); fix "Deductions" tab Add button; fix "Officer Areas" Save button; add service/promotion history tab
- [ ] **Leave Management** — add calendar view (monthly grid showing who is on leave); add half-day option; add two-level approval (manager → HR)
- [ ] **Attendance** — add monthly summary view; link to shift schedule for expected hours; add clock-in/clock-out time recording
- [ ] **Payroll** — add bank payment file export (SLIPS/CEFTS format); add payroll lock after posting
- [ ] **Salary Structure** — move from `src/pages/finance/` to `src/pages/hr/` (module boundary fix)

---

## Module 6 — Procurement

### What to build
- [ ] **ProcurementDashboard** — replace all `setTimeout` hardcoded values with real Supabase queries
- [ ] **PO Edit** — implement edit flow (replace "save a new PO" stub)
- [ ] **ProcurementReportsPage** — replace placeholder dialog with real data tables + export (Supplier Statement, AP Aging, PO vs GRN vs Invoice Variance)
- [ ] **Supplier bank details** — add bank name, account number, branch to `SuppliersPage`
- [ ] **Print functions** — implement `printPO()`, `printGRN()`, `printInvoice()` using ESC/POS or PDF
- [ ] **3-way match warning** — show alert when AP invoice amount differs from GRN by >5%

---

## Module 7 — Waiter App

### What to build
- [ ] **Table Transfer** — "Move to Table" action on active order: select target table → transfer order + occupancy
- [ ] **Add to Existing Order** — from MyOrdersPage → "Add Items" → opens item picker → creates additional KOT on same order
- [ ] **Bill Request flag** — "Request Bill" button sets order status flag; cashier sees pulsing indicator in billing queue
- [ ] **Section filter** on WaiterTablesPage

---

## Module 8 — CRM / Loyalty

### What to build
- [ ] **Earning Rules page** — configure coins earned per LKR spent (currently hardcoded in DB default); add multipliers for categories/items
- [ ] **Redemption Rules page** — configure coin value in LKR; set min coins to redeem; expiry rules
- [ ] **Campaign Management** — create promotions (date range, bonus coins multiplier, eligible tiers)
- [ ] **Fix stats bug** — LoyaltyMembersPage stats should query aggregate from DB, not compute from current page data
- [ ] **Coins expiry dashboard** — show coins expiring in next 30/60/90 days by customer

---

## Module 9 — Delivery

### What to build
- [ ] **Dispatcher view** — admin page showing all active riders on a map with their current delivery status
- [ ] **Delivery zone config** — polygon-based zones with per-zone delivery fee
- [ ] **COD reconciliation** — daily cash collected report per rider with expected vs actual
- [ ] **SLA breach notification** — notify manager when delivery is >N minutes late

---

## Module 10 — AI

### What to build
- [ ] **Actual vs Predicted chart** — overlay historical actuals on forecast chart
- [ ] **Chat persistence** — save conversation to `ai_prompt_logs` table; load on page mount
- [ ] **Anomaly SLA** — show hours open; escalation to manager after N hours
- [ ] **Currency from settings** — replace hardcoded `'LKR'` in chart with company settings currency

---

## UI Design System (Applied to Every Module)

### Components to build
- [ ] `ErpDialog.vue` — standard modal shell: q-toolbar header (icon + title + close), scrollable body, fixed footer with action buttons
- [ ] `ErpPageHeader.vue` — merge PageHeader + ERPToolbar: breadcrumb links (real router-link), title, subtitle, action slot
- [ ] `ImageUploader.vue` — Supabase Storage upload with: WebP conversion (canvas API), max size compression (target < 100KB), preview, progress bar
- [ ] Standardize CSS variables — remove all hardcoded `#1e1e2e`, `rgba(255,255,255,0.03)` → use `var(--erp-bg-card)` etc.
- [ ] Collapsible sidebar (icon-only mode at 64px width)
- [ ] Real navigable breadcrumbs using `q-breadcrumbs`

### Image/Video Standards
- All uploads → WebP via canvas `toBlob('image/webp', 0.82)` before sending to Supabase Storage
- Target: product images < 80KB, logos < 30KB, thumbnails < 15KB
- Lazy loading: `q-img` with `loading="lazy"` and skeleton placeholder
- Videos: embed only (YouTube/Vimeo iframe), no direct video file hosting
- CDN: Supabase Storage already provides CDN URLs — use the public URL directly
