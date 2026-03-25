# Sprint 1 — QA Checklist: KOT Orchestration Engine

## Pre-Deployment

- [ ] Migration file reviewed: `sprint1_kot_orchestration_engine.sql`
- [ ] No DROP TABLE/CASCADE statements (additive migration only)
- [ ] All functions use `SECURITY DEFINER` + `SET search_path = public`

## Functional Tests

### 1. Kitchen Routing

- [ ] Item with direct `kitchen_id` → routes to that kitchen
- [ ] Item with `kitchen_subcategory_map` entry → routes via subcategory
- [ ] Item with category→warehouse→kitchen link → routes via warehouse
- [ ] Item with no mapping → falls back to branch default kitchen
- [ ] Parent category traversal works for nested subcategories

### 2. Order Creation

- [ ] QR order via `create_order_from_session()` → status = `pending_waiter`
- [ ] Kiosk order via `create_kiosk_order()` → status = `pending_waiter`
- [ ] Kitchen routing applied to all order items on creation
- [ ] Duplicate active order on same table → rejected by partial unique index

### 3. Waiter Acceptance

- [ ] `process_waiter_accept(order_id)` → order status = `accepted`
- [ ] KOTs generated per distinct kitchen
- [ ] KOT dispatches created for all 4 targets (KITCHEN, CASHIER, INVENTORY, FINANCE)
- [ ] `cashier_queue` entry created (status=open)
- [ ] `stock_queue` entry created (status=pending)
- [ ] `finance_queue` entry created (status=pending)
- [ ] `erp_event_log` entry created (event_code=waiter_accepted)
- [ ] Notifications sent to kitchen + cashier roles
- [ ] Idempotent: calling twice returns success without duplicates
- [ ] `accept_order_as_waiter()` compat wrapper works

### 4. Add Items to Order

- [ ] `add_items_to_order(order_id, items)` → new KOT batch created
- [ ] `batch_number` incremented correctly
- [ ] New dispatches created for the new KOT
- [ ] Order totals updated
- [ ] Cannot add items to paid/cancelled orders

### 5. Kitchen Flow

- [ ] `process_kitchen_start(kot_id)` → KOT status = `preparing`
- [ ] KITCHEN dispatch marked as `delivered`
- [ ] Order status → `preparing`
- [ ] BOM stock deduction triggered (if configured)
- [ ] `kitchen_start_kot()` compat wrapper works

### 6. Kitchen Ready

- [ ] `process_kitchen_ready(kot_id)` → KOT status = `ready`
- [ ] KOT items status → `ready`
- [ ] When ALL KOTs ready → order status = `ready`
- [ ] Waiter notification sent
- [ ] `kitchen_mark_ready()` compat wrapper works

### 7. Cashier Flow

- [ ] `process_cashier_invoice(order_id)` → order status = `invoiced`
- [ ] `cashier_queue` status → `invoiced`
- [ ] `process_cashier_payment(order_id, 'cash')` → order status = `paid`
- [ ] `cashier_queue` status → `paid`, `finance_queue` → `posted`
- [ ] Stock deduction executed (on_paid stage)
- [ ] Journal entry posted
- [ ] Waiter notification sent
- [ ] `cashier_invoice_order()` + `cashier_pay_order()` compat wrappers work

### 8. One Order Per Session

- [ ] Active order on table → prevents new order on same table
- [ ] After payment (status=paid) → table freed for new order

## Security Tests

- [ ] Unauthenticated user → all RPCs return error
- [ ] Kitchen role cannot access CASHIER dispatches
- [ ] Cashier role cannot access INVENTORY dispatches
- [ ] Waiter role cannot start KOT (requires kitchen role)
- [ ] Admin/manager have full access to all queue tables
- [ ] `kitchen_subcategory_map` readable by all, writable by admin/manager only

## Realtime Tests

- [ ] `erp_event_log` INSERT fires `pg_notify` via `broadcast_erp_event()`
- [ ] All orchestration tables in `supabase_realtime` publication
- [ ] `kitchen_subcategory_map` in realtime publication
