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

console.log('[IPC] All handlers registered')
