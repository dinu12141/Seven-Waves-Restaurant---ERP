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
        placeholder="Search Table, KOT, Waiter, Customer..."
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
        v-else-if="filteredOrders.length === 0"
        class="column items-center justify-center q-pa-xl text-grey-6"
      >
        <q-icon name="upcoming" size="48px" style="opacity: 0.2" class="q-mb-sm" />
        <div class="text-caption">No orders found</div>
      </div>

      <div v-else class="q-gutter-y-xs q-pb-sm">
        <transition-group name="order-item">
          <div
            v-for="order in filteredOrders"
            :key="order.id"
            class="queue-card"
            :class="{
              'is-new': isNew(order),
              'status-ready': order.status === 'ready',
              'status-preparing': order.status === 'preparing',
              'status-accepted': order.status === 'accepted',
              'status-invoiced': order.status === 'invoiced',
            }"
            @click="onSelect(order)"
          >
            <!-- ── Card Header ── -->
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

            <!-- ── Table / Waiter row ── -->
            <div class="row items-center text-caption meta-row q-mb-xs">
              <q-icon name="table_restaurant" size="11px" class="q-mr-xs" />
              <span>{{ order.tableNumber || '—' }}</span>
              <span class="q-mx-xs text-grey-8">·</span>
              <q-icon name="person" size="11px" class="q-mr-xs" />
              <span>{{ order.waiterName || 'POS' }}</span>
              <template v-if="order.customer_name">
                <span class="q-mx-xs text-grey-8">·</span>
                <q-icon name="account_circle" size="11px" class="q-mr-xs" />
                <span>{{ order.customer_name }}</span>
              </template>
              <q-space />
              <span class="text-grey-7">{{ timeAgo(order.created_at) }}</span>
            </div>

            <!-- ── KOT Tickets ── -->
            <div v-if="order.kot_tickets && order.kot_tickets.length > 0" class="kot-section">
              <div
                v-for="kot in order.kot_tickets"
                :key="kot.id"
                class="kot-chip"
                :class="'kot-' + kot.status"
              >
                <q-icon name="kitchen" size="10px" class="q-mr-xs" />
                KOT #{{ kot.kot_number }}
                <span class="kot-status-dot" />
              </div>
            </div>

            <!-- ── Items summary ── -->
            <div class="row items-center justify-between q-mt-xs">
              <div class="items-summary text-grey-6">
                <q-icon name="fastfood" size="10px" class="q-mr-xs" />
                {{ order.order_items?.length || order.itemCount || 0 }} item(s)
              </div>
              <div class="total-val">
                LKR {{ parseFloat(order.total_amount || 0).toLocaleString() }}
              </div>
            </div>

            <!-- ── Tap to bill CTA ── -->
            <div class="tap-cta">
              <q-icon name="touch_app" size="11px" class="q-mr-xs" />
              Tap to open billing
            </div>
          </div>
        </transition-group>
      </div>
    </q-scroll-area>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useCashierStore } from 'src/stores/cashierStore'

const store = useCashierStore()

const emit = defineEmits(['select'])

// New orders logic: compare created_at with store.lastViewedAt
const isNew = (order) => {
  if (!order.created_at) return false
  return new Date(order.created_at) > new Date(store.lastViewedAt)
}

const filterStatus = ref('unpaid')
const searchQuery = ref('')
const filterOptions = computed(() => {
  const unpaid = store.billingOrders.filter((o) => o.payment_status !== 'paid').length
  const paid = store.billingOrders.filter((o) => o.payment_status === 'paid').length
  return [
    { label: `Unpaid (${unpaid})`, value: 'unpaid' },
    { label: `Paid (${paid})`, value: 'paid' },
  ]
})

const filteredOrders = computed(() => {
  let orders = store.billingOrders

  if (filterStatus.value === 'paid') {
    orders = orders.filter((o) => o.payment_status === 'paid')
  } else {
    orders = orders.filter((o) => o.payment_status !== 'paid')
  }

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    orders = orders.filter((o) => {
      if (o.tableNumber && String(o.tableNumber).toLowerCase().includes(q)) return true
      if (o.waiterName && String(o.waiterName).toLowerCase().includes(q)) return true
      if (o.customer_name && String(o.customer_name).toLowerCase().includes(q)) return true
      if (o.order_number && String(o.order_number).toLowerCase().includes(q)) return true
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

const newOrderCount = computed(() => {
  return store.billingOrders.filter(isNew).length
})

// Watch for purely new arrivals in real-time to trigger pulse effects
watch(
  () => store.billingOrders.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      // Logic for sounds or extra emphasis can go here
    }
  },
)

onMounted(() => {})

function onSelect(order) {
  // Clear new indicator when tapped
  // newIds.value.delete(order.id) // This line was commented out or removed in the original context, keeping it as is.
  emit('select', order)
}

function onRefresh() {
  store.fetchBillingQueue(true)
  store.markQueueAsRead()
}

function getStatusColor(status) {
  const map = {
    accepted: 'orange-9',
    preparing: 'blue-8',
    ready: 'green-8',
    served: 'teal-8',
    invoiced: 'indigo-8',
  }
  return map[status] || 'grey-8'
}

function getStatusIcon(status) {
  const map = {
    accepted: 'check_circle_outline',
    preparing: 'soup_kitchen',
    ready: 'room_service',
    served: 'done_all',
    invoiced: 'receipt_long',
  }
  return map[status] || 'circle'
}

function getStatusLabel(status) {
  const labels = {
    accepted: 'Accepted',
    preparing: 'Preparing',
    ready: 'Ready',
    served: 'Served',
    invoiced: 'Invoiced',
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

  &.status-invoiced {
    border-left: 3px solid #7c4dff;
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
