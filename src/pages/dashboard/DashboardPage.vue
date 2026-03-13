<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="dashboard"
      title="Dashboard"
      breadcrumbs="Home / Overview"
      showRefresh
      @refresh="fetchDashboardData"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Charts -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-md-8" v-if="canViewFinance">
        <DashboardChart
          title="Revenue Trend"
          subtitle="Last 7 Days"
          type="area"
          :series="revenueSeries"
          :options="revenueOptions"
          :loading="loading"
        />
      </div>
      <div class="col-12" :class="canViewFinance ? 'col-md-4' : 'col-md-6'">
        <DashboardChart
          title="Order Status Distribution"
          subtitle="All active + today's orders"
          type="donut"
          height="280"
          :series="orderStatusSeries"
          :options="orderStatusOptions"
          :loading="loading"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <!-- Activity Feed -->
      <div class="col-12 col-md-8">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Recent Activity</div>
            <q-btn flat dense icon="more_horiz" class="text-grey-5" />
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-scroll-area style="height: 350px">
              <q-list class="erp-activity-list" padding>
                <q-item
                  v-for="event in activities"
                  :key="event.id"
                  class="q-pa-sm erp-activity-item"
                >
                  <q-item-section avatar top>
                    <q-avatar
                      size="32px"
                      :color="event.color"
                      text-color="white"
                      :icon="event.icon"
                    />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-body2 text-weight-medium">{{
                      event.action
                    }}</q-item-label>
                    <q-item-label caption class="text-grey-5">{{ event.by }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="text-caption text-grey-6">{{ event.time }}</div>
                  </q-item-section>
                </q-item>
                <div v-if="activities.length === 0" class="text-grey-6 text-center q-pa-md">
                  No recent activity
                </div>
              </q-list>
            </q-scroll-area>
          </q-card-section>
        </q-card>
      </div>

      <!-- System Health -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="q-pb-sm">
            <div class="text-h6 text-subtitle1 text-weight-bold">System Health</div>
          </q-card-section>
          <q-card-section class="col q-pt-none">
            <q-list class="erp-health-list">
              <q-item v-for="sys in systemHealth" :key="sys.name" class="q-px-none q-py-sm">
                <q-item-section>
                  <q-item-label class="text-body2 text-grey-4">{{ sys.name }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-chip
                    :color="sys.status === 'Online' ? 'green-8' : 'red-8'"
                    text-color="white"
                    dense
                    size="sm"
                    outline
                  >
                    {{ sys.status }}
                  </q-chip>
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const authStore = useAuthStore()
const loading = ref(false)

// Security
const canViewFinance = computed(() => authStore.hasAnyRole(['admin', 'finance', 'manager']))

// ── Active statuses (orders currently in pipeline) ─────────────────
const ACTIVE_STATUSES = ['pending_waiter', 'accepted', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'invoiced']

// ── Kitchen queue statuses ─────────────────────────────────────────
const KITCHEN_STATUSES = ['accepted', 'sent_to_kitchen', 'preparing']

// KPI State
const kpis = ref([
  { title: 'Revenue', value: 'LKR 0', icon: 'payments', color: 'green', meta: 'Today' },
  { title: 'Active Orders', value: '0', icon: 'receipt_long', color: 'blue', meta: 'Open' },
  { title: 'Kitchen Queue', value: '0', icon: 'soup_kitchen', color: 'orange', meta: 'Pending' },
  { title: 'Low Stock', value: '0', icon: 'inventory_2', color: 'red', meta: 'Items' },
  { title: 'Today Expenses', value: 'LKR 0', icon: 'money_off', color: 'purple', meta: 'Recorded' },
  { title: 'Staff On Shift', value: '0', icon: 'badge', color: 'primary', meta: 'Present' },
])

// Filter out finance KPIs if no permission
if (!canViewFinance.value) {
  kpis.value = kpis.value.filter((k) => k.title !== 'Revenue' && k.title !== 'Today Expenses')
}

// Chart State
const revenueSeries = ref([{ name: 'Revenue', data: [0, 0, 0, 0, 0, 0, 0] }])
const revenueOptions = ref({
  xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  stroke: { curve: 'smooth' },
  colors: ['#10b981'],
  fill: {
    type: 'gradient',
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] },
  },
})

const orderStatusSeries = ref([0, 0, 0, 0, 0])
const orderStatusOptions = ref({
  labels: ['Pending', 'In Kitchen', 'Ready', 'Served', 'Completed'],
  colors: ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#6b7280'],
  legend: { position: 'bottom' },
  plotOptions: { pie: { donut: { size: '70%' } } },
})

// Lists State
const activities = ref([])
const systemHealth = ref([
  { name: 'POS Terminal', status: 'Online' },
  { name: 'Kitchen Display', status: 'Online' },
  { name: 'Thermal Printers', status: 'Online' },
  { name: 'Database Sync', status: 'Online' },
  { name: 'Realtime Socket', status: 'Online' },
])

// ── Realtime channel ─────────────────────────────────────────────
let ordersChannel = null

async function fetchDashboardData() {
  loading.value = true
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const branchId = authStore.currentBranch?.id

    if (!branchId) return

    // Query 1: ALL active orders (regardless of date) + today's completed orders
    // Active orders can be from any day — they're still in the pipeline
    const pActive = supabase
      .from('orders')
      .select('id, status, total_amount, created_at')
      .eq('branch_id', branchId)
      .in('status', ACTIVE_STATUSES)

    // Query 2: Today's completed/paid orders (for revenue + donut chart)
    const pCompleted = supabase
      .from('orders')
      .select('status, total_amount')
      .eq('branch_id', branchId)
      .in('status', ['paid', 'completed'])
      .gte('created_at', todayStr + 'T00:00:00')

    // Query 3: Low stock
    const pStock = supabase
      .from('stock_on_hand')
      .select('qty_on_hand, items!inner(reorder_level, company_id, name)')
      .eq('items.company_id', authStore.currentBranch?.company_id)

    // Query 4: Activity feed
    const pActivity = supabase
      .from('audit_logs')
      .select('id, action, user_id, created_at, severity')
      .order('created_at', { ascending: false })
      .limit(10)

    // Query 5: Staff on shift today
    const pStaff = supabase
      .from('shift_assignments')
      .select('id')
      .eq('branch_id', branchId)
      .eq('assignment_date', todayStr)
      .in('status', ['scheduled', 'active', 'present'])

    const [activeRes, completedRes, invRes, activityRes, staffRes] = await Promise.all([
      pActive, pCompleted, pStock, pActivity, pStaff,
    ])

    // ── Wire activity feed ──
    if (activityRes.data && activityRes.data.length > 0) {
      const iconMap = { error: 'error', warning: 'warning', info: 'info', success: 'check_circle' }
      const colorMap = { error: 'red', warning: 'orange', info: 'blue', success: 'green' }
      activities.value = activityRes.data.map((log) => ({
        id: log.id,
        action: log.action,
        by: 'System',
        time: new Date(log.created_at).toLocaleTimeString(),
        icon: iconMap[log.severity] || 'history',
        color: colorMap[log.severity] || 'grey',
      }))
    } else {
      activities.value = []
    }

    // ── Process active orders (all time — these are in-progress) ──
    const activeOrders = activeRes.data || []
    let activeCount = 0
    let kitchenQueue = 0
    let pendingWaiter = 0
    let inKitchen = 0
    let readyCount = 0
    let servedCount = 0

    activeOrders.forEach((o) => {
      activeCount++

      if (KITCHEN_STATUSES.includes(o.status)) kitchenQueue++

      // For donut chart: group by status category
      if (o.status === 'pending_waiter') pendingWaiter++
      else if (['accepted', 'sent_to_kitchen', 'preparing'].includes(o.status)) inKitchen++
      else if (o.status === 'ready') readyCount++
      else if (['served', 'invoiced'].includes(o.status)) servedCount++
    })

    // ── Process completed orders (today only — for revenue) ──
    const completedOrders = completedRes.data || []
    let revenue = 0
    let completedCount = 0

    completedOrders.forEach((o) => {
      revenue += o.total_amount || 0
      completedCount++
    })

    // Also add revenue from served orders today
    activeOrders.forEach((o) => {
      if (['served', 'invoiced'].includes(o.status)) {
        const orderDate = new Date(o.created_at).toISOString().split('T')[0]
        if (orderDate === todayStr) {
          revenue += o.total_amount || 0
        }
      }
    })

    // ── Update KPI cards ──
    const revKpi = kpis.value.find((k) => k.title === 'Revenue')
    if (revKpi) revKpi.value = `LKR ${revenue.toLocaleString()}`

    const actKpi = kpis.value.find((k) => k.title === 'Active Orders')
    if (actKpi) actKpi.value = activeCount

    const qKpi = kpis.value.find((k) => k.title === 'Kitchen Queue')
    if (qKpi) qKpi.value = kitchenQueue

    // ── Update donut chart ──
    orderStatusSeries.value = [pendingWaiter, inKitchen, readyCount, servedCount, completedCount]

    // ── Low stock ──
    if (invRes.data) {
      const lowStock = invRes.data.filter(
        (row) => (row.qty_on_hand || 0) <= (row.items?.reorder_level || 0)
      ).length
      const lowKpi = kpis.value.find((k) => k.title === 'Low Stock')
      if (lowKpi) lowKpi.value = lowStock
    }

    // ── Staff on shift ──
    const staffKpi = kpis.value.find((k) => k.title === 'Staff On Shift')
    if (staffKpi) staffKpi.value = staffRes.data?.length || 0

  } catch (err) {
    console.error('Dashboard Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Realtime: subscribe to orders table for live updates ──────────
let dashRefreshTimer = null
function subscribeRealtime() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  // Cleanup existing channel before creating new one
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel)
    ordersChannel = null
  }

  const channelName = `dashboard-orders-${branchId}-${Date.now()}`
  ordersChannel = supabase
    .channel(channelName)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
      () => {
        // Debounced re-fetch to avoid storms from rapid changes
        if (dashRefreshTimer) clearTimeout(dashRefreshTimer)
        dashRefreshTimer = setTimeout(() => fetchDashboardData(), 500)
      }
    )
    .subscribe((status) => {
      console.log('[Dashboard] Realtime status:', status)
      const rtHealth = systemHealth.value.find(s => s.name === 'Realtime Socket')
      if (rtHealth) rtHealth.status = status === 'SUBSCRIBED' ? 'Online' : 'Connecting...'
    })
}

// ── Boot: called once branch is available ──────────────────────────
let booted = false
async function bootDashboard() {
  if (booted) return
  const branchId = authStore.currentBranch?.id
  if (!branchId || !authStore.user) return
  booted = true
  console.log('[Dashboard] Booting with branch:', branchId)
  await fetchDashboardData()
  subscribeRealtime()
}

// Watch for branch becoming available (handles async auth/branch loading)
watch(
  () => authStore.currentBranch?.id,
  (newId) => {
    if (newId) bootDashboard()
  },
  { immediate: true }
)

onMounted(async () => {
  // If branch is already available, boot immediately
  if (authStore.currentBranch?.id && authStore.user) {
    bootDashboard()
  } else {
    // Fallback: wait up to 3 seconds for branch to become available
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (authStore.currentBranch?.id) {
        bootDashboard()
        break
      }
    }
  }
})

onUnmounted(() => {
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel)
    ordersChannel = null
  }
  if (dashRefreshTimer) {
    clearTimeout(dashRefreshTimer)
    dashRefreshTimer = null
  }
  booted = false
})
</script>

<style scoped lang="scss">
.erp-dashboard-panel {
  border: 1px solid var(--erp-input-border, #1f2937);
  border-radius: var(--erp-radius-md, 8px);
}

.erp-activity-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  &:last-child {
    border-bottom: none;
  }
}

.erp-health-list {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
