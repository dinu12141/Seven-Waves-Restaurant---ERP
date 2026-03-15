/**
 * Electron Preload Script — Seven Waves ERP
 *
 * Exposes a safe `window.electronAPI` bridge so the Vue renderer can:
 *   • Print silently (POS receipts, KOT tickets)
 *   • List available printers
 *
 * WARNING: Only add functions here that are explicitly needed.
 * Never expose full Node.js or Electron APIs to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Trigger a silent print of the current page content.
   * @param {Object} options
   * @param {string} [options.printerName] - Target printer name (empty = default)
   * @param {number} [options.copies]      - Number of copies (default 1)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  printSilent: (options = {}) => ipcRenderer.invoke('print-silent', options),

  /**
   * Get the list of printers available on this machine.
   * @returns {Promise<Array<{name: string, isDefault: boolean, status: number}>>}
   */
  getPrinters: () => ipcRenderer.invoke('get-printers'),
})
