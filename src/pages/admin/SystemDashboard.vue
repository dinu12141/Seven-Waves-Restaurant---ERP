<template>
  <q-page class="q-pa-md">
    <ERPToolbar
      moduleName="system"
      title="System Dashboard"
      breadcrumbs="System Admin / Overview"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div v-for="(stat, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard v-bind="stat" />
      </div>
    </div>

    <!-- Main Content -->
    <div class="row q-col-gutter-md">
      <!-- Database/System Health -->
      <div class="col-12 col-md-8">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">System Health Monitor</div>
          </q-card-section>
          <q-card-section class="col q-pt-md">
            <div class="row q-col-gutter-md">
              <div v-for="sys in sysHealth" :key="sys.name" class="col-12 col-sm-6 col-md-4">
                <q-card class="bg-blue-grey-9 non-selectable rounded-borders" bordered flat>
                  <q-card-section>
                    <div class="row items-center justify-between q-mb-xs">
                      <div class="text-subtitle2 text-grey-4">{{ sys.name }}</div>
                      <q-icon
                        :name="sys.status ? 'check_circle' : 'error'"
                        :color="sys.status ? 'green-5' : 'red-5'"
                        size="20px"
                      />
                    </div>
                    <div class="text-caption" :class="sys.status ? 'text-green-3' : 'text-red-3'">
                      {{ sys.desc }}
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Audit / Security Alerts -->
      <div class="col-12 col-md-4">
        <q-card class="erp-dashboard-panel bg-dark text-white shadow-1 column full-height">
          <q-card-section class="row items-center justify-between q-pb-none">
            <div class="text-h6 text-subtitle1 text-weight-bold">Security Alerts</div>
            <q-btn flat dense icon="security" class="text-grey-5" />
          </q-card-section>
          <q-card-section class="col q-pt-sm">
            <q-list class="erp-activity-list" padding>
              <q-item v-for="log in auditLogs" :key="log.id" class="q-pa-sm erp-activity-item">
                <q-item-section avatar top>
                  <q-avatar size="32px" color="blue-grey-8" text-color="white" :icon="log.icon" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{ log.event }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ log.time }}</q-item-label>
                </q-item-section>
              </q-item>
              <div v-if="auditLogs.length === 0" class="text-grey-6 text-center q-pa-md">
                No active threats or logs.
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
  { title: 'Active Users', value: '15', icon: 'person', color: 'blue', isCurrency: false },
  { title: 'Roles Configured', value: '8', icon: 'security', color: 'purple', isCurrency: false },
  { title: 'Failed Logins', value: '0', icon: 'warning', color: 'red', isCurrency: false },
  { title: 'API Uptime', value: '100%', icon: 'cloud_queue', color: 'teal', isCurrency: false },
  { title: 'Database Load', value: '0%', icon: 'storage', color: 'indigo', isCurrency: false },
  { title: 'Memory Usage', value: '0GB', icon: 'memory', color: 'orange', isCurrency: false },
])

const auditLogs = ref([])
const sysHealth = ref([])

const fetchData = async () => {
  loading.value = true
  setTimeout(() => {
    kpis.value[2].value = '0'
    kpis.value[4].value = '12%'
    kpis.value[5].value = '1.4GB'

    auditLogs.value = [
      { id: 1, event: 'Admin Login', time: '5 mins ago', icon: 'login' },
      { id: 2, event: 'Settings Updated', time: '1 hour ago', icon: 'settings' },
    ]

    sysHealth.value = [
      { name: 'Supabase Database', desc: 'Connected & Healthy', status: true },
      { name: 'Realtime Channels', desc: 'Sync Active', status: true },
      { name: 'Auth Server', desc: 'Operational', status: true },
      { name: 'Storage Bucket', desc: 'Operational', status: true },
      { name: 'Edge Functions', desc: 'Responsive (< 50ms latency)', status: true },
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
