<template>
  <q-page class="q-pa-md">
    <!-- Unified Device Navigation Header -->
    <DeviceNavHeader />

    <div class="text-subtitle1 text-weight-bold text-grey-8 q-mb-md">Device Health & Telemetry Diagnostics</div>

    <!-- Health Overview -->
    <div class="row q-gutter-md q-mb-lg">
      <q-card flat bordered class="col" v-for="metric in metrics" :key="metric.label">
        <q-card-section class="row items-center">
          <q-circular-progress :value="metric.pct" size="56px" :thickness="0.3"
                               :color="metric.pct > 80 ? 'positive' : metric.pct > 50 ? 'warning' : 'negative'" track-color="grey-3" />
          <div class="q-ml-md">
            <div class="text-h6 text-weight-bold">{{ metric.value }}</div>
            <div class="text-caption text-grey">{{ metric.label }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Alert History -->
    <DeviceAlertPanel :alerts="deviceStore.alerts" @resolve="resolveAlert" class="q-mb-lg" />

    <!-- Full Device Table -->
    <DeviceHealthTable
      :devices="deviceStore.devices"
      :loading="deviceStore.loading"
      @refresh="loadAll"
      @edit="() => {}"
      @heartbeat="heartbeatDevice"
      @delete="() => {}"
    />

    <!-- Auto-refresh toggle -->
    <div class="q-mt-md row items-center">
      <q-toggle v-model="autoRefresh" label="Auto-refresh every 30s" />
      <q-badge v-if="lastRefresh" class="q-ml-md" color="grey-5">
        Last: {{ lastRefresh.toLocaleTimeString() }}
      </q-badge>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDeviceStore } from '../stores/device.store'
import DeviceHealthTable from '../components/DeviceHealthTable.vue'
import DeviceAlertPanel from '../components/DeviceAlertPanel.vue'
import DeviceNavHeader from '../components/DeviceNavHeader.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const deviceStore = useDeviceStore()
const autoRefresh = ref(false)
const lastRefresh = ref(null)
const branchId = ref(null)
let refreshInterval = null

const metrics = computed(() => {
  const total = deviceStore.devices.length || 1
  const online = deviceStore.onlineDevices.length
  return [
    { label: 'Online Devices', value: `${online}/${deviceStore.devices.length}`, pct: Math.round(online / total * 100) },
    { label: 'Printers OK', value: deviceStore.printers.filter(p => p.status === 'online').length, pct: deviceStore.printers.length ? Math.round(deviceStore.printers.filter(p => p.status === 'online').length / deviceStore.printers.length * 100) : 100 },
    { label: 'Unresolved Alerts', value: deviceStore.unresolvedAlerts.length, pct: deviceStore.alerts.length ? Math.round((1 - deviceStore.unresolvedAlerts.length / Math.max(deviceStore.alerts.length, 1)) * 100) : 100 },
  ]
})

onMounted(async () => {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  branchId.value = authStore.activeBranchId || authStore.user?.branch_id
  if (branchId.value) loadAll()
})

onUnmounted(() => { if (refreshInterval) clearInterval(refreshInterval) })

// Watch autoRefresh
import { watch } from 'vue'
watch(autoRefresh, (val) => {
  if (refreshInterval) clearInterval(refreshInterval)
  if (val) {
    refreshInterval = setInterval(loadAll, 30000)
  }
})

async function loadAll() {
  if (!branchId.value) return
  await Promise.all([
    deviceStore.loadDevices(branchId.value),
    deviceStore.loadAlerts(branchId.value),
  ])
  lastRefresh.value = new Date()
}

async function heartbeatDevice(device) {
  await deviceStore.heartbeat(device.id)
  $q.notify({ type: 'positive', message: `Heartbeat: ${device.device_name}` })
  loadAll()
}

async function resolveAlert(alert) {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  await deviceStore.resolveAlert(alert.id, authStore.user?.id)
  $q.notify({ type: 'positive', message: 'Alert resolved' })
}
</script>
