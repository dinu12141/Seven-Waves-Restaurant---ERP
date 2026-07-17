# Screen Flows — Seven Waves Restaurant ERP

> Covers all 20 modules. Each section includes screen inventory, key actions, responsive behavior, and ASCII wireframes for complex screens.

---

## Module 1: Dashboard

**Route:** `/dashboard`  
**Layout:** MainLayout  
**Roles:** All authenticated users

### Screens

| Screen         | Route        | Description                    |
| -------------- | ------------ | ------------------------------ |
| Main Dashboard | `/dashboard` | KPI cards, charts, quick links |

### Key UI Elements

- KPI cards: Revenue Today, Orders Count, Active Tables, Staff On Shift
- Revenue chart (line/bar)
- Recent Orders table
- Quick action buttons (New Order, New Reservation)
- Branch switcher (admin/manager)

### Responsive Behavior

- Desktop: 4-column KPI grid, side-by-side chart + table
- Tablet: 2-column KPI grid, stacked chart then table
- Mobile: 1-column KPI list (not applicable — dashboard only in MainLayout which is desktop-first)

### ASCII Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│ [☰] SEVEN WAVES   [🔍 Global Search...]   [Branch] [🌙] [🔔] [AB] │
│ MAIN  OPERATIONS  INVENTORY  FINANCE  HR  REPORTS  SYSTEM           │
├─────────────────────────────────────────────────────────────────────┤
│          │                                                           │
│ OVERVIEW │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│  ·Dashboard│  │💰     │ │🛒     │ │🪑     │ │👥     │                   │
│ OPERATIONS│  │ SAR   │ │ 47   │ │ 12   │ │ 8    │                   │
│  ·POS     │  │12,450 │ │Orders│ │Tables│ │Staff │                   │
│  ·KDS     │  │+12% ↑ │ │today │ │Occp. │ │onShft│                   │
│  ·Tables  │  └──────┘ └──────┘ └──────┘ └──────┘                   │
│           │                                                           │
│           │  ┌─────────────────────────┐ ┌───────────────────────┐  │
│           │  │ Revenue (7 days)        │ │ Recent Orders         │  │
│           │  │ [Line chart]            │ │ #1042  T5  SAR 145  ✓ │  │
│           │  │                         │ │ #1041  T3  SAR 230  ⏳│  │
│           │  └─────────────────────────┘ │ #1040  T8  SAR 89   🍳│  │
│           │                              └───────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Module 2: POS (Point of Sale)

**Route:** `/pos`  
**Layout:** MainLayout (sidebar hidden in POS mode)  
**Roles:** cashier, waiter, admin

### Screens

| Screen         | Route     | Description                        |
| -------------- | --------- | ---------------------------------- |
| POS Main       | `/pos`    | Split-panel: menu left, cart right |
| Lock Screen    | (overlay) | POSLockScreen component when idle  |
| Payment Dialog | (modal)   | PaymentDialog component            |
| Billing Queue  | (panel)   | BillingQueue sidebar               |

### Key UI Elements

- Category filter tabs (top)
- Menu item grid (MenuItemCard components — large tap targets)
- Order cart (right panel) with quantity controls
- Payment button (large, color-coded)
- Table/customer selector
- Order notes field

### Responsive Behavior

- Desktop: Side-by-side (menu 60%, cart 40%)
- Tablet: Collapsed cart (drawer), menu full-width
- Mobile: Not intended for mobile (waiter-app POS handles mobile)

### ASCII Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│  [⊕ POS]  Cashier Station  ·  Main Branch  ·  Table: 5             │
├───────────────────────────────────────┬─────────────────────────────┤
│  CATEGORY FILTER                      │   ORDER CART                │
│  [🍔 Mains] [🥗 Salads] [🍹 Drinks]  │   Table 5  —  Dine In       │
├───────────────────────────────────────│                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│  Grilled Chicken   ×1  45  │
│  │ 🍔   │ │ 🍕   │ │ 🥩   │ │ 🐟   ││  Fish & Chips      ×2  90  │
│  │Burger│ │Pizza │ │Steak │ │Fish  ││  Pepsi             ×1  10  │
│  │SAR 45│ │SAR 55│ │SAR 95│ │SAR 65││  ─────────────────────────│
│  └──────┘ └──────┘ └──────┘ └──────┘│  Subtotal:       SAR 145  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐│  VAT (15%):       SAR 22  │
│  │ 🍗   │ │ 🥙   │ │ 🍜   │ │ 🍣   ││  TOTAL:          SAR 167  │
│  │ChknGr│ │Wrap  │ │Pasta │ │Sushi ││  ─────────────────────────│
│  │SAR 35│ │SAR 25│ │SAR 40│ │SAR 75││  [🗑 Clear]  [💾 Hold]    │
│  └──────┘ └──────┘ └──────┘ └──────┘│                              │
│                                       │  [💳 CHARGE  SAR 167.00]   │
│  [🔍 Search menu...]                 │                             │
└───────────────────────────────────────┴─────────────────────────────┘
```

---

## Module 3: Kitchen Display (KDS)

**Route:** `/kitchen`  
**Layout:** MainLayout (sidebar hidden in KDS mode — should be dedicated KDS layout)  
**Roles:** kitchen

### Screens

| Screen    | Route      | Description              |
| --------- | ---------- | ------------------------ |
| KDS Board | `/kitchen` | Ticket columns by status |

### Key UI Elements

- KOT ticket cards (large font, dark background)
- Status columns: New → In Progress → Ready
- Item list per ticket with quantity
- Mark Ready button (large, green)
- Elapsed time counter (turns red when overdue)
- Audio alert on new ticket

### Responsive Behavior

- Desktop: 3-column kanban (status columns)
- Large screen (TV/monitor): 4+ columns, font scaled up
- Should be fullscreen (no header/sidebar)

### ASCII Wireframe (Dark Mode — KDS)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🍳 KITCHEN DISPLAY  ·  Main Kitchen  ·  14:32        [🔇 Mute]   │
├──────────────────────┬──────────────────────┬───────────────────────┤
│      🆕 NEW          │    🍳 IN PROGRESS    │      ✅ READY         │
├──────────────────────┼──────────────────────┼───────────────────────┤
│ ┌──────────────────┐ │ ┌──────────────────┐ │ ┌──────────────────┐ │
│ │ #KOT-1042  T-5   │ │ │ #KOT-1040  T-2   │ │ │ #KOT-1038  T-8  │ │
│ │ 00:02 ⏱          │ │ │ 08:45 🔴          │ │ │ READY ✅         │ │
│ │──────────────────│ │ │──────────────────│ │ │──────────────────│ │
│ │ ×2 Burger        │ │ │ ×1 Steak (Med)   │ │ │ ×3 Fish & Chips  │ │
│ │ ×1 Fish & Chips  │ │ │ ×2 Grilled Chkn  │ │ │ ×1 Pasta         │ │
│ │ ×3 Pepsi         │ │ │ NOTE: No onion   │ │ └──────────────────┘ │
│ │                  │ │ │                  │ │                       │
│ │ [▶ START]        │ │ │ [✓ MARK READY]   │ │                       │
│ └──────────────────┘ │ └──────────────────┘ │                       │
│                       │                      │                       │
│ ┌──────────────────┐ │                      │                       │
│ │ #KOT-1043  T-10  │ │                      │                       │
│ │ 00:30 ⏱          │ │                      │                       │
│ │ ×1 Sushi Platter │ │                      │                       │
│ │ [▶ START]        │ │                      │                       │
│ └──────────────────┘ │                      │                       │
└──────────────────────┴──────────────────────┴───────────────────────┘
```

---

## Module 4: Orders

**Route:** `/orders`  
**Layout:** MainLayout  
**Roles:** admin, manager, cashier, waiter

### Screens

| Screen       | Route     | Description                      |
| ------------ | --------- | -------------------------------- |
| Orders List  | `/orders` | Filterable orders table / kanban |
| Order Detail | (modal)   | OrderDetailDialog                |

### Key UI Elements

- Status filter tabs (All, Pending, Accepted, Cooking, Ready, Served, Paid, Cancelled)
- Order kanban cards (OrderKanbanCard)
- Date range filter
- Table/branch filter
- Order detail modal with items, status timeline, payment info

---

## Module 5: Table Management

**Route:** `/tables` (admin) and `/waiter-app/tables` (waiter)  
**Layout:** MainLayout / WaiterAppLayout  
**Roles:** admin, manager, waiter

### Screens

| Screen               | Route                | Description                  |
| -------------------- | -------------------- | ---------------------------- |
| Tables Admin         | `/admin/tables`      | CRUD for table configuration |
| Floor View (Manager) | `/manager-app/floor` | Manager PWA floor overview   |
| Waiter Tables        | `/waiter-app/tables` | Waiter's table status view   |

### Key UI Elements

- Floor plan grid (table cards with status colors)
- Table status: Available (green), Occupied (red), Reserved (amber), Needs Cleaning (grey)
- QR code display and print per table

---

## Module 6: Reservations

**Route:** `/website-orders/reservations`  
**Layout:** MainLayout  
**Roles:** admin, manager

### Screens

| Screen           | Route                           | Description             |
| ---------------- | ------------------------------- | ----------------------- |
| Reservation List | `/website-orders/reservations`  | WebsiteReservationsPage |
| Hall Bookings    | `/website-orders/hall-bookings` | WebsiteHallBookingsPage |

### Missing Screens

- Calendar view for reservations (show availability)
- Customer-facing reservation booking page
- SMS/email confirmation flow

---

## Module 7: Inventory

**Route:** `/inventory`  
**Layout:** MainLayout  
**Roles:** admin, manager, inventory

### Screens

| Screen              | Route        | Description                  |
| ------------------- | ------------ | ---------------------------- |
| Inventory Dashboard | `/inventory` | InventoryDashboard with tabs |

### Key Tabs (on InventoryDashboard)

1. **Dashboard** — Stock alerts, low-stock items, movements
2. **Items** — Master item list (ItemsTab)
3. **Stock Levels** — Per-warehouse stock (StockLevelsTab)
4. **Stock Ledger** — Movement history (StockLedgerTab)
5. **Documents** — GRN, Transfer, Adjustment docs (DocumentsTab)
6. **Create Document** — New GRN/Transfer/Adjustment (DocumentCreateTab)
7. **Wastage** — WastageTab
8. **Kitchen Mapping** — Item→Kitchen assignment (KitchenMappingTab)
9. **Suppliers** — SuppliersTab
10. **Categories** — CategoryManagementTab
11. **Menu Items** — MenuItemsTab
12. **Recipes** — RecipesTab
13. **Warehouses** — WarehousesTab

---

## Module 8: Procurement

**Route:** `/procurement`  
**Layout:** MainLayout (ProcurementLayout sub-layout)  
**Roles:** admin, procurement

### Screens

| Screen           | Route                   | Description             |
| ---------------- | ----------------------- | ----------------------- |
| Procurement Main | `/procurement`          | Purchase orders, GRNs   |
| Settings         | `/procurement/settings` | ProcurementSettingsPage |

### Key UI Elements

- DocHeader component for PO header
- DocLinesEditor for line items
- AllocationDialog for budget allocation
- PostingBar for document posting
- PrintPODialog for PO print
- SendEmailDialog for emailing supplier

---

## Module 9: Finance

**Route:** `/finance`  
**Layout:** MainLayout (FinanceLayout sub-layout)  
**Roles:** admin, finance

### Screens

| Screen           | Route                       | Description                     |
| ---------------- | --------------------------- | ------------------------------- |
| Finance Home     | `/finance`                  | Overview (likely FinanceLayout) |
| Tax              | `/finance/tax`              | TaxPage                         |
| Payslips         | `/finance/payslips`         | PayslipsPage                    |
| Receivables      | `/finance/receivables`      | ReceivablesPage                 |
| Expenses         | `/finance/expenses`         | ExpensesPage                    |
| Salary Structure | `/finance/salary-structure` | SalaryStructurePage             |
| Payroll Run      | `/finance/payroll-run`      | PayrollRunPage                  |
| Payroll          | `/finance/payroll`          | PayrollPage (finance version)   |

### Key UI Elements (from src/modules/finance/)

- Ledger accounts (chart of accounts)
- Journal entry form
- Trial balance report
- Cash book
- Income statement / Balance sheet

---

## Module 10: HR & Payroll

**Route:** `/hr`  
**Layout:** MainLayout (HRLayout sub-layout)  
**Roles:** admin, hr

### Screens

| Screen            | Route                   | Description              |
| ----------------- | ----------------------- | ------------------------ |
| Employees         | `/hr/employees`         | EmployeesPage with tabs  |
| Attendance        | `/hr/attendance`        | AttendancePage           |
| Departments       | `/hr/departments`       | DepartmentsPage          |
| Shifts            | `/hr/shifts`            | ShiftManagementPage      |
| Payroll           | `/hr/payroll`           | PayrollPage (HR version) |
| Performance       | `/hr/performance`       | PerformancePage          |
| Resignation       | `/hr/resignation`       | ResignationPage          |
| Commission        | `/hr/commission`        | CommissionPage           |
| Salary Config     | `/hr/salary-config`     | SalaryConfigPage         |
| Salary Audit      | `/hr/salary-audit`      | SalaryAuditPage          |
| Document Mgmt     | `/hr/documents`         | DocumentManagementPage   |
| Employee Finances | `/hr/employee-finances` | EmployeeFinancesPage     |
| Waiter Setup      | `/hr/waiter-setup`      | WaiterSetupPage          |

### Key UI Elements (Employee card)

- Premium KPI cards with gradient backgrounds
- EmployeeCard component
- Tabs: Employees, Departments, Shifts, Attendance, Leave, Payroll, Loans
- ShiftScheduler (calendar-based)
- BiometricAttendance integration

---

## Module 11: Customers (CRM)

**Route:** `/admin/customers`  
**Layout:** MainLayout  
**Roles:** admin, manager

### Screens

| Screen            | Route                      | Description               |
| ----------------- | -------------------------- | ------------------------- |
| Customers List    | `/admin/customers`         | CustomerDetailPage list   |
| Customer Detail   | `/admin/customers/:id`     | CustomerDetailPage        |
| Loyalty Customers | `/admin/loyalty-customers` | LoyaltyCustomerDetailPage |
| Loyalty Overview  | `/loyalty`                 | LoyaltyPage               |

---

## Module 12: Reports

**Route:** `/reports`  
**Layout:** MainLayout + ReportsLayout  
**Roles:** admin, manager, finance

### Screen Inventory (25+ reports)

**Sales Reports:**

- `/reports/sales` — Revenue Summary
- `/reports/item-wise-sales` — ItemWiseSale
- `/reports/category-wise-sales` — CategoryWiseSales
- `/reports/table-wise-sales` — TableWiseSale
- `/reports/waiter-wise-sales` — WaiterWiseSale
- `/reports/branch-wise-sales` — BranchWiseSales
- `/reports/hourly-sales` — HourlySalesReport
- `/reports/daily-cash` — DailyCashSummary
- `/reports/payment-methods` — PaymentMethodSummary
- `/reports/group-summary` — GroupSummary
- `/reports/tax-summary` — TaxSummaryReport
- `/reports/discount` — DiscountReport
- `/reports/refund` — RefundReport
- `/reports/cashier-performance` — CashierPerformance
- `/reports/staff-sales` — StaffSalesPerformance

**Kitchen/Order Reports:**

- `/reports/kot-deductions` — KotDeductionLog
- `/reports/kitchen-usage` — DailyKitchenUsage
- `/reports/kitchen-orders` — KitchenOrderReport
- `/reports/order-status` — OrderStatusReport

**Inventory Reports:**

- `/reports/stock-on-hand` — StockOnHand
- `/reports/stock-ledger` — InventoryLedger
- `/reports/inventory-ledger` — InventoryLedger
- `/reports/wastage` — WastageReport
- `/reports/inventory-adjustments` — InventoryAdjustmentLog
- `/reports/ingredient-consumption` — IngredientConsumption
- `/reports/reorder-levels` — ReorderLevelReport
- `/reports/inventory-performance` — InventoryPerformanceReport
- `/reports/price-changes` — PriceChangeLog
- `/reports/item-availability` — ItemAvailabilityReport
- `/reports/purchase-consumption` — PurchaseConsumptionAnalysis

**Purchase Reports:**

- `/reports/purchases` — PurchaseSummary
- `/reports/grn` — GRNReport
- `/reports/supplier-purchases` — SupplierWisePurchases

**Other:**

- `/reports/delivery-performance` — DeliveryPerformanceReport
- `/reports/rider-performance` — RiderPerformanceReport
- `/reports/reservations` — ReservationReport
- `/reports/pickup-delivery` — PickupDeliverySummary
- `/reports/customer-orders` — CustomerOrderHistory
- `/reports/variance` — VarianceReport
- `/reports/activity-log` — UserActivityLog
- `/reports/sales-statement` — SalesStatement
- `/reports/expense-summary` — ExpenseSummary

### Key UI Elements

- `ReportLayout` component wrapper (filter bar + export buttons)
- `InvoiceViewDialog` for viewing individual invoices
- Print CSS (`src/css/report-print.css`)
- Date range pickers
- Export: PDF, Excel, Print

---

## Module 13: Website / Online Ordering

**Route:** `/website-orders`  
**Layout:** MainLayout  
**Roles:** admin, manager

### Screens

| Screen        | Route                           | Description             |
| ------------- | ------------------------------- | ----------------------- |
| Messages      | `/website-orders/messages`      | WebsiteMessagesPage     |
| Reservations  | `/website-orders/reservations`  | WebsiteReservationsPage |
| Hall Bookings | `/website-orders/hall-bookings` | WebsiteHallBookingsPage |

---

## Module 14: Delivery

**Route:** `/delivery-app` (rider PWA)  
**Layout:** DeliveryAppLayout  
**Roles:** delivery

### Screens

| Screen          | Route                   | Description                            |
| --------------- | ----------------------- | -------------------------------------- |
| Delivery Home   | `/delivery-app`         | DeliveryHomePage — assigned deliveries |
| Active Delivery | `/delivery-app/active`  | DeliveryActivePage — in-progress map   |
| History         | `/delivery-app/history` | DeliveryHistoryPage                    |

### ASCII Wireframe (Delivery Active)

```
┌─────────────────────────────────┐
│  🏍 Seven Waves  DELIVERY  Live │
├─────────────────────────────────┤
│                                 │
│   ┌─────────────────────────┐   │
│   │   [GOOGLE MAP]          │   │
│   │   📍 Current Location   │   │
│   │          ↓ Route        │   │
│   │   📦 Delivery Address   │   │
│   └─────────────────────────┘   │
│                                 │
│   ORDER #1042                   │
│   🏠 123 King Fahd St          │
│   Customer: Ahmed Al-Rashid     │
│   📞 +966 50 123 4567          │
│   ETA: 12 min                   │
│                                 │
│   Items: Burger ×2, Pepsi ×1   │
│   Amount: SAR 100 (Paid)        │
│                                 │
│  [📞 Call Customer]  [✓ Delivered]│
└─────────────────────────────────┘
```

---

## Module 15: Notifications

**Route:** Panel in MainLayout, `/waiter-app/notifs`  
**Layout:** MainLayout (panel), WaiterAppLayout (page)

### Screens

| Screen               | Route                      | Description                 |
| -------------------- | -------------------------- | --------------------------- |
| Notification Panel   | (drawer in header)         | NotificationPanel component |
| Waiter Notifications | `/waiter-app/notifs`       | NotificationsPage           |
| Ready Alerts         | `/waiter-app/ready-alerts` | ReadyAlertsPage             |

---

## Module 16: Settings / Admin

**Route:** `/admin`, `/system`  
**Layout:** MainLayout  
**Roles:** admin

### Screens

| Screen           | Route              | Description                      |
| ---------------- | ------------------ | -------------------------------- |
| System Dashboard | `/system`          | SystemDashboard — modules toggle |
| Roles            | `/admin/roles`     | RolesPage                        |
| Printers         | `/admin/printers`  | PrintersPage                     |
| Admin Home       | `/admin`           | AdminPage                        |
| User Profile     | `/profile`         | UserProfilePage                  |
| Waiter Config    | `/hr/waiter-setup` | WaiterSetupPage                  |

---

## Module 17: Audit Logs

**Route:** `/reports/activity-log`  
**Layout:** MainLayout / ReportsLayout  
**Roles:** admin

### Screens

- UserActivityLog — table of user actions with timestamps

---

## Module 18: AI Analytics

**Route:** `/ai` (module in `src/modules/ai/`)  
**Roles:** admin, manager  
**Status:** Early stage — pages likely not yet routed

### Planned Screens

- Demand Forecasting dashboard
- Anomaly Detection alerts
- Menu performance AI insights
- Staff scheduling recommendations (Google Gemini integration)

---

## Module 19: Device Management

**Route:** `/devices` (module in `src/modules/devices/`)  
**Roles:** admin  
**Status:** Module folder exists, UI pages not yet visible in pages scan

### Planned Screens

- Printer Management (list, add, test)
- Barcode Scanner Configuration
- Biometric Device Management
- Cash Drawer Configuration
- Customer Display Configuration

---

## Module 20: Waiter App (PWA)

**Route:** `/waiter-app`  
**Layout:** WaiterAppLayout  
**Roles:** waiter (and admin/manager with impersonation)

### Screens

| Screen        | Route                      | Description                         |
| ------------- | -------------------------- | ----------------------------------- |
| Home          | `/waiter-app`              | WaiterHomePage — stats, leaderboard |
| POS           | `/waiter-app/pos`          | WaiterPOSPage — new order entry     |
| Tables        | `/waiter-app/tables`       | WaiterTablesPage — table status     |
| Shift Inbox   | `/waiter-app/inbox`        | ShiftInboxPage — pending orders     |
| My Orders     | `/waiter-app/orders`       | MyOrdersPage — accepted orders      |
| Ready Alerts  | `/waiter-app/ready-alerts` | ReadyAlertsPage                     |
| Notifications | `/waiter-app/notifs`       | NotificationsPage                   |
| Profile       | `/waiter-app/profile`      | MyProfilePage                       |

### ASCII Wireframe (Waiter Inbox — mobile)

```
┌─────────────────────────┐
│  🌊  WAITER  [🔴 On]  👤│
│  [🔔 3]  Ahmed Al-Waiter│
├─────────────────────────┤
│  📥 Shift Inbox  (3)    │
├─────────────────────────┤
│ ┌───────────────────┐   │
│ │ Order #1042  T-5  │   │
│ │ 2 items · Dine In │   │
│ │ 00:45 ago         │   │
│ │                   │   │
│ │ [✓ ACCEPT]        │   │
│ └───────────────────┘   │
│ ┌───────────────────┐   │
│ │ Order #1043  T-10 │   │
│ │ 3 items · Dine In │   │
│ │ 01:12 ago   🔴    │   │
│ │                   │   │
│ │ [✓ ACCEPT]        │   │
│ └───────────────────┘   │
├─────────────────────────┤
│ [🏠] [POS] [🪑] [📥3] [📋]│
└─────────────────────────┘
```

---

## Admin Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────────┐
│ [☰] SEVEN WAVES  [🔍 Search...]   [Main Br.] [🌙] [🔔5] [AB▾]    │
│ MAIN | OPERATIONS | INVENTORY | FINANCE | HR | REPORTS | SYSTEM     │
├──────────────┬──────────────────────────────────────────────────────┤
│  OVERVIEW    │  Good morning, Ahmed!  Wed 15 Jan 2026  14:32       │
│  · Dashboard │  ──────────────────────────────────────────────────  │
│  · Reports   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  QUICK LINKS │  │ SAR     │ │  47     │ │  12     │ │  3      │  │
│  · New Order │  │ 24,560  │ │ Orders  │ │ Tables  │ │ Alerts  │  │
│  · Tables    │  │ Revenue │ │  Today  │ │  Open   │ │  ⚠️     │  │
│              │  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
│  SYSTEM      │                                                       │
│  · Admin     │  ┌───────────────────────┐ ┌──────────────────────┐ │
│  · Settings  │  │ Sales This Week       │ │ Pending Actions      │ │
│              │  │ [📈 Line Chart]       │ │ 5 Orders Waiting     │ │
│              │  │                       │ │ 2 Low Stock Items    │ │
│              │  └───────────────────────┘ │ 1 Leave Request      │ │
│              │                            └──────────────────────┘ │
└──────────────┴──────────────────────────────────────────────────────┘
```

---

## Online Menu (Customer-Facing) Wireframe

```
┌────────────────────────────────────┐
│  🍽️ Seven Waves    TABLE: 5       │
│  [Sign In]  [🌙]  [📋0]  [🛒0]   │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ [Mains] [Salads] [Drinks]   │  │
│  │ [Desserts] [Specials]       │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌─────────────┐ ┌─────────────┐  │
│  │ [🍔 photo] │ │ [🥗 photo] │  │
│  │ Wagyu Burger│ │ Caesar      │  │
│  │ SAR 55      │ │ Salad       │  │
│  │ [+ ADD]     │ │ SAR 28 [+] │  │
│  └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐  │
│  │ [🥩 photo] │ │ [🐟 photo] │  │
│  │ Ribeye Steak│ │ Grilled Sea │  │
│  │ SAR 95      │ │ SAR 65 [+] │  │
│  │ [+ ADD]     │ │             │  │
│  └─────────────┘ └─────────────┘  │
├────────────────────────────────────┤
│     🛒 3 items — View Cart (SAR 145) │
└────────────────────────────────────┘
```
