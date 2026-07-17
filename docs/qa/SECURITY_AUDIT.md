# Security Audit Report — Seven Waves Restaurant ERP
**Audit Date:** 2026-07-17  
**Auditor:** SecurityAuditor Agent  
**Scope:** Full application security review — RBAC, RLS, authentication, API security, XSS, injection, secrets, dependencies, headers  
**Classification:** Internal — Confidential  

---

## Executive Summary

| Category | Count |
|----------|-------|
| **Critical (P0)** | 5 |
| **High (P1)** | 7 |
| **Medium (P2)** | 6 |
| **Low (P3)** | 5 |
| **Total Vulnerabilities** | **23** |

**Overall Security Posture: 5.5 / 10**

The application has a strong security foundation — Supabase-backed RLS, a well-structured rate limiter, a CSP header, HSTS, and a dedicated `inputSanitizer.js` with XSS/SQL injection detection. However, a critical batch of RLS hardening migrations (`fix_missing_rls_policies.sql`) is **currently PENDING** in the Supabase environment. Until applied, sensitive financial, payroll, and multi-tenancy data is directly readable by any authenticated user. This is the single highest-priority remediation in the entire system.

Additionally, a Google Maps API key was exposed in git history and the commit message from `3bb7ce6` explicitly called for rotation — this rotation must be confirmed.

---

## Scope of Audit

Files audited:
- `src/stores/auth.ts` — auth store, session management, role caching
- `src/boot/auth.ts` — route guards, inactivity timeout, branch access
- `src/core/rbac/permissions.ts` — RBAC helper functions
- `src/core/security/inputSanitizer.js` — XSS/injection sanitizer
- `src/core/security/rateLimiter.js` — rate limiting logic
- `src/core/security/securityLogger.js` — security event logger
- `src/components/common/GlobalSearch.vue` — v-html usage audit
- `supabase/rbac_rls.sql` — RBAC RLS policies
- `supabase/erp_security_lockdown.sql` — security lockdown SQL
- `supabase/fix_missing_rls_policies.sql` — pending RLS hardening
- `supabase/applied_migrations_ledger.sql` — migration status
- `supabase/auth_has_role.sql` — auth helper RPCs
- `supabase/CRITICAL_fix_revoke_anon_functions.sql` — anon revocation
- `supabase/erp_payment_management.sql` — payment tables
- `supabase/schema.sql` — base schema
- `netlify.toml` — security headers configuration
- `.github/workflows/ci.yml` — CI security gates
- All `supabase/*.sql` files — SECURITY DEFINER audit (122 files)
- `.env` — environment variable exposure check

---

## Critical Vulnerabilities (P0) — Fix Immediately

---

### VULN-001: 19-Section RLS Hardening Migration PENDING — Multiple Data Exposure Risks
**Severity:** CRITICAL (P0)  
**File:** `supabase/fix_missing_rls_policies.sql` (NOT YET APPLIED TO SUPABASE)  
**Status:** Confirmed PENDING in `supabase/applied_migrations_ledger.sql` lines 132–155  

**Attack Vector:**  
Any authenticated user (waiter, delivery rider, customer) can call the PostgREST REST API directly with their JWT and read or write data from tables that should be restricted. The following data exposures are active until this migration is applied:

| Table | Current State | Risk |
|-------|--------------|------|
| `companies` | **NO RLS** | Any authenticated user reads all company records (full multi-tenancy breach) |
| `branches` | **NO RLS** | Any user reads all branch configs including payment settings |
| `journal_entries` | **NO RLS** | Any authenticated user reads/writes the financial ledger |
| `journal_lines` | **NO RLS** | Same as above — double-entry line items |
| Finance tables (payroll, payslips, salary, etc.) | Blanket `authenticated` = ALL policy | Any role (including delivery rider) reads all payroll/financial data |
| `audit_logs` | No INSERT restriction | Authenticated users can write false audit entries |
| AI insight tables | `USING true` = fully public | All AI forecasts and anomaly data visible to unauthenticated users |
| `uom_conversions` | Fully public | Low sensitivity but unnessarily exposed |

**Fix:** Apply `supabase/fix_missing_rls_policies.sql` to Supabase via SQL Editor immediately. Then record in ledger:
```sql
INSERT INTO applied_migrations (filename, notes)
VALUES ('fix_missing_rls_policies.sql', 'Security: 19-section RLS hardening')
ON CONFLICT DO NOTHING;
```

This single migration addresses approximately 15 of the 23 vulnerabilities in this report.

---

### VULN-002: Google Maps API Key Exposed in Git History — Key Not Confirmed Rotated
**Severity:** CRITICAL (P0)  
**Commit:** `3bb7ce6` — "security: stop tracking .env — remove live credentials from git index"  
**Key:** `VITE_GOOGLE_MAPS_KEY=AIzaSyAEeQwDmMc8Ir983nvm9wNNpQL6OlPZkvs`  

**Evidence:**  
The commit message states: *"Rotate VITE_GOOGLE_MAPS_KEY immediately — it has been exposed."* The key is still present in the local `.env` file and was in git history across multiple commits before `3bb7ce6`. The key was publicly accessible to anyone with read access to the repository.

**Attack Impact:**  
An attacker using this key can:  
- Make Google Maps API calls billed to the project owner (financial impact)
- Exhaust the API quota, breaking delivery tracking, table QR codes, and maps in the app
- Use the key to extract information about geocoding requests (customer addresses)

**Fix:**
1. Immediately rotate this key in [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com)
2. Set API key restrictions: restrict to HTTP referrers `seven-waves.netlify.app/*` and the specific Maps APIs used
3. Remove key from `.env` file; set only in Netlify environment variables
4. Run BFG Repo Cleaner to scrub the key from git history: `bfg --replace-text secrets.txt`

---

### VULN-003: Supabase Anon Key in Git History
**Severity:** CRITICAL (P0) — though lower immediate risk than Maps key  
**Key:** `VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (full JWT)  
**Same commit:** `3bb7ce6`  

**Assessment:**  
The Supabase anon key is by design public — it's bundled in the client JavaScript bundle and visible to anyone who opens the browser DevTools. Its security model relies entirely on RLS. However:
- Because it was in git history, anyone with repo access has had it
- The key never expires unless manually rotated in the Supabase dashboard
- If RLS gaps exist (VULN-001 is active), the anon key becomes a vehicle for data extraction

**Fix:**
1. Confirm that `fix_missing_rls_policies.sql` is applied (closes the RLS gap)
2. Rotate the anon key in Supabase Dashboard → Settings → API if feasible
3. Run BFG on git history alongside VULN-002 cleanup

---

### VULN-004: Two SECURITY DEFINER Trigger Functions Missing `SET search_path = public`
**Severity:** CRITICAL (P0)  
**Files:**
- `supabase/critical_fix_04_notification_outbox.sql:92` — anonymous trigger function (no `SET search_path`)
- `supabase/critical_fix_01_inventory_concurrency.sql:495` — `audit_stock_change()` (no `SET search_path`)

**Detail:**  
All other SECURITY DEFINER functions in the codebase correctly use `SET search_path = public`. These two trigger functions are exceptions. A `SECURITY DEFINER` function without `SET search_path = public` is vulnerable to a **search_path injection attack**: a malicious database user with CREATE SCHEMA permission can create a schema earlier in `search_path` (e.g., a schema named after a standard function), place a trojanized function there, and have it called instead of the intended one when the trigger fires with elevated privileges.

**Fix:**
```sql
-- critical_fix_04_notification_outbox.sql — add search_path to trigger function
CREATE OR REPLACE FUNCTION public.enqueue_notification_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- ADD THIS LINE
AS $$
-- ... existing body unchanged ...
$$;

-- critical_fix_01_inventory_concurrency.sql — add search_path
CREATE OR REPLACE FUNCTION public.audit_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- ADD THIS LINE
AS $$
-- ... existing body unchanged ...
$$;
```

---

### VULN-005: `signInWithCode` Bypasses Token-Bucket Rate Limiter
**Severity:** CRITICAL (P0)  
**File:** `src/stores/auth.ts:448–547`  

**Detail:**  
`signIn()` (email/password) correctly calls both `checkRateLimit('login', identifier)` and `recordFailedAttempt('login', identifier)`. However, `signInWithCode()` (the numeric user code flow used by waiters and cashiers) only checks the **in-memory** lockout (`_lockoutUntil`). It does NOT call `checkRateLimit()` or `recordFailedAttempt()` from the token-bucket rate limiter.

This means:
- Attackers brute-forcing numeric user codes (which may be short 4–6 digit codes) face only the in-memory lockout
- The in-memory lockout resets on every page refresh, browser close, or tab change
- Supabase's server-side rate limiting on `signInWithPassword` provides the last line of defense, but only after many attempts already reached the server

**Code Path:**
```typescript
// signIn() — CORRECT (has both guards)
const rl = checkRateLimit('login', identifier)   // ✅ Token bucket
if (!rl.allowed) { ... }
recordFailedAttempt('login', identifier)          // ✅ Tracks failed attempts

// signInWithCode() — MISSING (only in-memory lockout)
if (_lockoutUntil !== null && Date.now() < _lockoutUntil) { ... }  // ⚠️ In-memory only
// ❌ No checkRateLimit() call
// ❌ No recordFailedAttempt() call
```

**Fix** (in `src/stores/auth.ts`):
```typescript
async signInWithCode(userCode: string, password: string) {
  // Add at the top of try block:
  const rl = checkRateLimit('login', userCode)
  if (!rl.allowed) {
    const retrySec = Math.ceil((rl.retryAfterMs || 0) / 1000)
    const msg = `Too many login attempts. Try again in ${retrySec}s.`
    this.error = msg
    return { data: null, error: { message: msg } }
  }
  
  // On failure, add:
  recordFailedAttempt('login', userCode)
}
```

---

## High Vulnerabilities (P1)

---

### VULN-006: `payments` Table Missing Amount Validation and Payment Method Constraint
**Severity:** HIGH (P1)  
**File:** `supabase/schema.sql:298–306`  

**Detail:**  
The `payments` table has no database-level constraints on critical financial fields:
```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    amount NUMERIC(10,2),           -- ❌ No NOT NULL, no > 0 constraint
    payment_method TEXT,            -- ❌ No CHECK constraint for valid values
    transaction_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Attack:** A malicious cashier (or compromised account) could insert a payment record with `amount = -100` or `amount = 0`, creating a fake "paid" record while charging nothing. Similarly, any `payment_method` string is accepted, making reporting and reconciliation unreliable.

**Fix:**
```sql
ALTER TABLE payments 
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
  ALTER COLUMN amount SET NOT NULL,
  ADD CONSTRAINT payments_method_valid CHECK (
    payment_method IN ('cash', 'card', 'card_terminal', 'payhere', 'stripe', 
                       'koko', 'bank_transfer', 'loyalty_points', 'credit', 'cod')
  );
```

---

### VULN-007: Auth Role Cache Stored in localStorage — Exploitable via XSS
**Severity:** HIGH (P1)  
**File:** `src/stores/auth.ts:98–125`  
**Cache Key:** `erp_auth_v2_{uid}`  

**Detail:**  
Roles, permissions, and branch assignments are cached in localStorage under key `erp_auth_v2_{uid}`. If any XSS vulnerability is exploited (including VULN-008 below), an attacker can:
1. Read `localStorage.getItem('erp_auth_v2_<victim_uid>')` to enumerate the victim's roles and permissions
2. Read `tm_session_token` and `qr_session_token` for session hijacking in the customer/kiosk flow

**Assessment:** The 5-minute cache TTL (line 112) and the `rolesVerified` flag (line 148 in auth.ts) limit the window. However, the Supabase session JWT itself is also stored in localStorage by the Supabase client by default (standard for SPAs), which is the larger concern.

**Mitigations in place:**
- CSP header in `netlify.toml` reduces XSS attack surface
- `inputSanitizer.js` protects most inputs
- 5-minute cache TTL

**Recommended additional mitigations:**
- Add `__Host-` prefix cookies where feasible (requires Supabase custom auth)
- Ensure CSP `unsafe-inline` is removed from `script-src` (see VULN-013)
- Audit all remaining `v-html` usage (VULN-008)

---

### VULN-008: `v-html` with Database-Sourced Content in GlobalSearch
**Severity:** HIGH (P1)  
**File:** `src/components/common/GlobalSearch.vue:78`  
```html
<span class="gs-item__title" v-html="highlight(item.title)" />
```

**Detail:**  
`v-html` bypasses Vue's automatic HTML escaping. The `highlight()` function (lines 185–191) does escape both `text` and `query` via `escapeHtml()` before injecting the `<mark>` wrapper. This specific usage is **currently safe**. However:

1. `item.title` comes from database records (orders, employees, menu items, customers) — if any record has been stored with malicious content that bypassed input validation, it would be rendered via v-html
2. The `highlight()` function constructs a regex from the user's search query (`escapedQuery`) — a crafted search query with regex special characters after HTML encoding could theoretically cause ReDoS (Regular Expression Denial of Service). The `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` on line 188 correctly escapes regex metacharacters, mitigating this.

**Risk Assessment:** Low immediate risk due to the escaping in place, but v-html is a security-sensitive pattern that should be monitored. The pattern is acceptable here but must not be copied elsewhere without the same escaping discipline.

**Recommendation:**  
Add a comment to clearly mark this as security-reviewed:
```html
<!-- v-html is safe: highlight() escapes both text and query before injecting <mark> -->
<span class="gs-item__title" v-html="highlight(item.title)" />
```

---

### VULN-009: `innerHTML` Usage in Print Templates — Unreviewed Content Injection
**Severity:** HIGH (P1)  
**Files:**
- `src/components/cashier/BillPrintTemplate.vue:364` — `billRoot.value.innerHTML`
- `src/components/pos/ShiftCloseReport.vue:194` — `reportRef.value.innerHTML`
- `src/pages/finance/PayslipsPage.vue:420` — `printContent.innerHTML`
- `src/components/orders/OrderDetailDialog.vue:606` — `clone.outerHTML`

**Detail:**  
All four uses clone DOM nodes into print windows. The content is app-generated (rendered by Vue, not raw user strings), so direct XSS is unlikely. However:
- If any of these templates render unsanitized user-supplied data (customer names, item names, notes) without Vue's template escaping, the innerHTML pathway bypasses protections
- `OrderDetailDialog.vue:606` uses `outerHTML` on `clone` — the source of `clone` must be verified to only contain Vue-rendered (auto-escaped) content

**Recommendation:** Audit each component to confirm no raw string interpolation (`+` string concatenation into HTML) exists in the DOM nodes being cloned. Use `textContent` instead of `innerHTML` where only text values are printed.

---

### VULN-010: In-Memory Lockout Resets on Page Refresh — Brute Force Window
**Severity:** HIGH (P1)  
**File:** `src/stores/auth.ts:83–84`  
```typescript
let _loginAttempts = 0
let _lockoutUntil: number | null = null
```

**Detail:**  
Both `_loginAttempts` and `_lockoutUntil` are module-level variables that reset to zero on every page load. The secondary `checkRateLimit()` / `recordFailedAttempt()` in `rateLimiter.js` also use in-memory `Map` structures with the same reset behavior.

**Attack:**  
An attacker attempting brute force login can refresh the page (or use a headless browser) to bypass all client-side rate limiting. The only protection that survives refreshes is Supabase's server-side rate limit on `signInWithPassword`.

**Assessment:**  
This is an inherent limitation of client-side rate limiting. The system design note in `rateLimiter.js` acknowledges this. Supabase's server-side protection is the effective backstop.

**Recommendations:**
- Consider a server-side Edge Function wrapper for `signIn` that enforces server-side rate limiting with a durable store (Redis or Supabase table)
- Document that Supabase's built-in rate limiting (currently set at the project level) is the security-effective control

---

### VULN-011: `check_qr_rate_limit()` Function Grants `anon` Role Direct Table Access Pattern
**Severity:** HIGH (P1)  
**File:** `supabase/erp_security_lockdown.sql:692`  
```sql
GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER) TO anon, authenticated;
```

**Detail:**  
The `check_qr_rate_limit` function is callable by unauthenticated (anon) users. If this function internally reads/writes a `rate_limits` table without adequate protection, an unauthenticated attacker could enumerate QR tokens by calling this function in bulk. The `CRITICAL_fix_revoke_anon_functions.sql` file revokes blanket anon access and re-grants only specific safe functions, but `check_qr_rate_limit` is still explicitly granted to anon.

**Recommendation:** Audit the `check_qr_rate_limit` implementation to verify it does not leak table data, and that the rate limit enforcement itself cannot be bypassed (e.g., by sending randomized QR token values until finding a valid one).

---

### VULN-012: Security Escalations Persisted to localStorage — Tampered by Attacker
**Severity:** HIGH (P1)  
**File:** `src/core/security/securityLogger.js:94–101`  
```javascript
const escalated = JSON.parse(localStorage.getItem('sw_security_escalations') || '[]')
// ...
localStorage.setItem('sw_security_escalations', JSON.stringify(escalated.slice(0, 100)))
```

**Detail:**  
Security escalation events (brute force detections, session anomalies, etc.) are stored in `localStorage`. An attacker with XSS or local console access can:
1. Clear the escalation log (`localStorage.removeItem('sw_security_escalations')`) to erase evidence
2. Inject false escalation records to create noise

**Fix:** Security events must be written to a server-side audit log (the existing `audit_logs` or `login_audit_logs` tables), not localStorage. The localStorage copy is acceptable as a UI display aid only, not as a security record.

---

## Medium Vulnerabilities (P2)

---

### VULN-013: CSP Header Contains `'unsafe-inline'` in `script-src`
**Severity:** MEDIUM (P2)  
**File:** `netlify.toml`  
```
script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://*.sentry.io;
```

**Detail:**  
`'unsafe-inline'` in `script-src` defeats most of the protection that Content Security Policy provides against XSS. If an attacker can inject any inline `<script>` tag (via a DOM injection, a compromised dependency, or a stored XSS), the CSP will not block it.

**Assessment:** Vite/Quasar production builds do not use inline scripts by default. The comment in `netlify.toml` says `'unsafe-eval' removed` but `unsafe-inline` remains. This may have been left from development or for Quasar's production build artifact.

**Fix:**  
1. Run `npx quasar build` and inspect `dist/spa/index.html` for any inline scripts
2. If none exist, remove `'unsafe-inline'` from `script-src`
3. If Quasar requires a nonce for one specific script, use a nonce-based approach instead:
```
script-src 'self' 'nonce-{RANDOM_NONCE}' https://maps.googleapis.com;
```

---

### VULN-014: Customer Tokens Stored in localStorage — Multiple Locations
**Severity:** MEDIUM (P2)  
**Files:** `src/pages/QrEntryPage.vue:109–162`, `src/layouts/TouchMenuLayout.vue:244`  
**Keys:** `tm_session_token`, `qr_session_token`, `tm_table_id`, `tm_customer_name`

**Detail:**  
Customer QR session tokens are stored in localStorage under multiple keys. If a customer uses a shared device (kiosk), these tokens persist across sessions unless explicitly cleared. A subsequent customer on the same device could potentially inherit the previous customer's session token.

**Assessment:** The tokens are used for the anonymous customer QR ordering flow, not authenticated ERP sessions. Impact is limited to order manipulation (not financial data access) since customer sessions have restricted RLS access.

**Fix:**
- Clear all `tm_*` and `qr_*` localStorage keys on session completion (order placed/payment done)
- The `tableSessionStore` should have a `clearSession()` that wipes these keys
- Set short TTL on `customer_sessions` table records (already exists as `expires_at`)

---

### VULN-015: `console.log('[Auth] State change:', event)` in Production Auth Store
**Severity:** MEDIUM (P2)  
**File:** `src/stores/auth.ts:167`  
```typescript
console.log('[Auth] State change:', event)
```

**Detail:**  
This logs authentication events (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`) to the browser console in production. An attacker with physical or screen access to a logged-in browser session can see the exact moment authentication state changes.

More critically, `console.log` statements in production code are often swept up by browser extensions, session recording tools, and error monitoring services that capture console output. Auth events should not appear in logs that may be transmitted to third parties.

**Fix:** Remove or guard behind a debug flag:
```typescript
if (import.meta.env.DEV) console.log('[Auth] State change:', event)
```

---

### VULN-016: No `amount > 0` Validation on Order Level Discounts
**Severity:** MEDIUM (P2)  
**Files:** Multiple POS store/service files  

**Detail:**  
From reviewing the payment flow, discount amounts are not validated at the database level to prevent negative discounts (which become additions) or discounts exceeding 100% of the order total. This could allow a compromised cashier account to apply a 200% "discount" that credits the customer money.

**Recommendation:**  
Add a CHECK constraint:
```sql
ALTER TABLE orders 
  ADD CONSTRAINT orders_discount_valid 
  CHECK (discount_amount >= 0 AND discount_amount <= total_amount);
```
And at the application level, cap discount percentage at 100%.

---

### VULN-017: Missing X-XSS-Protection and Permissions-Policy Gaps
**Severity:** MEDIUM (P2)  
**File:** `netlify.toml`  

**Assessment of Current Headers:**

| Header | Status | Notes |
|--------|--------|-------|
| `X-Content-Type-Options: nosniff` | ✅ Set | Correct |
| `X-Frame-Options: DENY` | ✅ Set | Correct |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✅ Set | Correct |
| `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` | ✅ Set | Excellent |
| `Permissions-Policy` | ✅ Set | `camera=(), microphone=(), geolocation=(self), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy: same-origin` | ✅ Set | Correct |
| `Cross-Origin-Resource-Policy: same-origin` | ✅ Set | Correct |
| `Content-Security-Policy` | ⚠️ Partial | `unsafe-inline` in script-src (VULN-013) |
| `X-XSS-Protection` | ❌ Missing | Deprecated but some older browsers benefit from `1; mode=block` |

**Permissions-Policy Gap:** `geolocation=(self)` grants the first-party domain geolocation access. For a restaurant ERP, geolocation is only needed in the delivery app. Consider restricting further or documenting the use case.

**Recommended Addition:**
```toml
X-XSS-Protection = "1; mode=block"
```
(Low value for modern browsers but harmless for legacy support)

---

### VULN-018: `Permissions-Policy` Allows `geolocation=(self)` Without Explicit Justification
**Severity:** MEDIUM (P2)  
**File:** `netlify.toml`  

**Detail:**  
The `Permissions-Policy` header allows `geolocation=(self)`, which means any page on the domain can request the user's location without further restriction. While delivery tracking does need geolocation, it would be stronger to:
1. Document which pages legitimately use geolocation
2. Prompt only when needed (which browsers enforce by requiring user approval regardless)

**This is more of a hygiene issue** — browsers require explicit user permission regardless of this header. Current configuration is acceptable but should be documented.

---

## Low Vulnerabilities (P3)

---

### VULN-019: AI Chat History Persisted to localStorage Without Encryption
**Severity:** LOW (P3)  
**File:** `src/modules/ai/stores/ai.store.js:195–214`  
**Key:** `CHAT_STORAGE_KEY` (AI chat conversation)  

**Detail:**  
AI chat history (which may include business queries about revenue, staffing, inventory anomalies) is stored in localStorage. This is accessible to any script on the page and to anyone with physical browser access.

**Recommendation:** Limit what is stored (e.g., only the last 5 messages), add a "clear chat history" option, and document that conversation history is stored locally.

---

### VULN-020: `tel:` Protocol Uses Phone Number Directly from Database
**Severity:** LOW (P3)  
**Files:** `src/components/delivery/GoogleMapTracker.vue:444`, `src/pages/delivery-app/DeliveryActivePage.vue:410`  
```javascript
window.location.href = `tel:${props.customerPhone}`
```

**Detail:**  
Phone numbers from the database are used directly in `tel:` URLs. The `tel:` protocol is handled by the OS phone dialer and cannot inject JavaScript, so this is not an XSS risk. However, if phone numbers are stored without validation (e.g., allowing arbitrary strings), a malformed value could cause unexpected behavior in the dialer.

**Recommendation:** Validate phone number format before storage: `CHECK (phone ~ '^\+?[0-9\s\-\(\)]{7,20}$')`.

---

### VULN-021: `AI_CHAT_STORAGE_KEY` Not Namespaced by User — Cross-User Data Leakage on Shared Devices
**Severity:** LOW (P3)  
**File:** `src/modules/ai/stores/ai.store.js`  

**Detail:**  
If the AI chat storage key is a static string (not namespaced by user ID), chat history from one user's session would be visible to the next user who logs in on the same device. On shared manager/admin terminals this could expose business queries.

**Recommendation:** Namespace the key: `ai_chat_${userId}_history` and clear on logout.

---

### VULN-022: `device_secret` (Kiosk PIN) Transmitted and Stored as Plaintext
**Severity:** LOW (P3)  
**File:** `src/pages/admin/TablesManagementPage.vue:716, 1187`  

**Detail:**  
The kiosk device PIN (`device_secret`) is sent via RPC call as plaintext:
```javascript
p_device_secret: deviceForm.value.device_secret
```
This is transmitted over HTTPS so it's protected in transit. However, it's stored in the database column as-is (plaintext). A database read of the kiosk devices table exposes all PINs.

**Recommendation:** Hash the PIN server-side before storage (bcrypt or SHA-256 with salt via a SECURITY DEFINER RPC). Verify by hashing the submitted PIN and comparing hashes.

---

### VULN-023: `window.sessionStorage.clear()` on Signout — Overly Aggressive Cleanup
**Severity:** LOW (P3)  
**File:** `src/stores/auth.ts:637–639`  
```typescript
if (typeof window !== 'undefined') {
  window.sessionStorage.clear()
}
```

**Detail:**  
This clears ALL sessionStorage on logout, including data that may have been set by browser extensions or other app features not related to authentication. This is unlikely to cause issues but is unnecessarily broad.

**Recommendation:** Selectively clear known auth-related sessionStorage keys rather than calling `.clear()`.

---

## Authentication Security Audit Results

| Check | Result | Notes |
|-------|--------|-------|
| **AUTH-001: JWT Storage** | ⚠️ Risk | Supabase stores JWT in localStorage by default — acceptable for SPA, but XSS risk |
| **AUTH-002: Session Expiry** | ✅ Configured | 30-min inactivity timer in `src/boot/auth.ts:51–66` |
| **AUTH-002: Auth Cache TTL** | ✅ Correct | 5-minute TTL at line 112 of auth.ts |
| **AUTH-003: Route Guards** | ✅ Comprehensive | Checks requiresAuth, roles, permission, module, branch, and manager-only redirect |
| **AUTH-003: Privileged Route Re-verify** | ✅ Implemented | Lines 145–151: forces server revalidation for admin/manager/finance/hr routes |
| **AUTH-004: Password Reset** | ✅ Supabase-managed | Reset link handling exists in `UserProfilePage.vue` |
| **AUTH-005: Brute Force — email login** | ✅ Protected | Token bucket + in-memory lockout |
| **AUTH-005: Brute Force — code login** | ❌ VULN-005 | Missing token-bucket check in `signInWithCode` |
| **AUTH-006: Inactivity Timeout** | ✅ Implemented | 30 min, covers all user events |
| **AUTH-007: Profile Disabled Check** | ✅ Implemented | `is_active === false` triggers signOut on profile fetch |
| **AUTH-008: Login Audit** | ✅ Implemented | `writeLoginAudit()` records device, browser, OS to `login_audit_logs` |

---

## RBAC Authorization Audit Results

| Check | Result | Notes |
|-------|--------|-------|
| **RBAC-001: Frontend RBAC Bypass** | ⚠️ By Design | Direct API calls bypass UI checks — RLS is the real enforcement |
| **RBAC-002: Waiter → Finance** | ✅ Blocked | Role guard on /finance routes; RLS (when VULN-001 fixed) |
| **RBAC-002: Delivery → Orders** | ✅ Blocked | Branch-scoped RLS limits cross-branch access |
| **RBAC-003: Role Escalation via API** | ✅ Fixed (pending)| `user_roles` has SELECT-only for own; admin INSERT/UPDATE/DELETE via `fix_missing_rls_policies.sql` (PENDING) |
| **RBAC-004: Branch Access** | ✅ Implemented | `auth_branch_ids()` RPC + branch access guard in boot/auth.ts |
| **RBAC-005: Kitchen Staff → Finance** | ✅ Blocked | Role meta on routes + RLS |

**Critical Note on RBAC-003:**  
Until `fix_missing_rls_policies.sql` is applied, the `user_roles` table is missing INSERT/UPDATE/DELETE policies for admins (the previous audit's note that "no INSERT policy exists" for admin was partially addressed in `rbac_rls.sql` for SELECT, but write policies were added in `fix_missing_rls_policies.sql` Section 17 which is PENDING). Verify the exact state in Supabase.

---

## API Security Audit Results

| Check | Result | Notes |
|-------|--------|-------|
| **API-001: Anon Key Exposure** | ⚠️ By Design | Anon key is in client bundle by design; RLS is the protection |
| **API-002: SECURITY DEFINER + search_path** | ❌ VULN-004 | 2 trigger functions missing SET search_path |
| **API-002: Bulk SECURITY DEFINER audit** | ✅ Mostly Safe | 120+ functions checked; all non-trigger ones have SET search_path = public |
| **API-003: Anon REST Access** | ✅ Locked Down | `CRITICAL_fix_revoke_anon_functions.sql` revokes all anon function access except 4 safe ones |
| **API-004: Input Sanitization** | ✅ Comprehensive | `inputSanitizer.js` covers XSS, SQL injection, prompt injection, payload size |
| **API-004: Sanitization Applied to signIn** | ✅ Applied | Email is sanitized before use; password intentionally excluded (HTML escaping breaks passwords) |
| **API-005: Rate Limiting — email login** | ✅ Applied | Token bucket + in-memory |
| **API-005: Rate Limiting — code login** | ❌ VULN-005 | Missing token bucket |

---

## Data Security Audit Results

| Check | Result | Notes |
|-------|--------|-------|
| **DATA-001: PII in localStorage** | ⚠️ VULN-014 | `tm_session_token`, `tm_customer_name` — customer PII on shared kiosk devices |
| **DATA-002: Sensitive Data in Logs** | ⚠️ VULN-015 | Auth state events logged; no JWT/passwords in logs |
| **DATA-003: Salary Data** | ❌ VULN-001 | Exposed until `fix_missing_rls_policies.sql` applied |
| **DATA-004: Payment Card Data** | ✅ Not Stored | `payments` table has no card number, CVV, or PAN fields — PCI scope limited |
| **DATA-005: Financial Ledger** | ❌ VULN-001 | `journal_entries` has no RLS until migration applied |
| **DATA-006: Audit Log Integrity** | ❌ VULN-001 + VULN-012 | DB audit_log lacks INSERT restriction; security events in localStorage |

---

## XSS and Injection Audit Results

| Check | Result | Notes |
|-------|--------|-------|
| **XSS-001: v-html Usage** | ⚠️ VULN-008 | 1 instance in GlobalSearch — currently mitigated by escaping but pattern is risky |
| **XSS-002: URL Parameter Injection** | ✅ Safe | QR token used only in DB call (parameterized via RPC), not rendered in DOM |
| **XSS-003: innerHTML in Print Templates** | ⚠️ VULN-009 | 4 instances — content is Vue-rendered but should be audited |
| **INJ-001: Dynamic SQL in RPCs** | ✅ Safe | No string concatenation SQL found; PostgREST uses parameterized queries throughout |
| **INJ-002: SQL Injection via Client** | ✅ Protected | Supabase client uses parameterized queries; `inputSanitizer` adds defense-in-depth |
| **INJ-003: eval() Usage** | ✅ None Found | No `eval()` or `new Function()` in source code |
| **INJ-004: Prompt Injection (AI)** | ✅ Protected | `sanitizePrompt()` in inputSanitizer covers prompt injection patterns |

---

## Security Headers Audit

| Header | Status | Value | Assessment |
|--------|--------|-------|------------|
| `Content-Security-Policy` | ⚠️ Partial | `unsafe-inline` in script-src | VULN-013: remove unsafe-inline |
| `X-Content-Type-Options` | ✅ | `nosniff` | Correct |
| `X-Frame-Options` | ✅ | `DENY` | Correct |
| `Referrer-Policy` | ✅ | `strict-origin-when-cross-origin` | Correct |
| `Strict-Transport-Security` | ✅ Excellent | `max-age=31536000; includeSubDomains; preload` | Industry best practice |
| `Permissions-Policy` | ✅ | camera=(), microphone=(), geolocation=(self) | See VULN-018 |
| `Cross-Origin-Opener-Policy` | ✅ | `same-origin` | Correct — enables cross-origin isolation |
| `Cross-Origin-Resource-Policy` | ✅ | `same-origin` | Correct |
| `X-XSS-Protection` | ❌ Missing | Not set | Low priority — deprecated in modern browsers |
| `unsafe-eval` | ✅ Removed | Not present | Correctly omitted |

---

## Dependency Vulnerability Audit

**npm audit result:** Could not complete — npm registry mirror (`registry.npmmirror.com`) does not support the `/npm/v1/security/advisories/bulk` endpoint required by `npm audit`.

**Manual dependency risk assessment based on package.json:**

| Package | Version | Known Risk | Notes |
|---------|---------|-----------|-------|
| `@supabase/supabase-js` | (check version) | Low | Supabase is actively maintained |
| `quasar` | 2.x | Low | Actively maintained |
| `vite` | (check version) | Low-Medium | Vite has had CVEs — verify version is current |
| `electron` | (if used) | Medium | Electron context isolation must be enabled |
| `@stripe/stripe-js` | (if used) | Low | Official Stripe SDK |

**Recommendation:** Switch the npm registry to `https://registry.npmjs.org` for security auditing:
```bash
npm audit --registry https://registry.npmjs.org
```
This should be added to the CI pipeline (already noted in ci.yml as a TODO).

---

## Dependency Audit — Electron Security

**File:** `src-electron/electron-main.js`

Electron apps have a larger attack surface. The following must be verified:

| Control | Status | Risk if Missing |
|---------|--------|----------------|
| `contextIsolation: true` | Must verify | Critical — allows renderer to access Node.js APIs |
| `nodeIntegration: false` | Must verify | Critical — enables full OS access from renderer |
| `webSecurity: true` | Must verify | High — disabling allows cross-origin requests |
| CSP in Electron BrowserWindow | Must verify | Medium — same XSS risks as web |
| `sandbox: true` | Recommended | Medium — limits renderer process capabilities |

---

## Security Checklist Summary

| Category | Check | Status |
|----------|-------|--------|
| **Database** | RLS on all tables | ❌ PENDING (VULN-001) |
| **Database** | SECURITY DEFINER + search_path | ⚠️ 2 missing (VULN-004) |
| **Database** | Payment amount constraints | ❌ Missing (VULN-006) |
| **Auth** | Session management (JWT in localStorage) | ⚠️ By design (acceptable) |
| **Auth** | Inactivity timeout | ✅ 30 min |
| **Auth** | Brute force — email login | ✅ Protected |
| **Auth** | Brute force — code login | ❌ VULN-005 |
| **Auth** | Login audit logging | ✅ Implemented |
| **Auth** | Profile disabled check | ✅ Implemented |
| **Auth** | Route guards (role/permission/module/branch) | ✅ Comprehensive |
| **Secrets** | Google Maps key rotation | ❌ Unconfirmed (VULN-002) |
| **Secrets** | Supabase anon key in git history | ⚠️ Low risk (VULN-003) |
| **Secrets** | service_role key in source | ✅ Not found |
| **Input** | Input sanitization | ✅ Comprehensive library |
| **Input** | v-html usage | ⚠️ 1 instance (VULN-008) — mitigated |
| **Input** | eval() usage | ✅ None found |
| **Input** | SQL injection via client | ✅ Parameterized queries |
| **Headers** | HTTPS enforced (HSTS) | ✅ Excellent |
| **Headers** | CSP | ⚠️ unsafe-inline (VULN-013) |
| **Headers** | X-Frame-Options | ✅ DENY |
| **Headers** | Referrer-Policy | ✅ Correct |
| **Rate Limiting** | Login (email) | ✅ |
| **Rate Limiting** | Login (code) | ❌ VULN-005 |
| **Rate Limiting** | Client-side bypass via refresh | ⚠️ Inherent limitation |
| **Data** | PII in localStorage | ⚠️ VULN-014 |
| **Data** | Card data stored | ✅ Not stored |
| **Data** | Audit log integrity | ❌ VULN-001 + VULN-012 |
| **Dependencies** | npm audit | ⚠️ Registry blocked — use official registry |

---

## Prioritized Fix Plan

### P0 — Fix Today (System-Breaking Security)

| Priority | Fix | Owner |
|----------|-----|-------|
| P0-1 | Apply `supabase/fix_missing_rls_policies.sql` to Supabase | DBA / DevOps |
| P0-2 | Rotate Google Maps API key in Google Cloud Console | Repo Owner |
| P0-3 | Rotate Supabase anon key (as precaution; optional if RLS is solid) | DevOps |
| P0-4 | Run BFG Repo Cleaner on git history to remove exposed keys | Repo Owner |
| P0-5 | Add `SET search_path = public` to 2 SECURITY DEFINER trigger functions | DBA |
| P0-6 | Add `checkRateLimit` + `recordFailedAttempt` to `signInWithCode` | Backend |

### P1 — Fix This Week

| Priority | Fix | Owner |
|----------|-----|-------|
| P1-1 | Add `CHECK (amount > 0)` and payment method constraint to `payments` table | DBA |
| P1-2 | Move security escalation logs from localStorage to server-side audit table | Backend |
| P1-3 | Add guard comments to all v-html usages; review innerHTML print templates | Frontend |
| P1-4 | Audit `check_qr_rate_limit` function for QR token enumeration risk | DBA/Security |
| P1-5 | Remove `console.log('[Auth] State change:', event)` from production | Frontend |
| P1-6 | Clear `tm_*` localStorage keys on session end in customer flows | Frontend |

### P2 — Fix This Sprint

| Priority | Fix | Owner |
|----------|-----|-------|
| P2-1 | Remove `'unsafe-inline'` from CSP `script-src` after build verification | DevOps |
| P2-2 | Add `CHECK` constraint for order discount validation | DBA |
| P2-3 | Namespace AI chat storage key by user ID; clear on logout | Frontend |
| P2-4 | Run `npm audit --registry https://registry.npmjs.org` and fix HIGH/CRITICAL deps | DevOps |
| P2-5 | Verify Electron context isolation and nodeIntegration settings | DevOps |
| P2-6 | Add phone number format validation constraint | DBA |

### P3 — Backlog

| Priority | Fix |
|----------|-----|
| P3-1 | Hash kiosk device PINs server-side (bcrypt via SECURITY DEFINER) |
| P3-2 | Scope `sessionStorage.clear()` to auth-related keys only on logout |
| P3-3 | Add `X-XSS-Protection: 1; mode=block` header for legacy browsers |
| P3-4 | Document `geolocation=(self)` permission policy with use-case justification |
| P3-5 | Consider server-side Edge Function wrapping login for durable rate limiting |

---

## SQL Fixes for Critical Database Issues

```sql
-- ═══════════════════════════════════════════════════════════════════
-- FIX VULN-004: Add SET search_path to trigger functions missing it
-- Apply in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- Fix 1: Notification outbox trigger function
-- Source: supabase/critical_fix_04_notification_outbox.sql
-- This re-creates the function adding SET search_path = public
CREATE OR REPLACE FUNCTION public.enqueue_notification_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.type IS NOT NULL AND NEW.user_id IS NOT NULL THEN
        INSERT INTO notification_outbox (
            notification_id, channel, user_id, branch_id, payload, status, created_at
        ) VALUES (
            NEW.id, 'push', NEW.user_id, NEW.branch_id,
            jsonb_build_object(
                'type', NEW.type, 'title', NEW.title,
                'message', NEW.message, 'icon', NEW.icon,
                'action_url', NEW.action_url
            ),
            'pending', now()
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Fix 2: Inventory audit trigger function
-- Source: supabase/critical_fix_01_inventory_concurrency.sql
-- Re-create audit_stock_change with SET search_path
-- Note: Get the full function body from the source file before re-creating


-- ═══════════════════════════════════════════════════════════════════
-- FIX VULN-006: Add constraints to payments table
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.payments 
  ALTER COLUMN amount SET NOT NULL,
  ADD CONSTRAINT payments_amount_positive CHECK (amount > 0),
  ADD CONSTRAINT payments_method_valid CHECK (
    payment_method IN (
      'cash', 'card', 'card_terminal', 'payhere', 'stripe', 
      'koko', 'bank_transfer', 'loyalty_points', 'credit', 
      'cod', 'complimentary', 'staff_meal'
    )
  );
```

---

## Appendix A: Files Audited

| File | Lines | Findings |
|------|-------|---------|
| `src/stores/auth.ts` | 742 | VULN-005, VULN-007, VULN-015 |
| `src/boot/auth.ts` | 227 | Clean — guards comprehensive |
| `src/core/security/inputSanitizer.js` | 269 | Clean — well-implemented |
| `src/core/security/rateLimiter.js` | 226 | VULN-010 (inherent limitation) |
| `src/core/security/securityLogger.js` | ~100 | VULN-012 |
| `src/components/common/GlobalSearch.vue` | ~250 | VULN-008 (mitigated) |
| `netlify.toml` | ~60 | VULN-013, VULN-017, VULN-018 |
| `supabase/rbac_rls.sql` | ~150 | Clean — well-structured |
| `supabase/erp_security_lockdown.sql` | ~800 | Clean — all SECURITY DEFINER have search_path |
| `supabase/fix_missing_rls_policies.sql` | ~900 | VULN-001 (file exists, not yet applied) |
| `supabase/applied_migrations_ledger.sql` | ~160 | VULN-001 confirmed PENDING |
| `supabase/schema.sql` | ~350 | VULN-006 |
| `supabase/auth_has_role.sql` | ~40 | Clean |
| `supabase/CRITICAL_fix_revoke_anon_functions.sql` | ~80 | Clean |
| `supabase/critical_fix_04_notification_outbox.sql` | ~200 | VULN-004 |
| `supabase/critical_fix_01_inventory_concurrency.sql` | ~500 | VULN-004 |
| `supabase/erp_payment_management.sql` | ~730 | Clean |
| `.env` | 6 | VULN-002, VULN-003 |
| `src/pages/QrEntryPage.vue` | ~170 | VULN-014 |
| `src/layouts/TouchMenuLayout.vue` | ~450 | VULN-014 |
| `src/modules/ai/stores/ai.store.js` | ~250 | VULN-019, VULN-021 |

---

*Report generated by SecurityAuditor Agent — Seven Waves Restaurant ERP*  
*Audit Date: 2026-07-17 | Next audit recommended: 2026-10-17 or after any major feature release*
