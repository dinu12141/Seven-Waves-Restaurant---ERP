/**
 * Electron Main Process — Seven Waves ERP
 *
 * Path strategy
 * ─────────────
 * • app.getAppPath() — avoids __dirname / import.meta.url ESM-CJS issues
 * • Preload path is hardcoded for production ('preload/electron-preload.cjs')
 *   because QUASAR_ELECTRON_PRELOAD env-vars are NOT inlined at build time
 *   by esbuild when extendElectronMainConf overrides the config.
 *   In dev Quasar still sets them correctly via its own define plugin.
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import os from 'node:os'

const platform = process.platform || os.platform()

// Synchronously available before whenReady()
// Dev:        <project root>
// Production: <install>\resources\app
const appDir = app.getAppPath()

app.disableHardwareAcceleration()

// Show a visible dialog on crash instead of silently dying
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught Exception:', err)
  dialog.showErrorBox('Seven Waves ERP — Error', `${err.message}\n\n${err.stack}`)
  app.exit(1)
})

let mainWindow

async function createWindow() {
  // ── Preload path ──────────────────────────────────────────────
  // In production the preload always lands at preload/electron-preload.cjs
  // inside appDir (set by extendPackageJson + electron-builder files config).
  // In dev mode Quasar inlines QUASAR_ELECTRON_PRELOAD_FOLDER &
  // QUASAR_ELECTRON_PRELOAD_EXTENSION correctly via its define plugin.
  const preloadPath = process.env.DEV
    ? path.resolve(
        appDir,
        process.env.QUASAR_ELECTRON_PRELOAD_FOLDER,
        'electron-preload' + process.env.QUASAR_ELECTRON_PRELOAD_EXTENSION,
      )
    : path.join(appDir, 'preload', 'electron-preload.cjs')

  mainWindow = new BrowserWindow({
    icon: path.join(
      appDir,
      app.isPackaged ? 'icons/icon.png' : 'src-electron/icons/icon.png',
    ),
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath,
    },
  })

  if (process.env.DEV) {
    await mainWindow.loadURL(process.env.APP_URL)
  } else {
    await mainWindow.loadFile(path.join(appDir, 'index.html'))
  }

  if (process.env.DEBUGGING) {
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ── Silent Printing ────────────────────────────────────────────
ipcMain.handle('print-silent', async (_event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' }
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: options.printerName || '',
        copies: options.copies || 1,
        ...options,
      },
      (success, failureReason) => {
        resolve({ success, error: success ? null : failureReason })
      },
    )
  })
})

ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return []
  return mainWindow.webContents.getPrintersAsync()
})

// ── App lifecycle ──────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
