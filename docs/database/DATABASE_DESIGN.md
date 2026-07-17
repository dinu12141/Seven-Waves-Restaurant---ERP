# Database Design — Seven Waves Restaurant ERP

> PostgreSQL 17 · Supabase · Multi-company, Multi-branch

---

## 1. Table Inventory

### Auth & Organization

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `companies` | Root tenant entity | self | No |
| `branches` | Physical locations | ✓ | No |
| `kitchens` | Kitchen stations per branch | ✓ | No |
| `profiles` | Extends `auth.users` | — | No |
| `roles` | System role definitions | — | No |
| `permissions` | Fine-grained permission codes | — | No |
| `role_permissions` | Role ↔ permission mapping | — | No |
| `user_roles` | User ↔ role assignment | — | No |
| `user_branches` | User ↔ branch assignment | — | No |
| `user_permissions` | Per-user permission overrides | — | Yes |

### Restaurant Operations

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `restaurant_tables` | Physical table definitions | ✓ | Yes |
| `categories` | Menu categories | — | Yes |
| `menu_items` | Menu items with pricing | — | Yes |
| `item_variants` | Size/style variants per item | — | Yes |

### Order Pipeline

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `orders` | Master order record | ✓ | Yes |
| `order_items` | Line items per order | — (via order) | Yes |
| `order_status_logs` | Order lifecycle audit | — (via order) | Yes |
| `order_acceptance` | Waiter acceptance records | — | No |
| `kot_tickets` | Kitchen Order Tickets | — (via order) | Yes |
| `kot_items` | KOT line items | — (via KOT) | Yes |
| `erp_event_log` | Centralized event journal | — | Yes |

### Billing

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `payment_methods` | Cash/Card/etc. reference | — | Yes |
| `invoices` | Customer-facing invoice | ✓ | Yes |
| `invoice_items` | Invoice line items (snapshot) | — (via inv) | Yes |
| `payments` | Payment records | — (via inv) | Yes |
| `payment_allocations` | Payment ↔ invoice mapping | — | Yes |
| `void_transactions` | Invoice/payment void audit | — | No |

### Inventory

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `stores` | Storage locations | — | No |
| `stock_items` | Item master | ✓ | No |
| `stock_levels` | Current qty per store/item | — | No |
| `stock_movements` | Movement ledger | — | No |
| `grn` | Goods received notes | — | No |
| `grn_items` | GRN line items | — | No |
| `stock_transfers` | Internal transfers | — | No |
| `stock_transfer_items` | Transfer line items | — | No |

### Procurement (Advanced)

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `suppliers` | Supplier master | ✓ | No |
| `supplier_contacts` | Supplier contact persons | — | No |
| `supplier_item_prices` | Price history per supplier/item | ✓ | No |
| `payment_terms` | Supplier payment terms | ✓ | No |
| `purchase_orders` | Purchase order header | ✓ | Yes |
| `purchase_order_lines` | PO line items | — | Yes |
| `goods_receipts` | GRN documents | ✓ | Yes |
| `goods_receipt_lines` | GRN line items | — | Yes |
| `ap_invoices` | Supplier invoices | ✓ | Yes |
| `ap_invoice_lines` | AP invoice line items | — | Yes |
| `supplier_payments` | Supplier payment records | ✓ | Yes |
| `supplier_payment_allocations` | Payment ↔ invoice allocation | — | No |
| `purchase_returns` | Return to supplier | ✓ | Yes |
| `purchase_return_lines` | Return line items | — | No |
| `ap_ledger` | **Immutable** AP accounting ledger | ✓ | Yes |
| `ap_balance_snapshot` | Monthly AP balance snapshots | ✓ | No |
| `procurement_doc_sequences` | Doc number generators | ✓ | No |

### Finance

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `chart_of_accounts` | GL account hierarchy | — | Yes |
| `journal_entries` | Double-entry journal | — | Yes |
| `journal_lines` | Journal debit/credit lines | — | Yes |
| `fiscal_periods` | Accounting periods | — | Yes |
| `bank_accounts` | Cash/bank accounts | — | Yes |
| `cash_transactions` | Cash book entries | — | Yes |
| `expense_categories` | Expense classification | — | Yes |
| `expense_entries` | Individual expense records | — | Yes |
| `tax_codes` | Tax rate definitions | — | Yes |
| `tax_transactions` | Tax collected/paid log | — | Yes |
| `finance_documents` | Unified finance doc registry | — | Yes |
| `customer_receivables` | AR tracking | — | Yes |
| `payroll_cycles` | Payroll period metadata | — | Yes |
| `payroll_records` | Per-employee per-cycle records | — | Yes |
| `payroll_line_items` | Payroll allowance/deduction detail | — | Yes |
| `finance_audit_logs` | Finance-specific audit trail | — | Yes |

### HR

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `departments` | Org chart departments | ✓ | No |
| `designations` | Job titles | ✓ | No |
| `employees` | Employee master | ✓ | Yes |
| `salary_structures` | Pay structure history | ✓ | No |
| `shifts` | Shift definitions | ✓ | No |
| `shift_assignments` | Employee ↔ shift ↔ date | ✓ | No |
| `attendance_logs` | Raw biometric punches | ✓ | No |
| `attendance_records` | Processed daily attendance | ✓ | No |
| `leave_types` | Leave category definitions | ✓ | Yes |
| `leave_requests` | Leave applications | ✓ | Yes |
| `employee_overtime` | OT approval records | ✓ | No |
| `payroll_runs` | Payroll processing runs | ✓ | Yes |
| `payslips` | Individual payslips | ✓ | Yes |
| `employee_loans` | Staff loan tracking | ✓ | No |

### CRM / Loyalty

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `customers` | Customer master | ✓ | No |
| `loyalty_tiers` | Tier definitions (Standard/Silver/Gold) | — | No |
| `loyalty_rules` | Coin earning rules | — | No |
| `loyalty_accounts` | Customer coin balance | — | Yes |
| `loyalty_transactions` | Coin earn/redeem log | ✓ | Yes |

### Security / Infra

| Table | Purpose | company_id | RLS |
|-------|---------|------------|-----|
| `audit_logs` | System-wide audit trail | — | Yes (admin only) |
| `qr_rate_limits` | Rate limiting per endpoint | — | Disabled |
| `erp_event_log` | Business event journal | — | Yes |

---

## 2. Column-Level Audit

### Missing `company_id` (Multi-tenancy Gaps)

These tables are referenced across the codebase but **lack `company_id`**, creating tenant isolation risk:

| Table | Missing | Impact |
|-------|---------|--------|
| `categories` | `company_id` | All tenants share categories |
| `menu_items` | `company_id` | All tenants share menu — HIGH RISK |
| `item_variants` | `company_id` | Shared variants — HIGH RISK |
| `restaurant_tables` | `company_id` (has `branch_id`) | Low risk — branches are tenant-scoped |
| `payment_methods` | `company_id` | Shared payment methods |
| `roles` | `company_id` | Shared roles (acceptable for system roles) |
| `permissions` | `company_id` | Shared (acceptable) |
| `stores` | `company_id` (has `branch_id`) | Low risk via branch |
| `grn`, `grn_items` | `company_id` | Inventory isolation gap |
| `stock_transfers` | `company_id` | Transfer isolation gap |
| `loyalty_tiers`, `loyalty_rules` | `company_id` | Shared loyalty config |
| `invoice_items` | `company_id` | Via invoice |
| `erp_event_log` | `company_id` | Events need company isolation |

### Missing `updated_at` Columns

| Table | Missing Column |
|-------|---------------|
| `categories` | `updated_at` |
| `order_status_logs` | `updated_at` (append-only — OK) |
| `stock_movements` | `updated_at` (append-only — OK) |
| `audit_logs` | `updated_at` (append-only — OK) |
| `grn_items` | `updated_at` |
| `purchase_order_lines` | `updated_at` |
| `goods_receipt_lines` | `updated_at` |
| `ap_invoice_lines` | `updated_at` |
| `ap_ledger` | `updated_at` (immutable — OK) |
| `kot_items` | has `updated_at` ✓ |
| `invoice_items` | `updated_at` |

### Missing Soft Delete Flags

No table currently uses a `deleted_at TIMESTAMPTZ` soft-delete pattern. For production:
- `orders` — should never be hard-deleted; status='cancelled' covers this
- `menu_items` — `is_available=false` covers soft-delete
- `employees` — `is_active=false` covers this
- **Recommendation**: `is_active` pattern is sufficient for this domain; no change needed

### Missing Optimistic Locking

`orders` and `kot_tickets` are concurrent-write hotspots. Recommend adding:
```sql
version INT NOT NULL DEFAULT 1
```
And checking `WHERE version = $old_version` on updates to detect conflicts.

---

## 3. Index Audit

### Missing Indexes

| Table | Missing Index | Query Pattern |
|-------|--------------|---------------|
| `orders` | `(assigned_waiter_id)` | Waiter inbox filter |
| `orders` | `(payment_status)` | Unpaid order reports |
| `orders` | `(customer_phone)` | Customer lookup |
| `order_items` | `(variant_id)` | Variant sales reports |
| `menu_items` | `(is_available, category_id)` | Menu listing queries |
| `menu_items` | `GIN (name gin_trgm_ops)` | Full-text menu search |
| `kot_tickets` | `(order_id, status)` | Order-KOT status join |
| `employees` | `(nic_number)` | NIC lookup |
| `attendance_logs` | `(employee_id, punch_time DESC)` | Attendance history |
| `loyalty_accounts` | `(loyalty_card_no)` | Card scan lookup |
| `loyalty_transactions` | `(order_id, transaction_type)` | Idempotency check |
| `ap_ledger` | `(company_id, supplier_id, doc_date)` | Balance calculation |
| `chart_of_accounts` | `(code)` | Already has UNIQUE — ✓ |
| `journal_lines` | `(account_code)` | Trial balance |
| `invoice_items` | `(invoice_id)` | Already exists — ✓ |
| `shift_assignments` | `(employee_id, assignment_date)` | Auth shift check |

### Existing Good Indexes

- `orders`: company, branch, table, waiter, status, created_at ✓
- `order_items`: order, menu_item, kitchen, status ✓
- `kot_tickets`: order, kitchen, status ✓
- `purchase_orders`: company, branch, supplier, status, date ✓
- `ap_ledger`: company, supplier, type, date, due_date ✓

---

## 4. Constraint Audit

### Missing NOT NULL Constraints

| Table.Column | Issue |
|-------------|-------|
| `orders.company_id` | Present in orders.sql ✓ but missing in schema.sql version |
| `menu_items.category_id` | Nullable — orphaned items possible |
| `invoice_items.order_item_id` | Nullable — intentional for snapshots |
| `stock_movements.reference_id` | Nullable — no FK constraint (polymorphic) |
| `grn.supplier_id` | Should be NOT NULL |
| `payment_methods` on `payments` (billing.sql) | `payment_method_id` is NOT NULL ✓ |

### Missing CHECK Constraints

| Table | Missing Constraint | Recommended |
|-------|-------------------|-------------|
| `orders.total_amount` | No negative check | `CHECK (total_amount >= 0)` |
| `order_items.quantity` | Present ✓ `CHECK (quantity > 0)` | |
| `payments.amount` | No positive check | `CHECK (amount > 0)` |
| `payslips.net_salary` | No negative check | `CHECK (net_salary >= 0)` |
| `stock_levels.quantity` | No negative check | `CHECK (quantity >= 0)` |
| `employees.hire_date` | No future date block | `CHECK (hire_date <= CURRENT_DATE)` |

### Missing UNIQUE Constraints

| Table | Missing Unique | Reason |
|-------|---------------|--------|
| `orders` | `(company_id, order_number, branch_id)` | order_number is SERIAL but not scoped to branch |
| `menu_items` | `(company_id, name)` | Duplicate menu item names possible |
| `employees.email` | Email uniqueness | Multiple employees with same email possible |
| `loyalty_transactions` | `(order_id) WHERE transaction_type='earn'` | Idempotency (exists via migration) |

---

## 5. Trigger Inventory

| Trigger | Table | Event | Function | Purpose |
|---------|-------|-------|----------|---------|
| `trg_orders_updated` | orders | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_order_status_log` | orders | AFTER INSERT/UPDATE status | `log_order_status_change()` | Lifecycle audit |
| `trg_generate_kot` | orders | AFTER UPDATE status | `generate_kot_on_accept()` | KOT creation |
| `trg_check_order_ready` | kot_tickets | AFTER UPDATE status | `check_order_ready()` | Auto-ready order |
| `trg_order_items_updated` | order_items | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_kot_tickets_updated` | kot_tickets | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_kot_items_updated` | kot_items | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_process_grn` | grn | AFTER UPDATE | `process_grn_verification()` | Stock update on GRN verify |
| `trg_process_transfer` | stock_transfers | AFTER UPDATE | `process_stock_transfer()` | Stock movement on transfer |
| `trg_block_po_edit` | purchase_orders | BEFORE UPDATE | `block_posted_procurement_edit()` | Immutability |
| `trg_block_grn_edit` | goods_receipts | BEFORE UPDATE | `block_posted_procurement_edit()` | Immutability |
| `trg_block_apinv_edit` | ap_invoices | BEFORE UPDATE | `block_posted_procurement_edit()` | Immutability |
| `trg_block_suppay_edit` | supplier_payments | BEFORE UPDATE | `block_posted_procurement_edit()` | Immutability |
| `trg_block_pret_edit` | purchase_returns | BEFORE UPDATE | `block_posted_procurement_edit()` | Immutability |
| `trg_post_grn` | goods_receipts | BEFORE UPDATE status | `post_goods_receipt()` | Stock + ledger on post |
| `trg_post_ap_invoice` | ap_invoices | BEFORE UPDATE status | `post_ap_invoice()` | AP ledger entry |
| `trg_post_supplier_payment` | supplier_payments | BEFORE UPDATE status | `post_supplier_payment()` | Payment + allocation |
| `trg_post_purchase_return` | purchase_returns | BEFORE UPDATE status | `post_purchase_return()` | Stock reversal + AP credit |
| `audit_*` | 18 sensitive tables | AFTER INSERT/UPDATE/DELETE | `audit_record()` | Security audit |
| `trg_order_loyalty_reward` | orders | AFTER UPDATE payment_status | `rpc_apply_loyalty_reward()` | Loyalty coins |
| `trg_invoice_loyalty_reward` | invoices | AFTER UPDATE payment_status | `rpc_apply_loyalty_reward()` | Loyalty coins |
| `trg_departments_updated` | departments | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_employees_updated` | employees | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_shifts_updated` | shifts | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |
| `trg_shift_assignments_updated` | shift_assignments | BEFORE UPDATE | `set_updated_at()` | Auto-timestamp |

### Trigger Issues Found

1. **`trg_generate_kot` in orders.sql vs. `process_waiter_accept()` RPC in kot_orchestration_v2.sql** — Two parallel KOT generation paths. The trigger fires on status='accepted'; the RPC also generates KOTs. Risk of duplicate KOT generation. The RPC should be the **only** path; trigger should be dropped when RPC is fully adopted.

2. **`trg_order_status_log`** inserts `changed_by = NEW.waiter_id` — does not capture cashier or kitchen as the actor when they trigger status changes. Needs an `actor_id` parameter (RPC approach is better).

3. **BEFORE UPDATE triggers in procurement** that set `posted_at := now()` on `NEW` — correct pattern for Postgres; no issue.

---

## 6. RPC Inventory

| RPC | Arguments | Returns | Security | Purpose |
|-----|-----------|---------|----------|---------|
| `auth_has_role(role)` | text | bool | SECURITY DEFINER | Check role membership |
| `auth_branch_ids()` | — | uuid[] | SECURITY DEFINER | User's branch IDs |
| `auth_kitchen_ids()` | — | uuid[] | SECURITY DEFINER | User's kitchen IDs |
| `is_admin()` | — | bool | SECURITY DEFINER | Admin shorthand |
| `is_manager()` | — | bool | SECURITY DEFINER | Manager shorthand |
| `is_staff()` | — | bool | SECURITY DEFINER | Any staff check |
| `is_hr()` | — | bool | SECURITY DEFINER | HR shorthand |
| `is_finance()` | — | bool | SECURITY DEFINER | Finance shorthand |
| `is_inventory()` | — | bool | SECURITY DEFINER | Inventory shorthand |
| `auth_is_on_shift(branch_id)` | uuid | bool | SECURITY DEFINER | Shift gate |
| `auth_get_shift_branches()` | — | table | SECURITY DEFINER | User's active shifts |
| `get_pending_orders_for_shift()` | — | table | SECURITY DEFINER | Waiter inbox |
| `accept_order_as_waiter(order_id)` | uuid | jsonb | SECURITY DEFINER | Atomic order accept |
| `accept_order_as_waiter(order_id, unavailable_ids)` | uuid, uuid[] | jsonb | SECURITY DEFINER | Accept with exclusions |
| `process_waiter_accept(order_id)` | uuid | jsonb | SECURITY DEFINER | Full orchestration accept |
| `process_kitchen_start(kot_id)` | uuid | jsonb | SECURITY DEFINER | Kitchen begins KOT |
| `process_kitchen_ready(kot_id)` | uuid | jsonb | SECURITY DEFINER | Kitchen completes KOT |
| `process_cashier_invoice(order_id)` | uuid | jsonb | SECURITY DEFINER | Create invoice |
| `process_cashier_payment(invoice_id, ...)` | uuid, ... | jsonb | SECURITY DEFINER | Record payment |
| `check_qr_rate_limit(id, endpoint, limit)` | text, text, int | jsonb | SECURITY DEFINER | Rate limit check |
| `cleanup_rate_limits()` | — | void | SECURITY DEFINER | Purge old rate limits |
| `auth_has_permission(permission)` | text | bool | SECURITY DEFINER | Per-user perm check |
| `auth_has_access_to_branch(branch_id)` | uuid | bool | SECURITY DEFINER | Branch access check |
| `rpc_apply_loyalty_reward(order_id)` | uuid | void | SECURITY DEFINER | Earn coins on paid order |
| `rpc_recalculate_loyalty_tier(account_id)` | uuid | void | SECURITY DEFINER | Tier upgrade/downgrade |
| `rpc_adjust_loyalty_coins(customer_id, delta, note)` | uuid, int, text | void | SECURITY DEFINER | Admin coin adjustment |
| `get_my_loyalty_account()` | — | jsonb | SECURITY DEFINER | Customer loyalty info |
| `generate_proc_doc_number(company, branch, type)` | uuid, uuid, text | text | None | PO/GRN number generator |
| `take_ap_balance_snapshot(company, date)` | uuid, date | void | None | AP balance snapshot |
| `log_erp_event(...)` | ... | uuid | SECURITY DEFINER | Event journal insert |
| `auto_stock_deduct()` | — | trigger | SECURITY DEFINER | BOM-aware deduction |

### Missing RPCs Needed

| RPC Needed | Purpose |
|-----------|---------|
| `get_or_create_session_by_qr(token)` | QR kiosk login |
| `create_kiosk_order(...)` | Customer self-order |
| `create_order_from_session(...)` | Session-based order |
| `get_kiosk_orders(session_token)` | Customer order tracking |
| `get_cashier_queue(branch_id)` | Cashier dashboard |
| `void_invoice(invoice_id, reason)` | Invoice void (needs manager approval) |
| `process_payroll_run(run_id)` | Automated payroll calculation |
| `get_sales_summary(branch_id, date)` | Manager reports |
| `get_inventory_alerts(branch_id)` | Low-stock alerts |

---

## 7. Partitioning Recommendation

`orders` will accumulate ~1M+ rows/year per restaurant. Partition by month:

```sql
-- Convert orders to partitioned table (requires data migration)
CREATE TABLE orders_new (LIKE orders INCLUDING ALL)
PARTITION BY RANGE (created_at);

CREATE TABLE orders_2026_01 PARTITION OF orders_new
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- ... auto-create monthly partitions via pg_partman extension
```

Same applies to: `order_items`, `order_status_logs`, `kot_tickets`, `audit_logs`, `stock_movements`, `ap_ledger`, `erp_event_log`.

---

## 8. Full-Text Search Setup

Add `pg_trgm` for menu search:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_menu_items_name_trgm ON menu_items USING GIN (name gin_trgm_ops);
CREATE INDEX idx_stock_items_name_trgm ON stock_items USING GIN (name gin_trgm_ops);
CREATE INDEX idx_customers_name_trgm ON customers USING GIN (name gin_trgm_ops);
```

---

## 9. JSONB Usage Audit

| Table.Column | Content | Indexed? |
|-------------|---------|---------|
| `audit_logs.old_data` | Pre-update row snapshot | No — JSONB too large for GIN |
| `audit_logs.new_data` | Post-update row snapshot | No |
| `erp_event_log.payload` | Event-specific metadata | No — add GIN for event search |
| `loyalty_tiers.benefits_json` | Tier benefit descriptions | No |
| `attendance_logs.raw_data` | Biometric device payload | No |

Recommendation: Add GIN index on `erp_event_log.payload` for ops monitoring queries.

---

## 10. Schema Version Management

**Current state**: No migration runner. All SQL applied manually via Supabase dashboard.

**Files in `supabase/migrations/` (ordered)**:
1. `20260314130000_kot_inventory_deduction_engine.sql`
2. `20260322_inventory_indexes.sql`
3. `20260322_fix_recipe_rpcs.sql`
4. `20260322_uom_conversions.sql`
5. `20260323_create_payroll_history.sql`
6. `20260323_create_order_notifier_webhook.sql`
7. `20260323_create_inventory_alerts_webhook.sql`
8. `20260323_finance_module_schema.sql`
9. `20260323_finance_phase3_payroll.sql`
10. `20260323_enable_salary_realtime.sql`
11. `20260323_finance_phase4_reports.sql`
12. `20260324_create_delivery_tracking.sql`
13. `20260325_fix_rider_accept_full_pipeline.sql`
14. `20260325_fix_website_order_flow.sql`
15. `20260325_allow_multiple_shifts_per_employee.sql`
16. `20260325_hr_documents_leave_attendance_payroll.sql`
17. `20260325_payroll_complete_engine.sql`
18. `20260325_shift_allowance_final_settlement.sql`
19. `20260328164004_finance_banks_update.sql`
20. `20260328183516_create_cogs_report_rpc.sql`
21. `20260404_procurement_bill_allocation.sql`
