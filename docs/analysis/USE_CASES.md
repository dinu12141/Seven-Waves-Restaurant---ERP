# Use Case Specifications
## Seven Waves Restaurant ERP
**Version:** 1.0 | **Date:** 2026-07-16 | **Author:** Analyst Agent

---

## UC-001: Customer QR Scan → Order Flow

**Actors:** Customer (primary), System, Waiter (secondary)
**Module:** Online Ordering / QR / Touch Menu

**Preconditions:**
- Restaurant table has an active QR code (`qr_sessions.is_active = true`)
- `VITE_APP_PUBLIC_URL` or `sw_qr_base_url` is set correctly
- Touch menu is accessible at `/touch`

**Main Flow:**
1. Customer scans QR code printed on the table
2. Browser opens `{base_url}/c/{qrToken}`
3. `QrEntryPage.vue` calls RPC `get_or_create_session_by_qr(token)`
4. RPC returns `session_token` + `table_id`; `tableSessionStore` saved to `localStorage`
5. Customer is redirected to `/customer/register`
6. Customer enters name/phone (or skips) → redirected to `/touch`
7. `MenuBookTablet.vue` loads menu items for the branch
8. Customer browses menu, adds items to cart
9. Customer taps "Place Order"
10. `create_kiosk_order` RPC is called with cart items + session_token
11. Order created with `status = 'pending_waiter'`; trigger notifies waiters
12. Customer sees "Order sent! We'll prepare it shortly"
13. Customer optionally navigates to `/order-tracking` for live status

**Alternative Flows:**
- A1 (QR invalid/expired): Step 3 returns error → redirect to error page with "Invalid QR code" message
- A2 (Customer skips registration): Step 6 skipped → proceeds directly to step 7 as guest
- A3 (Item unavailable): System shows greyed-out item; customer removes and re-orders

**Exception Flows:**
- E1 (Network failure at step 10): Customer sees "Could not place order. Please retry."
- E2 (Session expired): Browser clears `localStorage`; customer rescans QR

**Postconditions:**
- Order record exists in `orders` with `status = 'pending_waiter'`
- `order_items` records created
- Waiter receives realtime notification
- `qr_sessions.last_used_at` updated

**DB References:**
- `qr_sessions`, `orders`, `order_items`, `table_sessions`
- RPC: `get_or_create_session_by_qr`, `create_kiosk_order`
- Store: `tableSessionStore.ts`, `customerOrderStore.js`

---

## UC-002: Waiter Accept Order → KOT Dispatch

**Actors:** Waiter (primary), System, Kitchen Staff (secondary), Cashier (secondary)
**Module:** Waiter App / KDS / KOT Orchestration

**Preconditions:**
- Waiter has an active shift entry for today's branch (`shifts` table)
- Order exists with `status = 'pending_waiter'` and `assigned_waiter_id IS NULL`
- `auth_is_on_shift(branch_id)` returns true for the waiter

**Main Flow:**
1. Waiter opens `ShiftInboxPage.vue` on mobile PWA (`/waiter-app/inbox`)
2. `waiterOrderStore.initialize()` calls `auth_get_shift_branches` RPC to verify shift
3. Real-time subscription `'waiter-orders-rt'` delivers new order event
4. Order appears in inbox with table number, items, and order number
5. Waiter reviews order and marks unavailable items (if any)
6. Waiter taps "Accept"
7. `kotDispatchService.acceptOrder()` calls RPC `accept_order_as_waiter(p_order_id, p_unavailable_ids)`
8. RPC (server-side, atomic):
   a. `UPDATE order_items SET kitchen_id = get_target_kitchen_for_item(...)` — MUST happen first
   b. `UPDATE orders SET status = 'accepted', assigned_waiter_id = waiter_id`
   c. Trigger `trg_generate_kot` fires → creates `kot_tickets` + `kot_items`
   d. Trigger `trg_z_dispatch_on_accept` fires → creates `kot_dispatches` for KITCHEN, CASHIER, INVENTORY, FINANCE
9. KOT tickets appear on Kitchen Display System in real-time
10. Cashier sees order in billing queue
11. Inventory queue entry created for stock deduction
12. Finance queue entry created for journal posting

**Alternative Flows:**
- A1 (Waiter marks items unavailable): Steps 8a–8d still proceed; unavailable items removed from KOTs; customer notified
- A2 (Waiter declines order): Order returned to `pending_waiter`; another waiter can accept

**Exception Flows:**
- E1 (No shift found): `initialize()` returns empty branches; inbox shows "No active shift" message
- E2 (RPC PGRST203 — multiple function overloads): Deployment error; fix: drop duplicate overload
- E3 (Kitchen routing fails — no `kitchen_id` resolved): Order items have `kitchen_id = NULL`; KOT generation skipped or routed to default kitchen

**Postconditions:**
- `orders.status = 'accepted'`, `assigned_waiter_id` set
- `kot_tickets` created per kitchen
- `kot_dispatches` created for all downstream targets
- Kitchen staff see new KOTs on KDS

**DB References:**
- Tables: `orders`, `order_items`, `kot_tickets`, `kot_items`, `kot_dispatches`, `shifts`
- RPC: `accept_order_as_waiter`, `auth_get_shift_branches`, `get_target_kitchen_for_item`
- Triggers: `trg_generate_kot`, `trg_z_dispatch_on_accept`
- Store: `waiterOrderStore.js`, `waiterAppStore.js`
- Service: `src/services/kotDispatchService.js`

---

## UC-003: POS Quick Pay Flow

**Actors:** Cashier (primary), System
**Module:** POS

**Preconditions:**
- Cashier is authenticated with `cashier` or `admin` role
- Cashier has an active branch
- Cart has at least one item

**Main Flow:**
1. Cashier opens POS (`/pos`), selects order type and items
2. Cashier selects payment method (Cash / Card / Digital)
3. Cashier taps "Quick Pay"
4. `orderStore.processPayment(paymentMethodName)` is called:
   a. Step 1: `INSERT orders` with `status = 'pending_waiter'`
   b. Step 2: `INSERT order_items` (best-effort rollback on failure)
   c. Step 3: `process_waiter_accept(p_order_id)` RPC — auto-accepts, generates KOTs
   d. Step 4: `process_cashier_invoice(p_order_id)` RPC — marks invoiced
   e. Step 5: `process_cashier_payment(p_order_id, method, amount)` RPC — posts finance + stock
5. On success: cart cleared, receipt printed, order number displayed
6. Receipt auto-prints via ESC/POS printer if configured

**Alternative Flows:**
- A1 (Delivery order): Delivery charge added; `delivery_source` set
- A2 (Customer with loyalty): Loyalty points earned; balance updated

**Exception Flows:**
- E1 (Step 3 RPC fails): Error displayed; order in `pending_waiter` limbo — must be manually resolved
- E2 (Printer offline): Payment succeeds; receipt not printed; option to reprint later
- E3 (Network timeout at step b): Order created but items insert failed; orphaned order deleted (best-effort)

**Postconditions:**
- `orders.status = 'paid'`, `payment_status = 'paid'`
- `payments` record created
- Finance journal entry created (auto)
- Stock deducted (auto)
- KOT sent to kitchen

**DB References:**
- RPC: `process_waiter_accept`, `process_cashier_invoice`, `process_cashier_payment`
- Store: `orderStore.js` — `processPayment()`
- Tables: `orders`, `order_items`, `payments`, `finance_entries`, `stock_queue`

---

## UC-004: Kitchen KDS → Mark Ready → Serve

**Actors:** Kitchen Staff (primary), Waiter (secondary), System
**Module:** KDS

**Preconditions:**
- KOT ticket exists with `status IN ('created', 'pending', 'accepted')`
- Kitchen staff is logged in with `kitchen` role and assigned to a kitchen station
- KDS is loaded at `/kitchen`

**Main Flow:**
1. Kitchen staff sees new KOT ticket on KDS (`KitchenPage.vue`)
2. `kitchenDisplayStore` receives realtime update via `kot_tickets` channel
3. KOT card shown in "New" column with items, table number, and order number
4. Kitchen staff taps "Start" → `kitchenStartKot(ticketId)` called
5. KOT status → `preparing`; timer starts; ticket moves to "Preparing" column
6. Kitchen staff prepares the food
7. Kitchen staff taps "Ready" → `kitchenMarkReady(ticketId)` called
8. KOT status → `ready`; ticket moves to "Ready" column
9. Waiter receives alert (in-app or audio) that order is ready
10. Waiter collects food and serves customer
11. Table status updated when all KOTs for order are `ready`

**Alternative Flows:**
- A1 (Multiple kitchens): Each kitchen sees only its own KOTs; routing by `kitchen_id`
- A2 (Item modification): Kitchen can note a substitution via KOT comment

**Exception Flows:**
- E1 (Realtime disconnect): KDS shows reconnection status; falls back to manual refresh
- E2 (Kitchen printer offline): KOT auto-prints on creation; reprint option available

**Postconditions:**
- `kot_tickets.status = 'ready'`
- Waiter notified
- Order progress tracking updated for customer

---

## UC-005: Inventory Receipt with Barcode Scanner

**Actors:** Inventory Manager (primary), System
**Module:** Inventory / Procurement

**Preconditions:**
- GRN exists in `pending` status for a purchase order
- Barcode scanner is connected and configured in Device Management
- `useBarcodeScanner.js` composable is active

**Main Flow:**
1. Inventory manager opens GRN page (`/procurement/grn`)
2. Scans barcode on first item
3. `useBarcodeScanner.js` fires event with barcode value
4. System matches barcode to inventory item (`inventory_items.barcode`)
5. GRN line item pre-populated with item and unit
6. Inventory manager confirms received quantity
7. Repeats steps 2–6 for all items
8. Manager taps "Post GRN"
9. `process_grn_posting` RPC runs:
   a. Updates `inventory_stock.quantity_on_hand`
   b. Creates AP invoice
   c. Posts finance journal entry (inventory debit, AP credit)
10. GRN status → `posted`; stock updated immediately

**Alternative Flows:**
- A1 (Barcode not found): System prompts manual item selection
- A2 (Partial delivery): Some line items left at zero; GRN marked as partial

**Exception Flows:**
- E1 (Scanner disconnects): Manual entry fallback; barcode field accepts keyboard input
- E2 (Over-receipt): System warns if quantity exceeds PO line quantity

**Postconditions:**
- `inventory_stock.quantity_on_hand` increased
- `ap_invoices` record created
- Finance journal posted

---

## UC-006: Finance Journal Entry → Trial Balance

**Actors:** Finance Officer (primary), Finance Manager (approver), System
**Module:** Finance

**Preconditions:**
- Finance officer has `finance.journal.create` permission
- Fiscal period is open (not locked)
- Accounts exist in chart of accounts

**Main Flow:**
1. Finance officer navigates to Pay Voucher page (`/finance/pay-vouchers`)
2. Selects voucher type, date, reference, narration
3. Adds debit line (account, amount)
4. Adds credit line (account, amount) — system validates debit = credit
5. Saves draft voucher
6. Finance manager navigates to Voucher Approval page
7. Reviews voucher; approves → RPC posts the voucher to ledger
8. Posted voucher creates `ledger_entries` (immutable)
9. Finance officer opens Financial Statements page
10. Runs Trial Balance → balanced totals confirmed
11. Runs P&L and Balance Sheet

**Alternative Flows:**
- A1 (Auto-voucher from payment): `finance_integration.sql` auto-creates voucher; goes directly to step 8

**Exception Flows:**
- E1 (Imbalanced voucher): System blocks submission until debit = credit
- E2 (Closed fiscal period): System blocks posting; shows "Period closed" error

**Postconditions:**
- `vouchers` record with `status = 'posted'`
- `ledger_entries` created (immutable)
- Trial balance reflects new entry

---

## UC-007: HR Fingerprint Attendance → Payroll Calculation

**Actors:** Employee (primary), HR Officer (secondary), System, Biometric Device
**Module:** HR & Payroll

**Preconditions:**
- Employee is enrolled in biometric device (`biometric_integration.sql`)
- Biometric device is online and synced
- Payroll period is configured in salary structure

**Main Flow:**
1. Employee places finger on biometric reader at shift start
2. Biometric device sends attendance event to system (via sync service)
3. `attendance` record created with `check_in` timestamp
4. At shift end, employee checks out → `check_out` recorded
5. Daily attendance record has `worked_hours` calculated
6. HR officer navigates to Payroll Run page at month end
7. System loads attendance data for all employees in the period
8. `payroll_engine.sql` calculates:
   - Basic salary (worked days / total days × base salary)
   - Allowances (configured in salary structure)
   - Deductions (EPF 8%, ETF 3%, advances, leaves without pay)
9. HR reviews payroll summary; confirms each employee
10. HR manager approves payroll run
11. `fix_payroll_finance_post.sql` auto-posts salary journal to finance
12. Payslips generated per employee

**Alternative Flows:**
- A1 (Manual attendance): HR officer manually enters check-in/check-out
- A2 (Leave days): Leave balance auto-deducted from attendance

**Exception Flows:**
- E1 (Biometric device offline): Falls back to manual attendance; HR notified
- E2 (Payroll already run): System prevents duplicate payroll for same period

**Postconditions:**
- `payroll_runs` record created and approved
- `payslips` generated per employee
- Finance journal posted (salary expense debit, payable credit)

---

## UC-008: Manager Daily Reports

**Actors:** Manager (primary), System
**Module:** Reports

**Preconditions:**
- Manager is authenticated with `reports.*` permissions
- Data exists for the selected date range

**Main Flow:**
1. Manager opens Reports module (`/reports/dashboard`)
2. Selects "Daily Cash Summary" for today
3. Report loads with:
   - Total revenue by payment method
   - Order count by type (dine-in, takeaway, delivery)
   - Void/refund totals
   - Service charge collected
4. Manager verifies cash collected matches POS records
5. Manager opens "Item-wise Sales" report
6. Sorts by quantity sold descending to see top items
7. Exports to Excel (currently missing — FR-212)
8. Manager sends report to owner via WhatsApp (manual workaround)

**Alternative Flows:**
- A1 (Multi-branch admin): Branch filter applied; can view any branch
- A2 (Custom date range): Date picker allows any range

**Exception Flows:**
- E1 (No data): Report shows empty state with "No transactions for this period"

**Postconditions:**
- Manager has reviewed daily performance
- Discrepancies flagged for investigation

---

## UC-009: Online Order → Delivery Assignment

**Actors:** Customer (primary), Manager/Cashier (secondary), Delivery Rider (tertiary), System
**Module:** Delivery / Online Ordering

**Preconditions:**
- Customer has submitted an order with `order_type = 'delivery'`
- Delivery riders are available and logged into the Delivery PWA
- `delivery_assignments` table has active records

**Main Flow:**
1. Customer places order via website/kiosk with delivery address
2. Order created with `order_type = 'delivery'`, `status = 'pending_waiter'`
3. Waiter accepts order (UC-002) → KOT generated
4. Kitchen prepares food → KOT marked ready
5. Manager/cashier assigns delivery to a rider (manual assignment)
6. `delivery_assignments` record created with `status = 'pending_rider'`
7. Rider receives real-time notification on Delivery PWA (`/delivery-app`)
8. Rider views assignment on `DeliveryHomePage.vue`
9. Rider accepts assignment → `status = 'accepted'`
10. Rider picks up food → taps "Picked Up" → `svcMarkPickedUp()` → `status = 'picked_up'`
11. Rider delivers food → taps "Delivered" → `svcMarkDelivered()` → `status = 'delivered'`
12. Order status updated to reflect delivery completion
13. Customer's order tracking page shows "Delivered"

**Alternative Flows:**
- A1 (3rd-party delivery — Uber/PickMe): `delivery_source` tagged; no internal rider assignment
- A2 (Rider declines): Assignment returned to pool; another rider assigned

**Exception Flows:**
- E1 (No riders available): Manager sees "No riders online" warning; can wait or call manually
- E2 (Rider GPS unavailable): Delivery proceeds; no tracking visible to customer

**Postconditions:**
- `delivery_assignments.status = 'delivered'`
- `orders.status = 'delivered'` (or awaiting payment)
- Rider delivery recorded in history

---

## UC-010: Admin Multi-Branch Configuration

**Actors:** Admin (primary), System
**Module:** Administration

**Preconditions:**
- User has `admin` role
- Company record exists

**Main Flow:**
1. Admin navigates to `/admin/branches`
2. Creates a new branch (name, address, phone, is_main flag)
3. Admin assigns users to the branch in `/admin/users` (branch_users table)
4. Admin creates kitchen stations for the branch
5. Admin configures tables for the branch
6. Admin assigns menu items/categories to the branch
7. Admin configures payment methods for the branch
8. Admin activates modules for the branch via Settings
9. Branch is now operational; staff can log in with branch context

**Alternative Flows:**
- A1 (Branch deactivation): `is_active = false`; all branch users lose access
- A2 (Main branch): `is_main = true`; used as fallback in multi-branch reports

**Exception Flows:**
- E1 (Duplicate branch name under company): System rejects with unique constraint error

**Postconditions:**
- Branch record created and active
- Staff assigned with `user_branches` records
- RBAC and RLS scoping applies to new branch automatically
