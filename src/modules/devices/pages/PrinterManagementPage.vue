<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold">Printer Management</div>
        <div class="text-caption text-grey">Configure receipt and kitchen printers</div>
      </div>
      <q-space />
      <q-btn-toggle v-model="viewTab" flat no-caps dense :options="[
        { label: 'Printers', value: 'printers' },
        { label: 'Print Queue', value: 'queue' },
      ]" class="q-mr-md" />
      <q-btn color="primary" icon="add" label="Add Printer" @click="showAddDialog = true" />
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

    <!-- Add Printer Dialog -->
    <q-dialog v-model="showAddDialog" persistent>
      <q-card style="min-width: 450px">
        <q-card-section class="text-h6">Add Printer</q-card-section>
        <q-card-section>
          <q-input v-model="newPrinter.printer_name" label="Printer Name *" outlined dense class="q-mb-sm" />
          <q-select v-model="newPrinter.printer_type" label="Printer Type *" outlined dense
                    :options="printerTypes" emit-value map-options class="q-mb-sm" />
          <q-select v-model="newPrinter.device_id" label="Parent Device *" outlined dense
                    :options="deviceOptions" emit-value map-options class="q-mb-sm" />
          <q-input v-model="newPrinter.printer_ip" label="IP Address" outlined dense class="q-mb-sm" />
          <q-input v-model.number="newPrinter.printer_port" label="Port" outlined dense type="number" class="q-mb-sm" />
          <q-select v-model.number="newPrinter.paper_width" label="Paper Width" outlined dense
                    :options="[{ label: '58mm', value: 58 }, { label: '80mm', value: 80 }]"
                    emit-value map-options class="q-mb-sm" />
          <q-input v-model="newPrinter.station_id" label="Kitchen Station ID" outlined dense
                   hint="For kitchen printers only" class="q-mb-sm" />
          <q-toggle v-model="newPrinter.is_default" label="Set as default printer" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Add Printer" @click="handleAddPrinter" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePrinterStore } from '../stores/printer.store'
import { useDeviceStore } from '../stores/device.store'
import PrinterStatusCard from '../components/PrinterStatusCard.vue'
import { usePrinter } from '../composables/usePrinter'
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

const newPrinter = ref({
  printer_name: '', printer_type: 'receipt', device_id: null,
  printer_ip: '', printer_port: 9100, paper_width: 80,
  station_id: '', is_default: false,
})

const printerTypes = [
  { label: 'Receipt', value: 'receipt' },
  { label: 'Kitchen', value: 'kitchen' },
  { label: 'Label', value: 'label' },
  { label: 'Report', value: 'report' },
]

const deviceOptions = computed(() =>
  deviceStore.printers.map(d => ({ label: d.device_name, value: d.id }))
)

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
