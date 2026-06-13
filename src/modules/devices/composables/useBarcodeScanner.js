// ═══════════════════════════════════════════════════════════════════
// useBarcodeScanner — Composable for barcode/QR scanning
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { ref, onMounted, onUnmounted } from 'vue'
import { lookupByBarcode, lookupCustomerByCard, logScanEvent } from '../services/scanner.service'
import { logger } from 'src/core/logging/logger'

/**
 * useBarcodeScanner composable.
 * Supports USB HID scanners (keyboard wedge), camera scan, and manual entry.
 *
 * USB HID scanners work by typing characters rapidly then pressing Enter.
 * We detect this pattern: chars arriving < 50ms apart followed by Enter.
 */
export function useBarcodeScanner(options = {}) {
  const {
    onScan = null,
    debounceMs = 300,
    minLength = 3,
    maxLength = 50,
    enabled = true,
  } = options

  const lastScan = ref(null)
  const lastScanTime = ref(null)
  const scanning = ref(false)
  const error = ref(null)
  const scanCount = ref(0)

  // ─── USB HID Scanner Detection (keyboard wedge) ─────────────────
  let _buffer = ''
  let _lastKeyTime = 0
  let _debounceTimer = null
  const KEY_THRESHOLD = 50 // max ms between keys for scanner (not human typing)

  function handleKeyDown(e) {
    if (!enabled) return

    const now = Date.now()

    // Enter key = scan complete
    if (e.key === 'Enter' && _buffer.length >= minLength) {
      e.preventDefault()
      e.stopPropagation()
      processScan(_buffer.trim())
      _buffer = ''
      return
    }

    // Only accept printable characters
    if (e.key.length !== 1) return

    // If too much time since last key, it's a new scan
    if (now - _lastKeyTime > KEY_THRESHOLD && _buffer.length > 0) {
      _buffer = ''
    }

    _buffer += e.key
    _lastKeyTime = now

    // Safety: cap buffer length
    if (_buffer.length > maxLength) {
      _buffer = _buffer.substring(_buffer.length - maxLength)
    }
  }

  async function processScan(barcode) {
    // Debounce: prevent duplicate scans
    if (_debounceTimer) return
    _debounceTimer = setTimeout(() => { _debounceTimer = null }, debounceMs)

    if (barcode === lastScan.value && Date.now() - (lastScanTime.value || 0) < 2000) {
      logger.debug('[Scanner] Duplicate scan ignored', { barcode })
      return
    }

    scanning.value = true
    error.value = null
    lastScan.value = barcode
    lastScanTime.value = Date.now()
    scanCount.value++

    logger.info('[Scanner] Barcode scanned', { barcode })

    try {
      // Log the scan event
      logScanEvent({ barcode, timestamp: new Date().toISOString() })

      // Callback
      if (onScan) {
        await onScan(barcode)
      }
    } catch (err) {
      error.value = err.message
      logger.error('[Scanner] Scan processing error', err)
    } finally {
      scanning.value = false
    }
  }

  /**
   * Manual barcode entry (for UI input fields).
   */
  async function manualScan(barcode) {
    if (!barcode || barcode.length < minLength) {
      error.value = 'Barcode too short'
      return
    }
    await processScan(barcode.trim())
  }

  /**
   * Lookup item by barcode.
   */
  async function lookupItem(barcode, branchId) {
    return lookupByBarcode(barcode, branchId)
  }

  /**
   * Lookup customer by loyalty card.
   */
  async function lookupCustomer(cardCode) {
    return lookupCustomerByCard(cardCode)
  }

  // ─── Lifecycle ──────────────────────────────────────────────────
  onMounted(() => {
    if (typeof window !== 'undefined' && enabled) {
      window.addEventListener('keydown', handleKeyDown, { capture: true })
    }
  })

  onUnmounted(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
    if (_debounceTimer) clearTimeout(_debounceTimer)
  })

  return {
    lastScan, lastScanTime, scanning, error, scanCount,
    manualScan, lookupItem, lookupCustomer,
  }
}
