// ═══════════════════════════════════════════════════════════════════
// Electron Preload — Secure IPC bridge
// Step 06: Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Whitelist of allowed IPC channels.
 * Only these channels can be invoked from the renderer.
 */
const ALLOWED_CHANNELS = [
  'printer:print-raw',
  'printer:discover',
  'printer:test',
  'printer:status',
  'drawer:open',
  'scanner:start',
  'scanner:stop',
  'biometric:sync',
  'file:export',
  'file:save-dialog',
  'app:version',
  'app:update-check',
  'device:heartbeat',
  'device:status',
]

/**
 * Expose a safe, validated API to the renderer process.
 * All IPC calls go through payload validation.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Printer ────────────────────────────────────────────────────
  printRaw: (payload) => validateAndInvoke('printer:print-raw', payload),
  discoverPrinters: () => ipcRenderer.invoke('printer:discover'),
  testPrint: (printer) => validateAndInvoke('printer:test', printer),
  getPrinterStatus: (printer) => validateAndInvoke('printer:status', printer),

  // ─── Cash Drawer ────────────────────────────────────────────────
  openCashDrawer: (payload) => validateAndInvoke('drawer:open', payload),

  // ─── Scanner ────────────────────────────────────────────────────
  startScanner: (config) => validateAndInvoke('scanner:start', config),
  stopScanner: () => ipcRenderer.invoke('scanner:stop'),

  // ─── Biometric ──────────────────────────────────────────────────
  syncBiometric: (payload) => validateAndInvoke('biometric:sync', payload),

  // ─── File System ────────────────────────────────────────────────
  exportFile: (payload) => validateAndInvoke('file:export', payload),
  saveDialog: (options) => validateAndInvoke('file:save-dialog', options),

  // ─── App ────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('app:update-check'),

  // ─── Device ─────────────────────────────────────────────────────
  deviceHeartbeat: (id) => validateAndInvoke('device:heartbeat', { deviceId: id }),

  // ─── Event listeners ───────────────────────────────────────────
  onPrintComplete: (callback) => ipcRenderer.on('printer:complete', (_e, data) => callback(data)),
  onScanResult: (callback) => ipcRenderer.on('scanner:result', (_e, data) => callback(data)),
  onUpdateAvailable: (callback) => ipcRenderer.on('app:update-available', (_e, data) => callback(data)),
})

/**
 * Validate the channel is whitelisted, then invoke IPC.
 */
function validateAndInvoke(channel, payload) {
  if (!ALLOWED_CHANNELS.includes(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
  }
  if (payload !== undefined && payload !== null && typeof payload !== 'object') {
    return Promise.reject(new Error('IPC payload must be an object'))
  }
  return ipcRenderer.invoke(channel, payload)
}
