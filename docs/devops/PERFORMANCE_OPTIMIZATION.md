# Seven Waves Restaurant ERP — Performance Optimization Guide

> **Audience:** Tech Lead, Frontend Engineers, Backend Engineers, DevOps  
> **Last Updated:** 2026-07-16  
> **Status:** Active — apply all P1 items before production launch  

---

## Table of Contents

1. [Performance Targets & SLAs](#1-performance-targets--slas)
2. [Bundle Size Analysis](#2-bundle-size-analysis)
3. [Database Query Performance](#3-database-query-performance)
4. [Realtime Subscription Optimization](#4-realtime-subscription-optimization)
5. [Pinia Store Performance](#5-pinia-store-performance)
6. [PWA & Offline Performance](#6-pwa--offline-performance)
7. [Image Optimization](#7-image-optimization)
8. [Vue 3 Rendering Optimization](#8-vue-3-rendering-optimization)
9. [Network Optimization](#9-network-optimization)
10. [Monitoring & Profiling](#10-monitoring--profiling)
11. [Performance Optimization Roadmap](#11-performance-optimization-roadmap)
12. [Appendix: Code Patterns Reference](#12-appendix-code-patterns-reference)

---

## 1. Performance Targets & SLAs

### 1.1 Core Web Vitals Targets

| Metric | Target | Current Estimate | Measurement Tool |
|--------|--------|-----------------|-----------------|
| First Contentful Paint (FCP) | < 1.5s | ~2.0s (pre-opt) | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | ~3.5s (pre-opt) | Lighthouse |
| Time to Interactive (TTI) | < 3.0s | ~4.0s (pre-opt) | Lighthouse |
| Cumulative Layout Shift (CLS) | < 0.1 | Unknown | Lighthouse |
| First Input Delay (FID) | < 100ms | Unknown | Chrome UX Report |
| Interaction to Next Paint (INP) | < 200ms | Unknown | Lighthouse |

**Why this matters for a restaurant POS:** A waiter with a table waiting cannot tolerate a 5-second load time. The POS must be interactive within 3 seconds on a mid-range Android tablet on WiFi.

### 1.2 Operational Performance Targets

| Operation | Target (p95) | Target (p99) | Measurement |
|-----------|-------------|-------------|-------------|
| POS item lookup (barcode) | < 200ms | < 500ms | Custom metric |
| Send to Kitchen | < 1s | < 2s | Custom metric |
| Accept Order (waiter) | < 1.5s | < 3s | Custom metric |
| KOT delivery to kitchen screen | < 1s | < 2s | Realtime latency |
| Dashboard load (all charts) | < 3s | < 5s | Lighthouse |
| Report generation (daily sales) | < 5s | < 10s | Custom metric |
| Inventory search | < 300ms | < 800ms | Custom metric |
| Login time (cache hit) | < 500ms | < 1s | Custom metric |
| Login time (cache miss) | < 2s | < 3s | Custom metric |

### 1.3 Scalability Targets

| Dimension | Current Capacity | Target Capacity | Bottleneck |
|-----------|-----------------|----------------|-----------|
| Concurrent users | ~50 | 500 | Supabase Realtime connections |
| Concurrent orders/hour | ~200 | 2,000 | DB write throughput |
| Active branches | 1 (tested) | 50 | Realtime channel count |
| Menu items | < 500 | 5,000 | Client-side rendering |
| Order history (per branch) | < 10,000 | 1,000,000 | Missing pagination + indexes |

---

## 2. Bundle Size Analysis

### 2.1 Current Bundle Composition (Post-Optimization)

After DevOps optimizations (Phase 0), the bundle structure is:

```
dist/spa/assets/
├── index-{hash}.js              ~3KB gz    ← Entry point (tiny — good!)
├── vendor-vue-{hash}.js         ~139KB gz  ← Vue 3 + Pinia + Vue Router
├── vendor-quasar-{hash}.js      ~19KB gz   ← Quasar core (tree-shaken)
├── vendor-supabase-{hash}.js    ~?KB gz    ← @supabase/supabase-js
├── vendor-charts-{hash}.js      ~132KB gz  ← ApexCharts (NOW LAZY after fix)
├── vendor-http-{hash}.js        ~?KB gz    ← axios
├── vendor-utils-{hash}.js       ~?KB gz    ← lodash
├── vendor-{hash}.js             ~101KB gz  ← Other vendor catch-all
│
├── [lazy — loaded only on demand]
├── vendor-excel-{hash}.js       ~384KB gz  ← xlsx/exceljs (lazy ✓)
├── vendor-pdf-{hash}.js         ~155KB gz  ← jsPDF (lazy ✓)
├── mod-finance-{hash}.js        ~?KB gz    ← Finance module (lazy ✓)
├── mod-devices-{hash}.js        ~23KB gz   ← Device management (lazy ✓)
├── mod-ai-{hash}.js             ~173KB gz  ← AI module (NOW LAZY after fix)
└── [route chunks per page]      ~5-30KB gz each
```

**Initial HTML preload list (blocking or near-blocking):**
- `index-*.js` (3KB) — entry
- `vendor-vue-*.js` (139KB) — framework, needed immediately
- `vendor-quasar-*.js` (19KB) — UI framework
- `vendor-supabase-*.js` — auth client, needed immediately
- `vendor-http-*.js` — axios, needed immediately
- `vendor-*.js` (101KB catch-all) — mixed, investigate

**NOT in initial preload (lazy loaded on demand):**
- `vendor-charts-*.js` — only when dashboard is viewed
- `vendor-excel-*.js` — only on export action
- `vendor-pdf-*.js` — only on print action
- `mod-ai-*.js` — only on /ai/* routes
- `mod-finance-*.js` — only on /finance/* routes
- All page route chunks — loaded on navigation

### 2.2 Bundle Size Budget

| Chunk | Current (gz) | Budget | Status | Action |
|-------|-------------|--------|--------|--------|
| Initial blocking JS total | ~370KB | < 300KB | ⚠️ Over | See §2.3 |
| vendor-charts | 132KB | 0KB initial | ✅ Fixed | Lazy via defineAsyncComponent |
| mod-ai | 173KB | 0KB initial | ✅ Fixed | Removed from manualChunks |
| vendor-excel | 384KB | 0KB initial | ✅ Fixed | Lazy since DevOps Phase 0 |
| vendor-pdf | 155KB | 0KB initial | ✅ Fixed | Lazy since DevOps Phase 0 |
| vendor-vue | 139KB | 139KB | ✅ Acceptable | Can't reduce |
| vendor catch-all | 101KB | < 100KB | ⚠️ Close | Investigate §2.4 |

### 2.3 Dependency Audit

Full audit of `package.json` production dependencies:

#### Critical Path (always loaded)
| Package | Size (gz est.) | Purpose | Optimizable? |
|---------|---------------|---------|-------------|
| `vue` | ~50KB | Framework | No |
| `pinia` | ~10KB | State | No |
| `vue-router` | ~15KB | Routing | No |
| `quasar` | ~19KB (tree-shaken) | UI | Partial — only import used components |
| `@supabase/supabase-js` | ~40KB | DB client | No |
| `axios` | ~13KB | HTTP | **Yes** — replace with native `fetch` |
| `vue-i18n` | ~15KB | Translations | Partial — lazy load locale files |

#### Lazy Loaded (not on critical path)
| Package | Size (gz) | Trigger | Status |
|---------|----------|---------|--------|
| `apexcharts` + `vue3-apexcharts` | ~132KB | Dashboard view | ✅ Now lazy |
| `exceljs` | ~384KB | Export action | ✅ Lazy |
| `xlsx` | ~?KB | Duplicate of exceljs? | ⚠️ Audit |
| `jspdf` + `jspdf-autotable` | ~155KB | Print action | ✅ Lazy |
| `html2canvas` | ~?KB | Screenshot/PDF | Should be lazy |
| `@google/generative-ai` | ~173KB total | AI routes | ✅ Now lazy |
| `leaflet` | ~40KB | Delivery map | Should be lazy (only /delivery-app/map) |
| `qrcode` | ~10KB | QR generation | Acceptable size |
| `html-to-image` | ~?KB | Export | Should be lazy |
| `file-saver` | ~3KB | Download | OK |

#### Candidates for Removal or Replacement
| Package | Replacement | Savings | Effort |
|---------|-------------|---------|--------|
| `axios` | Native `fetch` | ~13KB gz | 4h |
| `xlsx` (if duplicate) | Already have `exceljs` | ~?KB | 2h |
| `apexcharts` (heavy) | `uPlot` (7KB) for simple charts | ~125KB | 2 days |
| `leaflet` | Mapbox GL (if needed) or remove | ~40KB initial | 4h |

### 2.4 Catch-All Vendor Chunk Investigation

The `vendor-*.js` catch-all at 101KB gz contains libraries that don't match any named `manualChunks` pattern. To identify what's inside:

```bash
# Run bundle analysis
# 1. Enable analyze in quasar.config.js temporarily:
#    analyze: true
# 2. Build and open the generated rollup-plugin-visualizer report
npx quasar build
# Open dist/spa/stats.html to see chunk contents
```

Likely contents of catch-all:
- `vue-i18n` (locale handling)
- `register-service-worker`
- `file-saver`
- Small utility packages
- Any unlisted Quasar plugins

**Action:** Split `vue-i18n` into its own chunk to improve debugging:
```javascript
// In quasar.config.js manualChunks:
if (id.includes('vue-i18n') || id.includes('@intlify')) return 'vendor-i18n'
if (id.includes('leaflet')) return 'vendor-maps'  // lazy load separately
```

### 2.5 Lazy Loading Audit — Router (src/router/routes.js)

**Current status:** All routes already use `() => import(...)` dynamic imports. ✅

```javascript
// All routes follow this pattern — correct:
component: () => import('pages/POSPage.vue'),
component: () => import('src/modules/ai/pages/AiDashboardPage.vue'),
```

**No static imports found in router.** All page components are lazy.

### 2.6 Component Lazy Loading — `defineAsyncComponent`

Beyond route-level code splitting, heavy components used within eagerly-loaded pages should also be async:

| Component | Size | Used In | Status | Fix |
|-----------|------|---------|--------|-----|
| `DashboardChart.vue` (ApexCharts) | ~132KB | DashboardPage | ✅ Fixed | `defineAsyncComponent` |
| `AiForecastChart.vue` | Small (no direct ApexCharts) | AI module | ✅ AI is lazy | Already in lazy chunk |
| Map component (if any) | ~40KB | DeliveryMap | Check | Should be async |
| Heavy dialogs (BillDialog, etc.) | ~?KB | CashierPage | Low priority | Consider async |

**Pattern for component lazy loading:**
```vue
<!-- BEFORE: statically imported, always bundled with parent -->
<script setup>
import HeavyChart from './HeavyChart.vue'
</script>

<!-- AFTER: loaded on first render, not bundled with parent -->
<script setup>
import { defineAsyncComponent } from 'vue'
const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'))
</script>

<!-- With loading/error states: -->
<script setup>
import { defineAsyncComponent } from 'vue'
const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: ChartSkeleton,   // shown while loading
  errorComponent: ChartError,         // shown on load failure
  delay: 200,                          // wait before showing loading
  timeout: 10000,                      // error after 10s
})
</script>
```

---

## 3. Database Query Performance

### 3.1 N+1 Query Patterns — Store Audit

An N+1 query pattern occurs when fetching N records triggers N additional queries. With Supabase PostgREST's nested select syntax, N+1 is avoidable.

#### 3.1.1 cashierStore.js — GOOD (No N+1)

The cashier store already uses nested selects correctly:

```javascript
// src/stores/cashierStore.js — correct pattern
const { data } = await supabase
  .from('orders')
  .select(`
    id, order_number, order_type, status, total_amount,
    restaurant_tables ( table_number, section ),
    waiter:profiles!orders_waiter_id_fkey ( full_name ),
    order_items (
      id, quantity, unit_price, notes,
      menu_items ( id, name )
    ),
    kot_tickets (
      id, kot_number, status,
      kot_items ( id, order_item_id, quantity, status )
    ),
    invoices ( id, invoice_number, total, payment_status )
  `)
  .eq('branch_id', bid)
  .limit(300)
```

Single query fetching all related data. ✅

#### 3.1.2 kitchenDisplayStore.js — GOOD (No N+1)

```javascript
// src/stores/kitchenDisplayStore.js — correct pattern
const selectFields = `
  id, order_id, kitchen_id, kot_number, status, created_at,
  order:orders!inner (
    order_number, order_type, table:restaurant_tables ( table_number )
  ),
  kot_items (
    id, quantity, notes, status,
    order_item:order_items ( ... )
  )
`
```

Single query. ✅

#### 3.1.3 waiterOrderStore.js — ONE N+1 FOUND AND FIXED

**Bug (now fixed):** After fetching shift branches via `auth_get_shift_branches()`, the store was making a separate query to get `company_id`:

```javascript
// BEFORE (bug — extra DB call):
const { data: branches } = await supabase.rpc('auth_get_shift_branches')
// Then separately:
const { data: branchData } = await supabase
  .from('branches')
  .select('company_id')
  .eq('id', branchId.value)
  .single()  // ← REDUNDANT — authStore already has this data

// AFTER (fixed — zero extra calls):
const activeBranch = authStore.branches.find((b) => b.branches?.id === branchId.value)
companyId.value = activeBranch?.branches?.company_id ?? authStore.currentBranch?.company_id
```

**Fix applied in Phase 0.** ✅

#### 3.1.4 Other Stores — Areas to Watch

| Store | Risk Area | Recommendation |
|-------|-----------|---------------|
| `orderStore.js` | `loadParkedOrders()` — fetches orders only, may not join items | Verify select includes order_items |
| `managerAppStore.js` | `loadOrders()` — check if joins waiter/table in one query | Should join profiles, restaurant_tables |
| `inventoryQueueStore.js` | Stock movements — may lack recipe joins | Add ingredient joins where needed |
| `deliveryStore.js` | Delivery assignments — check if joins customer/order | Add order join |

**General rule:** Every `supabase.from('table').select('*')` without nested selects is a potential N+1 if code later accesses related records.

### 3.2 Missing Database Indexes

The following indexes are critical for performance and are not yet confirmed to exist. Cross-reference with `docs/database/DATABASE_DESIGN.md`:

```sql
-- ── Orders (most queried table in the system) ─────────────────────────

-- Billing queue (branch + unpaid statuses)
CREATE INDEX IF NOT EXISTS idx_orders_branch_status
  ON orders(branch_id, status)
  WHERE status NOT IN ('paid', 'completed', 'voided', 'cancelled');

-- Date range queries (all reports)
CREATE INDEX IF NOT EXISTS idx_orders_branch_created_at
  ON orders(branch_id, created_at DESC);

-- Waiter inbox (pending_waiter + no assigned waiter)
CREATE INDEX IF NOT EXISTS idx_orders_pending_waiter
  ON orders(branch_id, created_at)
  WHERE status = 'pending_waiter' AND assigned_waiter_id IS NULL;

-- ── KOT Tickets ───────────────────────────────────────────────────────

-- KDS view (kitchen + active status)
CREATE INDEX IF NOT EXISTS idx_kot_tickets_kitchen_status
  ON kot_tickets(kitchen_id, status, created_at)
  WHERE status NOT IN ('completed', 'voided');

-- ── Menu Items ────────────────────────────────────────────────────────

-- POS item search (name, trigram for fuzzy)
-- Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_menu_items_name_trgm
  ON menu_items USING gin(name gin_trgm_ops);

-- Barcode lookup (fast scan-to-add)
CREATE INDEX IF NOT EXISTS idx_menu_items_barcode
  ON menu_items(barcode)
  WHERE barcode IS NOT NULL;

-- ── Inventory ─────────────────────────────────────────────────────────

-- Stock level by branch (inventory dashboard)
CREATE INDEX IF NOT EXISTS idx_stock_levels_branch
  ON stock_levels(branch_id, item_id);

-- Stock movements by date (inventory ledger report)
CREATE INDEX IF NOT EXISTS idx_stock_movements_date
  ON stock_movements(branch_id, created_at DESC);

-- ── HR & Attendance ───────────────────────────────────────────────────

-- Attendance by employee + date (payroll calculation)
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance_records(employee_id, punch_time DESC);

-- ── Notifications ─────────────────────────────────────────────────────

-- Unread notifications (notification badge count)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- ── Finance ───────────────────────────────────────────────────────────

-- Journal entries by period (trial balance, P&L)
CREATE INDEX IF NOT EXISTS idx_journal_entries_period
  ON journal_entries(branch_id, created_at)
  WHERE status = 'posted';

-- ── Auth & RLS Helper Performance ─────────────────────────────────────

-- auth_is_on_shift() calls shifts table per-row — add covering index
CREATE INDEX IF NOT EXISTS idx_shifts_employee_date
  ON shifts(employee_id, branch_id, shift_date);
```

**Impact table:**
| Index | Query Improved | Expected Speedup |
|-------|---------------|-----------------|
| idx_orders_branch_status | Billing queue fetch | 100× (table scan → index seek) |
| idx_orders_pending_waiter | Waiter inbox | 100× |
| idx_menu_items_name_trgm | POS search | Enables fuzzy search (<100ms) |
| idx_kot_tickets_kitchen_status | KDS ticket fetch | 50× |
| idx_attendance_employee_date | Payroll run | 20× |
| idx_notifications_user_unread | Notification count | 50× |

### 3.3 auth_is_on_shift() Performance Risk

**Problem:** `auth_is_on_shift(branch_id)` is called as an RLS filter function. With PostgreSQL RLS, this function is called once per row scanned — not once per query. At 1,000 orders in a branch, this means 1,000 function calls per query.

**Current function (simplified):**
```sql
-- Called N times for N rows (per-row evaluation)
CREATE FUNCTION auth_is_on_shift(p_branch_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM shifts
    WHERE employee_id = auth.uid()
      AND branch_id = p_branch_id
      AND shift_date = CURRENT_DATE
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**Solution options (in priority order):**

**Option A: Session variable caching (Best — low effort)**
```sql
-- Set once per session after login (in auth RPC):
SELECT set_config('app.is_on_shift_' || branch_id::text, 'true', false);

-- RLS policy uses cached value:
CREATE POLICY "waiter_shift_check" ON orders
  FOR SELECT TO authenticated
  USING (
    branch_id = current_setting('app.active_branch_id', true)::uuid
    AND current_setting('app.is_on_shift_' || branch_id::text, true) = 'true'
  );
```

**Option B: Covering index on shifts (Low effort, partial improvement)**
```sql
-- The index above (idx_shifts_employee_date) reduces the shift lookup
-- from a table scan to an index-only scan
CREATE INDEX idx_shifts_employee_date ON shifts(employee_id, branch_id, shift_date);
```

**Option C: Materialized RLS via branch_id filter (Best for scale)**
```sql
-- Instead of calling a function per-row, filter by branch_id directly
-- (branch_id is already indexed). The waiter can only be on shift for
-- branches in their authStore, so the frontend already filters.
-- For scale: remove per-row shift check from SELECT policy on orders table
-- and enforce via the RPC layer (which already checks shifts).
```

**Recommendation:** Implement Option B immediately (add index), plan Option A for sprint 2.

### 3.4 Slow Query Candidates

Queries that will degrade as data grows:

| Query | Current State | Scale Problem | Fix |
|-------|-------------|---------------|-----|
| Daily sales report (`SUM(total_amount)`) | Works under 10K orders | Slow at 1M+ orders | Partition by month OR materialized view |
| Menu item search (`ILIKE '%term%'`) | Works under 500 items | No fuzzy, slow at 5K+ | `pg_trgm` GIN index |
| Payroll calculation (aggregate attendance) | Works for 1 month | Slow with 3+ years data | Index + date range filter |
| Order history with all joins | Works under 300 orders | Timeout at 10K+ | CURSOR pagination + limit |
| Inventory valuation (qty × cost) | Works under 1K items | Slow at 10K+ items | Materialized view updated nightly |
| Audit log search | No index | Will be slow immediately | Add indexes on (event_type, created_at) |

### 3.5 Query Optimization Patterns

#### Always Use Nested Selects Instead of N+1 Loops

```typescript
// ❌ NEVER — N+1 pattern:
const orders = await supabase.from('orders').select('*').eq('branch_id', branchId)
for (const order of orders.data!) {
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
  order.items = items  // N queries for N orders → very slow
}

// ✅ ALWAYS — single query with join:
const { data: orders } = await supabase
  .from('orders')
  .select(`
    *,
    order_items (
      id, quantity, unit_price, notes,
      menu_items ( id, name, category_id )
    ),
    restaurant_tables ( table_number, section ),
    waiter:profiles!orders_assigned_waiter_id_fkey ( full_name )
  `)
  .eq('branch_id', branchId)
  .in('status', ['pending_waiter', 'accepted', 'preparing'])
  .order('created_at', { ascending: false })
  .limit(50)   // ALWAYS limit!
```

#### Always Paginate Large Result Sets

```typescript
// ❌ NEVER — unbounded query:
const { data } = await supabase.from('orders').select('*').eq('branch_id', bid)
// Could return 100,000+ rows — crash

// ✅ Cursor-based pagination (for realtime lists):
const { data } = await supabase
  .from('orders')
  .select('id, order_number, status, created_at, total_amount')
  .eq('branch_id', branchId)
  .lt('created_at', cursor ?? new Date().toISOString())
  .order('created_at', { ascending: false })
  .limit(20)
// cursor = last item's created_at for next page

// ✅ Offset pagination (for reports/static views):
const { data, count } = await supabase
  .from('orders')
  .select('*', { count: 'exact' })
  .eq('branch_id', branchId)
  .range(page * pageSize, (page + 1) * pageSize - 1)
  .order('created_at', { ascending: false })
```

#### Select Only What You Need

```typescript
// ❌ Over-selecting — sends unnecessary data over network:
const { data } = await supabase.from('menu_items').select('*')
// Returns: id, name, price, description, image_url, is_available, category_id,
//          kitchen_id, barcode, allergens, nutritional_info, created_at, ...

// ✅ Select only what the component needs:
const { data } = await supabase
  .from('menu_items')
  .select('id, name, price, image_url, category_id, kitchen_id, is_available')
  .eq('branch_id', branchId)
  .eq('is_available', true)
  .order('category_id, name')
```

---

## 4. Realtime Subscription Optimization

### 4.1 Current Subscription Audit

Based on reading `src/core/realtime/channel.registry.ts` and all store files:

#### 4.1.1 RealtimeManager Channels (from registry)

| Channel Key | Table | Scope | Permission Required |
|------------|-------|-------|-------------------|
| `orders:{branchId}` | orders | branch | pos.order.create |
| `payments:{branchId}` | payments | branch | pos.order.create |
| `cashier:{branchId}` | cashier_sessions | branch | pos.session.open |
| `kitchen:{branchId}` | kot_tickets | branch | kitchen.view |
| `kot-items:{branchId}` | kot_items | branch | kitchen.view |
| `tables:{branchId}` | restaurant_tables | branch | operations.view |
| `table-sessions:{branchId}` | table_sessions | branch | operations.view |
| `stock:{branchId}` | stock_levels | branch | inventory.view |
| `notifications:{userId}` | notifications | user | dashboard.view |
| `delivery:{branchId}` | delivery_orders | branch | delivery.view |
| `audit:{branchId}` | audit_logs | branch | audit.view |

**Total from registry: ~11 channels** (permission-gated, not all active for every role)

#### 4.1.2 Ad-Hoc Store Channels (ADDITIONAL — not in registry)

| Store | Channel Name | Table | Duplicate of Registry? |
|-------|-------------|-------|----------------------|
| waiterOrderStore | `waiter-orders-rt` | orders | ✅ YES — `orders:{branchId}` |
| waiterOrderStore | `waiter-orders-rt-{bId}` | orders | ✅ YES — per branch |
| waiterOrderStore | `waiter-kot-rt` | kot_tickets | ✅ YES — `kitchen:{branchId}` |
| waiterAppStore | `waiter-app-orders` | orders | ✅ YES |
| waiterAppStore | `waiter-app-kot-{branchId}` | kot_tickets | ✅ YES |
| waiterAppStore | `waiter-app-notifs` | notifications | ✅ YES |
| waiterAppStore | `waiter-app-points` | loyalty_points | Possibly new |
| cashierStore | `cashier-orders-{branchId}` | orders | ✅ YES |
| kitchenDisplayStore | `kds-{kitchenId}` | kot_tickets | ⚠️ Kitchen-filtered (different from branch) |
| deliveryStore | `delivery-queue-{bid}` | delivery_assignments | New table |
| deliveryStore | `delivery-orders-watch-{bid}` | orders | ✅ YES |
| kotOrchestrationStore | `kot-batches-{kitchenId}` | kot_tickets | Partially overlap |
| managerAppStore | `mgr-orders-{branchId}` | orders | ✅ YES |
| managerAppStore | `mgr-kot-{branchId}` | kot_tickets | ✅ YES |
| managerAppStore | `mgr-waiter-profiles-{branchId}` | waiter_profiles | New |
| managerAppStore | `mgr-messages-{branchId}` | manager_messages | New |
| managerAppStore | `mgr-alerts-{branchId}` | manager_alerts | New |
| notifications | `notifications:{userId}` | notifications | ✅ YES — registry |
| customerOrderStore | `order-tracking-{orderId}` | orders | New (order-specific) |
| customerOrderStore | `kot-tracking-{orderId}` | kot_tickets | New (order-specific) |
| inventoryQueueStore | `inventory-stock-rt-{branchId}` | stock_levels | ✅ YES — registry |

**Total ad-hoc channels: ~20 additional**

**Maximum concurrent channels for a single admin user:** ~31 channels (11 registry + 20 ad-hoc)

### 4.2 Supabase Realtime Limits

| Plan | Concurrent Connections | Messages/Second | Channels/Connection |
|------|----------------------|----------------|---------------------|
| Free | 200 | 100 | No hard limit |
| Pro | 500 | 500 | No hard limit |
| Team | 1,000+ | Custom | Custom |

**Channels per connection:** Supabase allows multiple postgres_changes listeners on a single channel. The limit is the number of CONNECTED clients, not channels.

**Risk analysis:**
- 40 branches × 5 concurrent staff = 200 connections → **hitting free tier limit**
- With Pro plan: 40 × 12 = 480 → safe on Pro, risky near peak

**Immediate action:** Upgrade to Pro plan before scaling to 40+ branches.

### 4.3 Duplicate Subscription Problem

**Critical:** Many stores subscribe to the **same table on the same branch** creating redundant event deliveries:

```
Example: Admin user on the POS page
├── RealtimeManager → orders:{branchId}     → handleOrderEvent()
├── cashierStore   → cashier-orders-{bid}   → fetchBillingQueue()
└── managerAppStore → mgr-orders-{branchId} → loadOrders()

Result: Every order INSERT fires 3 handlers — 3 unnecessary re-fetches
```

**Fixed so far (Phase 0):**
- kitchenDisplayStore's `orders` subscription removed ✅ (Backup agent, session 2026-07-16)

**Remaining (requires Frontend design decision):**
- waiterOrderStore + waiterAppStore both subscribe to orders — intentional for separate responsibilities but wasteful
- managerAppStore subscribes to orders independently of RealtimeManager
- cashierStore subscribes to orders independently

### 4.4 Channel Consolidation Strategy

**Target architecture:** One channel per `(table, filter)` combination per session.

```typescript
// BEFORE: 3 channels watching the same orders table at the same branch
// cashierStore:
supabase.channel('cashier-orders-main-branch')
  .on('postgres_changes', { table: 'orders', filter: `branch_id=eq.${bid}` }, handler1)
  .subscribe()

// managerAppStore:
supabase.channel('mgr-orders-main-branch')
  .on('postgres_changes', { table: 'orders', filter: `branch_id=eq.${bid}` }, handler2)
  .subscribe()

// RealtimeManager:
supabase.channel('orders:main-branch')
  .on('postgres_changes', { table: 'orders', filter: `branch_id=eq.${bid}` }, handler3)
  .subscribe()

// AFTER: RealtimeManager owns the channel, dispatches to interested stores
// RealtimeManager channel:
supabase.channel('orders:main-branch')
  .on('postgres_changes', { table: 'orders', filter: `branch_id=eq.${bid}` }, (payload) => {
    // Dispatch to all interested handlers
    eventBus.emit('orders:change', payload)
  })
  .subscribe()

// Stores listen to the event bus, not Supabase directly:
// cashierStore:
eventBus.on('orders:change', (payload) => { fetchBillingQueue() })

// managerAppStore:
eventBus.on('orders:change', (payload) => { loadOrders() })
```

**Implementation path:**
1. Extend `EVENT_HANDLER_MAP` in `src/core/realtime/event.handlers.ts` to dispatch to multiple stores
2. Remove ad-hoc Supabase subscriptions from individual stores
3. Each store registers a handler callback via `realtimeManager.on('orders', handler)`

**Effort:** 3–5 days for complete consolidation. Prioritize after launch.

### 4.5 Subscription Lifecycle Management

**Every subscription must be cleaned up on unmount.** Audit findings:

```typescript
// ✅ GOOD — cashierStore has cleanup:
function cleanup() {
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel)
    ordersChannel = null
  }
}

// ✅ GOOD — managerAppStore has cleanup (fixed in Phase 0 to call before re-subscribe):
function subscribeRealtime() {
  cleanup()  // ← added in Phase 0
  // ... subscribe
}

// ⚠️ CHECK — waiterAppStore cleanup:
// Verify all 4 channels (waiter-app-orders, waiter-app-kot-*, waiter-app-notifs, waiter-app-points)
// are all cleaned up in the cleanup() function

// ⚠️ CHECK — deliveryStore:
// Fixed Date.now() antipattern (Phase 0), verify cleanup covers both channels
```

**Composable pattern for safe subscriptions:**
```typescript
// src/composables/useRealtimeChannel.ts
export function useRealtimeChannel(channelName: string, setup: (channel: RealtimeChannel) => RealtimeChannel) {
  let channel: RealtimeChannel | null = null

  onMounted(() => {
    channel = setup(supabase.channel(channelName))
    channel.subscribe()
  })

  onUnmounted(() => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  })

  return { channel }
}
```

---

## 5. Pinia Store Performance

### 5.1 Store Memory Management

**Risk:** Stores that accumulate data without clearing will consume increasing memory over a long POS session (e.g., 8-hour shift):

| Store | Data Accumulation Risk | Fix |
|-------|----------------------|-----|
| `kitchenDisplayStore` | KOT tickets array grows as orders come in | Clear completed tickets after X minutes |
| `orderStore` (parkedOrders) | Parked orders accumulate if never cleared | Clear on shift close |
| `notifications` | Notification history grows unboundedly | Limit to last 50 notifications in state |
| `cashierStore` (billingOrders) | Re-fetches full list on each event | Limit to 300 with smart insert/remove |
| `managerAppStore` (orders) | All orders loaded, no pagination | Implement cursor pagination |
| `waiterAppStore` (acceptedOrders) | Orders array grows during shift | Clear completed orders after serve |

**Example fix for notifications store:**
```typescript
// In notifications store — cap in-memory list
function addNotification(notif: Notification) {
  notifications.value.unshift(notif)
  if (notifications.value.length > 50) {
    notifications.value = notifications.value.slice(0, 50)  // keep last 50
  }
}
```

### 5.2 Computed Property Optimization

Computed properties in Pinia (and Vue) are cached — they only recalculate when dependencies change. But misconfigured computed properties can cause unnecessary recalculations:

```typescript
// ✅ GOOD — computed in orderStore:
const total = computed(() =>
  taxableAmount.value + taxAmount.value + serviceChargeAmount.value
)
// Recalculates only when taxableAmount, taxAmount, or serviceChargeAmount change

// ❌ AVOID — method in template that runs on every render:
// template: {{ calculateTotal() }}
// This runs on every re-render, even unrelated state changes

// ✅ CORRECT — use computed for derived values, not methods:
const pendingCount = computed(() =>
  billingOrders.value.filter(o => o.status === 'pending_waiter').length
)
// Cached — only updates when billingOrders changes
```

### 5.3 Reactivity Optimization

```typescript
import { ref, shallowRef, markRaw, readonly } from 'vue'

// ❌ Deep reactive for large non-nested arrays — unnecessary overhead
const menuItems = ref([...1000 items...])  // tracks every nested property

// ✅ shallowRef for arrays where only the array reference changes (not item properties)
const menuItems = shallowRef([...1000 items...])  // only tracks array reference
// (when you add/remove items but don't modify existing items in place)

// ✅ markRaw for objects that should never be reactive (device configs, static data)
const deviceConfig = markRaw({ ip: '192.168.1.100', port: 9100 })
// Prevents Vue from tracking this object's properties — no overhead

// ✅ readonly for stores that should not be mutated outside their actions
const state = readonly(internalState)  // expose read-only to components
```

**Apply `shallowRef` in these stores:**
- `cashierStore.billingOrders` — large array, items replaced not mutated
- `kitchenDisplayStore.tickets` — same
- `waiterOrderStore.pendingOrders` — same

**Apply `markRaw` to:**
- Realtime channel references (`ordersChannel`, `kotChannel`) — Supabase objects should not be reactive
- Supabase client instance
- Hardware device connection objects

### 5.4 Store Initialization Race Conditions

**Issue:** Multiple stores watch `authStore.currentBranch?.id` and initialize when it becomes available. This creates initialization races:

```typescript
// waiterOrderStore:
const waiterId = computed(() => authStore.user?.id)

// cashierStore:
watch(branchId, (newId) => {
  if (newId && !booted) initialize()
}, { immediate: true })
```

**Risk:** If `authStore` is slow to populate `branches`, these stores may initialize with `null` branch and never retry properly.

**Best practice:**
```typescript
// Wait for authStore to be fully initialized with a branch:
async function initialize() {
  // Ensure authStore is ready
  if (!authStore.initialized || !authStore.currentBranch?.id) {
    await new Promise<void>((resolve) => {
      const unwatch = watch(
        () => authStore.currentBranch?.id,
        (id) => { if (id) { unwatch(); resolve() } },
        { immediate: true }
      )
    })
  }
  // Now safe to initialize with a known branch
}
```

---

## 6. PWA & Offline Performance

### 6.1 Service Worker Caching Strategy (Workbox)

**Current config (added in Phase 0):**
```javascript
// quasar.config.js — extendGenerateSWOptions
cfg.skipWaiting = true        // Activate new SW immediately
cfg.clientsClaim = true       // Take control of all open tabs
cfg.cleanupOutdatedCaches = true

cfg.runtimeCaching = [
  {
    // JS, CSS, fonts: stale-while-revalidate
    urlPattern: /\.(?:js|css|woff2?)$/i,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'static-assets',
      expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }
    }
  },
  {
    // Images: cache-first (rarely change)
    urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
    handler: 'CacheFirst',
    options: {
      cacheName: 'image-assets',
      expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }
    }
  },
  {
    // Supabase REST API: network-first with cache fallback
    urlPattern: /https:\/\/.*\.supabase\.co\/rest\//i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'supabase-api',
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 }
    }
  }
]
```

**Recommended additions:**

```javascript
// Add to runtimeCaching:
{
  // Supabase Auth: network-first (always need fresh tokens)
  urlPattern: /https:\/\/.*\.supabase\.co\/auth\//i,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'supabase-auth',
    networkTimeoutSeconds: 3,
    expiration: { maxEntries: 10, maxAgeSeconds: 60 }
  }
},
{
  // Google Fonts (loaded in erp-theme.scss): cache-first, long TTL
  urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'google-fonts',
    expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }
  }
},
{
  // App shell (HTML): network-first so updates reach users
  urlPattern: /\/$/,
  handler: 'NetworkFirst',
  options: {
    cacheName: 'app-shell',
    networkTimeoutSeconds: 3
  }
}
```

### 6.2 App Shell Architecture

The Seven Waves ERP uses an app-shell architecture (SPA):

```
App Shell (cached, instant) + Data (network, progressive)
├── AuthLayout.vue     → Cached in SW
├── MainLayout.vue     → Cached in SW
├── WaiterAppLayout    → Cached in SW (PWA target)
└── DeliveryAppLayout  → Cached in SW (PWA target)
```

**Key principle:** The skeleton/layout loads from cache (<100ms). Data fetches run asynchronously. Loading skeletons fill gaps while data arrives.

**Check for loading states in critical pages:**
- POS page: does it show skeleton while menu loads? If not, add.
- Waiter inbox: does it show "Loading..." appropriately?
- KDS: shows empty state or spinner while tickets load?

### 6.3 IndexedDB for Offline-First

Current: `src/core/offline/OfflineSyncEngine.ts` + `offlineDb.ts`

**What should be stored in IndexedDB:**
```typescript
// src/core/offline/offlineDb.ts — recommended stores
const STORES = {
  // Pending writes (critical — must sync)
  pendingOrders: { keyPath: 'localId', indexes: ['status', 'createdAt'] },
  pendingPayments: { keyPath: 'localId' },
  pendingAttendance: { keyPath: 'localId' },

  // Cached reads (nice-to-have for offline browsing)
  menuItems: { keyPath: 'id', indexes: ['categoryId', 'branchId'] },
  branchConfig: { keyPath: 'id' },
  customers: { keyPath: 'id', indexes: ['phone'] },

  // Offline print queue
  printJobs: { keyPath: 'id', indexes: ['status', 'priority'] }
}
```

**Sync conflict resolution:**
- Orders: server wins (order status changes are authoritative)
- Inventory adjustments: last-write-wins with audit trail
- Attendance: merge (both records preserved, flagged for review)

### 6.4 PWA Offline UX Checklist

- [ ] Offline banner shown in all layouts (MainLayout, WaiterAppLayout, DeliveryAppLayout, ManagerAppLayout) ✅ Fixed by UIDesigner
- [ ] POS works offline for order creation (queues to IndexedDB)
- [ ] Waiter app shows last-known orders when offline
- [ ] KDS shows cached tickets when offline
- [ ] Clear indication of sync status (pending N changes)
- [ ] Auto-sync on reconnect with progress indicator
- [ ] Retry failed requests with exponential backoff

---

## 7. Image Optimization

### 7.1 Menu Item Photos

Menu item images are loaded in the POS, touch menu, and customer menu. Optimization is critical for mobile performance.

**Current state:** Unknown — check how images are uploaded and served.

**Recommended approach:**

```typescript
// Use Supabase Storage image transformation (built-in CDN transform):
function getMenuItemImageUrl(imagePath: string, width = 300, quality = 80): string {
  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/render/image/public`
  return `${baseUrl}/${imagePath}?width=${width}&quality=${quality}&format=webp`
}

// Usage in template:
// <img :src="getMenuItemImageUrl(item.image_url, 200, 75)" loading="lazy" />
```

**Format:** Always serve WebP (50% smaller than JPEG at same quality). Supabase Storage supports on-the-fly WebP conversion.

### 7.2 Responsive Images

```html
<!-- POS menu item card (200px wide on desktop, full width on mobile) -->
<img
  :src="getMenuItemImageUrl(item.image_url, 400, 80)"
  :srcset="`
    ${getMenuItemImageUrl(item.image_url, 200, 80)} 200w,
    ${getMenuItemImageUrl(item.image_url, 400, 80)} 400w,
    ${getMenuItemImageUrl(item.image_url, 600, 80)} 600w
  `"
  sizes="(max-width: 600px) 100vw, 200px"
  loading="lazy"
  :alt="item.name"
  width="200"
  height="150"
/>
```

### 7.3 Image Upload Guidelines (Admin)

When uploading menu item images:
- Maximum size: 2MB original (compressed on upload)
- Recommended: 800×600px source image
- Format: JPEG or PNG (Supabase converts to WebP on serve)
- Enforce in upload dialog: add size/dimension validation

---

## 8. Vue 3 Rendering Optimization

### 8.1 Virtual Scrolling for Large Lists

Any list with 100+ items should use virtual scrolling. Vue renders only visible items, preventing DOM overload.

**Affected lists:**
| List | Current | Items Count | Fix |
|------|---------|-------------|-----|
| POS menu items | `v-for` on all | Up to 5,000 | Virtual scroll |
| Inventory items | `v-for` on all | Up to 10,000 | Virtual scroll |
| Order history | Paginated, 300/page | 300 | OK — but limit to 50 |
| Reports table | Unknown | Hundreds | Paginate + virtual |
| Customer list | Unknown | Thousands | Virtual scroll |

**Implementation with Quasar:**
```vue
<template>
  <!-- Quasar has built-in virtual scroll -->
  <q-virtual-scroll
    :items="menuItems"
    virtual-scroll-item-size="80"
    v-slot="{ item, index }"
  >
    <menu-item-card :key="item.id" :item="item" />
  </q-virtual-scroll>
</template>
```

**Alternative:** `@tanstack/vue-virtual` (more flexible, same concept)

### 8.2 `v-memo` for Stable List Items

Use `v-memo` to skip re-rendering list items that haven't changed:

```vue
<!-- KDS order cards — only re-render when status or items change -->
<kot-card
  v-for="ticket in tickets"
  :key="ticket.id"
  v-memo="[ticket.status, ticket.kot_items.length, ticket.updated_at]"
  :ticket="ticket"
/>
```

**Note:** `v-memo` must include ALL reactive values used in the component. Missing a value causes stale renders.

### 8.3 `KeepAlive` for Expensive Components

Components that are expensive to mount (fetch data on mount) should be kept alive when navigating away:

```vue
<!-- App.vue or router-view wrapper -->
<router-view v-slot="{ Component }">
  <keep-alive :include="['POSPage', 'KitchenPage', 'DashboardPage']">
    <component :is="Component" />
  </keep-alive>
</router-view>
```

**Be careful:** `KeepAlive` components persist their state. Stale data must be refreshed with `onActivated`:

```typescript
// In POSPage.vue:
onActivated(() => {
  // Refresh menu items when POS tab is re-activated
  orderStore.refreshMenu()
})
```

### 8.4 `v-once` for Static Content

Content that never changes after initial render:

```vue
<!-- Branch name in header — set once, never changes during session -->
<div class="branch-name" v-once>{{ authStore.currentBranch?.name }}</div>

<!-- Static legal text, app version, etc. -->
<footer v-once>© 2026 Seven Waves Restaurant</footer>
```

### 8.5 Avoid Expensive Watchers

```typescript
// ❌ AVOID — deep watcher on large array is expensive:
watch(cartItems, () => { recalculate() }, { deep: true })
// Watches every nested property of every item

// ✅ BETTER — watch the computed total instead:
watch(total, () => { /* total already computed optimally */ })

// ✅ OR — use computed directly:
const computedTotal = computed(() => cartItems.value.reduce((sum, item) => ...))
// No watcher needed — computed auto-updates
```

---

## 9. Network Optimization

### 9.1 HTTP/2 Multiplexing

Netlify serves all assets over HTTP/2, which multiplexes multiple requests over a single connection. This means:
- Old "combine all CSS into one file" advice no longer applies
- Multiple small files are efficient over HTTP/2
- Parallel requests don't block each other

**Verify:** Open Chrome DevTools → Network tab → Protocol column should show `h2` for all Netlify assets.

### 9.2 DNS Preconnect

Add to `index.html` (or Quasar's `_meta.js`):

```html
<!-- Supabase API (critical — starts TLS handshake early) -->
<link rel="preconnect" href="https://clykwuzajtwvwuavmtzs.supabase.co" crossorigin>
<link rel="dns-prefetch" href="https://clykwuzajtwvwuavmtzs.supabase.co">

<!-- Google Fonts (if used directly, vs @import in CSS) -->
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

### 9.3 API Response Compression

Supabase automatically gzip-compresses API responses. Netlify auto-gzip-compresses all served files.

**Verify compression:**
```bash
curl -H "Accept-Encoding: gzip" -I https://seven-waves.netlify.app/assets/vendor-vue-*.js
# Should show: Content-Encoding: gzip
```

### 9.4 Cache Headers (netlify.toml)

Current netlify.toml should have cache headers. Verify:
```toml
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    # 1 year — safe because filenames have content hash

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "public, no-cache"
    # Always re-validate HTML (contains links to hashed assets)

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
    # Service worker must always be fresh
```

### 9.5 Request Batching

Where multiple related API calls happen close together, batch them:

```typescript
// ❌ Sequential — slow:
const roles = await supabase.rpc('auth_get_roles')
const permissions = await supabase.from('user_permissions').select('*').eq('user_id', uid)
const branches = await supabase.from('user_branches').select('*').eq('user_id', uid)
// Total: 3 × (network latency + DB time)

// ✅ Parallel — 3× faster:
const [rolesRes, permsRes, branchesRes] = await Promise.all([
  supabase.rpc('auth_get_roles'),
  supabase.from('user_permissions').select('permission_code').eq('user_id', uid),
  supabase.from('user_branches').select('*').eq('user_id', uid)
])
// Total: 1 × (max of network latency + DB time)
```

**Already applied in `authStore.fetchUserData()`** using `Promise.all`. ✅

---

## 10. Monitoring & Profiling

### 10.1 Lighthouse CI Integration

Add Lighthouse CI to the GitHub Actions pipeline to fail deploys that regress performance:

```yaml
# .github/workflows/lighthouse.yml
- name: Lighthouse CI
  uses: treosh/lighthouse-ci-action@v12
  with:
    urls: |
      https://seven-waves.netlify.app/auth/login
      https://seven-waves.netlify.app/dashboard
    budgetPath: ./lighthouse-budget.json
    uploadArtifacts: true

# lighthouse-budget.json:
[
  {
    "path": "/*",
    "timings": [
      { "metric": "first-contentful-paint", "budget": 1500 },
      { "metric": "largest-contentful-paint", "budget": 2500 },
      { "metric": "interactive", "budget": 3000 }
    ],
    "resourceSizes": [
      { "resourceType": "script", "budget": 500 },
      { "resourceType": "total", "budget": 1000 }
    ]
  }
]
```

### 10.2 Web Vitals Tracking (Production)

Capture real user performance data:

```typescript
// src/boot/core.ts — add Web Vitals tracking
import { onCLS, onFID, onLCP, onFCP, onTTFB, onINP } from 'web-vitals'

function sendToAnalytics(metric) {
  // Send to Supabase events table or Sentry
  console.log('[Perf]', metric.name, metric.value, metric.rating)
  // In production: supabase.from('performance_metrics').insert({ ... })
}

onCLS(sendToAnalytics)
onFID(sendToAnalytics)
onLCP(sendToAnalytics)
onFCP(sendToAnalytics)
onTTFB(sendToAnalytics)
onINP(sendToAnalytics)
```

### 10.3 Supabase Dashboard Metrics

Monitor in Supabase Dashboard → Reports:

| Metric | Warning Threshold | Action |
|--------|-------------------|--------|
| API Response Time (p95) | > 500ms | Add indexes, check N+1 |
| Active Connections | > 80% of plan limit | Upgrade plan |
| Realtime Messages/sec | > 80% of limit | Reduce subscriptions |
| Database CPU | > 70% sustained | Scale DB or optimize queries |
| Cache Hit Rate | < 90% | Review indexes |
| Error Rate | > 1% | Investigate slow queries |

### 10.4 Custom Application Metrics

Instrument key operations:

```typescript
// Wrapper for measuring POS operations
class PerfMetrics {
  static async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = performance.now() - start
      if (duration > 1000) {
        console.warn(`[Perf] SLOW: ${name} took ${duration.toFixed(0)}ms`)
      }
      return result
    } catch (error) {
      throw error
    }
  }
}

// Usage:
await PerfMetrics.measure('sendToKitchen', () => orderStore.sendToKitchen())
await PerfMetrics.measure('fetchBillingQueue', () => cashierStore.fetchBillingQueue())
```

### 10.5 Sentry Performance Monitoring

Add Sentry performance tracing (P0-9 from ROADMAP.md):

```typescript
// src/boot/error-handler.ts — add Sentry
import * as Sentry from '@sentry/vue'
import { BrowserTracing } from '@sentry/tracing'

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    new BrowserTracing({
      routingInstrumentation: Sentry.vueRouterInstrumentation(router),
    }),
  ],
  tracesSampleRate: 0.1,  // Sample 10% of transactions
  profilesSampleRate: 0.05,  // Sample 5% for profiling
  environment: import.meta.env.VITE_APP_ENV || 'development',
  release: `seven-waves@${import.meta.env.VITE_APP_VERSION || '0.0.1'}`,
})
```

---

## 11. Performance Optimization Roadmap

### Priority Matrix

| Priority | Item | Effort | Expected Gain | Status |
|----------|------|--------|---------------|--------|
| **P0 (Done)** | Split 655KB vendor chunk | 2h | Initial load: -500KB gz | ✅ Done |
| **P0 (Done)** | Lazy load Excel/PDF | 2h | Initial load: -539KB gz | ✅ Done |
| **P0 (Done)** | Lazy load ApexCharts | 1h | Initial load: -132KB gz | ✅ Done |
| **P0 (Done)** | Remove mod-ai from eager preload | 1h | Initial load: -173KB gz | ✅ Done |
| **P0 (Done)** | Fix auth cache TTL (24h → 5min) | 0.5h | Security + correctness | ✅ Done |
| **P0 (Done)** | Eliminate waiter store extra DB query | 0.5h | -1 DB call per login | ✅ Done |
| **P0 (Done)** | Fix Date.now() in channel names | 0.5h | Proper dedup | ✅ Done |
| **P0 (Done)** | PWA Workbox caching strategy | 1h | Repeat loads: instant | ✅ Done |
| **P1** | Add missing DB indexes (8 indexes) | 2h | 10-100× faster queries | TODO |
| **P1** | Fix auth_is_on_shift() per-row cost | 3h | 10× RLS performance | TODO |
| **P1** | Virtual scroll: POS menu items | 4h | 60fps on 5,000 items | TODO |
| **P1** | Virtual scroll: inventory list | 4h | 60fps on 10,000 items | TODO |
| **P1** | Paginate order history (strict 50 limit) | 2h | Prevent memory exhaustion | TODO |
| **P2** | Replace axios with native fetch | 4h | -13KB bundle | TODO |
| **P2** | Lazy load leaflet (delivery map only) | 2h | -40KB initial (if used) | TODO |
| **P2** | Remove xlsx if exceljs covers all cases | 2h | Reduce bundle | TODO |
| **P2** | Consolidate realtime subscriptions | 5 days | -15 redundant channels | TODO |
| **P2** | KeepAlive for POS, KDS, Dashboard | 2h | Instant tab switching | TODO |
| **P2** | Web Vitals tracking in production | 2h | Visibility into real UX | TODO |
| **P2** | Sentry performance monitoring | 4h | Alerts on slowdowns | TODO |
| **P3** | pg_trgm fuzzy menu search | 2h | < 100ms search on 5K items | TODO |
| **P3** | Materialized view for reports | 2 days | Near-instant reports | TODO |
| **P3** | Image optimization (WebP, srcset) | 1 day | -50% image bandwidth | TODO |
| **P3** | Session variable for RLS caching | 4h | Eliminates per-row auth calls | TODO |
| **P3** | ApexCharts → uPlot for simple charts | 2 days | -125KB lazy chunk | TODO |

### Phase 1 Quick Wins (Pre-Launch, < 1 day total)

1. Add missing DB indexes — SQL migration, no code changes
2. Verify all 300-record limits are in place in stores
3. Add loading skeletons to pages missing them
4. Verify DNS preconnect tags in `index.html`
5. Set `Cache-Control: immutable` for hashed assets in `netlify.toml`

### Phase 2 (First Month Post-Launch)

1. Virtual scrolling for POS menu items (most impactful UX win)
2. KeepAlive for POS and KDS pages
3. Replace axios with fetch
4. Add Web Vitals tracking
5. Fix auth_is_on_shift() performance

### Phase 3 (Scaling Phase, Month 2-3)

1. Consolidate realtime subscriptions
2. Implement cursor pagination throughout
3. Materialized views for heavy reports
4. pg_trgm for menu search
5. Complete Sentry performance integration

---

## 12. Appendix: Code Patterns Reference

### A. Performance-Optimized Store Template

```typescript
// Template for a high-performance Pinia store
import { defineStore } from 'pinia'
import { ref, computed, shallowRef, markRaw } from 'vue'
import { supabase } from 'src/boot/supabase'

export const useExampleStore = defineStore('example', () => {
  // Use shallowRef for large arrays — only tracks reference, not deep properties
  const items = shallowRef<Item[]>([])
  const loading = ref(false)
  const cursor = ref<string | null>(null)  // for cursor pagination
  const hasMore = ref(true)

  // Mark non-reactive objects
  let _channel = markRaw(null as any)
  let _initialized = false

  // Computed — cached automatically
  const activeItems = computed(() =>
    items.value.filter(i => i.is_active)
  )

  async function initialize() {
    if (_initialized) return
    _initialized = true
    await fetchPage()
    _subscribeRealtime()
  }

  async function fetchPage(reset = false) {
    if (loading.value || (!hasMore.value && !reset)) return
    loading.value = true

    if (reset) {
      cursor.value = null
      hasMore.value = true
    }

    try {
      const query = supabase
        .from('example_table')
        .select('id, name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (cursor.value) {
        query.lt('created_at', cursor.value)
      }

      const { data, error } = await query
      if (error) throw error

      if (data.length < 50) hasMore.value = false
      if (data.length > 0) cursor.value = data[data.length - 1]!.created_at

      if (reset) {
        items.value = data ?? []
      } else {
        items.value = [...items.value, ...(data ?? [])]
      }
    } finally {
      loading.value = false
    }
  }

  function _subscribeRealtime() {
    _channel = supabase
      .channel('example-changes')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'example_table',
      }, (payload) => {
        // Prepend new item, cap at reasonable size
        items.value = [payload.new as Item, ...items.value].slice(0, 500)
      })
      .subscribe()
  }

  function cleanup() {
    if (_channel) {
      supabase.removeChannel(_channel)
      _channel = markRaw(null)
    }
    _initialized = false
  }

  return { items, loading, hasMore, activeItems, initialize, fetchPage, cleanup }
})
```

### B. Supabase Realtime Channel Best Practices

```typescript
// ✅ Good: stable channel name, proper cleanup
const CHANNEL_NAME = `orders:${branchId}` // stable — can be deduplicated by Supabase

let channel = supabase
  .channel(CHANNEL_NAME)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'orders',
    filter: `branch_id=eq.${branchId}`,
  }, handleOrderInsert)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `branch_id=eq.${branchId}`,
  }, handleOrderUpdate)
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') isConnected.value = true
    if (status === 'CHANNEL_ERROR') console.error('[RT] Channel error:', err)
    if (status === 'TIMED_OUT') console.warn('[RT] Channel timed out — Supabase will reconnect')
  })

// ✅ Always clean up:
function cleanup() {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
    isConnected.value = false
  }
}
```

### C. Database Index Creation Checklist

Before deploying to production, verify each index exists:

```sql
-- Run this query on your Supabase database to check existing indexes:
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items', 'kot_tickets', 'menu_items', 'notifications', 'attendance_records')
ORDER BY tablename, indexname;
```

### D. Bundle Analysis Commands

```bash
# 1. Build with analysis (temporary)
# In quasar.config.js, temporarily set: analyze: true
npx quasar build
# Opens rollup-plugin-visualizer in browser

# 2. Check gzip sizes of output
find dist/spa/assets -name "*.js" -exec sh -c 'echo "$(gzip -c "$1" | wc -c) bytes (gz): $1"' _ {} \; | sort -n -r | head -20

# 3. Check what's in the vendor catch-all chunk
# Install source-map-explorer:
npm install -g source-map-explorer
source-map-explorer dist/spa/assets/vendor-*.js
```

---

*Document maintained by Perf agent. Update when new dependencies are added, new stores are created, or performance measurements change. Next review: 2026-08-16.*
