<template>
  <q-page class="waiter-tables">
    <q-pull-to-refresh @refresh="onRefresh" color="orange">
      <!-- ── Header ────────────────────────────────── -->
      <div class="page-header q-px-md q-pt-md">
        <div class="row items-center justify-between">
          <div>
            <div class="page-title">Floor View</div>
            <div class="page-subtitle">{{ occupiedCount }}/{{ tables.length }} occupied</div>
          </div>
          <q-btn
            flat
            round
            dense
            icon="refresh"
            color="grey-4"
            :loading="loading"
            @click="loadTables"
          />
        </div>

        <!-- Status Legend -->
        <div class="legend-row q-mt-sm">
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
      </div>

      <!-- ── Filter Chips ──────────────────────────── -->
      <div class="q-px-md q-mt-sm">
        <div class="filter-chips">
          <q-chip
            v-for="f in filters"
            :key="f.value"
            dense
            clickable
            :color="activeFilter === f.value ? 'orange-9' : 'grey-9'"
            :text-color="activeFilter === f.value ? 'white' : 'grey-4'"
            @click="activeFilter = f.value"
            class="filter-chip"
          >
            {{ f.label }} ({{ f.count }})
          </q-chip>
        </div>
      </div>

      <!-- ── Loading ───────────────────────────────── -->
      <div v-if="loading && !tables.length" class="loading-wrap">
        <q-spinner-orbit size="48px" color="orange" />
      </div>

      <!-- ── Empty ─────────────────────────────────── -->
      <div v-else-if="!filteredTables.length" class="empty-state">
        <q-icon name="table_restaurant" size="56px" color="grey-7" />
        <div class="empty-title">No tables found</div>
        <div class="empty-sub">
          {{ activeFilter === 'all' ? 'No tables configured.' : 'No tables with this status.' }}
        </div>
      </div>

      <!-- ── Table Grid ────────────────────────────── -->
      <div v-else class="table-grid q-px-md q-mt-md">
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
              <q-icon name="receipt" size="11px" color="amber-4" />
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
                flat
                dense
                no-caps
                color="orange-4"
                icon="add"
                label="New Order"
                class="action-mini"
                @click.stop="newOrder(table)"
              />
              <q-btn
                v-if="table.occupied"
                flat
                dense
                no-caps
                color="blue-4"
                icon="add"
                label="Add Items"
                class="action-mini"
                @click.stop="addItems(table)"
              />
              <q-btn
                v-if="table.occupied"
                flat
                dense
                no-caps
                color="amber-4"
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
}

// ── Header ──────────────────────────────
.page-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--erp-text-primary, #1e293b);
}
.page-subtitle {
  font-size: 12px;
  color: var(--erp-text-muted, #94a3b8);
  margin-top: 2px;
}

.legend-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--erp-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  &--available {
    background: #059669;
  }
  &--occupied {
    background: #2563eb;
  }
  &--billing {
    background: #d97706;
  }
  &--reserved {
    background: #7c3aed;
  }
}

// ── Filter Chips ────────────────────────
.filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.filter-chip {
  font-size: 11px !important;
  font-weight: 600 !important;
  height: 26px !important;
}

// ── Loading / Empty ─────────────────────
.loading-wrap {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  text-align: center;
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--erp-text-secondary, #64748b);
}
.empty-sub {
  font-size: 12px;
  color: var(--erp-text-muted, #94a3b8);
}

// ── Table Grid ──────────────────────────
.table-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  @media (max-width: 400px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.table-card {
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
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
    border-top: 3px solid #059669;
    &:hover {
      border-color: #a7f3d0;
    }
  }
  &--occupied {
    border-top: 3px solid #2563eb;
    background: #eff6ff;
    &:hover {
      border-color: #93c5fd;
    }
  }
  &--billing {
    border-top: 3px solid #d97706;
    background: #fffbeb;
    animation: billing-pulse 2s ease-in-out infinite;
    &:hover {
      border-color: #fcd34d;
    }
  }
  &--reserved {
    border-top: 3px solid #7c3aed;
    &:hover {
      border-color: #c4b5fd;
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  &__number {
    font-size: 18px;
    font-weight: 800;
    color: var(--erp-text-primary, #1e293b);
  }
  &__capacity {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: var(--erp-text-muted, #94a3b8);
    font-weight: 600;
  }
  &__status-badge {
    display: inline-block;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 4px;
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
    border-top: 1px solid var(--erp-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--erp-text-secondary, #64748b);
}
.bill-amount {
  font-weight: 700;
  color: #d97706;
}

.action-mini {
  font-size: 10px !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  height: 28px !important;
  justify-content: flex-start !important;
}

@keyframes billing-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.15);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(217, 119, 6, 0);
  }
}

// ── Expand Transition ───────────────────
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
