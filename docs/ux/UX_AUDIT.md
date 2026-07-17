# UX Audit — Seven Waves Restaurant ERP

## Audit Scope

Covers all 7 layouts and their child pages. Each layout rated on UX Maturity (1–5):
- **1** = Placeholder / missing
- **2** = Partial / skeleton only
- **3** = Functional but rough
- **4** = Solid, minor polish needed
- **5** = Production-ready

---

## Layout Audits

### 1. MainLayout.vue (`/`)
**Target device:** Desktop (1024px+) with sidebar  
**UX Maturity: 4/5**

**What works well:**
- Two-row header (search + section tabs) is a good SAP B1 pattern
- Left sidebar with section grouping and active-state left-border highlight is clean
- `isPOSMode` hides sidebar for cashier/kitchen/waiter roles — correct UX decision
- Branch chip in header gives quick context
- Global search (Ctrl+K) is a power-user feature
- Theme toggle present (dark/light)
- Notification panel and user avatar menu are complete

**Issues found:**
- `src/layouts/MainLayout.vue:271-279` — `isPOSMode` hides nav for ALL cashier/waiter/kitchen roles even when they're on `/dashboard`. An admin who also has `cashier` role loses the nav entirely.
- `src/layouts/MainLayout.vue:391-426` — `groupedSidebarItems` returns empty `{}` until `activeSection` is set. On first load with a direct URL, there's a flash where the sidebar shows nothing.
- No skip-to-content link (`.erp-skip-link` is defined in erp-theme.scss but not used in template).
- No loading skeleton for sidebar nav while `filteredMenuItems` computes.
- Sidebar `&__scroll` height is `calc(100% - 72px)` — hardcoded, doesn't account for the footer height correctly on all screen sizes.
- No keyboard shortcut for section tabs (only Ctrl+K for search).
- User menu only has "My Profile" and "Sign Out" — missing "Switch Branch" and "Switch Role" for multi-branch admins.

**Missing states:**
- Empty state when user has no accessible modules (blank sidebar with no guidance)
- Network error banner when Supabase is unreachable
- Session expiry warning before auto-logout (30-min inactivity timer fires silently)

---

### 2. WaiterAppLayout.vue (`/waiter-app`)
**Target device:** Mobile phone (PWA, 375px–428px)  
**UX Maturity: 4/5**

**What works well:**
- Bottom navigation bar with 5 tabs (Home, POS, Tables, Inbox, Orders) is the correct mobile pattern
- Badge counts on Inbox and Orders tabs are real-time
- Off-shift banner is clear and descriptive
- Shift chip in header shows shift name or "Off Shift" status
- PWA install banner
- Dark mode support with custom dark overrides
- New order alert dialog slides from top
- Audio toggle with badge for total alerts
- Admin/manager "View as Waiter" selector is a power feature

**Issues found:**
- `src/layouts/WaiterAppLayout.vue:422` — Bottom tab "POS" leads to `/waiter-app/pos` but the file `src/pages/waiter-app/WaiterPOSPage.vue` exists — need to verify this route actually renders correctly (no 404).
- `src/layouts/WaiterAppLayout.vue:392-417` — Off-shift route guard uses `store.isOnShift && !store.loading` but if `store.loading` is true briefly on init, the guard may incorrectly redirect.
- `src/layouts/WaiterAppLayout.vue:447-460` — Font size boost is applied via both scoped `:deep()` AND unscoped global styles (lines 836-878) — duplicated, only one is needed.
- No swipe-to-refresh on any waiter page (mobile expectation).
- No haptic feedback on tab switch (mobile expectation).
- Bottom nav has 5 tabs — on very narrow phones (320px) the label text may overflow.
- Alert dialog at top covers content when order arrives mid-read.

**Missing states:**
- Loading skeleton on WaiterHomePage while store initializes
- Empty state on Inbox when no pending orders (encourages anxiety on first use)
- Network offline banner (exists in MainLayout as `<OfflineBanner />` but not wired in WaiterAppLayout)

---

### 3. ManagerAppLayout.vue (`/manager-app`)
**Target device:** Mobile tablet or phone  
**UX Maturity: 3/5**

**What works well:**
- Branch chip in header
- Notification bell with unread badge
- Messages icon with unread badge
- Theme toggle

**Issues found:**
- No bottom navigation — manager pages rely on full-page navigation only. A bottom nav bar would improve tablet UX significantly.
- `src/layouts/ManagerAppLayout.vue:79` — Branch info section visible in the source but the layout appears to cut off (read limit hit). Full audit needed.
- Manager app only has 3 pages visible: `AlertsPage`, `FloorOverviewPage`, `OrderList` — a very thin feature set compared to what a manager needs.

**Missing states:**
- No offline indicator
- No session expiry handling
- Missing pages: Manager Daily Summary, Staff Performance, Revenue Overview — pages exist in reports but not in the manager PWA

---

### 4. DeliveryAppLayout.vue (`/delivery-app`)
**Target device:** Mobile phone (landscape driving mode)  
**UX Maturity: 3/5**

**What works well:**
- Connection status chip (Live/Offline) in header — critical for delivery riders
- Navigation hiding during navigation (`v-if="!store.isNavigating"`) — safe for GPS mode

**Issues found:**
- Header hides completely during navigation (`v-if` instead of minimizing) — rider loses brand context.
- No bottom navigation for quick tab switching between Active/History.
- Google Maps component (`src/components/delivery/GoogleMapTracker.vue`) requires API key configuration — no UX fallback if key is missing.
- No ETA display in the header during active delivery.

**Missing states:**
- No map loading skeleton
- No empty state when no deliveries assigned
- No error state if delivery fetch fails

---

### 5. TouchMenuLayout.vue (`/touch`)
**Target device:** Customer tablet (kiosk) or customer's phone  
**UX Maturity: 4/5**

**What works well:**
- Glassmorphism header with blur backdrop is premium feel
- Cart badge count in real-time
- Loyalty avatar with points display
- Order tracking drawer (receipt_long icon)
- Dual theme (persisted in localStorage independently from ERP theme)
- Loyalty popup card with tier display
- Responsive header at 400px and 600px breakpoints

**Issues found:**
- `src/layouts/TouchMenuLayout.vue:355-374` — `resolveTableUuid()` falls back to the lowest active table if no table context — silently associates the order with a random table. This should show an error instead.
- `src/layouts/TouchMenuLayout.vue:259-301` — `addToCart` shows a notification on add but no animation feedback on the cart button (e.g. bounce effect). On a kiosk with greasy fingers, visual feedback is critical.
- Cart drawer width is hardcoded at 380px — on small phone screens this is nearly full-width (overlapping everything).
- No "Order Submitted" confirmation screen after placing order.
- `src/layouts/TouchMenuLayout.vue:449` — `--q-primary: #f97316` is set as inline style variable but doesn't propagate to Quasar's dark mode calculation correctly.

**Missing states:**
- Loading state while menu items fetch
- Error state if Supabase query fails
- Empty cart empty state

---

### 6. CustomerLayout.vue (`/menu`)
**Target device:** Customer's phone (online ordering)  
**UX Maturity: 2/5**

**Issues found:**
- Not read in this audit (layout exists but pages under `/menu` are sparse: `CustomerMenuPage.vue`, `OrderTrackingPage.vue`).
- Online menu is a growth vector for the business — low maturity is a concern.
- No PWA manifest for standalone customer ordering app.

---

### 7. AuthLayout.vue (`/auth`)
**Target device:** Any  
**UX Maturity: 3/5**

**What exists:** Login and forgot-password pages.

**Issues found:**
- No visual branding (restaurant logo, hero image) on auth pages — missed conversion opportunity.
- No "Remember me" option.
- No social login (irrelevant for internal ERP, but customer-facing auth at `/customer/auth` likely needs it).
- 30-min inactivity timer on ERP doesn't show a countdown warning — user loses unsaved work silently.

---

## Component Gaps

| Component | Status | Notes |
|-----------|--------|-------|
| `OfflineBanner` | Exists | Only wired in MainLayout, missing from PWA layouts |
| `GlobalSearch` | Exists | Only in MainLayout |
| `NotificationToast` | Exists | Only in MainLayout |
| `LoadingScreen` | Exists (`src/components/LoadingScreen.vue`) | Not consistently used across pages |
| `EmptyState` | Exists (`src/components/common/EmptyState.vue`) | Not consistently used — many pages show empty `<div>` |
| `SyncStatusIndicator` | Exists | Not wired to visible UI in layouts |
| `AuditReasonDialog` | Exists | Only used in specific finance flows |
| `PermissionGate` | Exists | Usage inconsistent |
| `POSLockScreen` | Exists | Lock-screen for POS when cashier steps away — good |
| Kitchen Display (KDS) page | Exists (`src/stores/kitchenDisplayStore.js`) | No dedicated KDS layout found — likely rendered under MainLayout |

---

## Module UX Maturity Ratings

| Module | Maturity | Key Issues |
|--------|----------|------------|
| Dashboard | 3/5 | StatCards exist, charts exist, but no KPI drill-down |
| POS (Point of Sale) | 4/5 | Core flow works; lock screen exists; payment dialog present |
| Kitchen Display (KDS) | 3/5 | No dedicated fullscreen KDS layout; dark mode crucial |
| Orders | 3/5 | Kanban card exists; detail dialog exists |
| Table Management | 3/5 | Floor plan in manager-app; no interactive drag-drop |
| Reservations | 2/5 | WebsiteReservationsPage exists; calendar view missing |
| Inventory | 4/5 | Tabs: Dashboard, Items, Stock Levels, Ledger, Wastage, etc. |
| Procurement | 3/5 | Doc-lines editor exists; approval workflow UX missing |
| Finance | 3/5 | ERP-grade layout but mobile unfriendly |
| HR & Payroll | 4/5 | Premium KPI cards; tabs for attendance, leaves, payroll |
| Reports | 4/5 | 25+ report pages; ReportLayout component; print CSS exists |
| Website/Online | 2/5 | Messages, reservations, hall bookings — incomplete |
| Delivery | 3/5 | Map tracker exists; rider UX is sparse |
| Customers (CRM) | 2/5 | CustomerDetailPage exists; loyalty integration done |
| Notifications | 3/5 | Panel exists; real-time push via PWA |
| Settings/Admin | 3/5 | RolesPage, PrintersPage, SystemDashboard exist |
| Audit Logs | 2/5 | UserActivityLog in reports; no dedicated audit trail page |
| AI Analytics | 2/5 | Module folder exists at src/modules/ai/ — early stage |
| Devices | 2/5 | src/modules/devices/ exists — no UI pages visible |
| Waiter App | 4/5 | Best-in-class PWA for this codebase |

---

## Critical UX Issues (Must Fix)

1. **No offline indicator in PWA layouts** — WaiterAppLayout, DeliveryAppLayout, ManagerAppLayout are missing the `<OfflineBanner />` and `<NotificationToast />` components that MainLayout has.
2. **KDS needs a dedicated fullscreen dark layout** — Kitchen staff need maximum visibility; the current setup under MainLayout with sidebar is wrong for a kitchen screen.
3. **Empty states are inconsistent** — `.erp-empty-state` class is defined in the design system but many pages render a blank area with no guidance.
4. **Session expiry is silent** — A 30-min countdown warning dialog should appear at 5 minutes remaining.
5. **No confirmation screen after customer order placement** — Touch menu submits order and drops back to menu with only a toast notification.
6. **Table fallback in kiosk mode** silently assigns wrong table — must be a hard error.
