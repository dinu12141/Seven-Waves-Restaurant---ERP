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

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Printing ──────────────────────────────────────────────────────────────

  /**
   * Trigger a silent print of the current page content.
   * @param {Object} [options]
   * @param {string} [options.printerName] - Target printer (empty = system default)
   * @param {number} [options.copies]      - Copies to print (default 1)
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  printSilent: (options = {}) => ipcRenderer.invoke('print-silent', options),

  /**
   * Get the list of printers available on this machine.
   * @returns {Promise<Array<{ name: string, isDefault: boolean, status: number }>>}
   */
  getPrinters: () => ipcRenderer.invoke('get-printers'),

  // ── Shell ─────────────────────────────────────────────────────────────────

  /**
   * Open a URL in the system's default browser.
   * Only https:// URLs are permitted (enforced in main process).
   * Use this for Supabase OAuth sign-in links.
   * @param {string} url
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ── Supabase OAuth deep-link ──────────────────────────────────────────────

  /**
   * Register a one-time callback that fires when the OS routes a
   * sevenwaves:// deep-link back to the app after a successful OAuth flow.
   * The `url` argument is the full sevenwaves://auth-callback#... URL.
   *
   * @param {(url: string) => void} callback
   * @returns {() => void}  call this to remove the listener (cleanup)
   *
   * @example
   * const remove = window.electronAPI.onAuthRedirect((url) => {
   *   const hash = new URL(url).hash          // '#access_token=...&...'
   *   const params = new URLSearchParams(hash.slice(1))
   *   supabase.auth.setSession({
   *     access_token:  params.get('access_token'),
   *     refresh_token: params.get('refresh_token'),
   *   })
   * })
   * onUnmounted(remove)
   */
  onAuthRedirect: (callback) => {
    const handler = (_event, url) => callback(url)
    ipcRenderer.on('supabase-auth-redirect', handler)
    // Return a cleanup function so callers can remove the listener
    return () => ipcRenderer.removeListener('supabase-auth-redirect', handler)
  },
})
