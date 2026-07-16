<template>
  <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale" maximized>
    <div class="lookup-dialog-wrapper full-width full-height row justify-center items-center">
      <div class="lookup-container">
        <!-- Top Title Bar -->
        <div class="window-title-bar">
          <div class="window-title">Orders</div>
          <button class="window-close-btn" @click="closeDialog">X</button>
        </div>

        <div class="lookup-layout row no-wrap">
          <!-- Main Table Area -->
          <div class="main-table-area col">
            <!-- Search Row (above headers) -->
            <div class="search-header-row row no-wrap items-end q-px-sm q-pt-sm">
              <div class="search-col" style="flex: 1;">
                <div class="search-label">Table No</div>
                <input v-model="search.tableNo" type="text" class="search-input" />
              </div>
              <div class="search-col" style="flex: 1;">
                <div class="search-label">Bill No</div>
                <input v-model="search.billNo" type="text" class="search-input" />
              </div>
              <div class="search-col" style="flex: 1;">
                <div class="search-label">Cust ID</div>
                <input v-model="search.custId" type="text" class="search-input" />
              </div>
              <div class="search-col" style="flex: 2;">
                <div class="search-label">Customer Name</div>
                <input v-model="search.customerName" type="text" class="search-input" />
              </div>
              <div class="search-col" style="flex: 1.5;">
                <div class="search-label">Phone #</div>
                <input v-model="search.phone" type="text" class="search-input" />
              </div>
              <div class="search-col" style="flex: 1.5;">
                <div class="search-label">OrderRef #</div>
                <input v-model="search.orderRef" type="text" class="search-input" />
              </div>
            </div>

            <!-- Table -->
            <div class="table-container" ref="tableContainer">
              <table class="data-table">
                <thead>
                  <tr>
                    <th style="width: 12%;">Table / Type</th>
                    <th style="width: 9%;" class="text-right">Bill No.</th>
                    <th style="width: 10%;">Attend By</th>
                    <th style="width: 10%;">Clerk Code</th>
                    <th style="width: 10%;" class="text-center">Start Time</th>
                    <th style="width: 21%;">Customer Name</th>
                    <th style="width: 16%;">Phone No.</th>
                    <th style="width: 12%;" class="text-right">Bill Amt.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr 
                    v-for="order in filteredOrders" 
                    :key="order.id"
                    :class="{ 
                      'selected-row': selectedOrderId === order.id,
                      'invoiced-row': order.status === 'invoiced',
                      'kot-sent-row': ['accepted', 'preparing', 'ready'].includes(order.status),
                      'paid-row': order.status === 'paid' || order.payment_status === 'paid'
                    }"
                    @click="selectOrder(order)"
                  >
                    <td class="text-bold">
                      <span v-if="order.order_type === 'dine_in'">
                        {{ order.tableNumber && order.tableNumber !== '—' ? order.tableNumber : 'Table' }}
                      </span>
                      <span v-else-if="order.order_type === 'takeaway'" class="text-teal text-weight-bold">Takeaway</span>
                      <span v-else-if="order.order_type === 'delivery'" class="text-red text-weight-bold">Delivery</span>
                      <span v-else class="text-grey-7" style="text-transform: capitalize;">{{ order.order_type?.replace('_', ' ') }}</span>
                    </td>
                    <td class="text-right text-bold">{{ String(order.order_number || '').replace('ORD-', '') }}</td>
                    <td>{{ getAttendBy(order) }}</td>
                    <td>{{ getWaiterName(order) }}</td>
                    <td class="text-center">{{ formatTime(order.created_at) }}</td>
                    <td>{{ order.customer_name || '' }}</td>
                    <td>{{ order.customer_phone || '' }}</td>
                    <td class="text-right text-bold">{{ order.total_amount?.toFixed(1) || '0.0' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- Bottom Controls -->
            <div class="bottom-controls row no-wrap items-center justify-between q-pa-sm">
              <button class="nav-btn" @click="scrollUp">▲</button>
              <div class="row q-gutter-md justify-center flex-1">
                <button class="action-btn" @click="confirmSelection">OK</button>
                <button class="action-btn" @click="closeDialog">Cancel</button>
              </div>
              <button class="nav-btn" @click="scrollDown">▼</button>
            </div>
          </div>

          <!-- Right Sidebar Options -->
          <div class="right-sidebar">
            <div class="sidebar-section">
              <div class="section-title">Sort By</div>
              <button class="sidebar-btn" :class="{ active: sortBy === 'table' }" @click="sortBy = 'table'">Table No</button>
              <button class="sidebar-btn" :class="{ active: sortBy === 'bill' }" @click="sortBy = 'bill'">Bill No.</button>
            </div>
            
            <div class="sidebar-section" style="flex: 1;">
              <div class="section-title">Filter By</div>
              <button class="sidebar-btn" :class="{ active: filterBy === 'all' }" @click="filterBy = 'all'">All Order</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'dine_in' }" @click="filterBy = 'dine_in'">Table Order</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'takeaway' }" @click="filterBy = 'takeaway'">Take Away</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'delivery' }" @click="filterBy = 'delivery'">Delivery</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'drive_in' }" @click="filterBy = 'drive_in'">Drive in</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'kiosk' }" @click="filterBy = 'kiosk'">Kiosk Order</button>
              <button class="sidebar-btn" :class="{ active: filterBy === 'hold' }" @click="filterBy = 'hold'">Hold Order</button>
              <button class="sidebar-btn paid-btn" :class="{ active: filterBy === 'paid' }" @click="filterBy = 'paid'">Paid</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useCashierStore } from 'src/stores/cashierStore'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'select'])

const cashierStore = useCashierStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const tableContainer = ref(null)

const sortBy = ref('bill')
const filterBy = ref('all')
const selectedOrderId = ref(null)

const search = ref({
  tableNo: '',
  billNo: '',
  custId: '',
  customerName: '',
  phone: '',
  orderRef: ''
})

const filteredOrders = computed(() => {
  let orders = cashierStore.billingOrders

  if (filterBy.value === 'paid') {
    // Show only paid orders (either status or payment_status is paid/completed)
    orders = orders.filter(o => 
      ['paid', 'completed', 'refunded', 'partially_refunded'].includes(o.status) || 
      ['paid', 'partial', 'refunded', 'partially_refunded'].includes(o.payment_status)
    )
  } else if (filterBy.value === 'all') {
    // Show unpaid active orders (exclude paid/completed/cancelled)
    orders = orders.filter(o => 
      o.status !== 'completed' && o.status !== 'cancelled' &&
      o.payment_status !== 'paid' && o.status !== 'paid'
    )
  } else {
    // For type/status filters, exclude cancelled/completed (non-paid completed)
    orders = orders.filter(o => o.status !== 'cancelled' && o.status !== 'completed')

    if (filterBy.value === 'dine_in') {
      orders = orders.filter(o => o.order_type === 'dine_in' && o.order_source !== 'qr' && o.order_source !== 'table_screen')
    } else if (filterBy.value === 'takeaway') {
      orders = orders.filter(o => o.order_type === 'takeaway')
    } else if (filterBy.value === 'delivery') {
      orders = orders.filter(o => o.order_type === 'delivery')
    } else if (filterBy.value === 'drive_in') {
      orders = orders.filter(o => o.order_type === 'drive_in')
    } else if (filterBy.value === 'kiosk') {
      orders = orders.filter(o => o.order_source === 'qr' || o.order_source === 'table_screen')
    } else if (filterBy.value === 'hold') {
      // Hold Order: pending/pending_waiter orders
      orders = orders.filter(o => o.status === 'pending_waiter' || o.status === 'pending')
    }
  }

  // Search: Table No (uses tableNumber from normalized entry)
  if (search.value.tableNo) {
    orders = orders.filter(o => {
      const tbl = String(o.tableNumber || o.table_number || '')
      return tbl.toLowerCase().includes(search.value.tableNo.toLowerCase())
    })
  }

  // Search: Bill No (strip ORD- prefix)
  if (search.value.billNo) {
    orders = orders.filter(o => {
      const bNo = String(o.order_number || '').replace('ORD-', '')
      return bNo.includes(search.value.billNo)
    })
  }

  // Search: Cust ID (searches order id)
  if (search.value.custId) {
    orders = orders.filter(o => {
      const cid = String(o.id || '')
      return cid.toLowerCase().includes(search.value.custId.toLowerCase())
    })
  }

  // Search: Customer Name
  if (search.value.customerName) {
    orders = orders.filter(o => 
      (o.customer_name || '').toLowerCase().includes(search.value.customerName.toLowerCase())
    )
  }

  // Search: Phone
  if (search.value.phone) {
    orders = orders.filter(o => 
      (o.customer_phone || '').includes(search.value.phone)
    )
  }

  // Search: OrderRef (searches full order_number)
  if (search.value.orderRef) {
    orders = orders.filter(o => {
      const ref = String(o.order_number || '')
      return ref.toLowerCase().includes(search.value.orderRef.toLowerCase())
    })
  }

  // Sort
  orders.sort((a, b) => {
    if (sortBy.value === 'table') {
      const tA = parseInt(a.tableNumber || a.table_number) || 0
      const tB = parseInt(b.tableNumber || b.table_number) || 0
      return tA - tB
    } else {
      return new Date(b.created_at) - new Date(a.created_at)
    }
  })

  return orders
})

watch(isOpen, async (val) => {
  if (val) {
    selectedOrderId.value = null
    await cashierStore.fetchBillingQueue()
  }
})

function closeDialog() {
  isOpen.value = false
}

function selectOrder(order) {
  selectedOrderId.value = order.id
}

function confirmSelection() {
  if (!selectedOrderId.value) {
    // Notify to select? Or just close?
    return
  }
  const order = filteredOrders.value.find(o => o.id === selectedOrderId.value)
  if (order) {
    emit('select', order)
    closeDialog()
  }
}

function getWaiterName(order) {
  return order.waiter?.full_name?.split(' ')[0] || 'System'
}

function getAttendBy(order) {
  if (order.delivery_source) {
    return 'Delivery (' + order.delivery_source.toUpperCase() + ')'
  }
  if (order.order_source === 'website') return 'Website Order'
  if (order.order_source === 'qr') return 'QR / Table Order'
  if (order.order_type === 'delivery') return 'Delivery'
  return order.waiter?.full_name?.split(' ')[0] || 'System'
}

function formatTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

// ── NAVIGATION & SCROLLING ──
function scrollUp() {
  if (tableContainer.value) {
    tableContainer.value.scrollTop -= 150
  }
}

function scrollDown() {
  if (tableContainer.value) {
    tableContainer.value.scrollTop += 150
  }
}

function handleKeydown(e) {
  if (!isOpen.value) return

  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const orders = filteredOrders.value
    if (orders.length === 0) return

    const currentIndex = orders.findIndex(o => o.id === selectedOrderId.value)
    let nextIndex = 0

    if (e.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? orders.length - 1 : currentIndex - 1
    } else {
      nextIndex = currentIndex === -1 || currentIndex >= orders.length - 1 ? 0 : currentIndex + 1
    }

    const nextOrder = orders[nextIndex]
    if (nextOrder) {
      selectedOrderId.value = nextOrder.id
      // Ensure the selected row is visible
      nextTick(() => {
        const row = document.querySelector('.selected-row')
        if (row && tableContainer.value) {
          row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      })
    }
  } else if (e.key === 'Enter') {
    confirmSelection()
  } else if (e.key === 'Escape') {
    closeDialog()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.lookup-dialog-wrapper {
  background: transparent;
  padding: 0;
}

.lookup-container {
  background: #dce3f0;
  border: 1px solid #777;
  display: flex;
  flex-direction: column;
  width: 98vw;
  height: 95vh;
  box-shadow: 2px 2px 10px rgba(0,0,0,0.5);
  font-family: Arial, sans-serif;
  overflow: hidden;
}

.window-title-bar {
  background: #113c4c;
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.window-title {
  font-family: Arial, sans-serif;
  font-size: 14px;
  color: #fff;
  font-weight: bold;
}
.window-close-btn {
  background: transparent;
  color: #fff;
  border: none;
  font-weight: bold;
  cursor: pointer;
}

.lookup-layout {
  flex: 1;
  overflow: hidden;
  padding: 6px;
  gap: 6px;
}

.main-table-area {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  background: #dce3f0;
  border-right: 1px solid #a3b0c9;
  padding-right: 6px;
}

.search-header-row {
  gap: 8px;
  padding: 4px 0 8px 0;
}
.search-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.search-label {
  font-size: 12px;
  font-weight: bold;
  color: #000;
  margin-bottom: 2px;
}
.search-input {
  border: 1px solid #999;
  height: 22px;
  font-family: inherit;
  font-size: 13px;
  padding: 0 4px;
  width: 100%;
  min-width: 0;
}

.table-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: #fff;
  border: 1px solid #999;
  margin: 0 5px;
}

.data-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
  color: #000;
}
.data-table thead {
  position: sticky;
  top: 0;
  background: #9ab4d6;
  z-index: 2;
}
.data-table th {
  border: 1px solid #7a94b8;
  padding: 4px;
  text-align: left;
  font-weight: bold;
  font-size: 13px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.data-table td {
  border: 1px solid #b0b0b0;
  padding: 4px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.data-table tbody tr:nth-child(even) {
  background: #def0df;
}
.data-table tbody tr:nth-child(odd) {
  background: #f0fbfa;
}
.data-table tbody tr:hover {
  background: #c3d2e6;
  cursor: pointer;
}
.data-table tbody tr.invoiced-row {
  background: #fff9c4 !important;
}
.data-table tbody tr.invoiced-row:hover {
  background: #fff176 !important;
}
.data-table tbody tr.kot-sent-row {
  background: #ffcc80 !important; /* Soft Orange */
}
.data-table tbody tr.kot-sent-row:hover {
  background: #ffb74d !important;
}
.data-table tbody tr.selected-row {
  background: rgba(255, 255, 0, 0.4) !important; /* Semi-transparent Yellow overlay */
  outline: 2px solid #3366ff !important;
  outline-offset: -2px;
}
.data-table tbody tr.paid-row {
  background: #d4edda !important; /* Soft Green */
}
.data-table tbody tr.paid-row:hover {
  background: #c3e6cb !important;
}

.bottom-controls {
  height: 60px;
  background: #dce3f0;
  padding: 10px 0 0 0;
}
.nav-btn {
  background: #fff;
  border: 1px solid #999;
  width: 44px;
  height: 40px;
  font-size: 20px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 1px 1px 2px rgba(0,0,0,0.2);
}
.nav-btn:active {
  background: #eee;
}
.flex-1 { flex: 1; }
.action-btn {
  background: #87a5f0;
  border: 1px solid #666;
  border-radius: 4px;
  padding: 6px 36px;
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  box-shadow: inset 0px 1px 0px rgba(255,255,255,0.4), 1px 1px 3px rgba(0,0,0,0.3);
}
.action-btn:active {
  background: #6a94df;
  box-shadow: inset 1px 1px 3px rgba(0,0,0,0.4);
}

.right-sidebar {
  width: 160px;
  min-width: 160px;
  flex-shrink: 0;
  background: #dce3f0;
  display: flex;
  flex-direction: column;
}
.sidebar-section {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-title {
  font-weight: bold;
  font-size: 14px;
  color: #000;
}
.sidebar-btn {
  background: #fff;
  border: 1px solid #999;
  padding: 6px 8px;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: #000;
}
.sidebar-btn:hover {
  background: #e0e0e0;
}
.sidebar-btn.active {
  background: #fff;
  font-weight: bold;
  border: 2px solid #5a7baf;
}
.sidebar-btn.paid-btn {
  background: #d4edda;
  border-color: #28a745;
  color: #155724;
}
.sidebar-btn.paid-btn.active {
  background: #28a745;
  color: #fff;
  border: 2px solid #1e7e34;
}
</style>
