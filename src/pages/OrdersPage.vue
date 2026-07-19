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
          :color="$q.dark.isActive ? 'white' : 'grey-8'"
          class="erp-toolbar__secondary-btn q-ml-sm"
          icon="history"
          label="History"
          @click="$router.push('/reports/sales')"
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
            :dark="$q.dark.isActive"
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
            :dark="$q.dark.isActive"
            options-dense
          >
            <template v-slot:prepend>
              <q-icon name="category" />
            </template>
          </q-select>
        </div>
      <!-- Kitchen Filter -->
        <div class="col-12 col-md-3">
          <q-select
            v-model="filters.kitchen"
            :options="kitchenOptions"
            label="Kitchen"
            option-value="id"
            option-label="name"
            emit-value
            map-options
            dense
            outlined
            :dark="$q.dark.isActive"
            options-dense
            clearable
            clear-icon="close"
          >
            <template v-slot:prepend>
              <q-icon name="soup_kitchen" />
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-icon name="soup_kitchen" size="16px" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.name }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </div>

        <div class="col-12 col-md-3">
          <q-input
            v-model="filters.search"
            placeholder="Order #, Table, Waiter, Customer, KOT #..."
            dense
            outlined
            clearable
            :dark="$q.dark.isActive"
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
                <q-icon name="inbox" size="32px" style="opacity: 0.15" />
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
    <OrderDetailDialog v-model="detailsOpen" :order-id="selectedOrderId" :default-tab="detailsInitialTab" />
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
import { supabase } from 'src/boot/supabase'
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
      fullOrder?.items
        ?.map((i) => `${i.quantity}x ${i.menu_items?.name || i.name || 'Item'}`)
        .join(', ') || ''
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
  kitchen: null, // null = All kitchens
  search: '',
})

// Kitchen options — loaded from store (populated after fetchInitialOrders)
// Guard: kitchens may be undefined before store hydrates
const kitchenOptions = computed(() => [
  { id: null, name: 'All Kitchens' },
  ...(Array.isArray(orderStore.kitchens) ? orderStore.kitchens : []),
])
const detailsOpen = ref(false)
const selectedOrderId = ref(null)
const detailsInitialTab = ref('details')

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
  // Get the set of order IDs that match the selected kitchen
  const kitchenOrderIds = filters.value.kitchen
    ? orderStore.orderIdsByKitchen(filters.value.kitchen)
    : null

  return orderStore.activeOrders.filter((order) => {
    // Kitchen filter
    if (kitchenOrderIds && !kitchenOrderIds.has(order.id)) return false

    // Filter by Source
    if (filters.value.source !== 'All' && order.order_type !== filters.value.source) return false

    // Filter by Search — multi-field: order#, table, customer, phone, KOT#, waiter name
    if (filters.value.search) {
      const s = filters.value.search.toLowerCase().trim()
      if (!s) return true

      // Order number (e.g. "166", "#166")
      const orderNum = String(order.order_number || '').toLowerCase()
      // Table number — resolved from restaurant_tables Map (orders.table_number is often null)
      const tableObj = order.table_id ? orderStore.tables.get(order.table_id) : null
      const tableNum = String(tableObj?.table_number || order.table_number || '').toLowerCase()
      // Customer name / phone
      const custName = (order.customer_name || '').toLowerCase()
      const custPhone = (order.customer_phone || '').toLowerCase()
      // Waiter name — resolved from profiles Map
      const waiterId = order.assigned_waiter_id || order.waiter_id
      const waiterName = waiterId
        ? (orderStore.profiles.get(waiterId)?.full_name || '').toLowerCase()
        : ''
      // KOT numbers for this order
      const kotNums = [...orderStore.kotTickets.values()]
        .filter((k) => k.order_id === order.id)
        .map((k) => String(k.kot_number || '').toLowerCase())

      const matches =
        orderNum.includes(s) ||
        (`#${orderNum}`.includes(s)) ||
        tableNum.includes(s) ||
        custName.includes(s) ||
        custPhone.includes(s) ||
        waiterName.includes(s) ||
        kotNums.some((kn) => kn.includes(s))

      if (!matches) return false
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
    const kots = [...orderStore.kotTickets.values()].filter((k) => k.order_id === o.id)

    return {
      ...o,
      type: o.order_type,
      order_items: fullOrder?.items || [],
      kot_tickets: kots,
      invoices: [], // Will be detected by status
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
  detailsInitialTab.value = 'details'
  selectedOrderId.value = order.id
  detailsOpen.value = true
}

function viewOrderKot(order) {
  detailsInitialTab.value = 'kot'
  selectedOrderId.value = order.id
  detailsOpen.value = true
}

function viewOrderInvoice(order) {
  detailsInitialTab.value = 'invoice'
  selectedOrderId.value = order.id
  detailsOpen.value = true
}

async function advanceOrder(order) {
  try {
    if (['pending', 'pending_waiter'].includes(order.status)) {
      // Must use process_waiter_accept RPC — plain status UPDATE skips KOT generation triggers
      const { data, error } = await supabase.rpc('process_waiter_accept', { p_order_id: order.id })
      if (error) throw new Error(error.message)
      if (!data?.success) throw new Error(data?.error || 'Accept failed')
      $q.notify({ type: 'positive', message: 'Order accepted' })
    } else if (order.status === 'accepted') {
      await orderStore.updateOrderStatus(order.id, 'preparing')
      $q.notify({ type: 'positive', message: 'Order sent to kitchen' })
    } else if (order.status === 'preparing') {
      await orderStore.updateOrderStatus(order.id, 'ready')
      $q.notify({ type: 'positive', message: 'Order marked ready' })
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

function cancelOrder(order) {
  if (!order) return
  $q.dialog({
    title: 'Cancel Order',
    message: `Cancel order #${order.order_number || order.id?.slice(-6)}? This cannot be undone.`,
    cancel: { label: 'Keep Order', flat: true },
    ok: { label: 'Cancel Order', color: 'negative' },
    persistent: true,
  }).onOk(async () => {
    try {
      await orderStore.updateOrderStatus(order.id, 'cancelled')
      $q.notify({ type: 'positive', message: 'Order cancelled' })
    } catch (err) {
      $q.notify({ type: 'negative', message: `Failed to cancel: ${err.message}` })
    }
  })
}
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════════════
   ORDERS MANAGEMENT — Professional Light/Dark Theme
   ═══════════════════════════════════════════════════════════════════════════ */

/* --- View Mode Toggle --- */
.erp-view-toggle {
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  gap: 1px;
}
.body--dark .erp-view-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}
.body--light .erp-view-toggle {
  border: 1px solid #d1d5db;
  background: #f3f4f6;
}
.erp-view-btn {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.body--dark .erp-view-btn { color: rgba(255,255,255,0.4); }
.body--dark .erp-view-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8); }
.body--dark .erp-view-btn--active { background: rgba(37,99,235,0.2); color: #60a5fa; }
.body--light .erp-view-btn { color: #9ca3af; }
.body--light .erp-view-btn:hover { background: #e5e7eb; color: #374151; }
.body--light .erp-view-btn--active { background: #dbeafe; color: #2563eb; }

/* --- Kanban Board --- */
.kanban-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-top: 0;
}
.kanban-column { min-width: 0; }
.kanban-column-inner {
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 260px);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

/* ── Dark ── */
.body--dark .kanban-column-inner {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.06);
}

/* ── Light — premium white columns with subtle shadow ── */
.body--light .kanban-column-inner {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.body--light .kanban-column-inner:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

/* --- Column Header — color-coded top border accent --- */
.kanban-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  flex-shrink: 0;
  position: relative;
}
.body--dark .kanban-header {
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.body--light .kanban-header {
  border-bottom: 1px solid #f0f0f0;
  background: linear-gradient(180deg, #fafbfc 0%, #ffffff 100%);
}

/* Color accent bars for each column */
.body--light .kanban-column:nth-child(1) .kanban-column-inner {
  border-top: 3px solid #f59e0b;
}
.body--light .kanban-column:nth-child(2) .kanban-column-inner {
  border-top: 3px solid #3b82f6;
}
.body--light .kanban-column:nth-child(3) .kanban-column-inner {
  border-top: 3px solid #10b981;
}
.body--light .kanban-column:nth-child(4) .kanban-column-inner {
  border-top: 3px solid #6b7280;
}

.body--dark .kanban-column:nth-child(1) .kanban-column-inner {
  border-top: 3px solid #f59e0b;
}
.body--dark .kanban-column:nth-child(2) .kanban-column-inner {
  border-top: 3px solid #3b82f6;
}
.body--dark .kanban-column:nth-child(3) .kanban-column-inner {
  border-top: 3px solid #10b981;
}
.body--dark .kanban-column:nth-child(4) .kanban-column-inner {
  border-top: 3px solid #6b7280;
}

.kanban-header-left {
  display: flex;
  align-items: center;
  font-size: 13.5px;
  letter-spacing: 0.01em;
}
.body--dark .kanban-header-left { color: #e5e7eb; }
.body--light .kanban-header-left { color: #1f2937; font-weight: 600; }

/* --- Scroll Area --- */
.kanban-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

/* Custom scrollbar */
.body--light .kanban-scroll::-webkit-scrollbar { width: 5px; }
.body--light .kanban-scroll::-webkit-scrollbar-track { background: transparent; }
.body--light .kanban-scroll::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 99px;
}
.body--light .kanban-scroll::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
.body--dark .kanban-scroll::-webkit-scrollbar { width: 5px; }
.body--dark .kanban-scroll::-webkit-scrollbar-track { background: transparent; }
.body--dark .kanban-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 99px;
}

/* --- Empty state --- */
.kanban-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
}
.body--light .kanban-empty { color: #9ca3af; }
.body--dark .kanban-empty { color: #6b7280; }

/* --- Responsive --- */
@media (max-width: 1024px) {
  .kanban-board { grid-template-columns: repeat(2, 1fr); }
  .kanban-column-inner { height: 400px; }
}
@media (max-width: 600px) {
  .kanban-board { grid-template-columns: 1fr; }
}
</style>
