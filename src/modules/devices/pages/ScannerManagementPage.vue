<template>
  <q-page class="q-pa-md">
    <div class="text-h5 text-weight-bold q-mb-md">Barcode Scanners</div>
    <div class="row q-gutter-md q-mb-lg">
      <!-- Scanner Status -->
      <q-card flat bordered class="col-12 col-md-5">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Scanner Status</div>
          <q-list separator>
            <q-item v-for="s in scannerDevices" :key="s.id">
              <q-item-section avatar><q-icon name="qr_code_scanner" :color="s.status === 'online' ? 'positive' : 'grey'" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ s.device_name }}</q-item-label>
                <q-item-label caption>{{ s.connection }} • {{ s.serial_number || 'N/A' }}</q-item-label>
              </q-item-section>
              <q-item-section side><q-badge :color="s.status === 'online' ? 'positive' : 'grey'" :label="s.status" /></q-item-section>
            </q-item>
            <q-item v-if="scannerDevices.length === 0">
              <q-item-section class="text-grey text-center">No scanners registered</q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>

      <!-- Manual Scan -->
      <q-card flat bordered class="col-12 col-md-6">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Manual Barcode Lookup</div>
          <q-input v-model="manualBarcode" label="Enter barcode or SKU" outlined dense
                   @keyup.enter="handleManualScan" class="q-mb-sm">
            <template #append>
              <q-btn flat round icon="search" @click="handleManualScan" />
            </template>
          </q-input>
          <div v-if="scanResult" class="q-pa-sm bg-grey-1 rounded-borders">
            <div class="text-weight-bold">{{ scanResult.name }}</div>
            <div class="text-caption">SKU: {{ scanResult.sku || 'N/A' }} • Price: {{ scanResult.price }}</div>
            <div class="text-caption">Stock: {{ scanResult.stock_quantity ?? 'N/A' }}</div>
          </div>
          <div v-if="scanError" class="text-negative text-caption q-mt-sm">{{ scanError }}</div>

          <div class="q-mt-md">
            <div class="text-subtitle2 text-grey">Scan History</div>
            <div class="text-caption">Total scans this session: {{ scanCount }}</div>
            <div v-if="lastScan" class="text-caption">Last: {{ lastScan }} at {{ lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : '' }}</div>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useDeviceStore } from '../stores/device.store'
import { useBarcodeScanner } from '../composables/useBarcodeScanner'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const deviceStore = useDeviceStore()
const manualBarcode = ref('')
const scanResult = ref(null)
const scanError = ref(null)

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
  }
})

const scannerDevices = computed(() => deviceStore.scanners)

onMounted(async () => {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  const bid = authStore.activeBranchId || authStore.user?.branch_id
  if (bid) deviceStore.loadDevices(bid)
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
