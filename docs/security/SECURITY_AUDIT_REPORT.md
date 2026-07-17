# Security Audit Report — Seven Waves Restaurant ERP
**Auditor:** Security Agent  
**Date:** 2026-07-16  
**Scope:** Full codebase + Supabase SQL layer  
**Project:** `clykwuzajtwvwuavmtzs` (ap-northeast-2)

---

## Executive Summary

The security posture of Seven Waves ERP is **partially hardened but has critical unapplied fixes**. The codebase contains well-written security infrastructure (`erp_security_lockdown.sql`, `phase1_security_crm.sql`, `inputSanitizer.js`, `sessionGuard.ts`, `rateLimiter.js`), but a comprehensive RLS fix file (`fix_missing_rls_policies.sql`) that addresses 8 critical/high vulnerabilities has been written to disk and **never applied to the Supabase database**.

**Critical action required:** Apply `supabase/fix_missing_rls_policies.sql` via Supabase Dashboard SQL editor immediately.

---

## Finding Summary

| # | Severity | Title | Status |
|---|----------|-------|--------|
| F-01 | CRITICAL | `fix_missing_rls_policies.sql` not applied to DB | **OPEN — needs manual apply** |
| F-02 | CRITICAL | `journal_entries`/`journal_lines` — no RLS | **OPEN (fixed by F-01)** |
| F-03 | CRITICAL | Finance module blanket `authenticated=ALL` policies | **OPEN (fixed by F-01)** |
| F-04 | HIGH | `audit_logs` INSERT open to any authenticated user | **OPEN (fixed by F-01)** |
| F-05 | HIGH | `companies`/`branches` tables — no RLS | **OPEN (fixed by F-01)** |
| F-06 | HIGH | `user_roles` missing admin INSERT/UPDATE/DELETE | **OPEN (fixed by F-01)** |
| F-07 | HIGH | AI insight tables fully public (`USING true`) | **OPEN (fixed by F-01)** |
| F-08 | MEDIUM | Supabase MCP token placeholder in `.mcp.json` | **OPEN** |
| F-09 | INFO | Auth cache TTL — was 24h, fixed to 5min | **FIXED** (P0-1) |
| F-10 | INFO | Payment confirmation not client-callable | **FIXED** (by design) |
| F-11 | INFO | Input sanitizer + rate limiter wired in auth store | **FIXED** |

---

## Detailed Findings

### F-01 [CRITICAL] — `fix_missing_rls_policies.sql` Not Applied

**File:** `supabase/fix_missing_rls_policies.sql` (957 lines, generated 2026-06-23)  
**Impact:** All 8 vulnerabilities below remain live in production.

**Immediate fix:**
```sql
-- Paste the contents of supabase/fix_missing_rls_policies.sql into
-- the Supabase Dashboard → SQL Editor and run it.
-- Then track it in the ledger:
INSERT INTO public.applied_migrations (filename, notes)
VALUES ('fix_missing_rls_policies.sql', 'Security: fix 19 missing/permissive RLS policies across finance, AI, RBAC, audit tables')
ON CONFLICT (filename) DO NOTHING;
```

---

### F-02 [CRITICAL] — `journal_entries` / `journal_lines` Have No RLS

**Location:** `supabase/finance_integration.sql` (table creation — no RLS)  
**Fix in:** `fix_missing_rls_policies.sql` Section 6

The financial double-entry ledger was created with no `ENABLE ROW LEVEL SECURITY`. Any authenticated user — waiter, kitchen staff, delivery rider — can:
- **READ** all journal entries across all branches and companies (revenue, tax, discounts)
- **INSERT** fake accounting records
- **DELETE** posted entries (bypassing the immutability trigger via direct table access)

**Risk:** Financial fraud, data tampering, regulatory non-compliance.

**Fix (already written in `fix_missing_rls_policies.sql:222-278`):**
```sql
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines   ENABLE ROW LEVEL SECURITY;

CREATE POLICY je_admin ON public.journal_entries FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY je_finance ON public.journal_entries FOR SELECT
  USING (is_finance() AND (branch_id IS NULL OR branch_id = ANY(auth_branch_ids())));
CREATE POLICY je_manager ON public.journal_entries FOR SELECT
  USING (is_manager() AND branch_id = ANY(auth_branch_ids()));
-- (journal_lines same pattern via parent join)
```
Inserts by authenticated users are blocked (no INSERT policy). `post_accounting_from_order()` is `SECURITY DEFINER` so it bypasses RLS correctly.

---

### F-03 [CRITICAL] — Finance Module Blanket `authenticated=ALL` Policies

**Location:** `supabase/migrations/20260323_finance_module_schema.sql` and `20260518_finance_department_rearchitecture.sql`  
**Affected tables:** `chart_of_accounts`, `fiscal_periods`, `bank_accounts`, `cash_transactions`, `customer_receivables`, `expense_categories`, `expense_entries`, `tax_codes`, `tax_transactions`, `finance_documents`, `payment_allocations`, `finance_audit_logs`, `finance_ledgers`, `finance_accounts`, `finance_vouchers`, `finance_voucher_lines`, `finance_cashbook_entries`, `finance_petty_cash_entries`, `finance_cheques`, `finance_bank_reconciliations`, `payroll_records`, `payroll_cycles`, `payroll_line_items`

All these tables have RLS enabled but all policies use:
```sql
FOR ALL USING (auth.role() = 'authenticated')
```
This grants every authenticated user — regardless of role or branch — full read/write/delete access to all financial data across all tenants.

**Risk:** A delivery rider or waiter can read all salary records, delete vouchers, and modify bank reconciliations.

**Fix:** `fix_missing_rls_policies.sql` Sections 8–11 drop these policies and replace them with role-scoped (`is_finance()`, `is_hr()`, `is_admin()`) and company/branch-scoped variants. `payroll_records` also gains a `prc_self` policy so employees can read their own payslips.

---

### F-04 [HIGH] — `audit_logs` INSERT Open to Any Authenticated User

**Location:** `supabase/erp_security_lockdown.sql:119`  
```sql
CREATE POLICY al_system_insert ON audit_logs FOR INSERT
  WITH CHECK (true);   -- triggers insert as the row owner; SECURITY DEFINER bypasses
```
The comment is incorrect — `WITH CHECK (true)` with no `TO` role clause applies to ALL roles including `authenticated`. Any logged-in user can INSERT directly into `audit_logs` to:
- Inject fake audit events (e.g., covering a deletion)
- Flood the audit log table
- Impersonate other users in audit records (since `user_id` is not validated)

**Fix (`fix_missing_rls_policies.sql:786-791`):**
```sql
DROP POLICY IF EXISTS al_system_insert ON public.audit_logs;
CREATE POLICY al_system_insert ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
```
`SECURITY DEFINER` triggers run as `service_role` and bypass RLS — they continue to work.

---

### F-05 [HIGH] — `companies` / `branches` Tables Have No RLS

**Location:** `supabase/schema.sql:13` (companies), `supabase/schema.sql:29` (branches)

These root multi-tenant tables have no `ENABLE ROW LEVEL SECURITY`. Any authenticated user can:
- Read all companies and branches across all tenants
- UPDATE company name, address, phone
- DELETE branches (cascade-deletes orders, employees, KOT data)

**Fix (`fix_missing_rls_policies.sql:32-87`):** Adds `comp_admin`, `comp_self_read`, `br_admin`, `br_manager_read`, `br_staff_read` policies. Uses new `get_user_company_id()` helper.

---

### F-06 [HIGH] — `user_roles` Missing Admin INSERT/UPDATE/DELETE

**Location:** `supabase/rbac_rls.sql:82-94`

`rbac_rls.sql` defines only `SELECT` policies for `user_roles` and `user_branches`. No `INSERT`, `UPDATE`, or `DELETE` policy exists for the admin role. Result:
- Admins cannot assign roles to users via direct table writes → role assignment UI fails
- No authenticated user can INSERT a `user_role` row (blocked by RLS default-deny), which may be the current workaround (service_role only), but is not intentionally documented

**Fix (`fix_missing_rls_policies.sql:895-904`):**
```sql
CREATE POLICY user_roles_manage_admin ON public.user_roles FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY user_branches_manage_admin ON public.user_branches FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
```

---

### F-07 [HIGH] — AI Insight Tables Fully Public

**Location:** `supabase/migrations/` (AI module tables)  
**Affected:** `ai_insights`, `ai_forecasts`, `ai_recommendations`, `ai_anomaly_events`, `ai_prompt_logs`

Policies use `USING (true)` on SELECT and `WITH CHECK (true)` on INSERT/UPDATE. Any authenticated user can:
- Read all AI forecasts and anomaly events for all branches (business intelligence leak)
- Read `ai_prompt_logs` which contains raw prompts that may include order data, customer names, or financial figures
- Insert fake AI insights or recommendations to manipulate management decisions

**Fix (`fix_missing_rls_policies.sql:833-883`):** Admin/manager full access; branch-scoped staff SELECT; `service_role`-only INSERT for AI engine; `ai_prompt_logs` admin SELECT only.

---

### F-08 [MEDIUM] — Supabase MCP Token Placeholder in `.mcp.json`

**Location:** `.mcp.json:6`

```json
"--access-token", "PASTE_YOUR_SUPABASE_PERSONAL_ACCESS_TOKEN_HERE"
```

The project-level `.mcp.json` has a placeholder. The real token is stored in the user-level `~/.claude/settings.json`. This means:
1. Supabase MCP is disabled in the project context (SQL cannot be executed via MCP tooling)
2. If a developer replaces the placeholder with a real token and commits, the token leaks to git history

**Fix:** Ensure `.mcp.json` is in `.gitignore`, or replace the token value with a reference to an environment variable. Verify the user-level MCP config is active.

---

## What's Already Secure

### Database Layer
- `erp_security_lockdown.sql` — applied ✓
  - `anon` role revoked from `orders`, `order_items`, `kot_tickets`, `kot_items`
  - Finance RLS for `invoices`, `payments`, `ap_invoices`, `supplier_payments` — role-scoped ✓
  - HR/Payroll RLS for `employees`, `payroll_runs`, `payslips` — role + branch scoped ✓
  - Audit trigger `audit_record()` on 18 sensitive tables ✓
  - Rate limiting via `qr_rate_limits` + `check_qr_rate_limit()` RPC ✓
  - `user_permissions` table with per-user override — admin-only write ✓

- `phase1_security_crm.sql` — applied ✓
  - `login_attempts` — admin SELECT only, system INSERT ✓
  - `device_sessions` — own + admin ✓
  - `security_events` — admin only ✓
  - `session_tokens` — own + admin ✓
  - `customers`/`loyalty_accounts`/`loyalty_transactions` — role-scoped ✓

- `critical_fix_02_finance_safety.sql` — applied ✓
  - Double-entry validation trigger on `journal_entries` ✓
  - Immutability: blocks edits on posted journals ✓
  - Accounting period locking (`close_accounting_period()` RPC — admin only) ✓

- `CRITICAL_fix_revoke_anon_functions.sql` — applied ✓
  - Anon access to operational RPCs revoked ✓

- `rls_customer_session_hardening.sql` — applied ✓
  - Customer session RLS hardened ✓

- `fix_shift_payment_ownership.sql` — applied ✓

### Frontend Layer

- **Auth cache TTL:** 5 minutes (`src/stores/auth.ts:112`) — revoked users locked out within 5 min ✓
- **Login brute-force:** 5 attempts → 15-minute lockout (`src/stores/auth.ts:82-84`) ✓
- **Input sanitizer:** XSS, SQLi, prompt injection detection (`src/core/security/inputSanitizer.js`) ✓
- **Session guard:** 1-minute check interval, 5-minute expiry warning (`src/core/security/sessionGuard.ts`) ✓
- **Rate limiter:** Client-side + server-side (`src/core/security/rateLimiter.js` + `check_qr_rate_limit` RPC) ✓
- **Payment security:** No client-side payment confirmation — all payment confirmation goes through Edge Function with HMAC signature verification (`src/services/paymentService.js:33-38`) ✓
- **CSP headers:** `netlify.toml` — production-grade CSP, HSTS, X-Frame-Options ✓ (confirmed by DevOps)
- **TypeScript route guards:** `@ts-ignore` removed, `RouteMeta` properly typed ✓ (P0-2)

---

## Remaining Security Backlog (Post-Fix)

| Priority | Item |
|----------|------|
| P1 | Add `salary_structures` table RLS (not found in any SQL file — likely missing) |
| P1 | Apply `fix_missing_rls_policies.sql` — **blocks all other P1 items** |
| P2 | Add Sentry error monitoring to capture security exceptions in prod |
| P2 | Implement login_attempts persistence to DB (currently in-memory only — resets on page refresh) |
| P2 | CSP `nonce` or `hash` for inline scripts (currently `unsafe-inline` in some directives) |
| P3 | Rotate Supabase anon key and service_role key periodically |
| P3 | Add `pg_audit` extension for PostgreSQL-level query logging |
| P3 | JWT short expiry (Supabase default is 1hr — reduce to 15min for high-privilege roles) |

---

## How to Apply the Critical Fix

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs) → **SQL Editor**
2. Paste the full contents of `supabase/fix_missing_rls_policies.sql`
3. Click **Run** — the script is idempotent (`DROP POLICY IF EXISTS`, `DO $$ IF EXISTS $$` blocks)
4. After successful run, add to the ledger:
   ```sql
   INSERT INTO public.applied_migrations (filename, notes)
   VALUES (
     'fix_missing_rls_policies.sql',
     'Security: 19-section RLS hardening — finance blanket policies replaced, journal RLS added, audit_logs insert restricted, companies/branches RLS, user_roles admin manage, AI tables scoped'
   ) ON CONFLICT (filename) DO NOTHING;
   ```
5. Verify with the verification queries at the bottom of `fix_missing_rls_policies.sql:947-956`

---

*Report generated by Security Agent — Seven Waves ERP Team*
