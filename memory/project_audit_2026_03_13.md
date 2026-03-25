---
name: Full codebase audit findings (2026-03-13)
description: Critical bugs found and fixed during the March 2026 full audit. Reference before touching auth, permissions, order flow, or waiter stores.
type: project
---

Full codebase audit completed 2026-03-13.

**Why:** User requested a senior-level architecture + security audit before continuing ERP development.

**How to apply:** Check this before making changes to auth, order flow, waiter PWA, or DB schema.

---

## Bugs Fixed

### BUG-1 FIXED — user_permissions column mismatch

- `auth.ts` was querying `permission_code` but the DB column is `permission`
- Also added `.eq('is_granted', true)` filter
- Effect: custom permissions were always empty for every user

### BUG-2 FIXED — canAccess getter missing permissions

- `canAccess` getter in `auth.ts` was not passing `state.permissions` to `canAccessRoute()`
- Fixed to pass all three arguments

### BUG-3 FIXED — orderStore.processPayment() bypassed orchestration

- Old code: 7 direct table inserts with no server transaction
- New code: creates order + items, then calls process_waiter_accept → process_cashier_invoice → process_cashier_payment RPCs
- Now routes through full KOT pipeline (KOTs generated, queues created, audit trail complete)

### BUG-4 FIXED — Double audio alert on new orders

- Both waiterAppStore and waiterOrderStore played alert sounds on INSERT to orders
- Designated waiterAppStore as sole owner of audio/toast alerts
- waiterOrderStore INSERT handler only refreshes data

### BUG-5 FIXED — RPC naming mismatch (kotDispatchService uses legacy names)

- kotDispatchService.js calls: accept_order_as_waiter, kitchen_start_kot, kitchen_mark_ready, cashier_invoice_order, cashier_pay_order
- sprint1 migration renamed these to: process_waiter_accept, process_kitchen_start, process_kitchen_ready, process_cashier_invoice, process_cashier_payment
- Created supabase/fix_rpc_aliases.sql with thin wrapper functions for backward compat
- Also added mark_order_served() which was missing

---

## Architecture Notes

- Canonical KOT orchestration is in supabase/sprint1_kot_orchestration_engine.sql (2026-03-12)
- Do NOT use the old function names in new code — use canonical names
- waiterAppStore = UI state + alerts + shift display; waiterOrderStore = RPC-based shift-filtered data
- All financial mutations must go through process\_\* RPCs, never direct table writes from client
- user_permissions table: column is `permission` (TEXT) + `is_granted` (BOOLEAN)

---

## Remaining Known Issues (Not Yet Fixed)

- kot_tickets realtime subscription has no branch_id filter (Supabase limitation — would need branch_id column on kot_tickets; client-side filtered, acceptable for now)
- audit_logs INSERT policy is `WITH CHECK (true)` — any authenticated user can inject audit records (low priority)
- waiterAppStore.loadNotifications() has a null-merge edge case when profile is null
- No unit/E2E tests exist
- TypeScript migration is partial (mix of .js and .ts)
