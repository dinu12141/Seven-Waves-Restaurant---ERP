# Pillar 3 — Performance & Infrastructure Audit

**Seven Waves Restaurant ERP** · Quasar 2 (Vue 3) SPA/PWA + Supabase (PostgreSQL 17) · Netlify CDN
**Auditor:** DevOps · **Task #80** · **Scope:** Read-only enterprise-readiness audit (no source changes)
**Date:** 2026-07-24

---

## Executive Summary

| # | Finding | Severity | Area |
|---|---------|----------|------|
| 60 | Reporting materialized views never refreshed (no pg_cron) **and** unused by app — dead caching layer | 🔴 HIGH | Caching |
| 61 | FinanceDashboard fetches 6 months of raw orders and aggregates client-side (uncached) | 🔴 HIGH | Caching |
| 62 | Realtime fan-out: dual realtime systems + many per-store channels can exceed Supabase Realtime quotas | 🟠 MEDIUM | Scaling |
| 63 | `reportService` in-memory query cache has zero callers — reports run uncached | 🟠 MEDIUM | Caching |
| 64 | No documented Supavisor connection-pooler strategy for future direct-pg workers | 🟡 LOW | Scaling |
| 65 | No shared/distributed cache (Redis) for cross-user expensive reports | 🟡 LOW | Caching |

**Verdict:** The **infrastructure/scaling posture is fundamentally sound** — a stateless static SPA on a CDN in front of Supabase's managed, auto-scaled services. The **caching story is the weak point**: a well-designed pre-aggregation layer (materialized views + branch-safe RPCs) was built but is *entirely inert* — never refreshed, never queried — so dashboards fall back to raw row-scan aggregation in the browser. Fixing the caching gaps is low-effort (mostly SQL/cron + repointing queries) and high-impact.

---

## Part 1 — Load Balancing & Traffic Distribution

### 1.1 What "load balancing" means in this stack

This is **not** a stack you load-balance by hand. Traffic distribution is delegated to managed layers:

| Layer | Component | Scaling model | Status |
|-------|-----------|---------------|--------|
| Static frontend | `dist/spa` on **Netlify CDN** (`netlify.toml`) | Edge/CDN, geo-distributed, effectively infinite for static assets | ✅ Good |
| API / data | **Supabase PostgREST** (REST over anon key) | Managed, stateless HTTP behind Supabase's gateway + Supavisor pooler | ✅ Good |
| Realtime | **Supabase Realtime** (WSS) | Managed; **quota-bound** per project tier | ⚠️ See 1.3 |
| Compute | **Supabase Edge Functions** (Deno) | Auto-scaled serverless | ✅ Good |
| Desktop/mobile | Electron / Tauri / Capacitor shells of the same SPA | Client-side | ✅ Good |

### 1.2 Frontend statelessness — ✅ scales horizontally

- The SPA is a static hashed bundle; there is **no application server** holding session state. Auth is **PKCE + localStorage** (`src/boot/supabase.ts:21-31`), so any CDN edge can serve any user — no sticky sessions required.
- All the "singletons" — the Supabase client (`boot/supabase.ts`), `realtimeManager` (`realtime.manager.ts:444`), `reportService._cache` (`reportService.js:103`), the client `rateLimiter` — are **per-browser-tab** instances. Because there is no shared server process, these do **not** block horizontal scaling. (Caveat: the client `rateLimiter` is therefore *not* a real server-side throttle — cross-referenced to Pillar 1 / Security.)
- Edge functions connect to the DB via `createClient` over PostgREST/HTTP (`report-generator/index.ts:99`, `ai-gemini-service/index.ts:75`), **not** raw `postgres://` pools — so there is currently **no app-managed connection pool to exhaust**. This is the right choice for serverless.

### 1.3 Realtime fan-out — ⚠️ MEDIUM (Finding #62) — the real horizontal-scaling ceiling

Two realtime systems run **concurrently** (documented in CLAUDE.md), and stores open **many ad-hoc channels each**:

- `RealtimeManager` registry: **12** declared channels (`channel.registry.ts`).
- Per-store ad-hoc channels, e.g.:
  - `managerAppStore.js:493-555` → **5** channels (`mgr-orders`, `mgr-kot`, `mgr-waiter-profiles`, `mgr-messages`, `mgr-alerts`)
  - `waiterAppStore.js:670-806` → **4** channels
  - plus `kitchenDisplayStore`, `deliveryStore` (2), `customerOrderStore` (2), `inventoryQueueStore`, `cashierStore`, `notifications`, `kotOrchestrationStore`…

A single Manager PWA client can hold ~5 WebSocket channels; each Waiter ~4; each KDS ≥1. **Concurrent channels and messages/sec scale with (waiters + kitchen screens + managers + cashiers)** and can hit the **Supabase project Realtime quota** (concurrent connections + messages/sec are per-tier limits). `eventsPerSecond: 10` (`boot/supabase.ts:34`) is only a *client-side* cap.

**Fix:**
- Consolidate to **one multiplexed channel per client** where possible — a single Supabase channel supports multiple `postgres_changes` bindings.
- Retire duplicate registry-vs-store subscriptions on the same tables.
- Load-test concurrent-client counts and **right-size the Supabase plan's Realtime limits**.
- Trim `REPLICA IDENTITY FULL` payloads to needed columns to reduce message size/cost.

### 1.4 Connection pooling — 🟡 LOW (Finding #64)

Currently safe (everything goes through PostgREST). The gap is **documentation/guardrail**: any future direct-Postgres worker (payroll batch, report worker, migration runner) must use the **Supavisor transaction-mode pooler (`…pooler.supabase.com:6543`)**, not the direct `5432` connection, or serverless fan-out exhausts Postgres connections.

**Fix:** Document the pooler rule in `CLAUDE.md`/deploy docs; add pooler URL placeholders to `.env.example`; reserve `5432` for migrations only; keep edge functions on PostgREST.

### 1.5 CDN / caching headers — ✅ Good

`netlify.toml` and `vercel.json` correctly set:
- `index.html`, `sw.js` → `no-cache, no-store, must-revalidate`
- `/assets/*` (hashed) → `public, max-age=31536000, immutable`
- Full security header suite (HSTS, CSP, COOP/CORP, Permissions-Policy).

`scripts/health-check.sh` provides basic availability + header + load-time smoke checks (warns > 3s). Good starting point; not a substitute for continuous monitoring (see Pillar 4).

---

## Part 2 — Caching for Heavy Queries

### 2.1 A complete pre-aggregation layer exists — but is DEAD — 🔴 HIGH (Finding #60)

`supabase/critical_fix_03_reporting_engine.sql` builds a proper caching foundation:
- **Materialized views:** `mv_daily_sales_summary`, `mv_category_sales`, `mv_inventory_valuation` (with unique indexes → `REFRESH … CONCURRENTLY`-capable).
- **Refresh function:** `refresh_reporting_views()` (`:83`).
- **Branch-safe read RPC:** `fn_rpt_branch_sales(branch, start, end)` (`:109`).

Two fatal gaps make all of it inert:
1. **No `pg_cron` job schedules the refresh.** `grep cron.schedule supabase/` returns biometric, rate-limit, HR, payroll — **never reporting**. The MVs are frozen at creation-time data.
2. **No application code references them.** `grep src/` for `mv_daily_sales_summary` / `fn_rpt_branch_sales` = **0 hits**. Dashboards ignore the cache and run live aggregates.

**Fix (corrected — DBA):** ⚠️ Do **not** schedule `refresh_reporting_views()` directly: under pg_cron there is no JWT, so `auth.uid()` is NULL and its `is_admin()/is_manager()/is_finance()` guard returns `{"success":false,"error":"Unauthorized"}` — the cron job silently no-ops (a false green). Split into an unguarded scheduler-only function:
```sql
-- Unguarded internal refresher for the scheduler (no auth.uid() dependency)
CREATE OR REPLACE FUNCTION refresh_reporting_views_cron() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_sales_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_category_sales;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_valuation;
END $$;
REVOKE ALL ON FUNCTION refresh_reporting_views_cron() FROM public, authenticated;

-- Unique indexes already present → CONCURRENTLY is valid
SELECT cron.schedule('refresh-reporting-views','*/15 * * * *','SELECT refresh_reporting_views_cron();');
```
Keep the guarded `refresh_reporting_views()` for manual admin-triggered refresh. Then repoint dashboards/reports at `fn_rpt_branch_sales` / the MVs. For EOD-accurate figures, also refresh right after shift close. If the MVs are genuinely unwanted, **delete them** to remove the false sense of a caching layer.

### 2.2 FinanceDashboard raw-row aggregation — 🔴 HIGH (Finding #61)

`src/pages/finance/FinanceDashboard.vue:339-388`:
```js
supabase.from('orders').select('total_amount, created_at')
  .eq('company_id', companyId).eq('payment_status','paid')
  .gte('created_at', sixMonthsAgo + 'T00:00:00').order('created_at')
// … then JS buckets every row into months (lines 383-388)
```
This ships **6 months of individual paid-order rows** to the browser and groups them client-side (same pattern for `expense_entries`). Network + memory grow **linearly with order volume** — potentially tens of thousands of rows per dashboard load, per user, **uncached**.

**Fix:** Push `GROUP BY month` to Postgres — query `mv_daily_sales_summary` (already grouped by `sale_date`/`branch`) or add an aggregate RPC returning ~6 pre-bucketed rows. Wrap in the 60s client cache.

### 2.3 `reportService` cache is defined but never used — 🟠 MEDIUM (Finding #63)

`src/services/reportService.js:102-119` defines a 60s in-memory `Map` cache (`getCached`/`setCache`/`clearCache`) — but **grep shows zero external callers**. Every report/dashboard mount and filter change re-hits Supabase.

**Fix:** Wire `getCached`/`setCache` around heavy queries keyed by `(report, company, branch, dateRange)`, or delete the dead utility.

### 2.4 AI caching — ✅ Good pattern (no action)

The AI module is the model to copy: `ai.service.js` runs generation in the **`ai-gemini-service` edge function** (off the SPA request path) and **persists results** to `ai_forecasts`, `ai_daily_reports`, `ai_insights`, `ai_recommendations`, `ai_anomaly_events`, which the UI reads back. That's a durable DB-backed cache with upsert-by-date. Minor nit: no explicit staleness/TTL marker beyond the per-day upsert key.

### 2.5 No distributed cache for expensive cross-user reports — 🟡 LOW (Finding #65)

Supabase has no Redis. Expensive non-AI reports (`report-generator` edge fn, financial statements) are recomputed per request/user.

**Recommended strategy (in priority order):**
1. **Postgres MV + pg_cron** (§2.1) — covers most dashboards with **no new infra**. Do this first.
2. **Client 60s cache** (§2.3) for per-tab repeat navigation.
3. **Upstash Redis** (serverless, HTTP) in front of `report-generator` for genuinely expensive, shared reports — key `(company,branch,report,dateRange)`, short TTL — **only when scale demands it**.
4. **`Cache-Control` on read-only RPC responses** via a caching edge function for anon/public endpoints (e.g. customer menu).

---

## Prioritized Remediation Plan

| Priority | Action | Effort | Owner |
|----------|--------|--------|-------|
| P0 | Schedule `refresh_reporting_views()` via pg_cron (§2.1) | XS (1 SQL line) | DBA |
| P0 | Repoint FinanceDashboard + reports to MVs / aggregate RPCs (§2.1–2.2) | S | Frontend/Backend |
| P1 | Wire (or remove) `reportService` cache (§2.3) | XS | Frontend |
| P1 | Consolidate/right-size Realtime channels & plan limits (§1.3) | M | DevOps/Frontend |
| P2 | Document Supavisor pooler rule + `.env` placeholders (§1.4) | XS | DevOps |
| P2 | Evaluate Upstash Redis for shared expensive reports (§2.5) | M | DevOps (when scaling) |

**What's already right:** stateless CDN-served SPA, correct cache-control headers, edge functions over PostgREST (no raw pooling), AI results persisted off the request path. The scaling foundation is enterprise-appropriate; the caching layer just needs to be *turned on and wired in*.
