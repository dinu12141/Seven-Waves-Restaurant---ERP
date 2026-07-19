# Seven Waves Restaurant ERP — Security Design

> **Document type:** Security Architecture & Controls Reference
> **Status:** Current — reflects security implementation as of 2026-07-18
> **Author:** SysAdmin Agent
> **Applies to:** Seven Waves ERP (Quasar 2 SPA + Supabase), all deployment targets (Web, PWA, Electron, Tauri)
> **Supabase project:** `clykwuzajtwvwuavmtzs` (ap-northeast-2)

---

## Table of Contents

1. [Security Architecture Overview](#1-security-architecture-overview)
2. [Authentication Design](#2-authentication-design)
3. [Session Management](#3-session-management)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Database Security (RLS & SECURITY DEFINER)](#5-database-security-rls--security-definer)
6. [API Security](#6-api-security)
7. [Input Validation & Sanitization](#7-input-validation--sanitization)
8. [Rate Limiting](#8-rate-limiting)
9. [Network Security & HTTP Headers](#9-network-security--http-headers)
10. [Data Protection & Encryption](#10-data-protection--encryption)
11. [Secrets Management](#11-secrets-management)
12. [Audit Logging & Security Monitoring](#12-audit-logging--security-monitoring)
13. [Multi-Tenancy Isolation](#13-multi-tenancy-isolation)
14. [Payment Security](#14-payment-security)
15. [Electron / Desktop Security](#15-electron--desktop-security)
16. [QR / Kiosk / Customer-Facing Security](#16-qr--kiosk--customer-facing-security)
17. [Known Risks & Mitigations](#17-known-risks--mitigations)
18. [Security Checklist — Pre-Production](#18-security-checklist--pre-production)

---

## 1. Security Architecture Overview

Seven Waves ERP is a **client-heavy SPA with no traditional application server**. The client (Vue 3 / Quasar) communicates directly with Supabase (PostgreSQL 17) via the Supabase JS SDK. All security enforcement is split across two layers:

```
┌─────────────────────────────────────────────────────┐
│  Client Layer (Vue 3 / Quasar)                      │
│  ┌───────────────┐  ┌──────────────┐                │
│  │ Route Guards  │  │ RBAC Helper  │                │
│  │ (auth.ts)     │  │ permissions  │                │
│  │               │  │ .ts          │                │
│  └───────────────┘  └──────────────┘                │
│  ┌───────────────┐  ┌──────────────┐                │
│  │ Rate Limiter  │  │ Input        │                │
│  │ (rateLimiter) │  │ Sanitizer    │                │
│  └───────────────┘  └──────────────┘                │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS / WSS (TLS 1.3)
                           │ Supabase JS SDK (PKCE auth)
┌──────────────────────────▼──────────────────────────┐
│  Supabase Layer (PostgreSQL 17 + PostgREST)         │
│  ┌───────────────┐  ┌──────────────┐                │
│  │ Row Level     │  │ Auth Helper  │                │
│  │ Security (RLS)│  │ Functions    │                │
│  │               │  │ is_admin()   │                │
│  └───────────────┘  └──────────────┘                │
│  ┌───────────────┐  ┌──────────────┐                │
│  │ SECURITY      │  │ Audit Logs   │                │
│  │ DEFINER RPCs  │  │ (triggers)   │                │
│  └───────────────┘  └──────────────┘                │
└─────────────────────────────────────────────────────┘
```

**Security principle:** Client-side controls are UX guards; database-layer (RLS + SECURITY DEFINER) is the enforcement boundary. Any attacker with network access to the Supabase endpoint must be stopped at the DB layer.

---

## 2. Authentication Design

### 2.1 Auth Provider

All authentication is handled by **Supabase Auth** (GoTrue server). The application does not implement its own auth or store passwords.

| Property | Value |
|----------|-------|
| Auth method | Email + Password (primary); Magic Link (planned) |
| OAuth flow | **PKCE** (Proof Key for Code Exchange) |
| Token type | JWT (RS256, signed by Supabase) |
| Access token TTL | 1 hour (Supabase default) |
| Refresh token TTL | 30 days |
| Refresh strategy | Silent refresh via `onAuthStateChange` hook |

### 2.2 Supabase Client Initialization

**File:** `src/boot/supabase.ts`

```typescript
createClient(url, anonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',           // PKCE — prevents authorization code interception
  },
  realtime: {
    reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),  // exponential backoff
  },
})
```

### 2.3 Boot Sequence

1. `supabase.ts` — Supabase client singleton created
2. `auth.ts` — `authStore.initialize()` called:
   - Calls `supabase.auth.getSession()` to restore session
   - Loads user roles + permissions from `user_roles` table
   - Caches to `localStorage` with 5-minute TTL (see §3)
   - Registers `onAuthStateChange` listener for token refresh events
3. Route guards registered — check `requiresAuth`, `roles[]`, `module`, `permission` on route meta

### 2.4 Route Guard Flow

```
Navigation request
  │
  ├─► requiresAuth? → No → allow
  │
  ├─► Session valid? → No → redirect /auth/login
  │
  ├─► Route meta.roles[] → check against user.roles → fail → 403 page
  │
  ├─► Route meta.module → hasModuleAccess(roles, module) → fail → 403
  │
  └─► Route meta.permission → hasPermission(roles, perm, userPerms) → fail → 403
```

### 2.5 Inactivity Timer

`src/boot/auth.ts` registers a 30-minute inactivity timer. On expiry:
- `authStore.logout()` is called
- Session cleared from localStorage
- User redirected to `/auth/login`

---

## 3. Session Management

### 3.1 Auth Cache

To avoid 3 DB round-trips on every page refresh, auth metadata (roles, permissions, branch IDs) is cached in `localStorage`:

| Key | Content | TTL |
|-----|---------|-----|
| `sw_auth_cache` | `{ roles, permissions, branchIds, cachedAt }` | **5 minutes** |

Cache is invalidated and reloaded from DB when TTL expires or on `onAuthStateChange` event.

**Security note:** The cache stores roles/permissions metadata, not the JWT. The JWT is managed by Supabase SDK in its own storage key and is the actual bearer credential.

### 3.2 Session Storage Isolation

| Target | Session storage |
|--------|----------------|
| Web / PWA | `localStorage` (same-origin only) |
| Electron | `localStorage` in renderer (Electron context isolation enforced — see §15) |
| Tauri | `localStorage` in WebView |

### 3.3 Multi-Session / Multi-Role

Waiters, cashiers, and kitchen staff may share a physical device. The system handles this via:
- Device login: kitchen/cashier devices use dedicated device accounts (managed via `src/modules/devices/`)
- Role isolation: each device account has exactly one operational role
- Session guard (`src/core/security/sessionGuard.ts`) detects cross-tab session hijacking

### 3.4 QR / Customer Sessions

Customer self-order uses a separate, anonymous session mechanism:
- QR token → `get_or_create_session_by_qr(token)` RPC
- RPC returns a `session_token` stored in `localStorage` as `tm_session_token`
- Not a Supabase Auth session — custom token column in `table_sessions` table
- RLS policies on customer-facing tables check `table_sessions.session_token` via `rls_customer_session_hardening.sql`

---

## 4. Role-Based Access Control (RBAC)

### 4.1 Role Hierarchy

```
admin
  └─► Full access to all modules, branches, companies

manager
  ├─► All operational roles' permissions within their branches
  └─► PWA redirect: /manager-app (MainLayout blocked)

waiter | cashier | kitchen | delivery | inventory | finance | hr | procurement
  └─► Module-scoped access; branch-scoped data
```

### 4.2 Permission Format

`{module}.{resource}.{action}`

Examples:
- `pos.order.create`
- `pos.order.void`
- `finance.journal.create`
- `inventory.stock.adjust`
- `hr.payroll.view`

### 4.3 Client-Side Enforcement

**File:** `src/core/rbac/permissions.ts`

```typescript
hasPermission(roles: string[], permKey: string, userPerms: string[]): boolean
hasModuleAccess(roles: string[], module: string): boolean
```

Used in:
- Route meta guards (`src/boot/auth.ts`)
- Component `v-if` conditionals (e.g., void button only shown to cashier/admin)
- `usePermission()` composable for reactive permission checks

### 4.4 Database-Layer Enforcement

Auth helper functions (defined in `supabase/auth_has_role.sql` + `supabase/erp_security_lockdown.sql`):

| Function | Returns | Usage |
|----------|---------|-------|
| `is_admin()` | boolean | Admin-only operations |
| `is_manager()` | boolean | Manager+ operations |
| `auth_has_role(role_name)` | boolean | Single-role check |
| `auth_is_on_shift(branch_id)` | boolean | Shift-gated waiter policies |
| `auth_branch_ids()` | uuid[] | Branch-scoped data filter |
| `auth_kitchen_ids()` | uuid[] | Kitchen-scoped KOT filter |
| `is_finance()` | boolean | Finance module access |
| `is_hr()` | boolean | HR module access |
| `is_inventory()` | boolean | Inventory module access |

All functions use `auth.uid()` from the current JWT — they cannot be spoofed by client-supplied data.

### 4.5 Role Storage

Roles are stored in `public.user_roles(user_id, role, branch_id)`. RLS on `user_roles` restricts:
- SELECT: own record + admin/manager
- INSERT/UPDATE/DELETE: admin only

---

## 5. Database Security (RLS & SECURITY DEFINER)

### 5.1 Row Level Security

Every table in `public` schema must have RLS enabled. The policy pattern:

```sql
-- Enable RLS
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

-- Least-privilege policies (examples)
CREATE POLICY <table>_admin ON public.<table> FOR ALL USING (is_admin());
CREATE POLICY <table>_role  ON public.<table> FOR SELECT
  USING (auth_has_role('finance') AND branch_id = ANY(auth_branch_ids()));
```

**Files containing RLS policy definitions:**
- `supabase/rls_restaurant_flow.sql` — core operational tables
- `supabase/rbac_rls.sql` — RBAC tables
- `supabase/fix_missing_rls_policies.sql` — audit-remediation batch (19 sections)
- `supabase/rls_customer_session_hardening.sql` — customer/kiosk tables
- `supabase/erp_security_lockdown.sql` — security lockdown

### 5.2 SECURITY DEFINER Functions

Functions that must bypass RLS (e.g., to write to journal_entries on behalf of a waiter) use `SECURITY DEFINER`. All such functions must:

1. Set `search_path = public, pg_temp` to prevent search path injection
2. Validate caller via `auth.uid()` and explicit role checks at the top of the function
3. Never expose the function to `anon` role

```sql
CREATE OR REPLACE FUNCTION public.process_payment(...)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  -- Explicit caller validation
  IF NOT auth_has_role('cashier') AND NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- ... business logic
END;
$$;

-- Revoke from public, grant only to authenticated
REVOKE ALL ON FUNCTION public.process_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_payment TO authenticated;
```

**Bulk search_path fix:** `supabase/fix_all_security_definer_search_path.sql` — patches all ~206 SECURITY DEFINER functions.

### 5.3 Anonymous Role Policy

`supabase/CRITICAL_fix_revoke_anon_functions.sql` and `erp_security_lockdown.sql` enforce:
- All RPCs: `REVOKE ALL ON FUNCTION ... FROM PUBLIC` then `GRANT ... TO authenticated`
- No table is accessible to `anon` role (not even SELECT)
- Exception: `qr_rate_limits` — accessible only via SECURITY DEFINER function, not directly

### 5.4 Critical DB Security Controls

| Control | Implementation | File |
|---------|---------------|------|
| Order status machine | `trg_validate_order_status_transition` BEFORE UPDATE trigger | `fix_order_status_machine.sql` |
| Journal immutability | Trigger blocks UPDATE/DELETE on posted entries | `fix_journal_immutability.sql` |
| Discount cap | CHECK constraint: `discount_amount <= subtotal` | `fix_order_data_integrity.sql` |
| Payment amount | CHECK constraint: `amount > 0` | `fix_order_data_integrity.sql` |
| Soft delete | `deleted_at` column + partial indexes (no hard deletes on orders) | `fix_soft_delete.sql` |
| Over-refund protection | `process_refund()` RPC validates refund ≤ original payment | `process_refund_rpc.sql` |

---

## 6. API Security

### 6.1 PostgREST API

The application uses Supabase PostgREST (auto-generated REST API over PostgreSQL). Security characteristics:

| Property | Value |
|----------|-------|
| Auth header | `Authorization: Bearer <JWT>` on every request |
| Anon key | Embedded in client bundle — public by design (scoped to anon role, which has no table access) |
| Service role key | Never embedded in client — only used in Edge Functions and CI scripts |
| RLS enforcement | Automatic for all table endpoints (SELECT, INSERT, UPDATE, DELETE) |
| RPC security | `SECURITY DEFINER` functions validate caller; `SECURITY INVOKER` functions are governed by caller's RLS context |

### 6.2 Supabase Anon Key Exposure

The anon key (`VITE_SUPABASE_ANON_KEY`) is intentionally embedded in the client bundle. This is the Supabase architecture — the key is safe to expose because:
- It only activates the `anon` PostgreSQL role
- The `anon` role has `REVOKE ALL` on all tables and functions (enforced by `erp_security_lockdown.sql`)
- JWT is required to escalate to `authenticated` role

**Action required:** Verify `erp_security_lockdown.sql` is applied on the live database before production launch.

### 6.3 API Rate Limiting

Two layers of rate limiting:

**Client-side** (`src/core/security/rateLimiter.js`):
- Sliding window counter per operation key
- Auth operations: 5 attempts / 15 minutes
- Payment operations: 10 attempts / minute
- Implemented in `authStore` and payment flows

**Database-side** (`supabase/qr_rate_limits` table):
- QR scan rate limiting via `SECURITY DEFINER` RPC
- Prevents QR token brute-force
- Rate limits stored in `qr_rate_limits` (bypasses RLS, accessible only via RPC)

---

## 7. Input Validation & Sanitization

**File:** `src/core/security/inputSanitizer.js`

All user-supplied input that will be rendered or stored passes through the sanitizer:

| Method | Purpose |
|--------|---------|
| `sanitizeHtml(str)` | Strip `<script>`, event handlers, `javascript:` URIs |
| `sanitizeForSQL(str)` | Detect SQL injection patterns (defense-in-depth — Supabase parameterizes queries) |
| `sanitizeNumber(val, opts)` | Clamp to min/max; reject NaN / Infinity |
| `sanitizeOrderItem(item)` | Validates price > 0, qty > 0, name is string |

**XSS mitigations:**
- `v-html` is avoided across all components (verified in security audit)
- `GlobalSearch.vue` — single `v-html` usage sanitized via `DOMPurify` before render
- Vue template expressions auto-escape HTML by default

**SQL injection:** Supabase SDK uses parameterized queries throughout. The sanitizer adds defense-in-depth pattern detection for when raw SQL strings might be constructed.

---

## 8. Rate Limiting

### 8.1 Client-Side Rate Limiter

**File:** `src/core/security/rateLimiter.js`

Sliding window implementation with configurable limits per operation key:

```javascript
// Auth operations — 5 attempts in 15 min window
rateLimiter.check('auth:login', { maxAttempts: 5, windowMs: 15 * 60 * 1000 })

// Payment operations — 10 per minute
rateLimiter.check('payment:process', { maxAttempts: 10, windowMs: 60 * 1000 })
```

On limit exceeded:
- Operation is blocked locally (no request sent)
- Security event logged to `src/core/security/securityLogger.js`
- User shown a `q-notify` warning with cooldown remaining

### 8.2 Supabase Auth Rate Limiting

Supabase Auth server (GoTrue) has built-in rate limiting on:
- `/auth/v1/token` (password grant): 5 req/hour per email
- `/auth/v1/otp`: 2 req/hour per email
- Magic link: configurable in Supabase dashboard

**Recommended:** Enable Supabase Auth email rate limiting in dashboard → Authentication → Rate Limits.

---

## 9. Network Security & HTTP Headers

### 9.1 HTTP Security Headers

Configured in `netlify.toml` for all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com` | Blocks XSS, restricts connections |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer data leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restricts browser APIs |

### 9.2 Transport Security

- All Supabase API calls: HTTPS (TLS 1.3 on Supabase infrastructure)
- Realtime WebSocket: WSS (encrypted)
- Netlify CDN: HTTPS enforced, HTTP → HTTPS redirect
- Electron: connects to `https://*.supabase.co` — no local unencrypted connections

### 9.3 Recommended: Cloudflare WAF

The current architecture exposes the Supabase PostgREST endpoint (`https://clykwuzajtwvwuavmtzs.supabase.co`) directly to the internet. Recommended hardening:
1. Route traffic through Cloudflare (free tier)
2. Enable rate limiting rule: >100 req/min/IP to `/rest/v1/*` → challenge
3. Enable Bot Fight Mode

---

## 10. Data Protection & Encryption

### 10.1 Data at Rest

| Layer | Encryption |
|-------|-----------|
| Supabase PostgreSQL | AES-256 encryption at rest (Supabase infrastructure, AWS RDS) |
| Supabase Storage | AES-256 (S3) |
| Electron local data | IndexedDB (browser storage) — **not encrypted at rest** (see §10.3) |
| PWA local data | IndexedDB (localStorage) — same as browser |

### 10.2 Data in Transit

All data in transit is encrypted via TLS 1.3. No plaintext communication channels.

### 10.3 Offline IndexedDB (Risk)

The `OfflineSyncEngine` (`src/core/offline/OfflineSyncEngine.ts`) stores pending operations (orders, payments) in IndexedDB when offline. This data includes:
- Order items and prices
- Table assignments
- Payment amounts

**Risk:** On shared devices, offline queue could expose order data to the next user if the browser profile is shared.

**Mitigation:** On logout, `OfflineSyncEngine` should flush and clear the offline queue. Verify this is implemented in `authStore.logout()`.

### 10.4 Sensitive Fields

| Field | Table | Protection |
|-------|-------|-----------|
| Passwords | — | Never stored (Supabase Auth handles hashing) |
| JWT tokens | — | Supabase SDK internal storage |
| Payment references | `payments.reference` | Stored in DB, RLS restricts access to cashier/admin |
| Employee salaries | `salary_structures` | RLS restricts to hr/admin |
| Payroll data | `payroll_history` | RLS restricts to hr/admin |

---

## 11. Secrets Management

### 11.1 Secret Classification

| Secret | Where stored | Who can access |
|--------|-------------|----------------|
| `VITE_SUPABASE_URL` | `.env` (public) + Netlify env | Frontend bundle (safe — public URL) |
| `VITE_SUPABASE_ANON_KEY` | `.env` (public) + Netlify env | Frontend bundle (safe — anon role only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify env ONLY (never in code) | CI/CD scripts, Edge Functions |
| `VITE_GOOGLE_AI_KEY` | `.env` (gitignored) + Netlify env | Frontend bundle (AI module only) |
| Supabase MCP token | `.claude/settings.json` (gitignored) | Developer tooling only |

### 11.2 Git History Exposure

Git commit `3bb7ce6` removed `.env` from tracking. **Confirmed:** `.env` is in `.gitignore`. However, any secrets that were committed before `3bb7ce6` may be in git history.

**Action required:**
- Rotate any API keys that appeared in git history (especially Google Maps/AI keys)
- Run `git log --all --full-history -- .env` to confirm scope of exposure
- Use `git-secrets` or `truffleHog` in CI to prevent future secret commits

### 11.3 Environment Variable Loading

```
Development: .env (gitignored) → Vite → import.meta.env.*
Production:  Netlify Environment Variables → Vite build → import.meta.env.*
Electron:    Same Vite build — env vars embedded at build time
```

**Note:** `VITE_APP_PUBLIC_URL` is intentionally commented out in `.env` to force `window.location.origin` fallback (always correct for the current deployment). Set only in Netlify for custom domain.

---

## 12. Audit Logging & Security Monitoring

### 12.1 Security Event Logger

**File:** `src/core/security/securityLogger.js`

Logs security events with structured JSON:
```javascript
{
  timestamp: ISO string,
  event: 'auth.failed' | 'rate_limit.exceeded' | 'permission.denied' | 'xss.detected',
  userId: string | null,
  metadata: { ip?, userAgent?, action?, resource? }
}
```

Events are written to `public.audit_logs` table via Supabase.

### 12.2 Database Audit Triggers

Triggers on sensitive tables write change records to `audit_logs`:
- `user_roles` — role assignment changes
- `payments` — payment creation/modification
- `journal_entries` — finance ledger changes (insert only; updates blocked by immutability trigger)
- `salary_structures` — salary changes

### 12.3 RLS on audit_logs

```sql
-- audit_logs: INSERT open to authenticated (any service can log)
-- SELECT/UPDATE/DELETE: admin only
CREATE POLICY al_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY al_select ON public.audit_logs FOR SELECT USING (is_admin());
```

### 12.4 Recommended Monitoring

| Alert | Trigger | Action |
|-------|---------|--------|
| Failed login spike | >10 failures/minute from same IP | Block IP, notify admin |
| Rate limit exceeded | `rate_limit.exceeded` event | Log, notify security email |
| Role escalation | INSERT to `user_roles` with `role='admin'` | Immediate alert to admin |
| Payment anomaly | Payment amount > average × 5 | Manual review queue |
| After-hours access | Auth success outside branch business hours | Alert to manager |

---

## 13. Multi-Tenancy Isolation

### 13.1 Company Isolation

The schema supports multi-tenancy via `company_id` columns on primary business tables:
- `branches(company_id)`
- `menu_items(company_id)`
- `orders(company_id)` ← added by `fix_company_id_columns.sql`
- `invoices(company_id)`
- `journal_entries(company_id)`
- `employees(company_id)`

All RLS policies include `company_id` scoping where applicable.

### 13.2 Branch Isolation

Within a company, data is further scoped to `branch_id`:
- `auth_branch_ids()` DB function returns the authenticated user's authorized branch IDs
- RLS policies use `branch_id = ANY(auth_branch_ids())` for branch-scoped roles
- Admins have cross-branch visibility (`is_admin()` bypasses branch filter)

### 13.3 Cross-Tenant Attack Surface

The highest cross-tenant risk is a malicious query to PostgREST directly (bypassing the client). This is mitigated by:
1. RLS on all tables enforcing `company_id` scoping
2. `auth_branch_ids()` function checking JWT-linked `user_roles` — cannot be spoofed

---

## 14. Payment Security

### 14.1 Payment Flow Security

The payment system follows a server-side confirmation model:

```
Client: collect payment method + amount
  ↓
Client: call process_cashier_invoice(order_id) RPC
  ↓ SECURITY DEFINER — validates cashier role + order ownership
Database: creates invoice record (status=pending)
  ↓
Client: call cashier_process_payment(order_id, method_id, amount, tip, reference) RPC
  ↓ SECURITY DEFINER — validates amount >= invoice total, no double-payment
Database: creates payment record, updates invoice to paid, triggers finance posting
```

**Client cannot:**
- Set payment status directly on the `payments` table (RLS blocks INSERT for cashier)
- Modify invoice totals (RLS blocks UPDATE on `invoices.total_amount`)
- Create journal entries directly (RLS blocks INSERT, only SECURITY DEFINER RPCs can)

### 14.2 Void & Refund Security

- **Void:** `void_invoice()` RPC — manager/admin only (enforced by DB function)
- **Refund:** `process_refund()` RPC — manager/admin only, validates refund ≤ original payment, creates reversal journal entry
- Both operations require re-authentication (manager PIN or session) for FOC/void flows in POS

### 14.3 POS Manager Override

Manager override (for FOC/void) uses a temporary session swap:
```typescript
// POSPage.vue — manager auth flow
const { data: session } = await supabase.auth.signInWithPassword({ email, password })
// verify role === 'manager' or 'admin'
// perform action
// restore original cashier session
await supabase.auth.setSession(origSession)
```
**Security note:** If session restore fails (origSession null guard added in OpsQA fix), the cashier remains logged out — this is the safe fallback.

---

## 15. Electron / Desktop Security

### 15.1 Context Isolation

Electron main process config (`src-electron/electron-main.ts`):
```javascript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // Renderer cannot access Node.js APIs
    nodeIntegration: false,       // Node.js disabled in renderer
    sandbox: true,                // Renderer sandboxed
    preload: path.join(__dirname, 'electron-preload.js'),
  }
})
```

### 15.2 Preload Script

`src-electron/electron-preload.js` exposes only a minimal `electronAPI` bridge via `contextBridge.exposeInMainWorld`. No raw `ipcRenderer` or `require` is exposed to the renderer.

### 15.3 Content Security Policy

Electron enforces the same CSP as the web deployment. In addition:
- `navigation` events are filtered — only `app://` and `https://*.supabase.co` allowed
- External URLs open in the system browser, not the Electron window

### 15.4 Auto-Update Security

If auto-update is implemented, releases must be code-signed to prevent MITM update injection. Current config: `forceCodeSigning: false` (disabled — no EV cert). Before enabling auto-update, obtain code signing certificate.

---

## 16. QR / Kiosk / Customer-Facing Security

### 16.1 QR Token Design

- QR tokens are UUIDs generated server-side and stored in `tables.qr_token`
- Tokens are stable (don't change unless regenerated by admin)
- Customer scans QR → `get_or_create_session_by_qr(token)` RPC → returns `session_token`
- Session token scoped to a single table + branch

### 16.2 Kiosk RLS

Customer-facing endpoints (kiosk/touch menu) are protected by:
```sql
-- Customer can only read menu items for their branch
CREATE POLICY menu_kiosk ON public.menu_items FOR SELECT
  USING (branch_id = get_session_branch_id());

-- Customer can only see their own session's orders
CREATE POLICY orders_kiosk ON public.orders FOR SELECT
  USING (table_session_id = get_current_table_session_id());
```

**File:** `supabase/rls_customer_session_hardening.sql`

### 16.3 QR Rate Limiting

`qr_rate_limits` table enforces:
- Max 10 scans per QR token per minute (prevents QR scraping)
- Implemented in `get_or_create_session_by_qr()` as SECURITY DEFINER

---

## 17. Known Risks & Mitigations

| Risk | Severity | Status | Mitigation |
|------|----------|--------|-----------|
| `fix_missing_rls_policies.sql` not applied | CRITICAL | **PENDING** | Apply immediately via Supabase Dashboard SQL Editor |
| `fix_all_security_definer_search_path.sql` not applied | HIGH | **PENDING** | Apply after RLS fix; prevents search_path injection |
| API keys in git history (pre-3bb7ce6) | HIGH | **OPEN** | Rotate Google Maps/AI keys; audit with `truffleHog` |
| No Cloudflare WAF / rate limiting at edge | HIGH | **OPEN** | Add Cloudflare in front of Supabase endpoint |
| IndexedDB offline queue not cleared on logout | MEDIUM | **OPEN** | Verify `authStore.logout()` calls `offlineEngine.clear()` |
| `void_invoice()` RPC missing | HIGH | **OPEN** | Implement or block void flow at client until RPC exists |
| No SIEM / centralized log aggregation | MEDIUM | **OPEN** | Forward `audit_logs` to Datadog/Logtail |
| Electron: no code signing | MEDIUM | **OPEN** | Obtain EV cert for production installer distribution |
| `VITE_GOOGLE_AI_KEY` embedded in bundle | LOW | **ACCEPTED** | AI key has billing quota cap; domain restriction preferred |

---

## 18. Security Checklist — Pre-Production

### 18.1 Database (Must Complete Before Go-Live)

- [ ] Apply `supabase/fix_missing_rls_policies.sql` — 19-section RLS hardening
- [ ] Apply `supabase/fix_all_security_definer_search_path.sql` — search_path injection fix
- [ ] Apply `supabase/process_refund_rpc.sql` — refund workflow + journal reversal
- [ ] Verify `erp_security_lockdown.sql` applied: `SELECT pg_has_role('anon', 'public', 'usage')` → must be false
- [ ] Confirm no tables accessible to anon role: run `\dp` in psql and check `anon` column
- [ ] Verify `trg_validate_order_status_transition` exists on `orders` table
- [ ] Verify `trg_journal_immutability` exists on `journal_entries` table

### 18.2 Authentication & Sessions

- [ ] Confirm Supabase Auth email rate limiting enabled in dashboard
- [ ] Confirm PKCE flow active: `auth.flowType === 'pkce'` in client init
- [ ] Confirm inactivity timer set to ≤ 30 minutes
- [ ] Confirm auth cache TTL is 5 minutes (not 24 hours)
- [ ] Test: log out clears all sensitive data from localStorage

### 18.3 Network & Infrastructure

- [ ] Netlify: security headers present (CSP, HSTS, X-Frame-Options) — verify in browser devtools
- [ ] Netlify: HTTP → HTTPS redirect enabled
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is NOT in client bundle (`grep -r "service_role" dist/`)
- [ ] Confirm `.env` is in `.gitignore` and not tracked: `git ls-files .env` → empty output
- [ ] Optional: Cloudflare WAF configured in front of Supabase

### 18.4 Code & Dependencies

- [ ] Rotate any API keys visible in git history
- [ ] Run `npm audit` — resolve all high/critical severity advisories
- [ ] Confirm no `v-html` with unsanitized user input in Vue templates
- [ ] Confirm `console.log` statements removed from production bundle (441 found in AUTO_CHECK.md)

### 18.5 Electron (if distributing desktop app)

- [ ] Context isolation: `contextIsolation: true`, `nodeIntegration: false` confirmed in BrowserWindow options
- [ ] Code signing: obtain EV cert and configure before distribution
- [ ] NSIS installer: VC++ redistributable check included (already in `nsis-include.nsh`)
- [ ] Test: renderer cannot access Node.js APIs directly

---

*Document end. For vulnerability details see `docs/security/SECURITY_AUDIT_REPORT.md` and `docs/qa/SECURITY_AUDIT.md`. For remediation SQL, see `supabase/fix_missing_rls_policies.sql`.*
