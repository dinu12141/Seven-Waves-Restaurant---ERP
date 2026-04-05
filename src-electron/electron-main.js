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

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron'
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
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

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
      preload: preloadPath,
    },
  })

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
