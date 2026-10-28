<template>
  <ReportLayout
    title="Variance Report"
    subtitle="Physical count vs system stock variance analysis"
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
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="item_name" :props="props" class="text-weight-bold">{{
              props.row.item_name
            }}</q-td>
            <q-td key="system_qty" :props="props" class="report-table__td--num">{{
              props.row.system_qty
            }}</q-td>
            <q-td key="physical_qty" :props="props" class="report-table__td--num">{{
              props.row.physical_qty
            }}</q-td>
            <q-td
              key="variance"
              :props="props"
              class="report-table__td--num text-weight-bold"
              :class="props.row.variance >= 0 ? 'text-green' : 'text-red'"
              >{{ props.row.variance > 0 ? '+' : '' }}{{ props.row.variance }}</q-td
            >
            <q-td
              key="value_impact"
              :props="props"
              class="report-table__td--num text-weight-bold"
              :class="props.row.value_impact >= 0 ? 'text-green' : 'text-red'"
              >{{ fmtLKR(props.row.value_impact) }}</q-td
            >
            <q-td key="notes" :props="props" class="report-table__td--muted">{{
              props.row.notes || '—'
            }}</q-td>
          </q-tr></template
        >
        <template #no-data
          ><div class="report-empty">
            <q-icon name="troubleshoot" size="40px" class="q-mb-sm" />
            <div>No variance data</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate, applyBranchSecurity } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left', sortable: true },
  { name: 'system_qty', label: 'System Qty', field: 'system_qty', align: 'right' },
  { name: 'physical_qty', label: 'Physical Qty', field: 'physical_qty', align: 'right' },
  { name: 'variance', label: 'Variance', field: 'variance', align: 'right', sortable: true },
  {
    name: 'value_impact',
    label: 'Value Impact',
    field: 'value_impact',
    align: 'right',
    sortable: true,
  },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]
const kpiData = computed(() => [
  { label: 'Variance Lines', value: rows.value.length, icon: 'troubleshoot', color: 'blue' },
  {
    label: 'Losses',
    value: rows.value.filter((r) => r.variance < 0).length,
    icon: 'trending_down',
    color: 'red',
  },
  {
    label: 'Gains',
    value: rows.value.filter((r) => r.variance > 0).length,
    icon: 'trending_up',
    color: 'green',
  },
  {
    label: 'Net Impact',
    value: fmtLKR(rows.value.reduce((s, r) => s + r.value_impact, 0)),
    icon: 'account_balance',
    color: 'purple',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    // Physical-vs-system variance comes from STOCK_COUNT document lines, which store
    // system_qty / counted_qty / variance_qty at count time. The previous version read
    // inventory_ledger.created_at / notes and items.current_stock — none of which exist —
    // so the query always failed.
    let query = supabase
      .from('inventory_document_lines')
      .select(
        'id,system_qty,counted_qty,variance_qty,unit_cost,line_total,notes,items(name),inventory_documents!inner(doc_type,doc_number,doc_date,status,branch_id,remarks)',
      )
      .eq('inventory_documents.doc_type', 'STOCK_COUNT')
      .neq('inventory_documents.status', 'draft')
      .neq('inventory_documents.status', 'cancelled')
    // doc_date is a DATE column — compare plain dates.
    if (filters.dateFrom) query = query.gte('inventory_documents.doc_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('inventory_documents.doc_date', filters.dateTo)
    if (filters.branch) query = query.eq('inventory_documents.branch_id', filters.branch)
    query = applyBranchSecurity(query, 'inventory_documents.branch_id')
    const { data, error } = await fetchAllRows(query.order('id'))
    if (error) throw error
    rows.value = (data || [])
      .map((r) => {
        const sys = Number(r.system_qty || 0)
        const counted = Number(r.counted_qty ?? sys)
        const variance = r.variance_qty != null ? Number(r.variance_qty) : counted - sys
        const uc = Number(r.unit_cost || 0)
        return {
          id: r.id,
          date: r.inventory_documents?.doc_date,
          item_name: r.items?.name || '—',
          system_qty: sys,
          physical_qty: counted,
          variance,
          value_impact: variance * uc,
          notes: [r.inventory_documents?.doc_number, r.notes || r.inventory_documents?.remarks]
            .filter(Boolean)
            .join(' — '),
        }
      })
      .filter((r) => r.variance !== 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  } catch (e) {
    console.error('[Variance]', e)
    Notify.create({ type: 'negative', message: 'Failed to load report: ' + (e?.message || e) })
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'variance_report')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'variance_report')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
