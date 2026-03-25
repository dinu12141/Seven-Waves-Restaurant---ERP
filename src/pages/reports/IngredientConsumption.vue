<template>
  <ReportLayout
    title="Ingredient Consumption Report"
    subtitle="BOM-based consumption analysis from KOT-driven deductions"
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
            <q-td key="item_name" :props="props" class="text-weight-bold">{{
              props.row.item_name
            }}</q-td>
            <q-td key="category" :props="props">{{ props.row.category }}</q-td>
            <q-td
              key="qty_consumed"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
              >{{ props.row.qty_consumed }}</q-td
            >
            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.unit_cost)
            }}</q-td>
            <q-td
              key="total_cost"
              :props="props"
              class="report-table__td--num text-weight-bolder text-red"
              >{{ fmtLKR(props.row.total_cost) }}</q-td
            >
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="2" class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              totals.qty
            }}</q-td>
            <q-td />
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.cost)
            }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="science" size="40px" class="q-mb-sm" />
            <div>No consumption data</div>
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
import { fmtLKR } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'item_name', label: 'Ingredient', field: 'item_name', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  {
    name: 'qty_consumed',
    label: 'Qty Consumed',
    field: 'qty_consumed',
    align: 'right',
    sortable: true,
  },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right', sortable: true },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost', align: 'right', sortable: true },
]
const totals = computed(() => ({
  qty: rows.value.reduce((s, r) => s + r.qty_consumed, 0),
  cost: rows.value.reduce((s, r) => s + r.total_cost, 0),
}))
const kpiData = computed(() => [
  { label: 'Ingredients Used', value: rows.value.length, icon: 'science', color: 'blue' },
  { label: 'Total Qty Consumed', value: totals.value.qty, icon: 'trending_down', color: 'amber' },
  { label: 'Total Cost', value: fmtLKR(totals.value.cost), icon: 'money_off', color: 'red' },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('inventory_ledger')
      .select(
        'id,quantity,unit_cost,items(name,item_categories(name)),inventory_documents(doc_type)',
      )
      .eq('direction', 'OUT')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.limit(2000)
    if (error) throw error
    const iMap = {}
    ;(data || [])
      .filter((r) => ['BOM_DEDUCT', 'GIN', 'KOT'].includes(r.inventory_documents?.doc_type))
      .forEach((r) => {
        const name = r.items?.name || 'Unknown'
        if (!iMap[name])
          iMap[name] = {
            item_name: name,
            category: r.items?.item_categories?.name || '—',
            qty_consumed: 0,
            unit_cost: Number(r.unit_cost || 0),
            total_cost: 0,
          }
        const qty = Number(r.quantity || 0)
        iMap[name].qty_consumed += qty
        iMap[name].total_cost += qty * Number(r.unit_cost || 0)
      })
    rows.value = Object.values(iMap).sort((a, b) => b.total_cost - a.total_cost)
  } catch (e) {
    console.error('[IngredientConsumption]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'ingredient_consumption')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'ingredient_consumption')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
