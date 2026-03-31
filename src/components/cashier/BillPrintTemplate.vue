<template>
  <!-- Print-ready receipt matching POS thermal printer format -->
  <div class="bill-print-wrap" id="bill-print-template" ref="billRoot">
    <!-- ── Logo & Header ── -->
    <div class="bill-header">
      <img :src="logoUrl" alt="Seven Waves" class="bill-logo" crossorigin="anonymous" />
      <div class="restaurant-name">SEVEN WAVES RESTAURANT (PVT) LTD.</div>
      <div class="restaurant-address">NO 324, HIGH LEVEL ROAD, MAHARAGAMA</div>
      <div class="restaurant-tel">TEL: +94 74 200 7251</div>
    </div>

    <!-- ── Divider ── -->
    <div class="bill-divider"></div>

    <!-- ── Invoice Meta ── -->
    <div class="bill-meta">
      <div class="meta-row">
        <span class="meta-label">Bill # :</span>
        <span class="meta-value">{{ invoiceDisplayNumber }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">{{ orderTypeLabel }} NO :</span>
        <span class="meta-value">{{ orderIdByType }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">KOT Ref. :</span>
        <span class="meta-value">{{ kotNumber }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Served By :</span>
        <span class="meta-value">{{ waiterName }}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Cashier :</span>
        <span class="meta-value">{{ cashierNameDisplay }}</span>
      </div>
      <div class="meta-row meta-row-split">
        <span class="meta-value">{{ formatDateTime(invoice.created_at) }}</span>
        <span class="meta-value">{{ tableDisplay }}</span>
      </div>
      <div v-if="customerName" class="meta-row">
        <span class="meta-label">Customer :</span>
        <span class="meta-value">{{ customerName }}</span>
      </div>
      <div v-if="customerPhone" class="meta-row">
        <span class="meta-label">Phone :</span>
        <span class="meta-value">{{ customerPhone }}</span>
      </div>
      <div v-if="isConsolidatedBill" class="meta-row" style="margin-top:2px">
        <span class="meta-label" style="font-weight:700; font-size:9px"> ** CONSOLIDATED BILL **</span>
      </div>
    </div>

    <!-- ── Divider ── -->
    <div class="bill-divider"></div>

    <!-- ── Items Header ── -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">DESCRIPTION</th>
          <th class="col-qty">QTY</th>
          <th class="col-amt">AMOUNT</th>
        </tr>
      </thead>
    </table>

    <div class="bill-divider-dashed"></div>

    <!-- ── Items Body ── -->
    <table class="items-table">
      <tbody>
        <tr v-for="item in invoice.invoice_items" :key="item.id">
          <td class="col-desc">
            <div class="item-name">{{ item.menu_item_name }}</div>
            <div class="item-code-line">{{ item.quantity }} @ {{ fmtNum(item.unit_price) }}</div>
          </td>
          <td class="col-qty">{{ item.quantity }}</td>
          <td class="col-amt">{{ fmtNum(item.total_price) }}</td>
        </tr>
      </tbody>
    </table>

    <!-- ── Divider ── -->
    <div class="bill-divider-dashed"></div>

    <!-- ── Totals ── -->
    <div class="totals-section">
      <div class="total-row">
        <span class="total-label">Total Qty :</span>
        <span class="total-value">{{ totalQty.toFixed(2) }}</span>
      </div>
      <div class="total-row">
        <span class="total-label">Sub Total :</span>
        <span class="total-value">{{ fmtNum(invoice.subtotal || itemsSubtotal) }}</span>
      </div>
      <div v-if="invoiceDeliveryCharge > 0" class="total-row">
        <span class="total-label">Delivery Charge :</span>
        <span class="total-value">{{ fmtNum(invoiceDeliveryCharge) }}</span>
      </div>
      <div v-if="displayServiceCharge > 0" class="total-row">
        <span class="total-label">Service Charge (10%) :</span>
        <span class="total-value">{{ fmtNum(displayServiceCharge) }}</span>
      </div>
      <div class="total-row total-row-bold">
        <span class="total-label">Bill Amount :</span>
        <span class="total-value">{{ fmtNum(parseFloat(invoice.grand_total || 0)) }}</span>
      </div>
      <template v-if="invoice.payments?.length">
        <div v-for="pmt in invoice.payments" :key="pmt.id" class="total-row">
          <span class="total-label">PAID AMT.({{ paymentMethodLabel(pmt) }}) :</span>
          <span class="total-value">{{ fmtNum(pmt.amount) }}</span>
        </div>
      </template>
      <div class="total-row">
        <span class="total-label">Bal. Amt.(LKR) :</span>
        <span class="total-value">{{ fmtNum(Math.max(0, balanceAmount)) }}</span>
      </div>
    </div>

    <!-- ── Delivery Info ── -->
    <div v-if="deliveryAddress" class="customer-info">
      <div class="meta-row">
        <span class="meta-label">Delivery Address</span>
        <span class="meta-value">: {{ deliveryAddress }}</span>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div class="bill-divider"></div>
    <div class="bill-footer">
      <div class="footer-thanks">THANK YOU FOR VISITING SEVEN WAVES</div>
      <div class="footer-web">www.echomediaa.com | +94 74 200 7251</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import logoImage from 'src/assets/seven-waves-logo-transparent.png'

const billRoot = ref(null)

const props = defineProps({
  invoice: {
    type: Object,
    required: true,
  },
  branchName: {
    type: String,
    default: '',
  },
  branchAddress: {
    type: String,
    default: '',
  },
  currencySymbol: {
    type: String,
    default: 'LKR',
  },
  cashierName: {
    type: String,
    default: '',
  },
})

const logoUrl = computed(() => logoImage)

const tableDisplay = computed(() => {
  const t = props.invoice.orders?.restaurant_tables
  if (!t) return ''

  if (t.section) return `${t.section}/${t.table_number}`

  // If table_number already starts with 'T' (like 'T01'), don't add another 'T'
  const num = String(t.table_number)
  if (num.toUpperCase().startsWith('T')) return num

  return `T${num}`
})

const kotNumber = computed(() => {
  const order = props.invoice.orders
  if (!order) return '—'
  // Try to get from order.kot_tickets
  if (order.kot_tickets?.length > 0) {
    return order.kot_tickets.map((k) => k.kot_number).join(', ')
  }
  return '—'
})

const waiterName = computed(() => {
  return props.invoice.orders?.waiter?.full_name || '—'
})

const cashierNameDisplay = computed(() => {
  // 1. If we have a real invoice, check its stored cashier first
  if (props.invoice.cashier?.full_name) return props.invoice.cashier.full_name
  if (props.invoice.profiles?.full_name) return props.invoice.profiles.full_name

  // 2. Use the passed prop if available (for simulated bills before payment)
  if (props.cashierName) return props.cashierName

  // 3. Fallback to owner of the order or generic string
  return props.invoice.orders?.waiter?.full_name || 'Cashier'
})

const invoiceDisplayNumber = computed(() => {
  return props.invoice.invoice_number || props.invoice.id?.slice(0, 8).toUpperCase() || '—'
})

// Detect consolidated/merged bill from the invoice notes
const isConsolidatedBill = computed(() => {
  return !!(props.invoice.notes && props.invoice.notes.includes('Consolidated Bill'))
    || !!(props.invoice._mergedNote)
})

const orderIdByType = computed(() => {
  // For consolidated bills, extract order numbers from notes
  if (isConsolidatedBill.value) {
    const notes = props.invoice.notes || props.invoice._mergedNote || ''
    const match = notes.match(/Orders:\s*(.+)$/i)
    if (match) return match[1].trim()
  }
  // For simulated merged invoice from PaymentDialog
  const order = props.invoice.orders
  if (!order) return '—'
  // order_number might be comma-joined (e.g. "158, 157") from the simulated invoice
  return order.order_number || '—'
})

const orderTypeLabel = computed(() => {
  const type = props.invoice.orders?.order_type || ''
  const map = {
    delivery: 'DELIVERY',
    dine_in: 'DINE IN',
    takeaway: 'TAKEAWAY',
    table_order: 'DINE IN',
  }
  return map[type] || type.replace(/_/g, ' ').toUpperCase() || 'DINE IN'
})

const customerName = computed(() => {
  return props.invoice.customer_name || props.invoice.orders?.customer_name || ''
})

const customerPhone = computed(() => {
  return props.invoice.customer_phone || props.invoice.orders?.customer_phone || ''
})

const totalQty = computed(() => {
  return (props.invoice.invoice_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0)
})

const balanceAmount = computed(() => {
  const paid = (props.invoice.payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const due = parseFloat(props.invoice.grand_total || 0)
  return due - paid
})

const itemsSubtotal = computed(() => {
  return (props.invoice.invoice_items || []).reduce(
    (sum, item) => sum + parseFloat(item.total_price || 0),
    0,
  )
})

const invoiceDeliveryCharge = computed(() => {
  // From invoice directly
  if (props.invoice.delivery_charge && parseFloat(props.invoice.delivery_charge) > 0) {
    return parseFloat(props.invoice.delivery_charge)
  }
  // From the related order
  const order = props.invoice.orders
  if (order?.delivery_charge && parseFloat(order.delivery_charge) > 0) {
    return parseFloat(order.delivery_charge)
  }
  // Calculate from difference for delivery orders
  if (order?.order_type === 'delivery') {
    const sub = parseFloat(props.invoice.subtotal || itemsSubtotal.value)
    const grand = parseFloat(props.invoice.grand_total || 0)
    const diff = grand - sub
    return diff > 0 ? diff : 0
  }
  return 0
})

const deliveryAddress = computed(() => {
  return props.invoice.orders?.delivery_address || ''
})

const displayServiceCharge = computed(() => {
  // 1. From invoice directly
  if (parseFloat(props.invoice.service_charge || 0) > 0) {
    return parseFloat(props.invoice.service_charge)
  }
  // 2. From the related order
  const order = props.invoice.orders
  if (parseFloat(order?.service_charge || 0) > 0) {
    return parseFloat(order.service_charge)
  }
  // 3. Force calculate for Dine-in if we see the gap in total vs subtotal
  if (orderTypeLabel.value === 'DINE IN') {
    const sub = parseFloat(props.invoice.subtotal || itemsSubtotal.value)
    return sub * 0.1
  }
  return 0
})

function fmtNum(val) {
  return parseFloat(val || 0).toFixed(2)
}

function paymentMethodLabel(pmt) {
  return pmt.payment_methods?.name || pmt.payment_method_name || pmt.payment_method || 'Payment'
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  return `${date}  ${time}`
}

function getLogoBase64() {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve('')
    img.src = logoImage
  })
}

async function printReceipt() {
  if (!billRoot.value) return

  // Convert logo to base64 for print window
  const logoBase64 = await getLogoBase64()

  // Get the HTML content but replace the logo src with base64
  let content = billRoot.value.innerHTML
  if (logoBase64) {
    content = content.replace(/src="[^"]*"/, `src="${logoBase64}"`)
  }

  const printContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${props.invoice?.invoice_number || 'N/A'}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }

      @page {
        size: 80mm auto;
        margin: 0mm;
      }

      html {
        width: 80mm;
        margin: 0;
        padding: 0;
      }

      body {
        width: 80mm;
        max-width: 80mm;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff;
        color: #000;
        font-family: 'Courier New', Courier, monospace;
        font-size: 11px;
        line-height: 1.3;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .bill-print-wrap {
        width: 80mm;
        max-width: 80mm;
        padding: 2mm 3mm 8mm 3mm;
        overflow: hidden;
      }

      .bill-header { text-align: center; margin-bottom: 4px; }
      .bill-logo {
        width: 30mm;
        height: auto;
        margin: 0 auto 2px;
        display: block;
      }
      .restaurant-name {
        font-size: 9px;
        font-weight: bold;
        text-transform: uppercase;
        margin-bottom: 1px;
      }
      .restaurant-address { font-size: 8px; color: #333; margin-bottom: 1px; }
      .restaurant-tel { font-size: 8px; color: #333; }

      .bill-divider { border-top: 1px solid #000; margin: 4px 0; }
      .bill-divider-dashed { border-top: 1px dashed #888; margin: 3px 0; }

      .bill-meta { margin: 3px 0; }
      .meta-row {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        padding: 0.5px 0;
      }
      .meta-row-split { display: flex; justify-content: space-between; }
      .meta-label { color: #333; }
      .meta-value { font-weight: 600; }

      .items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .items-table thead tr th {
        font-size: 9px;
        font-weight: bold;
        padding: 1px 0;
        text-align: left;
      }
      .items-table thead tr th.col-amt { text-align: right; }
      .items-table thead tr th.col-qty { text-align: center; }
      .items-table tbody tr td {
        padding: 2px 0;
        font-size: 10px;
        vertical-align: top;
        word-break: break-word;
      }
      .col-desc { text-align: left; width: 55%; }
      .col-qty { text-align: center; width: 10%; }
      .col-amt { text-align: right; width: 35%; }
      .item-name { font-weight: 600; font-size: 10px; }
      .item-code-line { font-size: 9px; color: #555; }
      .total-value { text-align: right; font-variant-numeric: tabular-nums; }

      .totals-section { margin: 4px 0; }
      .total-row {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        padding: 1px 0;
      }
      .total-row-bold { font-weight: bold; font-size: 11px; }

      .customer-info { margin: 4px 0; font-size: 10px; }

      .bill-footer {
        text-align: center;
        font-size: 9px;
        color: #333;
        margin-top: 6px;
        line-height: 1.5;
      }
      .footer-thanks { font-weight: bold; font-size: 10px; margin-bottom: 2px; }
      .footer-web { font-size: 8px; color: #666; }
    </style>
  </head>
  <body onload="window.focus(); window.print(); setTimeout(() => window.close(), 500);">
    ${content}
  </body>
</html>`

  const printWin = window.open(
    '',
    '_blank',
    'width=320,height=700,toolbar=0,menubar=0,scrollbars=0,status=0',
  )
  if (!printWin) {
    alert('Print popup was blocked. Please allow popups for this site.')
    return
  }

  printWin.document.open()
  printWin.document.write(printContent)
  printWin.document.close()
}

defineExpose({ printReceipt })
</script>

<style>
/* These styles are intentionally NOT scoped — used for on-screen preview */

.bill-print-wrap {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  color: #000;
  background: #fff;
  width: 280px;
  margin: 0 auto;
  padding: 10px 8px;
  box-sizing: border-box;
  line-height: 1.4;
}

.bill-header {
  text-align: center;
  margin-bottom: 4px;
}

.bill-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 0 4px;
}

.bill-logo {
  width: 45px;
  height: auto;
  margin-bottom: 4px;
  display: block;
}

.restaurant-name {
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  text-transform: uppercase;
  margin-bottom: 2px;
  letter-spacing: 0.5px;
}

.restaurant-address {
  font-size: 8.5px;
  text-align: center;
  color: #222;
  margin-bottom: 1px;
}

.restaurant-tel {
  font-size: 8.5px;
  text-align: center;
  font-weight: 600;
  color: #222;
}

.bill-divider {
  border-top: 1px solid #000;
  margin: 4px 0;
}

.bill-divider-dashed {
  border-top: 1px dashed #888;
  margin: 3px 0;
}

.bill-meta {
  margin: 3px 0;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  padding: 0.5px 0;
}

.meta-row-split {
  display: flex;
  justify-content: space-between;
}

.meta-label {
  color: #333;
}

.meta-value {
  font-weight: 600;
}

/* Items table */
.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table thead tr th {
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
  padding: 1px 0;
  text-align: left;
}

.items-table thead tr th.col-amt {
  text-align: right;
}

.items-table thead tr th.col-qty {
  text-align: center;
}

.items-table tbody tr td {
  padding: 2px 0;
  font-size: 10px;
  vertical-align: top;
}

.col-desc {
  text-align: left;
  width: 55%;
}
.col-qty {
  text-align: center;
  width: 10%;
}
.col-amt {
  text-align: right;
  width: 35%;
}

.item-name {
  font-weight: 600;
  font-size: 10px;
}

.item-code-line {
  font-size: 9px;
  color: #555;
}

/* Totals */
.totals-section {
  margin: 4px 0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  padding: 1px 0;
}

.total-row-bold {
  font-weight: bold;
  font-size: 11px;
}

.total-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.customer-info {
  margin: 4px 0;
  font-size: 10px;
}

/* Footer */
.bill-footer {
  text-align: center;
  font-size: 9px;
  color: #333;
  margin-top: 6px;
  line-height: 1.5;
}

.footer-thanks {
  font-weight: bold;
  font-size: 10px;
  margin-bottom: 2px;
}

.footer-web {
  font-size: 8px;
  color: #666;
}

/* ── Print styles (fallback if using window.print() on main page) ── */
@media print {
  @page {
    size: 80mm auto;
    margin: 0mm;
  }

  body {
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body * {
    visibility: hidden;
  }

  #bill-print-template,
  #bill-print-template * {
    visibility: visible;
  }

  #bill-print-template {
    position: fixed;
    left: 0;
    top: 0;
    width: 80mm !important;
    max-width: 80mm !important;
    overflow: hidden;
  }
}
</style>
