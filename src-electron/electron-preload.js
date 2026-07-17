/**
 * Electron Preload Script — Seven Waves ERP
 *
 * Security contract
 * ─────────────────
 * • Runs in a sandboxed context (sandbox: true in BrowserWindow).
 * • Only `contextBridge` and `ipcRenderer` are available — no Node.js APIs.
 * • ipcRenderer is NEVER exposed directly to the renderer.
 * • Every channel is explicitly listed below — unknown channels are ignored.
 *
 * Usage in Vue components
 * ───────────────────────
 *   window.electronAPI.printSilent({ printerName: 'EPSON TM-T20' })
 *   window.electronAPI.getPrinters()
 *   window.electronAPI.openExternal('https://...')
 *   window.electronAPI.onAuthRedirect((url) => { ... })
 */

import { contextBridge, ipcRenderer } from 'electron'

// Whitelist of IPC channels the renderer is allowed to invoke.
// Any channel not listed here is silently ignored — never expose ipcRenderer directly.
const ALLOWED_INVOKE = [
  'printer:print-raw',
  'drawer:open',
  'device:heartbeat',
  'device:status',
  'file:export',
  'file:save-dialog',
  'app:version',
  'app:update-check',
  'print-silent',
  'get-printers',
  'open-external',
  'biometric:sync',
]

const ALLOWED_ON = [
  'supabase-auth-redirect',
  'printer:status',
  'device:alert',
]

function safeInvoke (channel, ...args) {
  if (!ALLOWED_INVOKE.includes(channel)) {
    console.warn(`[Preload] Blocked IPC invoke on unlisted channel: ${channel}`)
    return Promise.reject(new Error(`Channel not allowed: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Raw ESC/POS Printing ──────────────────────────────────────────────────
  /**
   * Send raw ESC/POS byte buffer to a thermal printer.
   * Routes via TCP (ip:port 9100) when ip is provided, else via named printer.
   * @param {{ data: number[], printer?: string, ip?: string, port?: number }} opts
   */
  printRaw: (opts) => safeInvoke('printer:print-raw', opts),

  // ── Cash Drawer ───────────────────────────────────────────────────────────
  /**
   * Open the cash drawer by sending ESC/POS drawer-kick command.
   * @param {{ data: number[], printer?: string, ip?: string, userId: string, reason: string }} opts
   */
  openCashDrawer: (opts) => safeInvoke('drawer:open', opts),

  // ── Silent Printing ───────────────────────────────────────────────────────
  printSilent: (options = {}) => safeInvoke('print-silent', options),

  // ── Printer Discovery ─────────────────────────────────────────────────────
  getPrinters: () => safeInvoke('get-printers'),

  // ── Device Heartbeat ──────────────────────────────────────────────────────
  deviceHeartbeat: (opts) => safeInvoke('device:heartbeat', opts),

  // ── File Export ───────────────────────────────────────────────────────────
  showSaveDialog: (opts) => safeInvoke('file:save-dialog', opts),
  exportFile: (opts) => safeInvoke('file:export', opts),

  // ── Biometric / ZKTeco ───────────────────────────────────────────────────
  /**
   * Communicate with a ZKTeco biometric device over TCP.
   * @param {{ action: string, ip: string, port?: number, [key: string]: any }} opts
   */
  biometricSync: (opts) => safeInvoke('biometric:sync', opts),

  // ── App Info ──────────────────────────────────────────────────────────────
  getVersion: () => safeInvoke('app:version'),

  // ── Shell ─────────────────────────────────────────────────────────────────
  openExternal: (url) => {
    // Defense-in-depth: validate in preload before IPC reaches main.
    // Main process has the same check, but rejecting early avoids unnecessary IPC.
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return Promise.reject(new Error('Only https:// URLs are allowed for openExternal'))
    }
    return safeInvoke('open-external', url)
  },

  // ── Push notifications from main ──────────────────────────────────────────
  /**
   * Subscribe to a main-process push event.
   * Only channels in ALLOWED_ON are permitted.
   * @param {string} channel
   * @param {Function} callback
   * @returns {() => void} cleanup function
   */
  on: (channel, callback) => {
    if (!ALLOWED_ON.includes(channel)) {
      console.warn(`[Preload] Blocked IPC listener on unlisted channel: ${channel}`)
      return () => {}
    }
    const handler = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // ── Supabase OAuth deep-link ──────────────────────────────────────────────
  /**
   * Register a callback for sevenwaves:// OAuth redirect deep-links.
   * @param {(url: string) => void} callback
   * @returns {() => void} cleanup
   */
  onAuthRedirect: (callback) => {
    const handler = (_event, url) => callback(url)
    ipcRenderer.on('supabase-auth-redirect', handler)
    return () => ipcRenderer.removeListener('supabase-auth-redirect', handler)
  },
})
