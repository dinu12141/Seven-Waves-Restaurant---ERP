// ═══════════════════════════════════════════════════════════════════
// Label Printer Template — ZPL (Zebra) + ESC/POS label mode
// Seven Waves ERP — Step 06 Device & Platform Expansion
//
// Use cases: inventory labels, order labels, allergen labels,
//            customer receipt labels, shelf/bin labels.
// ═══════════════════════════════════════════════════════════════════

import { EscPosBuilder } from './escpos.renderer'

// ─── Label Provider ──────────────────────────────────────────────────────────

export const LABEL_PROVIDER = {
  ZPL:    'zpl',     // Zebra ZPL II (ZD220, ZD420, ZT series)
  ESCPOS: 'escpos',  // ESC/POS label mode (Star, Epson label printers)
}

// ─── ZPL Builder ─────────────────────────────────────────────────────────────

/**
 * Low-level ZPL command builder.
 * Outputs a string that can be sent as-is to a Zebra printer.
 */
export class ZplBuilder {
  constructor ({ width = 400, height = 200, dpi = 203 } = {}) {
    this._cmds = []
    this._width = width   // dots
    this._height = height // dots
    this._dpi = dpi
    this._start()
  }

  _start () {
    this._cmds.push('^XA')                      // Start label
    this._cmds.push(`^PW${this._width}`)         // Print width (dots)
    this._cmds.push(`^LL${this._height}`)        // Label length (dots)
    this._cmds.push('^CI28')                     // UTF-8 character set
  }

  /** Print field at (x, y) with optional font size */
  text (x, y, text, { fontSize = 25, fontType = 'A' } = {}) {
    this._cmds.push(`^FO${x},${y}^A${fontType}N,${fontSize},${Math.floor(fontSize * 0.8)}^FD${_escZpl(text)}^FS`)
    return this
  }

  /** Bold / large text */
  bigText (x, y, text) {
    return this.text(x, y, text, { fontSize: 40 })
  }

  /** Barcode (Code 128) */
  barcode128 (x, y, data, { height = 50 } = {}) {
    this._cmds.push(`^FO${x},${y}^BCN,${height},Y,N,N^FD${data}^FS`)
    return this
  }

  /** QR code */
  qrCode (x, y, data, { magnification = 4 } = {}) {
    this._cmds.push(`^FO${x},${y}^BQN,2,${magnification}^FDMM,A${data}^FS`)
    return this
  }

  /** Horizontal line */
  line (x, y, length, thickness = 2) {
    this._cmds.push(`^FO${x},${y}^GB${length},${thickness},${thickness}^FS`)
    return this
  }

  /** Box / rectangle */
  box (x, y, width, height, thickness = 2) {
    this._cmds.push(`^FO${x},${y}^GB${width},${height},${thickness}^FS`)
    return this
  }

  /** Inverted text block (white on black) */
  invertedText (x, y, text, width = 200, height = 30) {
    this._cmds.push(`^FO${x},${y}^GB${width},${height},${height}^FS`)
    this._cmds.push(`^FO${x + 4},${y + 4}^FR^A0N,22,20^FD${_escZpl(text)}^FS`)
    return this
  }

  /** Number of copies */
  copies (n) {
    this._cmds.push(`^PQ${n}`)
    return this
  }

  /** Build final ZPL string */
  build () {
    this._cmds.push('^XZ') // End label
    return this._cmds.join('\n')
  }
}

// ─── Ready-Made Label Templates ───────────────────────────────────────────────

/**
 * Inventory item label — 60mm × 30mm (472×236 dots at 203dpi)
 * Printed on Zebra ZD220 / ZD420 or similar.
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │ [ITEM NAME]                 │
 * │ SKU: XXXXXXXX               │
 * │ ████████████  $12.50        │
 * │ [barcode/sku]               │
 * └─────────────────────────────┘
 */
export function buildInventoryLabel (item, options = {}) {
  const { copies = 1, provider = LABEL_PROVIDER.ZPL } = options

  if (provider === LABEL_PROVIDER.ZPL) {
    const z = new ZplBuilder({ width: 472, height: 236 })
    z.text(10, 10, (item.name || 'Item').substring(0, 30), { fontSize: 30 })
    z.text(10, 50, `SKU: ${item.sku || item.id?.substring(0, 8) || 'N/A'}`, { fontSize: 22 })
    if (item.price != null) {
      z.text(10, 80, `Price: ${Number(item.price).toFixed(2)}`, { fontSize: 22 })
    }
    if (item.barcode || item.sku) {
      z.barcode128(10, 115, item.barcode || item.sku, { height: 60 })
    }
    if (item.category) {
      z.text(10, 195, item.category.substring(0, 25), { fontSize: 18 })
    }
    z.copies(copies)
    return { format: 'zpl', data: z.build() }
  }

  // ESC/POS label mode fallback
  const b = new EscPosBuilder(58)
  b.center().bold().line((item.name || 'Item').substring(0, 20)).boldOff()
  b.left().line(`SKU: ${item.sku || 'N/A'}`)
  if (item.price != null) b.line(`Price: ${Number(item.price).toFixed(2)}`)
  b.cut()
  return { format: 'escpos', data: b.build() }
}

/**
 * Order label — for delivery packaging, takeaway bags.
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │  ORDER #1234   TABLE: 5     │
 * │  ─────────────────────────  │
 * │  2x Burger                  │
 * │  1x Fries (no salt)         │
 * │  ─────────────────────────  │
 * │  12:35 PM   Cashier: John   │
 * └─────────────────────────────┘
 */
export function buildOrderLabel (order, options = {}) {
  const { copies = 1, provider = LABEL_PROVIDER.ZPL } = options
  const items = order.items || order.order_items || []
  const time = new Date(order.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (provider === LABEL_PROVIDER.ZPL) {
    const z = new ZplBuilder({ width: 472, height: 300 })

    z.invertedText(10, 10, `ORDER #${order.order_number || order.id?.substring(0, 6) || '---'}`, 280, 36)

    if (order.table_number) z.text(300, 15, `TABLE: ${order.table_number}`, { fontSize: 28 })
    z.line(10, 55, 452)

    let yPos = 65
    for (const item of items.slice(0, 6)) {
      const name = `${item.quantity || 1}x ${(item.name || item.item_name || '?').substring(0, 25)}`
      z.text(10, yPos, name, { fontSize: 22 })
      if (item.notes) z.text(20, yPos + 24, `>> ${item.notes.substring(0, 28)}`, { fontSize: 18 })
      yPos += item.notes ? 50 : 30
      if (yPos > 240) { z.text(10, yPos, '...more', { fontSize: 18 }); break }
    }

    z.line(10, 260, 452)
    z.text(10, 268, time, { fontSize: 18 })
    if (order.cashier_name) z.text(150, 268, `by: ${order.cashier_name.substring(0, 12)}`, { fontSize: 18 })

    z.copies(copies)
    return { format: 'zpl', data: z.build() }
  }

  // ESC/POS fallback
  const b = new EscPosBuilder(58)
  b.center().bold().big().line(`#${order.order_number || order.id?.substring(0, 6) || '---'}`).bigOff().boldOff()
  if (order.table_number) b.line(`TABLE: ${order.table_number}`)
  b.separator()
  for (const item of items.slice(0, 8)) {
    b.left().line(`${item.quantity || 1}x ${(item.name || item.item_name || '?').substring(0, 22)}`)
    if (item.notes) b.line(`  >> ${item.notes.substring(0, 20)}`)
  }
  b.separator().line(time).cut()
  return { format: 'escpos', data: b.build() }
}

/**
 * Allergen label — for food safety compliance.
 *
 * Layout:
 * ┌─────────────────────────────┐
 * │ ⚠  ALLERGEN INFORMATION  ⚠ │
 * │ Item: Chicken Burger        │
 * │ Contains: GLUTEN, DAIRY     │
 * │ May contain: NUTS           │
 * │ Prepared: 14:30 by Chef Ali │
 * └─────────────────────────────┘
 */
export function buildAllergenLabel (item, allergens, options = {}) {
  const { copies = 1, preparedBy = '', provider = LABEL_PROVIDER.ZPL } = options
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (provider === LABEL_PROVIDER.ZPL) {
    const z = new ZplBuilder({ width: 472, height: 280 })
    z.invertedText(10, 10, '!!! ALLERGEN INFORMATION !!!', 452, 36)
    z.text(10, 55, `Item: ${(item.name || '').substring(0, 28)}`, { fontSize: 24 })
    z.line(10, 85, 452)

    const contains = (allergens.contains || []).join(', ').toUpperCase()
    const mayContain = (allergens.may_contain || []).join(', ').toUpperCase()

    if (contains) {
      z.text(10, 95, `Contains: ${contains.substring(0, 40)}`, { fontSize: 22 })
    }
    if (mayContain) {
      z.text(10, 125, `May contain: ${mayContain.substring(0, 36)}`, { fontSize: 22 })
    }

    z.line(10, 160, 452)
    z.text(10, 170, `Prepared: ${time}${preparedBy ? ` by ${preparedBy}` : ''}`, { fontSize: 18 })
    z.text(10, 198, 'Consume within 2 hours of preparation', { fontSize: 16 })

    z.copies(copies)
    return { format: 'zpl', data: z.build() }
  }

  const b = new EscPosBuilder(58)
  b.center().bold().line('! ALLERGEN INFO !').boldOff()
  b.left().line(item.name || '').separator('-')
  if (allergens.contains?.length) b.bold().line('Contains:').boldOff().line((allergens.contains || []).join(', '))
  if (allergens.may_contain?.length) b.line('May contain:').line((allergens.may_contain || []).join(', '))
  b.separator().line(`${time}${preparedBy ? ` / ${preparedBy}` : ''}`).cut()
  return { format: 'escpos', data: b.build() }
}

/**
 * Shelf / bin label — for inventory management.
 */
export function buildShelfLabel (item, location, options = {}) {
  const { copies = 1, provider = LABEL_PROVIDER.ZPL } = options

  if (provider === LABEL_PROVIDER.ZPL) {
    const z = new ZplBuilder({ width: 472, height: 180 })
    z.bigText(10, 10, (item.name || 'Item').substring(0, 25))
    z.text(10, 60, `Location: ${location || 'N/A'}`, { fontSize: 24 })
    z.text(10, 90, `SKU: ${item.sku || 'N/A'}`, { fontSize: 22 })
    if (item.barcode || item.sku) {
      z.barcode128(10, 118, item.barcode || item.sku, { height: 50 })
    }
    z.copies(copies)
    return { format: 'zpl', data: z.build() }
  }

  const b = new EscPosBuilder(58)
  b.center().bold().big().line((item.name || '').substring(0, 16)).bigOff().boldOff()
  b.left().line(`LOC: ${location || 'N/A'}`).line(`SKU: ${item.sku || 'N/A'}`).cut()
  return { format: 'escpos', data: b.build() }
}

// ─── Send Label ───────────────────────────────────────────────────────────────

/**
 * Send a label to a printer.
 * Handles ZPL (string → TCP) and ESC/POS (Uint8Array → TCP or Electron).
 *
 * @param {{ format: 'zpl'|'escpos', data: string|Uint8Array }} label
 * @param {{ ip?: string, port?: number, printerName?: string }} printerCfg
 */
export async function sendLabel (label, printerCfg = {}) {
  const { ip, port = 9100, printerName } = printerCfg

  let bytes
  if (label.format === 'zpl') {
    bytes = new TextEncoder().encode(label.data)
  } else {
    bytes = label.data instanceof Uint8Array ? label.data : new Uint8Array(label.data)
  }

  // Electron path
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI.printRaw({
      data: Array.from(bytes),
      printer: printerName || '',
      ip: ip || '',
      port,
    })
  }

  // Tauri path
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('print_raw', { data: Array.from(bytes), ip: ip || '', port, printer: printerName || '' })
  }

  // Browser fallback (WebUSB not implemented for labels — trigger download)
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `label-${Date.now()}.${label.format === 'zpl' ? 'zpl' : 'bin'}`
  a.click()
  URL.revokeObjectURL(url)
  return { success: true, method: 'download' }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _escZpl (str) {
  if (!str) return ''
  return String(str)
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
    .replace(/[^ -~]/g, '?')
}
