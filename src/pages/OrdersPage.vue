<template>
  <q-page class="q-pa-md">
    <PageHeader title="Orders Management" subtitle="Track and manage orders in real-time">
      <template #actions>
        <q-btn outline color="primary" icon="history" label="History" />
        <q-btn color="primary" icon="add" label="New Order" to="/pos" />
      </template>
    </PageHeader>

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
          <q-btn
            v-if="selectedOrder?.status !== 'Cancelled'"
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
import PageHeader from 'components/common/PageHeader.vue'
import OrderKanbanCard from 'src/components/orders/OrderKanbanCard.vue'
import { mockOrders } from 'src/data/mock'

// --- State ---
const orders = ref([])
const filters = ref({
  branch: 'All',
  source: 'All',
  search: '',
})
const detailsOpen = ref(false)
const selectedOrder = ref(null)

const branchOptions = ['All', 'Main Branch', 'Downtown', 'Mall Outlet']
const sourceOptions = ['All', 'Dine-in', 'Takeaway', 'Delivery']

// --- Setup Mock Data ---
onMounted(() => {
  // Enhance mock orders with status needed for Kanban if not present
  // and simulate 'branch' for filtering
  orders.value = mockOrders.map((o) => ({
    ...o,
    branch: ['Main Branch', 'Downtown', 'Mall Outlet'][Math.floor(Math.random() * 3)],
    // Ensure status is valid for our columns
    status: validateStatus(o.status),
    createdAt: new Date(o.date), // Ensure we have a date object
  }))

  // Start timer to update "timeAgo"
  startTimer()
})

const timerInterval = ref(null)
const now = ref(Date.now())

function startTimer() {
  timerInterval.value = setInterval(() => {
    now.value = Date.now()
  }, 60000) // Update every minute
}

onUnmounted(() => {
  if (timerInterval.value) clearInterval(timerInterval.value)
})

function validateStatus(status) {
  const s = status ? status.toLowerCase() : 'pending'
  if (['pending', 'cooking', 'ready', 'completed', 'cancelled'].includes(s)) return s
  return 'pending'
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
// First filter the raw orders list
const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    // Filter by Branch
    if (filters.value.branch !== 'All' && order.branch !== filters.value.branch) return false

    // Filter by Source
    if (filters.value.source !== 'All' && order.type !== filters.value.source) return false

    // Filter by Search
    if (filters.value.search) {
      const s = filters.value.search.toLowerCase()
      const matchesId = order.id.toLowerCase().includes(s)
      const matchesTable = order.table.toLowerCase().includes(s)
      if (!matchesId && !matchesTable) return false
    }

    return true
  })
})

// Then distribute into columns
const displayColumns = computed(() => {
  const cols = [
    { id: 'pending', title: 'Active Orders', icon: 'receipt', color: 'orange', orders: [] },
    { id: 'cooking', title: 'Preparing', icon: 'soup_kitchen', color: 'blue', orders: [] },
    { id: 'ready', title: 'Ready', icon: 'check_circle', color: 'green', orders: [] },
    { id: 'completed', title: 'Completed', icon: 'done_all', color: 'grey', orders: [] },
  ]

  // Map to add dynamic props like timeAgo
  const processedOrders = filteredOrders.value.map((o) => ({
    ...o,
    timeAgo: getTimeAgo(o.date),
  }))

  processedOrders.forEach((order) => {
    const col = cols.find((c) => c.id === order.status)
    if (col) {
      col.orders.push(order)
    }
  })

  return cols
})

// --- Actions ---
function viewOrder(order) {
  selectedOrder.value = order
  detailsOpen.value = true
}

function advanceOrder(order) {
  const flow = ['pending', 'cooking', 'ready', 'completed']
  const idx = flow.indexOf(order.status)

  if (idx > -1 && idx < flow.length - 1) {
    // Find the actual order object in the main list and update it
    const target = orders.value.find((o) => o.id === order.id)
    if (target) {
      target.status = flow[idx + 1]
    }
  }
}

function cancelOrder(order) {
  if (!order) return
  const target = orders.value.find((o) => o.id === order.id)
  if (target) target.status = 'cancelled'
}
</script>

<style scoped>
/* Remove specific height calculation to allow page scroll if needed,
   but for Kanban we usually want columns to scroll independently. */
/* Just ensuring it consumes available space */
/* Add custom styles here if needed */
</style>
