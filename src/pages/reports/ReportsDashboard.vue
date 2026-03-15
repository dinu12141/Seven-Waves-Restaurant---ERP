<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="reports"
      title="Reports Dashboard"
      breadcrumbs="Reports / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Top Reports -->
      <div class="col-12 col-md-8">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Available Reports</div>
            <q-btn flat dense icon="filter_list" class="text-grey-5" />
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <div class="row q-col-gutter-sm">
              <div v-for="cat in reportCategories" :key="cat.name" class="col-12 col-sm-6 col-md-4">
                <q-card class="bg-blue-grey-9 rounded-borders non-selectable cursor-pointer" flat bordered @click="$router.push(cat.route)">
                  <q-card-section class="q-pa-sm row items-center no-wrap">
                    <q-icon :name="cat.icon" size="24px" class="q-mr-sm text-primary" />
                    <div class="text-subtitle2 text-weight-regular">{{ cat.name }}</div>
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Recent Exports -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Recent Exports</div>
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="exportItem in recentExports" :key="exportItem.id" class="q-pa-sm erp-activity-item cursor-pointer">
                <q-item-section avatar top>
                  <q-icon name="download" color="grey-5" size="20px" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{ exportItem.name }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ exportItem.time }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge color="primary" outline>{{ exportItem.format }}</q-badge>
                </q-item-section>
              </q-item>
              <div v-if="recentExports.length === 0" class="text-grey-6 text-center q-pa-md">
                No recent exports.
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

const loading = ref(false)
let timer = null

const kpis = ref([
  { title: 'Total Reports', value: '45', icon: 'bar_chart', color: 'blue', isCurrency: false },
  { title: 'Exports Today', value: '0', icon: 'file_download', color: 'teal', isCurrency: false },
  { title: 'Top Report', value: 'Sales', icon: 'trending_up', color: 'orange', isCurrency: false },
  { title: 'Avg Export Time', value: '1.2s', icon: 'timer', color: 'purple', isCurrency: false },
  { title: 'Scheduled', value: '3', icon: 'event', color: 'indigo', isCurrency: false },
  { title: 'Success Rate', value: '100%', icon: 'check_circle', color: 'green', isCurrency: false },
])

const recentExports = ref([])

const reportCategories = ref([
  { name: 'Sales Output', icon: 'receipt_long', route: '/reports/sales' },
  { name: 'Electronic Journal', icon: 'auto_stories', route: '/reports/electronic-journal' },
  { name: 'Item Wise Sale', icon: 'summarize', route: '/reports/item-wise-sale' },
  { name: 'Waiter Performance', icon: 'person_search', route: '/reports/waiter-wise-sale' },
  { name: 'Table Occupancy', icon: 'deck', route: '/reports/table-wise-sale' },
  { name: 'Inventory Ledger', icon: 'inventory_2', route: '/reports/inventory' },
])

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[1].value = '12'
    kpis.value[2].value = 'Daily Sales'

    recentExports.value = [
      { id: 1, name: 'Sales_Report_2026-03-15', time: '10 mins ago', format: 'CSV' },
      { id: 2, name: 'Inventory_Ledger', time: '1 hour ago', format: 'Excel' }
    ]

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
