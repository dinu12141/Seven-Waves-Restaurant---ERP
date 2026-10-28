<template>
  <ReportLayout
    title="Inventory Adjustment Log"
    subtitle="Stock adjustment history — all manual corrections and counts"
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
            <q-td key="doc_number" :props="props" class="report-table__td--mono text-weight-bold">{{
              props.row.doc_number
            }}</q-td>
            <q-td key="item_name" :props="props" class="text-weight-bold">{{
              props.row.item_name
            }}</q-td>
            <q-td key="direction" :props="props"
              ><span
                class="report-badge"
                :class="
                  props.row.direction === 'IN' ? 'report-badge--paid' : 'report-badge--cancelled'
                "
                >{{ props.row.direction }}</span
              ></q-td
            >
            <q-td
              key="quantity"
              :props="props"
              class="report-table__td--num text-weight-bold"
              :class="props.row.direction === 'IN' ? 'text-green' : 'text-red'"
              >{{ props.row.direction === 'IN' ? '+' : '-' }}{{ props.row.quantity }}</q-td
            >
            <q-td key="value" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.value)
            }}</q-td>
            <q-td key="notes" :props="props" class="report-table__td--muted">{{
              props.row.notes || '—'
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="4" class="report-table__td--bold"
              >TOTAL ({{ rows.length }} adjustments)</q-td
            >
            <q-td class="report-table__td--bold report-table__td--num"
              >Net: {{ netQty >= 0 ? '+' : '' }}{{ netQty }}</q-td
            >
            <q-td class="report-table__td--bold report-table__td--num">{{
              fmtLKR(totalValue)
            }}</q-td>
            <q-td /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="tune" size="40px" class="q-mb-sm" />
            <div>No adjustment records</div>
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
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate, applyBranchSecurity } from 'src/services/reportService'
const loading = ref(false),
  rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left', sortable: true },
  { name: 'direction', label: 'Direction', field: 'direction', align: 'left', sortable: true },
  { name: 'quantity', label: 'Quantity', field: 'quantity', align: 'right', sortable: true },
  { name: 'value', label: 'Value', field: 'value', align: 'right', sortable: true },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]
const netQty = computed(() =>
  rows.value.reduce((s, r) => s + (r.direction === 'IN' ? r.quantity : -r.quantity), 0),
)
const totalValue = computed(() => rows.value.reduce((s, r) => s + r.value, 0))
const kpiData = computed(() => [
  { label: 'Total Adjustments', value: rows.value.length, icon: 'tune', color: 'blue' },
  {
    label: 'Stock Added',
    value: rows.value.filter((r) => r.direction === 'IN').length,
    icon: 'add_circle',
    color: 'green',
  },
  {
    label: 'Stock Removed',
    value: rows.value.filter((r) => r.direction === 'OUT').length,
    icon: 'remove_circle',
    color: 'red',
  },
  {
    label: 'Net Impact',
    value: fmtLKR(totalValue.value),
    icon: 'account_balance',
    color: 'purple',
  },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('inventory_ledger')
      .select(
        'id,posted_at,quantity,direction,unit_cost,total_cost,doc_type,doc_number,items(name),inventory_documents!inventory_ledger_document_id_fkey(remarks)',
      )
      .in('doc_type', ['ADJUSTMENT', 'STOCK_COUNT'])
    if (filters.dateFrom) query = query.gte('posted_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('posted_at', dayEndExclusiveISO(filters.dateTo))
    if (filters.branch) query = query.eq('branch_id', filters.branch)
    query = applyBranchSecurity(query)
    const { data, error } = await fetchAllRows(query.order('posted_at', { ascending: false }).order('id'))
    if (error) throw error
    rows.value = (data || []).map((r) => {
        const qty = Number(r.quantity || 0)
        const uc = Number(r.unit_cost || 0)
        return {
          id: r.id,
          date: r.posted_at,
          doc_number: r.doc_number || '—',
          item_name: r.items?.name || '—',
          direction: r.direction,
          quantity: qty,
          value: Number(r.total_cost ?? qty * uc),
          notes: r.inventory_documents?.remarks || '',
        }
      })
  } catch (e) {
    console.error('[InvAdjustment]', e)
    Notify.create({ type: 'negative', message: 'Failed to load report: ' + (e?.message || e) })
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'inventory_adjustments')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'inventory_adjustments')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
