<template>
  <ReportLayout
    title="Expense Summary"
    subtitle="Expense tracking and analysis by category"
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
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="category" :props="props" class="text-weight-bold">{{
              props.row.category
            }}</q-td>
            <q-td key="description" :props="props">{{ props.row.description }}</q-td>
            <q-td
              key="amount"
              :props="props"
              class="report-table__td--num text-weight-bolder text-red"
              >{{ fmtLKR(props.row.amount) }}</q-td
            >
            <q-td key="approved_by" :props="props">{{ props.row.approved_by || '—' }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td--bold">TOTAL EXPENSES</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(rows.reduce((s, r) => s + r.amount, 0))
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="trending_down" size="40px" class="q-mb-sm" />
            <div>No expense data</div>
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
import { fmtLKR, fmtDate } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'approved_by', label: 'Approved By', field: 'approved_by', align: 'left' },
]
const kpiData = computed(() => [
  {
    label: 'Total Expenses',
    value: fmtLKR(rows.value.reduce((s, r) => s + r.amount, 0)),
    icon: 'trending_down',
    color: 'red',
  },
  { label: 'Entries', value: rows.value.length, icon: 'receipt', color: 'blue' },
  {
    label: 'Categories',
    value: new Set(rows.value.map((r) => r.category)).size,
    icon: 'category',
    color: 'purple',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('expenses')
      .select('id,created_at,category,description,amount,approved_by,profiles(full_name)')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    rows.value = (data || []).map((r) => ({
      id: r.id,
      date: r.created_at,
      category: r.category || 'General',
      description: r.description || '—',
      amount: Number(r.amount || 0),
      approved_by: r.profiles?.full_name || '—',
    }))
  } catch (e) {
    console.error('[Expenses]', e)
    rows.value = []
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'expense_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'expense_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
