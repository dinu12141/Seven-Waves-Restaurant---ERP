<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="procurement"
      title="Procurement Dashboard"
      breadcrumbs="Procurement / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Purchases Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Procurement Activity"
          subtitle="Orders vs Receipts vs Invoices"
          type="line"
          :series="procurementSeries"
          :options="procurementOptions"
          :loading="loading"
        />
      </div>

      <!-- Pending POs / AP -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold truncate">Supplier Alerts</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="alert in alerts" :key="alert.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar
                    size="32px"
                    :color="alert.color"
                    text-color="white"
                    :icon="alert.icon"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    alert.title
                  }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ alert.desc }}</q-item-label>
                </q-item-section>
              </q-item>
              <div v-if="alerts.length === 0" class="text-grey-6 text-center q-pa-md">
                No active alerts.
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const loading = ref(false)
let timer = null

const kpis = ref([
  { title: 'Pending POs', value: '0', icon: 'assignment_late', color: 'orange', isCurrency: false },
  {
    title: 'Active Suppliers',
    value: '45',
    icon: 'local_shipping',
    color: 'blue',
    isCurrency: false,
  },
  { title: 'Today GRN', value: '0', icon: 'move_to_inbox', color: 'teal', isCurrency: false },
  { title: 'Pending AP', value: '0', icon: 'request_quote', color: 'red', isCurrency: true },
  { title: 'Paid Today', value: '0', icon: 'payments', color: 'green', isCurrency: true },
  {
    title: 'Return Rate',
    value: '0%',
    icon: 'assignment_return',
    color: 'purple',
    isCurrency: false,
  },
])

const alerts = ref([])

const procurementSeries = ref([
  { name: 'Purchase Orders', data: [] },
  { name: 'Goods Receipts', data: [] },
])
const procurementOptions = ref({})

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[0].value = '8'
    kpis.value[2].value = '12'
    kpis.value[3].value = '450000'
    kpis.value[4].value = '120000'
    kpis.value[5].value = '1.5%'

    alerts.value = [
      {
        id: 1,
        title: 'Overdue AP',
        desc: 'Supplier A invoice #4001',
        icon: 'warning',
        color: 'red-8',
      },
      {
        id: 2,
        title: 'Pending Approval',
        desc: 'PO #1092 requires approval',
        icon: 'rule',
        color: 'orange-8',
      },
    ]

    procurementSeries.value = [
      { name: 'Purchase Orders', data: [15, 20, 10, 30, 25, 12, 18] },
      { name: 'Goods Receipts', data: [12, 18, 15, 25, 22, 10, 16] },
    ]
    procurementOptions.value = {
      chart: { type: 'line', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: 'dark' },
      stroke: { curve: 'smooth', width: 3 },
      xaxis: {
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#f59e0b', '#10b981'],
      grid: { borderColor: '#374151', strokeDashArray: 4 },
      dataLabels: { enabled: false },
    }

    loading.value = false
  }, 600)
}

onMounted(() => {
  fetchData()
  timer = setInterval(fetchData, 30000)
})

onUnmounted(() => {
  clearInterval(timer)
})
</script>
