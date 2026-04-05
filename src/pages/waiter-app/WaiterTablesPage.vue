<template>
  <q-page class="waiter-tables">
    <q-pull-to-refresh @refresh="onRefresh" color="orange">
      <!-- ── Header ────────────────────────────────── -->
      <div class="tables-header">
        <div class="tables-header__left">
          <q-icon name="grid_view" size="20px" color="orange-8" />
          <div class="tables-header__text">
            <div class="tables-header__title">Floor View</div>
            <div class="tables-header__sub">{{ occupiedCount }}/{{ tables.length }} occupied</div>
          </div>
        </div>
        <q-btn
          flat round dense
          icon="refresh"
          color="grey-6"
          size="sm"
          :loading="loading"
          @click="loadTables"
        />
      </div>

      <!-- ── Status Legend ──────────────────────────── -->
      <div class="tables-legend">
        <div class="legend-item">
          <span class="legend-dot legend-dot--available"></span> Vacant
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-dot--occupied"></span> Occupied
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-dot--billing"></span> Billing
        </div>
        <div class="legend-item">
          <span class="legend-dot legend-dot--reserved"></span> Reserved
        </div>
      </div>

      <!-- ── Filter Tabs ───────────────────────────── -->
      <div class="tables-filters">
        <button
          v-for="f in filters"
          :key="f.value"
          class="tables-filter-btn"
          :class="{ active: activeFilter === f.value }"
          @click="activeFilter = f.value"
        >
          {{ f.label }} ({{ f.count }})
        </button>
      </div>

      <!-- ── Loading ───────────────────────────────── -->
      <div v-if="loading && !tables.length" class="tables-loading">
        <q-spinner-orbit size="40px" color="orange" />
      </div>

      <!-- ── Empty ─────────────────────────────────── -->
      <div v-else-if="!filteredTables.length" class="tables-empty">
        <div class="tables-empty__icon">
          <q-icon name="table_restaurant" size="36px" color="grey-4" />
        </div>
        <div class="tables-empty__title">No tables found</div>
        <div class="tables-empty__sub">
          {{ activeFilter === 'all' ? 'No tables configured.' : 'No tables with this status.' }}
        </div>
      </div>

      <!-- ── Table Grid ────────────────────────────── -->
      <div v-else class="table-grid">
        <div
          v-for="table in filteredTables"
          :key="table.id"
          class="table-card"
          :class="tableCardClass(table)"
          @click="toggleExpanded(table.id)"
        >
          <div class="table-card__header">
            <div class="table-card__number">{{ formatTableNumber(table.table_number) }}</div>
            <div class="table-card__capacity">
              <q-icon name="person" size="11px" />{{ table.capacity }}
            </div>
          </div>

          <div
            class="table-card__status-badge"
            :class="'table-card__status-badge--' + getTableStatus(table)"
          >
            {{ getTableStatusLabel(table) }}
          </div>

          <!-- Running bill / guests if occupied -->
          <div class="table-card__info" v-if="table.occupied">
            <div class="info-row" v-if="table.runningBill > 0">
              <q-icon name="receipt" size="11px" color="amber-8" />
              <span class="bill-amount">Rs. {{ Number(table.runningBill).toFixed(0) }}</span>
            </div>
            <div class="info-row" v-if="table.orderCount">
              <q-icon name="restaurant" size="11px" color="grey-5" />
              <span>{{ table.orderCount }} order{{ table.orderCount > 1 ? 's' : '' }}</span>
            </div>
          </div>

          <!-- Expanded Actions -->
          <transition name="expand">
            <div v-if="expandedTable === table.id" class="table-card__actions">
              <q-btn
                v-if="!table.occupied"
                flat dense no-caps
                color="orange-8"
                icon="add"
                label="New Order"
                class="action-mini"
                @click.stop="newOrder(table)"
              />
              <q-btn
                v-if="table.occupied"
                flat dense no-caps
                color="blue-8"
                icon="add"
                label="Add Items"
                class="action-mini"
                @click.stop="addItems(table)"
              />
              <q-btn
                v-if="table.occupied"
                flat dense no-caps
                color="amber-9"
                icon="receipt_long"
                label="Bill"
                class="action-mini"
                @click.stop="requestBill(table)"
              />
            </div>
          </transition>
        </div>
      </div>

      <div style="height: 24px" />
    </q-pull-to-refresh>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const loading = ref(false)
const tables = ref([])
const expandedTable = ref(null)
const activeFilter = ref('all')

let realtimeChannel = null

// ── Load Tables ──────────────────────────
async function loadTables() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  loading.value = true
  try {
    // Fetch tables
    const { data: tablesData } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, capacity, status')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: true })

    // Fetch active orders to determine occupancy
    const { data: orders } = await supabase
      .from('orders')
      .select('id, table_id, status, total_amount')
      .eq('branch_id', branchId)
      .in('status', ['pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced'])
      .not('table_id', 'is', null)

    const ordersByTable = {}
    ;(orders || []).forEach((o) => {
      if (!ordersByTable[o.table_id]) ordersByTable[o.table_id] = []
      ordersByTable[o.table_id].push(o)
    })

    tables.value = (tablesData || []).map((t) => {
      const tableOrders = ordersByTable[t.id] || []
      const runningBill = tableOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
      const hasBilling = tableOrders.some((o) => o.status === 'invoiced')
      return {
        ...t,
        occupied: tableOrders.length > 0,
        orderCount: tableOrders.length,
        runningBill,
        hasBilling,
        tableOrders,
      }
    })
  } catch (err) {
    console.error('[WaiterTables] Load error:', err)
  } finally {
    loading.value = false
  }
}

// ── Filter ───────────────────────────────
const occupiedCount = computed(() => tables.value.filter((t) => t.occupied).length)

const filters = computed(() => [
  { label: 'All', value: 'all', count: tables.value.length },
  { label: 'Vacant', value: 'vacant', count: tables.value.filter((t) => !t.occupied).length },
  {
    label: 'Occupied',
    value: 'occupied',
    count: tables.value.filter((t) => t.occupied && !t.hasBilling).length,
  },
  { label: 'Billing', value: 'billing', count: tables.value.filter((t) => t.hasBilling).length },
])

const filteredTables = computed(() => {
  if (activeFilter.value === 'all') return tables.value
  if (activeFilter.value === 'vacant') return tables.value.filter((t) => !t.occupied)
  if (activeFilter.value === 'occupied')
    return tables.value.filter((t) => t.occupied && !t.hasBilling)
  if (activeFilter.value === 'billing') return tables.value.filter((t) => t.hasBilling)
  return tables.value
})

// ── Helpers ──────────────────────────────
function formatTableNumber(num) {
  if (!num) return '?'
  return String(num).replace(/table/i, '').trim()
}

function getTableStatus(table) {
  if (table.hasBilling) return 'billing'
  if (table.occupied) return 'occupied'
  if (table.status === 'reserved') return 'reserved'
  return 'available'
}

function getTableStatusLabel(table) {
  const s = getTableStatus(table)
  return { available: 'Vacant', occupied: 'Occupied', billing: 'Billing', reserved: 'Reserved' }[s]
}

function tableCardClass(table) {
  return 'table-card--' + getTableStatus(table)
}

function toggleExpanded(id) {
  expandedTable.value = expandedTable.value === id ? null : id
}

function newOrder(table) {
  // Navigate to POS with table context
  router.push(`/pos?table_id=${table.id}&table_number=${encodeURIComponent(table.table_number)}`)
}

function addItems(table) {
  if (table.tableOrders.length) {
    router.push(`/pos?table_id=${table.id}&order_id=${table.tableOrders[0].id}`)
  }
}

function requestBill() {
  // Navigate to orders page filtered by table
  router.push('/waiter-app/orders')
}

async function onRefresh(done) {
  await loadTables()
  done()
}

// ── Realtime ─────────────────────────────
function subscribe() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  realtimeChannel = supabase
    .channel(`waiter-tables-${branchId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
      () => {
        loadTables()
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `branch_id=eq.${branchId}`,
      },
      () => {
        loadTables()
      },
    )
    .subscribe()
}

onMounted(() => {
  loadTables()
  subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) supabase.removeChannel(realtimeChannel)
})
</script>

<style lang="scss" scoped>
.waiter-tables {
  min-height: 100vh;
  background: #f8fafc;
  font-family: 'Inter', 'Roboto', sans-serif;
}

// ─── Header ──────────────────────────────────────────────────────
.tables-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  z-index: 5;
}
.tables-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tables-header__text {
  display: flex;
  flex-direction: column;
}
.tables-header__title {
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.3px;
  line-height: 1.15;
}
.tables-header__sub {
  font-size: 0.85rem;
  font-weight: 500;
  color: #94a3b8;
  margin-top: 1px;
}

// ─── Legend ──────────────────────────────────────────────────────
.tables-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  &--available { background: #059669; }
  &--occupied { background: #2563eb; }
  &--billing { background: #d97706; }
  &--reserved { background: #7c3aed; }
}

// ─── Filter Tabs ─────────────────────────────────────────────────
.tables-filters {
  display: flex;
  gap: 6px;
  padding: 10px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { height: 0; }
}
.tables-filter-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &.active {
    background: #fff7ed;
    border-color: #fb923c;
    color: #ea580c;
    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.06);
  }
  &:hover:not(.active) {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
}

// ─── Loading ─────────────────────────────────────────────────────
.tables-loading {
  display: flex;
  justify-content: center;
  padding: 72px 0;
}

// ─── Empty State ─────────────────────────────────────────────────
.tables-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 64px 24px;
  text-align: center;
}
.tables-empty__icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}
.tables-empty__title {
  font-size: 1.08rem;
  font-weight: 700;
  color: #94a3b8;
}
.tables-empty__sub {
  font-size: 0.92rem;
  color: #cbd5e1;
}

// ─── Table Grid ──────────────────────────────────────────────────
.table-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding: 14px 16px;

  @media (max-width: 400px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

// ─── Table Card ──────────────────────────────────────────────────
.table-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &:active {
    transform: scale(0.97);
  }

  &--available {
    border-left: 3.5px solid #059669;
    &:hover {
      border-color: #a7f3d0;
      border-left-color: #059669;
    }
  }
  &--occupied {
    border-left: 3.5px solid #2563eb;
    background: #f8faff;
    &:hover {
      border-color: #93c5fd;
      border-left-color: #2563eb;
    }
  }
  &--billing {
    border-left: 3.5px solid #d97706;
    background: #fffdf7;
    animation: billing-pulse 2s ease-in-out infinite;
    &:hover {
      border-color: #fcd34d;
      border-left-color: #d97706;
    }
  }
  &--reserved {
    border-left: 3.5px solid #7c3aed;
    &:hover {
      border-color: #c4b5fd;
      border-left-color: #7c3aed;
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  &__number {
    font-size: 1.25rem;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.3px;
  }
  &__capacity {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.82rem;
    color: #94a3b8;
    font-weight: 600;
  }
  &__status-badge {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 6px;
    &--available {
      color: #059669;
      background: #ecfdf5;
    }
    &--occupied {
      color: #2563eb;
      background: #dbeafe;
    }
    &--billing {
      color: #d97706;
      background: #fef3c7;
    }
    &--reserved {
      color: #7c3aed;
      background: #ede9fe;
    }
  }
  &__info {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__actions {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82rem;
  color: #64748b;
  font-weight: 500;
}
.bill-amount {
  font-weight: 700;
  color: #d97706;
}

.action-mini {
  font-size: 0.82rem !important;
  font-weight: 600 !important;
  border-radius: 8px !important;
  height: 30px !important;
  justify-content: flex-start !important;
}

@keyframes billing-pulse {
  0%, 100% { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04); }
  50% { box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.08); }
}

// ─── Expand Transition ───────────────────────────────────────────
.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  max-height: 120px;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>

/* ══════════════════════════════════════════════════
   DARK MODE OVERRIDES (WaiterTablesPage)
   ══════════════════════════════════════════════════ */
<style lang="scss">
body.body--dark {
  .waiter-tables {
    background: #0f172a;
    color: #e2e8f0;

    .tables-header {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .tables-header__title { color: #f8fafc; }
    
    .tables-legend {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }

    .tables-filters {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }
    .tables-filter-btn {
      background: #0f172a;
      border-color: rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      &:hover:not(.active) {
        background: #1e293b;
        border-color: rgba(255, 255, 255, 0.2);
      }
      &.active {
        background: rgba(234, 88, 12, 0.1);
        border-color: #fb923c;
        color: #fb923c;
      }
    }

    .table-card {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.08);
      &__number { color: #f8fafc; }
      
      &--occupied {
        background: rgba(37, 99, 235, 0.05);
        border-color: rgba(37, 99, 235, 0.2);
        &:hover { border-color: #3b82f6; }
      }
      &--billing {
        background: rgba(217, 119, 6, 0.05);
        border-color: rgba(217, 119, 6, 0.2);
        &:hover { border-color: #f59e0b; }
      }
      
      &__actions {
        border-top-color: rgba(255, 255, 255, 0.08);
      }
    }

    .info-row { color: #94a3b8; }
  }
}
</style>
