# Seven Waves ERP — Disaster Recovery Plan
## Step 07: Backup & Recovery Automation

---

## 1. Backup Strategy

### 1.1 Automated Backups (Supabase)
| Type | Frequency | Retention | Plan Required |
|------|-----------|-----------|---------------|
| Daily Snapshots | Every 24h | 7 days | Free+ |
| Point-in-Time Recovery (PITR) | Continuous WAL | 7 days | Pro |
| Manual Backup | On-demand | Until deleted | Free+ |

### 1.2 Application-Level Backups
| Data | Method | Schedule |
|------|--------|----------|
| Financial reports | PDF export + cloud storage | Weekly |
| Audit logs | JSON export | Monthly |
| Security events | JSON export | Monthly |
| Configuration | Git repository | Every deploy |
| Environment secrets | Encrypted vault | On change |

---

## 2. Recovery Procedures

### 2.1 Full Database Restore
```
1. Navigate to: Supabase Dashboard → Project → Database → Backups
2. Select the desired restore point
3. Click "Restore"
4. Wait for restore to complete (5-30 minutes)
5. Verify data integrity (see Section 4)
```

> ⚠️ **WARNING:** Full restore replaces ALL current data. Notify all users first.

### 2.2 Point-in-Time Recovery
```
1. Navigate to: Supabase Dashboard → Database → PITR
2. Select exact timestamp to recover to
3. Confirm recovery point
4. Wait for WAL replay (varies by data volume)
5. Verify data integrity
```

### 2.3 Partial Branch Recovery
```sql
-- Restore orders for a specific branch from backup
INSERT INTO public.orders
SELECT * FROM backup_schema.orders
WHERE branch_id = '<branch_id>'
  AND created_at >= '<incident_start>'
  AND id NOT IN (SELECT id FROM public.orders);
```

### 2.4 Financial Data Recovery
```sql
-- Verify financial integrity after restore
SELECT
  SUM(debit_amount) AS total_debits,
  SUM(credit_amount) AS total_credits,
  ABS(SUM(debit_amount) - SUM(credit_amount)) AS imbalance
FROM public.voucher_entries ve
JOIN public.vouchers v ON ve.voucher_id = v.id
WHERE v.is_posted = true;

-- Imbalance MUST be 0.00
```

---

## 3. Recovery Time Objectives

| Scenario | RTO | RPO | Priority |
|----------|-----|-----|----------|
| Full Supabase outage | 30 min | 24h (daily backup) | P1 |
| PITR restore | 15 min | < 1 min | P1 |
| Branch internet loss | 0 min (offline mode) | 0 (queue) | P2 |
| Printer failure | 5 min | 0 | P3 |
| Single table corruption | 20 min | 24h | P1 |
| Application deployment failure | 10 min (rollback) | 0 | P2 |

---

## 4. Post-Recovery Validation Checklist

| # | Check | Query/Action |
|---|-------|-------------|
| 1 | Order count matches | `SELECT COUNT(*) FROM orders;` |
| 2 | Financial balance correct | `SELECT SUM(debit) = SUM(credit) FROM voucher_entries;` |
| 3 | User sessions valid | Have 3+ users log in |
| 4 | Audit logs intact | `SELECT COUNT(*) FROM audit_logs;` |
| 5 | Inventory stock correct | Spot-check 5 items |
| 6 | Print queue clear | `SELECT COUNT(*) FROM print_jobs WHERE status = 'queued';` |
| 7 | Device heartbeats resume | Check device dashboard |
| 8 | Realtime subscriptions active | Place test order |

---

## 5. Data Retention Policy

| Data Type | Retention | Archive Method |
|-----------|-----------|---------------|
| Orders | 2 years active, then archive | Move to `orders_archive` |
| Audit logs | 5 years (compliance) | Immutable, no deletion |
| Security events | 1 year | Auto-prune older |
| Print jobs | 90 days | Auto-delete completed |
| AI insights | 6 months | Auto-archive |
| Device alerts | 90 days | Auto-prune resolved |
| Financial vouchers | 7 years (tax compliance) | Never delete |

---

## 6. Incident Severity Classification

| Severity | Definition | Response Time | Escalation |
|----------|-----------|---------------|------------|
| P1 - Critical | Data loss, full outage | 15 min | CTO + DBA |
| P2 - High | Partial outage, degraded | 30 min | Tech Lead |
| P3 - Medium | Single feature down | 2 hours | On-call dev |
| P4 - Low | Cosmetic, non-blocking | Next business day | Backlog |

---

## 7. Communication Plan

### During Incident
1. **Internal:** Slack #incidents channel
2. **Branch Managers:** SMS alert via ops manager
3. **Staff:** In-app notification banner
4. **Customers:** N/A (backend only)

### Post-Incident
1. Write incident report (template in runbooks)
2. Root cause analysis within 48 hours
3. Prevention measures documented
4. Runbook updated if needed
