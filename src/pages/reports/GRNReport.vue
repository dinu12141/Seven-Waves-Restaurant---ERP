<template>
  <ReportLayout
    title="GRN Report"
    subtitle="Goods Received Notes — inventory receipts and receiving details"
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
            <q-td key="doc_number" :props="props" class="report-table__td--mono text-weight-bold">{{
              props.row.doc_number
            }}</q-td>
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="reference" :props="props" class="report-table__td--mono">{{
              props.row.reference
            }}</q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td--num text-weight-bolder text-green"
              >{{ fmtLKR(props.row.total) }}</q-td
            >
            <q-td key="status" :props="props"
              ><span class="report-badge report-badge--paid">{{ props.row.status }}</span></q-td
            >
            <q-td key="notes" :props="props" class="report-table__td--muted">{{
              props.row.notes || '—'
            }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="fact_check" size="40px" class="q-mb-sm" />
            <div>No GRN data</div>
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
  { name: 'doc_number', label: 'GRN #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left' },
  { name: 'total', label: 'Total Value', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]
const kpiData = computed(() => [
  { label: 'Total GRNs', value: rows.value.length, icon: 'fact_check', color: 'blue' },
  {
    label: 'Total Value Received',
    value: fmtLKR(rows.value.reduce((s, r) => s + r.total, 0)),
    icon: 'payments',
    color: 'green',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('inventory_documents')
      .select('id,doc_number,reference_no,doc_type,created_at,total_amount,status,notes')
      .eq('doc_type', 'GRN')
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)
    if (error) throw error
    rows.value = (data || []).map((r) => ({
      id: r.id,
      doc_number: r.doc_number || `GRN-${r.id?.slice(0, 6)}`,
      date: r.created_at,
      reference: r.reference_no || '—',
      total: Number(r.total_amount || 0),
      status: r.status || 'received',
      notes: r.notes,
    }))
  } catch (e) {
    console.error('[GRN]', e)
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'grn_report')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'grn_report')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
