<template>
  <div class="q-pa-md">
    <!-- Filters -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-input
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="search"
        placeholder="Search items..."
        clearable
        style="min-width: 220px"
      >
        <template #prepend><q-icon name="search" /></template>
      </q-input>

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
        style="min-width: 200px"
      />

      <q-select
        :dark="$q.dark.isActive"
        outlined
        dense
        v-model="statusFilter"
        :options="statusOptions"
        label="Stock Status"
        emit-value
        map-options
        clearable
        style="min-width: 180px"
      />

      <q-space />

      <q-btn
        v-if="search || warehouseFilter || statusFilter"
        flat
        dense
        no-caps
        color="grey-6"
        icon="filter_alt_off"
        label="Reset"
        @click="resetFilters"
      />
      <q-btn outline color="grey-5" icon="refresh" round dense @click="fetchStockOnHand">
        <q-tooltip>Refresh Stock</q-tooltip>
      </q-btn>
    </div>

    <q-banner v-if="error" dense rounded class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error_outline" /></template>
      Could not load stock levels: {{ error }}
      <template #action>
        <q-btn flat dense no-caps label="Retry" @click="fetchStockOnHand" />
      </template>
    </q-banner>

    <!-- Stock Table -->
    <q-card
      class="stock-table-card"
      flat
      bordered
    >
      <q-card-section>
        <q-table
          :rows="filteredStock"
          :columns="columns"
          :row-key="stockRowKey"
          :dark="$q.dark.isActive"
          flat
          dense
          class="bg-transparent"
          :loading="loading"
          :filter="search"
          :rows-per-page-options="[12, 24, 48]"
        >
          <!-- Warehouse Cell -->
          <template #body-cell-warehouse_name="props">
            <q-td :props="props">
              <div class="row items-center no-wrap">
                <q-icon
                  :name="getWhIcon(props.row.warehouse_type)"
                  :color="getWhColor(props.row.warehouse_type)"
                  size="18px"
                  class="q-mr-sm"
                />
                {{ props.value }}
              </div>
            </q-td>
          </template>

          <!-- Qty Cell -->
          <template #body-cell-qty_on_hand="props">
            <q-td :props="props" class="text-right">
              <span class="stock-qty" :class="getQtyColor(props.row)">
                {{ props.value.toLocaleString() }}
              </span>
              <span class="stock-qty__uom">{{ props.row.uom_code }}</span>
            </q-td>
          </template>

          <!-- Status Cell -->
          <template #body-cell-stock_status="props">
            <q-td :props="props">
              <span class="stock-status" :class="`stock-status--${props.value}`">
                <span class="stock-status__dot" />
                {{ props.value?.replaceAll('_', ' ') }}
              </span>
            </q-td>
          </template>

          <!-- Value Cell -->
          <template #body-cell-total_value="props">
            <q-td :props="props" class="text-right">
              <span class="text-weight-medium">{{ formatCurrency(props.value) }}</span>
            </q-td>
          </template>

          <!-- No data -->
          <template #no-data>
            <div class="full-width row flex-center text-grey-5 q-pa-xl">
              <q-icon size="3em" name="inventory_2" class="q-mr-md" />
              <div>
                <div class="text-h6">No stock records found</div>
                <div class="text-caption">Try adjusting your filters or refreshing the data</div>
              </div>
            </div>
          </template>
        </q-table>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useStockDashboard, useWarehouseList } from 'src/services/inventoryService'

const { stockOnHand, loading, error, fetchStockOnHand } = useStockDashboard()

// v_stock_on_hand has no `id` column — key on item × warehouse.
const stockRowKey = (r) => `${r.warehouse_id}:${r.item_id}`

function resetFilters() {
  search.value = ''
  warehouseFilter.value = null
  statusFilter.value = null
}
const { warehouses, listWarehouses } = useWarehouseList()

const search = ref('')
const warehouseFilter = ref(null)
const statusFilter = ref(null)

onMounted(() => {
  fetchStockOnHand()
  listWarehouses()
})

const warehouseOptions = computed(() => [
  { label: 'All Warehouses', value: null },
  ...warehouses.value.map((w) => ({ label: w.name, value: w.id })),
])

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Normal', value: 'normal' },
  { label: 'Low Stock', value: 'low_stock' },
  { label: 'Out of Stock', value: 'out_of_stock' },
  { label: 'Overstock', value: 'overstock' },
]

const filteredStock = computed(() => {
  let result = stockOnHand.value

  if (warehouseFilter.value) {
    result = result.filter((s) => s.warehouse_id === warehouseFilter.value)
  }

  if (statusFilter.value) {
    result = result.filter((s) => s.stock_status === statusFilter.value)
  }

  return result
})

const columns = [
  {
    name: 'item_name',
    label: 'Item Name',
    field: 'item_name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'item_code',
    label: 'Code',
    field: 'item_code',
    align: 'left',
    sortable: true,
  },
  {
    name: 'warehouse_name',
    label: 'Warehouse',
    field: 'warehouse_name',
    align: 'left',
    sortable: true,
  },
  {
    name: 'qty_on_hand',
    label: 'On Hand',
    field: 'qty_on_hand',
    align: 'right',
    sortable: true,
  },
  {
    name: 'stock_status',
    label: 'Status',
    field: 'stock_status',
    align: 'center',
    sortable: true,
  },
  {
    name: 'total_value',
    label: 'Stock Value',
    field: 'total_value',
    align: 'right',
    sortable: true,
  },
]

function getWhIcon(type) {
  const map = {
    main_store: 'warehouse',
    kitchen: 'soup_kitchen',
    bar: 'local_bar',
    freezer: 'ac_unit',
    dry_store: 'inventory_2',
  }
  return map[type] || 'store'
}

function getWhColor(type) {
  const map = {
    main_store: 'teal',
    kitchen: 'orange',
    bar: 'purple',
    freezer: 'cyan',
    dry_store: 'brown',
  }
  return map[type] || 'grey'
}

function getQtyColor(row) {
  if (row.qty_on_hand <= 0) return 'text-red'
  if (row.stock_status === 'low_stock') return 'text-orange'
  return 'text-primary'
}

function formatCurrency(val) {
  return 'LKR ' + Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
}
defineExpose({
  columns,
  rows: filteredStock,
})
</script>

<style scoped lang="scss">
// ── Table card ────────────────────────────────────────────────
.stock-table-card {
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  color: var(--erp-text-primary);
}

// ── ON HAND qty cell ──────────────────────────────────────────
// Professional: same visual weight as other data columns, but
// monospaced and slightly bold for numeric clarity
.stock-qty {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.stock-qty__uom {
  font-size: 10px;
  font-weight: 400;
  color: var(--erp-text-muted);
  margin-left: 3px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

// ── STATUS inline chip ────────────────────────────────────────
// Replaces the large q-badge pill with a compact dot + text format
.stock-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  // Normal / OK
  &--normal, &--OK {
    color: var(--erp-success);
    .stock-status__dot { background: var(--erp-success); }
  }
  // Low Stock
  &--low_stock, &--LOW_STOCK {
    color: var(--erp-warning);
    .stock-status__dot { background: var(--erp-warning); }
  }
  // Out of Stock
  &--out_of_stock, &--OUT_OF_STOCK {
    color: var(--erp-danger);
    .stock-status__dot { background: var(--erp-danger); }
  }
  // Overstock
  &--overstock, &--OVER_STOCK {
    color: var(--erp-primary);
    .stock-status__dot { background: var(--erp-primary); }
  }
}
</style>
