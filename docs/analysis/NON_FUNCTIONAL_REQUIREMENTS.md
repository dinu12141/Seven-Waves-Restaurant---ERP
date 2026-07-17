# Non-Functional Requirements
## Seven Waves Restaurant ERP
**Version:** 1.0 | **Date:** 2026-07-16 | **Author:** Analyst Agent

---

## 1. Performance Requirements

### NFR-P01 — Page Load Time
- Initial app load (cold): ≤ 3 seconds on 4G connection (10 Mbps)
- Subsequent route navigation: ≤ 500ms (SPA, already loaded)
- POS order send: ≤ 2 seconds end-to-end (cart → DB confirmation)
- **Current status:** Partial — auth cache (`erp_auth_v2_<uid>`) reduces login to single network call; no performance monitoring instrumented

### NFR-P02 — Realtime Latency
- KOT ticket appears on KDS: ≤ 1 second after waiter accepts order
- Order status change propagates to customer tracking: ≤ 2 seconds
- **Current status:** Dependent on Supabase Realtime; no SLA instrumentation

### NFR-P03 — Concurrent Users
- The system must support ≥ 50 concurrent authenticated users per branch
- Across all branches of one company: ≥ 500 concurrent users
- **Current status:** Supabase (Pro plan) handles 500+ concurrent Postgres connections; Supabase Realtime handles 200+ concurrent channel subscriptions per project

### NFR-P04 — Throughput
- POS transactions: ≥ 200 orders/hour per branch without degradation
- Report generation: Any report covering 1 year of data must complete in ≤ 10 seconds
- **Current status:** Not load-tested; `erp_reporting_module.sql` RPCs are unindexed for some date-range queries

### NFR-P05 — Database Query Performance
- All primary-path queries (order creation, KOT dispatch, payment) must complete in ≤ 100ms at DB level
- OLAP report queries may take up to 5 seconds but must not block OLTP transactions
- **Current status:** Critical path uses RPCs with pg transactions; no EXPLAIN ANALYZE benchmarks documented

### NFR-P06 — Offline Resilience
- POS must queue orders locally (IndexedDB via `OfflineSyncEngine`) when network is unavailable and auto-sync on reconnect
- **Current status:** `src/core/offline/` and `OfflineSyncEngine` exist; integration with `orderStore` is incomplete — orders that fail will not be queued offline

---

## 2. Security Requirements

### NFR-S01 — Authentication
- All API calls must use Supabase JWT bearer tokens (no API key exposure to client)
- Session tokens must be stored in memory / `supabase-auth-token` (httpOnly cookie by default); not in `localStorage`
- **Current status:** Supabase handles JWT; `erp_auth_v2_*` cache in `localStorage` stores roles/permissions (NOT tokens) — acceptable

### NFR-S02 — Authorization (RBAC)
- Every DB table must have Row-Level Security (RLS) enabled
- All RLS policies must enforce `company_id` and `branch_id` scoping
- **Current status:** Partial — `rls_restaurant_flow.sql` covers core tables; some tables in `devices/`, `ai/` modules lack RLS verification

### NFR-S03 — Brute-Force Protection
- Login: max 5 failed attempts → 15-minute lockout (per email)
- **Current status:** Existing — dual guard at `src/stores/auth.ts:348` (module-level) and `src/core/security/rateLimiter`; lockout state is in-memory only (resets on page refresh — gap)

### NFR-S04 — Input Sanitization
- All user inputs must be sanitized before DB write
- Passwords must NEVER be HTML-escaped (breaks valid special characters)
- **Current status:** `sanitizeValue()` applied to email only in `auth.ts:335` (correct — password left raw)

### NFR-S05 — SQL Injection Prevention
- All DB access via Supabase client (parameterized queries) or RPC (server-side PL/pgSQL)
- No raw SQL string concatenation in client code
- **Current status:** Existing — no raw SQL in client found; all via `.from()` or `.rpc()`

### NFR-S06 — XSS Prevention
- Vue 3 auto-escapes template expressions; `v-html` must not be used with user content
- Content Security Policy (CSP) headers must be set
- **Current status:** Partial — `src/core/security/cspHeaders.ts` exists; CSP not verified on Netlify headers

### NFR-S07 — Payment Security
- Payment confirmation must be server-side only (via `process_cashier_payment` RPC)
- No payment amounts or methods should be trusted from client payload for final settlement
- **Current status:** Existing — payment goes through `process_cashier_payment` RPC after commit `3fd6c9c`

### NFR-S08 — Sensitive Data
- No credentials, API keys, or secrets in source code or `CLAUDE.md`
- `.env` must not be committed to git
- **Current status:** `.env` removed from tracking (commit `3bb7ce6`); Supabase token in `.claude/settings.json` only

### NFR-S09 — PCI-DSS Compliance
- Card payment data must never transit the application server
- Use a compliant payment gateway (Stripe, PayHere for LK) for card processing
- **Current status:** Missing — no payment gateway integrated; card handling undefined

### NFR-S10 — Audit Logging
- All privileged actions (role changes, payment voids, price changes, login) must be logged with user, timestamp, and before/after values
- **Current status:** Partial — login audit exists; finance journal is immutable; price/role change logs partial

---

## 3. Availability Requirements

### NFR-A01 — Uptime SLA
- Production system target: 99.5% uptime (≈ 44 hours downtime/year)
- Core POS and KDS must have ≥ 99.9% availability (≈ 8.7 hours/year)
- **Current status:** Dependent on Supabase (Pro plan SLA: 99.9%) and Netlify (99.99%)

### NFR-A02 — Graceful Degradation
- If Supabase Realtime disconnects, KDS must fall back to polling (30-second interval)
- If network is lost, POS must continue in offline mode for ≥ 4 hours
- **Current status:** Offline fallback partially implemented; KDS polling fallback not implemented

### NFR-A03 — Maintenance Windows
- Maintenance must be schedulable during off-peak hours (2 AM – 6 AM local time)
- Planned downtime must be communicated ≥ 24 hours in advance
- **Current status:** No maintenance mode or announcement mechanism

### NFR-A04 — Failover
- DB failover handled by Supabase (managed Postgres with automated failover)
- Frontend failover handled by Netlify CDN (multi-region)
- **Current status:** Handled by infrastructure providers; no custom failover logic needed

---

## 4. Scalability Requirements

### NFR-SC01 — Horizontal Scaling
- The SPA frontend is stateless; can be served from CDN globally
- Supabase handles DB read replicas for heavy report queries
- **Current status:** Netlify CDN for SPA — inherently scalable

### NFR-SC02 — Multi-Branch Growth
- System must support ≥ 100 branches per company without architectural changes
- **Current status:** `company_id` + `branch_id` on all tables supports this; `auth_branch_ids()` RPC used in RLS

### NFR-SC03 — Data Volume
- Orders table must perform at 10 million+ rows without query degradation
- Critical indexes: `orders(branch_id, created_at)`, `order_items(order_id)`, `kot_tickets(kitchen_id, status)`
- **Current status:** Indexes exist on core columns; `supabase/schema.sql` defines them; partitioning not implemented

### NFR-SC04 — Realtime Channel Limits
- Supabase Realtime: max 200 concurrent channels per project (Pro plan)
- Each branch with active KDS + waiter + cashier uses ~5 channels; 40 active branches = 200 channels = at limit
- **Current status:** Risk — no channel pooling strategy implemented; each PWA opens its own channel

---

## 5. Usability Requirements

### NFR-U01 — Accessibility (WCAG 2.1 AA)
- All interactive elements must have ARIA labels
- Color contrast ratio ≥ 4.5:1 for normal text, ≥ 3:1 for large text
- Keyboard navigation must work for all POS and KDS flows
- **Current status:** Quasar components provide baseline ARIA; custom components not audited

### NFR-U02 — Mobile Responsiveness
- Waiter PWA (`/waiter-app`): optimized for 5–6 inch mobile screens
- Manager PWA (`/manager-app`): optimized for 7–10 inch tablets
- Delivery PWA (`/delivery-app`): optimized for 5–6 inch mobile
- Touch Kiosk (`/touch`): optimized for 10–15 inch tablets
- **Current status:** Separate layouts exist for each; responsive breakpoints not audited

### NFR-U03 — Internationalization (i18n)
- System must support Arabic, Sinhala, Tamil (RTL + LTR)
- All user-facing strings must be externalizable
- **Current status:** Missing — no i18n setup (vue-i18n) found; strings are hardcoded in English

### NFR-U04 — Touch Optimization
- All KDS and POS interactions on tablets must use ≥ 44px touch targets
- **Current status:** Quasar defaults to large touch targets; not verified per spec

### NFR-U05 — Error Messages
- All error states must show actionable user messages (not raw error codes)
- **Current status:** Partial — some errors show Supabase raw messages; `ErrorHandler` in `src/core/errors/` partially used

---

## 6. Reliability Requirements

### NFR-R01 — Mean Time Between Failures (MTBF)
- Target MTBF for POS order flow: ≥ 720 hours (30 days without user-facing failures)
- **Current status:** No incident tracking in place; cannot be measured currently

### NFR-R02 — Mean Time to Recovery (MTTR)
- Critical failures (POS down, KDS down): ≤ 30 minutes
- **Current status:** No runbook or escalation process documented

### NFR-R03 — Data Integrity
- Orders must never be created without matching `order_items`
- Manual rollback pattern in `orderStore.js:210` deletes orphaned order if items insert fails
- Finance journal entries must never be deleted; only reversed
- **Current status:** Mostly existing; rollback is best-effort (network failure during delete would leave orphan)

### NFR-R04 — Transaction Atomicity
- KOT generation, cashier queue creation, and inventory deduction must be atomic
- **Current status:** Existing — all via server-side RPC transactions (`process_waiter_accept`, `process_cashier_payment`)

---

## 7. Maintainability Requirements

### NFR-M01 — Code Coverage
- Unit test coverage target: ≥ 60% for core business logic (`src/core/`, `src/services/`)
- **Current status:** Tests exist in `__tests__/` folders per module; coverage not measured

### NFR-M02 — Type Safety
- All new TypeScript files must pass `vue-tsc --noEmit --skipLibCheck`
- JavaScript files in `src/stores/` and `src/services/` should be migrated to TypeScript
- **Current status:** Partial — `auth.ts`, `tableSessionStore.ts` are TS; most stores are `.js`

### NFR-M03 — Documentation
- Each service/store must have JSDoc comments for public functions
- CLAUDE.md provides architecture guidance
- **Current status:** Partial — key files have comments; API layer underdocumented

### NFR-M04 — Linting & Formatting
- ESLint + Prettier enforced via `npm run lint` and `npm run format`
- **Current status:** Config exists (`eslint.config.js`); pre-commit hook not configured

### NFR-M05 — Dependency Management
- No critical security vulnerabilities in npm packages (checked via `npm audit`)
- Dependencies should be pinned or range-locked in `package.json`
- **Current status:** Not audited in this review

### NFR-M06 — SQL Migration Strategy
- All SQL changes must be applied as discrete `.sql` files in `supabase/`
- No breaking schema changes without a corresponding rollback script
- **Current status:** Existing pattern — files accumulate in `supabase/`; no migration runner or versioning

---

## 8. Compliance & Regulatory Requirements

### NFR-C01 — Data Privacy (GDPR / PDPA)
- Customer PII must be encrypted at rest (Supabase handles disk encryption)
- Right to erasure: customer data deletion must cascade properly
- **Current status:** Supabase disk encryption active; `ON DELETE CASCADE` on profiles table

### NFR-C02 — Financial Records Retention
- Finance vouchers and journal entries must be retained for ≥ 7 years (Sri Lanka Inland Revenue)
- **Current status:** No automated archival; records remain in live DB indefinitely

### NFR-C03 — Tax Compliance
- System must generate VAT-compliant invoices (15% VAT in Sri Lanka)
- **Current status:** `TaxPage.vue` exists; VAT calculation in schema; invoice format not verified per IRD requirements
