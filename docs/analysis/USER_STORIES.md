# User Stories
## Seven Waves Restaurant ERP
**Version:** 1.0 | **Date:** 2026-07-16 | **Author:** Analyst Agent

Story points use Fibonacci scale: 1, 2, 3, 5, 8, 13, 21

---

## Epic 01 — Dashboard

**Goal:** Provide at-a-glance operational visibility for managers and admins.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-001 | As a **manager**, I want to see today's revenue KPI on login, so that I can assess daily performance immediately. | Dashboard shows total revenue for current day, orders count, and trend vs yesterday | 3 |
| US-002 | As an **admin**, I want to compare revenue across branches on one screen, so that I can identify underperforming locations. | Multi-branch comparison widget with bar chart; filters by date range | 8 |
| US-003 | As a **manager**, I want to see low-stock alerts on the dashboard, so that I can avoid menu item stockouts. | Alert panel lists items below reorder level; links to inventory module | 5 |
| US-004 | As a **manager**, I want to see who is currently on shift, so that I can plan staffing. | Active staff list with role and shift start time | 3 |
| US-005 | As an **admin**, I want to see system health status (DB, realtime, sync), so that I can proactively address issues. | Health widget shows green/amber/red per service | 5 |

---

## Epic 02 — POS (Point of Sale)

**Goal:** Enable fast, accurate order taking and payment collection.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-010 | As a **cashier**, I want to browse menu items by category with search, so that I can add items to the cart quickly. | Category tabs, search bar, item grid with image and price | 3 |
| US-011 | As a **cashier**, I want to set a customer's order type (dine-in, takeaway, delivery), so that the system applies the correct charges. | Order type toggle; service charge auto-applies for dine-in | 2 |
| US-012 | As a **cashier**, I want to apply a discount percentage to an order, so that I can honour promotions. | Discount field; discount amount shown in total; logged in order | 3 |
| US-013 | As a **cashier**, I want to park an order and continue later, so that I can handle multiple customers simultaneously. | Park saves cart; parked orders list shown; recall restores full cart | 5 |
| US-014 | As a **cashier**, I want to process Quick Pay (create + pay immediately), so that takeaway customers don't wait for a waiter. | One-button payment flow; KOTs generated; receipt printed | 8 |
| US-015 | As a **cashier**, I want to void an order with a reason code, so that mistakes are tracked in the audit log. | Void requires reason selection; logs to audit; reverses stock/finance | 8 |
| US-016 | As a **cashier**, I want to scan a barcode to add an item, so that entry is faster for packaged products. | USB/Bluetooth scanner input triggers item lookup by barcode | 5 |
| US-017 | As a **cashier**, I want to split a bill between multiple customers, so that groups can pay separately. | Split by item or equal split; generates separate payment records | 13 |
| US-018 | As a **cashier**, I want to see a graphical table map to select the table, so that I don't type wrong table numbers. | Floor plan grid; occupied tables highlighted; click to select | 8 |
| US-019 | As a **waiter**, I want to add per-item notes (allergy, cooking preference), so that the kitchen gets accurate instructions. | Notes field per cart item; displayed on KOT | 2 |

---

## Epic 03 — Kitchen Display System

**Goal:** Enable kitchen staff to receive, manage, and complete orders efficiently.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-020 | As a **kitchen staff**, I want to see new KOT tickets appear in real-time, so that I start cooking without delay. | New KOT appears within 1 second of waiter acceptance; audio alert fires | 3 |
| US-021 | As a **kitchen staff**, I want to mark a KOT as "preparing", so that others know it's in progress. | Status changes from new → preparing; timestamp recorded | 2 |
| US-022 | As a **kitchen staff**, I want to mark a KOT as "ready", so that waiters are notified to pick up the order. | Status changes to ready; waiter gets in-app alert | 2 |
| US-023 | As a **kitchen manager**, I want to see only my station's KOTs, so that I'm not distracted by other kitchens. | KDS filters by kitchen_id from user profile; selector for multi-kitchen managers | 3 |
| US-024 | As a **kitchen staff**, I want to see per-item preparation notes, so that I accommodate special requests. | Item notes visible on KOT card | 1 |
| US-025 | As a **kitchen manager**, I want KOTs colour-coded by wait time, so that I can prioritise delayed orders. | Green < 5 min, amber 5–10 min, red > 10 min | 5 |

---

## Epic 04 — Orders Management

**Goal:** Provide full order lifecycle visibility and management for staff.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-030 | As a **manager**, I want to filter orders by date, status, and branch, so that I can monitor service quality. | Multi-filter panel; orders table refreshes on filter change | 5 |
| US-031 | As a **waiter**, I want to see unaccepted orders in my inbox, so that I can act on them promptly. | Shift inbox shows only pending_waiter orders for waiter's branch + shift | 5 |
| US-032 | As a **waiter**, I want to accept an order and mark unavailable items, so that customers are informed quickly. | Accept RPC with unavailable_ids list; order status → accepted; KOTs generated | 8 |
| US-033 | As a **customer**, I want to track my order status in real-time, so that I know when to expect my food. | Order tracking page updates status automatically | 5 |
| US-034 | As a **manager**, I want to export order data to Excel, so that I can do offline analysis. | Export button generates CSV/XLSX with selected date range | 5 |

---

## Epic 05 — Table Management

**Goal:** Enable accurate table status tracking and QR ordering.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-040 | As an **admin**, I want to create and configure restaurant tables with sections, so that the floor plan is accurately represented. | Table CRUD with number, section, capacity; validates uniqueness per branch | 3 |
| US-041 | As a **manager**, I want to generate a QR code per table, so that customers can self-order. | QR link opens `/c/{token}`; token maps to table in DB | 5 |
| US-042 | As a **manager**, I want to see table statuses on a floor plan, so that I can manage seating efficiently. | Colour-coded grid: green=available, red=occupied, yellow=reserved | 5 |
| US-043 | As a **waiter**, I want to transfer an order to a different table, so that groups can move seats. | Table transfer reassigns order; old table freed; new table marked occupied | 8 |
| US-044 | As an **admin**, I want to merge two tables for large groups, so that capacity is tracked accurately. | Merge creates a combined table session; items aggregated | 8 |

---

## Epic 06 — Reservations

**Goal:** Manage bookings and walk-ins efficiently.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-050 | As a **customer**, I want to make an online reservation, so that my table is ready on arrival. | Reservation form on website; confirmation email sent | 8 |
| US-051 | As a **manager**, I want to confirm or reject a reservation, so that table capacity is not over-committed. | Confirm/reject button; customer notified; table locked | 5 |
| US-052 | As a **manager**, I want to see today's reservations calendar view, so that I can plan table assignments. | Calendar/list view with time slots; filter by date | 5 |
| US-053 | As a **customer**, I want to book a hall for an event, so that private dining is arranged. | Hall booking form with date, time, number of guests, menu preferences | 8 |

---

## Epic 07 — Inventory

**Goal:** Maintain accurate stock levels and prevent stockouts.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-060 | As an **inventory manager**, I want to receive stock from a GRN and update quantities automatically, so that stock is always current. | GRN posting triggers stock increase; audit log entry created | 5 |
| US-061 | As an **inventory manager**, I want to perform a physical stock count and reconcile with system quantities, so that discrepancies are identified. | Stock take entry with physical count; variance calculated; approved by manager | 8 |
| US-062 | As a **manager**, I want to be alerted when stock falls below reorder level, so that I can raise a purchase order. | Alert on dashboard + email when stock < reorder_level | 5 |
| US-063 | As an **inventory manager**, I want to record wastage with a reason, so that shrinkage is tracked. | Wastage entry reduces stock; reason code required | 3 |
| US-064 | As an **inventory manager**, I want to adjust stock manually with a reason code, so that corrections are auditable. | Adjustment with reason code; logged to `InventoryAdjustmentLog` | 3 |

---

## Epic 08 — Procurement

**Goal:** Streamline supplier management and purchasing.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-070 | As a **procurement officer**, I want to create a purchase order to a supplier, so that stock is replenished. | PO with line items, quantities, and unit prices; sent to supplier | 5 |
| US-071 | As a **manager**, I want to approve a purchase order, so that spending is controlled. | Approval workflow with approval limit thresholds | 8 |
| US-072 | As an **inventory manager**, I want to receive goods against a PO via GRN, so that stock is updated. | GRN records received quantities; auto-posts finance entry | 5 |
| US-073 | As a **finance officer**, I want to record supplier payments against AP invoices, so that payables are cleared. | Payment entry links to AP invoice; updates outstanding balance | 5 |
| US-074 | As a **manager**, I want to see outstanding purchase orders and their delivery status, so that I can follow up with suppliers. | PO list with expected delivery date and status | 3 |

---

## Epic 09 — Recipe / BOM

**Goal:** Accurate cost tracking and auto-stock deduction via recipes.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-080 | As a **chef/manager**, I want to define a recipe for each menu item, so that ingredient costs are tracked. | BOM editor with ingredients, quantities, and units | 5 |
| US-081 | As a **manager**, I want the system to auto-deduct ingredients when an order is paid, so that stock is accurate. | Stock deduction triggered by `process_cashier_payment` RPC | 3 |
| US-082 | As a **manager**, I want to see theoretical vs. actual ingredient consumption, so that wastage or theft is identified. | Variance report comparing BOM-predicted consumption vs. actual stock movement | 5 |

---

## Epic 10 — Finance

**Goal:** Complete ERP-grade double-entry accounting.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-090 | As a **finance officer**, I want to record a payment voucher, so that expenses are tracked in the ledger. | Voucher with account, amount, description; requires approval | 5 |
| US-091 | As a **finance manager**, I want to approve vouchers before posting, so that unauthorized payments are prevented. | Approval queue; posted vouchers become immutable | 5 |
| US-092 | As a **finance officer**, I want to reconcile the bank statement, so that the cashbook matches the bank. | Bank reconciliation page with unmatched transactions highlighted | 8 |
| US-093 | As a **CFO/admin**, I want to generate a P&L statement, so that financial performance is visible. | P&L grouped by income/expense accounts; filterable by date and branch | 8 |
| US-094 | As a **finance officer**, I want order payments to auto-post journal entries, so that double-entry is maintained without manual work. | Finance integration RPC auto-creates debit/credit entries on payment | 5 |
| US-095 | As a **finance officer**, I want to manage payroll and auto-post salary journals, so that HR and finance stay in sync. | Payroll run creates journal entries for salary, EPF, ETF | 8 |

---

## Epic 11 — HR & Payroll

**Goal:** Manage the full employee lifecycle.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-100 | As an **HR officer**, I want to onboard a new employee with all details, so that they are ready to work. | Employee creation with personal, contact, employment fields; department assignment | 5 |
| US-101 | As an **HR officer**, I want to record daily attendance (biometric or manual), so that payroll is accurate. | Attendance page with date, in/out times; biometric sync import | 5 |
| US-102 | As an **employee**, I want to apply for leave online, so that my absence is approved through a formal process. | Leave application form; manager approval; balance deducted | 5 |
| US-103 | As an **HR manager**, I want to run payroll for all employees in a period, so that salaries are calculated and disbursed. | Payroll run with base salary, allowances, deductions; payslip generated | 8 |
| US-104 | As an **employee**, I want to download my payslip as PDF, so that I have a formal record. | Payslip PDF export from PayslipsPage | 5 |
| US-105 | As an **HR manager**, I want to track commissions for waiters, so that performance-based pay is accurate. | Commission calculation based on sales; linked to payroll run | 5 |

---

## Epic 12 — CRM / Customers

**Goal:** Build customer relationships and loyalty.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-110 | As a **manager**, I want to view a customer's full order history, so that I can personalize service. | Customer profile with all past orders, total spend, visit frequency | 3 |
| US-111 | As a **cashier**, I want to look up a customer by phone and apply their loyalty points, so that they are rewarded at POS. | Customer lookup by phone; loyalty balance shown; redemption deducted from total | 8 |
| US-112 | As a **manager**, I want to configure loyalty earning rules (e.g., 1 point per 100 LKR), so that the program is flexible. | Earning rules CRUD; applies to new transactions | 5 |
| US-113 | As a **customer**, I want to self-register via QR scan, so that I join the loyalty program without staff assistance. | QR → registration form → loyalty account created | 5 |

---

## Epic 13 — Reports

**Goal:** Data-driven decision making for all roles.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-120 | As a **manager**, I want to view item-wise sales for any date range, so that I can identify best sellers. | Date range filter; sortable by quantity sold or revenue | 3 |
| US-121 | As a **finance officer**, I want to export any report to Excel, so that I can present it to management. | Export button on all report pages; generates .xlsx | 8 |
| US-122 | As an **admin**, I want to schedule daily reports by email, so that stakeholders get updates automatically. | Schedule config per report; email delivery via SendGrid/SES | 13 |
| US-123 | As a **manager**, I want to see cashier performance (orders processed, average transaction value), so that I can evaluate staff. | Cashier performance report with totals and rankings | 3 |

---

## Epic 14 — Website Module

**Goal:** Connect the ERP to the restaurant's public web presence.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-130 | As a **manager**, I want to view messages sent from the website contact form, so that inquiries are responded to. | Message inbox with read/unread; reply not yet in scope | 3 |
| US-131 | As a **manager**, I want to manage hall bookings from the website, so that events are coordinated. | Hall booking list with confirm/reject; capacity check | 5 |

---

## Epic 15 — Online Ordering (QR / Kiosk)

**Goal:** Enable customers to self-order.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-140 | As a **customer**, I want to scan a table QR code and see the menu, so that I can order without waiting for a waiter. | QR → session → menu loaded; add to cart; submit | 5 |
| US-141 | As a **customer**, I want to pay online for my kiosk order, so that I don't need to wait for the bill. | Payment gateway integration (PayHere/Stripe); payment confirmation webhook | 13 |
| US-142 | As a **customer**, I want to track my kiosk order status, so that I know when it's ready. | Order status page with live updates | 5 |

---

## Epic 16 — Delivery

**Goal:** Manage last-mile delivery efficiently.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-150 | As a **delivery rider**, I want to see available delivery assignments on my mobile, so that I can accept jobs. | Rider PWA shows pending assignments with address and order details | 5 |
| US-151 | As a **rider**, I want to mark an order as picked up and delivered, so that the status is updated for the customer. | Status buttons on DeliveryActivePage; updates order status | 3 |
| US-152 | As a **manager**, I want to track which rider has which delivery, so that I can manage the delivery queue. | Delivery assignment dashboard with rider-order mapping | 5 |
| US-153 | As a **manager**, I want to see delivery performance reports (time, success rate), so that I can optimize routing. | Delivery performance report with averages | 3 |

---

## Epic 17 — Notifications

**Goal:** Keep staff informed in real-time.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-160 | As a **waiter**, I want to receive an in-app alert for new orders on my shift, so that I respond quickly. | Realtime notification on ShiftInboxPage; badge counter | 3 |
| US-161 | As a **manager**, I want to receive push notifications for critical alerts (low stock, system error), so that I act immediately even when not in the app. | PWA push notification via service worker | 8 |
| US-162 | As a **customer**, I want to receive an email when my reservation is confirmed, so that I have a reference. | Email via SendGrid/SES on reservation confirm | 8 |

---

## Epic 18 — Settings

**Goal:** Allow admins to configure the system without code changes.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-170 | As an **admin**, I want to configure the service charge percentage per order type, so that it's not hardcoded. | Service charge configurable in settings; stored in DB; applied at order creation | 5 |
| US-171 | As an **admin**, I want to enable/disable modules per company, so that the system is customizable. | Module toggle in settings; disabled modules hidden from navigation | 5 |
| US-172 | As an **admin**, I want to configure payment methods (Cash, Card, Digital Wallet), so that the cashier sees the correct options. | Payment method CRUD; per-branch configuration | 3 |

---

## Epic 19 — Audit Logs

**Goal:** Ensure accountability and compliance.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-180 | As an **admin**, I want to see a log of all logins with device and IP, so that unauthorized access is detected. | Login audit log with user, timestamp, device, browser, OS | 3 |
| US-181 | As an **admin**, I want to view all order voids with the reason and user, so that suspicious activity is tracked. | Void report filtered by date and user | 3 |
| US-182 | As an **admin**, I want failed login attempts to be persisted and visible, so that brute-force attempts are detectable. | Failed attempts stored in DB (currently only in memory) | 5 |

---

## Epic 20 — Administration

**Goal:** Full system control for superadmin.

| ID | User Story | Acceptance Criteria | SP |
|----|-----------|--------------------|----|
| US-190 | As an **admin**, I want to create and manage user accounts with role assignments, so that access control is maintained. | User CRUD; role assignment; branch assignment; account activation/deactivation | 5 |
| US-191 | As an **admin**, I want to create and configure branches, so that the multi-location setup is accurate. | Branch CRUD; company assignment; branch activation toggle | 3 |
| US-192 | As a **super admin**, I want to create new companies in the system, so that the platform is multi-tenant. | Company CRUD; admin user auto-created; modules activated | 8 |
