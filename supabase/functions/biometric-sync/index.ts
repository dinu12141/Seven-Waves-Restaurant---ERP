// @ts-nocheck
/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, token',
}

interface ParsedPunch {
  pin: string
  punchTime: string
  punchType: 'in' | 'out'
  verifyType: string
  rawLine: string
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // 2. Health / Ping Check
  if (url.pathname.endsWith('/health') || url.pathname.endsWith('/ping')) {
    return new Response(
      JSON.stringify({
        status: 'online',
        service: 'ZKTeco Cloud ADMS Biometric Gateway',
        version: '2.5.0',
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Server environment missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Extract device serial number (SN) from query params or headers
    const sn = (
      url.searchParams.get('SN') ||
      url.searchParams.get('sn') ||
      url.searchParams.get('device_id') ||
      req.headers.get('x-device-sn') ||
      'UNKNOWN-ZK-DEVICE'
    ).trim()

    // ─── A. GET HANDLER: ZKTeco ADMS Protocol ────────────────────────────
    if (req.method === 'GET') {
      const isGetRequest =
        url.pathname.includes('/getrequest') ||
        url.searchParams.get('action') === 'getrequest' ||
        url.searchParams.has('getrequest')

      // A1: Polling for Commands (GET /iclock/getrequest)
      if (isGetRequest) {
        console.log(`[ADMS:GETREQUEST] Poll from SN: ${sn}`)

        // Check if device requires a full historical log dump
        const shouldQueryAll = url.searchParams.get('force') === '1'

        if (shouldQueryAll) {
          // Instruct ZKTeco terminal to dump ALL historical logs
          return new Response('C:101:DATA QUERY ATTLOG', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          })
        }

        // Return standard OK if no commands queued
        return new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      // A2: Handshake & Config (GET /iclock/cdata or GET /)
      console.log(`[ADMS:HANDSHAKE] Init request from SN: ${sn}`)

      // Auto-register / update device status in devices table
      await touchDevice(supabase, sn)

      // ZKTeco ADMS Configuration Header
      // Setting ATTLOGStamp=None instructs the device to upload ALL historical attendance records
      const admsConfigResponse = [
        `GET OPTION FROM: ${sn}`,
        'ATTLOGStamp=None',
        'OPERLOGStamp=None',
        'ATTPHOTOStamp=None',
        'ErrorDelay=30',
        'Delay=10',
        'TransTimes=00:00;14:05',
        'TransInterval=1',
        'TransFlag=1111000000',
        'TimeZone=5.5',
        'Realtime=1',
        'Encrypt=0',
        'ServerVersion=3.0.1',
      ].join('\n')

      return new Response(admsConfigResponse, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // ─── B. POST HANDLER: Pushed Attendance Records ───────────────────────
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || ''
      const isCmdResponse = url.pathname.includes('/devicecmd') || url.searchParams.has('CMD')

      // B1: Command confirmation (POST /iclock/devicecmd)
      if (isCmdResponse) {
        console.log(`[ADMS:CMD_ACK] Received command ACK from SN: ${sn}`)
        return new Response('OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      // Read request body
      const rawBody = await req.text()
      if (!rawBody || rawBody.trim().length === 0) {
        return new Response('OK: 0', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      console.log(`[ADMS:POST] Received payload from SN: ${sn}, size: ${rawBody.length} bytes`)

      // Resolve Company & Branch for this device
      const deviceContext = await resolveDeviceContext(supabase, sn)

      let punches: ParsedPunch[] = []

      // B2: Check if JSON payload (REST API / Web Bridge)
      if (contentType.includes('application/json') || rawBody.trim().startsWith('{')) {
        try {
          const parsedJson = JSON.parse(rawBody)
          const records = parsedJson.records || parsedJson.punches || [parsedJson]

          punches = records.map((r: any) => ({
            pin: String(r.employee_code || r.pin || r.userId || r.user_id || '').trim(),
            punchTime: formatToIsoTimestamp(r.punch_time || r.timestamp || r.time),
            punchType: (r.punch_type || r.type || 'in').toLowerCase() === 'out' ? 'out' : 'in',
            verifyType: String(r.verify_type || 'fingerprint'),
            rawLine: JSON.stringify(r),
          }))
        } catch (e: any) {
          console.warn('[ADMS] Failed to parse JSON, falling back to text lines:', e.message)
        }
      }

      // B3: Standard ZKTeco ADMS Text Payload (table=ATTLOG / raw punch stream)
      if (punches.length === 0) {
        punches = parseZkAttlogLines(rawBody)
      }

      if (punches.length === 0) {
        console.log('[ADMS] No valid punch lines detected in payload.')
        return new Response('OK: 0', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }

      console.log(`[ADMS] Parsed ${punches.length} punches from device ${sn}`)

      // B4: Resolve Employees and Determine Punch Direction (In / Out)
      const attendanceLogRows = await buildAttendanceLogRows(supabase, punches, sn, deviceContext)

      // B5: Deduplicated Upsert into attendance_logs
      const { data: inserted, error: insertError } = await supabase
        .from('attendance_logs')
        .upsert(attendanceLogRows, {
          onConflict: 'employee_code, punch_time, device_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (insertError) {
        console.error('[ADMS:DB_ERROR] Failed inserting attendance_logs:', insertError)
        throw insertError
      }

      const insertedCount = inserted?.length || punches.length

      // B6: Trigger Attendance Processing Engine
      try {
        const { error: rpcError } = await supabase.rpc('process_attendance_logs_v2')
        if (rpcError) {
          console.warn('[ADMS] process_attendance_logs_v2 failed, trying fallback:', rpcError.message)
          await supabase.rpc('process_attendance_logs')
        }
      } catch (err: any) {
        console.warn('[ADMS] Cron will process attendance records:', err.message)
      }

      // B7: Update Device Status
      await touchDevice(supabase, sn, punches.length)

      // Response: If client expects JSON, return JSON. Otherwise return ZKTeco standard `OK: <count>`
      if (contentType.includes('application/json')) {
        return new Response(
          JSON.stringify({
            success: true,
            sn,
            received: punches.length,
            inserted: insertedCount,
          }),
          {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          },
        )
      }

      // Standard ZKTeco protocol acknowledgment
      return new Response(`OK: ${punches.length}`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (err: any) {
    console.error('[ADMS:FATAL_ERROR]', err)
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Parses standard ZKTeco ADMS raw text lines (table=ATTLOG)
 * Formats:
 *  1. PIN \t YYYY-MM-DD HH:MM:SS \t STATUS \t VERIFY \t ...
 *  2. PIN   YYYY-MM-DD HH:MM:SS   STATUS   VERIFY
 *  3. PIN,YYYY-MM-DD HH:MM:SS,STATUS,VERIFY
 */
function parseZkAttlogLines(rawText: string): ParsedPunch[] {
  const lines = rawText.split(/\r?\n/)
  const punches: ParsedPunch[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('SN=') || trimmed.startsWith('table=')) {
      continue
    }

    // Split on tabs, commas, or sequences of spaces
    let tokens = trimmed.includes('\t')
      ? trimmed.split('\t')
      : trimmed.includes(',')
      ? trimmed.split(',')
      : trimmed.split(/\s+/)

    tokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0)
    if (tokens.length < 2) continue

    const pin = tokens[0]

    // Determine timestamp
    let timestampStr = ''
    let statusToken = ''
    let verifyToken = ''

    if (tokens[1].includes('-') || tokens[1].includes('/')) {
      if (tokens[1].includes(':') || tokens[1].includes('T')) {
        // e.g. "2026-10-15T08:30:00" or "2026-10-15 08:30:00"
        timestampStr = tokens[1]
        statusToken = tokens[2] || ''
        verifyToken = tokens[3] || ''
      } else if (tokens[2] && tokens[2].includes(':')) {
        // e.g. ["1", "2026-10-15", "08:30:00", "0", "1"]
        timestampStr = `${tokens[1]} ${tokens[2]}`
        statusToken = tokens[3] || ''
        verifyToken = tokens[4] || ''
      }
    }

    if (!timestampStr) continue

    const isoTime = formatToIsoTimestamp(timestampStr)
    if (!isoTime) continue

    // Map punch type
    // ZKTeco Statuses: 0 = Check In, 1 = Check Out, 2 = Break Out, 3 = Break In, 4 = OT In, 5 = OT Out
    let punchType: 'in' | 'out' = 'in'
    if (statusToken === '1' || statusToken.toLowerCase() === 'out' || statusToken === '2' || statusToken === '5') {
      punchType = 'out'
    } else {
      punchType = 'in'
    }

    // Verify type: 1 = Fingerprint, 2 = Face, 3 = Password, 4 = Card, 15 = Palm
    let verifyType = 'fingerprint'
    if (verifyToken === '2') verifyType = 'face'
    else if (verifyToken === '4') verifyType = 'rfid_card'
    else if (verifyToken === '3') verifyType = 'passcode'

    punches.push({
      pin,
      punchTime: isoTime,
      punchType,
      verifyType,
      rawLine: trimmed,
    })
  }

  return punches
}

/**
 * Converts various date string formats to a clean ISO 8601 string.
 */
function formatToIsoTimestamp(rawTime: string): string {
  if (!rawTime) return new Date().toISOString()
  try {
    const cleaned = rawTime.replace(/\//g, '-').trim()
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) {
      return d.toISOString()
    }
    // Fallback for naive YYYY-MM-DD HH:MM:SS
    const parts = cleaned.split(' ')
    if (parts.length === 2) {
      return new Date(`${parts[0]}T${parts[1]}+05:30`).toISOString()
    }
  } catch {
    // ignore
  }
  return new Date().toISOString()
}

/**
 * Look up device in devices table to obtain associated branch_id and company_id.
 * Falls back to default branch and company if device is newly registered.
 */
async function resolveDeviceContext(supabase: any, sn: string) {
  // 1. Try finding device by serial_number or IP
  const { data: device } = await supabase
    .from('devices')
    .select('id, company_id, branch_id, device_name')
    .or(`serial_number.eq.${sn},ip_address.eq.${sn}`)
    .limit(1)
    .maybeSingle()

  if (device && device.company_id && device.branch_id) {
    return {
      deviceId: device.id,
      companyId: device.company_id,
      branchId: device.branch_id,
    }
  }

  // 2. Fallback: Lookup first company and branch
  const { data: defaultBranch } = await supabase
    .from('branches')
    .select('id, company_id')
    .limit(1)
    .single()

  return {
    deviceId: null,
    companyId: defaultBranch?.company_id || null,
    branchId: defaultBranch?.id || null,
  }
}

/**
 * Register or update device heartbeat in devices table.
 */
async function touchDevice(supabase: any, sn: string, punchCount = 0) {
  try {
    const { data: existing } = await supabase
      .from('devices')
      .select('id, config')
      .or(`serial_number.eq.${sn},ip_address.eq.${sn}`)
      .limit(1)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('devices')
        .update({
          status: 'online',
          last_seen_at: new Date().toISOString(),
          config: {
            ...(existing.config || {}),
            last_adms_sync_at: new Date().toISOString(),
            last_punches_received: punchCount,
          },
        })
        .eq('id', existing.id)
    } else {
      // Auto-register new biometric terminal
      const { data: branch } = await supabase.from('branches').select('id, company_id').limit(1).single()
      if (branch) {
        await supabase.from('devices').insert({
          company_id: branch.company_id,
          branch_id: branch.id,
          device_type: 'biometric',
          device_name: `ZKTeco Terminal (${sn})`,
          serial_number: sn,
          connection: 'network',
          status: 'online',
          last_seen_at: new Date().toISOString(),
          config: {
            protocol: 'adms_push',
            registered_via: 'auto_handshake',
          },
        })
      }
    }
  } catch (err: any) {
    console.warn('[ADMS] touchDevice error:', err.message)
  }
}

/**
 * Maps raw punch logs to attendance_logs table rows, linking employee_id where possible,
 * and performing day-based punch direction alternation if all device punches are unmarked.
 */
async function buildAttendanceLogRows(
  supabase: any,
  punches: ParsedPunch[],
  sn: string,
  context: { companyId: string; branchId: string; deviceId: string | null },
) {
  // Fetch active employees to match PIN with employee_code
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_code, first_name, last_name')
    .eq('is_active', true)

  const employeeMap = new Map<string, { id: string; code: string }>()
  if (employees) {
    for (const emp of employees) {
      const code = String(emp.employee_code).trim()
      employeeMap.set(code.toLowerCase(), { id: emp.id, code })
      // Support numeric match (e.g. EMP001 -> '1', '01', '001')
      const numOnly = code.replace(/\D/g, '')
      if (numOnly) {
        employeeMap.set(numOnly, { id: emp.id, code })
        employeeMap.set(parseInt(numOnly, 10).toString(), { id: emp.id, code })
      }
    }
  }

  // Sort punches chronologically
  punches.sort((a, b) => new Date(a.punchTime).getTime() - new Date(b.punchTime).getTime())

  // Group punches by employee + day to handle automatic IN/OUT alternation
  const employeeDayGroups = new Map<string, ParsedPunch[]>()
  for (const p of punches) {
    const day = p.punchTime.slice(0, 10)
    const key = `${p.pin}|${day}`
    if (!employeeDayGroups.has(key)) employeeDayGroups.set(key, [])
    employeeDayGroups.get(key)!.push(p)
  }

  const rows: any[] = []

  for (const dayPunches of employeeDayGroups.values()) {
    let lastPunchType = 'out' // First punch defaults to IN

    for (let i = 0; i < dayPunches.length; i++) {
      const p = dayPunches[i]
      const cleanPin = p.pin.toLowerCase()
      const matched = employeeMap.get(cleanPin) || employeeMap.get(p.pin)

      const finalEmployeeCode = matched ? matched.code : p.pin
      const finalEmployeeId = matched ? matched.id : null

      // Alternate IN/OUT per calendar day
      let resolvedPunchType = p.punchType
      if (dayPunches.every((dp) => dp.punchType === 'in')) {
        resolvedPunchType = lastPunchType === 'in' ? 'out' : 'in'
        lastPunchType = resolvedPunchType
      }

      rows.push({
        company_id: context.companyId,
        branch_id: context.branchId,
        employee_id: finalEmployeeId,
        employee_code: finalEmployeeCode,
        device_id: sn,
        punch_time: p.punchTime,
        punch_type: resolvedPunchType,
        source: 'biometric',
        raw_data: {
          pin: p.pin,
          verify_type: p.verifyType,
          raw_line: p.rawLine,
          sn,
        },
        is_processed: false,
      })
    }
  }

  return rows
}
