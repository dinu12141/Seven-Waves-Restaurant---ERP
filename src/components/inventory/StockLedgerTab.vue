<template>
  <div class="q-pa-md">
    <!-- Filters -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <q-input
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="search"
          placeholder="Item, code or doc #..."
          clearable
          debounce="400"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <q-select
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="warehouseFilter"
          :options="warehouseOptions"
          label="Warehouse"
          emit-value
          map-options
          clearable
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-2">
        <q-select
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="docTypeFilter"
          :options="docTypeOptions"
          label="Doc Type"
          emit-value
          map-options
          clearable
        />
      </div>
      <div class="col-12 col-sm-6 col-md-4 col-lg-1">
        <q-select
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="directionFilter"
          :options="directionOptions"
          label="Direction"
          emit-value
          map-options
          clearable
        />
      </div>
      <div class="col-12 col-sm-6 col-md-6 col-lg-2">
        <q-input
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="dateFrom"
          type="date"
          label="From"
          clearable
        />
      </div>
      <div class="col-12 col-sm-6 col-md-6 col-lg-2">
        <q-input
          :dark="$q.dark.isActive"
          outlined
          dense
          v-model="dateTo"
          type="date"
          label="To"
          clearable
        />
      </div>
      <div class="col-12 col-sm-12 col-md-12 col-lg-1 row justify-end items-center q-gutter-xs">
        <q-btn
          v-if="hasActiveFilters"
          flat
          round
          dense
          color="grey-6"
          icon="filter_alt_off"
          @click="resetFilters"
        >
          <q-tooltip>Reset filters</q-tooltip>
        </q-btn>
        <q-btn outline color="grey-5" icon="refresh" round dense @click="reload">
          <q-tooltip>Refresh</q-tooltip>
        </q-btn>
      </div>
    </div>

    <q-banner v-if="error" dense rounded class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error_outline" /></template>
      Could not load the stock ledger: {{ error }}
      <template #action>
        <q-btn flat dense no-caps label="Retry" @click="reload" />
      </template>
    </q-banner>
    <q-banner v-else-if="truncated" dense rounded class="bg-warning text-dark q-mb-md">
      <template #avatar><q-icon name="info" /></template>
      Showing the latest {{ entries.length }} movements only — narrow the date range,
      warehouse or search to see older entries.
    </q-banner>

    <!-- Ledger Table (Read Only) -->
    <q-card
      :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'"
      flat
      bordered
    >
      <q-card-section class="q-pb-sm">
        <div class="text-h6">
          <q-icon name="menu_book" class="q-mr-sm" />Stock Ledger — Audit Trail
        </div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <q-table
          :rows="entries"
          :columns="columns"
          row-key="id"
          :dark="$q.dark.isActive"
          flat
          bordered
          dense
          class="bg-transparent"
          table-header-class="text-grey-5 text-uppercase"
          :loading="loading"
          :rows-per-page-options="[15, 30, 50, 100]"
        >
          <!-- Direction badge -->
          <template #body-cell-direction="props">
            <q-td :props="props">
              <q-badge :color="props.value === 'IN' ? 'green' : 'red'" class="text-weight-bold">
                <q-icon
                  :name="props.value === 'IN' ? 'arrow_downward' : 'arrow_upward'"
                  size="14px"
                  class="q-mr-xs"
                />
                {{ props.value }}
              </q-badge>
            </q-td>
          </template>

          <!-- Doc Type -->
          <template #body-cell-doc_type="props">
            <q-td :props="props">
              <q-chip dense size="sm" :color="getDocColor(props.value)" text-color="white">
                {{ props.value }}
              </q-chip>
            </q-td>
          </template>

          <!-- Costs -->
          <template #body-cell-unit_cost="props">
            <q-td :props="props">{{ formatCurrency(props.value) }}</q-td>
          </template>

          <template #body-cell-total_cost="props">
            <q-td :props="props">
              <span class="text-weight-bold">{{ formatCurrency(props.value) }}</span>
            </q-td>
          </template>

          <!-- Posted At -->
          <template #body-cell-posted_at="props">
            <q-td :props="props">
              <span class="text-caption">{{ formatDateTime(props.value) }}</span>
            </q-td>
          </template>

          <!-- No data -->
          <template #no-data>
            <div class="full-width row flex-center text-grey-5 q-pa-lg">
              <q-icon size="2em" name="menu_book" class="q-mr-sm" />
              <span>No ledger entries found</span>
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useStockLedger, useWarehouseList } from 'src/services/inventoryService'

const { entries, loading, error, truncated, fetchLedger } = useStockLedger()
const { warehouses, listWarehouses } = useWarehouseList()

const search = ref('')
const docTypeFilter = ref('')
const directionFilter = ref('')
const warehouseFilter = ref(null)
const dateFrom = ref('')
const dateTo = ref('')

const warehouseOptions = computed(() =>
  warehouses.value.map((w) => ({ label: w.name, value: w.id })),
)

const hasActiveFilters = computed(
  () =>
    !!(
      search.value ||
      docTypeFilter.value ||
      directionFilter.value ||
      warehouseFilter.value ||
      dateFrom.value ||
      dateTo.value
    ),
)

function resetFilters() {
  search.value = ''
  docTypeFilter.value = ''
  directionFilter.value = ''
  warehouseFilter.value = null
  dateFrom.value = ''
  dateTo.value = ''
}

const docTypeOptions = [
  { label: 'All Types', value: '' },
  { label: 'GRN', value: 'GRN' },
  { label: 'GIN', value: 'GIN' },
  { label: 'Transfer', value: 'TRANSFER' },
  { label: 'Adjustment', value: 'ADJUSTMENT' },
  { label: 'Stock Count', value: 'STOCK_COUNT' },
  { label: 'BOM Deduct', value: 'BOM_DEDUCT' },
  { label: 'Opening Stock', value: 'OPENING' },
]

const directionOptions = [
  { label: 'All', value: '' },
  { label: 'IN', value: 'IN' },
  { label: 'OUT', value: 'OUT' },
]

function buildFilters() {
  return {
    docType: docTypeFilter.value || undefined,
    direction: directionFilter.value || undefined,
    warehouseId: warehouseFilter.value || undefined,
    dateFrom: dateFrom.value || undefined,
    dateTo: dateTo.value || undefined,
    // Server-side (item name/code, doc #) so it also finds movements older
    // than the row limit; the input is debounced.
    search: search.value || undefined,
  }
}

async function reload() {
  await fetchLedger(buildFilters())
}

onMounted(() => {
  reload()
  listWarehouses()
})

watch([docTypeFilter, directionFilter, warehouseFilter, dateFrom, dateTo, search], () => reload())

const columns = [
  {
    name: 'posted_at',
    label: 'Date/Time',
    field: 'posted_at',
    align: 'left',
    sortable: true,
    style: 'width: 140px',
  },
  { name: 'doc_type', label: 'Type', field: 'doc_type', align: 'center', sortable: true },
  { name: 'doc_number', label: 'Doc #', field: 'doc_number', align: 'left', sortable: true },
  { name: 'warehouse_name', label: 'Warehouse', field: 'warehouse_name', align: 'left' },
  { name: 'item_code', label: 'Code', field: 'item_code', align: 'left' },
  { name: 'item_name', label: 'Item', field: 'item_name', align: 'left' },
  { name: 'direction', label: 'Dir', field: 'direction', align: 'center', sortable: true },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'right', sortable: true },
  { name: 'uom_code', label: 'UOM', field: 'uom_code', align: 'center' },
  { name: 'unit_cost', label: 'Unit Cost', field: 'unit_cost', align: 'right' },
  { name: 'total_cost', label: 'Total Cost', field: 'total_cost', align: 'right', sortable: true },
  { name: 'posted_by_name', label: 'By', field: 'posted_by_name', align: 'left' },
]

function getDocColor(type) {
  const map = {
    GRN: 'green-9',
    GIN: 'red-9',
    TRANSFER: 'blue-9',
    ADJUSTMENT: 'orange-9',
    STOCK_COUNT: 'purple-9',
    BOM_DEDUCT: 'cyan-9',
  }
  return map[type] || 'grey-8'
}

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
}

function formatDateTime(val) {
  if (!val) return '-'
  const d = new Date(val)
  return (
    d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}
const exportTitle = computed(() => {
  return docTypeFilter.value
    ? `${docTypeFilter.value} Ledger Audit Report`
    : 'Inventory Stock Ledger Audit Trail'
})

defineExpose({
  columns,
  rows: entries,
  exportTitle,
})
</script>
