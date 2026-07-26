# Pillar 1 — Security & Access Control (Enterprise-Readiness Audit)

**Project:** Seven Waves Restaurant ERP (Quasar 2 / Vue 3 SPA + Supabase / PostgreSQL 17)
**Auditor:** Security agent (read-only, Task #78)
**Date:** 2026-07-24
**Scope:** (1) API Rate Limiting & Throttling, (2) RBAC strictness — with the enterprise test that *real enforcement must be server-side*, not UI-hidden.
**Method:** Static source review. **Live DB state could not be verified** — the Supabase MCP connection was unavailable this session (project token is a placeholder, per prior sessions #73/#77). Findings tagged "pending live verification" require a human to confirm against the running database.

---

## Verdict

| Area | Enterprise-ready? | Summary |
|------|-------------------|---------|
| Server-side RBAC (RLS) | ❌ **Not confirmed / likely broken** | The RLS lockdown that backs RBAC is authored but **listed as PENDING (unapplied)**. Until applied and verified live, server-side access control is effectively **unenforced**. |
| Client route/permission guards | ⚠️ Good UX, **advisory only** | Well-structured guards in `src/boot/auth.ts`, but client-side — cannot be the control. |
| API rate limiting (login) | ⚠️ Partial | App limiter is client-side/cosmetic; mitigated only by Supabase GoTrue platform limits. |
| API rate limiting (mutations / edge fns) | ❌ **Missing server-side** | No throttle on PostgREST or edge functions (AI cost DoS, payment endpoints). |
| API rate limiting (public QR/kiosk orders) | ✅ **Correct** | Genuine server-side limiter (`qr_rate_limits` + `check_qr_rate_limit`). Use as the template. |

**Bottom line:** The *design* of access control is sound (RLS-first intent, in-function edge auth, forced revalidation for privileged roles), but the **critical RLS layer is not confirmed applied**, and rate limiting outside the QR order path is not enforced server-side. Not enterprise-ready until Findings #44 and #46 are closed and verified live.

---

## 1. API Rate Limiting & Throttling

### 1.1 Client-side limiter is not a security control — MEDIUM (Finding #46)
`src/core/security/rateLimiter.js` implements a token-bucket limiter with sensible presets:

```
src/core/security/rateLimiter.js:18-29
login: 5/5min (15min lockout), api_mutation: 30/min, api_read: 100/min,
ai_request: 10/min, voucher_post: 10/min, report_export: 5/5min, ...
```

But state lives in **in-memory JS `Map`s in the browser** (`buckets`, `lockouts`, `failedAttempts` — `rateLimiter.js:11-13`). Consequences:

- Resets on page reload; per-tab; not shared across devices.
- **Fully bypassed** by calling Supabase PostgREST / edge functions directly (e.g. `curl` with a valid JWT). The limiter code never runs on the server.
- Therefore provides **no real protection** for `api_mutation`, `api_read`, `ai_request`, `voucher_post`, `report_export`, `file_upload`.

It *is* wired into login (`src/stores/auth.ts:348, 371, 383` for email; `:439, 473, 502, 513` for user-code), which is good UX, but the only server guarantee for login brute-force is **Supabase GoTrue's platform-level rate limits** on the `/token` endpoint — the app limiter adds nothing enforceable.

**Fix:** Keep the client limiter for UX only and label it as such. Enforce real limits server-side (see §1.3 pattern). Cap `ai-gemini-service` tightly server-side to bound external cost.

### 1.2 Edge functions have no throttling — MEDIUM (part of Finding #46)
`supabase/functions/*/index.ts` correctly enforce **JWT + RBAC in-function** (e.g. `payment-terminal-charge/index.ts:69-94` `requireStaff()`; `ai-gemini-service/index.ts:8-42` verifies JWT + `ACTION_PERMISSIONS`). This part is solid and above baseline.

However **none of them rate-limit**. A user who legitimately holds the required role can hammer:
- `ai-gemini-service` — each call incurs **external Gemini API cost** → financial/quota DoS.
- `payment-terminal-charge`, `payroll-processor`, `report-generator`, `send-payslip` — expensive/side-effecting.

There is no `supabase/config.toml`, so functions rely on the platform default `verify_jwt=true` plus their in-function checks — no per-user throttle anywhere.

**Fix:** Add a shared-store limiter at the top of each handler (Postgres `rate_limits` table via service role, or Deno KV / Upstash), reusing the `check_qr_rate_limit` idea. Suggested: `ai-gemini-service` 10/min/user; payment endpoints 20/min/user.

### 1.3 Public QR/kiosk order path IS correctly rate-limited — ✅ (reference implementation)
`supabase/fix_rate_limit_enforcement.sql` wires a **server-side** limiter into the two anon-callable order RPCs:

```
create_kiosk_order        → check_qr_rate_limit(table_id,'create_order',10)  (fix_rate_limit_enforcement.sql:34-41)
create_order_from_session → check_qr_rate_limit(table_id,'create_order',10)  (:177-184)
```

Backed by the `qr_rate_limits` table + `check_qr_rate_limit()` RPC (deployed in `erp_security_lockdown.sql`). This is the **correct pattern** — enforced in `SECURITY DEFINER` RPCs, keyed server-side, prices resolved from the DB (never the client). Generalize this to the endpoints in §1.1/§1.2.

> Note: this file appears in the "already applied" backfill list of `applied_migrations_ledger.sql`, so QR order throttling is presumed live — **confirm** with `SELECT * FROM qr_rate_limits LIMIT 1;` and a `check_qr_rate_limit('x','create_order',0)` probe.

### 1.4 No gateway / WAF layer
PostgREST offers no per-user request throttle beyond Supabase platform defaults. An enterprise deployment should add coarse IP-based limits (Netlify/Cloudflare WAF) on the auth and function endpoints as defense-in-depth.

---

## 2. RBAC Strictness

### 2.1 The critical gap — RLS lockdown is PENDING, not applied — CRITICAL (Finding #44)
RBAC in this stack is only *truly* enforced by **Postgres RLS**. `supabase/applied_migrations_ledger.sql:130-190` explicitly lists as **PENDING (not yet applied)**:

- **`fix_missing_rls_policies.sql`** — RLS for `user_roles`, `profiles`, `journal_entries`/finance, **payroll/salary**, AI tables, `customer_sessions`, loyalty, `audit_logs`, uom.
- **`fix_rls_missing_tables.sql`** — RLS for **15 base operational tables with no policies at all**: `kitchens, restaurant_tables, categories, menu_items, ingredients, recipes, stock_movements, payments, order_items, kot_tickets, kot_items, order_status_logs, roles, role_permissions, user_branches`.
- `security_lockdown_apply.sql` (the #38/#34/#35 delta) — depends on the two above.

Prior team sessions (#73, #77) confirm the Supabase MCP was disabled, so **nothing was applied live**. If that is still true, then:

- `user_roles` without RLS → **privilege self-escalation** (a user grants themselves `admin`).
- `payments`, finance, **salary/payroll** tables without RLS → any authenticated user reads/writes them directly via PostgREST.
- The Vue route guards below are **client-side only** and provide **zero** server enforcement.

I **could not verify** whether these were applied in a later session (MCP unavailable). This is the single most important item to confirm.

**Fix / verification (human, Supabase SQL Editor):** apply in order — `erp_security_lockdown.sql` → `fix_missing_rls_policies.sql` → `fix_rls_missing_tables.sql` → `fix_price_and_discount_security.sql` → `security_lockdown_apply.sql`, then run `supabase/qa_verify_lockdown.sql`. Confirm live:

```sql
-- Every sensitive public table must be true:
SELECT tablename, rowsecurity FROM pg_tables
 WHERE schemaname='public' AND rowsecurity=false ORDER BY tablename;
-- Tables with RLS on but not forced (owner/definer bypass risk):
SELECT relname FROM pg_class WHERE relrowsecurity AND NOT relforcerowsecurity;
-- Policy count per table:
SELECT schemaname, tablename, count(*) FROM pg_policies
 WHERE schemaname='public' GROUP BY 1,2 ORDER BY 3;
```

### 2.2 Route guards are well-built but advisory-only — LOW (Finding #47)
`src/boot/auth.ts:91-225` implements a layered `router.beforeEach`:
- requiresAuth → login redirect (`:100`).
- Pure-manager hard redirect to `/manager-app` (`:113-130`).
- Role sets (parent ∧ child) must all be satisfied (`:137-160`).
- **Forced server revalidation for privileged roles** when `rolesVerified` is false (`:145-151`) — a genuinely good hardening (`C7`).
- `hasPermission` (`:168-173`), `hasModuleAccess` (`:181-185`), legacy `canAccessRoute` (`:189-191`).
- Branch-access guard (`:201-221`).

Roles themselves are sourced from the DB (`user_roles`), so the *identity* is server-authoritative. **But** the permission/module/route decisions execute in the browser and can be edited at runtime or skipped by calling the API directly. They are correct as UX gating; they are **not** a security control. Their soundness depends entirely on §2.1 RLS being live.

Additionally, the role→permission matrix is **duplicated**: `src/core/rbac/permissions.ts:23-71` (`ROLE_DEFAULT_PERMISSIONS`) and `src/config/roles.ts:18-72` hardcode grants that also live in the DB (`role_permissions`) → drift hazard.

**Fix:** Treat client RBAC as UX only; ensure every gated action has a matching RLS/`SECURITY DEFINER` check. Prefer deriving the client permission list from the DB on login (single source of truth) and add a CI diff test against the DB seed.

### 2.3 New WIP file weakens audit-log access control — HIGH (Finding #45)
`supabase/fix_login_audit_logs_rls.sql` (uncommitted) sets:

```
:29-32  FOR SELECT TO authenticated USING (true)   -- every logged-in user reads ALL rows
:25-27  FOR INSERT TO authenticated, anon WITH CHECK (true)
:34     GRANT ALL ON public.login_audit_logs TO authenticated, anon
```

Impact:
- **Any** authenticated user (waiter, kitchen) can read the entire login audit table → admin/manager **emails, full names, roles, IP addresses, device fingerprints** (PII + reconnaissance).
- **anon** can forge/pollute audit rows (log injection, defeats the audit trail).
- `GRANT ALL` permits **UPDATE/DELETE** by authenticated users → an attacker can erase/tamper their own login evidence.

**Fix:** `SELECT USING (is_admin())`; scope INSERT (`WITH CHECK (user_id = auth.uid())` for authenticated; route pre-auth logging through a `SECURITY DEFINER` RPC rather than an anon INSERT grant); replace `GRANT ALL` with `GRANT INSERT` only; make the table append-only (trigger blocking UPDATE/DELETE).

### 2.4 Permission-matching logic — OK
`hasPermission()` (`permissions.ts:80-109`): admin `*` bypass, explicit DB perms first, then wildcard prefix match (`pos.*` ⊇ `pos.order.void`). Logic is correct and does not over-grant. `canAccessRoute()` (`roles.ts:1343-1370`) is roles-first then additive permissions — reasonable. No issues in the matching itself; the concern is *where* it runs (client) — see §2.2.

---

## Prioritized Action List

| # | Sev | Item | Owner |
|---|-----|------|-------|
| 44 | 🔴 CRITICAL | Apply + verify RLS lockdown live (`fix_missing_rls_policies.sql`, `fix_rls_missing_tables.sql`, deltas). Until then RBAC is unenforced. | Human + DBA |
| 45 | 🟠 HIGH | Fix `login_audit_logs` RLS: admin-only SELECT, scoped INSERT, no UPDATE/DELETE, drop `GRANT ALL`. | DBA |
| 46 | 🟡 MEDIUM | Add server-side rate limiting to edge functions (esp. `ai-gemini-service`) + sensitive RPCs; reuse `check_qr_rate_limit` pattern. | Backend/DBA |
| 47 | 🟢 LOW | Single-source the RBAC matrix (derive client perms from DB); document client guards as UX-only; CI drift test. | Frontend/Backend |

## What is already good (keep)
- Edge functions enforce JWT + RBAC **in-function**, not just via platform gate (`payment-terminal-charge`, `ai-gemini-service`). Server-side amount resolution / Vault secrets on payments.
- Forced re-validation of privileged roles in the route guard before granting access.
- Server-side rate limiting on the public QR/kiosk order RPCs — the correct model to generalize.
- Roles sourced from the DB (`user_roles`); prices/totals resolved server-side (per prior #38 work).

---
*Read-only audit — no source files were modified. Live-DB items require human verification (Supabase MCP was unavailable this session).*
