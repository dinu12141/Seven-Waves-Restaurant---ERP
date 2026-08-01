// ═══════════════════════════════════════════════════════════════════
// ZKTeco Biometric Service — Device protocol + attendance sync
// Seven Waves ERP — Step 06 Device & Platform Expansion
//
// Runtime: Electron desktop app ONLY. The device sits on the local network
// (e.g. 192.168.x.x:4370) and speaks a binary TCP protocol — only a process
// with LAN access can reach it. That's the Electron main process
// (desktop/electron/ipc/handlers.js, using node-zklib), not Supabase Edge
// Functions (cloud, no route to your LAN) and not this browser code directly
// (no raw TCP sockets). This file is the renderer-side bridge: it asks the
// Electron main process to talk to the device, then writes the resulting
// punches into `attendance_logs` — the SAME table the existing
// process_attendance_logs() engine (biometric_integration.sql) already
// reads from every 5 minutes via pg_cron to build attendance_records.
//
// Employee matching: the device only knows a "User ID" string per enrolled
// fingerprint (entered on the device's own keypad under User Mgmt — this
// library version cannot enroll/delete users remotely). Enter the ERP's
// employee_code there (e.g. "EMP001") so a pulled punch's device user id
// round-trips directly to attendance_logs.employee_code with no separate
// mapping table needed.
//
// Punch direction: the ZKTeco protocol CAN report an in/out flag per record,
// but this device/library combination's 40-byte record format does not
// expose it (verified against the installed node-zklib@1.3.0 decoder) — only
// { deviceUserId, recordTime } come back. So direction is inferred here by
// alternating in/out per employee per calendar day: first punch of the day
// is "in", the next is "out", and so on. This matches how these budget
// terminals are meant to be used (punch once arriving, once leaving).
// ═══════════════════════════════════════════════════════════════════

import { logger } from 'src/core/logging/logger'
import { supabase } from 'src/boot/supabase'

const ZK_PORT_DEFAULT = 4370

function _isElectron() {
  return typeof window !== 'undefined' && typeof window.electronAPI?.syncBiometric === 'function'
}

async function _call(params) {
  if (!_isElectron()) {
    return { success: false, error: 'ZKTeco sync requires the Electron desktop app' }
  }
  return window.electronAPI.syncBiometric(params)
}

// ─── Main Service Class ───────────────────────────────────────────────────────

/**
 * ZKTeco device client.
 *
 * Usage:
 *   const device = new ZKTecoClient({ ip: '192.168.1.201', branchId, companyId })
 *   const result = await device.syncToDatabase()
 */
export class ZKTecoClient {
  constructor({ ip, port = ZK_PORT_DEFAULT, branchId, companyId }) {
    this.ip = ip
    this.port = port
    this.branchId = branchId
    this.companyId = companyId
  }

  /** Get device info: { userCounts, logCounts, logCapacity }. */
  async getDeviceInfo() {
    return _call({ action: 'info', ip: this.ip, port: this.port })
  }

  /**
   * Pull attendance records from the device and write them to
   * attendance_logs. The existing process_attendance_logs() cron job (runs
   * every 5 minutes) picks these up and turns them into attendance_records.
   */
  async syncToDatabase() {
    const result = await _call({ action: 'pull', ip: this.ip, port: this.port })
    if (!result.success) return result

    const records = (result.records || []).filter((r) => r.user_id)
    if (records.length === 0) {
      return { success: true, fetched: 0, written: 0 }
    }

    // ── Infer punch direction (in/out) ──────────────────────────────────
    // Group by employee + calendar day, sort chronologically, then alternate
    // in/out starting from whatever this employee's last known punch was
    // today (so a sync that only picks up the "out" half of a day still
    // continues the correct sequence instead of resetting to "in").
    const byEmployeeDay = new Map()
    for (const r of records) {
      const day = r.punch_time.slice(0, 10)
      const key = `${r.user_id}|${day}`
      if (!byEmployeeDay.has(key)) byEmployeeDay.set(key, [])
      byEmployeeDay.get(key).push(r)
    }

    const lastTypeByKey = new Map()
    for (const key of byEmployeeDay.keys()) {
      const [employeeCode, day] = key.split('|')
      const { data: last } = await supabase
        .from('attendance_logs')
        .select('punch_type')
        .eq('employee_code', employeeCode)
        .eq('device_id', this.ip)
        .gte('punch_time', `${day}T00:00:00`)
        .lt('punch_time', `${day}T23:59:59.999`)
        .order('punch_time', { ascending: false })
        .limit(1)
      lastTypeByKey.set(key, last?.[0]?.punch_type || null)
    }

    const rows = []
    for (const [key, dayRecords] of byEmployeeDay) {
      dayRecords.sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time))
      let lastType = lastTypeByKey.get(key)
      for (const r of dayRecords) {
        const punchType = lastType === 'in' ? 'out' : 'in'
        lastType = punchType
        rows.push({
          company_id: this.companyId,
          branch_id: this.branchId,
          employee_code: r.user_id,
          device_id: this.ip,
          punch_time: r.punch_time,
          punch_type: punchType,
          source: 'biometric',
          raw_data: r,
          is_processed: false,
        })
      }
    }

    const { error } = await supabase
      .from('attendance_logs')
      .upsert(rows, { onConflict: 'employee_code,punch_time,device_id', ignoreDuplicates: true })

    if (error) {
      logger.error('[ZKTeco] Failed to write attendance_logs', error)
      return { success: false, error: error.message, fetched: records.length, written: 0 }
    }

    // Nudge the processing function immediately instead of waiting for the
    // next cron tick, so the sync feels instant in the UI.
    const { error: procError } = await supabase.rpc('process_attendance_logs')
    if (procError) {
      logger.warn('[ZKTeco] process_attendance_logs RPC failed (cron will retry)', procError)
    }

    return { success: true, fetched: records.length, written: rows.length }
  }

  /** Clear the attendance log on the device after a confirmed successful sync. */
  async clearAttendanceLog() {
    return _call({ action: 'clear_attendance', ip: this.ip, port: this.port })
  }

  // NOTE: node-zklib@1.3.0 has no remote enroll/delete-user/set-time support
  // — fingerprint enrollment, user removal, and the device clock must all be
  // set on the device's own keypad (Main Menu → User Mgmt / System). Enroll
  // using the ERP employee_code as the device's "User ID" so pulled punches
  // match back to the right employee automatically.
}

// ─── Auto-sync Scheduler ──────────────────────────────────────────────────────

let _syncInterval = null

/**
 * Start automatic attendance sync on an interval.
 * Typically called on Electron app startup.
 *
 * @param {Array<{ ip, port, branchId, companyId }>} devices
 * @param {number} intervalMs - how often to sync (default 5 min)
 */
export function startAutoSync(devices, intervalMs = 5 * 60 * 1000) {
  stopAutoSync()

  const syncAll = async () => {
    for (const cfg of devices) {
      try {
        const client = new ZKTecoClient(cfg)
        const result = await client.syncToDatabase()
        logger.info('[ZKTeco] Auto-sync result', { ip: cfg.ip, ...result })
      } catch (err) {
        logger.error('[ZKTeco] Auto-sync error', { ip: cfg.ip, error: err.message })
      }
    }
  }

  syncAll() // immediate first run
  _syncInterval = setInterval(syncAll, intervalMs)
  logger.info('[ZKTeco] Auto-sync started', { devices: devices.length, intervalMs })
}

export function stopAutoSync() {
  if (_syncInterval) {
    clearInterval(_syncInterval)
    _syncInterval = null
    logger.info('[ZKTeco] Auto-sync stopped')
  }
}
