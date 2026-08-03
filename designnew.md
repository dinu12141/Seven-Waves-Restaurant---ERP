# Design Document — New Feature Set (2026-08-02)

Status: CONFIRMED — all open questions answered by user on 2026-08-02. Ready for implementation.
Scope: 6 features across Procurement, HR, and System Admin.
Each section states: current state (ground truth), gap, proposed design, DB changes, UI changes, and build order.

## Confirmed decisions (supersede any "open question" wording left below in individual sections)

| # | Feature | Decision |
|---|---------|----------|
| 1 | Supplier Tax No. | `tax_id` field is broken/not saving or not visible — treat as a **bug fix**, not a new field. Investigate `SuppliersPage.vue` form binding + RLS before assuming code is correct. |
| 1 | Supplier Items | Build the "Items Supplied" tab as designed, wired to existing `supplier_item_prices` table, with inline "+ New Item" creation into `items`. |
| 2 | HR No-Pay Cap | **4 days per calendar month, combined across ALL leave types** (not per-leave-type). Manual override must remain available. |
| 2 | Payroll engine | Live engine is `process_monthly_payroll` (frontend calls confirmed in `PayrollPage.vue:2443`). Latest applied version is `supabase/fix_payroll_employee_advance_deduction_118.sql` (supersedes `20260325_payroll_complete_engine.sql`, which is now legacy history, not to be edited directly — old `payroll_engine.sql` is dead). Fix the no-pay day count in a **new migration layered on top** of `fix_payroll_employee_advance_deduction_118.sql`, not by editing history files. |
| 3 | PO Filters | Just add the missing supplier filter — date filter already works, confirmed no further discussion needed. |
| 4 | Report PDF format | Use the existing plain-table PDF/Excel style from `SupplierPaymentReport.vue` / `exportService.ts` — no new branding work. |
| 5 | GRN mode | **Remove PO-linked GRN entirely.** GRN becomes supplier-direct only. Must handle fallout: PO auto-close-on-full-receipt logic and PO status tracking in `post_goods_receipt()` need rework since GRNs will no longer reference a PO line. (PO documents themselves still exist for ordering/tracking — only the "receive against this PO" linkage is removed from GRN.) |
| 5 | Cost scope | `items.avg_cost` stays **company-wide** (not per-branch), matching current behavior — only the calculation method changes. |
| 5 | Monthly average cost | `items.avg_cost` must be **recalculated from scratch once a month** (not a continuously-updated running average) — each GRN still stores its own actual invoice price unchanged (150 today, 250 tomorrow, no interference), and a **monthly job** computes that item's weighted average across the month's actual GRN prices/quantities and overwrites `avg_cost` with that figure. This is the system's "current cost" reference until the next month's recompute. |
| 6 | Backup scope | Pro-tier or higher confirmed. Build **download + manual "backup now" trigger only**. **No restore button in the app** — if restore is ever needed, it's done via Supabase dashboard/support, not from the ERP UI. This removes essentially all of the destructive-risk surface from this feature. |

---

## 0. Global build order

Features are independent of each other except where noted. Recommended sequence (smallest blast-radius / highest-value first):

1. **#3 PO invoice filters** (small, isolated, no schema change)
2. **#1 Supplier tax no. + item catalogue** (tax_id already exists — mostly new UI + wiring an existing unused table)
3. **#5 GRN-driven costing** (schema-sensitive, touches `post_goods_receipt()` — do after #1 since it reuses the supplier-item catalogue for price sanity checks)
4. **#4 Procurement reports (Excel/PDF export + Supplier Summary)** (depends on #5's costing data being correct for "monthly average cost" to mean anything)
5. **#2 HR shift-based no-pay automation** (independent subsystem, but highest risk — touches payroll math, needs careful review)
6. **#6 System backup** (fully greenfield, no dependency on anything else — can be done any time, in parallel)

Each feature ships as its own SQL migration file + its own commit(s), so any one can be reviewed/rolled back independently.

---

## 1. Supplier Registration: Tax No. + Purchasable Items Catalogue

### Current state
- `suppliers.tax_id` **already exists** in the schema (`inventory_module.sql:72`) and is **already** exposed in `SuppliersPage.vue` as "Tax ID / VAT No" (line 184). **No work needed here** — confirm with user this is the field they mean, since they described it as missing.
- `supplier_item_prices` table **already exists** (`procurement.sql:84-99`): `supplier_id, item_id, uom_id, last_price, min_order_qty, lead_time_days, effective_from, effective_to, is_active`. **Zero frontend consumers today.**
- `items` master table is rich (`avg_cost`, `last_purchase_price`, UOM factors) — good join target.
- Established item-search UX convention: `q-select` with `use-input` + `@filter` doing client-side filter over a pre-fetched list (seen in `ProcurementReportsPage.vue`, `EmployeesPage.vue`, etc.) — **use this pattern**, not the plain full-list `q-select` in `DocLinesEditor.vue`.

### Gap
1. Verify with user whether "tax no" really is missing on their screen (maybe a caching/permission issue) or whether they want a *second*, different tax field (e.g. VAT registration vs TIN). → **Open question, ask before building.**
2. No UI exists to manage "items this supplier sells" at all.
3. No "+ create new item inline" flow exists anywhere in the app (confirmed absent in `DocLinesEditor.vue` too) — this is a genuinely new UX pattern for the whole ERP, not just procurement.

### Proposed design

**A. Supplier form — Tax No.**
- Re-verify `tax_id` renders and saves correctly in `SuppliersPage.vue`. If confirmed working, tell user it already exists (maybe rename the label to "Tax No." if that's clearer than "Tax ID / VAT No").
- If a genuinely separate business registration/tax field is wanted, add `suppliers.business_reg_no TEXT` via migration.

**B. Supplier form — "Items Supplied" tab/section**
- Add a new section inside the Supplier edit dialog (or a tab, matching the multi-tab pattern already used elsewhere e.g. `LeaveTab.vue`/employee dialogs): **"Items Supplied"**.
- Table showing existing `supplier_item_prices` rows for this supplier: Item name, UOM, Last Price, Min Order Qty, Lead Time (days), Active toggle, Delete.
- "+ Add Item" row:
  - `q-select` (searchable, `use-input`+`@filter`, matching established convention) bound to all active `items`, showing name + code.
  - Fields: UOM (defaults to item's `inventory_uom_id`), Price, Min Order Qty, Lead Time.
  - A **"+ New Item"** button next to the search box (per user's explicit ask): opens a small inline dialog to create a new `items` row (name, category, UOM, reorder level) without leaving the supplier screen. On save, the new item is immediately selected into the picker and also becomes available system-wide in Inventory (since it's the same `items` table — no separate sync needed, "auto add to inventory" is automatically satisfied by writing directly to `items`).
  - Save inserts/upserts into `supplier_item_prices`.

### DB changes
```sql
-- Only if user confirms a second tax field is wanted:
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_reg_no TEXT;

-- supplier_item_prices already exists — no schema change needed, just RLS check:
-- confirm INSERT/UPDATE policy exists for procurement/admin roles (verify during build).
```

### UI changes
- `src/pages/procurement/SuppliersPage.vue` — add "Items Supplied" tab to the edit dialog.
- New composable/service functions in `src/services/procurementService.ts`: `listSupplierItems(supplierId)`, `upsertSupplierItem(row)`, `deleteSupplierItem(id)`.
- Reuse existing `items` create logic (check if `src/pages/inventory/ItemsPage.vue` or equivalent has a create function to call/import rather than duplicating item-creation logic).

### Confirmed
- `tax_id` is broken/not saving or not visible for the user — **treat as a bug fix**. During build: check `SuppliersPage.vue`'s form binding (line ~269) for a field-name mismatch, check RLS on `suppliers` UPDATE/INSERT for the procurement/admin role, and check whether the column is actually being included in the upsert payload in `procurementService.ts`.
- "Items Supplied" pricing (`last_price`) auto-suggesting into GRN lines is a nice-to-have tie-in with feature #5 — included in #5's design (Section 5B) as a pre-fill suggestion, not a hard requirement.

---

## 2. HR: Shift-Based Auto No-Pay on Excessive Leave

### Current state (this is the most structurally complex item — read carefully)
- `fn_calc_attendance_metrics` (late/OT/hours calc) works fine, unrelated to this ask.
- `shifts` = branch-level shift *definitions* (start/end time). `shift_assignments` = **per-date** rows (one row per employee per calendar day) — there is **no "days per week" field** anywhere; a weekly pattern must be *derived* by counting assignment rows, not read from a static column.
- `leave_requests` → `att_leave_attendance_116.sql` trigger (`_apply_leave_attendance_rows`) converts approved leave into `attendance_records` rows with status `on_leave` (if `leave_types.is_paid`) or `no_pay` (if not) — **this decision is a static per-leave-type flag, with zero awareness of how many days the employee has already taken.**
- A **separate, disconnected** entitlement system exists: `leave_balances` (`total_entitlement`, `used_days`, generated `remaining_days`). Two different approval code paths exist:
  - `approve_leave_request()` RPC — hard-blocks (raises exception) if `remaining_days < requested_days`. Not used by the main UI.
  - `LeaveManagementPage.vue::approveRequest()` — the **actual production path** — does a plain status update (no balance check at all), then naively increments `used_days` with no ceiling check.
- **Payroll engines do not deduct for `no_pay` days at all** (`payroll_engine.sql` and `20260325_payroll_complete_engine.sql` only count `status='absent'`, one variant also counts `'unpaid_leave'` but neither counts `'no_pay'`). This is a **pre-existing bug independent of this feature** — the no_pay status introduced in a prior session currently has no payroll effect. Must be fixed regardless, or the whole feature is silently inert.

### Gap
Nothing computes "employee has taken N leave days in period X" and compares against a threshold to auto-split a leave request into paid + no-pay portions.

### Confirmed requirement
**4 days of paid leave per calendar month, combined across ALL leave types** (not per-leave-type — a Casual + Medical + Annual day all count toward the same monthly bucket). Beyond 4 days in a given calendar month, additional leave days auto-convert to `no_pay` status. Manual override must remain available for HR to force a specific day back to paid if warranted.

### Proposed design

**A. New table: `leave_entitlement_policies`** (per company/branch — simpler now that it's not per-leave-type)
```sql
CREATE TABLE leave_entitlement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  branch_id UUID REFERENCES branches(id),
  max_paid_days_per_month INT NOT NULL DEFAULT 4,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Default: 4 paid days per calendar month per employee, combined across leave types, configurable per branch (not hardcoded, in case different branches need different policies later).

**B. New function: `fn_calc_leave_no_pay_split(employee_id, start_date, end_date)`**
- Counts **all** `on_leave`-status attendance days already recorded for this employee (any leave type) within the calendar month(s) spanned by `[start_date, end_date]` — before this request.
- Walks day-by-day across the requested range: while `days_used_this_month < max_paid_days_per_month`, mark `on_leave` (paid); once the cap is crossed, mark `no_pay` for the remainder. If the range spans a month boundary, the counter resets at the 1st of the new month.
- Returns a per-date status array, so a single multi-day request can legitimately produce a mix of `on_leave` and `no_pay` rows.

**C. Rewire `_apply_leave_attendance_rows`** (in `att_leave_attendance_116.sql`'s trigger logic) to call this function instead of the current single static `leave_types.is_paid` check, so the trigger writes a per-date status honoring the monthly cap regardless of which leave type was used.

**D. Manual override**
- Add `attendance_records.is_manual_override BOOLEAN DEFAULT FALSE` — when HR/manager manually edits a day's status in the Attendance page, set this flag; the auto-calc must skip/never overwrite rows where `is_manual_override = TRUE` on any subsequent trigger re-run.
- Add an explicit "Override to Paid / Override to No-Pay" action in the existing Attendance edit UI (reuse whatever inline edit already exists there per `att_manager_rls_115` memory).

**E. Fix the live payroll engine to actually deduct for `no_pay`** (prerequisite bug fix, not optional — confirmed the `no_pay` status currently has zero payroll effect). Live engine is `process_monthly_payroll`, latest applied in `supabase/fix_payroll_employee_advance_deduction_118.sql` (supersedes `20260325_payroll_complete_engine.sql`). Add a **new migration** that patches this function's day-counting logic to include `status = 'no_pay'` alongside `'absent'` for deduction purposes — do not edit the old migration files directly (they're applied history); layer a `CREATE OR REPLACE FUNCTION process_monthly_payroll(...)` with the fix on top, in a new dated migration file.

**F. Unify the two competing approval code paths** — `approve_leave_request()` RPC (hard-block on insufficient balance, currently unused by the main UI) vs `LeaveManagementPage.vue::approveRequest()` (the actual production path, no balance check today). Since the new no-pay-split design makes "insufficient balance" a soft/automatic paid-vs-unpaid split rather than an outright rejection, retire the hard-block RPC's exception behavior and make `LeaveManagementPage.vue::approveRequest()` the single source of truth, updating `leave_balances.used_days` correctly and consistently alongside the new split logic.

### DB changes
- New table `leave_entitlement_policies`.
- New function `fn_calc_leave_no_pay_split(employee_id, start_date, end_date)`.
- Rewrite `_apply_leave_attendance_rows` (att_leave_attendance_116.sql logic).
- `ALTER TABLE attendance_records ADD COLUMN is_manual_override BOOLEAN DEFAULT FALSE;`
- New migration layering a fixed `process_monthly_payroll` on top of `fix_payroll_employee_advance_deduction_118.sql` to count `no_pay` days in deductions.

### UI changes
- New small admin settings panel: "Leave Policy" (under HR settings) to edit `max_paid_days_per_period` per branch/leave type.
- Attendance edit dialog: add override affordance + visual indicator (badge) for auto-vs-manual-set no_pay days.
- Leave Management page: when approving a request that will trigger a no-pay split, show a confirmation summary ("3 days paid, 2 days no-pay based on monthly policy") before confirming.

### Open questions (must ask before building — this is the highest-risk feature)
1. Is the "4 days" threshold **per calendar month**, or tied to something else (e.g., per shift roster cycle)? Confirm exact period.
2. Does the cap apply per leave type (e.g., only casual leave) or across all leave types combined?
3. Which payroll engine file is actually the live one in production — `payroll_engine.sql` or `20260325_payroll_complete_engine.sql`? (Determines which one to patch, or both.)
4. Should the cap reset per employee based on join date, or a fixed calendar month for everyone?

---

## 3. PO Invoice List: Date + Supplier Filters

### Current state
- `PurchaseOrdersPage.vue` already has a `BaseDataGrid` filter drawer with `doc_date` (date-range) and `status` (select) — **date filter already exists.**
- **No supplier filter exists** — only a free-text search box.
- Data is merged from two sources (`listPO()` + `listInventoryPOs()`), deduplicated by `doc_number` — any new filter must apply after the merge, or be pushed into both source queries.

### Gap
Just the supplier filter is missing; date filter is already there (confirm with user — they may not have noticed it, or it may not be working as expected).

### Proposed design
- Add a `supplier_id` entry to `gridFilters` config in `PurchaseOrdersPage.vue`, type `select`, options = active suppliers (reuse whatever supplier-list fetch already backs the supplier dropdown elsewhere in procurement, e.g. `ProcurementReportsPage.vue`'s pattern).
- Since PO data comes from two merged sources, apply the supplier filter as a client-side `.filter()` after `fetchPOs()` merges both lists (simplest, safest — avoids touching two separate service query functions), OR push `supplier_id` as a query param into both `listPO()` and `listInventoryPOs()` if either already accepts filter params (check before deciding — prefer pushing into the query if trivial, to avoid fetching unnecessary rows).

### DB changes
None — filtering existing columns.

### UI changes
- `src/pages/procurement/PurchaseOrdersPage.vue`: add supplier filter to `gridFilters` array + wire into whichever fetch layer makes sense per the investigation above.

### Open questions
- Confirm the existing date filter is visible/working for the user — if it's already there, this is a 30-minute task (just add supplier).

---

## 4. Procurement Reports: Excel/PDF Export + Supplier Summary

### Current state
- Shared export stack already exists and is used in 19+ files: `src/services/exportService.ts` (`exportTableToExcel`, `exportTableToPDF`, etc., built on `xlsx` + `jspdf`/`jspdf-autotable`).
- `ProcurementReportsPage.vue` (Supplier Statement / AP Aging / PO vs GRN tabs) currently only has a **hand-rolled CSV export** — does not use the shared utility.
- `SupplierPaymentReport.vue` already has full Print/PDF/Excel using the shared service — **use this file as the reference implementation.**
- **No cross-supplier "Supplier Summary" report exists** (paid vs unpaid totals per supplier, across all suppliers). Raw data is available in `ap_invoices` (`total_amount`, `paid_amount`, generated `balance_due`) and `suppliers.balance`.

### Proposed design

**A. Wire Excel/PDF export into `ProcurementReportsPage.vue`**
- Replace the hand-rolled `exportCSV()` with calls to `exportTableToExcel(columns, rows, filename)` and `exportTableToPDF(columns, rows, title, subtitle)` from `exportService.ts`, matching the button layout already used in `SupplierPaymentReport.vue` (Print / Export PDF / Export Excel).
- Apply to all three existing tabs (Supplier Statement, AP Aging, PO vs GRN).
- **Every report must show a totals row/footer** with the final paid amount aggregated according to the active filter — per the user's explicit ask ("me hema report ekakama awasane pay karapu full amounts tika ekathu wela penwanna ona").

**B. New "Supplier Summary" tab**
- New 4th tab in `ProcurementReportsPage.vue`: aggregates across **all** suppliers (filterable by date range):
  - Columns: Supplier, Total Invoiced, Total Paid, Total Due (Balance), # Invoices, # Overdue.
  - Query: `GROUP BY supplier_id` over `ap_invoices` within the date filter, joined to `suppliers.name`.
  - Footer row: grand totals for Total Invoiced / Total Paid / Total Due across all filtered suppliers — directly satisfies "due payments wala total ekath awasane balanna puluwan wenna oona."
  - Row-click drill-down (optional, nice-to-have) into that supplier's individual invoices (reuse existing Supplier Statement tab's query, pre-filtered to that supplier).
  - Exportable via the same Excel/PDF buttons as (A).

### DB changes
None — pure aggregation query over existing `ap_invoices`/`suppliers` tables. If performance becomes an issue with large invoice volumes, consider a materialized view later — not needed for initial build.

### UI changes
- `src/pages/procurement/ProcurementReportsPage.vue`: replace CSV export, add totals footer to existing 3 tabs, add new Supplier Summary tab.

### Confirmed
PDF format uses the existing plain-table style already in `SupplierPaymentReport.vue`/`exportService.ts` — no new branding/logo work needed.

---

## 5. GRN Rework: Supplier-Direct GRN + Accurate Invoice-Based Costing

### Current state
- GRN already supports a standalone "Direct Receipt" mode (`createMode: 'direct'`) alongside the PO-linked mode. **Confirmed decision: remove the PO-linked mode entirely** — GRN becomes supplier-direct only.
- When GRN is direct-mode, price defaults to `0` and must be manually entered — but the `DocLinesEditor`'s price column visibility (`showPrice` prop) is **not confirmed to even be enabled** in the GRN dialog's current usage. Must verify/fix regardless.
- Costing: `post_goods_receipt()` sets `items.avg_cost` via a **naive 2-point average** — `(old_avg_cost + new_unit_cost) / 2` — completely ignoring quantity. **Confirmed decision: this is being replaced entirely** — each GRN keeps its own actual invoice price untouched (no smoothing at receipt time), and a separate **monthly batch job** recomputes `items.avg_cost` from scratch once a month using that month's actual GRN prices/quantities.

### Gap
1. Possible existing bug: direct-mode GRN price column may not render at all — must verify and fix.
2. `post_goods_receipt()`'s live-update-on-every-GRN averaging logic must be removed (no averaging should happen at receipt time at all — GRN just records the real price paid).
3. No monthly recompute job exists anywhere.
4. Removing PO-linked GRN affects `post_goods_receipt()`'s PO auto-close-on-full-receipt and `purchase_order_lines.received_qty` tracking — these need to be decoupled from GRN or reworked, since GRNs will no longer carry a `po_line_id`.

### Proposed design

**A. Remove PO-linked GRN mode**
- `src/pages/procurement/GRNPage.vue`: remove the `createMode` radio / `'po'` branch entirely. GRN always starts with supplier selection (`'direct'` flow becomes the only flow). Remove `loadFromPO()` and the PO-lookup UI.
- `goods_receipt_lines.po_line_id` column can remain nullable in schema for historical GRNs already linked to a PO (do not retroactively break old records) — simply stop writing to it going forward.
- **PO documents themselves are untouched** — Purchase Orders still exist for planning/ordering purposes (feature #3's filters still apply to them). Only the "receive against this PO" linkage from GRN is removed. If the business still wants to track "was this PO ever received," that now has to be manual/informational rather than system-enforced — flag this tradeoff to the user during build if it looks like a regression in practice (PO status like `'closed'` may need to become manually settable instead of auto-triggered by GRN receipt).
- Remove/disable the auto-close-PO-on-full-receipt block in `post_goods_receipt()` (since there's no `po_line_id` to reconcile against anymore for new GRNs).

**B. Fix direct-mode price entry**
- Verify/ensure the price column renders and is editable for every GRN line (this is now the *only* mode, so this is not optional).
- Pre-fill from `supplier_item_prices.last_price` (feature #1) when a matching supplier+item row exists, as a starting suggestion the user can override with the actual invoice price — ties #1 and #5 together.

**C. Remove the naive running-average update from `post_goods_receipt()`**
- Each GRN posts its line's actual `unit_cost` to `inventory_ledger` as-is (already happens) and updates `last_purchase_price` (fine to keep — it's just "most recent price," not an average).
- **Stop** updating `items.avg_cost` at GRN-post time entirely — remove the `(avg_cost + unit_cost)/2` block. `avg_cost` becomes exclusively owned by the new monthly job (part D), not touched by individual GRN posts.

**D. New monthly recompute job for `items.avg_cost`**
- New function `fn_recompute_monthly_avg_cost(p_month DATE)`:
  ```sql
  -- For each item, weighted average over the GIVEN month's actual GRN receipts:
  UPDATE items i SET avg_cost = sub.weighted_avg, updated_at = now()
  FROM (
    SELECT gl.item_id,
           SUM(gl.quantity * gl.unit_cost) / NULLIF(SUM(gl.quantity), 0) AS weighted_avg
    FROM goods_receipt_lines gl
    JOIN goods_receipts gr ON gr.id = gl.grn_id
    WHERE gr.status = 'posted'
      AND date_trunc('month', gr.doc_date) = date_trunc('month', p_month)
    GROUP BY gl.item_id
  ) sub
  WHERE i.id = sub.item_id;
  ```
  - If an item had **zero GRNs in a given month** (no purchases that month), `avg_cost` is left unchanged (carries forward last month's figure) rather than nulled out — since it's still needed as the "current cost" reference for stock valuation/POS costing until new data arrives.
  - Scheduled via `pg_cron` (matching the existing pattern, e.g. `process_attendance_logs`) to run automatically on the 1st of each month for the prior month, **plus** a manual "Recalculate Now" trigger exposed somewhere in Procurement/Inventory settings for ad-hoc runs.

### DB changes
```sql
-- Remove avg_cost update block from post_goods_receipt() (keep last_purchase_price update).
-- New function: fn_recompute_monthly_avg_cost(p_month DATE).
-- New pg_cron schedule: monthly, 1st of month.
-- No new tables needed.
```

### UI changes
- `src/pages/procurement/GRNPage.vue`: remove PO-linked mode entirely, ensure price column always renders/is editable, pre-fill from `supplier_item_prices` when available.
- Small addition to Procurement/Inventory settings: "Recalculate Average Cost Now" manual trigger button (calls `fn_recompute_monthly_avg_cost` for the current month).

---

## 6. System Backup

### Current state
Confirmed 100% greenfield — no backup page, service, edge function, or SQL function of any kind exists anywhere in the codebase today. Project confirmed to be on Pro tier or higher, so Supabase's native daily backup infrastructure and Management API access are available.

### Confirmed scope
**Download + manual "backup now" trigger only. No restore button in the app.** If a restore is ever needed, it is performed via the Supabase dashboard/support directly — this removes essentially all destructive-risk surface from this feature, since the ERP itself can never be used to overwrite production data.

### Proposed design

**A. New Edge Function: `system-backup`**
- Calls the **Supabase Management API** to (a) list existing native backups for the project, and (b) trigger an on-demand backup, matching the pattern already used elsewhere in this project for Management API access (per CLAUDE.md's documented SQL-apply workflow — same PAT-based auth approach, scoped read/trigger-only here).
- Since native daily backups already run automatically server-side on Pro+ (no need to reinvent dump logic), this function is a thin wrapper: list available backups with their date/size, and expose a "Backup Now" action that calls the Management API's on-demand-backup trigger endpoint (if the plan/API exposes one) or simply confirms the next scheduled daily backup time if on-demand triggering isn't available at this tier — verify exact Management API capabilities during build and adjust the "Backup Now" button's behavior accordingly (may become "view backup schedule" if true on-demand triggering isn't exposed).
- Download: proxy the Management API's backup download/signed-URL response back to the browser (Edge Function should not expose the Management API PAT to the client directly).

**B. UI**
- New page `src/pages/admin/SystemBackupPage.vue`, new card on `AdminPage.vue`'s module grid (matching existing convention exactly), new route `/admin/backup` gated by `admin.backup.manage` permission (admin-only, following the same RBAC pattern as everything else).
- Sections: **"Available Backups"** (list from Management API: date, size, download button) and **"Backup Now"** (manual trigger, disabled/relabeled if the plan only supports scheduled daily backups rather than true on-demand). No restore UI of any kind.
- Small note in the UI: "To restore from a backup, contact Supabase support or use the Supabase dashboard directly" — sets correct expectations without building the risky path.

### DB changes
- New permission string `admin.backup.manage` (added to `NAV_ITEMS`/`ROLE_DEFAULT_PERMISSIONS` per existing per-page permission system).
- No new tables needed — backup listing comes live from the Management API, not a local log (a local `backup_jobs` audit table logging who clicked "Backup Now" and when is a nice-to-have, not required for this scope).

### Remaining open item
- Confirm the exact Management API endpoints available for backup listing/triggering/downloading on this project's specific plan during implementation (Supabase's public Management API surface for backups has evolved and should be checked against the current API docs/project capabilities directly, rather than assumed) — if on-demand triggering isn't exposed at all, the feature reduces to "view schedule + download most recent," which still fully satisfies the confirmed scope.

---

## All Decisions Confirmed (2026-08-02)

See the decision table in Section 0 (top of document) for the full list — all 6 features are now fully specified with no remaining ambiguity. See each section's "Confirmed" / "Confirmed decision" / "Confirmed requirement" notes for feature-specific detail.

---

## Next Step

Implementation proceeds in the build order listed in Section 0, one feature at a time, each as its own reviewable commit/migration:
1. PO invoice filters (#3)
2. Supplier tax-no bug fix + items catalogue (#1)
3. GRN rework — remove PO-linked mode, fix pricing, monthly avg_cost recompute (#5)
4. Procurement reports — Excel/PDF export + Supplier Summary (#4)
5. HR shift-based no-pay automation (#2) — highest risk, touches payroll math, test thoroughly against a real payroll run before considering done
6. System backup — download + manual trigger only (#6) — can be built in parallel with any of the above, no dependencies
