<template>
  <ReportLayout
    title="Inventory Ledger"
    subtitle="Stock movement history — receipts, issues, adjustments and current balances"
    :kpis="kpiData"
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

async function loadData() {
  loading.value = true
  try {
    let query = supabase
      .from('stock_movements')
      .select(
        `
        id,
        created_at,
        reference_no,
        movement_type,
        quantity_in,
        quantity_out,
        balance_after,
        unit_cost,
        notes,
        warehouse_id,
        inventory_items (name, sku, uom, category),
        warehouses (name)
      `,
      )
      .order('created_at', { ascending: false })

    if (currentFilters.value.dateFrom) {
      query = query.gte('created_at', currentFilters.value.dateFrom + 'T00:00:00')
    }
    if (currentFilters.value.dateTo) {
      query = query.lte('created_at', currentFilters.value.dateTo + 'T23:59:59')
    }
    if (currentFilters.value.branch) {
      query = query.eq('branch_id', currentFilters.value.branch)
    }

    // Security: restrict non-admin users to their own branch
    if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query.limit(1000)
    if (error) throw error

    const cats = new Set()
    const whMap = {}

    rows.value = (data || []).map((r) => {
      const cat = r.inventory_items?.category || '—'
      cats.add(cat)
      if (r.warehouse_id && r.warehouses?.name) {
        whMap[r.warehouse_id] = r.warehouses.name
      }
      const qIn = Number(r.quantity_in || 0)
      const qOut = Number(r.quantity_out || 0)
      const uc = Number(r.unit_cost || 0)
      return {
        id: r.id,
        date: r.created_at,
        ref_no: r.reference_no || '—',
        item_name: r.inventory_items?.name || '—',
        sku: r.inventory_items?.sku || '—',
        category: cat,
        movement_type: r.movement_type,
        qty_in: qIn,
        qty_out: qOut,
        balance: r.balance_after ?? '—',
        uom: r.inventory_items?.uom || '—',
        unit_cost: uc,
        total_value: uc * Math.max(qIn, qOut),
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
.report-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.report-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--erp-text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.report-filter-input {
  font-size: 13px;
}

.report-table {
  background: transparent !important;

  &__header-row {
    background: rgba(255, 255, 255, 0.02) !important;
  }

  &__th {
    font-size: 11px !important;
    font-weight: 700 !important;
    color: var(--erp-text-secondary, #94a3b8) !important;
    text-transform: uppercase !important;
    letter-spacing: 0.4px !important;
    border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06)) !important;
    padding: 8px 10px !important;
    white-space: nowrap;
  }

  &__row {
    border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.04)) !important;
    transition: background 0.12s ease;
    &:hover {
      background: rgba(255, 255, 255, 0.02) !important;
    }
  }

  &__td {
    font-size: 12px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
    padding: 8px 10px !important;
    height: 40px !important;

    &--num {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
    }
    &--mono {
      font-family: 'SF Mono', 'JetBrains Mono', monospace;
    }
    &--bold {
      font-weight: 700 !important;
    }
    &--muted {
      color: var(--erp-text-muted, #64748b) !important;
    }
    &--credit {
      color: var(--erp-success, #16a34a) !important;
    }
    &--debit {
      color: var(--erp-danger, #dc2626) !important;
    }
  }

  &__total-row {
    background: rgba(255, 255, 255, 0.04) !important;
    border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1)) !important;
  }
}

.report-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: var(--erp-text-secondary, #94a3b8);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  white-space: nowrap;

  &--grn {
    background: rgba(22, 163, 74, 0.12);
    color: #16a34a;
    border-color: rgba(22, 163, 74, 0.2);
  }
  &--kot_issue {
    background: rgba(245, 158, 11, 0.12);
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.2);
  }
  &--adjustment {
    background: rgba(124, 58, 237, 0.12);
    color: #7c3aed;
    border-color: rgba(124, 58, 237, 0.2);
  }
  &--transfer {
    background: rgba(37, 99, 235, 0.12);
    color: #2563eb;
    border-color: rgba(37, 99, 235, 0.2);
  }
  &--return {
    background: rgba(220, 38, 38, 0.12);
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.2);
  }
  &--opening {
    background: rgba(100, 116, 139, 0.12);
    color: #94a3b8;
    border-color: rgba(100, 116, 139, 0.2);
  }
}

.report-truncate {
  display: block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

@media print {
  .report-table__td,
  .report-table__th {
    font-size: 9px !important;
    padding: 4px 6px !important;
  }
}
</style>
