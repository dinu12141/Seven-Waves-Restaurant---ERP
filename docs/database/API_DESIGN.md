# API Design — Seven Waves Restaurant ERP

> PostgREST (via Supabase) · RPCs · Realtime · Edge Functions

---

## 1. REST API via PostgREST

Base URL: `https://clykwuzajtwvwuavmtzs.supabase.co/rest/v1`

All requests require:
```
Authorization: Bearer <access_token>
apikey: <anon_key>
Content-Type: application/json
```

### Table Endpoints

| Table | GET | POST | PATCH | DELETE | Notes |
|-------|-----|------|-------|--------|-------|
| `orders` | ✓ | ✓ | ✓ | — | RLS-filtered per role |
| `order_items` | ✓ | ✓ | ✓ | — | RLS-filtered |
| `order_status_logs` | ✓ | — | — | — | Read-only (trigger-managed) |
| `kot_tickets` | ✓ | — | ✓ | — | Kitchen updates status |
| `kot_items` | ✓ | — | ✓ | — | Kitchen updates status |
| `categories` | ✓ | ✓ | ✓ | ✓ | Public read |
| `menu_items` | ✓ | ✓ | ✓ | ✓ | Public read, admin/manager write |
| `item_variants` | ✓ | ✓ | ✓ | ✓ | Public read |
| `restaurant_tables` | ✓ | ✓ | ✓ | ✓ | Public read |
| `kitchens` | ✓ | ✓ | ✓ | — | Staff read |
| `invoices` | ✓ | ✓ | ✓ | — | Finance/cashier filtered |
| `payments` | ✓ | ✓ | — | — | Cashier/finance |
| `employees` | ✓ | ✓ | ✓ | — | HR/admin filtered |
| `payroll_runs` | ✓ | ✓ | ✓ | — | HR filtered |
| `payslips` | ✓ | ✓ | ✓ | — | HR/self filtered |
| `purchase_orders` | ✓ | ✓ | ✓ | — | Procurement/manager |
| `goods_receipts` | ✓ | ✓ | ✓ | — | Inventory/manager |
| `ap_invoices` | ✓ | ✓ | ✓ | — | Finance/inventory |
| `supplier_payments` | ✓ | ✓ | ✓ | — | Finance |
| `chart_of_accounts` | ✓ | ✓ | ✓ | — | Finance |
| `journal_entries` | ✓ | ✓ | ✓ | — | Finance |
| `audit_logs` | ✓ | — | — | — | Admin only |
| `branches` | ✓ | ✓ | ✓ | — | Admin/manager |
| `profiles` | ✓ | — | ✓ | — | Self-update only |
| `user_roles` | ✓ | ✓ | — | ✓ | Admin only |
| `user_branches` | ✓ | ✓ | — | ✓ | Admin only |
| `loyalty_accounts` | ✓ | — | — | — | Admin/self |
| `loyalty_transactions` | ✓ | — | — | — | Read-only |
| `customers` | ✓ | ✓ | ✓ | — | Admin/manager/cashier |

### Common Query Patterns

```bash
# Get pending orders for a branch
GET /rest/v1/orders?branch_id=eq.{id}&status=eq.pending_waiter&assigned_waiter_id=is.null

# Get menu with category
GET /rest/v1/menu_items?select=*,categories(name)&is_available=eq.true&order=created_at.desc

# Paginate orders (cursor-based recommended over offset)
GET /rest/v1/orders?order=created_at.desc&limit=20&offset=0

# Filter by multiple statuses
GET /rest/v1/orders?status=in.(ready,served,invoiced)

# Full-text search (requires pg_trgm index)
GET /rest/v1/menu_items?name=ilike.*burger*

# Join across tables
GET /rest/v1/orders?select=*,order_items(*,menu_items(name,price)),restaurant_tables(table_number)
```

---

## 2. RPC API

Base URL: `https://clykwuzajtwvwuavmtzs.supabase.co/rest/v1/rpc`

### Auth RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `auth_has_role` | POST | `role_name: text` | bool | Role check |
| `auth_branch_ids` | GET | — | uuid[] | User branches |
| `auth_kitchen_ids` | GET | — | uuid[] | User kitchens |
| `auth_is_on_shift` | POST | `p_branch_id: uuid` | bool | Shift gate |
| `auth_get_shift_branches` | GET | — | table | Active shifts |
| `auth_has_permission` | POST | `p_permission: text` | bool | Per-user perm |

### Order Flow RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `get_pending_orders_for_shift` | GET | — | table | Waiter inbox |
| `accept_order_as_waiter` | POST | `p_order_id: uuid, p_unavailable_ids?: uuid[]` | jsonb | Atomic accept |
| `process_waiter_accept` | POST | `p_order_id: uuid` | jsonb | Full orchestration |
| `process_kitchen_start` | POST | `p_kot_id: uuid` | jsonb | KOT start |
| `process_kitchen_ready` | POST | `p_kot_id: uuid` | jsonb | KOT complete |
| `process_cashier_invoice` | POST | `p_order_id: uuid` | jsonb | Create invoice |
| `process_cashier_payment` | POST | `p_invoice_id: uuid, p_method: text, p_amount: numeric, ...` | jsonb | Record payment |

### QR / Kiosk RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `get_or_create_session_by_qr` | POST | `p_token: text` | jsonb | QR auth |
| `create_kiosk_order` | POST | `p_session: text, p_items: jsonb` | jsonb | Kiosk order |
| `create_order_from_session` | POST | `p_session_token: text, ...` | jsonb | Session order |
| `get_kiosk_orders` | POST | `p_session_token: text` | table | Track orders |
| `check_qr_rate_limit` | POST | `p_identifier: text, p_endpoint: text, p_limit: int` | jsonb | Rate limiting |

### Inventory RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `auto_stock_deduct` | trigger | — | trigger | BOM deduction |
| `get_inventory_alerts` | GET | — | table | Low-stock alerts |
| `rpc_calculate_bom_cost` | POST | `p_recipe_id: uuid` | numeric | Recipe cost |

### Finance RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `take_ap_balance_snapshot` | POST | `p_company_id: uuid, p_date: date` | void | AP snapshot |
| `generate_proc_doc_number` | POST | `p_company_id: uuid, p_branch_id: uuid, p_doc_type: text` | text | Doc numbering |
| `get_cogs_report` | POST | `p_branch_id: uuid, p_from: date, p_to: date` | table | COGS report |

### Loyalty RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `rpc_apply_loyalty_reward` | POST | `p_order_id: uuid` | void | Earn coins |
| `rpc_recalculate_loyalty_tier` | POST | `p_loyalty_account_id: uuid` | void | Tier update |
| `rpc_adjust_loyalty_coins` | POST | `p_customer_id: uuid, p_delta: int, p_note: text` | void | Admin adjust |
| `get_my_loyalty_account` | GET | — | jsonb | Customer info |
| `get_loyalty_customer_list` | POST | `search, tier_code, limit, offset` | table | Admin list |
| `get_loyalty_customer_detail` | POST | `p_customer_id: uuid` | jsonb | Admin detail |

### Security RPCs

| RPC | Method | Args | Returns | Purpose |
|-----|--------|------|---------|---------|
| `check_qr_rate_limit` | POST | `p_identifier, p_endpoint, p_limit` | jsonb | Rate check |
| `cleanup_rate_limits` | POST | — | void | Purge old data |

---

## 3. Realtime API

Base: Supabase Realtime WebSocket

### Active Channels & Subscriptions

| Channel Key | Table | Filter | Who Subscribes | Events |
|-------------|-------|--------|---------------|--------|
| `orders-branch-{id}` | orders | `branch_id=eq.{id}` | Waiter, Cashier, Manager | INSERT, UPDATE |
| `waiter-orders-rt` | orders | `status=eq.pending_waiter` | Waiter PWA Store | INSERT |
| `waiter-app-orders` | orders | `branch_id=eq.{id}` | Waiter App Store | INSERT, UPDATE |
| `kot-kitchen-{id}` | kot_tickets | `kitchen_id=eq.{id}` | Kitchen Display | INSERT, UPDATE |
| `kot-items-{id}` | kot_items | via kot | Kitchen Display | INSERT, UPDATE |
| `order-status` | order_status_logs | — | All | INSERT |
| `stock-alerts` | stock_levels | — | Inventory | UPDATE |
| `salary-realtime` | payslips | — | HR | UPDATE |
| `purchase-orders` | purchase_orders | — | Procurement | INSERT, UPDATE |
| `goods-receipts` | goods_receipts | — | Inventory | INSERT, UPDATE |
| `ap-invoices` | ap_invoices | — | Finance | INSERT, UPDATE |
| `erp-events` | erp_event_log | `branch_id=eq.{id}` | Manager Dashboard | INSERT |
| `audit-stream` | audit_logs | — | Admin | INSERT |

### Payload Shapes

#### Order INSERT (new order arrives)
```json
{
  "schema": "public",
  "table": "orders",
  "commit_timestamp": "2026-07-16T10:30:00Z",
  "eventType": "INSERT",
  "new": {
    "id": "uuid",
    "branch_id": "uuid",
    "status": "pending_waiter",
    "assigned_waiter_id": null,
    "order_type": "dine_in",
    "order_source": "pos",
    "total_amount": 4500.00,
    "table_id": "uuid",
    "created_at": "2026-07-16T10:30:00Z"
  },
  "old": {}
}
```

#### KOT INSERT (new ticket for kitchen)
```json
{
  "eventType": "INSERT",
  "new": {
    "id": "uuid",
    "order_id": "uuid",
    "kitchen_id": "uuid",
    "kot_number": 42,
    "status": "created",
    "created_at": "..."
  }
}
```

### Tables Published to supabase_realtime

| Table | REPLICA IDENTITY |
|-------|-----------------|
| `orders` | FULL ✓ |
| `order_items` | FULL ✓ |
| `kot_tickets` | FULL ✓ |
| `kot_items` | FULL ✓ |
| `order_status_logs` | FULL ✓ |
| `restaurant_tables` | FULL ✓ |
| `stock_levels` | FULL ✓ |
| `invoices` | DEFAULT (needs FULL) |
| `payments` | DEFAULT (needs FULL) |
| `purchase_orders` | FULL ✓ |
| `goods_receipts` | FULL ✓ |
| `ap_invoices` | FULL ✓ |
| `supplier_payments` | FULL ✓ |
| `ap_ledger` | FULL ✓ |
| `erp_event_log` | FULL ✓ |
| `audit_logs` | FULL ✓ |
| `payslips` | Not published — add for HR realtime |
| `loyalty_accounts` | Not published — add for CRM realtime |

---

## 4. API Error Response Format

Current: PostgREST default errors — inconsistent format.

### Recommended Standardized Error Format

```json
{
  "error": {
    "code": "PGRST301",
    "message": "JWT expired",
    "hint": "Re-authenticate and retry",
    "details": null,
    "status": 401
  }
}
```

### Known Error Codes

| Code | Meaning | Common Cause |
|------|---------|-------------|
| `PGRST116` | Row not found | Single row expected, 0 returned |
| `PGRST203` | RPC overload ambiguity | Multiple overloads of same function |
| `PGRST301` | JWT expired | Token TTL exceeded |
| `42501` | RLS denied | User lacks permission for row |
| `23505` | Unique violation | Duplicate key |
| `23503` | FK violation | Referenced row missing |
| `P0001` | RAISE EXCEPTION | Business rule violation from trigger/RPC |
| `IMMUTABLE_DOC` | Custom exception | Attempt to modify posted procurement doc |

---

## 5. Pagination Strategy

### Current: Offset-based (via PostgREST)
```
GET /rest/v1/orders?limit=20&offset=0
GET /rest/v1/orders?limit=20&offset=20
```

**Problem**: Offset pagination degrades as pages grow. At offset 10,000, PostgreSQL must scan 10,000 rows.

### Recommended: Cursor-based (Keyset Pagination)
```
# First page
GET /rest/v1/orders?order=created_at.desc,id.desc&limit=20

# Next page (use last row's created_at + id)
GET /rest/v1/orders?order=created_at.desc,id.desc&limit=20
  &created_at=lt.2026-07-15T10:30:00Z
  &id=lt.{last_id}
```

For the order dashboard specifically, use the `get_pending_orders_for_shift()` RPC which returns a pre-filtered set without pagination concerns.

---

## 6. Rate Limiting Design

### QR Endpoint Rate Limiting (Implemented)

```sql
-- 30 hits/minute per (identifier, endpoint)
SELECT check_qr_rate_limit(p_identifier, p_endpoint, 30);
```

Applied to: QR scan login, kiosk order creation

### API-Level Rate Limiting (Not Implemented)

Recommendation: Implement via Supabase Edge Function or Cloudflare WAF:

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/v1/token` | 5 | 1 minute |
| `POST /rest/v1/rpc/create_kiosk_order` | 10 | 1 minute |
| `POST /rest/v1/rpc/process_cashier_payment` | 20 | 1 minute |
| `GET /rest/v1/orders` | 100 | 1 minute |
| `POST /rest/v1/rpc/*` | 60 | 1 minute |

---

## 7. Edge Functions (Supabase Edge Runtime)

### Current Edge Functions

None detected in `supabase/functions/` directory.

### Recommended Edge Functions to Create

| Function | Purpose | Trigger |
|----------|---------|---------|
| `send-order-notification` | Push notification to waiter/kitchen | orders INSERT |
| `process-loyalty-reward` | Async loyalty coin calculation | payments UPDATE |
| `generate-invoice-pdf` | PDF invoice generation | invoices INSERT |
| `sync-biometric-attendance` | Process biometric device webhook | HTTP POST |
| `send-low-stock-alert` | Email/SMS when stock < reorder_level | stock_levels UPDATE |
| `cleanup-rate-limits` | Scheduled cleanup of old rate limit rows | Cron: every 10 min |
| `payroll-auto-calculate` | Automated payroll computation | Cron: monthly |
| `export-finance-report` | Generate financial reports as CSV/PDF | HTTP GET |
| `webhook-delivery-platform` | Sync orders from UberEats/PickMe | HTTP POST |

### Edge Function Template

```typescript
// supabase/functions/send-order-notification/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { record } = await req.json()
  
  // Send push notification to waiters on shift for this branch
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  // ... notification logic
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## 8. API Versioning Strategy

**Current**: No versioning — all via PostgREST default schema `public`

**Recommendation**: Use PostgreSQL schemas for versioning:
- `public` — current stable API
- `v2` — next major version schema (function/view overrides)

For breaking RPC changes:
1. Create new function with `_v2` suffix
2. Update client to use new name
3. Drop old function after migration window

---

## 9. OpenAPI 3.0 Spec Outline

Supabase auto-generates OpenAPI at:
```
GET https://clykwuzajtwvwuavmtzs.supabase.co/rest/v1/
```

Custom additions needed for RPCs:

```yaml
openapi: "3.0.3"
info:
  title: Seven Waves Restaurant ERP API
  version: "1.0.0"
  description: Multi-branch restaurant management system

servers:
  - url: https://clykwuzajtwvwuavmtzs.supabase.co/rest/v1
    description: Production

security:
  - BearerAuth: []
  - ApiKey: []

paths:
  /rpc/accept_order_as_waiter:
    post:
      summary: Atomic waiter order acceptance
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [p_order_id]
              properties:
                p_order_id:
                  type: string
                  format: uuid
                p_unavailable_ids:
                  type: array
                  items:
                    type: string
                    format: uuid
      responses:
        200:
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  success: { type: boolean }
                  order_id: { type: string, format: uuid }
                  assigned_waiter_id: { type: string, format: uuid }
        400:
          description: Order already accepted or not found
```
