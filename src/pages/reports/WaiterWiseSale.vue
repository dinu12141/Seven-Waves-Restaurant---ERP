<template>
  <ReportLayout
    title="Waiter Wise Sale"
    subtitle="Performance and sales overview by waiter"
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
        row-key="waiter_name"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 50 }"
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="waiter_name" :props="props" class="text-weight-bold">{{
              props.row.waiter_name || 'Unassigned'
            }}</q-td>
            <q-td key="table_no" :props="props">{{ props.row.table_no || 'Walk-in' }}</q-td>
            <q-td key="no_customer" :props="props" class="report-table__td--num">{{
              props.row.no_customer
            }}</q-td>
            <q-td
              key="amount"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ formatCurrency(props.row.amount) }}</q-td
            >
            <q-td key="avg_sales" :props="props" class="report-table__td--num text-primary">{{
              formatCurrency(props.row.avg_sales)
            }}</q-td>
            <q-td
              key="avg_table_sale"
              :props="props"
              class="report-table__td--num text-secondary"
              >{{ formatCurrency(props.row.avg_table_sale) }}</q-td
            >
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row bg-grey-10 text-white">
            <q-td colspan="2" class="text-right text-subtitle2">GRAND TOTAL</q-td>
            <q-td class="report-table__td--bold">{{ totalCustomers }}</q-td>
            <q-td class="report-table__td--bold text-green">{{ formatCurrency(totalAmount) }}</q-td>
            <q-td class="report-table__td--bold text-primary">{{
              formatCurrency(totalAvgSales)
            }}</q-td>
            <q-td class="report-table__td--bold text-secondary">{{
              formatCurrency(totalAvgTableSale)
            }}</q-td>
          </q-tr>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])
const kpiData = ref([])

const columns = [
  {
    name: 'waiter_name',
    label: 'Waiter Name',
    field: 'waiter_name',
    align: 'left',
    sortable: true,
  },
  { name: 'table_no', label: 'Table No', field: 'table_no', align: 'left', sortable: true },
  {
    name: 'no_customer',
    label: 'No. Customer',
    field: 'no_customer',
    align: 'right',
    sortable: true,
  },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'avg_sales', label: 'Avg Sales', field: 'avg_sales', align: 'right' },
  { name: 'avg_table_sale', label: 'Avg Table Sale', field: 'avg_table_sale', align: 'right' },
]

const totalCustomers = computed(() => rows.value.reduce((s, r) => s + Number(r.no_customer), 0))
const totalAmount = computed(() => rows.value.reduce((s, r) => s + Number(r.amount), 0))
const totalAvgSales = computed(() =>
  rows.value.length ? totalAmount.value / rows.value.length : 0,
) // Approximation
const totalAvgTableSale = computed(() =>
  rows.value.length ? totalAmount.value / rows.value.length : 0,
)

async function loadData(filters = {}) {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
    let query = supabase.from('v_rpt_waiter_wise_sale').select('*').eq('company_id', companyId)

    if (filters.dateFrom) query = query.gte('sale_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('sale_date', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)

    const { data, error } = await query
    if (error) throw error
    rows.value = data || []

    kpiData.value = [
      { label: 'Total Waiters Active', value: new Set(rows.value.map((r) => r.waiter_id)).size },
      { label: 'Total Served (Cust/Ords)', value: totalCustomers.value, color: 'info' },
      { label: 'Total Amount', value: formatCurrency(totalAmount.value), color: 'green' },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'waiter_wise_sales')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'waiter_wise_sales')
}
function formatCurrency(val) {
  return Number(val || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
onMounted(() => {
  loadData()
})
</script>
