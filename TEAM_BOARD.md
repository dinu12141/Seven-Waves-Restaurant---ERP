# Seven Waves Restaurant ERP — Team Board

> **Protocol**: Every agent reads this file at session start. Write your updates under your role section. Use `[DONE]`, `[IN PROGRESS]`, `[BLOCKED]`, `[NEEDS REVIEW]` tags.
> Last updated: 2026-07-27

---

## Active Sprint — PRODUCTION SECURITY FINAL (2026-07-27)

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 97 | Complete FOC rewire via process_foc_order RPC | Backend | [IN PROGRESS] | ManagerAuthDialog + POSPage both paths |
| 100 | Sentry + monitoring boot + FinanceDashboard MV chart | DevOps | [IN PROGRESS] | fn_rpt_monthly_sales RPC unblocked |
| 105 | QA gate + verify POS payment fix is live | QA | [BLOCKED] | Verify live smoke test |
| 75 | Electron security: --no-sandbox, --disable-gpu-sandbox, CSP | DevOps | [TODO] | Gate flags to dev-only |
| 101 | Production Security Sign-off — full checklist | QA | [TODO] | Cross-ref SECURITY_REPORT.md |
| 106 | Sentry client boot: VITE_SENTRY_DSN + Sentry.init | DevOps | [TODO] | Wire in boot/core.ts |
| 114 | QA: verify attendance calc, no_pay, absentee, overnight | QA | [TODO] | |
| 123 | Fix ledger add failure + bank fields + balance seed | Frontend | [DONE] | AccountRegistrationPage: added editing=null reset on Register click (same bug as LedgerRegistrationPage); service already had ledger join strip fix from FinFix sprint |
| 124 | Verify finance: ledger, bank fields, balance, delete | QA | [TODO] | Admin-only delete gate |
| 125 | Fix stale SW bundle serving old finance_vouchers JS | Frontend | [DONE] | SW config already correct: GenerateSW + skipWaiting + clientsClaim + no JS StaleWhileRevalidate; index.html no-cache + sw.js no-cache in netlify.toml — verified clean |
| SEC-A | Revoke anon GRANT ALL in fix_cashier_kot_realtime.sql:173 | DBA | [TODO] | CRITICAL — anon can call all functions |
| SEC-B | Schedule cleanup_rate_limits via pg_cron | DBA | [TODO] | RPC built but never scheduled |
| SEC-C | Wire check_qr_rate_limit in client QR flow | Backend | [TODO] | RPC exists but never called |
| SEC-D | Server-side price validation vs menu_items.base_price | Backend | [TODO] | Revenue fraud vector |

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
[2026-07-16 22:44] [QA → Team] Jordan online. Test run: 393/393 ✅ (fixed 8 QR failures — VITE_QR_SECRET missing from vitest.config.ts). SQL review: Task #1 (loyalty_amount_value) APPROVED ✅, Task #2 (journal_immutability) APPROVED ✅. Both ready to apply. Idle — awaiting next task.
[2026-06-22] [Security/CDN-Cache] Audit complete. Found 18 issues: 2 CRITICAL (live .env in git with real API keys; unsafe-inline+unsafe-eval in CSP), 4 HIGH (Gemini domain missing from deployed CSP; Electron --no-sandbox flag; --disable-gpu-sandbox unconditional; no Cache-Control on index.html), 7 MEDIUM, 5 LOW. Report written to SECURITY_REPORT.md.
[2026-06-22] [Security/Secrets] Audit complete. Found 2 HIGH issues: (1) Any cashier can edit item prices to arbitrary values — no server-side price validation against menu_items.base_price in order_items INSERT or payment RPCs; (2) Manual discount dialog allows 100% discount with no RBAC check and no server-side ceiling — discount_amount written directly to orders table and trusted by process_cashier_payment RPC. Both are confirmed revenue fraud vectors. Report appended to SECURITY_REPORT.md under "Agent 5: Secrets & Data Exposure".
[2026-06-22] [Security/Scaling] Audit complete. Found 16 issues: 0 CRITICAL, 6 HIGH (unbounded queries on orders/KDS/finance/AI tables; dual realtime system causing double event processing; waiter KOT channel missing branch filter), 6 MEDIUM (500-order billing queue memory pressure; KDS orders channel no branch filter; implicit OAuth flow deprecated; no inactivity timeout on POS terminals; no error monitoring; Electron unsigned+no auto-updater), 4 LOW (orphaned channel names; wrong table name in registry; heartbeat no-op; jsPDF static import). Report appended to SECURITY_REPORT.md under "Agent 4: Load Balancing & Scaling".
[2026-07-27 00:00] [Lead → ALL] PRODUCTION SECURITY SPRINT launched. 5 terminals open (DBA/Backend already running, Frontend+DevOps spawned). 14 tasks assigned — see Active Sprint above. All agents: activate your skill, read the channel, execute.
[2026-07-27 23:10] [Frontend → Lead] Maya — sprint tasks complete. DONE #123: AccountRegistrationPage.vue fixed missing editing=null reset (same bug as LedgerRegistrationPage — form opened in edit mode after Edit+Cancel). DONE #125: SW config verified correct — GenerateSW+skipWaiting+clientsClaim, no JS StaleWhileRevalidate, index.html no-cache in netlify.toml. DONE Discount guard: POSPage.vue handleOther() now requires ManagerAuthDialog when val===100 (admin/manager roles bypass). DONE Console.log sweep: removed session email log in tauri-auth.ts, token prefix in MenuCartDrawer.vue, debug log in POSPage.vue. Lint passes clean. Ready for QA review (#124).
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
