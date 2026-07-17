# Engineering Roadmap
## Seven Waves Restaurant ERP
**Version:** 1.0  
**Date:** 2026-07-16  
**Author:** Architecture Team

---

## Phase 0: Critical Fixes (Weeks 1–3)

**Goal:** Eliminate production risks before any new feature work.

### P0-1: Security — Reduce Auth Cache TTL (HIGH)
**File:** `src/stores/auth.ts:110`  
**Issue:** Roles cached for 24 hours. Revoked users retain access.  
**Fix:** Change `86_400_000` to `300_000` (5 minutes) for roles cache.  
**Effort:** 1 hour  
**Acceptance:** Revoked user cannot access privileged route within 5 minutes.

### P0-2: Security — Fix `@ts-ignore` in Route Guards (HIGH)
**File:** `src/boot/auth.ts:155, 171, 185`  
**Issue:** Type safety bypassed in security-critical guard.  
**Fix:** Extend `vue-router` module with typed `RouteMeta` interface.  
**Effort:** 2 hours  
**Acceptance:** No `@ts-ignore` in `src/boot/auth.ts`; `npm run type-check` passes.

### P0-3: Architecture — Eliminate Dual Realtime Systems (HIGH)
**Files:** `src/stores/waiterOrderStore.js`, `src/stores/waiterAppStore.js`, `src/stores/kitchenDisplayStore.js`  
**Issue:** Ad-hoc store subscriptions duplicate `RealtimeManager` channels.  
**Fix:** Remove store-level `subscribeToOrders()` calls; route events through `EVENT_HANDLER_MAP` in `RealtimeManager`.  
**Effort:** 1 day  
**Acceptance:** Only one WebSocket channel per table per branch. No duplicate events in KDS.

### P0-4: Architecture — Remove Dead Code (LOW)
**File:** `src/pages/hr/EmployeesPage.old.vue`  
**Fix:** Delete file.  
**Effort:** 5 minutes

### P0-5: Architecture — Add Migration Ledger (HIGH)
**Fix:** Create `applied_migrations` table in Supabase; document which SQL files are applied.
```sql
CREATE TABLE IF NOT EXISTS applied_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now(),
  applied_by TEXT
);
```
**Effort:** 2 hours  
**Acceptance:** All existing SQL files recorded in ledger.

### P0-6: Architecture — Create Missing Offline RPCs (HIGH)
**File:** `src/core/offline/OfflineSyncEngine.ts:139`  
**Issue:** `offline_sync_{module}_{action}` RPCs don't exist; offline sync always fails.  
**Fix:** Create at minimum:
- `offline_sync_pos_create_order`
- `offline_sync_waiter_accept_order`
- `offline_sync_pos_void_order`  
**Effort:** 1 day  
**Acceptance:** POS order created offline syncs to DB on reconnect.

### P0-7: Architecture — Add Branch Switching (MEDIUM)
**File:** `src/stores/auth.ts:685`  
**Issue:** Multi-branch users cannot switch branches.  
**Fix:** Add `switchBranch(branchId: string)` action; add branch selector component in header.  
**Effort:** 4 hours  
**Acceptance:** User with 2 branches sees a branch selector; switching updates `currentBranch` and re-subscribes realtime channels.

### P0-8: Infrastructure — Setup GitHub Actions CI (HIGH)
**Fix:** Add `.github/workflows/ci.yml` with lint, type-check, test, and staging deploy.  
**Effort:** 4 hours  
**Acceptance:** PRs to `main` are blocked without passing CI.

### P0-9: Infrastructure — Add Error Monitoring (HIGH)
**Fix:** Add Sentry Vue SDK (`@sentry/vue`), initialize in `src/boot/` with DSN from environment.  
**Effort:** 2 hours  
**Acceptance:** Unhandled errors appear in Sentry dashboard.

### P0-10: Infrastructure — Add Uptime Monitoring (MEDIUM)
**Fix:** Configure Uptime Robot to ping `https://seven-waves.netlify.app` every 5 minutes.  
**Effort:** 30 minutes

---

## Phase 1: Foundation Hardening (Weeks 4–8)

**Goal:** Make the system production-grade for 3–5 branch deployments.

### P1-1: Cloudflare Integration
- Proxy Netlify through Cloudflare (DNS-level)
- Enable WAF rules for OWASP Top 10
- Add rate limiting rule: `POST /auth/v1/token` → 5 req/min per IP
- Enable HSTS, CSP headers at Cloudflare
- **Effort:** 1 day
- **Acceptance:** DDoS test blocked at Cloudflare; no traffic hits Netlify origin directly.

### P1-2: Add `company_id` to Operational Tables
- Migrate `orders`, `kot_tickets`, `delivery_orders`, `inventory_adjustments` to add `company_id`
- Update RLS policies to filter by `company_id`
- **Effort:** 3 days (DB migration + RLS + testing)
- **Acceptance:** User from Company A cannot see Company B's orders, even with direct API call.

### P1-3: Consolidate Auth Methods
- Merge `_backgroundFetchUserData` and `_backgroundRefreshUserData` into one method
- **File:** `src/stores/auth.ts:240-262`
- **Effort:** 2 hours

### P1-4: Complete Offline-First POS
- Implement offline RPCs (P0-6 prerequisite)
- Add offline sync UI banner in POS layout
- Add conflict detection in sync RPC (idempotency key)
- **Effort:** 3 days
- **Acceptance:** POS can create 50 orders offline; all sync correctly on reconnect.

### P1-5: E2E Testing (Critical Path)
- Setup Playwright
- Tests:
  - Login as cashier → Create POS order → Process payment
  - Login as waiter → Accept order → KDS shows KOT
  - QR scan → Customer order → Waiter inbox
- **Effort:** 3 days
- **Acceptance:** E2E suite runs in < 5 minutes; 0 flaky tests.

### P1-6: Staging Environment
- Create a separate Supabase project for staging
- Configure Netlify staging site with staging env vars
- Apply all SQL migrations to staging first
- **Effort:** 1 day

### P1-7: Performance Baseline
- Measure and document P50/P95 response times for:
  - POS order creation
  - KOT dispatch latency
  - Report generation
- Set up Supabase slow query log alerts (> 500ms)
- **Effort:** 1 day

---

## Phase 2: Feature Completion (Weeks 9–20)

**Goal:** Complete all 20 modules to production-ready standard.

| Module | Status | Estimated Effort | Notes |
|--------|--------|-----------------|-------|
| POS | ~80% | 2 weeks | Offline sync, split payments, partial void |
| KDS | ~85% | 1 week | Priority escalation, prep time tracking |
| Waiter App | ~75% | 1 week | Branch switching, notification center |
| Inventory | ~70% | 2 weeks | Reorder alerts, BOM finalization |
| Finance | ~65% | 3 weeks | Financial statements, bank recon |
| HR & Payroll | ~60% | 3 weeks | Leave management, commission |
| Procurement | ~55% | 2 weeks | PO approval workflow, supplier portal |
| Delivery | ~65% | 2 weeks | Live GPS, rider tracking |
| CRM / Loyalty | ~70% | 1 week | Campaign management |
| AI Module | ~50% | 2 weeks | Forecast accuracy, anomaly config |
| Reports | ~80% | 1 week | Schedule reports, email export |
| Device Mgmt | ~60% | 1 week | Biometric sync, printer health |
| Website/Reservations | ~40% | 1 week | Reservation calendar |
| Manager PWA | ~60% | 1 week | Real-time KPIs |
| Notifications | ~70% | 1 week | Push notifications (PWA) |
| Touch Kiosk | ~70% | 1 week | Payment integration |
| Customer Menu | ~60% | 1 week | Order tracking |
| Admin / RBAC | ~80% | 1 week | Custom role editor |
| Offline Sync | ~30% | 2 weeks | Offline RPCs, conflict resolution |
| Multi-language | ~30% | 2 weeks | Arabic, Sinhala translation strings |

**Phase 2 Total Estimated Effort:** ~32 developer-weeks

---

## Phase 3: Scale & Intelligence (Weeks 21–32)

**Goal:** Prepare for 50+ branch operations and AI-driven intelligence.

### P3-1: Message Queue for KOT Dispatch
- Evaluate: Inngest, pg_net workers, or Supabase Edge Functions
- Decouple KOT generation from synchronous trigger chain
- **Benefit:** Handle 500+ concurrent orders without DB lock contention
- **Effort:** 2 weeks

### P3-2: Read Replica for Reports
- When Supabase offers read replicas (in roadmap): route all `erp_reporting_module.sql` queries to read replica
- **Benefit:** Report queries don't impact POS write path
- **Effort:** 3 days

### P3-3: Cloudflare KV Cache for Menu
- Cache menu items (category + items) in Cloudflare KV (edge cache)
- Invalidate on menu update via Supabase webhook → Cloudflare API
- **Benefit:** Menu loads in < 50ms globally vs. 200-400ms from Supabase
- **Effort:** 1 week

### P3-4: AI Expansion
- Integrate Gemini for: demand forecasting, waste prediction, staff scheduling optimization
- Build AI recommendation engine for procurement (auto-suggest PO quantities)
- **Effort:** 3 weeks

### P3-5: Multi-Currency Support
- Add `currency` and `exchange_rate` to company settings
- Update finance module to handle conversion
- **Effort:** 2 weeks

### P3-6: Franchise Module
- Royalty calculations
- Brand-level reporting across franchisees
- Centralized menu management with branch overrides
- **Effort:** 4 weeks

---

## Phase 4: Enterprise Features (Weeks 33–48)

### P4-1: Marketplace Integration
- UberEats, Grab, foodpanda webhook receivers
- Order normalization into ERP order flow
- **Effort:** 3 weeks

### P4-2: Custom Role Builder
- UI for creating custom roles with granular permission matrix
- DB-stored role definitions
- **Effort:** 2 weeks

### P4-3: Multi-Region Supabase
- Evaluate Supabase multi-region (if available) or self-hosted on AWS/GCP for < 50ms latency in all regions
- **Effort:** 4 weeks

### P4-4: Advanced Analytics
- Business Intelligence dashboard with drill-down
- Custom report builder (no-code)
- Scheduled PDF/Excel reports via email
- **Effort:** 3 weeks

### P4-5: API for Third Parties
- Public REST API (OAuth 2.0) for accounting integrations (QuickBooks, Xero)
- Webhook system for order/payment events
- **Effort:** 3 weeks

---

## Milestones & Acceptance Criteria

| Milestone | Date Target | Criteria |
|-----------|------------|---------|
| M0: Critical Fixes Done | Week 3 | All P0 items resolved; CI running; error monitoring live |
| M1: Staging Live | Week 8 | Staging env with data parity; E2E suite green |
| M2: Beta Launch (3 branches) | Week 14 | POS, KDS, Waiter App, Cashier, Finance v1 complete |
| M3: Full Module Launch | Week 24 | All 20 modules production-ready |
| M4: 50-Branch Scale | Week 36 | Load test: 500 concurrent orders; P95 < 1s |
| M5: Enterprise Ready | Week 48 | Marketplace integration; custom roles; BI dashboard |

---

## Team Composition Recommendation

| Role | Count | Responsibilities |
|------|-------|----------------|
| Tech Lead / Architect | 1 | Architecture decisions, code review, DB design |
| Senior Frontend Engineer | 2 | Vue 3 components, Pinia stores, PWA |
| Senior Backend / DBA | 1 | PostgreSQL RPCs, triggers, RLS, migrations |
| Full-Stack Engineer | 2 | Feature modules (finance, HR, procurement) |
| DevOps Engineer | 1 (part-time) | CI/CD, Cloudflare, monitoring |
| QA Engineer | 1 | Vitest, Playwright, UAT coordination |
| UI/UX Designer | 1 (part-time) | Component design, UX flows |
| **Total** | **8–9** | |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Supabase outage | Low | Critical | DR plan, read replicas, status page alerts |
| DB trigger bottleneck at scale | Medium | High | Message queue (Phase 3); load testing |
| Auth cache stale roles | High (currently) | High | P0-1: Reduce TTL to 5 min |
| Missing offline RPCs cause silent data loss | High (currently) | High | P0-6: Create offline RPCs immediately |
| Security breach via exposed anon key | Medium | Critical | Cloudflare WAF; origin restriction |
| Team bus factor (single developer) | High | High | Documentation; pair programming |
| PostgreSQL RLS misconfiguration | Medium | Critical | Automated RLS testing in CI |
| Scope creep on Phase 2 | High | Medium | Strict sprint planning; feature flags |
| Gemini API cost overrun | Medium | Medium | Usage limits in Edge Function; caching |
| Legacy SQL file order confusion | High | High | Migration ledger (P0-5) |

---

## Definition of Done (per feature)

A feature is considered complete when:
1. Functional: all acceptance criteria met
2. Tests: unit tests pass (`vitest`), E2E happy path added to Playwright
3. Types: `npm run type-check` passes with no errors
4. Lint: `npm run lint` passes
5. Security: RLS policies in place if new DB table added
6. Migration: SQL file added and recorded in `applied_migrations`
7. Review: tech lead code review approved
8. Staging: deployed and verified on staging environment
9. Docs: CLAUDE.md updated if architecture changes
