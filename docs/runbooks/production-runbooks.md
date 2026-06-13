# Seven Waves ERP — Production Runbooks
## Step 07: Final Production Hardening

---

## RUNBOOK 01: Branch Offline Recovery

### Symptoms
- Branch POS not processing orders
- Dashboard shows "Offline" status
- WebSocket disconnected

### Diagnosis
1. Check branch internet connectivity
2. Verify Supabase service status: `https://status.supabase.com`
3. Check `device_heartbeat` table for last_seen_at timestamps
4. Review browser console for WebSocket errors

### Recovery Steps
1. **If Internet Down:**
   - Enable offline mode (automatic via OfflineSyncEngine)
   - POS continues in offline queue mode
   - Verify queue items: Settings → Sync Status
   - When internet returns, queue auto-syncs

2. **If Supabase Down:**
   - Monitor Supabase status page
   - Offline queue continues collecting operations
   - DO NOT force-restart — queued data may be lost
   - When service returns, verify reconciliation

3. **Manual Resync:**
   ```
   Admin → System → Offline Queue → Force Sync
   ```

### Escalation
- If offline >2 hours: Notify operations manager
- If data loss suspected: Contact DBA immediately

---

## RUNBOOK 02: Printer Failure Recovery

### Symptoms
- "Print failed" errors on POS
- Kitchen tickets not printing
- Receipts printing garbled text

### Diagnosis
1. Check printer power and paper
2. Verify network connectivity (ping printer IP)
3. Check print job queue: `Admin → Devices → Printers`
4. Review failed jobs in `print_jobs` table

### Recovery Steps
1. **Paper Jam / Out of Paper:**
   - Reload paper, clear jam
   - Requeue failed jobs from admin panel

2. **Network Printer Offline:**
   ```
   ping <printer-ip>
   ```
   - If unreachable: Check ethernet cable, restart printer
   - If reachable: Restart print service on POS

3. **Garbled Output:**
   - Verify printer ESC/POS compatibility
   - Check printer width setting (58mm vs 80mm)
   - Send test print from admin panel

4. **Queue Blocked:**
   ```sql
   -- Clear stuck jobs
   UPDATE print_jobs SET status = 'queued' WHERE status = 'printing' AND updated_at < NOW() - INTERVAL '5 minutes';
   ```

### Prevention
- Enable printer heartbeat monitoring
- Set alert for >3 consecutive failures

---

## RUNBOOK 03: Voucher Posting Incident

### Symptoms
- "Voucher is being posted by another user" error
- Voucher stuck in "processing" state
- Duplicate posting suspected

### Diagnosis
1. Check advisory locks: `SELECT * FROM pg_locks WHERE locktype = 'advisory';`
2. Verify voucher status in DB
3. Check audit_logs for recent posting attempts

### Recovery Steps
1. **Advisory Lock Stuck:**
   ```sql
   -- Find stuck locks
   SELECT pid, locktype, objid FROM pg_locks WHERE locktype = 'advisory';

   -- Terminate stuck session (CAUTION)
   SELECT pg_terminate_backend(<pid>);
   ```

2. **Duplicate Posting Check:**
   ```sql
   SELECT voucher_number, is_posted, posted_at, posted_by
   FROM vouchers WHERE id = '<voucher_id>';

   -- Verify entries balance
   SELECT SUM(debit_amount) AS debits, SUM(credit_amount) AS credits
   FROM voucher_entries WHERE voucher_id = '<voucher_id>';
   ```

3. **Reversal (if duplicate posted):**
   - Create a reversal voucher (not manual edit)
   - Posted vouchers are IMMUTABLE — use correction entries

### Prevention
- Always use `safe_post_voucher()` RPC
- Never bypass advisory locks

---

## RUNBOOK 04: Database Outage Response

### Symptoms
- All API calls returning 500 errors
- "Connection refused" in logs
- Supabase dashboard unreachable

### Immediate Actions
1. Check Supabase status: `https://status.supabase.com`
2. Check project health: Supabase Dashboard → Project → Settings
3. Verify connection pool: `SELECT count(*) FROM pg_stat_activity;`

### Recovery Steps
1. **Connection Pool Exhaustion:**
   ```sql
   -- Kill idle connections
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle' AND state_change < NOW() - INTERVAL '10 minutes';
   ```

2. **Project Paused:**
   - Restore from Supabase Dashboard
   - Wait 2-3 minutes for cold start

3. **Storage Full:**
   - Check with `SELECT pg_database_size(current_database());`
   - Prune old audit_logs: Keep 90 days
   - Archive old orders: Move to `orders_archive`

### Escalation
- If unresolved in 15 minutes: Page on-call DBA
- If data corruption suspected: STOP ALL WRITES, engage DR

---

## RUNBOOK 05: WebSocket Outage Response

### Symptoms
- KDS not showing new orders
- Realtime updates stopped
- "Disconnected" indicators on dashboards

### Recovery Steps
1. Check Supabase Realtime status
2. Verify heartbeat interval: Should be 30s
3. Check reconnect backoff: Max 30s, exponential
4. Force reconnect: `Admin → System → Reconnect Realtime`

### Manual Intervention
```javascript
// Browser console
window.__SUPABASE_REALTIME_RECONNECT__ = true
```

---

## RUNBOOK 06: AI Service Outage Fallback

### Symptoms
- AI insights page showing errors
- Chat assistant not responding
- Edge Function timeouts

### Recovery Steps
1. Check Edge Function logs: `Supabase → Functions → ai-gemini-service → Logs`
2. Verify Gemini API status
3. Check rate limits: Max 10 AI requests/min per user

### Fallback Mode
- System automatically switches to cached insights
- Deterministic summaries used instead of AI
- Finance calculations continue without AI enrichment
- KDS operates normally (AI is enhancement only)

---

## RUNBOOK 07: KDS Reconnect Issue

### Symptoms
- Kitchen displays showing stale orders
- Duplicate order cards appearing
- Status updates not reflecting

### Recovery Steps
1. Force KDS refresh: Press F5 on KDS terminal
2. Clear browser cache on KDS device
3. Verify branch subscription: Check realtime channels
4. Restart KDS display service

---

## RUNBOOK 08: Failed Deployment Rollback

### Steps
1. **Identify failing version:**
   ```bash
   git log --oneline -5
   ```

2. **Rollback to previous build:**
   ```bash
   git revert HEAD
   npx quasar build
   ```

3. **Database migration rollback:**
   - If migration caused issues, apply reverse migration
   - NEVER drop tables in production — use ALTER statements

4. **Verify:**
   - Run health check: `SELECT db_health_check();`
   - Verify test suite passes
   - Check monitoring dashboard

---

## RUNBOOK 09: Backup Restore Procedure

### Regular Backups
- Supabase automatic daily backups (retained 7 days)
- Point-in-Time Recovery (PITR) available on Pro plans

### Restore Steps
1. Navigate to: Supabase Dashboard → Project → Database → Backups
2. Select restore point
3. **WARNING:** Restore replaces ALL current data
4. Notify all users before restoring
5. After restore, verify:
   - Order counts match expected
   - Financial balances correct
   - User sessions valid

---

## RUNBOOK 10: Suspicious Login Response

### Indicators
- Rate limiter triggered (>5 failed logins in 5 min)
- Impossible travel detected (different IP in <5 min)
- Multiple failed attempts from same IP

### Response
1. Check security events: `Admin → Security → Events`
2. If brute force confirmed:
   - Account automatically locked for 15 minutes
   - Review IP in `security_events` table
   - Consider IP block at edge/CDN level
3. If account compromised:
   - Force password reset
   - Revoke all sessions
   - Review audit logs for unauthorized actions
   - Notify user via secondary channel

---

## RUNBOOK 11: Incident Response Template

```
INCIDENT REPORT
===============
Date/Time: _______________
Severity: [ ] P1-Critical [ ] P2-High [ ] P3-Medium [ ] P4-Low
Reporter: _______________

IMPACT:
- Users affected: _______________
- Branches affected: _______________
- Revenue impact: _______________

TIMELINE:
- Detected at: _______________
- Acknowledged at: _______________
- Mitigated at: _______________
- Resolved at: _______________

ROOT CAUSE:
_______________________________________________

RESOLUTION:
_______________________________________________

PREVENTION:
_______________________________________________
```
