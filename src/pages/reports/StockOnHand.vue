<template>
  <ReportLayout
    title="Stock on Hand"
    subtitle="Current stock levels per item and warehouse — with reorder alerts"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Search Item</label>
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Item name or SKU..."
          class="report-filter-input"
          ><template #prepend><q-icon name="search" size="16px" /></template
        ></q-input>
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Stock Status</label>
        <q-select
          v-model="statusFilter"
          :options="['All', 'In Stock', 'Low Stock', 'Out of Stock']"
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
            <q-td key="name" :props="props" class="text-weight-bold">{{ props.row.name }}</q-td>
            <q-td key="sku" :props="props" class="report-table__td--mono report-table__td--muted">{{
              props.row.sku
            }}</q-td>
            <q-td key="category" :props="props">{{ props.row.category }}</q-td>
            <q-td
              key="current_stock"
              :props="props"
              class="report-table__td--num text-weight-bolder"
              :class="
                props.row.current_stock <= props.row.reorder_level ? 'text-red' : 'text-green'
              "
              >{{ props.row.current_stock }}</q-td
            >
            <q-td key="reorder_level" :props="props" class="report-table__td--num">{{
              props.row.reorder_level
            }}</q-td>
            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.unit_cost)
            }}</q-td>
            <q-td key="stock_value" :props="props" class="report-table__td--num text-weight-bold">{{
              fmtLKR(props.row.stock_value)
            }}</q-td>
            <q-td key="status" :props="props"
              ><q-badge :color="props.row.status_color">{{ props.row.status_label }}</q-badge></q-td
            >
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="6" class="report-table__td--bold">TOTAL INVENTORY VALUE</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totalValue)
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="shelves" size="40px" class="q-mb-sm" />
            <div>No stock data available</div>
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
import { fmtLKR, getCompanyId } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const search = ref('')
const statusFilter = ref('All')
const columns = [
  { name: 'name', label: 'Item Name', field: 'name', align: 'left', sortable: true },
  { name: 'sku', label: 'SKU', field: 'sku', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  {
    name: 'current_stock',
    label: 'Current Stock',
    field: 'current_stock',
    align: 'right',
    sortable: true,
  },
  {
    name: 'reorder_level',
    label: 'Reorder Level',
    field: 'reorder_level',
    align: 'right',
    sortable: true,
  },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right', sortable: true },
  {
    name: 'stock_value',
    label: 'Stock Value',
    field: 'stock_value',
    align: 'right',
    sortable: true,
  },
  { name: 'status', label: 'Status', field: 'status_label', align: 'left', sortable: true },
]
const filteredRows = computed(() => {
  let data = rows.value
  if (search.value) {
    const q = search.value.toLowerCase()
    data = data.filter((r) => r.name?.toLowerCase().includes(q) || r.sku?.toLowerCase().includes(q))
  }
  if (statusFilter.value === 'Low Stock')
    data = data.filter((r) => r.current_stock > 0 && r.current_stock <= r.reorder_level)
  if (statusFilter.value === 'Out of Stock') data = data.filter((r) => r.current_stock <= 0)
  if (statusFilter.value === 'In Stock')
    data = data.filter((r) => r.current_stock > r.reorder_level)
  return data
})
const totalValue = computed(() => filteredRows.value.reduce((s, r) => s + r.stock_value, 0))
const kpiData = computed(() => [
  { label: 'Total Items', value: filteredRows.value.length, icon: 'inventory_2', color: 'blue' },
  {
    label: 'Total Value',
    value: fmtLKR(totalValue.value),
    icon: 'account_balance_wallet',
    color: 'green',
  },
  {
    label: 'Low Stock Alert',
    value: rows.value.filter((r) => r.current_stock > 0 && r.current_stock <= r.reorder_level)
      .length,
    icon: 'warning',
    color: 'amber',
  },
  {
    label: 'Out of Stock',
    value: rows.value.filter((r) => r.current_stock <= 0).length,
    icon: 'error',
    color: 'red',
  },
])
async function loadData() {
  loading.value = true
  try {
    const companyId = getCompanyId()
    let query = supabase
      .from('items')
      .select('id,name,sku,unit_cost,reorder_level,current_stock,item_categories(name)')
      .eq('is_active', true)
    if (companyId) query = query.eq('company_id', companyId)
    const { data, error } = await query.order('name').limit(2000)
    if (error) throw error
    rows.value = (data || []).map((r) => {
      const stock = Number(r.current_stock || 0)
      const reorder = Number(r.reorder_level || 0)
      const cost = Number(r.unit_cost || 0)
      let sl = 'In Stock',
        sc = 'green'
      if (stock <= 0) {
        sl = 'Out of Stock'
        sc = 'red'
      } else if (stock <= reorder) {
        sl = 'Low Stock'
        sc = 'orange'
      }
      return {
        id: r.id,
        name: r.name,
        sku: r.sku || '—',
        category: r.item_categories?.name || '—',
        current_stock: stock,
        reorder_level: reorder,
        unit_cost: cost,
        stock_value: stock * cost,
        status_label: sl,
        status_color: sc,
      }
    })
  } catch (e) {
    console.error('[StockOnHand]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'stock_on_hand')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'stock_on_hand')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
