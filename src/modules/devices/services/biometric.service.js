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

// ─── CLOUD ADMS & USB ATTLOG HELPERS ─────────────────────────────────────────

import { supabase } from 'src/boot/supabase'

/**
 * Returns configuration parameters for setting up ZKTeco Cloud ADMS.
 */
export function getAdmsConfig() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
  const domain = supabaseUrl.replace(/^https?:\/\//, '').split('/')[0]

  return {
    serverUrl: `${supabaseUrl}/functions/v1/biometric-sync`,
    serverDomain: domain,
    serverPort: 443,
    webPath: '/functions/v1/biometric-sync',
    protocol: 'ADMS / Cloud Server',
    instructions: [
      'On your ZKTeco Terminal, press MENU to enter Settings.',
      'Navigate to "Comm." (Communication) -> "Cloud Server" or "ADMS".',
      `Set Server Address / Domain to: ${domain}`,
      'Set Server Port to: 443 (or standard HTTPS port).',
      'Enable "Domain Name": YES.',
      'Under Web Server Path (if available), enter: /functions/v1/biometric-sync',
      'Save settings and restart terminal or test network. Punches will stream to ERP in real-time!',
    ],
  }
}

/**
 * Test connectivity with Cloud ADMS endpoint.
 */
export async function testCloudAdmsHealth() {
  try {
    const config = getAdmsConfig()
    const res = await fetch(`${config.serverUrl}/health`, {
      method: 'GET',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    const data = await res.json()
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err.message || 'Cloud ADMS endpoint unreachable' }
  }
}

/**
 * Parses raw text from a ZKTeco USB export file (1_attlog.dat / attlog.dat / CSV)
 */
export function parseUsbAttlogText(rawText) {
  if (!rawText) return []
  const lines = rawText.split(/\r?\n/)
  const punches = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('pin') || trimmed.toLowerCase().startsWith('no')) {
      continue
    }

    const tokens = trimmed.includes('\t')
      ? trimmed.split('\t')
      : trimmed.includes(',')
      ? trimmed.split(',')
      : trimmed.split(/\s+/)

    const cleanTokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0)
    if (cleanTokens.length < 2) continue

    const pin = cleanTokens[0]
    let timestampStr = ''
    let statusToken = ''
    let verifyToken = ''

    if (cleanTokens[1].includes('-') || cleanTokens[1].includes('/')) {
      if (cleanTokens[1].includes(':') || cleanTokens[1].includes('T')) {
        timestampStr = cleanTokens[1]
        statusToken = cleanTokens[2] || ''
        verifyToken = cleanTokens[3] || ''
      } else if (cleanTokens[2] && cleanTokens[2].includes(':')) {
        timestampStr = `${cleanTokens[1]} ${cleanTokens[2]}`
        statusToken = cleanTokens[3] || ''
        verifyToken = cleanTokens[4] || ''
      }
    }

    if (!timestampStr) continue

    let punchType = 'in'
    if (statusToken === '1' || statusToken.toLowerCase() === 'out' || statusToken === '2' || statusToken === '5') {
      punchType = 'out'
    }

    punches.push({
      pin,
      punchTime: timestampStr.replace(/\//g, '-'),
      punchType,
      verifyType: verifyToken === '2' ? 'face' : verifyToken === '4' ? 'card' : 'fingerprint',
      rawLine: trimmed,
    })
  }

  return punches
}

/**
 * Imports parsed USB/Historical punches directly into the database.
 */
export async function importAttlogPunches({ punches, companyId, branchId, deviceId = 'ZKTeco-USB' }) {
  if (!punches || punches.length === 0) {
    return { success: false, error: 'No punch records to import' }
  }

  // 1. Fetch active employees to match PIN with employee_code
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, last_name')
    .eq('is_active', true)

  if (empErr) throw empErr

  const employeeMap = new Map()
  for (const emp of employees || []) {
    const code = String(emp.employee_code).trim()
    employeeMap.set(code.toLowerCase(), emp)
    const numOnly = code.replace(/\D/g, '')
    if (numOnly) {
      employeeMap.set(numOnly, emp)
      employeeMap.set(parseInt(numOnly, 10).toString(), emp)
    }
  }

  // 2. Sort chronologically
  punches.sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime())

  // Group by employee + calendar day to handle automatic IN/OUT alternation
  const employeeDayGroups = new Map()
  for (const p of punches) {
    const day = p.punchTime.slice(0, 10)
    const key = `${p.pin}|${day}`
    if (!employeeDayGroups.has(key)) employeeDayGroups.set(key, [])
    employeeDayGroups.get(key).push(p)
  }

  const rows = []
  let matchedCount = 0

  for (const dayPunches of employeeDayGroups.values()) {
    let lastPunchType = 'out'

    for (const p of dayPunches) {
      const cleanPin = p.pin.toLowerCase()
      const emp = employeeMap.get(cleanPin) || employeeMap.get(p.pin)
      if (emp) matchedCount++

      const finalCode = emp ? emp.employee_code : p.pin
      const finalId = emp ? emp.id : null

      let resolvedPunchType = p.punchType
      if (dayPunches.every((dp) => dp.punchType === 'in')) {
        resolvedPunchType = lastPunchType === 'in' ? 'out' : 'in'
        lastPunchType = resolvedPunchType
      }

      rows.push({
        company_id: companyId,
        branch_id: branchId,
        employee_id: finalId,
        employee_code: finalCode,
        device_id: deviceId,
        punch_time: new Date(p.punchTime).toISOString(),
        punch_type: resolvedPunchType,
        source: 'biometric',
        raw_data: { pin: p.pin, raw_line: p.rawLine, import_source: 'usb_attlog' },
        is_processed: false,
      })
    }
  }

  // 3. Upsert into attendance_logs with conflict ignore
  const { data: inserted, error: insertErr } = await supabase
    .from('attendance_logs')
    .upsert(rows, {
      onConflict: 'employee_code, punch_time, device_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (insertErr) throw insertErr

  // 4. Trigger processing engine
  try {
    const { error: rpcErr } = await supabase.rpc('process_attendance_logs_v2')
    if (rpcErr) await supabase.rpc('process_attendance_logs')
  } catch (e) {
    console.warn('[BiometricService] Process logs background trigger:', e)
  }

  return {
    success: true,
    totalParsed: punches.length,
    insertedCount: inserted?.length || rows.length,
    matchedCount,
  }
}
