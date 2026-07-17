# Business Workflow Audit — Seven Waves ERP
**Date:** 2026-07-17  
**Auditor:** WorkflowAuditor  
**Scope:** All Pinia stores, services, module logic, business workflows, and cross-module integrations  

---

## Summary

| Category | Count |
|----------|-------|
| Workflows audited | 15 |
| Files read | 18 |
| Total workflow bugs | 14 |
| Critical (P0) | 1 |
| High (P1) | 5 |
| Medium (P2) | 5 |
| Low (P3) | 3 |
| Missing workflow implementations | 2 |
| Cross-module integration issues | 3 |

---

## Files Audited

```
src/stores/orderStore.js
src/stores/waiterOrderStore.js
src/stores/kitchenDisplayStore.js
src/stores/deliveryStore.js
src/stores/cashierStore.js
src/stores/managerAppStore.js
src/stores/waiterAppStore.js
src/stores/notifications.js
src/stores/customerOrderStore.js
src/services/kotDispatchService.js
src/services/loyaltyService.ts
src/services/financeService.ts
src/services/inventoryService.ts
src/services/deliveryService.ts
src/services/procurementService.ts
src/modules/finance/services/finance-voucher.service.js
src/core/offline/offlineSyncEngine.ts
src/core/rbac/permissions.ts
```

---

## Workflow-by-Workflow Findings

---

### WF-001: POS Billing → Full Chain

**Status:** ⚠️ Partial — core flow correct, critical delivery total bug

**File:** `src/stores/orderStore.js`

**Checklist:**
- ✅ `sendToKitchen()` sets `assigned_waiter_id=NULL` (not present in insert payload) — correct per CLAUDE.md
- ✅ `processPayment()` calls `process_waiter_accept` → `process_cashier_invoice` → `process_cashier_payment` in correct order
- ✅ Error handling: throws Error on Supabase failure, caller handles UX
- ✅ Best-effort rollback: deletes orphaned order if items insert fails
- ✅ `isSending` guard prevents double-submit
- ✅ companyId and branchId validated before insert
- ❌ `deliveryCharge` NOT included in computed `total`
- ❌ Order number is timestamp-based (collision risk)
- ❌ Service charge is hardcoded at 10%
- ❌ No cap on discount percentage

**Bugs:**

#### BUG-WF-001 [CRITICAL] `src/stores/orderStore.js:55`
**Delivery charge missing from computed total**

```js
// Line 55 — current (WRONG)
const total = computed(() => taxableAmount.value + taxAmount.value + serviceChargeAmount.value)

// deliveryCharge is captured on line 29 and stored in the DB payload (line 179)
// but NEVER added to the computed total shown to cashier / sent to DB as total_amount
```

**Impact:** For delivery orders, `total_amount` stored in DB is LESS than the actual amount charged. Customer sees wrong total. Finance journal entries will be wrong. Receipt will show wrong amount. High financial discrepancy risk.

**Fix:**
```js
const total = computed(() =>
  taxableAmount.value + taxAmount.value + serviceChargeAmount.value + (deliveryCharge.value || 0)
)
```

---

#### BUG-WF-002 [HIGH] `src/stores/orderStore.js:359-363`
**Order number collision risk — timestamp-based generation**

```js
function _generateOrderNumber() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `ORD-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
```

**Impact:** Two orders created at the same second (e.g., POS + QR self-order simultaneously) generate identical order numbers like `ORD-143022`. Confuses cashier, waiter, and audit logs. Order numbers are not globally unique within a day. Resets each midnight so same numbers repeat daily.

**Fix:** Either generate client-side with UUID suffix, or rely on DB sequence via a `generate_order_number(branch_id)` RPC that returns `B01-00001`, `B01-00002` etc.

---

#### BUG-WF-003 [HIGH] `src/stores/orderStore.js:48-53`
**Service charge hardcoded at 10% — not configurable per branch**

```js
const serviceChargeAmount = computed(() => {
  if (orderType.value === 'dine-in') {
    return subtotal.value * 0.1  // ← hardcoded 10%
  }
  return 0
})
```

**Impact:** Every branch uses exactly 10% service charge for dine-in with no override. Multi-branch setups where different locations have different service charge rates are not supported. Branch settings table exists but is not consulted.

**Fix:**
```js
// Fetch from branch_settings table on initialization
const branchServiceChargeRate = ref(0.1) // loaded from DB

const serviceChargeAmount = computed(() => {
  if (orderType.value === 'dine-in') {
    return subtotal.value * branchServiceChargeRate.value
  }
  return 0
})
```

---

#### BUG-WF-004 [MEDIUM] `src/stores/orderStore.js:42`
**No validation cap on discount — negative totals possible**

```js
const discountAmount = computed(() => subtotal.value * (discount.value / 100))
const taxableAmount = computed(() => subtotal.value - discountAmount.value)
```

If `discount.value > 100`, `discountAmount > subtotal`, producing `taxableAmount < 0`. The negative amount flows to `total_amount` in DB, corrupts finance queue entries, and may cause unsigned integer overflow in payment processing RPCs.

**Fix:** Cap discount at 100% in the setter or in the computed:
```js
const discountAmount = computed(() => {
  const capped = Math.min(discount.value, 100)
  return subtotal.value * (capped / 100)
})
```

---

#### BUG-WF-005 [LOW] `src/stores/orderStore.js:209-214`
**Rollback on items insert failure has no error handling**

```js
if (itemsError) {
  // Best-effort delete of the orphaned order
  await supabase.from('orders').delete().eq('id', order.id)
  throw new Error(`Failed to save order items: ${itemsError.message}`)
}
```

The rollback `delete` call result is never checked. If the user lost connectivity after the order was inserted but before items, the rollback silently fails, leaving a ghost order in `pending_waiter` status. This ghost order will appear in the waiter inbox and can't be accepted (has no items).

**Fix:** Log rollback failures, and ideally use a DB-level transaction (single RPC that inserts order + items atomically).

---

### WF-002: Waiter Order Acceptance → KOT

**Status:** ✅ Complete and robust

**File:** `src/stores/waiterOrderStore.js`, `src/services/kotDispatchService.js`

**Checklist:**
- ✅ `initialize()` calls `auth_get_shift_branches()` RPC first
- ✅ Fallback for admins/managers without employee shift records
- ✅ Race condition handled via `SELECT FOR UPDATE` in `accept_order_as_waiter` DB RPC
- ✅ Unavailable items passed to RPC atomically before KOT generation
- ✅ KOT generation triggered by DB trigger (not frontend call) — correct
- ✅ Order removed from inbox immediately on accept (optimistic removal)
- ✅ Realtime channels cleaned up in `cleanup()` including multi-branch channels
- ✅ 5-minute follow-up reminder timer implemented
- ✅ `markOrderServed()` uses `process_waiter_mark_served` RPC (not direct table update)

**Minor Observation:**

#### BUG-WF-006 [LOW] `src/stores/waiterOrderStore.js:421-436`
**KOT realtime channel has no branch filter**

```js
kotChannel = supabase
  .channel('waiter-kot-rt')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'kot_tickets',
    // NO filter here — sees all restaurants' KOTs
  }, ...)
```

The code comment explains this is intentional (kot_tickets has no branch_id column). However, for large multi-company Supabase deployments, waiters receive KOT change events for all companies' orders. Client-side validation guards against processing wrong orders, but it's noisy.

**Impact:** Low — client correctly ignores KOTs not in `myOrders`. Performance concern at scale.

---

### WF-003: Kitchen KDS → Mark Ready → Serve

**Status:** ✅ Complete

**File:** `src/stores/kitchenDisplayStore.js`

**Checklist:**
- ✅ KOTs sorted by `created_at ASC` (oldest first = most urgent)
- ✅ `acceptTicket()` transitions `created/pending → preparing` via RPC
- ✅ `markReady()` uses `kitchenMarkReady` RPC — marks all `kot_items` ready
- ✅ RPC checks if ALL KOTs for order are ready before setting `order.status = 'ready'`
- ✅ Cashier notified via `cashier_queue` when KOT complete
- ✅ `dismissTicket()` uses `completed_at` timestamp (not deletion)
- ✅ Dual query (today's active + all ready) handles overnight orders
- ✅ Optimistic UI update with rollback on RPC failure
- ✅ Realtime cleanup in `cleanup()`
- ✅ Sound alert system with repeat (3×) until dismissed
- ✅ Kitchen staff locked to their assigned kitchen via `profile.kitchen_id`
- ✅ CASHIER display (special kitchen named "CASHIER") shows all tickets unfiltered

**No bugs found in WF-003.**

---

### WF-004: Finance Integration

**Status:** ⚠️ Partial — double-entry not DB-enforced, reversal logic incomplete

**Files:** `src/services/financeService.ts`, `src/modules/finance/services/`

**Checklist:**
- ✅ Separate journal header + journal_lines pattern (correct double-entry structure)
- ✅ `createJournalEntry()` uses ApiClient with correlation ID tracking
- ✅ Financial statements (P&L, Balance Sheet) generated from `journal_lines`
- ✅ `is_reversed` flag exists on journal entries
- ✅ Revenue accounts (4xxx), Expense accounts (5xxx) correctly classified
- ✅ Balance Sheet includes virtual Retained Earnings calculation
- ✅ Legacy `financeService.ts` marked deprecated — migration underway
- ❌ No DB-level constraint enforcing debits = credits
- ❌ `reverseJournalEntry()` only flags, doesn't create counter-entries
- ❌ Payroll journal entry can be imbalanced due to rounding

**Bugs:**

#### BUG-WF-007 [HIGH] `src/services/financeService.ts:78-104`
**Double-entry balance not enforced at DB level — only in application code**

`createJournalEntry()` inserts header then lines with no check that `SUM(dr_amount) = SUM(cr_amount)`. Any bug in the application, direct API call, or RPC can create unbalanced journal entries that corrupt the trial balance.

**Fix:** Add a DB-level `CHECK` constraint on `journal_entries` or a BEFORE INSERT trigger on `journal_lines`:
```sql
-- Option A: trigger after lines insert
CREATE OR REPLACE FUNCTION trg_validate_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  total_dr NUMERIC;
  total_cr NUMERIC;
BEGIN
  SELECT COALESCE(SUM(dr_amount), 0), COALESCE(SUM(cr_amount), 0)
  INTO total_dr, total_cr
  FROM journal_lines WHERE journal_id = NEW.journal_id;
  -- Only enforce when status = 'posted' (drafts may be incomplete)
  RETURN NEW;
END;
$$;
```
More practically: enforce balance in `createJournalEntry()` before any insert:
```typescript
const totalDr = lines.reduce((s, l) => s + (l.dr_amount || 0), 0)
const totalCr = lines.reduce((s, l) => s + (l.cr_amount || 0), 0)
if (Math.abs(totalDr - totalCr) > 0.01) {
  return { data: null, error: new Error(`Journal imbalanced: Dr=${totalDr}, Cr=${totalCr}`) }
}
```

---

#### BUG-WF-008 [HIGH] `src/services/financeService.ts:559-621`
**`reverseJournalEntry()` only sets `is_reversed=true` — no counter-entry created**

```typescript
export async function reverseJournalEntry(id: any) {
  const { data, error } = await api.query(
    (client: any) => client.from('journal_entries')
      .update({ is_reversed: true })
      .eq('id', id)
      ...
  )
}
```

A true accounting reversal requires a new journal entry with all debits/credits swapped. Simply flagging `is_reversed=true` means the original entry still affects account balances. The general ledger, trial balance, and P&L will still include the reversed entry's amounts.

**Fix:**
```typescript
export async function reverseJournalEntry(id: string) {
  // 1. Load original entry + lines
  const { data: original } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*)')
    .eq('id', id)
    .single()

  // 2. Create counter-entry (swap dr/cr)
  const reversalLines = original.journal_lines.map((l: any) => ({
    account_code: l.account_code,
    account_name: l.account_name,
    dr_amount: l.cr_amount,  // swapped
    cr_amount: l.dr_amount,  // swapped
    memo: `Reversal of: ${l.memo}`,
  }))
  await createJournalEntry(
    { ...original, description: `Reversal: ${original.description}`, reference_id: id },
    reversalLines
  )

  // 3. Mark original as reversed
  await supabase.from('journal_entries').update({ is_reversed: true }).eq('id', id)
}
```

---

#### BUG-WF-009 [MEDIUM] `src/services/financeService.ts:576-605`
**Payroll journal entry can be imbalanced**

```typescript
// Lines created:
// Dr 5100 (Salary Expense) = total_gross
// Cr 2200 (Salaries Payable) = total_deductions
// Cr 1010 (Bank) = total_net
```

Accounting identity: `total_gross = total_net + total_deductions`. If there is any floating point rounding during payroll calculation (e.g., `total_net = 145,234.56`, `total_deductions = 23,456.78`, `total_gross = 168,691.34` but computer gets `168,691.3400000001`), the journal entry will be off by fractions. Over thousands of payroll runs this accumulates.

**Fix:**
```typescript
// Recalculate total_net from gross - deductions to ensure balance
const safeNet = Number((Number(cycle.total_gross) - Number(cycle.total_deductions)).toFixed(2))
// Use safeNet instead of cycle.total_net in the Cr 1010 line
```

---

### WF-005: Inventory → Recipe/BOM Deduction

**Status:** ⚠️ Partial — deduction mechanism exists but transparency missing

**Files:** `src/services/inventoryService.ts`, `src/services/kotDispatchService.js`

**Checklist:**
- ✅ `rpc_process_inventory_for_order` RPC exists (idempotent, server-side)
- ✅ Called via `stock_queue` mechanism after order payment
- ✅ `BLOCKED_OFFLINE_MODULES = ['finance', 'procurement']` — correct
- ⚠️ Recipe-to-ingredient link relies entirely on DB-side `issue_stock_for_order()` RPC
- ⚠️ No frontend confirmation that stock was actually deducted
- ❌ No fallback UI when inventory deduction fails

#### BUG-WF-010 [MEDIUM] — No visibility into inventory deduction status
**Impact:** Kitchen or manager cannot see if stock deduction succeeded or failed for an order. If `rpc_process_inventory_for_order` fails silently (e.g., item not linked to recipe), stock is never deducted. The `stock_queue` row stays in `pending` status with no alert.

**Fix:** Add a UI indicator in the order detail view showing `stock_queue.status` (pending/processed/failed) for each order.

---

### WF-006: Purchase Order → GRN → Inventory

**Status:** ⚠️ Partial — frontend service exists, GRN→inventory link needs DB verification

**File:** `src/services/procurementService.ts`

**Checklist:**
- ✅ PO creation workflow exists in service
- ✅ GRN (Goods Received Note) creation function exists
- ⚠️ Cannot confirm GRN creates finance entry without reading SQL

#### BUG-WF-011 [MEDIUM] — No partial delivery tracking confirmation
The frontend procurement service has a quantity field for received items, but there's no explicit status tracking for "partially received" POs in the data model visible from the service layer. A PO might show as "pending" even after partial delivery.

---

### WF-007: HR Attendance → Payroll

**Status:** ⚠️ Partial — payroll calculation logic is in finance service, not HR service

**File:** `src/services/financeService.ts` (payroll section), `src/services/hr/hrService.ts`

**Checklist:**
- ✅ `payroll_runs` and `payroll_records` tables referenced correctly
- ✅ Payroll creates journal entry when posted
- ✅ Employee allowances and deductions fetched for payroll
- ❌ No automated payroll calculation — payroll amounts must be manually entered
- ❌ Attendance records not auto-fed into payroll calculation

#### BUG-WF-012 [MEDIUM] — No automated payroll calculation from attendance
`fetchPayrollRecords()` reads pre-calculated `payroll_records` rows. There is no service function that takes attendance data → computes `basic × (worked_days / total_days)` → creates payroll records automatically. Payroll amounts appear to be entered manually.

**Impact:** Payroll for large staff is error-prone without automation. EPF/ETF (Sri Lanka statutory) deductions must be manually calculated.

---

### WF-008: Online Order → Delivery

**Status:** ✅ Complete

**File:** `src/stores/deliveryStore.js`, `src/services/deliveryService.ts`

**Checklist:**
- ✅ Delivery store manages accept/pickup/deliver state transitions
- ✅ Realtime subscription for new assignments
- ✅ `newAssignmentAlert` triggers sound notification
- ✅ `booted` flag prevents double-initialization
- ✅ Branch watcher triggers re-init when branch becomes available
- ✅ `loadHistory()` provides completed deliveries

**No bugs found in WF-008.**

---

### WF-009: Refunds & Returns

**Status:** ❌ NOT IMPLEMENTED — no refund workflow found

**Checklist:**
- ❌ No `processRefund()` function in orderStore or cashierStore
- ❌ No `refund` order status in the status machine
- ❌ No inventory return on refund
- ❌ No loyalty points reversal on refund
- ❌ No finance reverse-entry on refund

#### BUG-WF-013 [HIGH] — Refund workflow completely missing
There is no frontend implementation for order refunds or voids. The `reverseJournalEntry()` exists in financeService but is not connected to any order-level refund action. Cashiers have no way to process a refund through the system — they would have to do it manually outside the ERP.

**Impact:** High operational risk. Without refund capability:
- Cash refunds are untracked (PCI/audit risk)
- Inventory stays deducted even for returned items
- Finance shows incorrect revenue
- Customer loyalty points not reversed

**Required RPCs (currently missing from frontend):**
```typescript
// Needed in cashierStore or orderService:
async function processRefund(orderId: string, amount: number, reason: string, lineItemIds?: string[])
// Should call: rpc('process_refund', { p_order_id, p_amount, p_reason })
```

---

### WF-010: Loyalty Points

**Status:** ⚠️ Partial — earn works via waiter serve, broken for Quick Pay

**File:** `src/services/loyaltyService.ts`, `src/stores/waiterOrderStore.js`

**Checklist:**
- ✅ Coin-based tier system (Standard 0-99 / Silver 100-249 / Gold 250+)
- ✅ `applyLoyaltyReward()` uses server-side RPC (idempotent)
- ✅ `rpc_apply_loyalty_reward` called from `process_waiter_mark_served`
- ✅ Admin manual coin adjustment available
- ✅ Tier progress calculation correct
- ❌ Quick Pay (processPayment) bypasses loyalty reward
- ❌ Client-side coin preview uses hardcoded threshold

#### BUG-WF-014 [HIGH] — Quick Pay bypasses loyalty point awarding

**Flow analysis:**
- **Normal flow:** waiter marks served → `process_waiter_mark_served` RPC → calls `rpc_apply_loyalty_reward` ✅
- **Quick Pay flow:** `processPayment()` → `process_waiter_accept` → `process_cashier_invoice` → `process_cashier_payment` → done. **No loyalty reward call.**

```js
// orderStore.js:313-335 — processPayment() calls:
// 1. process_waiter_accept ✅
// 2. process_cashier_invoice ✅
// 3. process_cashier_payment ✅
// 4. ??? loyalty reward — MISSING
```

**Impact:** Any customer paying directly at POS (Quick Pay — most common flow in a busy restaurant) never earns loyalty coins. Only table-service orders where waiter taps "Mark Served" earn points. This is a silent data integrity issue — customers see 0 coins despite spending money.

**Fix:** Add loyalty call at end of `processPayment()`:
```typescript
// After process_cashier_payment succeeds:
if (selectedCustomer.value?.id) {
  await supabase.rpc('rpc_apply_loyalty_reward', { p_order_id: order.id })
}
```

---

#### BUG-WF-015 [MEDIUM] `src/services/loyaltyService.ts:221-224`
**Client-side coin preview uses hardcoded threshold**

```typescript
export function calculateCoinsPreview(amount: number, threshold = 5000, perThreshold = 1): number {
  if (amount <= 0) return 0
  return Math.floor(amount / threshold) * perThreshold
}
```

The function defaults to LKR 5,000 per coin, but the actual rate is defined in the DB (or admin settings). If admin changes the rate, the client preview shown in POS/customer UI will be wrong until code is redeployed.

**Fix:** Fetch the earn rate from `loyalty_settings` table and pass it here instead of using a default.

---

### WF-011: Discounts & Promotions

**Status:** ⚠️ Partial — basic % discount works, no promotion engine

**Checklist:**
- ✅ % discount on subtotal implemented
- ✅ Discount stored in DB
- ❌ No manager approval workflow for discounts
- ❌ No fixed-amount discount (only % supported)
- ❌ No BOGO / happy hour / item-level discount promotions
- ❌ No discount logged with approver ID in audit

#### BUG-WF-016 [LOW] — No authorization required for large discounts
A cashier can apply 99% discount to any order without manager approval. There is no permission check or approval workflow for discounts above a threshold.

---

### WF-012: Notifications

**Status:** ✅ Complete for operational notifications

**Checklist:**
- ✅ New order → waiters notified (realtime + sound alert)
- ✅ Order accepted → kitchen gets KOT (DB trigger)
- ✅ KOT ready → cashier queue updated
- ✅ Low stock → `v_low_stock_alerts` view exists
- ✅ 5-min order reminder for waiters
- ✅ KOT ready sound + notification for kitchen
- ⚠️ Low stock: no push notification / realtime alert to inventory manager

#### BUG-WF-017 [LOW] — Low stock alerts are pull-only (no push)
`v_low_stock_alerts` view exists but there's no realtime subscription or notification triggered when an item drops below threshold. Inventory managers must manually check the Inventory page.

---

### WF-013: Audit Logs

**Status:** ✅ Exists — `audit_logs` table + `finance_audit_logs`

**Checklist:**
- ✅ `logFinanceAction()` function exists and used
- ✅ Finance operations logged with entity_type, user_id, timestamps
- ✅ `order_status_events` table tracks each status transition with actor_user_id
- ⚠️ Cannot confirm audit logs have append-only RLS without reading SQL (DBauditor to verify)

---

### WF-014: Multi-Branch

**Status:** ✅ Operational for waiter/kitchen; ⚠️ partial for reports

**Checklist:**
- ✅ `waiterOrderStore`: subscribes to per-branch channels for each shift branch
- ✅ `auth_branch_ids()` DB function restricts RLS per branch
- ✅ `authStore.currentBranch` used throughout for branch scoping
- ⚠️ No `switchBranch()` function visible in authStore
- ⚠️ Reports don't auto-refresh when branch changes

---

### WF-015: Offline Sync

**Status:** ✅ Infrastructure exists; scope limited

**File:** `src/core/offline/offlineSyncEngine.ts`

**Checklist:**
- ✅ `SAFE_OFFLINE_MODULES = ['pos', 'kitchen', 'waiter', 'hr', 'delivery']`
- ✅ `BLOCKED_OFFLINE_MODULES = ['finance', 'procurement']` — cannot finalize offline
- ✅ IndexedDB via `offlineDb.ts` for queue persistence
- ✅ Online/offline event listeners for auto-sync trigger
- ⚠️ Conflict resolution strategy not visible from service layer

---

## Calculation Audit

| Calculation | Expected | Implementation | Status |
|-------------|----------|----------------|--------|
| Subtotal | SUM(item.price × qty) | `cartItems.reduce(...)` | ✅ |
| Discount amount | subtotal × (discount% / 100) | Line 42 orderStore | ✅ |
| Taxable amount | subtotal - discountAmount | Line 44 orderStore | ✅ |
| Tax amount | taxableAmount × (taxRate / 100) | Line 46 orderStore | ✅ (disabled, rate=0) |
| Service charge | subtotal × 0.10 (dine-in only) | Lines 48-53 orderStore | ❌ HARDCODED |
| Delivery charge | Configurable field | Exists in state | ❌ NOT IN TOTAL |
| Total | subtotal - discount + tax + service | Line 55 orderStore | ❌ MISSING delivery |
| Discount cap | Max 100% | Not implemented | ❌ NO CAP |
| Loyalty coins | 1 coin / LKR 5000 | calculateCoinsPreview() | ⚠️ HARDCODED |
| Payroll gross | SUM(basic + allowances + overtime) | Manual entry | ⚠️ NOT AUTOMATED |
| Payroll journal | Dr Gross = Cr Deductions + Cr Net | postPayrollToJournal() | ⚠️ ROUNDING RISK |
| Double-entry | SUM(dr) = SUM(cr) | Application only, no DB | ❌ NOT ENFORCED |

---

## Cross-Module Integration Issues

### INT-001: POS ↔ Finance
**Status:** ✅ Integrated via `finance_queue` + `process_cashier_payment` RPC  
**Gap:** Delivery charge not in total → finance records wrong amounts for delivery orders (ties to BUG-WF-001)

### INT-002: POS ↔ Loyalty
**Status:** ❌ BROKEN for Quick Pay  
**Gap:** `processPayment()` (Quick Pay) does not call `rpc_apply_loyalty_reward`. Only waiter mark-served flow awards coins. (BUG-WF-014)

### INT-003: POS ↔ Inventory
**Status:** ✅ Integrated via `stock_queue` + `rpc_process_inventory_for_order`  
**Gap:** No frontend visibility into deduction success/failure

### INT-004: Finance ↔ Reversals
**Status:** ❌ BROKEN  
**Gap:** `reverseJournalEntry()` only flags `is_reversed=true` without creating counter-entries. General ledger still shows original amounts. (BUG-WF-008)

### INT-005: HR ↔ Finance
**Status:** ⚠️ Partial  
**Gap:** Payroll journal posting implemented but payroll calculation from attendance is manual. No automated calculation.

### INT-006: Procurement ↔ Finance  
**Status:** ⚠️ Partial  
**Gap:** Cannot confirm GRN creates AP journal entry without SQL audit.

---

## Missing Workflow Implementations

### MISSING-001: Refund / Void Workflow
No `processRefund()`, no `voidOrder()`, no inventory return, no loyalty reversal, no finance counter-entry on refund. This is the most critical missing feature.

**Required components:**
- `process_refund(order_id, amount, reason)` RPC in Supabase
- `cashierStore.refundOrder()` calling the RPC
- Finance counter-entry creation
- Inventory return to stock
- Loyalty coins reversal

### MISSING-002: Automated Payroll Calculation
No function calculates payroll from attendance records. All `payroll_records` amounts are entered manually. Required: `calculatePayroll(period_start, period_end, branch_id)` service function.

---

## Bug Registry — Sorted by Priority

### 🔴 CRITICAL (P0)

| ID | Module | File:Line | Description | Impact |
|----|--------|-----------|-------------|--------|
| BUG-WF-001 | POS | `src/stores/orderStore.js:55` | deliveryCharge NOT included in computed total | Delivery orders: wrong total shown, wrong amount stored in DB, wrong finance entries |

### 🟠 HIGH (P1)

| ID | Module | File:Line | Description | Impact |
|----|--------|-----------|-------------|--------|
| BUG-WF-002 | POS | `orderStore.js:359` | Order number collision — timestamp-based, duplicates at same second | Duplicate order numbers confuse cashier, waiter, audit trail |
| BUG-WF-003 | POS | `orderStore.js:48` | Service charge hardcoded 10% — no branch config | Multi-branch rate differences ignored |
| BUG-WF-007 | Finance | `financeService.ts:78` | Double-entry not enforced at DB level | Unbalanced journals can corrupt trial balance |
| BUG-WF-008 | Finance | `financeService.ts:107` | `reverseJournalEntry()` only sets flag, no counter-entry | Reversed entries still affect account balances |
| BUG-WF-013 | Orders | Multiple files | Refund workflow completely missing | Cash refunds untracked, inventory not returned, finance not corrected |
| BUG-WF-014 | Loyalty | `orderStore.js:329` | Quick Pay bypasses loyalty point awarding | POS customers never earn coins |

### 🟡 MEDIUM (P2)

| ID | Module | File:Line | Description | Impact |
|----|--------|-----------|-------------|--------|
| BUG-WF-004 | POS | `orderStore.js:42` | No cap on discount — negative totals possible | Negative total_amount in DB, payment RPCs may fail |
| BUG-WF-005 | POS | `orderStore.js:209` | Rollback has no error handling — ghost orders possible | Orphaned pending_waiter orders appear in waiter inbox |
| BUG-WF-009 | Finance | `financeService.ts:576` | Payroll journal can be imbalanced due to rounding | Accumulated imbalance over time in trial balance |
| BUG-WF-010 | Inventory | Multiple | No visibility into inventory deduction success/failure | Silent stock deduction failures go unnoticed |
| BUG-WF-012 | HR | `hrService.ts` | No automated payroll calculation from attendance | Manual payroll error-prone, EPF/ETF not automated |
| BUG-WF-015 | Loyalty | `loyaltyService.ts:221` | Coin preview hardcoded at LKR 5000/coin threshold | Wrong preview if admin changes earn rate |

### 🟢 LOW (P3)

| ID | Module | File:Line | Description | Impact |
|----|--------|-----------|-------------|--------|
| BUG-WF-006 | KDS/Waiter | `waiterOrderStore.js:421` | KOT realtime channel no branch filter | Performance concern at scale |
| BUG-WF-016 | POS | `orderStore.js` | No authorization required for large discounts | Any cashier can apply 100% discount |
| BUG-WF-017 | Inventory | Missing | Low stock alerts are pull-only, no push notification | Inventory manager must manually check |

---

## State Management Correctness Audit

### orderStore.js
- ✅ `isSending` prevents double-submit
- ✅ `finally` block always resets `isSending`
- ✅ Cart cleared after successful payment
- ⚠️ `_loadedOrderId` not reset when `sendToKitchen()` is called (only via `clearCart()`)
- ✅ `discount.value` is reactive and validated upstream in form

### waiterOrderStore.js
- ✅ `loading` properly set/unset in try/finally
- ✅ `accepting` set per-order (prevents accepting multiple simultaneously)
- ✅ Race condition in `handleOrderChange` — optimistic removal from pendingOrders
- ⚠️ `fetchMyOrders()` called twice on order accept (line 291 + setTimeout 294) — double network call

### kitchenDisplayStore.js
- ✅ Optimistic update with rollback on acceptTicket/markReady
- ✅ `timerInterval` cleared in cleanup
- ✅ `_alertRepeatTimer` cleared in `stopAlertRepeating`
- ✅ Deduplication of merged ticket arrays (line 198)

### deliveryStore.js
- ✅ `booted` flag prevents double-initialization
- ✅ Watch on `branchId` for late initialization

---

## Production Readiness — Workflow Layer

| Check | Status | Notes |
|-------|--------|-------|
| POS order creation | ✅ Works | Delivery total bug |
| Quick Pay flow | ⚠️ Partial | Missing loyalty + delivery total |
| Waiter accept flow | ✅ Complete | Race condition handled |
| KDS mark ready | ✅ Complete | Full flow works |
| Finance posting | ⚠️ Partial | Reversal broken, no DB balance check |
| Inventory deduction | ✅ Via queue | No UI feedback |
| Loyalty points | ⚠️ Partial | Quick Pay excluded |
| Refund/Void | ❌ Missing | Critical gap |
| Payroll | ⚠️ Manual | No automation |
| Offline sync | ✅ Infrastructure | Limited scope |
| Multi-branch | ✅ Operational | Reports need work |

---

## Priority Fix Recommendations for Fixer Agent

### P0 (Fix First — Data Integrity)
1. **BUG-WF-001**: Add `deliveryCharge.value` to computed `total` in `orderStore.js:55`

### P1 (Fix Next — Business Logic)
2. **BUG-WF-014**: Add loyalty reward call in `processPayment()` after successful payment
3. **BUG-WF-008**: Implement true journal reversal (insert counter-entries) in `reverseJournalEntry()`
4. **BUG-WF-007**: Add balance validation in `createJournalEntry()` before inserting lines
5. **BUG-WF-002**: Replace timestamp order number with sequence-based generation
6. **BUG-WF-003**: Load service charge rate from branch settings instead of hardcoding 0.1

### P2 (Then Medium)
7. **BUG-WF-004**: Cap discount at 100% in orderStore
8. **BUG-WF-009**: Use `total_gross - total_deductions` for net salary in payroll journal
9. **BUG-WF-015**: Fetch loyalty earn rate from DB instead of hardcoded default

---

*End of Workflow Audit Report — WorkflowAuditor*
