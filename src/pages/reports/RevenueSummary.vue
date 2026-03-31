<template>
  <ReportLayout
    title="Revenue Summary"
    subtitle="Daily/weekly revenue trends and growth analysis"
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
            <q-td key="orders" :props="props" class="report-table__td--num">{{
              props.row.orders
            }}</q-td>
            <q-td key="gross" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.gross)
            }}</q-td>
            <q-td key="discount" :props="props" class="report-table__td--num text-red">{{
              fmtLKR(props.row.discount)
            }}</q-td>
            <q-td key="tax" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.tax)
            }}</q-td>
            <q-td
              key="net"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.net) }}</q-td
            >
            <q-td
              key="growth"
              :props="props"
              class="report-table__td--num"
              :class="props.row.growth >= 0 ? 'text-green' : 'text-red'"
              >{{ props.row.growth >= 0 ? '+' : '' }}{{ fmtPercent(props.row.growth) }}</q-td
            >
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.orders }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.gross)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.discount)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.tax)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.net)
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="trending_up" size="40px" class="q-mb-sm" />
            <div>No revenue data</div>
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
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'orders', label: 'Orders', field: 'orders', align: 'right', sortable: true },
  { name: 'gross', label: 'Gross Revenue', field: 'gross', align: 'right', sortable: true },
  { name: 'discount', label: 'Discounts', field: 'discount', align: 'right' },
  { name: 'tax', label: 'Tax', field: 'tax', align: 'right' },
  { name: 'net', label: 'Net Revenue', field: 'net', align: 'right', sortable: true },
  { name: 'growth', label: 'Day Growth', field: 'growth', align: 'right', sortable: true },
]
const totals = computed(() => ({
  orders: rows.value.reduce((s, r) => s + r.orders, 0),
  gross: rows.value.reduce((s, r) => s + r.gross, 0),
  discount: rows.value.reduce((s, r) => s + r.discount, 0),
  tax: rows.value.reduce((s, r) => s + r.tax, 0),
  net: rows.value.reduce((s, r) => s + r.net, 0),
}))
const kpiData = computed(() => [
  { label: 'Total Net Revenue', value: fmtLKR(totals.value.net), icon: 'payments', color: 'green' },
  { label: 'Total Orders', value: totals.value.orders, icon: 'receipt_long', color: 'blue' },
  {
    label: 'Daily Avg',
    value: rows.value.length > 0 ? fmtLKR(totals.value.net / rows.value.length) : '—',
    icon: 'trending_up',
    color: 'purple',
  },
  {
    label: 'Total Discounts',
    value: fmtLKR(totals.value.discount),
    icon: 'local_offer',
    color: 'red',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select('created_at,subtotal,discount_amount,tax_amount,total_amount,status')
      .neq('status', 'cancelled')
      .neq('status', 'void')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.order('created_at').limit(5000)
    if (error) throw error
    const dMap = {}
    ;(data || []).forEach((b) => {
      const d = b.created_at?.slice(0, 10)
      if (!d) return
      if (!dMap[d]) dMap[d] = { date: d, orders: 0, gross: 0, discount: 0, tax: 0, net: 0 }
      dMap[d].orders++
      dMap[d].gross += Number(b.subtotal || 0)
      dMap[d].discount += Number(b.discount_amount || 0)
      dMap[d].tax += Number(b.tax_amount || 0)
      dMap[d].net += Number(b.total_amount || 0)
    })
    const sorted = Object.values(dMap).sort((a, b) => a.date.localeCompare(b.date))
    rows.value = sorted.map((d, i) => ({
      ...d,
      growth:
        i > 0 && sorted[i - 1].net > 0
          ? ((d.net - sorted[i - 1].net) / sorted[i - 1].net) * 100
          : 0,
    }))
  } catch (e) {
    console.error('[Revenue]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'revenue_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'revenue_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
