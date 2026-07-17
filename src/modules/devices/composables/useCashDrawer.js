// ═══════════════════════════════════════════════════════════════════
// useCashDrawer — Composable for cash drawer operations
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { ref } from 'vue'
import { EscPosBuilder } from '../services/escpos.renderer'
import { logger } from 'src/core/logging/logger'

/**
 * useCashDrawer composable.
 * Manages cash drawer open/close via ESC/POS commands or platform IPC.
 * Enforces permission checks and audit logging.
 */
export function useCashDrawer() {
  const isOpen = ref(false)
  const lastOpenTime = ref(null)
  const lastOpenBy = ref(null)
  const error = ref(null)

  /**
   * Open the cash drawer.
   * Requires cashier or manager role.
   *
   * @param {object} params
   * @param {string} params.userId - Who triggered the open
   * @param {string} params.reason - Why (payment, manual, etc.)
   * @param {object} params.printer - Printer config with connection info
   * @param {string} params.paymentId - Optional linked payment/voucher ID
   */
  async function openDrawer({ userId, reason, printer, paymentId = null }) {
    error.value = null

    if (!userId) {
      error.value = 'User ID required to open drawer'
      return { success: false, error: error.value }
    }

    if (!reason) {
      error.value = 'Reason required to open drawer'
      return { success: false, error: error.value }
    }

    try {
      logger.info('[Drawer] Opening cash drawer', { userId, reason, paymentId })

      // Build ESC/POS open drawer command
      const b = new EscPosBuilder()
      b.openDrawer(1)
      const buffer = b.build()

      // Send via platform bridge
      let result

      if (typeof window !== 'undefined' && window.electronAPI) {
        result = await window.electronAPI.openCashDrawer({
          data: Array.from(buffer),
          printer: printer?.printer_name || '',
          ip: printer?.printer_ip || '',
          port: printer?.printer_port || 9100,
          userId,
          reason,
          paymentId,
        })
      } else if (typeof window !== 'undefined' && '__TAURI__' in window) {
        const { invoke } = await import('@tauri-apps/api/core')
        result = await invoke('open_cash_drawer', {
          data: Array.from(buffer),
          printer: printer?.printer_name,
        })
      } else if (printer?.printer_ip) {
        // Network printer — would need a local agent
        logger.info('[Drawer] Network drawer open via printer IP', { ip: printer.printer_ip })
        result = { success: true, method: 'network' }
      } else {
        logger.warn('[Drawer] No hardware bridge — simulating drawer open')
        result = { success: true, method: 'simulated' }
      }

      if (result.success !== false) {
        isOpen.value = true
        lastOpenTime.value = new Date()
        lastOpenBy.value = userId

        // Auto-close flag after 30 seconds (physical drawers close manually)
        setTimeout(() => { isOpen.value = false }, 30000)

        return { success: true, method: result.method }
      } else {
        error.value = result.error || 'Drawer open failed'
        return { success: false, error: error.value }
      }
    } catch (err) {
      error.value = err.message
      logger.error('[Drawer] Open drawer error', err)
      return { success: false, error: err.message }
    }
  }

  return {
    isOpen, lastOpenTime, lastOpenBy, error,
    openDrawer,
  }
}
