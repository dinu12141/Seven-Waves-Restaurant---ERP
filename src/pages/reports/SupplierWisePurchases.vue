<template>
  <ReportLayout
    title="Supplier Wise Purchases"
    subtitle="Purchases grouped by supplier with spend analysis"
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
        row-key="supplier"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50]"
        :pagination="{ rowsPerPage: 25, sortBy: 'total', descending: true }"
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
            <q-td key="supplier" :props="props" class="text-weight-bold">{{
              props.row.supplier
            }}</q-td>
            <q-td key="po_count" :props="props" class="report-table__td--num">{{
              props.row.po_count
            }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-blue"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="avg_po" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.avg_po)
            }}</q-td>
            <q-td key="share" :props="props" class="report-table__td--num">{{
              fmtPercent(props.row.share)
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{ totals.pos }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-blue">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">{{
              totals.pos > 0 ? fmtLKR(totals.total / totals.pos) : '—'
            }}</q-td>
            <q-td class="report-table__td--bold report-table__td--num">100%</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="groups" size="40px" class="q-mb-sm" />
            <div>No supplier data</div>
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
import { fmtLKR, fmtPercent } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left', sortable: true },
  { name: 'po_count', label: 'POs', field: 'po_count', align: 'right', sortable: true },
  { name: 'total', label: 'Total Spend', field: 'total', align: 'right', sortable: true },
  { name: 'avg_po', label: 'Avg PO', field: 'avg_po', align: 'right', sortable: true },
  { name: 'share', label: '% Share', field: 'share', align: 'right', sortable: true },
]
const totals = computed(() => ({
  pos: rows.value.reduce((s, r) => s + r.po_count, 0),
  total: rows.value.reduce((s, r) => s + r.total, 0),
}))
const kpiData = computed(() => [
  { label: 'Suppliers', value: rows.value.length, icon: 'groups', color: 'blue' },
  { label: 'Total Spend', value: fmtLKR(totals.value.total), icon: 'payments', color: 'purple' },
  {
    label: 'Top Supplier',
    value: rows.value[0]?.supplier || '—',
    icon: 'emoji_events',
    color: 'amber',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase.from('purchase_orders').select('total_amount,suppliers(name)')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.limit(2000)
    if (error) throw error
    const sMap = {}
    let gt = 0
    ;(data || []).forEach((r) => {
      const n = r.suppliers?.name || 'Unknown'
      if (!sMap[n]) sMap[n] = { supplier: n, po_count: 0, total: 0 }
      sMap[n].po_count++
      sMap[n].total += Number(r.total_amount || 0)
      gt += Number(r.total_amount || 0)
    })
    rows.value = Object.values(sMap)
      .map((s) => ({
        ...s,
        avg_po: s.po_count > 0 ? s.total / s.po_count : 0,
        share: gt > 0 ? (s.total / gt) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total)
  } catch (e) {
    console.error('[SupplierPurchases]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'supplier_purchases')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'supplier_purchases')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
