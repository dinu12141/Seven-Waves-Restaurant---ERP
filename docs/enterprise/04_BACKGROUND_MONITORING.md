# Pillar 4 — Background Processing & Monitoring Audit

**Task:** #81 (Backend) · **Scope:** Enterprise-readiness, read-only · **Date:** 2026-07-24
**Stack:** Quasar 2 (Vue 3) SPA/PWA · Supabase (Postgres 17) · Netlify · Supabase Edge Functions (Deno)

> Verdict: **NOT enterprise-ready.** Heavy work runs synchronously on the browser main thread, a persistent job queue exists in SQL but is never drained, and there is **no centralized error tracking or monitoring** — errors go to `console` and an in-memory buffer that dies with the tab. Metrics are collected but never exported or scraped.

---

## Part 1 — Background Jobs / Message Queues

### 1.1 AI audits, EOD reports, forecasts run **synchronously in the browser** — HIGH
`src/modules/ai/services/ai.service.js:25` — `invokeAi()` was refactored so the Gemini Edge Function is **removed** ("Edge function invocation removed per user request", line 19). Every AI action now executes **client-side** in the request path:
- `system_audit` / `eod_report` (`:29-145`) run multiple sequential `supabase.from(...).select()` round-trips, aggregate in JS, and write `ai_daily_reports` — all on the main thread while the user waits.
- `generateSalesForecast`, `detectAnomalies`, `generateInventoryForecast`, etc. all funnel through the same blocking path.

**Risk:** UI freezes for large date ranges; work is tied to the browser session (close the tab → job dies); no retry, no scheduling, results not reproducible server-side. This does not scale to multi-branch/EOD load.

**Fix:** Move audit/EOD/forecast aggregation server-side. Restore an Edge Function (`ai-gemini-service` already exists in `supabase/functions/`) or a plpgsql RPC that does the aggregation atomically, and schedule EOD via `pg_cron`:
```sql
-- run EOD per active branch at 23:59
select cron.schedule('daily-eod-reports','59 23 * * *', $$
  select net.http_post(
    url := 'https://clykwuzajtwvwuavmtzs.supabase.co/functions/v1/report-generator',
    headers := jsonb_build_object('Authorization','Bearer '||current_setting('app.service_role_key'),
                                  'Content-Type','application/json'),
    body := jsonb_build_object('action','eod_report','branch_id',b.id,'report_date',current_date)
  ) from branches b where b.is_active $$);
```
The client should only *trigger* and *poll* `ai_daily_reports`, never compute.

### 1.2 All PDF / Excel report generation is client-side & blocking — HIGH
`package.json` ships `jspdf`, `jspdf-autotable`, `exceljs`, `xlsx`, `html2canvas`. These are used across **~18 pages** (`src/services/exportService.ts`, `src/components/reports/ReportLayout.vue`, all of `src/pages/hr/*`, `src/pages/finance/*`, `src/pages/reports/*`). `html2canvas` + `jsPDF` rasterizing a large report on the main thread will jank/freeze the tab.

Meanwhile a purpose-built `supabase/functions/report-generator/index.ts` (33 KB) **exists but is never invoked** — `grep` for `functions.invoke('report-generator')` returns nothing (only `send-payslip` and `send-po-email` are called).

**Fix (two tiers):**
- Short term: move `xlsx`/`jspdf` generation into a **Web Worker** (only one worker exists today, `src/composables/useWaiterPush.js`, and it's push-related) so the main thread stays responsive.
- Enterprise: wire the existing `report-generator` Edge Function for heavy/scheduled reports; return a signed URL to a Storage object. Client downloads, never renders.

### 1.3 Notification outbox queue is defined but **never drained or cleaned** — MEDIUM
`supabase/critical_fix_04_notification_outbox.sql` implements a solid outbox: `notification_outbox` table, `enqueue_notification_delivery()` trigger, `process_notification_outbox()` (uses `FOR UPDATE SKIP LOCKED` + exponential backoff + dead-letter), and `cleanup_notification_outbox()`.

**But nothing calls them.** `grep` for `process_notification_outbox` / `cleanup_notification_outbox` finds no `cron.schedule`, no Edge Function, no `net.http_post` caller. Result: the trigger keeps inserting rows on every notification, `push`-channel rows are **never delivered**, `delivered` rows are **never cleaned** (table grows unbounded), and the dead-letter path is unreachable.

**Fix:** schedule the processor + cleanup:
```sql
select cron.schedule('drain-outbox','* * * * *',            -- every minute
  $$ select process_notification_outbox(200) $$);
select cron.schedule('cleanup-outbox','0 3 * * *',          -- daily 03:00
  $$ select cleanup_notification_outbox() $$);
```
For real push delivery, `process_notification_outbox` must `net.http_post` to an Edge Function (FCM/APNs) rather than just marking `push` rows delivered (`:135-142` currently no-ops them).

### 1.4 No general-purpose job/message queue; cron coverage is thin — MEDIUM
The only `pg_cron` schedules that actually run are in `supabase/hr_payroll_enhancements.sql` (payroll) and `supabase/biometric_integration.sql`, and both are guarded behind `IF pg_cron installed`. `supabase/fix_system_audit_setup.sql:157` only *mentions* the daily-audit schedule as a comment. There is no durable message queue (no `pgmq`) for retryable async work (emails, exports, webhooks, AI batches).

**Fix:** Standardize on **`pg_cron` + `pg_net` → Edge Functions** for scheduled work, and adopt **`pgmq`** (Supabase-supported Postgres queue) for retryable fan-out jobs (payslip email, PO email, exports, AI batch). Give each queue a visibility timeout + a DLQ, and drain via a cron-triggered Edge worker.

---

## Part 2 — Centralized Error Tracking & Logging

### 2.1 No centralized error tracking sink (no Sentry/Logflare/Datadog) — HIGH
`package.json` has **no** `@sentry/*`, `logflare`, `datadog`, or `rollbar` dependency. The client error pipeline is well-structured but terminal:
- `src/core/errors/ErrorHandler.ts` classifies + assigns a `correlationId`, then `logger.error(...)` and keeps the **last 50** in `recentErrors` (in-memory).
- `src/core/logging/logger.ts` writes to `console` and keeps the **last 200** in a buffer (`:22`). `exportAsJson()` is manual download only.

Both buffers are per-tab and vanish on reload. Global handlers (`src/boot/core.ts:17` Vue `errorHandler`, `:23` `unhandledrejection`) route into the same dead end. **Production has no way to know a user hit an error.**

**Fix:** Add Sentry for the SPA and forward `ErrorHandler.handle`:
```bash
npm i @sentry/vue
```
```ts
// src/boot/sentry.ts
import * as Sentry from '@sentry/vue'
export default boot(({ app, router }) => {
  Sentry.init({ app, dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_APP_ENV,
    tracesSampleRate: 0.1, integrations: [Sentry.browserTracingIntegration({ router })] })
})
```
```ts
// in ErrorHandler.handle(), after classify():
if (erpError.severity !== ErrorSeverity.INFO)
  Sentry.captureException(erpError.originalError ?? new Error(erpError.technicalMessage), {
    tags: { module: erpError.module, category: erpError.category },
    extra: { correlationId: erpError.correlationId } })
```

### 2.2 Edge Functions have no error sink — MEDIUM
All 9 Edge Functions (`supabase/functions/*`) only `console.error` (34 occurrences). That lands in Supabase's built-in function logs — no alerting, no aggregation, no retention guarantee, not correlated with client errors.

**Fix:** Init Sentry (Deno SDK) or ship to Logflare from each function's catch block, tagging the same `correlationId` the client sends (see 2.4). Wrap each handler in a shared `withMonitoring()` helper.

### 2.3 Metrics are collected but never exported — MEDIUM
`src/core/monitoring/metrics.js` is a capable in-memory collector (counters/gauges/histograms, alert rules, `toPrometheusFormat()`). But:
- `toPrometheusFormat()` / `getSnapshot()` are **not referenced anywhere** outside the module — nothing scrapes them.
- Alerts fire only to in-memory listeners + `logger.warn` (`:143`) → same dead end.
- State is per-browser-tab, so aggregate rates ("50 API errors") are meaningless across users.

**Fix:** Client metrics are only useful if shipped. Either (a) push periodic snapshots to an Edge Function → Logflare/Prometheus pushgateway, or (b) treat client metrics as UX telemetry via Sentry and move true SLIs (API latency, error rate) to **server-side** measurement (PostgREST/pg_stat_statements, Edge Function timing → Logflare).

### 2.4 No correlation ID reaches the server; INFO logs dropped in prod — LOW/MEDIUM
`src/core/api/ApiClient.ts` generates a `correlationId` per call but only `logger.debug`s it (`:44,:77,:104`) — and `logger.ts:21` sets prod level to `WARN`, so DEBUG/INFO are discarded. The id is never sent as a request header, so client and server logs can't be joined.

**Fix:** Attach `x-correlation-id` to Supabase/RPC requests and read it in Edge Functions / include it in structured logs, so a single user action is traceable end-to-end. Keep INFO in prod for an audit trail (ship to Logflare, not console).

### 2.5 Duplicate global error-handler boots — LOW
`src/boot/core.ts` and `src/boot/error-handler.ts` both set `app.config.errorHandler` and register `unhandledrejection`. Whichever boots last wins; the other's side effects double-fire the rejection path. Consolidate into one.

---

## Summary of Findings

| # | Severity | Area | Location |
|---|----------|------|----------|
| 1 | HIGH | AI/EOD/forecast run synchronously in browser | `src/modules/ai/services/ai.service.js:25` |
| 2 | HIGH | Client-side blocking PDF/Excel gen; `report-generator` fn unused | `src/services/exportService.ts`, `supabase/functions/report-generator` |
| 3 | HIGH | No centralized error tracking (no Sentry/Logflare) | `src/core/logging/logger.ts`, `src/core/errors/ErrorHandler.ts` |
| 4 | MEDIUM | Notification outbox never drained/cleaned (no cron/worker) | `supabase/critical_fix_04_notification_outbox.sql:100` |
| 5 | MEDIUM | Edge Functions have no error sink (console.error only) | `supabase/functions/*` |
| 6 | MEDIUM | In-memory metrics never exported/scraped; alerts in-tab only | `src/core/monitoring/metrics.js:234` |
| 7 | MEDIUM | No message queue (pgmq); thin cron coverage | `supabase/*.sql` |
| 8 | LOW | Correlation ID not propagated to server; INFO dropped in prod | `src/core/api/ApiClient.ts`, `logger.ts:21` |
| 9 | LOW | Duplicate global error-handler boots | `src/boot/core.ts`, `src/boot/error-handler.ts` |

**Top 3 to fix for enterprise readiness:** (1) add Sentry for client + Edge Functions, (2) move report/AI/EOD generation off the main thread (Edge Function + `pg_cron`/`pg_net`), (3) schedule the already-built notification outbox drain + cleanup.
