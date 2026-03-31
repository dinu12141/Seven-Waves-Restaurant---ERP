<template>
  <ReportLayout
    :title="reportTitle"
    subtitle="Detailed analysis of items used in the kitchen (BOM-based deductions)"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @export-pdf="exportPDF"
    @print="printReport"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Search Item</label>
        <q-input
          v-model="searchQuery"
          dense
          outlined
          clearable
          placeholder="Search..."
          class="report-filter-input"
          @update:model-value="applyLocalFilters"
        >
          <template #prepend><q-icon name="search" size="16px" /></template>
        </q-input>
      </div>
    </template>

    <template #default>
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="item_name" :props="props" class="text-weight-bold">
              {{ props.row.item_name }}
            </q-td>
            <q-td key="warehouse" :props="props">
              <q-badge outline color="primary" :label="props.row.warehouse" />
            </q-td>
            <q-td key="category" :props="props">{{ props.row.category }}</q-td>
            <q-td
              key="qty_used"
              :props="props"
              class="report-table__td--num text-red text-weight-bold"
            >
              {{ formatQtyWithUom(props.row.qty_used, props.row.uom) }}
            </q-td>
            <q-td key="unit_cost" :props="props" class="report-table__td--num">
              {{ fmtLKR(props.row.unit_cost) }}
            </q-td>
            <q-td
              key="total_cost"
              :props="props"
              class="report-table__td--num text-weight-bolder text-red"
            >
              {{ fmtLKR(props.row.total_cost) }}
            </q-td>
          </q-tr>
        </template>

        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td--bold">TOTAL USAGE</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-red">
              {{ totals.qty.toFixed(2) }}
            </q-td>
            <q-td />
            <q-td class="report-table__td--bold report-table__td--num text-red">
              {{ fmtLKR(totals.cost) }}
            </q-td>
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="restaurant" size="40px" class="q-mb-sm" />
            <div>No kitchen usage data found</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToPDF, printTableAsPDF } from 'src/services/exportService'
import { fmtLKR } from 'src/services/reportService'
import ExcelJS from 'exceljs'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])
const filteredRows = ref([])
const warehouseFilter = ref(null)
const warehouseOptions = ref([])
const searchQuery = ref('')
const currentFilters = ref({})

// Dynamic title based on date filter range
const reportTitle = computed(() => {
  const f = currentFilters.value
  if (!f.dateFrom || !f.dateTo) return 'Kitchen Usage Report'
  const from = new Date(f.dateFrom)
  const to = new Date(f.dateTo)
  const diffDays = Math.round((to - from) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Daily Kitchen Usage Report'
  if (diffDays <= 7) return 'Weekly Kitchen Usage Report'
  if (diffDays <= 31) return 'Monthly Kitchen Usage Report'
  if (diffDays <= 93) return 'Quarterly Kitchen Usage Report'
  return 'Kitchen Usage Report'
})

const columns = [
  { name: 'item_name', label: 'Item Name', field: 'item_name', align: 'left', sortable: true },
  {
    name: 'warehouse',
    label: 'Kitchen / Warehouse',
    field: 'warehouse',
    align: 'left',
    sortable: true,
  },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'qty_used', label: 'Used Quantity', field: 'qty_used', align: 'right', sortable: true },
  { name: 'unit_cost', label: 'Avg Unit Cost', field: 'unit_cost', align: 'right', sortable: true },
  { name: 'total_cost', label: 'Total Value', field: 'total_cost', align: 'right', sortable: true },
]

const totals = computed(() => ({
  qty: filteredRows.value.reduce((s, r) => s + r.qty_used, 0),
  cost: filteredRows.value.reduce((s, r) => s + r.total_cost, 0),
}))

const kpiData = computed(() => [
  {
    label: 'Total Items Used',
    value: filteredRows.value.length,
    icon: 'restaurant_menu',
    color: 'blue',
  },
  {
    label: 'Total Usage Value',
    value: fmtLKR(totals.value.cost),
    icon: 'trending_down',
    color: 'red',
  },
  {
    label: 'Kitchens Active',
    value: new Set(rows.value.map((r) => r.warehouse)).size,
    icon: 'soup_kitchen',
    color: 'teal',
  },
])

async function loadWarehouses() {
  const { data } = await supabase.from('warehouses').select('id, name').eq('is_active', true)
  if (data) {
    warehouseOptions.value = data.map((w) => ({ label: w.name, value: w.name }))
  }
}

async function loadData(filters = {}) {
  currentFilters.value = filters
  loading.value = true
  try {
    // inventory_ledger has doc_type denormalized directly on it — no need to join inventory_documents
    let query = supabase
      .from('inventory_ledger')
      .select(
        `
        id,
        quantity,
        unit_cost,
        doc_type,
        posted_at,
        items (
          name,
          inventory_uom_id,
          company_id,
          uoms:inventory_uom_id ( name ),
          item_categories ( name )
        ),
        warehouses ( name )
      `,
      )
      .eq('direction', 'OUT')
      .eq('doc_type', 'BOM_DEDUCT')

    // RLS safety - filter by user company
    const companyId = authStore.currentBranch?.company_id
    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    if (filters.dateFrom) query = query.gte('posted_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('posted_at', filters.dateTo + 'T23:59:59')

    const { data, error } = await query.limit(5000)
    if (error) throw error

    // Pivot data by item and warehouse
    const pivot = {}
    ;(data || []).forEach((r) => {
      const itemName = r.items?.name || 'Unknown'
      const whName = r.warehouses?.name || 'Main Kitchen'
      const key = `${whName}_${itemName}`

      if (!pivot[key]) {
        pivot[key] = {
          id: key,
          item_name: itemName,
          warehouse: whName,
          category: r.items?.item_categories?.name || '—',
          qty_used: 0,
          uom: r.items?.uoms?.name || '',
          unit_cost: Number(r.unit_cost || 0),
          total_cost: 0,
        }
      }
      const qty = Number(r.quantity || 0)
      pivot[key].qty_used += qty
      pivot[key].total_cost += qty * Number(r.unit_cost || 0)
    })

    rows.value = Object.values(pivot).sort((a, b) => b.qty_used - a.qty_used)
    applyLocalFilters()
  } catch (e) {
    console.error('[DailyKitchenUsage]', e)
  } finally {
    loading.value = false
  }
}

// Convert Kg→g and L→ml for display since BOM recipes use grams/ml
function formatQtyWithUom(qty, uom) {
  if (!uom) return qty.toFixed(2)
  const u = uom.toLowerCase()
  if (u === 'kilogram' || u === 'kg') {
    const grams = qty * 1000
    return `${grams.toFixed(0)} g`
  }
  if (u === 'litre' || u === 'liter' || u === 'l') {
    const ml = qty * 1000
    return `${ml.toFixed(0)} ml`
  }
  return `${qty.toFixed(2)} ${uom}`
}

function applyLocalFilters() {
  let data = [...rows.value]
  if (warehouseFilter.value) {
    data = data.filter((r) => r.warehouse === warehouseFilter.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    data = data.filter((r) => r.item_name.toLowerCase().includes(q))
  }
  filteredRows.value = data
}

// ── Helper: build date subtitle for exports ──
function getDateSubtitle() {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) {
    const from = new Date(f.dateFrom).toLocaleDateString('en-GB')
    const to = new Date(f.dateTo).toLocaleDateString('en-GB')
    return `Location: ${authStore.currentBranch?.name || 'All Branches'} | ${from} To ${to}`
  }
  return `Location: ${authStore.currentBranch?.name || 'All Branches'}`
}

// ── Helper: build export-ready columns (with UOM-converted qty) ──
function getExportColumns() {
  return [
    { label: 'Item Name', field: 'item_name', align: 'left' },
    { label: 'Kitchen / Warehouse', field: 'warehouse', align: 'left' },
    { label: 'Category', field: 'category', align: 'left' },
    { label: 'Used Quantity', field: (r) => formatQtyWithUom(r.qty_used, r.uom), align: 'right' },
    { label: 'Avg Unit Cost', field: (r) => fmtLKR(r.unit_cost), align: 'right' },
    { label: 'Total Value', field: (r) => fmtLKR(r.total_cost), align: 'right' },
  ]
}

// ── PDF Export (uses jsPDF + autoTable with logo & header) ──
async function exportPDF() {
  await exportTableToPDF(
    getExportColumns(),
    filteredRows.value,
    reportTitle.value,
    getDateSubtitle(),
  )
}

// ── Print (generates same PDF as download but opens for printing) ──
async function printReport() {
  await printTableAsPDF(
    getExportColumns(),
    filteredRows.value,
    reportTitle.value,
    getDateSubtitle(),
  )
}

// ── CSV Export (with company header rows) ──
function exportCSV() {
  const cols = getExportColumns()
  const headerRows = ['SEVEN WAVES RESTAURANT (PVT) LTD', reportTitle.value, getDateSubtitle(), '']
  const csvHeader = cols.map((c) => `"${c.label}"`).join(',')
  const csvBody = filteredRows.value
    .map((r) =>
      cols
        .map((c) => {
          const val = typeof c.field === 'function' ? c.field(r) : r[c.field]
          return `"${('' + (val || '')).replace(/"/g, '""')}"`
        })
        .join(','),
    )
    .join('\n')

  const content = headerRows.join('\n') + '\n' + csvHeader + '\n' + csvBody
  const dateStr = new Date().toISOString().slice(0, 10)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Kitchen_Usage_Report_${dateStr}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// ── Excel Export (professionally formatted with exceljs) ──
async function exportExcel() {
  const cols = getExportColumns()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves Restaurant ERP'
  const ws = wb.addWorksheet('Kitchen Usage')

  // ── Define styles ──
  const navyFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } }
  const lightFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FC' } }
  const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF3' } }
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  }

  // ── Column widths ──
  ws.columns = [
    { width: 28 },
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
  ]

  // ── Row 1: Company Name ──
  const r1 = ws.addRow(['SEVEN WAVES RESTAURANT (PVT) LTD'])
  ws.mergeCells('A1:F1')
  r1.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } }
  r1.height = 24

  // ── Row 2: Report Title ──
  const r2 = ws.addRow([reportTitle.value])
  ws.mergeCells('A2:F2')
  r2.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF333333' } }

  // ── Row 3: Location & Date ──
  const r3 = ws.addRow([getDateSubtitle()])
  ws.mergeCells('A3:F3')
  r3.getCell(1).font = { size: 10, color: { argb: 'FF666666' } }

  // ── Row 4: Empty spacer ──
  ws.addRow([])

  // ── Row 5: Column Headers ──
  const headerRow = ws.addRow(cols.map((c) => c.label))
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = navyFill
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder
  })

  // ── Data Rows ──
  filteredRows.value.forEach((r, idx) => {
    const rowData = cols.map((c) => (typeof c.field === 'function' ? c.field(r) : r[c.field]))
    const row = ws.addRow(rowData)
    row.eachCell((cell, colNumber) => {
      cell.border = thinBorder
      cell.font = { size: 10, color: { argb: 'FF1A1A1A' } }
      // Right-align numeric columns (Used Qty, Avg Cost, Total)
      if (colNumber >= 4) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        cell.alignment = { vertical: 'middle' }
      }
      // Alternating row colors
      if (idx % 2 === 1) {
        cell.fill = lightFill
      }
    })
  })

  // ── Total Row ──
  const totalRow = ws.addRow([
    'TOTAL USAGE',
    '',
    '',
    formatQtyWithUom(totals.value.qty, 'Kilogram'),
    '',
    fmtLKR(totals.value.cost),
  ])
  totalRow.height = 22
  totalRow.eachCell((cell, colNumber) => {
    cell.fill = totalFill
    cell.font = { bold: true, size: 10, color: { argb: 'FF1A1A2E' } }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1A1A2E' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    }
    if (colNumber >= 4) {
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      cell.alignment = { vertical: 'middle' }
    }
  })

  // ── Footer row ──
  ws.addRow([])
  const footerRow = ws.addRow([
    `Generated: ${new Date().toLocaleString()} • Seven Waves Restaurant ERP • Confidential`,
  ])
  ws.mergeCells(`A${footerRow.number}:F${footerRow.number}`)
  footerRow.getCell(1).font = { italic: true, size: 8, color: { argb: 'FF999999' } }
  footerRow.getCell(1).alignment = { horizontal: 'center' }

  // ── Write & Download ──
  const buffer = await wb.xlsx.writeBuffer()
  const dateStr = new Date().toISOString().slice(0, 10)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Kitchen_Usage_Report_${dateStr}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

onMounted(() => {
  loadWarehouses()
})
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
