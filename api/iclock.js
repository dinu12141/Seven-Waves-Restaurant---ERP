/**
 * Seven Waves ERP — Cloud ADMS Biometric Gateway (Vercel Serverless Function)
 * ==========================================================================
 * Handles direct push/poll requests from physical ZKTeco fingerprint/face
 * terminals over the public internet (Zero local PC required!).
 *
 * Terminal Configuration:
 *   Server Mode: ADMS
 *   Enable Domain Name: ON
 *   Server Address: erp.sevenwaves.lk
 *   Server Port: 80 (or 443)
 *   Enable Proxy Server: OFF
 *
 * Supported Endpoints (rewritten from /iclock/*):
 *   GET  /iclock/cdata?SN=...       -> Handshake & Device Configuration
 *   POST /iclock/cdata?SN=...       -> Punch stream (table=ATTLOG)
 *   GET  /iclock/getrequest?SN=...  -> Command polling (returns OK)
 *   POST /iclock/devicecmd?SN=...   -> Command ACK (returns OK)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY

let supabase = null
function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  }
  return supabase
}

function parseZkAttlog(rawText) {
  const lines = (rawText || '').split(/\r?\n/)
  const punches = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('SN=') || trimmed.startsWith('table=')) continue

    let tokens = trimmed.includes('\t')
      ? trimmed.split('\t')
      : trimmed.includes(',')
      ? trimmed.split(',')
      : trimmed.split(/\s+/)
    tokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0)
    if (tokens.length < 2) continue

    const pin = tokens[0]
    let timestampStr = ''
    let statusToken = ''

    if (tokens[1].includes('-') || tokens[1].includes('/')) {
      if (tokens[1].includes(':') || tokens[1].includes('T')) {
        timestampStr = tokens[1]
        statusToken = tokens[2] || ''
      } else if (tokens[2] && tokens[2].includes(':')) {
        timestampStr = `${tokens[1]} ${tokens[2]}`
        statusToken = tokens[3] || ''
      }
    }
    if (!timestampStr) continue

    let isoTime = null
    try {
      const d = new Date(timestampStr.replace(/\//g, '-').trim())
      if (!isNaN(d.getTime())) isoTime = d.toISOString()
    } catch {}
    if (!isoTime) continue

    const punchType =
      statusToken === '1' || statusToken.toLowerCase() === 'out' || statusToken === '2' || statusToken === '5'
        ? 'out'
        : 'in'

    punches.push({ pin, punchTime: isoTime, punchType, rawLine: trimmed })
  }
  return punches
}

// Read raw body stream helper
async function getRawBody(req) {
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object') {
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    return JSON.stringify(req.body)
  }
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      resolve(data)
    })
  })
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'erp.sevenwaves.lk'}`)
  const sn = (
    url.searchParams.get('SN') ||
    url.searchParams.get('sn') ||
    url.searchParams.get('device_id') ||
    req.headers['x-device-sn'] ||
    'ZKTeco-Cloud'
  ).trim()

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    return res.status(200).send('OK')
  }

  // 1. GET Requests: Handshake and Poll
  if (req.method === 'GET') {
    const isGetRequest = url.pathname.includes('getrequest') || url.searchParams.get('action') === 'getrequest'
    if (isGetRequest) {
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send('OK')
    }

    // Handshake configuration response
    const admsConfig = [
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

    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send(admsConfig)
  }

  // 2. POST Requests: Punches Stream
  if (req.method === 'POST') {
    if (url.pathname.includes('devicecmd')) {
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send('OK')
    }

    const rawBody = await getRawBody(req)
    if (!rawBody || !rawBody.trim()) {
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send('OK: 0')
    }

    const punches = parseZkAttlog(rawBody)
    if (!punches.length) {
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send('OK: 0')
    }

    try {
      const client = getSupabase()

      // Resolve Branch
      const { data: branch } = await client.from('branches').select('id, company_id').limit(1).single()
      const branchId = branch?.id || '340efb20-513a-4d99-b1e7-f32f938e31a8'
      const companyId = branch?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'

      // Map Active Employees
      const { data: employees } = await client
        .from('employees')
        .select('id, employee_code, attendance_device_id')
        .eq('is_active', true)

      const empMap = new Map()
      for (const e of employees || []) {
        const code = String(e.employee_code).trim().toLowerCase()
        empMap.set(code, e)
        if (e.attendance_device_id) {
          empMap.set(String(e.attendance_device_id).trim().toLowerCase(), e)
        }
        const numOnly = code.replace(/\D/g, '')
        if (numOnly) {
          empMap.set(numOnly, e)
          empMap.set(parseInt(numOnly, 10).toString(), e)
        }
      }

      const rows = punches.map((p) => {
        const pinLower = p.pin.toLowerCase()
        const matched = empMap.get(pinLower) || empMap.get(p.pin)
        return {
          company_id: companyId,
          branch_id: branchId,
          employee_id: matched ? matched.id : null,
          employee_code: matched ? matched.employee_code : p.pin,
          device_id: sn,
          punch_time: p.punchTime,
          punch_type: p.punchType,
          source: 'biometric',
          raw_data: { pin: p.pin, sn, raw: p.rawLine },
        }
      })

      // Batch Upsert
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100)
        await client.from('attendance_logs').upsert(batch, {
          onConflict: 'employee_code, punch_time, device_id',
          ignoreDuplicates: true,
        })
      }

      // Recompute records
      try {
        await client.rpc('process_attendance_logs_v2')
      } catch {
        await client.rpc('process_attendance_logs')
      }

      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send(`OK: ${punches.length}`)
    } catch (err) {
      console.error('[Cloud ADMS Gateway Error]', err)
      res.setHeader('Content-Type', 'text/plain')
      return res.status(200).send(`OK: ${punches.length}`)
    }
  }

  return res.status(405).send('Method Not Allowed')
}
