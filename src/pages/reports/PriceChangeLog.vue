<template>
  <ReportLayout
    title="Price Change Log"
    subtitle="Item price modification history — track all price changes"
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
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="item" :props="props" class="text-weight-bold">{{ props.row.item }}</q-td>
            <q-td key="old_price" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.old_price)
            }}</q-td>
            <q-td
              key="new_price"
              :props="props"
              class="report-table__td--num text-weight-bold"
              :class="props.row.new_price > props.row.old_price ? 'text-green' : 'text-red'"
              >{{ fmtLKR(props.row.new_price) }}</q-td
            >
            <q-td key="change_pct" :props="props" class="report-table__td--num"
              ><q-badge :color="props.row.change_pct >= 0 ? 'green' : 'red'"
                >{{ props.row.change_pct >= 0 ? '+' : ''
                }}{{ fmtPercent(props.row.change_pct) }}</q-badge
              ></q-td
            >
            <q-td key="changed_by" :props="props">{{ props.row.changed_by }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="price_change" size="40px" class="q-mb-sm" />
            <div>No price change history available</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtPercent, fmtDateTime } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'item', label: 'Item', field: 'item', align: 'left', sortable: true },
  { name: 'old_price', label: 'Old Price', field: 'old_price', align: 'right', sortable: true },
  { name: 'new_price', label: 'New Price', field: 'new_price', align: 'right', sortable: true },
  { name: 'change_pct', label: 'Change %', field: 'change_pct', align: 'right', sortable: true },
  { name: 'changed_by', label: 'Changed By', field: 'changed_by', align: 'left' },
]
const kpiData = computed(() => [
  { label: 'Price Changes', value: rows.value.length, icon: 'price_change', color: 'blue' },
  {
    label: 'Increases',
    value: rows.value.filter((r) => r.change_pct > 0).length,
    icon: 'trending_up',
    color: 'green',
  },
  {
    label: 'Decreases',
    value: rows.value.filter((r) => r.change_pct < 0).length,
    icon: 'trending_down',
    color: 'red',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('audit_logs')
      .select('id,created_at,details,profiles(full_name)')
      .eq('action', 'price_change')
    if (filters.dateFrom) query = query.gte('created_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('created_at', dayEndExclusiveISO(filters.dateTo))
    const { data, error } = await fetchAllRows(query.order('created_at', { ascending: false }).order('id'))
    if (error) {
      console.warn('[PriceChange] audit_logs may not exist, trying item_price_history')
      rows.value = []
      loading.value = false
      return
    }
    rows.value = (data || []).map((r) => {
      const d = typeof r.details === 'string' ? JSON.parse(r.details || '{}') : r.details || {}
      const oldP = Number(d.old_price || 0),
        newP = Number(d.new_price || 0)
      return {
        id: r.id,
        date: r.created_at,
        item: d.item_name || '—',
        old_price: oldP,
        new_price: newP,
        change_pct: oldP > 0 ? ((newP - oldP) / oldP) * 100 : 0,
        changed_by: r.profiles?.full_name || 'System',
      }
    })
  } catch (e) {
    console.error('[PriceChange]', e)
    rows.value = []
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'price_change_log')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'price_change_log')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
