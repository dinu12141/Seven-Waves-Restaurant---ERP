<template>
  <ReportLayout
    title="Reorder Level Report"
    subtitle="Items at or below minimum stock level — requires immediate attention"
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
            <q-td key="name" :props="props" class="text-weight-bold">{{ props.row.name }}</q-td>
            <q-td key="sku" :props="props" class="report-table__td--mono">{{ props.row.sku }}</q-td>
            <q-td key="category" :props="props">{{ props.row.category }}</q-td>
            <q-td
              key="current_stock"
              :props="props"
              class="report-table__td--num text-weight-bolder"
              :class="props.row.current_stock <= 0 ? 'text-red' : 'text-orange'"
              >{{ props.row.current_stock }}</q-td
            >
            <q-td key="reorder_level" :props="props" class="report-table__td--num">{{
              props.row.reorder_level
            }}</q-td>
            <q-td
              key="deficit"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
              >{{ props.row.deficit }}</q-td
            >
            <q-td key="urgency" :props="props"
              ><q-badge :color="props.row.current_stock <= 0 ? 'red' : 'orange'">{{
                props.row.current_stock <= 0 ? 'Critical' : 'Low'
              }}</q-badge></q-td
            >
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="check_circle" size="40px" class="q-mb-sm text-green" />
            <div>All items are above reorder levels ✓</div>
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
import { getCompanyId } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'name', label: 'Item', field: 'name', align: 'left', sortable: true },
  { name: 'sku', label: 'SKU', field: 'sku', align: 'left' },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  {
    name: 'current_stock',
    label: 'Current Stock',
    field: 'current_stock',
    align: 'right',
    sortable: true,
  },
  { name: 'reorder_level', label: 'Reorder Level', field: 'reorder_level', align: 'right' },
  { name: 'deficit', label: 'Deficit', field: 'deficit', align: 'right', sortable: true },
  { name: 'urgency', label: 'Urgency', field: 'urgency', align: 'left', sortable: true },
]
const kpiData = computed(() => [
  { label: 'Items Below Reorder', value: rows.value.length, icon: 'warning', color: 'red' },
  {
    label: 'Critical (Out)',
    value: rows.value.filter((r) => r.current_stock <= 0).length,
    icon: 'error',
    color: 'red',
  },
  {
    label: 'Low Stock',
    value: rows.value.filter((r) => r.current_stock > 0).length,
    icon: 'trending_down',
    color: 'amber',
  },
])
async function loadData() {
  loading.value = true
  try {
    const companyId = getCompanyId()
    let query = supabase
      .from('items')
      .select('id,name,sku,current_stock,reorder_level,item_categories(name)')
      .eq('is_active', true)
      .gt('reorder_level', 0)
    if (companyId) query = query.eq('company_id', companyId)
    const { data, error } = await query.limit(2000)
    if (error) throw error
    rows.value = (data || [])
      .filter((r) => Number(r.current_stock || 0) <= Number(r.reorder_level || 0))
      .map((r) => ({
        id: r.id,
        name: r.name,
        sku: r.sku || '—',
        category: r.item_categories?.name || '—',
        current_stock: Number(r.current_stock || 0),
        reorder_level: Number(r.reorder_level || 0),
        deficit: Number(r.reorder_level || 0) - Number(r.current_stock || 0),
        urgency: Number(r.current_stock || 0) <= 0 ? 'Critical' : 'Low',
      }))
      .sort((a, b) => b.deficit - a.deficit)
  } catch (e) {
    console.error('[ReorderLevel]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'reorder_level_report')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'reorder_level_report')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
