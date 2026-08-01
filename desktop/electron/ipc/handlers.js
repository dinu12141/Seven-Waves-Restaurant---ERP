// ═══════════════════════════════════════════════════════════════════
// Electron IPC Handlers — Hardware integration bridge
// Step 06: Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

const { ipcMain, dialog, app } = require('electron')
const net = require('net')
const fs = require('fs')

// ─── PRINTER HANDLERS ───────────────────────────────────────────

/**
 * Print raw ESC/POS data to a network printer via TCP.
 */
ipcMain.handle('printer:print-raw', async (_event, payload) => {
  if (!payload || !payload.data) {
    return { success: false, error: 'No print data provided' }
  }

  const ip = payload.ip || '127.0.0.1'
  const port = payload.port || 9100
  const buffer = Buffer.from(payload.data)

  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, error: 'Printer connection timeout' })
    }, 10000)

    socket.connect(port, ip, () => {
      socket.write(buffer, () => {
        clearTimeout(timeout)
        socket.end()
        resolve({ success: true, method: 'tcp', ip, port })
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: `Printer error: ${err.message}` })
    })
  })
})

/**
 * Discover printers on the local network (scan common ports).
 */
ipcMain.handle('printer:discover', async () => {
  // Scan local subnet for port 9100 (ESC/POS default)
  const found = []
  const subnet = '192.168.1' // Configurable
  const promises = []

  for (let i = 1; i <= 254; i++) {
    const ip = `${subnet}.${i}`
    promises.push(new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(500)
      socket.connect(9100, ip, () => {
        found.push({ ip, port: 9100 })
        socket.destroy()
        resolve()
      })
      socket.on('error', () => { socket.destroy(); resolve() })
      socket.on('timeout', () => { socket.destroy(); resolve() })
    }))
  }

  await Promise.all(promises)
  return { success: true, printers: found }
})

/**
 * Test print — send a simple ESC/POS test page.
 */
ipcMain.handle('printer:test', async (_event, payload) => {
  const testData = [
    0x1B, 0x40, // Init
    0x1B, 0x61, 0x01, // Center
    ...Buffer.from('** TEST PRINT **\n'),
    ...Buffer.from('Seven Waves ERP\n'),
    ...Buffer.from(new Date().toLocaleString() + '\n'),
    ...Buffer.from('Printer OK\n\n\n\n'),
    0x1D, 0x56, 0x42, 0x00, // Cut
  ]
  return ipcMain.emit('printer:print-raw', null, { ...payload, data: testData })
})

ipcMain.handle('printer:status', async (_event, payload) => {
  return { success: true, status: 'idle', printer: payload?.printer || 'default' }
})

// ─── CASH DRAWER ────────────────────────────────────────────────

ipcMain.handle('drawer:open', async (_event, payload) => {
  if (!payload?.userId) {
    return { success: false, error: 'User ID required for drawer open audit' }
  }

  console.log(`[IPC] Cash drawer open by user: ${payload.userId}, reason: ${payload.reason}`)

  // ESC/POS drawer kick command
  const drawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x78])
  const printData = payload.data ? payload.data : Array.from(drawerCmd)

  // Send drawer command to printer via TCP
  const ip = payload.ip || '127.0.0.1'
  const port = payload.port || 9100
  const buffer = Buffer.from(printData)

  return new Promise((resolve) => {
    const socket = new net.Socket()
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ success: false, error: 'Drawer connection timeout' })
    }, 10000)

    socket.connect(port, ip, () => {
      socket.write(buffer, () => {
        clearTimeout(timeout)
        socket.end()
        resolve({ success: true, method: 'drawer-command-sent' })
      })
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: `Drawer error: ${err.message}` })
    })
  })
})

// ─── FILE SYSTEM ────────────────────────────────────────────────

ipcMain.handle('file:export', async (_event, payload) => {
  if (!payload?.content || !payload?.filename) {
    return { success: false, error: 'Content and filename required' }
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: payload.filename,
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'CSV', extensions: ['csv'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Excel', extensions: ['xlsx'] },
    ],
  })

  if (canceled || !filePath) return { success: false, error: 'Cancelled' }

  try {
    const data = typeof payload.content === 'string'
      ? payload.content
      : Buffer.from(payload.content)
    fs.writeFileSync(filePath, data)
    return { success: true, path: filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('file:save-dialog', async (_event, options) => {
  return dialog.showSaveDialog(options || {})
})

// ─── APP ────────────────────────────────────────────────────────

ipcMain.handle('app:version', () => {
  return { version: app.getVersion(), electron: process.versions.electron, node: process.versions.node }
})

ipcMain.handle('app:update-check', async () => {
  // Auto-updater integration point
  return { available: false, currentVersion: app.getVersion() }
})

// ─── DEVICE HEARTBEAT ───────────────────────────────────────────

ipcMain.handle('device:heartbeat', async (_event, payload) => {
  console.log(`[IPC] Device heartbeat: ${payload?.deviceId}`)
  return { success: true, timestamp: new Date().toISOString() }
})

// ─── BIOMETRIC (ZKTeco) ─────────────────────────────────────────
//
// The device sits on the local network (e.g. 192.168.x.x:4370) and speaks a
// binary TCP protocol — only a process with LAN access can reach it, so this
// MUST run here in Electron's main process (Node), not in Supabase Edge
// Functions (cloud, no route to your LAN) and not in the browser renderer
// (no raw TCP sockets). node-zklib handles the protocol; we just return the
// raw punches to the renderer, which writes them to Supabase using the
// logged-in user's own session (see zkteco.service.js) — the main process
// intentionally does NOT hold a Supabase service-role key, since embedding
// one in a distributed desktop binary would let it be extracted and used to
// bypass all RLS.
//
// node-zklib@1.3.0 API surface (verified against installed package, do not
// assume other versions match): createSocket, getInfo, getUsers,
// getAttendances, getRealTimeLogs, disconnect, clearAttendanceLog,
// disableDevice, enableDevice. There is NO setUser/deleteUser/setTime —
// enrollment and clock-setting must be done on the device's own keypad
// (User Mgmt / System menus), not remotely from the ERP.
//
// getAttendances() returns { data: [{ userSn, deviceUserId, recordTime }] }
// with NO in/out flag in the raw record on this device/library combination —
// punch direction is inferred client-side (zkteco.service.js) by alternating
// in/out per employee per day, which is what these budget attendance
// terminals expect you to rely on.
ipcMain.handle('biometric:sync', async (_event, payload) => {
  const { action, ip, port = 4370 } = payload || {}

  if (!ip) {
    return { success: false, error: 'Device IP address is required' }
  }

  let ZKLib
  try {
    ZKLib = require('node-zklib')
  } catch {
    return {
      success: false,
      error: 'node-zklib is not installed. Run "npm install" inside desktop/electron/ and rebuild the app.',
    }
  }

  const zk = new ZKLib(ip, port, 10000, 4000)

  try {
    await zk.createSocket()

    switch (action) {
      case 'info': {
        const info = await zk.getInfo()
        await zk.disconnect()
        return { success: true, ...info }
      }

      case 'pull': {
        const { data, err } = await zk.getAttendances()
        await zk.disconnect()
        return {
          success: true,
          records: (data || []).map((a) => ({
            // deviceUserId is the ASCII "User ID" string entered on the
            // device's User Mgmt screen — must be enrolled as the ERP
            // employee_code (e.g. "EMP001") so it round-trips directly.
            user_id: String(a.deviceUserId ?? '').trim(),
            punch_time: new Date(a.recordTime).toISOString(),
          })),
          partial: !!err,
        }
      }

      case 'clear_attendance': {
        await zk.clearAttendanceLog()
        await zk.disconnect()
        return { success: true }
      }

      default:
        await zk.disconnect()
        return {
          success: false,
          error: `Unsupported biometric action: ${action}. This device library only supports info/pull/clear_attendance — enrollment and device clock must be set on the device keypad.`,
        }
    }
  } catch (err) {
    try {
      await zk.disconnect()
    } catch {
      /* already disconnected */
    }
    console.error('[IPC] Biometric sync error:', err.message)
    return { success: false, error: `Cannot reach device at ${ip}:${port} — ${err.message}` }
  }
})

console.log('[IPC] All handlers registered')
