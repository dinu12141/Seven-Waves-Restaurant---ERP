// ═══════════════════════════════════════════════════════════════════
// Receipt Template — ESC/POS receipt builder
// Seven Waves ERP — Step 06 Device & Platform Expansion
// ═══════════════════════════════════════════════════════════════════

import { EscPosBuilder } from './escpos.renderer'

/**
 * Build a receipt buffer from order data.
 *
 * @param {object} order - Order data
 * @param {object} branch - Branch info (name, address, phone, tax_id)
 * @param {object} options - { paperWidth: 80, showLogo: true, footerNote: '' }
 * @returns {Uint8Array} ESC/POS binary buffer
 */
export function buildReceipt(order, branch, options = {}) {
  const { paperWidth = 80, footerNote = 'Thank you for dining with us!' } = options
  const b = new EscPosBuilder(paperWidth)

  // ─── Header ─────────────────────────────────────────────────────
  b.center().big()
    .line(branch.name || 'Seven Waves')
    .bigOff()
    .line(branch.address || '')
    .line(branch.phone ? `Tel: ${branch.phone}` : '')

  if (branch.tax_id) {
    b.line(`Tax ID: ${branch.tax_id}`)
  }

  b.left().separator('=')

  // ─── Order Info ─────────────────────────────────────────────────
  b.bold()
    .columns('Receipt #:', order.receipt_number || order.id?.substring(0, 8) || '---')
    .boldOff()
    .columns('Date:', formatDate(order.created_at))
    .columns('Cashier:', order.cashier_name || 'System')

  if (order.table_number) b.columns('Table:', String(order.table_number))
  if (order.order_type) b.columns('Type:', capitalize(order.order_type))

  b.separator()

  // ─── Items ──────────────────────────────────────────────────────
  b.bold().threeColumns('Item', 'Qty', 'Amount').boldOff()
  b.separator('-')

  const items = order.items || order.order_items || []
  for (const item of items) {
    const name = item.name || item.item_name || 'Item'
    const qty = String(item.quantity || 1)
    const amount = formatMoney(item.total || item.price * (item.quantity || 1))
    b.threeColumns(name, qty, amount)

    // Modifiers
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        b.line(`  + ${mod.name}${mod.price ? ` (${formatMoney(mod.price)})` : ''}`)
      }
    }
  }

  b.separator()

  // ─── Totals ─────────────────────────────────────────────────────
  const subtotal = order.subtotal || items.reduce((s, i) => s + (i.total || i.price * (i.quantity || 1)), 0)
  b.columns('Subtotal:', formatMoney(subtotal))

  if (order.discount_amount && order.discount_amount > 0) {
    b.columns('Discount:', `-${formatMoney(order.discount_amount)}`)
  }
  if (order.tax_amount && order.tax_amount > 0) {
    b.columns('Tax:', formatMoney(order.tax_amount))
  }
  if (order.service_charge && order.service_charge > 0) {
    b.columns('Service:', formatMoney(order.service_charge))
  }

  b.separator('=')
  b.bold().big()
    .columns('TOTAL:', formatMoney(order.total || order.grand_total || subtotal))
    .bigOff().boldOff()
  b.separator('=')

  // ─── Payment ────────────────────────────────────────────────────
  if (order.payment_method) {
    b.columns('Payment:', capitalize(order.payment_method))
  }
  if (order.amount_paid) {
    b.columns('Paid:', formatMoney(order.amount_paid))
  }
  if (order.change_amount && order.change_amount > 0) {
    b.columns('Change:', formatMoney(order.change_amount))
  }

  b.feed(1)

  // ─── Footer ─────────────────────────────────────────────────────
  b.center()
    .line(footerNote)
    .feed(1)
    .line(`Order #${order.order_number || order.id?.substring(0, 8) || ''}`)

  b.cut()

  return b.build()
}

/**
 * Build a kitchen ticket buffer.
 */
export function buildKitchenTicket(order, station, options = {}) {
  const { paperWidth = 80 } = options
  const b = new EscPosBuilder(paperWidth)

  // ─── Header ─────────────────────────────────────────────────────
  b.center().big().bold()
    .line(`** ${station || 'KITCHEN'} **`)
    .bigOff().boldOff()
    .separator('=')

  b.left()
    .columns('Order:', order.order_number || order.id?.substring(0, 8) || '---')
    .columns('Time:', formatTime(order.created_at))

  if (order.table_number) {
    b.big().bold()
      .columns('TABLE:', String(order.table_number))
      .bigOff().boldOff()
  }
  if (order.order_type && order.order_type !== 'dine_in') {
    b.bold().line(`*** ${order.order_type.toUpperCase().replace('_', ' ')} ***`).boldOff()
  }

  b.separator()

  // ─── Items (filtered by station if applicable) ──────────────────
  const items = order.items || order.order_items || []
  const stationItems = station
    ? items.filter(i => !i.station || i.station === station)
    : items

  for (const item of stationItems) {
    const urgent = item.urgent ? '!!! ' : ''
    b.bold()
      .line(`${urgent}${item.quantity || 1}x ${item.name || item.item_name}`)
      .boldOff()

    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        b.line(`   + ${mod.name}`)
      }
    }
    if (item.notes) {
      b.line(`   >> ${item.notes}`)
    }
  }

  b.separator('=')
  b.center().bold()
    .line(`Items: ${stationItems.length}`)
    .boldOff()

  b.beep()
  b.cut()

  return b.build()
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatMoney(amount) {
  return Number(amount || 0).toFixed(2)
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleString()
  return new Date(dateStr).toLocaleString()
}

function formatTime(dateStr) {
  if (!dateStr) return new Date().toLocaleTimeString()
  return new Date(dateStr).toLocaleTimeString()
}

function capitalize(str) {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ')
}
