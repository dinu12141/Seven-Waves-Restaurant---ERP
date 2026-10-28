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

      <!-- ── Section Filter (only shown when sections exist) ── -->
      <div v-if="hasSections" class="tables-sections">
        <q-chip
          dense
          clickable
          :selected="activeSection === 'all'"
          :color="activeSection === 'all' ? 'orange-8' : 'grey-3'"
          :text-color="activeSection === 'all' ? 'white' : 'grey-8'"
          @click="activeSection = 'all'"
        >All Sections</q-chip>
        <q-chip
          v-for="s in sections"
          :key="s"
          dense
          clickable
          :selected="activeSection === s"
          :color="activeSection === s ? 'orange-8' : 'grey-3'"
          :text-color="activeSection === s ? 'white' : 'grey-8'"
          @click="activeSection = s"
        >{{ s }}</q-chip>
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
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { groupOrdersByTable } from 'src/services/pos/posHelpers'

const authStore = useAuthStore()
const $q = useQuasar()
const router = useRouter()
const loading = ref(false)
const tables = ref([])
const expandedTable = ref(null)
const activeFilter = ref('all')
const activeSection = ref('all') // Feature 4: section filter

let realtimeChannel = null

// ── Load Tables ──────────────────────────
async function loadTables() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  loading.value = true
  try {
    // Fetch tables (include section for filter feature)
    const { data: tablesData, error: tablesErr } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, capacity, status, section')
      .eq('branch_id', branchId)
      .or('is_active.is.null,is_active.eq.true') // hide deactivated tables
      .order('table_number', { ascending: true })
    if (tablesErr) throw tablesErr

    // Fetch active orders to determine occupancy
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id, table_id, table_number, order_type, status, total_amount')
      .eq('branch_id', branchId)
      .in('status', ['pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced'])
      .or('table_id.not.is.null,table_number.not.is.null')
    if (ordersErr) throw ordersErr

    // Match by table_id OR table_number (POS orders only set table_number)
    const ordersByTable = groupOrdersByTable(
      tablesData || [],
      (orders || []).filter((o) => o.table_id || !o.order_type || o.order_type === 'dine_in'),
    )

    tables.value = (tablesData || []).map((t) => {
      const tableOrders = ordersByTable.get(t.id) || []
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
    $q.notify({ type: 'negative', message: 'Could not load tables', caption: err?.message, position: 'top' })
  } finally {
    loading.value = false
  }
}

// ── Filter ───────────────────────────────
const occupiedCount = computed(() => tables.value.filter((t) => t.occupied).length)

// Section filter — only show if tables have non-null sections
const sections = computed(() => {
  const raw = [...new Set(tables.value.map((t) => t.section).filter(Boolean))]
  return raw.sort()
})
const hasSections = computed(() => sections.value.length > 0)

// Base set filtered by section first
const sectionFilteredTables = computed(() => {
  if (activeSection.value === 'all' || !hasSections.value) return tables.value
  return tables.value.filter((t) => t.section === activeSection.value)
})

const filters = computed(() => [
  { label: 'All', value: 'all', count: sectionFilteredTables.value.length },
  { label: 'Vacant', value: 'vacant', count: sectionFilteredTables.value.filter((t) => !t.occupied).length },
  {
    label: 'Occupied',
    value: 'occupied',
    count: sectionFilteredTables.value.filter((t) => t.occupied && !t.hasBilling).length,
  },
  { label: 'Billing', value: 'billing', count: sectionFilteredTables.value.filter((t) => t.hasBilling).length },
])

const filteredTables = computed(() => {
  const base = sectionFilteredTables.value
  if (activeFilter.value === 'all') return base
  if (activeFilter.value === 'vacant') return base.filter((t) => !t.occupied)
  if (activeFilter.value === 'occupied') return base.filter((t) => t.occupied && !t.hasBilling)
  if (activeFilter.value === 'billing') return base.filter((t) => t.hasBilling)
  return base
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

// Stay inside the waiter PWA: '/pos' is the desktop MainLayout POS (it ignores
// table_id and drops the waiter out of the standalone app).
function newOrder(table) {
  router.push({ path: '/waiter-app/pos', query: { table: formatTableNumber(table.table_number) } })
}

function addItems(table) {
  if (table.tableOrders.length) {
    // MyOrdersPage owns the "Add Items" flow for an existing order
    router.push({ path: '/waiter-app/orders', query: { highlight: table.tableOrders[0].id } })
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
  background: #f1f5f9;
  font-family: 'Inter', 'Roboto', sans-serif;
}

// ─── Header ──────────────────────────────────────────────────────
.tables-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%);
  position: sticky;
  top: 0;
  z-index: 5;
  box-shadow: 0 4px 20px rgba(49, 46, 129, 0.4);
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
  color: #fff;
  letter-spacing: -0.3px;
  line-height: 1.15;
}
.tables-header__sub {
  font-size: 0.82rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
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
  font-size: 0.78rem;
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
  &--occupied  { background: #f97316; }
  &--billing   { background: #d97706; }
  &--reserved  { background: #7c3aed; }
}

// ─── Filter Tabs ─────────────────────────────────────────────────
.tables-sections {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
}

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
  padding: 7px 18px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.18s ease;

  &.active {
    background: linear-gradient(135deg, #f97316, #ef4444);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 4px 14px rgba(249, 115, 22, 0.35);
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
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, #4c1d95, #312e81);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: 0 8px 24px rgba(76, 29, 149, 0.3);
}
.tables-empty__title {
  font-size: 1.08rem;
  font-weight: 700;
  color: #475569;
}
.tables-empty__sub {
  font-size: 0.88rem;
  color: #94a3b8;
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
  border: 1.5px solid transparent;
  border-radius: 16px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  -webkit-tap-highlight-color: transparent;
  position: relative;
  overflow: hidden;

  &:active { transform: scale(0.95); }

  &--available {
    background: linear-gradient(135deg, #ecfdf5, #d1fae5);
    border-color: #a7f3d0;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.12);
    &:hover { box-shadow: 0 8px 24px rgba(16, 185, 129, 0.22); border-color: #6ee7b7; }
  }
  &--occupied {
    background: linear-gradient(135deg, #fff7ed, #fed7aa);
    border-color: #fdba74;
    box-shadow: 0 4px 16px rgba(249, 115, 22, 0.12);
    &:hover { box-shadow: 0 8px 24px rgba(249, 115, 22, 0.22); border-color: #fb923c; }
  }
  &--billing {
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border-color: #fcd34d;
    box-shadow: 0 4px 16px rgba(217, 119, 6, 0.15);
    animation: billing-pulse 2s ease-in-out infinite;
    &:hover { box-shadow: 0 8px 24px rgba(217, 119, 6, 0.28); }
  }
  &--reserved {
    background: linear-gradient(135deg, #f5f3ff, #ede9fe);
    border-color: #c4b5fd;
    box-shadow: 0 4px 16px rgba(124, 58, 237, 0.1);
    &:hover { box-shadow: 0 8px 24px rgba(124, 58, 237, 0.2); border-color: #a78bfa; }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  &__number {
    font-size: 1.4rem;
    font-weight: 900;
    color: #0f172a;
    letter-spacing: -0.5px;
  }
  &__capacity {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.78rem;
    color: #64748b;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.65);
    border-radius: 6px;
    padding: 2px 5px;
  }
  &__status-badge {
    display: inline-block;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 6px;
    &--available { color: #065f46; background: rgba(255, 255, 255, 0.7); }
    &--occupied  { color: #9a3412; background: rgba(255, 255, 255, 0.7); }
    &--billing   { color: #92400e; background: rgba(255, 255, 255, 0.7); }
    &--reserved  { color: #4c1d95; background: rgba(255, 255, 255, 0.7); }
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
    border-top: 1px solid rgba(255, 255, 255, 0.5);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
}

.info-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  color: #475569;
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
  0%, 100% { box-shadow: 0 4px 16px rgba(217, 119, 6, 0.15); }
  50%       { box-shadow: 0 4px 28px rgba(217, 119, 6, 0.38); }
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
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e1650 100%);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    }
    .tables-header__title { color: #f8fafc; }
    .tables-header__sub   { color: rgba(255, 255, 255, 0.45); }

    .tables-legend {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.06);
    }
    .legend-item { color: #64748b; }

    .tables-sections {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.06);
    }

    .tables-filters {
      background: #1e293b;
      border-bottom-color: rgba(255, 255, 255, 0.06);
    }
    .tables-filter-btn {
      background: #0f172a;
      border-color: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      &:hover:not(.active) { background: #1e293b; border-color: rgba(255, 255, 255, 0.15); }
      &.active {
        background: linear-gradient(135deg, #f97316, #ef4444);
        border-color: transparent;
        color: #fff;
      }
    }

    .table-card {
      &--available {
        background: linear-gradient(135deg, rgba(5,150,105,0.14), rgba(16,185,129,0.07));
        border-color: rgba(16, 185, 129, 0.25);
      }
      &--occupied {
        background: linear-gradient(135deg, rgba(249,115,22,0.12), rgba(234,88,12,0.06));
        border-color: rgba(249, 115, 22, 0.25);
      }
      &--billing {
        background: linear-gradient(135deg, rgba(217,119,6,0.12), rgba(245,158,11,0.06));
        border-color: rgba(245, 158, 11, 0.28);
      }
      &--reserved {
        background: linear-gradient(135deg, rgba(124,58,237,0.12), rgba(139,92,246,0.06));
        border-color: rgba(139, 92, 246, 0.25);
      }
      &__number { color: #f8fafc; }
      &__capacity { background: rgba(255,255,255,0.06); color: #94a3b8; }
      &__status-badge {
        &--available { color: #6ee7b7; background: rgba(255,255,255,0.08); }
        &--occupied  { color: #fdba74; background: rgba(255,255,255,0.08); }
        &--billing   { color: #fcd34d; background: rgba(255,255,255,0.08); }
        &--reserved  { color: #c4b5fd; background: rgba(255,255,255,0.08); }
      }
      &__actions { border-top-color: rgba(255, 255, 255, 0.08); }
    }

    .info-row { color: #94a3b8; }
    .bill-amount { color: #fbbf24; }
    .tables-empty__title { color: #94a3b8; }
    .tables-empty__sub   { color: #64748b; }
  }
}
</style>
