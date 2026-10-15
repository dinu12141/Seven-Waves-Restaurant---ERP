<template>
  <q-page class="q-pa-md">
    <!-- Unified Device Navigation Header -->
    <DeviceNavHeader />

    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold text-grey-8">Biometric Attendance Terminals</div>
      <div class="row q-gutter-sm">
        <q-btn
          color="indigo-8"
          icon="cloud_sync"
          label="Cloud ADMS Setup"
          no-caps
          unelevated
          @click="showAdmsDialog = true"
        />
        <q-btn
          color="teal-8"
          icon="upload_file"
          label="Import USB Log (1_attlog.dat)"
          no-caps
          unelevated
          @click="showUsbImportDialog = true"
        />
        <q-btn
          color="primary"
          icon="add"
          label="Add Device"
          no-caps
          unelevated
          @click="showAddDialog = true"
        />
      </div>
    </div>

    <!-- Cloud ADMS Live Gateway Banner -->
    <q-card flat bordered class="q-mb-md bg-grey-10 text-white">
      <q-card-section class="row items-center justify-between q-py-sm">
        <div class="row items-center">
          <q-avatar color="indigo-9" text-color="white" icon="cloud_queue" size="38px" class="q-mr-md" />
          <div>
            <div class="text-subtitle2 text-weight-bold row items-center">
              Cloud ADMS Biometric Gateway
              <q-badge color="positive" class="q-ml-sm">ACTIVE / LISTENING</q-badge>
            </div>
            <div class="text-caption text-grey-4">
              Real-time push protocol for ZKTeco terminals &bull; Endpoint: <code>{{ admsConfig.serverDomain }}</code> (Port 443)
            </div>
          </div>
        </div>
        <div class="row items-center q-gutter-xs q-mt-xs q-mt-sm-none">
          <q-btn
            outline
            dense
            color="info"
            icon="network_check"
            label="Test Cloud Endpoint"
            no-caps
            class="q-px-sm"
            :loading="testingAdms"
            @click="runAdmsHealthCheck"
          />
          <q-btn
            dense
            color="indigo-7"
            icon="menu_book"
            label="Machine Config Guide"
            no-caps
            class="q-px-sm"
            @click="showAdmsDialog = true"
          />
        </div>
      </q-card-section>
    </q-card>

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
              :disable="!isDesktopApp"
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
              :disable="!isDesktopApp"
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

    <!-- Add Device Dialog (Universal Biometric Setup) -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 540px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center">
            <q-icon name="fingerprint" size="24px" class="q-mr-sm" />
            <div class="text-h6 text-weight-bold">Register Attendance Machine</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-sm">
          <div class="text-caption text-grey-7 q-mb-xs">
            Supports any brand worldwide (ZKTeco, Hikvision, Dahua, Suprema, Anviz, ADMS Cloud Push, USB Desktop).
          </div>

          <!-- Brand / Protocol Preset -->
          <q-select
            v-model="selectedBrandPreset"
            label="Device Brand / Protocol Architecture *"
            outlined
            dense
            :options="biometricBrandPresets"
            emit-value
            map-options
            @update:model-value="onBrandPresetChange"
            class="q-mb-sm"
          >
            <template #prepend>
              <q-icon name="verified" color="primary" />
            </template>
          </q-select>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-7">
              <q-input
                v-model="newDevice.device_name"
                label="Device Name / Location *"
                outlined
                dense
                placeholder="e.g. Staff Entrance K45"
              />
            </div>
            <div class="col-12 col-sm-5">
              <q-select
                v-model="newDevice.device_role"
                label="Terminal Function"
                outlined
                dense
                :options="[
                  { label: 'Staff Clock In/Out', value: 'attendance' },
                  { label: 'Kitchen Entry Check-in', value: 'kitchen' },
                  { label: 'Manager Access Control', value: 'manager_access' },
                  { label: 'All-Purpose Terminal', value: 'general' }
                ]"
                emit-value
                map-options
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-8">
              <q-input
                v-model="newDevice.ip_address"
                label="IP Address / Host *"
                outlined
                dense
                placeholder="e.g. 192.168.1.201"
              >
                <template #prepend>
                  <q-icon name="lan" />
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="newDevice.port"
                label="Port *"
                type="number"
                outlined
                dense
                placeholder="4370"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="newDevice.comm_key"
                label="Comm Key / Password"
                outlined
                dense
                placeholder="0 (Default)"
                hint="Device communication password"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="newDevice.serial_number"
                label="Serial Number (Optional)"
                outlined
                dense
                placeholder="e.g. CQZ918230041"
              />
            </div>
          </div>

          <!-- Connection Test Feedback -->
          <div v-if="testResult" class="q-mt-sm q-pa-sm rounded-borders" :class="testResult.success ? 'bg-positive text-white' : 'bg-negative text-white'">
            <div class="row items-center">
              <q-icon :name="testResult.success ? 'check_circle' : 'error'" size="20px" class="q-mr-xs" />
              <div class="text-weight-bold">{{ testResult.success ? 'Connection Successful!' : 'Connection Failed' }}</div>
            </div>
            <div class="text-caption" style="opacity: 0.9;">{{ testResult.message }}</div>
          </div>
        </q-card-section>

        <q-card-actions align="between" class="q-px-md q-pb-md">
          <q-btn
            outline
            color="info"
            icon="network_check"
            label="Test Connection"
            no-caps
            :loading="testingConnection"
            @click="testBiometricConnection"
          />
          <div class="row q-gutter-sm">
            <q-btn flat label="Cancel" v-close-popup />
            <q-btn
              color="primary"
              label="Save Device"
              no-caps
              :loading="adding"
              :disable="!newDevice.device_name || !newDevice.ip_address"
              @click="addDevice"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- USB Log File Import Dialog (1_attlog.dat) -->
    <q-dialog v-model="showUsbImportDialog" persistent>
      <q-card style="min-width: 580px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-teal-8 text-white q-py-sm">
          <div class="row items-center">
            <q-icon name="file_upload" size="24px" class="q-mr-sm" />
            <div class="text-h6 text-weight-bold">Import Fingerprint Data from USB Flash Drive</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <div class="text-caption text-grey-8 q-mb-md">
            Plug any USB flash drive into your ZKTeco device, go to
            <strong>Menu &rarr; Data Mgt. &rarr; Download Att. Log</strong>, and upload the generated
            <code>1_attlog.dat</code>, <code>attlog.dat</code>, or <code>.csv</code> file here.
            All historical fingerprint punches will be imported and attendance records recalculated instantly.
          </div>

          <q-file
            v-model="usbFile"
            label="Select 1_attlog.dat or CSV from USB"
            outlined
            dense
            accept=".dat,.txt,.csv"
            @update:model-value="onUsbFileSelected"
          >
            <template #prepend>
              <q-icon name="attach_file" color="teal" />
            </template>
          </q-file>

          <div v-if="parsingUsb" class="q-mt-md text-center">
            <q-spinner color="teal" size="32px" />
            <div class="text-caption text-grey-6 q-mt-xs">Parsing punch records...</div>
          </div>

          <div v-if="parsedUsbSummary" class="q-mt-md q-pa-md bg-grey-2 rounded-borders">
            <div class="text-weight-bold text-teal-9 row items-center q-mb-xs">
              <q-icon name="check_circle" size="20px" class="q-mr-xs" />
              File Verified — Ready to Import
            </div>
            <div class="text-caption text-grey-9 q-gutter-y-xs">
              <div><strong>Total Punches in File:</strong> {{ parsedUsbSummary.total }}</div>
              <div><strong>Date Range:</strong> {{ parsedUsbSummary.startDate }} &mdash; {{ parsedUsbSummary.endDate }}</div>
              <div><strong>Unique Employee PINs:</strong> {{ parsedUsbSummary.uniquePins }}</div>
              <div class="text-grey-6">
                <em>Duplicate punches are automatically skipped by database constraints.</em>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="between" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn
            color="teal-8"
            label="Import All Punches Now"
            icon="cloud_upload"
            no-caps
            :loading="importingUsb"
            :disable="!parsedUsbPunches.length"
            @click="executeUsbImport"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cloud ADMS Setup Dialog -->
    <q-dialog v-model="showAdmsDialog">
      <q-card style="min-width: 600px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-indigo-9 text-white q-py-sm">
          <div class="row items-center">
            <q-icon name="cloud_sync" size="24px" class="q-mr-sm" />
            <div class="text-h6 text-weight-bold">ZKTeco Cloud ADMS Setup Guide</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <div class="text-subtitle2 text-weight-bold q-mb-sm text-indigo-9">
            Configure these parameters on your ZKTeco Terminal (Menu &rarr; Comm. &rarr; Cloud Server / ADMS):
          </div>

          <q-list bordered separator class="rounded-borders q-mb-md">
            <q-item>
              <q-item-section>
                <q-item-label caption>Server Address / Domain</q-item-label>
                <q-item-label class="text-weight-bold text-body1">{{ admsConfig.serverDomain }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense icon="content_copy" size="sm" @click="copyText(admsConfig.serverDomain, 'Server Domain copied!')">
                  <q-tooltip>Copy</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section>
                <q-item-label caption>Server Port</q-item-label>
                <q-item-label class="text-weight-bold text-body1">{{ admsConfig.serverPort }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense icon="content_copy" size="sm" @click="copyText(admsConfig.serverPort, 'Port copied!')">
                  <q-tooltip>Copy</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section>
                <q-item-label caption>Enable Domain Name</q-item-label>
                <q-item-label class="text-weight-bold text-body1">YES / On</q-item-label>
              </q-item-section>
            </q-item>

            <q-item>
              <q-item-section>
                <q-item-label caption>Web Server Path (if prompt appears)</q-item-label>
                <q-item-label class="text-weight-bold text-caption ellipsis text-grey-8">{{ admsConfig.webPath }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-btn flat dense icon="content_copy" size="sm" @click="copyText(admsConfig.webPath, 'Path copied!')">
                  <q-tooltip>Copy</q-tooltip>
                </q-btn>
              </q-item-section>
            </q-item>
          </q-list>

          <div class="text-subtitle2 text-weight-bold q-mb-xs">Step-by-Step Terminal Instructions:</div>
          <ol class="text-caption text-grey-8 q-pl-md q-gutter-y-xs">
            <li v-for="(inst, idx) in admsConfig.instructions" :key="idx">{{ inst }}</li>
          </ol>
        </q-card-section>

        <q-card-actions align="between" class="q-px-md q-pb-md">
          <q-btn
            outline
            color="info"
            icon="network_check"
            label="Test Cloud Endpoint"
            no-caps
            :loading="testingAdms"
            @click="runAdmsHealthCheck"
          />
          <q-btn color="indigo" label="Done" v-close-popup no-caps />
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
import DeviceNavHeader from '../components/DeviceNavHeader.vue'
import { ZKTecoClient, isDesktopAvailable } from '../services/zkteco.service'
import {
  getAdmsConfig,
  testCloudAdmsHealth,
  parseUsbAttlogText,
  importAttlogPunches,
} from '../services/biometric.service'

const $q = useQuasar()
const authStore = useAuthStore()
const deviceStore = useDeviceStore()

// Works in either desktop shell this app ships (Electron or Tauri) — both
// have their own native TCP bridge to reach the fingerprint device's LAN IP.
// Reactive (not a one-time const) since window.__TAURI_INTERNALS__/electronAPI
// can be injected slightly after this component's setup() runs.
const isDesktopApp = ref(isDesktopAvailable())

const loading = ref(false)
const adding = ref(false)
const showAddDialog = ref(false)
const syncingDeviceId = ref(null)
const recentPunches = ref([])
const branchId = ref(null)
const companyId = ref(null)

const selectedBrandPreset = ref('zkteco')
const testingConnection = ref(false)
const testResult = ref(null)

const admsConfig = getAdmsConfig()
const showAdmsDialog = ref(false)
const testingAdms = ref(false)

const showUsbImportDialog = ref(false)
const usbFile = ref(null)
const parsedUsbPunches = ref([])
const parsedUsbSummary = ref(null)
const parsingUsb = ref(false)
const importingUsb = ref(false)

const biometricBrandPresets = [
  { label: 'ZKTeco / eSSL / Realtime / Biomax (UDP/TCP 4370)', value: 'zkteco', defaultPort: 4370 },
  { label: 'Hikvision Face & Fingerprint Terminal (ISAPI HTTP 80/8000)', value: 'hikvision', defaultPort: 80 },
  { label: 'Dahua Face Recognition & Fingerprint (TCP 37777 / HTTP 80)', value: 'dahua', defaultPort: 37777 },
  { label: 'Suprema BioStar 2 FaceStation / BioStation (G-SDK 51211)', value: 'suprema', defaultPort: 51211 },
  { label: 'Anviz CrossChex FacePass & EP300 (TCP 5010)', value: 'anviz', defaultPort: 5010 },
  { label: 'Cloud ADMS / Webhook Push Protocol (HTTP Push)', value: 'cloud_adms', defaultPort: 80 },
  { label: 'Desktop USB Optical Scanner (DigitalPersona / SecuGen / Mantra)', value: 'usb_desktop', defaultPort: 0 },
  { label: 'Generic / Custom Attendance Terminal', value: 'custom', defaultPort: 4370 },
]

const newDevice = ref({
  device_name: '',
  ip_address: '',
  port: 4370,
  device_role: 'attendance',
  comm_key: '0',
  serial_number: '',
})

function onBrandPresetChange(val) {
  const preset = biometricBrandPresets.find((p) => p.value === val)
  if (preset) {
    newDevice.value.port = preset.defaultPort
    if (preset.value === 'usb_desktop') {
      newDevice.value.ip_address = '127.0.0.1'
    }
  }
}

async function testBiometricConnection() {
  if (!newDevice.value.ip_address) {
    $q.notify({ type: 'warning', message: 'Please enter an IP address first' })
    return
  }
  testingConnection.value = true
  testResult.value = null
  try {
    const client = new ZKTecoClient({
      ip: newDevice.value.ip_address,
      port: newDevice.value.port || 4370,
    })
    const res = await client.getDeviceInfo()
    if (res.success) {
      testResult.value = {
        success: true,
        message: `Device responded successfully! Enrolled Users: ${res.userCounts || 0}, Stored Logs: ${res.logCounts || 0}`,
      }
    } else {
      testResult.value = {
        success: false,
        message: res.error || 'Device ping timed out. Verify device is connected to LAN and IP is correct.',
      }
    }
  } catch (err) {
    testResult.value = {
      success: false,
      message: err?.message || 'Connection test failed',
    }
  } finally {
    testingConnection.value = false
  }
}

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
  isDesktopApp.value = isDesktopAvailable()
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

function copyText(text, successMsg) {
  navigator.clipboard?.writeText(String(text))
  $q.notify({ type: 'positive', message: successMsg || 'Copied to clipboard!' })
}

async function runAdmsHealthCheck() {
  testingAdms.value = true
  try {
    const res = await testCloudAdmsHealth()
    if (res.success) {
      $q.notify({
        type: 'positive',
        icon: 'check_circle',
        message: 'Cloud ADMS Endpoint is ONLINE and ready to receive ZKTeco pushes!',
      })
    } else {
      $q.notify({
        type: 'warning',
        icon: 'warning',
        message: 'Cloud ADMS check: ' + (res.error || 'Server response delayed'),
      })
    }
  } finally {
    testingAdms.value = false
  }
}

async function onUsbFileSelected(file) {
  if (!file) {
    parsedUsbPunches.value = []
    parsedUsbSummary.value = null
    return
  }
  parsingUsb.value = true
  try {
    const text = await file.text()
    const list = parseUsbAttlogText(text)
    parsedUsbPunches.value = list

    if (list.length === 0) {
      $q.notify({ type: 'warning', message: 'No valid attendance punch lines detected in this file.' })
      parsedUsbSummary.value = null
      return
    }

    const uniquePins = new Set(list.map((p) => p.pin)).size
    parsedUsbSummary.value = {
      total: list.length,
      startDate: list[0]?.punchTime ? list[0].punchTime.slice(0, 10) : '—',
      endDate: list[list.length - 1]?.punchTime ? list[list.length - 1].punchTime.slice(0, 10) : '—',
      uniquePins,
    }

    $q.notify({ type: 'positive', message: `Parsed ${list.length} punches for ${uniquePins} employee(s)!` })
  } catch (err) {
    console.error('USB Parse Error:', err)
    $q.notify({ type: 'negative', message: 'Failed to read file: ' + err.message })
  } finally {
    parsingUsb.value = false
  }
}

async function executeUsbImport() {
  if (!parsedUsbPunches.value.length) return
  importingUsb.value = true
  try {
    const result = await importAttlogPunches({
      punches: parsedUsbPunches.value,
      companyId: companyId.value,
      branchId: branchId.value,
      deviceId: usbFile.value?.name || 'ZKTeco-USB-Import',
    })

    if (!result.success) throw new Error(result.error)

    $q.notify({
      type: 'positive',
      icon: 'cloud_done',
      message: `Successfully imported ${result.insertedCount} punches (${result.matchedCount} matched to employee master)!`,
    })

    showUsbImportDialog.value = false
    usbFile.value = null
    parsedUsbPunches.value = []
    parsedUsbSummary.value = null

    await loadPunches()
  } catch (err) {
    console.error('USB Import Error:', err)
    $q.notify({ type: 'negative', message: 'Import failed: ' + err.message })
  } finally {
    importingUsb.value = false
  }
}
</script>
