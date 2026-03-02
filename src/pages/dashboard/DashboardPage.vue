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
          subtitle="Today's active orders"
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
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const authStore = useAuthStore()
const loading = ref(false)

// Security
const canViewFinance = computed(() => authStore.hasAnyRole(['admin', 'finance', 'manager']))

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

const orderStatusSeries = ref([0, 0, 0, 0])
const orderStatusOptions = ref({
  labels: ['Pending', 'Preparing', 'Ready', 'Completed'],
  colors: ['#f59e0b', '#3b82f6', '#10b981', '#6b7280'],
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

async function fetchDashboardData() {
  loading.value = true
  try {
    const todayStr = new Date().toISOString().split('T')[0]
    const branchId = authStore.currentBranch?.id

    if (!branchId) return

    // Minimal optimized queries
    const p1 = supabase
      .from('orders')
      .select('status, total_amount')
      .eq('branch_id', branchId)
      .gte('created_at', todayStr + 'T00:00:00')

    const p2 = supabase
      .from('inventory_items')
      .select('quantity, reorder_level')
      .eq('branch_id', branchId)

    // Activity mock (usually fetched from an audit log table)
    activities.value = [
      {
        id: 1,
        action: 'Order #ORD-1294 placed',
        by: 'Waiter: John',
        time: '2 mins ago',
        icon: 'receipt',
        color: 'blue',
      },
      {
        id: 2,
        action: 'Low stock alert: Tomatoes',
        by: 'System',
        time: '15 mins ago',
        icon: 'warning',
        color: 'orange',
      },
      {
        id: 3,
        action: 'Payroll processed',
        by: 'HR Admin',
        time: '1 hr ago',
        icon: 'payments',
        color: 'green',
      },
    ]

    const [ordersRes, invRes] = await Promise.all([p1, p2])

    if (ordersRes.data) {
      let active = 0,
        queue = 0,
        revenue = 0
      let pending = 0,
        prep = 0,
        ready = 0,
        comp = 0

      ordersRes.data.forEach((o) => {
        if (!['cancelled'].includes(o.status)) revenue += o.total_amount || 0
        if (!['completed', 'cancelled', 'paid'].includes(o.status)) active++
        if (['accepted', 'preparing', 'cooking'].includes(o.status)) queue++

        if (o.status === 'pending') pending++
        else if (['accepted', 'preparing'].includes(o.status)) prep++
        else if (o.status === 'ready') ready++
        else if (['completed', 'paid', 'served'].includes(o.status)) comp++
      })

      orderStatusSeries.value = [pending, prep, ready, comp]

      const revKpi = kpis.value.find((k) => k.title === 'Revenue')
      if (revKpi) revKpi.value = `LKR ${revenue.toLocaleString()}`

      const actKpi = kpis.value.find((k) => k.title === 'Active Orders')
      if (actKpi) actKpi.value = active

      const qKpi = kpis.value.find((k) => k.title === 'Kitchen Queue')
      if (qKpi) qKpi.value = queue
    }

    if (invRes.data) {
      const lowStock = invRes.data.filter((i) => (i.quantity || 0) <= (i.reorder_level || 0)).length
      const lowKpi = kpis.value.find((k) => k.title === 'Low Stock')
      if (lowKpi) lowKpi.value = lowStock
    }
  } catch (err) {
    console.error('Dashboard Error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (authStore.user) {
    fetchDashboardData()
  }
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
