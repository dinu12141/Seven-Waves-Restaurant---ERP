<template>
  <ReportLayout
    title="Stock on Hand"
    subtitle="Current stock levels per item and warehouse — with reorder alerts"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Search Item</label>
        <q-input
          v-model="search"
          dense
          outlined
          clearable
          placeholder="Item name or code..."
          class="report-filter-input"
          ><template #prepend><q-icon name="search" size="16px" /></template
        ></q-input>
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Warehouse</label>
        <q-select
          v-model="warehouseFilter"
          :options="['All Warehouses', ...warehouseNames]"
          dense
          outlined
          class="report-filter-input"
        />
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Stock Status</label>
        <q-select
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input"
        />
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
            <q-td key="item_name" :props="props" class="text-weight-bold">{{
              props.row.item_name
            }}</q-td>
            <q-td
              key="item_code"
              :props="props"
              class="report-table__td--mono report-table__td--muted"
              >{{ props.row.item_code }}</q-td
            >
            <q-td key="warehouse_name" :props="props">
              <q-chip dense size="sm" color="blue-grey-8" text-color="white" icon="warehouse">
                {{ props.row.warehouse_name }}
              </q-chip>
            </q-td>
            <q-td
              key="qty_on_hand"
              :props="props"
              class="report-table__td--num text-weight-bolder"
              :class="
                props.row.qty_on_hand <= 0
                  ? 'text-red'
                  : props.row.stock_status === 'LOW_STOCK'
                    ? 'text-orange'
                    : props.row.stock_status === 'OVER_STOCK'
                      ? 'text-blue'
                      : 'text-green'
              "
              >{{ props.row.qty_on_hand }}</q-td
            >
            <q-td key="reorder_point" :props="props" class="report-table__td--num">{{
              props.row.min_level ?? '—'
            }}</q-td>
            <q-td key="unit_cost" :props="props" class="report-table__td--num">{{
              fmtLKR(props.row.unit_cost)
            }}</q-td>
            <q-td key="stock_value" :props="props" class="report-table__td--num text-weight-bold">{{
              fmtLKR(props.row.stock_value)
            }}</q-td>
            <q-td key="stock_status" :props="props">
              <q-badge
                :color="
                  props.row.stock_status === 'OUT_OF_STOCK'
                    ? 'red'
                    : props.row.stock_status === 'LOW_STOCK'
                      ? 'orange'
                      : props.row.stock_status === 'OVER_STOCK'
                        ? 'blue'
                        : 'green'
                "
              >
                {{ props.row.stock_status?.replaceAll('_', ' ') }}
              </q-badge>
            </q-td>
            <q-td key="actions" :props="props">
              <div class="row no-wrap q-gutter-xs">
                <q-btn
                  dense
                  flat
                  size="sm"
                  icon="add_box"
                  color="positive"
                  title="Quick GRN — Add stock"
                  @click="quickGRN(props.row)"
                >
                  <q-tooltip>Add Stock (GRN)</q-tooltip>
                </q-btn>
                <q-btn
                  v-if="props.row.qty_on_hand > 0"
                  dense
                  flat
                  size="sm"
                  icon="swap_horiz"
                  color="primary"
                  title="Create Transfer"
                  @click="quickTransfer(props.row)"
                >
                  <q-tooltip>Transfer Stock</q-tooltip>
                </q-btn>
              </div>
            </q-td>
          </q-tr></template
        >
        <template #bottom-row
          ><q-tr class="report-table__total-row">
            <q-td colspan="6" class="report-table__td--bold">TOTAL INVENTORY VALUE</q-td>
            <q-td class="report-table__td--bold report-table__td--num text-green">{{
              fmtLKR(totalValue)
            }}</q-td>
            <q-td colspan="2" />
          </q-tr>
        </template>
        <template #no-data
          ><div class="report-empty">
            <q-icon name="shelves" size="40px" class="q-mb-sm" />
            <div>No stock data available</div>
          </div></template
        >
      </q-table>
    </template>
  </ReportLayout>
</template>
<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, getCompanyId } from 'src/services/reportService'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const search = ref('')
const statusFilter = ref('all')
const warehouseFilter = ref('All Warehouses')

const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'In Stock (OK)', value: 'OK' },
  { label: 'Low Stock', value: 'LOW_STOCK' },
  { label: 'Out of Stock', value: 'OUT_OF_STOCK' },
  { label: 'Over Stock', value: 'OVER_STOCK' },
]

const warehouseNames = computed(() => [
  ...new Set(rows.value.map((r) => r.warehouse_name).filter(Boolean)),
])

const columns = [
  { name: 'item_name', label: 'Item Name', field: 'item_name', align: 'left', sortable: true },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left', sortable: true },
  {
    name: 'warehouse_name',
    label: 'Warehouse',
    field: 'warehouse_name',
    align: 'left',
    sortable: true,
  },
  { name: 'qty_on_hand', label: 'ON HAND', field: 'qty_on_hand', align: 'right', sortable: true },
  {
    name: 'reorder_point',
    label: 'Reorder Pt',
    field: 'reorder_point',
    align: 'right',
    sortable: true,
  },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right', sortable: true },
  {
    name: 'stock_value',
    label: 'Stock Value',
    field: 'stock_value',
    align: 'right',
    sortable: true,
  },
  { name: 'stock_status', label: 'STATUS', field: 'stock_status', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center', style: 'width: 90px' },
]

const filteredRows = computed(() => {
  let data = rows.value
  if (search.value) {
    const q = search.value.toLowerCase()
    data = data.filter(
      (r) => r.item_name?.toLowerCase().includes(q) || r.item_code?.toLowerCase().includes(q),
    )
  }
  if (warehouseFilter.value && warehouseFilter.value !== 'All Warehouses') {
    data = data.filter((r) => r.warehouse_name === warehouseFilter.value)
  }
  if (statusFilter.value && statusFilter.value !== 'all') {
    data = data.filter((r) => r.stock_status === statusFilter.value)
  }
  return data
})

const totalValue = computed(() => filteredRows.value.reduce((s, r) => s + (r.stock_value || 0), 0))

const kpiData = computed(() => [
  { label: 'Total Rows', value: filteredRows.value.length, icon: 'inventory_2', color: 'blue' },
  {
    label: 'Total Value',
    value: fmtLKR(totalValue.value),
    icon: 'account_balance_wallet',
    color: 'green',
  },
  {
    label: 'Low Stock Alert',
    value: rows.value.filter((r) => r.stock_status === 'LOW_STOCK').length,
    icon: 'warning',
    color: 'amber',
  },
  {
    label: 'Out of Stock',
    value: rows.value.filter((r) => r.stock_status === 'OUT_OF_STOCK').length,
    icon: 'error',
    color: 'red',
  },
])

async function loadData() {
  loading.value = true
  try {
    const companyId = getCompanyId()
    if (!companyId) return
    const { data, error } = await supabase
      .from('v_stock_on_hand')
      .select('*')
      .eq('company_id', companyId)
      .order('item_name')
    if (error) throw error
    rows.value = (data || []).map((r) => ({
      ...r,
      unit_cost: Number(r.avg_cost || 0),
      stock_value: Number(r.qty_on_hand || 0) * Number(r.avg_cost || 0),
    }))
  } catch (e) {
    console.error('[StockOnHand]', e)
  } finally {
    loading.value = false
  }
}

function quickGRN(row) {
  // Navigate to inventory document create with GRN pre-selected
  router.push({
    path: '/inventory/documents/new',
    query: { doc_type: 'GRN', warehouse_id: row.warehouse_id, item_id: row.item_id },
  })
}

function quickTransfer(row) {
  // Navigate to inventory document create with TRANSFER pre-selected
  router.push({
    path: '/inventory/documents/new',
    query: { doc_type: 'TRANSFER', warehouse_id: row.warehouse_id, item_id: row.item_id },
  })
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'stock_on_hand')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'stock_on_hand')
}
</script>
<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
