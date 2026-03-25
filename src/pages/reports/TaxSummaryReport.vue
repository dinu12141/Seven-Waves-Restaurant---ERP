<template>
  <ReportLayout
    title="Tax Summary Report"
    subtitle="Tax collected breakdown by period"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="date"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[31, 50, 100]"
        :pagination="{ rowsPerPage: 31 }"
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
            <q-td key="date" :props="props" class="text-weight-bold">{{
              fmtDate(props.row.date)
            }}</q-td>
            <q-td key="bill_count" :props="props" class="report-table__td--num">{{
              props.row.bill_count
            }}</q-td>
            <q-td key="taxable_amount" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.taxable_amount)
            }}</q-td>
            <q-td
              key="tax_amount"
              :props="props"
              class="report-table__td--num text-weight-bold text-blue"
              >{{ fmtLKR(props.row.tax_amount) }}</q-td
            >
            <q-td
              key="total_with_tax"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total_with_tax) }}</q-td
            >
            <q-td key="effective_rate" :props="props" class="report-table__td--num">{{
              fmtPercent(props.row.effective_rate)
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.bills }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.taxable)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-blue">{{
              fmtLKR(totals.tax)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              totals.taxable > 0 ? fmtPercent((totals.tax / totals.taxable) * 100) : '0%'
            }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="account_balance" size="40px" class="q-mb-sm" />
            <div>No tax data</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent, fmtDate, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'bill_count', label: 'Bills', field: 'bill_count', align: 'right', sortable: true },
  {
    name: 'taxable_amount',
    label: 'Taxable Amount',
    field: 'taxable_amount',
    align: 'right',
    sortable: true,
  },
  {
    name: 'tax_amount',
    label: 'Tax Collected',
    field: 'tax_amount',
    align: 'right',
    sortable: true,
  },
  {
    name: 'total_with_tax',
    label: 'Total with Tax',
    field: 'total_with_tax',
    align: 'right',
    sortable: true,
  },
  {
    name: 'effective_rate',
    label: 'Effective Rate',
    field: 'effective_rate',
    align: 'right',
    sortable: true,
  },
]
const totals = computed(() => ({
  bills: rows.value.reduce((s, r) => s + r.bill_count, 0),
  taxable: rows.value.reduce((s, r) => s + r.taxable_amount, 0),
  tax: rows.value.reduce((s, r) => s + r.tax_amount, 0),
  total: rows.value.reduce((s, r) => s + r.total_with_tax, 0),
}))
const kpiData = computed(() => [
  {
    label: 'Total Tax Collected',
    value: fmtLKR(totals.value.tax),
    icon: 'account_balance',
    color: 'blue',
  },
  {
    label: 'Taxable Revenue',
    value: fmtLKR(totals.value.taxable),
    icon: 'payments',
    color: 'green',
  },
  {
    label: 'Total with Tax',
    value: fmtLKR(totals.value.total),
    icon: 'trending_up',
    color: 'purple',
  },
  {
    label: 'Effective Rate',
    value:
      totals.value.taxable > 0 ? fmtPercent((totals.value.tax / totals.value.taxable) * 100) : '0%',
    icon: 'percent',
    color: 'amber',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select('created_at,subtotal,tax_amount,total_amount,status')
      .neq('status', 'cancelled')
      .neq('status', 'void')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.order('created_at').limit(5000)
    if (error) throw error
    // Aggregate by day
    const dayMap = {}
    ;(data || []).forEach((b) => {
      const d = b.created_at?.slice(0, 10)
      if (!d) return
      if (!dayMap[d])
        dayMap[d] = { date: d, bill_count: 0, taxable_amount: 0, tax_amount: 0, total_with_tax: 0 }
      dayMap[d].bill_count++
      dayMap[d].taxable_amount += Number(b.subtotal || 0)
      dayMap[d].tax_amount += Number(b.tax_amount || 0)
      dayMap[d].total_with_tax += Number(b.total_amount || 0)
    })
    rows.value = Object.values(dayMap)
      .map((d) => ({
        ...d,
        effective_rate: d.taxable_amount > 0 ? (d.tax_amount / d.taxable_amount) * 100 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch (e) {
    console.error('[TaxSummary]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'tax_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'tax_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
