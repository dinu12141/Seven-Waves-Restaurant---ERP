# Seven Waves Restaurant ERP — Backup Plan

**System:** Seven Waves Restaurant ERP  
**Supabase Project:** `clykwuzajtwvwuavmtzs` (ap-northeast-2, Seoul, AWS)  
**Frontend:** Netlify (`https://seven-waves.netlify.app`)  
**Classification:** Restaurant POS / Financial System — PCI-DSS scope  
**Document Owner:** Tech Lead / DevOps  
**Last Updated:** 2026-07-16  

---

## 1. Executive Summary

Seven Waves Restaurant ERP is a multi-branch restaurant management system that processes financial transactions, stores employee payroll records, and maintains the complete accounting ledger for restaurant operations. The system handles:

- **POS transactions** with real-money payment processing
- **Double-entry journal entries** (accounting records with legal retention requirements)
- **Payroll and HR records** (employee salary data, attendance, statutory records)
- **Customer data** (loyalty points, contact information — GDPR/data-protection scope)
- **Inventory and procurement records** (audit trail for food cost control)

**Legal data retention requirements:**
- Financial records (orders, invoices, payments, journals): **7 years** (tax authority requirement)
- HR and payroll records: **7 years** (statutory minimum)
- Audit logs: **7 years** (compliance)
- Customer personal data: Until consent withdrawn or relationship ended + 3 years

### Recovery Objectives

| Tier | Data Category | RTO | RPO | Strategy |
|------|--------------|-----|-----|----------|
| **Critical** | Orders, Payments, Journal Entries, Payroll | 1 hour | 15 minutes | PITR + Supabase automatic daily |
| **Important** | Menu, Inventory, Customers, Settings, Staff | 4 hours | 1 hour | Supabase daily + manual weekly |
| **Standard** | Logs, Notifications, Print History | 24 hours | 24 hours | Supabase daily |
| **Low** | Realtime event state, cached data | 0 (regenerable) | N/A | No backup needed |

**Current risk:** Supabase Free plan provides NO automatic backups. Upgrade to Pro immediately or implement manual daily backups as described in Section 4.

---

## 2. What Needs to Be Backed Up

### 2.1 Database — Supabase PostgreSQL 17

**Project ID:** `clykwuzajtwvwuavmtzs`  
**Region:** ap-northeast-2 (Seoul, South Korea — AWS)  
**Connection string format:** `postgresql://postgres:[PASSWORD]@db.clykwuzajtwvwuavmtzs.supabase.co:5432/postgres`

#### Critical Tables (Financial / Legal — 7-year retention)

| Table | Description | Rows/Day Est. | Size/Year Est. |
|-------|-------------|--------------|----------------|
| `orders` | All restaurant orders (every transaction) | 100–500 | ~50MB |
| `order_items` | Line items per order | 400–2000 | ~200MB |
| `invoices` | Customer invoices / bills | 100–500 | ~30MB |
| `payments` | Payment records (cash, card, digital) | 100–500 | ~30MB |
| `payment_methods` | Payment method details | low | ~1MB |
| `journal_entries` | Double-entry accounting records | 200–1000 | ~100MB |
| `journal_entry_lines` | Debit/credit lines per entry | 600–4000 | ~400MB |
| `accounts` | Chart of accounts | low-change | ~1MB |
| `ledger_entries` | Running account balances | 200–1000 | ~100MB |
| `vouchers` | Finance vouchers (payment, receipt, journal) | 50–200 | ~20MB |
| `payroll_records` | Monthly payroll calculations | 10–50/month | ~10MB/year |
| `salary_structures` | Employee salary configurations | low-change | ~2MB |
| `attendance_records` | Daily punch in/out records | 20–100 | ~20MB |
| `inventory_transactions` | Stock movement records | 50–200 | ~50MB |
| `stock_movements` | Detailed stock changes | 50–200 | ~50MB |
| `purchase_orders` | Procurement orders | 5–20 | ~5MB |
| `grn_records` | Goods received notes | 5–20 | ~5MB |
| `audit_logs` | System audit trail (immutable) | 500–2000 | ~200MB |

#### Important Tables (Operational — restore from settings/config)

| Table | Description |
|-------|-------------|
| `companies` | Multi-tenant company records |
| `branches` | Branch configuration |
| `profiles` | User profile data |
| `user_roles` | RBAC role assignments |
| `employees` | HR employee records |
| `menu_categories` | Menu structure |
| `menu_items` | Menu items and pricing |
| `recipes` | Recipe definitions |
| `recipe_ingredients` | Recipe cost composition |
| `restaurant_tables` | Table layout |
| `shifts` | Shift definitions |
| `shift_assignments` | Employee shift scheduling |
| `customers` | Customer loyalty profiles |
| `waiter_points_ledger` | Waiter performance points |
| `reservations` | Table reservations |
| `devices` | Hardware device configurations |
| `kitchens` | Kitchen station definitions |
| `kot_tickets` | Kitchen order tickets |
| `kot_items` | Kitchen order line items |

#### Low-Priority Tables (Transient / Regenerable)

| Table | Why low priority |
|-------|-----------------|
| `notifications` | Transient alerts — expire naturally |
| `waiter_notifications` | Event-driven, not durable |
| `print_jobs` | Historical log only |
| `kot_print_logs` | Historical log only |
| `realtime_events` | Always in-flight |

### 2.2 Supabase Auth (auth.users)

The `auth.users` table lives in the `auth` schema managed by Supabase. It contains:
- All user accounts (login credentials, email, phone)
- JWT secrets and session data

**Backup method:** Supabase handles `auth.users` separately. On Pro plan, this is included in automatic backups. On Free plan, export via Supabase Dashboard → Authentication → Users → Export CSV (credentials excluded, email/metadata only).

**Recovery:** Supabase can restore `auth.users` from their internal backups. Contact Supabase Support for auth user recovery.

### 2.3 Supabase Storage (File Assets)

| Bucket | Contents | Estimated Size |
|--------|----------|---------------|
| `menu-images` | Menu item photos | ~500MB/year |
| `employee-documents` | ID copies, contracts, certificates | ~200MB/year |
| `receipts` | Receipt PDFs and attachments | ~100MB/year |
| `branch-assets` | Logos, floor plans | ~50MB |
| `reports` | Exported reports (PDF/Excel) | ~1GB/year |

**Backup method:** S3 sync via Supabase Storage API (see Process 7 in BACKUP_PROCESS.md). Storage files are NOT included in pg_dump database backups.

### 2.4 Application Code and Configuration

| Asset | Location | Backup Method |
|-------|----------|--------------|
| Source code | GitHub repository | Git history — already version controlled |
| Build artifacts | Netlify (last 25 deploys retained) | Netlify dashboard |
| Netlify env vars | Netlify Dashboard → Environment | Export manually, store in vault |
| GitHub Secrets | GitHub repository settings | Export list (not values) + store in vault |
| Supabase SQL migrations | `supabase/*.sql` in git | Git history |
| RLS policies | `supabase/rls_*.sql` in git | Git history |

**Note:** `.env` files must NEVER be committed to git (confirmed — removed in commit `3bb7ce6`).

---

## 3. Supabase Built-In Backup Features

### 3.1 Automatic Daily Backups (Pro Plan Required)

| Feature | Free Plan | Pro Plan ($25/mo) | Team Plan |
|---------|-----------|-------------------|-----------|
| Automatic daily backup | ❌ | ✅ 7-day retention | ✅ 7-day retention |
| Point-in-Time Recovery | ❌ | ✅ 7 days | ✅ 30 days |
| Manual backup trigger | ❌ | ✅ | ✅ |
| Restore to new project | Via export | ✅ One-click | ✅ |

**Current plan status:** Verify at `https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs/settings/billing`

**Backup window:** Supabase runs automatic backups during off-peak hours (typically 02:00–06:00 UTC = 11:00–15:00 Seoul time). Exact timing varies.

**What's included in Supabase automatic backup:**
- ✅ All `public` schema tables (data + schema)
- ✅ `auth` schema (user accounts)
- ✅ Supabase-managed sequences, functions, triggers
- ❌ Supabase Storage files (separate — see Section 2.3)
- ❌ Edge Functions source code (stored in git, not DB)

### 3.2 Point-in-Time Recovery (PITR)

PITR uses PostgreSQL Write-Ahead Logging (WAL) continuously streamed to AWS S3:
- **How it works:** Every database write is logged. Supabase can replay logs to any second within the retention window.
- **Pro plan:** 7-day PITR window
- **Team plan:** 30-day PITR window
- **RPO with PITR:** Seconds (last committed transaction)
- **RTO with PITR:** 30–90 minutes (depends on how far back you restore)

**Restore procedure (with PITR):**
1. Supabase Dashboard → Backups → "Restore to point in time"
2. Select target date and time (down to the minute)
3. Supabase creates a new project with restored data
4. Update connection string in Netlify env vars

### 3.3 Free Plan — Critical Warning

**If on Free plan, Supabase provides NO automatic backups.** A database server failure, accidental `DROP TABLE`, or data corruption has no recovery path via Supabase.

**Action required (if on Free plan):**
- Option A: Upgrade to Supabase Pro ($25/month) — strongly recommended for a production POS
- Option B: Implement automated manual backup schedule (Section 4) — more complex but functional

---

## 4. Manual Backup Strategy (Required if on Free Plan / Additional Layer)

Even on Pro plan, a second independent backup layer is recommended for critical financial data.

### 4.1 Backup Architecture

```
                    ┌─────────────────────────────────────┐
                    │    Supabase PostgreSQL (Production)  │
                    │  clykwuzajtwvwuavmtzs.supabase.co   │
                    └────────────┬────────────────────────┘
                                 │ pg_dump (nightly)
                    ┌────────────▼────────────────────────┐
                    │         Backup Server / CI           │
                    │   (GitHub Actions scheduled job)     │
                    └────────────┬────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────────┐
              │                  │                      │
    ┌─────────▼──────┐  ┌───────▼────────┐  ┌─────────▼──────────┐
    │  AWS S3 Primary │  │  AWS S3 Backup │  │  Local encrypted   │
    │  (ap-northeast-2│  │  (ap-southeast-│  │  (DevOps machine)  │
    │   same region)  │  │   1, Singapore)│  │  weekly only       │
    └────────────────┘  └────────────────┘  └────────────────────┘
```

### 4.2 Backup Schedule

| Frequency | What | Method | Retention |
|-----------|------|--------|-----------|
| Every 4 hours | Critical tables only (orders, payments, journal_entries) | CSV export via psql | 48 hours |
| Nightly (01:00 KST) | Full database pg_dump | GitHub Actions scheduled | 30 days |
| Weekly (Sunday 02:00 KST) | Full database + storage files | GitHub Actions + S3 sync | 3 months |
| Monthly (1st of month) | Full database | GitHub Actions | 1 year |
| Annual (Jan 1) | Full database + all files | Manual + S3 Glacier | 7 years |

### 4.3 GitHub Actions Automated Backup

Create `.github/workflows/backup.yml`:

```yaml
name: Database Backup

on:
  schedule:
    # Nightly at 01:00 KST (16:00 UTC previous day)
    - cron: '0 16 * * *'
    # Every 4 hours for critical tables
    - cron: '0 */4 * * *'
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for manual backup'
        required: true

jobs:
  backup-database:
    runs-on: ubuntu-latest
    steps:
      - name: Install pg_dump
        run: sudo apt-get install -y postgresql-client

      - name: Full database backup
        if: github.event.schedule == '0 16 * * *' || github.event_name == 'workflow_dispatch'
        env:
          DB_URL: ${{ secrets.PRODUCTION_DB_URL }}
        run: |
          DATE=$(date +%Y%m%d_%H%M%S)
          pg_dump "$DB_URL" \
            --no-privileges --no-owner --schema=public \
            | gzip > "backup_${DATE}.sql.gz"
          echo "Backup size: $(du -h backup_${DATE}.sql.gz | cut -f1)"

      - name: Critical tables backup (every 4 hours)
        if: github.event.schedule == '0 */4 * * *'
        env:
          DB_URL: ${{ secrets.PRODUCTION_DB_URL }}
        run: |
          DATE=$(date +%Y%m%d_%H%M%S)
          for TABLE in orders order_items invoices payments journal_entries journal_entry_lines; do
            psql "$DB_URL" -c "\COPY ${TABLE} TO STDOUT CSV HEADER" \
              | gzip > "critical_${TABLE}_${DATE}.csv.gz"
          done

      - name: Upload to S3
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.BACKUP_AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.BACKUP_AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-2

      - name: Copy backup to S3
        run: |
          aws s3 cp backup_*.sql.gz s3://seven-waves-backups/database/ --sse AES256 || true
          aws s3 cp critical_*.csv.gz s3://seven-waves-backups/critical/ --sse AES256 || true

      - name: Verify backup uploaded
        run: |
          COUNT=$(aws s3 ls s3://seven-waves-backups/database/ | grep "$(date +%Y%m%d)" | wc -l)
          if [ "$COUNT" -eq 0 ]; then
            echo "::error::Backup not found in S3 after upload!"
            exit 1
          fi
          echo "Backup verified in S3: $COUNT file(s)"

  notify-on-failure:
    needs: backup-database
    if: failure()
    runs-on: ubuntu-latest
    steps:
      - name: Send backup failure alert
        run: |
          curl -X POST "${{ secrets.SLACK_WEBHOOK_URL }}" \
            -H 'Content-type: application/json' \
            -d '{"text": "⚠️ Seven Waves backup FAILED at '"$(date)"'. Check GitHub Actions."}'
```

### 4.4 Required GitHub Secrets for Backup

| Secret Name | Description |
|-------------|-------------|
| `PRODUCTION_DB_URL` | PostgreSQL connection URL (includes password) |
| `BACKUP_AWS_ACCESS_KEY_ID` | AWS IAM key for backup S3 bucket |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | AWS IAM secret |
| `BACKUP_S3_BUCKET` | S3 bucket name (e.g., `seven-waves-backups`) |
| `SLACK_WEBHOOK_URL` | For backup failure alerts |

---

## 5. Backup Storage Architecture (3-2-1 Rule)

The **3-2-1 backup rule**: 3 copies of data, on 2 different media types, with 1 offsite copy.

```
Copy 1: Supabase Built-in Backup
  ├── Location: Supabase-managed AWS S3 (ap-northeast-2)
  ├── Retention: 7 days (Pro plan)
  ├── Format: PostgreSQL binary dump
  └── Access: Supabase Dashboard → Backups

Copy 2: Automated pg_dump (Primary S3)
  ├── Location: AWS S3 bucket (ap-northeast-2)
  ├── Retention: 30 days (rolling delete)
  ├── Format: gzipped SQL dump (portable)
  └── Access: AWS S3 console / aws cli

Copy 3: Offsite S3 (Different Region)
  ├── Location: AWS S3 bucket (ap-southeast-1, Singapore)
  ├── Retention: 3 months (rolling delete)
  ├── Format: gzipped SQL dump
  └── Access: AWS S3 console (separate account recommended)
```

### 5.1 S3 Bucket Configuration

```bash
# Create primary backup bucket
aws s3 mb s3://seven-waves-backups --region ap-northeast-2

# Enable versioning (protects against accidental overwrites)
aws s3api put-bucket-versioning \
  --bucket seven-waves-backups \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket seven-waves-backups \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block all public access
aws s3api put-public-access-block \
  --bucket seven-waves-backups \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Lifecycle: auto-expire old backups
aws s3api put-bucket-lifecycle-configuration \
  --bucket seven-waves-backups \
  --lifecycle-configuration file://s3-lifecycle.json
```

`s3-lifecycle.json`:
```json
{
  "Rules": [
    {
      "Id": "expire-daily-backups",
      "Status": "Enabled",
      "Filter": { "Prefix": "database/" },
      "Expiration": { "Days": 30 }
    },
    {
      "Id": "expire-critical-backups",
      "Status": "Enabled",
      "Filter": { "Prefix": "critical/" },
      "Expiration": { "Days": 2 }
    },
    {
      "Id": "transition-monthly-to-glacier",
      "Status": "Enabled",
      "Filter": { "Prefix": "monthly/" },
      "Transitions": [{ "Days": 30, "StorageClass": "GLACIER" }]
    }
  ]
}
```

### 5.2 Retention Schedule and Cost

| Backup Type | Frequency | Retention | S3 Storage Class | Est. Cost/Month |
|-------------|-----------|-----------|-----------------|----------------|
| Critical tables (CSV) | 4-hourly | 48 hrs | S3 Standard | ~$0.10 |
| Full daily pg_dump | Daily | 30 days | S3 Standard | ~$2.30 |
| Full weekly pg_dump | Weekly | 3 months | S3 Standard-IA | ~$1.50 |
| Full monthly archive | Monthly | 1 year | S3 Standard-IA | ~$3.00 |
| Annual archive | Annual | 7 years | S3 Glacier | ~$0.50 |
| Storage files (S3 sync) | Weekly | 90 days | S3 Standard-IA | ~$5.00 |
| **TOTAL** | | | | **~$12.40/month** |

---

## 6. Disaster Recovery Scenarios

### 6.1 Failure Scenario Matrix

| Scenario | Probability | Impact | RTO | Recovery Method |
|----------|-------------|--------|-----|----------------|
| Accidental row deletion | High | Low-Medium | 30 min | Restore from backup CSV |
| Accidental table DROP | Low | High | 1–2 hr | Restore from pg_dump |
| Data corruption (single table) | Low | High | 1–2 hr | PITR or restore table |
| Complete database loss | Very Low | Critical | 2–4 hr | Full PITR or pg_dump restore |
| Supabase provider outage | Low | High | Dependent | Offline PWA + wait |
| Netlify outage (frontend) | Very Low | High | 15 min | Redeploy to Vercel |
| AWS region outage (ap-northeast-2) | Very Low | Critical | 4–8 hr | Failover to DR project (ap-southeast-1) |
| Ransomware / malicious deletion | Very Low | Critical | 4–8 hr | Restore from offsite backup |
| Accidental migration error | Medium | Medium | 1–2 hr | Rollback SQL + data restore |

### 6.2 Recovery Procedures by Scenario

**Scenario A: Accidental Row Deletion**
1. Query `audit_logs` to identify what was deleted and when
2. Download the most recent backup BEFORE the deletion timestamp
3. Extract affected rows from the SQL dump
4. Re-INSERT recovered rows into production
5. Verify row counts match expected
6. Add RLS/permission fix to prevent recurrence

**Scenario B: Supabase Provider Outage**
1. Monitor: `https://status.supabase.com`
2. Enable offline mode: PWA serves cached data, orders queue in IndexedDB
3. Notify branch managers via WhatsApp: "System temporarily unavailable, continue recording orders manually"
4. If outage > 4 hours: activate DR Supabase project (pre-provisioned in ap-southeast-1)
5. Update `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Netlify env
6. Trigger Netlify redeploy

**Scenario C: Complete Database Recovery**
- See BACKUP_PROCESS.md → Process 4: Full Database Restore

**Scenario D: Netlify Frontend Outage**
1. Go to Vercel.com and deploy from GitHub (pre-configured)
2. Update DNS CNAME to Vercel domain
3. Wait for DNS propagation (1–5 minutes with low TTL)

---

## 7. Backup Security

### 7.1 Encryption

| Layer | Encryption Method | Key Management |
|-------|------------------|----------------|
| Data in transit | TLS 1.3 (pg_dump over SSL) | Supabase managed |
| S3 at rest | AES-256 (S3 SSE) | AWS managed |
| Backup files (optional extra layer) | GPG symmetric encryption | Key stored in vault |
| Database password | Not in backup files | Stored in GitHub Secrets |

### 7.2 Access Control

| Role | S3 Backup Access | DB Password Access |
|------|-----------------|-------------------|
| GitHub Actions (backup job) | Write-only to backup bucket | Yes (GitHub Secret) |
| Tech Lead | Read/write backup bucket | Yes |
| Developer | No S3 access | No |
| Management | Read-only backup bucket | No |

**IAM Policy for GitHub Actions backup role:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::seven-waves-backups/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::seven-waves-backups"
    }
  ]
}
```

### 7.3 Secrets Rotation

| Secret | Rotation Frequency | Procedure |
|--------|-------------------|-----------|
| Supabase DB password | Every 6 months | Supabase Dashboard → Settings → Database → Reset password |
| Supabase anon key | On suspected compromise | Supabase Dashboard → Settings → API → Regenerate |
| AWS backup IAM key | Every 12 months | AWS IAM → rotate access key |
| GitHub Secrets | When person leaves team | GitHub Settings → Secrets → update each |

---

## 8. Data Retention Compliance

### 8.1 Legal Requirements (Sri Lanka + General)

| Data Type | Minimum Retention | Legal Basis |
|-----------|------------------|-------------|
| Financial records (orders, invoices) | 7 years | Tax authority (IRD Sri Lanka) |
| Accounting records (journal entries) | 7 years | Companies Act Sri Lanka |
| Payroll records | 7 years | EPF/ETF regulations |
| Attendance records | 5 years | Shops and Office Employees Act |
| Audit logs | 7 years | Best practice + compliance |
| Customer personal data | Until consent withdrawn + 3 years | GDPR equivalent |
| CCTV / video (if integrated) | 30 days | Standard practice |

### 8.2 Data Lifecycle

```
Order created → Active storage (Supabase) → 7 years → S3 Glacier archive → Delete
                 (always available)          (daily backup)  (cheap long-term)

Customer data → Active (Supabase) → Right to erasure request → Anonymize (keep aggregates)
                                     within 30 days

Audit logs → Append-only (Supabase) → Never delete individual entries
             Only age out to archive after 7 years
```

### 8.3 GDPR / Data Subject Rights

For any customer data deletion request:
1. Identify all tables containing customer PII: `customers`, `profiles`, `orders` (customer_name, customer_phone)
2. For `orders`: anonymize name/phone to "Customer [ID]" rather than delete (financial records must be kept)
3. For `customers` table: delete row after backup
4. For `profiles` (staff): only anonymize if staff account deactivated for > 1 year
5. Document the deletion in `audit_logs`

---

## 9. Backup Testing and Verification

A backup that has never been tested is not a backup — it's a hope.

### 9.1 Automated Verification (Daily)

After each automated backup, run:
```bash
# Verify backup file is not empty
SIZE=$(aws s3 ls s3://seven-waves-backups/database/backup_$(date +%Y%m%d).sql.gz | awk '{print $3}')
if [ "$SIZE" -lt 10240 ]; then
  echo "ALERT: Backup suspiciously small ($SIZE bytes)" | send_alert
fi

# Verify backup contains expected tables
TABLES_IN_BACKUP=$(aws s3 cp s3://seven-waves-backups/database/backup_$(date +%Y%m%d).sql.gz - \
  | gunzip | grep "^CREATE TABLE" | wc -l)
if [ "$TABLES_IN_BACKUP" -lt 30 ]; then
  echo "ALERT: Backup has only $TABLES_IN_BACKUP tables" | send_alert
fi
```

### 9.2 Monthly Manual Verification (30 minutes)

1. Download previous week's backup from S3
2. Create temporary PostgreSQL instance (local Docker)
3. Restore backup: `psql postgres://localhost/test < backup.sql`
4. Run verification queries:
   ```sql
   -- Check table count
   SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
   -- Expected: 80+

   -- Check data is recent
   SELECT MAX(created_at) FROM orders;
   -- Expected: within 1 week

   -- Check financial integrity
   SELECT COUNT(*) FROM journal_entries;
   SELECT SUM(amount) FROM journal_entry_lines WHERE type = 'debit';
   -- Debits should equal credits (±floating point)
   ```
5. Document results in backup test log

### 9.3 Quarterly Disaster Recovery Drill (4 hours)

- Full recovery exercise from a week-old backup
- Measure actual RTO vs target
- Test that all user roles can log in and operate
- Document in `docs/runbooks/dr-test-results.md`
- Update this plan with any lessons learned

### 9.4 Annual DR Simulation (Full Day)

- Simulate a "Supabase region outage" scenario
- Restore to DR project in ap-southeast-1
- Test complete order flow end-to-end
- Measure total time to "business as usual"

---

## 10. Backup Monitoring and Alerts

### 10.1 What to Monitor

| Check | Frequency | Alert If |
|-------|-----------|----------|
| Backup job succeeded | Daily | Job failed or didn't run |
| Backup file size trend | Daily | Size drops > 20% from previous day |
| S3 storage growth | Weekly | Usage exceeds budget threshold |
| Supabase Pro backup status | Daily | Status ≠ "Completed" |
| PITR lag | Hourly | Lag > 1 hour (on Pro plan) |

### 10.2 Alert Channels

| Severity | Alert Method | Who Receives |
|----------|-------------|-------------|
| Critical (backup failed) | SMS + Email | Tech Lead, CTO |
| High (size anomaly) | Slack + Email | Tech Lead |
| Medium (approaching retention limit) | Slack | DevOps |
| Info (successful backup) | Slack #ops-logs | Team channel |

---

## 11. Supabase-Specific Considerations

### 11.1 Schema vs Data in pg_dump

When using `pg_dump --schema=public`, you get:
- ✅ Table DDL (CREATE TABLE statements)
- ✅ Indexes and constraints
- ✅ Sequences (auto-increment counters)
- ✅ Table data (COPY statements)
- ❌ RLS policies (in `pg_catalog`, not `public`)
- ❌ Extensions (in `extensions` schema)
- ❌ Functions in `auth` schema
- ❌ `auth.users` rows

**For complete backup, also dump:**
```bash
# Dump RLS policies
pg_dump "$DB_URL" --schema=auth --no-owner -f auth_backup.sql

# Dump extensions + config
pg_dump "$DB_URL" --schema=extensions --no-owner -f extensions_backup.sql
```

### 11.2 Row Level Security After Restore

After restoring to a new database:
1. RLS policies may not be restored by `--schema=public` dump
2. Re-apply from git: `psql < supabase/rls_restaurant_flow.sql`
3. Re-apply security lockdown: `psql < supabase/erp_security_lockdown.sql`
4. Re-apply any custom policies: `psql < supabase/fix_missing_rls_policies.sql`

### 11.3 Supabase Realtime After Restore

Tables that use realtime publication must be re-added after restore:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kot_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- ... etc for all realtime tables
```

---

## 12. Escalation Matrix

| Event | Primary Contact | Secondary | Escalate To | SLA |
|-------|----------------|-----------|-------------|-----|
| Backup job fails | Tech Lead | DevOps | CTO | 1 hour |
| Data loss discovered | Tech Lead | DevOps | Owner | 30 min |
| Recovery started | Tech Lead | Second developer | Owner | Inform immediately |
| Recovery complete | Tech Lead | — | All stakeholders | On completion |
| Supabase outage > 2hr | Tech Lead | — | Branch Managers | 30 min |

**Supabase Support:**
- Support URL: `https://supabase.com/dashboard/support/new`
- For Pro plan: Priority support response within 4 hours
- Emergency: `support@supabase.io`

---

## Appendix A: Backup Technology Stack

| Technology | Version | Use Case |
|------------|---------|----------|
| PostgreSQL `pg_dump` | 15+ | Full database export |
| `psql` | 15+ | Critical table exports, restore |
| AWS S3 | — | Backup storage |
| AWS S3 Glacier | — | 7-year archive |
| GitHub Actions | — | Scheduled backup automation |
| `gzip` | standard | Backup compression (60–80% reduction) |
| GPG | 2.x | Optional additional encryption |

---

## Appendix B: Backup File Naming Convention

```
# Full database backup
db_{YYYYMMDD}_{HHMMSS}.sql.gz
Example: db_20260716_010000.sql.gz

# Critical tables (4-hourly)
critical_{TABLE}_{YYYYMMDD}_{HHMMSS}.csv.gz
Example: critical_orders_20260716_040000.csv.gz

# Manual backup (before migration/change)
manual_{YYYYMMDD}_{HHMMSS}_{reason}.sql.gz
Example: manual_20260716_143000_before-finance-migration.sql.gz

# Storage backup
storage_{YYYYMMDD}.tar.gz
Example: storage_20260716.tar.gz

# Monthly archive
monthly_{YYYY}_{MM}.sql.gz
Example: monthly_2026_07.sql.gz

# Annual archive
annual_{YYYY}.sql.gz
Example: annual_2026.sql.gz
```

---

*This document is reviewed annually or after any incident. Version this document in git alongside the codebase.*
