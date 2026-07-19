<template>
  <ReportLayout
    title="Daily Cash Summary"
    subtitle="Cash register reconciliation — opening, sales, expenses, closing"
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
        :rows-per-page-options="[31, 50]"
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
            <q-td
              key="cash_sales"
              :props="props"
              class="report-table__td--num text-green text-weight-bold"
              >{{ fmtLKR(props.row.cash_sales) }}</q-td
            >
            <q-td key="card_sales" :props="props" class="report-table__td--num text-blue">{{
              fmtLKR(props.row.card_sales)
            }}</q-td>
            <q-td key="other_sales" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.other_sales)
            }}</q-td>
            <q-td
              key="total_sales"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total_sales) }}</q-td
            >
            <q-td key="orders" :props="props" class="report-table__td--num">{{
              props.row.orders
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.cash)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-blue">{{
              fmtLKR(totals.card)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totals.other)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.orders }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="point_of_sale" size="40px" class="q-mb-sm" />
            <div>No cash summary data</div>
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
import { fmtLKR, fmtDate, applyBranchSecurity } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'cash_sales', label: 'Cash Sales', field: 'cash_sales', align: 'right', sortable: true },
  { name: 'card_sales', label: 'Card Sales', field: 'card_sales', align: 'right', sortable: true },
  { name: 'other_sales', label: 'Other', field: 'other_sales', align: 'right' },
  {
    name: 'total_sales',
    label: 'Total Sales',
    field: 'total_sales',
    align: 'right',
    sortable: true,
  },
  { name: 'orders', label: 'Orders', field: 'orders', align: 'right', sortable: true },
]
const totals = computed(() => ({
  cash: rows.value.reduce((s, r) => s + r.cash_sales, 0),
  card: rows.value.reduce((s, r) => s + r.card_sales, 0),
  other: rows.value.reduce((s, r) => s + r.other_sales, 0),
  total: rows.value.reduce((s, r) => s + r.total_sales, 0),
  orders: rows.value.reduce((s, r) => s + r.orders, 0),
}))
const kpiData = computed(() => [
  {
    label: 'Total Collections',
    value: fmtLKR(totals.value.total),
    icon: 'payments',
    color: 'green',
  },
  { label: 'Cash Sales', value: fmtLKR(totals.value.cash), icon: 'money', color: 'green' },
  { label: 'Card Sales', value: fmtLKR(totals.value.card), icon: 'credit_card', color: 'blue' },
  { label: 'Total Orders', value: totals.value.orders, icon: 'receipt_long', color: 'purple' },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select('created_at,total_amount,status,invoices(payments(amount,payment_methods(name)))')
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
      if (!dMap[d])
        dMap[d] = {
          date: d,
          cash_sales: 0,
          card_sales: 0,
          other_sales: 0,
          total_sales: 0,
          orders: 0,
        }
      const amt = Number(b.total_amount || 0)
      // Extract payment method from invoices→payments chain
      let pm = ''
      const invs = Array.isArray(b.invoices) ? b.invoices : b.invoices ? [b.invoices] : []
      for (const inv of invs) {
        const pays = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
        for (const p of pays) {
          if (p.payment_methods?.name) {
            pm = p.payment_methods.name.toLowerCase()
            break
          }
        }
        if (pm) break
      }
      const isCard = pm.includes('card') || pm === 'visa' || pm.includes('visa') || pm.includes('master')
      if (pm.includes('cash')) dMap[d].cash_sales += amt
      else if (isCard) dMap[d].card_sales += amt
      else dMap[d].other_sales += amt
      dMap[d].total_sales += amt
      dMap[d].orders++
    })
    rows.value = Object.values(dMap).sort((a, b) => a.date.localeCompare(b.date))
  } catch (e) {
    console.error('[DailyCash]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'daily_cash_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'daily_cash_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
