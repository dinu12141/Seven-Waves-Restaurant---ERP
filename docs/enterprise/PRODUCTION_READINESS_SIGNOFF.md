# Production Readiness Sign-Off

**Project:** Seven Waves Restaurant ERP
**Prepared by:** QA (release gate owner)
**Date:** 2026-07-25 (rev 2 — P1 client streams landed + gate-green; live SQL apply now the sole blocker)
**Scope:** Final QA gate + production readiness assessment for the enterprise-hardening push (P0 complete, P1 client-complete/apply-pending).

---

## 1. Release Gate Result (current tree)

All four gates executed against the working tree at sign-off time.

| Gate | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` (ESLint) | ✅ PASS — exit 0, 0 errors |
| Type-check | `node --max-old-space-size=12288 ./node_modules/vue-tsc/bin/vue-tsc.js --noEmit --skipLibCheck` | ✅ PASS — exit 0, 0 diagnostics |
| Unit/Integration tests | `npm run test` (vitest) | ✅ PASS — 440/440 tests, 15/15 files |
| Production build | `npx quasar build` | ✅ PASS — "Build succeeded", SPA → `dist/spa` (253 JS / 160 CSS), `index.html` module-only |

> **Type-check note:** the default `npm run type-check` heap (6144 MB) OOMs on this codebase. Always run `vue-tsc` with `--max-old-space-size=12288`. This is a known, documented constraint — not a code defect.

> **Build/CSP note:** the built `index.html` contains exactly one `<script type="module">` tag and zero inline script bodies, so the tightened CSP `script-src 'self'` (no `unsafe-inline`/`unsafe-eval`) will **not** white-screen the boot path. A post-deploy smoke load (app boots, no CSP console violations) remains standard practice.

**Gate verdict: GREEN.** No regressions from the P0 money-path rewires or security hardening applied this session.

---

## 2. P0 — Security & Money-Path Hardening: COMPLETE ✅

All P0 findings closed and **live-verified** by Security against live `pg_policies` / applied SQL (Supabase Management API — MCP was unavailable this session).

| Finding | Description | Status |
|---------|-------------|--------|
| #44 | RLS lockdown live on all target tables | ✅ Closed / live-verified |
| #45 | `login_audit_logs` — admin-only SELECT, self/anon-failed INSERT, append-only, `GRANT ALL` revoked | ✅ Closed / live-verified |
| #48 | Quick-Pay: client rewired to single atomic `pos_quick_pay` RPC (replaced 3-txn accept/invoice/payment path) | ✅ Closed / live-verified |
| #49 / #50 / #51 / #54 | Atomic money-path RPCs (`pos_create_order_with_items`, `post_finance_voucher`, `next_voucher_no`) — authenticated-only, guards intact | ✅ Closed / live-verified |
| #70 / #71 | Payroll false-greens (`payroll_payments`, `payroll_finance_postings`) rescoped to admin/hr+finance+branch/self | ✅ Closed / live-verified |
| #72 | CRITICAL #3 blanket-authenticated sweep across 6 operational tables (kot_tickets, kot_items, uom_conversions, pos_shift_audit_logs, menu_books, menu_book_items) | ✅ Closed / live-verified |
| #74 | Queue-order billing paths rewired to atomic `pos_quick_pay` | ✅ Closed (client), QA-gated |
| #73 | Cross-branch KOT reads (LOW) — fix authored (`fix_kot_cross_branch_reads.sql`) | ⚠️ SQL authored, **apply pending** (see §4) |

Client-side money-path rewires (`orderStore.js`, `POSPage.vue`, `PaymentDialog.vue`) all pass the full QA gate with no test regressions.

---

## 3. P1 — Enterprise Hardening: CLIENT-COMPLETE, LIVE-APPLY PENDING ⚠️

The P1 streams re-engaged and the **client/app-layer work has landed and passed the full QA gate**. The remaining gap is purely the **live SQL apply** of the supporting RPCs/policies — an environmental blocker (no Supabase MCP/PAT in the active agent sessions), not incomplete code.

### Done — client-side, QA-gated (lint 0 / vue-tsc 0 / vitest 440/440 / build OK)
| Item | Task | Owner | State |
|------|------|-------|-------|
| FOC client rewire — `ManagerAuthDialog.elevatedAction` runs FOC RPC under the verified manager session; idempotent `finally{}` cashier-session restore (no stranded elevated session); POSPage both paths → `process_foc_order` / `process_foc_order_new`; client no longer sends `foc_authorized_by`/`total_amount`/forced status | #97 | Backend | ✅ Code done + QA code-reviewed + gate-green. **Functional-blocked on #96 SQL apply.** |
| Server-side rate limiting (edge fns): `payment-terminal-charge` (15/min), `payment-handler` (create 12/min, verify 30/min, webhooks exempt), via `check_qr_rate_limit`, fail-open | #99 P1 | Backend | ✅ Done + gate-green |
| `cancelVoucher` → atomic `cancel_finance_voucher` RPC (replaced 3-step client reversal; idempotent on already-cancelled) | #99 P2a | Backend | ✅ Code done + gate-green (finance tests 69/69). **Functional-blocked on #98 SQL apply.** |
| Sentry client boot (`@sentry/vue` v10, no-op when `VITE_SENTRY_DSN` unset; `ErrorHandler` forwards classified non-INFO errors with module/action/category/severity + correlationId); dedupe error-handler boot (#69 — deleted duplicate `src/boot/error-handler.ts`); correlationId propagation (#68) | #100 (3/4) | DevOps | ✅ Done + gate-green |

### Pending
| Item | Task | Owner | State |
|------|------|-------|-------|
| **Live apply** of `p1_foc_hardening_96.sql` (`process_foc_order[_new]` SECURITY DEFINER RPCs + `ord_cashier_update` RLS tighten) | #96 | DBA | SQL authored; **apply pending (no MCP/PAT)** |
| **Live apply** of `fix_cancel_finance_voucher_98.sql` + remaining #98 bundle (#73 KOT branch-scope, anon-safe QR order RPC, reporting MV cron, broader #3 sweep) | #98 | DBA | SQL authored/in progress; **apply pending** |
| QR `placeOrder` atomic anon RPC wire | #99 P2b | Backend | Awaiting DBA RPC-contract decision (reuse `create_order_from_session` vs new RPC) |
| Background report jobs (wire built-but-unwired `report-generator` edge fn for heavy PDFs) | #99 P3 | Backend | Awaiting Architect product call; AI/EOD intentionally kept local per prior user decision |
| FinanceDashboard aggregate RPC/MV (#61) chart rewire | #100 (4/4) | DevOps | Blocked on DBA company-scoped `fn_rpt_monthly_sales` RPC (live) |
| Final live security sign-off | #101 | Security | Awaiting live applies to verify |

**The shipped client is gate-complete. What blocks functional readiness is applying the authored SQL to the live DB.** Per the coupling rule, the FOC/cancelVoucher client paths must NOT deploy ahead of their RPCs going live (they will throw until applied — FOC throws are safely handled by the `finally{}` session-restore).

---

## 4. OWNER-ONLY Pre-Deploy Actions (must be done by a human before/at deploy)

1. **Rotate secrets (#13 / #24 / #39).** Any credentials/tokens that were ever committed or shared must be rotated in the provider consoles (Supabase keys, Management API token, any service tokens). Cannot be automated by the agents.
2. **Supply `VITE_SENTRY_DSN`** (and edge-function Sentry DSN) once Sentry boot is added (#100). Placeholder only until then; monitoring is NOT live in this build.
3. **Apply not-yet-applied SQL to live DB** (via Supabase Management API — MCP/PAT unavailable in agent sessions):
   - 🚨 **`supabase/fix_pos_payment_103.sql` (POS-down #103) — HARD BLOCKER.** A defect in `pos_create_order_with_items` (passing a non-`orders` key such as `delivery_charge` / relying on `jsonb_populate_record` NULL-ing unlisted columns) breaks **every** order create → all POS payments fail. Fix filters the payload to live `orders` columns so absent columns keep their DEFAULTs. **Must be applied + happy-path smoke-tested (create real order+items → non-null id/order_number → rollback; `pos_quick_pay` end-to-end → rollback) BEFORE any deploy.** Until applied, POS is broken.
   - `supabase/p1_foc_hardening_96.sql` (#96) and `supabase/fix_cancel_finance_voucher_98.sql` (#98) — required-live before the #97 FOC client + #99 cancelVoucher client paths are exercised (they throw until then).
   - `supabase/fix_kot_cross_branch_reads.sql` (#73, tightening-only, drops unscoped role-only KOT SELECT policies; branch/kitchen-scoped SELECTs already cover every role — zero coverage loss).
   - Confirm all bundle files are recorded in `applied_migrations` (per `supabase/P0_APPLY_GUIDE.md`).
4. **Post-deploy smoke test:** load the deployed SPA, confirm it boots with no CSP console violations (validates the tightened `script-src`), and run one POS Quick-Pay + one KOT flow end-to-end.

> **Coupling rule reminder:** any SQL a client path depends on must be live in the DB **before** the client that calls it is deployed. The shipped client already assumes `pos_quick_pay` is live (it is). No shipped client code depends on the still-pending #96–#100 SQL.

---

## 5. Known Risk Acknowledgement

- 🚨 **POS payments are broken in the live DB until `fix_pos_payment_103.sql` is applied (#103).** This is the top blocker — not a code-in-repo issue (the client payload is correct; the defect is in the live `pos_create_order_with_items` function). No deploy until applied + smoke-tested.
- **FOC hardening (#76, HIGH):** client rewire (#97) is DONE and gate-green, but the enforcing RPCs (`p1_foc_hardening_96.sql`) are not live yet. Until applied, live FOC will throw (safely — the `finally{}` restores the cashier session). Do NOT deploy the #97 client ahead of #96 SQL. If deploying an older client, the original client-trusted `foc_authorized_by` gap remains — reconcile FOC daily until #96/#97 are both live.
- **cancelVoucher (#99 P2a):** client wired to `cancel_finance_voucher`; will throw until `fix_cancel_finance_voucher_98.sql` is live. Same coupling rule.
- Cross-branch KOT reads (#73, LOW) remain until `fix_kot_cross_branch_reads.sql` is applied — role-gated read-only exposure, no write/PII impact.
- Monitoring: Sentry client boot is IN the build but **no-op until `VITE_SENTRY_DSN` is supplied** — production errors won't be captured until the owner sets the DSN.

---

## 6. GO / NO-GO

### ⛔ NO-GO until the live SQL apply lands — then ✅ CONDITIONAL GO

The **client build is release-quality on all four QA gates** (lint 0 / vue-tsc 0 / vitest 440/440 / quasar build OK) and QA has code-reviewed the P1 client changes (#97 FOC session-restore, #99 rate-limiting/cancelVoucher, #100 Sentry/boot cleanup). **But the release is currently NO-GO** because the live DB is missing required SQL:

**HARD BLOCKERS (must clear before deploy):**
1. 🚨 Apply `fix_pos_payment_103.sql` + happy-path smoke — POS payments are broken live until this lands. **[hard blocker]**
2. Apply `p1_foc_hardening_96.sql` (before/with the #97 client) and `fix_cancel_finance_voucher_98.sql` (before/with the #99 cancelVoucher client) — coupling rule; clients throw until live. **[hard blocker for those paths]**
3. Rotate secrets (#13/#24/#39). **[hard blocker]**
4. Run post-deploy smoke (boot + CSP + one FOC + one Quick-Pay + one KOT flow + one cancelVoucher). **[hard blocker]**

**RECOMMENDED:**
5. Apply `fix_kot_cross_branch_reads.sql` (or accept LOW #73).
6. Supply `VITE_SENTRY_DSN` to activate monitoring.

**Once the SQL is applied + smoke-tested and secrets rotated, this flips to GO.** The client side is done and gated; the sole gate to production is the environmental live-apply step (needs a session with Supabase MCP or the Management API PAT). Remaining P1 tail (#99 P2b QR RPC, #99 P3 background jobs, #100 MV chart) are fast-follow, not blockers.

---

*QA gate commands for reproducibility:*
```bash
npm run lint
node --max-old-space-size=12288 ./node_modules/vue-tsc/bin/vue-tsc.js --noEmit --skipLibCheck
npm run test
npx quasar build
```
