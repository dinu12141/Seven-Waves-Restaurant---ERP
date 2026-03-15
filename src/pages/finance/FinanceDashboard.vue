<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="finance"
      title="Finance Dashboard"
      breadcrumbs="Finance / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Finance Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Revenue & Expenses"
          subtitle="Daily trend over current month"
          type="area"
          :series="financeSeries"
          :options="financeOptions"
          :loading="loading"
        />
      </div>

      <!-- Unpaid AP -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Pending Postings</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="posting in postings" :key="posting.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar size="32px" color="blue-grey-8" text-color="white" icon="receipt_long" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{ posting.ref }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ posting.type }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="text-caption text-right text-white">{{ posting.amount }}</div>
                </q-item-section>
              </q-item>
              <div v-if="postings.length === 0" class="text-grey-6 text-center q-pa-md">
                No pending postings.
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
  { title: 'Today Revenue', value: '0', icon: 'account_balance', color: 'green', isCurrency: true },
  { title: 'Payment Summary', value: '0', icon: 'payments', color: 'blue', isCurrency: true },
  { title: 'Unpaid Invoices', value: '0', icon: 'request_quote', color: 'red', isCurrency: true },
  { title: 'Net Margin', value: '0%', icon: 'trending_up', color: 'teal', isCurrency: false },
  { title: 'Cashier Totals', value: '0', icon: 'local_atm', color: 'purple', isCurrency: true },
  { title: 'Expense Today', value: '0', icon: 'shopping_cart', color: 'orange', isCurrency: true },
])

const postings = ref([])

const financeSeries = ref([{ name: 'Revenue', data: [] }, { name: 'Expense', data: [] }])
const financeOptions = ref({})

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[0].value = '850000'
    kpis.value[1].value = '800000'
    kpis.value[2].value = '150000'
    kpis.value[3].value = '45%'
    kpis.value[4].value = '420000'
    kpis.value[5].value = '50000'

    postings.value = [
      { id: 1, ref: 'GJ-40192', type: 'AP Invoice', amount: '25,000' },
      { id: 2, ref: 'GJ-40193', type: 'Payroll', amount: '450,000' }
    ]

    financeSeries.value = [
      { name: 'Revenue', data: [150, 200, 180, 220, 300, 450, 400] },
      { name: 'Expense', data: [50, 60, 40, 80, 100, 120, 90] }
    ]
    financeOptions.value = {
      chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: 'dark' },
      xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], labels: { style: { colors: '#9ca3af' } } },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#10b981', '#ef4444'],
      grid: { borderColor: '#374151', strokeDashArray: 4 },
      dataLabels: { enabled: false },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } }
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
