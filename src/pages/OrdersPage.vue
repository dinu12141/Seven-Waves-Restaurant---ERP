<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="orders"
      title="Orders Management"
      breadcrumbs="Operations / Orders"
      :roleBadge="restrictions.ordersAcceptOnly ? 'WAITER' : ''"
      primaryAction
      primaryActionLabel="New Order"
      @primary-action="$router.push('/pos')"
    >
      <template #secondary-actions>
        <div class="erp-view-toggle q-mr-sm">
          <button
            class="erp-view-btn"
            :class="{ 'erp-view-btn--active': viewMode === 'kanban' }"
            @click="viewMode = 'kanban'"
            title="Kanban View"
          >
            <q-icon name="view_kanban" size="18px" />
          </button>
          <button
            class="erp-view-btn"
            :class="{ 'erp-view-btn--active': viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="List View"
          >
            <q-icon name="table_rows" size="18px" />
          </button>
        </div>
        <q-btn
          v-if="!restrictions.ordersAcceptOnly"
          outline
          color="white"
          class="erp-toolbar__secondary-btn q-ml-sm"
          icon="history"
          label="History"
        />
      </template>
    </ERPToolbar>

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

    <!-- ERP List View (DataGrid) -->
    <div v-if="viewMode === 'list'" class="q-mt-md">
      <BaseDataGrid
        title="Orders"
        :subtitle="`${filteredOrders.length} active orders`"
        :columns="listColumns"
        :rows="allProcessedOrders"
        :actions="listActions"
        :filters="listFilters"
        storage-key="orders-list"
        search-placeholder="Search by order #, table, type..."
        no-data-label="No active orders"
        @view="viewOrder"
        @advance="advanceOrder"
        @cancel="cancelOrder"
      />
    </div>

    <!-- Kanban Board (inside v-else wrapper) -->
    <div v-if="viewMode !== 'list'">
      <!-- Filters (Kanban-specific) -->
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

      <div class="kanban-board">
        <div class="kanban-column" v-for="column in displayColumns" :key="column.id">
          <div class="kanban-column-inner">
            <div class="kanban-header">
              <div class="kanban-header-left">
                <q-icon :name="column.icon" :color="column.color" size="18px" class="q-mr-sm" />
                <span class="text-weight-bold">{{ column.title }}</span>
              </div>
              <q-badge :color="column.color" text-color="white" rounded>
                {{ column.orders.length }}
              </q-badge>
            </div>

            <div class="kanban-scroll">
              <div v-if="column.orders.length === 0" class="kanban-empty">
                <q-icon name="inbox" size="32px" style="opacity:0.15" />
                <div class="text-caption text-grey-7 q-mt-xs">No orders</div>
              </div>
              <OrderKanbanCard
                v-for="order in column.orders"
                :key="order.id"
                :order="order"
                @view="viewOrder"
                @view-kot="viewOrderKot"
                @view-invoice="viewOrderInvoice"
                @next-stage="advanceOrder"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Details Dialog -->
    <OrderDetailDialog
      v-model="detailsOpen"
      :order-id="selectedOrderId"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useOrderStore } from 'src/stores/orders'
import { useAuthStore } from 'src/stores/auth'
import { useRealtime } from 'src/composables/useRealtime'
import { useQuasar } from 'quasar'
import { getRoleRestrictions } from 'src/config/roles'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import OrderKanbanCard from 'src/components/orders/OrderKanbanCard.vue'
import OrderDetailDialog from 'src/components/orders/OrderDetailDialog.vue'
import BaseDataGrid from 'components/common/BaseDataGrid.vue'

const $q = useQuasar()

const orderStore = useOrderStore()
const authStore = useAuthStore()
const { subscribe, unsubscribeAll } = useRealtime()

/** Role-based restrictions (e.g. ordersAcceptOnly for waiters) */
const restrictions = computed(() => getRoleRestrictions(authStore.roles))

// View mode: 'kanban' (default) | 'list'
const viewMode = ref('kanban')

// ─── List View Config ────────────────────────────────────────────────────────
const listColumns = [
  {
    name: 'order_number',
    label: 'Order #',
    field: 'order_number',
    type: 'text',
    sortable: true,
    minWidth: 90,
  },
  { name: 'status', label: 'Status', field: 'status', type: 'status', align: 'center', width: 120 },
  { name: 'type', label: 'Type', field: 'type', type: 'badge', sortable: true, width: 100 },
  { name: 'table', label: 'Table', field: 'table', type: 'text', width: 80 },
  { name: 'items', label: 'Items', field: 'items', type: 'text', minWidth: 200 },
  {
    name: 'total',
    label: 'Total',
    field: 'total',
    type: 'currency',
    align: 'right',
    sortable: true,
  },
  { name: 'timeAgo', label: 'Time', field: 'timeAgo', type: 'text', width: 90, hideable: true },
]

const listActions = [
  { event: 'view', icon: 'visibility', label: 'View order' },
  {
    event: 'advance',
    icon: 'arrow_forward',
    label: 'Advance status',
    show: (row) => !['completed', 'paid', 'served', 'invoiced'].includes(row.status),
  },
  {
    event: 'cancel',
    icon: 'cancel',
    label: 'Cancel order',
    danger: true,
    show: (row) =>
      !restrictions.value.ordersAcceptOnly && !['cancelled', 'paid'].includes(row.status),
  },
]

const listFilters = [
  {
    field: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { label: 'All', value: '' },
      { label: 'Pending', value: 'pending' },
      { label: 'Preparing', value: 'preparing' },
      { label: 'Ready', value: 'ready' },
      { label: 'Served', value: 'served' },
    ],
  },
  {
    field: 'type',
    label: 'Order Type',
    type: 'select',
    options: [
      { label: 'All', value: '' },
      { label: 'Dine In', value: 'dine_in' },
      { label: 'Takeaway', value: 'takeaway' },
      { label: 'Delivery', value: 'delivery' },
    ],
  },
  { field: 'created_at', label: 'Date', type: 'date-range' },
]

// All processed orders for the list view
const allProcessedOrders = computed(() => {
  return orderStore.activeOrders.map((o) => {
    const fullOrder = orderStore.orderWithItems(o.id)
    const itemsText =
      fullOrder?.items?.map((i) => `${i.quantity}x ${i.menu_items?.name || i.name || 'Item'}`).join(', ') || ''
    const table = orderStore.tables.get(o.table_id)
    return {
      ...o,
      type: o.order_type,
      items: itemsText,
      table: table ? table.table_number : '—',
      timeAgo: getTimeAgo(o.created_at),
      total: o.total_amount,
    }
  })
})

// --- State ---
const filters = ref({
  branch: 'All',
  source: 'All',
  search: '',
})
const detailsOpen = ref(false)
const selectedOrderId = ref(null)

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

    // Get table number
    const table = orderStore.tables.get(o.table_id)
    const tableNum = table ? table.table_number : '-'

    // Get KOT tickets for this order
    const kots = [...orderStore.kotTickets.values()].filter(k => k.order_id === o.id)

    return {
      ...o,
      type: o.order_type,
      order_items: fullOrder?.items || [],
      kot_tickets: kots,
      invoices: [],  // Will be detected by status
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
  selectedOrderId.value = order.id
  detailsOpen.value = true
}

function viewOrderKot(order) {
  selectedOrderId.value = order.id
  detailsOpen.value = true
  // The dialog will open on 'details' tab — we pass a nextTick hint
  // Use a small delay so the dialog opens first, then switch tab
  setTimeout(() => {
    const dlg = document.querySelector('.order-detail-fullscreen')
    if (dlg) {
      // Dispatch custom event to switch tab
      window.__orderDetailTab = 'kot'
    }
  }, 100)
}

function viewOrderInvoice(order) {
  selectedOrderId.value = order.id
  detailsOpen.value = true
  setTimeout(() => {
    window.__orderDetailTab = 'invoice'
  }, 100)
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
/* View mode toggle */
.erp-view-toggle {
  display: flex;
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.12));
  border-radius: 6px;
  overflow: hidden;
}
.erp-view-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  transition: background 0.15s, color 0.15s;
}
.erp-view-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}
.erp-view-btn--active {
  background: rgba(37, 99, 235, 0.15);
  color: #2563eb;
}

/* Kanban Board */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 0;
}

.kanban-column {
  min-width: 0;
}

.kanban-column-inner {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 260px);
  overflow: hidden;
}

.kanban-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.kanban-header-left {
  display: flex;
  align-items: center;
  color: #e5e7eb;
  font-size: 14px;
}

.kanban-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.kanban-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  color: #6b7280;
}

@media (max-width: 1024px) {
  .kanban-board {
    grid-template-columns: repeat(2, 1fr);
  }
  .kanban-column-inner {
    height: 400px;
  }
}

@media (max-width: 600px) {
  .kanban-board {
    grid-template-columns: 1fr;
  }
}
</style>
