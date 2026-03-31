<template>
  <ReportLayout
    title="Inventory Ledger"
    subtitle="Stock movement history — receipts, issues, adjustments and current balances"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="onFilterChange"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Extra filters -->
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Item / SKU</label>
        <q-input
          v-model="extraFilters.search"
          dense
          outlined
          clearable
          placeholder="Search item..."
          class="report-filter-input"
        >
          <template #prepend><q-icon name="search" size="16px" /></template>
        </q-input>
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Category</label>
        <q-select
          v-model="extraFilters.category"
          :options="categoryOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All"
          class="report-filter-input"
        />
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Movement Type</label>
        <q-select
          v-model="extraFilters.movementType"
          :options="movementTypeOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All"
          class="report-filter-input"
        />
      </div>
    </template>

    <!-- Advanced filters -->
    <template #advanced-filters>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px">
        <div class="report-filter-group">
          <label class="report-filter-label">Warehouse</label>
          <q-select
            v-model="extraFilters.warehouse"
            :options="warehouseOptions"
            dense
            outlined
            emit-value
            map-options
            clearable
            placeholder="All Warehouses"
            class="report-filter-input"
          />
        </div>
        <div class="report-filter-group">
          <label class="report-filter-label">Min. Qty Change</label>
          <q-input
            v-model.number="extraFilters.minQty"
            dense
            outlined
            type="number"
            placeholder="0"
            class="report-filter-input"
          />
        </div>
        <div class="report-filter-group">
          <label class="report-filter-label">Reference No</label>
          <q-input
            v-model="extraFilters.reference"
            dense
            outlined
            clearable
            placeholder="PO#, GRN# ..."
            class="report-filter-input"
          />
        </div>
      </div>
    </template>

    <!-- DataGrid -->
    <template #default>
      <q-table
        :rows="filteredRows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100, 200]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="report-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="date" :props="props" class="report-table__td">
              {{ formatDate(props.row.date) }}
            </q-td>
            <q-td key="ref_no" :props="props" class="report-table__td report-table__td--mono">
              {{ props.row.ref_no }}
            </q-td>
            <q-td key="item_name" :props="props" class="report-table__td report-table__td--bold">
              {{ props.row.item_name }}
            </q-td>
            <q-td
              key="sku"
              :props="props"
              class="report-table__td report-table__td--mono report-table__td--muted"
            >
              {{ props.row.sku }}
            </q-td>
            <q-td key="category" :props="props" class="report-table__td">{{
              props.row.category
            }}</q-td>
            <q-td key="movement_type" :props="props" class="report-table__td">
              <span class="report-badge" :class="`report-badge--${props.row.movement_type}`">
                {{ formatMovement(props.row.movement_type) }}
              </span>
            </q-td>
            <q-td
              key="qty_in"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--credit"
            >
              {{ props.row.qty_in > 0 ? `+${props.row.qty_in}` : '—' }}
            </q-td>
            <q-td
              key="qty_out"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--debit"
            >
              {{ props.row.qty_out > 0 ? `-${props.row.qty_out}` : '—' }}
            </q-td>
            <q-td
              key="balance"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--bold"
            >
              {{ props.row.balance }}
            </q-td>
            <q-td key="uom" :props="props" class="report-table__td report-table__td--muted">{{
              props.row.uom
            }}</q-td>
            <q-td key="unit_cost" :props="props" class="report-table__td report-table__td--num">
              {{ fmtLKR(props.row.unit_cost) }}
            </q-td>
            <q-td
              key="total_value"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--bold"
            >
              {{ fmtLKR(props.row.total_value) }}
            </q-td>
            <q-td key="warehouse" :props="props" class="report-table__td">{{
              props.row.warehouse
            }}</q-td>
            <q-td
              key="notes"
              :props="props"
              class="report-table__td report-table__td--muted"
              style="max-width: 180px"
            >
              <span class="report-truncate">{{ props.row.notes }}</span>
            </q-td>
          </q-tr>
        </template>

        <!-- Footer summary -->
        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="6" class="report-table__td report-table__td--bold">PERIOD TOTALS</q-td>
            <q-td
              class="report-table__td report-table__td--num report-table__td--credit report-table__td--bold"
            >
              +{{ totals.qtyIn }}
            </q-td>
            <q-td
              class="report-table__td report-table__td--num report-table__td--debit report-table__td--bold"
            >
              -{{ totals.qtyOut }}
            </q-td>
            <q-td colspan="3" />
            <q-td class="report-table__td report-table__td--num report-table__td--bold">
              {{ fmtLKR(totals.totalValue) }}
            </q-td>
            <q-td colspan="2" />
          </q-tr>
        </template>

        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing>
            <q-spinner-gears size="40px" color="primary" />
          </q-inner-loading>
        </template>

        <!-- Empty state -->
        <template #no-data>
          <div class="report-empty">
            <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
            <div>No inventory movements found for selected period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])
const currentFilters = ref({})

const extraFilters = ref({
  search: '',
  category: null,
  movementType: null,
  warehouse: null,
  minQty: null,
  reference: '',
})

const categoryOptions = ref([{ label: 'All Categories', value: null }])
const warehouseOptions = ref([{ label: 'All Warehouses', value: null }])

const movementTypeOptions = [
  { label: 'All Movements', value: null },
  { label: 'Goods Receipt (GRN)', value: 'grn' },
  { label: 'KOT Issue', value: 'kot_issue' },
  { label: 'Manual Adjustment', value: 'adjustment' },
  { label: 'Transfer', value: 'transfer' },
  { label: 'Return', value: 'return' },
  { label: 'Opening Balance', value: 'opening' },
]

const columns = [
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true },
  { name: 'ref_no', label: 'Reference', field: 'ref_no', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left', sortable: true },
  { name: 'sku', label: 'SKU', field: 'sku', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'category', align: 'left', sortable: true },
  { name: 'movement_type', label: 'Type', field: 'movement_type', align: 'left', sortable: true },
  { name: 'qty_in', label: 'Qty In', field: 'qty_in', align: 'right', sortable: true },
  { name: 'qty_out', label: 'Qty Out', field: 'qty_out', align: 'right', sortable: true },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', sortable: false },
  { name: 'uom', label: 'UOM', field: 'uom', align: 'left' },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right', sortable: true },
  {
    name: 'total_value',
    label: 'Value (LKR)',
    field: 'total_value',
    align: 'right',
    sortable: true,
  },
  { name: 'warehouse', label: 'Warehouse', field: 'warehouse', align: 'left', sortable: true },
  { name: 'notes', label: 'Notes', field: 'notes', align: 'left' },
]

const filteredRows = computed(() => {
  let data = rows.value
  if (extraFilters.value.search) {
    const q = extraFilters.value.search.toLowerCase()
    data = data.filter(
      (r) =>
        r.item_name?.toLowerCase().includes(q) ||
        r.sku?.toLowerCase().includes(q) ||
        r.ref_no?.toLowerCase().includes(q),
    )
  }
  if (extraFilters.value.movementType) {
    data = data.filter((r) => r.movement_type === extraFilters.value.movementType)
  }
  if (extraFilters.value.category) {
    data = data.filter((r) => r.category === extraFilters.value.category)
  }
  if (extraFilters.value.warehouse) {
    data = data.filter((r) => r.warehouse_id === extraFilters.value.warehouse)
  }
  if (extraFilters.value.minQty) {
    data = data.filter((r) => Math.abs(r.qty_in - r.qty_out) >= extraFilters.value.minQty)
  }
  if (extraFilters.value.reference) {
    const q = extraFilters.value.reference.toLowerCase()
    data = data.filter((r) => r.ref_no?.toLowerCase().includes(q))
  }
  return data
})

const totals = computed(() => ({
  qtyIn: filteredRows.value.reduce((s, r) => s + (r.qty_in || 0), 0),
  qtyOut: filteredRows.value.reduce((s, r) => s + (r.qty_out || 0), 0),
  totalValue: filteredRows.value.reduce((s, r) => s + (r.total_value || 0), 0),
}))

const kpiData = computed(() => [
  {
    label: 'Total Movements',
    value: filteredRows.value.length.toLocaleString(),
    icon: 'swap_vert',
    color: 'blue',
  },
  {
    label: 'Total Received',
    value: totals.value.qtyIn.toLocaleString(),
    icon: 'move_to_inbox',
    color: 'green',
  },
  {
    label: 'Total Issued',
    value: totals.value.qtyOut.toLocaleString(),
    icon: 'outbox',
    color: 'amber',
  },
  {
    label: 'Inventory Value',
    value: fmtLKR(totals.value.totalValue),
    icon: 'account_balance_wallet',
    color: 'purple',
  },
])

async function onFilterChange(filters) {
  currentFilters.value = filters
  await loadData()
}

// doc_type → movement badge mapping (enterprise system uses doc_type codes)
const DOC_TYPE_TO_MOVEMENT = {
  GRN: 'grn',
  GIN: 'kot_issue',
  ADJUSTMENT: 'adjustment',
  TRANSFER: 'transfer',
  RETURN: 'return',
  OPENING: 'opening',
  STOCK_COUNT: 'adjustment',
  BOM_DEDUCT: 'kot_issue',
  PO: 'grn',
}

async function loadData() {
  loading.value = true
  try {
    // S1-2: Query live enterprise inventory_ledger instead of dead stock_movements
    let query = supabase
      .from('inventory_ledger')
      .select(
        `
        id,
        created_at,
        quantity,
        direction,
        unit_cost,
        notes,
        warehouse_id,
        items ( name, sku, company_id, reorder_level, item_categories(name) ),
        warehouses ( name ),
        inventory_documents ( doc_number, doc_type, reference_no )
      `,
      )
      .order('created_at', { ascending: false })

    if (currentFilters.value.dateFrom) {
      query = query.gte('created_at', currentFilters.value.dateFrom + 'T00:00:00')
    }
    if (currentFilters.value.dateTo) {
      query = query.lte('created_at', currentFilters.value.dateTo + 'T23:59:59')
    }

    // Security: restrict non-admin users to their own company's items
    const companyId = authStore.companyId
    if (companyId) {
      query = query.eq('items.company_id', companyId)
    }

    const { data, error } = await query.limit(1000)
    if (error) throw error

    const cats = new Set()
    const whMap = {}

    rows.value = (data || []).map((r) => {
      const docType = r.inventory_documents?.doc_type || 'adjustment'
      const movType = DOC_TYPE_TO_MOVEMENT[docType] || 'adjustment'
      const cat = r.items?.item_categories?.name || '—'
      cats.add(cat)
      if (r.warehouse_id && r.warehouses?.name) {
        whMap[r.warehouse_id] = r.warehouses.name
      }
      const qty = Number(r.quantity || 0)
      const qIn = r.direction === 'IN' ? qty : 0
      const qOut = r.direction === 'OUT' ? qty : 0
      const uc = Number(r.unit_cost || 0)
      return {
        id: r.id,
        date: r.created_at,
        ref_no: r.inventory_documents?.doc_number || r.inventory_documents?.reference_no || '—',
        item_name: r.items?.name || '—',
        sku: r.items?.sku || '—',
        category: cat,
        movement_type: movType,
        qty_in: qIn,
        qty_out: qOut,
        balance: '—', // inventory_ledger is event-sourced; running balance computed on demand
        uom: '—',
        unit_cost: uc,
        total_value: uc * qty,
        warehouse: r.warehouses?.name || '—',
        warehouse_id: r.warehouse_id,
        notes: r.notes || '',
      }
    })

    // Build dropdown options
    categoryOptions.value = [
      { label: 'All Categories', value: null },
      ...[...cats].map((c) => ({ label: c, value: c })),
    ]
    warehouseOptions.value = [
      { label: 'All Warehouses', value: null },
      ...Object.entries(whMap).map(([id, name]) => ({ label: name, value: id })),
    ]
  } catch (err) {
    console.error('[InventoryLedger] Error:', err)
  } finally {
    loading.value = false
  }
}

function formatMovement(type) {
  const labels = {
    grn: 'GRN Receipt',
    kot_issue: 'KOT Issue',
    adjustment: 'Adjustment',
    transfer: 'Transfer',
    return: 'Return',
    opening: 'Opening',
  }
  return labels[type] || type
}

function fmtLKR(val) {
  return `LKR ${Number(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
}

function formatDate(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function exportCSV() {
  const headers = columns.map((c) => c.label).join(',')
  const rowsData = filteredRows.value
    .map((r) =>
      [
        r.date,
        r.ref_no,
        r.item_name,
        r.sku,
        r.category,
        r.movement_type,
        r.qty_in,
        r.qty_out,
        r.balance,
        r.uom,
        r.unit_cost,
        r.total_value,
        r.warehouse,
        `"${r.notes}"`,
      ].join(','),
    )
    .join('\n')
  downloadFile(headers + '\n' + rowsData, 'inventory-ledger.csv', 'text/csv')
}

function exportExcel() {
  const headers = columns.map((c) => c.label).join('\t')
  const rowsData = filteredRows.value
    .map((r) =>
      [
        r.date,
        r.ref_no,
        r.item_name,
        r.sku,
        r.category,
        r.movement_type,
        r.qty_in,
        r.qty_out,
        r.balance,
        r.uom,
        r.unit_cost,
        r.total_value,
        r.warehouse,
        r.notes,
      ].join('\t'),
    )
    .join('\n')
  downloadFile(headers + '\n' + rowsData, 'inventory-ledger.xls', 'application/vnd.ms-excel')
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
