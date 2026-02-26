<template>
  <q-page class="q-pa-md">
    <PageHeader title="Orders Management" subtitle="Track and manage orders in real-time">
      <template #actions>
        <!-- Waiter (accept-only) doesn't see History or New Order -->
        <q-btn
          v-if="!restrictions.ordersAcceptOnly"
          outline
          color="primary"
          icon="history"
          label="History"
        />
        <q-btn
          v-if="!restrictions.ordersAcceptOnly"
          color="primary"
          icon="add"
          label="New Order"
          to="/pos"
        />
      </template>
    </PageHeader>

    <!-- Waiter accept-only banner -->
    <q-banner
      v-if="restrictions.ordersAcceptOnly"
      class="bg-orange-9 text-white q-mb-md rounded-borders"
      dense
    >
      <template v-slot:avatar>
        <q-icon name="info" />
      </template>
      You are in <strong>accept-only</strong> mode. You can only accept pending orders.
    </q-banner>

    <!-- Filters -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3">
        <q-select
          v-model="filters.branch"
          :options="branchOptions"
          label="Branch"
          dense
          outlined
          dark
          options-dense
        >
          <template v-slot:prepend>
            <q-icon name="store" />
          </template>
        </q-select>
      </div>
      <div class="col-12 col-md-3">
        <q-select
          v-model="filters.source"
          :options="sourceOptions"
          label="Source"
          dense
          outlined
          dark
          options-dense
        >
          <template v-slot:prepend>
            <q-icon name="category" />
          </template>
        </q-select>
      </div>
      <div class="col-12 col-md-6">
        <q-input
          v-model="filters.search"
          placeholder="Search by Order ID or Table..."
          dense
          outlined
          dark
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="row q-col-gutter-md kanban-board">
      <div class="col-12 col-md-3" v-for="column in displayColumns" :key="column.id">
        <div class="column full-height bg-grey-10 rounded-borders q-pa-sm">
          <div class="row items-center justify-between q-mb-sm q-px-xs">
            <div class="text-subtitle1 text-weight-bold row items-center">
              <q-icon :name="column.icon" :color="column.color" class="q-mr-sm" />
              {{ column.title }}
            </div>
            <q-badge :color="column.color" text-color="white" rounded>
              {{ column.orders.length }}
            </q-badge>
          </div>

          <q-scroll-area class="col" style="height: calc(100vh - 280px)">
            <div v-if="column.orders.length === 0" class="text-center q-pa-md text-grey-6">
              No orders
            </div>
            <transition-group
              appear
              enter-active-class="animated fadeIn"
              leave-active-class="animated fadeOut"
            >
              <OrderKanbanCard
                v-for="order in column.orders"
                :key="order.id"
                :order="order"
                @view="viewOrder"
                @next-stage="advanceOrder"
              />
            </transition-group>
          </q-scroll-area>
        </div>
      </div>
    </div>

    <!-- Order Details Dialog -->
    <q-dialog v-model="detailsOpen">
      <q-card style="width: 700px; max-width: 80vw" class="bg-grey-9 text-white">
        <q-card-section>
          <div class="text-h6">Order Details - {{ selectedOrder?.id }}</div>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <div class="row q-mb-md">
            <div class="col-6">
              <div class="text-caption text-grey-5">Customer</div>
              <div class="text-body1">{{ selectedOrder?.customer }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Date</div>
              <div class="text-body1">{{ selectedOrder?.date }}</div>
            </div>
          </div>
          <div class="row q-mb-md">
            <div class="col-6">
              <div class="text-caption text-grey-5">Type</div>
              <div class="text-body1">{{ selectedOrder?.type }}</div>
            </div>
            <div class="col-6">
              <div class="text-caption text-grey-5">Table</div>
              <div class="text-body1">{{ selectedOrder?.table }}</div>
            </div>
          </div>

          <q-separator class="q-my-md" color="grey-8" />

          <div class="text-subtitle2 q-mb-sm">Items</div>
          <!-- Mock items list from string or specific structure -->
          <div v-if="selectedOrder" class="text-grey-4">
            {{ selectedOrder.items }}
          </div>

          <q-separator class="q-my-md" color="grey-8" />

          <div class="row justify-end">
            <div class="text-h6">Total: {{ selectedOrder?.total }}</div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="bg-grey-10">
          <!-- Waiter (accept-only) cannot cancel orders -->
          <q-btn
            v-if="selectedOrder?.status !== 'Cancelled' && !restrictions.ordersAcceptOnly"
            flat
            label="Cancel Order"
            color="red"
            v-close-popup
            @click="cancelOrder(selectedOrder)"
          />
          <q-btn flat label="Close" color="primary" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useOrderStore } from 'src/stores/orders'
import { useAuthStore } from 'src/stores/auth'
import { useRealtime } from 'src/composables/useRealtime'
import { useQuasar } from 'quasar'
import { getRoleRestrictions } from 'src/config/roles'
import PageHeader from 'components/common/PageHeader.vue'
import OrderKanbanCard from 'src/components/orders/OrderKanbanCard.vue'

const $q = useQuasar()

const orderStore = useOrderStore()
const authStore = useAuthStore()
const { subscribe, unsubscribeAll } = useRealtime()

/** Role-based restrictions (e.g. ordersAcceptOnly for waiters) */
const restrictions = computed(() => getRoleRestrictions(authStore.roles))

// --- State ---
const filters = ref({
  branch: 'All',
  source: 'All',
  search: '',
})
const detailsOpen = ref(false)
const selectedOrder = ref(null)

const branchOptions = computed(() => {
  const branches = authStore.branches.map((b) => b.branches?.name).filter(Boolean)
  return ['All', ...branches]
})

const sourceOptions = ['All', 'dine_in', 'takeaway', 'delivery', 'online']

// --- Lifecycle ---
onMounted(async () => {
  if (authStore.currentBranch) {
    await orderStore.fetchInitialOrders(authStore.currentBranch.id)
  }

  // Subscribe to Realtime changes
  const tables = ['orders', 'order_items', 'kot_tickets', 'kot_items']

  tables.forEach((table) => {
    subscribe(`${table}-channel`, { table }, (payload) => {
      orderStore.handleRealtimeEvent(table, payload.eventType, payload.new, payload.old)
    })
  })

  startTimer()
})

onUnmounted(() => {
  unsubscribeAll()
  if (timerInterval.value) clearInterval(timerInterval.value)
})

const timerInterval = ref(null)
const now = ref(Date.now())

function startTimer() {
  timerInterval.value = setInterval(() => {
    now.value = Date.now()
  }, 60000) // Update every minute
}

function getTimeAgo(createdAt) {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  const diffMs = now.value - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return `${Math.floor(diffHrs / 24)}d ago`
}

// --- Computed Columns ---
const filteredOrders = computed(() => {
  // Use activeOrders from store
  return orderStore.activeOrders.filter((order) => {
    // Filter by Branch (if selecting from UI, though we only fetch one branch currently)
    // If 'All' is selected, we show all loaded orders.
    // Since we fetch by currentBranch of the user, this filter might be redundant or local.
    // If the user has access to multiple branches, we might need to handle that.
    // For now, let's assume loaded orders are relevant.
    if (filters.value.branch !== 'All' && order.branch_name !== filters.value.branch) return true // Simplified, assuming backend filtering for now

    // Filter by Source
    if (filters.value.source !== 'All' && order.order_type !== filters.value.source) return false

    // Filter by Search
    if (filters.value.search) {
      const s = filters.value.search.toLowerCase()
      const matchesId = order.id.toLowerCase().includes(s) // ID is UUID, might check partial
      const matchesTable = order.table_id ? String(order.table_id).includes(s) : false
      // We might need to map table_id to table number if we had the table map handy
      if (!matchesId && !matchesTable) return false
    }

    return true
  })
})

const displayColumns = computed(() => {
  const cols = [
    { id: 'pending', title: 'Active Orders', icon: 'receipt', color: 'orange', orders: [] },
    { id: 'preparing', title: 'Preparing', icon: 'soup_kitchen', color: 'blue', orders: [] }, // maps to 'accepted', 'preparing'
    { id: 'ready', title: 'Ready', icon: 'check_circle', color: 'green', orders: [] },
    { id: 'completed', title: 'Completed', icon: 'done_all', color: 'grey', orders: [] }, // maps to served, invoiced, paid
  ]

  const processedOrders = filteredOrders.value.map((o) => {
    // Get items for display
    const fullOrder = orderStore.orderWithItems(o.id)
    const itemsText =
      fullOrder?.items?.map((i) => `${i.quantity}x ${i.menu_item_id}`).join(', ') ||
      'Loading items...'

    // Get table number
    const table = orderStore.tables.get(o.table_id)
    const tableNum = table ? table.table_number : '-'

    return {
      ...o,
      type: o.order_type, // Map database column to prop name
      items: itemsText, // Simplified for card display
      table: tableNum,
      timeAgo: getTimeAgo(o.created_at),
      total: o.total_amount,
    }
  })

  processedOrders.forEach((order) => {
    let colId = ''
    if (['pending', 'pending_waiter'].includes(order.status)) colId = 'pending'
    else if (['accepted', 'preparing'].includes(order.status)) colId = 'preparing'
    else if (order.status === 'ready') colId = 'ready'
    else if (['served', 'invoiced', 'paid'].includes(order.status)) colId = 'completed'

    const col = cols.find((c) => c.id === colId)
    if (col) {
      col.orders.push(order)
    }
  })

  return cols
})

// --- Actions ---
function viewOrder(order) {
  selectedOrder.value = orderStore.orderWithItems(order.id) || order
  detailsOpen.value = true
}

async function advanceOrder(order) {
  try {
    if (['pending', 'pending_waiter'].includes(order.status)) {
      await orderStore.updateOrderStatus(order.id, 'accepted')
      $q.notify({ type: 'positive', message: 'Order accepted' })
    } else if (order.status === 'ready') {
      // Waiter (accept-only) cannot mark as served
      if (restrictions.value.ordersAcceptOnly) {
        $q.notify({ type: 'warning', message: 'You can only accept pending orders' })
        return
      }
      await orderStore.updateOrderStatus(order.id, 'served')
      $q.notify({ type: 'positive', message: 'Order served' })
    }
  } catch (err) {
    console.error('Error updating order:', err)
    $q.notify({
      type: 'negative',
      message: `Failed: ${err.message || 'Unknown error'}`,
    })
  }
}

async function cancelOrder(order) {
  if (!order) return
  await orderStore.updateOrderStatus(order.id, 'cancelled')
}
</script>

<style scoped>
/* Remove specific height calculation to allow page scroll if needed,
   but for Kanban we usually want columns to scroll independently. */
/* Just ensuring it consumes available space */
/* Add custom styles here if needed */
</style>
