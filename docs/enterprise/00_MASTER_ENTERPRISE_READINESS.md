# Enterprise Production-Readiness Review — Seven Waves Restaurant ERP

**Reviewed by:** Senior Enterprise Architect + 4-agent specialist team (Security, DBA, DevOps, Backend)
**Stack:** Quasar 2 (Vue 3) SPA/PWA · Supabase (PostgreSQL 17) · Edge Functions · Netlify
**Mode:** Read-only audit — fixes proposed, not applied.
**Date:** 2026-07-24

Detailed per-pillar reports:
- `01_SECURITY_ACCESS_CONTROL.md`
- `02_DATA_INTEGRITY_CONCURRENCY.md`
- `03_PERFORMANCE_INFRASTRUCTURE.md`
- `04_BACKGROUND_MONITORING.md`

---

## Overall Verdict

**Not yet enterprise production-ready.** The domain architecture is strong (declarative RLS design, single-transaction KOT/stock orchestration RPCs, stateless CDN SPA), but four categories of gap block a hardened production launch:

1. **Server-side RBAC is effectively unenforced** — the core RLS lockdown migrations are marked PENDING/unapplied in the ledger. Route guards are client-side only. **This is the #1 blocker.**
2. **The two money paths (POS payment, finance voucher posting) are assembled from multiple client round-trips** — a mid-sequence failure partially commits (cooked-but-unpaid orders, half-posted vouchers).
3. **No server-side rate limiting, no centralized error tracking, no background-job offloading** — heavy work (reports, AI, EOD) runs synchronously in the browser tab.
4. **The caching layer that exists is dead** — reporting materialized views are never refreshed and never queried.

---

## Pillar Scorecard

| Pillar | Sub-area | Status | Worst finding |
|--------|----------|--------|---------------|
| **1. Security & Access** | Rate limiting / throttling | 🔴 Missing (client-only) | #46 |
| | RBAC / RLS | 🔴 Designed, not enforced live | #44 (CRITICAL) |
| **2. Data Integrity** | Transactions / rollbacks | 🟠 Partial (money paths non-atomic) | #48, #50 |
| | Locking / concurrency | 🟠 Partial (races in stock/voucher/QR) | #51, #56, #57 |
| **3. Performance** | Load balancing / scaling | 🟢 Sound (managed + stateless) | #62, #64 |
| | Caching | 🔴 Dead layer | #60, #61 |
| **4. Background/Monitoring** | Queues / background jobs | 🔴 Missing (browser-bound) | #52, #53 |
| | Error tracking / logging | 🔴 Missing (console only) | #55 |

---

## Pillar 1 — Security & Access Control

### 1a. API Rate Limiting & Throttling — 🔴 NOT enterprise-grade
- **#46 (MED)** — Rate limiting is **client-side / in-memory only** (`src/core/security/rateLimiter.js`), trivially bypassed by any direct API call. No server throttle on PostgREST or Edge Functions → **AI-cost DoS** and brute-force exposure.
- **Good pattern to generalize:** QR/kiosk order RPCs already use a real server-side `check_qr_rate_limit`. Extend this approach to mutation RPCs and expensive Edge Functions.
- **Fix:** Add a Postgres-backed token-bucket check (like `check_qr_rate_limit`) at the top of sensitive SECURITY DEFINER RPCs; put Edge Functions behind a per-user/IP counter table or Upstash rate-limit; rely on GoTrue platform limits for auth only as a floor.

### 1b. RBAC — 🔴 Strong design, NOT enforced on the live DB
- **#44 (CRITICAL)** — Core RLS lockdown migrations (`fix_missing_rls_policies`, `fix_rls_missing_tables` covering `user_roles`, `payments`, `salary`, ~15 base tables) are **PENDING/unapplied** per `applied_migrations_ledger.sql`. Result: server-side RBAC is effectively off; access control depends on client route guards that any API caller bypasses.
- **#45 (HIGH)** — `login_audit_logs`: `SELECT USING(true)` exposes all login records (admin emails/IPs/PII) to every authenticated user; anon INSERT allows log forging.
- **#47 (LOW)** — Permission matrix duplicated in client JS (`permissions.ts`, `roles.ts`) vs DB → drift risk.
- **Fix (ordered):** (1) Apply the pending lockdown SQL to the live DB and **verify with `select * from pg_policies`**; (2) fix `login_audit_logs` to admin-only SELECT + block anon INSERT; (3) treat DB RLS as the single source of truth, generate the client matrix from it.

---

## Pillar 2 — Data Integrity & Concurrency

### 2a. Transactions & Rollbacks — 🟠 Solid for KOT/stock, broken for money
- **Good:** Order-accept → KOT → dispatch and stock issue run inside single plpgsql RPCs with `FOR UPDATE` + idempotency. Keep this as the template.
- **#48 (HIGH)** — POS Quick-Pay runs **5 separate client transactions** (`orderStore.js:303-359`); a failure between them leaves **cooked-but-unpaid orders**.
- **#49 (HIGH)** — `sendToKitchen` is a non-atomic insert with a fragile client-side delete-rollback → can orphan orders with zero items.
- **#50 (HIGH)** — `postVoucher` partial-commits cashbook + ledger with no atomic wrapper.
- **Fix:** Wrap each money path in **one SECURITY DEFINER RPC** (mirror the existing `process_waiter_accept` / `issue_stock_for_order` pattern) so Postgres gives you all-or-nothing rollback automatically.

### 2b. Locking / Concurrency — 🟠 Real races present
- **#51 (HIGH)** — Finance ledger balance is a read-modify-write → **lost updates** under concurrency. Fix: `UPDATE ... SET balance = balance + :delta` in-DB, or `SELECT ... FOR UPDATE`.
- **#54 (MED)** — Voucher numbers via client `count()+1` → duplicates. Fix: Postgres sequence or `generate_series`-safe RPC.
- **#56 (MED)** — Inventory **stock oversell** via check-then-act TOCTOU (`validate_sufficient_stock` unlocked). Fix: `SELECT ... FOR UPDATE` on the stock row inside the deduction RPC.
- **#57 (MED)** — QR table **double-seat** race in `get_or_create_session_by_qr`. Fix: advisory lock on `table_id` or unique partial index on active session.

---

## Pillar 3 — Performance & Infrastructure

### 3a. Load Balancing & Traffic Distribution — 🟢 Sound
- Stateless CDN-served SPA + managed Supabase (auto-scaled PostgREST/Realtime) + Edge Functions = horizontal scaling is already handled by the platform. No app-owned load balancer needed.
- **#62 (MED)** — Realtime fan-out risk: dual realtime systems + ~5 channels per manager client can hit Supabase Realtime connection/message quotas at scale. Consolidate channels.
- **#64 (LOW)** — Document the **Supavisor pooler (port 6543, transaction mode)** rule before adding any direct-pg server/edge workers.

### 3b. Caching for Heavy Queries — 🔴 Dead layer
- **#60 (HIGH)** — Reporting materialized views (`mv_daily_sales_summary`, `mv_category_sales`, `mv_inventory_valuation`) + `refresh_reporting_views()` **exist but are never refreshed** (no `cron.schedule`) and **never queried** by the app.
  - ⚠️ **Correction from DBA:** scheduling `refresh_reporting_views()` directly under `pg_cron` **silently no-ops** — it guards on `auth.uid()`, which is NULL under cron. Use an unguarded internal refresher:
    ```sql
    CREATE OR REPLACE FUNCTION refresh_reporting_views_cron() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales_summary;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_sales;
      REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_valuation;
    END $$;
    REVOKE ALL ON FUNCTION refresh_reporting_views_cron() FROM public, authenticated;
    SELECT cron.schedule('refresh-reporting-views','*/15 * * * *','SELECT refresh_reporting_views_cron();');
    ```
    Keep the guarded `refresh_reporting_views()` for manual admin refresh.
- **#61 (HIGH)** — `FinanceDashboard.vue:339-388` pulls **6 months of raw orders** to the browser and aggregates in JS. Point it at the MV / an aggregate RPC.
- **#63 (MED)** — `reportService` in-memory cache has **zero callers**.
- **#65 (LOW)** — For cross-user expensive reports at scale, add **Upstash Redis** (Supabase has no built-in Redis) only when justified. Postgres MVs cover most needs first.

---

## Pillar 4 — Background Processing & Monitoring

### 4a. Background Jobs / Message Queues — 🔴 Browser-bound
- **#52 (HIGH)** — AI / EOD / forecast work runs **synchronously on the browser main thread** (`ai.service.js:25`); no scheduling/retry, dies with the tab.
- **#53 (HIGH)** — All PDF/Excel report generation is **client-side & blocking**; the already-built `report-generator` Edge Function is never invoked.
- **#58 (MED)** — Notification outbox queue defined but **never drained or cleaned** → unbounded growth, pushes never delivered.
- **#67 (MED)** — No message queue (**pgmq**); `pg_cron` coverage is thin (payroll/biometric only).
- **Fix:** Move report/AI/EOD off the request path → invoke the Edge Function via `pg_net` + schedule with `pg_cron`; adopt **pgmq** for the outbox; schedule the existing outbox drain+cleanup.

### 4b. Centralized Error Tracking & Logging — 🔴 Console only
- **#55 (HIGH)** — **No Sentry/Logflare sink.** Errors only hit console + in-memory buffers that die with the tab.
- **#59 (MED)** — Edge Functions have no error sink (`console.error` only).
- **#66 (MED)** — In-memory metrics never exported/scraped; alerts fire only in-tab.
- **#68 (LOW)** — `correlationId` not propagated to the server; INFO logs dropped in prod.
- **#69 (LOW)** — Duplicate/competing global error-handler boot files (`core.ts` vs `error-handler.ts`).
- **Fix:** Add **Sentry** to the Quasar client (boot file) and to each Edge Function; ship structured logs to **Logflare**; propagate `correlationId` via `ApiClient`; delete the duplicate error-handler boot.

---

## Recommended Fix Order (priority-ranked)

**P0 — Ship-blockers (do before any production traffic)**
1. Apply the pending RLS lockdown SQL + verify `pg_policies` live (#44).
2. Lock down `login_audit_logs` (#45).
3. Wrap POS payment & finance voucher posting in single atomic RPCs (#48, #49, #50).
4. Fix ledger lost-update + stock oversell with row locks (#51, #56).

**P1 — Hardening (first sprint after launch)**
5. Server-side rate limiting on RPCs + Edge Functions (#46).
6. Sentry + Logflare centralized error tracking (#55, #59).
7. Move reports/AI/EOD to Edge Function + pg_cron; drain the outbox (#52, #53, #58).
8. Schedule MV refresh (correct cron variant) + point dashboards at MVs (#60, #61).

**P2 — Scale-readiness (before heavy load)**
9. Consolidate realtime channels (#62); document Supavisor pooler (#64).
10. Fix voucher-number sequence + QR double-seat lock (#54, #57).
11. Reconcile RBAC matrix drift; wire correlationId; remove duplicate boots (#47, #68, #69).
12. Evaluate Upstash Redis + pgmq when metrics justify (#65, #67).
