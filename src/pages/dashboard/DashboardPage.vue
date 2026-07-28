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
          no-caps
          unelevated
          dense
          toggle-color="primary"
          color="transparent"
          text-color="grey-5"
          :options="[
            { label: 'Today', value: 'daily' },
            { label: 'Week', value: 'weekly' },
            { label: 'Month', value: 'monthly' },
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
        <div class="kpi-card__icon-wrap">
          <q-icon name="payments" size="22px" color="white" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Gross Revenue</div>
          <div class="kpi-card__value">
            <span class="kpi-card__currency">LKR</span>
            {{ kpi1 }}
          </div>
          <div class="kpi-card__sub kpi-card__sub--up">
            <q-icon name="trending_up" size="12px" class="q-mr-xs" />
            {{
              timeFilter === 'daily'
                ? "Today's"
                : timeFilter === 'weekly'
                  ? "This Week's"
                  : "This Month's"
            }}
            Sales
          </div>
        </div>
        <q-icon name="savings" size="64px" class="kpi-card__bg-icon" />
      </div>

      <!-- Active Orders -->
      <div class="kpi-card kpi-card--orders">
        <div class="kpi-card__icon-wrap">
          <q-icon name="receipt_long" size="22px" color="white" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Active Orders</div>
          <div class="kpi-card__value">{{ kpi2 }}</div>
          <div class="kpi-card__sub kpi-card__sub--warn">
            <q-icon name="pending_actions" size="12px" class="q-mr-xs" />
            {{ kpi2 }} Pending Actions
          </div>
        </div>
        <q-icon name="restaurant_menu" size="64px" class="kpi-card__bg-icon" />
      </div>

      <!-- Table Occupancy -->
      <div class="kpi-card kpi-card--tables">
        <div class="kpi-card__icon-wrap">
          <q-icon name="table_restaurant" size="22px" color="white" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Table Occupancy</div>
          <div class="kpi-card__value">
            {{ (kpi3 * 100).toFixed(0) }}<span class="kpi-card__unit">%</span>
          </div>
          <div class="kpi-card__progress-row">
            <q-linear-progress
              :value="kpi3"
              color="white"
              track-color="rgba(255,255,255,0.25)"
              size="4px"
              rounded
              class="kpi-card__progress"
            />
            <span class="kpi-card__sub kpi-card__sub--info q-ml-sm"
              >{{ occupiedTablesCount }}/{{ totalTablesCount }}</span
            >
          </div>
        </div>
        <q-icon name="chair" size="64px" class="kpi-card__bg-icon" />
      </div>

      <!-- Active Staff -->
      <div class="kpi-card kpi-card--staff">
        <div class="kpi-card__icon-wrap">
          <q-icon name="groups" size="22px" color="white" />
        </div>
        <div class="kpi-card__body">
          <div class="kpi-card__label">Active Staff</div>
          <div class="kpi-card__value">{{ kpi4 }}</div>
          <div class="kpi-card__avatars">
            <div v-for="n in Math.min(Number(kpi4), 5)" :key="n" class="kpi-card__avatar-dot"></div>
            <span class="kpi-card__sub kpi-card__sub--staff q-ml-xs">On Floor</span>
          </div>
        </div>
        <q-icon name="badge" size="64px" class="kpi-card__bg-icon" />
      </div>
    </div>

    <!-- ══════════════════════════════════════════════
         MAIN CONTENT GRID
    ══════════════════════════════════════════════ -->
    <div class="dash-grid">
      <!-- ── LEFT COLUMN ── -->
      <div class="dash-grid__left">
        <!-- Revenue Chart -->
        <div class="dash-card dash-card--chart">
          <div class="dash-card__header">
            <div>
              <div class="dash-card__title dash-card__title--light">Revenue Trend</div>
              <div class="dash-card__sub dash-card__sub--light">Sales performance · {{ timeFilter }}</div>
            </div>
            <div class="dash-card__header-right">
              <div class="legend-dot legend-dot--revenue"></div>
              <span class="legend-label legend-label--light">Revenue</span>
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
              <div v-for="proc in activeProcesses" :key="proc.id" class="order-feed__row">
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
            <div class="table-map-badge">{{ occupiedTablesCount }} / {{ totalTablesCount }}</div>
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
                :class="['table-cell--' + t.status, { 'cursor-pointer': true }]"
                @click="openTableOrder(t)"
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

    <!-- ══════════════════════════════════════════════
         TABLE ORDER DIALOG
    ══════════════════════════════════════════════ -->
    <q-dialog v-model="showTableOrderDialog" position="right" maximized>
      <q-card class="table-order-panel">
        <q-card-section class="table-order-panel__header">
          <div class="row items-center q-gutter-sm">
            <q-icon name="table_restaurant" size="24px" color="orange-8" />
            <div>
              <div class="text-h6 text-weight-bold">{{ selectedTableName }}</div>
              <div class="text-caption text-grey-6">Order details &amp; tracking</div>
            </div>
          </div>
          <q-btn flat round dense icon="close" @click="showTableOrderDialog = false" />
        </q-card-section>

        <q-separator />

        <q-card-section v-if="tableOrderLoading" class="column items-center q-pa-xl">
          <q-spinner-orbit size="40px" color="primary" />
          <div class="text-grey-6 q-mt-md">Loading order details...</div>
        </q-card-section>

        <q-card-section v-else-if="!tableOrderData" class="column items-center q-pa-xl">
          <q-icon name="info" size="40px" color="grey-5" />
          <div class="text-grey-6 q-mt-md">No active order found for this table.</div>
          <q-btn
            v-if="authStore.isAdmin || authStore.roles?.includes('manager')"
            flat
            color="negative"
            icon="delete"
            label="Delete Table"
            class="q-mt-lg"
            @click="deleteSelectedTable"
          />
        </q-card-section>

        <q-scroll-area v-else style="height: calc(100vh - 80px)">
          <q-card-section>
            <!-- Order Header -->
            <div class="tod-order-header">
              <div>
                <div class="tod-order-number">Order #{{ tableOrderData.order_number }}</div>
                <div class="text-caption text-grey-6">
                  {{ formatOrderTime(tableOrderData.created_at) }}
                </div>
              </div>
              <q-chip
                :color="orderStatusColorMap[tableOrderData.status] || 'grey-7'"
                text-color="white"
                dense
                class="text-weight-bold"
              >
                {{ (tableOrderData.status || '').replace(/_/g, ' ').toUpperCase() }}
              </q-chip>
            </div>

            <!-- Waiter Info -->
            <div v-if="tableOrderData.waiter_name" class="tod-section">
              <div class="tod-section__label">Assigned Waiter</div>
              <div class="tod-waiter-chip">
                <q-icon name="person" size="16px" color="blue-8" class="q-mr-xs" />
                {{ tableOrderData.waiter_name }}
              </div>
            </div>

            <!-- Order Status Timeline -->
            <div class="tod-section">
              <div class="tod-section__label">Order Progress</div>
              <div class="tod-timeline">
                <div
                  v-for="step in orderTimeline"
                  :key="step.key"
                  class="tod-timeline__step"
                  :class="{
                    'tod-timeline__step--done': step.done,
                    'tod-timeline__step--active': step.active,
                  }"
                >
                  <div class="tod-timeline__dot">
                    <q-icon v-if="step.done" name="check" size="12px" />
                    <q-spinner-dots v-else-if="step.active" size="12px" color="blue" />
                  </div>
                  <div class="tod-timeline__info">
                    <div class="tod-timeline__label">{{ step.label }}</div>
                    <div v-if="step.time" class="tod-timeline__time">{{ step.time }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- KOT Status -->
            <div v-if="tableOrderData.kot_tickets?.length" class="tod-section">
              <div class="tod-section__label">Kitchen Tickets (KOT)</div>
              <div class="tod-kot-list">
                <div v-for="kot in tableOrderData.kot_tickets" :key="kot.id" class="tod-kot-card">
                  <div class="tod-kot-card__header">
                    <span class="text-weight-bold">KOT #{{ kot.kot_number }}</span>
                    <q-chip
                      dense
                      size="sm"
                      :color="kotStatusColor(kot.status)"
                      text-color="white"
                      >{{ kot.status?.toUpperCase() }}</q-chip
                    >
                  </div>
                  <div v-if="kot.kitchens?.name" class="text-caption text-grey-6">
                    <q-icon name="soup_kitchen" size="12px" class="q-mr-xs" />
                    {{ kot.kitchens.name }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Order Items -->
            <div class="tod-section">
              <div class="tod-section__label">
                Items ({{ tableOrderData.order_items?.length || 0 }})
              </div>
              <div class="tod-items-list">
                <div v-for="item in tableOrderData.order_items" :key="item.id" class="tod-item-row">
                  <div class="tod-item-row__qty">{{ item.quantity }}×</div>
                  <div class="tod-item-row__name">{{ item.menu_items?.name || 'Item' }}</div>
                  <div class="tod-item-row__price">
                    LKR {{ (item.total_price || 0).toLocaleString() }}
                  </div>
                </div>
              </div>
              <div class="tod-total-row">
                <span>Total</span>
                <span class="tod-total-row__value"
                  >LKR {{ (tableOrderData.total_amount || 0).toLocaleString() }}</span
                >
              </div>
            </div>
          </q-card-section>
        </q-scroll-area>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const loading = ref(false)
// ── Time Filter — persisted in localStorage, defaults to 'monthly' ───────────
const PERIOD_KEY = 'sw-dash-period'
const _savedPeriod = localStorage.getItem(PERIOD_KEY)
const timeFilter = ref(
  ['daily', 'weekly', 'monthly'].includes(_savedPeriod) ? _savedPeriod : 'monthly',
)
watch(timeFilter, (val) => localStorage.setItem(PERIOD_KEY, val))


// ── KPIs ────────────────────────────────────────────────────────
const kpi1 = ref('0')
const kpi2 = ref('0')
const kpi3 = ref(0)
const kpi4 = ref('0')
const activeProcesses = ref([])
const floorTables = ref([])
const occupiedTablesCount = ref(0)
const totalTablesCount = ref(0)
const dineInCount = ref(0)
const takeawayCount = ref(0)

// ── Live clock ──────────────────────────────────────────────────
const currentTime = ref('')
const currentDate = ref('')
let clockTimer = null
function tickClock() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  currentDate.value = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}
tickClock()

// ── Charts ──────────────────────────────────────────────────────
const revenueSeries = ref([{ name: 'Revenue', data: Array(7).fill(0) }])

const chartOptions = ref({
  chart: {
    type: 'area',
    toolbar: { show: false },
    background: 'transparent',
    sparkline: { enabled: false },
    dropShadow: {
      enabled: true,
      top: 0,
      left: 0,
      blur: 8,
      color: '#06b6d4',
      opacity: 0.4,
    },
  },
  colors: ['#06b6d4'],
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 3 },
  fill: {
    type: 'gradient',
    gradient: {
      shade: 'dark',
      type: 'vertical',
      shadeIntensity: 0.5,
      gradientToColors: ['#8b5cf6'],
      inverseColors: false,
      opacityFrom: 0.6,
      opacityTo: 0.02,
      stops: [0, 85, 100],
    },
  },
  xaxis: {
    categories: [],
    labels: { style: { colors: '#94a3b8', fontSize: '10px', fontFamily: 'inherit' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: {
      show: true,
      style: { colors: '#64748b', fontSize: '10px', fontFamily: 'inherit' },
      formatter: (val) => {
        if (val >= 1000000) return 'LKR ' + (val / 1000000).toFixed(1) + 'M'
        if (val >= 1000) return 'LKR ' + (val / 1000).toFixed(0) + 'K'
        return val > 0 ? 'LKR ' + val : '0'
      },
    },
  },
  grid: {
    borderColor: 'rgba(148,163,184,0.08)',
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { left: 10, right: 10 },
  },
  markers: {
    size: 0,
    hover: { size: 5, sizeOffset: 2 },
  },
  crosshairs: {
    show: true,
    stroke: { color: '#06b6d4', width: 1, dashArray: 3 },
  },
  tooltip: {
    theme: $q.dark.isActive ? 'dark' : 'light',
    x: { show: true },
    style: { fontSize: '12px' },
    y: {
      formatter: (val) => 'LKR ' + (val || 0).toLocaleString(),
    },
  },
})

const donutSeries = computed(() => [dineInCount.value || 0, takeawayCount.value || 0])
const donutOptions = ref({
  chart: { type: 'donut', background: 'transparent' },
  colors: ['#06b6d4', '#8b5cf6'],
  labels: ['Dine In', 'Takeaway'],
  legend: { show: true, position: 'bottom', fontSize: '11px', labels: { colors: '#94a3b8' } },
  stroke: { show: false },
  dataLabels: { enabled: false },
  plotOptions: {
    pie: {
      donut: {
        size: '68%',
        labels: {
          show: true,
          name: { color: '#94a3b8', fontSize: '11px' },
          value: { color: '#fff', fontSize: '18px', fontWeight: 700 },
          total: { show: true, label: 'Total', color: '#94a3b8', fontSize: '11px' },
        },
      },
    },
  },
  tooltip: { theme: $q.dark.isActive ? 'dark' : 'light' },
})

watch(
  () => $q.dark.isActive,
  (dark) => {
    chartOptions.value.tooltip.theme = dark ? 'dark' : 'light'
    donutOptions.value.tooltip.theme = dark ? 'dark' : 'light'
  },
)

// ── Data fetching ────────────────────────────────────────────────
async function fetchDashboardData() {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const now = new Date()
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (timeFilter.value === 'weekly')
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    if (timeFilter.value === 'monthly')
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)
    const startStr = start.toISOString()

    const [activeRes, completedRes, trendRes, tablesRes, staffRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id,status,total_amount,created_at,table_id,order_type')
        .eq('branch_id', branchId)
        .in('status', ['pending_waiter', 'accepted', 'preparing', 'ready', 'served', 'invoiced'])
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('status,total_amount,order_type')
        .eq('branch_id', branchId)
        .in('status', ['paid', 'completed'])
        .gte('created_at', startStr),
      supabase
        .from('orders')
        .select('created_at,total_amount')
        .eq('branch_id', branchId)
        .in('status', ['paid', 'completed', 'served', 'invoiced'])
        .gte('created_at', startStr),
      supabase
        .from('restaurant_tables')
        .select('id,table_number,capacity,status')
        .eq('branch_id', branchId)
        .order('table_number', { ascending: true }),
      supabase
        .from('shift_assignments')
        .select('id')
        .eq('branch_id', branchId)
        .eq('assignment_date', now.toISOString().split('T')[0])
        .in('status', ['active', 'present']),
    ])

    const activeOrders = activeRes.data || []
    const completedOrders = completedRes.data || []
    const occupiedIds = new Set()
    let revenue = 0

    // Filter active orders that actually fall within the selected period
    const periodActiveOrders = activeOrders.filter((o) => new Date(o.created_at) >= start)

    completedOrders.forEach((o) => {
      if (['paid', 'completed'].includes(o.status)) revenue += o.total_amount || 0
    })
    periodActiveOrders.forEach((o) => {
      if (['paid', 'completed'].includes(o.status)) revenue += o.total_amount || 0
    })
    
    // Occupancy is based on ALL active orders, regardless of date (e.g. stuck overnight orders)
    activeOrders.forEach((o) => {
      if (o.table_id) occupiedIds.add(o.table_id)
    })

    kpi1.value = revenue.toLocaleString()
    kpi2.value = periodActiveOrders.length.toString()
    kpi4.value = (staffRes.data?.length || 0).toString()

    totalTablesCount.value = tablesRes.data?.length || 0
    const occupiedCount = (tablesRes.data || []).filter((t) => t.status === 'occupied').length
    occupiedTablesCount.value = occupiedCount
    kpi3.value = totalTablesCount.value > 0 ? occupiedCount / totalTablesCount.value : 0

    // Use restaurant_tables.status directly (maintained by trg_orders_sync_table_status trigger)
    floorTables.value = (tablesRes.data || []).map((t) => ({
      ...t,
      occupied: t.status === 'occupied',
    }))

    // Order type split (periodActiveOrders + completedOrders)
    const allOrders = [...periodActiveOrders, ...completedOrders]
    dineInCount.value = allOrders.filter((o) => o.order_type === 'dine_in').length
    takeawayCount.value = allOrders.filter((o) => o.order_type !== 'dine_in').length

    // Process feed
    activeProcesses.value = periodActiveOrders.slice(0, 8).map((o) => {
      const isPreparing = ['preparing', 'accepted'].includes(o.status)
      const isPending = o.status === 'pending_waiter'
      return {
        id: o.id,
        pid: o.id.toString(),
        core: o.order_type === 'dine_in' ? 'DINE IN' : 'TAKEAWAY',
        coreColor: isPreparing ? 'orange' : isPending ? 'blue' : 'teal',
        load: `LKR ${(o.total_amount || 0).toLocaleString()}`,
        status: o.status.replace(/_/g, ' ').toUpperCase(),
        statusColor: isPreparing ? 'orange' : isPending ? 'blue' : 'teal',
      }
    })

    // Chart
    const trendOrders = trendRes.data || []
    const dates = [],
      dataPoints = []
    if (timeFilter.value === 'daily') {
      for (let h = 0; h <= 23; h += 2) {
        dates.push(`${String(h).padStart(2, '0')}:00`)
        dataPoints.push(
          trendOrders
            .filter(
              (o) =>
                new Date(o.created_at).getHours() === h ||
                new Date(o.created_at).getHours() === h + 1,
            )
            .reduce((s, o) => s + (o.total_amount || 0), 0),
        )
      }
    } else if (timeFilter.value === 'weekly') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(d.toLocaleDateString('en', { weekday: 'short' }))
        dataPoints.push(
          trendOrders
            .filter((o) => o.created_at.startsWith(key))
            .reduce((s, o) => s + (o.total_amount || 0), 0),
        )
      }
    } else {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
        const key = d.toISOString().split('T')[0]
        dates.push(String(d.getDate()))
        dataPoints.push(
          trendOrders
            .filter((o) => o.created_at.startsWith(key))
            .reduce((s, o) => s + (o.total_amount || 0), 0),
        )
      }
    }

    revenueSeries.value = [{ name: 'Revenue (LKR)', data: dataPoints }]
    chartOptions.value = {
      ...chartOptions.value,
      xaxis: { ...chartOptions.value.xaxis, categories: dates },
    }
  } catch (err) {
    console.error('[Dashboard] fetch error:', err)
    $q.notify({ type: 'negative', message: 'Dashboard data failed to load', caption: err?.message, icon: 'cloud_off', timeout: 4000 })
  } finally {
    loading.value = false
  }
}

async function refreshTableOccupancy() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  try {
    // Read directly from restaurant_tables.status — kept in sync by trg_orders_sync_table_status
    const { data } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, capacity, status')
      .eq('branch_id', branchId)
      .order('table_number', { ascending: true })

    if (!data) return
    const occupiedCount = data.filter((t) => t.status === 'occupied').length
    totalTablesCount.value = data.length
    occupiedTablesCount.value = occupiedCount
    kpi3.value = data.length > 0 ? occupiedCount / data.length : 0
    floorTables.value = data.map((t) => ({ ...t, occupied: t.status === 'occupied' }))
  } catch {
    // non-critical refresh — ignore errors
  }
}

// ── Realtime ────────────────────────────────────────────────────
let ordersChannel = null,
  tablesChannel = null,
  debounce = null

function subscribeRealtime() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return
  if (ordersChannel) supabase.removeChannel(ordersChannel)
  if (tablesChannel) supabase.removeChannel(tablesChannel)

  ordersChannel = supabase
    .channel(`dash-orders-${branchId}-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
      () => {
        refreshTableOccupancy()
        clearTimeout(debounce)
        debounce = setTimeout(() => fetchDashboardData(), 350)
      },
    )
    .subscribe()

  tablesChannel = supabase
    .channel(`dash-tables-${branchId}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `branch_id=eq.${branchId}`,
      },
      () => {
        refreshTableOccupancy()
      },
    )
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

watch(timeFilter, () => {
  if (booted) fetchDashboardData()
})
watch(
  () => authStore.currentBranch?.id,
  (id) => {
    if (id) boot()
  },
  { immediate: true },
)

onMounted(async () => {
  clockTimer = setInterval(tickClock, 1000)
  if (!authStore.currentBranch?.id) {
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (authStore.currentBranch?.id) {
        boot()
        break
      }
    }
  }
})

// ── Table Order Dialog ──────────────────────────────────────────
const showTableOrderDialog = ref(false)
const tableOrderData = ref(null)
const tableOrderLoading = ref(false)
const selectedTableName = ref('')
const selectedTableId = ref(null)

const orderStatusColorMap = {
  pending_waiter: 'orange-8',
  accepted: 'blue-8',
  sent_to_kitchen: 'indigo-8',
  preparing: 'deep-purple-8',
  ready: 'amber-9',
  served: 'green-8',
  invoiced: 'teal-8',
  paid: 'green-9',
}

function kotStatusColor(status) {
  const map = { created: 'blue-grey-6', cooking: 'orange-8', ready: 'amber-9', served: 'green-8' }
  return map[status] || 'grey-6'
}

function formatOrderTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

const orderTimeline = computed(() => {
  if (!tableOrderData.value) return []
  const status = tableOrderData.value.status
  const steps = [
    {
      key: 'placed',
      label: 'Order Placed',
      statuses: [
        'pending_waiter',
        'accepted',
        'sent_to_kitchen',
        'preparing',
        'ready',
        'served',
        'invoiced',
        'paid',
      ],
    },
    {
      key: 'accepted',
      label: 'Waiter Accepted',
      statuses: ['accepted', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'invoiced', 'paid'],
    },
    {
      key: 'preparing',
      label: 'Kitchen Preparing',
      statuses: ['preparing', 'ready', 'served', 'invoiced', 'paid'],
    },
    { key: 'ready', label: 'Food Ready', statuses: ['ready', 'served', 'invoiced', 'paid'] },
    { key: 'served', label: 'Served to Table', statuses: ['served', 'invoiced', 'paid'] },
    { key: 'invoiced', label: 'Bill Generated', statuses: ['invoiced', 'paid'] },
    { key: 'paid', label: 'Payment Complete', statuses: ['paid'] },
  ]
  return steps.map((s) => {
    const active = s.key === status || (s.key === 'placed' && status === 'pending_waiter')
    return {
      ...s,
      active,
      done: !active && s.statuses.includes(status),
      time: null,
    }
  })
})

async function openTableOrder(table) {
  selectedTableId.value = table.id
  selectedTableName.value = table.table_number || `Table ${table.id?.slice(-4)}`
  showTableOrderDialog.value = true
  tableOrderLoading.value = true
  tableOrderData.value = null

  try {
    const branchId = authStore.currentBranch?.id
    const { data } = await supabase
      .from('orders')
      .select(
        `
        id, order_number, status, total_amount, created_at, updated_at,
        order_type, notes, assigned_waiter_id, payment_status,
        order_items ( id, quantity, unit_price, total_price, status, menu_items ( name ) ),
        kot_tickets ( id, kot_number, status, kitchen_id, kitchens ( name ) )
      `,
      )
      .eq('branch_id', branchId)
      .eq('table_id', table.id)
      .in('status', [
        'pending_waiter',
        'accepted',
        'sent_to_kitchen',
        'preparing',
        'ready',
        'served',
        'invoiced',
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      // Fetch waiter name
      let waiterName = null
      if (data.assigned_waiter_id) {
        const { data: wp } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.assigned_waiter_id)
          .maybeSingle()
        waiterName = wp?.full_name
      }
      tableOrderData.value = { ...data, waiter_name: waiterName }
    }
  } catch (e) {
    console.error(e)
  } finally {
    tableOrderLoading.value = false
  }
}

async function deleteSelectedTable() {
  if (!selectedTableId.value) return
  $q.dialog({
    title: 'Confirm Delete',
    message: `Are you sure you want to delete ${selectedTableName.value}?`,
    cancel: true,
    persistent: true,
    color: 'negative'
  }).onOk(async () => {
    try {
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', selectedTableId.value)
      if (error) {
        if (error.message.includes('foreign key constraint')) {
          throw new Error('Cannot delete this table because it has past orders.')
        }
        throw error
      }
      $q.notify({ type: 'positive', message: 'Table deleted successfully' })
      showTableOrderDialog.value = false
      await fetchDashboardData()
    } catch (err) {
      $q.notify({ type: 'negative', message: err.message || 'Failed to delete table' })
    }
  })
}

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
  background: var(--erp-dash-bg);
  min-height: 100vh;
  padding: 28px 32px 40px;
  color: var(--erp-dash-text);
  font-family: inherit;
}

// ── Header ────────────────────────────────────────────────────────────────────
.dash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;

  &__left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__right {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  &__brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  &__brand-name {
    font-size: 22px;
    font-weight: 800;
    color: var(--erp-dash-brand-name);
    letter-spacing: -0.4px;
  }
  &__brand-tag {
    font-size: 11px;
    font-weight: 600;
    color: #2563eb;
    background: rgba(37, 99, 235, 0.12);
    border: 1px solid rgba(37, 99, 235, 0.25);
    border-radius: 5px;
    padding: 2px 8px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  &__time-info {
    color: var(--erp-dash-time);
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
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 20px;
  padding: 4px 12px;

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
    animation: live-pulse 1.8s infinite;
  }
}
@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.7);
  }
}

.dash-time-toggle {
  border: 1px solid var(--erp-dash-toggle-border);
  border-radius: 8px;
  overflow: hidden;
  :deep(.q-btn) {
    font-size: 12px;
    font-weight: 600;
    padding: 5px 14px;
    border-radius: 0 !important;
  }
  :deep(.q-btn--active) {
    background: var(--erp-primary) !important;
    color: #fff !important;
  }
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  border-radius: var(--erp-radius-lg);
  padding: 16px 18px 14px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  position: relative;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  border: none;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }

  // Full gradient backgrounds — consistent with Quick Actions style
  &--revenue {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--orders {
    background: linear-gradient(135deg, #78350f 0%, #d97706 100%);
    box-shadow: 0 4px 14px rgba(217, 119, 6, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--tables {
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%);
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--staff {
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%);
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }

  // Frosted white icon circle
  &__icon-wrap {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    min-width: 0;
    position: relative;
    z-index: 1;
  }

  &__label {
    font-size: var(--erp-font-size-caption);
    font-weight: var(--erp-font-weight-semibold);
    color: rgba(255, 255, 255, 0.75);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
  }

  &__value {
    font-size: var(--erp-font-size-kpi);
    font-weight: var(--erp-font-weight-black);
    color: #ffffff;
    line-height: 1;
    margin-bottom: 8px;
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  &__currency {
    font-size: var(--erp-font-size-table);
    font-weight: var(--erp-font-weight-semibold);
    color: rgba(255, 255, 255, 0.7);
  }
  &__unit {
    font-size: 16px;
    font-weight: var(--erp-font-weight-semibold);
    color: rgba(255, 255, 255, 0.7);
    margin-left: 2px;
  }

  &__sub {
    font-size: var(--erp-font-size-caption);
    font-weight: var(--erp-font-weight-medium);
    display: flex;
    align-items: center;
    color: rgba(255, 255, 255, 0.8);
    // All sub variants use same white tint on gradient bg
    &--up, &--warn, &--info, &--staff {
      color: rgba(255, 255, 255, 0.8);
    }
  }

  &__progress-row {
    display: flex;
    align-items: center;
    gap: 0;
  }
  &__progress {
    flex: 1;
  }

  &__avatars {
    display: flex;
    align-items: center;
    margin-top: 4px;
  }
  &__avatar-dot {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    border: 2px solid rgba(255, 255, 255, 0.6);
    margin-left: -5px;
    &:first-child {
      margin-left: 0;
    }
  }

  // Large watermark background icon
  &__bg-icon {
    position: absolute;
    right: -10px;
    bottom: -10px;
    opacity: 0.08;
    pointer-events: none;
    color: white !important;
  }
}

// ── Main Grid ─────────────────────────────────────────────────────────────────
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }

  &__left {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  &__right {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
}

// ── Cards ─────────────────────────────────────────────────────────────────────
.dash-card {
  background: var(--erp-bg-main);
  border: 1px solid var(--erp-border-strong);
  border-radius: var(--erp-radius-lg);
  padding: 14px 16px;
  box-shadow: var(--erp-shadow-card);

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16px;
  }
  &__header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__title {
    font-size: var(--erp-font-size-h4);
    font-weight: var(--erp-font-weight-bold);
    color: var(--erp-text-primary);
    letter-spacing: -0.2px;
    &--sm {
      font-size: var(--erp-font-size-table);
    }
  }
  &__sub {
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-tertiary);
    margin-top: 2px;
  }

  &--chart {
    background: var(--erp-bg-card);
    border: 1px solid var(--erp-border);
    box-shadow: var(--erp-shadow-sm, 0 1px 4px rgba(0,0,0,0.08));
    position: relative;
    overflow: hidden;

    .body--dark & {
      background: linear-gradient(145deg, #0f172a 0%, #1e1b4b 50%, #0c1a2e 100%);
      border: 1px solid rgba(6, 182, 212, 0.2);
      box-shadow: 0 4px 24px rgba(6, 182, 212, 0.08), 0 1px 4px rgba(0,0,0,0.4);
    }

    &::before {
      content: '';
      position: absolute;
      top: -60px;
      right: -60px;
      width: 180px;
      height: 180px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    &::after {
      content: '';
      position: absolute;
      bottom: -40px;
      left: 20px;
      width: 140px;
      height: 140px;
      background: radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%);
      pointer-events: none;
    }

    // Force ApexCharts to be transparent — remove white plot background
    :deep(.apexcharts-canvas),
    :deep(.apexcharts-canvas svg),
    :deep(.apexcharts-inner),
    :deep(.apexcharts-plot-series) {
      background: transparent !important;
    }
    :deep(.apexcharts-canvas rect:first-child) {
      fill: transparent !important;
    }
  }

  &__title--light {
    color: #f8fafc;
  }
  &__sub--light {
    color: rgba(148, 163, 184, 0.8);
  }

  &--table-map {
    padding-bottom: 16px;
  }
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  &--revenue {
    background: #06b6d4;
    box-shadow: 0 0 8px rgba(6, 182, 212, 0.7);
  }
}
.legend-label {
  font-size: var(--erp-font-size-caption);
  color: var(--erp-text-muted);
  &--light {
    color: rgba(148, 163, 184, 0.85);
  }
}

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
    border-right: 1px solid var(--erp-border-strong);
  }
  &__feed {
    flex: 1;
    padding: 22px 24px;
    min-width: 0;
  }
}

.view-all-btn {
  font-size: var(--erp-font-size-caption) !important;
  color: var(--erp-primary) !important;
  padding: 2px 8px !important;
  &:hover {
    background: var(--erp-primary-subtle) !important;
  }
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
    background: var(--erp-bg-stripe);
    font-size: var(--erp-font-size-small);
    transition: background 0.15s;
    &:hover {
      background: var(--erp-bg-card-hover);
    }
  }
  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    &--teal {
      background: var(--erp-teal-light);
      box-shadow: 0 0 4px var(--erp-teal-light);
    }
    &--orange {
      background: var(--erp-orange-light);
      box-shadow: 0 0 4px var(--erp-orange-light);
    }
    &--blue {
      background: var(--erp-primary-light);
      box-shadow: 0 0 4px var(--erp-primary-light);
    }
  }
  &__id {
    color: var(--erp-text-tertiary);
    width: 52px;
    flex-shrink: 0;
    font-size: var(--erp-font-size-caption);
  }
  &__type {
    color: var(--erp-text-secondary);
    flex: 1;
  }
  &__amount {
    color: var(--erp-text-primary);
    font-weight: var(--erp-font-weight-semibold);
    width: 100px;
    text-align: right;
    flex-shrink: 0;
  }
  &__status {
    font-size: var(--erp-font-size-tiny);
    font-weight: var(--erp-font-weight-bold);
    letter-spacing: 0.4px;
    width: 100px;
    text-align: right;
    flex-shrink: 0;
    &--teal {
      color: var(--erp-teal-light);
    }
    &--orange {
      color: var(--erp-orange-light);
    }
    &--blue {
      color: var(--erp-primary-light);
    }
  }
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-text-tertiary);
    font-size: var(--erp-font-size-table);
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
  padding: 16px 8px 14px;
  border-radius: var(--erp-radius-lg);
  border: none;
  text-decoration: none;
  color: #ffffff;
  font-size: var(--erp-font-size-caption);
  font-weight: var(--erp-font-weight-bold);
  letter-spacing: 0.4px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;
  position: relative;
  overflow: hidden;

  // Watermark bg icon
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--erp-radius-lg);
  }

  span {
    color: rgba(255, 255, 255, 0.92);
    position: relative;
    z-index: 1;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.6px;
  }
  .q-icon {
    position: relative;
    z-index: 1;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
    color: #ffffff;
    span { color: #ffffff; }
  }

  &--pos {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--kitchen {
    background: linear-gradient(135deg, #78350f 0%, #d97706 100%);
    box-shadow: 0 4px 14px rgba(217, 119, 6, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--orders {
    background: linear-gradient(135deg, #065f46 0%, #059669 100%);
    box-shadow: 0 4px 14px rgba(5, 150, 105, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--tables {
    background: linear-gradient(135deg, #134e4a 0%, #0d9488 100%);
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--reports {
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%);
    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
  &--inventory {
    background: linear-gradient(135deg, #7c2d12 0%, #ea580c 100%);
    box-shadow: 0 4px 14px rgba(234, 88, 12, 0.25), inset 0 1px 0 rgba(255,255,255,0.1);
  }
}

// ── Table Map ─────────────────────────────────────────────────────────────────
.table-map-badge {
  font-size: var(--erp-font-size-caption);
  font-weight: var(--erp-font-weight-bold);
  color: var(--erp-teal);
  background: var(--erp-teal-subtle);
  border: 1px solid rgba(13, 148, 136, 0.25);
  border-radius: var(--erp-radius-md);
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
    font-size: var(--erp-font-size-caption);
    color: var(--erp-text-muted);
  }
  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    &--available {
      background: #059669;
    }
    &--occupied {
      background: #ea580c;
    }
  }
}

.table-map-scroll {
  height: 240px;
}

.table-map-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
  padding: 2px 2px 4px;
}

.table-map-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--erp-text-tertiary);
  font-size: var(--erp-font-size-table);
}

.table-cell {
  aspect-ratio: 1;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  cursor: default;
  user-select: none;
  min-width: 0;

  &:hover {
    transform: scale(1.06);
  }

  &__number {
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.3px;
  }
  &__cap {
    font-size: 7px;
    opacity: 0.75;
    display: flex;
    align-items: center;
    gap: 1px;
  }

  &--available {
    background: linear-gradient(135deg, #065f46 0%, #047857 100%);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
    box-shadow: 0 1px 4px rgba(5, 150, 105, 0.2);
  }

  &--occupied {
    background: linear-gradient(135deg, #7c2d12 0%, #c2410c 100%);
    border: 1px solid rgba(249, 115, 22, 0.4);
    color: #fed7aa;
    box-shadow: 0 1px 4px rgba(234, 88, 12, 0.25);
    animation: occupied-pulse 2.5s infinite;
  }

  &--clickable {
    cursor: pointer;
    &:hover {
      transform: scale(1.08);
    }
  }
}

@keyframes occupied-pulse {
  0%,
  100% {
    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.25);
  }
  50% {
    box-shadow: 0 4px 16px rgba(234, 88, 12, 0.5);
  }
}

// ── Table Order Dialog ────────────────────────────────────────────────────────
.table-order-panel {
  width: 440px;
  max-width: 100vw;
  height: 100vh;
  border-radius: 0;
  background: var(--erp-bg-page, #f8fafc) !important;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: var(--erp-bg-card, #ffffff);
  }
}

.tod-order-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}
.tod-order-number {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--erp-text-primary, #1e293b);
}

.tod-section {
  margin-bottom: 20px;
  &__label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--erp-text-muted, #94a3b8);
    margin-bottom: 10px;
  }
}

.tod-waiter-chip {
  display: inline-flex;
  align-items: center;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #1e40af;
}

// Timeline
.tod-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
  position: relative;

  &__step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 8px 0;
    position: relative;

    &:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 11px;
      top: 28px;
      bottom: -8px;
      width: 2px;
      background: #e2e8f0;
    }

    &--done:not(:last-child)::before {
      background: #10b981;
    }
    &--active:not(:last-child)::before {
      background: linear-gradient(to bottom, #3b82f6, #e2e8f0);
    }
  }

  &__dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: #f1f5f9;
    border: 2px solid #e2e8f0;
    color: #94a3b8;

    .tod-timeline__step--done & {
      background: #10b981;
      border-color: #10b981;
      color: #fff;
    }
    .tod-timeline__step--active & {
      background: #eff6ff;
      border-color: #3b82f6;
      color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
  }

  &__info {
    flex: 1;
  }
  &__label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--erp-text-tertiary, #94a3b8);

    .tod-timeline__step--done & {
      color: var(--erp-text-primary, #1e293b);
    }
    .tod-timeline__step--active & {
      color: #2563eb;
      font-weight: 700;
    }
  }
  &__time {
    font-size: 0.72rem;
    color: var(--erp-text-muted, #94a3b8);
  }
}

// KOT
.tod-kot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tod-kot-card {
  background: var(--erp-bg-card, #fff);
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 14px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
}

// Items
.tod-items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tod-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--erp-bg-input, #fff);
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 8px;
  font-size: 0.85rem;

  &__qty {
    font-weight: 700;
    color: var(--erp-text-muted, #94a3b8);
    min-width: 28px;
  }
  &__name {
    flex: 1;
    color: var(--erp-text-primary, #1e293b);
    font-weight: 600;
  }
  &__price {
    font-weight: 700;
    color: var(--erp-text-secondary, #64748b);
  }
}

.tod-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--erp-text-primary, #1e293b);

  &__value {
    font-size: 1.1rem;
    font-weight: 800;
    color: #059669;
  }
}
</style>
