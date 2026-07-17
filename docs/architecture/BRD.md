# Business Requirements Document (BRD)
## Seven Waves Restaurant ERP
**Version:** 1.0  
**Date:** 2026-07-16  
**Author:** Architecture Team  
**Status:** Draft

---

## 1. Executive Summary

Seven Waves Restaurant ERP is a full-stack, multi-branch restaurant management system designed to digitize and automate all operational aspects of restaurant businesses — from point-of-sale and kitchen dispatch to HR, payroll, finance, procurement, delivery, and AI-powered analytics.

The system targets **restaurant chains and independent multi-location operators** who require a unified platform that scales from a single tablet kiosk to a full enterprise desktop ERP with real-time synchronization across branches.

The product is delivered as:
- A **web SPA** (browser-based full ERP for admin/manager roles)
- **Progressive Web Apps** for waiter, manager, and delivery roles (mobile-first, offline-capable)
- An **Electron desktop app** for Windows/macOS (offline-ready POS terminals)
- A **Tauri native app** (lightweight alternative to Electron)
- A **customer-facing kiosk/tablet** interface for self-ordering

---

## 2. Business Objectives

| # | Objective | KPI | Target |
|---|-----------|-----|--------|
| BO-1 | Eliminate paper-based order taking | Orders placed digitally | 100% |
| BO-2 | Reduce order-to-kitchen time | Avg KOT dispatch latency | < 30 seconds |
| BO-3 | Centralize multi-branch finance | Branches on unified ledger | 100% |
| BO-4 | Enable self-service customer ordering | QR orders / total orders | ≥ 40% |
| BO-5 | Automate payroll & attendance | Payroll manual errors | 0 |
| BO-6 | Real-time inventory deduction | Stock variance at EOD | < 1% |
| BO-7 | Enable delivery management | Delivery tracking uptime | 99.9% |
| BO-8 | AI-driven revenue forecasting | Forecast accuracy (MAPE) | < 10% |
| BO-9 | Compliance & audit trail | Audit log coverage | 100% critical ops |
| BO-10 | PWA offline-first operations | Uptime during outages | 100% for POS |

---

## 3. Stakeholders

| Role | Responsibility | System Role |
|------|---------------|-------------|
| Restaurant Owner / CEO | Strategic decisions, ROI | `admin` |
| Branch Manager | Daily operations oversight | `manager` |
| Head Cashier | Payment processing, shift management | `cashier` |
| Waiter / Floor Staff | Order taking, table management | `waiter` |
| Kitchen Staff / Chef | KOT handling, food production | `kitchen` |
| Delivery Rider | Delivery dispatch and tracking | `delivery` |
| Inventory Manager | Stock control, GRN, waste | `inventory` |
| Finance Officer | Ledgers, vouchers, statements | `finance` |
| HR Manager | Staff, payroll, attendance | `hr` |
| Procurement Officer | PO management, supplier relations | `procurement` |
| Customer | Self-ordering, order tracking | Public / QR session |
| IT Administrator | System config, device management | `admin` |

---

## 4. Business Processes

### 4.1 Point of Sale (POS)
- Create dine-in, takeaway, and delivery orders
- Apply discounts, service charges, taxes
- Process multiple payment methods (cash, card, digital wallet, loyalty points)
- Quick pay (cashier bypass for fast service)
- Void/refund orders with authorization
- Shift open/close with cash reconciliation

### 4.2 Kitchen Display System (KDS)
- Real-time KOT (Kitchen Order Ticket) display
- Multi-kitchen routing based on menu item category
- Item ready/bump/void management
- Priority escalation for delayed orders
- KOT dispatch to Cashier, Inventory, Finance simultaneously

### 4.3 Waiter Operations
- Real-time order inbox with shift-based visibility
- Accept/reject orders with unavailable item management
- Table management and floor plan
- Customer notification on order ready

### 4.4 Table & QR Ordering
- Dynamic QR codes per table
- Customer self-ordering via kiosk/tablet
- Session-based anonymous customer accounts
- Order tracking on customer device

### 4.5 Inventory Management
- Real-time stock deduction on order dispatch
- Goods Receipt Note (GRN) processing
- Wastage recording and variance reports
- Reorder level alerts
- BOM (Bill of Materials) / Recipe management
- Ingredient-level consumption tracking

### 4.6 Procurement
- Purchase Order (PO) creation and approval workflow
- Supplier management
- GRN matching against PO
- AP (Accounts Payable) integration
- Procurement settings and category management

### 4.7 Finance & Accounting
- Double-entry ledger system (Chart of Accounts)
- Payment and receipt vouchers
- Cashbook management (petty cash, bank)
- Bank reconciliation
- Payroll posting to general ledger
- Financial statements (P&L, Balance Sheet, Trial Balance)
- Fiscal period management
- Journal immutability (posted entries cannot be altered)

### 4.8 HR & Payroll
- Employee lifecycle management
- Attendance and shift tracking
- Salary structure configuration
- Payroll run with tax calculations
- Payslip generation and distribution
- Leave management
- Performance evaluation
- Commission tracking for sales staff
- Document management (contracts, certificates)

### 4.9 Delivery Management
- Delivery order assignment to riders
- Live GPS tracking integration
- Delivery performance reporting
- Rider commission and performance metrics

### 4.10 CRM & Loyalty
- Customer registration and profiling
- Points-based loyalty program
- Loyalty redemption at POS
- Customer order history
- Loyalty program configuration per branch

### 4.11 Reports & Analytics
- 30+ pre-built reports (sales, inventory, HR, finance, operations)
- Category, item, waiter, table-wise sales breakdowns
- Export to PDF, Excel, CSV
- Date-range and branch filtering
- Real-time dashboard KPIs

### 4.12 AI & Forecasting
- Revenue forecasting (Google Gemini)
- Anomaly detection
- AI chat assistant for operations queries
- AI-generated operational insights and recommendations

### 4.13 Device Management
- Thermal printer integration (ESC/POS)
- Barcode/QR scanner management
- Biometric device integration (fingerprint attendance)
- Cash drawer management
- Device health monitoring

### 4.14 Website & Reservations
- Online reservation management
- Hall/banquet booking system
- Website message inbox

### 4.15 Admin & Configuration
- Role and permission management
- Branch and company configuration
- System module on/off toggle per company
- Printer configuration
- Audit log viewer

### 4.16 Manager PWA
- Mobile floor overview
- Real-time alerts
- Branch performance KPIs on mobile

### 4.17 Waiter PWA
- Mobile order inbox
- Notification center
- Ready alerts for completed orders

### 4.18 Delivery App
- Mobile delivery dashboard
- Active and history tabs
- Map-based delivery navigation

### 4.19 Offline Sync
- IndexedDB-based queue for POS/kitchen/waiter operations
- Auto-retry on reconnect
- Dead-letter queue for failed sync

### 4.20 Notifications
- In-app notification engine
- Sound alerts for new orders and KOTs
- Role-based notification routing

---

## 5. Success Metrics

| Metric | Baseline | Target | Timeframe |
|--------|----------|--------|-----------|
| Order processing time | Manual (5–10 min) | < 60 seconds | 3 months post-launch |
| Table turn time | N/A | 10% reduction | 6 months |
| Inventory variance | Unknown | < 1% | 3 months |
| Payroll processing time | 3+ days | 1 day | 1 month |
| Report generation | Manual (days) | Real-time | At launch |
| System uptime | N/A | 99.9% | Continuous |
| POS offline resilience | 0% | 100% | At launch |
| Customer QR adoption | 0% | 40% in 6 months | Ramp |

---

## 6. ROI Analysis

| Investment Area | Estimated Saving |
|----------------|-----------------|
| Reduce order entry labor | 2 staff positions per branch |
| Eliminate food cost variance | 1–3% of revenue |
| Automate payroll processing | 8 hours/month per HR staff |
| Real-time inventory = fewer stockouts | 2–5% revenue recovery |
| Loyalty program = repeat customers | 15–25% increase in repeat visits |
| AI forecasting = better purchasing | 3–7% reduction in food waste |

Estimated ROI breakeven: **6–12 months** for a 3-branch operation.

---

## 7. Constraints

| Category | Constraint |
|----------|-----------|
| Platform | Must run on Chrome/Edge (SPA), Android (PWA), Windows (Electron/Tauri) |
| Connectivity | Must function offline for POS operations for at least 4 hours |
| Compliance | Financial vouchers must be immutable once posted |
| Security | RBAC enforced at both API (RLS) and UI routing layers |
| Scalability | Must support up to 50 concurrent branches on shared Supabase instance |
| Localization | Multi-language support via vue-i18n (initial: English) |
| Integration | ESC/POS printers, biometric devices, payment gateways |
| Data | All financial data must be retained for minimum 7 years |

---

## 8. Assumptions

1. Each restaurant chain has exactly one `companies` row; branches are children.
2. Supabase (cloud, ap-northeast-2) is the sole backend infrastructure.
3. Network connectivity is available at least 95% of operating hours.
4. Customers own Android or iOS devices capable of running a PWA.
5. Kitchen staff interact only with the KDS screen (no personal login devices required per item).
6. Google Gemini API is available and within budget for AI forecasting.
7. Financial year runs January–December unless configured otherwise.
8. All monetary values are stored in a single currency per company.

---

## 9. Out of Scope

- Native iOS / Android mobile apps (PWA covers mobile use cases)
- Online ordering marketplace integration (UberEats, Grab)
- Payment gateway SDK integration (handled at infrastructure layer, not in scope for v1)
- Multi-currency support
- Franchise royalty management
- Table reservation widgets embedded in external websites
