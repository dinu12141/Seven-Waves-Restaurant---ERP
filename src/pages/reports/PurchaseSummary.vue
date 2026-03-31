<template>
  <ReportLayout
    title="Purchase Summary"
    subtitle="Purchase order totals and trends"
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
            <q-td key="po_number" :props="props" class="report-table__td--mono text-weight-bold">{{
              props.row.po_number
            }}</q-td>
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="supplier" :props="props" class="text-weight-bold">{{
              props.row.supplier
            }}</q-td>
            <q-td key="items" :props="props" class="report-table__td--num">{{
              props.row.items
            }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-blue"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="status" :props="props"
              ><span class="report-badge" :class="`report-badge--${props.row.status}`">{{
                props.row.status
              }}</span></q-td
            >
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="4" class="report-table__td--bold">TOTAL ({{ rows.length }} POs)</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-blue">{{
              fmtLKR(rows.reduce((s, r) => s + r.total, 0))
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="shopping_bag" size="40px" class="q-mb-sm" />
            <div>No purchase orders</div>
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
import { fmtLKR, fmtDate } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'po_number', label: 'PO #', field: 'po_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left', sortable: true },
  { name: 'items', label: 'Items', field: 'items', align: 'right', sortable: true },
  { name: 'total', label: 'Total Amount', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
]
const kpiData = computed(() => [
  { label: 'Total POs', value: rows.value.length, icon: 'shopping_bag', color: 'blue' },
  {
    label: 'Total Spend',
    value: fmtLKR(rows.value.reduce((s, r) => s + r.total, 0)),
    icon: 'payments',
    color: 'purple',
  },
  {
    label: 'Avg PO Value',
    value:
      rows.value.length > 0
        ? fmtLKR(rows.value.reduce((s, r) => s + r.total, 0) / rows.value.length)
        : '—',
    icon: 'trending_up',
    color: 'green',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('purchase_orders')
      .select(
        'id,po_number,created_at,total_amount,status,suppliers(name),purchase_order_items(id)',
      )
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    rows.value = (data || []).map((r) => ({
      id: r.id,
      po_number: r.po_number || `PO-${r.id?.slice(0, 6)}`,
      date: r.created_at,
      supplier: r.suppliers?.name || '—',
      items: r.purchase_order_items?.length || 0,
      total: Number(r.total_amount || 0),
      status: r.status || 'draft',
    }))
  } catch (e) {
    console.error('[PurchaseSummary]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'purchase_summary')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'purchase_summary')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
