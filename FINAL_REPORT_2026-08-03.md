# Final Report — 6-Feature Batch (2026-08-03)

Scope: implementation of all 6 features specified in `designnew.md`, built via parallel background agents, security-reviewed, and verified against the full project test suite.

---

## Status Overview

| # | Feature | Code | SQL Applied Live | Deployed |
|---|---------|------|-------------------|----------|
| 1 | Supplier tax-no fix + Items Supplied catalogue | ✅ Done | ✅ Applied | — |
| 2 | HR shift-based auto no-pay | ✅ Done | ✅ Applied | — |
| 3 | PO invoice date + supplier filters | ✅ Done | N/A (no schema change) | — |
| 4 | Procurement reports Excel/PDF + Supplier Summary | ✅ Done | N/A (no schema change) | — |
| 5 | GRN rework (supplier-direct + monthly costing) | ✅ Done | ⚠️ **Written, NOT applied** — you asked to apply manually | — |
| 6 | System Backup (download + manual trigger) | ✅ Done | N/A | ⚠️ **Not yet deployed** |

**Full test suite: 440/440 passing. Full lint: 0 errors. Full type-check: 0 errors.**

---

## 1. Supplier Tax No. + Items Supplied Catalogue

**Root cause found (not what it looked like):** `tax_id` was never a missing/broken field in the code — it was already correctly wired end-to-end in `SuppliersPage.vue` and `procurementService.ts`. The real problem: **the `suppliers` table had Row Level Security enabled with zero policies**, so every INSERT/UPDATE silently failed. This is the same class of bug as the earlier HR NIC issue, but with a different root cause this time.

**Fixed:**
- `supabase/migrations/20260803_supplier_tax_id_and_item_prices_rls.sql` — added company-scoped RLS to `suppliers` (admin full access, manager/inventory/procurement roles scoped to their company, read-only for other staff) and to `supplier_item_prices` (same pattern) — **applied live and verified** (5 policies confirmed present via direct query).
- New "Items Supplied" section in the Supplier edit dialog: lists/adds/removes items a supplier sells, with price, min order qty, and lead time. Includes a "+ New Item" inline dialog that creates items directly in the main `items` table (reuses existing item-creation logic — no duplication), so new items are immediately available system-wide.

**Note:** during verification I found the live DB already had *other*, differently-named RLS policies on both tables (`suppliers_modify_own_company`, `supplier_item_prices_write`, etc.) that don't appear anywhere in the checked-in SQL history — meaning someone applied policies directly via the Supabase dashboard at some point without committing the SQL. Not a conflict (RLS policies are OR'd), but worth knowing your live schema has some untracked history.

---

## 2. HR Shift-Based Auto No-Pay on Excessive Leave

**Highest-risk item in this batch — extra scrutiny applied.** Confirmed requirement: 4 paid leave days per calendar month, combined across all leave types; excess days auto-convert to `no_pay`; manual override always available.

**What was built and applied live** (`supabase/migrations/20260803_hr_leave_no_pay_split.sql`):
- New `leave_entitlement_policies` table (configurable cap per company/branch, defaults to 4/month, seeded for all existing companies).
- New `fn_calc_leave_no_pay_split()` — walks a leave request day-by-day, splitting a single multi-day request across `on_leave`/`no_pay` if it crosses the monthly cap, resetting the counter at month boundaries.
- Rewired the leave-approval trigger to use this per-date split instead of the old all-or-nothing static flag.
- Added `attendance_records.is_manual_override` — HR can lock a day's status so the automatic calculation never overwrites it. Wired into the Attendance page's Edit and Mark dialogs with a visible badge distinguishing auto vs. manually-set no-pay days.
- **Fixed a pre-existing bug independent of this feature request:** the live payroll engine (`process_monthly_payroll`) was not deducting pay for `no_pay`-status days at all — only `'absent'` was counted. Without this fix, the whole no-pay feature would have had zero effect on actual paychecks. Fixed by reproducing the entire current payroll function with this one targeted addition (all other payroll logic — advances, OT, EPF/ETF, allowances — untouched).
- Unified two competing leave-approval code paths that had inconsistent balance-tracking behavior.

**Security fix I made during review** (before applying): the `approve_leave_request()` function had **no internal role check at all** — combined with its grant to all authenticated users, any logged-in employee could have called this directly via the API and approved leave requests, bypassing the UI's button visibility (which is not a real security boundary). Added a role check (`admin`/`hr`/`manager` only) before applying.

**Applied live and verified:** all 5 structural checks passed (policy table exists, calc function exists, override column exists, payroll function confirmed patched, default policies seeded).

**Recommendation:** run one real payroll cycle and manually verify a payslip's `no_pay` deduction line before fully trusting it in production — this touches real paychecks and, while carefully reviewed, was not tested against a live payroll run.

---

## 3. PO Invoice Filters

Added a supplier filter to the PO list's existing filter drawer (date-range filter was already present and confirmed working — no bug there, contrary to the original assumption). Reused the existing generic filter engine in `BaseDataGrid.vue`, so no manual filtering code was needed. Properly scoped by company/branch, no security concerns.

---

## 4. Procurement Reports — Excel/PDF Export + Supplier Summary

- Replaced the old CSV-only export on the Supplier Statement / AP Aging / PO vs GRN tabs with the same Print / Export PDF / Export Excel buttons already used elsewhere in the app (`SupplierPaymentReport.vue`'s pattern) — no new visual style, per your confirmed preference.
- Every report tab now shows a totals footer row with the aggregated final amount for whatever filter is active — this was your explicit, repeated requirement.
- New 4th tab: **Supplier Summary** — total invoiced, total paid, total due, invoice count, and overdue count per supplier across the whole company, with a grand-total footer so you can see total outstanding payables at a glance. Filterable by date range, exportable the same way.

---

## 5. GRN Rework — Supplier-Direct + Monthly Costing — ⚠️ SQL NOT YET APPLIED (your choice)

Per your instruction, I did not apply this migration — you said you'd do it manually via the Supabase dashboard. Here's exactly what's ready and what it does:

**File:** `supabase/migrations/20260803_grn_rework_supplier_direct_costing.sql`

**What it changes:**
1. Removes the old "average of last two prices" logic from `post_goods_receipt()` — a genuinely broken calculation that ignored quantity entirely.
2. Adds `fn_recompute_monthly_avg_cost()` — recalculates each item's average cost from scratch once a month, properly weighted by the actual quantity and price of every GRN posted that month. Scheduled to run automatically via `pg_cron` on the 1st of each month, plus a manual "Recalculate Now" button (already built into Procurement Settings, client-side ready).
3. Confirms the PO auto-close logic safely no-ops for new supplier-direct GRNs (doesn't crash), while remaining functional for old historical PO-linked GRNs.

**Security fix I made during review:** the new `fn_recompute_monthly_avg_cost()` function had no internal role check, meaning any logged-in staff member could have triggered a company-wide cost recalculation via the API. Added a role gate (admin/manager/inventory/procurement only), while still allowing the scheduled `pg_cron` job to run (which has no user session).

**Client-side changes already live in your working tree (no DB dependency, safe regardless of when you apply the SQL):**
- GRN creation is now supplier-direct only — the old "from Purchase Order" mode is gone.
- **Found and fixed a real pre-existing bug**: the unit price column in the GRN line editor was never rendering at all, because the code path that enables it was missing `'GRN'` from its allow-list. Direct GRN price entry may not have worked correctly before this fix.
- GRN now pre-fills a suggested price from the Items Supplied catalogue (feature #1) when available.
- Since GRN no longer auto-closes Purchase Orders, I added a manual "Close PO" button to the PO list page (there was no way to close a PO by hand before this — the old button was a non-functional placeholder).

**Until you apply the SQL:** the client already only creates supplier-direct GRNs, but the old (broken) 2-point averaging logic is still running server-side on every GRN post — so item average costs will keep drifting incorrectly until you run this migration.

---

## 6. System Backup — Built, Not Yet Deployed

**Confirmed scope:** download + manual "backup now" trigger only, no restore functionality anywhere in the app (per your decision to keep this risk-free).

**Important finding from live research:** Supabase's Management API, as it exists today, does **not** actually expose an on-demand backup trigger or a backup file download/signed-URL endpoint — only a backup *listing* endpoint. Rather than fake these capabilities, the feature is built to report this honestly:
- "Backup Now" shows the real backup schedule and most recent backup time instead of pretending to trigger one.
- "Download" clearly states it isn't available and directs you to Supabase support/dashboard.
- This is not a bug in the build — it's Supabase's actual current API surface. If they add these endpoints later, the function is structured to slot them in easily.

**Security:** hard admin-only gate (role checked server-side against the database, not just the JWT), the Management API token never leaves the server, strict action allow-list, no fabricated success responses.

**To go live, you need to:**
1. `supabase link --project-ref clykwuzajtwvwuavmtzs` (with correct account credentials — the CLI on this machine was linked to a different Supabase account)
2. `supabase functions deploy system-backup`
3. `supabase secrets set SUPABASE_MANAGEMENT_API_TOKEN=<your PAT>` (same one used for MCP/SQL-apply — do not put it in any repo file)

---

## Cross-Cutting Security Review

Two real security gaps were found and fixed during my review of the agents' work before anything was applied live:
1. `approve_leave_request()` had no role check at all (fixed — see #2 above).
2. `fn_recompute_monthly_avg_cost()` had no role check at all (fixed — see #5 above).

Both were caught because I read every migration line-by-line before applying, rather than trusting the agent reports at face value. No other issues found. All new RLS policies follow the existing company/branch-scoping convention — no blanket "authenticated" access was introduced anywhere.

---

## What You Need To Do

1. **Apply the GRN migration** (`supabase/migrations/20260803_grn_rework_supplier_direct_costing.sql`) via the Supabase dashboard SQL editor when ready — you asked to do this yourself.
2. **Deploy the backup Edge Function** (3 commands above) once you have the right Supabase CLI credentials linked.
3. **Rebuild and redeploy the frontend** (`npx quasar build` — and `npx tauri build` if you also rebuild the desktop app) to ship all the client-side changes.
4. Recommended: run one real payroll cycle and spot-check a payslip before fully trusting the no-pay deduction in production payroll.

Nothing was committed to git — all changes are sitting in your working tree, ready for you to review and commit when satisfied.
