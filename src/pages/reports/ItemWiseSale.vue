<template>
  <ReportLayout
    title="Item Wise Sale Report"
    subtitle="Detailed analysis of quantity sold and margins per item"
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
        row-key="item_code"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 50 }"
      >
        <!-- Custom Grouping representation (Assuming standard Vuetify/Quasar group, we will sort and display) -->
        <!-- In Quasar, to truly group, we could format rows to have headers. Instead we show subgroup as first column or use grouping feature if preferred. The PDF requests grouped by subgroup, then subtotals. -->
        <!-- We use standard table but sort by subgroup. Real grouping is best represented in Excel/PDF export. -->
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
            <q-td key="pack_qty" :props="props" class="report-table__td--num">{{
              props.row.pack_qty
            }}</q-td>
            <q-td key="unit_price" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.unit_price)
            }}</q-td>
            <q-td key="cur_price" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.cur_price)
            }}</q-td>
            <q-td key="gross_amt" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.gross_amt)
            }}</q-td>
            <q-td key="disc_amt" :props="props" class="report-table__td--num text-red">{{
              formatCurrency(props.row.disc_amt)
            }}</q-td>
            <q-td key="net_amt" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.net_amt)
            }}</q-td>
            <q-td key="tax_amt" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.tax_amt)
            }}</q-td>
            <q-td
              key="amt_with_tax"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ formatCurrency(props.row.amt_with_tax) }}</q-td
            >
            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.unit_cost)
            }}</q-td>
            <q-td key="total_cost" :props="props" class="report-table__td--num">{{
              formatCurrency(props.row.total_cost)
            }}</q-td>
            <q-td key="gp_percent" :props="props" class="report-table__td--num">
              <q-badge
                :color="
                  props.row.gp_percent > 30 ? 'green' : props.row.gp_percent > 15 ? 'orange' : 'red'
                "
              >
                {{ props.row.gp_percent }}%
              </q-badge>
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row bg-grey-10 text-white">
            <q-td colspan="3" class="text-right text-subtitle2">GRAND TOTAL</q-td>
            <q-td class="report-table__td--bold">{{ totalQty }}</q-td>
            <q-td colspan="2"></q-td>
            <q-td class="report-table__td--bold">{{ formatCurrency(totalGross) }}</q-td>
            <q-td class="report-table__td--bold text-red">{{ formatCurrency(totalDisc) }}</q-td>
            <q-td class="report-table__td--bold">{{ formatCurrency(totalNet) }}</q-td>
            <q-td class="report-table__td--bold">{{ formatCurrency(totalTax) }}</q-td>
            <q-td class="report-table__td--bold text-green">{{
              formatCurrency(totalAmtWithTax)
            }}</q-td>
            <q-td></q-td>
            <q-td class="report-table__td--bold">{{ formatCurrency(totalCost) }}</q-td>
            <q-td class="report-table__td--bold"
              >{{
                totalGross > 0
                  ? (((totalAmtWithTax - totalCost) / totalAmtWithTax) * 100).toFixed(2)
                  : 0
              }}%</q-td
            >
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
    name: 'subgroup_name',
    label: 'Subgroup',
    field: 'subgroup_name',
    align: 'left',
    sortable: true,
  },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'pack_qty', label: 'Pack Qty', field: 'pack_qty', align: 'right', sortable: true },
  { name: 'unit_price', label: 'Unit Price', field: 'unit_price', align: 'right' },
  { name: 'cur_price', label: 'Cur Price', field: 'cur_price', align: 'right' },
  { name: 'gross_amt', label: 'Gross Amt', field: 'gross_amt', align: 'right', sortable: true },
  { name: 'disc_amt', label: 'Disc Amt', field: 'disc_amt', align: 'right' },
  { name: 'net_amt', label: 'Net Amt', field: 'net_amt', align: 'right' },
  { name: 'tax_amt', label: 'Tax Amt', field: 'tax_amt', align: 'right' },
  {
    name: 'amt_with_tax',
    label: 'Amt with Tax',
    field: 'amt_with_tax',
    align: 'right',
    sortable: true,
  },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right' },
  { name: 'total_cost', label: 'Cost', field: 'total_cost', align: 'right' },
  { name: 'gp_percent', label: 'GP %', field: 'gp_percent', align: 'right', sortable: true },
]

const totalQty = computed(() => rows.value.reduce((s, r) => s + Number(r.pack_qty), 0))
const totalGross = computed(() => rows.value.reduce((s, r) => s + Number(r.gross_amt), 0))
const totalDisc = computed(() => rows.value.reduce((s, r) => s + Number(r.disc_amt), 0))
const totalNet = computed(() => rows.value.reduce((s, r) => s + Number(r.net_amt), 0))
const totalTax = computed(() => rows.value.reduce((s, r) => s + Number(r.tax_amt), 0))
const totalAmtWithTax = computed(() => rows.value.reduce((s, r) => s + Number(r.amt_with_tax), 0))
const totalCost = computed(() => rows.value.reduce((s, r) => s + Number(r.total_cost), 0))

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
      { label: 'Total Qty Sold', value: totalQty.value },
      { label: 'Total Revenue', value: formatCurrency(totalAmtWithTax.value), color: 'green' },
      { label: 'Total Cost', value: formatCurrency(totalCost.value), color: 'red' },
      {
        label: 'Average GP',
        value:
          totalGross.value > 0
            ? (((totalAmtWithTax.value - totalCost.value) / totalAmtWithTax.value) * 100).toFixed(
                2,
              ) + '%'
            : '0%',
        color: 'blue',
      },
    ]
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, rows.value, 'item_wise_sales')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'item_wise_sales')
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
