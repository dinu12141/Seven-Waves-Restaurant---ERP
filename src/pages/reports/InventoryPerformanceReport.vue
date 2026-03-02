<template>
  <ReportLayout
    title="Inventory Performance & Margin Analysis"
    subtitle="Slow/Fast moving items, High/Low margin, and Profit movement report"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Analysis Type</label>
        <q-select
          v-model="analysisType"
          :options="['All', 'Fast Moving', 'Slow Moving', 'High Margin', 'Low Margin']"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input"
        />
      </div>
    </template>

    <template #default>
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="item_code"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 50, sortBy: 'pack_qty', descending: true }"
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
            <q-td key="subgroup_name" :props="props">{{ props.row.subgroup_name }}</q-td>
            <q-td key="item_code" :props="props">{{ props.row.item_code }}</q-td>
            <q-td key="description" :props="props" class="text-weight-bold">{{
              props.row.description
            }}</q-td>

            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.unit_cost)
            }}</q-td>
            <q-td key="unit_price" :props="props" class="report-table__td--num text-primary">{{
              formatCurrency(props.row.unit_price)
            }}</q-td>
            <q-td key="gp_percent" :props="props" class="report-table__td--num">
              <q-badge
                :color="
                  props.row.gp_percent >= 50
                    ? 'green'
                    : props.row.gp_percent >= 20
                      ? 'orange'
                      : 'red'
                "
              >
                {{ props.row.gp_percent }}%
              </q-badge>
            </q-td>

            <q-td key="pack_qty" :props="props" class="report-table__td--num">
              <q-badge :color="props.row.pack_qty >= 50 ? 'blue' : 'grey'">
                {{ props.row.pack_qty }}
              </q-badge>
            </q-td>

            <q-td key="total_cost" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.total_cost)
            }}</q-td>
            <q-td key="net_amt" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.net_amt)
            }}</q-td>
            <q-td
              key="profit_movement"
              :props="props"
              class="report-table__td--num text-green text-weight-bolder"
            >
              {{ formatCurrency(props.row.net_amt - props.row.total_cost) }}
            </q-td>
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
const analysisType = ref('All')

const columns = [
  {
    name: 'subgroup_name',
    label: 'Category',
    field: 'subgroup_name',
    align: 'left',
    sortable: true,
  },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left' },
  { name: 'description', label: 'Item Name', field: 'description', align: 'left', sortable: true },
  { name: 'unit_cost', label: 'Inv Cost', field: 'unit_cost', align: 'right', sortable: true },
  {
    name: 'unit_price',
    label: 'Selling Price',
    field: 'unit_price',
    align: 'right',
    sortable: true,
  },
  { name: 'gp_percent', label: 'Margin %', field: 'gp_percent', align: 'right', sortable: true },
  { name: 'pack_qty', label: 'Movement (Qty)', field: 'pack_qty', align: 'right', sortable: true },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost', align: 'right', sortable: true },
  { name: 'net_amt', label: 'Net Sales', field: 'net_amt', align: 'right', sortable: true },
  {
    name: 'profit_movement',
    label: 'Profit Movement',
    field: (row) => row.net_amt - row.total_cost,
    align: 'right',
    sortable: true,
  },
]

const filteredRows = computed(() => {
  if (analysisType.value === 'Fast Moving') return rows.value.filter((r) => r.pack_qty >= 50)
  if (analysisType.value === 'Slow Moving') return rows.value.filter((r) => r.pack_qty < 20)
  if (analysisType.value === 'High Margin') return rows.value.filter((r) => r.gp_percent >= 40)
  if (analysisType.value === 'Low Margin') return rows.value.filter((r) => r.gp_percent < 20)
  return rows.value
})

const totalProfit = computed(() =>
  filteredRows.value.reduce((s, r) => s + (r.net_amt - r.total_cost), 0),
)

async function loadData(filters = {}) {
  loading.value = true
  try {
    const companyId = authStore.currentBranch?.company_id || authStore.profile?.company_id
    let query = supabase.from('v_rpt_item_wise_sale').select('*').eq('company_id', companyId)

    if (filters.dateFrom) query = query.gte('sale_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('sale_date', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)

    const { data, error } = await query

    if (error) throw error
    rows.value = data || []

    kpiData.value = [
      { label: 'Total Items Analyzed', value: rows.value.length, color: 'info' },
      {
        label: 'High Margin Items (>40%)',
        value: rows.value.filter((r) => r.gp_percent >= 40).length,
        color: 'blue',
      },
      { label: 'Total Profit Movement', value: formatCurrency(totalProfit.value), color: 'green' },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'inventory_performance')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'inventory_performance')
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
