# ER Diagram — Seven Waves Restaurant ERP

> PostgreSQL 17 · Supabase · Multi-company, Multi-branch

---

## Domain Overview

| Domain | Tables |
|--------|--------|
| Auth / Org | companies, branches, kitchens, profiles, roles, permissions, role_permissions, user_roles, user_branches, user_permissions |
| Menu | categories, menu_items, item_variants |
| Orders | orders, order_items, order_status_logs, order_acceptance |
| KOT | kot_tickets, kot_items, erp_event_log |
| Billing | payment_methods, invoices, invoice_items, payments, payment_allocations, void_transactions |
| Inventory | stores, stock_items, stock_levels, stock_movements, grn, grn_items, stock_transfers, stock_transfer_items |
| Inventory (Advanced) | items, uom, warehouses, stock_on_hand, inventory_ledger, inventory_documents, inventory_document_lines |
| Procurement | suppliers, supplier_contacts, supplier_item_prices, purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, ap_invoices, ap_invoice_lines, supplier_payments, supplier_payment_allocations, purchase_returns, purchase_return_lines, ap_ledger, ap_balance_snapshot, payment_terms, procurement_doc_sequences |
| Finance | chart_of_accounts, fiscal_periods, bank_accounts, cash_transactions, customer_receivables, expense_categories, expense_entries, tax_codes, tax_transactions, finance_documents, payroll_cycles, payroll_records, payroll_line_items, finance_audit_logs, journal_entries, journal_lines |
| HR | departments, designations, employees, salary_structures, shifts, shift_assignments, attendance_logs, attendance_records, leave_types, leave_requests, employee_overtime, payroll_runs, payslips, employee_loans |
| CRM / Loyalty | customers, loyalty_tiers, loyalty_rules, loyalty_accounts, loyalty_transactions |
| Restaurant Ops | restaurant_tables, notifications, waiter_notifications |
| Security | audit_logs, qr_rate_limits |
| Delivery | delivery_assignments |

---

## Auth & Organization Domain

```mermaid
erDiagram
    companies {
        uuid id PK
        text name
        text address
        text phone
        text email
        text website
        timestamptz created_at
        timestamptz updated_at
    }

    branches {
        uuid id PK
        uuid company_id FK
        text name
        text address
        text phone
        boolean is_main
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    kitchens {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text name
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    profiles {
        uuid id PK
        text full_name
        text email
        text phone
        text avatar_url
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    roles {
        uuid id PK
        text name
        text description
        timestamptz created_at
    }

    permissions {
        uuid id PK
        text code
        text description
        timestamptz created_at
    }

    role_permissions {
        uuid id PK
        uuid role_id FK
        uuid permission_id FK
        timestamptz created_at
    }

    user_roles {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        timestamptz created_at
    }

    user_branches {
        uuid id PK
        uuid user_id FK
        uuid branch_id FK
        boolean is_home_branch
        timestamptz created_at
    }

    user_permissions {
        uuid id PK
        uuid user_id FK
        text permission
        boolean is_granted
        uuid granted_by FK
        timestamptz created_at
    }

    companies ||--o{ branches : "has"
    companies ||--o{ kitchens : "owns"
    branches ||--o{ kitchens : "contains"
    profiles ||--o{ user_roles : "has"
    roles ||--o{ user_roles : "assigned_via"
    roles ||--o{ role_permissions : "grants"
    permissions ||--o{ role_permissions : "belongs_to"
    profiles ||--o{ user_branches : "assigned_to"
    branches ||--o{ user_branches : "staffed_by"
    profiles ||--o{ user_permissions : "overridden_by"
```

---

## Menu Domain

```mermaid
erDiagram
    categories {
        uuid id PK
        text name
        int sort_order
    }

    menu_items {
        uuid id PK
        uuid category_id FK
        text name
        numeric price
        uuid kitchen_id FK
        int preparation_time_minutes
        boolean is_available
        text description
        text image_url
    }

    item_variants {
        uuid id PK
        uuid menu_item_id FK
        text name
        numeric price_modifier
        boolean is_available
    }

    categories ||--o{ menu_items : "contains"
    menu_items ||--o{ item_variants : "has"
    kitchens ||--o{ menu_items : "prepares"
```

---

## Order Domain

```mermaid
erDiagram
    orders {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid table_id FK
        uuid waiter_id FK
        uuid assigned_waiter_id FK
        int order_number
        text order_type
        text order_source
        text status
        text payment_status
        text customer_name
        text customer_phone
        text delivery_address
        numeric subtotal
        numeric tax_amount
        numeric discount_amount
        numeric total_amount
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    order_items {
        uuid id PK
        uuid order_id FK
        uuid menu_item_id FK
        uuid variant_id FK
        uuid kitchen_id FK
        int quantity
        numeric unit_price
        numeric total_price
        text status
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    order_status_logs {
        uuid id PK
        uuid order_id FK
        text previous_status
        text new_status
        uuid changed_by FK
        text notes
        timestamptz created_at
    }

    order_acceptance {
        uuid id PK
        uuid order_id FK
        uuid accepted_by FK
        timestamptz accepted_at
        timestamptz rejected_at
        text notes
        timestamptz created_at
    }

    orders ||--o{ order_items : "contains"
    orders ||--o{ order_status_logs : "logs"
    orders ||--o{ order_acceptance : "accepted_via"
    menu_items ||--o{ order_items : "ordered_as"
    kitchens ||--o{ order_items : "routed_to"
```

---

## KOT Domain

```mermaid
erDiagram
    kot_tickets {
        uuid id PK
        uuid order_id FK
        uuid kitchen_id FK
        int kot_number
        text status
        timestamptz printed_at
        timestamptz accepted_at
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    kot_items {
        uuid id PK
        uuid kot_id FK
        uuid order_item_id FK
        int quantity
        text status
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    erp_event_log {
        uuid id PK
        text event_code
        text entity_type
        uuid entity_id
        uuid actor_id FK
        text actor_role
        uuid branch_id FK
        jsonb payload
        timestamptz created_at
    }

    orders ||--o{ kot_tickets : "dispatched_as"
    kitchens ||--o{ kot_tickets : "received_by"
    kot_tickets ||--o{ kot_items : "contains"
    order_items ||--o{ kot_items : "mapped_to"
```

---

## Billing Domain

```mermaid
erDiagram
    payment_methods {
        uuid id PK
        text name
        text description
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    invoices {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid order_id FK
        int invoice_number
        text customer_name
        text customer_phone
        numeric subtotal
        numeric tax_total
        numeric discount_total
        numeric grand_total
        text payment_status
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    invoice_items {
        uuid id PK
        uuid invoice_id FK
        uuid order_item_id FK
        text menu_item_name
        int quantity
        numeric unit_price
        numeric total_price
        numeric tax_amount
        numeric discount_amount
        timestamptz created_at
    }

    payments {
        uuid id PK
        uuid invoice_id FK
        uuid payment_method_id FK
        numeric amount
        text transaction_ref
        text status
        uuid received_by FK
        text notes
        timestamptz created_at
    }

    payment_allocations {
        uuid id PK
        uuid payment_id FK
        uuid invoice_id FK
        numeric allocated_amount
        timestamptz created_at
    }

    void_transactions {
        uuid id PK
        text entity_type
        uuid entity_id
        text reason
        uuid voided_by FK
        uuid manager_approval_by FK
        timestamptz voided_at
    }

    orders ||--|| invoices : "billed_as"
    invoices ||--o{ invoice_items : "itemized_by"
    invoices ||--o{ payments : "paid_via"
    payment_methods ||--o{ payments : "used_for"
    payments ||--o{ payment_allocations : "allocated_in"
```

---

## Inventory Domain

```mermaid
erDiagram
    stores {
        uuid id PK
        uuid branch_id FK
        text name
        text type
        boolean is_active
        timestamptz created_at
    }

    stock_items {
        uuid id PK
        uuid company_id FK
        text name
        text sku
        text category
        text unit
        numeric cost_price
        numeric reorder_level
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    stock_levels {
        uuid id PK
        uuid store_id FK
        uuid stock_item_id FK
        numeric quantity
        text batch_no
        date expiry_date
        timestamptz last_updated
    }

    stock_movements {
        uuid id PK
        uuid store_id FK
        uuid stock_item_id FK
        numeric quantity
        text movement_type
        uuid reference_id
        text reference_type
        text batch_no
        text notes
        uuid created_by FK
        timestamptz created_at
    }

    grn {
        uuid id PK
        uuid store_id FK
        uuid supplier_id FK
        text reference_no
        date received_date
        numeric total_amount
        text status
        text notes
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    grn_items {
        uuid id PK
        uuid grn_id FK
        uuid stock_item_id FK
        numeric quantity
        numeric unit_price
        numeric total_price
        text batch_no
        date expiry_date
        timestamptz created_at
    }

    branches ||--o{ stores : "has"
    stores ||--o{ stock_levels : "tracks"
    stock_items ||--o{ stock_levels : "stored_in"
    stores ||--o{ stock_movements : "logs"
    stock_items ||--o{ stock_movements : "moved_as"
    stores ||--o{ grn : "receives_at"
    grn ||--o{ grn_items : "contains"
    stock_items ||--o{ grn_items : "received_as"
```

---

## Procurement Domain

```mermaid
erDiagram
    suppliers {
        uuid id PK
        uuid company_id FK
        text name
        text contact_person
        text phone
        text email
        text address
        uuid payment_term_id FK
        numeric credit_limit
        numeric balance
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    purchase_orders {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text doc_number
        date doc_date
        date expected_date
        uuid supplier_id FK
        uuid payment_term_id FK
        text status
        numeric subtotal
        numeric tax_amount
        numeric total_amount
        uuid created_by FK
        uuid approved_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    purchase_order_lines {
        uuid id PK
        uuid po_id FK
        int line_number
        uuid item_id FK
        uuid uom_id FK
        numeric quantity
        numeric unit_price
        numeric line_total
        numeric received_qty
        numeric invoiced_qty
        numeric returned_qty
        numeric open_qty
        timestamptz created_at
    }

    goods_receipts {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text doc_number
        date doc_date
        uuid po_id FK
        uuid supplier_id FK
        uuid warehouse_id FK
        text status
        numeric total_amount
        uuid created_by FK
        uuid posted_by FK
        timestamptz posted_at
        timestamptz created_at
        timestamptz updated_at
    }

    ap_invoices {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text doc_number
        text supplier_inv_no
        date doc_date
        date due_date
        uuid supplier_id FK
        uuid grn_id FK
        uuid po_id FK
        text status
        numeric total_amount
        numeric paid_amount
        numeric balance_due
        timestamptz created_at
        timestamptz updated_at
    }

    ap_ledger {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid supplier_id FK
        text entry_type
        uuid doc_id
        text doc_number
        date doc_date
        date due_date
        numeric debit
        numeric credit
        text description
        uuid posted_by FK
        timestamptz posted_at
    }

    suppliers ||--o{ purchase_orders : "receives"
    purchase_orders ||--o{ purchase_order_lines : "contains"
    purchase_orders ||--o{ goods_receipts : "fulfilled_by"
    goods_receipts ||--o{ ap_invoices : "invoiced_as"
    ap_invoices ||--o{ ap_ledger : "posts_to"
    suppliers ||--o{ ap_ledger : "ledgered_for"
```

---

## Finance Domain

```mermaid
erDiagram
    chart_of_accounts {
        uuid id PK
        text code
        text name
        text account_type
        uuid parent_id FK
        boolean is_active
        text description
        uuid branch_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    journal_entries {
        uuid id PK
        text reference
        text description
        date entry_date
        text status
        boolean is_reversed
        uuid posted_by FK
        timestamptz posted_at
        timestamptz created_at
    }

    journal_lines {
        uuid id PK
        uuid journal_id FK
        text account_code
        text account_name
        numeric dr_amount
        numeric cr_amount
        text description
        timestamptz created_at
    }

    bank_accounts {
        uuid id PK
        text name
        text account_type
        text account_number
        text bank_name
        text currency
        numeric opening_balance
        numeric current_balance
        uuid gl_account_id FK
        uuid branch_id FK
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    fiscal_periods {
        uuid id PK
        int year
        int month
        date start_date
        date end_date
        text status
        uuid closed_by FK
        timestamptz closed_at
        timestamptz created_at
    }

    expense_entries {
        uuid id PK
        uuid category_id FK
        numeric amount
        date expense_date
        text description
        text reference
        uuid branch_id FK
        uuid department_id FK
        text status
        uuid approved_by FK
        uuid journal_entry_id FK
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    chart_of_accounts ||--o{ chart_of_accounts : "parent_child"
    chart_of_accounts ||--o{ journal_lines : "posted_to"
    journal_entries ||--o{ journal_lines : "contains"
    chart_of_accounts ||--o{ bank_accounts : "linked_to"
```

---

## HR Domain

```mermaid
erDiagram
    departments {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text name
        text description
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    employees {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid department_id FK
        uuid designation_id FK
        uuid profile_id FK
        text employee_code
        text first_name
        text last_name
        text full_name
        text email
        text phone
        date date_of_birth
        text gender
        text nic_number
        date hire_date
        date termination_date
        text employment_status
        text employment_type
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    shifts {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        text name
        time start_time
        time end_time
        int break_duration_minutes
        boolean is_overnight
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    shift_assignments {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid employee_id FK
        uuid shift_id FK
        date assignment_date
        text status
        text notes
        timestamptz created_at
        timestamptz updated_at
    }

    attendance_records {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid employee_id FK
        uuid shift_id FK
        date attendance_date
        timestamptz clock_in
        timestamptz clock_out
        numeric total_hours
        numeric overtime_hours
        int late_minutes
        text status
        timestamptz created_at
        timestamptz updated_at
    }

    payroll_runs {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        date period_start
        date period_end
        text status
        numeric total_gross
        numeric total_net
        int employee_count
        uuid processed_by FK
        uuid approved_by FK
        timestamptz created_at
        timestamptz updated_at
    }

    payslips {
        uuid id PK
        uuid company_id FK
        uuid branch_id FK
        uuid payroll_run_id FK
        uuid employee_id FK
        numeric basic_salary
        numeric gross_salary
        numeric net_salary
        numeric epf_employee
        numeric epf_employer
        text payment_status
        timestamptz paid_at
        timestamptz created_at
        timestamptz updated_at
    }

    companies ||--o{ departments : "has"
    companies ||--o{ employees : "employs"
    departments ||--o{ employees : "organized_in"
    employees ||--o{ shift_assignments : "assigned"
    shifts ||--o{ shift_assignments : "defines"
    employees ||--o{ attendance_records : "clocked_by"
    employees ||--o{ payslips : "paid_via"
    payroll_runs ||--o{ payslips : "generates"
```

---

## CRM / Loyalty Domain

```mermaid
erDiagram
    customers {
        uuid id PK
        uuid company_id FK
        text name
        text phone
        text email
        text address
        timestamptz created_at
        timestamptz updated_at
    }

    loyalty_tiers {
        uuid id PK
        text tier_code
        text tier_name
        int min_coins
        int max_coins
        text badge_color
        int rank_order
        jsonb benefits_json
    }

    loyalty_accounts {
        uuid id PK
        uuid customer_id FK
        text loyalty_card_no
        int current_coins
        uuid current_tier_id FK
        int total_earned_coins
        int total_redeemed_coins
        numeric total_spent
        timestamptz last_rewarded_at
        timestamptz created_at
        timestamptz updated_at
    }

    loyalty_transactions {
        uuid id PK
        uuid company_id FK
        uuid loyalty_account_id FK
        uuid customer_id FK
        uuid order_id FK
        uuid payment_id FK
        text transaction_type
        int coins
        numeric amount_reference
        text note
        uuid created_by FK
        timestamptz created_at
    }

    customers ||--|| loyalty_accounts : "owns"
    loyalty_tiers ||--o{ loyalty_accounts : "tier_of"
    loyalty_accounts ||--o{ loyalty_transactions : "records"
    orders ||--o{ loyalty_transactions : "triggers"
```

---

## Missing Tables (Gap Analysis)

The following tables are referenced in the codebase or needed for full ERP functionality but are **not yet in any .sql file**:

| Missing Table | Referenced In | Purpose |
|--------------|---------------|---------|
| `reservations` | N/A | Table reservation management |
| `table_qr_codes` | `TablesManagementPage.vue` | QR token → table mapping |
| `customer_sessions` | `fix_kiosk_session.sql` (RPCs only) | Kiosk/QR session tokens |
| `notifications` | `notifications.sql` | System notification queue |
| `waiter_notifications` | CLAUDE.md | Waiter-specific alert inbox |
| `delivery_assignments` | `delivery_assignments_migration.sql` | Rider ↔ order assignment |
| `service_charges` | `apply_service_charge.sql` | Per-order service charge config |
| `tax_configurations` | Finance module | Branch-level tax rate setup |
| `printer_assignments` | `printers.sql` | Printer ↔ kitchen/branch mapping |
| `biometric_devices` | `biometric_integration.sql` | Device registry for attendance |
| `order_status_events` | `kot_orchestration_v2.sql` | Backward-compat event mirror |
| `kot_dispatches` | CLAUDE.md | KOT dispatch tracking per target |
| `items` | `procurement.sql` | Unified item master (procurement) |
| `uom` | `procurement.sql` | Unit of measure master |
| `warehouses` | `procurement.sql` | Warehouse/location master |
| `stock_on_hand` | `inventory_module.sql` | Current stock by warehouse |
| `inventory_ledger` | `inventory_module.sql` | Immutable inventory journal |
| `inventory_documents` | `erp_security_lockdown.sql` | Generic inventory documents |
| `recipe_items` | `erp_security_lockdown.sql` | BOM line items for recipes |
| `loyalty_rules` | `customer_loyalty_system.sql` | Coin earning rule definitions |
