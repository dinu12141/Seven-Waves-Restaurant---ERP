<template>
  <q-page class="q-pa-md">
    <!-- Unified Device Navigation Header -->
    <DeviceNavHeader />

    <!-- Actions Bar -->
    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold text-grey-8">Registered Hardware Overview</div>
      <q-btn color="primary" icon="add" label="Add Device" no-caps @click="showAddDialog = true" />
    </div>

    <!-- Stats Cards -->
    <div class="row q-gutter-md q-mb-lg">
      <q-card v-for="stat in stats" :key="stat.label" flat bordered class="col stat-card">
        <q-card-section class="row items-center q-pa-md">
          <q-icon :name="stat.icon" :color="stat.color" size="32px" />
          <div class="q-ml-md">
            <div class="text-h5 text-weight-bold">{{ stat.value }}</div>
            <div class="text-caption text-grey">{{ stat.label }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Alerts -->
    <DeviceAlertPanel
      :alerts="deviceStore.alerts"
      @resolve="handleResolveAlert"
      class="q-mb-lg"
    />

    <!-- Device List -->
    <DeviceHealthTable
      :devices="deviceStore.devices"
      :loading="deviceStore.loading"
      @refresh="loadData"
      @edit="editDevice"
      @heartbeat="sendHeartbeat"
      @delete="confirmDelete"
    />

    <!-- Add Device Dialog -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 450px">
        <q-card-section class="text-h6">Add New Device</q-card-section>
        <q-card-section>
          <q-input v-model="newDevice.device_name" label="Device Name *" outlined dense class="q-mb-sm" />
          <q-select v-model="newDevice.device_type" label="Device Type *" outlined dense
                    :options="deviceTypes" emit-value map-options class="q-mb-sm" />
          <q-select v-model="newDevice.connection" label="Connection *" outlined dense
                    :options="connectionTypes" emit-value map-options class="q-mb-sm" />
          <q-input v-model="newDevice.ip_address" label="IP Address" outlined dense class="q-mb-sm" />
          <q-input v-model="newDevice.serial_number" label="Serial Number" outlined dense class="q-mb-sm" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Add" @click="handleAddDevice" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDeviceStore } from '../stores/device.store'
import DeviceHealthTable from '../components/DeviceHealthTable.vue'
import DeviceAlertPanel from '../components/DeviceAlertPanel.vue'
import DeviceNavHeader from '../components/DeviceNavHeader.vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const deviceStore = useDeviceStore()

const showAddDialog = ref(false)
const saving = ref(false)
const branchId = ref(null)

const newDevice = ref({
  device_name: '',
  device_type: 'printer',
  connection: 'usb',
  ip_address: '',
  serial_number: '',
})

const deviceTypes = [
  { label: 'Thermal / KOT Printer', value: 'printer' },
  { label: 'Barcode / QR Scanner', value: 'scanner' },
  { label: 'Cash Drawer (RJ11 / USB)', value: 'cash_drawer' },
  { label: 'Biometric Attendance Terminal', value: 'biometric' },
  { label: 'Electronic Weighing Scale', value: 'scale' },
  { label: 'Customer Display / Pole VFD', value: 'customer_display' },
  { label: 'KDS Kitchen Display Screen', value: 'kds_display' },
  { label: 'POS Terminal Station', value: 'pos_terminal' },
  { label: 'Waiter Ordering Tablet', value: 'tablet' },
  { label: 'Self-Ordering Kiosk', value: 'kiosk' },
]

const connectionTypes = [
  { label: 'Network LAN / WiFi (TCP/IP)', value: 'network' },
  { label: 'USB Direct / WebUSB', value: 'usb' },
  { label: 'Serial COM (RS-232 / Virtual COM)', value: 'serial' },
  { label: 'Bluetooth Wireless', value: 'bluetooth' },
  { label: 'Cloud Webhook / ADMS Push', value: 'cloud' },
  { label: 'HDMI / Secondary Display', value: 'hdmi' },
]

const stats = computed(() => [
  { label: 'Total Devices', value: deviceStore.devices.length, icon: 'devices', color: 'primary' },
  { label: 'Online', value: deviceStore.onlineDevices.length, icon: 'wifi', color: 'positive' },
  { label: 'Offline', value: deviceStore.offlineDevices.length, icon: 'wifi_off', color: 'grey' },
  { label: 'Critical Alerts', value: deviceStore.criticalAlerts.length, icon: 'error', color: 'negative' },
])

onMounted(async () => {
  // Get branch from auth store (or use first available)
  const authStore = (await import('src/stores/auth')).useAuthStore()
  branchId.value = authStore.activeBranchId || authStore.user?.branch_id
  if (branchId.value) loadData()
})

async function loadData() {
  await Promise.all([
    deviceStore.loadDevices(branchId.value),
    deviceStore.loadAlerts(branchId.value),
  ])
}

async function handleAddDevice() {
  saving.value = true
  try {
    const authStore = (await import('src/stores/auth')).useAuthStore()
    
    // Robustly fetch company_id
    let companyId = authStore.user?.company_id || authStore.currentBranch?.company_id
    if (!companyId) {
      const { api } = await import('src/core/api/ApiClient')
      const { data } = await api.query(c => c.from('user_branches').select('company_id').eq('user_id', authStore.user?.id).limit(1).single())
      companyId = data?.company_id
    }

    if (!companyId) throw new Error("Could not determine your company ID.")

    await deviceStore.addDevice({
      ...newDevice.value,
      branch_id: branchId.value,
      company_id: companyId,
    })
    showAddDialog.value = false
    $q.notify({ type: 'positive', message: 'Device added successfully' })
    newDevice.value = { device_name: '', device_type: 'printer', connection: 'usb', ip_address: '', serial_number: '' }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function editDevice(device) {
  $q.notify({ message: `Edit ${device.device_name} — coming soon` })
}

async function sendHeartbeat(device) {
  await deviceStore.heartbeat(device.id)
  $q.notify({ type: 'positive', message: `Heartbeat sent to ${device.device_name}` })
}

async function handleResolveAlert(alert) {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  await deviceStore.resolveAlert(alert.id, authStore.user?.id)
  $q.notify({ type: 'positive', message: 'Alert resolved' })
}

function confirmDelete(device) {
  $q.dialog({
    title: 'Delete Device',
    message: `Remove "${device.device_name}"? This cannot be undone.`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    await deviceStore.removeDevice(device.id)
    $q.notify({ type: 'positive', message: 'Device removed' })
  })
}
</script>

<style scoped>
.stat-card {
  border-radius: 12px;
  min-width: 180px;
}
</style>
