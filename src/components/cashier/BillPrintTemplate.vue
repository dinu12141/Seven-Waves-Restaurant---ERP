<template>
  <!-- Print-ready receipt. Use window.print() to trigger. -->
  <div class="bill-print-wrap" id="bill-print-template">
    <!-- ── Header ── -->
    <div class="bill-header">
      <div class="restaurant-name">{{ branchName || 'Restaurant' }}</div>
      <div v-if="branchAddress" class="restaurant-address">{{ branchAddress }}</div>
      <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
      <div class="bill-meta">
        <div class="meta-row">
          <span class="meta-label">Invoice #</span>
          <span class="meta-value">{{ invoice.invoice_number }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Order #</span>
          <span class="meta-value">{{ invoice.orders?.order_number }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Date</span>
          <span class="meta-value">{{ formatDate(invoice.created_at) }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Time</span>
          <span class="meta-value">{{ formatTime(invoice.created_at) }}</span>
        </div>
        <div v-if="tableNumber" class="meta-row">
          <span class="meta-label">Table</span>
          <span class="meta-value">{{ tableNumber }}</span>
        </div>
        <div v-if="invoice.orders?.profiles?.full_name" class="meta-row">
          <span class="meta-label">Waiter</span>
          <span class="meta-value">{{ invoice.orders.profiles.full_name }}</span>
        </div>
        <div v-if="invoice.customer_name" class="meta-row">
          <span class="meta-label">Customer</span>
          <span class="meta-value">{{ invoice.customer_name }}</span>
        </div>
      </div>
    </div>

    <!-- ── Divider ── -->
    <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

    <!-- ── Items ── -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-item">Item</th>
          <th class="col-qty">Qty</th>
          <th class="col-price">Price</th>
          <th class="col-total">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in invoice.invoice_items" :key="item.id">
          <td class="col-item">{{ item.menu_item_name }}</td>
          <td class="col-qty">{{ item.quantity }}</td>
          <td class="col-price">{{ fmtCurrency(item.unit_price) }}</td>
          <td class="col-total">{{ fmtCurrency(item.total_price) }}</td>
        </tr>
      </tbody>
    </table>

    <!-- ── Divider ── -->
    <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

    <!-- ── Totals ── -->
    <div class="totals-section">
      <div class="total-row">
        <span class="total-label">Subtotal</span>
        <span class="total-value">{{ fmtCurrency(invoice.subtotal) }}</span>
      </div>
      <div v-if="invoice.discount_total > 0" class="total-row discount-row">
        <span class="total-label">Discount</span>
        <span class="total-value">-{{ fmtCurrency(invoice.discount_total) }}</span>
      </div>
      <div v-if="invoice.tax_total > 0" class="total-row">
        <span class="total-label">Tax</span>
        <span class="total-value">{{ fmtCurrency(invoice.tax_total) }}</span>
      </div>
    </div>

    <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

    <div class="grand-total-row">
      <span class="grand-label">TOTAL</span>
      <span class="grand-value">{{ fmtCurrency(invoice.grand_total) }}</span>
    </div>

    <!-- ── Payment Methods ── -->
    <div v-if="invoice.payments?.length" class="payments-section">
      <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
      <div v-for="pmt in invoice.payments" :key="pmt.id" class="total-row">
        <span class="total-label">{{ pmt.payment_methods?.name || 'Payment' }}</span>
        <span class="total-value">{{ fmtCurrency(pmt.amount) }}</span>
      </div>
      <!-- Change calculation -->
      <div v-if="changeAmount > 0" class="total-row change-row">
        <span class="total-label">Change</span>
        <span class="total-value">{{ fmtCurrency(changeAmount) }}</span>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div class="bill-divider">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
    <div class="bill-footer">
      <div>Thank you for dining with us!</div>
      <div class="footer-powered">Powered by Seven Waves ERP</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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
})

const tableNumber = computed(() => {
  const t = props.invoice.orders?.restaurant_tables
  if (!t) return null
  return t.section ? `${t.section} – ${t.table_number}` : t.table_number
})

const changeAmount = computed(() => {
  const paid = (props.invoice.payments || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0)
  const due = parseFloat(props.invoice.grand_total || 0)
  return paid > due ? paid - due : 0
})

function fmtCurrency(val) {
  const num = parseFloat(val || 0).toFixed(2)
  return `${props.currencySymbol} ${num}`
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<style>
/* These styles are intentionally NOT scoped so they apply inside the print frame */

.bill-print-wrap {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  color: #000;
  background: #fff;
  width: 280px;
  margin: 0 auto;
  padding: 12px 8px;
  box-sizing: border-box;
  line-height: 1.5;
}

.restaurant-name {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 4px;
}

.restaurant-address {
  font-size: 10px;
  text-align: center;
  color: #444;
  margin-bottom: 6px;
}

.bill-divider {
  color: #888;
  font-size: 10px;
  margin: 6px 0;
  letter-spacing: -1px;
  overflow: hidden;
}

.bill-meta {
  margin: 6px 0;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.meta-label {
  color: #555;
}

.meta-value {
  font-weight: 600;
}

/* Items table */
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0;
}

.items-table thead tr th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #555;
  padding: 2px 0;
  border-bottom: 1px dashed #ccc;
}

.items-table tbody tr td {
  padding: 3px 0;
  font-size: 11px;
  vertical-align: top;
}

.col-item {
  text-align: left;
  width: 50%;
}
.col-qty {
  text-align: center;
  width: 10%;
}
.col-price {
  text-align: right;
  width: 20%;
}
.col-total {
  text-align: right;
  width: 20%;
}

/* Totals */
.totals-section {
  margin: 4px 0;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 1px 0;
}

.discount-row {
  color: #c00;
}

.change-row {
  color: #060;
  font-weight: bold;
}

.grand-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 15px;
  font-weight: bold;
  margin: 4px 0;
}

.grand-label,
.grand-value {
  letter-spacing: 0.5px;
}

/* Payments */
.payments-section {
  margin: 0;
}

/* Footer */
.bill-footer {
  text-align: center;
  font-size: 10px;
  color: #444;
  margin-top: 10px;
  line-height: 1.6;
}

.footer-powered {
  font-size: 9px;
  color: #aaa;
  margin-top: 2px;
}

/* ── Print styles ── */
@media print {
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
    width: 280px;
  }
  @page {
    size: 80mm auto;
    margin: 4mm;
  }
}
</style>
