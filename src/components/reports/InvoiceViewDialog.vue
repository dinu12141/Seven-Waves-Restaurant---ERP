<template>
  <q-dialog v-model="show" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="inv-dialog">
      <!-- ── Toolbar ──────────────────────────────── -->
      <q-toolbar class="inv-dialog__toolbar">
        <q-icon name="receipt_long" size="22px" class="q-mr-sm" />
        <q-toolbar-title class="inv-dialog__title">
          Invoice {{ invoice?.invoice_no || '' }}
        </q-toolbar-title>
        <q-btn flat dense round icon="print" @click="printInvoice">
          <q-tooltip>Print</q-tooltip>
        </q-btn>
        <q-btn flat dense round icon="close" @click="show = false" />
      </q-toolbar>

      <q-card-section v-if="loading" class="text-center q-pa-xl">
        <q-spinner-gears size="40px" color="primary" />
        <div class="q-mt-md text-grey">Loading invoice...</div>
      </q-card-section>

      <q-card-section v-else-if="!invoice" class="text-center q-pa-xl">
        <q-icon name="error_outline" size="48px" color="negative" />
        <div class="q-mt-md">Invoice not found</div>
      </q-card-section>

      <!-- ── Invoice Content ──────────────────────── -->
      <q-card-section v-else class="inv-dialog__body" id="invoice-print-area">
        <!-- Header -->
        <div class="inv-header">
          <div class="inv-header__left">
            <h2 class="inv-header__inv-no">{{ invoice.invoice_no }}</h2>
            <div class="inv-header__meta">
              <span><strong>Date:</strong> {{ fmtDateTime(invoice.created_at) }}</span>
              <span v-if="invoice.branches?.name"><strong>Branch:</strong> {{ invoice.branches.name }}</span>
            </div>
          </div>
          <div class="inv-header__right">
            <q-badge
              :color="invoice.payment_status === 'paid' ? 'green' : 'orange'"
              :label="(invoice.payment_status || 'pending').toUpperCase()"
              class="inv-status-badge"
            />
          </div>
        </div>

        <!-- Customer Info -->
        <div v-if="invoice.customer_name" class="inv-customer">
          <div><strong>Customer:</strong> {{ invoice.customer_name }}</div>
          <div v-if="invoice.customer_phone"><strong>Phone:</strong> {{ invoice.customer_phone }}</div>
        </div>

        <!-- Order Info -->
        <div class="inv-order-info">
          <span v-if="order"><strong>Order #:</strong> {{ order.order_number }}</span>
          <span v-if="order"><strong>Type:</strong> {{ fmtOrderType(order.order_type) }}</span>
          <span v-if="waiterName"><strong>Waiter:</strong> {{ waiterName }}</span>
          <span v-if="cashierName"><strong>Cashier:</strong> {{ cashierName }}</span>
        </div>

        <!-- Items Table -->
        <table class="inv-items-table">
          <thead>
            <tr>
              <th class="text-left">#</th>
              <th class="text-left">Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in orderItems" :key="item.id">
              <td>{{ idx + 1 }}</td>
              <td>{{ item.menu_items?.name || 'Item' }}</td>
              <td class="text-right">{{ item.quantity }}</td>
              <td class="text-right">{{ fmtN(item.unit_price) }}</td>
              <td class="text-right">{{ fmtN(item.total_price) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals -->
        <div class="inv-totals">
          <div class="inv-totals__row">
            <span>Subtotal</span>
            <span>{{ fmtN(invoice.subtotal || order?.subtotal || 0) }}</span>
          </div>
          <div v-if="Number(invoice.discount || order?.discount_amount || 0) > 0" class="inv-totals__row inv-totals__row--discount">
            <span>Discount</span>
            <span>-{{ fmtN(invoice.discount || order?.discount_amount || 0) }}</span>
          </div>
          <div v-if="Number(invoice.tax || order?.tax_amount || 0) > 0" class="inv-totals__row">
            <span>Tax</span>
            <span>{{ fmtN(invoice.tax || order?.tax_amount || 0) }}</span>
          </div>
          <div v-if="Number(invoice.service_charge || 0) > 0" class="inv-totals__row">
            <span>Service Charge</span>
            <span>{{ fmtN(invoice.service_charge) }}</span>
          </div>
          <div class="inv-totals__row inv-totals__row--grand">
            <span>Grand Total</span>
            <span>LKR {{ fmtN(invoice.grand_total || invoice.total || 0) }}</span>
          </div>
        </div>

        <!-- Payments -->
        <div v-if="payments.length" class="inv-payments">
          <h4>Payments</h4>
          <div v-for="p in payments" :key="p.id" class="inv-payments__row">
            <span>{{ p.payment_methods?.name || p.payment_method || 'Cash' }}</span>
            <span>{{ fmtDateTime(p.created_at) }}</span>
            <span class="text-weight-bold">LKR {{ fmtN(p.amount) }}</span>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { supabase } from 'src/boot/supabase'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  invoiceId: { type: [String, null], default: null },
  orderId: { type: [String, null], default: null },
})

const emit = defineEmits(['update:modelValue'])

const show = ref(false)
const loading = ref(false)
const invoice = ref(null)
const order = ref(null)
const orderItems = ref([])
const payments = ref([])
const waiterName = ref('')
const cashierName = ref('')

// Close handler
watch(show, (val) => {
  if (!val) emit('update:modelValue', false)
})

// ── Main trigger: load data when dialog opens ──────────────
watch(() => props.modelValue, async (val) => {
  show.value = val
  if (!val) return  // Dialog closing, do nothing

  // Reset state
  invoice.value = null
  order.value = null
  orderItems.value = []
  payments.value = []
  waiterName.value = ''
  cashierName.value = ''
  loading.value = true

  // Wait for Vue to settle ALL prop changes from parent
  await nextTick()
  await nextTick()

  const invId = props.invoiceId
  const ordId = props.orderId

  console.log('[InvoiceViewDialog] Dialog opened. invoiceId:', invId, 'orderId:', ordId)

  try {
    if (invId) {
      await loadByInvoiceId(invId)
    } else if (ordId) {
      await loadByOrderId(ordId)
    } else {
      console.warn('[InvoiceViewDialog] No invoiceId or orderId provided')
    }
  } catch (e) {
    console.error('[InvoiceViewDialog] Error:', e)
  } finally {
    loading.value = false
  }
})

async function loadByInvoiceId(id) {
  console.log('[InvoiceViewDialog] Loading invoice by ID:', id)
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      branches ( name ),
      payments ( id, amount, payment_method, created_at, payment_methods ( name ) )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[InvoiceViewDialog] Invoice query error:', error)
    // Fallback: try loading by order_id if we have one
    if (props.orderId) {
      await loadByOrderId(props.orderId)
    }
    return
  }

  invoice.value = data
  payments.value = data?.payments || []

  if (data?.order_id) await loadOrder(data.order_id)
  if (data?.cashier_id) await loadCashierName(data.cashier_id)
}

async function loadByOrderId(ordId) {
  console.log('[InvoiceViewDialog] Loading invoice by order ID:', ordId)

  // First try to find invoice for this order
  const { data: invArr, error: invErr } = await supabase
    .from('invoices')
    .select(`
      *,
      branches ( name ),
      payments ( id, amount, payment_method, created_at, payment_methods ( name ) )
    `)
    .eq('order_id', ordId)
    .limit(1)

  if (invErr) {
    console.error('[InvoiceViewDialog] Invoice by order query error:', invErr)
  }

  if (invArr && invArr.length > 0) {
    invoice.value = invArr[0]
    payments.value = invArr[0].payments || []
    if (invArr[0].cashier_id) await loadCashierName(invArr[0].cashier_id)
  }

  // Load order details (items etc.)
  await loadOrder(ordId)

  // If no invoice record found, create a virtual one from order data
  if (!invoice.value && order.value) {
    invoice.value = {
      invoice_no: order.value.order_number || 'N/A',
      created_at: order.value.created_at,
      payment_status: order.value.status === 'completed' ? 'paid' : order.value.status,
      subtotal: order.value.subtotal,
      discount: order.value.discount_amount,
      tax: order.value.tax_amount,
      service_charge: order.value.service_charge,
      grand_total: order.value.total_amount,
      total: order.value.total_amount,
    }
  }
}

async function loadOrder(ordId) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_number, order_type, status, subtotal, tax_amount, discount_amount,
      total_amount, service_charge, created_at,
      waiter:profiles!orders_waiter_id_fkey ( full_name ),
      order_items ( id, quantity, unit_price, total_price, menu_items ( name ) )
    `)
    .eq('id', ordId)
    .single()

  if (error) {
    console.error('[InvoiceViewDialog] Order query error:', error)
    return
  }

  if (data) {
    order.value = data
    orderItems.value = data.order_items || []
    waiterName.value = data.waiter?.full_name || ''
  }
}

async function loadCashierName(cashierId) {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', cashierId)
    .single()

  cashierName.value = data?.full_name || ''
}

function fmtN(val) {
  return Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtOrderType(t) {
  if (!t) return '—'
  return t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')
}

function printInvoice() {
  const printArea = document.getElementById('invoice-print-area')
  if (!printArea) return
  const w = window.open('', '_blank')
  w.document.write(`
    <html><head><title>Invoice ${invoice.value?.invoice_no || ''}</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 24px; color: #333; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th, td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
      th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 11px; }
      .text-right { text-align: right; }
      .text-left { text-align: left; }
      .inv-totals__row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
      .inv-totals__row--grand { font-weight: 700; font-size: 16px; border-top: 2px solid #333; margin-top: 8px; padding-top: 10px; }
      .inv-totals__row--discount { color: #e53935; }
      h2 { margin: 0 0 8px; }
    </style></head><body>
    ${printArea.innerHTML}
    </body></html>
  `)
  w.document.close()
  w.focus()
  w.print()
  w.close()
}
</script>

<style scoped lang="scss">
.inv-dialog {
  display: flex;
  flex-direction: column;
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
}

.inv-dialog__toolbar {
  background: #1a237e;
  color: #fff;
  min-height: 48px;
}

.inv-dialog__title {
  font-size: 16px;
  font-weight: 600;
}

.inv-dialog__body {
  padding: 24px 32px;
  overflow-y: auto;
}

.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e8eaf6;
}

.inv-header__inv-no {
  font-size: 22px;
  font-weight: 700;
  color: #1a237e;
  margin: 0 0 6px;
}

.inv-header__meta {
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: #546e7a;

  strong { color: #37474f; }
}

.inv-status-badge {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 600;
}

.inv-customer {
  background: #f5f5f5;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;

  div + div { margin-top: 4px; }
}

.inv-order-info {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 13px;
  color: #546e7a;
  margin-bottom: 20px;
  padding: 10px 0;
  border-bottom: 1px solid #eceff1;

  strong { color: #37474f; }
}

.inv-items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;

  th {
    padding: 10px 14px;
    background: #f5f5f5;
    font-weight: 600;
    text-transform: uppercase;
    font-size: 11px;
    color: #546e7a;
    border-bottom: 2px solid #e0e0e0;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid #eceff1;
    font-size: 13px;
  }

  tr:hover td {
    background: #fafafa;
  }
}

.inv-totals {
  margin: 20px 0;
  max-width: 320px;
  margin-left: auto;
}

.inv-totals__row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}

.inv-totals__row--grand {
  font-weight: 700;
  font-size: 17px;
  border-top: 2px solid #1a237e;
  margin-top: 8px;
  padding-top: 10px;
  color: #1a237e;
}

.inv-totals__row--discount {
  color: #e53935;
}

.inv-payments {
  margin-top: 24px;
  border-top: 1px solid #eceff1;
  padding-top: 16px;

  h4 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: #37474f;
  }
}

.inv-payments__row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 13px;
}
</style>
