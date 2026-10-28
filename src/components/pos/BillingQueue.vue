<template>
  <div class="billing-queue column full-height">
    <!-- ── Header ── -->
    <div class="queue-header q-pa-md row items-center justify-between">
      <div class="row items-center">
        <q-icon name="receipt_long" color="orange-8" size="20px" class="q-mr-sm" />
        <span class="text-subtitle1 text-white text-weight-bold">Billing Queue</span>
        <q-badge v-if="newOrderCount > 0" color="red" class="q-ml-sm pulse-badge">
          {{ newOrderCount }} NEW
        </q-badge>
      </div>
      <q-btn flat round dense icon="refresh" color="grey-5" @click="onRefresh" />
    </div>

    <q-separator color="grey-9" />

    <!-- ── Filter & Search tabs ── -->
    <div class="q-px-md q-pt-sm q-pb-xs column q-gutter-y-sm">
      <q-input
        v-model="searchQuery"
        dense
        outlined
        dark
        placeholder="Search Table, KOT#, Invoice#, Waiter, Customer..."
        class="search-input"
        clearable
      >
        <template v-slot:prepend>
          <q-icon name="search" color="grey-5" />
        </template>
      </q-input>

      <q-btn-toggle
        v-model="filterStatus"
        dense
        no-caps
        rounded
        toggle-color="primary"
        color="grey-9"
        text-color="grey-4"
        :options="filterOptions"
        class="filter-toggle"
        spread
      />
    </div>

    <!-- ── List ── -->
    <q-scroll-area class="col q-px-sm q-py-xs">
      <div v-if="store.loading" class="column items-center q-pa-xl">
        <q-spinner-dots color="primary" size="40px" />
      </div>

      <div
        v-else-if="displayItems.length === 0"
        class="column items-center justify-center q-pa-xl text-grey-6"
      >
        <q-icon name="upcoming" size="48px" style="opacity: 0.2" class="q-mb-sm" />
        <div class="text-caption">No orders found</div>
      </div>

      <div v-else class="q-gutter-y-xs q-pb-sm">
        <template v-for="item in displayItems" :key="item._key">
          <!-- ═══ TABLE GROUP — Multiple unpaid orders on same table ═══ -->
          <div v-if="item._type === 'table-group'" class="table-group-card">
            <div class="tg-header" @click="item._expanded = !item._expanded">
              <div class="tg-left">
                <q-icon name="table_restaurant" size="18px" color="orange-6" class="q-mr-xs" />
                <span class="tg-table-num">{{ item.tableNumber }}</span>
                <q-badge color="orange-9" dense class="q-ml-sm">
                  {{ item.orders.length }} orders
                </q-badge>
              </div>
              <div class="tg-right">
                <span class="tg-total">LKR {{ parseFloat(item.grandTotal).toLocaleString() }}</span>
                <q-icon
                  :name="item._expanded ? 'expand_less' : 'expand_more'"
                  size="18px"
                  color="grey-5"
                />
              </div>
            </div>

            <!-- Merge Billing Button -->
            <div class="tg-merge-row">
              <button class="merge-bill-btn" @click="$emit('merge-table', item)">
                <q-icon name="merge_type" size="14px" class="q-mr-xs" />
                Merge {{ item.orders.length }} Orders & Bill — LKR
                {{ parseFloat(item.grandTotal).toLocaleString() }}
              </button>
            </div>

            <!-- Expanded individual orders -->
            <div v-if="item._expanded" class="tg-orders">
              <div
                v-for="order in item.orders"
                :key="order.id"
                class="queue-card queue-card--grouped"
                :class="statusClass(order)"
                @click="onSelect(order)"
              >
                <div class="row items-center justify-between q-mb-xs">
                  <div class="row items-center q-gutter-x-xs">
                    <span class="order-num">#{{ order.order_number }}</span>
                    <div v-if="isNew(order)" class="new-dot" />
                  </div>
                  <q-badge :color="getStatusColor(order.status)" dense class="status-badge">
                    <q-icon :name="getStatusIcon(order.status)" size="10px" class="q-mr-xs" />
                    {{ getStatusLabel(order.status) }}
                  </q-badge>
                </div>
                <div class="row items-center justify-between">
                  <div class="items-summary text-grey-6">
                    <q-icon name="fastfood" size="10px" class="q-mr-xs" />
                    {{ order.order_items?.length || order.itemCount || 0 }} item(s)
                  </div>
                  <div class="total-val">
                    LKR {{ parseFloat(order.total_amount || 0).toLocaleString() }}
                  </div>
                </div>
                <div class="tap-cta">
                  <q-icon name="touch_app" size="11px" class="q-mr-xs" />
                  Tap to bill individually
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ SINGLE ORDER (no table group) ═══ -->
          <div v-else class="queue-card" :class="statusClass(item)" @click="onSelect(item)">
            <!-- Card Header -->
            <div class="row items-center justify-between q-mb-xs">
              <div class="row items-center q-gutter-x-xs">
                <span class="order-num">#{{ item.order_number }}</span>
                <div v-if="isNew(item)" class="new-dot" />
              </div>
              <q-badge :color="getStatusColor(item.status)" dense class="status-badge">
                <q-icon :name="getStatusIcon(item.status)" size="10px" class="q-mr-xs" />
                {{ getStatusLabel(item.status) }}
              </q-badge>
            </div>

            <!-- Table / Waiter row -->
            <div class="row items-center text-caption meta-row q-mb-xs">
              <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
              <span>{{ item.tableNumber || '—' }}</span>
              <span class="q-mx-xs text-grey-8">·</span>
              <q-icon :name="item.order_type === 'delivery' ? 'delivery_dining' : 'person'" size="11px" class="q-mr-xs" />
              <span>
                {{ 
                  item.delivery_source ? 'Delivery (' + item.delivery_source.toUpperCase() + ')' :
                  (item.order_source === 'website' ? 'Website Order' :
                  (item.order_source === 'qr' ? 'QR Order' :
                  (item.order_type === 'delivery' ? 'Delivery' : (item.waiterName || 'POS'))))
                }}
              </span>
              <template v-if="item.customer_name">
                <span class="q-mx-xs text-grey-8">·</span>
                <q-icon name="account_circle" size="11px" class="q-mr-xs" />
                <span>{{ item.customer_name }}</span>
              </template>
              <q-space />
              <span class="text-grey-7">{{ timeAgo(item.created_at) }}</span>
            </div>

            <!-- KOT Tickets -->
            <div v-if="item.kot_tickets && item.kot_tickets.length > 0" class="kot-section">
              <div
                v-for="kot in item.kot_tickets"
                :key="kot.id"
                class="kot-chip"
                :class="'kot-' + kot.status"
              >
                <q-icon name="kitchen" size="10px" class="q-mr-xs" />
                KOT #{{ kot.kot_number }}
                <span class="kot-status-dot" />
              </div>
            </div>

            <!-- Items summary -->
            <div class="row items-center justify-between q-mt-xs">
              <div class="items-summary text-grey-6">
                <q-icon name="fastfood" size="10px" class="q-mr-xs" />
                {{ item.order_items?.length || item.itemCount || 0 }} item(s)
              </div>
              <div class="total-val">
                LKR {{ parseFloat(item.total_amount || 0).toLocaleString() }}
              </div>
            </div>

            <!-- Tap CTA -->
            <div class="tap-cta">
              <q-icon
                :name="isPaid(item) ? 'receipt_long' : 'touch_app'"
                size="11px"
                class="q-mr-xs"
              />
              {{ isPaid(item) ? 'Tap to view receipt' : 'Tap to open billing' }}
            </div>
          </div>
        </template>
      </div>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { useCashierStore } from 'src/stores/cashierStore'

const store = useCashierStore()

const emit = defineEmits(['select', 'merge-table'])

// New orders logic: compare created_at with store.lastViewedAt
const isNew = (order) => {
  if (!order.created_at) return false
  return new Date(order.created_at) > new Date(store.lastViewedAt)
}

const filterStatus = ref('unpaid')
const searchQuery = ref('')
const isPaid = (o) => o.status === 'paid' || o.payment_status === 'paid'

const filterOptions = computed(() => {
  const paid = store.billingOrders.filter(isPaid).length
  const unpaid = store.billingOrders.filter((o) => !isPaid(o)).length
  return [
    { label: `Unpaid (${unpaid})`, value: 'unpaid' },
    { label: `Paid (${paid})`, value: 'paid' },
  ]
})

const filteredOrders = computed(() => {
  let orders = store.billingOrders

  if (filterStatus.value === 'paid') {
    orders = orders.filter(isPaid)
  } else {
    orders = orders.filter((o) => !isPaid(o))
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    orders = orders.filter((o) => {
      if (o.tableNumber && String(o.tableNumber).toLowerCase().includes(q)) return true
      if (o.waiterName && String(o.waiterName).toLowerCase().includes(q)) return true
      if (o.customer_name && String(o.customer_name).toLowerCase().includes(q)) return true
      if (o.order_number && String(o.order_number).toLowerCase().includes(q)) return true
      if (
        o.invoices &&
        o.invoices.some(
          (inv) => inv.invoice_number && String(inv.invoice_number).toLowerCase().includes(q),
        )
      )
        return true
      if (
        o.kot_tickets &&
        o.kot_tickets.some((k) => k.kot_number && String(k.kot_number).toLowerCase().includes(q))
      )
        return true
      return false
    })
  }

  return orders
})

/**
 * Group unpaid dine-in orders that share the same table_id into collapsible groups.
 * Paid orders are NEVER grouped (they're already settled).
 */
const displayItems = computed(() => {
  const orders = filteredOrders.value

  // Only group in the 'unpaid' tab
  if (filterStatus.value === 'paid') {
    return orders.map((o) => ({ ...o, _type: 'single', _key: o.id }))
  }

  // Build table groups
  const tableMap = new Map() // table_id → { orders, tableNumber, grandTotal }
  const ungrouped = []

  for (const o of orders) {
    // Only group dine_in orders with a table_id
    if (o.table_id && o.order_type === 'dine_in') {
      if (!tableMap.has(o.table_id)) {
        tableMap.set(o.table_id, {
          _type: 'table-group',
          _key: 'tg-' + o.table_id,
          _expanded: false,
          table_id: o.table_id,
          tableNumber: o.tableNumber || o.table_number || '—',
          orders: [],
          grandTotal: 0,
        })
      }
      const group = tableMap.get(o.table_id)
      group.orders.push(o)
      group.grandTotal += parseFloat(o.total_amount || 0)
    } else {
      ungrouped.push({ ...o, _type: 'single', _key: o.id })
    }
  }

  // Only show as a TABLE GROUP if there are 2+ orders on that table
  // Single-order tables are rendered normally
  const result = []

  for (const group of tableMap.values()) {
    if (group.orders.length >= 2) {
      // Make _expanded reactive
      result.push(reactive(group))
    } else {
      // Single order on this table → just show it normally
      result.push({ ...group.orders[0], _type: 'single', _key: group.orders[0].id })
    }
  }

  // Add ungrouped (delivery, takeaway, no table_id)
  result.push(...ungrouped)

  // Sort: table groups first (by most recent order), then singles by created_at desc
  result.sort((a, b) => {
    const aDate =
      a._type === 'table-group'
        ? Math.max(...a.orders.map((o) => new Date(o.created_at).getTime()))
        : new Date(a.created_at).getTime()
    const bDate =
      b._type === 'table-group'
        ? Math.max(...b.orders.map((o) => new Date(o.created_at).getTime()))
        : new Date(b.created_at).getTime()
    return bDate - aDate
  })

  return result
})

const newOrderCount = computed(() => {
  return store.billingOrders.filter(isNew).length
})

// Watch for purely new arrivals in real-time to trigger pulse effects
watch(
  () => store.billingOrders.length,
  () => {},
)

onMounted(() => {})

function statusClass(order) {
  return {
    'is-new': isNew(order),
    'status-ready': order.status === 'ready',
    'status-preparing': order.status === 'preparing',
    'status-accepted': order.status === 'accepted',
    'status-pending_waiter': order.status === 'pending_waiter',
    'status-invoiced': order.status === 'invoiced',
    'status-paid': order.status === 'paid',
  }
}

function onSelect(order) {
  emit('select', order)
}

function onRefresh() {
  store.fetchBillingQueue(true)
  store.markQueueAsRead()
}

function getStatusColor(status) {
  const map = {
    pending_waiter: 'blue-grey-7',
    accepted: 'orange-9',
    preparing: 'blue-8',
    ready: 'green-8',
    served: 'teal-8',
    invoiced: 'indigo-8',
    paid: 'green-9',
  }
  return map[status] || 'grey-8'
}

function getStatusIcon(status) {
  const map = {
    pending_waiter: 'hourglass_empty',
    accepted: 'check_circle_outline',
    preparing: 'soup_kitchen',
    ready: 'room_service',
    served: 'done_all',
    invoiced: 'receipt_long',
    paid: 'payments',
  }
  return map[status] || 'circle'
}

function getStatusLabel(status) {
  const labels = {
    pending_waiter: 'Pending',
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Served',
    invoiced: 'Invoiced',
    paid: 'Paid',
  }
  return labels[status] || status
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h ago` // queue spans 7 days
  return `${hrs}h ${mins % 60}m ago`
}
</script>

<style scoped lang="scss">
.billing-queue {
  background: #0e0e18;
  color: white;
}

.queue-header {
  background: rgba(255, 255, 255, 0.02);
}

/* New badge pulse animation */
.pulse-badge {
  animation: pulse-badge 1.4s ease-in-out infinite;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}
@keyframes pulse-badge {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.95);
  }
}

/* Filter toggle */
.filter-toggle {
  width: 100%;
  :deep(.q-btn) {
    font-size: 0.68rem;
    min-width: 0;
    flex: 1;
  }
}

/* ═══ TABLE GROUP CARD ═══ */
.table-group-card {
  background: rgba(245, 158, 11, 0.04);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-left: 3px solid #f59e0b;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.tg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(245, 158, 11, 0.06);
  }
}

.tg-left {
  display: flex;
  align-items: center;
}

.tg-table-num {
  font-weight: 800;
  font-size: 0.9rem;
  color: #fbbf24;
}

.tg-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tg-total {
  font-weight: 800;
  font-size: 0.88rem;
  color: #fb923c;
}

.tg-merge-row {
  padding: 0 10px 10px;
}

.merge-bill-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 10px 16px;
  border: 1px dashed rgba(245, 158, 11, 0.4);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  color: #fbbf24;
  font-size: 0.72rem;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.6);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(245, 158, 11, 0.15);
  }
}

.tg-orders {
  padding: 0 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.queue-card--grouped {
  padding: 8px 10px;
  border-radius: 8px;

  .order-num {
    font-size: 0.78rem;
  }
}

/* ── Queue Cards ── */
.queue-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(33, 150, 243, 0.35);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  &.is-new {
    border-color: rgba(255, 160, 0, 0.5);
    background: rgba(255, 160, 0, 0.05);
  }

  &.status-ready {
    border-left: 3px solid #4caf50;
  }

  &.status-preparing {
    border-left: 3px solid #2196f3;
  }

  &.status-accepted {
    border-left: 3px solid #ff9800;
  }

  &.status-pending_waiter {
    border-left: 3px solid #607d8b;
  }

  &.status-invoiced {
    border-left: 3px solid #7c4dff;
  }

  &.status-paid {
    border-left: 3px solid #4caf50;
    opacity: 0.8;
  }
}

.order-num {
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: -0.5px;
  color: #fff;
}

.new-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff9800;
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.2;
  }
}

.status-badge {
  font-size: 0.58rem;
  text-transform: uppercase;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.meta-row {
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.7rem;
}

/* KOT chips */
.kot-section {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.kot-chip {
  display: inline-flex;
  align-items: center;
  font-size: 0.62rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);

  &.kot-pending {
    border-color: rgba(255, 152, 0, 0.4);
    color: #ffb74d;
  }
  &.kot-accepted {
    border-color: rgba(255, 152, 0, 0.4);
    color: #ffb74d;
  }
  &.kot-preparing {
    border-color: rgba(33, 150, 243, 0.4);
    color: #64b5f6;
  }
  &.kot-ready {
    border-color: rgba(76, 175, 80, 0.4);
    color: #81c784;
  }
  &.kot-cancelled {
    opacity: 0.35;
    text-decoration: line-through;
  }
}

.kot-status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  margin-left: 5px;
}

.items-summary {
  font-size: 0.68rem;
}

.total-val {
  font-weight: 800;
  font-size: 0.82rem;
  color: #fb923c;
}

.tap-cta {
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.2);
  text-align: center;
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Transition animations */
.order-item-enter-active {
  transition: all 0.35s ease;
}
.order-item-leave-active {
  transition: all 0.25s ease;
}
.order-item-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.order-item-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
