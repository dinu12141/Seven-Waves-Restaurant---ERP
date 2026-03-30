<template>
  <ReportLayout
    title="Item Availability Report"
    subtitle="Track items marked as available or unavailable by waiters during order acceptance"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Extra filters slot -->
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Availability</label>
        <q-select
          v-model="extraFilters.availability"
          :options="availabilityOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All Items"
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
            <q-td
              key="order_no"
              :props="props"
              class="report-table__td report-table__td--mono text-weight-bold"
            >
              {{ props.row.order_no }}
            </q-td>
            <q-td key="created_at" :props="props" class="report-table__td">
              {{ fmtDateTime(props.row.created_at) }}
            </q-td>
            <q-td key="item_name" :props="props" class="report-table__td text-weight-bold">
              {{ props.row.item_name }}
            </q-td>
            <q-td key="quantity" :props="props" class="report-table__td report-table__td--num">
              {{ props.row.quantity }}
            </q-td>
            <q-td key="unit_price" :props="props" class="report-table__td report-table__td--num">
              {{ fmtLKR(props.row.unit_price) }}
            </q-td>
            <q-td key="availability" :props="props" class="report-table__td">
              <q-badge
                :color="getAvailabilityColor(props.row.availability)"
                :label="getAvailabilityLabel(props.row.availability)"
                class="text-weight-bold"
              />
            </q-td>
            <q-td key="item_status" :props="props" class="report-table__td">
              <span class="report-badge" :class="`report-badge--${props.row.item_status}`">
                {{ props.row.item_status }}
              </span>
            </q-td>
            <q-td key="kitchen" :props="props" class="report-table__td">
              {{ props.row.kitchen || '—' }}
            </q-td>
            <q-td key="table_no" :props="props" class="report-table__td">
              {{ props.row.table_no || '—' }}
            </q-td>
          </q-tr>
        </template>

        <!-- Footer total row -->
        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td report-table__td--num report-table__td--bold">{{
              filteredRows.reduce((s, r) => s + r.quantity, 0)
            }}</q-td>
            <q-td class="report-table__td report-table__td--num report-table__td--bold">{{
              fmtLKR(filteredRows.reduce((s, r) => s + r.unit_price * r.quantity, 0))
            }}</q-td>
            <q-td colspan="4" />
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="inventory_2" size="40px" class="q-mb-sm" />
            <div>No item availability data for this period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtLKR, applyBranchSecurity } from 'src/services/reportService'

const loading = ref(false)
const rows = ref([])
const currentFilters = ref({})

const extraFilters = ref({
  availability: null,
})

const availabilityOptions = [
  { label: 'All Items', value: null },
  { label: '✅ Available', value: 'available' },
  { label: '❌ Unavailable', value: 'unavailable' },
  { label: '⬜ Unchecked', value: 'unchecked' },
]

const filteredRows = computed(() => {
  if (!extraFilters.value.availability) return rows.value
  if (extraFilters.value.availability === 'unchecked') {
    return rows.value.filter((r) => !r.availability)
  }
  return rows.value.filter((r) => r.availability === extraFilters.value.availability)
})

const columns = [
  { name: 'order_no', label: 'Order #', field: 'order_no', align: 'left', sortable: true },
  { name: 'created_at', label: 'Date & Time', field: 'created_at', align: 'left', sortable: true },
  { name: 'item_name', label: 'Item Name', field: 'item_name', align: 'left', sortable: true },
  { name: 'quantity', label: 'Qty', field: 'quantity', align: 'right', sortable: true },
  { name: 'unit_price', label: 'Unit Price', field: 'unit_price', align: 'right', sortable: true },
  {
    name: 'availability',
    label: 'Availability',
    field: 'availability',
    align: 'left',
    sortable: true,
  },
  {
    name: 'item_status',
    label: 'Item Status',
    field: 'item_status',
    align: 'left',
    sortable: true,
  },
  { name: 'kitchen', label: 'Kitchen', field: 'kitchen', align: 'left' },
  { name: 'table_no', label: 'Table', field: 'table_no', align: 'left' },
]

const kpiData = computed(() => {
  const total = rows.value.length
  const available = rows.value.filter((r) => r.availability === 'available').length
  const unavailable = rows.value.filter((r) => r.availability === 'unavailable').length
  const unchecked = rows.value.filter((r) => !r.availability).length
  const lostRevenue = rows.value
    .filter((r) => r.availability === 'unavailable')
    .reduce((s, r) => s + r.unit_price * r.quantity, 0)

  return [
    { label: 'Total Items', value: total, icon: 'inventory_2', color: 'blue' },
    { label: 'Available', value: available, icon: 'check_circle', color: 'green' },
    { label: 'Unavailable', value: unavailable, icon: 'cancel', color: 'red' },
    { label: 'Unchecked', value: unchecked, icon: 'help_outline', color: 'grey' },
    {
      label: 'Lost Revenue',
      value: fmtLKR(lostRevenue),
      icon: 'money_off',
      color: 'red',
      sub: `${unavailable} items`,
    },
  ]
})

function getAvailabilityColor(status) {
  if (status === 'available') return 'green'
  if (status === 'unavailable') return 'red'
  return 'grey'
}

function getAvailabilityLabel(status) {
  if (status === 'available') return 'AVAILABLE'
  if (status === 'unavailable') return 'UNAVAILABLE'
  return 'UNCHECKED'
}

function fmtDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadData(filters = {}) {
  if (filters.dateFrom || filters.dateTo || filters.branch) {
    currentFilters.value = filters
  }
  loading.value = true
  try {
    let query = supabase
      .from('order_items')
      .select(
        `id, quantity, unit_price, status, availability_status, notes,
         menu_items ( name ),
         kitchens ( name ),
         orders!inner ( order_number, created_at, table_number, branch_id, restaurant_tables ( table_number ) )`,
      )
      .order('created_at', { foreignTable: 'orders', ascending: false })

    if (currentFilters.value.dateFrom) {
      query = query.gte('orders.created_at', currentFilters.value.dateFrom + 'T00:00:00')
    }
    if (currentFilters.value.dateTo) {
      query = query.lte('orders.created_at', currentFilters.value.dateTo + 'T23:59:59')
    }
    if (currentFilters.value.branch) {
      query = query.eq('orders.branch_id', currentFilters.value.branch)
    }

    query = applyBranchSecurity(query, 'orders.branch_id')

    const { data, error } = await query.limit(1000)
    if (error) throw error

    rows.value = (data || []).map((r) => ({
      id: r.id,
      order_no: r.orders?.order_number || '—',
      created_at: r.orders?.created_at,
      item_name: r.menu_items?.name || 'Unknown Item',
      quantity: r.quantity,
      unit_price: Number(r.unit_price || 0),
      availability: r.availability_status || null,
      item_status: r.status || 'queued',
      kitchen: r.kitchens?.name || '—',
      table_no: r.orders?.restaurant_tables?.table_number || r.orders?.table_number || '—',
    }))
  } catch (e) {
    console.error('[ItemAvailability]', e)
  } finally {
    loading.value = false
  }
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'item_availability')
}

function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'item_availability')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
