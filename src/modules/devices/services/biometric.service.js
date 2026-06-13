// ═══════════════════════════════════════════════════════════════════
// Biometric Service — Attendance device sync & management
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'

const MODULE = 'devices.biometric'

// ─── BIOMETRIC SYNC LOGS ────────────────────────────────────────────
export async function fetchBiometricLogs(branchId, statusFilter = null) {
  let query = (c) => {
    let q = c.from('biometric_sync_logs')
      .select('*, devices(device_name)')
      .eq('branch_id', branchId)
      .order('punch_time', { ascending: false })
      .limit(500)
    if (statusFilter) q = q.eq('sync_status', statusFilter)
    return q
  }
  return api.query(query, { module: MODULE, action: 'fetchBiometricLogs' })
}

export async function createBiometricSyncEntry(entry) {
  return api.query(
    (c) => c.from('biometric_sync_logs').insert(entry).select().single(),
    { module: MODULE, action: 'createSyncEntry', retries: 0 }
  )
}

export async function markSynced(logId) {
  return api.query(
    (c) => c.from('biometric_sync_logs')
      .update({ sync_status: 'synced', synced_at: new Date().toISOString() })
      .eq('id', logId)
      .select()
      .single(),
    { module: MODULE, action: 'markSynced', retries: 0 }
  )
}

export async function markFailed(logId, errorMessage) {
  return api.query(
    (c) => c.from('biometric_sync_logs')
      .update({ sync_status: 'failed', error_message: errorMessage })
      .eq('id', logId)
      .select()
      .single(),
    { module: MODULE, action: 'markFailed', retries: 0 }
  )
}

/**
 * Bulk sync pending biometric entries.
 * Processes one at a time to prevent duplicates.
 */
export async function syncPendingEntries(branchId) {
  const { data: pending } = await api.query(
    (c) => c.from('biometric_sync_logs')
      .select('*')
      .eq('branch_id', branchId)
      .eq('sync_status', 'pending')
      .order('punch_time')
      .limit(50),
    { module: MODULE, action: 'fetchPending' }
  )

  if (!pending || pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const entry of pending) {
    // Check for duplicate punch (same employee, same type, within 5 min)
    const { data: existing } = await api.query(
      (c) => c.from('biometric_sync_logs')
        .select('id')
        .eq('employee_id', entry.employee_id)
        .eq('punch_type', entry.punch_type)
        .eq('sync_status', 'synced')
        .gte('punch_time', new Date(new Date(entry.punch_time).getTime() - 5 * 60000).toISOString())
        .lte('punch_time', new Date(new Date(entry.punch_time).getTime() + 5 * 60000).toISOString())
        .limit(1),
      { module: MODULE, action: 'checkDuplicate', silent: true }
    )

    if (existing && existing.length > 0) {
      await api.query(
        (c) => c.from('biometric_sync_logs')
          .update({ sync_status: 'duplicate' })
          .eq('id', entry.id),
        { module: MODULE, action: 'markDuplicate', silent: true }
      )
      continue
    }

    try {
      await markSynced(entry.id)
      synced++
    } catch {
      await markFailed(entry.id, 'Sync processing error')
      failed++
    }
  }

  return { synced, failed }
}
