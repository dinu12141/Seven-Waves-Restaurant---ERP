<template>
  <ReportLayout
    title="Kitchen Order Report"
    subtitle="KOT performance — preparation times and completion rates"
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
            <q-td key="kot_number" :props="props" class="report-table__td--mono text-weight-bold">{{
              props.row.kot_number
            }}</q-td>
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="table_no" :props="props">{{ props.row.table_no || '—' }}</q-td>
            <q-td key="item_count" :props="props" class="report-table__td--num">{{
              props.row.item_count
            }}</q-td>
            <q-td key="status" :props="props"
              ><span class="report-badge" :class="`report-badge--${props.row.status}`">{{
                props.row.status
              }}</span></q-td
            >
            <q-td key="kitchen" :props="props">{{ props.row.kitchen || '—' }}</q-td>
            <q-td key="prep_time" :props="props" class="report-table__td--num"
              ><q-badge
                :color="
                  props.row.prep_time > 15 ? 'red' : props.row.prep_time > 8 ? 'orange' : 'green'
                "
                >{{ props.row.prep_time }} min</q-badge
              ></q-td
            >
            <q-td key="waiter" :props="props">{{ props.row.waiter }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="soup_kitchen" size="40px" class="q-mb-sm" />
            <div>No KOT data for this period</div>
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
import { fmtDateTime, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'kot_number', label: 'KOT #', field: 'kot_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date & Time', field: 'date', align: 'left', sortable: true },
  { name: 'table_no', label: 'Table', field: 'table_no', align: 'left' },
  { name: 'item_count', label: 'Items', field: 'item_count', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
  { name: 'kitchen', label: 'Kitchen', field: 'kitchen', align: 'left' },
  { name: 'prep_time', label: 'Prep Time', field: 'prep_time', align: 'right', sortable: true },
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left' },
]
const kpiData = computed(() => {
  const avgPrep =
    rows.value.length > 0 ? rows.value.reduce((s, r) => s + r.prep_time, 0) / rows.value.length : 0
  return [
    { label: 'Total KOTs', value: rows.value.length, icon: 'receipt', color: 'blue' },
    {
      label: 'Avg Prep Time',
      value: `${avgPrep.toFixed(1)} min`,
      icon: 'schedule',
      color: avgPrep > 12 ? 'red' : 'green',
    },
    {
      label: 'Completed',
      value: rows.value.filter((r) => r.status === 'completed').length,
      icon: 'check_circle',
      color: 'green',
    },
    {
      label: 'Slow Orders (>15m)',
      value: rows.value.filter((r) => r.prep_time > 15).length,
      icon: 'warning',
      color: 'red',
    },
  ]
})
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('kots')
      .select(
        'id,kot_number,created_at,completed_at,status,table_number,kitchen_id,kitchens(name),profiles(full_name),kot_items(id)',
      )
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    rows.value = (data || []).map((r) => {
      const created = new Date(r.created_at)
      const completed = r.completed_at ? new Date(r.completed_at) : null
      const prepMin = completed ? (completed - created) / 60000 : 0
      return {
        id: r.id,
        kot_number: r.kot_number || `KOT-${r.id?.slice(0, 6)}`,
        date: r.created_at,
        table_no: r.table_number,
        item_count: r.kot_items?.length || 0,
        status: r.status || 'pending',
        kitchen: r.kitchens?.name || '—',
        prep_time: Math.round(prepMin),
        waiter: r.profiles?.full_name || '—',
      }
    })
  } catch (e) {
    console.error('[KitchenOrders]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'kitchen_orders')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'kitchen_orders')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
