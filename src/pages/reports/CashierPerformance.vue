<template>
  <ReportLayout
    title="Cashier Performance"
    subtitle="Cashier throughput analysis — transaction volumes and speed"
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
        row-key="cashier"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50]"
        :pagination="{ rowsPerPage: 25, sortBy: 'total', descending: true }"
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
            <q-td key="cashier" :props="props" class="text-weight-bold">{{
              props.row.cashier
            }}</q-td>
            <q-td
              key="transactions"
              :props="props"
              class="report-table__td--num text-weight-bold"
              >{{ props.row.transactions }}</q-td
            >
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="avg_txn" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.avg_txn)
            }}</q-td>
            <q-td key="cash_collected" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.cash_collected)
            }}</q-td>
            <q-td key="card_collected" :props="props" class="report-table__td--num text-blue">{{
              fmtLKR(props.row.card_collected)
            }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="point_of_sale" size="40px" class="q-mb-sm" />
            <div>No cashier data</div>
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
import { fmtLKR, applyBranchSecurity } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'cashier', label: 'Cashier', field: 'cashier', align: 'left', sortable: true },
  {
    name: 'transactions',
    label: 'Transactions',
    field: 'transactions',
    align: 'right',
    sortable: true,
  },
  { name: 'total', label: 'Total Handled', field: 'total', align: 'right', sortable: true },
  { name: 'avg_txn', label: 'Avg Transaction', field: 'avg_txn', align: 'right', sortable: true },
  {
    name: 'cash_collected',
    label: 'Cash',
    field: 'cash_collected',
    align: 'right',
    sortable: true,
  },
  {
    name: 'card_collected',
    label: 'Card',
    field: 'card_collected',
    align: 'right',
    sortable: true,
  },
]
const kpiData = computed(() => [
  { label: 'Cashiers', value: rows.value.length, icon: 'badge', color: 'blue' },
  {
    label: 'Total Handled',
    value: fmtLKR(rows.value.reduce((s, r) => s + r.total, 0)),
    icon: 'payments',
    color: 'green',
  },
  {
    label: 'Total Transactions',
    value: rows.value.reduce((s, r) => s + r.transactions, 0),
    icon: 'receipt_long',
    color: 'purple',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('orders')
      .select(
        'total_amount,status,waiter:profiles!orders_waiter_id_fkey(full_name),invoices(payments(amount,payment_methods(name)))',
      )
      .neq('status', 'cancelled')
      .neq('status', 'void')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.limit(5000)
    if (error) throw error
    const cMap = {}
    ;(data || []).forEach((b) => {
      const n = b.waiter?.full_name || 'Unknown'
      if (!cMap[n])
        cMap[n] = { cashier: n, transactions: 0, total: 0, cash_collected: 0, card_collected: 0 }
      const amt = Number(b.total_amount || 0)
      cMap[n].transactions++
      cMap[n].total += amt
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
      if (pm.includes('cash')) cMap[n].cash_collected += amt
      else if (pm.includes('card')) cMap[n].card_collected += amt
    })
    rows.value = Object.values(cMap)
      .map((c) => ({ ...c, avg_txn: c.transactions > 0 ? c.total / c.transactions : 0 }))
      .sort((a, b) => b.total - a.total)
  } catch (e) {
    console.error('[CashierPerf]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'cashier_performance')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'cashier_performance')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
