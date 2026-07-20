<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="operations"
      title="Operations Dashboard"
      breadcrumbs="Operations / Overview"
    />

    <!-- KPI Cards — all clickable -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <div class="ops-kpi-card" :class="`ops-kpi-card--${stat.color}`" @click="openDrawer(stat.key)">
          <!-- Watermark -->
          <q-icon :name="stat.icon" size="72px" class="ops-kpi-watermark" />
          <!-- Icon wrap -->
          <div class="ops-kpi-icon-wrap">
            <q-icon :name="stat.icon" size="22px" color="white" />
          </div>
          <!-- Body -->
          <div class="ops-kpi-body">
            <div class="ops-kpi-label">{{ stat.title }}</div>
            <div class="ops-kpi-value">{{ stat.value }}</div>
          </div>
          <!-- Click hint -->
          <q-icon name="open_in_full" size="12px" class="ops-kpi-hint" />
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Order Status Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Real-time Order Status"
          subtitle="Orders by current state"
          type="bar"
          :series="orderSeries"
          :options="orderOptions"
          :loading="loading"
        />
      </div>

      <!-- Pending Actions -->
      <div class="col-12 col-md-4">
        <div class="ops-panel">
          <div class="ops-panel__header">
            <span class="ops-panel__title">
              <q-icon name="pending_actions" size="16px" class="q-mr-xs" />
              Pending Actions
            </span>
            <q-btn flat dense round icon="refresh" size="sm" color="grey-5" :loading="loading" @click="fetchData">
              <q-tooltip>Refresh</q-tooltip>
            </q-btn>
          </div>
          <div class="ops-panel__body">
            <div v-if="pendingActions.length === 0" class="ops-empty">
              <q-icon name="check_circle" size="36px" color="positive" />
              <div>All clear!</div>
            </div>
            <div
              v-for="action in pendingActions"
              :key="action.id"
              class="ops-action-item"
              :class="`ops-action-item--${action.type}`"
            >
              <div class="ops-action-icon">
                <q-icon :name="action.icon" size="16px" color="white" />
              </div>
              <div class="ops-action-body">
                <div class="ops-action-title">{{ action.title }}</div>
                <div class="ops-action-desc">{{ action.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════
           RIGHT-SIDE DETAIL DRAWER
    ══════════════════════════════════════════════ -->
    <q-drawer
      v-model="drawerOpen"
      side="right"
      :width="520"
      overlay
      bordered
      class="ops-drawer"
    >
      <!-- Loading state -->
      <div v-if="drawerLoading" class="ops-drawer-loading">
        <q-spinner color="primary" size="40px" />
      </div>

      <template v-else>
        <!-- ── Active Orders ── -->
        <template v-if="drawerKey === 'active_orders'">
          <DrawerHeader title="Active Orders" icon="receipt_long" color="blue" @close="drawerOpen=false" />
          <div class="drawer-body">
            <div v-if="!drawerData.orders?.length" class="drawer-empty">No active orders right now.</div>
            <div v-for="o in drawerData.orders" :key="o.id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">#{{ o.order_number }} · {{ o.table_number || o.order_type }}</div>
                <div class="drawer-row__secondary">{{ timeAgo(o.created_at) }}</div>
              </div>
              <q-badge :color="statusColor(o.status)" :label="fmtStatus(o.status)" />
            </div>
          </div>
        </template>

        <!-- ── Pending Waiter Actions ── -->
        <template v-else-if="drawerKey === 'pending_waiter'">
          <DrawerHeader title="Pending Waiter Actions" icon="room_service" color="orange" @close="drawerOpen=false" />
          <div class="drawer-body">
            <div v-if="!drawerData.orders?.length" class="drawer-empty">No pending waiter actions.</div>
            <div v-for="o in drawerData.orders" :key="o.id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">#{{ o.order_number }} — {{ o.table_number || (o.order_type === 'delivery' ? '🛵 Delivery' : o.order_type) }}</div>
                <div class="drawer-row__secondary">LKR {{ Number(o.total_amount).toLocaleString() }} · {{ timeAgo(o.created_at) }}</div>
              </div>
              <q-badge color="orange" label="Waiting" />
            </div>
          </div>
        </template>

        <!-- ── Kitchen Queue ── -->
        <template v-else-if="drawerKey === 'kitchen_queue'">
          <DrawerHeader title="Kitchen Queue" icon="soup_kitchen" color="red" @close="drawerOpen=false" />
          <div class="drawer-body">
            <div v-if="!drawerData.tickets?.length" class="drawer-empty">Kitchen queue is clear!</div>
            <div v-for="k in drawerData.tickets" :key="k.id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">KOT #{{ k.kot_number }} · Order #{{ k.order_number }}</div>
                <div class="drawer-row__secondary">{{ k.kitchen_name }} · {{ timeAgo(k.created_at) }}</div>
              </div>
              <q-badge :color="kotColor(k.status)" :label="k.status" />
            </div>
          </div>
        </template>

        <!-- ── Cashier Activity ── -->
        <template v-else-if="drawerKey === 'cashier_activity'">
          <DrawerHeader title="Cashier Activity — Today" icon="local_atm" color="green" @close="drawerOpen=false" />
          <div class="drawer-body">
            <div v-if="!drawerData.cashiers?.length" class="drawer-empty">No cashier activity today.</div>

            <!-- Summary row -->
            <div class="drawer-summary q-mb-md">
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Total Sales</div>
                <div class="drawer-summary__value text-green-4">
                  LKR {{ Number(drawerData.totalSales || 0).toLocaleString() }}
                </div>
              </div>
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Transactions</div>
                <div class="drawer-summary__value">{{ drawerData.totalTxns || 0 }}</div>
              </div>
            </div>

            <div v-for="c in drawerData.cashiers" :key="c.cashier_id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">{{ c.cashier_name }}</div>
                <div class="drawer-row__secondary">{{ c.transaction_count }} txns · Cash: LKR {{ Number(c.cash_total).toLocaleString() }}</div>
              </div>
              <div class="text-green-4 text-weight-bold" style="font-size:13px">
                LKR {{ Number(c.total_sales).toLocaleString() }}
              </div>
            </div>
          </div>
        </template>

        <!-- ── Table Occupancy ── -->
        <template v-else-if="drawerKey === 'table_occupancy'">
          <DrawerHeader title="Table Occupancy" icon="deck" color="purple" @close="drawerOpen=false" />
          <div class="drawer-body">
            <!-- Occupancy donut summary -->
            <div class="drawer-summary q-mb-md">
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Occupied</div>
                <div class="drawer-summary__value text-orange-4">{{ drawerData.occupied || 0 }}</div>
              </div>
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Available</div>
                <div class="drawer-summary__value text-green-4">{{ drawerData.available || 0 }}</div>
              </div>
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Reserved</div>
                <div class="drawer-summary__value text-blue-4">{{ drawerData.reserved || 0 }}</div>
              </div>
            </div>

            <q-linear-progress
              :value="(drawerData.occupied || 0) / Math.max(1, (drawerData.total || 1))"
              color="purple"
              track-color="grey-8"
              rounded
              size="10px"
              class="q-mb-md"
            />

            <div v-if="!drawerData.tables?.length" class="drawer-empty">No table data.</div>
            <div v-for="t in drawerData.tables" :key="t.id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">{{ t.table_number }} · {{ t.section || 'General' }}</div>
                <div class="drawer-row__secondary">Capacity: {{ t.capacity }}</div>
              </div>
              <q-badge
                :color="t.status === 'available' ? 'positive' : t.status === 'occupied' ? 'orange' : 'blue'"
                :label="t.status"
              />
            </div>
          </div>
        </template>

        <!-- ── Completed Today ── -->
        <template v-else-if="drawerKey === 'completed_today'">
          <DrawerHeader title="Completed Today" icon="check_circle" color="teal" @close="drawerOpen=false" />
          <div class="drawer-body">
            <!-- Summary -->
            <div class="drawer-summary q-mb-md">
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Orders Done</div>
                <div class="drawer-summary__value text-teal-4">{{ drawerData.orders?.length || 0 }}</div>
              </div>
              <div class="drawer-summary__item">
                <div class="drawer-summary__label">Revenue</div>
                <div class="drawer-summary__value text-green-4">
                  LKR {{ Number(drawerData.revenue || 0).toLocaleString() }}
                </div>
              </div>
            </div>

            <div v-if="!drawerData.orders?.length" class="drawer-empty">No completed orders today yet.</div>
            <div v-for="o in drawerData.orders" :key="o.id" class="drawer-row">
              <div class="drawer-row__left">
                <div class="drawer-row__primary">#{{ o.order_number }} · {{ o.table_number || o.order_type }}</div>
                <div class="drawer-row__secondary">{{ timeAgo(o.updated_at) }}</div>
              </div>
              <div class="text-green-4 text-weight-bold" style="font-size:13px">
                LKR {{ Number(o.total_amount).toLocaleString() }}
              </div>
            </div>
          </div>
        </template>
      </template>
    </q-drawer>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted, defineComponent, h } from 'vue'
import { date } from 'quasar'
import { supabase } from 'src/boot/supabase'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const loading = ref(false)
let timer = null

// ── Drawer state ──────────────────────────────────────────────────────────────
const drawerOpen    = ref(false)
const drawerKey     = ref('')
const drawerLoading = ref(false)
const drawerData    = ref({})

// ── KPIs ──────────────────────────────────────────────────────────────────────
const kpis = ref([
  { key: 'active_orders',    title: 'Active Orders',          value: '–', icon: 'receipt_long',  color: 'blue'   },
  { key: 'pending_waiter',   title: 'Pending Waiter Actions', value: '–', icon: 'room_service',   color: 'orange' },
  { key: 'kitchen_queue',    title: 'Kitchen Queue',          value: '–', icon: 'soup_kitchen',   color: 'red'    },
  { key: 'cashier_activity', title: 'Cashier Activity',       value: '–', icon: 'local_atm',      color: 'green'  },
  { key: 'table_occupancy',  title: 'Table Occupancy',        value: '–', icon: 'deck',           color: 'purple' },
  { key: 'completed_today',  title: 'Completed Today',        value: '–', icon: 'check_circle',   color: 'teal'   },
])

// ── Pending actions list (side panel) ─────────────────────────────────────────
const pendingActions = ref([])

// ── Chart ────────────────────────────────────────────────────────────────────
const orderSeries  = ref([{ name: 'Orders', data: [] }])
const orderOptions = ref({})

// ── Open drawer ───────────────────────────────────────────────────────────────
async function openDrawer(key) {
  drawerKey.value  = key
  drawerOpen.value = true
  drawerData.value = {}
  drawerLoading.value = true

  const today = new Date().toISOString().split('T')[0]

  try {
    if (key === 'active_orders') {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, created_at, order_type, restaurant_tables(table_number)')
        .not('status', 'in', '(completed,cancelled,paid)')
        .order('created_at', { ascending: false })
        .limit(30)
      drawerData.value = {
        orders: (data || []).map(o => ({ ...o, table_number: o.restaurant_tables?.table_number }))
      }
    }

    else if (key === 'pending_waiter') {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, created_at, order_type, restaurant_tables(table_number)')
        .eq('status', 'pending_waiter')
        .order('created_at', { ascending: false })
        .limit(30)
      drawerData.value = {
        orders: (data || []).map(o => ({ ...o, table_number: o.restaurant_tables?.table_number }))
      }
    }

    else if (key === 'kitchen_queue') {
      const { data } = await supabase
        .from('kot_tickets')
        .select('id, kot_number, status, created_at, kitchen_id, order_id, kitchens(name), orders(order_number)')
        .in('status', ['pending', 'accepted', 'preparing'])
        .order('created_at', { ascending: false })
        .limit(30)
      drawerData.value = {
        tickets: (data || []).map(k => ({
          ...k,
          kitchen_name: k.kitchens?.name || 'Kitchen',
          order_number: k.orders?.order_number,
        }))
      }
    }

    else if (key === 'cashier_activity') {
      const { data } = await supabase
        .from('v_rpt_cashier_shift')
        .select('*')
        .eq('shift_date', today)
        .order('total_sales', { ascending: false })
      const totalSales = (data || []).reduce((s, r) => s + Number(r.total_sales || 0), 0)
      const totalTxns  = (data || []).reduce((s, r) => s + Number(r.transaction_count || 0), 0)
      drawerData.value = { cashiers: data || [], totalSales, totalTxns }
    }

    else if (key === 'table_occupancy') {
      const { data } = await supabase
        .from('restaurant_tables')
        .select('id, table_number, section, capacity, status')
        .order('table_number')
      const occupied  = (data || []).filter(t => t.status === 'occupied').length
      const available = (data || []).filter(t => t.status === 'available').length
      const reserved  = (data || []).filter(t => t.status === 'reserved').length
      drawerData.value = { tables: data || [], occupied, available, reserved, total: (data || []).length }
    }

    else if (key === 'completed_today') {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, updated_at, order_type, restaurant_tables(table_number)')
        .in('status', ['completed', 'paid'])
        .gte('updated_at', today)
        .order('updated_at', { ascending: false })
        .limit(50)
      const revenue = (data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0)
      drawerData.value = {
        orders: (data || []).map(o => ({ ...o, table_number: o.restaurant_tables?.table_number })),
        revenue,
      }
    }
  } catch (e) {
    console.error('[OpsDrawer]', e)
  } finally {
    drawerLoading.value = false
  }
}

// ── Fetch KPI data ────────────────────────────────────────────────────────────
const fetchData = async () => {
  loading.value = true
  try {
    const today = new Date().toISOString().split('T')[0]

    // Active orders
    const { count: activeCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(completed,cancelled,paid)')
    kpis.value[0].value = String(activeCount || 0)

    // Pending waiter
    const { count: waiterCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_waiter')
    kpis.value[1].value = String(waiterCount || 0)

    // Kitchen queue
    const { count: kitchenCount } = await supabase
      .from('kot_tickets')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'accepted', 'preparing'])
    kpis.value[2].value = String(kitchenCount || 0)

    // Cashier activity today
    const { data: cashierData } = await supabase
      .from('v_rpt_cashier_shift')
      .select('total_sales')
      .eq('shift_date', today)
    const totalSales = (cashierData || []).reduce((s, r) => s + Number(r.total_sales || 0), 0)
    kpis.value[3].value = 'LKR ' + totalSales.toLocaleString()

    // Table occupancy
    const { data: tables } = await supabase
      .from('restaurant_tables')
      .select('status')
    const totalTables    = (tables || []).length
    const occupiedTables = (tables || []).filter(t => t.status === 'occupied').length
    kpis.value[4].value = totalTables ? `${Math.round((occupiedTables / totalTables) * 100)}%` : '0%'

    // Completed today
    const { count: completedCount } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['completed', 'paid'])
      .gte('updated_at', today)
    kpis.value[5].value = String(completedCount || 0)

    // Pending actions panel (waiter + kitchen)
    const { data: pwOrders } = await supabase
      .from('orders')
      .select('id, order_number, restaurant_tables(table_number)')
      .eq('status', 'pending_waiter')
      .limit(5)

    const { data: ktOrders } = await supabase
      .from('kot_tickets')
      .select('id, kot_number, orders(order_number)')
      .in('status', ['pending', 'accepted'])
      .limit(5)

    pendingActions.value = [
      ...(pwOrders || []).map(o => ({
        id:    'w_' + o.id,
        title: `Order #${o.order_number} needs serving`,
        desc:  o.restaurant_tables?.table_number ? `Table ${o.restaurant_tables.table_number}` : 'Delivery',
        icon:  'room_service',
        type:  'waiter',
      })),
      ...(ktOrders || []).map(k => ({
        id:    'k_' + k.id,
        title: `KOT #${k.kot_number} in queue`,
        desc:  `Order #${k.orders?.order_number}`,
        icon:  'timer',
        type:  'kitchen',
      })),
    ]

    // Order status chart
    const statuses = ['pending', 'placed', 'preparing', 'ready', 'served']
    const counts = await Promise.all(statuses.map(s =>
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', s).then(r => r.count || 0)
    ))
    orderSeries.value = [{ name: 'Orders', data: counts }]
    orderOptions.value = {
      chart: { type: 'bar', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: 'dark' },
      xaxis: {
        categories: ['Pending', 'Placed', 'Preparing', 'Ready', 'Served'],
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#3b82f6'],
      grid: { borderColor: '#374151', strokeDashArray: 4 },
      dataLabels: { enabled: false },
      plotOptions: { bar: { borderRadius: 4 } },
    }
  } catch (e) {
    console.error('[OpsDashboard]', e)
  } finally {
    loading.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '–'
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return date.formatDate(new Date(ts), 'DD MMM, HH:mm')
}

function statusColor(s) {
  const map = { pending:'grey', placed:'blue', preparing:'orange', ready:'positive', served:'teal', pending_waiter:'amber' }
  return map[s] || 'grey'
}
function fmtStatus(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function kotColor(s) {
  const map = { pending:'grey', accepted:'blue', preparing:'orange', served:'positive' }
  return map[s] || 'grey'
}

// ── Drawer Header component (inline) ─────────────────────────────────────────
const DrawerHeader = defineComponent({
  props: { title: String, icon: String, color: String },
  emits: ['close'],
  setup(props, { emit }) {
    return () => h('div', {
      class: `drawer-header drawer-header--${props.color}`,
    }, [
      h('div', { class: 'drawer-header__left' }, [
        h('div', { class: 'drawer-header__icon' }, [
          h('q-icon', { name: props.icon, size: '22px', color: 'white' }),
        ]),
        h('div', { class: 'drawer-header__title' }, props.title),
      ]),
      h('q-btn', { flat: true, round: true, icon: 'close', color: 'white', onClick: () => emit('close') }),
    ])
  },
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchData()
  // Polling removed — realtime events handle live updates
  // timer = setInterval(fetchData, 30000)
})
onUnmounted(() => clearInterval(timer))
</script>

<style scoped lang="scss">
// ── KPI Cards ─────────────────────────────────────────────────────────────────
.ops-kpi-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px 14px;
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
  box-shadow: 0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1);

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 36px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15);

    .ops-kpi-hint { opacity: 1; }
  }
  &:active { transform: translateY(-1px); }

  &--blue   { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); }
  &--orange { background: linear-gradient(135deg, #78350f 0%, #d97706 100%); }
  &--red    { background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%); }
  &--green  { background: linear-gradient(135deg, #064e3b 0%, #059669 100%); }
  &--purple { background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%); }
  &--teal   { background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%); }
}

.ops-kpi-watermark {
  position: absolute;
  right: -12px;
  bottom: -12px;
  opacity: 0.08;
  color: white !important;
  pointer-events: none;
}

.ops-kpi-icon-wrap {
  width: 46px; height: 46px;
  border-radius: 12px;
  background: rgba(255,255,255,0.18);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.ops-kpi-body { flex: 1; min-width: 0; z-index: 1; }
.ops-kpi-label {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.6px;
  color: rgba(255,255,255,0.75); margin-bottom: 4px;
}
.ops-kpi-value {
  font-size: 22px; font-weight: 900;
  color: #fff; line-height: 1; letter-spacing: -0.5px;
}
.ops-kpi-hint {
  position: absolute;
  top: 10px; right: 10px;
  opacity: 0;
  color: rgba(255,255,255,0.6) !important;
  transition: opacity 0.2s;
  z-index: 2;
}

// ── Pending panel ─────────────────────────────────────────────────────────────
.ops-panel {
  background: var(--erp-bg-panel, #161b22);
  border: 1px solid var(--erp-border, rgba(255,255,255,0.08));
  border-radius: 14px; overflow: hidden;
  display: flex; flex-direction: column; height: 100%;

  &__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.03);
  }
  &__title {
    font-size: 13px; font-weight: 700; color: #f3f4f6;
    display: flex; align-items: center;
  }
  &__body { flex: 1; padding: 10px; overflow-y: auto; max-height: 380px; }
}

.ops-action-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px; margin-bottom: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;

  &--waiter  { background: rgba(251,146,60,0.08); border-color: rgba(251,146,60,0.2); }
  &--kitchen { background: rgba(239,68,68,0.08);  border-color: rgba(239,68,68,0.2);  }
  &--waiter:hover  { background: rgba(251,146,60,0.15); }
  &--kitchen:hover { background: rgba(239,68,68,0.15);  }
}
.ops-action-icon {
  width: 32px; height: 32px;
  border-radius: 8px; background: rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.ops-action-title { font-size: 13px; font-weight: 600; color: #f3f4f6; }
.ops-action-desc  { font-size: 11px; color: #9ca3af; margin-top: 2px; }

.ops-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 30px; color: #4b5563; font-size: 13px; text-align: center; gap: 8px;
}

// ── Drawer ────────────────────────────────────────────────────────────────────
.ops-drawer {
  background: var(--erp-bg-panel, #0d1117) !important;
  border-left: 1px solid rgba(255,255,255,0.08) !important;
}

.ops-drawer-loading {
  display: flex; align-items: center; justify-content: center;
  height: 100%;
}

.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);

  &__left  { display: flex; align-items: center; gap: 14px; }
  &__icon  {
    width: 46px; height: 46px; border-radius: 12px;
    background: rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
  }
  &__title { font-size: 17px; font-weight: 800; color: #fff; }

  &--blue   { background: linear-gradient(135deg, #1e3a8a, #2563eb); }
  &--orange { background: linear-gradient(135deg, #78350f, #d97706); }
  &--red    { background: linear-gradient(135deg, #7f1d1d, #dc2626); }
  &--green  { background: linear-gradient(135deg, #064e3b, #059669); }
  &--purple { background: linear-gradient(135deg, #4c1d95, #7c3aed); }
  &--teal   { background: linear-gradient(135deg, #134e4a, #0d9488); }
}

.drawer-body {
  padding: 16px;
  overflow-y: auto;
  height: calc(100% - 90px);
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

.drawer-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.05);
  background: rgba(255,255,255,0.03);
  margin-bottom: 8px;
  transition: background 0.15s;
  &:hover { background: rgba(255,255,255,0.06); }

  &__left   { flex: 1; min-width: 0; }
  &__primary { font-size: 13px; font-weight: 600; color: #f3f4f6;
               white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &__secondary { font-size: 11px; color: #6b7280; margin-top: 2px; }
}

.drawer-empty {
  text-align: center; color: #4b5563;
  font-size: 13px; padding: 40px;
}

.drawer-summary {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;

  &__item {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 12px; text-align: center;
  }
  &__label { font-size: 10px; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.6px; color: #6b7280; margin-bottom: 4px; }
  &__value { font-size: 20px; font-weight: 800; color: #f3f4f6; }
}
</style>
