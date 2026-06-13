# Seven Waves ERP — Release Readiness Checklist
## Production Go-Live Validation

---

## 1. Build & Deployment

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 1.1 | Production build succeeds (`npx quasar build`) | ☐ | DevOps |
| 1.2 | All tests pass (253+ tests) | ☐ | QA |
| 1.3 | Zero lint errors | ☐ | Dev |
| 1.4 | Bundle size < target (main chunk analysis) | ☐ | Dev |
| 1.5 | Environment variables configured | ☐ | DevOps |
| 1.6 | Supabase project on Pro/Team plan | ☐ | Admin |
| 1.7 | Custom domain configured | ☐ | DevOps |
| 1.8 | SSL/TLS verified | ☐ | Security |
| 1.9 | CDN caching configured | ☐ | DevOps |
| 1.10 | Rollback procedure documented | ☐ | DevOps |

## 2. Security

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 2.1 | All tables have RLS enabled | ☐ | DBA |
| 2.2 | RLS policies enforce branch isolation | ☐ | DBA |
| 2.3 | Edge Functions validate JWT | ☐ | Dev |
| 2.4 | CSP headers configured | ☐ | Security |
| 2.5 | Input sanitization active | ☐ | Dev |
| 2.6 | Rate limiting configured | ☐ | Dev |
| 2.7 | Brute force detection active | ☐ | Security |
| 2.8 | API keys not in frontend code | ☐ | Security |
| 2.9 | Gemini API key only in Edge Functions | ☐ | Security |
| 2.10 | RBAC covers all routes | ☐ | Dev |
| 2.11 | IPC whitelist enforced (Electron) | ☐ | Dev |
| 2.12 | QR tokens signed with HMAC | ☐ | Dev |
| 2.13 | Penetration tests pass | ☐ | Security |

## 3. Database

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 3.1 | All migrations applied successfully | ☐ | DBA |
| 3.2 | Indexes created for hot queries | ☐ | DBA |
| 3.3 | Statement timeout set (30s) | ☐ | DBA |
| 3.4 | Transaction timeout set (60s) | ☐ | DBA |
| 3.5 | Advisory locks for voucher posting | ☐ | DBA |
| 3.6 | Audit logs immutable (trigger) | ☐ | DBA |
| 3.7 | Posted vouchers immutable (trigger) | ☐ | DBA |
| 3.8 | PITR enabled (Supabase Pro) | ☐ | Admin |
| 3.9 | Connection pooling configured | ☐ | DBA |
| 3.10 | db_health_check() RPC works | ☐ | DBA |

## 4. Monitoring & Observability

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 4.1 | Metrics engine active | ☐ | Dev |
| 4.2 | Alert rules configured | ☐ | Ops |
| 4.3 | Security event logging active | ☐ | Security |
| 4.4 | Error tracking (Sentry/equivalent) | ☐ | DevOps |
| 4.5 | Structured logging enabled | ☐ | Dev |
| 4.6 | Admin ops dashboard accessible | ☐ | Ops |
| 4.7 | Health check endpoint responsive | ☐ | DevOps |

## 5. Offline & Realtime

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 5.1 | Offline POS queue working | ☐ | QA |
| 5.2 | Reconnection auto-syncs queue | ☐ | QA |
| 5.3 | Finance blocked from offline ops | ☐ | Dev |
| 5.4 | WebSocket reconnect with backoff | ☐ | Dev |
| 5.5 | Event deduplication active | ☐ | Dev |
| 5.6 | Heartbeat interval configured (30s) | ☐ | Dev |

## 6. AI Safety

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 6.1 | Prompt injection detection active | ☐ | Dev |
| 6.2 | AI cannot execute destructive actions | ☐ | Dev |
| 6.3 | Sensitive data redacted before AI | ☐ | Dev |
| 6.4 | AI rate limiting active (10/min) | ☐ | Dev |
| 6.5 | AI responses include disclaimer | ☐ | Dev |
| 6.6 | Fallback mode works on AI outage | ☐ | QA |

## 7. Device Management

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 7.1 | Printer ESC/POS tested | ☐ | QA |
| 7.2 | Cash drawer audit logging | ☐ | Dev |
| 7.3 | QR code signing verified | ☐ | Dev |
| 7.4 | Device heartbeat monitoring | ☐ | Ops |
| 7.5 | Print queue retry logic | ☐ | Dev |

## 8. Operations Readiness

| # | Check | Status | Owner |
|---|-------|--------|-------|
| 8.1 | Production runbooks reviewed | ☐ | Ops |
| 8.2 | Incident response plan documented | ☐ | Ops |
| 8.3 | Backup/restore procedure tested | ☐ | DBA |
| 8.4 | On-call rotation established | ☐ | Ops |
| 8.5 | User training completed | ☐ | PM |
| 8.6 | Support escalation path defined | ☐ | Ops |

---

## Production Readiness Score

| Category | Max Score | Actual |
|----------|-----------|--------|
| Build & Deploy | 10 | /10 |
| Security | 13 | /13 |
| Database | 10 | /10 |
| Monitoring | 7 | /7 |
| Offline/Realtime | 6 | /6 |
| AI Safety | 6 | /6 |
| Devices | 5 | /5 |
| Operations | 6 | /6 |
| **TOTAL** | **63** | **/63** |

**Go/No-Go Threshold: ≥ 56/63 (89%)**

---

## Critical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Physical printer hardware untested | HIGH | Test with real ESC/POS printer before go-live |
| Supabase on Free plan | CRITICAL | Upgrade to Pro for PITR and higher limits |
| No CDN configured | MEDIUM | Deploy behind Cloudflare or Vercel edge |
| Electron builds untested | LOW | Run electron-builder on Windows before distribution |
| No staging environment | HIGH | Create Supabase branch for staging validation |
