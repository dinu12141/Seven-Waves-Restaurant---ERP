<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="inventory"
      title="Inventory Dashboard"
      breadcrumbs="Supply Chain / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <div class="row q-col-gutter-md">
      <!-- Alerts -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold text-orange">Low Stock Alerts</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="alert in lowStock" :key="alert.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar size="32px" color="orange-8" text-color="white" icon="warning" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    alert.name
                  }}</q-item-label>
                  <q-item-label caption class="text-grey-5"
                    >{{ alert.stock }} left (Min: {{ alert.min }})</q-item-label
                  >
                </q-item-section>
              </q-item>
              <div v-if="lowStock.length === 0" class="text-grey-6 text-center q-pa-md">
                No low stock items.
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>

      <!-- Main Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Stock Movements"
          subtitle="Inbound vs Outbound over last 7 days"
          type="area"
          :series="stockSeries"
          :options="stockOptions"
          :loading="loading"
        />
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
  { title: 'Total Warehouses', value: '4', icon: 'warehouse', color: 'blue', isCurrency: false },
  { title: 'Stock on Hand', value: '0', icon: 'inventory_2', color: 'green', isCurrency: true },
  { title: 'Low Stock Items', value: '0', icon: 'warning', color: 'orange', isCurrency: false },
  { title: 'Today GRN', value: '0', icon: 'move_to_inbox', color: 'teal', isCurrency: false },
  { title: 'Today GIN', value: '0', icon: 'outbox', color: 'deep-purple', isCurrency: false },
  {
    title: 'Stock Value',
    value: '0',
    icon: 'account_balance_wallet',
    color: 'indigo',
    isCurrency: true,
  },
])

const lowStock = ref([])
const stockSeries = ref([
  { name: 'Inbound', data: [] },
  { name: 'Outbound', data: [] },
])
const stockOptions = ref({})

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[1].value = '2450'
    kpis.value[2].value = '12'
    kpis.value[3].value = '8'
    kpis.value[4].value = '23'
    kpis.value[5].value = '1250000'

    lowStock.value = [
      { id: 1, name: 'Tomato Paste', stock: 5, min: 20 },
      { id: 2, name: 'Cooking Oil (L)', stock: 12, min: 50 },
    ]

    stockSeries.value = [
      { name: 'Inbound', data: [120, 400, 50, 60, 200, 310, 150] },
      { name: 'Outbound', data: [80, 150, 200, 90, 100, 250, 180] },
    ]
    stockOptions.value = {
      chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: 'dark' },
      xaxis: {
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#10b981', '#ef4444'],
      grid: { borderColor: '#374151', strokeDashArray: 4 },
      dataLabels: { enabled: false },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] },
      },
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
