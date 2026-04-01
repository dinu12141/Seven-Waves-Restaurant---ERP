<template>
  <q-page class="q-pa-md">
    <ERPToolbar moduleName="hr" title="HR Dashboard" breadcrumbs="Human Resources / Overview" />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- HR Chart -->
      <div class="col-12 col-md-8">
        <DashboardChart
          title="Attendance & Shifts"
          subtitle="Staff present over the last 7 days"
          type="bar"
          :series="hrSeries"
          :options="hrOptions"
          :loading="loading"
        />
      </div>

      <!-- Live Staff Activity -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Leave & Alerts</div>
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
                <q-item-section side v-if="alert.action">
                  <q-btn flat dense color="primary" label="View" size="sm" />
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
  { title: 'Total Staff', value: '45', icon: 'groups', color: 'blue', isCurrency: false },
  { title: 'On-Shift Now', value: '0', icon: 'directions_run', color: 'green', isCurrency: false },
  { title: 'On Leave Today', value: '0', icon: 'event_busy', color: 'purple', isCurrency: false },
  { title: 'Pending Payroll', value: '0', icon: 'payments', color: 'orange', isCurrency: true },
  { title: 'Avg Rating', value: '4.8', icon: 'star', color: 'teal', isCurrency: false },
  { title: 'Open Shifts', value: '0', icon: 'schedule', color: 'indigo', isCurrency: false },
])

const alerts = ref([])

const hrSeries = ref([
  { name: 'Present', data: [] },
  { name: 'Absent', data: [] },
])
const hrOptions = ref({})

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[1].value = '18'
    kpis.value[2].value = '2'
    kpis.value[3].value = '450000'
    kpis.value[5].value = '4'

    alerts.value = [
      {
        id: 1,
        title: 'Annual Leave Req',
        desc: 'John Doe - Next Week',
        icon: 'beach_access',
        color: 'blue-8',
        action: true,
      },
      {
        id: 2,
        title: 'Overtime Alert',
        desc: 'Waiters exceeding 40hrs',
        icon: 'timer',
        color: 'orange-8',
        action: true,
      },
    ]

    hrSeries.value = [
      { name: 'Present', data: [40, 42, 45, 41, 40, 38, 44] },
      { name: 'Absent', data: [5, 3, 0, 4, 5, 7, 1] },
    ]
    hrOptions.value = {
      chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', stacked: true },
      theme: { mode: 'dark' },
      xaxis: {
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#3b82f6', '#ef4444'],
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
