# Software Requirements Specification (SRS)
## Seven Waves Restaurant ERP
**Standard:** IEEE 830-1998  
**Version:** 1.0  
**Date:** 2026-07-16  
**Status:** Draft

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for the Seven Waves Restaurant ERP system. It is intended for the development team, QA team, database administrators, and system architects.

### 1.2 Scope
Seven Waves ERP is a comprehensive restaurant management system covering POS, kitchen operations, inventory, finance, HR, procurement, delivery, CRM, AI analytics, and device management. It is deployed as a Quasar 2 SPA/PWA backed by Supabase (PostgreSQL 17) and targets web, PWA, Electron, and Tauri platforms.

### 1.3 Definitions, Acronyms, and Abbreviations

| Term | Definition |
|------|-----------|
| ERP | Enterprise Resource Planning |
| POS | Point of Sale |
| KOT | Kitchen Order Ticket |
| KDS | Kitchen Display System |
| GRN | Goods Receipt Note |
| PO | Purchase Order |
| AP | Accounts Payable |
| BOM | Bill of Materials |
| RBAC | Role-Based Access Control |
| RLS | Row Level Security (PostgreSQL) |
| PWA | Progressive Web Application |
| SPA | Single Page Application |
| RPC | Remote Procedure Call (Supabase/PostgREST) |
| PKCE | Proof Key for Code Exchange (OAuth 2.0 flow) |
| JWT | JSON Web Token |

### 1.4 References
- CLAUDE.md — Project architecture guide
- Supabase Docs — https://supabase.com/docs
- Quasar Framework Docs — https://quasar.dev
- IEEE 830-1998 Standard

### 1.5 Overview
Section 2 describes the overall system context. Section 3 enumerates specific requirements by module.

---

## 2. Overall Description

### 2.1 Product Perspective
Seven Waves ERP operates as a client-server system where:
- The **client** is a Quasar Vue 3 SPA that runs in-browser, as a PWA, or wrapped in Electron/Tauri
- The **server** is Supabase (managed PostgreSQL 17 + GoTrue Auth + Realtime + Edge Functions)
- Communication is via Supabase JS SDK (PostgREST + Realtime WebSocket)
- No custom backend server is required between client and Supabase

### 2.2 Product Functions (Summary)

```
Seven Waves ERP
├── Authentication & RBAC
├── POS (Dine-in / Takeaway / Delivery)
├── Kitchen Display System
├── Waiter Operations (PWA)
├── Table & QR Self-Ordering (Kiosk)
├── Inventory Management
├── Procurement
├── Finance & Accounting
├── HR & Payroll
├── Delivery Management
├── CRM & Loyalty
├── Reports & Analytics
├── AI & Forecasting (Gemini)
├── Device Management
├── Website & Reservations
├── Admin & Configuration
├── Offline Sync Engine
└── Notifications
```

### 2.3 User Classes and Characteristics

| User Class | Tech Literacy | Primary Device | Key Needs |
|-----------|--------------|---------------|-----------|
| Admin | High | Desktop/Laptop | Full system control |
| Manager | Medium | Desktop + Mobile PWA | Reports, oversight, approvals |
| Cashier | Medium | Desktop/POS terminal | Speed, payment, shift |
| Waiter | Low–Medium | Mobile/Tablet PWA | Simple, fast, offline |
| Kitchen Staff | Low | Large screen/KDS | Visual, minimal input |
| Delivery Rider | Low | Mobile PWA | Map, status updates |
| Inventory Staff | Medium | Desktop/Tablet | Stock management |
| Finance | High | Desktop | Ledgers, statements |
| HR | Medium | Desktop | Payroll, attendance |
| Procurement | Medium | Desktop | PO, supplier |
| Customer | Any | Mobile/Tablet | Self-ordering, tracking |

### 2.4 Operating Environment

| Environment | Specification |
|------------|--------------|
| Browser | Chrome ≥ 90, Edge ≥ 90, Safari ≥ 14, Firefox ≥ 88 |
| Desktop | Windows 10/11 (Electron 41 or Tauri 2), macOS 11+ |
| Mobile PWA | Android ≥ 9, iOS ≥ 14 |
| Database | PostgreSQL 17 (Supabase cloud, ap-northeast-2) |
| Node.js | ≥ 20 (for build only) |
| Network | HTTPS only; WebSocket for realtime |

### 2.5 Design and Implementation Constraints

| Constraint | Detail |
|-----------|--------|
| C-1 | Authentication via Supabase GoTrue (PKCE flow) only |
| C-2 | All DB access via PostgREST or Supabase RPCs; no direct psql from client |
| C-3 | RLS must be enabled on all tables with user data |
| C-4 | Financial journals are immutable once posted |
| C-5 | Offline queue must not include finance/procurement operations |
| C-6 | anon role must have no write access to any business table |
| C-7 | Never trust cached roles for privileged route access |
| C-8 | Rate limiting on login: 5 attempts → 15-minute lockout |
| C-9 | Inactivity timeout: 30 minutes on shared POS terminals |
| C-10 | All SQL migrations applied via Supabase MCP tool; no ORM migrations |

### 2.6 Assumptions and Dependencies
- Supabase project `clykwuzajtwvwuavmtzs` is the production backend
- Google Gemini API key is configured for AI features
- Netlify is the primary deployment target (CDN for SPA assets)
- All branches share one Supabase project (single-tenant DB, multi-tenant data)

---

## 3. Specific Requirements

### 3.1 Authentication & Session Management

#### FR-AUTH-01: Email/Password Login
- System shall authenticate users via `supabase.auth.signInWithPassword`
- System shall use PKCE flow
- Failed login increments counter; 5 failures lock for 15 minutes

#### FR-AUTH-02: Numeric Code Login
- Cashiers and waiters may log in via 4–6 digit user code + password
- Resolved via `login-with-code` Supabase Edge Function
- Edge function returns session + roles to avoid extra DB calls

#### FR-AUTH-03: Session Persistence
- Sessions are persisted to `localStorage` (works in Electron/WebView2)
- Access token auto-refreshed; background role refresh on token refresh event

#### FR-AUTH-04: Role Loading and Caching
- Roles fetched via `auth_get_roles()` RPC on first login
- Cached in `localStorage` under `erp_auth_v2_{uid}` for 24 hours
- Cached roles are NOT server-verified; a background refresh runs after cache restore
- Privileged routes (`admin`, `manager`, `finance`, `hr`, `super_admin`) force synchronous revalidation if `rolesVerified = false`

#### FR-AUTH-05: Inactivity Timeout
- 30-minute inactivity timer starts on login
- Events: `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`
- On timeout: `signOut()` called automatically

#### FR-AUTH-06: Sign Out
- Local state cleared immediately (instant UI feedback)
- `supabase.auth.signOut()` called in background (non-blocking)
- Auth cache cleared from localStorage

#### FR-AUTH-07: Account Status Check
- On every session restore, `profiles.is_active` is checked
- If `is_active = false`, user is signed out with error message

### 3.2 Role-Based Access Control (RBAC)

#### FR-RBAC-01: Role Assignment
- Roles stored in `user_roles` table, linked to `roles` table
- A user may have multiple roles
- Roles: `admin | manager | waiter | cashier | kitchen | delivery | inventory | finance | hr | procurement`

#### FR-RBAC-02: Permission Format
- Format: `{module}.{resource}.{action}` (e.g. `pos.order.void`)
- Explicit DB permissions override role defaults
- Wildcard: `pos.*` matches any `pos.*.*` permission

#### FR-RBAC-03: Route Guards (3-layer)
1. Role check: user must have at least one role from `meta.roles[]`
2. Permission check: `hasPermission(roles, meta.permission, userPerms)`
3. Module check: `hasModuleAccess(roles, meta.module)`

#### FR-RBAC-04: Branch Access Guard
- Non-admin users must have a valid `branch_users` row with `is_active = true`
- Standalone PWA routes (`/waiter-app`, `/manager-app`, `/delivery-app`) bypass this check
- Routes with `meta.requiresBranchAccess = false` bypass this check

#### FR-RBAC-05: Manager Isolation
- Pure managers (role=`manager`, no admin/kitchen/cashier/waiter) are hard-redirected to `/manager-app` from all MainLayout routes

#### FR-RBAC-06: DB-Level Enforcement
- Every business table has RLS policies
- Helper functions: `is_admin()`, `is_manager()`, `auth_has_role(role)`, `auth_is_on_shift(branch_id)`, `auth_branch_ids()`, `auth_kitchen_ids()`

### 3.3 POS Module

#### FR-POS-01: Order Creation
- Orders may be created with type: `dine_in | takeaway | delivery`
- Must set `assigned_waiter_id = NULL` on insert from POS (sends to waiter inbox)
- Order statuses: `pending_waiter → accepted → in_kitchen → ready → served → paid`

#### FR-POS-02: Quick Pay
- Creates order with `assigned_waiter_id = NULL` then immediately calls `process_waiter_accept` RPC
- Skips waiter inbox intentionally
- Then calls `process_cashier_invoice` RPC

#### FR-POS-03: Payment Processing
- Supported methods: cash, card, digital wallet, loyalty points, split payment
- Payment confirmed via `payments` table INSERT (not client-side confirmation)
- Receipt generation via ESC/POS printer or PDF

#### FR-POS-04: Discount & Void
- Discounts applied at order or item level with authorization
- Voids require `pos.order.void` permission and audit log entry

#### FR-POS-05: Shift Management
- Cashier opens shift with opening cash count
- Cash movements (float in/out) recorded during shift
- Shift close with cash reconciliation and Z-report
- `cashier_sessions` table tracks shift lifecycle

### 3.4 Kitchen Display System (KDS)

#### FR-KDS-01: KOT Generation
- Triggered by `trg_generate_kot` AFTER UPDATE on `orders.status = 'accepted'`
- `order_items.kitchen_id` MUST be set BEFORE status update
- Each kitchen only sees its assigned items

#### FR-KDS-02: KOT Dispatch
- `trg_z_dispatch_on_accept` creates `kot_dispatches` for: `KITCHEN`, `CASHIER`, `INVENTORY`, `FINANCE`
- Realtime subscription on `kot_tickets` table

#### FR-KDS-03: Item Management
- Kitchen can mark items as: cooking, ready, bumped
- System tracks prep time per item type

### 3.5 Waiter Operations

#### FR-WAITER-01: Order Inbox
- Shows orders where `assigned_waiter_id IS NULL` for current shift branches
- Gated by `get_pending_orders_for_shift()` RPC
- Realtime subscription on `orders` INSERT

#### FR-WAITER-02: Order Accept
- Calls `accept_order_as_waiter(p_order_id, p_unavailable_ids)` RPC
- Signature is fixed — no overloads (PGRST203 prevention)

#### FR-WAITER-03: Shift Gate
- `auth_is_on_shift(branch_id)` must return true for all waiter operations
- No shift = no orders visible (silent failure by design)

### 3.6 QR / Table Ordering

#### FR-QR-01: QR Code Generation
- URL format: `{VITE_APP_PUBLIC_URL}/c/{qrToken}`
- Base URL priority: `localStorage.sw_qr_base_url` → `VITE_APP_PUBLIC_URL` → `window.location.origin`

#### FR-QR-02: Customer Session
- `get_or_create_session_by_qr(token)` RPC creates anonymous session
- Session token stored in `localStorage` (tm_session_token, tm_table_id)

#### FR-QR-03: Kiosk Ordering
- Customer selects items on `/touch` kiosk view
- Order created via `create_kiosk_order` or `create_order_from_session` RPC

### 3.7 Inventory Management

#### FR-INV-01: Stock Levels
- `stock_levels` table tracks qty_on_hand per ingredient per branch
- Real-time deduction on KOT dispatch via `INVENTORY` dispatch target
- Concurrency safety: row-level locking in deduction RPC

#### FR-INV-02: GRN Processing
- GRN increases stock levels
- GRN posted to finance (AP) automatically

#### FR-INV-03: BOM / Recipe Engine
- `recipe_bom_engine.sql` defines ingredient quantities per menu item
- Ingredient consumption calculated from order dispatch

### 3.8 Finance Module

#### FR-FIN-01: Chart of Accounts
- Hierarchical account structure (assets, liabilities, equity, income, expense)
- Account registration and classification

#### FR-FIN-02: Vouchers
- Payment voucher: money out
- Receipt voucher: money in
- Voucher approval workflow with `VoucherApprovalPanel`
- Immutability: posted vouchers cannot be edited

#### FR-FIN-03: Journal Immutability
- `fix_journal_immutability.sql` enforces AFTER INSERT trigger preventing updates

#### FR-FIN-04: Financial Statements
- Trial Balance, P&L, Balance Sheet generated from posted journals
- Fiscal period filtering

### 3.9 HR & Payroll

#### FR-HR-01: Employee Management
- Employee records with emergency contacts, documents, contracts
- Department and designation assignment

#### FR-HR-02: Attendance
- Biometric integration for clock-in/out
- Shift-based attendance tracking

#### FR-HR-03: Payroll Run
- Salary structure (basic, allowances, deductions)
- Payroll engine processes all active employees per period
- Payroll posts to finance ledger automatically

### 3.10 Delivery Management

#### FR-DEL-01: Order Assignment
- Delivery orders assigned to available riders
- Assignment triggers realtime notification to rider PWA

#### FR-DEL-02: Tracking
- Rider location updates stored and viewable by manager
- Delivery status: assigned → picked_up → delivered

### 3.11 CRM & Loyalty

#### FR-CRM-01: Loyalty Points
- Points earned on each paid order (configurable rate)
- Points redeemable at POS with `crm.loyalty.redeem` permission

#### FR-CRM-02: Customer Profiles
- Customer registration at POS or via QR session
- Order history linked to customer profile

### 3.12 Offline Sync

#### FR-OFFLINE-01: Queue
- Operations enqueued to IndexedDB (`sync_queue` store) when offline
- Modules allowed: `pos`, `kitchen`, `waiter`, `hr`, `delivery`
- Modules blocked: `finance`, `procurement`

#### FR-OFFLINE-02: Sync
- On network restore: `syncAll()` processes queue in FIFO order
- Each item routed to `offline_sync_{module}_{action}` RPC
- Max 5 attempts per item; dead-letter after max attempts

#### FR-OFFLINE-03: Periodic Sync
- 30-second interval sync when online
- Stopped on logout, restarted on login

---

## 4. External Interface Requirements

### 4.1 User Interfaces
- Quasar 2 component library (Material Design)
- Responsive layouts for desktop (1280px+) and mobile (360px+)
- Dark mode support via Quasar theming

### 4.2 Hardware Interfaces
- ESC/POS thermal printers (USB, Network, Bluetooth)
- Barcode/QR scanners (USB HID)
- Biometric fingerprint readers
- Cash drawers (via printer port)

### 4.3 Software Interfaces
| Interface | Protocol | Purpose |
|-----------|----------|---------|
| Supabase PostgREST | HTTPS REST | CRUD operations |
| Supabase Realtime | WebSocket | Live updates |
| Supabase GoTrue | HTTPS | Authentication |
| Supabase Storage | HTTPS | File uploads |
| Supabase Edge Functions | HTTPS | Custom server logic |
| Google Gemini API | HTTPS | AI forecasting & chat |
| Leaflet / Maps | Client-side | Delivery tracking map |

### 4.4 Communications Interfaces
- All traffic over HTTPS (TLS 1.2+)
- WebSocket for Supabase Realtime (wss://)
- PKCE OAuth flow for authentication

---

## 5. Non-Functional Requirements

### 5.1 Performance
- POS order creation: ≤ 500ms end-to-end
- KOT appears on KDS: ≤ 2 seconds from acceptance
- Page load (SPA route change): ≤ 300ms
- Report generation: ≤ 5 seconds for 30-day range

### 5.2 Security
- PKCE auth flow (no implicit flow)
- JWT expiry: Supabase default (1 hour access token, refresh as needed)
- RLS on all business tables
- anon role has no write access
- Rate limiting: 5 login attempts → 15-min lockout (client + DB layer)
- Input sanitization on all user inputs (XSS prevention)
- No direct SQL from client

### 5.3 Reliability
- Supabase SLA: 99.9% uptime
- Offline POS: 100% available during connectivity loss
- Auto-reconnect for Realtime WebSocket (exponential backoff: 2s, 4s, 8s, 16s, 30s cap)

### 5.4 Scalability
- Database: Supabase handles up to ~500 concurrent connections; connection pooler (PgBouncer) for higher loads
- Branches: Tested for 50 concurrent branches
- Horizontal scaling: Stateless SPA scales via CDN

### 5.5 Maintainability
- TypeScript used for all core services and stores
- ESLint + Prettier enforced
- Vitest for unit tests
- SQL changes via Supabase MCP tool (no ORM)

### 5.6 Portability
- SPA runs in any modern browser
- Electron wrapper for Windows/macOS desktop
- Tauri wrapper as lightweight alternative
- PWA for mobile (no app store required)

### 5.7 Usability
- KDS interface: touch-friendly, large text, ≥ 48px touch targets
- POS: keyboard shortcuts for common actions
- Waiter PWA: single-thumb operation on 5" screen
- i18n: all strings via vue-i18n (multi-language ready)
