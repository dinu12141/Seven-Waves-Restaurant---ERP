<template>
  <q-dialog v-model="isOpen" maximized transition-show="slide-up" transition-hide="slide-down">
    <div class="order-detail-fullscreen">
      <!-- ═══ TOP BAR ═══ -->
      <div class="detail-top-bar">
        <div class="top-left">
          <div class="topbar-icon-wrap">
            <q-icon name="receipt_long" size="18px" color="orange" />
          </div>
          <span class="top-title">Order #{{ orderData?.order_number || '...' }}</span>
          <q-badge :color="statusColor" class="q-ml-sm">{{ statusLabel }}</q-badge>
        </div>
        <div class="top-center">
          <q-btn-toggle
            v-model="activeTab"
            dense
            no-caps
            rounded
            toggle-color="primary"
            color="grey-9"
            text-color="grey-4"
            :options="[
              { label: 'Details', value: 'details', icon: 'info' },
              { label: 'KOT Tickets', value: 'kot', icon: 'soup_kitchen' },
              { label: 'Invoice', value: 'invoice', icon: 'receipt' },
            ]"
            class="tab-toggle"
          />
        </div>
        <div class="top-right">
          <q-btn flat round dense icon="close" color="grey-5" @click="isOpen = false" />
        </div>
      </div>

      <!-- ═══ LOADING ═══ -->
      <div v-if="loading" class="detail-loading">
        <q-spinner-dots size="48px" color="primary" />
        <div class="text-grey-5 q-mt-md">Loading order details...</div>
      </div>

      <!-- ═══ TAB: DETAILS ═══ -->
      <div v-else-if="activeTab === 'details'" class="detail-body">
        <div class="detail-content">
          <!-- Order Meta -->
          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-card-label">Order Type</div>
              <div class="meta-card-value">
                <q-icon :name="orderTypeIcon" class="q-mr-xs" />
                {{ orderTypeLabel }}
              </div>
            </div>
            <div class="meta-card">
              <div class="meta-card-label">Table</div>
              <div class="meta-card-value">
                {{ orderData?.restaurant_tables?.table_number || '—' }}
              </div>
            </div>
            <div class="meta-card">
              <div class="meta-card-label">Customer</div>
              <div class="meta-card-value">{{ orderData?.customer_name || 'Walk-in' }}</div>
            </div>
            <div class="meta-card">
              <div class="meta-card-label">Waiter</div>
              <div class="meta-card-value">{{ orderData?.waiter?.full_name || '—' }}</div>
            </div>
            <div class="meta-card">
              <div class="meta-card-label">Created</div>
              <div class="meta-card-value">{{ formatDateTime(orderData?.created_at) }}</div>
            </div>
            <div class="meta-card">
              <div class="meta-card-label">Source</div>
              <div class="meta-card-value">
                <q-badge :color="orderData?.order_source === 'website' ? 'purple' : 'teal'" dense>
                  {{ orderData?.order_source || 'pos' }}
                </q-badge>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <div class="items-section">
            <div class="section-header">
              <q-icon name="fastfood" class="q-mr-sm" color="orange" />
              Order Items ({{ items.length }})
            </div>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40px">#</th>
                  <th>Item</th>
                  <th style="width: 60px" class="text-center">Qty</th>
                  <th style="width: 100px" class="text-right">Price</th>
                  <th style="width: 100px" class="text-right">Total</th>
                  <th style="width: 80px" class="text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in items" :key="item.id">
                  <td class="text-grey-6">{{ idx + 1 }}</td>
                  <td>
                    <span class="item-name">{{
                      item.menu_items?.name || item.name || 'Item'
                    }}</span>
                    <div v-if="item.notes" class="item-notes">{{ item.notes }}</div>
                  </td>
                  <td class="text-center">{{ item.quantity }}</td>
                  <td class="text-right">{{ fmt(item.unit_price) }}</td>
                  <td class="text-right text-weight-bold">{{ fmt(item.total_price) }}</td>
                  <td class="text-center">
                    <q-badge :color="itemStatusColor(item.status)" dense>{{ item.status }}</q-badge>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Totals -->
            <div class="totals-section">
              <div class="total-row">
                <span>Subtotal</span>
                <span>LKR {{ fmt(orderData?.subtotal || orderData?.total_amount || 0) }}</span>
              </div>
              <div v-if="orderData?.discount_amount > 0" class="total-row discount">
                <span>Discount</span>
                <span>- LKR {{ fmt(orderData.discount_amount) }}</span>
              </div>
              <div v-if="orderData?.delivery_charge > 0" class="total-row">
                <span>Delivery</span>
                <span>LKR {{ fmt(orderData.delivery_charge) }}</span>
              </div>
              <div class="total-row grand-total">
                <span>Total</span>
                <span>LKR {{ fmt(orderData?.total_amount || 0) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ TAB: KOT TICKETS ═══ -->
      <div v-else-if="activeTab === 'kot'" class="detail-body">
        <div class="detail-content">
          <div v-if="kotTickets.length === 0" class="empty-state">
            <q-icon name="soup_kitchen" size="64px" style="opacity: 0.15" />
            <div class="text-grey-6 q-mt-md">No KOT tickets for this order</div>
          </div>
          <div v-else class="kot-grid">
            <div v-for="kot in kotTickets" :key="kot.id" class="kot-card">
              <div class="kot-card-header">
                <div class="kot-card-title">
                  <q-icon name="kitchen" size="18px" class="q-mr-sm" />
                  KOT #{{ kot.kot_number }}
                </div>
                <q-badge :color="kotStatusColor(kot.status)" dense>{{ kot.status }}</q-badge>
              </div>
              <div class="kot-card-meta">
                <span v-if="kot.kitchen_name">
                  <q-icon name="storefront" size="12px" class="q-mr-xs" />
                  {{ kot.kitchen_name }}
                </span>
                <span>
                  <q-icon name="schedule" size="12px" class="q-mr-xs" />
                  {{ formatDateTime(kot.created_at) }}
                </span>
              </div>
              <div class="kot-items-list">
                <div v-for="ki in kot.items" :key="ki.id" class="kot-item-row">
                  <span class="kot-item-qty">{{ ki.quantity }}x</span>
                  <span class="kot-item-name">{{ ki.item_name || 'Item' }}</span>
                  <q-badge
                    v-if="ki.status && ki.status !== 'queued'"
                    :color="kotStatusColor(ki.status)"
                    dense
                    size="sm"
                  >
                    {{ ki.status }}
                  </q-badge>
                </div>
              </div>
              <div class="kot-card-actions">
                <button class="kot-print-btn" @click="printKot(kot)">
                  <q-icon name="print" size="14px" />
                  Print
                </button>
                <button class="kot-download-btn" @click="downloadKot(kot)">
                  <q-icon name="download" size="14px" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ TAB: INVOICE ═══ -->
      <div v-else-if="activeTab === 'invoice'" class="detail-body">
        <div class="detail-content">
          <div v-if="!invoiceData && !invoiceLoading" class="empty-state">
            <q-icon name="receipt" size="64px" style="opacity: 0.15" />
            <div class="text-grey-6 q-mt-md">No invoice generated yet</div>
            <div class="text-caption text-grey-7 q-mt-xs">
              Invoice is created when the order is billed
            </div>
          </div>
          <div v-else-if="invoiceLoading" class="empty-state">
            <q-spinner-dots size="40px" color="primary" />
            <div class="text-grey-5 q-mt-md">Loading invoice...</div>
          </div>
          <div v-else class="invoice-view-container">
            <div class="invoice-preview-scroll">
              <BillPrintTemplate
                ref="invoicePrintRef"
                :invoice="invoiceData"
                :branch-name="branchName"
              />
            </div>
            <div class="invoice-actions-bar">
              <button class="inv-act-btn inv-print-btn" @click="printInvoice">
                <q-icon name="print" size="18px" />
                Print Invoice
              </button>
              <button class="inv-act-btn inv-download-btn" @click="downloadInvoice">
                <q-icon name="download" size="18px" />
                Download
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { useCashierStore } from 'src/stores/cashierStore'
import BillPrintTemplate from 'src/components/cashier/BillPrintTemplate.vue'

const props = defineProps({
  modelValue: Boolean,
  orderId: String,
  defaultTab: { type: String, default: 'details' },
})

const emit = defineEmits(['update:modelValue'])

const authStore = useAuthStore()
const cashierStore = useCashierStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const activeTab = ref('details')
const loading = ref(false)
const orderData = ref(null)
const items = ref([])
const kotTickets = ref([])
const invoiceData = ref(null)
const invoiceLoading = ref(false)
const invoicePrintRef = ref(null)

const branchName = computed(() => authStore.currentBranch?.name || 'Restaurant')

// ── Status helpers ──
const statusLabel = computed(() => {
  const s = orderData.value?.status || ''
  return (
    {
      pending_waiter: 'Pending',
      accepted: 'Accepted',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Served',
      invoiced: 'Invoiced',
      paid: 'Paid',
      cancelled: 'Cancelled',
    }[s] || s
  )
})

const statusColor = computed(() => {
  const s = orderData.value?.status || ''
  return (
    {
      pending_waiter: 'orange',
      pending: 'orange',
      accepted: 'blue',
      preparing: 'blue',
      ready: 'green',
      served: 'teal',
      invoiced: 'indigo',
      paid: 'green-8',
      cancelled: 'red',
    }[s] || 'grey'
  )
})

const orderTypeLabel = computed(() => {
  const t = orderData.value?.order_type || ''
  return { dine_in: 'Dine In', takeaway: 'Takeaway', delivery: 'Delivery' }[t] || t
})

const orderTypeIcon = computed(() => {
  const t = orderData.value?.order_type || ''
  return (
    { dine_in: 'table_restaurant', takeaway: 'takeout_dining', delivery: 'delivery_dining' }[t] ||
    'restaurant'
  )
})

function itemStatusColor(status) {
  return (
    { queued: 'grey', preparing: 'blue', ready: 'green', served: 'teal', cancelled: 'red' }[
      status
    ] || 'grey'
  )
}

function kotStatusColor(status) {
  return (
    {
      pending: 'orange',
      accepted: 'blue',
      preparing: 'blue-8',
      ready: 'green',
      completed: 'teal',
      cancelled: 'red',
    }[status] || 'grey'
  )
}

// ── Fetch full order data via SECURITY DEFINER RPC (bypasses RLS) ──
async function fetchOrderDetails(orderId) {
  if (!orderId) return
  loading.value = true
  // activeTab is set by the watch() before this is called — do NOT reset here
  orderData.value = null
  items.value = []
  kotTickets.value = []
  invoiceData.value = null

  try {
    const { data: result, error: rpcError } = await supabase.rpc('get_order_full_details', {
      p_order_id: orderId,
    })

    if (rpcError) {
      console.error('[OrderDetailDialog] RPC error:', rpcError)
      throw rpcError
    }

    if (!result?.success) {
      console.error('[OrderDetailDialog] RPC failed:', result?.error)
      return
    }

    // ── Map order data ──
    const order = result.order
    order.restaurant_tables = order.table_number
      ? { table_number: order.table_number, section: order.table_section }
      : null
    order.waiter = result.creator?.full_name ? result.creator : null
    orderData.value = order

    // ── Map items (RPC gives menu_item_name directly) ──
    items.value = (result.items || []).map((i) => ({
      ...i,
      menu_items: { name: i.menu_item_name },
    }))

    // ── Map KOT tickets (RPC gives kitchen_name + items with item_name) ──
    kotTickets.value = (result.kot_tickets || []).map((kot) => ({
      ...kot,
      // items already have item_name from the RPC
    }))

    // ── Invoice ──
    if (result.invoice) {
      fetchInvoice(result.invoice.id)
    } else {
      // Build invoice view from order data (no formal invoice exists)
      buildInvoiceFromOrder(order, items.value)
    }
  } catch (err) {
    console.error('[OrderDetailDialog] Error fetching order:', err)
  } finally {
    loading.value = false
  }
}

// ── Build invoice data from order when no formal invoice exists ──
function buildInvoiceFromOrder(order, orderItemsList) {
  if (!order) return
  invoiceData.value = {
    id: order.id,
    invoice_number: `INV-${order.order_number || '000'}`,
    order_id: order.id,
    customer_name: order.customer_name || 'Walk-in',
    customer_phone: order.customer_phone || '',
    created_at: order.created_at,
    subtotal: parseFloat(order.subtotal || order.total_amount || 0),
    tax_amount: parseFloat(order.tax_amount || 0),
    discount_amount: parseFloat(order.discount_amount || 0),
    delivery_charge: parseFloat(order.delivery_charge || 0),
    total_amount: parseFloat(order.total_amount || 0),
    grand_total: parseFloat(order.total_amount || 0),
    payment_status: order.payment_status || 'unpaid',
    payments: [],
    // BillPrintTemplate uses invoice.orders.* for order-level fields
    orders: {
      order_type: order.order_type,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      pax: order.pax || 1,
      restaurant_tables: order.restaurant_tables || null,
      kot_tickets: kotTickets.value.map((k) => ({ kot_number: k.kot_number })),
      waiter: order.waiter || null,
      delivery_address: order.delivery_address || null,
    },
    // BillPrintTemplate loops over invoice_items
    invoice_items: orderItemsList.map((i) => ({
      id: i.id,
      menu_item_name: i.menu_items?.name || 'Item',
      quantity: i.quantity,
      unit_price: parseFloat(i.unit_price || 0),
      total_price: parseFloat(i.total_price || 0),
    })),
  }
}

async function fetchInvoice(invoiceId) {
  invoiceLoading.value = true
  try {
    const data = await cashierStore.fetchInvoiceDetails(invoiceId)
    invoiceData.value = data
  } catch (err) {
    console.error('[OrderDetailDialog] Error fetching invoice:', err)
  } finally {
    invoiceLoading.value = false
  }
}

// ── Watch for dialog open ──
watch(
  () => [props.modelValue, props.orderId],
  ([open, id]) => {
    if (open && id) {
      // Check for tab hint from parent
      if (window.__orderDetailTab) {
        activeTab.value = window.__orderDetailTab
        window.__orderDetailTab = null
      } else {
        activeTab.value = props.defaultTab || 'details'
      }
      fetchOrderDetails(id)
    }
  },
)

// ── Format helpers ──
function fmt(val) {
  return parseFloat(val || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatDateTime(dt) {
  if (!dt) return '—'
  const d = new Date(dt)
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

// ── Print / Download ──
function printKot(kot) {
  const printWindow = window.open('', '_blank', 'width=380,height=600')
  const kotHtml = buildKotHtml(kot)
  printWindow.document.write(kotHtml)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => printWindow.print(), 300)
}

function downloadKot(kot) {
  // Open styled print window — browser "Save as PDF" uses the title as filename
  const filename = `KOT-${kot.kot_number || 'N'}-Order-${orderData.value?.order_number || 'N'}`
  const kotHtml = buildKotHtml(kot, filename)
  const printWindow = window.open('', '_blank', 'width=380,height=600')
  printWindow.document.write(kotHtml)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 400)
}

function buildKotHtml(kot, title) {
  const itemsHtml = (kot.items || [])
    .map(
      (ki) =>
        `<tr><td style="padding:4px 0;font-size:16px;font-weight:700">${ki.quantity}x</td>
     <td style="padding:4px 8px;font-size:16px">${ki.item_name || 'Item'}</td></tr>`,
    )
    .join('')

  return `<!DOCTYPE html><html><head>
    <title>${title || `KOT #${kot.kot_number}`}</title>
    <style>
      body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 16px; color: #000; }
      .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
      .header h2 { margin: 0; font-size: 20px; }
      .meta { font-size: 12px; margin-bottom: 8px; }
      .meta div { padding: 2px 0; }
      table { width: 100%; border-collapse: collapse; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      @media print { body { width: 100%; } }
    </style>
  </head><body>
    <div class="header">
      <h2>KITCHEN ORDER TICKET</h2>
      <div style="font-size:24px;font-weight:900">KOT #${kot.kot_number}</div>
    </div>
    <div class="meta">
      <div><strong>Kitchen:</strong> ${kot.kitchen_name || '—'}</div>
      <div><strong>Order:</strong> #${orderData.value?.order_number || '—'}</div>
      <div><strong>Table:</strong> ${orderData.value?.restaurant_tables?.table_number || '—'}</div>
      <div><strong>Type:</strong> ${orderTypeLabel.value}</div>
      <div><strong>Time:</strong> ${formatDateTime(kot.created_at)}</div>
    </div>
    <div class="divider"></div>
    <table>${itemsHtml}</table>
    <div class="divider"></div>
    <div style="text-align:center;font-size:11px;color:#666;margin-top:8px">
      Seven Waves Restaurant POS
    </div>
  </body></html>`
}

async function printInvoice() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 150))
  if (invoicePrintRef.value?.printReceipt) {
    invoicePrintRef.value.printReceipt()
  }
}

async function downloadInvoice() {
  await nextTick()
  await new Promise((r) => setTimeout(r, 300))

  // Get the rendered BillPrintTemplate element
  const el = invoicePrintRef.value?.$el
  if (!el) {
    console.error('[OrderDetailDialog] Invoice element not found for PDF')
    return
  }

  const invNum = invoiceData.value?.invoice_number || 'INV'
  const orderNum = orderData.value?.order_number || 'N'
  const filename = `Invoice-${invNum}-Order-${orderNum}`

  // Clone the invoice HTML and render in a print window
  const clone = el.cloneNode(true)
  // Build a standalone HTML document with inline styles
  const printWindow = window.open('', '_blank', 'width=380,height=700')
  printWindow.document.write(`<!DOCTYPE html><html><head>
    <title>${filename}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Courier New', monospace; margin: 0; padding: 8px; background: #fff; color: #000; width: 80mm; }
      .bill-print-wrap { background: #fff; color: #000; }
      .bill-header { text-align: center; padding: 8px 0; }
      .bill-logo { width: 80px; height: auto; margin-bottom: 4px; }
      .restaurant-name { font-weight: 900; font-size: 12px; letter-spacing: 1px; }
      .restaurant-address, .restaurant-tel { font-size: 10px; }
      .bill-divider { border-top: 1px solid #000; margin: 4px 0; }
      .bill-divider-dashed { border-top: 1px dashed #000; margin: 4px 0; }
      .bill-meta { font-size: 11px; }
      .meta-row { display: flex; justify-content: space-between; padding: 1px 0; }
      .meta-row-split { display: flex; justify-content: space-between; }
      .meta-label { font-weight: 700; }
      .items-table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .items-table th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; padding: 2px 0; }
      .items-table td { padding: 2px 0; vertical-align: top; }
      .col-desc { width: 60%; }
      .col-qty { width: 15%; text-align: center; }
      .col-amt { width: 25%; text-align: right; }
      .item-name { font-size: 11px; }
      .item-code-line { font-size: 9px; color: #666; }
      .totals-section { font-size: 11px; }
      .total-row { display: flex; justify-content: space-between; padding: 1px 0; }
      .total-row-bold { font-weight: 900; font-size: 13px; border-top: 1px solid #000; padding-top: 4px; }
      .bill-footer { text-align: center; font-size: 9px; padding: 8px 0; }
      .order-type-value { font-weight: 700; }
      @media print { body { width: 100%; margin: 0; } }
    </style>
  </head><body>`)
  printWindow.document.write(clone.outerHTML)
  printWindow.document.write('</body></html>')
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 400)
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════
   Order Detail Fullscreen
   ═══════════════════════════════════════════════════════════ */

.order-detail-fullscreen {
  width: 100vw;
  height: 100vh;
  background: #0d0d14;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e5e7eb;
}

/* ── Top Bar ── */
.detail-top-bar {
  height: 52px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}
.top-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.topbar-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 152, 0, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.top-title {
  color: #fff;
  font-weight: 700;
  font-size: 16px;
}
.top-center {
  display: flex;
  align-items: center;
}
.top-right {
  display: flex;
  align-items: center;
}

.tab-toggle {
  :deep(.q-btn) {
    font-size: 0.75rem;
    min-width: 0;
    padding: 6px 14px;
  }
}

/* ── Loading ── */
.detail-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* ── Body ── */
.detail-body {
  flex: 1;
  overflow-y: auto;
}
.detail-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

/* ── Meta Grid ── */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.meta-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 14px 16px;
}
.meta-card-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.meta-card-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

/* ── Items Section ── */
.items-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  overflow: hidden;
}
.section-header {
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}
.items-table th {
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 1px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.items-table td {
  padding: 10px 12px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.item-name {
  font-weight: 600;
  color: #f3f4f6;
}
.item-notes {
  font-size: 11px;
  color: #f59e0b;
  margin-top: 2px;
  font-style: italic;
}

/* ── Totals ── */
.totals-section {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}
.total-row {
  display: flex;
  justify-content: space-between;
  width: 250px;
  font-size: 13px;
  color: #d1d5db;
}
.total-row.discount {
  color: #f87171;
}
.total-row.grand-total {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 8px;
  margin-top: 4px;
}

/* ── Empty State ── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

/* ═══ KOT Cards ═══ */
.kot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}
.kot-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}
.kot-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.kot-card-title {
  font-weight: 700;
  font-size: 15px;
  color: #fff;
  display: flex;
  align-items: center;
}
.kot-card-meta {
  padding: 8px 16px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #9ca3af;
}
.kot-items-list {
  padding: 8px 16px 12px;
}
.kot-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}
.kot-item-qty {
  font-weight: 800;
  font-size: 14px;
  color: #f59e0b;
  min-width: 28px;
}
.kot-item-name {
  font-size: 13px;
  color: #e5e7eb;
  flex: 1;
}
.kot-card-actions {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.kot-print-btn,
.kot-download-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: transparent;
  color: #d1d5db;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.kot-print-btn:hover {
  background: rgba(30, 64, 175, 0.2);
  border-color: #1e40af;
  color: #93c5fd;
}
.kot-download-btn:hover {
  background: rgba(5, 150, 105, 0.15);
  border-color: #059669;
  color: #6ee7b7;
}

/* ═══ Invoice View ═══ */
.invoice-view-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.invoice-preview-scroll {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 20px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.invoice-actions-bar {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.inv-act-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  letter-spacing: 0.5px;
}
.inv-print-btn {
  background: #1e40af;
  color: #fff;
}
.inv-print-btn:hover {
  background: #2563eb;
}
.inv-download-btn {
  background: #059669;
  color: #fff;
}
.inv-download-btn:hover {
  background: #047857;
}
</style>
