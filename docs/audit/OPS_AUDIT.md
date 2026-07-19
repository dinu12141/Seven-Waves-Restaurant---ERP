# Operations Section Audit
**Auditor:** OpsQA Agent  
**Date:** 2026-07-18  
**Scope:** POS, Orders, KDS, Tables, Shifts, Waiter App, Cashier Queue

---

## CRITICAL Issues (data loss / payment failure / auth bypass)

### [src/pages/POSPage.vue:1803-1808] VOID handler uses `item.total_price` which is undefined on cart items → NaN written to DB
- **Root cause:** `store.cartItems[idx]` objects (from `orderStore.addItem()`) have fields `price` and `qty`, not `total_price`. The VOID handler subtracts `item.total_price` from `ord.subtotal` and `ord.total_amount`. `undefined - undefined = NaN`. `Math.max(0, NaN) = NaN`. Supabase will write NaN → NULL or fail, permanently corrupting the order's subtotal/total_amount in the DB.
- **Fix required:** Replace `item.total_price` with `item.price * item.qty`.

### [src/pages/POSPage.vue:1971-1979] FOC handler queries `user_roles` with `.select('roles(name)')` — wrong schema, always returns empty, no manager can authorize FOC
- **Root cause:** The VOID handler at line 1740 correctly uses `.select('role')` (direct column on `user_roles`). The FOC handler at line 1971 uses `.select('roles(name)')` which attempts a join on a non-existent `roles` table FK, returning empty `roleData`. The `roles.map(...)` then produces `[]` and `isManager` is always `false`. Result: every FOC attempt is rejected with "User does not have Manager/Admin privileges".
- **Fix required:** Change `.select('roles(name)')` to `.select('role')` and update role check to match VOID handler pattern.

### [src/pages/POSPage.vue:1724-1756] VOID manager-auth signs in as manager but session restore has no null guard — if cashier session expired, auth state is permanently broken
- **Root cause:** `originalSessionRes.data.session` may be null if the cashier's token expired. The code then calls `supabase.auth.setSession({ access_token: null, refresh_token: null })` which throws or clears auth, locking out the cashier permanently.
- **Fix required:** Add null guard: `if (originalSessionRes.data.session) { await supabase.auth.setSession(...) }`.

---

## HIGH Issues (broken feature / wrong data)

### [src/stores/orderStore.js:118-129] `clearCart()` does not reset `deliveryCharge` — delivery charge bleeds into next order
- **Root cause:** `clearCart()` resets `cartItems`, `customerName`, `selectedTable`, `tableNumber`, `discount`, `orderNumber`, `_loadedOrderId`, `deliverySource`, and `orderType`, but NOT `deliveryCharge`. After paying a delivery order with a charge (e.g. LKR 250), the next new order starts with `deliveryCharge = 250`. The customer pays a phantom delivery charge.
- **Fix required:** Add `deliveryCharge.value = 0` to `clearCart()`.

### [src/pages/OrdersPage.vue:504-528] `advanceOrder()` does a direct status UPDATE for `pending_waiter → accepted` — bypasses KOT orchestration, orders never get KOTs
- **Root cause:** `advanceOrder()` calls `orderStore.updateOrderStatus(order.id, 'accepted')` which is a plain `UPDATE orders SET status='accepted'`. This does NOT call `accept_order_as_waiter` or `process_waiter_accept` RPC. The `trg_generate_kot` trigger fires on status change only when `assigned_waiter_id` is also set (via the RPC). Without the RPC, KOTs are never generated. Kitchen never receives the order.
- **Fix required:** For `pending`/`pending_waiter` → `accepted`, call `supabase.rpc('process_waiter_accept', { p_order_id: order.id })` instead of `updateOrderStatus`.

### [src/stores/orderStore.js:476-478] `loadOrderFromQueue()` reconstructs discount as rounded integer percentage — causes re-billing with wrong discount amount
- **Root cause:** `discount.value = Math.round((queueOrder.discount_amount / queueOrder.subtotal) * 100)`. This rounds to the nearest whole percent. If the original discount was LKR 37.50 on a LKR 750 subtotal (5%), it recalculates to 5% exactly — fine. But if it was LKR 112.50 on LKR 750 (15%), rounding is OK. However if discount was LKR 100 on LKR 670 (≈14.93%), it rounds to 15%, applying an extra LKR 0.47 discount the customer shouldn't get (or short-changing by similar amounts). For large orders this can be material.
- **Fix required:** Use `Math.round((queueOrder.discount_amount / queueOrder.subtotal) * 10000) / 100` to keep 2 decimal places. Or better, store and restore `discount_amount` directly as an absolute amount rather than converting to/from percentage.

### [src/stores/waiterOrderStore.js:420-432] KOT realtime subscription has no `branch_id` filter — subscribes to ALL branches' KOT events
- **Root cause:** `kotChannel` subscribes to `table: 'kot_tickets'` with no filter. On any branch's KOT update, the handler fires `fetchMyOrders()` if the KOT's `order_id` is in the waiter's current `myOrders`. At low load this is harmless; on a multi-branch system it causes unnecessary N+1 DB calls for every KOT across every branch. `kot_tickets` has no `branch_id` column so a join-based filter isn't possible, but the guard logic in the handler is correct — this is a performance concern rather than a correctness bug.
- **Fix required:** Add early exit in `handleKotChange()` for missing `newRow.order_id`, and document the known limitation. No schema change needed.

### [src/pages/POSPage.vue:2082-2106] FOC `processFOCOrder()` for manual POS flow silently omits `company_id` instead of throwing — may fail RLS silently
- **Root cause:** `sendToKitchen()` throws `new Error('Company information not loaded...')` if `!companyId`. But `processFOCOrder()` at line 2106 does `if (companyId) orderPayload.company_id = companyId` — silently proceeding without `company_id` if it's missing. If the `orders` table has a NOT NULL constraint or RLS requires `company_id`, the insert will fail with a cryptic Supabase error rather than a user-friendly message.
- **Fix required:** Add the same guard as `sendToKitchen()`: `if (!companyId) throw new Error('Company information not loaded. Please refresh.')`.

---

## MEDIUM Issues (UX problem / missing validation)

### [src/pages/POSPage.vue:159-166] Payment mode cash amount pre-fills with `store.total.toString()` — but user hasn't entered payment yet
- `numBuffer.value = store.total.toString()` at line 2734 pre-fills the amount received field with the total. This means if the cashier presses ENTER without looking, `paymentAmount === store.total`, change is LKR 0.00. However if user typed into numBuffer before switching to payment mode, the total overwrites their entry. Low impact but misleading.
- **Fix:** Don't pre-fill `numBuffer` with total; let the cashier type or use quick-cash buttons.

### [src/pages/waiter-app/ShiftInboxPage.vue:228-244] Double notification on successful accept with unavailable items — waiterOrderStore fires "Order Accepted!" AND the page fires "Order accepted — X items excluded"
- The `orderStore.acceptOrder()` always fires `Notify.create({ type: 'positive', message: 'Order Accepted!' ...})` on success (waiterOrderStore.js:293). Then `ShiftInboxPage.accept()` fires ANOTHER notification for unavailable items. Users see two stacked notifications.
- **Fix:** Suppress the default store notification when unavailable items are present, OR remove the store's generic notification and let callers decide.

### [src/stores/kitchenDisplayStore.js:280-283] `dismissTicket()` uses plain `UPDATE` with no RPC — does not update parent order status
- When kitchen staff dismiss a "ready" KOT, only `completed_at` is set on `kot_tickets`. The parent order's status stays as `ready`. The cashier/waiter see the order as "ready" even though it's been served from the kitchen's perspective. No server-side cascade happens.
- This may be intentional (waiter marks order served separately), but the KDS should probably call a proper RPC that validates the transition.
- **Fix (if intended):** Document that `dismissTicket` is a UI-only dismiss and the order remains in "ready" state until the waiter marks it served. If not intended, call `process_waiter_mark_served` RPC instead.

### [src/pages/OrdersPage.vue:486-488] `viewOrderKot` and `viewOrderInvoice` use `window.__orderDetailTab` global variable to communicate tab state to the dialog — fragile pattern
- Setting `window.__orderDetailTab = 'kot'` and relying on the dialog to read it via a timeout is a race condition-prone global side effect.
- **Fix:** Pass the initial tab as a prop/emit to `OrderDetailDialog` instead of using a global.

---

## LOW Issues (cosmetic / minor)

### [src/pages/POSPage.vue:828-835] Clock interval updates every 10 seconds but displays only `HH:MM` — needless CPU wakeup
- `clockInterval = setInterval(..., 10000)` runs every 10s but the displayed format `hour:minute` only changes once per minute.
- **Fix:** Change to 60000ms.

### [src/stores/kitchenDisplayStore.js:682] `enrichTicket()` always sets `printCount: 0` — reprints are always shown as first-print notifications
- Print count is never fetched from `kot_print_logs`. The `isReprint` flag in `printKot()` uses `ticket.printCount > 1` but since enrichment always sets it to 0, reprints from fresh page loads show as first prints.
- **Fix:** Fetch print count in `fetchTickets()` via join on `kot_print_logs`, or use `printed_at IS NOT NULL` as the reprint indicator.

### [src/pages/POSPage.vue:3069-3081] `border-radius: 0 !important` applied globally to `*` selector in scoped styles — overrides Quasar component internal border radii
- The `* { border-radius: 0 !important }` in the POS scoped style is too aggressive; it overrides border radii on q-dialog backdrops and other internal elements. This can cause visual artifacts on dialog overlays.
- **Fix:** Scope to specific POS elements instead of the wildcard selector.

---

## Fixes Applied

### Fix 1: `clearCart()` now resets `deliveryCharge`
**File:** `src/stores/orderStore.js`  
**Before:** `clearCart()` did not reset `deliveryCharge.value`  
**After:** Added `deliveryCharge.value = 0` to `clearCart()`

### Fix 2: FOC role query corrected
**File:** `src/pages/POSPage.vue`  
**Before:** `.select('roles(name)')` with broken join → always empty → FOC always denied  
**After:** `.select('role')` + checks `['manager', 'admin'].includes(roleData.role)` (same as VOID handler)

### Fix 3: VOID `item.total_price` → `item.price * item.qty`
**File:** `src/pages/POSPage.vue`  
**Before:** `item.total_price` (undefined) caused NaN to be written to orders.subtotal and orders.total_amount  
**After:** `item.price * item.qty` (correct cart item total)

### Fix 4: VOID session restore null guard
**File:** `src/pages/POSPage.vue`  
**Before:** `supabase.auth.setSession(...)` called unconditionally, risking broken auth if cashier session was expired  
**After:** Wrapped in `if (originalSessionRes.data.session)` guard

### Fix 5: FOC `company_id` guard
**File:** `src/pages/POSPage.vue`  
**Before:** Silently proceeded without `company_id`  
**After:** Throws with user-friendly error if `company_id` missing (consistent with `sendToKitchen`)
