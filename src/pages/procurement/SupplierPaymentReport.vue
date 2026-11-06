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
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-sm-6 col-md-2">
            <q-input outlined v-model="filters.startDate" label="Start Date" type="date" dense />
          </div>
          <div class="col-12 col-sm-6 col-md-2">
            <q-input outlined v-model="filters.endDate" label="End Date" type="date" dense />
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              outlined dense
              v-model="filters.supplier_id"
              :options="supplierOptions"
              option-value="id"
              option-label="name"
              label="Supplier (All)"
              emit-value map-options clearable
              use-input fill-input hide-selected
              input-debounce="0"
              @filter="filterSuppliers"
            >
              <template #no-option>
                <q-item><q-item-section class="text-grey">No matching suppliers</q-item-section></q-item>
              </template>
            </q-select>
          </div>
          <div class="col-12 col-sm-6 col-md-3">
            <q-select
              outlined dense
              v-model="filters.item_id"
              :options="itemOptions"
              option-value="id"
              :option-label="(opt) => opt ? (opt.code ? `${opt.code} - ${opt.name}` : opt.name) : 'All Items'"
              label="Item (All)"
              emit-value map-options clearable
              use-input fill-input hide-selected
              input-debounce="0"
              @filter="filterItems"
            >
              <template #no-option>
                <q-item><q-item-section class="text-grey">No matching items</q-item-section></q-item>
              </template>
            </q-select>
          </div>
          <div class="col-12 col-sm-6 col-md-2">
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
          <div class="col-12 col-sm-6 col-md-auto">
            <q-btn
              color="primary" icon="search" label="Generate" unelevated
              class="full-width" style="height: 40px; min-width: 110px;" @click="fetchReport" :loading="loading"
            />
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Summary Strip -->
    <div class="row q-col-gutter-sm q-mb-md items-center" v-if="rows.length || filters.supplier_id || filters.item_id">
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
      <div class="col-auto" v-if="filters.supplier_id">
        <q-chip icon="store" color="blue-grey-7" text-color="white" removable @remove="filters.supplier_id = null; fetchReport()">
          Supplier: {{ getSupplierName(filters.supplier_id) }}
        </q-chip>
      </div>
      <div class="col-auto" v-if="filters.item_id">
        <q-chip icon="inventory_2" color="indigo-7" text-color="white" removable @remove="filters.item_id = null; fetchReport()">
          Item: {{ getItemName(filters.item_id) }}
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
        <!-- Items -->
        <template v-slot:body-cell-items="props">
          <q-td :props="props">
            <div class="ellipsis" style="max-width: 240px;">
              <span v-if="props.value !== '—'" :title="props.value" class="text-weight-medium text-primary">{{ props.value }}</span>
              <span v-else class="text-grey-5">—</span>
            </div>
            <q-tooltip v-if="props.value !== '—'" max-width="380px">{{ props.value }}</q-tooltip>
          </q-td>
        </template>

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
          <q-tr class="text-weight-bold" :class="$q.dark.isActive ? 'bg-grey-9' : 'bg-grey-2'" v-if="rows.length > 0">
            <q-td colspan="6" class="text-right">TOTAL PAID AMOUNT (posted only):</q-td>
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
import { useQuasar, date as qDate } from 'quasar'
import {
  getSupplierPaymentsReport,
  listSuppliers,
  listItems,
  sumPostedPayments,
} from 'src/services/procurementService'
import {
  exportPaymentReceiptToPDF,
  exportSupplierPaymentReportToPDF,
  exportTableToExcel,
} from 'src/services/exportService'

const $q = useQuasar()

const loading = ref(false)
const exporting = ref(false)
const rows = ref([])

const allSuppliers = ref([])
const supplierOptions = ref([])

const allItems = ref([])
const itemOptions = ref([])

const today = new Date()
const pastMonth = new Date()
pastMonth.setDate(today.getDate() - 30)

const filters = ref({
  startDate: qDate.formatDate(pastMonth, 'YYYY-MM-DD'),
  endDate: qDate.formatDate(today, 'YYYY-MM-DD'),
  supplier_id: null,
  item_id: null,
  taxStatus: null,
})

const taxStatusOptions = [
  { label: 'All Suppliers', value: null },
  { label: 'Tax Registered (VAT)', value: 'TAX' },
  { label: 'Non-Tax', value: 'NON_TAX' },
]

const initialPagination = { sortBy: 'doc_date', descending: true, rowsPerPage: 20 }

// "Total paid" counts POSTED payments only — draft/cancelled rows are listed
// for reference but must not inflate the paid figure.
const totalAmount = computed(() => sumPostedPayments(rows.value))

const columns = [
  { name: 'doc_date', align: 'left', label: 'Date', field: 'doc_date', sortable: true },
  {
    name: 'supplier_name', align: 'left', label: 'Supplier Name',
    field: (row) => row.suppliers?.name || 'Unknown', sortable: true,
  },
  { name: 'doc_number', align: 'left', label: 'Document #', field: 'doc_number', sortable: true },
  {
    name: 'items', align: 'left', label: 'Items',
    field: (row) => getPaymentItemsSummary(row),
    sortable: false,
  },
  { name: 'reference', align: 'left', label: 'Ref / Cheque #', field: (row) => row.cheque_no || row.reference_no || '-' },
  { name: 'payment_method', align: 'left', label: 'Method', field: 'payment_method', sortable: true },
  { name: 'total_amount', align: 'right', label: 'Amount', field: 'total_amount', sortable: true, format: (v) => formatCurrency(v) },
  { name: 'status', align: 'center', label: 'Status', field: 'status', sortable: true },
  { name: 'actions', align: 'right', label: '', field: 'actions', sortable: false },
]

function filterSuppliers(val, update) {
  const selected = allSuppliers.value.find((s) => s.id === filters.value.supplier_id)
  const selectedLabel = selected?.name || ''

  update(() => {
    const q = (val || '').toLowerCase().trim()
    if (!q || (selectedLabel && val === selectedLabel)) {
      supplierOptions.value = allSuppliers.value
    } else {
      supplierOptions.value = allSuppliers.value.filter(
        (s) => s.name?.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q))
      )
    }
  })
}

function filterItems(val, update) {
  const selected = allItems.value.find((i) => i.id === filters.value.item_id)
  const selectedLabel = selected ? (selected.code ? `${selected.code} - ${selected.name}` : selected.name) : ''

  update(() => {
    const q = (val || '').toLowerCase().trim()
    if (!q || (selectedLabel && val === selectedLabel)) {
      itemOptions.value = allItems.value
    } else {
      itemOptions.value = allItems.value.filter(
        (i) =>
          (i.name && i.name.toLowerCase().includes(q)) ||
          (i.code && i.code.toLowerCase().includes(q))
      )
    }
  })
}

function getSupplierName(id) {
  const s = allSuppliers.value.find((x) => x.id === id)
  return s ? s.name : ''
}

function getItemName(id) {
  const i = allItems.value.find((x) => x.id === id)
  return i ? (i.code ? `${i.code} - ${i.name}` : i.name) : ''
}

function getPaymentItemsSummary(row) {
  const allocs = row.supplier_payment_allocations || []
  const itemNames = allocs
    .flatMap((a) => a.ap_invoices?.ap_invoice_lines || [])
    .map((l) => {
      const code = l.items?.code ? `[${l.items.code}] ` : ''
      const name = l.items?.name || l.description || ''
      return `${code}${name}`.trim()
    })
    .filter(Boolean)
  const unique = Array.from(new Set(itemNames))
  return unique.length ? unique.join(', ') : '—'
}

onMounted(async () => {
  await Promise.all([fetchSuppliers(), fetchItems()])
  await fetchReport()
})

async function fetchSuppliers() {
  try {
    const data = await listSuppliers()
    allSuppliers.value = data || []
    supplierOptions.value = allSuppliers.value
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load suppliers' })
  }
}

async function fetchItems() {
  try {
    const data = await listItems()
    allItems.value = data || []
    itemOptions.value = allItems.value
  } catch {
    $q.notify({ type: 'negative', message: 'Failed to load items' })
  }
}

async function fetchReport() {
  loading.value = true
  try {
    const data = await getSupplierPaymentsReport(
      filters.value.startDate,
      filters.value.endDate,
      filters.value.supplier_id,
      filters.value.taxStatus,
      filters.value.item_id,
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
    const supplierName = allSuppliers.value.find((s) => s.id === filters.value.supplier_id)?.name
    const itemName = allItems.value.find((i) => i.id === filters.value.item_id)?.name
    await exportSupplierPaymentReportToPDF(rows.value, {
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      supplierName,
      itemName,
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
    const supplierName = allSuppliers.value.find((s) => s.id === filters.value.supplier_id)?.name
    const itemName = allItems.value.find((i) => i.id === filters.value.item_id)?.name
    await exportSupplierPaymentReportToPDF(rows.value, {
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
      supplierName,
      itemName,
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
    total_amount: totalAmount.value,
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
