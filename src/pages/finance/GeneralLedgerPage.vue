<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="General Ledger"
      breadcrumbs="Finance / General Ledger / Ledger View"
      showRefresh
      showExport
      @refresh="loadData"
      @export-pdf="exportPDF"
      @export-excel="exportExcel"
      @export-csv="exportCSV"
    />

    <div class="fin-filters q-mt-sm q-mb-md">
      <div class="row no-wrap items-center q-gutter-sm">
        <q-select
          v-model="selectedAccount"
          :options="filteredAccounts"
          label="Filter by Account"
          dense
          :dark="$q.dark.isActive"
          outlined
          style="width: 220px; flex-shrink: 0;"
          clearable
          emit-value
          map-options
          use-input
          input-debounce="0"
          option-value="code"
          option-label="label"
          @filter="filterAccounts"
          @update:model-value="loadData"
        />
        <q-input
          v-model="filtersSearch"
          placeholder="Search entries..."
          dense
          :dark="$q.dark.isActive"
          outlined
          clearable
          style="width: 165px; flex-shrink: 0;"
          @keyup.enter="loadData"
          @clear="loadData"
        >
          <template #prepend>
            <q-icon name="search" size="14px" class="cursor-pointer" @click="loadData" />
          </template>
        </q-input>
        <q-input
          v-model="dateFrom"
          prefix="From:"
          type="date"
          dense
          :dark="$q.dark.isActive"
          outlined
          style="width: 178px; flex-shrink: 0;"
          @update:model-value="loadData"
        />
        <q-input
          v-model="dateTo"
          prefix="To:"
          type="date"
          dense
          :dark="$q.dark.isActive"
          outlined
          style="width: 168px; flex-shrink: 0;"
          @update:model-value="loadData"
        />
        <q-btn
          flat dense round icon="filter_list_off"
          color="grey-5" size="sm"
          @click="selectedAccount = null; filtersSearch = ''; dateFrom = ''; dateTo = ''; loadData()"
        >
          <q-tooltip>Reset Filters</q-tooltip>
        </q-btn>
        <q-btn flat dense round icon="print"
          :color="$q.dark.isActive ? 'grey-4' : 'grey-7'"
          size="sm" @click="printReport"
        >
          <q-tooltip>Print</q-tooltip>
        </q-btn>
      </div>
    </div>


    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Ledger Transactions ({{ rows.length }})</span>
        <q-space />
        <q-btn flat dense icon="refresh" color="blue-5" @click="loadData" />
      </div>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        :dark="$q.dark.isActive"
        dense
        :rows-per-page-options="[25, 50, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="Select an account or search to view ledger entries"
      >
        <template #body-cell-balance="props">
          <q-td :props="props">
            <span :class="props.row._runningBalance >= 0 ? 'text-green-4' : 'text-red-4'">{{
              Number(props.row._runningBalance || 0).toFixed(2)
            }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchGeneralLedger, fetchChartOfAccounts } from 'src/services/financeService'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

const loading = ref(false)
const rows = ref([])
const accountOptions = ref([])
const filteredAccounts = ref([])
const selectedAccount = ref(null)
const filtersSearch = ref('')
const dateFrom = ref('')
const dateTo = ref('')

function filterAccounts(val, update) {
  update(() => {
    if (!val) {
      filteredAccounts.value = accountOptions.value
    } else {
      const needle = val.toLowerCase()
      filteredAccounts.value = accountOptions.value.filter(
        (a) => a.label.toLowerCase().includes(needle)
      )
    }
  })
}

const columns = [
  {
    name: 'date',
    label: 'Date',
    field: (row) => row.journal_entries?.doc_date || '-',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  {
    name: 'description',
    label: 'Description',
    field: (row) => row.journal_entries?.description || '-',
    align: 'left',
  },
  {
    name: 'ref',
    label: 'Ref Type',
    field: (row) => row.journal_entries?.reference_type || '-',
    align: 'left',
    style: 'width: 100px',
  },
  {
    name: 'debit',
    label: 'Debit',
    field: 'dr_amount',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 120px',
  },
  {
    name: 'credit',
    label: 'Credit',
    field: 'cr_amount',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 120px',
  },
  {
    name: 'balance',
    label: 'Running Balance',
    field: '_runningBalance',
    align: 'right',
    style: 'width: 130px',
  },
]

async function loadData() {
  loading.value = true
  const { data } = await fetchGeneralLedger({
    accountCode: selectedAccount.value,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
    search: filtersSearch.value || undefined,
  })
  // Calculate running balance
  let balance = 0
  const sorted = (data || []).sort(
    (a, b) =>
      new Date(a.journal_entries?.doc_date || 0) - new Date(b.journal_entries?.doc_date || 0),
  )
  sorted.forEach((row) => {
    balance += Number(row.dr_amount || 0) - Number(row.cr_amount || 0)
    row._runningBalance = balance
  })
  rows.value = sorted
  loading.value = false
}

async function loadAccounts() {
  const { data } = await fetchChartOfAccounts()
  accountOptions.value = (data || []).map((a) => ({ code: a.code, label: `${a.code} - ${a.name}` }))
  filteredAccounts.value = accountOptions.value
}

onMounted(async () => {
  await loadAccounts()
  loadData()
})

// ── Export / Print ──
function getExportData() {
  const exportCols = columns.filter((c) => c.name !== 'actions')
  const title = selectedAccount.value ? `General_Ledger_${selectedAccount.value}` : 'General_Ledger'
  return { rows: rows.value, cols: exportCols, title }
}
function printReport() {
  window.print()
}
function exportCSV() {
  const d = getExportData()
  exportTableToCSV(d.cols, d.rows, d.title)
}
function exportExcel() {
  const d = getExportData()
  exportTableToExcel(d.cols, d.rows, d.title)
}
function exportPDF() {
  const d = getExportData()
  exportTableToPDF(d.cols, d.rows, d.title)
}
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
