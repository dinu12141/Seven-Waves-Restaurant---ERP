<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="operations"
      title="Operations Dashboard"
      breadcrumbs="Operations / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Active Orders List/Chart -->
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
        <q-card
          class="erp-dashboard-panel shadow-1 column full-height"
          style="background: var(--erp-bg-card); color: var(--erp-text-primary)"
        >
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Pending Actions</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item
                v-for="action in pendingActions"
                :key="action.id"
                class="q-pa-sm erp-activity-item"
              >
                <q-item-section avatar top>
                  <q-avatar
                    size="32px"
                    :color="action.type === 'kitchen' ? 'orange-8' : 'blue-8'"
                    text-color="white"
                    :icon="action.icon"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    action.title
                  }}</q-item-label>
                  <q-item-label caption style="color: var(--erp-text-muted)">{{
                    action.desc
                  }}</q-item-label>
                </q-item-section>
              </q-item>
              <div v-if="pendingActions.length === 0" class="text-grey-6 text-center q-pa-md">
                No pending actions.
              </div>
            </q-list>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'

const $q = useQuasar()
const isDark = computed(() => $q.dark.isActive)

const loading = ref(false)
let timer = null

const kpis = ref([
  { title: 'Active Orders', value: '0', icon: 'receipt_long', color: 'blue', isCurrency: false },
  {
    title: 'Pending Waiter Actions',
    value: '0',
    icon: 'room_service',
    color: 'orange',
    isCurrency: false,
  },
  { title: 'Kitchen Queue', value: '0', icon: 'soup_kitchen', color: 'red', isCurrency: false },
  { title: 'Cashier Activity', value: '0', icon: 'local_atm', color: 'green', isCurrency: true },
  { title: 'Table Occupancy', value: '0%', icon: 'deck', color: 'purple', isCurrency: false },
  { title: 'Completed Today', value: '0', icon: 'check_circle', color: 'teal', isCurrency: false },
])

const pendingActions = ref([])

const orderSeries = ref([{ name: 'Orders', data: [] }])
const orderOptions = ref({})

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[0].value = '12'
    kpis.value[1].value = '3'
    kpis.value[2].value = '8'
    kpis.value[3].value = '150000'
    kpis.value[4].value = '65%'
    kpis.value[5].value = '45'

    pendingActions.value = [
      {
        id: 1,
        title: 'Order #1042 Ready',
        desc: 'Table 4 needs serving',
        icon: 'room_service',
        type: 'waiter',
      },
      {
        id: 2,
        title: 'Kitchen Delay',
        desc: 'Order #1039 exceeds prep time',
        icon: 'timer',
        type: 'kitchen',
      },
    ]

    orderSeries.value = [{ name: 'Orders', data: [5, 8, 3, 2, 1] }]
    orderOptions.value = {
      chart: { type: 'bar', toolbar: { show: false }, background: 'transparent' },
      theme: { mode: isDark.value ? 'dark' : 'light' },
      xaxis: {
        categories: ['Draft', 'Placed', 'Preparing', 'Ready', 'Served'],
        labels: { style: { colors: '#9ca3af' } },
      },
      yaxis: { labels: { style: { colors: '#9ca3af' } } },
      colors: ['#3b82f6'],
      grid: { borderColor: isDark.value ? '#374151' : '#e5e7eb', strokeDashArray: 4 },
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
