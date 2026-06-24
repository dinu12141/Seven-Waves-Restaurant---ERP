# Seven Waves Restaurant ERP — Team Board

> **Protocol**: Every agent reads this file at session start. Write your updates under your role section. Use `[DONE]`, `[IN PROGRESS]`, `[BLOCKED]`, `[NEEDS REVIEW]` tags.
> Last updated: 2026-06-22

---

## Active Sprint

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Fix loyalty_transactions amount_value column | DBA | [NEEDS REVIEW] | SQL ready in supabase/fix_loyalty_amount_value.sql |
| 2 | Fix journal immutability trigger | DBA | [NEEDS REVIEW] | SQL ready in supabase/fix_journal_immutability.sql |
| 3 | POS Page — loyalty flow on order complete | Frontend | [IN PROGRESS] | POSPage.vue modified |
| 4 | Finance ledger service audit | Backend | [IN PROGRESS] | finance-ledger.service.js modified |
| 5 | Finance reports page — chart data | Frontend | [IN PROGRESS] | FinanceReportsPage.vue modified |
| 6 | Order store — loyalty coin deduction | Backend | [IN PROGRESS] | orderStore.js modified |

---

## Team Members & Terminals

| Role | Slash Command | Owns | Terminal |
|------|--------------|------|---------|
| Tech Lead | `/lead` | Architecture, reviews, coordination | Terminal 1 |
| Frontend Engineer | `/frontend` | Vue/Quasar pages, components, stores | Terminal 2 |
| Backend Engineer | `/backend` | Services, business logic, Pinia stores | Terminal 3 |
| Database Admin | `/dba` | Supabase SQL, migrations, RLS, RPCs | Terminal 4 |
| DevOps Engineer | `/devops` | Builds, Electron/Tauri/PWA, CI/CD | Terminal 5 |
| QA Engineer | `/qa` | Testing, vitest, bug validation | Terminal 6 |

---

## Communication Log

<!-- Format: [DATETIME] [FROM → TO] Message -->

[2026-06-22 00:00] [SYSTEM] Team board initialized for Seven Waves Restaurant ERP.
[2026-06-22] [Security/CDN-Cache] Audit complete. Found 18 issues: 2 CRITICAL (live .env in git with real API keys; unsafe-inline+unsafe-eval in CSP), 4 HIGH (Gemini domain missing from deployed CSP; Electron --no-sandbox flag; --disable-gpu-sandbox unconditional; no Cache-Control on index.html), 7 MEDIUM, 5 LOW. Report written to SECURITY_REPORT.md.
[2026-06-22] [Security/Secrets] Audit complete. Found 2 HIGH issues: (1) Any cashier can edit item prices to arbitrary values — no server-side price validation against menu_items.base_price in order_items INSERT or payment RPCs; (2) Manual discount dialog allows 100% discount with no RBAC check and no server-side ceiling — discount_amount written directly to orders table and trusted by process_cashier_payment RPC. Both are confirmed revenue fraud vectors. Report appended to SECURITY_REPORT.md under "Agent 5: Secrets & Data Exposure".
[2026-06-22] [Security/Scaling] Audit complete. Found 16 issues: 0 CRITICAL, 6 HIGH (unbounded queries on orders/KDS/finance/AI tables; dual realtime system causing double event processing; waiter KOT channel missing branch filter), 6 MEDIUM (500-order billing queue memory pressure; KDS orders channel no branch filter; implicit OAuth flow deprecated; no inactivity timeout on POS terminals; no error monitoring; Electron unsigned+no auto-updater), 4 LOW (orphaned channel names; wrong table name in registry; heartbeat no-op; jsPDF static import). Report appended to SECURITY_REPORT.md under "Agent 4: Load Balancing & Scaling".
[2026-06-22] [Security/RateLimiting] Audit complete. Found 15 issues: 3 CRITICAL (create_kiosk_order callable by anon with no rate limit; confirm_online_payment callable by anon with no rate limit; blanket GRANT ALL FUNCTIONS TO anon in fix_cashier_kot_realtime.sql:173 and fix_kitchen_routing_hierarchy.sql:232 overrides all per-function security grants), 4 HIGH (check_qr_rate_limit RPC built but never called anywhere in the codebase; no login brute force lockout; cleanup_rate_limits never scheduled via pg_cron; qr_rate_limits in realtime with RLS disabled leaks rate limit counters), 5 MEDIUM (create_order_from_session no rate limit; loyalty coin adjust no rate limit or delta cap; pos_record_shift_payment no ownership check; login email enumeration; delivery_tracking insert open to all authenticated), 3 LOW. Report appended to SECURITY_REPORT.md under "Agent 2: Rate Limiting & API Abuse".

---

## Blocked / Needs Help

_Nothing blocked._

---

## Recent Completions

_None yet — sprint just started._

---

## Architecture Decisions

- **Framework**: Vue 3 + Quasar 2 (SPA + Electron + PWA + Tauri + Capacitor)
- **Backend**: Supabase (PostgreSQL, RLS, real-time, RPCs)
- **State**: Pinia stores (one per domain)
- **Build targets**: Web (Vercel), Desktop (Electron/Tauri), Mobile (Capacitor), PWA
- **AI**: Google Generative AI (`@google/generative-ai`)
- **Auth**: Supabase Auth + RBAC (roles in `profiles` table)
- **Multi-tenant**: `company_id` on every table, enforced by RLS

---

## Module Map

```
src/modules/
  ai/          — AI analytics, Google Generative AI
  devices/     — Device management, printers, KDS
  finance/     — Accounts, ledger, journal, reports
  pos/         — POS shift, drawer management

src/pages/
  POSPage.vue         — Main POS terminal
  KitchenPage.vue     — Kitchen Display System
  WaiterPage.vue      — Waiter tablet app
  CashierPage.vue     — Cashier station
  AdminPage.vue       — Admin dashboard
  InventoryPage.vue   — Inventory management
  LoyaltyPage.vue     — Loyalty program
  finance/            — Finance module pages
  hr/                 — HR & payroll pages
  delivery-app/       — Delivery management
  website/            — Website order management

supabase/
  schema.sql          — Full DB schema
  migrations/         — Ordered migrations
  *.sql               — Feature-specific fixes and functions
```
