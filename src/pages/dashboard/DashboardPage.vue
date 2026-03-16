<template>
  <q-page class="dash-page">

    <!-- ══════════════════════════════════════════════
         HEADER ROW
    ══════════════════════════════════════════════ -->
    <div class="dash-header">
      <div class="dash-header__left">
        <div class="dash-header__brand">
          <span class="dash-header__brand-name">Seven Waves</span>
          <span class="dash-header__brand-tag">ERP v2.0</span>
        </div>
        <div class="dash-header__time-info">
          <q-icon name="schedule" size="13px" class="q-mr-xs" />
          {{ currentTime }} &nbsp;·&nbsp; {{ currentDate }}
        </div>
      </div>
      <div class="dash-header__right">
        <div class="live-pulse-badge">
          <span class="live-pulse-badge__dot"></span>
          LIVE
        </div>
        <q-btn-toggle
          v-model="timeFilter"
          class="dash-time-toggle"
          no-caps unelevated dense
          toggle-color="primary"
          color="transparent"
          text-color="grey-5"
          :options="[
            { label: 'Today',   value: 'daily'   },
            { label: 'Week',    value: 'weekly'  },
            { label: 'Month',   value: 'monthly' },
          ]"
        />
      </div>
    </div>

    <!-- ══════════════════════════════════════════════
         KPI CARDS
    ══════════════════════════════════════════════ -->
    <div class="kpi-grid">

      <!-- Gross Revenue -->
      <div class="kpi-card kpi-card--revenue">
        <div class="kpi-card__icon-wrap kpi-card__icon-wrap--revenue">
          <q-icon name="payments" size="22px" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Gross Revenue</div>
          <div class="kpi-card__value">
            <span class="kpi-card__currency">LKR</span>
            {{ kpi1 }}
          </div>
          <div class="kpi-card__sub kpi-card__sub--up">
            <q-icon name="trending_up" size="12px" class="q-mr-xs" />
            {{ timeFilter === 'daily' ? "Today's" : timeFilter === 'weekly' ? "This Week's" : "This Month's" }} Sales
          </div>
        </div>
      </div>

      <!-- Active Orders -->
      <div class="kpi-card kpi-card--orders">
        <div class="kpi-card__icon-wrap kpi-card__icon-wrap--orders">
          <q-icon name="receipt_long" size="22px" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Active Orders</div>
          <div class="kpi-card__value">{{ kpi2 }}</div>
          <div class="kpi-card__sub kpi-card__sub--warn">
            <q-icon name="pending_actions" size="12px" class="q-mr-xs" />
            {{ kpi2 }} Pending Actions
          </div>
        </div>
      </div>

      <!-- Table Occupancy -->
      <div class="kpi-card kpi-card--tables">
        <div class="kpi-card__icon-wrap kpi-card__icon-wrap--tables">
          <q-icon name="table_restaurant" size="22px" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Table Occupancy</div>
          <div class="kpi-card__value">
            {{ (kpi3 * 100).toFixed(0) }}<span class="kpi-card__unit">%</span>
          </div>
          <div class="kpi-card__progress-row">
            <q-linear-progress :value="kpi3" color="teal-4" track-color="white-1" size="4px" rounded class="kpi-card__progress" />
            <span class="kpi-card__sub kpi-card__sub--info q-ml-sm">{{ occupiedTablesCount }}/{{ totalTablesCount }}</span>
          </div>
        </div>
      </div>

      <!-- Active Staff -->
      <div class="kpi-card kpi-card--staff">
        <div class="kpi-card__icon-wrap kpi-card__icon-wrap--staff">
          <q-icon name="groups" size="22px" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Active Staff</div>
          <div class="kpi-card__value">{{ kpi4 }}</div>
          <div class="kpi-card__avatars">
            <div v-for="n in Math.min(Number(kpi4), 5)" :key="n" class="kpi-card__avatar-dot"></div>
            <span class="kpi-card__sub kpi-card__sub--staff q-ml-xs">On Floor</span>
          </div>
        </div>
      </div>

    </div>

    <!-- ══════════════════════════════════════════════
         MAIN CONTENT GRID
    ══════════════════════════════════════════════ -->
    <div class="dash-grid">

      <!-- ── LEFT COLUMN ── -->
      <div class="dash-grid__left">

        <!-- Revenue Chart -->
        <div class="dash-card">
          <div class="dash-card__header">
            <div>
              <div class="dash-card__title">Revenue Trend</div>
              <div class="dash-card__sub">Sales performance · {{ timeFilter }}</div>
            </div>
            <div class="dash-card__header-right">
              <div class="legend-dot legend-dot--revenue"></div>
              <span class="legend-label">Revenue</span>
            </div>
          </div>
          <DashboardChart
            type="area"
            height="220"
            :series="revenueSeries"
            :options="chartOptions"
            :loading="loading"
          />
        </div>

        <!-- Order Type Split -->
        <div class="dash-card dash-split-row">

          <!-- Dine In vs Takeaway donut -->
          <div class="dash-split-row__donut">
            <div class="dash-card__title dash-card__title--sm">Order Split</div>
            <DashboardChart
              type="donut"
              height="160"
              :series="donutSeries"
              :options="donutOptions"
              :loading="loading"
            />
          </div>

          <!-- Live Order Feed -->
          <div class="dash-split-row__feed">
            <div class="dash-card__header">
              <div class="dash-card__title dash-card__title--sm">Live Order Feed</div>
              <q-btn to="/orders" flat dense no-caps class="view-all-btn" label="View All →" />
            </div>
            <div class="order-feed">
              <div
                v-for="proc in activeProcesses"
                :key="proc.id"
                class="order-feed__row"
              >
                <div class="order-feed__dot" :class="`order-feed__dot--${proc.coreColor}`"></div>
                <div class="order-feed__id">#{{ proc.pid.slice(-4) }}</div>
                <div class="order-feed__type">{{ proc.core }}</div>
                <div class="order-feed__amount">{{ proc.load }}</div>
                <div class="order-feed__status" :class="`order-feed__status--${proc.statusColor}`">
                  {{ proc.status }}
                </div>
              </div>
              <div v-if="activeProcesses.length === 0" class="order-feed__empty">
                <q-icon name="check_circle_outline" size="24px" class="q-mr-sm" />
                No active orders
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ── RIGHT COLUMN ── -->
      <div class="dash-grid__right">

        <!-- Quick Actions -->
        <div class="dash-card">
          <div class="dash-card__title dash-card__title--sm q-mb-md">Quick Actions</div>
          <div class="quick-actions">
            <router-link to="/pos" class="qa-btn qa-btn--pos">
              <q-icon name="point_of_sale" size="24px" />
              <span>POS</span>
            </router-link>
            <router-link to="/kitchen" class="qa-btn qa-btn--kitchen">
              <q-icon name="soup_kitchen" size="24px" />
              <span>Kitchen</span>
            </router-link>
            <router-link to="/orders" class="qa-btn qa-btn--orders">
              <q-icon name="receipt_long" size="24px" />
              <span>Orders</span>
            </router-link>
            <router-link to="/operations/tables" class="qa-btn qa-btn--tables">
              <q-icon name="table_restaurant" size="24px" />
              <span>Tables</span>
            </router-link>
            <router-link to="/reports/sales" class="qa-btn qa-btn--reports">
              <q-icon name="bar_chart" size="24px" />
              <span>Reports</span>
            </router-link>
            <router-link to="/inventory/dashboard" class="qa-btn qa-btn--inventory">
              <q-icon name="inventory_2" size="24px" />
              <span>Inventory</span>
            </router-link>
          </div>
        </div>

        <!-- Live Table Map -->
        <div class="dash-card dash-card--table-map">
          <div class="dash-card__header">
            <div>
              <div class="dash-card__title dash-card__title--sm">Live Table Map</div>
              <div class="dash-card__sub">Real-time floor status</div>
            </div>
            <div class="table-map-badge">
              {{ occupiedTablesCount }} / {{ totalTablesCount }}
            </div>
          </div>

          <!-- Legend -->
          <div class="table-legend">
            <div class="table-legend__item">
              <span class="table-legend__dot table-legend__dot--available"></span>Available
            </div>
            <div class="table-legend__item">
              <span class="table-legend__dot table-legend__dot--occupied"></span>Occupied
            </div>
          </div>

          <!-- Table Grid -->
          <q-scroll-area class="table-map-scroll">
            <div v-if="floorTables.length === 0" class="table-map-empty">
              <q-icon name="table_restaurant" size="32px" class="q-mb-sm" />
              <div>No tables configured</div>
            </div>
            <div v-else class="table-map-grid">
              <div
                v-for="t in floorTables"
                :key="t.id"
                class="table-cell"
                :class="t.occupied ? 'table-cell--occupied' : 'table-cell--available'"
              >
                <div class="table-cell__number">
                  {{ (t.table_number || '').replace(/table/i, '').trim() || t.id?.slice(-2) }}
                </div>
                <div class="table-cell__cap">
                  <q-icon name="person" size="8px" />{{ t.capacity }}
                </div>
              </div>
            </div>
          </q-scroll-area>
        </div>

      </div>
    </div>

  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const authStore = useAuthStore()
const loading    = ref(false)
const timeFilter = ref('daily')

// ── KPIs ────────────────────────────────────────────────────────
const kpi1 = ref('0')
const kpi2 = ref('0')
const kpi3 = ref(0)
const kpi4 = ref('0')
const activeProcesses     = ref([])
const floorTables         = ref([])
const occupiedTablesCount = ref(0)
const totalTablesCount    = ref(0)
const dineInCount         = ref(0)
const takeawayCount       = ref(0)

// ── Live clock ──────────────────────────────────────────────────
const currentTime = ref('')
const currentDate = ref('')
let clockTimer = null
function tickClock() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  currentDate.value = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
tickClock()

// ── Charts ──────────────────────────────────────────────────────
const revenueSeries = ref([{ name: 'Revenue', data: Array(7).fill(0) }])

const chartOptions = ref({
  chart:       { type: 'area', toolbar: { show: false }, background: 'transparent', sparkline: { enabled: false } },
  colors:      ['#2563EB'],
  dataLabels:  { enabled: false },
  stroke:      { curve: 'smooth', width: 2.5 },
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.01, stops: [0, 90, 100] },
  },
  xaxis: {
    categories: [],
    labels:     { style: { colors: '#64748b', fontSize: '10px', fontFamily: 'inherit' } },
    axisBorder: { show: false },
    axisTicks:  { show: false },
  },
  yaxis:  { labels: { show: false } },
  grid:   { borderColor: 'rgba(255,255,255,0.04)', strokeDashArray: 4, xaxis: { lines: { show: false } } },
  tooltip: { theme: 'dark', x: { show: true } },
})

const donutSeries  = computed(() => [dineInCount.value || 0, takeawayCount.value || 0])
const donutOptions = ref({
  chart:   { type: 'donut', background: 'transparent' },
  colors:  ['#2563EB', '#0EA5E9'],
  labels:  ['Dine In', 'Takeaway'],
  legend:  { show: true, position: 'bottom', fontSize: '11px', labels: { colors: '#94a3b8' } },
  stroke:  { show: false },
  dataLabels: { enabled: false },
  plotOptions: { pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Total', color: '#94a3b8', fontSize: '11px' } } } } },
  tooltip: { theme: 'dark' },
})

// ── Data fetching ────────────────────────────────────────────────
async function fetchDashboardData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const now  = new Date()
    let start  = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (timeFilter.value === 'weekly')  start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    if (timeFilter.value === 'monthly') start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    const startStr = start.toISOString()

    const [activeRes, completedRes, trendRes, tablesRes, staffRes] = await Promise.all([
      supabase.from('orders').select('id,status,total_amount,created_at,table_id,order_type')
        .eq('branch_id', branchId)
        .in('status', ['pending_waiter','accepted','preparing','ready','served','invoiced']),
      supabase.from('orders').select('status,total_amount,order_type')
        .eq('branch_id', branchId).in('status', ['paid','completed']).gte('created_at', startStr),
      supabase.from('orders').select('created_at,total_amount')
        .eq('branch_id', branchId).in('status', ['paid','completed','served','invoiced']).gte('created_at', startStr),
      supabase.from('restaurant_tables').select('id,table_number,capacity')
        .eq('branch_id', branchId).order('table_number', { ascending: true }),
      supabase.from('shift_assignments').select('id')
        .eq('branch_id', branchId)
        .eq('assignment_date', now.toISOString().split('T')[0])
        .in('status', ['active','present']),
    ])

    const activeOrders = activeRes.data || []
    const completedOrders = completedRes.data || []
    const occupiedIds = new Set()
    let revenue = 0

    completedOrders.forEach(o => { revenue += o.total_amount || 0 })
    activeOrders.forEach(o => {
      if (['served','invoiced'].includes(o.status)) revenue += o.total_amount || 0
      if (o.table_id) occupiedIds.add(o.table_id)
    })

    kpi1.value = revenue.toLocaleString()
    kpi2.value = activeOrders.length.toString()
    kpi4.value = (staffRes.data?.length || 0).toString()

    totalTablesCount.value    = tablesRes.data?.length || 0
    occupiedTablesCount.value = occupiedIds.size
    kpi3.value = totalTablesCount.value > 0 ? occupiedIds.size / totalTablesCount.value : 0

    floorTables.value = (tablesRes.data || []).map(t => ({ ...t, occupied: occupiedIds.has(t.id) }))

    // Order type split (active + completed)
    const allOrders = [...activeOrders, ...completedOrders]
    dineInCount.value   = allOrders.filter(o => o.order_type === 'dine_in').length
    takeawayCount.value = allOrders.filter(o => o.order_type !== 'dine_in').length

    // Process feed
    activeProcesses.value = activeOrders.slice(0, 8).map(o => {
      const isPreparing = ['preparing','accepted'].includes(o.status)
      const isPending   = o.status === 'pending_waiter'
      return {
        id:          o.id,
        pid:         o.id.toString(),
        core:        o.order_type === 'dine_in' ? 'DINE IN' : 'TAKEAWAY',
        coreColor:   isPreparing ? 'orange' : isPending ? 'blue' : 'teal',
        load:        `LKR ${(o.total_amount || 0).toLocaleString()}`,
        status:      o.status.replace(/_/g, ' ').toUpperCase(),
        statusColor: isPreparing ? 'orange' : isPending ? 'blue' : 'teal',
      }
    })

    // Chart
    const trendOrders = trendRes.data || []
    const dates = [], dataPoints = []
    if (timeFilter.value === 'daily') {
      for (let h = 0; h <= 23; h += 2) {
        dates.push(`${String(h).padStart(2,'0')}:00`)
        dataPoints.push(trendOrders.filter(o => new Date(o.created_at).getHours() === h || new Date(o.created_at).getHours() === h+1).reduce((s,o) => s+(o.total_amount||0), 0))
      }
    } else if (timeFilter.value === 'weekly') {
      for (let i = 6; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(d.toLocaleDateString('en', { weekday: 'short' }))
        dataPoints.push(trendOrders.filter(o => o.created_at.startsWith(key)).reduce((s,o) => s+(o.total_amount||0), 0))
      }
    } else {
      for (let i = 29; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(String(d.getDate()))
        dataPoints.push(trendOrders.filter(o => o.created_at.startsWith(key)).reduce((s,o) => s+(o.total_amount||0), 0))
      }
    }

    revenueSeries.value  = [{ name: 'Revenue (LKR)', data: dataPoints }]
    chartOptions.value   = { ...chartOptions.value, xaxis: { ...chartOptions.value.xaxis, categories: dates } }

  } catch (err) {
    console.error('[Dashboard] fetch error:', err)
  } finally {
    loading.value = false
  }
}

async function refreshTableOccupancy() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  try {
    const { data } = await supabase.from('orders').select('table_id')
      .eq('branch_id', branchId)
      .in('status', ['pending_waiter','accepted','preparing','ready','served','invoiced'])
      .not('table_id', 'is', null)
    const ids = new Set((data || []).map(o => o.table_id))
    occupiedTablesCount.value = ids.size
    kpi3.value = totalTablesCount.value > 0 ? ids.size / totalTablesCount.value : 0
    floorTables.value = floorTables.value.map(t => ({ ...t, occupied: ids.has(t.id) }))
  } catch {
    // non-critical refresh — ignore errors
  }
}

// ── Realtime ────────────────────────────────────────────────────
let ordersChannel = null, tablesChannel = null, debounce = null

function subscribeRealtime() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  if (ordersChannel) supabase.removeChannel(ordersChannel)
  if (tablesChannel) supabase.removeChannel(tablesChannel)

  ordersChannel = supabase.channel(`dash-orders-${branchId}-${Date.now()}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'orders', filter:`branch_id=eq.${branchId}` }, () => {
      refreshTableOccupancy()
      clearTimeout(debounce)
      debounce = setTimeout(() => fetchDashboardData(), 350)
    })
    .subscribe()

  tablesChannel = supabase.channel(`dash-tables-${branchId}-${Date.now()}`)
    .on('postgres_changes', { event:'*', schema:'public', table:'restaurant_tables', filter:`branch_id=eq.${branchId}` }, () => {
      refreshTableOccupancy()
    })
    .subscribe()
}

// ── Boot ─────────────────────────────────────────────────────────
let booted = false
async function boot() {
  if (booted) return
  const branchId = authStore.currentBranch?.id
  if (!branchId || !authStore.user) return
  booted = true
  await fetchDashboardData()
  subscribeRealtime()
}

watch(timeFilter, () => { if (booted) fetchDashboardData() })
watch(() => authStore.currentBranch?.id, id => { if (id) boot() }, { immediate: true })

onMounted(async () => {
  clockTimer = setInterval(tickClock, 1000)
  if (!authStore.currentBranch?.id) {
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (authStore.currentBranch?.id) { boot(); break }
    }
  }
})

onUnmounted(() => {
  clearInterval(clockTimer)
  clearTimeout(debounce)
  if (ordersChannel) supabase.removeChannel(ordersChannel)
  if (tablesChannel) supabase.removeChannel(tablesChannel)
  booted = false
})
</script>

<style scoped lang="scss">
// ── Page ──────────────────────────────────────────────────────────────────────
.dash-page {
  background: #080e18;
  min-height: 100vh;
  padding: 28px 32px 40px;
  color: #e2e8f0;
  font-family: inherit;
}

// ── Header ────────────────────────────────────────────────────────────────────
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;

  &__left { display: flex; flex-direction: column; gap: 4px; }
  &__right { display: flex; align-items: center; gap: 14px; }

  &__brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  &__brand-name {
    font-size: 22px;
    font-weight: 800;
    color: #f1f5f9;
    letter-spacing: -0.4px;
  }
  &__brand-tag {
    font-size: 11px;
    font-weight: 600;
    color: #2563EB;
    background: rgba(37,99,235,0.12);
    border: 1px solid rgba(37,99,235,0.25);
    border-radius: 5px;
    padding: 2px 8px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  &__time-info {
    font-size: 11px;
    color: #475569;
    display: flex;
    align-items: center;
  }
}

// Live badge
.live-pulse-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #10b981;
  background: rgba(16,185,129,0.08);
  border: 1px solid rgba(16,185,129,0.25);
  border-radius: 20px;
  padding: 4px 12px;

  &__dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
    animation: live-pulse 1.8s infinite;
  }
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

.dash-time-toggle {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  overflow: hidden;
  :deep(.q-btn) {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 14px;
    border-radius: 0 !important;
  }
  :deep(.q-btn--active) {
    background: #2563EB !important;
    color: #fff !important;
  }
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;

  @media (max-width: 1100px) { grid-template-columns: repeat(2, 1fr); }
  @media (max-width: 600px)  { grid-template-columns: 1fr; }
}

.kpi-card {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  padding: 20px 20px 18px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 14px;
    pointer-events: none;
  }

  &:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.4); }

  // Accent glow top border per card
  &--revenue { border-top: 2px solid #2563EB; &::after { box-shadow: inset 0 40px 30px -20px rgba(37,99,235,0.07); } }
  &--orders  { border-top: 2px solid #f59e0b; &::after { box-shadow: inset 0 40px 30px -20px rgba(245,158,11,0.07); } }
  &--tables  { border-top: 2px solid #0d9488; &::after { box-shadow: inset 0 40px 30px -20px rgba(13,148,136,0.07); } }
  &--staff   { border-top: 2px solid #7c3aed; &::after { box-shadow: inset 0 40px 30px -20px rgba(124,58,237,0.07); } }

  &__icon-wrap {
    width: 44px; height: 44px;
    border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;

    &--revenue { background: rgba(37,99,235,0.15);  color: #60a5fa; }
    &--orders  { background: rgba(245,158,11,0.15); color: #fcd34d; }
    &--tables  { background: rgba(13,148,136,0.15); color: #2dd4bf; }
    &--staff   { background: rgba(124,58,237,0.15); color: #a78bfa; }
  }

  &__body { flex: 1; min-width: 0; }

  &__label {
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
  }

  &__value {
    font-size: 26px;
    font-weight: 800;
    color: #f1f5f9;
    line-height: 1;
    margin-bottom: 8px;
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  &__currency { font-size: 13px; font-weight: 600; color: #475569; }
  &__unit     { font-size: 16px; font-weight: 600; color: #475569; margin-left: 2px; }

  &__sub {
    font-size: 11px;
    font-weight: 500;
    display: flex;
    align-items: center;
    &--up   { color: #10b981; }
    &--warn { color: #f59e0b; }
    &--info { color: #38bdf8; }
    &--staff{ color: #a78bfa; }
  }

  &__progress-row {
    display: flex;
    align-items: center;
    gap: 0;
  }
  &__progress { flex: 1; }

  &__avatars {
    display: flex;
    align-items: center;
    margin-top: 4px;
  }
  &__avatar-dot {
    width: 20px; height: 20px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed, #a78bfa);
    border: 2px solid #080e18;
    margin-left: -6px;
    &:first-child { margin-left: 0; }
  }
}

// ── Main Grid ─────────────────────────────────────────────────────────────────
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;

  @media (max-width: 1200px) { grid-template-columns: 1fr; }

  &__left  { display: flex; flex-direction: column; gap: 20px; }
  &__right { display: flex; flex-direction: column; gap: 20px; }
}

// ── Cards ─────────────────────────────────────────────────────────────────────
.dash-card {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 14px;
  padding: 22px 24px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  &__header-right { display: flex; align-items: center; gap: 8px; }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
    letter-spacing: -0.2px;
    &--sm { font-size: 13px; }
  }
  &__sub {
    font-size: 11px;
    color: #475569;
    margin-top: 2px;
  }

  &--table-map { padding-bottom: 16px; }
}

.legend-dot {
  width: 10px; height: 10px; border-radius: 50%;
  &--revenue { background: #2563EB; box-shadow: 0 0 6px #2563EB; }
}
.legend-label { font-size: 11px; color: #64748b; }

// ── Split Row (donut + feed) ──────────────────────────────────────────────────
.dash-split-row {
  display: flex;
  gap: 0;
  padding: 0;
  overflow: hidden;

  &__donut {
    width: 200px;
    flex-shrink: 0;
    padding: 22px 16px 22px 24px;
    border-right: 1px solid rgba(255,255,255,0.10);
  }
  &__feed {
    flex: 1;
    padding: 22px 24px;
    min-width: 0;
  }
}

.view-all-btn {
  font-size: 11px !important;
  color: #2563EB !important;
  padding: 2px 8px !important;
  &:hover { background: rgba(37,99,235,0.1) !important; }
}

// ── Order Feed ────────────────────────────────────────────────────────────────
.order-feed {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;

  &__row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 8px;
    background: rgba(255,255,255,0.02);
    font-size: 12px;
    transition: background 0.15s;
    &:hover { background: rgba(255,255,255,0.04); }
  }
  &__dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    &--teal   { background: #2dd4bf; box-shadow: 0 0 4px #2dd4bf; }
    &--orange { background: #fb923c; box-shadow: 0 0 4px #fb923c; }
    &--blue   { background: #60a5fa; box-shadow: 0 0 4px #60a5fa; }
  }
  &__id     { color: #475569; width: 52px; flex-shrink: 0; font-size: 11px; }
  &__type   { color: #94a3b8; flex: 1; }
  &__amount { color: #e2e8f0; font-weight: 600; width: 100px; text-align: right; flex-shrink: 0; }
  &__status {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.4px;
    width: 100px;
    text-align: right;
    flex-shrink: 0;
    &--teal   { color: #2dd4bf; }
    &--orange { color: #fb923c; }
    &--blue   { color: #60a5fa; }
  }
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #334155;
    font-size: 13px;
    padding: 24px 0;
  }
}

// ── Quick Actions ─────────────────────────────────────────────────────────────
.quick-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.qa-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  text-decoration: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: all 0.2s;
  cursor: pointer;

  span { color: #94a3b8; }
  .q-icon { transition: color 0.2s; }

  &:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.12);
    transform: translateY(-2px);
    span { color: #e2e8f0; }
  }

  &--pos       { &:hover { border-color: rgba(37,99,235,0.4);  .q-icon { color: #60a5fa; } } }
  &--kitchen   { &:hover { border-color: rgba(245,158,11,0.4); .q-icon { color: #fcd34d; } } }
  &--orders    { &:hover { border-color: rgba(16,185,129,0.4); .q-icon { color: #34d399; } } }
  &--tables    { &:hover { border-color: rgba(13,148,136,0.4); .q-icon { color: #2dd4bf; } } }
  &--reports   { &:hover { border-color: rgba(139,92,246,0.4); .q-icon { color: #a78bfa; } } }
  &--inventory { &:hover { border-color: rgba(249,115,22,0.4); .q-icon { color: #fb923c; } } }
}

// ── Table Map ─────────────────────────────────────────────────────────────────
.table-map-badge {
  font-size: 11px;
  font-weight: 700;
  color: #0d9488;
  background: rgba(13,148,136,0.12);
  border: 1px solid rgba(13,148,136,0.25);
  border-radius: 6px;
  padding: 3px 10px;
}

.table-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #64748b;
  }
  &__dot {
    width: 10px; height: 10px; border-radius: 3px;
    &--available { background: #059669; }
    &--occupied  { background: #ea580c; }
  }
}

.table-map-scroll {
  height: 260px;
}

.table-map-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  padding: 4px 2px 8px;
}

.table-map-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #334155;
  font-size: 13px;
}

.table-cell {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: default;
  user-select: none;

  &:hover { transform: scale(1.08); }

  &__number {
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
  }
  &__cap {
    font-size: 9px;
    opacity: 0.8;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  &--available {
    background: linear-gradient(135deg, #065f46 0%, #047857 100%);
    border: 1px solid rgba(16,185,129,0.3);
    color: #6ee7b7;
    box-shadow: 0 2px 8px rgba(5,150,105,0.2);
  }

  &--occupied {
    background: linear-gradient(135deg, #7c2d12 0%, #c2410c 100%);
    border: 1px solid rgba(249,115,22,0.4);
    color: #fed7aa;
    box-shadow: 0 2px 8px rgba(234,88,12,0.25);
    animation: occupied-pulse 2.5s infinite;
  }
}

@keyframes occupied-pulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(234,88,12,0.25); }
  50%       { box-shadow: 0 4px 16px rgba(234,88,12,0.5); }
}
</style>
