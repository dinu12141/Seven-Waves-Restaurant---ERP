/**
 * Seven Waves ERP — Biometric Machine LAN to Cloud Bridge
 * ========================================================
 * Dual-Mode Synchronization Bridge:
 *  1. Active TCP Client (Port 4370): Actively connects to ZKTeco and pulls logs.
 *  2. ADMS Push Receiver (Port 8081): Listens for live ADMS push streams from
 *     the machine when configured with the PC's local IP address.
 *
 * Usage:
 *   node scripts/biometric_sync_bridge.mjs [DEVICE_IP] [PORT] [--loop]
 *
 * Example:
 *   node scripts/biometric_sync_bridge.mjs 192.168.8.201 4370 --loop
 */

import net from 'net'
import http from 'http'
import os from 'os'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY is required in .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const deviceIp = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : process.env.BIOMETRIC_DEVICE_IP || '192.168.8.201'

const devicePort = parseInt(
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : process.env.BIOMETRIC_DEVICE_PORT || '4370',
  10
)

const admsPort = parseInt(process.env.BIOMETRIC_ADMS_PORT || '8081', 10)

// Helper to find local IPv4 address
function getLocalIps() {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address })
      }
    }
  }
  return ips
}

const localIps = getLocalIps()
const primaryIp = localIps[0]?.address || '127.0.0.1'

console.log(`=======================================================`)
console.log(` Seven Waves ERP — Biometric Sync Bridge & ADMS Server`)
console.log(` Cloud Target:   ${SUPABASE_URL}`)
console.log(` Local PC IP:    ${primaryIp}`)
console.log(` Target Device:  ${deviceIp}:${devicePort}`)
console.log(` ADMS Port:      ${admsPort}`)
console.log(`=======================================================\n`)

// ─── ZKTeco TCP Protocol Implementation ──────────────────────────────────────

const CMD_CONNECT = 1000
const CMD_EXIT = 1001
const CMD_ACK_OK = 2000
const CMD_PREPARE_DATA = 1500
const CMD_DATA = 1501
const CMD_FREE_DATA = 1502
const CMD_DATA_WRRQ = 1503
const CMD_DATA_RDY = 1504
const CMD_GET_FREE_SIZES = 50
const MAX_CHUNK = 65472

const GET_ATTENDANCE_LOGS = Buffer.from([
  0x01, 0x0d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

function checksum(buf) {
  let chksum = 0
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i]
    } else {
      chksum += buf.readUInt16LE(i)
    }
    chksum %= 65535
  }
  return (65535 - chksum - 1) & 0xffff
}

function buildTcpPacket(command, sessionId, replyId, data = Buffer.alloc(0)) {
  const buf = Buffer.alloc(8 + data.length)
  buf.writeUInt16LE(command, 0)
  buf.writeUInt16LE(0, 2)
  buf.writeUInt16LE(sessionId, 4)
  buf.writeUInt16LE(replyId, 6)
  if (data.length > 0) {
    data.copy(buf, 8)
  }
  const chk = checksum(buf)
  buf.writeUInt16LE(chk, 2)

  const prefix = Buffer.alloc(8)
  prefix.set([0x50, 0x50, 0x82, 0x7d])
  prefix.writeUInt16LE(buf.length, 4)
  return Buffer.concat([prefix, buf])
}

function stripTcpHeader(buf) {
  if (buf.length < 8 || buf[0] !== 0x50 || buf[1] !== 0x50 || buf[2] !== 0x82 || buf[3] !== 0x7d) {
    return buf
  }
  return buf.subarray(8)
}

function decodeZkTime(time) {
  let t = time
  const second = t % 60
  t = Math.floor((t - second) / 60)
  const minute = t % 60
  t = Math.floor((t - minute) / 60)
  const hour = t % 24
  t = Math.floor((t - hour) / 24)
  const day = (t % 31) + 1
  t = Math.floor((t - (day - 1)) / 31)
  const month = t % 12
  t = Math.floor((t - month) / 12)
  const year = t + 2000

  const pad = (n) => String(n).padStart(2, '0')
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.000Z`
}

class NativeZkClient {
  constructor(ip, port, timeoutMs = 10000) {
    this.ip = ip
    this.port = port
    this.timeoutMs = timeoutMs
    this.socket = null
    this.sessionId = 0
    this.replyId = 0
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.ip, port: this.port })
      socket.setTimeout(this.timeoutMs)

      const onError = (err) => {
        socket.destroy()
        reject(new Error(`Cannot reach device at ${this.ip}:${this.port} (${err.message})`))
      }

      socket.once('error', onError)
      socket.once('timeout', () => {
        socket.destroy()
        reject(new Error(`Connection to ${this.ip}:${this.port} timed out after ${this.timeoutMs}ms`))
      })

      socket.once('connect', async () => {
        socket.removeListener('error', onError)
        this.socket = socket
        try {
          await this.handshake()
          resolve()
        } catch (hErr) {
          socket.destroy()
          reject(hErr)
        }
      })
    })
  }

  async readResponse() {
    return new Promise((resolve, reject) => {
      const onData = (data) => {
        cleanup()
        resolve(data)
      }
      const onError = (err) => {
        cleanup()
        reject(err)
      }
      const onTimeout = () => {
        cleanup()
        reject(new Error('Socket read timeout'))
      }
      const cleanup = () => {
        this.socket.removeListener('data', onData)
        this.socket.removeListener('error', onError)
        this.socket.removeListener('timeout', onTimeout)
      }

      this.socket.once('data', onData)
      this.socket.once('error', onError)
      this.socket.once('timeout', onTimeout)
    })
  }

  async handshake() {
    const packet = buildTcpPacket(CMD_CONNECT, 0, 0)
    this.socket.write(packet)
    const reply = await this.readResponse()
    const body = stripTcpHeader(reply)
    if (body.length < 8) {
      throw new Error('Device did not reply to connect handshake')
    }
    const cmdId = body.readUInt16LE(0)
    if (cmdId !== CMD_ACK_OK) {
      throw new Error(`Device rejected connection (command ${cmdId})`)
    }
    this.sessionId = body.readUInt16LE(4)
    this.replyId = 1
  }

  async exec(command, data = Buffer.alloc(0)) {
    this.replyId = (this.replyId + 1) & 0xffff
    const packet = buildTcpPacket(command, this.sessionId, this.replyId, data)
    this.socket.write(packet)
    const reply = await this.readResponse()
    return stripTcpHeader(reply)
  }

  async getInfo() {
    const body = await this.exec(CMD_GET_FREE_SIZES)
    const readU32 = (b, off) => (b.length >= off + 4 ? b.readUInt32LE(off) : 0)
    return {
      userCounts: readU32(body, 24),
      logCounts: readU32(body, 40),
      logCapacity: readU32(body, 72),
    }
  }

  async readWithBuffer(reqData) {
    this.replyId = (this.replyId + 1) & 0xffff
    const packet = buildTcpPacket(CMD_DATA_WRRQ, this.sessionId, this.replyId, reqData)
    this.socket.write(packet)

    const reply = await this.readResponse()
    if (reply.length < 16) {
      throw new Error('Device sent incomplete response')
    }
    const cmdId = reply.readUInt16LE(8)

    if (cmdId === CMD_DATA) {
      return reply.subarray(16)
    }

    if (cmdId !== CMD_ACK_OK && cmdId !== CMD_PREPARE_DATA) {
      throw new Error(`Unexpected response command ${cmdId}`)
    }

    const recvData = reply.subarray(16)
    if (recvData.length < 5) {
      throw new Error('Malformed PREPARE_DATA response')
    }
    const size = recvData.readUInt32LE(1)
    const result = []
    let totalRead = 0
    let offset = 0

    while (offset < size) {
      const chunkSize = Math.min(MAX_CHUNK, size - offset)
      this.replyId = (this.replyId + 1) & 0xffff
      const req = Buffer.alloc(8)
      req.writeUInt32LE(offset, 0)
      req.writeUInt32LE(chunkSize, 4)

      const chunkReq = buildTcpPacket(CMD_DATA_RDY, this.sessionId, this.replyId, req)
      this.socket.write(chunkReq)

      let chunkBuf = Buffer.alloc(0)
      while (true) {
        const piece = await this.readResponse()
        if (!piece || piece.length === 0) break
        chunkBuf = Buffer.concat([chunkBuf, piece])
        if (chunkBuf.length >= 8) {
          const packetLen = chunkBuf.readUInt16LE(4)
          if (chunkBuf.length >= 8 + packetLen) break
        }
      }

      if (chunkBuf.length > 16) {
        const payload = chunkBuf.subarray(16)
        result.push(payload)
        totalRead += payload.length
      }
      offset += chunkSize
    }

    return Buffer.concat(result)
  }

  async getAttendances() {
    try {
      await this.exec(CMD_FREE_DATA)
    } catch {}
    const data = await this.readWithBuffer(GET_ATTENDANCE_LOGS)
    try {
      await this.exec(CMD_FREE_DATA)
    } catch {}

    const RECORD_SIZE = 40
    const records = []
    if (data.length < 4) return records

    let rest = data.subarray(4)
    while (rest.length >= RECORD_SIZE) {
      const chunk = rest.subarray(0, RECORD_SIZE)
      const idBytes = chunk.subarray(2, 11)
      let userId = ''
      for (const b of idBytes) {
        if (b === 0) break
        userId += String.fromCharCode(b)
      }
      userId = userId.trim()

      const packedTime = chunk.readUInt32LE(27)
      const recordTime = decodeZkTime(packedTime)

      records.push({
        deviceUserId: userId,
        recordTime,
      })
      rest = rest.subarray(RECORD_SIZE)
    }
    return records
  }

  disconnect() {
    if (this.socket) {
      try {
        const p = buildTcpPacket(CMD_EXIT, this.sessionId, (this.replyId + 1) & 0xffff)
        this.socket.write(p)
      } catch {}
      this.socket.destroy()
    }
  }
}

// ─── Shared Database Sync Helper ─────────────────────────────────────────────

let cachedBranch = null
let cachedEmpMap = null
let lastCacheRefresh = 0

async function getMappingContext() {
  const now = Date.now()
  if (cachedBranch && cachedEmpMap && now - lastCacheRefresh < 60000) {
    return { branch: cachedBranch, empMap: cachedEmpMap }
  }

  const { data: branch } = await supabase.from('branches').select('id, company_id, name').limit(1).single()
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_code, attendance_device_id, full_name')
    .eq('is_active', true)

  const empMap = new Map()
  for (const e of employees || []) {
    const code = String(e.employee_code).trim().toLowerCase()
    empMap.set(code, e)
    if (e.attendance_device_id) {
      const pin = String(e.attendance_device_id).trim().toLowerCase()
      empMap.set(pin, e)
    }
    const numOnly = code.replace(/\D/g, '')
    if (numOnly) {
      empMap.set(numOnly, e)
      empMap.set(parseInt(numOnly, 10).toString(), e)
    }
  }

  cachedBranch = branch
  cachedEmpMap = empMap
  lastCacheRefresh = now

  return { branch, empMap }
}

async function uploadPunchesToCloud(punches, sourceDevice) {
  if (!punches || punches.length === 0) return 0
  const { branch, empMap } = await getMappingContext()
  if (!branch) throw new Error('No branch found')

  const rows = punches.map((p) => {
    const pin = String(p.deviceUserId || p.pin || '').trim().toLowerCase()
    const emp = empMap.get(pin)
    const finalCode = emp ? emp.employee_code : p.deviceUserId || p.pin || 'UNKNOWN'
    const finalEmpId = emp ? emp.id : null

    return {
      company_id: branch.company_id,
      branch_id: branch.id,
      employee_id: finalEmpId,
      employee_code: finalCode,
      device_id: sourceDevice,
      punch_time: new Date(p.recordTime || p.punchTime).toISOString(),
      punch_type: p.punchType || 'in',
      source: 'biometric',
      raw_data: { pin: p.deviceUserId || p.pin, raw: p.rawLine || p },
    }
  })

  let insertedTotal = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { data, error } = await supabase
      .from('attendance_logs')
      .upsert(batch, {
        onConflict: 'employee_code, punch_time, device_id',
        ignoreDuplicates: true,
      })
      .select('id')

    if (error) {
      console.error(`❌ Upsert error:`, error.message)
    } else {
      insertedTotal += data?.length || 0
    }
  }

  // Trigger engine calculation
  try {
    await supabase.rpc('process_attendance_logs_v2')
  } catch {
    await supabase.rpc('process_attendance_logs')
  }

  return insertedTotal
}

// ─── ADMS Push Receiver HTTP Server ──────────────────────────────────────────

function parseZkAttlogText(rawText) {
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
    if (tokens[1].includes('-') || tokens[1].includes('/')) {
      if (tokens[1].includes(':') || tokens[1].includes('T')) {
        timestampStr = tokens[1]
      } else if (tokens[2] && tokens[2].includes(':')) {
        timestampStr = `${tokens[1]} ${tokens[2]}`
      }
    }
    if (!timestampStr) continue

    let isoTime = null
    try {
      const d = new Date(timestampStr.replace(/\//g, '-').trim())
      if (!isNaN(d.getTime())) isoTime = d.toISOString()
    } catch {}
    if (!isoTime) continue

    punches.push({ deviceUserId: pin, recordTime: isoTime, rawLine: trimmed })
  }
  return punches
}

function startAdmsHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const sn = url.searchParams.get('SN') || url.searchParams.get('sn') || 'ZKTeco-ADMS'

    if (req.method === 'GET') {
      if (url.pathname.includes('/getrequest')) {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
        return
      }

      console.log(`📡 [ADMS Handshake] Machine (${sn}) connected to ADMS listener!`)
      const config = [
        `GET OPTION FROM: ${sn}`,
        'ATTLOGStamp=None',
        'Realtime=1',
        'Delay=5',
        'TransInterval=1',
        'TransFlag=1111000000',
        'TimeZone=5.5',
      ].join('\n')

      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(config)
      return
    }

    if (req.method === 'POST') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', async () => {
        if (url.pathname.includes('/devicecmd')) {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')
          return
        }

        const punches = parseZkAttlogText(body)
        console.log(`📡 [ADMS Push] Received ${punches.length} punches from ${sn}`)
        if (punches.length > 0) {
          const synced = await uploadPunchesToCloud(punches, sn)
          console.log(`   ✅ Synced ${synced} punches to Cloud ERP!`)
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(`OK: ${punches.length}`)
      })
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
  })

  server.listen(admsPort, '0.0.0.0', () => {
    console.log(`🌐 ADMS Push Receiver listening on http://${primaryIp}:${admsPort}`)
    console.log(`   👉 Set machine: Server Address: ${primaryIp} | Port: ${admsPort}\n`)
  })
}

// ─── Active TCP Polling Flow ─────────────────────────────────────────────────

async function syncActiveTcp() {
  console.log(`🔍 [Active TCP Poller] Connecting to ${deviceIp}:${devicePort}...`)
  const client = new NativeZkClient(deviceIp, devicePort, 6000)

  try {
    await client.connect()
    const attendances = await client.getAttendances()
    client.disconnect()

    if (!attendances || attendances.length === 0) {
      console.log(`   ℹ️ No attendance records found on machine.`)
      return
    }

    console.log(`   Retrieved ${attendances.length} records. Syncing to Cloud...`)
    const synced = await uploadPunchesToCloud(attendances, deviceIp)
    console.log(`   ✅ Synced ${synced} new punches to Cloud ERP!`)
  } catch (err) {
    client.disconnect()
    console.warn(`   ⚠️ TCP Poll note: ${err.message}`)
  }
}

// ─── Main Runner ─────────────────────────────────────────────────────────────

const isLoop = process.argv.includes('--loop') || process.argv.includes('--daemon')
const loopIntervalSec = parseInt(process.env.BIOMETRIC_SYNC_INTERVAL || '30', 10)

async function start() {
  // Start ADMS Push Receiver
  try {
    startAdmsHttpServer()
  } catch (e) {
    console.warn('ADMS server notice:', e.message)
  }

  // Active Poller loop
  if (isLoop) {
    console.log(`🔄 Active Poller running every ${loopIntervalSec} seconds...`)
    while (true) {
      await syncActiveTcp()
      await new Promise((r) => setTimeout(r, loopIntervalSec * 1000))
    }
  } else {
    await syncActiveTcp()
  }
}

start()
