# Seven Waves Restaurant ERP - Comprehensive Software Report

## 1. Project Overview
**Project Name:** Seven Waves | Restaurant Management ERP
**Description:** A complete, end-to-end enterprise resource planning and point-of-sale system tailored for restaurant management. It unifies operations, finance, human resources, procurement, and customer-facing interfaces into a single scalable platform.
**Version:** 0.0.1
**Core Goal:** To digitize all restaurant workflows including kitchen operations (KDS), waiter mobile interactions, cashier operations, manager oversight, and backend administrative functions (HR, Payroll, Finance, Inventory).

## 2. Technology Stack & Architecture
The system employs a modern, reactive tech stack designed for cross-platform deployment (Web, Desktop, Mobile/Tablet PWA).

### Frontend
- **Framework:** Vue 3 (Composition API) with Vue Router 5
- **UI Toolkit:** Quasar Framework 2.16 (Material Design, highly responsive)
- **State Management:** Pinia
- **Styling:** TailwindCSS/Utility-first concepts via PostCSS, Quasar Sass/SCSS, Autoprefixer
- **Charts & Data Visualization:** ApexCharts, Vue3-ApexCharts
- **Internationalization:** Vue-i18n
- **Icons & Graphics:** Custom icon sets, html2canvas, html-to-image

### Backend & Database
- **BaaS / Database:** Supabase (PostgreSQL)
- **Realtime:** Supabase Realtime for instant KDS updates, order tracking, and chat/notifications.
- **Security:** Advanced PostgreSQL Row Level Security (RLS) and Role-Based Access Control (RBAC).

### Desktop & Native Integrations
- **Desktop Wrappers:** Electron & Tauri (for Windows/Mac executable generation, hardware integrations like printers and biometrics)
- **Local Integrations:** Receipt printing, Kitchen printers, Biometric attendance hardware (via local integrations/serial ports).

### Document & Export Utilities
- **PDF Generation:** jsPDF, jsPDF-Autotable, pdfkit
- **Excel/Spreadsheets:** xlsx, exceljs
- **File Saving:** file-saver
- **Documents:** docx
- **Barcodes/QR:** qrcode

### Build & Tooling
- **Build Tool:** Vite (via Quasar app-vite)
- **Linting & Formatting:** ESLint 9, Prettier
- **PWA capabilities:** Workbox (register-service-worker, caching, routing)

---

## 3. Core Modules & Functional Breakdown

The software is divided into multiple distinct routing scopes (portals/apps) depending on the user's role and the physical device.

### 3.1. Core ERP Modules (Admin / Manager Backoffice)
Accessible via the main dashboard. Protected by Role-Based Access Control (`admin`, `manager`, `finance`, `inventory`, `hr`, `procurement`).

#### 3.1.1. Finance Module
- **Chart of Accounts:** Manage ledgers and account structures.
- **Journal Entries & General Ledger:** Core accounting entries and tracking.
- **Cash & Bank:** Tracking cash flow and bank reconciliations.
- **Receivables & Payables:** Managing debtors and creditors.
- **Income & Expenses:** Daily operational expense and revenue tracking.
- **Tax Management:** Tax configurations and calculation.
- **Payroll Integration:** Approving and logging payroll financial transactions.
- **Financial Reports & Audit:** Trial balance, revenue summaries, audit logs.

#### 3.1.2. Human Resources (HR) & Payroll
- **Employee Management:** Profiles, contracts, personal details.
- **Attendance & Shifts:** Shift scheduling, tracking (integrates with biometric setup), leave management.
- **Payroll Processing:** Salary structures, commission tracking, payslip generation, payroll runs, salary audits.
- **Resignation & Document Management:** Employee lifecycles and document storage.

#### 3.1.3. Procurement Module
- **Suppliers:** Vendor database and ratings.
- **Purchase Orders (POs):** Creating and tracking orders sent to suppliers.
- **Good Receipt Notes (GRN):** Receiving goods, updating inventory directly.
- **AP Invoices & Payments:** Accounts payable tracking, supplier payment reporting.
- **Purchase Returns:** Managing defective or returned stock.

#### 3.1.4. Inventory & Warehouse Management
- **Stock Control:** Stock on hand tracking, low-stock alerts, reorder levels.
- **BOM & Recipe Engine:** Bill of Materials (BOM) for menu items; automatically deducts raw ingredients when a final item is sold (Recipe Consumption).
- **Wastage & Adjustments:** Logging food waste or manual stock adjustments.
- **Variance Tracking:** Expected vs. Actual stock reporting.

#### 3.1.5. Administrative Settings
- **User & Role Management:** Access control for the ERP.
- **Branch Management:** Multi-branch setup.
- **AI Insights:** Data-driven suggestions for managers based on sales/inventory data.
- **Hardware Config:** Printer management (KOT printers, receipt printers).
- **Customer & Loyalty Management:** CRM database, loyalty tier configuration.
- **Table Management:** Floor plan and table layout configurations.

---

### 3.2. Operations System (In-Store)
Used by the floor staff and kitchen.

- **Point of Sale (POS):** Fast-entry interface for Cashiers to process orders, apply discounts, and handle payments (cash/card/split).
- **Kitchen Display System (KDS):** Tablet/Screen UI for chefs. Shows incoming KOTs (Kitchen Order Tickets), routes items to specific kitchen stations, manages order status (Cooking, Ready).
- **Operations Dashboard:** Live view of the restaurant floor, active tables, and pending operations.
- **Order Tracking:** Realtime tracking of order statuses.

---

### 3.3. Dedicated Progressive Web Apps (PWAs)
Standalone full-screen interfaces designed for specific employee roles on mobile devices or tablets.

#### 3.3.1. Waiter App (`/waiter-app`)
- **Floor & Tables:** Live table statuses.
- **Order Taking (Mobile POS):** Taking orders directly at the table and sending KOTs to the kitchen.
- **Alerts & Notifications:** "Order Ready" alerts from the kitchen.
- **Shift Inbox:** Communication with managers.

#### 3.3.2. Manager App (`/manager-app`)
- **Floor Overview:** Bird's eye view of all tables, wait times, and server assignments.
- **Staff Monitoring:** Tracking waiter performance and active shifts.
- **Order Monitor:** Overriding or approving discounts, voiding items.
- **Messages & Alerts:** Urgent system or kitchen notifications.

#### 3.3.3. Delivery App (`/delivery-app`)
- **Active Deliveries:** Route tracking for riders.
- **Map Integration:** Leaflet-based maps for delivery navigation.
- **History & Profile:** Rider performance and earnings.

---

### 3.4. Customer Interfaces
Touchpoints for the end customer.

- **Customer Auth & Profile:** Login/Registration, Order History.
- **Digital Menu (`/menu`):** Browsing the restaurant menu, placing orders.
- **Touch Screen Menu Book (`/touch`):** Interactive tablet menu placed on restaurant tables.
- **QR Code Entry (`/c/:qrToken`):** Scan-to-order functionality. Scanning a QR code logs the customer into a specific table session.
- **Table Ordering (`/table/:sessionToken/menu`):** Placing orders directly to the KDS from a customer's phone.
- **Order Tracking (`/track/:orderId`):** Live status of their meal.
- **Loyalty Program:** Digital loyalty cards, points viewing.
- **Website Bookings:** Hall bookings, reservations, and contact messages.

---

## 4. Comprehensive Reporting Engine
The system contains a massive array of reports, categorized by department:

1. **Sales Reports:** Electronic Journal, Item-Wise, Waiter-Wise, Table-Wise, Category-Wise, Hourly, Branch-Wise, Discounts, Voids/Cancellations, Payment Methods.
2. **Operations Reports:** Kitchen Orders, Order Status, Item Availability, Delivery/Rider Performance, Pickup vs Delivery, Kitchen Usage, Customer History, Reservation Reports.
3. **Inventory Reports:** Stock on Hand, Inventory Ledger, Wastage, Ingredient Consumption, Reorder Levels, Purchase Consumption Analysis, Variance Report, KOT Deduction Log.
4. **Procurement Reports:** Purchase Summary, Supplier-wise Purchases, GRN Report.
5. **Finance Reports:** Revenue Summary, Expense Summary, Daily Cash Summary.
6. **HR Reports:** Staff Performance, Cashier Performance.
7. **Audit/System:** User Activity Logs, Price Change Logs, Inventory Adjustments.

---

## 5. Database & Backend Orchestration (Supabase)
The database uses advanced PostgreSQL features to ensure data integrity and real-time synchronization.

**Key DB Mechanisms:**
- **KOT Routing Engine & Orchestration:** Complex SQL functions handle how orders are split and sent to different kitchen stations.
- **Realtime Downstream:** Uses Supabase realtime triggers to push data to Vue clients (Waiters, KDS, POS) instantly.
- **RLS (Row Level Security):** Strict security policies ensuring cashiers only see their branch's orders, and customers only see their own sessions.
- **BOM Engine:** `bom_inventory_completion.sql` and `recipe_bom_engine.sql` automatically convert menu item sales into raw ingredient deductions (e.g., selling 1 Burger deducts 1 Bun, 100g Beef, 1 slice Cheese).
- **Biometric Integration:** Scripts to sync local ZKTeco (or similar) biometric clock-in data with the cloud Supabase HR schema.
- **Table Device Login Sessions:** Manages temporary tokens when a table logs in to order, ensuring unauthorized people cannot order to a table.

## 6. Deployment & Build Targets
- **Web App / Cloud:** Hosted via Vercel/Netlify for global access.
- **Desktop (Windows/Mac):** Built using Electron and Tauri. Used by Cashiers and Admins who require stable connections to local network printers and biometric machines.
- **Mobile PWA:** Installable directly from the browser for Waiters, Managers, and Delivery Riders.

---
*End of Report. Prepared for full system understanding and maintenance.*
