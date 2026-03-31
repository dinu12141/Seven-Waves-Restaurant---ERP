<template>
  <ReportLayout
    title="Discount Report"
    subtitle="All discounts applied — amounts, percentages, and approval details"
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
            <q-td key="bill_number" :props="props" class="report-table__td--mono">{{
              props.row.bill_number
            }}</q-td>
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="branch" :props="props">{{ props.row.branch }}</q-td>
            <q-td key="subtotal" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.subtotal)
            }}</q-td>
            <q-td
              key="discount_amount"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
              >{{ fmtLKR(props.row.discount_amount) }}</q-td
            >
            <q-td key="discount_pct" :props="props" class="report-table__td--num"
              ><q-badge :color="props.row.discount_pct > 10 ? 'red' : 'orange'">{{
                fmtPercent(props.row.discount_pct)
              }}</q-badge></q-td
            >
            <q-td key="total" :props="props" class="report-table__td--num text-weight-bold">{{
              fmtLKR(props.row.total)
            }}</q-td>
            <q-td key="cashier" :props="props">{{ props.row.cashier }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td--bold">TOTAL ({{ rows.length }} bills)</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.subtotal)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.discount)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num"
              ><q-badge color="red">{{
                totals.subtotal > 0 ? fmtPercent((totals.discount / totals.subtotal) * 100) : '0%'
              }}</q-badge></q-td
            >
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="local_offer" size="40px" class="q-mb-sm" />
            <div>No discounts for this period</div>
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
import { fmtLKR, fmtPercent, fmtDateTime, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'bill_number', label: 'Bill #', field: 'bill_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'branch', label: 'Branch', field: 'branch', align: 'left', sortable: true },
  { name: 'subtotal', label: 'Subtotal', field: 'subtotal', align: 'right', sortable: true },
  {
    name: 'discount_amount',
    label: 'Discount Amt',
    field: 'discount_amount',
    align: 'right',
    sortable: true,
  },
  { name: 'discount_pct', label: 'Disc %', field: 'discount_pct', align: 'right', sortable: true },
  { name: 'total', label: 'Final Total', field: 'total', align: 'right', sortable: true },
  { name: 'cashier', label: 'Cashier', field: 'cashier', align: 'left', sortable: true },
]
const totals = computed(() => ({
  subtotal: rows.value.reduce((s, r) => s + r.subtotal, 0),
  discount: rows.value.reduce((s, r) => s + r.discount_amount, 0),
  total: rows.value.reduce((s, r) => s + r.total, 0),
}))
const kpiData = computed(() => [
  {
    label: 'Total Discounts',
    value: fmtLKR(totals.value.discount),
    icon: 'local_offer',
    color: 'red',
  },
  { label: 'Bills with Discount', value: rows.value.length, icon: 'receipt_long', color: 'blue' },
  {
    label: 'Avg Discount %',
    value:
      totals.value.subtotal > 0
        ? fmtPercent((totals.value.discount / totals.value.subtotal) * 100)
        : '0%',
    icon: 'percent',
    color: 'amber',
  },
  {
    label: 'Revenue After Disc',
    value: fmtLKR(totals.value.total),
    icon: 'payments',
    color: 'green',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select(
        'id,order_number,created_at,subtotal,discount_amount,total_amount,branches(name),waiter:profiles!orders_waiter_id_fkey(full_name)',
      )
      .gt('discount_amount', 0)
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1000)
    if (error) throw error
    rows.value = (data || []).map((r) => ({
      id: r.id,
      bill_number: r.order_number || `#${r.id?.slice(0, 8)}`,
      date: r.created_at,
      branch: r.branches?.name || '—',
      subtotal: Number(r.subtotal || 0),
      discount_amount: Number(r.discount_amount || 0),
      discount_pct:
        Number(r.subtotal) > 0 ? (Number(r.discount_amount || 0) / Number(r.subtotal)) * 100 : 0,
      total: Number(r.total_amount || 0),
      cashier: r.waiter?.full_name || '—',
    }))
  } catch (e) {
    console.error('[DiscountReport]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'discount_report')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'discount_report')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
