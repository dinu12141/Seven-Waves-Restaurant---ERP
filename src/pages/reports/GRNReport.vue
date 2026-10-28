<template>
  <ReportLayout
    title="GRN Report"
    subtitle="Goods Received Notes — inventory receipts and receiving details"
    :export-columns="exportColumns"
    :export-rows="exportRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters="{ filters }">
      <div class="report-filter-group">
        <label class="report-filter-label">Supplier</label>
        <q-select
          v-model="filters.supplier_id"
          :options="supplierOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All Suppliers"
          class="report-filter-input"
        />
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Item</label>
        <q-select
          v-model="filters.item_id"
          :options="itemOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          use-input
          @filter="filterItems"
          placeholder="All Items"
          class="report-filter-input"
        />
      </div>
    </template>
    
    <template #filter-chips="{ applied }">
      <span v-if="applied.supplier_id" class="report-filter-chip">
        Supplier: {{ getSupplierName(applied.supplier_id) }}
      </span>
      <span v-if="applied.item_id" class="report-filter-chip">
        Item: {{ getItemName(applied.item_id) }}
      </span>
    </template>

    <template #default>
      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100, 0]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th class="report-table__th" style="width: 40px" />
            <q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
            >{{ col.label }}</q-th>
          </q-tr>
        </template>

        <template #body="props">
          <!-- GRN Header Row -->
          <q-tr :props="props" class="report-table__row">
            <q-td class="report-table__td" style="width: 40px; padding: 0 8px">
              <q-btn
                v-if="props.row.lines && props.row.lines.length"
                flat
                round
                dense
                size="sm"
                :icon="expanded.has(props.row.id) ? 'expand_less' : 'expand_more'"
                @click="toggleExpand(props.row.id)"
              />
            </q-td>
            <q-td key="doc_number" :props="props" class="report-table__td--mono text-weight-bold">
              {{ props.row.doc_number }}
            </q-td>
            <q-td key="date" :props="props">{{ fmtDate(props.row.date) }}</q-td>
            <q-td key="supplier" :props="props">{{ props.row.supplier }}</q-td>
            <q-td key="reference" :props="props" class="report-table__td--mono">
              {{ props.row.reference }}
            </q-td>
            <q-td key="total" :props="props" class="report-table__td--num text-weight-bolder text-green">
              {{ fmtLKR(props.row.total) }}
            </q-td>
            <q-td key="status" :props="props">
              <span class="report-badge report-badge--grn">{{ props.row.status }}</span>
            </q-td>
            <q-td key="notes" :props="props" class="report-table__td--muted">
              {{ props.row.notes || '—' }}
            </q-td>
          </q-tr>

          <!-- Item Lines — expanded sub-rows -->
          <template v-if="expanded.has(props.row.id) && props.row.lines?.length">
            <!-- Sub-header -->
            <q-tr class="grn-lines-header">
              <q-td colspan="2" />
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">ITEM</q-td>
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">CODE</q-td>
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">QTY</q-td>
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">UOM</q-td>
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">UNIT COST</q-td>
              <q-td class="grn-line-label text-grey-6 text-caption text-weight-bold">LINE TOTAL</q-td>
            </q-tr>
            <!-- Item rows -->
            <q-tr
              v-for="line in props.row.lines"
              :key="line.id"
              class="grn-line-row"
            >
              <q-td colspan="2" />
              <q-td class="grn-line-cell text-weight-medium">{{ line.item_name }}</q-td>
              <q-td class="grn-line-cell report-table__td--mono text-grey-7">{{ line.item_code }}</q-td>
              <q-td class="grn-line-cell report-table__td--num">{{ line.quantity }}</q-td>
              <q-td class="grn-line-cell">
                <span class="grn-uom-badge">{{ line.uom }}</span>
              </q-td>
              <q-td class="grn-line-cell report-table__td--num text-grey-7">{{ fmtLKR(line.unit_cost) }}</q-td>
              <q-td class="grn-line-cell report-table__td--num text-weight-bold text-teal">{{ fmtLKR(line.line_total) }}</q-td>
            </q-tr>
          </template>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="fact_check" size="40px" class="q-mb-sm" />
            <div>No GRN data for this period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { fetchAllRows } from 'src/services/reportFilters'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, fmtDate } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const expanded = ref(new Set())

const supplierOptions = ref([])
const itemOptions = ref([])
const allItemOptions = ref([])

onMounted(async () => {
  const { data: s } = await supabase.from('suppliers').select('id, name').order('name')
  if (s) supplierOptions.value = s.map(x => ({ label: x.name, value: x.id }))
  
  const { data: i } = await supabase.from('items').select('id, name, code').order('name')
  if (i) {
    allItemOptions.value = i.map(x => ({ label: `${x.name} (${x.code})`, value: x.id }))
    itemOptions.value = [...allItemOptions.value]
  }
})

function filterItems(val, update) {
  if (val === '') {
    update(() => {
      itemOptions.value = allItemOptions.value
    })
    return
  }
  update(() => {
    const needle = val.toLowerCase()
    itemOptions.value = allItemOptions.value.filter(v => v.label.toLowerCase().includes(needle))
  })
}

function getSupplierName(id) {
  const s = supplierOptions.value.find(x => x.value === id)
  return s ? s.label : ''
}
function getItemName(id) {
  const i = allItemOptions.value.find(x => x.value === id)
  return i ? i.label : ''
}

function toggleExpand(id) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id)
  } else {
    expanded.value.add(id)
  }
  // Trigger reactivity
  expanded.value = new Set(expanded.value)
}

const columns = [
  { name: 'doc_number', label: 'GRN #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left' },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left' },
  { name: 'total', label: 'Total Value', field: 'total', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]

// Flat export columns (for CSV/Excel — expands all items)
const exportColumns = [
  { name: 'doc_number', label: 'GRN #', field: 'doc_number', align: 'left' },
  { name: 'date', label: 'Date', field: 'date', align: 'left' },
  { name: 'supplier', label: 'Supplier', field: 'supplier', align: 'left' },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left' },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left' },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left' },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'right' },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'left' },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right' },
  { name: 'line_total', label: 'Line Total', field: 'line_total', align: 'right' },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
]

const exportRows = computed(() =>
  rows.value.flatMap((r) =>
    (r.lines || []).map((l) => ({
      doc_number: r.doc_number,
      date: fmtDate(r.date),
      supplier: r.supplier,
      reference: r.reference,
      item_name: l.item_name,
      item_code: l.item_code,
      quantity: l.quantity,
      uom: l.uom,
      unit_cost: l.unit_cost,
      line_total: l.line_total,
      status: r.status,
    }))
  )
)

async function loadData(filters = {}) {
  loading.value = true
  expanded.value = new Set()
  try {
    // Query goods_receipts directly for accurate GRN data
    const linesJoin = filters.item_id ? 'goods_receipt_lines!inner' : 'goods_receipt_lines'
    let query = supabase
      .from('goods_receipts')
      .select(
        `id, doc_number, doc_date, created_at,
         total_amount, status, remarks,
         supplier_id,
         suppliers ( name ),
         ${linesJoin} (
           id, item_id, quantity, unit_cost, line_total, uom_id,
           items ( name, code ),
           uom!goods_receipt_lines_uom_id_fkey ( name, code )
         )`
      )
      .order('created_at', { ascending: false })

    if (filters.dateFrom) query = query.gte('doc_date', filters.dateFrom)
    if (filters.dateTo) query = query.lte('doc_date', filters.dateTo)
    if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id)
    if (filters.item_id) query = query.eq('goods_receipt_lines.item_id', filters.item_id)

    const { data, error } = await fetchAllRows(query.order('id'))
    if (error) throw error

    rows.value = (data || []).map((r) => {
      const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers
      const rawLines = r.goods_receipt_lines || []

      const lines = rawLines.map((l) => {
        const item = Array.isArray(l.items) ? l.items[0] : l.items
        const uomData = Array.isArray(l.uom) ? l.uom[0] : l.uom
        return {
          id: l.id,
          item_name: item?.name || '—',
          item_code: item?.code || '—',
          quantity: Number(l.quantity || 0),
          uom: uomData?.code || uomData?.name || '—',
          unit_cost: Number(l.unit_cost || 0),
          line_total: Number(l.line_total || 0),
        }
      })

      return {
        id: r.id,
        doc_number: r.doc_number || `GRN-${r.id?.slice(0, 6)}`,
        date: r.doc_date || r.created_at,
        supplier: supplier?.name || '—',
        reference: '—',
        total: Number(r.total_amount || 0),
        status: r.status || 'posted',
        notes: r.remarks,
        lines,
      }
    })
  } catch (e) {
    console.error('[GRN]', e)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(exportColumns, exportRows.value, 'grn_report')
}
function exportExcel() {
  exportTableToExcel(exportColumns, exportRows.value, 'grn_report')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

.grn-lines-header {
  background: rgba(var(--q-primary-rgb, 33, 150, 243), 0.04);

  .grn-line-label {
    padding: 4px 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
}

.grn-line-row {
  background: rgba(0, 0, 0, 0.015);
  transition: background 0.15s;

  &:hover {
    background: rgba(0, 0, 0, 0.035);
  }

  .grn-line-cell {
    padding: 6px 12px;
    font-size: 13px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
  }
}

.grn-uom-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(13, 148, 136, 0.12);
  color: #0d9488;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
