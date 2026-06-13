// ═══════════════════════════════════════════════════════════════════
// Electron Main Process — Seven Waves ERP Desktop
// Step 06: Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

const { app, BrowserWindow, session } = require('electron')
const path = require('path')

// ─── Security: Disable remote module & sandbox all windows ──────
app.enableSandbox()

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Seven Waves ERP',
    icon: path.join(__dirname, '../../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // ─── Content Security Policy ──────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co; " +
          "frame-src 'none';"
        ],
      },
    })
  })

  // Load the Quasar SPA
  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:9000')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/spa/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ─── App Lifecycle ──────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // Register IPC handlers
  require('../ipc/handlers')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── Crash Recovery ─────────────────────────────────────────────
process.on('uncaughtException', (error) => {
  console.error('[Electron] Uncaught exception:', error)
  // Don't crash — log and recover
})

process.on('unhandledRejection', (reason) => {
  console.error('[Electron] Unhandled rejection:', reason)
})
