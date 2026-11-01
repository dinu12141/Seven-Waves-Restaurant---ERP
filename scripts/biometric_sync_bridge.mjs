/**
 * Seven Waves ERP — Biometric Machine LAN to Cloud Bridge
 * ========================================================
 * Synchronizes attendance punches from a physical ZKTeco fingerprint/face
 * machine located on the local network (LAN) directly to the Cloud ERP database.
 *
 * Implements the native ZKTeco TCP protocol using standard Node.js `net` sockets
 * (Zero external C/native dependencies required!).
 *
 * Usage:
 *   node scripts/biometric_sync_bridge.mjs [DEVICE_IP] [PORT]
 *
 * Example:
 *   node scripts/biometric_sync_bridge.mjs 192.168.1.201 4370
 */

import net from 'net'
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

const deviceIp = process.argv[2] || process.env.BIOMETRIC_DEVICE_IP || '192.168.1.201'
const devicePort = parseInt(process.argv[3] || process.env.BIOMETRIC_DEVICE_PORT || '4370', 10)

console.log(`=======================================================`)
console.log(` Seven Waves ERP — Biometric Sync Bridge`)
console.log(` Target Device: ${deviceIp}:${devicePort}`)
console.log(` Cloud Target:  ${SUPABASE_URL}`)
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

// ─── Main Synchronization Flow ───────────────────────────────────────────────

async function sync() {
  console.log(`1. Resolving company and branch context...`)
  const { data: branch } = await supabase.from('branches').select('id, company_id, name').limit(1).single()
  if (!branch) {
    console.error(`❌ No branch found in database. Check SUPABASE_URL / key.`)
    process.exit(1)
  }
  console.log(`   Connected Branch: ${branch.name} (${branch.id})`)

  console.log(`2. Loading active employees for biometric mapping...`)
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
  console.log(`   Mapped ${employees?.length || 0} active employees.`)

  console.log(`3. Connecting to ZKTeco terminal at ${deviceIp}:${devicePort}...`)
  const client = new NativeZkClient(deviceIp, devicePort, 8000)

  try {
    await client.connect()
    console.log(`   ✅ Socket connected to device!`)

    const info = await client.getInfo()
    console.log(`   Terminal Info: Users: ${info.userCounts || 0}, Total Logs: ${info.logCounts || 0}`)

    console.log(`4. Pulling attendance log records...`)
    const attendances = await client.getAttendances()
    client.disconnect()

    if (!attendances || attendances.length === 0) {
      console.log(`   ℹ️ No attendance records found on device.`)
      return
    }

    console.log(`   Retrieved ${attendances.length} total attendance records.`)

    const rows = []
    for (const att of attendances) {
      const pin = String(att.deviceUserId || '').trim().toLowerCase()
      const emp = empMap.get(pin)

      const finalEmployeeCode = emp ? emp.employee_code : att.deviceUserId || 'UNKNOWN'
      const finalEmployeeId = emp ? emp.id : null
      const punchTime = new Date(att.recordTime).toISOString()

      rows.push({
        company_id: branch.company_id,
        branch_id: branch.id,
        employee_id: finalEmployeeId,
        employee_code: finalEmployeeCode,
        device_id: deviceIp,
        punch_time: punchTime,
        punch_type: 'in', // Attendance engine alternates automatically
        source: 'biometric',
        raw_data: {
          deviceUserId: att.deviceUserId,
          recordTime: att.recordTime,
          deviceIp,
        },
      })
    }

    console.log(`5. Upserting ${rows.length} punches into Supabase attendance_logs...`)
    const batchSize = 100
    let insertedTotal = 0

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const { data, error } = await supabase
        .from('attendance_logs')
        .upsert(batch, {
          onConflict: 'employee_code, punch_time, device_id',
          ignoreDuplicates: true,
        })
        .select('id')

      if (error) {
        console.error(`❌ Batch error:`, error.message)
      } else {
        insertedTotal += data?.length || 0
      }
    }

    console.log(`   ✅ Successfully synced ${insertedTotal} new attendance punches to cloud!`)

    console.log(`6. Executing process_attendance_logs_v2() engine...`)
    const { error: rpcErr } = await supabase.rpc('process_attendance_logs_v2')
    if (rpcErr) {
      console.warn(`   ⚠️ process_attendance_logs_v2 note:`, rpcErr.message)
      await supabase.rpc('process_attendance_logs')
    } else {
      console.log(`   ✅ Attendance engine processed successfully. Records updated!`)
    }

    console.log(`\n🎉 SYNC COMPLETED SUCCESSFULLY! Check https://erp.sevenwaves.lk/hr/attendance\n`)
  } catch (err) {
    client.disconnect()
    console.error(`❌ Biometric Connection Error: ${err.message}`)
    console.log(`\n💡 Troubleshooting Tips:`)
    console.log(`   1. Ensure the fingerprint machine is powered ON and connected via Ethernet / Wi-Fi.`)
    console.log(`   2. Make sure this PC is on the same local network subnet (e.g. 192.168.1.xxx).`)
    console.log(`   3. Check the device IP in Menu -> Comm. -> Ethernet -> IP Address.`)
    console.log(`   4. Command: node scripts/biometric_sync_bridge.mjs <IP> <PORT>\n`)
  }
}

sync()
