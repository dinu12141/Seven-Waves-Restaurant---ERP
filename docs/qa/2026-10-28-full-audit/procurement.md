# Procurement: full department audit (2026-10-28)

Scope: `src/pages/procurement/*` (Dashboard, Suppliers, PO, GRN, GIN, AP Invoices, Payments, Payment Report, Returns, Reports, Settings), `src/components/procurement/*` (read only) and the list and report functions in `src/services/procurementService.ts`.
I made no changes to the live DB. I ran no SQL. I made no commits.

## Summary

**Health score: 6.5 / 10.** The core money path is in reasonable shape: PO approval guard, GRN, auto-posted AP bill, multi-bill supplier payment through `create_and_post_payment`, plus the server guards #128, #136, #140 and #147. Those protections are still wired in the client.

The weak spots were in the list and report layer and in **Purchase Returns**:
- **Purchase Returns was functionally broken.** "From GRN" loaded no lines. Saving then silently returned the *full* GRN quantity. Editing a draft lost its lines and its warehouse. The supplier column always showed "-".
- **Every list query could silently truncate at 1,000 rows.** That affected PO, GRN, AP bills, payments, returns, AP aging, the supplier summary, the statement and the payment report.
- **Status filters were incomplete or wrong.**
  - AP "Unpaid" left out `partial_paid` and `approved` bills.
  - The PO tabs and filter left out `pending_approval`, `approved` and `partial`.
- **Dates used UTC in several places.** These used `toISOString()` dates, which give the wrong day between 00:00 and 05:30 Sri Lanka time: dashboard "today", AP aging, supplier summary overdue count, reports default date, PO default `doc_date`.
- **Payments and Returns lists had no filters at all.** The AP list had no search.
- **The Supplier Payment Report "Total Paid" included cancelled and draft payments.**

**Verdict:** this is fit for production use now that these fixes are in. Purchase Requisitions don't exist in the module. A few server-side guarantees still need DB work (listed below).

## Findings

| ID | Sev | Area | Problem | File:line | Status |
|---|---|---|---|---|---|
| P-01 | High | Returns | "From GRN" used `selectedGRN.lines`, which `listGRNs` never returns, so the editor was empty. Save then called `createReturnFromGRN`, which copies the **full** GRN quantity and ignores user edits. Over-returns stock and supplier credit. | PurchaseReturnsPage.vue:325, :487 | FIXED (loads lines via `getGRNDetails`; saves edited lines via `createReturn` with `grn_id`) |
| P-02 | High | Returns | Edit used the list row: no lines and no supplier/warehouse objects. Saving a draft sent 0 lines and an undefined warehouse. | PurchaseReturnsPage.vue:387 | FIXED (loads the doc with `getReturnDetails`) |
| P-03 | Med | Returns | Supplier column read `row.supplier` but the API returns `suppliers`, so it always showed "-". | PurchaseReturnsPage.vue:270 | FIXED |
| P-04 | Med | Returns | Return quantity was not validated client-side (it could exceed the received qty, be negative, or all lines could be 0). | procurementService.ts:606 `validateReturnLines` | FIXED (the server's `validate_return_qty_vs_grn` stays the authority) |
| P-05 | Med | Returns | The PostingBar "Cancel" and "Print" buttons called empty stubs, so clicking did nothing. | PurchaseReturnsPage.vue:537 | FIXED (Cancel explains it isn't supported, Print opens the browser print). A real cancel needs SQL (B-04). |
| P-06 | High | All lists | No `.range()` paging, so PostgREST cuts results at 1,000 rows with no warning. Covered: PO, GRN, AP bills (237+ live), payments, returns, AP aging, supplier summary, statement, payment report. | procurementService.ts:546 `fetchAllProcRows`, applied at :638, :959, :1367, :1996, :2234, :2596, :2618, :2666, :2874 | FIXED (paged, deterministic `order(..., id)`) |
| P-07 | High | AP bills | The "Unpaid" filter was `status IN (draft, posted)`, so partially-paid and approved bills with a balance were hidden. | procurementService.ts:1389 | FIXED (`UNPAID_AP_INVOICE_STATUSES`) |
| P-08 | Med | AP bills | The status dropdown had no Posted / Partially Paid / Approved options. | APInvoicesPage.vue:321 | FIXED |
| P-09 | Med | PO | Tabs and filter had no `pending_approval`, `approved` or `partial` options, so those POs only appeared under "All". | PurchaseOrdersPage.vue:398, :431 | FIXED |
| P-10 | Med | Dates (TZ) | `toISOString()` dates were wrong 00:00–05:30 in LK. Affected: dashboard today/7-day chart, PO default `doc_date`, reports default "to" date, AP aging "today" and supplier-summary overdue. | ProcurementDashboard.vue:108,142; PurchaseOrdersPage.vue:654; ProcurementReportsPage.vue:515; procurementService.ts:2618,2666 | FIXED (`localDateKey` / `date.formatDate`) |
| P-11 | Med | Payment report | "TOTAL PAID" (table and PDF) summed cancelled and draft payments. | SupplierPaymentReport.vue:216 | FIXED (`sumPostedPayments`, label "posted only") |
| P-12 | Med | Payments | No search, supplier, status or date filter on the payments list. | PaymentsPage.vue:556 | FIXED |
| P-13 | Med | Returns | No filters on the returns list. | PurchaseReturnsPage.vue | FIXED |
| P-14 | Low | AP bills | No text search. Most columns weren't sortable, and amounts sorted as strings. | APInvoicesPage.vue | FIXED (search on Inv#, supplier inv#, GRN and supplier; numeric sort; Reset button; exports follow the visible rows) |
| P-15 | Low | GRN | No date, status or supplier filters (only free-text search). | GRNPage.vue:504 | FIXED (BaseDataGrid filter drawer) |
| P-16 | High | GRN / security | "Delete" was offered on every GRN to every user with view access, including **posted** GRNs that already have stock and an auto-posted AP bill (#128). | GRNPage.vue:500 | FIXED in UI (drafts: anyone; posted: admin only). NEEDS-SQL: `delete_grn` is not in the repo, so I couldn't verify its role check or how it handles a linked AP bill or payment (B-01). |
| P-17 | Med | Statement / balance | `ap_ledger` debit/credit were summed with `r.debit \|\| 0`, which risks string concatenation if numerics come back as strings. `getSupplierBalance` also ignored the ledger query error. | procurementService.ts:399, :2596 | FIXED |
| P-18 | Low | Load errors | GRN, PO, AP, payments and returns list load failures were only logged with `console.error`, so the user saw an empty table. | several | FIXED (negative notify with caption) |
| P-19 | Low | Dark mode | `bg-grey-1` / `bg-grey-2` panels and total rows were unreadable in dark mode. | APInvoicesPage, PaymentsPage (cheque panel), SupplierPaymentReport, PurchaseReturnsPage | FIXED |
| P-20 | Low | Dashboard | The "Pending POs" KPI left out `pending_approval` and `partial`. | ProcurementDashboard.vue | FIXED |
| P-21 | Med | Shared grid | `BaseDataGrid` select filters use `includes()` (so "paid" also matches "partial_paid") and only read top-level fields. Out of my scope (shared component). | src/components/common/BaseDataGrid.vue:533-552 | PROPOSED (exact match for select filters) |
| P-22 | Med | Supplier balance | The Suppliers list shows the stored `suppliers.balance`. `getSupplierBalance` (computed from `ap_ledger`) is unused, so there's no check that the two agree. | SuppliersPage.vue:545 | PROPOSED / NEEDS-SQL (reconciliation view) |
| P-23 | Low | Statement | The supplier statement has no opening balance (balance covers the period only). | procurementService.ts:2596 | PROPOSED |
| P-24 | Low | Scope mismatch | Dashboard KPIs are company-wide; every list is branch-scoped. Totals won't match the lists for multi-branch users. | ProcurementDashboard.vue | PROPOSED (label, or branch filter) |
| P-25 | Low | Security | `canClosePO` and the GRN amendment "admin" check are client-only (the close permission reuses `procurement.suppliers.edit`). | PurchaseOrdersPage.vue:252; GRNPage.vue:435 | NEEDS-SQL (verify `close_po` / amendment RPC role checks) |
| P-26 | Low | Lists | `listInventoryPOs` and `getPOVarianceReport` are not paged yet. Low volume today. | procurementService.ts:672, :2740 | PROPOSED |
| P-27 | Info | Flow | There is no Purchase Requisition (PR) page or table, and no dedicated approvals inbox (approval is inline in the PO dialog). | — | PROPOSED |
| P-28 | Info | Security | No `v-html` in procurement pages or components. Mutations go through RPCs (#128/#136/#140/#147 still wired). | — | OK |

## UI/UX and filter improvements done

- **AP Invoices:**
  - Search box (Inv #, supplier invoice #, GRN ref, supplier).
  - Full status list.
  - Reset button.
  - Sortable date, supplier, amount, balance and status columns, with numeric sort.
  - "All" rows-per-page option.
  - Empty-state label.
  - Totals and PDF/Excel export now follow the filtered rows.
  - Dark-safe total row.
  - Responsive grid (sm breakpoints).
- **Payments:**
  - New filter bar: search (payment #, cheque, reference, supplier, remarks), supplier, status, from/to date, Reset.
  - Sortable columns.
  - Empty-state label.
  - Dark-safe cheque panel.
- **Purchase Returns:**
  - Same filter bar.
  - Subtitle explaining what a return does.
  - GRN Ref column.
  - Sortable columns.
  - Dark-safe panels.
  - The doc date is fresh for each new return (it used to be set once when the page loaded).
- **GRN:** filter drawer for date range, status and supplier. The Delete action is hidden where it isn't allowed.
- **PO:** complete status tabs and filters.
- **Payment Report:** "Total Paid (posted only)", dark-safe total row.
- All date filters compare `YYYY-MM-DD` strings. There is no `new Date()` parsing, so no timezone shift.

## Development backlog

| ID | Item | Effort | Priority |
|---|---|---|---|
| B-01 | **SQL:** confirm or add a role check in `delete_grn` (admin for posted). Block it if the GRN's AP bill has payments; otherwise reverse the bill and its GL. | M | P1 |
| B-02 | **SQL:** reconciliation view `v_supplier_balance_check` (`suppliers.balance` vs `ap_ledger` vs open `ap_invoices.balance_due`), and show a drift badge on Suppliers. | M | P1 |
| B-03 | **SQL:** confirm `post_purchase_return_rpc` writes the `ap_ledger` debit, the GL (Dr AP 2000 / Cr Inventory 1005 / VAT 1010 reversal) and `ap_invoices.credited_amount`. Add a test fixture. | M | P1 |
| B-04 | **SQL and UI:** `cancel_purchase_return` RPC (reverse stock, AP and GL), then wire PostingBar Cancel. | M | P2 |
| B-05 | Exact-match select filters in shared `BaseDataGrid`, with nested-field support (owner: shared components). | S | P2 |
| B-06 | Supplier statement opening balance (sum of `ap_ledger` before `fromDate`) and a running balance column. | S | P2 |
| B-07 | Server-side pagination (count and range) for GRN, PO and AP lists once volume passes about 5k. | M | P3 |
| B-08 | Purchase Requisition module (PR, then approval, then convert to PO), plus an approvals inbox page. | L | P3 |
| B-09 | Page `listInventoryPOs` and `getPOVarianceReport`. Branch-scope the dashboard or label it "company-wide". | S | P3 |
| B-10 | Replace the `procurement.suppliers.edit` reuse with dedicated permissions (`procurement.purchase_orders.close`, `procurement.grn.delete`), enforced in the RPCs. | M | P2 |
| B-11 | Printable return note (PDF) instead of `window.print()`. | S | P3 |

## Tests run

- New: `tests/procurement/procurement-list-filters.test.ts` (18 tests). It covers:
  - paging past 1,000 rows and error propagation;
  - the Unpaid AP status set;
  - `localDateKey` at 00:30 local time;
  - AP aging buckets under fake time;
  - numeric coercion in the statement;
  - `filterProcRows` (exact status, inclusive dates, search);
  - `sumPostedPayments`;
  - `validateReturnLines`.
- `npx vitest run tests/procurement`: **7 files, 91/91 passed**.
- `npx vitest run tests/finance/payables-bill-gate.test.ts` (it imports procurementService): **6/6 passed**.
- `npx eslint` on all 8 changed `.vue` files: **0 errors, 0 warnings**. The `.ts` files are outside the eslint config and were skipped.
- `vue-tsc --noEmit` filtered to the changed TS files: no errors.
