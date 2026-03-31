<template>
  <ReportLayout
    title="KOT Deduction Log"
    subtitle="BOM-based stock deductions triggered by Kitchen Order Tickets"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props"
          ><q-tr :props="props" class="report-table__header-row"
            ><q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
              >{{ col.label }}</q-th
            ></q-tr
          ></template
        >
        <template #body="props"
          ><q-tr :props="props" class="report-table__row">
            <q-td key="deducted_at" :props="props">{{ fmtDateTime(props.row.deducted_at) }}</q-td>
            <q-td key="doc_number" :props="props" class="text-weight-bold text-primary">{{
              props.row.doc_number || '—'
            }}</q-td>
            <q-td key="kitchen_name" :props="props">{{ props.row.kitchen_name || '—' }}</q-td>
            <q-td key="warehouse_name" :props="props">{{ props.row.warehouse_name || '—' }}</q-td>
            <q-td key="item_count" :props="props" class="report-table__td--num text-weight-bold">{{
              props.row.item_count
            }}</q-td>
            <q-td
              key="total_cost"
              :props="props"
              class="report-table__td--num text-weight-bolder text-red"
              >{{ fmtLKR(props.row.total_cost) }}</q-td
            >
            <q-td key="status" :props="props">
              <span
                :class="[
                  'report-badge',
                  props.row.status === 'deducted'
                    ? 'report-badge--completed'
                    : props.row.status === 'reversed'
                      ? 'report-badge--cancelled'
                      : 'report-badge--pending',
                ]"
              >
                {{ props.row.status }}
              </span>
            </q-td>
            <q-td key="error_msg" :props="props" class="report-table__td--muted">{{
              props.row.error_msg || '—'
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="4" class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.items }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.cost)
            }}</q-td>
            <q-td colspan="2" /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
            <div>No deduction logs found</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { computed } from 'vue'
import { useKotDeductionLog } from 'src/services/inventoryService'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR } from 'src/services/reportService'

const { logs, loading, fetchDeductionLogs } = useKotDeductionLog()

const columns = [
  { name: 'deducted_at', label: 'Date/Time', field: 'deducted_at', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'kitchen_name', label: 'Kitchen', field: 'kitchen_name', align: 'left', sortable: true },
  { name: 'warehouse_name', label: 'Warehouse', field: 'warehouse_name', align: 'left' },
  { name: 'item_count', label: 'Ingredients', field: 'item_count', align: 'right', sortable: true },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'error_msg', label: 'Notes', field: 'error_msg', align: 'left' },
]

const rows = computed(() => logs.value)

const totals = computed(() => ({
  items: rows.value.reduce((s, r) => s + (r.item_count || 0), 0),
  cost: rows.value
    .filter((r) => r.status === 'deducted')
    .reduce((s, r) => s + (r.total_cost || 0), 0),
}))

const kpiData = computed(() => [
  {
    label: 'Total Deductions',
    value: rows.value.filter((r) => r.status === 'deducted').length,
    icon: 'inventory_2',
    color: 'blue',
  },
  {
    label: 'Reversed',
    value: rows.value.filter((r) => r.status === 'reversed').length,
    icon: 'undo',
    color: 'amber',
  },
  {
    label: 'Errors',
    value: rows.value.filter((r) => r.status === 'error').length,
    icon: 'error_outline',
    color: 'red',
  },
  { label: 'Total Cost', value: fmtLKR(totals.value.cost), icon: 'money_off', color: 'red' },
])

function fmtDateTime(val) {
  if (!val) return '—'
  const d = new Date(val)
  return (
    d.toLocaleDateString('en-GB') +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

async function loadData(filters = {}) {
  await fetchDeductionLogs({ dateFrom: filters.dateFrom, dateTo: filters.dateTo })
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'kot_deduction_log')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'kot_deduction_log')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
