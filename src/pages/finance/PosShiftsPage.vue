<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="point_of_sale"
      subtitle="Cashier shift takings, variances and GL posting"
      title="POS Shifts Report"
      breadcrumbs="Finance / Cash & Banking / POS Shifts"
      show-refresh
      @refresh="loadData"
    />

    <div class="fin-filters q-mb-md">
      <q-select
        v-model="filterStatus"
        :options="statusOptions"
        label="Status"
        dense
        outlined
        style="min-width: 150px"
        clearable
      />
      <q-input
        v-model="dateFrom"
        label="From Date"
        type="date"
        dense
        outlined
        style="min-width: 150px"
      />
      <q-input
        v-model="dateTo"
        label="To Date"
        type="date"
        dense
        outlined
        style="min-width: 150px"
      />
      <q-btn flat dense icon="filter_list_off" color="grey-5" @click="resetFilters">
        <q-tooltip>Clear Filters</q-tooltip>
      </q-btn>
      <q-space />
      <q-input
        v-if="canPostGl"
        v-model="catchUpFrom"
        label="Post unposted sales from"
        type="date"
        dense
        outlined
        style="min-width: 180px"
      />
      <q-btn
        v-if="canPostGl"
        color="deep-orange"
        icon="sync_alt"
        label="Post Unposted Sales to GL"
        no-caps
        :loading="postingGl"
        @click="runCatchUp"
      >
        <q-tooltip>Runs fn_pos_post_unposted_sales: posts every paid order with no POS sale GL entry yet</q-tooltip>
      </q-btn>
      <q-btn-dropdown color="primary" icon="download" label="Export">
        <q-list>
          <q-item clickable v-close-popup @click="exportToCsv">
            <q-item-section avatar><q-icon name="description" /></q-item-section>
            <q-item-section>Export to CSV</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="exportToExcel">
            <q-item-section avatar><q-icon name="table_view" /></q-item-section>
            <q-item-section>Export to Excel</q-item-section>
          </q-item>
          <q-item clickable v-close-popup @click="exportToPdf">
            <q-item-section avatar><q-icon name="picture_as_pdf" /></q-item-section>
            <q-item-section>Export to PDF</q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>

    <q-banner v-if="openFailureCount > 0" dense class="bg-red-10 text-white q-mb-md rounded-borders">
      <template #avatar><q-icon name="error" /></template>
      {{ openFailureCount }} unresolved POS GL posting failure(s) logged in pos_gl_failures.
      <span v-if="canPostGl">Fix the cause (e.g. missing ledger mapping) and run "Post Unposted Sales to GL".</span>
    </q-banner>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Shift Records ({{ shifts.length }})</span>
      </div>
      <q-table
        :rows="shifts"
        :columns="columns"
        row-key="id"
        flat
        dense
        :rows-per-page-options="[25, 50, 100]"
        class="fin-table"
        :loading="loading"
        no-data-label="No shift records found"
      >
        <template #body-cell-gl_status="props">
          <q-td :props="props" class="text-center">
            <q-badge :color="glBadge(props.row).color" text-color="white">{{ glBadge(props.row).label }}</q-badge>
            <q-tooltip v-if="glStatus.get(props.row.id)" max-width="360px">
              <div>Orders posted: {{ glStatus.get(props.row.id).ordersPosted }} / {{ glStatus.get(props.row.id).orders }}</div>
              <div v-if="glStatus.get(props.row.id).varianceNeeded">
                Variance GL: {{ glStatus.get(props.row.id).variancePosted ? 'posted' : 'NOT posted' }}
              </div>
              <div v-if="glStatus.get(props.row.id).payouts">
                Payouts posted: {{ glStatus.get(props.row.id).payoutsPosted }} / {{ glStatus.get(props.row.id).payouts }}
              </div>
              <div v-for="f in glStatus.get(props.row.id).failures" :key="f.id" class="text-red-3">
                {{ f.kind }}: {{ f.error }}
              </div>
            </q-tooltip>
          </q-td>
        </template>

        <template #body-cell-variance="props">
          <q-td :props="props" :class="Number(props.row.variance) < 0 ? 'text-red-4' : Number(props.row.variance) > 0 ? 'text-amber-4' : ''">
            {{ props.value }}
          </q-td>
        </template>

        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="props.row.status === 'open' ? 'green' : props.row.status === 'closed' ? 'grey' : 'orange'"
              text-color="white"
            >
              {{ props.row.status.toUpperCase() }}
            </q-badge>
          </q-td>
        </template>
        
        <template #body-cell-opened_by="props">
          <q-td :props="props">
            {{ props.row.opened_by_user?.full_name || props.row.profiles?.full_name || 'Unknown' }}
          </q-td>
        </template>
        
        <template #body-cell-closed_by="props">
          <q-td :props="props">
            <span v-if="props.row.closed_by_user?.full_name">{{ props.row.closed_by_user.full_name }}</span>
            <span v-else-if="props.row.status === 'open'" class="text-grey">Still Open</span>
            <span v-else class="text-grey">N/A</span>
          </q-td>
        </template>
        
        <template #body-cell-branch="props">
          <q-td :props="props">
            {{ props.row.branches?.name || 'Unknown' }}
          </q-td>
        </template>

        <!-- Action column with View Invoices, Print Z-Report, and Download -->
        <template #body-cell-actions="props">
          <q-td :props="props" class="text-center">
            <div class="row items-center justify-center q-gutter-xs no-wrap">
              <!-- View Shift Invoices Button -->
              <q-btn
                dense
                unelevated
                color="primary"
                icon="receipt_long"
                label="Invoices"
                size="sm"
                class="q-px-xs text-weight-bold"
                @click="openShiftInvoices(props.row)"
              >
                <q-tooltip>View All Shift Invoices & Orders</q-tooltip>
              </q-btn>

              <!-- Print Shift Z-Report -->
              <q-btn
                flat
                round
                dense
                size="sm"
                color="amber-4"
                icon="print"
                @click="printShiftZReport(props.row)"
              >
                <q-tooltip>Print Shift Z-Report Receipt</q-tooltip>
              </q-btn>

              <!-- Download Shift Statement PDF -->
              <q-btn
                flat
                round
                dense
                size="sm"
                color="cyan-4"
                icon="download"
                @click="downloadShiftSummaryPdf(props.row)"
              >
                <q-tooltip>Download Shift Statement PDF</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Shift Invoices Dialog -->
    <ShiftInvoicesDialog
      v-model="showShiftInvoicesModal"
      :shift="selectedShiftForInvoices"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useQuasar, exportFile } from 'quasar'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import ShiftInvoicesDialog from 'src/components/pos/ShiftInvoicesDialog.vue'
import { printService } from 'src/services/printService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { useAuthStore } from 'src/stores/auth'
import { financePosShiftService, shiftTenderBreakdown } from 'src/modules/finance/services/finance-pos-shift.service'

const $q = useQuasar()
const authStore = useAuthStore()
// fn_pos_post_unposted_sales and pos_gl_failures are admin/finance only (server-enforced too).
const canPostGl = computed(() => authStore.hasAnyRole(['admin', 'finance']))
const glStatus = ref(new Map())
const openFailureCount = ref(0)
const postingGl = ref(false)
const catchUpFrom = ref('')
const loading = ref(false)
const shifts = ref([])
const showShiftInvoicesModal = ref(false)
const selectedShiftForInvoices = ref(null)

// Filters
const filterStatus = ref(null)
const dateFrom = ref('')
const dateTo = ref('')

const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Closing', value: 'closing' },
]

const columns = [
  { name: 'branch', label: 'Branch', field: row => row.branches?.name, align: 'left', sortable: true },
  { name: 'terminal_id', label: 'Terminal', field: 'terminal_id', align: 'left', sortable: true },
  { name: 'opened_by', label: 'Opened By', field: row => row.opened_by_user?.full_name || row.profiles?.full_name, align: 'left', sortable: true },
  { name: 'closed_by', label: 'Closed By', field: row => row.closed_by_user?.full_name, align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'opened_date', label: 'Opened Date', field: 'opened_at', align: 'left', sortable: true, format: val => formatDateOnly(val) },
  { name: 'opened_time', label: 'Opened Time', field: 'opened_at', align: 'left', sortable: true, format: val => formatTimeOnly(val) },
  { name: 'closed_date', label: 'Closed Date', field: 'closed_at', align: 'left', sortable: true, format: val => formatDateOnly(val) },
  { name: 'closed_time', label: 'Closed Time', field: 'closed_at', align: 'left', sortable: true, format: val => formatTimeOnly(val) },
  { name: 'cash_sales', label: 'Cash', field: (r) => shiftTenderBreakdown(r).cash, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'card_sales', label: 'Card (incl. Visa/Master)', field: (r) => shiftTenderBreakdown(r).card, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'qr_sales', label: 'QR', field: (r) => shiftTenderBreakdown(r).qr, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'bank_sales', label: 'Bank', field: (r) => shiftTenderBreakdown(r).bank, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'credit_sales', label: 'Credit (AR)', field: (r) => shiftTenderBreakdown(r).credit, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'total_sales', label: 'Total Sales', field: (r) => shiftTenderBreakdown(r).total, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'payouts', label: 'Payouts', field: (r) => Number(r.cash_out_total) || 0, align: 'right', sortable: true, format: (val) => formatCurrency(val) },
  { name: 'opening_cash_float', label: 'Opening Float', field: 'opening_cash_float', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'expected_cash', label: 'Expected Cash', field: 'expected_cash', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'counted_cash', label: 'Counted Cash', field: 'counted_cash', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'variance', label: 'Variance', field: 'variance', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'gl_status', label: 'GL', field: (r) => glStatus.value.get(r.id)?.status || '', align: 'center', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center' },
]

function glBadge(row) {
  const st = glStatus.value.get(row.id)
  if (!st) return { label: '-', color: 'grey-7' }
  return {
    posted: { label: 'POSTED', color: 'positive' },
    pending: { label: 'IN PROGRESS', color: 'blue-8' },
    unposted: { label: `UNPOSTED (${st.ordersUnposted})`, color: 'orange-9' },
    failed: { label: 'FAILED', color: 'negative' },
  }[st.status] || { label: st.status, color: 'grey-7' }
}

async function loadGlStatus(rows) {
  if (!canPostGl.value) {
    // GL tables are finance-only under RLS; show nothing rather than a false "unposted".
    glStatus.value = new Map()
    return
  }
  try {
    const [map, failures] = await Promise.all([
      financePosShiftService.loadGlStatus(rows),
      financePosShiftService.countOpenFailures(),
    ])
    glStatus.value = map
    openFailureCount.value = failures
  } catch (err) {
    console.error('Error loading POS GL status:', err)
    $q.notify({ type: 'warning', message: 'Could not load GL posting status' })
  }
}

async function runCatchUp() {
  postingGl.value = true
  try {
    const { posted, failed } = await financePosShiftService.postUnpostedSales(catchUpFrom.value || null)
    $q.notify({
      type: failed ? 'warning' : 'positive',
      message: `POS GL catch-up: ${posted} order(s) posted${failed ? `, ${failed} failed (see pos_gl_failures)` : ''}`,
    })
    await loadData()
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Catch-up posting failed' })
  } finally {
    postingGl.value = false
  }
}

function openShiftInvoices(row) {
  selectedShiftForInvoices.value = row
  showShiftInvoicesModal.value = true
}

function printShiftZReport(row) {
  printService.printShiftSummary(row)
}

function downloadShiftSummaryPdf(row) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('SEVEN WAVES RESTAURANT - POS SHIFT STATEMENT', 14, 20)
  
  doc.setFontSize(10)
  doc.text(`Branch: ${row.branches?.name || 'Main Branch'}`, 14, 28)
  doc.text(`Terminal: ${row.terminal_id || 'POS-1'}`, 14, 34)
  doc.text(`Cashier (Opened): ${row.opened_by_user?.full_name || row.profiles?.full_name || 'Staff'}`, 14, 40)
  doc.text(`Opened At: ${formatDateOnly(row.opened_at)} ${formatTimeOnly(row.opened_at)}`, 14, 46)
  doc.text(`Closed At: ${formatDateOnly(row.closed_at)} ${formatTimeOnly(row.closed_at)}`, 14, 52)
  doc.text(`Status: ${(row.status || '').toUpperCase()}`, 14, 58)

  const summaryData = [
    ['Opening Cash Float', `LKR ${formatCurrency(row.opening_cash_float)}`],
    ['Cash Sales Total', `LKR ${formatCurrency(row.cash_sales_total || 0)}`],
    ['Card Sales Total', `LKR ${formatCurrency(row.card_sales_total || 0)}`],
    ['QR / Online Sales Total', `LKR ${formatCurrency(row.qr_sales_total || 0)}`],
    ['Bank Sales Total', `LKR ${formatCurrency(row.bank_sales_total || 0)}`],
    ['  of which Visa', `LKR ${formatCurrency(row.visa_sales_total || 0)}`],
    ['  of which Master', `LKR ${formatCurrency(row.master_sales_total || 0)}`],
    ['Credit (AR) Sales Total', `LKR ${formatCurrency(row.credit_sales_total || 0)}`],
    ['Total Sales', `LKR ${formatCurrency(shiftTenderBreakdown(row).total)}`],
    ['Refunds', `LKR ${formatCurrency(row.refunds_total || 0)}`],
    ['Cash In (float top-up)', `LKR ${formatCurrency(row.cash_in_total || 0)}`],
    ['Cash Out (payouts)', `LKR ${formatCurrency(row.cash_out_total || 0)}`],
    ['Cash Drops (to safe)', `LKR ${formatCurrency(row.cash_drops_total || 0)}`],
    ['Expected Cash in Drawer', `LKR ${formatCurrency(row.expected_cash || 0)}`],
    ['Counted Cash in Drawer', `LKR ${formatCurrency(row.counted_cash || 0)}`],
    ['Variance', `LKR ${formatCurrency(row.variance || 0)}`],
  ]

  autoTable(doc, {
    startY: 65,
    head: [['Description', 'Amount']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] }
  })

  doc.save(`shift_${row.id?.substring(0, 8)}_statement.pdf`)
  $q.notify({ type: 'positive', message: 'Shift statement downloaded' })
}

function formatCurrency(val) {
  if (val == null) return '-'
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateOnly(val) {
  if (!val) return '-'
  return new Date(val).toLocaleDateString('en-GB', { 
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function formatTimeOnly(val) {
  if (!val) return '-'
  return new Date(val).toLocaleTimeString('en-US', { 
    hour: '2-digit', minute: '2-digit', hour12: true
  })
}

function resetFilters() {
  filterStatus.value = null
  dateFrom.value = ''
  dateTo.value = ''
}

async function loadData() {
  loading.value = true
  try {
    // Paged (>1000 shifts) and day bounds in local time, not UTC.
    shifts.value = await financePosShiftService.listShifts({
      status: filterStatus.value?.value || filterStatus.value || null,
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
    })
  } catch (err) {
    console.error('Error loading shifts:', err)
    $q.notify({ type: 'negative', message: 'Failed to load shifts' })
  } finally {
    loading.value = false
  }
  await loadGlStatus(shifts.value)
}

// Watch filters to auto-reload
watch([filterStatus, dateFrom, dateTo], () => {
  loadData()
})

onMounted(() => {
  loadData()
})

// Export functionality
function wrapCsvValue(val, formatFn, row) {
  let formatted = formatFn !== void 0 ? formatFn(val, row) : val

  formatted = formatted === void 0 || formatted === null ? '' : String(formatted)

  formatted = formatted.split('"').join('""')
  return `"${formatted}"`
}

function exportToCsv() {
  const content = [columns.map(col => wrapCsvValue(col.label))]
    .concat(
      shifts.value.map(row =>
        columns
          .map(col =>
            wrapCsvValue(
              typeof col.field === 'function'
                ? col.field(row)
                : row[col.field === void 0 ? col.name : col.field],
              col.format,
              row
            )
          )
          .join(',')
      )
    )
    .join('\r\n')

  const statusStr = exportFile('pos_shifts_report.csv', content, 'text/csv')

  if (statusStr !== true) {
    $q.notify({
      message: 'Browser denied file download...',
      color: 'negative',
      icon: 'warning'
    })
  } else {
    $q.notify({
      message: 'CSV exported successfully',
      color: 'positive',
      position: 'top',
      icon: 'check'
    })
  }
}

function exportToExcel() {
  const exportData = shifts.value.map(row => {
    const obj = {}
    columns.forEach(col => {
      let val = typeof col.field === 'function' ? col.field(row) : row[col.field === void 0 ? col.name : col.field]
      if (col.format) val = col.format(val, row)
      obj[col.label] = val
    })
    return obj
  })
  
  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'POS Shifts')
  
  XLSX.writeFile(workbook, 'pos_shifts_report.xlsx')
  
  $q.notify({
    message: 'Excel exported successfully',
    color: 'positive',
    position: 'top',
    icon: 'check'
  })
}

function exportToPdf() {
  const doc = new jsPDF('landscape')
  
  doc.setFontSize(18)
  doc.text('POS Shifts Report', 14, 22)
  
  doc.setFontSize(11)
  doc.setTextColor(100)
  
  let filtersText = []
  if (filterStatus.value) filtersText.push(`Status: ${filterStatus.value.label || filterStatus.value}`)
  if (dateFrom.value) filtersText.push(`From: ${dateFrom.value}`)
  if (dateTo.value) filtersText.push(`To: ${dateTo.value}`)
  
  if (filtersText.length) {
    doc.text(filtersText.join(' | '), 14, 30)
  }
  
  const head = [columns.map(col => col.label)]
  const body = shifts.value.map(row => {
    return columns.map(col => {
      let val = typeof col.field === 'function' ? col.field(row) : row[col.field === void 0 ? col.name : col.field]
      if (col.format) val = col.format(val, row)
      return val == null ? '' : String(val).replace(/&amp;/g, '&')
    })
  })
  
  autoTable(doc, {
    startY: filtersText.length ? 36 : 30,
    head: head,
    body: body,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  })
  
  doc.save('pos_shifts_report.pdf')
  
  $q.notify({
    message: 'PDF exported successfully',
    color: 'positive',
    position: 'top',
    icon: 'check'
  })
}
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
