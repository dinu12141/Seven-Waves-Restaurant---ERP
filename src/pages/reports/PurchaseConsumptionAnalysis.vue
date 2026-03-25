<template>
  <ReportLayout
    title="Purchase vs Consumption Analysis"
    subtitle="Compare purchased quantities against consumed — identify variance"
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
        row-key="item"
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
            <q-td key="item" :props="props" class="text-weight-bold">{{ props.row.item }}</q-td>
            <q-td key="purchased" :props="props" class="report-table__td--num text-green"
              >+{{ props.row.purchased }}</q-td
            >
            <q-td key="consumed" :props="props" class="report-table__td--num text-red"
              >-{{ props.row.consumed }}</q-td
            >
            <q-td
              key="variance"
              :props="props"
              class="report-table__td--num text-weight-bold"
              :class="props.row.variance >= 0 ? 'text-green' : 'text-red'"
              >{{ props.row.variance }}</q-td
            >
            <q-td key="variance_pct" :props="props" class="report-table__td--num"
              ><q-badge :color="Math.abs(props.row.variance_pct) > 20 ? 'red' : 'green'">{{
                fmtPercent(props.row.variance_pct)
              }}</q-badge></q-td
            >
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="balance" size="40px" class="q-mb-sm" />
            <div>No purchase/consumption data</div>
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
import { fmtPercent } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'item', label: 'Item', field: 'item', align: 'left', sortable: true },
  { name: 'purchased', label: 'Purchased', field: 'purchased', align: 'right', sortable: true },
  { name: 'consumed', label: 'Consumed', field: 'consumed', align: 'right', sortable: true },
  { name: 'variance', label: 'Variance', field: 'variance', align: 'right', sortable: true },
  { name: 'variance_pct', label: 'Var %', field: 'variance_pct', align: 'right', sortable: true },
]
const kpiData = computed(() => [
  { label: 'Items Analyzed', value: rows.value.length, icon: 'balance', color: 'blue' },
  {
    label: 'Over-Consumed',
    value: rows.value.filter((r) => r.variance < 0).length,
    icon: 'warning',
    color: 'red',
  },
  {
    label: 'Under-Consumed',
    value: rows.value.filter((r) => r.variance > 0).length,
    icon: 'check',
    color: 'green',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase.from('inventory_ledger').select('quantity,direction,items(name)')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.limit(5000)
    if (error) throw error
    const iMap = {}
    ;(data || []).forEach((r) => {
      const name = r.items?.name
      if (!name) return
      if (!iMap[name]) iMap[name] = { item: name, purchased: 0, consumed: 0 }
      const qty = Number(r.quantity || 0)
      if (r.direction === 'IN') iMap[name].purchased += qty
      else iMap[name].consumed += qty
    })
    rows.value = Object.values(iMap)
      .map((i) => ({
        ...i,
        variance: i.purchased - i.consumed,
        variance_pct: i.purchased > 0 ? ((i.purchased - i.consumed) / i.purchased) * 100 : 0,
      }))
      .sort((a, b) => a.variance - b.variance)
  } catch (e) {
    console.error('[PurchaseConsumption]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'purchase_consumption')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'purchase_consumption')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
