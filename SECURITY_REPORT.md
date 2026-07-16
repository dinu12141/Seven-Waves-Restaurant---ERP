# Seven Waves Restaurant ERP — Security Audit Report

> Generated: 2026-06-22
> Auditor: Agent 3 — CDN, Caching & Frontend Security Headers

---

## Agent 3: CDN, Caching & Headers

---

### FINDING [CRITICAL]: .env File Committed to Git with Live Credentials

**Location**: `.env` (tracked in git — confirmed via `git ls-files`)

**Issue**: The `.env` file containing live production secrets is committed to the repository and has been present across multiple commits in git history (`e55a0c1`, `d70d105`, `d24c943`, and earlier). The file contains:
- `VITE_SUPABASE_URL` — live Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — live JWT token (expires 2086 per payload decode)
- `VITE_GOOGLE_MAPS_KEY` — live Google Maps API key (`AIzaSy[REDACTED — see GCP Console]`)

**Risk**: Anyone with read access to the git repository (or any cloned copy) has permanent access to these credentials even if the file is removed in a future commit — git history retains all past states. The Google Maps key can be used to incur billing charges. The Supabase anon key combined with the URL gives access to the database via the public API, constrained only by RLS policies.

**Fix**:
1. Immediately rotate all three secrets (Supabase anon key, Google Maps key) in their respective consoles
2. Remove `.env` from git tracking: `git rm --cached .env`
3. Verify `.gitignore` already has `.env` listed (it does — lines 36–37) — this was bypassed by an earlier `git add -f` or pre-existing track
4. Purge from git history: `git filter-repo --path .env --invert-paths` (requires `git-filter-repo` tool)
5. Force-push the cleaned history to all remotes and invalidate all existing clones
6. Add a pre-commit hook that blocks commits containing `VITE_SUPABASE` or `AIzaSy` patterns

---

### FINDING [CRITICAL]: `'unsafe-inline'` and `'unsafe-eval'` in script-src CSP

**Location**: `vercel.json:31`, `netlify.toml:39`

**Issue**: The deployed Content-Security-Policy contains both `'unsafe-inline'` and `'unsafe-eval'` in `script-src`:
```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://*.sentry.io
```
`'unsafe-inline'` allows any inline `<script>` block or `onclick=` attribute to execute. `'unsafe-eval'` allows `eval()`, `Function()`, `setTimeout(string)`, and `new Function()`. Together they effectively nullify XSS protection — a CSP that contains both provides almost no protection against script injection.

**Risk**: An attacker who finds an XSS vector (e.g., unescaped user-supplied content in the POS order notes, customer names, or loyalty program fields) can execute arbitrary JavaScript in the victim's browser session, steal auth tokens from localStorage, and escalate to full account takeover.

**Fix**:
- Remove `'unsafe-eval'`. Quasar/Vue 3 + Vite does NOT require `eval` in production builds. The requirement only appears in dev mode HMR. Audit if any third-party library genuinely requires it; if so, scope it narrowly.
- Replace `'unsafe-inline'` with a CSP nonce or hash. Quasar's Vite build can inject nonces via a Vite plugin (e.g., `vite-plugin-csp-nonce`). Alternatively, move all inline event handlers to external JS.
- Minimum immediate mitigation: remove `'unsafe-eval'` now; schedule nonce implementation for the next sprint.

---

### FINDING [HIGH]: Google Generative AI / Gemini Domain Missing from connect-src

**Location**: `vercel.json:31`, `netlify.toml:43`

**Issue**: The project routes AI calls through a Supabase Edge Function (`ai-gemini-service`), so direct Gemini API calls from the browser are not made. However, the internal CSP reference file `src/core/security/cspHeaders.js` (line 21) includes `https://generativelanguage.googleapis.com` in `connect-src`, but this domain is **absent** from the deployed configs in `vercel.json` and `netlify.toml`. If the Edge Function pattern is ever bypassed (e.g., during development, after refactor, or in a future feature), the browser will be blocked from making AI calls without any clear error, and a developer might be tempted to add `'unsafe-eval'` or wildcard domains as a workaround.

**Risk**: Inconsistency between the declared CSP policy (`cspHeaders.js`) and the deployed CSP (`vercel.json`/`netlify.toml`) creates drift that can cause silent failures or push developers toward insecure workarounds.

**Fix**: Add `https://generativelanguage.googleapis.com` to `connect-src` in both `vercel.json` and `netlify.toml` to match the `cspHeaders.js` source of truth. Alternatively, establish a single source of truth and generate deployment configs from it.

---

### FINDING [HIGH]: `no-sandbox` Electron Flag Disables OS Process Sandbox

**Location**: `src-electron/electron-main.js:31`

**Issue**: The Electron main process adds `app.commandLine.appendSwitch('no-sandbox')` unconditionally — in both development and production. This disables Chromium's renderer process sandbox, which is the primary OS-level security boundary that prevents a compromised renderer (XSS, malicious content) from accessing the host filesystem, spawning processes, or escalating privileges.

**Risk**: If an attacker achieves code execution in the renderer (via XSS in the POS page, a malicious font, or a compromised npm dependency), the sandbox would normally contain the damage to the browser process. With `no-sandbox`, the attacker has direct access to the underlying Windows OS, the same as the user running the ERP (often Administrator on restaurant POS machines).

**Fix**: Remove the `no-sandbox` flag. The correct fix for the dual-GPU/Optimus hang is `disable-gpu` (which the comment says NOT to use) or, better, using `--disable-gpu-sandbox` alone without `--no-sandbox`. Alternatively, test removing both switches; `disableHardwareAcceleration()` alone is usually sufficient for the Optimus/SwiftShader fix.

```js
// Remove this line:
app.commandLine.appendSwitch('no-sandbox')
// Keep only:
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-sandbox')  // scoped to GPU only
app.commandLine.appendSwitch('ignore-gpu-blocklist')
```

---

### FINDING [HIGH]: `disable-gpu-sandbox` Electron Flag Scope Is Too Broad

**Location**: `src-electron/electron-main.js:30`

**Issue**: `--disable-gpu-sandbox` disables the GPU process sandbox, which is separate from but related to renderer sandboxing. This is applied unconditionally in all environments.

**Risk**: The GPU process has access to hardware and, in some Chromium versions, can be used as a pivot point for privilege escalation. Disabling its sandbox increases attack surface.

**Fix**: Gate GPU-related flags behind `!app.isPackaged` (development only) or detect the specific GPU configuration at runtime. For production restaurant POS machines where the hardware is known, consider a machine-specific configuration file.

---

### FINDING [HIGH]: Missing `index.html` Cache-Control Header (SPA Entry Point)

**Location**: `vercel.json`, `netlify.toml`

**Issue**: Neither deployment config sets a `Cache-Control` header specifically for `/index.html`. The catch-all `/(.*)`rule in Vercel and `/*` rule in Netlify do not set a `Cache-Control` header for non-asset routes. Vercel's default caching for HTML files varies; Netlify by default sets `Cache-Control: public, max-age=0, must-revalidate` for the primary HTML file but this is not explicitly enforced.

For an SPA, `index.html` is the entry point that references all versioned asset chunks. If a browser or CDN caches a stale `index.html`, it will request asset files with old hashes — files that no longer exist on the CDN — causing the app to fail to load after a deployment.

**Risk**: After a production deploy, returning users may see a broken app (white screen, failed chunk loads) until their cache expires or they hard-refresh. For a restaurant POS, this could mean the system is unusable during a service period.

**Fix**: Add explicit `no-cache` headers for `index.html` in both configs:

`vercel.json`:
```json
{
  "source": "/index.html",
  "headers": [
    { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
  ]
}
```

`netlify.toml`:
```toml
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"
```

---

### FINDING [MEDIUM]: Missing `worker-src` CSP Directive (Service Worker)

**Location**: `vercel.json:31`, `netlify.toml:39`

**Issue**: The CSP has no `worker-src` directive. The PWA registers a service worker (`/sw.js`). Without `worker-src`, browsers fall back to `child-src` then `default-src`. Since `default-src 'self'` is set, service workers from `'self'` are allowed — this is not a blocking issue — but the intent is not explicit and any future change to `default-src` could silently break the PWA.

**Risk**: Low immediate risk. However, if `default-src` is ever tightened (e.g., to `'none'` for specific directives), the service worker could silently stop registering, breaking PWA offline functionality and background sync without any obvious error.

**Fix**: Add an explicit `worker-src 'self'` directive to both deployment CSP configurations to make the intent explicit and robust against policy changes.

---

### FINDING [MEDIUM]: Missing `manifest-src` CSP Directive (PWA)

**Location**: `vercel.json:31`, `netlify.toml:39`

**Issue**: No `manifest-src` directive is present in the CSP. The PWA uses `/manifest.json`. Without this directive, `default-src 'self'` applies as fallback, which allows the manifest — but again, implicit rather than explicit.

**Fix**: Add `manifest-src 'self'` to the CSP in both deployment configs.

---

### FINDING [MEDIUM]: Missing COEP, COOP Headers

**Location**: `vercel.json`, `netlify.toml`

**Issue**: The deployed headers are missing:
- `Cross-Origin-Opener-Policy` (COOP): present in `src/core/security/cspHeaders.js` (`same-origin`) but **not** in `vercel.json` or `netlify.toml`
- `Cross-Origin-Embedder-Policy` (COEP): absent everywhere
- `Cross-Origin-Resource-Policy` (CORP): present in `cspHeaders.js` (`same-origin`) but **not** in deployment configs

This is another instance of drift between the declared policy and the deployed policy.

**Risk**: Without COOP, the app's browsing context group can be joined by cross-origin popups opened during OAuth flows, potentially allowing cross-window attacks. Without CORP, cross-origin sites can embed the app's resources. COEP is needed if `SharedArrayBuffer` or high-precision timers are required (not currently used, but absence of COEP means they cannot be used in future).

**Fix**: Add to both `vercel.json` and `netlify.toml` under the `/(.*)`/ `/*` headers block:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```
COEP (`require-corp`) can be deferred — it requires all loaded resources to also send CORP headers, which may break third-party assets (Google Fonts, Maps).

---

### FINDING [MEDIUM]: HSTS `preload` Without Verified Eligibility

**Location**: `vercel.json:29`, `netlify.toml:33`

**Issue**: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` is set. The `preload` directive submits the domain to browser preload lists (Chrome, Firefox), which hardcode the site as HTTPS-only. This is irreversible on short timescales — removal from the preload list takes months to years to propagate.

**Risk**: If the domain `sevenwaves.lk` or its subdomains ever needs to serve HTTP (e.g., a subdomain for a non-HTTPS IoT device, internal API endpoint, or certificate renewal via HTTP-01 challenge), it will fail for all users on updated browsers regardless of the server configuration. This is a permanent operational constraint that may not have been consciously accepted.

**Fix**: Verify that `sevenwaves.lk` and all subdomains can permanently commit to HTTPS. If the domain is already on the HSTSPRELOAD.org list, document this decision. If not yet submitted, consider removing `preload` until the commitment is certain, and keep `max-age=31536000; includeSubDomains` without `preload`.

---

### FINDING [MEDIUM]: `window.location.reload(true)` in SW Update Handler

**Location**: `src-pwa/register-service-worker.js:33`

**Issue**: The `updated()` service worker callback calls `window.location.reload(true)` to force a page reload when a new service worker is detected. The `true` argument (bypass cache) is deprecated and ignored in modern browsers. More critically, the reload fires immediately without any user prompt or state check.

**Risk**: If a restaurant staff member is in the middle of processing a payment, completing a POS order, or managing a shift, and a new deployment occurs, the page reloads without warning — potentially losing in-progress order state stored only in memory/component state (not yet persisted to Supabase). For a POS system, mid-transaction data loss is a serious operational issue.

**Fix**:
```js
updated(registration) {
  // Notify the user rather than force-reloading mid-transaction
  console.log('New version available')
  // Use Quasar Notify or a custom banner:
  // Notify.create({ message: 'Update available — reload when ready', actions: [{ label: 'Reload', handler: () => window.location.reload() }] })
  // Only auto-reload if the page has been idle for > 5 minutes or no active POS session
}
```

---

### FINDING [MEDIUM]: Workbox `GenerateSW` Mode — No Control Over API Caching

**Location**: `quasar.config.js:177` (`workboxMode: 'GenerateSW'`)

**Issue**: The PWA uses Workbox's `GenerateSW` mode, which auto-generates the service worker from Quasar's defaults. This pre-caches the SPA shell (HTML, JS, CSS) but does not cache API responses. The concern is that `GenerateSW` mode does not allow custom runtime caching rules — unlike `InjectManifest` mode (the `custom-service-worker.js` file exists but is unused because `workboxMode` is `'GenerateSW'` not `'InjectManifest'`).

**Risk**: The `custom-service-worker.js` file references `self.skipWaiting()` and `clientsClaim()` — these aggressive update strategies would cause immediate activation of a new service worker, potentially breaking open tabs mid-session. Since the file is not actually used (wrong `workboxMode`), this is a latent confusion risk. If a developer switches to `InjectManifest`, `skipWaiting` + `clientsClaim` would activate without the corresponding `reload()` check in `register-service-worker.js`, causing broken clients.

**Fix**: Either:
1. Delete `custom-service-worker.js` if `GenerateSW` is intentional (remove the dead file to avoid confusion)
2. Switch to `workboxMode: 'InjectManifest'` if custom caching rules are needed, and remove `skipWaiting()` from the custom SW or pair it with a `message` event that notifies the UI

---

### FINDING [MEDIUM]: Axios Configured with Placeholder `api.example.com` Base URL

**Location**: `src/boot/axios.js:10`

**Issue**: The axios instance is created with `baseURL: 'https://api.example.com'`. This is the Quasar scaffold placeholder and has never been updated to a real endpoint. The `$api` global is exposed to all Vue components via `app.config.globalProperties.$api`.

**Risk**: If any Vue component or service accidentally calls `this.$api.get('/endpoint')` instead of using the Supabase client, the request will silently go to `api.example.com`, potentially leaking request data (including any auth headers inadvertently attached) to an external domain. It also means the application has a dependency on a domain it does not own.

**Fix**: Either:
1. Update `baseURL` to the actual API URL (`https://clykwuzajtwvwuavmtzs.supabase.co` or Supabase Edge Functions URL) if axios is genuinely used
2. Remove the axios boot file entirely if all API calls go through the Supabase client (which appears to be the case based on the service layer review)

---

### FINDING [MEDIUM]: `geolocation=(self)` in Permissions-Policy for ERP System

**Location**: `vercel.json:30`, `netlify.toml:35`

**Issue**: The Permissions-Policy allows geolocation access for the app's own origin (`geolocation=(self)`). The `DeliveryMapPage.vue` uses GPS for the delivery driver app. However, the main ERP, POS terminal, and finance modules have no legitimate need for geolocation.

**Risk**: Any XSS vulnerability on the POS or finance pages could trigger a geolocation prompt and exfiltrate the restaurant's physical location. While not severe (the location is presumably known), it increases the attack surface unnecessarily.

**Fix**: This is acceptable if the delivery module is part of the same origin. Consider scoping the delivery app to a separate subdomain or path and using a more restrictive policy. At minimum, document the rationale for `geolocation=(self)` in a comment.

---

### FINDING [LOW]: Source Maps Not Explicitly Disabled for Production

**Location**: `quasar.config.js` (no `sourcemap` option set)

**Issue**: The `quasar.config.js` build section does not explicitly set `viteConf.build.sourcemap = false`. Vite's default for production builds is to not generate source maps, so this is likely safe — but it is not explicitly enforced. If a developer adds `sourcemap: true` for debugging and forgets to revert it, minified source code (including business logic, pricing formulas, and API call patterns) would be exposed in production.

**Risk**: Source maps in production allow any browser user to view the full unminified source of all application modules, including the finance service, loyalty calculations, and authentication flow.

**Fix**: Explicitly set in `quasar.config.js`:
```js
extendViteConf(viteConf) {
  // ... existing config ...
  viteConf.build.sourcemap = false  // Explicit — never expose source in production
}
```

---

### FINDING [LOW]: `manifest.json` Reveals App Name, Version, and Start URL

**Location**: `src-pwa/manifest.json`, `netlify.toml:65` (`max-age=3600`)

**Issue**: The manifest is served with `max-age=3600` (1 hour cache). The manifest reveals `start_url: /waiter-app`, application name, and icon paths. This is standard PWA behavior and low risk — manifests are public by design. However, the `src-pwa/manifest.json` in source contains placeholder values (`theme_color: #027be3`) while `quasar.config.js` overrides these at build time (`theme_color: #f97316`). The source file and the built file will differ, which can cause confusion.

**Risk**: Minimal. The information in a PWA manifest is intentionally public. The theme/name discrepancy is a maintenance issue, not a security one.

**Fix**: Update `src-pwa/manifest.json` to match production values, or add a comment noting it is overridden by `quasar.config.js:178`.

---

### FINDING [LOW]: `X-XSS-Protection: 1; mode=block` Is Deprecated

**Location**: `vercel.json:27`, `netlify.toml:29`

**Issue**: `X-XSS-Protection` is a legacy header for Internet Explorer and old Chrome. It has been removed from modern browsers (Chrome 78+, Firefox never implemented it). It is now considered harmful — it can introduce vulnerabilities in some edge cases.

**Risk**: Negligible — modern browsers ignore this header. However, it adds noise and false confidence.

**Fix**: Remove `X-XSS-Protection` from both deployment configs. Rely on the CSP for XSS mitigation.

---

### FINDING [LOW]: Electron `nodeIntegration` Not Explicitly Set to `false`

**Location**: `src-electron/electron-main.js:100`, `electron-main.cjs:1`

**Issue**: The `BrowserWindow` `webPreferences` sets `contextIsolation: true` and `preload` but does not explicitly set `nodeIntegration: false`. In Electron 12+, `nodeIntegration` defaults to `false`, so this is safe by default — but the explicit declaration is missing, creating a risk if the Electron version is downgraded or if a future developer adds a `BrowserWindow` elsewhere and copies the options without knowing the default.

**Risk**: Low — current Electron version defaults are safe. Risk is from future maintenance mistakes.

**Fix**: Add `nodeIntegration: false` explicitly to `webPreferences` in both `src-electron/electron-main.js` and the compiled `electron-main.cjs`:
```js
webPreferences: {
  nodeIntegration: false,   // Explicit safety net
  contextIsolation: true,
  preload: preloadPath,
}
```

---

## Summary Table

| # | Severity | Finding | File |
|---|----------|---------|------|
| 1 | CRITICAL | Live `.env` committed to git with real API keys | `.env` |
| 2 | CRITICAL | `unsafe-inline` + `unsafe-eval` in script-src CSP | `vercel.json`, `netlify.toml` |
| 3 | HIGH | Gemini API domain missing from deployed connect-src | `vercel.json`, `netlify.toml` |
| 4 | HIGH | `--no-sandbox` Electron flag disables OS process sandbox | `src-electron/electron-main.js:31` |
| 5 | HIGH | `--disable-gpu-sandbox` applied unconditionally | `src-electron/electron-main.js:30` |
| 6 | HIGH | No Cache-Control on `index.html` (SPA entry point) | `vercel.json`, `netlify.toml` |
| 7 | MEDIUM | Missing `worker-src` CSP directive | `vercel.json`, `netlify.toml` |
| 8 | MEDIUM | Missing `manifest-src` CSP directive | `vercel.json`, `netlify.toml` |
| 9 | MEDIUM | COEP/COOP/CORP headers defined in code but not deployed | `vercel.json`, `netlify.toml` |
| 10 | MEDIUM | HSTS `preload` without verified eligibility | `vercel.json:29`, `netlify.toml:33` |
| 11 | MEDIUM | `window.location.reload(true)` forces reload mid-transaction | `src-pwa/register-service-worker.js:33` |
| 12 | MEDIUM | Dead `custom-service-worker.js` with dangerous `skipWaiting()` | `src-pwa/custom-service-worker.js` |
| 13 | MEDIUM | Axios baseURL points to `api.example.com` placeholder | `src/boot/axios.js:10` |
| 14 | MEDIUM | `geolocation=(self)` in Permissions-Policy (broad for ERP) | `vercel.json:30`, `netlify.toml:35` |
| 15 | LOW | Source maps not explicitly disabled in production build | `quasar.config.js` |
| 16 | LOW | `manifest.json` source mismatches build-time overrides | `src-pwa/manifest.json` |
| 17 | LOW | Deprecated `X-XSS-Protection` header | `vercel.json:27`, `netlify.toml:29` |
| 18 | LOW | `nodeIntegration: false` not explicit in Electron config | `src-electron/electron-main.js:100` |

**Total: 2 CRITICAL, 4 HIGH, 7 MEDIUM, 5 LOW = 18 findings**

---

## Agent 5: Secrets & Data Exposure

> Auditor: Agent 5 — Secrets, Data Exposure & Frontend XSS
> Scope: Modified files on current branch (finance-account.service.js, finance-ledger.service.js, POSPage.vue, FinanceReportsPage.vue, orderStore.js, supabase SQL files)

---

### FINDING [HIGH]: Item Price Can Be Set to Any Value by Any Cashier — No Server-Side Validation

**Location**: `src/pages/POSPage.vue` — `handleEdit()` function (~line 2226); `src/stores/orderStore.js` — `processPayment()` / order item insertion (~line 318-328)

**Issue**: The POS UI exposes an "Edit Item Price" dialog that allows any authenticated cashier to change an item's price to any arbitrary value (including LKR 0 or negative) with no RBAC check, no manager authorization prompt, and — critically — no server-side price validation at finalization time.

The exploit chain is fully traced:
1. `handleEdit()` mutates `item.price` directly in the Pinia cart store (client-side only, no permission check)
2. `processPayment()` computes `total_amount` from the mutated cart prices and inserts `order_items` with `unit_price: itemPrice` directly via `supabase.from('order_items').insert(itemsPayload)`
3. The `process_waiter_accept` and `process_cashier_payment` RPCs operate on whatever was already written to `order_items` — they never re-fetch `menu_items.base_price` for comparison
4. The `order_items` RLS INSERT policy only validates `company_id` / branch membership, not `unit_price` value
5. Finance journal entries and stock deductions are posted based on the tampered total

**Risk**: Any cashier can permanently set a LKR 2,000 dish to LKR 1, process a payment through all server-side RPCs, and have it recorded in the finance ledger as a LKR 1 sale with no audit trail distinguishing it from a legitimate price. This is a direct revenue loss and fraud enablement vector. There is no backend constraint (CHECK constraint, trigger, or RPC validation) that enforces `unit_price` against the canonical `menu_items.base_price`.

**Fix**:
Add a PostgreSQL CHECK trigger on `order_items` INSERT that validates `unit_price` is within an acceptable tolerance of `menu_items.base_price`:
```sql
CREATE OR REPLACE FUNCTION validate_order_item_price()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  canonical_price NUMERIC;
BEGIN
  SELECT base_price INTO canonical_price FROM menu_items WHERE id = NEW.menu_item_id;
  IF canonical_price IS NOT NULL AND ABS(NEW.unit_price - canonical_price) / NULLIF(canonical_price, 0) > 0.10 THEN
    RAISE EXCEPTION 'unit_price deviates more than 10%% from menu price (submitted: %, canonical: %)',
      NEW.unit_price, canonical_price;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_order_item_price
  BEFORE INSERT ON order_items FOR EACH ROW EXECUTE FUNCTION validate_order_item_price();
```
Alternatively (or additionally): add a `manager_approved_price` column and require manager PIN for any price deviation, enforced in `process_waiter_accept`.

---

### FINDING [HIGH]: Manual Discount Can Be Set to 100% by Any Cashier — No Server-Side Ceiling

**Location**: `src/pages/POSPage.vue` — `handleOther()` function (~line 2207); `src/stores/orderStore.js` — `discount` store field usage

**Issue**: A manual "Order Discount" dialog permits any cashier to enter a discount percentage from 0 to 100 with no RBAC check and no server-side validation. The discount is applied client-side to compute `discount_amount` and `total_amount`, which are then written directly to the `orders` table via the Supabase JS client. The `process_cashier_payment` RPC trusts the pre-written `total_amount` and posts journal entries accordingly.

This is distinct from the loyalty coin redemption flow (which correctly goes through `pos_redeem_loyalty_coins` RPC with server-side validation). The manual discount path has no server-side enforcement at all.

**Risk**: Any cashier can apply a 100% discount on any order, reducing the recorded total to LKR 0. Combined with Finding 1 (price manipulation), a cashier could zero out both unit prices and the discount simultaneously, with all finance records reflecting the tampered figures. Even in isolation, a 100% discount on a LKR 50,000 banquet order is a significant financial fraud vector. The `orders` RLS UPDATE policy does not constrain `discount_amount`.

**Fix**:
1. Add a server-side RPC `apply_manual_discount(p_order_id, p_discount_pct, p_authorized_by)` that requires manager credentials (or a manager-issued token) and enforces a maximum discount percentage configured per company:
```sql
CREATE OR REPLACE FUNCTION apply_manual_discount(
  p_order_id UUID, p_discount_pct NUMERIC, p_manager_user_id UUID, p_manager_password TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max_discount NUMERIC;
  v_role TEXT;
BEGIN
  -- Verify manager credentials and role
  SELECT max_cashier_discount_pct INTO v_max_discount FROM company_settings WHERE company_id = (SELECT company_id FROM orders WHERE id = p_order_id);
  IF p_discount_pct > COALESCE(v_max_discount, 15) THEN
    RAISE EXCEPTION 'Discount exceeds company maximum of %%', v_max_discount;
  END IF;
  -- Apply discount
  UPDATE orders SET discount_amount = (subtotal * p_discount_pct / 100),
    total_amount = subtotal - (subtotal * p_discount_pct / 100) WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
```
2. As an immediate interim fix: add a CHECK constraint `discount_amount <= subtotal * 0.30` (30% ceiling) on the `orders` table, or enforce it in the existing `process_cashier_payment` RPC.

---

## Agent 5 Summary Table

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| A5-1 | HIGH | Item price editable by any cashier, no server-side price validation | `POSPage.vue` `handleEdit()`, `orderStore.js` |
| A5-2 | HIGH | Manual discount up to 100% with no server-side ceiling or RBAC | `POSPage.vue` `handleOther()`, `orderStore.js` |

**Total Agent 5: 0 CRITICAL, 2 HIGH, 0 MEDIUM, 0 LOW = 2 findings**

---

## Agent 4: Load Balancing & Scaling

> Auditor: Agent 4 — Connection Management, Realtime Scaling, Memory, DB Performance, Bundle Optimization
> Scope: All stores, boot files, SQL schema, Electron config, bundle configuration

---

### FINDING [HIGH]: `orders.js` — Unbounded `select('*')` on orders and child tables without LIMIT

**Location**: `src/stores/orders.js:132, 157, 167, 179, 191`

**Issue**: `fetchInitialOrders()` fetches all non-completed orders for a branch using `select('*')` with no `.limit()` on any of the five queries (orders, order_items, kot_tickets, kot_items, order_status_logs). For a busy branch accumulating hundreds of concurrent dine-in orders (lunch peak, multi-floor), this can return tens of thousands of rows into browser memory in a single load.

```js
// orders.js line 132 — no LIMIT
const { data: ordersData } = await supabase
  .from('orders')
  .select('*')           // all columns, every non-completed order
  .eq('branch_id', branchId)
  .not('status', 'in', '("completed","cancelled")')
  .order('created_at', { ascending: false })
  // MISSING: .limit(500)
```

Additionally, `statusLogs.value` (line 98) is an unbounded array that grows indefinitely via realtime INSERT events and is never trimmed. At 10 status events per order × 200 concurrent orders = 2,000+ reactive objects accumulating for the full session.

**Risk**: Memory exhaustion on POS tablets and low-RAM terminals during high-volume service. Potential multi-second initial page load. Realtime INSERT events continue appending to `statusLogs` with no eviction policy.

**Fix**:
```js
// Add limit to fetchInitialOrders
.not('status', 'in', '("completed","cancelled")')
.order('created_at', { ascending: false })
.limit(300)  // reasonable cap for active orders

// Cap statusLogs array on INSERT
if (table === 'order_status_logs') {
  if (eventType === 'INSERT' && newRecord) {
    statusLogs.value.push(newRecord)
    if (statusLogs.value.length > 500) statusLogs.value.shift() // trim oldest
  }
  return
}
```

---

### FINDING [HIGH]: `kitchenDisplayStore.js` — `readyQuery` on `kot_tickets` with no date filter and no LIMIT

**Location**: `src/stores/kitchenDisplayStore.js:176-185`

**Issue**: The second query in `fetchTickets()` fetches ALL ready tickets with `completed_at IS NULL` — no date restriction, no limit. This is intentional (to show carry-over ready tickets) but if staff never dismiss tickets, every ready KOT since the system launched is returned on every fetch.

```js
// No LIMIT — will return every undismissed ready ticket in history
let readyQuery = supabase
  .from('kot_tickets')
  .select(selectFields)
  .eq('status', 'ready')
  .is('completed_at', null)
  .order('created_at', { ascending: false })
```

**Risk**: A full-day service without diligent ticket dismissal accumulates all day's ready KOTs. Over weeks of operation with no `completed_at` backfill, this becomes a near-full-table scan returning megabytes of JSON to each KDS terminal.

**Fix**:
```js
// Restrict ready tickets to last 24h to prevent runaway query
let readyQuery = supabase
  .from('kot_tickets')
  .select(selectFields)
  .eq('status', 'ready')
  .is('completed_at', null)
  .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  .order('created_at', { ascending: false })
  .limit(100)
```

Also add a scheduled DB job or trigger to auto-set `completed_at = now()` on ready tickets older than 4 hours.

---

### FINDING [HIGH]: `waiterAppStore.js` — `waiter-app-kot` realtime channel has no branch or kitchen filter

**Location**: `src/stores/waiterAppStore.js:745-774`

**Issue**: The KOT realtime channel for the waiter PWA subscribes to the entire `kot_tickets` table with no filter at all:

```js
kotChannel = supabase
  .channel('waiter-app-kot')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'kot_tickets' },
    // NO filter — receives ALL kot_ticket changes across ALL branches
```

Every KOT update from every branch and kitchen is broadcast to every waiter PWA. The store filters client-side by checking `myOrders.value.find()` but the raw data still crosses the wire for every subscriber.

**Risk**: In a multi-branch deployment, a KOT update in Branch B is broadcast to all waiters in Branch A, burning Supabase realtime quota (capped at `eventsPerSecond: 10` globally). Cross-tenant noise can crowd out genuine events. This is also a data isolation concern — waiters in one branch receive row-level change payloads from other branches.

**Fix**:
```js
// Filter by branch_id — requires branch_id column on kot_tickets
// (add as denormalized column via trigger if not present)
kotChannel = supabase
  .channel(`waiter-app-kot-${branchId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'kot_tickets',
      filter: `branch_id=eq.${branchId}`,
    },
    (payload) => { ... }
  )
  .subscribe()
```

---

### FINDING [HIGH]: Dual parallel realtime subscription systems create duplicate event processing

**Location**: `src/boot/realtime.ts` (RealtimeManager) vs `src/stores/waiterAppStore.js`, `src/stores/cashierStore.js`, `src/stores/kitchenDisplayStore.js`, `src/stores/deliveryStore.js`

**Issue**: The codebase has two parallel realtime architectures operating simultaneously:
1. **`RealtimeManager`** (centralized, `src/core/realtime/`) — with deduplication, exponential backoff, health monitoring, branch-scoped filtering
2. **Ad-hoc direct Supabase channels** — created manually in each store with their own reconnect/cleanup

When `subscribeUserChannels()` from `boot/realtime.ts` subscribes to `orders:{branchId}` AND `waiterAppStore.subscribeRealtime()` also subscribes to `waiter-app-orders` (the same `orders` table, same branch filter), every order change fires two separate handler pipelines, two sound alerts, two debounced refresh calls.

**Risk**: Double-processing of every realtime event. Notification toasts fire twice. Sound alerts fire twice. `debouncedRefresh()` fires twice per 300ms window. The `eventsPerSecond: 10` Supabase quota is consumed at 2× rate. Channel count per user session is nearly doubled, pushing into Supabase plan limits.

**Fix**: Consolidate to a single system. The `RealtimeManager` is the superior architecture (has dedup, backoff, health monitoring). Either:
- Route all stores through `realtimeManager.subscribe()` and `realtimeManager.on()` handlers
- Or disable `subscribeUserChannels()` for modules that already manage their own channels

---

### FINDING [HIGH]: Finance services — unbounded queries on ledger and cashbook entry tables

**Location**: `src/modules/finance/services/finance-ledger.service.js:10, 74`, `src/modules/finance/services/finance-account.service.js:11`

**Issue**: `financeLedgerService.list()` fetches all ledgers with `select('*')` and no LIMIT. `financeLedgerService.getTransactions()` fetches all cashbook entries for a ledger with `select('*')` and no default LIMIT — only optional if the caller passes `filters.limit` (most call sites do not).

```js
// finance-ledger.service.js:74 — no default limit
async getTransactions(ledgerId, filters = {}) {
  let q = supabase.from('finance_cashbook_entries')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('entry_date', { ascending: false })
  // No .limit() by default
```

Similarly `financeAccountService.list()` (line 11) fetches all accounts with a full join to `finance_ledgers(*)`, returning every column from both tables for every account.

**Risk**: A finance ledger used daily for 6+ months accumulates 1,000–10,000 entries. Fetching all of them for every balance view causes multi-second DB query times, large response payloads, and potential browser tab memory exhaustion in the Finance module. The `select('*')` also means any new JSONB columns added to the schema are silently included.

**Fix**:
```js
async getTransactions(ledgerId, filters = {}) {
  let q = supabase.from('finance_cashbook_entries')
    .select('id, entry_date, description, debit_amount, credit_amount, reference, created_at')
    .eq('ledger_id', ledgerId)
    .order('entry_date', { ascending: false })
    .limit(filters.limit || 200)  // default 200, allow caller to override
```

For aggregate reports (balance sheets, P&L), use RPC aggregate queries instead of fetching all rows.

---

### FINDING [HIGH]: AI service — conditionally unbounded queries on AI analytics tables

**Location**: `src/modules/ai/services/ai.service.js:226, 271, 309, 348`

**Issue**: `fetchInsights()`, `fetchRecommendations()`, `fetchAnomalies()`, `fetchForecasts()` all use `select('*').order('created_at', { ascending: false })` without a default LIMIT. A limit is only applied if the caller explicitly passes `filters.limit`.

```js
export async function fetchInsights(filters = {}) {
  let query = supabase.from('ai_insights').select('*').order('created_at', { ascending: false })
  if (filters.limit) query = query.limit(filters.limit)  // only if caller provides it
```

Most call sites in the AI dashboard do not pass `filters.limit`.

**Risk**: As AI analysis accumulates insights over time, these queries return unbounded rows. A running AI service generating 100 insights/day accumulates 36,500 rows/year. A single dashboard load could transfer several megabytes of data, causing visible slowdowns.

**Fix**:
```js
// Set a safe default in each function
const defaultLimit = filters.limit || 100
query = query.limit(defaultLimit)
```

---

### FINDING [MEDIUM]: `cashierStore.js` — `billingOrders` array holds up to 500 fully-denormalized orders

**Location**: `src/stores/cashierStore.js:129-183`

**Issue**: `fetchBillingQueue()` fetches up to 300 unpaid orders (7 days) + 200 paid orders (today), loading all into `billingOrders.value` as fully denormalized objects including nested `order_items`, `kot_tickets` (with `kot_items`), and `invoices`. Each order object is 2–5 KB. At 500 orders × 3 KB = 1.5 MB reactive array. This full array is replaced on every `debouncedRefresh()` call.

The debounced refresh fires on every realtime event change (even simple status updates). During a busy shift with 1 order update/minute, that is 60 full re-fetches per hour, each loading 500 orders with deeply nested JOINs.

**Risk**: Memory pressure on POS terminals. Repeated expensive multi-JOIN queries against the database. The current approach fetches 7 days of unpaid orders — in a restaurant with carryover tabs, this window is too large.

**Fix**:
- Reduce unpaid lookback from 7 days to 24 hours (adjust based on business need)
- For realtime UPDATE events, update `billingOrders[idx]` in-place (already done for simple status changes) instead of triggering `debouncedRefresh()` on every structural change
- Only load `kot_tickets` and `kot_items` when the bill dialog is opened (lazy load on demand)

---

### FINDING [MEDIUM]: `kitchenDisplayStore.js` — `orders` realtime subscription has no branch filter

**Location**: `src/stores/kitchenDisplayStore.js:250-263`

**Issue**: The KDS subscribes to ALL `orders` changes with no branch or kitchen filter:

```js
.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
  // NO filter — ALL orders from ALL branches
  (payload) => {
    if (payload.new) { refreshTicketsForOrder(payload.new.id) }
  },
)
```

Every order update anywhere triggers a `refreshTicketsForOrder()` DB call from the KDS, even for unrelated branches.

**Risk**: In a multi-branch deployment, each KDS terminal fires unnecessary DB queries for every order in the system. At 10 branches × 3 KDS stations × 5 orders/min = 150 unnecessary DB reads/min globally.

**Fix**:
```js
.on('postgres_changes', {
  event: '*', schema: 'public', table: 'orders',
  filter: `branch_id=eq.${authStore.currentBranch?.id}`,
}, ...)
```

---

### FINDING [MEDIUM]: Implicit OAuth flow used for web builds (deprecated by OAuth 2.1)

**Location**: `src/boot/supabase.ts:24`

**Issue**:
```js
flowType: isTauri ? 'pkce' : 'implicit',
```

The `implicit` flow embeds the access token in the URL hash (`#access_token=...`). This is deprecated by OAuth 2.1 because tokens appear in browser history, server logs, referrer headers, and are accessible to browser extensions. On shared POS workstations (common in restaurants), navigating away leaves auth tokens in URL history accessible to the next user.

**Risk**: Token leakage from shared terminals. Browser extension-based credential theft.

**Fix**:
```js
flowType: 'pkce',  // use PKCE for all environments (recommended by OAuth 2.1)
detectSessionInUrl: !isTauri,
```

---

### FINDING [MEDIUM]: No session inactivity timeout — shared POS terminals stay authenticated indefinitely

**Location**: `src/boot/auth.ts`, `src/stores/auth.ts`

**Issue**: `autoRefreshToken: true` keeps sessions alive indefinitely. There is no inactivity detection or auto-logout. Sessions persist in `localStorage` until explicit sign-out.

**Risk**: A POS cashier terminal or waiter tablet left unattended (during break, overnight) remains fully authenticated. Anyone with physical access can process payments, void orders, or access financial data without re-authenticating.

**Fix**: Add inactivity watcher in `src/boot/auth.ts`:
```js
const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutes
let inactivityTimer = null
function resetTimer() {
  clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    const authStore = useAuthStore()
    if (authStore.isAuthenticated) {
      authStore.signOut()
      router.push('/auth/login?reason=inactivity')
    }
  }, INACTIVITY_MS)
}
if (typeof window !== 'undefined') {
  ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, resetTimer, { passive: true })
  )
  resetTimer()
}
```

---

### FINDING [MEDIUM]: No error monitoring service — production errors are invisible

**Location**: `src/boot/error-handler.ts`

**Issue**: All errors are handled only by Quasar `Notify` toasts and `console.error`. There is no Sentry, Datadog, Bugsnag, or equivalent. The `error-handler.ts` handler deliberately suppresses several error types silently.

**Risk**: Production errors (RPC failures, DB timeouts, RLS violations) are invisible unless staff manually report them. Cascade failures during busy service go undetected until customers complain. No ability to correlate errors across sessions or identify patterns in failures.

**Fix**: Integrate Sentry:
```js
// src/boot/error-handler.ts
import * as Sentry from '@sentry/vue'
Sentry.init({ app, dsn: import.meta.env.VITE_SENTRY_DSN, tracesSampleRate: 0.05 })
```
Add `https://*.sentry.io` to `connect-src` in CSP (note: Agent 3 audit found `*.sentry.io` already in the CSP header — verify it is also in the Supabase Edge Function CORS and that the SDK is actually initialized).

---

### FINDING [MEDIUM]: Electron desktop — no code signing, no auto-updater, no DevTools block in production

**Location**: `quasar.config.js:303-318`, `electron-main.cjs`

**Issue**: Three compounding concerns:
1. **No code signing**: `forceCodeSigning: false` and `signAndEditExecutable: false`. Windows SmartScreen will warn/block on first run.
2. **No auto-updater**: Security patches require users to manually download and reinstall new `.exe` files.
3. **DevTools auto-close**: The minified `electron-main.cjs` closes DevTools when opened (`devtools-opened` event) but does NOT prevent keyboard shortcut (`F12`, `Ctrl+Shift+I`) access in the production window. DevTools exposes `localStorage` (auth tokens, session cache).

**Risk**: Unsigned executables may be blocked by corporate antivirus on restaurant partners' machines. Without auto-updater, zero-day security fixes cannot be deployed to active POS terminals. DevTools on a production POS exposes session tokens to physical-access attackers (staff, cleaning crew).

**Fix**:
```js
// quasar.config.js — add to electron builder
win: { certificateFile: process.env.WIN_CERT_FILE, certificatePassword: process.env.WIN_CERT_PASSWORD }

// electron-main source — disable DevTools in production
if (app.isPackaged) {
  o.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      event.preventDefault()
    }
  })
}

// Add electron-updater
const { autoUpdater } = require('electron-updater')
autoUpdater.checkForUpdatesAndNotify()
```

---

### FINDING [LOW]: `cashierStore.js` — Timestamp in realtime channel name causes orphaned channels

**Location**: `src/stores/cashierStore.js:505`

**Issue**:
```js
const channelName = `cashier-orders-${bid}-${Date.now()}`
```

Using `Date.now()` means every call to `subscribeRealtime()` creates a uniquely-named channel. If called multiple times (retry after error, HMR in development), the old channel reference may be lost before cleanup, leaving zombie channels active on the Supabase server.

**Fix**:
```js
const channelName = `cashier-orders-${bid}`  // stable, deterministic name
```

---

### FINDING [LOW]: `channel.registry.ts` — `tables` channel references wrong Supabase table name

**Location**: `src/core/realtime/channel.registry.ts:107-119`

**Issue**:
```js
'tables': {
  key: 'tables:{branchId}',
  table: 'tables',   // ← wrong — actual table is 'restaurant_tables'
```

A subscription to `table: 'tables'` receives no events because no table with that name exists in the `public` schema.

**Risk**: Table status changes (available/occupied) are never propagated via `realtimeManager`. Staff see stale table occupancy on the floor map. This is a silent failure — no error is thrown.

**Fix**:
```js
'tables': {
  key: 'tables:{branchId}',
  table: 'restaurant_tables',  // correct table name
  filterColumn: 'branch_id',
```

---

### FINDING [LOW]: `realtime.manager.ts` — Heartbeat detects stale channels but does not reconnect

**Location**: `src/core/realtime/realtime.manager.ts:410-421`

**Issue**: The heartbeat check logs a warning when a channel has received no events for 5+ minutes but explicitly refuses to reconnect (`// Don't force reconnect — just log`). A channel can be `'connected'` (WebSocket is up) but silently stopped receiving `postgres_changes` events due to server-side replication issues or Supabase maintenance.

**Risk**: Silent realtime outage. KDS misses new KOT tickets. Cashier misses order status changes. Staff only notice when an order goes cold after the kitchen already prepared it.

**Fix**:
```js
if (managed.lastEventAt.getTime() < staleThreshold) {
  logger.warn(`[RT] Heartbeat stale — resubscribing: ${key}`)
  this.unsubscribe(key)
  this.createSubscription(key, managed.definition)
}
```

---

### FINDING [LOW]: `FinanceReportsPage.vue` — `jsPDF` and `jspdf-autotable` imported statically (1.1 MB on first visit)

**Location**: `src/pages/finance/FinanceReportsPage.vue:573-574`

**Issue**: `jsPDF` (~1.1 MB) and `jspdf-autotable` are static top-level imports in the Finance Reports page component. They are loaded eagerly on first visit to the page, even if the user never clicks "Export PDF". While the page route itself is lazy-loaded, the PDF library bundle is included in the page's initial chunk.

**Risk**: Finance Reports page has a 1.8+ MB initial load penalty (jsPDF + ExcelJS via `exportService.ts`). On 3G/LTE POS tablets, this causes a visible loading delay when navigating to the reports section.

**Fix**: Import PDF/Excel libraries lazily on demand:
```js
// FinanceReportsPage.vue — remove top-level imports, use dynamic import
async function exportPDF() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  // ... use jsPDF
}

// quasar.config.js — add manual chunk
if (id.includes('jspdf') || id.includes('exceljs')) return 'vendor-export'
```

---

### FINDING [LOW]: Auth token refresh failure handling — silent sign-out during active POS session

**Location**: `src/stores/auth.ts:159-167`

**Issue**: The `onAuthStateChange` handler handles `SIGNED_OUT` to clear user data but does not distinguish between a user-initiated sign-out and a silent sign-out caused by refresh token expiry. If the refresh token expires mid-shift (rare with Supabase's 60-day default, but possible with shorter configured TTLs), the next RPC call returns a 401 and throws `"Payment RPC Failed"` or similar, with the user having no idea the session expired.

**Risk**: Mid-transaction sign-out during a payment flow causes the RPC to fail in an unclear state. The order may be in a partially-committed state (accepted but not paid). The cashier sees a generic error with no guidance.

**Fix**: Distinguish session expiry from user sign-out:
```js
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' && !this._signingOut) {
    // Unexpected sign-out (token expiry, server-forced)
    Notify.create({
      type: 'warning', message: 'Session expired — please log in again',
      timeout: 0,
      actions: [{ label: 'Login', color: 'white', handler: () => router.push('/auth/login') }]
    })
  }
})
```

---

## Agent 4 Summary Table

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| A4-1 | HIGH | Unbounded `select('*')` + no LIMIT on orders/child tables | `src/stores/orders.js:132-191` |
| A4-2 | HIGH | KDS `readyQuery` no date filter or LIMIT — grows unbounded | `src/stores/kitchenDisplayStore.js:176-185` |
| A4-3 | HIGH | `waiter-app-kot` realtime channel — no branch/kitchen filter | `src/stores/waiterAppStore.js:745` |
| A4-4 | HIGH | Dual parallel realtime systems — double event processing | `src/boot/realtime.ts` + all stores |
| A4-5 | HIGH | Finance ledger/account services — unbounded queries | `src/modules/finance/services/finance-ledger.service.js:74` |
| A4-6 | HIGH | AI service — conditionally unbounded queries on analytics tables | `src/modules/ai/services/ai.service.js:226,271,309,348` |
| A4-7 | MEDIUM | `billingOrders` — 500 fully-denormalized orders in reactive memory | `src/stores/cashierStore.js:129-183` |
| A4-8 | MEDIUM | KDS `orders` realtime subscription has no branch filter | `src/stores/kitchenDisplayStore.js:250-263` |
| A4-9 | MEDIUM | Implicit OAuth flow used for web builds (deprecated) | `src/boot/supabase.ts:24` |
| A4-10 | MEDIUM | No session inactivity timeout on shared POS terminals | `src/boot/auth.ts` |
| A4-11 | MEDIUM | No error monitoring — production failures invisible | `src/boot/error-handler.ts` |
| A4-12 | MEDIUM | Electron — no signing, no auto-updater, DevTools accessible | `quasar.config.js:303-318` |
| A4-13 | LOW | Timestamp in cashier channel name — orphaned channels possible | `src/stores/cashierStore.js:505` |
| A4-14 | LOW | Channel registry `tables` → wrong table name `'tables'` vs `'restaurant_tables'` | `src/core/realtime/channel.registry.ts:107` |
| A4-15 | LOW | Heartbeat detects stale channels but refuses to reconnect | `src/core/realtime/realtime.manager.ts:410` |
| A4-16 | LOW | jsPDF / ExcelJS statically imported — 1.8 MB penalty on first visit | `src/pages/finance/FinanceReportsPage.vue:573` |

**Total Agent 4: 0 CRITICAL, 6 HIGH, 6 MEDIUM, 4 LOW = 16 findings**

---

## Agent 2: Rate Limiting & API Abuse

**Audit completed**: 2026-06-22  
**Files reviewed**: `supabase/erp_security_lockdown.sql`, `supabase/phase1_security_crm.sql`, `supabase/create_kiosk_order.sql`, `supabase/create_order_from_session.sql`, `supabase/pos_shift_management.sql`, `supabase/erp_payment_management.sql`, `supabase/phase1_offline_sync.sql`, `supabase/customer_loyalty_system.sql`, `supabase/critical_fix_05_06_procurement_loyalty.sql`, `src/boot/supabase.ts`, `src/boot/auth.ts`, `src/stores/auth.ts`, `src/pages/auth/LoginPage.vue`, `src/services/paymentService.js`, `src/services/loyaltyService.ts`, `src/pages/POSPage.vue`, `src/core/security/securityLogger.js`

---

### FINDING [CRITICAL]: `create_kiosk_order` Callable by `anon` with No Rate Limiting

**Location**: `supabase/create_kiosk_order.sql` lines 106–107  
**Issue**: `create_kiosk_order` is granted EXECUTE to `anon` (unauthenticated users). The function accepts any valid `table_id` UUID, creates real orders, marks tables as occupied, and inserts into `order_items` — all without any call to `check_qr_rate_limit` or any throttle. An attacker who discovers any table UUID can flood the database with ghost orders.  
**Risk**: DoS via order flood. An attacker script can call `create_kiosk_order` thousands of times per minute. Every call inserts into `orders` and `order_items`, marks a table `occupied`, and creates real kitchen tickets. The kitchen display is overwhelmed with ghost orders. Tables appear occupied and cannot be assigned to real guests. No lockout, no IP tracking, no counter.  
**Fix**: Add rate limit at the SQL function entry and revoke `anon` grant if kiosk tablets can use device sessions:

```sql
-- In create_kiosk_order, add at top of DECLARE/BEGIN:
DECLARE
    v_rate      JSONB;
    -- ... existing declarations ...
BEGIN
    -- RATE LIMIT: max 5 orders per minute per table
    v_rate := check_qr_rate_limit(p_table_id::TEXT, 'create_kiosk_order', 5);
    IF NOT (v_rate->>'allowed')::BOOLEAN THEN
        RETURN jsonb_build_object('success', false, 'error', 'Too many requests. Please wait a moment.');
    END IF;
    -- ... rest of function unchanged

-- Revoke anon if kiosk tablets authenticate via device sessions:
REVOKE EXECUTE ON FUNCTION create_kiosk_order(UUID, JSONB, TEXT) FROM anon;
```

---

### FINDING [CRITICAL]: `confirm_online_payment` Callable by `anon` with No Rate Limiting

**Location**: `supabase/erp_payment_management.sql` line 555  
**Issue**: `confirm_online_payment` — the payment gateway webhook handler — is granted EXECUTE to `anon`. While it has idempotency logic (prevents double-payment on the same `idempotency_key`), there is zero rate limiting. An attacker can call it repeatedly with a known `order_id`, attempt brute-force of order UUIDs, or launch a volumetric DB attack. The `FOR UPDATE` row lock prevents race conditions but not request floods.  
**Risk**: Payment manipulation attempts, DoS via connection exhaustion, potential to trigger kitchen flow on unpaid orders. A production payment endpoint callable by `anon` with no throttle is a critical exposure.  
**Fix**: Move payment webhooks to a Supabase Edge Function with HMAC signature verification. Interim fix — add rate limiting inside the RPC:

```sql
-- In confirm_online_payment, add at start of BEGIN:
DECLARE
  v_rate JSONB;
BEGIN
  v_rate := check_qr_rate_limit(p_order_id::TEXT, 'confirm_online_payment', 10);
  IF NOT (v_rate->>'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('success', false, 'error', 'Rate limit exceeded');
  END IF;
  -- ... rest of function
```

Long-term: move this to an Edge Function, then revoke `anon` grant on the RPC entirely.

---

### FINDING [CRITICAL]: Blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon`

**Location**: `supabase/fix_cashier_kot_realtime.sql` line 173 and `supabase/fix_kitchen_routing_hierarchy.sql` line 232  
**Issue**: Two migration files contain `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon`. This blanket grant gives `anon` (unauthenticated) execution permission on every function in the public schema, including admin, finance, HR, and payroll RPCs, as well as any future function. This overrides all per-function restriction grants.  
**Risk**: Any unauthenticated caller can invoke any RPC — including `rpc_adjust_loyalty_coins`, `pos_close_shift`, `pos_cash_movement`, `manager_process_refund`, `reconcile_loyalty_balances`, and `cleanup_rate_limits` (can reset all counters on demand). This is the highest-risk finding in this audit.  
**Fix**: Run immediately in the Supabase SQL editor:

```sql
-- Revoke blanket grant
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Re-grant only the four functions anon legitimately needs:
GRANT EXECUTE ON FUNCTION public.check_qr_rate_limit(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.create_kiosk_order(UUID, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_session(TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_kiosk_session(UUID) TO anon;

-- Also remove the blanket grant lines from the migration files:
-- supabase/fix_cashier_kot_realtime.sql line 173
-- supabase/fix_kitchen_routing_hierarchy.sql line 232
```

---

### FINDING [HIGH]: `check_qr_rate_limit` Is Never Called Anywhere in the Codebase

**Location**: `src/services/`, `src/pages/`, `src/components/`, `src/stores/` — entire frontend/services layer  
**Issue**: The `check_qr_rate_limit` RPC (STEP 10 of `erp_security_lockdown.sql`) is granted to both `anon` and `authenticated`, but a full grep of the entire codebase returns zero calls to it. The rate limiting infrastructure exists in the database but provides zero operational protection. The `qr_rate_limits` table is always empty in production.  
**Risk**: All endpoints intended to be rate-limited have no protection. The engineering effort invested in STEP 10 provides no security value as currently deployed.  
**Fix**: Call the rate limit check from the two highest-risk frontend call sites:

```typescript
// src/services/tableAuthService.ts — before create_order_from_session:
const { data: rateCheck } = await supabase.rpc('check_qr_rate_limit', {
  p_identifier: sessionToken.substring(0, 16),
  p_endpoint: 'create_order_from_session',
  p_limit: 5
})
if (!rateCheck?.allowed) throw new Error('Too many orders. Please wait a moment.')

// src/components/touch-menu/MenuCartDrawer.vue — before create_kiosk_order:
const { data: rateCheck } = await supabase.rpc('check_qr_rate_limit', {
  p_identifier: finalTableUuid,
  p_endpoint: 'create_kiosk_order',
  p_limit: 5
})
if (!rateCheck?.allowed) throw new Error('Order rate limit reached. Please wait.')
```

Also add the check inside the SQL functions (defense-in-depth, see CRITICAL findings).

---

### FINDING [HIGH]: No Login Brute Force Lockout in Auth Flow

**Location**: `src/stores/auth.ts` lines 310–377; `src/pages/auth/LoginPage.vue` lines 234–292  
**Issue**: The `login_attempts` table exists in the DB (with `failure_reason` fields including `'account_locked'` and `'rate_limited'`) but `signIn()` never writes to it on failure and never checks prior failures before allowing the next attempt. The code sets `this.error` and returns on a bad password — allowing unlimited immediate retries. The only protection is Supabase's per-IP infrastructure limit, which does not prevent distributed brute force.  
**Risk**: Unlimited password guessing against any known email. Staff numeric PIN codes (4–6 digits via `signInWithCode`) are especially vulnerable — only 999,999 maximum combinations.  
**Fix**:

```typescript
// In signIn(), in the error block:
if (error) {
  let msg = 'Invalid email or password'
  if (error.message?.includes('Too many requests')) msg = 'Too many attempts. Try again later.'

  // Fire-and-forget: record failed attempt
  supabase.from('login_attempts').insert({
    email, attempt_type: 'login', success: false, failure_reason: 'invalid_password',
  }).then(() => {}).catch(() => {})

  // Check lockout: 5 failures in last 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('login_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('email', email).eq('success', false).gte('created_at', fifteenMinAgo)
  if ((count ?? 0) >= 5) msg = 'Account temporarily locked. Try again in 15 minutes.'

  this.error = msg
  return { data: null, error: { message: msg } }
}
```

---

### FINDING [HIGH]: `cleanup_rate_limits()` Has No pg_cron Schedule

**Location**: `supabase/erp_security_lockdown.sql` lines 695–707  
**Issue**: `cleanup_rate_limits()` is defined but never scheduled. Other modules have pg_cron jobs (biometric attendance every 5 minutes, HR payroll daily), but rate limit cleanup was never added. The `qr_rate_limits` table will grow unboundedly under sustained attack — slowing the upsert/lookup at the core of rate limit performance. If the table size limit is hit, rate limit upserts fail silently, completely disabling protection.  
**Risk**: Under active exploitation, table growth degrades rate limit query performance, ultimately disabling protection silently.  
**Fix**:

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_rate_limits_every_5min',
      '*/5 * * * *',
      'SELECT public.cleanup_rate_limits()'
    );
    RAISE NOTICE '[CRON] Rate limit cleanup scheduled every 5 minutes';
  ELSE
    RAISE WARNING '[CRON] pg_cron not available. Enable it in Supabase Dashboard > Database > Extensions';
  END IF;
END $$;
```

---

### FINDING [HIGH]: `qr_rate_limits` Published to Realtime with RLS Disabled

**Location**: `supabase/erp_security_lockdown.sql` lines 644 and 764–776  
**Issue**: `qr_rate_limits` has `DISABLE ROW LEVEL SECURITY` (line 644) but is added to the `supabase_realtime` publication (STEP 12). Any authenticated subscriber receives live events showing every identifier's `hit_count` in real time — enabling an attacker with any valid session to calibrate their attack speed to stay under the threshold.  
**Risk**: Rate limit counter exfiltration via realtime subscription. Live feedback allows attackers to precisely time requests just below the throttle limit.  
**Fix**:

```sql
-- Option A (recommended — no UI consumer needs this data):
ALTER PUBLICATION supabase_realtime DROP TABLE qr_rate_limits;

-- Option B: Enable RLS with admin-only read
-- (SECURITY DEFINER RPC still bypasses RLS for INSERT/UPDATE — check_qr_rate_limit still works)
ALTER TABLE qr_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY qrl_admin_only ON qr_rate_limits FOR SELECT USING (is_admin());
```

---

### FINDING [MEDIUM]: `create_order_from_session` Callable by `anon` with No Rate Limiting

**Location**: `supabase/create_order_from_session.sql` line 237; `supabase/fix_create_order_remove_kot.sql` line 167  
**Issue**: `create_order_from_session` is granted to `anon` and requires a valid session token. Once a QR code token is obtained (e.g., photographed from a restaurant table), it can be used to submit orders at any speed with no throttle.  
**Risk**: A photographed or shared QR code can be used to spam the kitchen with fake orders. Moderate risk since token is required but QR codes are publicly displayed at tables.  
**Fix**:

```sql
-- In create_order_from_session, early in BEGIN:
v_rate := check_qr_rate_limit(p_session_token, 'create_order_from_session', 5);
IF NOT (v_rate->>'allowed')::BOOLEAN THEN
  RETURN jsonb_build_object('success', false, 'error', 'Too many orders placed. Please wait.');
END IF;
```

---

### FINDING [MEDIUM]: `rpc_adjust_loyalty_coins` No Rate Limit and No Maximum Delta

**Location**: `src/services/loyaltyService.ts` lines 228–241  
**Issue**: `adminAdjustLoyaltyCoins()` calls `rpc_adjust_loyalty_coins` which is accessible to admin/manager. No rate limit on adjustment frequency. No maximum delta enforced at the DB level. A compromised manager account can award any number of coins to any customer, immediately and repeatedly.  
**Risk**: Fraud via coin inflation or balance zeroing by a compromised manager account. Only the audit log records the action — no real-time alert is triggered.  
**Fix**:

```sql
-- In rpc_adjust_loyalty_coins, at start of BEGIN:
IF ABS(p_delta) > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error',
        'Adjustment exceeds single-transaction limit of 10,000 coins.');
END IF;
v_rate := check_qr_rate_limit(auth.uid()::TEXT, 'rpc_adjust_loyalty_coins', 20);
IF NOT (v_rate->>'allowed')::BOOLEAN THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many adjustments. Throttled.');
END IF;
```

---

### FINDING [MEDIUM]: `pos_record_shift_payment` Has No Caller Ownership Check

**Location**: `supabase/pos_shift_management.sql` lines 256–316  
**Issue**: `pos_record_shift_payment` is granted to all `authenticated` users. It validates the shift exists and is open, but does not verify the calling user owns that shift or has manager/admin role. Any authenticated employee can inject a payment record into any open cashier shift.  
**Risk**: Insider threat — a colluding waiter or kitchen user can inflate a cashier's payment totals to help them pass reconciliation or cover a cash shortage. Shift payment records are the basis of financial variance detection.  
**Fix**:

```sql
-- In pos_record_shift_payment, after the shift NOT FOUND check:
IF v_shift.cashier_id != auth.uid()
   AND NOT public.auth_has_role('admin')
   AND NOT public.auth_has_role('manager') THEN
    RETURN jsonb_build_object('success', false,
        'error', 'You can only record payments on your own shift.');
END IF;
```

---

### FINDING [MEDIUM]: Login Error Messages Enable Email Enumeration

**Location**: `src/stores/auth.ts` lines 316–321  
**Issue**: `signIn()` returns distinct messages for distinct failures: `'Invalid email or password'` for wrong credentials vs `'Please verify your email first'` for unconfirmed accounts. The different responses reveal whether an email address exists in the system.  
**Risk**: An attacker can enumerate which email addresses have ERP accounts by observing error message differences, enabling targeted phishing and narrowing brute-force scope.  
**Fix**:

```typescript
// In signIn() error handler — one message for all non-rate-limit failures:
const msg = error.message?.includes('Too many requests')
  ? 'Too many attempts. Try again later.'
  : 'Invalid email or password'
this.error = msg
return { data: null, error: { message: msg } }
```

---

### FINDING [MEDIUM]: `delivery_tracking` INSERT Policy Open to Any Authenticated User

**Location**: `supabase/phase1_offline_sync.sql` line 440  
**Issue**: `CREATE POLICY dt_ins ON delivery_tracking FOR INSERT WITH CHECK (true)` allows any authenticated user to insert GPS coordinates for any delivery, regardless of whether they are the assigned rider.  
**Risk**: Any authenticated staff member can spoof a rider's location — making a delivery appear complete or at a different location than actual.  
**Fix**:

```sql
DROP POLICY IF EXISTS dt_ins ON delivery_tracking;
CREATE POLICY dt_ins ON delivery_tracking FOR INSERT
WITH CHECK (
    is_admin() OR is_manager()
    OR EXISTS (
        SELECT 1 FROM delivery_orders do_
        JOIN riders r ON r.id = do_.rider_id
        WHERE do_.id = delivery_tracking.delivery_id
          AND r.profile_id = auth.uid()
    )
);
```

---

### FINDING [LOW]: `cleanup_rate_limits()` Callable by Any Authenticated User

**Location**: `supabase/erp_security_lockdown.sql` line 707  
**Issue**: `GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated` allows any authenticated user to reset all rate limit counters at will, bypassing throttling between attack bursts.  
**Risk**: Authenticated insider can reset their own throttle counters on demand. Low risk since it requires any valid login, but is a valid insider-threat vector.  
**Fix**:

```sql
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;
```

---

### FINDING [LOW]: No Debounce on POS Search Inputs

**Location**: `src/pages/POSPage.vue` (no `debounce` usage found in file)  
**Issue**: No debounce on menu/product search inputs on the POS page. Each keystroke fires a Supabase query. Not an external abuse vector but adds unnecessary DB load during peak hours.  
**Fix**:

```typescript
import { debounce } from 'quasar'
const debouncedSearch = debounce((val: string) => { /* Supabase search */ }, 300)
watch(searchQuery, debouncedSearch)
```

---

### FINDING [LOW]: `eventsPerSecond: 10` Not Tuned for Kiosk/Table Devices

**Location**: `src/boot/supabase.ts` lines 31–33  
**Issue**: All client types share `eventsPerSecond: 10`. Kiosk/table devices subscribe to fewer channels and could use a lower rate to reduce aggregate Supabase realtime load as table count scales.  
**Risk**: Low — operational efficiency concern, not a security vulnerability.  
**Fix**: Detect kiosk mode and apply a lower rate:

```typescript
const isKioskMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/table-menu')
realtime: { params: { eventsPerSecond: isKioskMode ? 3 : 10 } }
```

---

## Agent 2 Summary Table

| # | Severity | Finding | Location |
|---|----------|---------|----------|
| A2-1 | CRITICAL | `create_kiosk_order` callable by `anon` with no rate limit | `supabase/create_kiosk_order.sql:106` |
| A2-2 | CRITICAL | `confirm_online_payment` callable by `anon` with no rate limit | `supabase/erp_payment_management.sql:555` |
| A2-3 | CRITICAL | Blanket `GRANT ALL FUNCTIONS TO anon` in two migration files | `fix_cashier_kot_realtime.sql:173`, `fix_kitchen_routing_hierarchy.sql:232` |
| A2-4 | HIGH | `check_qr_rate_limit` never called from any code path | Entire frontend/services codebase |
| A2-5 | HIGH | No login brute force lockout in auth flow | `src/stores/auth.ts:310–377` |
| A2-6 | HIGH | `cleanup_rate_limits()` never scheduled via pg_cron | `supabase/erp_security_lockdown.sql:695` |
| A2-7 | HIGH | `qr_rate_limits` in realtime with RLS disabled | `supabase/erp_security_lockdown.sql:644,764` |
| A2-8 | MEDIUM | `create_order_from_session` callable by `anon` with no rate limit | `supabase/create_order_from_session.sql:237` |
| A2-9 | MEDIUM | `rpc_adjust_loyalty_coins` no rate limit, no delta cap | `src/services/loyaltyService.ts:228` |
| A2-10 | MEDIUM | `pos_record_shift_payment` no caller ownership check | `supabase/pos_shift_management.sql:256` |
| A2-11 | MEDIUM | Login error messages enable email enumeration | `src/stores/auth.ts:316–321` |
| A2-12 | MEDIUM | `delivery_tracking` INSERT open to all authenticated users | `supabase/phase1_offline_sync.sql:440` |
| A2-13 | LOW | `cleanup_rate_limits()` callable by any authenticated user | `supabase/erp_security_lockdown.sql:707` |
| A2-14 | LOW | No debounce on POS search inputs | `src/pages/POSPage.vue` |
| A2-15 | LOW | `eventsPerSecond` not device-specific for kiosk clients | `src/boot/supabase.ts:31` |

**Total Agent 2: 3 CRITICAL, 4 HIGH, 5 MEDIUM, 3 LOW = 15 findings**

### Priority Remediation Order (Agent 2)

1. **Immediate** (before next deployment): Run `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon` + targeted grants. Remove blanket grant lines from the two migration files.
2. **This sprint**: Add `check_qr_rate_limit` calls inside `create_kiosk_order` and `create_order_from_session` SQL functions. Schedule `cleanup_rate_limits` via pg_cron. Remove `qr_rate_limits` from realtime publication.
3. **This sprint**: Add failed-attempt tracking and 5-attempt lockout to `signIn()`. Fix `pos_record_shift_payment` ownership check. Fix `delivery_tracking` INSERT policy. Revoke `cleanup_rate_limits` from authenticated.
4. **Next sprint**: Move `confirm_online_payment` to Edge Function with HMAC validation. Add loyalty coin adjustment delta cap and rate limit.

---

---

# MASTER SECURITY SUMMARY

> Compiled: 2026-06-23  
> Source: Agents 2, 3, 4, 5 findings + remediation sprint applied 2026-06-22/23  
> Agent 1 (RLS deep-dive) hit session limit — RLS-specific findings pending a dedicated follow-up audit.

---

## Fixes Applied in This Sprint

The following were implemented and are ready to apply or are already live:

| Fix | Status | File(s) Changed |
|-----|--------|----------------|
| Removed `.env` from git tracking | **Applied** | `git rm --cached .env` + commit `3bb7ce6` |
| `unsafe-eval` removed from CSP | **Applied** | `vercel.json`, `netlify.toml` |
| `index.html` Cache-Control no-cache | **Applied** | `vercel.json`, `netlify.toml` |
| COOP / CORP headers added | **Applied** | `vercel.json`, `netlify.toml` |
| Gemini AI domain added to connect-src | **Applied** | `vercel.json`, `netlify.toml` |
| `worker-src` / `manifest-src` added | **Applied** | `vercel.json`, `netlify.toml` |
| OAuth flow changed to PKCE for all environments | **Applied** | `src/boot/supabase.ts:24` |
| 30-min inactivity auto-logout added | **Applied** | `src/boot/auth.ts` |
| Waiter KOT channel scoped to branch | **Applied** | `src/stores/waiterAppStore.js:745` |
| KDS `orders` subscription branch filter added | **Applied** | `src/stores/kitchenDisplayStore.js:250` |
| Price validation trigger (cashier price manipulation) | **Needs DB apply** | `supabase/fix_price_and_discount_security.sql` |
| Discount ceiling trigger (cashier 100% discount) | **Needs DB apply** | `supabase/fix_price_and_discount_security.sql` |
| Manager price override RPC | **Needs DB apply** | `supabase/fix_price_and_discount_security.sql` |
| Manager discount override RPC | **Needs DB apply** | `supabase/fix_price_and_discount_security.sql` |
| REVOKE blanket anon function grants | **Needs DB apply** | `supabase/CRITICAL_fix_revoke_anon_functions.sql` |
| Targeted re-grants only for anon (4 safe functions) | **Needs DB apply** | `supabase/CRITICAL_fix_revoke_anon_functions.sql` |
| `create_kiosk_order_safe()` rate-limit wrapper | **Needs DB apply** | `supabase/CRITICAL_fix_revoke_anon_functions.sql` |

---

## SQL Files to Apply in Supabase Dashboard (in order)

Run these in the Supabase project's SQL editor in this exact order:

```
1. supabase/CRITICAL_fix_revoke_anon_functions.sql   ← APPLY FIRST (most critical)
2. supabase/fix_price_and_discount_security.sql
3. supabase/fix_journal_immutability.sql             (if exists — journal entries)
4. supabase/fix_loyalty_amount_value.sql             (if exists — loyalty fixes)
5. supabase/pos_customer_loyalty.sql                 (if exists — loyalty schema)
```

After applying #1, run the verification query:
```sql
SELECT routine_name FROM information_schema.role_routine_grants
WHERE grantee = 'anon' AND specific_schema = 'public'
ORDER BY routine_name;
```
Expected: `check_qr_rate_limit`, `create_kiosk_order`, `create_kiosk_order_safe`, `create_table_session` (and optionally `get_customer_by_phone`).

---

## Remaining Open Items (Not Yet Fixed)

### Immediate (apply before next user-facing change)

| Priority | Item | How to Fix |
|----------|------|-----------|
| CRITICAL | Apply `CRITICAL_fix_revoke_anon_functions.sql` in Supabase dashboard | Copy SQL, paste in Supabase SQL Editor, Run |
| CRITICAL | Apply `fix_price_and_discount_security.sql` | Same |
| HIGH | Rotate `.env` credentials — Supabase anon key + Google Maps key were in git history | Supabase dashboard → Settings → API → Regenerate; GCP console → regenerate Maps key |

### This Sprint

| Priority | Item | Location |
|----------|------|---------|
| HIGH | Add `check_qr_rate_limit` call inside `create_kiosk_order` SQL function | `supabase/create_kiosk_order.sql` — add at function entry |
| HIGH | Add `check_qr_rate_limit` call inside `create_order_from_session` | `supabase/create_order_from_session.sql` |
| HIGH | Add `check_qr_rate_limit` call inside `confirm_online_payment` | `supabase/erp_payment_management.sql` |
| HIGH | Schedule `cleanup_rate_limits()` via pg_cron | Supabase dashboard → Extensions → pg_cron, then run: `SELECT cron.schedule('cleanup-rate-limits', '*/10 * * * *', 'SELECT cleanup_rate_limits()')` |
| HIGH | Remove `qr_rate_limits` from realtime publication | `ALTER PUBLICATION supabase_realtime DROP TABLE qr_rate_limits;` |
| HIGH | Add login brute-force lockout (5 attempts / 15 min) | `src/stores/auth.ts:310` — add failed-attempt logging |
| HIGH | Fix `pos_record_shift_payment` ownership check | `supabase/pos_shift_management.sql:256` — verify `cashier_id = auth.uid()` |
| HIGH | Fix `delivery_tracking` INSERT policy | `supabase/phase1_offline_sync.sql:440` — restrict to assigned rider |
| MEDIUM | Fix `channel.registry.ts:107` — wrong table name `'tables'` vs `'restaurant_tables'` | `src/core/realtime/channel.registry.ts:107` |
| MEDIUM | Fix `cashierStore.js` channel name — remove `Date.now()` to avoid orphaned channels | `src/stores/cashierStore.js:505` |
| MEDIUM | Revoke `cleanup_rate_limits()` from `authenticated` → `service_role` only | SQL: `REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM authenticated; GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO service_role;` |
| MEDIUM | Fix login error message — unify to one message to prevent email enumeration | `src/stores/auth.ts:316–321` |
| MEDIUM | Remove `no-sandbox` Electron flag | `src-electron/electron-main.js:31` |
| MEDIUM | Add default `.limit()` to all unbounded queries (orders, finance, AI) | `src/stores/orders.js`, `finance-ledger.service.js`, `ai.service.js` |

### Next Sprint

| Priority | Item | Location |
|----------|------|---------|
| HIGH | Move `confirm_online_payment` to Edge Function with HMAC webhook signature verification | New: `supabase/functions/confirm-payment/` |
| HIGH | Add loyalty coin adjustment delta cap (10,000 coins/tx) and rate limit | `supabase/customer_loyalty_system.sql` — `rpc_adjust_loyalty_coins()` |
| MEDIUM | Consolidate dual realtime systems — remove ad-hoc store channels, route through `RealtimeManager` | All stores that call `supabase.channel()` directly |
| MEDIUM | Fix heartbeat stale-channel reconnection in `realtime.manager.ts:410` | Add `this.resubscribe(key)` on stale detection |
| MEDIUM | Dynamic import for `jsPDF` / `ExcelJS` in Finance Reports | `src/pages/finance/FinanceReportsPage.vue:573` |
| MEDIUM | Add Sentry error monitoring | `src/boot/error-handler.ts` |
| LOW | Remove `X-XSS-Protection` header (deprecated) | Already done in `vercel.json`/`netlify.toml` — verify no other config sets it |
| LOW | Add `nodeIntegration: false` explicitly in Electron `webPreferences` | `src-electron/electron-main.js:100` |
| LOW | Add `.env.example` with all required keys, no values | Project root |
| LOW | Purge `.env` credentials from git history with `git filter-repo` | After credential rotation |

---

## Consolidated Risk Count (All Agents)

| Severity | Agent 2 | Agent 3 | Agent 4 | Agent 5 | **Total** | **Fixed** | **Remaining** |
|----------|---------|---------|---------|---------|-----------|-----------|---------------|
| CRITICAL | 3 | 2 | 0 | 0 | **5** | 3 | 2 |
| HIGH | 4 | 4 | 6 | 2 | **16** | 6 | 10 |
| MEDIUM | 5 | 7 | 6 | 0 | **18** | 4 | 14 |
| LOW | 3 | 5 | 4 | 0 | **12** | 2 | 10 |
| **Total** | **15** | **18** | **16** | **2** | **51** | **15** | **36** |

> Note: Agent 1 (RLS audit) was not completed — additional findings expected from a dedicated RLS review.

---

## Top 5 Highest-Impact Actions Remaining

1. **Apply `CRITICAL_fix_revoke_anon_functions.sql`** — this single file fixes 3 CRITICAL findings. Takes 30 seconds to apply in Supabase SQL editor.
2. **Rotate compromised credentials** — Supabase anon key + Google Maps key are in git history. Anyone with a past clone has them permanently.
3. **Add rate limiting inside SQL functions** — `check_qr_rate_limit()` is deployed but never called. Wire it into `create_kiosk_order`, `create_order_from_session`, and `confirm_online_payment`.
4. **Apply `fix_price_and_discount_security.sql`** — prevents cashiers from setting any price or discount at the DB level. No frontend change required.
5. **Schedule `cleanup_rate_limits()`** — rate limiting will fail under sustained attack without this cron job.

