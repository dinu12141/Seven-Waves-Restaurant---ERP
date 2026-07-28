# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

**Seven Waves Restaurant ERP** — a multi-branch restaurant management system built as a Quasar 2 SPA/PWA backed by Supabase (PostgreSQL 17). The same codebase targets web, PWA, Electron (desktop), and Tauri.

- **Supabase project ref:** `clykwuzajtwvwuavmtzs` (region: `ap-northeast-2`)
- **Deployed at:** Vercel (fronted by Cloudflare)

---

## Commands

```bash
# Development
quasar dev              # Start dev server (hot reload) — alias: npm run dev

# Build
quasar build            # Production SPA build → dist/spa
npm run build:staging   # Staging build (sets VITE_APP_ENV=staging)

# Code quality
npm run lint            # ESLint (eslint.config.js)
npm run format          # Prettier (JS, Vue, SCSS, JSON)
npm run type-check      # vue-tsc --noEmit --skipLibCheck

# Tests
npm run test            # vitest run (all tests, single pass)
npm run test:watch      # vitest watch
npx vitest run src/core/__tests__/permissions.test.ts   # single test file
```

---

## Architecture Overview

### Layouts → Route Segments

There are two separate app "worlds" sharing the same codebase:

| Layout | Path prefix | Who uses it |
|--------|-------------|-------------|
| `MainLayout.vue` | `/` | Full ERP desktop (admin, manager, cashier, kitchen, etc.) |
| `WaiterAppLayout.vue` | `/waiter-app` | Waiter PWA (mobile-first, standalone) |
| `ManagerAppLayout.vue` | `/manager-app` | Manager PWA (mobile-first, standalone) |
| `DeliveryAppLayout.vue` | `/delivery-app` | Delivery rider PWA |
| `TouchMenuLayout.vue` | `/touch` | Customer self-order kiosk/tablet |
| `CustomerLayout.vue` | `/menu` | Online menu / order tracking |
| `AuthLayout.vue` | `/auth` | Login / forgot password |

Standalone PWA layouts (`/waiter-app`, `/manager-app`, `/delivery-app`) bypass the MainLayout branch access guard. Each has its own auth context initialized in its store.

**Pure managers** (role=`manager`, no operational roles) are hard-redirected from all MainLayout routes to `/manager-app` by the auth boot guard.

### Boot Order

Boot files execute in Quasar order. Key boots:
1. `supabase.ts` — creates the Supabase client singleton (`src/boot/supabase.ts`)
2. `auth.ts` — initializes `authStore`, registers Vue Router guards (role/permission/branch checks), starts 30-min inactivity timer
3. `core.ts` — wires `ErrorHandler`, `RealtimeEngine`, `OfflineSyncEngine`, `SessionGuard`
4. `realtime.ts` — registers event handlers via `CHANNEL_REGISTRY` + `EVENT_HANDLER_MAP`

### Auth & RBAC

- **Roles:** `admin | manager | waiter | cashier | kitchen | delivery | inventory | finance | hr | procurement`
- **Permission format:** `{module}.{resource}.{action}` (e.g. `pos.order.void`, `finance.journal.create`)
- **RBAC functions:** `src/core/rbac/permissions.ts` — `hasPermission(roles, permKey, userPerms)` and `hasModuleAccess(roles, module)`
- **DB helpers (PostgreSQL):** `is_admin()`, `is_manager()`, `auth_has_role(role_name)`, `auth_is_on_shift(branch_id)`, `auth_branch_ids()`, `auth_kitchen_ids()`
- Route meta carries `{ requiresAuth, roles[], module, permission }`. All three are checked in sequence by `src/boot/auth.ts`.

### Key Pinia Stores

| Store | File | Responsibility |
|-------|------|---------------|
| `authStore` | `src/stores/auth.ts` | User session, roles, permissions, branches |
| `orderStore` | `src/stores/orderStore.js` | POS order creation (`sendToKitchen`, `processPayment`) |
| `waiterOrderStore` | `src/stores/waiterOrderStore.js` | Shift-aware waiter inbox — uses RPCs, not direct queries |
| `waiterAppStore` | `src/stores/waiterAppStore.js` | Waiter PWA UI state + secondary realtime subscription |
| `kitchenDisplayStore` | `src/stores/kitchenDisplayStore.js` | KDS — subscribes to `kot_tickets` |
| `cashierStore` | `src/stores/cashierStore.js` | Cashier queue + payment |
| `tableSessionStore` | `src/stores/tableSessionStore.ts` | QR table session (in-memory + localStorage) |

---

## Order Flow (Critical Path)

Every order — whether from POS, QR scan, or waiter tablet — follows this pipeline:

```
INSERT orders (status='pending_waiter', assigned_waiter_id=NULL)
  └─► trg_notify_waiters_new_order   → INSERT into notifications (only if assigned_waiter_id IS NULL)
  └─► trg_new_order_broadcast_waiters → INSERT into waiter_notifications

Waiter receives realtime event (orders INSERT, assigned_waiter_id IS NULL)
  └─► ShiftInboxPage shows order

Waiter accepts → kotDispatchService.acceptOrder() → RPC accept_order_as_waiter(p_order_id, p_unavailable_ids)
  └─► rpc_waiter_accept_order:
        1. UPDATE order_items SET kitchen_id = get_target_kitchen_for_item(...)  ← MUST happen FIRST
        2. UPDATE orders SET status='accepted', assigned_waiter_id=waiter_id     ← triggers fire AFTER this
  └─► trg_generate_kot (AFTER UPDATE on orders) → INSERT kot_tickets + kot_items
  └─► trg_z_dispatch_on_accept (AFTER UPDATE) → INSERT kot_dispatches (KITCHEN, CASHIER, INVENTORY, FINANCE targets)

Kitchen sees new KOT via realtime on kot_tickets
```

**POS-specific behavior:**
- `sendToKitchen()` in `orderStore.js` creates the order with `assigned_waiter_id=NULL` — order goes to the waiter inbox.
- `processPayment()` (Quick Pay) also sets `assigned_waiter_id=NULL` at insert but immediately calls `process_waiter_accept` RPC to auto-accept, then `process_cashier_invoice` — bypasses the waiter inbox intentionally.
- Do NOT set `assigned_waiter_id` on insert in `sendToKitchen` — this was a previous bug that hid POS orders from the waiter dashboard.

---

## Realtime Architecture

Two parallel realtime systems coexist:

**1. `RealtimeManager` (infrastructure layer)** — `src/core/realtime/`
- `CHANNEL_REGISTRY` (`channel.registry.ts`) declares all channels declaratively (table, event, permission, scope, filter)
- `EVENT_HANDLER_MAP` (`event.handlers.ts`) maps channel keys to Pinia store actions
- `RealtimeManager` subscribes/unsubscribes based on user permissions after login
- Called via `subscribeUserChannels()` from `src/boot/realtime.ts`

**2. Store-level ad-hoc subscriptions** — each PWA store manages its own channels:
- `waiterOrderStore.subscribeToOrders()` → channel `'waiter-orders-rt'`
- `waiterAppStore.subscribeRealtime()` → channel `'waiter-app-orders'`
- `kitchenDisplayStore` → subscribes to `kot_tickets`

Both systems run concurrently. The store-level ones are the operational ones for the PWA apps.

**Adding a table to realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.<table_name>;` — all operational tables need `REPLICA IDENTITY FULL`.

---

## Database / SQL Layer

All SQL lives in `supabase/*.sql`. There is no migration runner — files are applied manually via the Supabase Management API or MCP tool.

**Key schemas:**
- `supabase/schema.sql` — base tables
- `supabase/orders.sql` — order/KOT tables + triggers
- `supabase/rls_restaurant_flow.sql` — main RLS policies
- `supabase/shift_access_control.sql` — shift RPCs (`auth_is_on_shift`, `get_pending_orders_for_shift`, `auth_get_shift_branches`)
- `supabase/kot_orchestration_v2.sql` + `sprint1_kot_orchestration_engine.sql` — KOT generation engine
- `supabase/erp_security_lockdown.sql` — revokes anon access, hardens functions

**Applying SQL via MCP:**
```
Use mcp__supabase__execute_sql tool with project_id="clykwuzajtwvwuavmtzs"
```

**Critical DB constraints:**
- `order_items.kitchen_id` MUST be set BEFORE `orders.status` is updated to `'accepted'` — the `trg_generate_kot` AFTER trigger fires on status change and reads `kitchen_id` at that moment. Setting it after is too late.
- `accept_order_as_waiter` has a single overload: `(p_order_id uuid, p_unavailable_ids uuid[] DEFAULT NULL)`. Never add a 1-arg overload — causes PostgREST PGRST203.
- RLS policies are ORed — multiple policies on the same table all grant access independently.

---

## QR / Table Ordering Flow

```
Customer scans QR (URL: {VITE_APP_PUBLIC_URL}/c/{qrToken})
  └─► QrEntryPage.vue (/c/:qrToken)
        └─► loginWithQrToken() → RPC get_or_create_session_by_qr(token)
              └─► Sets tableSessionStore + localStorage (tm_session_token, tm_table_id)
              └─► Redirect → /customer/register (or /touch if already logged in)
  └─► CustomerAuthPage.vue (/customer/register)
        └─► Skip → /touch
  └─► TouchMenuLayout.vue + MenuBookTablet.vue (/touch)
        └─► Order placed via RPC create_kiosk_order or create_order_from_session
```

**QR URL generation** — `TablesManagementPage.vue → getAppBaseUrl()`:
1. `localStorage.getItem('sw_qr_base_url')` (admin override)
2. `import.meta.env.VITE_APP_PUBLIC_URL`
3. `window.location.origin` (fallback — always correct for the current deployment)

`VITE_APP_PUBLIC_URL` is intentionally commented out in `.env`. Set it in **Vercel environment variables** only when using a custom domain.

---

## Module Structure

Feature modules beyond the basic `src/pages/` flat structure are in `src/modules/`:

```
src/modules/
  ai/        — AI dashboard, forecasts, anomaly detection (Google Gemini)
  devices/   — Printer, scanner, biometric device management
  finance/   — ERP accounting (ledgers, vouchers, cashbook, financial statements)
```

The `src/core/` directory holds framework-level services:
```
src/core/
  api/        — ApiClient, response helpers
  errors/     — ErrorHandler, typed error classes
  logging/    — structured logger
  monitoring/ — metrics
  offline/    — OfflineSyncEngine, IndexedDB via offlineDb.ts
  rbac/       — hasPermission, hasModuleAccess, usePermission composable
  realtime/   — RealtimeEngine, RealtimeManager, CHANNEL_REGISTRY, EVENT_HANDLER_MAP
  security/   — sessionGuard, rateLimiter, inputSanitizer, cspHeaders
```

---

## Key Patterns

**Waiter store initialization order matters.** `waiterOrderStore.initialize()` calls `auth_get_shift_branches` RPC first. If this returns empty (no shift today), `subscribeToOrders()` returns early with no realtime subscription. The fix is ensuring the waiter has a shift record for today.

**`get_pending_orders_for_shift()` RPC** filters `assigned_waiter_id IS NULL`. Any order with a pre-assigned waiter is invisible to the inbox. This is intentional.

**Shifts gate waiter functionality.** `auth_is_on_shift(branch_id)` is called by multiple RLS policies. A waiter without a shift entry for the current date/branch will fail these policies silently — orders simply won't appear.

**DB function overloads and PostgREST.** PostgREST returns PGRST203 if multiple overloads of the same function exist and it can't pick one. Always drop old overloads before creating new ones. Use `COMMENT ON FUNCTION name(arg_types)` (including arg types) to avoid ambiguity errors.

**Supabase access token** for Management API: `[REDACTED — store in .claude/settings.json only, never in CLAUDE.md]` — stored in `.claude/settings.json` for MCP use. The project `.mcp.json` has a placeholder; the real token is in the user-level MCP config.
