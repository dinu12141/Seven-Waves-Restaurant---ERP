/**
 * Electron Main Process -- Seven Waves ERP
 *
 * Startup hardening for Windows desktops:
 * - Hardware GPU disabled, SwiftShader forced (dual-GPU / Optimus hang fix)
 * - Crash log written to %TEMP%/seven-waves-crash.log
 * - Global error handlers catch and surface all failures
 * - VC++ Redistributable absence diagnosed in log
 * - 30s startup watchdog detects hung init (fires even if whenReady hangs)
 */

import { app, BrowserWindow, ipcMain, shell, dialog, session } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

// ===========================================================================
//  GPU FIXES -- must be called BEFORE app.whenReady() / any window creation
//  Targets: ASUS ROG Strix, Nvidia Optimus, dual-GPU Windows laptops.
//
//  IMPORTANT notes:
//  - DO NOT add 'disable-software-rasterizer' -- combined with
//    disableHardwareAcceleration it removes all renderers and hangs.
//  - DO NOT add 'disable-gpu' -- on some Windows builds it prevents
//    the browser process from initializing (silent exit).
//  - disableHardwareAcceleration() alone is enough to force software
//    rendering while keeping the process alive.
// ===========================================================================
app.disableHardwareAcceleration()
// SECURITY: disable-gpu-sandbox disables the GPU process sandbox (not the renderer sandbox).
// Gated to dev because the renderer sandbox (sandbox:true, contextIsolation:true) is the
// primary isolation boundary. For GPU/Optimus crashes in a packaged build, set
// ELECTRON_DISABLE_GPU_SANDBOX=1 in the launch environment explicitly.
if (process.env.DEV || process.env.ELECTRON_DISABLE_GPU_SANDBOX) {
  app.commandLine.appendSwitch('disable-gpu-sandbox')
}
app.commandLine.appendSwitch('ignore-gpu-blocklist')
// SECURITY: --no-sandbox is NOT set. The renderer sandbox is enforced via
// webPreferences.sandbox=true + contextIsolation=true + nodeIntegration=false.

// -- app.getAppPath() is safe before ready() ---------------------------------
// Dev:        <project root>
// Production: <install>\resources\app
const appDir = app.getAppPath()
const platform = process.platform || os.platform()

// -- Crash log ----------------------------------------------------------------
const logPath = path.join(os.tmpdir(), 'seven-waves-crash.log')
function writeLog (msg) {
  try { fs.appendFileSync(logPath, '[' + new Date().toISOString() + '] ' + msg + '\n') } catch { /* ignore */ }
  console.log(msg)
}
try { fs.writeFileSync(logPath, '') } catch { /* ignore */ }
writeLog('=== App starting -- Electron ' + process.versions.electron + ' ===')
writeLog('Platform: ' + platform + ' | Arch: ' + process.arch + ' | Node: ' + process.versions.node)
writeLog('appDir: ' + appDir)
writeLog('isPackaged: ' + app.isPackaged)
writeLog('argv: ' + process.argv.join(' '))

// -- VC++ Redistributable check (Windows only) --------------------------------
if (platform === 'win32') {
  const vcrPath = path.join(process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'vcruntime140.dll')
  const vcrExists = fs.existsSync(vcrPath)
  writeLog('VC++ Runtime (vcruntime140.dll): ' + (vcrExists ? 'FOUND' : 'MISSING -- likely cause of 0xc000007b'))
  if (!vcrExists) {
    writeLog('ACTION: Install Visual C++ Redistributable x64 from https://aka.ms/vs/17/release/vc_redist.x64.exe')
  }
}

// -- Global error handlers ----------------------------------------------------
process.on('uncaughtException', (err) => {
  writeLog('UNCAUGHT EXCEPTION: ' + (err.stack || err.message))
  try { dialog.showErrorBox('Seven Waves ERP - Error', err.message + '\n\nLog: ' + logPath) } catch { /* ignore */ }
})
process.on('unhandledRejection', (reason) => {
  writeLog('UNHANDLED REJECTION: ' + (reason && reason.stack ? reason.stack : String(reason)))
})

// -- Window reference ---------------------------------------------------------
let mainWindow

// -- Navigation / window-open guards ------------------------------------------
// Determines whether a target URL is the app itself (dev server or bundled
// file://). Anything else is treated as external and denied for in-app
// navigation / new-window creation.
function isAppUrl (targetUrl) {
  try {
    const u = new URL(targetUrl)
    if (u.protocol === 'file:') return true
    if (process.env.DEV && process.env.APP_URL) {
      const dev = new URL(process.env.APP_URL)
      return u.origin === dev.origin
    }
    return false
  } catch {
    return false
  }
}

function applyNavigationGuards (contents) {
  // Block in-place navigation away from the app origin.
  contents.on('will-navigate', (event, targetUrl) => {
    if (!isAppUrl(targetUrl)) {
      event.preventDefault()
      writeLog('[Security] Blocked navigation to external URL: ' + targetUrl)
      if (typeof targetUrl === 'string' && targetUrl.startsWith('https://')) {
        shell.openExternal(targetUrl).catch(() => {})
      }
    }
  })

  // Deny redirects to non-app origins as well (defense-in-depth).
  contents.on('will-redirect', (event, targetUrl) => {
    if (!isAppUrl(targetUrl)) {
      event.preventDefault()
      writeLog('[Security] Blocked redirect to external URL: ' + targetUrl)
    }
  })

  // Deny ALL programmatic window.open / target=_blank popups. Legitimate
  // external links are opened in the system browser after https validation.
  contents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {})
    } else {
      writeLog('[Security] Blocked window.open for non-https URL: ' + url)
    }
    return { action: 'deny' }
  })

  // Never allow <webview> tags to attach (we don't use them).
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
    writeLog('[Security] Blocked <webview> attach attempt')
  })
}

// Global safety net: apply the same guards to ANY web contents ever created,
// even ones spawned outside createWindow().
app.on('web-contents-created', (_e, contents) => applyNavigationGuards(contents))

// -- Window factory -----------------------------------------------------------
async function createWindow () {
  writeLog('createWindow() start')

  const preloadPath = process.env.DEV
    ? path.resolve(
        process.env.QUASAR_ELECTRON_PRELOAD_FOLDER,
        'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION,
      )
    : path.join(appDir, 'preload', 'electron-preload.cjs')

  const iconPath = path.join(appDir, app.isPackaged ? 'icons/icon.png' : 'src-electron/icons/icon.png')

  writeLog('Preload: ' + preloadPath + ' | exists: ' + fs.existsSync(preloadPath))
  writeLog('Icon:    ' + iconPath)

  mainWindow = new BrowserWindow({
    icon: iconPath,
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    useContentSize: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,  // SECURITY: explicit — renderer gets no Node.js globals (safety net vs. version downgrade / copy-paste)
      sandbox: true,           // Renderer process sandbox (Electron 20+ default; explicit for clarity)
      webSecurity: true,       // SECURITY: keep same-origin policy on in prod (default true; explicit)
      preload: preloadPath,
    },
  })

  // Navigation / window-open hardening is applied globally via the
  // app-level `web-contents-created` handler (see applyNavigationGuards),
  // which also covers this window's webContents at creation time.

  mainWindow.maximize()
  writeLog('BrowserWindow created and maximized')

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    writeLog('did-fail-load: ' + code + ' -- ' + desc + ' -- ' + url)
    dialog.showErrorBox('Load Error', 'Failed to load app\nCode: ' + code + '\nDesc: ' + desc + '\nLog: ' + logPath)
  })

  mainWindow.webContents.on('did-finish-load', () => writeLog('did-finish-load OK'))

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    writeLog('Renderer crashed: ' + details.reason + ' (exit ' + details.exitCode + ')')
    dialog.showErrorBox('Renderer Crashed', 'Reason: ' + details.reason + '\nLog: ' + logPath)
  })

  if (process.env.DEV) {
    const devUrl = process.env.APP_URL
    let loaded = false
    for (let i = 1; i <= 20; i++) {
      try { await mainWindow.loadURL(devUrl); loaded = true; break }
      catch { writeLog('Dev retry ' + i + '/20'); await new Promise(r => setTimeout(r, 500)) }
    }
    if (!loaded) throw new Error('Cannot connect to dev server: ' + devUrl)
  } else {
    const indexPath = path.join(appDir, 'index.html')
    writeLog('Loading: ' + indexPath + ' | exists: ' + fs.existsSync(indexPath))
    await mainWindow.loadFile(indexPath)
  }

  if (!process.env.DEV) {
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools())
  }

  mainWindow.on('closed', () => { mainWindow = null })
  writeLog('createWindow() done')
}

// -- IPC: open URL in system browser ------------------------------------------
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url === 'string' && url.startsWith('https://')) {
    await shell.openExternal(url)
    return { success: true }
  }
  return { success: false, error: 'Only https:// URLs allowed.' }
})

// -- IP validation helper -----------------------------------------------------
// Accepts dotted-decimal IPv4 and bracketed/plain IPv6; rejects hostnames.
function isValidIp(ip) {
  if (typeof ip !== 'string') return false
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6 = /^(\[?[0-9a-fA-F:]+\]?)$/
  return ipv4.test(ip) || ipv6.test(ip)
}

// -- IPC: Raw ESC/POS Print ---------------------------------------------------
// Sends raw byte buffer to a thermal printer over TCP (port 9100) or USB.
// This is what usePrinter.js / useCashDrawer.js call via window.electronAPI.
ipcMain.handle('printer:print-raw', async (_e, { data, printer, ip, port = 9100 }) => {
  // data: number[] (Uint8Array serialized), printer: string name, ip: optional
  if (!data || !Array.isArray(data)) return { success: false, error: 'No print data' }
  if (ip !== undefined && !isValidIp(ip)) return { success: false, error: 'Invalid printer IP address' }

  const buf = Buffer.from(data)

  // Network TCP path (most common for LAN thermal printers)
  if (ip) {
    const net = await import('node:net')
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(5000)
      socket.connect(port, ip, () => {
        socket.write(buf, () => {
          socket.destroy()
          resolve({ success: true, method: 'tcp', ip, port })
        })
      })
      socket.on('timeout', () => {
        socket.destroy()
        resolve({ success: false, error: `TCP timeout connecting to ${ip}:${port}` })
      })
      socket.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })
  }

  // Electron print fallback (routes through system print dialog / named printer)
  if (mainWindow && printer) {
    return new Promise((resolve) => {
      mainWindow.webContents.print(
        { silent: true, printBackground: false, deviceName: printer, copies: 1 },
        (success, reason) => resolve({ success, error: success ? null : reason }),
      )
    })
  }

  return { success: false, error: 'No printer IP or named printer provided' }
})

// -- IPC: Cash Drawer ---------------------------------------------------------
// Drawer open = ESC/POS drawer-kick command sent the same way as raw print.
ipcMain.handle('drawer:open', async (_e, { data, printer, ip, port = 9100, userId, reason }) => {
  if (!data || !Array.isArray(data)) return { success: false, error: 'No drawer command data' }
  if (ip !== undefined && !isValidIp(ip)) return { success: false, error: 'Invalid drawer IP address' }
  writeLog(`[Drawer] Open by user=${userId} reason=${reason}`)
  const buf = Buffer.from(data)
  if (ip) {
    const net = await import('node:net')
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(3000)
      socket.connect(port, ip, () => { socket.write(buf, () => { socket.destroy(); resolve({ success: true }) }) })
      socket.on('timeout', () => { socket.destroy(); resolve({ success: false, error: 'Timeout' }) })
      socket.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  }
  if (mainWindow && printer) {
    return new Promise((resolve) => {
      mainWindow.webContents.print({ silent: true, deviceName: printer }, (ok, r) => resolve({ success: ok, error: ok ? null : r }))
    })
  }
  return { success: false, error: 'No printer target for drawer open' }
})

// -- IPC: Device Heartbeat ----------------------------------------------------
ipcMain.handle('device:heartbeat', async (_e, { deviceId, status }) => {
  writeLog(`[Device] Heartbeat: ${deviceId} status=${status}`)
  return { success: true, timestamp: new Date().toISOString() }
})

// -- IPC: File Export Dialog --------------------------------------------------
ipcMain.handle('file:save-dialog', async (_e, { defaultName, filters }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export',
    filters: filters || [{ name: 'All Files', extensions: ['*'] }],
  })
  return { filePath: canceled ? null : filePath, canceled }
})

ipcMain.handle('file:export', async (_e, { filePath, data }) => {
  if (!filePath || typeof filePath !== 'string') return { success: false, error: 'No file path' }
  // Reject writes to OS system directories (path traversal guard)
  const normalized = path.normalize(filePath)
  const forbidden = [
    process.env.SYSTEMROOT || 'C:\\Windows',
    process.env.PROGRAMFILES || 'C:\\Program Files',
    process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    '/etc', '/usr', '/bin', '/sbin', '/lib', '/boot',
  ]
  if (forbidden.some(dir => normalized.toLowerCase().startsWith(dir.toLowerCase()))) {
    writeLog(`[Security] Blocked file export to system path: ${normalized}`)
    return { success: false, error: 'Export to system directories is not allowed' }
  }
  try {
    fs.writeFileSync(normalized, Buffer.from(data))
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// -- IPC: Biometric / ZKTeco --------------------------------------------------
// Full implementation requires: npm install node-zklib (optional dep)
// If node-zklib is not installed, returns a helpful error instead of crashing.
ipcMain.handle('biometric:sync', async (_e, { action, ip, port = 4370, ...params }) => {
  if (!ip) return { success: false, error: 'ip required' }
  if (!isValidIp(ip)) return { success: false, error: 'Invalid biometric device IP address' }
  writeLog(`[ZKTeco] action=${action} ip=${ip}:${port}`)

  let ZKLib
  try {
    ZKLib = require('node-zklib')
  } catch {
    return {
      success: false,
      error: 'node-zklib not installed. Run: npm install node-zklib --save-optional',
    }
  }

  const zk = new ZKLib(ip, port, 4000, 4000)
  try {
    await zk.createSocket()

    switch (action) {
      case 'info': {
        const info = await zk.getInfo()
        await zk.disconnect()
        return { success: true, ...info }
      }

      case 'pull': {
        const { data: { attendances } } = await zk.getAttendances()
        await zk.disconnect()
        return {
          success: true,
          records: attendances.map(a => ({
            user_id: String(a.deviceUserId),
            punch_time: a.recordTime instanceof Date ? a.recordTime.toISOString() : a.recordTime,
            punch_type: a.type,
            verify_type: a.verifyType,
          })),
        }
      }

      case 'clear_attendance': {
        await zk.clearAttendanceLog()
        await zk.disconnect()
        return { success: true }
      }

      case 'enroll': {
        await zk.setUser(parseInt(params.userId), params.userId, (params.userName || '').substring(0, 24), params.privilege || 0, '')
        await zk.disconnect()
        return { success: true }
      }

      case 'delete_user': {
        await zk.deleteUser(parseInt(params.userId))
        await zk.disconnect()
        return { success: true }
      }

      case 'set_time': {
        await zk.setTime(new Date(params.time || Date.now()))
        await zk.disconnect()
        return { success: true }
      }

      default:
        await zk.disconnect()
        return { success: false, error: `Unknown ZKTeco action: ${action}` }
    }
  } catch (err) {
    writeLog(`[ZKTeco] Error: ${err.message}`)
    try { await zk.disconnect() } catch { /* ignore disconnect error */ }
    return { success: false, error: err.message }
  }
})

// -- IPC: App Info ------------------------------------------------------------
ipcMain.handle('app:version', async () => ({ version: app.getVersion() }))

// -- IPC: Silent Printing -----------------------------------------------------
ipcMain.handle('print-silent', async (_e, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' }
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      { silent: true, printBackground: true, deviceName: options.printerName || '', copies: options.copies || 1, ...options },
      (success, failureReason) => resolve({ success, error: success ? null : failureReason }),
    )
  })
})

// -- IPC: List Printers -------------------------------------------------------
ipcMain.handle('get-printers', async () => mainWindow ? mainWindow.webContents.getPrintersAsync() : [])

// -- Startup watchdog ---------------------------------------------------------
// Runs OUTSIDE whenReady() so it fires even if Electron hangs during
// GPU/sandbox initialization (the #1 cause of silent launch failure).
writeLog('Waiting for app.whenReady()...')
const startupWatchdog = setTimeout(() => {
  writeLog('WATCHDOG: 30s elapsed -- app.whenReady() never fired. Likely GPU init hang.')
  try {
    dialog.showErrorBox(
      'Seven Waves ERP - Startup Timeout',
      'The app failed to initialize within 30 seconds.\n' +
      'This is usually caused by a GPU driver issue.\n\n' +
      'Log: ' + logPath,
    )
  } catch { /* dialog may fail */ }
  app.quit()
}, 30000)

// -- App lifecycle ------------------------------------------------------------
app.whenReady().then(() => {
  clearTimeout(startupWatchdog)
  writeLog('app.whenReady() fired')

  // SECURITY: Inject Content-Security-Policy for all responses (including file://).
  // 'unsafe-inline' on script-src is acceptable for packaged desktop apps where
  // the renderer runs app-owned code only; the renderer process sandbox is the
  // primary isolation boundary.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self' 'unsafe-inline';" +
          " style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;" +
          " font-src 'self' https://fonts.gstatic.com data:;" +
          " img-src 'self' data: blob: https://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com;" +
          " connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://generativelanguage.googleapis.com;" +
          " media-src 'self' blob: data:;" +
          " object-src 'none';" +
          " worker-src 'self';" +
          " base-uri 'self';"
        ],
      },
    })
  })

  createWindow().catch((err) => {
    writeLog('createWindow FAILED: ' + (err.stack || err.message))
    dialog.showErrorBox('Fatal Error', err.message + '\n\nLog: ' + logPath)
  })
})

app.on('window-all-closed', () => {
  writeLog('window-all-closed')
  if (platform !== 'darwin') app.quit()
})

app.on('activate', () => { if (mainWindow === null) createWindow() })
