<template>
  <q-page class="q-pa-md">
    <div class="text-h5 text-weight-bold q-mb-md">Biometric Devices</div>

    <div class="row q-gutter-md q-mb-lg">
      <q-card flat bordered class="col-12 col-md-4" v-for="stat in stats" :key="stat.label">
        <q-card-section class="row items-center">
          <q-icon :name="stat.icon" :color="stat.color" size="28px" />
          <div class="q-ml-md">
            <div class="text-h6 text-weight-bold">{{ stat.value }}</div>
            <div class="text-caption text-grey">{{ stat.label }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Sync Actions -->
    <div class="row q-gutter-sm q-mb-md">
      <q-btn color="primary" icon="sync" label="Sync Pending" @click="syncPending" :loading="syncing" />
      <q-btn-toggle v-model="statusFilter" flat no-caps :options="[
        { label: 'All', value: null },
        { label: 'Pending', value: 'pending' },
        { label: 'Synced', value: 'synced' },
        { label: 'Failed', value: 'failed' },
      ]" />
    </div>

    <!-- Sync Logs Table -->
    <q-table :rows="filteredLogs" :columns="columns" row-key="id" flat bordered
             :loading="loading" :pagination="{ rowsPerPage: 25 }">
      <template #body-cell-sync_status="props">
        <q-td :props="props">
          <q-badge :color="syncColor(props.row.sync_status)" :label="props.row.sync_status" />
        </q-td>
      </template>
      <template #body-cell-punch_type="props">
        <q-td :props="props">
          <q-icon :name="punchIcon(props.row.punch_type)" size="18px" class="q-mr-xs" />
          {{ props.row.punch_type.replace(/_/g, ' ') }}
        </q-td>
      </template>
    </q-table>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchBiometricLogs, syncPendingEntries } from '../services/biometric.service'
import { useDeviceStore } from '../stores/device.store'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const deviceStore = useDeviceStore()
const logs = ref([])
const loading = ref(false)
const syncing = ref(false)
const statusFilter = ref(null)
const branchId = ref(null)

const filteredLogs = computed(() =>
  statusFilter.value ? logs.value.filter(l => l.sync_status === statusFilter.value) : logs.value
)

const stats = computed(() => [
  { label: 'Biometric Devices', value: deviceStore.biometricDevices.length, icon: 'fingerprint', color: 'primary' },
  { label: 'Pending Syncs', value: logs.value.filter(l => l.sync_status === 'pending').length, icon: 'pending', color: 'warning' },
  { label: 'Failed Syncs', value: logs.value.filter(l => l.sync_status === 'failed').length, icon: 'error', color: 'negative' },
])

const columns = [
  { name: 'employee_id', label: 'Employee', field: 'employee_id', align: 'left' },
  { name: 'punch_type', label: 'Type', field: 'punch_type', align: 'left' },
  { name: 'punch_time', label: 'Punch Time', field: 'punch_time', format: v => new Date(v).toLocaleString(), sortable: true, align: 'left' },
  { name: 'device', label: 'Device', field: r => r.devices?.device_name || '—', align: 'left' },
  { name: 'sync_status', label: 'Status', field: 'sync_status', sortable: true, align: 'center' },
  { name: 'synced_at', label: 'Synced At', field: 'synced_at', format: v => v ? new Date(v).toLocaleString() : '—', align: 'left' },
]

function syncColor(s) {
  return { pending: 'warning', synced: 'positive', failed: 'negative', duplicate: 'grey' }[s] || 'grey'
}
function punchIcon(t) {
  return { clock_in: 'login', clock_out: 'logout', break_start: 'free_breakfast', break_end: 'play_arrow' }[t] || 'schedule'
}

onMounted(async () => {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  branchId.value = authStore.activeBranchId || authStore.user?.branch_id
  if (branchId.value) {
    loading.value = true
    deviceStore.loadDevices(branchId.value)
    const result = await fetchBiometricLogs(branchId.value)
    if (result.data) logs.value = result.data
    loading.value = false
  }
})

async function syncPending() {
  syncing.value = true
  try {
    const result = await syncPendingEntries(branchId.value)
    $q.notify({ type: 'positive', message: `Synced: ${result.synced}, Failed: ${result.failed}` })
    const refreshed = await fetchBiometricLogs(branchId.value)
    if (refreshed.data) logs.value = refreshed.data
  } finally {
    syncing.value = false
  }
}
</script>
