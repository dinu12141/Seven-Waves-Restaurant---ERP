<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="text-h5 text-weight-bold">Biometric Devices</div>
      <q-space />
      <q-btn color="primary" icon="add" label="Add Device" @click="showAddDialog = true" />
    </div>

    <q-banner v-if="!isElectron" class="bg-warning text-dark q-mb-md" rounded>
      <template #avatar><q-icon name="desktop_windows" /></template>
      Fingerprint sync only works in the Seven Waves ERP <strong>desktop app</strong> (Electron) —
      it needs direct network access to the device, which a web browser cannot do. Device
      management (add/remove) works here, but "Sync Now" requires the desktop app.
    </q-banner>

    <div class="row q-gutter-md q-mb-lg">
      <q-card flat bordered class="col-12 col-md-3" v-for="stat in stats" :key="stat.label">
        <q-card-section class="row items-center">
          <q-icon :name="stat.icon" :color="stat.color" size="28px" />
          <div class="q-ml-md">
            <div class="text-h6 text-weight-bold">{{ stat.value }}</div>
            <div class="text-caption text-grey">{{ stat.label }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Devices -->
    <div class="text-subtitle1 text-weight-bold q-mb-sm">Devices</div>
    <q-list bordered separator class="q-mb-lg rounded-borders">
      <q-item v-for="device in deviceStore.biometricDevices" :key="device.id">
        <q-item-section avatar>
          <q-icon name="fingerprint" color="primary" size="28px" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ device.device_name }}</q-item-label>
          <q-item-label caption
            >{{ device.ip_address }}:{{ device.port || 4370 }} —
            <q-badge :color="device.status === 'online' ? 'positive' : 'grey'">{{
              device.status
            }}</q-badge>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <div class="row q-gutter-xs">
            <q-btn
              flat
              dense
              round
              icon="sync"
              color="primary"
              :loading="syncingDeviceId === device.id"
              :disable="!isElectron"
              @click="syncDevice(device)"
            >
              <q-tooltip>Sync Now — pull attendance punches</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="info"
              color="grey-7"
              :disable="!isElectron"
              @click="checkDeviceInfo(device)"
            >
              <q-tooltip>Device Info</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              round
              icon="delete"
              color="negative"
              @click="removeDevice(device)"
            >
              <q-tooltip>Remove</q-tooltip>
            </q-btn>
          </div>
        </q-item-section>
      </q-item>
      <q-item v-if="!deviceStore.biometricDevices.length">
        <q-item-section class="text-grey text-center">
          No biometric devices added yet. Click "Add Device" to register your fingerprint
          machine's IP address.
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Recent Attendance Punches (from attendance_logs — the real HR pipeline) -->
    <div class="text-subtitle1 text-weight-bold q-mb-sm">Recent Fingerprint Punches</div>
    <q-table
      :rows="recentPunches"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :loading="loading"
      :pagination="{ rowsPerPage: 25 }"
    >
      <template #body-cell-punch_type="props">
        <q-td :props="props">
          <q-icon :name="props.row.punch_type === 'in' ? 'login' : 'logout'" size="18px" class="q-mr-xs" />
          {{ props.row.punch_type === 'in' ? 'Clock In' : 'Clock Out' }}
        </q-td>
      </template>
      <template #body-cell-is_processed="props">
        <q-td :props="props">
          <q-badge :color="props.row.is_processed ? 'positive' : 'warning'">
            {{ props.row.is_processed ? 'Processed' : 'Pending' }}
          </q-badge>
        </q-td>
      </template>
    </q-table>

    <!-- Add Device Dialog -->
    <q-dialog v-model="showAddDialog">
      <q-card style="min-width: 380px">
        <q-card-section>
          <div class="text-h6">Add Fingerprint Device</div>
          <div class="text-caption text-grey">
            Enter the IP address shown on the device (Main Menu → COMM. → Ethernet).
          </div>
        </q-card-section>
        <q-card-section class="q-gutter-sm">
          <q-input v-model="newDevice.device_name" label="Device Name" outlined dense
            hint="e.g. Staff Entrance K45" />
          <q-input v-model="newDevice.ip_address" label="IP Address" outlined dense
            hint="e.g. 192.168.1.201" />
          <q-input v-model.number="newDevice.port" label="Port" type="number" outlined dense
            hint="Default 4370" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="primary"
            label="Add"
            :loading="adding"
            :disable="!newDevice.device_name || !newDevice.ip_address"
            @click="addDevice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { useDeviceStore } from '../stores/device.store'
import { ZKTecoClient } from '../services/zkteco.service'

const $q = useQuasar()
const authStore = useAuthStore()
const deviceStore = useDeviceStore()

const isElectron = typeof window !== 'undefined' && typeof window.electronAPI?.syncBiometric === 'function'

const loading = ref(false)
const adding = ref(false)
const showAddDialog = ref(false)
const syncingDeviceId = ref(null)
const recentPunches = ref([])
const branchId = ref(null)
const companyId = ref(null)

const newDevice = ref({ device_name: '', ip_address: '', port: 4370 })

const stats = computed(() => [
  { label: 'Devices', value: deviceStore.biometricDevices.length, icon: 'fingerprint', color: 'primary' },
  {
    label: 'Pending Punches',
    value: recentPunches.value.filter((p) => !p.is_processed).length,
    icon: 'pending',
    color: 'warning',
  },
  {
    label: 'Processed Today',
    value: recentPunches.value.filter(
      (p) => p.is_processed && new Date(p.punch_time).toDateString() === new Date().toDateString(),
    ).length,
    icon: 'check_circle',
    color: 'positive',
  },
])

const columns = [
  { name: 'employee_code', label: 'Employee Code', field: 'employee_code', align: 'left' },
  { name: 'punch_type', label: 'Type', field: 'punch_type', align: 'left' },
  {
    name: 'punch_time',
    label: 'Punch Time',
    field: 'punch_time',
    format: (v) => new Date(v).toLocaleString(),
    sortable: true,
    align: 'left',
  },
  { name: 'device_id', label: 'Device', field: 'device_id', align: 'left' },
  { name: 'is_processed', label: 'Status', field: 'is_processed', align: 'center' },
]

async function loadPunches() {
  loading.value = true
  try {
    const { data } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('branch_id', branchId.value)
      .eq('source', 'biometric')
      .order('punch_time', { ascending: false })
      .limit(200)
    recentPunches.value = data || []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  branchId.value = authStore.currentBranch?.id
  companyId.value = authStore.currentBranch?.company_id
  if (branchId.value) {
    await deviceStore.loadDevices(branchId.value)
    await loadPunches()
  }
})

async function addDevice() {
  adding.value = true
  try {
    const result = await deviceStore.addDevice({
      company_id: companyId.value,
      branch_id: branchId.value,
      device_type: 'biometric',
      device_name: newDevice.value.device_name,
      ip_address: newDevice.value.ip_address,
      port: newDevice.value.port || 4370,
      connection: 'network',
    })
    if (result.error) throw new Error(result.error.message || 'Failed to add device')
    $q.notify({ type: 'positive', message: 'Device added' })
    showAddDialog.value = false
    newDevice.value = { device_name: '', ip_address: '', port: 4370 }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    adding.value = false
  }
}

async function removeDevice(device) {
  $q.dialog({
    title: 'Remove Device',
    message: `Remove "${device.device_name}"? This does not affect fingerprint data already synced.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    const result = await deviceStore.removeDevice(device.id)
    if (result.error) {
      $q.notify({ type: 'negative', message: result.error.message || 'Failed to remove device' })
    } else {
      $q.notify({ type: 'positive', message: 'Device removed' })
    }
  })
}

async function syncDevice(device) {
  syncingDeviceId.value = device.id
  try {
    const client = new ZKTecoClient({
      ip: device.ip_address,
      port: device.port || 4370,
      branchId: branchId.value,
      companyId: companyId.value,
    })
    const result = await client.syncToDatabase()
    if (result.success) {
      $q.notify({
        type: 'positive',
        message: `Synced ${result.written ?? 0} punch(es) from ${device.device_name}`,
      })
      await loadPunches()
    } else {
      $q.notify({ type: 'negative', message: result.error || 'Sync failed' })
    }
  } finally {
    syncingDeviceId.value = null
  }
}

async function checkDeviceInfo(device) {
  const client = new ZKTecoClient({ ip: device.ip_address, port: device.port || 4370 })
  const result = await client.getDeviceInfo()
  if (result.success) {
    $q.dialog({
      title: device.device_name,
      message: `Enrolled Users: ${result.userCounts ?? '—'}<br>Attendance Logs on Device: ${result.logCounts ?? '—'}<br>Log Capacity: ${result.logCapacity ?? '—'}`,
      html: true,
    })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Could not reach device' })
  }
}
</script>
