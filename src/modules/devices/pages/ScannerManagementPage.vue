<template>
  <q-page class="q-pa-md">
    <!-- Unified Device Navigation Header -->
    <DeviceNavHeader />

    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold text-grey-8">Barcode & QR Code Scanners</div>
      <q-btn color="primary" icon="add" label="Add Scanner" no-caps @click="showAddDialog = true" />
    </div>

    <div class="row q-gutter-md q-mb-lg">
      <!-- Scanner Status -->
      <q-card flat bordered class="col-12 col-md-5">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Registered Scanners</div>
          <q-list separator>
            <q-item v-for="s in scannerDevices" :key="s.id">
              <q-item-section avatar>
                <q-icon name="qr_code_scanner" :color="s.status === 'online' ? 'positive' : 'grey'" size="28px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">{{ s.device_name }}</q-item-label>
                <q-item-label caption>{{ s.connection?.toUpperCase() }} • S/N: {{ s.serial_number || 'N/A' }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge :color="s.status === 'online' ? 'positive' : 'grey'" :label="s.status" />
              </q-item-section>
            </q-item>
            <q-item v-if="scannerDevices.length === 0">
              <q-item-section class="text-grey text-center">No scanners registered yet. Click "Add Scanner" to configure.</q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- Manual Scan & Live Hardware Tester -->
      <q-card flat bordered class="col-12 col-md-6">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Live Barcode & QR Code Tester</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Scan any physical barcode with your USB/Wireless scanner or type manually below to test live lookup.
          </div>
          <q-input v-model="manualBarcode" label="Scan or enter barcode / SKU" outlined dense
                   @keyup.enter="handleManualScan" class="q-mb-sm">
            <template #append>
              <q-btn flat round icon="search" @click="handleManualScan" />
            </template>
          </q-input>
          <div v-if="scanResult" class="q-pa-sm bg-green-1 border-green rounded-borders">
            <div class="text-weight-bold text-positive">{{ scanResult.name }}</div>
            <div class="text-caption">SKU: {{ scanResult.sku || 'N/A' }} • Price: LKR {{ scanResult.price }}</div>
            <div class="text-caption">Stock Available: {{ scanResult.stock_quantity ?? 'N/A' }}</div>
          </div>
          <div v-if="scanError" class="text-negative text-caption q-mt-sm">{{ scanError }}</div>

          <div class="q-mt-md">
            <div class="text-subtitle2 text-grey">Scan Session Stats</div>
            <div class="text-caption">Total Scans: <strong>{{ scanCount }}</strong></div>
            <div v-if="lastScan" class="text-caption">Last Raw Data: <code>{{ lastScan }}</code> at {{ lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : '' }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Add Scanner Dialog -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 480px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center">
            <q-icon name="qr_code_scanner" size="24px" class="q-mr-sm" />
            <div class="text-h6 text-weight-bold">Register Barcode / QR Scanner</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-sm">
          <q-select
            v-model="selectedScannerPreset"
            label="Scanner Brand / Hardware Type *"
            outlined
            dense
            :options="scannerPresets"
            emit-value
            map-options
            @update:model-value="onScannerPresetChange"
            class="q-mb-sm"
          />

          <q-input v-model="newScanner.device_name" label="Scanner Name / POS Terminal *" outlined dense placeholder="e.g. Counter 1 Handheld Scanner" />
          <q-select v-model="newScanner.connection" label="Connection Interface *" outlined dense :options="scannerConnectionOptions" emit-value map-options />
          <q-select v-model="newScanner.suffix" label="Auto Suffix Mode" outlined dense :options="[{ label: 'Enter Key (CR+LF - Default)', value: 'enter' }, { label: 'Tab Key', value: 'tab' }, { label: 'None', value: 'none' }]" emit-value map-options />
          <q-input v-model="newScanner.serial_number" label="Serial Number (Optional)" outlined dense placeholder="e.g. SN-891024" />
        </q-card-section>

        <q-card-actions align="right" class="q-px-md q-pb-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save Scanner" no-caps :loading="saving" :disable="!newScanner.device_name" @click="handleAddScanner" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDeviceStore } from '../stores/device.store'
import DeviceNavHeader from '../components/DeviceNavHeader.vue'
import { useBarcodeScanner } from '../composables/useBarcodeScanner'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const deviceStore = useDeviceStore()
const manualBarcode = ref('')
const scanResult = ref(null)
const scanError = ref(null)
const showAddDialog = ref(false)
const saving = ref(false)
const branchId = ref(null)
const companyId = ref(null)

const selectedScannerPreset = ref('usb_hid')

const scannerPresets = [
  { label: 'Honeywell / Zebra / Datalogic (USB HID Keyboard Wedge)', value: 'usb_hid', connection: 'usb' },
  { label: 'Sunlux / Netum / Eyoyo (2.4GHz Wireless USB Dongle)', value: 'wireless_24g', connection: 'wireless' },
  { label: 'Serial COM Port Scanner (RS-232 / Virtual COM Port)', value: 'serial_com', connection: 'serial' },
  { label: 'Camera / Tablet QR & Barcode Scanner', value: 'camera', connection: 'camera' },
  { label: 'Bluetooth Wireless Handheld Scanner', value: 'bluetooth', connection: 'bluetooth' },
  { label: 'Generic Omnidirectional Countertop Scanner', value: 'generic', connection: 'usb' },
]

const scannerConnectionOptions = [
  { label: 'USB Keyboard Emulation (Plug & Play)', value: 'usb' },
  { label: '2.4GHz Wireless Receiver', value: 'wireless' },
  { label: 'Serial COM Port (RS-232)', value: 'serial' },
  { label: 'Bluetooth (SPP / HID)', value: 'bluetooth' },
  { label: 'Built-in Device Camera', value: 'camera' },
]

const newScanner = ref({
  device_name: '',
  connection: 'usb',
  suffix: 'enter',
  serial_number: '',
})

function onScannerPresetChange(val) {
  const preset = scannerPresets.find((p) => p.value === val)
  if (preset) {
    newScanner.value.connection = preset.connection
  }
}

async function handleAddScanner() {
  saving.value = true
  try {
    const result = await deviceStore.addDevice({
      company_id: companyId.value,
      branch_id: branchId.value,
      device_type: 'scanner',
      device_name: newScanner.value.device_name,
      connection: newScanner.value.connection,
      serial_number: newScanner.value.serial_number,
      status: 'online',
    })
    if (result.error) throw new Error(result.error.message || 'Failed to add scanner')
    $q.notify({ type: 'positive', message: 'Scanner registered successfully' })
    showAddDialog.value = false
    newScanner.value = { device_name: '', connection: 'usb', suffix: 'enter', serial_number: '' }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

const { lastScan, lastScanTime, scanCount, lookupItem } = useBarcodeScanner({
  onScan: async (barcode) => {
    const result = await lookupItem(barcode)
    if (result.data) {
      scanResult.value = result.data
      scanError.value = null
      $q.notify({ type: 'positive', message: `Found: ${result.data.name}` })
    } else {
      scanError.value = `No item found for barcode: ${barcode}`
    }
  },
})

const scannerDevices = computed(() => deviceStore.scanners)

onMounted(async () => {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  branchId.value = authStore.activeBranchId || authStore.user?.branch_id
  companyId.value = authStore.user?.company_id
  if (branchId.value) deviceStore.loadDevices(branchId.value)
})

async function handleManualScan() {
  if (!manualBarcode.value) return
  const result = await lookupItem(manualBarcode.value)
  if (result.data) {
    scanResult.value = result.data
    scanError.value = null
  } else {
    scanResult.value = null
    scanError.value = `No item found for: ${manualBarcode.value}`
  }
}
</script>
