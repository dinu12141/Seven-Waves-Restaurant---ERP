<template>
  <q-page class="q-pa-md">
    <!-- Unified Device Navigation Header -->
    <DeviceNavHeader />

    <div class="row items-center justify-between q-mb-md">
      <div class="text-subtitle1 text-weight-bold text-grey-8">Thermal Receipt & Kitchen KOT Printers</div>
      <div class="row items-center">
        <q-btn-toggle v-model="viewTab" flat no-caps dense :options="[
          { label: 'Printers', value: 'printers' },
          { label: 'Print Queue', value: 'queue' },
        ]" class="q-mr-md" />
        <q-btn color="primary" icon="add" label="Add Printer" no-caps @click="showAddDialog = true" />
      </div>
    </div>

    <!-- Printers View -->
    <div v-if="viewTab === 'printers'" class="row q-gutter-md">
      <div v-for="printer in printerStore.printers" :key="printer.id" class="col-12 col-sm-6 col-md-4">
        <PrinterStatusCard
          :printer="printer"
          :testing="testingId === printer.id"
          @test="handleTestPrint"
          @configure="configurePrinter"
          @delete="confirmDeletePrinter"
        />
      </div>
      <div v-if="printerStore.printers.length === 0" class="col-12 text-center q-py-xl text-grey">
        <q-icon name="print_disabled" size="64px" />
        <div class="text-subtitle1 q-mt-sm">No printers configured</div>
        <div class="text-caption">Add a printer to start printing receipts and kitchen tickets</div>
      </div>
    </div>

    <!-- Print Queue View -->
    <q-table v-if="viewTab === 'queue'"
      :rows="printerStore.printJobs"
      :columns="queueColumns"
      row-key="id" flat bordered
      :pagination="{ rowsPerPage: 20 }"
    >
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge :color="jobStatusColor(props.row.status)" :label="props.row.status" />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props" class="text-right">
          <q-btn v-if="props.row.status === 'failed'" flat dense size="sm" icon="refresh" color="primary"
                 @click="printerStore.retry(props.row.id)" label="Retry" />
          <q-btn v-if="['queued','failed'].includes(props.row.status)" flat dense size="sm" icon="cancel" color="negative"
                 @click="printerStore.cancel(props.row.id)" />
        </q-td>
      </template>
    </q-table>

    <!-- Add / Configure Printer Dialog (Universal Setup) -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 560px; max-width: 95vw;">
        <q-card-section class="row items-center justify-between bg-primary text-white q-py-sm">
          <div class="row items-center">
            <q-icon name="print" size="24px" class="q-mr-sm" />
            <div class="text-h6 text-weight-bold">Register Thermal / KOT Printer</div>
          </div>
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-sm">
          <!-- Brand / Model Architecture Preset -->
          <q-select
            v-model="selectedBrandProfile"
            label="Printer Brand & Protocol Preset *"
            outlined
            dense
            :options="printerBrandPresets"
            emit-value
            map-options
            @update:model-value="onPrinterBrandChange"
            class="q-mb-sm"
          >
            <template #prepend>
              <q-icon name="verified" color="primary" />
            </template>
          </q-select>

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-7">
              <q-input
                v-model="newPrinter.printer_name"
                label="Printer Name / Location *"
                outlined
                dense
                placeholder="e.g. Counter 1 Receipt / Main Kitchen"
              />
            </div>
            <div class="col-12 col-sm-5">
              <q-select
                v-model="newPrinter.printer_type"
                label="Printer Role *"
                outlined
                dense
                :options="printerRoleOptions"
                emit-value
                map-options
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-6">
              <q-select
                v-model="newPrinter.connection_type"
                label="Connection Interface *"
                outlined
                dense
                :options="connectionInterfaceOptions"
                emit-value
                map-options
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model.number="newPrinter.paper_width"
                label="Paper Width *"
                outlined
                dense
                :options="[
                  { label: '80mm (Standard 3-inch)', value: 80 },
                  { label: '58mm (Compact 2-inch)', value: 58 },
                  { label: '76mm (Dot Matrix / Ribbon)', value: 76 },
                  { label: 'Sticky Label (KOT Sticker)', value: 50 },
                ]"
                emit-value
                map-options
              />
            </div>
          </div>

          <!-- Network IP / Port Fields -->
          <div v-if="newPrinter.connection_type === 'network'" class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-8">
              <q-input
                v-model="newPrinter.printer_ip"
                label="Printer IP Address *"
                outlined
                dense
                placeholder="e.g. 192.168.1.100"
              >
                <template #prepend><q-icon name="lan" /></template>
              </q-input>
            </div>
            <div class="col-12 col-sm-4">
              <q-input
                v-model.number="newPrinter.printer_port"
                label="RAW Port *"
                type="number"
                outlined
                dense
                placeholder="9100"
              />
            </div>
          </div>

          <!-- Hardware Features Row -->
          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-6">
              <q-select
                v-model="newPrinter.drawer_pin"
                label="Cash Drawer Kick Port"
                outlined
                dense
                :options="[
                  { label: 'Pin 2 Pulse (Standard 24V)', value: 'pin2' },
                  { label: 'Pin 5 Pulse (12V / Secondary)', value: 'pin5' },
                  { label: 'Realtime DLE DC4 Pulse', value: 'realtime' },
                  { label: 'Disabled (No Drawer)', value: 'none' },
                ]"
                emit-value
                map-options
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="newPrinter.cut_mode"
                label="Auto Paper Cutter"
                outlined
                dense
                :options="[
                  { label: 'Partial Cut (3-line feed)', value: 'feed_partial' },
                  { label: 'Full Cut', value: 'full' },
                  { label: 'Tear Bar / Manual Cut', value: 'none' },
                ]"
                emit-value
                map-options
              />
            </div>
          </div>

          <!-- Switches -->
          <div class="row items-center justify-between q-mt-sm bg-grey-1 q-pa-sm rounded-borders">
            <q-toggle v-model="newPrinter.is_default" label="Set as Default POS Printer" dense />
            <q-toggle v-model="newPrinter.buzzer" label="Kitchen Beep / Alarm on Print" dense />
          </div>
        </q-card-section>

        <q-card-actions align="between" class="q-px-md q-pb-md">
          <q-btn
            outline
            color="info"
            icon="print"
            label="Send Test Print & Cut"
            no-caps
            @click="testPrinterConfig"
          />
          <div class="row q-gutter-sm">
            <q-btn flat label="Cancel" v-close-popup />
            <q-btn
              color="primary"
              label="Save Printer"
              no-caps
              :loading="saving"
              :disable="!newPrinter.printer_name"
              @click="handleAddPrinter"
            />
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { usePrinterStore } from '../stores/printer.store'
import { useDeviceStore } from '../stores/device.store'
import PrinterStatusCard from '../components/PrinterStatusCard.vue'
import DeviceNavHeader from '../components/DeviceNavHeader.vue'
import { usePrinter } from '../composables/usePrinter'
import { escposPrintService } from 'src/services/escposPrintService'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const printerStore = usePrinterStore()
const deviceStore = useDeviceStore()
const { testPrint } = usePrinter()

const viewTab = ref('printers')
const showAddDialog = ref(false)
const saving = ref(false)
const testingId = ref(null)
const branchId = ref(null)

const selectedBrandProfile = ref('epson_escpos')

const printerBrandPresets = [
  { label: 'Epson ESC/POS (TM-T82, TM-T20, TM-T88, TM-m30)', value: 'epson_escpos', defaultWidth: 80, defaultCut: 'feed_partial', defaultDrawer: 'pin2' },
  { label: 'Star Micronics (TSP100, TSP650, mC-Print)', value: 'star_prnt', defaultWidth: 80, defaultCut: 'feed_partial', defaultDrawer: 'pin2' },
  { label: 'Xprinter / Rongta / Gprinter / POS-58 / POS-80 (Value)', value: 'xprinter', defaultWidth: 80, defaultCut: 'feed_partial', defaultDrawer: 'pin2' },
  { label: 'Bixolon / Citizen / Posiflex / Custom (High-Speed)', value: 'bixolon', defaultWidth: 80, defaultCut: 'feed_partial', defaultDrawer: 'pin2' },
  { label: 'Sunmi / Android POS Terminal (Internal Thermal)', value: 'sunmi_internal', defaultWidth: 58, defaultCut: 'none', defaultDrawer: 'none' },
  { label: 'Zebra / TSC (ZPL / TSPL Kitchen Label Stickers)', value: 'zebra_label', defaultWidth: 50, defaultCut: 'none', defaultDrawer: 'none' },
  { label: 'Generic ESC/POS Thermal Printer', value: 'generic_escpos', defaultWidth: 80, defaultCut: 'feed_partial', defaultDrawer: 'pin2' },
]

const printerRoleOptions = [
  { label: 'Cashier Receipt & Invoice', value: 'receipt' },
  { label: 'Main Kitchen KOT', value: 'kitchen' },
  { label: 'Beverage / Juice Bar BOT', value: 'bar' },
  { label: 'Pastry / Bakery Station', value: 'bakery' },
  { label: 'Grill / BBQ Station', value: 'grill' },
  { label: 'Delivery / Takeaway Dispatch', value: 'delivery' },
  { label: 'Food Label / Expiry Sticker', value: 'label' },
]

const connectionInterfaceOptions = [
  { label: 'Network LAN / WiFi IP (TCP Raw 9100)', value: 'network' },
  { label: 'USB Direct (Windows Spooler / Driver)', value: 'usb' },
  { label: 'WebUSB (Direct Browser Streaming)', value: 'webusb' },
  { label: 'Serial COM Port (RS-232 / Virtual COM)', value: 'serial' },
  { label: 'Bluetooth Wireless (mPOS)', value: 'bluetooth' },
]

const newPrinter = ref({
  printer_name: '',
  printer_type: 'receipt',
  connection_type: 'network',
  printer_ip: '',
  printer_port: 9100,
  paper_width: 80,
  drawer_pin: 'pin2',
  cut_mode: 'feed_partial',
  buzzer: false,
  is_default: false,
  device_id: null,
})

function onPrinterBrandChange(val) {
  const preset = printerBrandPresets.find((p) => p.value === val)
  if (preset) {
    newPrinter.value.paper_width = preset.defaultWidth
    newPrinter.value.cut_mode = preset.defaultCut
    newPrinter.value.drawer_pin = preset.defaultDrawer
  }
}

async function testPrinterConfig() {
  if (newPrinter.value.connection_type === 'network' && !newPrinter.value.printer_ip) {
    $q.notify({ type: 'warning', message: 'Enter printer IP address first' })
    return
  }
  escposPrintService.saveSettings({
    connectionType: newPrinter.value.connection_type,
    ipAddress: newPrinter.value.printer_ip,
    port: newPrinter.value.printer_port || 9100,
    paperWidth: newPrinter.value.paper_width === 58 ? '58mm' : '80mm',
    drawerPin: newPrinter.value.drawer_pin,
    autoCut: newPrinter.value.cut_mode !== 'none',
  })
  const res = await escposPrintService.printTestReceipt()
  if (res.success) {
    $q.notify({ type: 'positive', message: 'Test Print & Cut sent to printer!' })
  } else {
    $q.notify({ type: 'negative', message: res.error || 'Failed to dispatch test print' })
  }
}


const queueColumns = [
  { name: 'job_type', label: 'Type', field: 'job_type', sortable: true, align: 'left' },
  { name: 'status', label: 'Status', field: 'status', sortable: true, align: 'center' },
  { name: 'printer', label: 'Printer', field: r => r.device_printers?.printer_name || '—', align: 'left' },
  { name: 'retry_count', label: 'Retries', field: 'retry_count', align: 'center' },
  { name: 'created_at', label: 'Created', field: 'created_at', format: v => new Date(v).toLocaleString(), sortable: true, align: 'left' },
  { name: 'actions', label: '', field: 'id', align: 'right' },
]

function jobStatusColor(s) {
  return { queued: 'info', printing: 'warning', printed: 'positive', failed: 'negative', cancelled: 'grey' }[s] || 'grey'
}

onMounted(async () => {
  const authStore = (await import('src/stores/auth')).useAuthStore()
  branchId.value = authStore.activeBranchId || authStore.user?.branch_id
  if (branchId.value) {
    printerStore.loadPrinters(branchId.value)
    printerStore.loadPrintJobs(branchId.value)
    deviceStore.loadDevices(branchId.value)
  }
})

async function handleTestPrint(printer) {
  testingId.value = printer.id
  try {
    await testPrint(printer)
    $q.notify({ type: 'positive', message: 'Test print sent' })
  } catch {
    $q.notify({ type: 'negative', message: 'Test print failed' })
  } finally {
    testingId.value = null
  }
}

function configurePrinter(printer) {
  $q.notify({ message: `Configure ${printer.printer_name} — coming soon` })
}

async function handleAddPrinter() {
  saving.value = true
  try {
    await printerStore.addPrinter(newPrinter.value)
    showAddDialog.value = false
    $q.notify({ type: 'positive', message: 'Printer added' })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message })
  } finally {
    saving.value = false
  }
}

function confirmDeletePrinter(printer) {
  $q.dialog({
    title: 'Delete Printer', message: `Remove "${printer.printer_name}"?`, cancel: true, persistent: true,
  }).onOk(() => printerStore.removePrinter(printer.id))
}
</script>
