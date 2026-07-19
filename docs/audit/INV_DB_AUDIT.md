# INV_DB_AUDIT.md — Inventory Module Database Audit

**Auditor:** InvDB  
**Date:** 2026-07-19  
**Supabase Project:** clykwuzajtwvwuavmtzs  
**Status:** ✅ All Critical & High fixes applied to live DB

---

## 1. TABLES AUDIT

### 1.1 Core Inventory Tables (New System — `inventory_documents` engine)

| Table | Exists | company_id | branch_id | Status |
|-------|--------|------------|-----------|--------|
| `items` | ✅ | ✅ | ❌ (company-scoped — intentional) | OK |
| `item_categories` | ✅ | ✅ | ❌ (company-scoped) | OK |
| `uom` | ✅ | ✅ | ❌ (company-scoped) | OK |
| `inventory_documents` | ✅ | ✅ | ✅ | OK |
| `inventory_document_lines` | ✅ | via parent doc | via parent doc | OK |
| `inventory_ledger` | ✅ | ✅ | ✅ | OK |
| `stock_on_hand` | ✅ | ✅ | via warehouse | OK |
| `warehouses` | ✅ | ✅ | ✅ | OK |
| `goods_receipts` | ✅ | ✅ | ✅ | OK — new GRN system |
| `goods_receipt_lines` | ✅ | via grn | via grn | OK |
| `purchase_orders` | ✅ | ✅ | ✅ | OK |
| `purchase_order_lines` | ✅ | via PO | via PO | OK |
| `suppliers` | ✅ | ✅ | ❌ (company-scoped) | OK |

### 1.2 Legacy Tables (Superseded — Deny-Only)

| Table | Status | Note |
|-------|--------|------|
| `grn` | ❌ DENIED | Legacy — replaced by `goods_receipts` |
| `grn_items` | ❌ DENIED | Legacy — replaced by `goods_receipt_lines` |
| `inventory_items` | ❌ DENIED | Legacy — replaced by `items` |
| `stock_items` | ❌ DENIED | Legacy — replaced by `stock_on_hand` |
| `ingredients` | ⚠️ Mixed policies | Legacy — replaced by `items`. Conflicting deny + allow policies (harmless, PERMISSIVE OR). |
| `stock_levels` | ⚠️ Mixed policies | Legacy — replaced by `stock_on_hand`. Conflicting deny + allow. |
| `stock_movements` | ⚠️ Mixed policies | Legacy — replaced by `inventory_ledger`. Conflicting deny + allow. |

### 1.3 Missing Tables Expected by Audit Scope

| Expected | Actual | Verdict |
|---------|--------|---------|
| `inventory_categories` | → `item_categories` | ✅ Exists under correct name |
| `units_of_measure` | → `uom` | ✅ Exists under correct name |
| `goods_issue_notes` / `gin_items` | → `inventory_documents` (doc_type='GIN') | ✅ Covered by document engine |
| `stock_adjustments` | → `inventory_documents` (doc_type='ADJUSTMENT') | ✅ Covered by document engine |

---

## 2. RLS AUDIT

### 2.1 RLS Status — All Inventory Tables

All audited tables have RLS **enabled**. ✅

### 2.2 Policy Analysis

#### `items` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `items_modify_own_company` | ANY company user could modify items (waiters, delivery, etc.) | DROPPED |
| `items_modify_admin_manager_inventory` | — | ADDED: Only admin/manager/inventory role can write |
| `items_select_own_company` | Company-scoped SELECT | ✅ Unchanged — correct |

**Finding CRITICAL-1:** `items_modify_own_company` allowed any authenticated company user to INSERT/UPDATE/DELETE items. A waiter could have modified the item master. Fixed.

#### `item_categories` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `item_categories_read_all` | No company_id scope — leaked categories across companies | DROPPED |
| `item_categories_read_company` | — | ADDED: company_id-scoped SELECT |
| `item_categories_write_admin` | No WITH CHECK clause, no company scope | DROPPED |
| `item_categories_write_admin` (new) | — | ADDED: WITH CHECK + company_id scope |

**Finding HIGH-1:** Cross-company category data leak on SELECT. Fixed.

#### `uom` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `uom_read_all` | SELECT only for all authenticated | ✅ Unchanged |
| `uom_write_admin` | MISSING | ADDED: admin/manager can write |

**Finding HIGH-2:** No one could create/edit UOMs through the app. Fixed.

#### `inventory_documents` — OK
- `id_admin`: admin full access ✅
- `id_inventory`: inventory role, branch-filtered ✅
- `id_manager`: manager, branch-filtered ✅

#### `inventory_document_lines` — OK
- `idl_admin`: admin/manager full access ✅
- `idl_inventory`: inventory role, branch-filtered via parent doc ✅

#### `inventory_ledger` — OK
- `il_admin`: admin full access ✅
- `il_inventory`: inventory SELECT, branch-filtered ✅
- `il_finance`: finance SELECT, branch-filtered ✅
- **Gap:** No INSERT policy — inserts done via SECURITY DEFINER trigger `post_inventory_document`. ✅ By design.

#### `goods_receipts` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `grn_inventory` | SELECT only | CHANGED: Full ALL with branch filter |
| `grn_admin` | admin ALL | ✅ Unchanged |
| `grn_manager` | manager ALL, branch-filtered | ✅ Unchanged |

**Finding HIGH-3:** Inventory staff couldn't create GRNs. Fixed.

#### `goods_receipt_lines` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `grnl_inventory` | SELECT only | CHANGED: Full ALL with branch filter |
| `grnl_admin` | admin/manager ALL | ✅ Unchanged |

#### `purchase_order_lines` — FIXED
| Policy | Before | After |
|--------|--------|-------|
| `pol_inventory` | SELECT only | CHANGED: Full ALL, branch-filtered via parent PO |
| `pol_admin` | admin/manager ALL | ✅ Unchanged |

**Finding HIGH-4:** `trg_fn_post_goods_receipt` trigger updates PO lines when GRN is posted. Inventory role lacked write permission — would fail for inventory users. Fixed.

#### `purchase_orders` — Partial Gap (Accepted Risk)
- `po_inventory` is SELECT-only — inventory can't create POs, only admin/manager can.
- **Verdict:** Intentional. PO creation is a procurement/management function.

---

## 3. RPCS / FUNCTIONS AUDIT

### 3.1 Key RPCs — Status

| RPC | Exists | SECURITY DEFINER | search_path | Verdict |
|-----|--------|-----------------|-------------|---------|
| `post_grn(uuid)` | ✅ | ✅ | ✅ | OK — queries `goods_receipts` |
| `post_adjustment(...)` | ✅ | ✅ | ✅ | OK |
| `low_stock_alerts(...)` | ✅ | ✅ | ✅ | OK |
| `issue_stock_for_order(uuid)` | ✅ | ✅ | ✅ | OK |
| `deduct_stock_by_kot(uuid)` | ✅ | ✅ | ✅ | OK |
| `reconcile_stock_on_hand(...)` | ✅ | ✅ | ✅ | OK |
| `delete_item_cascade(uuid)` | ✅ | ✅ | ✅ | OK |
| `generate_item_code(uuid)` | ✅ | ❌ | ❌ | MEDIUM — not SECURITY DEFINER |

### 3.2 Missing RPCs
- `get_stock_summary(branch_id)` — Missing as standalone RPC. Covered by `v_stock_on_hand` view + `low_stock_alerts()`. Acceptable.
- `get_low_stock_items(branch_id)` — Covered by `low_stock_alerts()` function. OK.

---

## 4. TRIGGERS AUDIT

### 4.1 `inventory_documents` Triggers

| Trigger | Event | Function | Status |
|---------|-------|----------|--------|
| `trg_post_inventory` | BEFORE UPDATE | `post_inventory_document()` | ✅ SECURITY DEFINER |
| `trg_block_posted_edit` | BEFORE UPDATE | `block_posted_doc_edit()` | ✅ Prevents editing posted docs |
| `trg_block_line_edit` | BEFORE on lines | `block_line_edit_on_posted()` | ✅ Prevents editing lines of posted docs |
| `trg_auto_bill_from_inventory_doc` | AFTER UPDATE | `trg_fn_auto_bill_from_inventory_doc()` | ✅ Auto-finance posting |
| `trg_update_po_on_grn` | AFTER UPDATE | `update_po_on_grn_post()` | ✅ PO status sync |
| Audit triggers (×3) | ALL events | `audit_record()` | ✅ |

### 4.2 `goods_receipts` Triggers — FIXED

| Trigger | Event | Function | Before | After |
|---------|-------|----------|--------|-------|
| `trg_post_goods_receipt` | BEFORE UPDATE | `trg_fn_post_goods_receipt()` | NOT SECURITY DEFINER | ✅ SECURITY DEFINER applied |
| `trg_block_grn_edit` | BEFORE UPDATE | `trg_fn_block_procurement_edit()` | ✅ | ✅ |
| `trg_auto_bill_from_grn` | AFTER UPDATE | `trg_fn_auto_bill_from_grn()` | ✅ | ✅ |

**Finding HIGH-5:** `trg_fn_post_goods_receipt` was NOT SECURITY DEFINER. When posting a GRN, it INSERTs into `inventory_documents`, updates `purchase_order_lines`, and updates `purchase_orders`. Running as the calling user could fail under restrictive RLS. Applied SECURITY DEFINER.

### 4.3 `orders` Triggers (Inventory-Relevant)

| Trigger | Function | Status |
|---------|----------|--------|
| `trg_stock_on_order_accept` | `trg_fn_stock_on_order_accept()` | ✅ SECURITY DEFINER |
| `trg_stock_on_order_paid` | `trg_fn_stock_on_order_paid()` | ✅ SECURITY DEFINER |
| `trg_order_cancel_inventory` | `trg_fn_order_cancel_inventory()` | ✅ SECURITY DEFINER |
| `trg_kot_batch_deduct_stock` | `trigger_kot_batch_deduct_stock()` | ✅ SECURITY DEFINER |
| `trg_kot_batch_inventory` | `trg_fn_kot_batch_inventory()` | ✅ SECURITY DEFINER |

### 4.4 Document Engine Flow (Verified)
```
GRN Post Flow:
  goods_receipts UPDATE(status='posted')
    → trg_post_goods_receipt (BEFORE, SECURITY DEFINER)
        → INSERT inventory_documents (doc_type='GRN', status='draft')
        → INSERT inventory_document_lines (from goods_receipt_lines)
        → UPDATE inventory_documents SET status='posted'
            → trg_post_inventory (BEFORE)
                → inventory_ledger INSERT (direction='IN')
                → stock_on_hand UPSERT (qty++)
                → items UPDATE (avg_cost, last_purchase_price)
        → UPDATE purchase_order_lines (received_qty++)
        → UPDATE purchase_orders (status: open→partial→closed)
        → UPDATE supplier_item_prices (last_price)
```
**Verdict:** GRN posting flow is complete and correct. ✅

---

## 5. DATA INTEGRITY AUDIT

### 5.1 `inventory_documents` Constraints

| Constraint | Status |
|------------|--------|
| `chk_inv_doc_status` | ✅ `IN ('draft','posted','cancelled')` |
| `chk_inv_doc_type` | ✅ `IN ('PO','GRN','GIN','TRANSFER','ADJUSTMENT','STOCK_COUNT','BOM_DEDUCT','OPENING')` |
| `chk_transfer_target` | ✅ TRANSFER requires target_warehouse_id |
| FK: company_id → companies | ✅ |
| FK: branch_id → branches | ✅ |
| FK: warehouse_id → warehouses | ✅ |
| FK: supplier_id → suppliers | ✅ |

### 5.2 `stock_on_hand` — FIXED

| Constraint | Before | After |
|------------|--------|-------|
| `chk_no_negative_stock` | MISSING | ✅ ADDED: `qty_on_hand >= 0` |
| FK: item_id → items | ✅ | ✅ |
| FK: warehouse_id → warehouses | ✅ | ✅ |
| UNIQUE: (company_id, warehouse_id, item_id) | ✅ | ✅ |

**Finding CRITICAL-2:** No negative stock guard. A race condition in `update_stock_on_hand()` could theoretically allow negative stock. Added CHECK constraint. Current data: 11 rows, min qty = 0 (safe to add).

### 5.3 `items` Constraints

| Constraint | Status |
|------------|--------|
| UNIQUE: (company_id, code) | ✅ |
| FK: company_id → companies | ✅ |
| FK: category_id → item_categories | ✅ |
| FK: inventory_uom_id → uom | ✅ |
| FK: purchase_uom_id → uom | ✅ |
| `items_item_type_check` | ✅ |

### 5.4 `chk_inv_doc_type` vs Trigger Code Discrepancy — MEDIUM

**Finding MEDIUM-1:** `post_inventory_document()` trigger has `ELSIF doc_type IN ('GIN', 'BOM_DEDUCT', 'GIN_ISSUE', 'WASTAGE')` — but `GIN_ISSUE` and `WASTAGE` are NOT in `chk_inv_doc_type` constraint. Code that sets these doc_types directly would fail the constraint. Currently harmless since:
- `post_adjustment()` converts WASTAGE → ADJUSTMENT
- No known code creates `GIN_ISSUE` documents

**Recommendation:** Remove `GIN_ISSUE` and `WASTAGE` from the trigger ELSIF condition to match the constraint, or add them to the constraint.

---

## 6. INDEX AUDIT

### 6.1 Missing Indexes Added — FIXED

| Index | Table | Columns | Reason |
|-------|-------|---------|--------|
| `idx_inv_docs_branch_date` | `inventory_documents` | `(branch_id, doc_date DESC)` | Every branch listing query |
| `idx_inv_docs_branch_type_status` | `inventory_documents` | `(branch_id, doc_type, status)` | Filtered doc queries |
| `idx_inv_doc_lines_item` | `inventory_document_lines` | `(item_id)` | Item ledger lookup |

**Finding CRITICAL-3:** `inventory_documents` had no `branch_id` index. Multi-branch ERP with thousands of documents would do full table scans on every branch query. Fixed.

**Finding CRITICAL-4:** `inventory_document_lines` had no `item_id` index. Any "show all movements for item X" query scanned all lines. Fixed.

### 6.2 Existing Indexes — Adequate

- `inventory_ledger`: indexes on `(item_id, warehouse_id, posted_at)`, `direction`, `doc_type`, `document_id` ✅
- `stock_on_hand`: UNIQUE on `(company_id, warehouse_id, item_id)` ✅
- `purchase_orders`: indexes on `branch_id`, `supplier_id`, `status`, `doc_date` ✅
- `items`: UNIQUE on `(company_id, code)`, partial index on `(company_id, category_id, is_active)` ✅

### 6.3 Stale Indexes — MEDIUM

**Finding MEDIUM-2:** `idx_inventory_documents_wastage WHERE doc_type = 'WASTAGE'` and `idx_inventory_ledger_wastage WHERE doc_type = 'WASTAGE'` — these will never match because `post_adjustment()` converts WASTAGE → ADJUSTMENT. Dead indexes consuming space.

---

## 7. FULL FINDINGS SUMMARY

### CRITICAL (Fixed)

| ID | Finding | Fix Applied |
|----|---------|------------|
| CRIT-1 | `items_modify_own_company` — any company user could modify item master | Replaced with role-scoped policy (admin/manager/inventory) |
| CRIT-2 | No negative stock CHECK on `stock_on_hand.qty_on_hand` | Added `chk_no_negative_stock CHECK (qty_on_hand >= 0)` |
| CRIT-3 | Missing `branch_id` index on `inventory_documents` | Added `idx_inv_docs_branch_date`, `idx_inv_docs_branch_type_status` |
| CRIT-4 | Missing `item_id` index on `inventory_document_lines` | Added `idx_inv_doc_lines_item` |

### HIGH (Fixed)

| ID | Finding | Fix Applied |
|----|---------|------------|
| HIGH-1 | `item_categories_read_all` — no company scope, cross-company leak | Replaced with company-scoped policy |
| HIGH-2 | `uom` table had no write policy — UOMs couldn't be managed | Added `uom_write_admin` policy |
| HIGH-3 | `goods_receipts` + `goods_receipt_lines` — inventory role was SELECT-only | Upgraded to full ALL with branch filter |
| HIGH-4 | `purchase_order_lines` inventory policy was SELECT-only — GRN posting would fail PO update | Upgraded to full ALL with branch filter |
| HIGH-5 | `trg_fn_post_goods_receipt` NOT SECURITY DEFINER — could fail under restrictive RLS | Applied SECURITY DEFINER |

### MEDIUM (Not Fixed — Document Only)

| ID | Finding | Recommendation |
|----|---------|---------------|
| MED-1 | `GIN_ISSUE`/`WASTAGE` in trigger code but not in `chk_inv_doc_type` | Align trigger ELSIF to match constraint |
| MED-2 | Dead WASTAGE doc_type indexes (WASTAGE always stored as ADJUSTMENT) | DROP `idx_inventory_documents_wastage` and `idx_inventory_ledger_wastage` |
| MED-3 | `generate_item_code()` not SECURITY DEFINER or SET search_path | Add SET search_path = 'public' to prevent search_path injection |

### LOW (Informational)

| ID | Finding |
|----|---------|
| LOW-1 | Legacy tables (`grn`, `grn_items`, `ingredients`, etc.) still exist — can be cleaned up after confirming no remaining references |
| LOW-2 | Redundant deny+allow policies on `ingredients`, `stock_levels`, `stock_movements` (deny is harmless due to PERMISSIVE OR, but confusing) |
| LOW-3 | `purchase_orders` inventory role is SELECT-only (intentional — PO creation is management function) |

---

## 8. ARCHITECTURE NOTES

### Three-Layer Inventory Design (Correct)
1. **Procurement UI** → `goods_receipts` / `goods_receipt_lines` → trigger → `inventory_documents` → `inventory_ledger` + `stock_on_hand`
2. **Direct Inventory Docs** → `inventory_documents` (GIN/ADJUSTMENT/TRANSFER) → trigger → `inventory_ledger` + `stock_on_hand`
3. **KOT/Order Deduction** → `kot_batches` trigger → BOM lookup → `inventory_ledger` + `stock_on_hand`

All three paths correctly converge at `inventory_ledger` and `stock_on_hand`. The `v_inventory_ledger` and `v_stock_on_hand` views correctly surface data from the canonical tables.

### Stock Source of Truth
- **`stock_on_hand`** — UPSERT-maintained running balance per (company, warehouse, item)
- **`inventory_ledger`** — Immutable audit trail of every debit/credit
- **`v_stock_on_hand`** — Enriched view with item details, min_level, status

---

## 9. SQL APPLIED TO LIVE DB

```sql
-- FIX 1: Performance indexes
CREATE INDEX IF NOT EXISTS idx_inv_docs_branch_date ON inventory_documents(branch_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_docs_branch_type_status ON inventory_documents(branch_id, doc_type, status);
CREATE INDEX IF NOT EXISTS idx_inv_doc_lines_item ON inventory_document_lines(item_id);

-- FIX 2: Negative stock guard
ALTER TABLE stock_on_hand ADD CONSTRAINT chk_no_negative_stock CHECK (qty_on_hand >= 0);

-- FIX 3: UOM write policy
DROP POLICY IF EXISTS uom_write_admin ON uom;
CREATE POLICY uom_write_admin ON uom FOR ALL TO authenticated
  USING (is_admin() OR is_manager()) WITH CHECK (is_admin() OR is_manager());

-- FIX 4: Items write restriction
DROP POLICY IF EXISTS items_modify_own_company ON items;
CREATE POLICY items_modify_admin_manager_inventory ON items FOR ALL TO authenticated
  USING ((is_admin() OR is_manager() OR is_inventory()) AND company_id IN (SELECT auth_company_ids_no_rls()))
  WITH CHECK ((is_admin() OR is_manager() OR is_inventory()) AND company_id IN (SELECT auth_company_ids_no_rls()));

-- FIX 5 & 6: item_categories company scope
DROP POLICY IF EXISTS item_categories_read_all ON item_categories;
CREATE POLICY item_categories_read_company ON item_categories FOR SELECT TO authenticated
  USING (company_id IN (SELECT auth_company_ids_no_rls()));
DROP POLICY IF EXISTS item_categories_write_admin ON item_categories;
CREATE POLICY item_categories_write_admin ON item_categories FOR ALL TO authenticated
  USING (is_admin() AND company_id IN (SELECT auth_company_ids_no_rls()))
  WITH CHECK (is_admin() AND company_id IN (SELECT auth_company_ids_no_rls()));

-- FIX 7: goods_receipts inventory write
DROP POLICY IF EXISTS grn_inventory ON goods_receipts;
CREATE POLICY grn_inventory ON goods_receipts FOR ALL TO authenticated
  USING (is_inventory() AND branch_id = ANY(auth_branch_ids()))
  WITH CHECK (is_inventory() AND branch_id = ANY(auth_branch_ids()));
DROP POLICY IF EXISTS grnl_inventory ON goods_receipt_lines;
CREATE POLICY grnl_inventory ON goods_receipt_lines FOR ALL TO authenticated
  USING (is_inventory() AND EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.id = goods_receipt_lines.grn_id AND gr.branch_id = ANY(auth_branch_ids())))
  WITH CHECK (is_inventory() AND EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.id = goods_receipt_lines.grn_id AND gr.branch_id = ANY(auth_branch_ids())));

-- FIX 8: purchase_order_lines inventory write
DROP POLICY IF EXISTS pol_inventory ON purchase_order_lines;
CREATE POLICY pol_inventory ON purchase_order_lines FOR ALL TO authenticated
  USING (is_inventory() AND EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_lines.po_id AND po.branch_id = ANY(auth_branch_ids())))
  WITH CHECK (is_inventory() AND EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_lines.po_id AND po.branch_id = ANY(auth_branch_ids())));

-- FIX 9: SECURITY DEFINER on GRN trigger function
-- (full function body applied — added SECURITY DEFINER keyword)
```

---

*Audit complete. 4 Critical + 5 High fixes applied to live DB. 3 Medium findings documented for follow-up.*
