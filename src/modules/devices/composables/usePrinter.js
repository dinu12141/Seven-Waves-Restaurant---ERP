// ═══════════════════════════════════════════════════════════════════
// usePrinter — Composable for printing operations
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { ref, computed } from 'vue'
import { usePrinterStore } from '../stores/printer.store'
import { buildReceipt, buildKitchenTicket } from '../services/receipt.template'
import { logger } from 'src/core/logging/logger'

/**
 * Platform bridge detection.
 * Returns the appropriate print transport for the current runtime.
 */
function getPlatformBridge() {
  if (typeof window === 'undefined') return 'none'
  if ('__TAURI_INTERNALS__' in window) return 'tauri'
  if (typeof window.electronAPI !== 'undefined') return 'electron'
  if ('navigator' in window && 'usb' in navigator) return 'webusb'
  return 'network'
}

/**
 * Send raw bytes to printer via the detected platform bridge.
 */
async function sendToPrinter(buffer, printerConfig) {
  const bridge = getPlatformBridge()

  switch (bridge) {
    case 'electron':
      return window.electronAPI.printRaw({
        data: Array.from(buffer),
        printer: printerConfig.printer_name || '',
        ip: printerConfig.printer_ip || '',
        port: printerConfig.printer_port || 9100,
      })

    case 'tauri': {
      // Tauri command bridge
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('print_raw', {
        data: Array.from(buffer),
        printer: printerConfig.printer_name,
        ip: printerConfig.printer_ip,
        port: printerConfig.printer_port || 9100,
      })
    }

    case 'webusb': {
      // WebUSB — direct USB access from browser (Chrome/Edge only, requires HTTPS)
      // Printer must expose a USB interface (class 7 = Printer class, or vendor-specific)
      try {
        const usbDevice = await navigator.usb.requestDevice({
          filters: [
            { classCode: 7 },                  // USB Printer class
            { vendorId: 0x04B8 },              // Epson
            { vendorId: 0x0519 },              // Star Micronics
            { vendorId: 0x067B },              // Prolific (USB-Serial adapters)
          ],
        })

        await usbDevice.open()

        // Find the correct interface and endpoint
        const iface = usbDevice.configuration?.interfaces.find(i =>
          i.alternate.interfaceClass === 7 ||
          i.alternate.interfaceClass === 255 // vendor-specific
        )

        if (!iface) {
          await usbDevice.close()
          return { success: false, error: 'No printer USB interface found on device' }
        }

        await usbDevice.claimInterface(iface.interfaceNumber)

        const endpoint = iface.alternate.endpoints.find(e => e.direction === 'out')
        if (!endpoint) {
          await usbDevice.releaseInterface(iface.interfaceNumber)
          await usbDevice.close()
          return { success: false, error: 'No OUT endpoint on USB printer interface' }
        }

        // Send data in 64-byte chunks (USB bulk transfer limit)
        const CHUNK = 64
        for (let i = 0; i < buffer.length; i += CHUNK) {
          await usbDevice.transferOut(endpoint.endpointNumber, buffer.slice(i, i + CHUNK))
        }

        await usbDevice.releaseInterface(iface.interfaceNumber)
        await usbDevice.close()
        logger.info('[Printer] WebUSB print complete')
        return { success: true, method: 'webusb' }
      } catch (err) {
        if (err.name === 'NotFoundError') {
          return { success: false, error: 'No USB printer selected or found' }
        }
        return { success: false, error: err.message }
      }
    }

    case 'network':
      // Network printing — browser cannot open raw TCP sockets.
      // If a local print server (e.g., running on localhost:9100) is available, use it.
      // Otherwise fall back to browser print dialog.
      logger.info('[Printer] Network print — no local agent, using browser dialog')
      window.print()
      return { success: true, method: 'browser' }

    default:
      logger.warn('[Printer] No print bridge available')
      return { success: false, error: 'No print transport available' }
  }
}

/**
 * usePrinter composable.
 * Provides reactive print functionality for POS, kitchen, and report printing.
 */
export function usePrinter() {
  const store = usePrinterStore()
  const printing = ref(false)
  const lastError = ref(null)
  const lastPrintTime = ref(null)

  const platform = computed(() => getPlatformBridge())
  const isAvailable = computed(() => platform.value !== 'none')

  /**
   * Print a POS receipt.
   */
  async function printReceipt(order, branch, options = {}) {
    printing.value = true
    lastError.value = null

    try {
      const printer = options.printer || store.defaultPrinter || store.receiptPrinters[0]
      if (!printer) {
        lastError.value = 'No receipt printer configured'
        return { success: false, error: lastError.value }
      }

      const buffer = buildReceipt(order, branch, {
        paperWidth: printer.paper_width || 80,
        ...options,
      })

      // Create print job record
      const job = await store.submitPrintJob({
        branch_id: branch.id,
        printer_id: printer.id,
        job_type: 'receipt',
        status: 'printing',
        payload: { order_id: order.id, receipt_number: order.receipt_number },
        created_by: options.userId || null,
      })

      const result = await sendToPrinter(buffer, printer)

      if (result.success !== false) {
        if (job.data) await store.markJobStatus(job.data.id, 'printed')
        lastPrintTime.value = new Date()
        logger.info('[Printer] Receipt printed', { orderId: order.id })
        return { success: true }
      } else {
        if (job.data) await store.markJobStatus(job.data.id, 'failed', result.error)
        lastError.value = result.error
        return { success: false, error: result.error }
      }
    } catch (err) {
      lastError.value = err.message
      logger.error('[Printer] Receipt print error', err)
      return { success: false, error: err.message }
    } finally {
      printing.value = false
    }
  }

  /**
   * Print a kitchen ticket.
   */
  async function printKitchenTicket(order, station, options = {}) {
    printing.value = true
    lastError.value = null

    try {
      const printer = options.printer || store.kitchenPrinters.find(p => p.station_id === station) || store.kitchenPrinters[0]
      if (!printer) {
        lastError.value = 'No kitchen printer for station: ' + station
        return { success: false, error: lastError.value }
      }

      const buffer = buildKitchenTicket(order, station, {
        paperWidth: printer.paper_width || 80,
      })

      const job = await store.submitPrintJob({
        branch_id: options.branchId,
        printer_id: printer.id,
        job_type: 'kitchen_ticket',
        status: 'printing',
        payload: { order_id: order.id, station },
      })

      const result = await sendToPrinter(buffer, printer)

      if (result.success !== false) {
        if (job.data) await store.markJobStatus(job.data.id, 'printed')
        lastPrintTime.value = new Date()
        return { success: true }
      } else {
        if (job.data) await store.markJobStatus(job.data.id, 'failed', result.error)
        lastError.value = result.error
        return { success: false, error: result.error }
      }
    } catch (err) {
      lastError.value = err.message
      return { success: false, error: err.message }
    } finally {
      printing.value = false
    }
  }

  /**
   * Send a test print to verify printer connectivity.
   */
  async function testPrint(printer) {
    const { EscPosBuilder } = await import('../services/escpos.renderer')
    const b = new EscPosBuilder(printer.paper_width || 80)
    b.center().big().line('** TEST PRINT **').bigOff()
      .line('Seven Waves ERP')
      .line(new Date().toLocaleString())
      .separator()
      .line('Printer: ' + printer.printer_name)
      .line('Status: OK')
      .cut()

    return sendToPrinter(b.build(), printer)
  }

  return {
    printing, lastError, lastPrintTime, platform, isAvailable,
    printReceipt, printKitchenTicket, testPrint,
  }
}
