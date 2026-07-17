# Pinia Store Audit Report — Seven Waves Restaurant ERP

**Auditor:** StoreAudit agent  
**Date:** 2026-07-17  
**Scope:** All Pinia stores in `src/stores/`  
**Stores Audited:** 21 files  

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 1 |
| 🟠 HIGH | 5 |
| 🟡 MEDIUM | 6 |
| 🔵 LOW | 3 |
| **Total** | **15** |

The most serious bug is in `orderStore.js` — delivery charge is excluded from the total computed, causing wrong amounts in the DB, receipts, and Quick Pay RPCs. Five additional HIGH bugs cover a QR order total bug, cashier bypassing loyalty on serve, duplicate-RPC inconsistency in the waiter flow, a client-side order number collision, and hardcoded service charge.

---

## Stores Reviewed

| Store | File | Lines |
|-------|------|-------|
| authStore | `src/stores/auth.ts` | 741 |
| orderStore (POS) | `src/stores/orderStore.js` | 530 |
| waiterOrderStore | `src/stores/waiterOrderStore.js` | 720 |
| waiterAppStore | `src/stores/waiterAppStore.js` | 888 |
| kitchenDisplayStore | `src/stores/kitchenDisplayStore.js` | 757 |
| cashierStore | `src/stores/cashierStore.js` | 785 |
| deliveryStore | `src/stores/deliveryStore.js` | 584 |
| managerAppStore | `src/stores/managerAppStore.js` | 644 |
| customerOrderStore | `src/stores/customerOrderStore.js` | 352 |
| notificationStore | `src/stores/notifications.js` | 332 |
| offlineSyncStore | `src/stores/offlineSyncStore.ts` | — |
| auditStore | `src/stores/auditStore.ts` | — |
| shiftStore | `src/stores/shiftStore.ts` | — |
| tableSessionStore | `src/stores/tableSessionStore.ts` | — |
| kotOrchestrationStore | `src/stores/kotOrchestrationStore.js` | — |
| inventoryQueueStore | `src/stores/inventoryQueueStore.js` | — |
| customerStore | `src/stores/customerStore.ts` | — |
| orders (legacy) | `src/stores/orders.js` | — |
| modules | `src/stores/modules.ts` | — |
| ui | `src/stores/ui.js` | — |
| index | `src/stores/index.js` | — |

---

## Bug Findings

---

### 🔴 BUG-STR-001 [CRITICAL] — Delivery charge excluded from `total` computed

**File:** `src/stores/orderStore.js:55`

```js
// CURRENT (WRONG):
const total = computed(() => taxableAmount.value + taxAmount.value + serviceChargeAmount.value)

// FIX:
const total = computed(() => taxableAmount.value + taxAmount.value + serviceChargeAmount.value + (deliveryCharge.value || 0))
```

**Impact:**
- POS UI shows wrong order total to cashier for ALL delivery orders
- `total_amount` stored in the DB is wrong (orderPayload line 172 / 268 uses `total.value`)
- `p_amount_paid` passed to `process_cashier_payment` RPC is wrong (line 330) — payment recorded at incorrect amount
- Receipt total shown to customer is incorrect
- Finance journal entry will record wrong revenue amount

**Note:** `deliveryCharge` IS saved to `delivery_charge` column in the order payload (line 179/276) — so the column has the right value, but `total_amount` doesn't reflect it. This is a critical calculation bug.

**Cross-reference:** Confirmed by WorkflowAuditor as BUG-WF-001.

---

### 🟠 BUG-STR-002 [HIGH] — QR customer order total excludes service charge

**File:** `src/stores/customerOrderStore.js:222`

```js
// CURRENT (WRONG):
total_amount: subtotal.value,  // subtotal only, no service charge

// FIX: apply 10% service charge for dine_in:
total_amount: parseFloat((subtotal.value * 1.1).toFixed(2)),
```

**Impact:**
- All QR/kiosk dine-in orders store a total that is 10% too low
- Finance receives wrong revenue amount for all table-side QR orders
- Cashier billing queue shows wrong amount to charge the customer

---

### 🟠 BUG-STR-003 [HIGH] — `cashierStore.markServed()` bypasses loyalty point awarding

**File:** `src/stores/cashierStore.js:387–413`

The cashier-side mark-served performs a raw DB update:
```js
await supabase.from('orders').update({ status: 'served' }).eq('id', orderId).eq('status', 'ready')
```

The correct path is `process_waiter_mark_served` RPC which awards loyalty points (as used in `waiterOrderStore.markOrderServed()`). When the cashier marks an order served instead of the waiter, the customer earns zero loyalty points.

**Fix:** Replace direct update with:
```js
const { data, error } = await supabase.rpc('process_waiter_mark_served', { p_order_id: orderId })
```

---

### 🟠 BUG-STR-004 [HIGH] — `waiterAppStore.acceptOrder()` uses different RPC than `waiterOrderStore.acceptOrder()` — unavailable items not supported

**Files:**
- `src/stores/waiterAppStore.js:566` → calls `process_waiter_accept`
- `src/stores/waiterOrderStore.js:265` → calls `dispatchAcceptOrder` → `accept_order_as_waiter(p_order_id, p_unavailable_ids)`

The waiter PWA initializes BOTH stores (`waiterAppStore` initializes `waiterOrderStore` in the background). The UI for accepting orders flows through `waiterOrderStore.acceptOrder(orderId, unavailableItemIds)`, which correctly forwards unavailable item IDs to the RPC.

However, `waiterAppStore.acceptOrder()` at line 566 calls only `process_waiter_accept({ p_order_id })` — no unavailableItemIds parameter. If any component calls `waiterAppStore.acceptOrder()` instead of `waiterOrderStore.acceptOrder()`, unavailable items will never be flagged, and the customer won't be notified of substitutions.

**Fix:** Either route all accepts through `waiterOrderStore` or add `unavailableItemIds` support to `waiterAppStore.acceptOrder()`.

---

### 🟠 BUG-STR-005 [HIGH] — Client-side order number collision risk

**File:** `src/stores/orderStore.js:359–363`

```js
function _generateOrderNumber() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `ORD-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
```

Two orders placed at the same second get the same order number (e.g., `ORD-143022`). Numbers also reset at midnight, so `ORD-143022` from yesterday equals today's. This is a display field only but causes cashier confusion and duplicate lookups.

**Fix:** Generate server-side via a sequence in the DB trigger, or append a random suffix: `` `ORD-${pad(h)}${pad(m)}${pad(s)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}` ``

**Cross-reference:** Confirmed by WorkflowAuditor as BUG-WF-002.

---

### 🟠 BUG-STR-006 [HIGH] — Service charge hardcoded at 10%

**File:** `src/stores/orderStore.js:48–53`

```js
const serviceChargeAmount = computed(() => {
  if (orderType.value === 'dine-in') {
    return subtotal.value * 0.1   // ← hardcoded 10%
  }
  return 0
})
```

There is no branch-level service charge config. All branches are forced to exactly 10%. If a branch charges 12.5% or 0%, this is wrong.

**Fix:** Load `service_charge_rate` from the branch record at login and expose it via authStore or a settings store. Replace `0.1` with a reactive branch setting.

**Cross-reference:** Confirmed by WorkflowAuditor as BUG-WF-003.

---

### 🟡 BUG-STR-007 [MEDIUM] — Double `fetchMyOrders()` after accept in waiterOrderStore

**File:** `src/stores/waiterOrderStore.js:291–294`

```js
// Refresh my orders immediately
await fetchMyOrders()

// Small delay and refresh again to be 100% sure the DB change is visible
setTimeout(() => fetchMyOrders(), 800)
```

The comment "S4-3: replaces setTimeout(800)" (line 464) refers to the KOT handler, but the 800ms duplicate call in `acceptOrder()` was never removed. This causes:
1. A redundant DB query 800ms after every accept
2. If the store is cleaned up (component unmount) before 800ms, the timer fires on a stale/null state — potential error

**Fix:** Remove the `setTimeout(() => fetchMyOrders(), 800)` call from `acceptOrder()`. The KOT realtime handler now drives `fetchMyOrders()` (line 465).

---

### 🟡 BUG-STR-008 [MEDIUM] — N+1 query pattern in `managerAppStore.loadOnShiftWaiters()`

**File:** `src/stores/managerAppStore.js:131–163`

For each waiter profile (N), two additional COUNT queries are issued:
1. `orders` count for active orders
2. `waiter_notifications` count for unread alerts

With 15 active waiters = **31 DB calls** for one dashboard load. This is O(N) queries.

**Fix:** Replace with a single RPC `get_waiter_dashboard_summary(branch_id)` that returns aggregated stats in one query.

---

### 🟡 BUG-STR-009 [MEDIUM] — N+1 query pattern in `managerAppStore.loadLeaderboard()`

**File:** `src/stores/managerAppStore.js:359–389`

Same pattern as BUG-STR-008: fetches all waiter profiles then loops to fetch `waiter_points_ledger` for each. With 15 waiters = **16 DB calls**.

**Fix:** Include ledger in the initial select or use a window function in a single RPC.

---

### 🟡 BUG-STR-010 [MEDIUM] — KOT realtime channel in waiterOrderStore has no branch filter

**File:** `src/stores/waiterOrderStore.js:422–436`

```js
kotChannel = supabase
  .channel('waiter-kot-rt')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'kot_tickets',    // ← no filter
  }, (payload) => handleKotChange(payload))
  .subscribe()
```

Every KOT update from ANY branch globally triggers `fetchMyOrders()` for every connected waiter. In a multi-branch deployment, this causes unnecessary DB reads.

The `handleKotChange` function does check `myOrders.value.find(o => o.id === newRow.order_id)` to validate ownership before alerting, which prevents false alerts — but the `fetchMyOrders()` at line 465 fires unconditionally for every KOT event globally.

**Fix:** Either filter by `order_id IN (my order ids)` if Supabase supports it, or gate the `fetchMyOrders()` call behind the ownership check:
```js
function handleKotChange(payload) {
  const { eventType, new: newRow } = payload
  // ...existing alert logic...
  const myOrder = myOrders.value.find((o) => o.id === newRow.order_id)
  if (myOrder) fetchMyOrders()   // only refresh if it's our order
}
```

---

### 🟡 BUG-STR-011 [MEDIUM] — Waiter realtime notifications silently skipped for employee-fallback profiles

**File:** `src/stores/waiterAppStore.js:780–817`

```js
if (profile.value?.id) {   // ← null for synthetic/fallback profiles
  notifsChannel = supabase.channel('waiter-app-notifs')...
  pointsChannel = supabase.channel('waiter-app-points')...
}
```

Waiters who have no `waiter_profiles` row and are served a synthetic profile via the employee-fallback path (line 155–166, `_fromEmployeeFallback: true, id: null`) get `profile.id === null`. Both `notifsChannel` and `pointsChannel` are skipped silently. These waiters receive no realtime notification pushes.

**Fix:** Either ensure every waiter has a `waiter_profiles` row (preferred — fix at data entry), or use `profile.value?.user_id` to subscribe to the notifications channel.

---

### 🟡 BUG-STR-012 [MEDIUM] — Unawaited `signOut()` in `_fetchProfile()` background handler

**File:** `src/stores/auth.ts:303–307`

```js
if (data && data.is_active === false) {
  this.signOut()          // ← not awaited
  this.error = 'Account disabled. Please contact admin.'
}
```

`signOut()` is async and performs multiple operations (cleanup, Supabase call). Not awaiting it means:
- If `_fetchProfile()` is called in a background context, the error assignment line 306 runs immediately but the UI may already be navigating
- A disabled account loading from cache (`rolesVerified: false` path) can briefly access the app while `signOut()` resolves asynchronously

**Fix:** `await this.signOut()` here, or guard further navigation in the route guard by re-checking `is_active` synchronously.

---

### 🔵 BUG-STR-013 [LOW] — Unsafe `JSON.parse` in `managerAppStore` state initialization

**File:** `src/stores/managerAppStore.js:32`

```js
const viewedAlertIds = ref(new Set(JSON.parse(localStorage.getItem('mgr_viewed_alerts') || '[]')))
```

If `mgr_viewed_alerts` in localStorage contains corrupted/truncated data, `JSON.parse` throws synchronously during Pinia store definition — crashing the entire store and making the manager app unusable until localStorage is manually cleared.

**Fix:**
```js
let _viewedIds = []
try { _viewedIds = JSON.parse(localStorage.getItem('mgr_viewed_alerts') || '[]') } catch {}
const viewedAlertIds = ref(new Set(_viewedIds))
```

---

### 🔵 BUG-STR-014 [LOW] — `waiterAppStore` orders channel uses static name `'waiter-app-orders'`

**File:** `src/stores/waiterAppStore.js:669`

```js
ordersChannel = supabase.channel('waiter-app-orders')   // no branch suffix
```

The KOT channel correctly uses `waiter-app-kot-${branchId}` (line 749), but the orders channel uses a static name. Multiple waiter sessions on the same device (or same browser window in different tabs) subscribe to the same channel name — Supabase may only deliver events to one of them.

**Fix:** `supabase.channel(`waiter-app-orders-${branchId}`)` 

---

### 🔵 BUG-STR-015 [LOW] — `cashierStore.fetchBillingQueue()` fetches up to 500 rows on every init

**File:** `src/stores/cashierStore.js:116–185`

On every `initialize()`, the cashier store fetches up to 300 unpaid orders (last 7 days) + 200 paid orders (today), with full JOINs including `order_items`, `kot_tickets`, `invoices`. For a busy branch this is a large payload with no pagination.

**Fix:** Default to today's orders only; add a "Load older orders" action for historical lookups.

---

## Missing Store Functionality

| Missing Feature | Impact | Notes |
|----------------|--------|-------|
| Order Void / Refund | Cannot cancel paid orders, reverse finance entries | No RPC or store action exists anywhere |
| Split bill | Customer can't split payment across different diners | Cashier store has multi-payment array but no UI flow |
| Payroll calculation from attendance | HR payroll amounts are manual-entry only | No store or RPC for automated payroll computation |

---

## Store Architecture Notes (No Bugs, Just Observations)

### Dual-store waiter system
`waiterAppStore` and `waiterOrderStore` are both initialized by the waiter PWA on startup. They have overlapping state (`pendingOrders`, `myOrders`) and both subscribe to the same `orders` table. This is by design (one is the PWA UI shell, one is the operational data layer), but it means every order update triggers TWO sets of DB fetches. Teams should be aware of this if they ever consolidate.

### `cashierStore.booted` flag is module-scoped
The `booted` flag at line 35 is a closure variable (not Pinia state), so it survives HMR reloads without resetting. In development, after code changes, the store won't reinitialize. This is correct for production but can confuse development debugging.

### `kitchenDisplayStore` timer correctly uses `setInterval` for time display
The `startTimer()` function updates `timeElapsed` on every ticket every second. For 20+ concurrent tickets, this is 20+ reactive updates per second. At large scale consider updating only visible tickets.

---

## Files Changed

None — this is a documentation-only audit report. All fixes should be implemented by the Fixer agent referencing the Bug IDs above.

---

## Priority Fix Order

1. **BUG-STR-001** (CRITICAL) — Delivery total computation  
2. **BUG-STR-002** (HIGH) — QR order total excludes service charge  
3. **BUG-STR-003** (HIGH) — Cashier mark-served bypasses loyalty  
4. **BUG-STR-004** (HIGH) — waiterAppStore.acceptOrder() misses unavailable items  
5. **BUG-STR-005** (HIGH) — Order number collision  
6. **BUG-STR-006** (HIGH) — Service charge hardcoded  
7. **BUG-STR-007** — Double fetchMyOrders after accept  
8. **BUG-STR-008/009** — N+1 queries in manager dashboard  
9. **BUG-STR-010** — KOT channel triggers global fetchMyOrders  
10. **BUG-STR-011** — Fallback profile users miss realtime  
11. **BUG-STR-012** — Unawaited signOut on disabled account  
12. **BUG-STR-013/014/015** — Low priority fixes  
