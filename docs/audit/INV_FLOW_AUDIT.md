# INV_FLOW_AUDIT.md — Inventory Workflow Audit

**Agent:** InvFlow  
**Date:** 2026-07-19  
**Scope:** All 6 inventory workflows — Items CRUD, GRN, GIN, Stock Adjustment, Auto-deduction, Stock Take  

---

## Files Audited

| File | Status |
|------|--------|
| `src/services/inventoryService.ts` | ✅ GOOD — correct schema, correct composables |
| `src/stores/inventoryQueueStore.js` | ✅ GOOD — correct stock_queue subscription |
| `src/pages/inventory/ItemsPage.vue` | 🔴 CRITICAL — fixed |
| `src/pages/inventory/StockAdjustmentPage.vue` | 🔴 CRITICAL — fixed |
| `src/pages/inventory/StockTakePage.vue` | 🔴 CRITICAL — fixed |
| `src/pages/inventory/InventoryDashboard.vue` | 🟡 HIGH — fixed |
| `src/pages/procurement/GRNPage.vue` | ✅ GOOD — uses procurementService.ts correctly |

---

## WORKFLOW 1 — ITEM MANAGEMENT

### Bug #1 — CRITICAL: ItemsPage.vue queried `ingredients` table (doesn't exist)
**File:** `src/pages/inventory/ItemsPage.vue`  
**Severity:** CRITICAL — entire page broken, all CRUD operations would fail  

**Root cause:** Page was written against an old schema (`ingredients` table) while the actual schema uses `items` table with FK-based columns.

**Wrong:**
```js
// Queried non-existent table
supabase.from('ingredients').select('*').eq('company_id', authStore.companyId)

// Used non-existent auth getter
authStore.companyId  // undefined — no such getter
authStore.branchId   // undefined — no such getter

// Hardcoded categories instead of loading from DB
const categoryOptions = [
  { label: 'Raw Material', value: 'Raw Material' },  // string stored, not FK
  ...
]

// Wrong column names
form.value.category    // should be category_id (FK)
form.value.uom         // should be inventory_uom_id (FK)
form.value.cost_per_unit  // should be avg_cost
```

**Fix applied:** Complete rewrite using `useItemsList()`, `useCategoryList()`, `useUomList()` from `inventoryService.ts`.
- Categories load from `item_categories` table (not hardcoded)
- UOM loads from `uom` table (not free-text string)
- Fields: `category_id`, `inventory_uom_id`, `avg_cost`, `reorder_level`
- All auth context handled internally by service helpers

---

## WORKFLOW 2 — GRN (GOODS RECEIPT NOTE)

### Status: ✅ GOOD
`GRNPage.vue` imports from `procurementService.ts` which has the correct schema:
- Creates `goods_receipts` + `goods_receipt_lines` tables
- Posting via `postGRN()` RPC handles stock increment
- History shown via `listGRNs()`
- PO import (from both procurement and inventory POs) works correctly

**No fixes required.**

---

## WORKFLOW 3 — GIN (GOODS ISSUE NOTE)

GIN is handled via the inventory document system (`doc_type = 'GIN'`) through the generic `GRNPage.vue` flow and `inventoryService.ts`. The `createDocument()` / `postDocument()` pattern is correct. No standalone GIN page was found — GINs are created through the inventory documents module directly.

---

## WORKFLOW 4 — STOCK ADJUSTMENT

### Bug #2 — CRITICAL: StockAdjustmentPage.vue queried old schema tables
**File:** `src/pages/inventory/StockAdjustmentPage.vue`  
**Severity:** CRITICAL — page completely broken  

**Wrong:**
```js
// Fetched items from non-existent table
supabase.from('ingredients').select('id, name, code, uom')

// Read stock from non-existent table
supabase.from('stock_levels').select('quantity')
  .eq('item_id', itemId).eq('warehouse_id', selectedWarehouse.value)

// Wrote adjustment directly to non-existent table (bypassing trigger)
supabase.from('stock_movements').insert({ ... })
supabase.from('stock_levels').upsert({ ... })

// Used non-existent auth getters
authStore.companyId
authStore.branchId
```

**Fix applied:**
- Items: `useItemsList()` from `inventoryService.ts` (queries `items` table)
- Warehouses: `useWarehouseList()` from `inventoryService.ts`
- Current stock: `fetchStockByWarehouse()` queries `v_stock_on_hand` view
- Post adjustment: `createDocument(header, lines)` + `postDocument(doc.id)`
  - `doc_type: 'ADJUSTMENT'`, `quantity: -Math.abs(qty)` (signed negative = stock reduction)
  - DB trigger handles ledger insertion + `stock_on_hand` update atomically
- History: `useStockLedger({ docType: 'ADJUSTMENT' })` queries `v_inventory_ledger`

**Why signed quantity:** The `ADJUSTMENT` trigger in `inventory_module_functions.sql` reads:
```sql
ELSIF NEW.doc_type = 'ADJUSTMENT' THEN
    IF v_line.quantity < 0 THEN
        PERFORM validate_sufficient_stock(...)
    END IF;
    PERFORM update_stock_on_hand(..., v_line.quantity, ...);
```
Negative quantity = stock out (reduction), positive = stock in (addition). The page posts reductions only.

---

## WORKFLOW 5 — STOCK DEDUCTION (AUTO via Orders)

### Status: ✅ GOOD
`inventoryQueueStore.js` correctly:
- Subscribes to `stock_queue` table filtered by `branch_id`  
- On INSERT of `status='pending'` rows, shows notification
- `processInventory(orderId)` calls `rpcProcessInventory` from `kotDispatchService`
- On processed, removes from pending list

`inventoryService.ts` exports:
- `deductStockForKOT(kotBatchId)` → calls `fn_kot_deduct_stock` RPC
- `reverseStockForKOT(kotBatchId)` → calls `fn_kot_reverse_stock` RPC

These RPCs handle the BOM/recipe-based deduction. If an item has no recipe link, the RPC handles it gracefully.

---

## WORKFLOW 6 — STOCK TAKE (PHYSICAL COUNT)

### Bug #3 — CRITICAL: StockTakePage.vue queried old schema tables
**File:** `src/pages/inventory/StockTakePage.vue`  
**Severity:** CRITICAL — page completely broken  

**Wrong:**
```js
// Count sheet queried non-existent tables
supabase.from('stock_levels')
  .select('item_id, quantity, ingredients(id, name, code, uom)')
  
// Count columns referenced old join alias
field: r => r.ingredients?.name ?? '–'  // always undefined

// Post count wrote to non-existent tables
supabase.from('stock_movements').insert({ ... })
supabase.from('stock_levels').upsert({ ... })

// History queried non-existent tables
supabase.from('stock_movements').select('*, ingredients(name), warehouses(name)')
```

**Fix applied:**
- Count sheet: queries `v_stock_on_hand` (has `item_name`, `item_code`, `uom_code`, `qty_on_hand`)
- Also fetches `inventory_uom_id` from `items` table for document lines
- Column defs: use `item_name`, `item_code`, `uom_code` directly from view
- Post count: `createDocument(header, lines)` + `postDocument(doc.id)`
  - `doc_type: 'STOCK_COUNT'`
  - Lines include: `system_qty`, `counted_qty`, `variance_qty`
  - DB trigger reads `variance_qty` and updates `stock_on_hand` atomically
- History: `useStockLedger({ docType: 'STOCK_COUNT' })` queries `v_inventory_ledger`

---

## BONUS BUGS — InventoryDashboard.vue

### Bug #4 — HIGH: Wrong column names in GRN/GIN count queries
```js
// WRONG — column doesn't exist
.eq('document_type', 'GRN').gte('document_date', today)

// FIXED
.eq('doc_type', 'GRN').gte('doc_date', today)
```

### Bug #5 — HIGH: stock_status comparison used wrong case
```js
// WRONG — view uses lowercase
alert.stock_status === 'OUT_OF_STOCK'

// FIXED — v_low_stock_alerts uses 'out_of_stock' (lowercase)
alert.stock_status === 'out_of_stock'
```
Affected: alert CSS classes, icon names, badge colors, notification filter. 6 occurrences fixed.

### Bug #6 — HIGH: `v_stock_movements` view doesn't exist
```js
// WRONG — this view is not defined in the schema
supabase.from('v_stock_movements').select('movement_type, qty, created_at')

// FIXED — use v_inventory_ledger with correct field names
supabase.from('v_inventory_ledger').select('doc_type, direction, quantity, posted_at')
```

### Bug #7 — HIGH: `min_level` field doesn't exist on view
```js
// WRONG — v_low_stock_alerts doesn't have min_level column
alert.min_level

// FIXED — correct column is reorder_level
alert.reorder_level
```

---

## Summary

| # | Severity | File | Bug | Status |
|---|----------|------|-----|--------|
| 1 | CRITICAL | ItemsPage.vue | Queried `ingredients` table, wrong field names, hardcoded categories | ✅ Fixed |
| 2 | CRITICAL | StockAdjustmentPage.vue | Queried `ingredients`/`stock_levels`, bypassed triggers | ✅ Fixed |
| 3 | CRITICAL | StockTakePage.vue | Queried `ingredients`/`stock_levels`, wrote to old tables | ✅ Fixed |
| 4 | HIGH | InventoryDashboard.vue | Wrong column `document_type` (should be `doc_type`) | ✅ Fixed |
| 5 | HIGH | InventoryDashboard.vue | `OUT_OF_STOCK` should be `out_of_stock` (6 occurrences) | ✅ Fixed |
| 6 | HIGH | InventoryDashboard.vue | `v_stock_movements` view doesn't exist | ✅ Fixed |
| 7 | HIGH | InventoryDashboard.vue | `min_level` field doesn't exist, should be `reorder_level` | ✅ Fixed |
| 8 | — | GRNPage.vue | No bugs — correct service layer | ✅ OK |
| 9 | — | inventoryService.ts | No bugs — well-structured composables | ✅ OK |
| 10 | — | inventoryQueueStore.js | No bugs — correct realtime subscription | ✅ OK |

**Lint result:** 0 errors after all fixes.
