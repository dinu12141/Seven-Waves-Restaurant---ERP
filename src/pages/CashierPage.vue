<template>
  <q-page class="cashier-page">
    <!-- ── Header ── -->
    <div class="cashier-header">
      <div class="header-left">
        <div class="header-icon-wrap">
          <q-icon name="point_of_sale" size="22px" color="primary" />
        </div>
        <div>
          <div class="text-h6 cashier-title text-weight-bold">Cashier Station</div>
          <div class="text-caption text-grey-6">{{ branchName }} &nbsp;·&nbsp; {{ now }}</div>
        </div>
      </div>

      <div class="header-right">
        <q-btn
          flat
          dense
          round
          icon="refresh"
          color="grey-5"
          :loading="store.loading"
          @click="store.fetchBillingOrders()"
        >
          <q-tooltip>Refresh</q-tooltip>
        </q-btn>

        <!-- Summary chips -->
        <div class="stat-chips">
          <div class="stat-chip wip">
            <q-icon name="soup_kitchen" size="14px" class="q-mr-xs" />
            {{ store.wipCount }} WIP
          </div>
          <div class="stat-chip ready">
            <q-icon name="check_circle" size="14px" class="q-mr-xs" />
            {{ store.readyCount }} Ready
          </div>
          <div class="stat-chip invoiced">
            <q-icon name="receipt" size="14px" class="q-mr-xs" />
            {{ store.invoicedCount }} Invoiced
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab filter ── -->
    <div class="cashier-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="cashier-tab"
        :class="{ active: activeTab === tab.value }"
        @click="activeTab = tab.value"
      >
        <q-icon :name="tab.icon" size="14px" class="q-mr-xs" />
        {{ tab.label }}
        <span v-if="tabCount(tab.value) > 0" class="tab-count">{{ tabCount(tab.value) }}</span>
      </button>
    </div>

    <!-- ── Loading ── -->
    <div v-if="store.loading" class="center-state">
      <q-spinner-dots color="primary" size="40px" />
      <div class="text-grey-5 q-mt-sm text-caption">Loading billing queue...</div>
    </div>

    <!-- ── Empty ── -->
    <div v-else-if="filteredOrders.length === 0" class="center-state">
      <div class="empty-icon-wrap">
        <q-icon name="receipt_long" size="44px" color="grey-7" />
      </div>
      <div class="text-grey-5 text-subtitle2 q-mt-md">No orders to bill right now</div>
      <div class="text-grey-7 text-caption q-mt-xs">
        Orders appear here automatically once accepted by a waiter.
      </div>
    </div>

    <!-- ── Order Cards Grid ── -->
    <div v-else class="orders-grid">
      <transition-group name="order-card-anim" tag="div" class="orders-grid-inner">
        <div
          v-for="order in filteredOrders"
          :key="order.id"
          class="order-card"
          :class="['status-' + order.status]"
        >
          <!-- Status strip -->
          <div class="status-strip" :style="{ background: getStatusGradient(order.status) }" />

          <!-- Card header -->
          <div class="card-header">
            <div class="order-number">#{{ order.order_number }}</div>
            <div class="row items-center q-gutter-x-sm">
              <q-badge
                v-if="order.kot_tickets && order.kot_tickets.length > 0"
                color="amber-8"
                text-color="dark"
                class="status-chip shadow-1 letter-sp"
              >
                KOT #{{ order.kot_tickets[0].kot_number }}
              </q-badge>
              <q-chip
                dense
                :style="{ background: getStatusGradient(order.status) }"
                text-color="white"
                class="status-chip"
              >
                {{ statusLabel(order.status) }}
              </q-chip>
            </div>
          </div>

          <!-- Info rows -->
          <div class="card-info">
            <div class="info-row">
              <q-icon name="table_restaurant" size="13px" color="grey-6" />
              <span>{{ order.tableNumber }}</span>
              <span class="info-sep">·</span>
              <q-icon name="category" size="13px" color="grey-6" />
              <span class="text-capitalize">{{ (order.order_type || '').replace('_', '-') }}</span>
            </div>
            <div class="info-row">
              <q-icon name="person" size="13px" color="grey-6" />
              <span>{{ order.waiterName }}</span>
              <span class="info-sep">·</span>
              <q-icon name="schedule" size="13px" color="grey-6" />
              <span>{{ store.getTimeAgo(order.created_at) }}</span>
            </div>
            <div v-if="order.customer_name" class="info-row">
              <q-icon name="account_circle" size="13px" color="grey-6" />
              <span>{{ order.customer_name }}</span>
            </div>
          </div>

          <!-- Items preview -->
          <div class="items-preview">
            <span v-for="item in order.order_items.slice(0, 3)" :key="item.id" class="item-chip">
              {{ item.quantity }}× {{ item.name }}
            </span>
            <span v-if="order.order_items.length > 3" class="item-chip more">
              +{{ order.order_items.length - 3 }} more
            </span>
          </div>

          <!-- Amount -->
          <div class="card-amount-row">
            <div class="amount-label">Total</div>
            <div class="amount-value">LKR {{ parseFloat(order.total_amount || 0).toFixed(2) }}</div>
          </div>

          <div v-if="order.invoices?.length > 0" class="invoice-strip">
            <q-icon name="receipt" size="12px" class="q-mr-xs" />
            Invoice #{{ order.invoices[0].invoice_number }}
            <q-badge
              :color="order.invoices[0].payment_status === 'paid' ? 'green' : 'orange'"
              class="q-ml-xs"
              dense
            >
              {{ order.invoices[0].payment_status }}
            </q-badge>
          </div>

          <!-- ── Card Actions ── -->
          <div class="card-actions">
            <!-- Mark served (only for 'ready' orders) -->
            <q-btn
              v-if="order.status === 'ready'"
              flat
              no-caps
              dense
              icon="room_service"
              label="Served"
              size="sm"
              class="action-btn-secondary"
              @click.stop="markServed(order)"
            />

            <!-- Refund (only for paid orders not yet fully refunded) -->
            <q-btn
              v-if="['paid', 'completed'].includes(order.status) && order.payment_status !== 'refunded'"
              flat
              no-caps
              dense
              icon="undo"
              label="Refund"
              size="sm"
              color="orange-6"
              @click.stop="openRefund(order)"
            />

            <!-- View Invoice CTA -->
            <q-btn
              unelevated
              no-caps
              icon="visibility"
              label="View Invoice"
              size="sm"
              class="action-btn-primary"
              color="primary"
              :loading="store.processing && store.selectedOrderId === order.id"
              @click="openBill(order)"
            />
          </div>
        </div>
      </transition-group>
    </div>

    <!-- ── Invoice View Dialog (read-only) ── -->
    <InvoiceViewDialog v-model="invoiceViewOpen" :order="selectedOrder" />
    <!-- ── Bill Dialog (full payment flow) ── -->
    <BillDialog v-model="billDialogOpen" :order="selectedOrder" @paid="onOrderPaid" />
    <!-- ── Refund Dialog ── -->
    <RefundDialog v-model="refundDialogOpen" :order="selectedOrder" @refunded="onRefunded" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { useCashierStore } from 'src/stores/cashierStore'
import { useAuthStore } from 'src/stores/auth'
import BillDialog from 'src/components/cashier/BillDialog.vue'
import InvoiceViewDialog from 'src/components/cashier/InvoiceViewDialog.vue'
import RefundDialog from 'src/components/cashier/RefundDialog.vue'

const $q = useQuasar()
const store = useCashierStore()
const authStore = useAuthStore()

// ── State ──────────────────────────────────────────────────
const activeTab = ref('all')
const invoiceViewOpen = ref(false)
const billDialogOpen = ref(false)
const refundDialogOpen = ref(false)
const selectedOrder = ref(null)

const tabs = [
  { label: 'All', value: 'all', icon: 'list_alt' },
  { label: 'Preparing', value: 'preparing', icon: 'soup_kitchen' },
  { label: 'Ready', value: 'ready', icon: 'check_circle' },
  { label: 'Served', value: 'served', icon: 'room_service' },
  { label: 'Invoiced', value: 'invoiced', icon: 'receipt' },
]

// ── Computed ───────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'Branch')

const now = computed(() => {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
})

const filteredOrders = computed(() => {
  if (activeTab.value === 'all') return store.billingOrders
  if (activeTab.value === 'preparing') {
    return store.billingOrders.filter((o) => ['accepted', 'preparing'].includes(o.status))
  }
  return store.billingOrders.filter((o) => o.status === activeTab.value)
})

function tabCount(tab) {
  if (tab === 'all') return store.billingOrders.length
  if (tab === 'preparing') {
    return store.billingOrders.filter((o) => ['accepted', 'preparing'].includes(o.status)).length
  }
  return store.billingOrders.filter((o) => o.status === tab).length
}

// ── Actions ────────────────────────────────────────────────
function openBill(order) {
  selectedOrder.value = order
  store.selectedOrderId = order.id
  invoiceViewOpen.value = true
}

async function markServed(order) {
  $q.dialog({
    title: 'Mark as Served',
    message: `Mark Order #${order.order_number} as served?`,
    cancel: { flat: true, noCaps: true, color: 'grey-7' },
    ok: { unelevated: true, noCaps: true, color: 'teal', label: 'Mark Served' },
  }).onOk(async () => {
    try {
      await store.markServed(order.id)
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to update status' })
    }
  })
}

function onOrderPaid() {
  billDialogOpen.value = false
  selectedOrder.value = null
  store.selectedOrderId = null
}

function openRefund(order) {
  selectedOrder.value = order
  store.selectedOrderId = order.id
  refundDialogOpen.value = true
}

function onRefunded() {
  refundDialogOpen.value = false
  selectedOrder.value = null
  store.selectedOrderId = null
}

// ── Helpers ────────────────────────────────────────────────
function statusLabel(status) {
  const labels = {
    accepted: '♨️ Accepted',
    preparing: '👨‍🍳 Preparing',
    ready: '✅ Ready',
    served: '🍽️ Served',
    invoiced: '📄 Invoiced',
  }
  return labels[status] || status
}

function getStatusGradient(status) {
  const grads = {
    accepted: 'linear-gradient(135deg, #FFB300, #FFA000)',
    preparing: 'linear-gradient(135deg, #F57C00, #E65100)',
    ready: 'linear-gradient(135deg, #4CAF50, #66BB6A)',
    served: 'linear-gradient(135deg, #009688, #4DB6AC)',
    invoiced: 'linear-gradient(135deg, #1976D2, #42A5F5)',
  }
  return grads[status] || 'linear-gradient(135deg, #607D8B, #90A4AE)'
}

// ── Lifecycle ──────────────────────────────────────────────
onMounted(() => {
  store.initialize()
})

onUnmounted(() => {
  store.cleanup()
})
</script>

<style scoped>
.cashier-page {
  padding: 0;
  min-height: 100vh;
  background: var(--erp-bg-main, var(--q-color-background, #f5f5f5));
  display: flex;
  flex-direction: column;
}

/* ── Header ── */
.cashier-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  background: var(--erp-bg-card, #ffffff);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(33, 150, 243, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-chips {
  display: flex;
  gap: 8px;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
}

.stat-chip.wip {
  background: rgba(255, 152, 0, 0.15);
  color: #e65100;
  border: 1px solid rgba(255, 152, 0, 0.3);
}

.stat-chip.ready {
  background: rgba(76, 175, 80, 0.15);
  color: #2e7d32;
  border: 1px solid rgba(76, 175, 80, 0.3);
}

.stat-chip.invoiced {
  background: rgba(33, 150, 243, 0.15);
  color: #1565c0;
  border: 1px solid rgba(33, 150, 243, 0.3);
}

/* Dark mode overrides for stat chips */
:global(.body--dark) .stat-chip.wip    { color: #ffb74d; }
:global(.body--dark) .stat-chip.ready  { color: #66bb6a; }
:global(.body--dark) .stat-chip.invoiced { color: #42a5f5; }

/* ── Tabs ── */
.cashier-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  background: var(--erp-bg-card, #ffffff);
  flex-shrink: 0;
}

.cashier-tab {
  display: inline-flex;
  align-items: center;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--erp-text-muted, #6b7280);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 2px;
}

.cashier-tab:hover {
  color: var(--erp-text-primary, #111827);
  background: var(--erp-bg-hover, rgba(0,0,0,0.04));
}

.cashier-tab.active {
  color: #42a5f5;
  background: rgba(33, 150, 243, 0.1);
  border-color: rgba(33, 150, 243, 0.2);
}

.tab-count {
  background: rgba(33, 150, 243, 0.2);
  color: #42a5f5;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 4px;
}

/* ── Center state ── */
.center-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 4px;
}

.empty-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: var(--erp-bg-hover, rgba(0,0,0,0.04));
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Grid ── */
.orders-grid {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
}

.orders-grid-inner {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

/* ── Order Card ── */
.order-card {
  background: var(--erp-bg-card, #ffffff);
  border: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 0 0 10px;
  transition: all 0.2s ease;
  position: relative;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

.order-card:hover {
  border-color: var(--erp-border-hover, rgba(33,150,243,0.3));
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  transform: translateY(-2px);
}

.status-strip {
  height: 3px;
  width: 100%;
  flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 0;
}

.order-number {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--erp-text-primary, #111827);
  letter-spacing: -0.5px;
}

.status-chip {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.2px;
  padding: 0 8px;
  height: 20px;
}

.card-info {
  padding: 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--erp-text-muted, #6b7280);
}

.info-sep {
  color: var(--erp-border, rgba(0,0,0,0.2));
  margin: 0 2px;
}

/* Items preview */
.items-preview {
  padding: 0 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.item-chip {
  background: var(--erp-bg-hover, rgba(0,0,0,0.05));
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 0.6rem;
  color: var(--erp-text-secondary, #374151);
  border: 1px solid var(--erp-border, rgba(0,0,0,0.08));
}

.item-chip.more {
  color: var(--erp-text-muted, #9ca3af);
  font-style: italic;
}

/* Amount */
.card-amount-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 12px;
  margin-top: 0;
}

.amount-label {
  font-size: 0.58rem;
  color: var(--erp-text-muted, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.amount-value {
  font-size: 1rem;
  font-weight: 800;
  color: var(--erp-text-primary, #111827);
  font-variant-numeric: tabular-nums;
}

/* Invoice strip */
.invoice-strip {
  display: flex;
  align-items: center;
  margin: 0 14px;
  background: rgba(33, 150, 243, 0.08);
  border: 1px solid rgba(33, 150, 243, 0.2);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.68rem;
  color: var(--erp-text-secondary, #374151);
}

/* Actions */
.card-actions {
  display: flex;
  gap: 6px;
  padding: 0 12px;
  margin-top: auto;
}

.action-btn-secondary {
  flex: 0 0 auto;
  border: 1px solid var(--erp-border, rgba(0,0,0,0.1)) !important;
  border-radius: 8px !important;
  color: var(--erp-text-muted, #6b7280) !important;
  font-weight: 600;
  padding: 0 10px;
}

.action-btn-secondary:hover {
  background: var(--erp-bg-hover, rgba(0,0,0,0.04)) !important;
  color: var(--erp-text-primary, #111827) !important;
}

.action-btn-primary {
  flex: 1;
  border-radius: 8px !important;
  font-weight: 700;
}

/* ── Animations ── */
.order-card-anim-enter-active {
  transition: all 0.3s ease;
}
.order-card-anim-leave-active {
  transition: all 0.25s ease;
}
.order-card-anim-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}
.order-card-anim-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
/* ── Title theme ── */
.cashier-title {
  color: var(--erp-text-primary, #111827);
}
</style>
