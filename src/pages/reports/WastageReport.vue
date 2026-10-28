<template>
  <ReportLayout
    title="Wastage Report"
    subtitle="Wastage and spoilage entries — track and minimize food waste"
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
            <q-td
              key="quantity"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
              >{{ props.row.quantity }}</q-td
            >
            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.unit_cost)
            }}</q-td>
            <q-td
              key="total_loss"
              :props="props"
              class="report-table__td--num text-red text-weight-bolder"
              >{{ fmtLKR(props.row.total_loss) }}</q-td
            >
            <q-td key="doc_type" :props="props"
              ><span class="report-badge report-badge--cancelled">{{
                props.row.doc_type
              }}</span></q-td
            >
            <q-td key="notes" :props="props" class="report-table__td--muted">{{
              props.row.notes || '—'
            }}</q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td class="report-table__td--bold">TOTAL</q-td>
            <q-td />
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              totals.qty
            }}</q-td>
            <q-td />
            <q-td class="report-table__td--bold report-table__td--num text-red">{{
              fmtLKR(totals.loss)
            }}</q-td>
            <q-td colspan="2" /> </q-tr
        ></template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="delete_sweep" size="40px" class="q-mb-sm" />
            <div>No wastage entries</div>
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

const loading = ref(false)
const rows = ref([])
const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left', sortable: true },
  { name: 'quantity', label: 'Qty Wasted', field: 'quantity', align: 'right', sortable: true },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right' },
  { name: 'total_loss', label: 'Total Loss', field: 'total_loss', align: 'right', sortable: true },
  { name: 'doc_type', label: 'Type', field: 'doc_type', align: 'left' },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]
const totals = computed(() => ({
  qty: rows.value.reduce((s, r) => s + r.quantity, 0),
  loss: rows.value.reduce((s, r) => s + r.total_loss, 0),
}))
const kpiData = computed(() => [
  { label: 'Wastage Entries', value: rows.value.length, icon: 'delete_sweep', color: 'red' },
  { label: 'Total Units Wasted', value: totals.value.qty, icon: 'trending_down', color: 'amber' },
  { label: 'Total Loss', value: fmtLKR(totals.value.loss), icon: 'money_off', color: 'red' },
])
async function loadData(filters = {}) {
  loading.value = true
  try {
    let query = supabase
      .from('inventory_ledger')
      .select(
        'id,posted_at,quantity,unit_cost,total_cost,doc_type,doc_number,items(name),inventory_documents!inventory_ledger_document_id_fkey(wastage_category,remarks)',
      )
      .eq('direction', 'OUT')
      // Wastage = WASTAGE documents only. Stock-count shrinkage and adjustments
      // belong in the Variance / Adjustment reports (previously double-reported here).
      .eq('doc_type', 'WASTAGE')
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
          item_name: r.items?.name || '—',
          quantity: qty,
          unit_cost: uc,
          total_loss: Number(r.total_cost ?? qty * uc),
          doc_type: r.inventory_documents?.wastage_category || r.doc_number || 'Wastage',
          notes: r.inventory_documents?.remarks || '',
        }
      })
  } catch (e) {
    console.error('[Wastage]', e)
    Notify.create({ type: 'negative', message: 'Failed to load report: ' + (e?.message || e) })
  } finally {
    loading.value = false
  }
}
function exportCSV() {
  exportTableToCSV(columns, rows.value, 'wastage_report')
}
function exportExcel() {
  exportTableToExcel(columns, rows.value, 'wastage_report')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
