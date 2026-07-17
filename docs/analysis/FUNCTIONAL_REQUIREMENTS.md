# Functional Requirements Document
## Seven Waves Restaurant ERP
**Version:** 1.0 | **Date:** 2026-07-16 | **Author:** Analyst Agent

---

## 1. Introduction

This document enumerates functional requirements for all modules in the Seven Waves Restaurant ERP system. Each requirement is numbered, prioritized using MoSCoW, and tagged with its current implementation status.

**Status Legend:**
- `Existing` — Fully implemented and operational
- `Partial` — Implemented but incomplete or untested
- `Missing` — Not yet implemented
- `Buggy` — Implemented but has known defects

**Priority Legend:**
- `Must` — Critical for launch; system unusable without it
- `Should` — Important; deliver in first release if possible
- `Could` — Nice to have; defer if pressed for time
- `Won't` — Out of scope for current version

---

## 2. Module 01 — Dashboard

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-001 | Display real-time KPI widgets (revenue today, orders today, active tables, pending KOTs) | Must | Partial | `src/pages/dashboard/DashboardPage.vue` — widgets exist but data freshness not guaranteed |
| FR-002 | Show branch-level revenue trends (daily/weekly/monthly chart) | Must | Partial | Chart components exist; real-time update missing |
| FR-003 | Display top-selling items for the day | Should | Partial | Exists in dashboard but no auto-refresh |
| FR-004 | Show active staff currently on shift | Should | Missing | No live shift status on dashboard |
| FR-005 | Alert panel for low-stock items (reorder level breached) | Must | Missing | No real-time low-stock alert on dashboard |
| FR-006 | Multi-branch comparison widget for admin | Could | Missing | |
| FR-007 | Dashboard must respect branch scope (non-admin sees only own branch) | Must | Partial | RBAC gate in route but widget data not always filtered |
| FR-008 | System health status widget (DB connection, realtime status) | Could | Missing | |

---

## 3. Module 02 — POS (Point of Sale)

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-010 | Cashier/Waiter can browse menu items by category | Must | Existing | `src/pages/POSPage.vue` |
| FR-011 | Add items to cart with quantity, variant, and notes | Must | Existing | `src/stores/orderStore.js:64` |
| FR-012 | Support dine-in, takeaway, and delivery order types | Must | Existing | `orderStore.js:166` |
| FR-013 | Apply percentage or fixed discount per order | Must | Existing | `orderStore.js:discountAmount` |
| FR-014 | Apply service charge (10%) automatically for dine-in | Must | Existing | `orderStore.js:48` — hardcoded 10% |
| FR-015 | Send order to kitchen (pending_waiter status) | Must | Existing | `orderStore.js:sendToKitchen()` |
| FR-016 | Quick Pay — bypass waiter, auto-accept + pay in one flow | Must | Existing | `orderStore.js:processPayment()` |
| FR-017 | Park order and recall later | Should | Existing | `orderStore.js:parkOrder()/recallParkedOrder()` |
| FR-018 | Load order from cashier billing queue into POS | Must | Existing | `orderStore.js:loadOrderFromQueue()` |
| FR-019 | Select customer from CRM for loyalty redemption | Should | Existing | `selectedCustomer` ref in store |
| FR-020 | Support delivery source tagging (Uber, PickMe, Website) | Should | Existing | `deliverySource` ref |
| FR-021 | Item availability toggle (out-of-stock) | Must | Partial | `p_unavailable_ids` in accept RPC; no POS-level realtime update |
| FR-022 | Void/cancel order with reason code | Must | Partial | `pos.order.void` permission defined; UI partially done |
| FR-023 | Split bill functionality | Could | Missing | No split-bill implementation found |
| FR-024 | Table selection map (floor plan view) from POS | Should | Missing | POS uses table_number input, not graphical selector |
| FR-025 | Receipt printer integration (ESC/POS) | Must | Partial | `src/modules/devices/services/escpos.renderer.js` exists; POS print trigger incomplete |
| FR-026 | Barcode scanner support for item lookup | Should | Partial | `useBarcodeScanner.js` composable exists; POS integration untested |
| FR-027 | Order number auto-generation is time-based, not sequential | Buggy | Buggy | `src/stores/orderStore.js:359` — `ORD-HHMMSS` collides if two orders placed in the same second |

---

## 4. Module 03 — Kitchen Display System (KDS)

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-030 | Display KOT tickets in new/preparing/ready columns | Must | Existing | `src/stores/kitchenDisplayStore.js` |
| FR-031 | Kitchen staff can start preparing a KOT (status: preparing) | Must | Existing | `kitchenStartKot()` in `kotDispatchService` |
| FR-032 | Kitchen staff can mark KOT ready | Must | Existing | `kitchenMarkReady()` |
| FR-033 | Filter KOTs by assigned kitchen station | Must | Existing | `selectedKitchenId` in display store |
| FR-034 | Realtime KOT updates via Supabase channels | Must | Existing | `kotChannel` subscription in store |
| FR-035 | Audio/visual alert for new KOT tickets | Should | Existing | `newTicketAlert` ref in store; sound implementation partial |
| FR-036 | KOT timer (elapsed time since order created) | Should | Partial | `timerInterval` in store; display accuracy not verified |
| FR-037 | Kitchen can see item-level notes from customer | Must | Existing | Notes field on `order_items` |
| FR-038 | Print KOT ticket to kitchen printer | Must | Partial | `printing` ref in store; print trigger present but device binding incomplete |
| FR-039 | KDS supports multiple kitchen stations per branch | Must | Existing | `kitchens[]` array in store |
| FR-040 | KOT routing by menu item → subcategory → kitchen | Must | Existing | `get_target_kitchen_for_item()` DB function |
| FR-041 | Kitchen-locked login (kitchen role sees only own kitchen) | Must | Existing | `lockedKitchenId` via profile.kitchen_id |
| FR-042 | KOT deduction (remove items from KOT) | Could | Partial | `KotDeductionLog` report page exists; UI flow incomplete |

---

## 5. Module 04 — Orders Management

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-050 | View all orders with status filter | Must | Existing | `src/pages/OrdersPage.vue` |
| FR-051 | Order status pipeline: pending_waiter → accepted → cooking → ready → served → paid | Must | Existing | DB state machine with triggers |
| FR-052 | Filter orders by date, branch, status, waiter | Must | Partial | UI filters present; branch filter not always applied |
| FR-053 | View order items detail (expand per order) | Must | Existing | |
| FR-054 | Waiter inbox — accept/decline pending orders | Must | Existing | `src/pages/waiter-app/ShiftInboxPage.vue` |
| FR-055 | Order tracking for customers (online) | Should | Existing | `src/pages/OrderTrackingPage.vue` |
| FR-056 | Void/refund order with audit trail | Must | Partial | Permissions defined; UI partial |
| FR-057 | Export orders to CSV/PDF | Should | Missing | No export functionality found |
| FR-058 | KOT re-print capability from orders view | Should | Missing | |
| FR-059 | Website orders visible in separate page | Should | Existing | `src/pages/WebsiteOrdersPage.vue` |

---

## 6. Module 05 — Table Management

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-060 | CRUD for restaurant tables (number, section, capacity) | Must | Existing | `TablesManagementPage.vue` |
| FR-061 | Table status: available / occupied / reserved / maintenance | Must | Existing | `restaurant_tables.status` column |
| FR-062 | QR code generation per table | Must | Existing | `getAppBaseUrl()` + QR token in `TablesManagementPage.vue` |
| FR-063 | Floor plan grid view with color-coded status | Should | Existing | `ManagerFloorPage.vue`, `FloorOverviewPage.vue` |
| FR-064 | Table transfer (move order between tables) | Should | Missing | No table-transfer flow found |
| FR-065 | Merge tables for group bookings | Could | Missing | |
| FR-066 | Table occupancy timer | Should | Partial | `started_at` on sessions but no UI timer |
| FR-067 | Section/zone management | Could | Partial | `section` column in schema; no UI for section CRUD |

---

## 7. Module 06 — Reservations

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-070 | Online reservation form (customer-facing) | Must | Existing | `website/WebsiteReservationsPage.vue` |
| FR-071 | Admin view of pending/confirmed/cancelled reservations | Must | Existing | `WebsiteReservationsPage.vue` admin panel |
| FR-072 | Confirm/reject reservation with notification to customer | Must | Partial | Status update present; email notification missing |
| FR-073 | Reservation report | Should | Existing | `ReservationReport.vue` |
| FR-074 | Hall/event booking management | Should | Existing | `WebsiteHallBookingsPage.vue` |
| FR-075 | Automatic table assignment on reservation confirmation | Could | Missing | No auto-assign logic found |
| FR-076 | Reservation reminders (SMS/email) | Could | Missing | |
| FR-077 | Waitlist management | Could | Missing | |

---

## 8. Module 07 — Inventory

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-080 | CRUD for inventory items (ingredients, raw materials) | Must | Existing | `src/pages/inventory/ItemsPage.vue` |
| FR-081 | Stock quantity tracking per branch/warehouse | Must | Existing | `supabase/inventory.sql` |
| FR-082 | Stock adjustment with reason code | Must | Existing | `StockAdjustmentPage.vue` |
| FR-083 | Stock take (physical count) module | Must | Existing | `StockTakePage.vue` |
| FR-084 | Reorder level alerts | Must | Partial | `ReorderLevelReport.vue` exists; no auto-alert |
| FR-085 | Auto-deduct stock on order completion (BOM integration) | Must | Existing | `stock_queue_orchestration.sql` triggers |
| FR-086 | Wastage tracking | Should | Partial | `WastageReport.vue` exists; manual entry flow partial |
| FR-087 | Barcode/QR scanner for stock receipt | Should | Partial | `useBarcodeScanner.js` exists; inventory binding incomplete |
| FR-088 | Multi-warehouse/location support | Could | Partial | Schema supports it; UI not multi-location |
| FR-089 | Inventory performance reports | Should | Existing | `InventoryPerformanceReport.vue` |
| FR-090 | Ingredient consumption reports | Should | Existing | `IngredientConsumption.vue` |
| FR-091 | Variance report (theoretical vs. actual) | Should | Existing | `VarianceReport.vue` |
| FR-092 | Stock on hand report | Must | Existing | `StockOnHand.vue` |

---

## 9. Module 08 — Procurement

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-100 | Supplier management (CRUD) | Must | Existing | `SuppliersPage.vue` |
| FR-101 | Purchase Order creation with line items | Must | Existing | `PurchaseOrdersPage.vue` |
| FR-102 | PO approval workflow (multi-level) | Should | Partial | `supabase/procurement.sql` has approval fields; UI partial |
| FR-103 | Goods Receipt Note (GRN) against PO | Must | Existing | `GRNPage.vue` |
| FR-104 | GRN auto-updates inventory stock | Must | Existing | `fix_grn_posting.sql` |
| FR-105 | Accounts Payable invoice generation from GRN | Must | Existing | `APInvoicesPage.vue` |
| FR-106 | Supplier payment recording | Must | Existing | `PaymentsPage.vue` |
| FR-107 | Purchase returns | Should | Existing | `PurchaseReturnsPage.vue` |
| FR-108 | Supplier performance reports | Should | Existing | `SupplierWisePurchases.vue` |
| FR-109 | Auto-generate PO from reorder level | Could | Missing | |
| FR-110 | Procurement settings (payment terms, approval limits) | Should | Existing | `ProcurementSettingsPage.vue` |

---

## 10. Module 09 — Recipe / BOM Management

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-120 | Recipe (Bill of Materials) CRUD per menu item | Must | Existing | `supabase/recipe_bom_engine.sql`, `menu_recipes.sql` |
| FR-121 | Sub-recipe support (recipe within recipe) | Should | Partial | `bom_recipe_rpc.sql` supports it; UI partial |
| FR-122 | Theoretical cost calculation per dish | Should | Existing | BOM engine computes cost |
| FR-123 | Recipe scaling by portion size | Could | Missing | No scaling UI found |
| FR-124 | Recipe vs. actual consumption variance | Should | Existing | `VarianceReport.vue` uses BOM |
| FR-125 | Link recipe to menu item for auto-deduction | Must | Existing | `bom_inventory_completion.sql` |

---

## 11. Module 10 — Finance (ERP Accounting)

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-130 | Chart of Accounts (Ledger) management | Must | Existing | `src/modules/finance/pages/LedgerRegistrationPage.vue` |
| FR-131 | Account registration (sub-ledger) | Must | Existing | `AccountRegistrationPage.vue` |
| FR-132 | Pay Voucher (expense/payment entry) | Must | Existing | `PayVoucherPage.vue` |
| FR-133 | Received Voucher (income entry) | Must | Existing | `ReceivedVoucherPage.vue` |
| FR-134 | Voucher approval workflow | Must | Existing | `VoucherApprovalPage.vue` |
| FR-135 | Cashbook (daily cash tracking) | Must | Existing | `CashbookPage.vue` |
| FR-136 | Petty cash book | Should | Existing | `PettyCashBookPage.vue` |
| FR-137 | Cheque management / PDC | Should | Existing | `ChequePlanPage.vue` |
| FR-138 | Bank reconciliation | Must | Existing | `BankReconciliationPage.vue` |
| FR-139 | Fiscal period management | Must | Existing | `FiscalPeriodsPage.vue` |
| FR-140 | Financial statements (P&L, Balance Sheet, Trial Balance) | Must | Existing | `FinancialStatementsPage.vue` |
| FR-141 | Auto journal entry on order payment | Must | Existing | `finance_integration.sql` |
| FR-142 | Auto journal entry on GRN posting | Must | Existing | `fix_grn_posting.sql` |
| FR-143 | Journal immutability (posted vouchers cannot be edited) | Must | Existing | `fix_journal_immutability.sql` |
| FR-144 | Receivables management | Should | Existing | `ReceivablesPage.vue` |
| FR-145 | Payables management | Should | Existing | `PayablesPage.vue` |
| FR-146 | Expense management | Must | Existing | `ExpensesPage.vue` |
| FR-147 | Tax computation and reporting | Must | Existing | `TaxPage.vue` |
| FR-148 | POS shift reconciliation | Must | Existing | `PosShiftsPage.vue` |
| FR-149 | Payroll integration (auto-post payroll journal) | Must | Existing | `fix_payroll_finance_post.sql` |
| FR-150 | Finance audit trail | Must | Existing | `FinanceAuditPage.vue` |
| FR-151 | Multi-currency support | Could | Missing | No currency table or FX rate found |
| FR-152 | Budget management module | Could | Missing | |

---

## 12. Module 11 — HR & Payroll

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-160 | Employee CRUD (personal, contact, employment details) | Must | Existing | `EmployeesPage.vue` |
| FR-161 | Department management | Must | Existing | `DepartmentsPage.vue` |
| FR-162 | Attendance tracking (biometric + manual) | Must | Existing | `AttendancePage.vue`, `biometric_integration.sql` |
| FR-163 | Shift management and assignment | Must | Existing | `ShiftManagementPage.vue` |
| FR-164 | Leave management (apply, approve, balance) | Must | Existing | `LeaveManagementPage.vue`, `leave_management.sql` |
| FR-165 | Payroll calculation (salary + allowances + deductions) | Must | Existing | `PayrollPage.vue`, `payroll_engine.sql` |
| FR-166 | Salary structure configuration | Must | Existing | `SalaryStructurePage.vue` |
| FR-167 | Payslip generation and PDF export | Must | Partial | `PayslipsPage.vue` — PDF export missing |
| FR-168 | Commission tracking for waiters | Should | Existing | `CommissionPage.vue` |
| FR-169 | Performance management | Could | Partial | `PerformancePage.vue` — basic ratings only |
| FR-170 | Resignation / offboarding workflow | Should | Existing | `ResignationPage.vue` |
| FR-171 | Employee document management | Should | Existing | `DocumentManagementPage.vue` |
| FR-172 | Employee advances and expense claims | Should | Existing | `employee_advances_expenses.sql` |
| FR-173 | Salary audit trail | Must | Existing | `SalaryAuditPage.vue` |
| FR-174 | Waiter setup (PIN, table assignments) | Should | Existing | `WaiterSetupPage.vue` |
| FR-175 | Biometric device sync for attendance | Should | Partial | `BiometricDevicesPage.vue` — hardware sync partial |

---

## 13. Module 12 — CRM / Customers

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-180 | Customer profile management | Must | Existing | `CustomersPage.vue`, `CustomerDetailPage.vue` |
| FR-181 | Customer order history | Must | Existing | `CustomerOrderHistory.vue` |
| FR-182 | Loyalty program — earn points on purchase | Must | Existing | `customer_loyalty_system.sql` |
| FR-183 | Loyalty point redemption at POS | Must | Existing | `crm.loyalty.redeem` permission; POS integration partial |
| FR-184 | Loyalty tier management | Should | Existing | `LoyaltyMembersPage.vue` |
| FR-185 | Loyalty earning rules configuration | Should | Existing | `EarningRulesPage.vue` |
| FR-186 | Customer segmentation | Could | Missing | |
| FR-187 | Marketing campaigns / promotions | Could | Missing | |
| FR-188 | Customer feedback collection | Could | Missing | |
| FR-189 | QR-based customer self-registration | Must | Existing | `CustomerAuthPage.vue` |

---

## 14. Module 13 — Reports

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-190 | Sales report (by date, branch, item) | Must | Existing | `SalesReport.vue` |
| FR-191 | Item-wise sales | Must | Existing | `ItemWiseSale.vue` |
| FR-192 | Category-wise sales | Must | Existing | `CategoryWiseSales.vue` |
| FR-193 | Waiter-wise sales | Should | Existing | `WaiterWiseSale.vue` |
| FR-194 | Table-wise sales | Should | Existing | `TableWiseSale.vue` |
| FR-195 | Hourly sales | Should | Existing | `HourlySalesReport.vue` |
| FR-196 | Branch-wise sales | Must | Existing | `BranchWiseSales.vue` |
| FR-197 | Payment method summary | Must | Existing | `PaymentMethodSummary.vue` |
| FR-198 | Daily cash summary | Must | Existing | `DailyCashSummary.vue` |
| FR-199 | Discount report | Should | Existing | `DiscountReport.vue` |
| FR-200 | Refund report | Should | Existing | `RefundReport.vue` |
| FR-201 | Revenue summary | Must | Existing | `RevenueSummary.vue` |
| FR-202 | Delivery performance report | Should | Existing | `DeliveryPerformanceReport.vue` |
| FR-203 | Stock on hand | Must | Existing | `StockOnHand.vue` |
| FR-204 | Inventory ledger | Should | Existing | `InventoryLedger.vue` |
| FR-205 | Purchase summary | Must | Existing | `PurchaseSummary.vue` |
| FR-206 | GRN report | Should | Existing | `GRNReport.vue` |
| FR-207 | Expense summary | Should | Existing | `ExpenseSummary.vue` |
| FR-208 | Tax summary | Must | Existing | `TaxSummaryReport.vue` |
| FR-209 | Staff sales performance | Should | Existing | `StaffSalesPerformance.vue` |
| FR-210 | Cashier performance | Should | Existing | `CashierPerformance.vue` |
| FR-211 | Rider performance | Should | Existing | `RiderPerformanceReport.vue` |
| FR-212 | Reports export to PDF/Excel | Must | Missing | No PDF/Excel export across all reports |
| FR-213 | Scheduled report email delivery | Could | Missing | |
| FR-214 | Electronic journal | Should | Existing | `ElectronicJournal.vue` |
| FR-215 | User activity log | Must | Existing | `UserActivityLog.vue` |

---

## 15. Module 14 — Website Management

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-220 | Website message inbox | Should | Existing | `WebsiteMessagesPage.vue` |
| FR-221 | Online reservation management | Must | Existing | `WebsiteReservationsPage.vue` |
| FR-222 | Hall/event booking management | Should | Existing | `WebsiteHallBookingsPage.vue` |
| FR-223 | Website dashboard overview | Should | Existing | `WebsiteDashboard.vue` |
| FR-224 | Menu publishing for website | Could | Missing | No menu → website publish pipeline |
| FR-225 | SEO/content management | Won't | Missing | Out of scope |

---

## 16. Module 15 — Online Ordering (QR / Kiosk)

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-230 | QR code scan → session creation | Must | Existing | `QrEntryPage.vue`, `get_or_create_session_by_qr` RPC |
| FR-231 | Customer self-registration via QR | Must | Existing | `CustomerAuthPage.vue` |
| FR-232 | Touch-screen menu (tablet kiosk) | Must | Existing | `MenuBookTablet.vue` |
| FR-233 | Customer places order from kiosk | Must | Existing | `create_kiosk_order` RPC |
| FR-234 | Real-time order status tracking for customer | Should | Existing | `OrderTrackingPage.vue` |
| FR-235 | Customer menu page (online ordering) | Should | Existing | `CustomerMenuPage.vue` |
| FR-236 | Loyalty point display for logged-in customer | Should | Partial | |
| FR-237 | Payment gateway integration for online orders | Must | Missing | No online payment gateway found |
| FR-238 | QR base URL configurable per deployment | Must | Existing | `localStorage.getItem('sw_qr_base_url')` override |

---

## 17. Module 16 — Delivery

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-240 | Delivery assignment to rider | Must | Existing | `delivery_assignments_migration.sql` |
| FR-241 | Rider accepts assignment on mobile PWA | Must | Existing | `DeliveryActivePage.vue` |
| FR-242 | Rider marks order as picked up | Must | Existing | `markPickedUp()` in `deliveryStore` |
| FR-243 | Rider marks order as delivered | Must | Existing | `markDelivered()` in `deliveryStore` |
| FR-244 | Delivery history for rider | Should | Existing | `DeliveryHistoryPage.vue` |
| FR-245 | Delivery fee calculation | Should | Existing | `deliveryCharge` in orderStore |
| FR-246 | Multiple delivery source tracking (Uber, PickMe, Website) | Should | Existing | `delivery_source` column on orders |
| FR-247 | Real-time GPS tracking of rider | Could | Missing | No GPS/location implementation |
| FR-248 | Delivery zone management | Could | Missing | |
| FR-249 | Rider performance reports | Should | Existing | `RiderPerformanceReport.vue` |
| FR-250 | Pickup/delivery summary report | Should | Existing | `PickupDeliverySummary.vue` |

---

## 18. Module 17 — Notifications

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-260 | In-app notifications for new orders (waiters) | Must | Existing | `notifications.sql`, `notificationStore` |
| FR-261 | Waiter notification page | Should | Existing | `NotificationsPage.vue` |
| FR-262 | Push notifications (PWA) | Should | Missing | Service worker exists but push not wired |
| FR-263 | Email notifications (order confirm, reservation) | Should | Missing | No email service found |
| FR-264 | SMS notifications | Could | Missing | |
| FR-265 | Notification read/unread state | Should | Existing | |
| FR-266 | Notification cleanup on logout | Must | Existing | `notifStore.cleanup()` in `auth.ts:601` |

---

## 19. Module 18 — Settings & Configuration

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-270 | System settings (company info, logo, currency) | Must | Existing | `SettingsPage.vue` |
| FR-271 | Branch configuration | Must | Existing | `BranchesPage.vue` |
| FR-272 | Kitchen station setup | Must | Existing | Kitchens managed via admin |
| FR-273 | Menu items and categories CRUD | Must | Existing | `menu_management.sql` |
| FR-274 | Printer/device configuration | Must | Existing | `PrintersPage.vue` |
| FR-275 | Payment method configuration | Must | Partial | Payment methods configurable; per-branch not clear |
| FR-276 | Service charge configuration (currently hardcoded 10%) | Must | Buggy | `src/stores/orderStore.js:50` — hardcoded, not configurable |
| FR-277 | Tax configuration | Must | Existing | `TaxPage.vue` |
| FR-278 | System module enable/disable per company | Should | Existing | `system_modules.sql`, `useModulesStore` |
| FR-279 | QR base URL configuration | Should | Existing | `localStorage('sw_qr_base_url')` |

---

## 20. Module 19 — Audit Logs

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-280 | Login audit logs (who, when, device, IP) | Must | Existing | `login_audit_logs` table + `writeLoginAudit()` |
| FR-281 | Audit center for admin | Must | Existing | `AuditCenterPage.vue` |
| FR-282 | Order modification audit trail | Must | Partial | Order status triggers log; item edits not tracked |
| FR-283 | Finance journal audit (immutable) | Must | Existing | `fix_journal_immutability.sql` |
| FR-284 | User activity log report | Should | Existing | `UserActivityLog.vue` |
| FR-285 | Inventory adjustment audit | Should | Existing | `InventoryAdjustmentLog.vue` |
| FR-286 | Price change audit log | Should | Existing | `PriceChangeLog.vue` |
| FR-287 | Failed login attempts log | Should | Partial | In-memory rate limiter; not persisted to DB |
| FR-288 | Data export/purge audit | Could | Missing | |

---

## 21. Module 20 — Administration

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-290 | User management (create, edit, disable) | Must | Existing | `UsersPage.vue` |
| FR-291 | Role assignment to users | Must | Existing | `RolesPage.vue` |
| FR-292 | Branch assignment to users | Must | Existing | `branch_users` table |
| FR-293 | Permission override per user | Should | Existing | `user_permissions` table |
| FR-294 | Admin system dashboard (DB stats, health) | Should | Existing | `SystemDashboard.vue` |
| FR-295 | Multi-company support | Could | Partial | `company_id` on most tables; admin UI single-company |
| FR-296 | Data backup / restore (admin) | Could | Missing | Relies on Supabase automatic backups |
| FR-297 | API key management for integrations | Could | Missing | |

---

## 22. Module 21 — AI Intelligence (Bonus)

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-300 | AI sales forecast | Should | Existing | `AiForecastPage.vue`, Google Gemini integration |
| FR-301 | Anomaly detection (sales, inventory) | Should | Existing | `AiAnomalyCenterPage.vue` |
| FR-302 | AI assistant chatbot | Could | Existing | `AiAssistantPage.vue` |
| FR-303 | AI recommendation panel | Could | Existing | `AiRecommendationList.vue` |
| FR-304 | AI insights cards on dashboard | Could | Existing | `AiInsightCard.vue` |

---

## 23. Module 22 — Device Management

| ID | Requirement | Priority | Status | Notes |
|----|------------|----------|--------|-------|
| FR-310 | Printer management (ESC/POS, network printers) | Must | Existing | `PrinterManagementPage.vue` |
| FR-311 | Barcode scanner management | Should | Existing | `ScannerManagementPage.vue` |
| FR-312 | Biometric device management | Should | Existing | `BiometricDevicesPage.vue` |
| FR-313 | Device health monitoring | Should | Existing | `DeviceHealthPage.vue` |
| FR-314 | QR scanner component | Should | Existing | `QRScanner.vue` |
| FR-315 | Cash drawer integration | Should | Partial | `useCashDrawer.js` composable; hardware trigger incomplete |
| FR-316 | Receipt template configuration | Should | Existing | `receipt.template.js` |

---

## 24. Summary of Gaps

### Critical Missing Features (Must / Should)
1. **FR-237** — Online payment gateway for kiosk/QR orders
2. **FR-212** — Report export to PDF/Excel
3. **FR-262** — PWA push notifications
4. **FR-263** — Email notifications
5. **FR-023** — Split bill
6. **FR-024** — Graphical table map in POS
7. **FR-247** — Rider GPS tracking

### Critical Bugs
1. **FR-027** — Order number collision (`src/stores/orderStore.js:359`)
2. **FR-276** — Service charge hardcoded at 10% (`src/stores/orderStore.js:50`)
3. **FR-022** — Void order UI incomplete
4. **FR-167** — Payslip PDF export missing
5. **FR-183** — Loyalty redemption at POS only partially wired
