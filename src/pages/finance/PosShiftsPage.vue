<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="POS Shifts Report"
      breadcrumbs="Finance / Cash & Banking / POS Shifts"
      showRefresh
      @refresh="loadData"
    />

    <div class="fin-filters q-mb-md">
      <q-select
        v-model="filterStatus"
        :options="statusOptions"
        label="Status"
        dense
        dark
        outlined
        style="min-width: 150px"
        clearable
      />
      <q-input
        v-model="dateFrom"
        label="From Date"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-input
        v-model="dateTo"
        label="To Date"
        type="date"
        dense
        dark
        outlined
        style="min-width: 150px"
      />
      <q-btn flat dense icon="filter_list_off" color="grey-5" @click="resetFilters">
        <q-tooltip>Clear Filters</q-tooltip>
      </q-btn>
      <q-space />
      <q-btn-dropdown color="primary" icon="download" label="Export">
        <q-list dark style="background: #1e1e1e">
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

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Shift Records ({{ shifts.length }})</span>
      </div>
      <q-table
        :rows="shifts"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[25, 50, 100]"
        class="fin-table"
        :loading="loading"
        no-data-label="No shift records found"
      >
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
        
        <!-- Nested data slots -->
        <template #body-cell-cashier="props">
          <q-td :props="props">
            {{ props.row.profiles?.full_name || 'Unknown' }}
          </q-td>
        </template>
        
        <template #body-cell-branch="props">
          <q-td :props="props">
            {{ props.row.branches?.name || 'Unknown' }}
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useQuasar, exportFile } from 'quasar'
import { supabase } from 'src/boot/supabase'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

const $q = useQuasar()
const loading = ref(false)
const shifts = ref([])

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
  { name: 'cashier', label: 'Cashier', field: row => row.profiles?.full_name, align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center', sortable: true },
  { name: 'opened_date', label: 'Opened Date', field: 'opened_at', align: 'left', sortable: true, format: val => formatDateOnly(val) },
  { name: 'opened_time', label: 'Opened Time', field: 'opened_at', align: 'left', sortable: true, format: val => formatTimeOnly(val) },
  { name: 'closed_date', label: 'Closed Date', field: 'closed_at', align: 'left', sortable: true, format: val => formatDateOnly(val) },
  { name: 'closed_time', label: 'Closed Time', field: 'closed_at', align: 'left', sortable: true, format: val => formatTimeOnly(val) },
  { name: 'opening_cash_float', label: 'Opening Float', field: 'opening_cash_float', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'expected_cash', label: 'Expected Cash', field: 'expected_cash', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'counted_cash', label: 'Counted Cash', field: 'counted_cash', align: 'right', sortable: true, format: val => formatCurrency(val) },
  { name: 'variance', label: 'Variance', field: 'variance', align: 'right', sortable: true, format: val => formatCurrency(val) },
]

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
    let query = supabase
      .from('pos_shifts')
      .select(`
        *,
        profiles:cashier_id(full_name),
        branches:branch_id(name)
      `)
      .order('opened_at', { ascending: false })

    if (filterStatus.value) {
      query = query.eq('status', filterStatus.value.value || filterStatus.value)
    }
    
    if (dateFrom.value) {
      query = query.gte('opened_at', `${dateFrom.value}T00:00:00`)
    }
    
    if (dateTo.value) {
      query = query.lte('opened_at', `${dateTo.value}T23:59:59`)
    }

    const { data, error } = await query
    
    if (error) throw error
    shifts.value = data || []
  } catch (err) {
    console.error('Error loading shifts:', err)
    $q.notify({ type: 'negative', message: 'Failed to load shifts' })
  } finally {
    loading.value = false
  }
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
