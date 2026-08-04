<template>
  <q-page padding class="q-pb-xl">
    <!-- Header -->
    <div class="row items-center justify-between q-mb-md">
      <div>
        <h4 class="text-h5 q-my-none text-weight-bold">Supplier Payment Report</h4>
        <div class="text-caption text-grey-7">Ledger integrity and payment tracking</div>
      </div>
      <!-- Export Buttons -->
      <div class="row q-gutter-sm" v-if="rows.length">
        <q-btn
          flat dense
          icon="print"
          label="Print"
          color="grey-8"
          @click="handlePrintReport"
          :loading="exporting"
        />
        <q-btn
          flat dense
          icon="picture_as_pdf"
          label="Export PDF"
          color="negative"
          @click="handleExportReportPDF"
          :loading="exporting"
        />
        <q-btn
          flat dense
          icon="table_view"
          label="Export Excel"
          color="positive"
          @click="handleExportExcel"
          :loading="exporting"
        />
      </div>
    </div>

    <!-- Filter Bar -->
    <q-card class="q-mb-md flat-card" flat bordered>
      <q-card-section>
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-3">
            <q-input outlined v-model="filters.startDate" label="Start Date" type="date" dense />
          </div>
          <div class="col-12 col-md-3">
            <q-input outlined v-model="filters.endDate" label="End Date" type="date" dense />
          </div>
          <div class="col-12 col-md-4">
            <q-select
              outlined dense
              v-model="filters.supplier_id"
              :options="supplierOptions"
              option-value="id"
              option-label="name"
              label="Supplier (All)"
              emit-value map-options clearable
            />
          </div>
          <div class="col-12 col-md-2">
            <q-select
              outlined dense
              v-model="filters.taxStatus"
              :options="taxStatusOptions"
              option-value="value"
              option-label="label"
              label="Tax Status"
              emit-value map-options clearable
            />
          </div>
          <div class="col-12 col-md-2 row justify-end">
            <q-btn
              color="primary" icon="search" label="Generate"
              class="full-width" @click="fetchReport" :loading="loading"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Summary Strip -->
    <div class="row q-col-gutter-md q-mb-md" v-if="rows.length">
      <div class="col-auto">
        <q-chip icon="receipt_long" color="primary" text-color="white">
          {{ rows.length }} Record{{ rows.length !== 1 ? 's' : '' }}
        </q-chip>
      </div>
      <div class="col-auto">
        <q-chip icon="payments" color="green-8" text-color="white">
          Total: {{ formatCurrency(totalAmount) }}
        </q-chip>
      </div>
    </div>

    <!-- Data Table -->
    <q-card flat bordered class="flat-card">
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        :pagination="initialPagination"
      >
        <!-- Amount -->
        <template v-slot:body-cell-total_amount="props">
          <q-td :props="props">
            <span class="text-bold">{{ formatCurrency(props.row.total_amount) }}</span>
          </q-td>
        </template>

        <!-- Status -->
        <template v-slot:body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="getStatusColor(props.row.status)"
              :label="props.row.status.toUpperCase()"
              class="q-pa-sm" rounded
            />
          </q-td>
        </template>

        <!-- Payment Method -->
        <template v-slot:body-cell-payment_method="props">
          <q-td :props="props">
            <div class="row items-center no-wrap">
              <q-icon :name="getPaymentIcon(props.row.payment_method)" size="16px" class="q-mr-xs" color="grey-7" />
              <span>{{ formatMethod(props.row.payment_method) }}</span>
            </div>
          </q-td>
        </template>

        <!-- Per-row Actions -->
        <template v-slot:body-cell-actions="props">
          <q-td :props="props" class="text-right">
            <q-btn-group flat dense>
              <q-btn
                flat round dense size="sm"
                icon="download"
                color="primary"
                @click="handleDownloadReceipt(props.row)"
              >
                <q-tooltip>Download PDF Receipt</q-tooltip>
              </q-btn>
              <q-btn
                flat round dense size="sm"
                icon="print"
                color="grey-8"
                @click="handlePrintReceipt(props.row)"
              >
                <q-tooltip>Print Receipt</q-tooltip>
              </q-btn>
            </q-btn-group>
          </q-td>
        </template>

        <!-- Bottom Row (Total) -->
        <template v-slot:bottom-row>
          <q-tr class="bg-grey-2 text-weight-bold" v-if="rows.length > 0">
            <q-td colspan="5" class="text-right">TOTAL PAID AMOUNT:</q-td>
            <q-td class="text-left">{{ formatCurrency(totalAmount) }}</q-td>
            <q-td colspan="2"></q-td>
          </q-tr>
        </template>

        <!-- Empty State -->
        <template v-slot:no-data>
          <div class="full-width row flex-center text-grey-6 q-pa-xl">
            <q-icon name="receipt_long" size="48px" class="q-mr-sm" />
            <div class="text-h6">No payment records found</div>
          </div>
        </template>
      </q-table>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useQuasar } from 'quasar'
import { date as qDate } from 'quasar'
import { getSupplierPaymentsReport, listSuppliers } from 'src/services/procurementService'
import {
  exportPaymentReceiptToPDF,
  exportSupplierPaymentReportToPDF,
  exportTableToExcel,
} from 'src/services/exportService'

const $q = useQuasar()

const loading = ref(false)
const exporting = ref(false)
const rows = ref([])
const supplierOptions = ref([])

const today = new Date()
const pastMonth = new Date()
pastMonth.setDate(today.getDate() - 30)

const filters = ref({
  startDate: qDate.formatDate(pastMonth, 'YYYY-MM-DD'),
  endDate: qDate.formatDate(today, 'YYYY-MM-DD'),
  supplier_id: null,
  taxStatus: null,
})

const taxStatusOptions = [
  { label: 'All Suppliers', value: null },
  { label: 'Tax Registered (VAT)', value: 'TAX' },
  { label: 'Non-Tax', value: 'NON_TAX' },
]

const initialPagination = { sortBy: 'doc_date', descending: true, rowsPerPage: 20 }

const totalAmount = computed(() =>
  rows.value.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0),
)

const columns = [
  { name: 'doc_date', align: 'left', label: 'Date', field: 'doc_date', sortable: true },
  {
    name: 'supplier_name', align: 'left', label: 'Supplier Name',
    field: (row) => row.suppliers?.name || 'Unknown', sortable: true,
  },
  { name: 'doc_number', align: 'left', label: 'Document #', field: 'doc_number', sortable: true },
  { name: 'reference', align: 'left', label: 'Ref / Cheque #', field: (row) => row.cheque_no || row.reference_no || '-' },
  { name: 'payment_method', align: 'left', label: 'Method', field: 'payment_method', sortable: true },
  { name: 'total_amount', align: 'right', label: 'Amount', field: 'total_amount', sortable: true, format: (v) => formatCurrency(v) },
  { name: 'status', align: 'center', label: 'Status', field: 'status', sortable: true },
  { name: 'actions', align: 'right', label: '', field: 'actions', sortable: false },
]

onMounted(async () => {
  await fetchSuppliers()
  await fetchReport()
})

async function fetchSuppliers() {
  try {
    supplierOptions.value = await listSuppliers()
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load suppliers' })
  }
}

async function fetchReport() {
  loading.value = true
  try {
    const data = await getSupplierPaymentsReport(
      filters.value.startDate,
      filters.value.endDate,
      filters.value.supplier_id,
      filters.value.taxStatus
    )
    rows.value = data || []
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to generate report' })
  } finally {
    loading.value = false
  }
}

// ── Per-row: download / print single payment receipt ─────────────────────────

async function handleDownloadReceipt(row) {
  exporting.value = true
  try {
    await exportPaymentReceiptToPDF(row, true) // download=true
  } catch (e) {
    $q.notify({ type: 'negative', message: 'PDF generation failed', caption: e.message })
  } finally {
    exporting.value = false
  }
}

async function handlePrintReceipt(row) {
  exporting.value = true
  try {
    await exportPaymentReceiptToPDF(row, false) // download=false → opens print dialog
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Print failed', caption: e.message })
  } finally {
    exporting.value = false
  }
}

// ── Full-report export ────────────────────────────────────────────────────────

async function handleExportReportPDF() {
  exporting.value = true
  try {
    const supplierName = supplierOptions.value.find((s) => s.id === filters.value.supplier_id)?.name
    await exportSupplierPaymentReportToPDF(rows.value, {
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      supplierName,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Export failed', caption: e.message })
  } finally {
    exporting.value = false
  }
}

async function handlePrintReport() {
  exporting.value = true
  try {
    const supplierName = supplierOptions.value.find((s) => s.id === filters.value.supplier_id)?.name
    await exportSupplierPaymentReportToPDF(rows.value, {
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      supplierName,
    })
  } catch (e) {
    $q.notify({ type: 'negative', message: 'Print failed', caption: e.message })
  } finally {
    exporting.value = false
  }
}

function handleExportExcel() {
  const exportCols = columns.filter((c) => c.name !== 'actions')
  const dataToExport = [...rows.value]
  
  dataToExport.push({
    payment_method: 'TOTAL',
    total_amount: totalAmount.value
  })

  exportTableToExcel(exportCols, dataToExport, 'Supplier_Payment_Report')
  $q.notify({ type: 'positive', message: 'Excel exported successfully' })
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatCurrency(val) {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency', currency: 'LKR', minimumFractionDigits: 2,
  }).format(val || 0)
}

function formatMethod(method) {
  return (method || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getStatusColor(status) {
  switch (status) {
    case 'posted': return 'positive'
    case 'draft': return 'warning'
    case 'cancelled': return 'negative'
    default: return 'grey'
  }
}

function getPaymentIcon(method) {
  switch (method) {
    case 'cash': return 'payments'
    case 'bank_transfer': return 'account_balance'
    case 'cheque': return 'request_quote'
    case 'credit_card': return 'credit_card'
    default: return 'receipt'
  }
}
</script>

<style scoped>
.flat-card {
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02) !important;
  border-radius: 8px;
}
</style>
