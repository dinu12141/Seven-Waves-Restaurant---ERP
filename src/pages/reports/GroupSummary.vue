<template>
  <ReportLayout
    title="Group Summary"
    subtitle="Sales broken down by menu categories"
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
        row-key="category_group"
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
            <q-td key="category_group" :props="props" class="text-weight-bold text-primary">{{
              props.row.category_group || 'Uncategorized'
            }}</q-td>
            <q-td key="total_items" :props="props" class="report-table__td--num">{{
              props.row.total_items
            }}</q-td>
            <q-td key="total_qty" :props="props" class="report-table__td--num">{{
              props.row.total_qty
            }}</q-td>
            <q-td
              key="total_amount"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ formatCurrency(props.row.total_amount) }}</q-td
            >
            <q-td key="total_discount" :props="props" class="report-table__td--num text-red">{{
              formatCurrency(props.row.total_discount)
            }}</q-td>
            <q-td
              key="net_amount"
              :props="props"
              class="report-table__td--num text-weight-bolder"
              >{{ formatCurrency(props.row.total_amount - props.row.total_discount) }}</q-td
            >
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row bg-grey-10 text-white">
            <q-td class="text-right text-subtitle2">GRAND TOTAL</q-td>
            <q-td class="report-table__td--bold">{{ totalCount }}</q-td>
            <q-td class="report-table__td--bold">{{ totalQty }}</q-td>
            <q-td class="report-table__td--bold text-green">{{ formatCurrency(totalAmount) }}</q-td>
            <q-td class="report-table__td--bold text-red">{{ formatCurrency(totalDisc) }}</q-td>
            <q-td class="report-table__td--bold">{{
              formatCurrency(totalAmount - totalDisc)
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
    name: 'category_group',
    label: 'Group',
    field: 'category_group',
    align: 'left',
    sortable: true,
  },
  {
    name: 'total_items',
    label: 'Distinct Items',
    field: 'total_items',
    align: 'right',
    sortable: true,
  },
  { name: 'total_qty', label: 'Total Qty', field: 'total_qty', align: 'right', sortable: true },
  {
    name: 'total_amount',
    label: 'Gross Amount',
    field: 'total_amount',
    align: 'right',
    sortable: true,
  },
  {
    name: 'total_discount',
    label: 'Total Discount',
    field: 'total_discount',
    align: 'right',
    sortable: true,
  },
  {
    name: 'net_amount',
    label: 'Net Amount',
    field: (row) => row.total_amount - row.total_discount,
    align: 'right',
    sortable: true,
  },
]

const totalCount = computed(() => rows.value.reduce((s, r) => s + Number(r.total_items), 0))
const totalQty = computed(() => rows.value.reduce((s, r) => s + Number(r.total_qty), 0))
const totalAmount = computed(() => rows.value.reduce((s, r) => s + Number(r.total_amount), 0))
const totalDisc = computed(() => rows.value.reduce((s, r) => s + Number(r.total_discount), 0))

async function loadData(filters = {}) {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
    let query = supabase.from('v_rpt_group_summary').select('*').eq('company_id', companyId)

    if (filters.dateFrom) query = query.gte('sale_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('sale_date', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)

    const { data, error } = await query
    if (error) throw error
    rows.value = data || []

    kpiData.value = [
      { label: 'Total Categories Sold', value: rows.value.length, color: 'blue' },
      { label: 'Total Volume', value: totalQty.value, color: 'info' },
      { label: 'Total Gross Revenue', value: formatCurrency(totalAmount.value), color: 'green' },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'group_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'group_summary')
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
