# Testing Plan — Seven Waves Restaurant ERP

> **Version:** 1.0  
> **Date:** 2026-07-17  
> **Owner:** QA Lead  
> **Status:** Active

---

## Table of Contents

1. [Overview](#1-overview)
2. [Testing Principles](#2-testing-principles)
3. [Test Environment Architecture](#3-test-environment-architecture)
4. [Test Pyramid & Coverage Targets](#4-test-pyramid--coverage-targets)
5. [Unit Testing](#5-unit-testing)
6. [Integration Testing](#6-integration-testing)
7. [End-to-End Testing](#7-end-to-end-testing)
8. [Security Testing](#8-security-testing)
9. [Performance Testing](#9-performance-testing)
10. [Device & Hardware Testing](#10-device--hardware-testing)
11. [Realtime & Offline Testing](#11-realtime--offline-testing)
12. [Role-Based Access Control Testing](#12-role-based-access-control-testing)
13. [Database & RLS Testing](#13-database--rls-testing)
14. [CI/CD Test Gates](#14-cicd-test-gates)
15. [Test Data Management](#15-test-data-management)
16. [Defect Management](#16-defect-management)
17. [Release QA Checklist](#17-release-qa-checklist)
18. [Appendix: Test File Index](#18-appendix-test-file-index)

---

## 1. Overview

Seven Waves Restaurant ERP is a multi-branch restaurant management system targeting web, PWA, Electron desktop, and (future) Tauri. Testing must cover the entire delivery surface across its distinct user personas — Admin, Manager, Waiter, Cashier, Kitchen, Delivery, Finance, HR, Inventory, Procurement — and validate correctness at every layer: database RLS, business logic, realtime event propagation, offline resilience, and hardware device integration.

### 1.1 System Under Test

| Layer | Technology |
|-------|-----------|
| Frontend | Quasar 2 / Vue 3 (SPA, PWA) |
| State Management | Pinia stores |
| Backend | Supabase (PostgreSQL 17, Auth, Realtime, Storage) |
| Desktop | Electron (via Quasar Mode) |
| Realtime | Supabase Realtime (Postgres CDC) |
| Offline | IndexedDB + OfflineSyncEngine |
| AI | Google Gemini (analytics, forecasting) |
| Hardware | ESC/POS printers, ZKTeco biometric, barcode scanners, payment terminals |

### 1.2 Deployments Under Test

| Environment | URL | Purpose |
|------------|-----|---------|
| Development | `localhost:9000` | Active development, all mocks allowed |
| Staging | Netlify Preview | Pre-merge integration testing |
| Production | `https://seven-waves.netlify.app` | Live system, smoke tests only |

### 1.3 Supabase Project

- **Project ref:** `clykwuzajtwvwuavmtzs`
- **Region:** `ap-northeast-2`
- **Test project ref:** dedicated staging project (mirrors schema, isolated data)

---

## 2. Testing Principles

### 2.1 Core Principles

1. **Test what can break** — focus tests on complex business logic, not framework boilerplate. The order acceptance flow, KOT generation, and payment processing are high-value targets.
2. **Real database, not mocks** — integration tests hit a real Supabase instance (staging). Mocking the DB risks hiding schema drift, RLS bypass, and trigger failures that are exactly what matters most.
3. **Shift-aware by default** — many waiter RLS policies gate on `auth_is_on_shift()`. Test fixtures must always establish a valid shift record for the test date/branch.
4. **Security is non-optional** — every new table gets an RLS test before merge. No table ships without a corresponding policy in `fix_missing_rls_policies.sql` or its successor.
5. **One overload per function** — PostgREST PGRST203 failures from duplicate function overloads must be caught by integration tests, not discovered in production.
6. **440 tests, zero regressions** — the existing suite of 440 passing tests defines the regression floor. No PR may reduce this count without explicit justification.

### 2.2 Testing Anti-Patterns to Avoid

- Mocking Supabase client for logic that depends on DB triggers (triggers are invisible to mocks)
- Testing implementation details (internal store state shapes) instead of observable behaviors
- Writing tests that only pass when `assigned_waiter_id` is pre-set on `sendToKitchen` (confirmed bug — POS orders must have `assigned_waiter_id = NULL`)
- Using `USING(true)` blanket policies on sensitive tables (journal, payroll) — tests must catch this

---

## 3. Test Environment Architecture

### 3.1 Local Development

```
Developer Machine
├── quasar dev (localhost:9000)
├── vitest (node environment, no browser)
└── Supabase: points to STAGING project (never production)
```

**Required `.env` for local testing:**
```env
VITE_SUPABASE_URL=<staging-supabase-url>
VITE_SUPABASE_ANON_KEY=<staging-anon-key>
VITE_QR_SECRET=test-secret-for-vitest
VITE_APP_ENV=development
```

### 3.2 CI Environment (GitHub Actions)

```
Pull Request → CI Pipeline
├── lint-and-typecheck  (ESLint + vue-tsc)
├── test                (vitest run, node env)
├── build               (quasar build, VITE_APP_ENV=preview)
└── security-scan       (npm audit + gitleaks + secret pattern grep)
```

See `.github/workflows/ci.yml` for full pipeline definition. Tests run against a **headless node environment** — no browser, no DOM, no Supabase network calls (unit layer).

### 3.3 Staging Environment

- Netlify deploy preview per PR
- Connected to **staging Supabase project** (separate from production)
- Manual QA checklist executed before promoting to production
- Migration ledger gate: production deploy blocked until `supabase/applied_migrations_ledger.sql` confirms all pending migrations are applied

### 3.4 Test Isolation

- Each test module imports its own Pinia instance via `setActivePinia(createPinia())`
- SQL fixture scripts reset table state before integration test runs
- QR tokens use `VITE_QR_SECRET=test-secret-for-vitest` (never the production secret)
- No shared global state between test suites

---

## 4. Test Pyramid & Coverage Targets

```
          ┌─────────────────────────────┐
          │   E2E / Manual QA (10%)     │  ← Cypress / Playwright + manual
          ├─────────────────────────────┤
          │  Integration Tests (30%)    │  ← Supabase SQL + store flows
          ├─────────────────────────────┤
          │    Unit Tests (60%)         │  ← Vitest, pure functions
          └─────────────────────────────┘
```

### 4.1 Coverage Targets by Module

| Module | Unit | Integration | E2E |
|--------|------|-------------|-----|
| RBAC / Permissions | 100% | 80% | Smoke |
| POS Order Flow | 90% | 90% | Full path |
| KOT Orchestration | 80% | 95% | Smoke |
| Finance (journal, voucher) | 85% | 90% | Smoke |
| Waiter PWA | 80% | 85% | Full path |
| Kitchen Display (KDS) | 80% | 80% | Smoke |
| Device Management | 85% | 70% | Manual |
| QR / Kiosk Flow | 90% | 85% | Full path |
| Realtime Engine | 75% | 85% | Integration |
| Offline Sync | 80% | 80% | Integration |
| Security / RLS | 100% | 100% | — |
| AI Analytics | 70% | 60% | Smoke |

### 4.2 Current Baseline

- **440 tests passing** (vitest run, as of 2026-07-16)
- **0 failing tests** required to merge any PR
- Coverage tooling: `vitest --coverage` with `@vitest/coverage-v8`

---

## 5. Unit Testing

### 5.1 Framework & Configuration

**Framework:** Vitest  
**Config:** `vitest.config.ts`

```typescript
// vitest.config.ts
export default defineConfig({
  resolve: {
    alias: { src: fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    env: {
      VITE_QR_SECRET: 'test-secret-for-vitest',
    },
  },
})
```

**Run commands:**
```bash
npm run test                    # single-pass, all tests
npm run test:watch              # watch mode
npx vitest run <file>           # single file
npx vitest run --reporter=verbose   # with test names
npx vitest run --coverage       # with coverage report
```

### 5.2 Unit Test Locations

```
src/
├── core/__tests__/
│   ├── permissions.test.ts         ← RBAC logic (hasPermission, hasModuleAccess)
│   ├── security-rls.test.ts        ← SQL file integrity: RLS coverage validation
│   ├── errorTypes.test.ts          ← Error class hierarchy
│   ├── offlineSync.test.ts         ← OfflineSyncEngine logic
│   ├── realtime.test.ts            ← RealtimeManager unit behavior
│   ├── realtimeIntegration.test.ts ← Channel registry / event handler wiring
│   └── step04UI.test.ts            ← UI step interaction (Quasar-agnostic)
├── modules/
│   ├── ai/__tests__/ai.test.ts              ← AI analytics functions
│   ├── finance/__tests__/finance.test.ts    ← Finance SQL migration + voucher logic
│   ├── pos/__tests__/shift.test.ts          ← Shift open/close, register reconciliation
│   └── devices/__tests__/devices.test.ts    ← ESC/POS, ZPL, QR, payment terminal
└── __tests__/
    └── mocks/mockProcurement.ts    ← Shared procurement test fixtures
```

### 5.3 RBAC / Permission Unit Tests

**File:** `src/core/__tests__/permissions.test.ts`

Tests validate the pure-function RBAC layer (`src/core/rbac/permissions.ts`) with no Supabase or Vue dependencies:

| Test Group | What It Validates |
|-----------|-------------------|
| `hasPermission` | Admin bypass, role defaults, explicit overrides, multi-role combination |
| `hasModuleAccess` | Module-level wildcard resolution per role |
| `getEffectivePermissions` | Permission deduplication, wildcard expansion |

**Key assertions:**
- `admin` grants `*` (all permissions)
- `cashier` cannot access `finance.journal.post`
- `waiter` cannot `pos.order.void`
- Explicit permissions override role defaults
- Unknown/empty roles have no permissions

### 5.4 Device Module Unit Tests

**File:** `src/modules/devices/__tests__/devices.test.ts`

| Test Group | Coverage |
|-----------|----------|
| `EscPosBuilder` | Init, text, alignment, separator, columns, cut, cash drawer |
| `Receipt Template` | Full receipt layout, kitchen ticket (station filtering) |
| `QR Code Service` | Generate, validate, expiry, wrong type, wrong branch, tamper detection |
| `Device Store` | Computed filters (online/offline/type), alert severity buckets |
| `Printer Store` | Type filters, default printer, job queue metrics |
| `IPC Security` | Whitelist enforcement, rejection of non-whitelisted channels |
| `Label Template` | ZPL builder, inventory/order/allergen/shelf labels, ESC/POS fallback |
| `Payment Terminal` | Status constants, provider enum coverage |
| `Device Routes` | Route config presence, RBAC meta, sidebar nav items |

### 5.5 Finance Module Unit Tests

**File:** `src/modules/finance/__tests__/finance.test.ts`

| Test Group | Coverage |
|-----------|----------|
| SQL Migration Integrity | File existence, 9 required tables, RLS enabled on all |
| Journal Immutability | INSERT before UPDATE ordering, DELETE protection trigger |
| Loyalty Schema | Required columns present, sync trigger bidirectionality |
| Idempotency Guards | Re-run safety, no duplicate errors |

### 5.6 Security / RLS SQL Tests

**File:** `src/core/__tests__/security-rls.test.ts`

Tests validate SQL migration files by reading and asserting content — no DB connection required:

**Validated files:**
- `supabase/fix_missing_rls_policies.sql`
- `supabase/fix_journal_immutability.sql`
- `supabase/fix_loyalty_amount_value.sql`

**Critical assertions:**
- All 10 critical tables (`companies`, `branches`, `journal_entries`, `journal_lines`, `user_roles`, `permissions`, `role_permissions`, `stock_levels`, `stock_movements`, `payroll_history`) have RLS enabled or policies defined
- No `USING(true)` on finance/HR tables
- `get_user_company_id()` SECURITY DEFINER helper present
- `GRANT EXECUTE ON FUNCTION ... TO authenticated` present
- Journal DELETE trigger blocks deletion of posted entries
- Loyalty sync trigger handles bidirectional `coins ↔ points` and `amount_value ↔ amount_reference`

### 5.7 Writing New Unit Tests

**Checklist for new unit test files:**

```typescript
// Standard structure
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Module: FeatureName', () => {
  // Arrange shared state in beforeEach
  beforeEach(() => { /* setup */ })
  afterEach(() => { vi.clearAllMocks() })

  describe('FunctionName', () => {
    it('does X when Y', () => {
      // Arrange
      // Act
      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

**Required for any new Pinia store test:**
```typescript
import { setActivePinia, createPinia } from 'pinia'
beforeEach(() => { setActivePinia(createPinia()) })
```

---

## 6. Integration Testing

### 6.1 Scope

Integration tests exercise the interaction between the application and real Supabase services (staging project). They validate:

- RPC function behavior end-to-end
- Trigger chains (order → KOT → dispatch)
- RLS policy enforcement per role
- Realtime subscription delivery

### 6.2 Order Flow Integration Tests

The critical order path must be covered by integration tests:

```
Test: POS order creation → waiter inbox → accept → KOT generation → KDS display
```

**Assertions per step:**

| Step | Table/Function | Assert |
|------|---------------|--------|
| `sendToKitchen()` | `orders` INSERT | `assigned_waiter_id IS NULL`, `status = 'pending_waiter'` |
| Waiter inbox | `get_pending_orders_for_shift()` | Order appears in result |
| `acceptOrder()` | `accept_order_as_waiter(order_id, [])` | `order_items.kitchen_id` set BEFORE status change |
| KOT generation | `kot_tickets` | Ticket exists per kitchen station |
| KDS display | `kot_dispatches` | KITCHEN, CASHIER, INVENTORY, FINANCE targets created |
| Quick Pay path | `process_waiter_accept` + `process_cashier_invoice` | Order bypasses inbox, jumps to paid |

**Critical constraint test:**
```sql
-- This MUST be tested: kitchen_id set before status='accepted'
-- Trigger trg_generate_kot fires AFTER UPDATE on orders
-- If kitchen_id is NULL at trigger time → empty KOT items → broken kitchen display
SELECT order_items.kitchen_id FROM order_items WHERE order_id = $1;
-- Must be non-NULL BEFORE accept_order_as_waiter() updates status
```

### 6.3 RPC Integration Tests

| RPC | Test Scenarios |
|-----|---------------|
| `accept_order_as_waiter(p_order_id, p_unavailable_ids)` | Happy path; with unavailable items; wrong waiter (denied by RLS) |
| `get_pending_orders_for_shift()` | Returns only unassigned orders; empty when no shift; branch-isolated |
| `auth_is_on_shift(branch_id)` | True when shift exists for today; false when no shift; false for wrong branch |
| `auth_get_shift_branches()` | Returns correct branch IDs for current session |
| `get_or_create_session_by_qr(token)` | Creates session; returns existing; rejects invalid token |
| `process_cashier_invoice(order_id)` | Creates invoice; marks order paid; idempotent on re-call |

### 6.4 Shift-Gating Tests

Because `auth_is_on_shift()` gates many RLS policies, every integration test that requires waiter access must:

```sql
-- Test setup fixture (run before each integration test)
INSERT INTO shifts (employee_id, branch_id, start_time, date)
VALUES ($test_user_id, $test_branch_id, NOW(), CURRENT_DATE)
ON CONFLICT DO NOTHING;
```

Absence of this fixture is the most common cause of "orders not appearing" bugs.

### 6.5 PostgREST Overload Tests

After any SQL migration that creates/replaces a function, assert:

```bash
# Should return exactly 200 — PGRST203 means multiple overloads exist
curl -s -o /dev/null -w "%{http_code}" \
  "$SUPABASE_URL/rest/v1/rpc/accept_order_as_waiter" \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"p_order_id": "00000000-0000-0000-0000-000000000000"}'
# Expected: 400 (bad input) or 200 — NOT 503/PGRST203
```

---

## 7. End-to-End Testing

### 7.1 E2E Framework (Planned)

**Recommended:** Playwright (headless Chromium)  
**Alternative:** Cypress

E2E tests run against the **staging Netlify preview** environment. They are not run in the PR CI pipeline (too slow) but are required before production promotion.

### 7.2 Critical User Journey Tests

#### Journey 1: Customer QR → Self-Order

```
Scan QR code (/c/:qrToken)
  → QrEntryPage validates token
  → CustomerAuthPage (register or skip)
  → TouchMenuLayout (browse menu)
  → Add items to cart
  → Submit order → order appears in waiter inbox
```

**Assertions:**
- QR URL resolves to correct branch/table
- Anonymous session established (no login required)
- Order created with correct `branch_id`, `table_id`
- `assigned_waiter_id = NULL` on order

#### Journey 2: Waiter — Accept & Serve Order

```
Login as waiter (has shift for today)
  → ShiftInboxPage shows pending orders
  → Accept order (mark unavailable items if any)
  → Order disappears from inbox
  → Kitchen receives KOT ticket
  → Waiter marks order served
  → Order appears in cashier queue
```

**Assertions:**
- Inbox populated via `get_pending_orders_for_shift()` RPC
- Accept triggers KOT generation (check `kot_tickets`)
- Realtime: cashier queue updates without page refresh

#### Journey 3: POS — Quick Pay

```
Login as cashier (POS mode)
  → Create order via POS
  → Add menu items
  → Quick Pay (cash)
  → sendToKitchen() → auto-accept via RPC
  → Invoice generated
  → Receipt printed (if printer configured)
  → Cash drawer opens
```

**Assertions:**
- `sendToKitchen()` sets `assigned_waiter_id = NULL` at INSERT
- `processPayment()` calls `process_waiter_accept` then `process_cashier_invoice`
- `kot_dispatches` shows KITCHEN + FINANCE + INVENTORY targets

#### Journey 4: Manager PWA — Branch Overview

```
Login as pure manager
  → Hard-redirect to /manager-app (not MainLayout)
  → Branch metrics visible
  → Revenue, active orders, staff counts
  → Cannot navigate to /devices or /finance directly
```

**Assertions:**
- `auth.ts` boot guard redirects `role=manager` (no operational roles) to `/manager-app`
- RBAC blocks direct URL access to forbidden modules (403 redirect)

#### Journey 5: Kitchen Display (KDS)

```
Login as kitchen staff
  → KDS shows active KOT tickets
  → Mark ticket as started (changes status)
  → Mark ticket as ready
  → KOT disappears from active queue
  → Realtime: cashier sees order ready notification
```

### 7.3 E2E Test Data Setup

```bash
# Seed script for E2E test run
node tests/e2e/seed.js --env=staging
# Creates: test company, branch, users for each role, menu items, shift for today
```

**Required seed data:**
- Company: `Seven Waves Test Co`
- Branch: `Test Branch 1` (branch_id stored in env)
- Users: one per role (admin, manager, waiter, cashier, kitchen, delivery)
- Shift: created for today for test waiter + branch
- Menu: 5 categories, 20 items across grill / cold / bar stations

---

## 8. Security Testing

### 8.1 Static Security Checks (CI)

Run automatically on every PR via `security-scan` GitHub Actions job:

| Check | Tool | Fail Condition |
|-------|------|---------------|
| Dependency vulnerabilities | `npm audit --audit-level=high` | Any HIGH or CRITICAL |
| `.env` tracked by git | `git ls-files .env*` | Any `.env` file indexed |
| `service_role` in source | `grep -rn service_role src/` | Any non-comment match |
| Hardcoded JWT tokens | `grep -rn eyJhbGci... src/` | Any match |
| Git history secrets | `gitleaks-action@v2` | Any secret pattern in PR commits |

### 8.2 RLS Penetration Tests

Every role must be tested for unauthorized access to other roles' data:

| Attacker Role | Target Resource | Expected Result |
|--------------|-----------------|-----------------|
| `waiter` | `finance.journal_entries` | RLS deny (empty result or 403) |
| `cashier` | `hr.payroll_history` | RLS deny |
| `kitchen` | `orders` of other branches | Only own branch visible |
| `delivery` | `companies` of other orgs | Only own company row visible |
| Anonymous | Any protected table | RLS deny (0 rows or 401) |
| `manager` | `user_roles` (DELETE) | Denied unless `is_admin()` |

**Test methodology:** Use Supabase client authenticated as test user for each role, execute SELECT/INSERT/UPDATE/DELETE, assert result matches expected policy outcome.

### 8.3 IPC Security Tests (Electron)

**File:** `src/modules/devices/__tests__/devices.test.ts` — `IPC Security` group

Validates that the Electron preload whitelist:
- Contains all 14 required channels
- Rejects `shell:execute`, `fs:readFile`, `eval:code`
- Never passes raw objects through `ipcRenderer.invoke` without channel validation

### 8.4 QR Signature Tests

**File:** `src/modules/devices/__tests__/devices.test.ts` — `QR Code Service` group

| Scenario | Expected |
|---------|----------|
| Valid payload, correct type | `valid: true` |
| Expired payload | `valid: false`, error contains `expired` |
| Wrong type mismatch | `valid: false`, error contains `Expected type` |
| Wrong branch | `valid: false`, error contains `different branch` |
| Malformed JSON | `valid: false` |
| Tampered signature (data changed, sig intact) | `valid: false`, error contains `signature` |

### 8.5 Input Sanitization Tests

`src/core/security/inputSanitizer` must be tested for:
- XSS payloads: `<script>alert(1)</script>`
- SQL injection patterns: `'; DROP TABLE orders; --`
- Unicode bypass attempts
- Null byte injection: `\x00`

### 8.6 JWT / Session Tests

- Session timeout after 30-minute inactivity (configured in `auth.ts`)
- Refresh token rotation — test that expired access token triggers refresh
- `SessionGuard` (`src/core/security/sessionGuard`) blocks API calls after logout

---

## 9. Performance Testing

### 9.1 Frontend Performance Targets

| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| Time to Interactive (TTI) | < 3.5s | Lighthouse |
| Total Bundle Size (gzip) | < 500KB | `quasar build` output |
| Lighthouse Performance Score | ≥ 85 | CI Lighthouse action |

### 9.2 API / Database Performance Targets

| Operation | Target P95 | Notes |
|-----------|-----------|-------|
| `get_pending_orders_for_shift()` | < 200ms | Indexed on `branch_id + date + status` |
| `accept_order_as_waiter()` | < 500ms | Includes trigger chain |
| `process_cashier_invoice()` | < 300ms | With idempotency check |
| Realtime event delivery | < 1s | From DB change to client |
| Menu page load (50+ items) | < 1s | With pagination |
| Dashboard aggregate query | < 2s | Revenue + order counts + staff |

### 9.3 Load Testing

**Tool:** k6 (recommended) or Artillery

```javascript
// tests/load/order-flow.js (k6)
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 20 },  // Ramp: 20 concurrent users
    { duration: '5m', target: 50 },  // Sustained: dinner rush simulation
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

export default function () {
  // Simulate waiter polling for orders
  const res = http.post(`${__ENV.SUPABASE_URL}/rest/v1/rpc/get_pending_orders_for_shift`, ...)
  check(res, { 'status is 200': (r) => r.status === 200 })
  sleep(2)
}
```

### 9.4 Realtime Concurrency Test

- Connect 10 simultaneous Supabase Realtime clients (simulating 10 kitchen display screens)
- Insert 100 orders in rapid succession
- Assert all clients receive all events within 2 seconds
- Assert no events are dropped or duplicated

---

## 10. Device & Hardware Testing

### 10.1 ESC/POS Printer Tests

**Unit tests:** `src/modules/devices/__tests__/devices.test.ts` — `EscPosBuilder` + `Receipt Template`

| Test | Assertion |
|------|-----------|
| Init command | First bytes `0x1B 0x40` |
| Center alignment | Contains ESC `a 1` |
| 80mm separator | 48 `-` characters |
| Two-column layout | Both columns present in buffer |
| Cut command | Contains `0x1D` (GS V) |
| Cash drawer command | Contains `0x70` (ESC p) |
| Full receipt | Contains branch name, item names, total |
| Kitchen ticket | Contains station items, excludes other station items |

**Hardware validation (manual):**
- Print test receipt on 58mm and 80mm paper widths
- Verify character encoding (Arabic menu items if applicable)
- Verify drawer pulse on payment receipt
- Test USB, Network (TCP/IP), and Bluetooth connection modes

### 10.2 Label Printer (ZPL) Tests

**Unit tests:** `src/modules/devices/__tests__/devices.test.ts` — `Label Template`

| Test | Assertion |
|------|-----------|
| ZPL wrapper | Starts `^XA`, ends `^XZ` |
| Paper width | `^PW{width}` present |
| Text field | Item name in output |
| Barcode | `^BC` command present |
| Copy count | `^PQ{n}` present |
| Inventory label (ZPL) | SKU, price, barcode |
| Inventory label (ESC/POS) | Returns `Uint8Array` |
| Allergen label | CONTAINS in uppercase, allergen names |
| Caret escaping | `^` in text fields is escaped |

### 10.3 Biometric Device (ZKTeco) Tests

**File:** `src/modules/devices/services/zkteco.service.js`

| Test | Assertion |
|------|-----------|
| Connection to device | TCP connection established |
| Employee enrollment | Fingerprint template stored |
| Attendance sync | `attendance_records` updated |
| Shift clock-in | Shift record created for today |
| Device offline handling | Graceful degradation, queued sync |

### 10.4 Payment Terminal Tests

**Unit tests:** `src/modules/devices/__tests__/devices.test.ts` — `Payment Terminal Service`

| Provider | Manual Test Required |
|----------|---------------------|
| Manual | Always (no terminal integration) |
| Stripe Terminal | Test transaction with Reader SDK |
| Square Terminal | Test transaction |
| PAX Terminal | Serial/TCP protocol test |
| Generic | Echo test (handshake only) |

**Security requirement:** Payment terminal service (`src/modules/devices/services/payment.terminal.service.js`) must NEVER confirm payments client-side. All payment confirmations must be verified server-side via Supabase RPC.

### 10.5 Barcode Scanner Tests

| Test | Method |
|------|--------|
| USB HID scanner (keyboard emulation) | Simulate keypress events |
| Wedge mode input | DOM input event simulation |
| Scan-to-lookup (menu item) | Scan barcode → item added to POS |
| Unknown barcode handling | Error notification, no crash |

---

## 11. Realtime & Offline Testing

### 11.1 Realtime Channel Tests

**File:** `src/core/__tests__/realtime.test.ts` and `realtimeIntegration.test.ts`

The two realtime systems (infrastructure-layer `RealtimeManager` and store-level subscriptions) must be tested independently:

#### RealtimeManager (Infrastructure Layer)

| Test | What It Checks |
|------|---------------|
| Channel registry completeness | All declared channels have handler entries |
| Permission-gated subscription | Channels with `permission` field only subscribed when user has that permission |
| Scope filtering | `branch` scope channels filter by `auth_branch_ids()` |
| `subscribeUserChannels()` | Called after login, not before |
| `unsubscribeAll()` | Called on logout |

#### Store-Level Subscriptions

| Store | Channel | Test Assertion |
|-------|---------|---------------|
| `waiterOrderStore` | `waiter-orders-rt` | New order appears in `pendingOrders` |
| `waiterAppStore` | `waiter-app-orders` | Order state updates trigger UI refresh |
| `kitchenDisplayStore` | `kot_tickets` | New KOT ticket appears in display queue |

### 11.2 Offline Sync Tests

**File:** `src/core/__tests__/offlineSync.test.ts`

| Scenario | Expected Behavior |
|---------|------------------|
| Order created while offline | Stored in IndexedDB, queued for sync |
| Network restore | All queued operations synced in order |
| Conflict resolution | Server wins on conflict (last-write-wins) |
| Partial failure | Failed operations retried, succeeded ones not re-sent |
| IndexedDB unavailable | Graceful fallback to sessionStorage, user warned |

### 11.3 Realtime Tables

All tables that support realtime must be verified to be in the Supabase realtime publication:

```sql
-- Verify table is in publication
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
AND tablename IN (
  'orders', 'order_items', 'kot_tickets', 'kot_items',
  'waiter_notifications', 'notifications', 'kot_dispatches'
);
```

All listed tables must also have `REPLICA IDENTITY FULL` set:
```sql
ALTER TABLE public.orders REPLICA IDENTITY FULL;
```

---

## 12. Role-Based Access Control Testing

### 12.1 Route Guard Tests

Each role must be tested to confirm correct route access:

| Role | Allowed Paths | Blocked Paths |
|------|--------------|---------------|
| `admin` | All routes (`*`) | None |
| `manager` | `/manager-app/**` | `/finance/**`, `/hr/**` (redirected) |
| `waiter` | `/waiter-app/**` | All MainLayout routes |
| `cashier` | `/pos/**`, `/cashier/**` | `/finance/**`, `/devices/**` |
| `kitchen` | `/kitchen/**`, `/kds/**` | `/pos/**`, `/hr/**` |
| `delivery` | `/delivery-app/**` | All other routes |
| `finance` | `/finance/**` | `/hr/payroll/**` (unless explicit) |

**Boot guard test:**
```typescript
// Auth boot guard test: pure manager → /manager-app redirect
it('pure manager is redirected from MainLayout to /manager-app', async () => {
  const { authStore } = useAuthStore()
  authStore.$patch({ roles: ['manager'], operationalRoles: [] })
  // Navigate to /pos/orders
  await router.push('/pos/orders')
  expect(router.currentRoute.value.path).toBe('/manager-app')
})
```

### 12.2 Permission Matrix Tests

Core permission matrix (tested in `permissions.test.ts`):

```
           admin  manager  waiter  cashier  kitchen  delivery  finance  hr  inventory  procurement
pos.order.create  ✓      ✓       ✓       ✓        ✗        ✗         ✗    ✗    ✗          ✗
pos.order.void    ✓      ✓       ✗       ✓        ✗        ✗         ✗    ✗    ✗          ✗
finance.journal   ✓      ✓       ✗       ✗        ✗        ✗         ✓    ✗    ✗          ✗
hr.payroll.run    ✓      ✗       ✗       ✗        ✗        ✗         ✗    ✓    ✗          ✗
devices.view      ✓      ✓       ✗       ✗        ✗        ✗         ✗    ✗    ✗          ✗
procurement.*     ✓      ✓       ✗       ✗        ✗        ✗         ✗    ✗    ✗          ✓
```

### 12.3 Multi-Branch Isolation Tests

Users assigned to Branch A must not see data from Branch B:

```typescript
it('waiter on Branch A cannot see Branch B orders', async () => {
  // Authenticate as waiter with shift on Branch A
  // Call get_pending_orders_for_shift()
  // Assert: no orders with branch_id = Branch B's ID in result
})
```

---

## 13. Database & RLS Testing

### 13.1 RLS Policy Validation (Static)

**File:** `src/core/__tests__/security-rls.test.ts`

Static validation without DB connection — reads SQL files and asserts content:

| SQL File | Critical Assertions |
|---------|-------------------|
| `fix_missing_rls_policies.sql` | 10 critical tables have RLS; no blanket `USING(true)` on finance/HR |
| `fix_journal_immutability.sql` | INSERT before UPDATE ordering; DELETE protection |
| `fix_loyalty_amount_value.sql` | 8 required columns; sync trigger; idempotent with `IF NOT EXISTS` |

### 13.2 Migration Ledger Gate

Before every production deploy, the CI pipeline checks `supabase/applied_migrations_ledger.sql`:

```bash
# From deploy-production.yml
if grep -q "PENDING" supabase/applied_migrations_ledger.sql; then
  echo "❌ Pending migrations detected — apply to Supabase before deploying"
  exit 1
fi
```

New migrations must be:
1. Added to ledger with `-- PENDING` status
2. Applied to staging Supabase (via MCP tool or SQL editor)
3. Ledger updated to `-- APPLIED YYYY-MM-DD`
4. Only then can production deploy proceed

### 13.3 Trigger Chain Tests

The KOT trigger chain must be tested end-to-end (integration test, requires real DB):

```
INSERT orders (status='pending_waiter')
  → trg_notify_waiters_new_order fires → notifications record created
  → trg_new_order_broadcast_waiters fires → waiter_notifications record created

UPDATE orders SET status='accepted'
  → trg_generate_kot fires AFTER UPDATE
    → Reads order_items.kitchen_id (MUST be non-NULL at this point)
    → Inserts kot_tickets + kot_items
  → trg_z_dispatch_on_accept fires AFTER UPDATE
    → Inserts kot_dispatches (KITCHEN, CASHIER, INVENTORY, FINANCE targets)
```

**Test assertion for kitchen_id ordering:**
```sql
-- In the test, manually set kitchen_id then update status
UPDATE order_items SET kitchen_id = $kitchen_id WHERE order_id = $order_id;
UPDATE orders SET status = 'accepted', assigned_waiter_id = $waiter_id WHERE id = $order_id;
-- Then assert KOT items exist
SELECT COUNT(*) FROM kot_items WHERE kot_ticket_id IN (
  SELECT id FROM kot_tickets WHERE order_id = $order_id
);
-- Must be > 0
```

### 13.4 Journal Double-Entry Tests

```sql
-- Every posted journal entry must have balanced debits and credits
SELECT journal_entry_id, SUM(debit_amount) - SUM(credit_amount) AS imbalance
FROM journal_lines
GROUP BY journal_entry_id
HAVING SUM(debit_amount) <> SUM(credit_amount);
-- Must return 0 rows
```

### 13.5 DB Function Tests (Required Before Each Release)

```sql
-- Test: accept_order_as_waiter has exactly ONE overload (prevents PGRST203)
SELECT COUNT(*) FROM pg_proc
WHERE proname = 'accept_order_as_waiter';
-- Must be exactly 1

-- Test: get_pending_orders_for_shift exists and is callable
SELECT proname FROM pg_proc WHERE proname = 'get_pending_orders_for_shift';
-- Must be 1 row
```

---

## 14. CI/CD Test Gates

### 14.1 Pull Request Gate (ci.yml)

All four jobs must pass before merge is allowed:

```
PR → ci.yml
├── [REQUIRED] lint-and-typecheck
│     ├── ESLint (npm run lint)
│     └── TypeScript (npm run type-check)
│
├── [REQUIRED] test
│     └── vitest run --reporter=verbose
│
├── [REQUIRED, depends on above] build
│     ├── quasar build (VITE_APP_ENV=preview)
│     └── Verify dist/spa/index.html exists
│
└── [REQUIRED] security-scan
      ├── npm audit --omit=dev --audit-level=high
      ├── .env not tracked check
      ├── service_role not in source
      ├── JWT tokens not hardcoded
      └── gitleaks-action@v2
```

### 14.2 Staging Deploy Gate (deploy-staging.yml)

```
Push to staging branch → deploy-staging.yml
├── lint (npm run lint)
├── type-check (npm run type-check)
├── test (npx vitest run)
└── deploy (netlify deploy --alias=staging)
```

### 14.3 Production Deploy Gate (deploy-production.yml)

```
Push to main branch → deploy-production.yml
├── migrations ledger check (blocks if PENDING migrations)
├── lint
├── type-check
├── test
├── build (VITE_APP_ENV=production)
└── deploy (netlify deploy --prod)
```

**Hard gates — PRs blocked if any fail:**
- Any `vitest` test fails → merge blocked
- `npm audit` finds HIGH/CRITICAL vulnerability → merge blocked
- `.env` tracked by git → merge blocked
- Pending migrations in ledger → production deploy blocked

### 14.4 Test Failure Response Protocol

| Failure Type | Immediate Action | Owner |
|-------------|-----------------|-------|
| Unit test regression | Block merge, assign to PR author | PR Author |
| Build failure | Block deploy, check quasar config | DevOps |
| Security scan HIGH vuln | Block merge, run `npm audit fix` or pin dep | Backend Lead |
| Gitleaks detection | Block merge, rotate credentials immediately | Security Lead |
| Pending migration gate | Apply migration to Supabase, update ledger | DBA |

---

## 15. Test Data Management

### 15.1 Test Data Principles

- **Never use production data** in tests (even anonymized)
- Test fixtures are committed in `tests/fixtures/`
- Supabase staging is reset to clean state weekly via snapshot restore
- RLS tests use role-specific test users (one per role, passwords in CI secrets)

### 15.2 Test Fixture Users

| Role | Email Pattern | Shift Required |
|------|--------------|---------------|
| admin | `test.admin@seven-waves.test` | No |
| manager | `test.manager@seven-waves.test` | No (redirected to manager-app) |
| waiter | `test.waiter@seven-waves.test` | **Yes — must have shift for today** |
| cashier | `test.cashier@seven-waves.test` | Yes |
| kitchen | `test.kitchen@seven-waves.test` | Yes |
| delivery | `test.delivery@seven-waves.test` | No |
| finance | `test.finance@seven-waves.test` | No |

### 15.3 Seed Data Script

```bash
# Reset staging to clean seed state
node tests/fixtures/seed-staging.js

# What this creates:
# - 1 company (Seven Waves Test)
# - 2 branches (Test Branch A, Test Branch B)
# - 7 test users (one per role above)
# - Shifts for today for waiter, cashier, kitchen on Branch A
# - 5 menu categories, 20 menu items across 3 kitchen stations
# - 1 open POS shift for test cashier
```

### 15.4 Test Cleanup

Tests must not leave state that pollutes subsequent test runs:

```typescript
// Integration test teardown pattern
afterAll(async () => {
  await supabase.from('orders').delete().eq('created_by', TEST_USER_ID)
  await supabase.from('kot_tickets').delete().in('order_id', createdOrderIds)
})
```

---

## 16. Defect Management

### 16.1 Severity Classification

| Severity | Definition | SLA to Fix |
|---------|-----------|-----------|
| **P0 — Critical** | Production down, data loss, security breach, payment failure | Immediate (same day) |
| **P1 — High** | Core flow broken (orders not appearing, KOT not generating, payments failing) | 24 hours |
| **P2 — Medium** | Feature degraded but workaround exists (realtime delay, printer offline) | 1 week |
| **P3 — Low** | UI cosmetic, non-blocking edge case | Next sprint |

### 16.2 P0/P1 Response Procedure

1. **Detect:** Monitoring alert, user report, or failed health check
2. **Triage:** Reproduce in staging within 30 minutes
3. **Communicate:** Post in `#incidents` Slack channel
4. **Isolate:** Identify affected branches, disable feature if necessary
5. **Fix:** Hotfix branch from `main`, minimal change only
6. **Verify:** Run full test suite on hotfix branch + manual smoke test
7. **Deploy:** Fast-path production deploy with approval
8. **Post-mortem:** Within 24 hours of resolution

### 16.3 Known Recurring Defects to Monitor

| Defect Pattern | Root Cause | Watch Signal |
|---------------|-----------|-------------|
| POS orders not in waiter inbox | `assigned_waiter_id` set at INSERT | Check `orders.assigned_waiter_id IS NULL` after `sendToKitchen()` |
| Waiter inbox empty | No shift record for today | `auth_is_on_shift()` returning false |
| KOT items missing | `kitchen_id` NULL at trigger time | `kot_items` count = 0 after accept |
| PGRST203 errors | Duplicate function overloads | Check `pg_proc` count after migrations |
| Realtime not delivering | Table not in publication | Check `pg_publication_tables` |

---

## 17. Release QA Checklist

Run this checklist before every production deployment:

### Pre-Deploy

- [ ] All CI jobs passing on `main` branch
- [ ] `supabase/applied_migrations_ledger.sql` shows no PENDING migrations
- [ ] `npm audit` — zero HIGH/CRITICAL vulnerabilities
- [ ] No `.env` files tracked by git (`git ls-files .env*` returns empty)
- [ ] Type-check passes (`npm run type-check` — zero errors)
- [ ] All 440+ vitest tests passing

### Staging Smoke Tests (Manual)

- [ ] Login as each role (admin, manager, waiter, cashier, kitchen) — each lands on correct layout
- [ ] Pure manager redirected to `/manager-app` (not `/`)
- [ ] POS: create order → `sendToKitchen()` → order appears in waiter inbox (not immediately accepted)
- [ ] Waiter: accept order → KOT visible in KDS
- [ ] Cashier: Quick Pay flow → invoice created → receipt printable
- [ ] KDS: KOT status transitions (pending → started → ready)
- [ ] QR: scan test QR code → reach `/touch` menu → add items → submit order
- [ ] Realtime: open two browser tabs, create order in one, see it appear in the other
- [ ] Offline: disconnect network, create draft order, reconnect, verify sync

### Post-Deploy (Production Smoke)

- [ ] `/auth/login` loads without errors
- [ ] Dashboard loads for admin user
- [ ] Supabase Realtime connects (green indicator)
- [ ] At least one test order created and KOT generated on production
- [ ] No errors in browser console (check DevTools)
- [ ] No errors in Netlify function logs

---

## 18. Appendix: Test File Index

| File | Type | Module | Tests |
|------|------|--------|-------|
| `src/core/__tests__/permissions.test.ts` | Unit | RBAC | hasPermission, hasModuleAccess, getEffectivePermissions |
| `src/core/__tests__/security-rls.test.ts` | Unit (SQL static) | Security | RLS SQL file integrity |
| `src/core/__tests__/errorTypes.test.ts` | Unit | Core | Error class hierarchy |
| `src/core/__tests__/offlineSync.test.ts` | Unit | Offline | OfflineSyncEngine |
| `src/core/__tests__/realtime.test.ts` | Unit | Realtime | RealtimeManager |
| `src/core/__tests__/realtimeIntegration.test.ts` | Integration | Realtime | Channel/handler wiring |
| `src/core/__tests__/step04UI.test.ts` | Unit | UI | UI step interaction |
| `src/modules/ai/__tests__/ai.test.ts` | Unit | AI | Analytics, forecasting |
| `src/modules/finance/__tests__/finance.test.ts` | Unit | Finance | SQL migration, journal |
| `src/modules/pos/__tests__/shift.test.ts` | Unit | POS | Shift open/close, reconciliation |
| `src/modules/devices/__tests__/devices.test.ts` | Unit | Devices | ESC/POS, ZPL, QR, terminals, IPC |
| `src/__tests__/mocks/mockProcurement.ts` | Fixture | Procurement | Shared test mock data |

### Planned Test Files (To Be Created)

| File | Priority | Coverage Gap |
|------|---------|-------------|
| `src/modules/pos/__tests__/orderFlow.test.ts` | P1 | sendToKitchen, processPayment, Quick Pay |
| `src/stores/__tests__/waiterOrderStore.test.ts` | P1 | Shift-gated inbox, realtime subscription |
| `src/stores/__tests__/kitchenDisplayStore.test.ts` | P2 | KOT status transitions |
| `src/core/__tests__/authBoot.test.ts` | P1 | Role redirect logic, route guards |
| `src/modules/finance/__tests__/journal.test.ts` | P2 | Double-entry validation, immutability |
| `tests/integration/orderAccept.integration.ts` | P1 | Full order → KOT trigger chain |
| `tests/integration/rlsPolicies.integration.ts` | P1 | Per-role RLS enforcement |
| `tests/e2e/pos-quickpay.spec.ts` | P2 | Playwright: POS → Quick Pay journey |
| `tests/e2e/waiter-accept.spec.ts` | P2 | Playwright: Waiter inbox → accept |
| `tests/e2e/qr-order.spec.ts` | P2 | Playwright: QR scan → self-order |

---

*This document covers the complete testing strategy for Seven Waves Restaurant ERP. Update this plan when new modules are added, critical bugs are fixed, or test infrastructure changes. The Release QA Checklist in Section 17 is the mandatory gate before every production deployment.*
