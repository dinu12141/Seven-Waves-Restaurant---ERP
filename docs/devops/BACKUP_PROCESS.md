# Seven Waves Restaurant ERP — Backup Process (Step-by-Step Runbook)

**System:** Seven Waves Restaurant ERP  
**Supabase Project:** `clykwuzajtwvwuavmtzs` (ap-northeast-2, Seoul)  
**Document Type:** Operational Runbook  
**Audience:** Tech Lead, DevOps, On-Call Developer  
**Last Updated:** 2026-07-16  

> **Quick reference:** See BACKUP_PLAN.md for architecture decisions, retention schedules, and technology choices. This document is the *how-to* — step-by-step procedures for every backup and recovery operation.

---

## Prerequisites

Before executing any process here, ensure you have:

- [ ] PostgreSQL client (`pg_dump`, `psql`) installed locally
- [ ] AWS CLI configured with backup account credentials (`aws configure`)
- [ ] Access to Supabase dashboard (`https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs`)
- [ ] Database connection URL (stored in `.claude/settings.json` — NOT in codebase)
- [ ] S3 bucket access (`seven-waves-backups`)

---

## Process 1: Daily Backup Verification (5 minutes — Every Morning)

**Who:** System Administrator or any team member  
**When:** Every morning before business hours  
**Frequency:** Daily  

This is the most important daily habit. A missed verification is how backup failures go unnoticed for weeks.

### Steps

**Step 1: Check Supabase Automatic Backup**
1. Open: `https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs/settings/backups`
2. Verify the most recent backup shows status: **"Completed"**
3. Verify the backup timestamp is within the last 24 hours
4. Note the backup size — it should be similar to previous days (sudden drop > 20% = problem)

**Step 2: Check S3 Automated Backup**
```bash
# List today's backups
aws s3 ls s3://seven-waves-backups/database/ | grep $(date +%Y%m%d)

# Expected output: at least 1 file from today
# 2026-07-16 01:05:42   45023891 db_20260716_010000.sql.gz
```

**Step 3: Verify backup file is not suspiciously small**
```bash
# Get the size of today's backup
SIZE=$(aws s3 ls s3://seven-waves-backups/database/ \
  | grep $(date +%Y%m%d) \
  | sort -r | head -1 \
  | awk '{print $3}')

echo "Backup size: $SIZE bytes"

# Alert if less than 10MB (likely empty or failed)
if [ "$SIZE" -lt 10485760 ]; then
  echo "⚠️  ALERT: Backup is suspiciously small — investigate!"
fi
```

**Step 4: Record the result**

Update the backup log:
```
Date: [today]       Status: [OK/FAILED]    Size: [MB]    Notes: [any observations]
```

**Step 5: Escalate if anything failed**
- Backup missing or failed → Run Process 5 (Emergency Backup) immediately
- Size dropped > 20% from yesterday → Investigate and potentially re-run backup
- Supabase dashboard shows "Failed" → Contact Supabase support

---

## Process 2: Manual On-Demand Backup (Before Major Changes)

**Who:** Tech Lead or Senior Developer  
**When:** Before any database migration, major deploy, or bulk data operation  
**Time required:** 10–15 minutes  

**Rule:** Never run a migration or destructive database operation without first creating a manual backup.

### Steps

**Step 1: Announce to team**
```
Post in team channel:
"🔒 Starting manual backup before [describe reason].
 DB will be in read-heavy mode briefly. ETA 10 min."
```

**Step 2: Set environment variables**
```bash
# Export variables (never hardcode credentials)
export DATE=$(date +%Y%m%d_%H%M%S)
export REASON="[brief-description]"  # e.g., "finance-migration" "bulk-menu-update"
export PROJECT_ID="clykwuzajtwvwuavmtzs"
export DB_URL="[retrieve from .claude/settings.json or GitHub Secrets]"
export BACKUP_FILE="manual_${DATE}_${REASON}.sql"
```

**Step 3: Create the backup**
```bash
pg_dump "$DB_URL" \
  --no-privileges \
  --no-owner \
  --schema=public \
  --verbose \
  --format=plain \
  -f "$BACKUP_FILE"

echo "Exit code: $?"
echo "File size: $(du -h $BACKUP_FILE | cut -f1)"
```

**Step 4: Verify backup integrity**
```bash
# Count tables in backup (should be 80+)
TABLE_COUNT=$(grep "^CREATE TABLE" "$BACKUP_FILE" | wc -l)
echo "Tables in backup: $TABLE_COUNT"

if [ "$TABLE_COUNT" -lt 30 ]; then
  echo "❌ ERROR: Too few tables in backup — something went wrong"
  exit 1
fi

# Verify critical tables are present
for TABLE in orders journal_entries payments profiles; do
  if grep -q "COPY public.${TABLE}" "$BACKUP_FILE"; then
    echo "✓ ${TABLE} backed up"
  else
    echo "⚠️  ${TABLE} NOT found in backup — investigate"
  fi
done
```

**Step 5: Compress the backup**
```bash
gzip "$BACKUP_FILE"
echo "Compressed: ${BACKUP_FILE}.gz ($(du -h ${BACKUP_FILE}.gz | cut -f1))"
```

**Step 6: Upload to S3**
```bash
aws s3 cp "${BACKUP_FILE}.gz" \
  "s3://seven-waves-backups/manual/${BACKUP_FILE}.gz" \
  --sse AES256 \
  --storage-class STANDARD_IA

echo "✓ Uploaded to S3: s3://seven-waves-backups/manual/${BACKUP_FILE}.gz"
```

**Step 7: Record in backup log**
```
Date: [DATE]         Type: Manual
Reason: [REASON]     File: [BACKUP_FILE].gz
S3 Location: s3://seven-waves-backups/manual/[BACKUP_FILE].gz
Size: [SIZE]         Verified: Yes
Performed by: [name]
```

**Step 8: Announce completion**
```
"✅ Manual backup complete. File: [BACKUP_FILE].gz ([size])
 Safe to proceed with [describe change]."
```

---

## Process 3: Restore Single Table from Backup

**Who:** Tech Lead (requires management approval for production)  
**When:** Accidental deletion, data corruption in a specific table  
**Time required:** 30–60 minutes  

### Decision Checklist Before Starting
- [ ] Understand WHAT data was lost (query audit_logs)
- [ ] Understand WHEN it was lost (timestamp from audit_logs)
- [ ] Identify the correct backup to restore from (must be BEFORE the loss event)
- [ ] Get approval from management (for production changes)
- [ ] Plan off-peak timing (midnight–6am KST ideal)

### Steps

**Step 1: Identify the data loss event**
```sql
-- Query audit_logs to find what happened
SELECT * FROM audit_logs
WHERE action_type IN ('DELETE', 'TRUNCATE', 'DROP')
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Or check for specific table
SELECT * FROM audit_logs
WHERE resource_type = 'orders'
  AND action_type = 'DELETE'
ORDER BY created_at DESC
LIMIT 50;
```

**Step 2: Find the correct backup**
```bash
# List available backups around the loss time
aws s3 ls s3://seven-waves-backups/database/ | sort -r | head -20

# For critical tables (CSV, 4-hourly)
aws s3 ls s3://seven-waves-backups/critical/ | grep orders | sort -r | head -10
```

Choose a backup timestamped BEFORE the data loss occurred.

**Step 3: Download and extract the backup**
```bash
# Choose the appropriate backup file
BACKUP_FILE="db_20260715_020000.sql.gz"

aws s3 cp "s3://seven-waves-backups/database/${BACKUP_FILE}" .
gunzip "${BACKUP_FILE}"
BACKUP_SQL="${BACKUP_FILE%.gz}"
echo "Backup extracted: $(du -h $BACKUP_SQL | cut -f1)"
```

**Step 4: Extract specific table data**

For a simple table:
```bash
TABLE="orders"

python3 - <<'PYEOF'
import re, sys

TABLE = "orders"
with open("${BACKUP_SQL}") as f:
    content = f.read()

# Find COPY block for the specific table
# Pattern: from COPY statement to the terminating backslash-dot
pattern = rf'(COPY public\.{TABLE} \([^)]+\) FROM stdin;\n.*?\n\\\.)'
match = re.search(pattern, content, re.DOTALL)

if match:
    with open(f"restore_{TABLE}.txt", "w") as out:
        out.write(match.group(0))
    print(f"✓ Extracted {TABLE} data ({len(match.group(0))} chars)")
else:
    print(f"❌ Table {TABLE} not found in backup")
    sys.exit(1)
PYEOF
```

For CSV backup (4-hourly critical backup):
```bash
# Download the most recent CSV before the loss event
aws s3 cp "s3://seven-waves-backups/critical/critical_orders_20260715_160000.csv.gz" .
gunzip critical_orders_20260715_160000.csv.gz
# File is ready to import
```

**Step 5: Restore to staging FIRST**
```bash
export STAGING_DB_URL="[staging connection string]"

# For SQL format
psql "$STAGING_DB_URL" < "restore_${TABLE}.txt"

# For CSV format
psql "$STAGING_DB_URL" -c "\COPY orders FROM 'critical_orders_20260715_160000.csv' CSV HEADER"
```

**Step 6: Verify staging restore**
```bash
psql "$STAGING_DB_URL" -c "SELECT COUNT(*) FROM orders;"
psql "$STAGING_DB_URL" -c "SELECT MIN(created_at), MAX(created_at) FROM orders;"
psql "$STAGING_DB_URL" -c "SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY COUNT DESC;"
```

Compare with expected counts. If counts look correct and data looks reasonable → proceed to production.

**Step 7: Apply to production (with 2-person approval)**

```
⚠️  BEFORE RUNNING: get verbal/written approval from manager
⚠️  BEFORE RUNNING: ensure off-peak hours (midnight–6am KST)
⚠️  BEFORE RUNNING: announce in team channel with 5-minute warning
```

```bash
export PROD_DB_URL="[production connection string]"

# For SQL format
psql "$PROD_DB_URL" < "restore_${TABLE}.txt"

# For CSV format
psql "$PROD_DB_URL" -c "\COPY orders FROM 'critical_orders_20260715_160000.csv' CSV HEADER ON CONFLICT (id) DO NOTHING"

echo "✓ Production restore complete: $(date)"
```

**Step 8: Verify production**
```bash
psql "$PROD_DB_URL" -c "SELECT COUNT(*) FROM orders;"

# Check the specific records that were lost are now present
psql "$PROD_DB_URL" -c "SELECT id, order_number, status, created_at FROM orders WHERE created_at > '2026-07-15' ORDER BY created_at DESC LIMIT 10;"
```

**Step 9: Document the incident**
```
Incident: [description of what was lost]
Loss event time: [timestamp from audit_logs]
Backup used: [backup filename and S3 path]
Backup timestamp: [backup creation time]
Data gap: [time between backup and loss — this data may be unrecoverable]
Recovery time: [how long restore took]
Rows recovered: [count]
Root cause: [how did the data get deleted]
Prevention: [what we're doing to prevent recurrence]
Performed by: [names of both people]
```

---

## Process 4: Full Database Restore (Disaster Recovery)

**Who:** Tech Lead + Second Senior Developer (two-person rule for all production restores)  
**When:** Complete data loss, catastrophic corruption, Supabase project deleted  
**Time required:** 2–4 hours  
**RTO Target:** 4 hours  

```
⛔ This process takes the production system offline. Notify all stakeholders before starting.
```

### Steps

**Step 0 (–00:05): Pre-check**
```bash
# Confirm you cannot connect to existing project
psql "$PROD_DB_URL" -c "SELECT 1;" 2>&1
# If this fails: proceed with restore
# If this succeeds: stop — you may not need a full restore!
```

**Step 1 (00:00): Declare incident**
- Create incident record: `docs/incidents/YYYY-MM-DD-incident.md`
- Post in team channel: "🔴 P0 INCIDENT: Database recovery in progress. ETA 4 hours."
- Enable maintenance mode:
  ```bash
  # Option A: Netlify env var
  netlify env:set VITE_MAINTENANCE_MODE "true"
  netlify deploy --prod
  ```
- Notify: CEO, Operations Manager, all Branch Managers

**Step 2 (00:05): Locate the best available backup**
```bash
# Check Supabase built-in backup
# Go to: https://supabase.com/dashboard/project/[project-id]/settings/backups

# Check S3 manual backups
aws s3 ls s3://seven-waves-backups/database/ | sort -r | head -10
echo "Choose the most recent backup before the incident occurred."

# Check critical table backups (may have more recent data for financial tables)
aws s3 ls s3://seven-waves-backups/critical/ | sort -r | head -20
```

Record your choice:
```
Backup chosen: [filename]
Backup created at: [timestamp]
Data gap (backup → incident): [X hours] — this data may need manual re-entry
```

**Step 3 (00:10): Create new Supabase project**
1. Go to `https://supabase.com/dashboard`
2. Click "New project"
3. Settings:
   - Organization: Seven Waves
   - Name: `seven-waves-restore-[YYYYMMDD]`
   - Region: `ap-northeast-2` (Seoul — same as production)
   - Database password: Generate new strong password, save it immediately
4. Wait for project to be ready (~2 minutes)
5. Copy the new project ID and connection string

**Step 4 (00:15): Download and prepare backup**
```bash
BACKUP_FILE="db_[most_recent].sql.gz"

# Download from S3
aws s3 cp "s3://seven-waves-backups/database/${BACKUP_FILE}" .

# Extract
gunzip "${BACKUP_FILE}"
BACKUP_SQL="${BACKUP_FILE%.gz}"
echo "Backup size: $(wc -l < $BACKUP_SQL) lines"
```

**Step 5 (00:20): Apply backup to new project**
```bash
export NEW_DB_URL="postgresql://postgres:[NEW_PASSWORD]@db.[NEW_PROJECT_ID].supabase.co:5432/postgres"

# Apply the backup (this may take 15–45 minutes depending on DB size)
psql "$NEW_DB_URL" < "$BACKUP_SQL"

echo "Database restore applied: $(date)"
```

**Step 6 (01:30): Re-apply Supabase-specific configuration**

The pg_dump may not include all Supabase-managed config:

```bash
# Verify tables exist
psql "$NEW_DB_URL" -c "\dt public.*" | wc -l

# Re-apply RLS policies (from git)
psql "$NEW_DB_URL" < supabase/rls_restaurant_flow.sql
psql "$NEW_DB_URL" < supabase/erp_security_lockdown.sql
psql "$NEW_DB_URL" < supabase/fix_missing_rls_policies.sql  # if PENDING in ledger

# Re-apply triggers and functions (if not in pg_dump)
psql "$NEW_DB_URL" < supabase/orders.sql
psql "$NEW_DB_URL" < supabase/kot_orchestration_v2.sql
psql "$NEW_DB_URL" < supabase/shift_access_control.sql

# Re-add tables to realtime publication
psql "$NEW_DB_URL" -c "ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;"
psql "$NEW_DB_URL" -c "ALTER PUBLICATION supabase_realtime ADD TABLE public.kot_tickets;"
psql "$NEW_DB_URL" -c "ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;"
psql "$NEW_DB_URL" -c "ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;"
```

**Step 7 (02:00): Apply any migrations written after the last backup**
```bash
# Find SQL files committed after the backup timestamp
git log --after="[backup-timestamp]" --name-only --pretty=format: -- "supabase/*.sql" \
  | grep "\.sql$" | sort -u

# Review each file and decide if safe to apply
# Apply in chronological order
for SQL_FILE in $(git log --after="[backup-timestamp]" --name-only --pretty=format: -- "supabase/*.sql" | grep "\.sql$" | sort -u); do
  echo "Applying: $SQL_FILE"
  psql "$NEW_DB_URL" < "$SQL_FILE" || echo "⚠️  Error in $SQL_FILE — review and continue manually"
done
```

**Step 8 (02:30): Restore Supabase Auth users (if lost)**

The `auth.users` table is managed by Supabase and may survive independently even if the project is recreated. Check first:
```bash
# Check if any users exist in new project
psql "$NEW_DB_URL" -c "SELECT COUNT(*) FROM auth.users;"
```

If zero users:
1. Contact Supabase Support (`support@supabase.io`) — they have access to auth backups
2. Alternatively: Export user list from old project (if partially accessible)
3. Last resort: users must re-register (accounts recreated but data restored)

**Step 9 (03:00): Data validation**
```bash
# Validate row counts match expectations
psql "$NEW_DB_URL" << 'SQL'
SELECT
  'orders' as table_name, COUNT(*) as rows FROM orders
UNION ALL
SELECT 'journal_entries', COUNT(*) FROM journal_entries
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'branches', COUNT(*) FROM branches
UNION ALL
SELECT 'menu_items', COUNT(*) FROM menu_items
UNION ALL
SELECT 'employees', COUNT(*) FROM employees;
SQL

# Check most recent data
psql "$NEW_DB_URL" -c "SELECT MAX(created_at) FROM orders;"
psql "$NEW_DB_URL" -c "SELECT MAX(created_at) FROM journal_entries;"
```

Compare against expected values. If significantly off → investigate before switching traffic.

**Step 10 (03:15): Update connection strings**
```bash
# Get new Supabase URL and anon key from new project dashboard
NEW_SUPABASE_URL="https://[NEW_PROJECT_ID].supabase.co"
NEW_ANON_KEY="[new anon key from dashboard]"

# Update Netlify environment variables
netlify env:set VITE_SUPABASE_URL "$NEW_SUPABASE_URL"
netlify env:set VITE_SUPABASE_ANON_KEY "$NEW_ANON_KEY"

# Trigger Netlify redeploy
netlify deploy --prod

echo "Netlify deploy triggered: $(date)"
```

Also update:
- GitHub Secrets: `PRODUCTION_SUPABASE_URL`, `PRODUCTION_SUPABASE_ANON_KEY`
- Local `.env.local` files for all developers
- Any other services that connect to the database

**Step 11 (03:30): Smoke tests**

Run through critical flows:
```
□ Login as admin — can you see all branches and orders?
□ Login as manager — manager PWA loads correctly?
□ Login as waiter — shift shows correctly, can see pending orders?
□ Login as cashier — cashier queue loads?
□ Login as kitchen — KDS shows tickets?
□ POS: create a test order — does it flow through to kitchen?
□ Finance: open journal entries — data present?
□ Reports: open daily sales — data loads?
```

If any smoke test fails → investigate before removing maintenance mode.

**Step 12 (04:00): Remove maintenance mode and communicate**
```bash
netlify env:unset VITE_MAINTENANCE_MODE
netlify deploy --prod
echo "Maintenance mode removed: $(date)"
```

Send communication to all stakeholders:
```
Subject: System Restored — Seven Waves ERP

The Seven Waves Restaurant ERP system has been fully restored.

Recovery completed at: [time]
Data restored as of: [backup timestamp]
Estimated data gap: [X hours] from [backup time] to [incident time]

Action required for each branch:
- Verify your most recent orders are visible
- Re-enter any orders placed during [backup time] to [incident time] if visible
- Contact Tech Lead if any data appears missing

We apologize for the disruption.
```

**Step 13: Post-incident documentation**
```
Incident summary (docs/incidents/YYYY-MM-DD-full-restore.md):
- Root cause of data loss
- Timeline of events and response
- Backup used and data gap
- Recovery steps taken (with timestamps)
- Actual RTO achieved vs target
- Total downtime
- Data gap: [X hours] — what orders/transactions may need manual re-entry
- Follow-up actions: [prevent recurrence]
- Lessons learned
- Updated processes: [if any]
```

---

## Process 5: Emergency Backup (When Regular Backup Fails)

**Who:** On-call developer  
**When:** Daily verification shows backup failed or is missing  
**Time required:** 15–30 minutes  

**Do this immediately — do not wait for business hours.**

### Steps

**Step 1: Verify the failure**
```bash
# Check if backup exists for today
aws s3 ls s3://seven-waves-backups/database/ | grep $(date +%Y%m%d)
# If no output: backup is missing

# Check Supabase dashboard for error
# https://supabase.com/dashboard/project/clykwuzajtwvwuavmtzs/settings/backups
```

**Step 2: Create immediate manual backup**
```bash
export DATE=$(date +%Y%m%d_%H%M%S)
export DB_URL="[production connection string]"

pg_dump "$DB_URL" \
  --no-privileges \
  --no-owner \
  --schema=public \
  | gzip > "emergency_${DATE}.sql.gz"

echo "Emergency backup created: emergency_${DATE}.sql.gz"
echo "Size: $(du -h emergency_${DATE}.sql.gz | cut -f1)"
```

**Step 3: Upload to S3**
```bash
aws s3 cp "emergency_${DATE}.sql.gz" \
  "s3://seven-waves-backups/emergency/emergency_${DATE}.sql.gz" \
  --sse AES256

echo "✓ Emergency backup in S3"
```

**Step 4: Investigate the root cause of backup failure**

Common failure causes:
- [ ] GitHub Actions job timed out — check Actions log
- [ ] Database connection string changed — verify `PRODUCTION_DB_URL` secret
- [ ] S3 credentials expired — verify `BACKUP_AWS_ACCESS_KEY_ID` secret
- [ ] Disk space on runner — Actions usually don't hit this but worth checking
- [ ] Supabase auto-backup disabled — check dashboard

**Step 5: Fix the underlying issue**

Based on root cause:
- Credentials expired → rotate secrets in GitHub
- Workflow bug → fix `.github/workflows/backup.yml`
- Supabase plan → upgrade or re-enable auto-backup

**Step 6: Notify and document**
```
Post in team channel:
"⚠️ Daily backup failed on [date]. Emergency backup created at [time].
 Root cause: [cause]. Fix applied: [what you did].
 Next scheduled backup: [tomorrow at 01:00 KST]."
```

---

## Process 6: Storage Files Backup

**Who:** DevOps  
**When:** Scheduled (weekly via GitHub Actions) or manual  
**Time required:** 5–30 minutes (depends on storage size)  

Supabase Storage (file uploads) is NOT included in database backups. Menu photos, employee documents, and report PDFs need separate backup.

### Steps

**Step 1: List all storage buckets**
```bash
export SUPABASE_URL="https://clykwuzajtwvwuavmtzs.supabase.co"
export SERVICE_ROLE_KEY="[service role key — from .claude/settings.json]"

# List buckets
curl -s \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  "${SUPABASE_URL}/storage/v1/bucket" | jq -r '.[].name'
```

**Step 2: Create local staging directory**
```bash
export BACKUP_DATE=$(date +%Y%m%d)
mkdir -p "storage_backup_${BACKUP_DATE}"
```

**Step 3: Download files from each bucket**
```bash
#!/bin/bash
# Run for each bucket
for BUCKET in menu-images employee-documents receipts branch-assets reports; do
  echo "Backing up bucket: ${BUCKET}"
  mkdir -p "storage_backup_${BACKUP_DATE}/${BUCKET}"

  # List files in bucket (up to 1000)
  FILES=$(curl -s \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"limit": 1000, "offset": 0}' \
    "${SUPABASE_URL}/storage/v1/object/list/${BUCKET}" | jq -r '.[].name')

  for FILE in $FILES; do
    # Skip empty names
    [ -z "$FILE" ] && continue

    # Download file
    mkdir -p "storage_backup_${BACKUP_DATE}/${BUCKET}/$(dirname $FILE)"
    curl -s \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      "${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${FILE}" \
      -o "storage_backup_${BACKUP_DATE}/${BUCKET}/${FILE}"
  done

  echo "  ✓ Backed up bucket: ${BUCKET}"
done
```

**Step 4: Compress and upload to S3**
```bash
tar -czf "storage_${BACKUP_DATE}.tar.gz" "storage_backup_${BACKUP_DATE}/"
echo "Archive size: $(du -h storage_${BACKUP_DATE}.tar.gz | cut -f1)"

aws s3 cp "storage_${BACKUP_DATE}.tar.gz" \
  "s3://seven-waves-backups/storage/storage_${BACKUP_DATE}.tar.gz" \
  --sse AES256 \
  --storage-class STANDARD_IA

echo "✓ Storage backup in S3: s3://seven-waves-backups/storage/storage_${BACKUP_DATE}.tar.gz"
```

**Step 5: Verify and cleanup**
```bash
# Verify S3 upload
aws s3 ls "s3://seven-waves-backups/storage/storage_${BACKUP_DATE}.tar.gz"

# Cleanup local files
rm -rf "storage_backup_${BACKUP_DATE}/" "storage_${BACKUP_DATE}.tar.gz"
echo "✓ Local cleanup done"
```

### Restore Storage File

To restore a specific file from storage backup:
```bash
# Download storage backup
aws s3 cp "s3://seven-waves-backups/storage/storage_[DATE].tar.gz" .
tar -xzf "storage_[DATE].tar.gz"

# Upload specific file back to Supabase
FILE_PATH="menu-images/menu-item-123.jpg"
curl -X PUT \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@storage_backup_[DATE]/${FILE_PATH}" \
  "${SUPABASE_URL}/storage/v1/object/${FILE_PATH}"
```

---

## Process 7: Quarterly Disaster Recovery Drill

**Who:** Tech Lead + DevOps (both present and available for 4+ hours)  
**When:** Quarterly (January, April, July, October)  
**Time required:** Half-day (4 hours)  
**Environment:** Use a TEST environment — never practice DR on production!

### Purpose

A DR drill validates:
- The backup files are complete and restorable
- The recovery procedure actually works
- The actual RTO is within the 4-hour target
- Team members know what to do under pressure
- Documentation is accurate and up to date

### Steps

**Step 1 (before drill): Announce to stakeholders**
```
"We are conducting a planned Disaster Recovery drill on [date].
 This is a TEST — production will not be affected.
 Duration: approximately 4 hours."
```

**Step 2: Choose a backup from 7 days ago**
```bash
# List backups from ~7 days ago
aws s3 ls s3://seven-waves-backups/database/ \
  | awk -v d="$(date -d '7 days ago' +%Y%m%d)" '$4 ~ d {print}'
```

Using a week-old backup simulates the worst-case scenario of needing to restore to a backup that isn't the most recent.

**Step 3: Create a test Supabase project**
1. Go to `https://supabase.com/dashboard` → New project
2. Name: `seven-waves-dr-drill-[YYYYMMDD]`
3. Region: `ap-northeast-2`
4. Note start time: ___________

**Step 4: Follow Process 4 (Full Database Restore) exactly**

Use the test project as the restore target. Pretend this is a real incident. Follow Process 4 step by step, don't skip steps.

Track time for each major step:
```
Step 1 (declare incident): ___________
Step 3 (new project ready): ___________
Step 5 (backup applied): ___________
Step 6 (RLS applied): ___________
Step 9 (validation complete): ___________
Step 11 (smoke tests done): ___________
```

**Step 5: Run smoke tests against the test project**

Temporarily update a staging Netlify deployment to point at the test project and verify:
- [ ] Admin login works
- [ ] Orders from 7 days ago visible
- [ ] Journal entries present
- [ ] Employee records visible
- [ ] Can create a new order (test flow)
- [ ] KDS shows tickets

**Step 6: Measure actual RTO**
```
Test start: ___________
"System restored" time: ___________
Actual RTO: ___________ (target: < 4 hours)
```

**Step 7: Delete the test project**
1. Go to Supabase dashboard → test project → Settings → General → Delete project
2. This prevents accidental connection to the DR project and avoids ongoing charges

**Step 8: Document drill results**

Create `docs/runbooks/dr-test-[YYYYMMDD].md`:
```markdown
# DR Drill Results — [Date]

## Test Configuration
- Backup used: [filename] from [date]
- Test project: [project ID]
- Participants: [names]

## Timeline
| Step | Start | End | Duration | Notes |
|------|-------|-----|----------|-------|
| Step 1: Declare | | | | |
| Step 3: New project | | | | |
| Step 5: DB restore | | | | |
| Step 6: RLS apply | | | | |
| Step 9: Validate | | | | |
| Step 11: Smoke tests | | | | |

## Results
- **Actual RTO:** [X hours Y minutes]
- **Target RTO:** 4 hours
- **Result:** PASS / FAIL

## What Worked Well
- [...]

## What Went Wrong / Slow
- [...]

## Action Items
- [ ] [fix or improvement needed]

## Documentation Updates
- [changes made to BACKUP_PLAN.md or BACKUP_PROCESS.md]
```

**Step 9: Update documentation**

If any step in this runbook didn't match reality, update BACKUP_PROCESS.md now.

---

## Process 8: Annual 7-Year Archive

**Who:** Tech Lead + Management sign-off  
**When:** January 1st each year  
**Purpose:** Long-term retention compliance (7-year legal requirement for financial records)  

### Steps

**Step 1: Create annual archive**
```bash
export YEAR=$(date -d '1 year ago' +%Y)
export DATE=$(date +%Y%m%d)
export DB_URL="[production connection string]"

# Full database dump
pg_dump "$DB_URL" \
  --no-privileges \
  --no-owner \
  --schema=public \
  -f "annual_${YEAR}_full.sql"

# Critical tables only (for faster selective restore)
for TABLE in orders order_items invoices payments journal_entries journal_entry_lines ledger_entries payroll_records attendance_records audit_logs; do
  psql "$DB_URL" -c "\COPY ${TABLE} TO STDOUT CSV HEADER" \
    > "annual_${YEAR}_${TABLE}.csv"
done

# Compress all
tar -czf "annual_archive_${YEAR}.tar.gz" annual_${YEAR}_*.sql annual_${YEAR}_*.csv
echo "Archive size: $(du -h annual_archive_${YEAR}.tar.gz | cut -f1)"
```

**Step 2: Upload to Glacier (long-term cheap storage)**
```bash
# Upload to S3 Glacier Instant Retrieval
aws s3 cp "annual_archive_${YEAR}.tar.gz" \
  "s3://seven-waves-backups/annual/annual_archive_${YEAR}.tar.gz" \
  --storage-class GLACIER \
  --sse AES256

echo "✓ Annual archive in Glacier: s3://seven-waves-backups/annual/annual_archive_${YEAR}.tar.gz"
```

**Step 3: Verify the archive**
```bash
# List to confirm upload
aws s3 ls "s3://seven-waves-backups/annual/" | grep $YEAR
```

**Step 4: Document and sign off**
Create `docs/compliance/annual-archive-[YEAR].md` with:
- Archive creation date
- Archive file size
- S3 Glacier path
- Tables included
- Retention until date ([YEAR] + 7 = target year)
- Sign-off: Tech Lead + Management

**Step 5: Verify last year's archive is still accessible**
```bash
PREV_YEAR=$((YEAR - 1))
aws s3 ls "s3://seven-waves-backups/annual/" | grep $PREV_YEAR
# Should show the previous year's archive still present
```

---

## Backup Log Template

Maintain a physical or digital backup log. Update after every backup event.

```
══════════════════════════════════════════════════════════════════
SEVEN WAVES ERP — BACKUP LOG
══════════════════════════════════════════════════════════════════

DATE          | TYPE        | STATUS  | SIZE    | NOTES
──────────────|─────────────|─────────|─────────|─────────────────
2026-07-16    | Auto/Daily  | OK      | 45.3MB  |
2026-07-15    | Auto/Daily  | OK      | 44.8MB  |
2026-07-15    | Manual      | OK      | 44.2MB  | Before finance migration
2026-07-14    | Auto/Daily  | FAILED  | 0       | S3 credentials expired — fixed
2026-07-14    | Emergency   | OK      | 44.1MB  | Emergency backup after auto failed
══════════════════════════════════════════════════════════════════
```

---

## Quick Reference: Emergency Contacts

| Situation | Contact | Method |
|-----------|---------|--------|
| Backup system failure | Tech Lead | Phone |
| Data loss confirmed | Tech Lead + Management | Phone |
| Supabase outage | Supabase Support | `https://supabase.com/dashboard/support/new` |
| AWS S3 issue | AWS Support | AWS Console → Support |
| Recovery in progress (> 1hr) | CEO/Owner | Phone call |
| Recovery complete | All stakeholders | WhatsApp + Email |

---

## Checklist: Before Any Production Database Change

Use this checklist before every migration, bulk update, or destructive operation:

```
□ Is there a manual backup from TODAY?
  → If no: run Process 2 before proceeding

□ Have I tested this change on staging first?
  → If no: run on staging first, verify, then production

□ Is there a rollback plan?
  → If no: write down exactly how to undo the change

□ Is it off-peak hours (midnight–6am KST)?
  → If no: reschedule unless urgent

□ Is a second person available to assist if something goes wrong?
  → Strongly recommended for schema changes

□ Have I announced the change in the team channel?
  → Post: "Running [change description] in 5 minutes."

□ Do I have the backup's S3 path ready for quick restore?
  → Note: s3://seven-waves-backups/database/[filename]
```

---

*This runbook is a living document. Update it after every drill, incident, or process improvement. Last tested: check DR drill log.*
