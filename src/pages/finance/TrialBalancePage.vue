<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Trial Balance"
      breadcrumbs="Finance / General Ledger / Trial Balance"
      showRefresh
      @refresh="loadData"
    />

    <div class="fin-panel">
      <div class="fin-panel__header">
        <div>
          <span class="fin-panel__title">Trial Balance Report</span>
          <span class="fin-panel__subtitle text-grey-4 q-ml-sm">All posted journal entries</span>
        </div>
        <q-space />
        <div class="row q-gutter-sm">
          <q-btn flat icon="print" color="white" round @click="printReport">
            <q-tooltip dark>Print</q-tooltip>
          </q-btn>
          <q-btn flat icon="picture_as_pdf" color="white" round @click="exportPDF">
            <q-tooltip dark>PDF</q-tooltip>
          </q-btn>
          <q-btn flat icon="table_chart" color="white" round @click="exportExcel">
            <q-tooltip dark>Excel</q-tooltip>
          </q-btn>
          <q-btn flat icon="description" color="white" round @click="exportCSV">
            <q-tooltip dark>CSV</q-tooltip>
          </q-btn>
        </div>
      </div>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="code"
        flat
        dark
        dense
        hide-bottom
        :rows-per-page-options="[0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No data"
      >
        <template #body-cell-account_type="props">
          <q-td :props="props">
            <span :class="typeClass(props.row.account_type)">{{ props.row.account_type }}</span>
          </q-td>
        </template>
      </q-table>
      <div class="fin-summary-row">
        <div>
          <span class="fin-summary-row__label">Total Debit: </span
          ><span class="fin-summary-row__value text-blue-4">{{ totalDr.toFixed(2) }}</span>
        </div>
        <div>
          <span class="fin-summary-row__label">Total Credit: </span
          ><span class="fin-summary-row__value text-blue-4">{{ totalCr.toFixed(2) }}</span>
        </div>
        <div>
          <span class="fin-summary-row__label">Difference: </span>
          <span :class="['fin-summary-row__value', diff === 0 ? 'text-green-4' : 'text-red-4']">{{
            diff.toFixed(2)
          }}</span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchTrialBalance } from 'src/services/financeService'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

const loading = ref(false)
const rows = ref([])

const columns = [
  {
    name: 'code',
    label: 'Code',
    field: 'code',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'name', label: 'Account Name', field: 'name', align: 'left', sortable: true },
  {
    name: 'account_type',
    label: 'Type',
    field: 'account_type',
    align: 'left',
    style: 'width: 100px',
  },
  {
    name: 'debit_total',
    label: 'Debit',
    field: 'debit_total',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 140px',
  },
  {
    name: 'credit_total',
    label: 'Credit',
    field: 'credit_total',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 140px',
  },
]

const totalDr = computed(() => rows.value.reduce((s, r) => s + Number(r.debit_total || 0), 0))
const totalCr = computed(() => rows.value.reduce((s, r) => s + Number(r.credit_total || 0), 0))
const diff = computed(() => totalDr.value - totalCr.value)

function typeClass(type) {
  const map = {
    Asset: 'fin-badge fin-badge--info',
    Liability: 'fin-badge fin-badge--danger',
    Equity: 'fin-badge fin-badge--success',
    Revenue: 'fin-badge fin-badge--success',
    Expense: 'fin-badge fin-badge--warning',
  }
  return map[type] || 'fin-badge fin-badge--muted'
}

async function loadData() {
  loading.value = true
  const { data } = await fetchTrialBalance()
  rows.value = data || []
  loading.value = false
}

onMounted(loadData)

// ── Export / Print ──
function getExportData() {
  const exportRows = [
    ...rows.value,
    {
      code: '',
      name: 'TOTALS',
      account_type: '',
      debit_total: totalDr.value,
      credit_total: totalCr.value,
    },
  ]
  return { rows: exportRows, cols: columns, title: 'Trial_Balance' }
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
