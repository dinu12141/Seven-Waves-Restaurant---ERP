<template>
  <ReportLayout
    title="Kitchen Order Report"
    subtitle="KOT performance — preparation times and completion rates"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="rows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Kitchen filter -->
    <template #extra-filters>
      <div class="report-filter-group" style="min-width: 180px">
        <label class="report-filter-label">Kitchen</label>
        <q-select
          v-model="kitchenFilter"
          :options="kitchenOptions"
          emit-value
          map-options
          dense
          outlined
          clearable
          placeholder="All Kitchens"
          class="report-filter-input"
          @update:model-value="applyKitchenFilter"
        />
      </div>
      <div class="report-filter-group" style="min-width: 160px">
        <label class="report-filter-label">Status</label>
        <q-select
          v-model="statusFilter"
          :options="statusOptions"
          emit-value
          map-options
          dense
          outlined
          clearable
          placeholder="All Statuses"
          class="report-filter-input"
          @update:model-value="applyKitchenFilter"
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
        :rows-per-page-options="[25, 50, 100, 0]"
        :pagination="{ rowsPerPage: 50 }"
        binary-state-sort
      >
        <template #header="props">
          <q-tr :props="props" class="report-table__header-row">
            <q-th
              v-for="col in props.cols"
              :key="col.name"
              :props="props"
              class="report-table__th"
            >{{ col.label }}</q-th>
          </q-tr>
        </template>

        <template #body="props">
          <q-tr :props="props" class="report-table__row">
            <q-td key="kot_number" :props="props" class="report-table__td--mono text-weight-bold">
              KOT-{{ props.row.kot_number }}
            </q-td>
            <q-td key="date" :props="props">{{ fmtDateTime(props.row.date) }}</q-td>
            <q-td key="table_no" :props="props">{{ props.row.table_no || '—' }}</q-td>
            <q-td key="item_count" :props="props" class="report-table__td--num">
              {{ props.row.item_count }}
            </q-td>
            <q-td key="status" :props="props">
              <span class="report-badge" :class="statusBadgeClass(props.row.status)">
                {{ statusLabel(props.row.status) }}
              </span>
            </q-td>
            <q-td key="kitchen" :props="props">{{ props.row.kitchen || '—' }}</q-td>
            <q-td key="prep_time" :props="props" class="report-table__td--num">
              <template v-if="props.row.prep_time > 0">
                <q-badge
                  :color="props.row.prep_time > 15 ? 'red' : props.row.prep_time > 8 ? 'orange' : 'green'"
                >{{ props.row.prep_time }} min</q-badge>
              </template>
              <span v-else class="text-grey-5">—</span>
            </q-td>
            <q-td key="waiter" :props="props">{{ props.row.waiter || '—' }}</q-td>
          </q-tr>
        </template>

        <template #no-data>
          <div class="report-empty">
            <q-icon name="soup_kitchen" size="40px" class="q-mb-sm" />
            <div>No KOT data for this period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'
import { fmtDateTime } from 'src/services/reportService'

const authStore = useAuthStore()
const loading = ref(false)
const rows = ref([])
const kitchenFilter = ref(null)
const statusFilter = ref(null)
const kitchenOptions = ref([{ label: 'All Kitchens', value: null }])

const statusOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Created', value: 'created' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Done', value: 'done' },
  { label: 'Cancelled', value: 'cancelled' },
]

const columns = [
  { name: 'kot_number', label: 'KOT #', field: 'kot_number', align: 'left', sortable: true },
  { name: 'date', label: 'Date & Time', field: 'date', align: 'left', sortable: true },
  { name: 'table_no', label: 'Table', field: 'table_no', align: 'left' },
  { name: 'item_count', label: 'Items', field: 'item_count', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
  { name: 'kitchen', label: 'Kitchen', field: 'kitchen', align: 'left' },
  { name: 'prep_time', label: 'Prep Time', field: 'prep_time', align: 'right', sortable: true },
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left' },
]

function statusLabel(s) {
  const map = { created: 'Created', preparing: 'Preparing', ready: 'Ready', done: 'Done', cancelled: 'Cancelled' }
  return map[s] || s || '—'
}

function statusBadgeClass(s) {
  const map = {
    created: 'report-badge--pending',
    preparing: 'report-badge--card',
    ready: 'report-badge--paid',
    done: 'report-badge--grn',
    cancelled: 'report-badge--cancelled',
  }
  return map[s] || ''
}

// Client-side filters
const filteredRows = computed(() => {
  let r = rows.value
  if (kitchenFilter.value) r = r.filter((x) => x.kitchen_id === kitchenFilter.value)
  if (statusFilter.value) r = r.filter((x) => x.status === statusFilter.value)
  return r
})

const kpiData = computed(() => {
  const r = filteredRows.value
  const withPrep = r.filter((x) => x.prep_time > 0)
  const avgPrep = withPrep.length > 0
    ? withPrep.reduce((s, x) => s + x.prep_time, 0) / withPrep.length
    : 0
  return [
    { label: 'Total KOTs', value: r.length.toString(), icon: 'receipt', color: 'blue' },
    {
      label: 'Avg Prep Time',
      value: `${avgPrep.toFixed(1)} min`,
      icon: 'schedule',
      color: avgPrep > 12 ? 'red' : 'green',
    },
    {
      label: 'Completed',
      value: r.filter((x) => ['done', 'ready'].includes(x.status)).length.toString(),
      icon: 'check_circle',
      color: 'green',
    },
    {
      label: 'Slow Orders (>15m)',
      value: r.filter((x) => x.prep_time > 15).length.toString(),
      icon: 'warning',
      color: 'red',
    },
  ]
})

async function loadData(filters = {}) {
  loading.value = true
  try {
    const branchId = authStore.currentBranch?.id

    // kot_tickets is the correct table (60 records confirmed)
    // kot_dispatches links back via kot_id FK for item count
    let query = supabase
      .from('kot_tickets')
      .select(
        `id, kot_number, status, created_at, printed_at, kitchen_id, batch_number,
         kitchens ( name ),
         orders ( table_number, waiter_id, branch_id,
           profiles ( full_name )
         ),
         kot_dispatches ( id )`
      )
      .order('created_at', { ascending: false })

    // Date filters
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

    // Branch security
    if (filters.branch) {
      query = query.eq('orders.branch_id', filters.branch)
    } else if (branchId && !authStore.isAdmin) {
      // Can't filter on joined col via Supabase REST easily — filter client-side
    }

    const { data, error } = await query.limit(1000)
    if (error) throw error

    // Build kitchen options for dropdown
    const kitchenMap = {}
    const processedRows = (data || []).map((r) => {
      const order = Array.isArray(r.orders) ? r.orders[0] : r.orders
      const kitchen = Array.isArray(r.kitchens) ? r.kitchens[0] : r.kitchens
      const profile = order?.profiles
        ? (Array.isArray(order.profiles) ? order.profiles[0] : order.profiles)
        : null

      // Item count from kot_dispatches
      const itemCount = Array.isArray(r.kot_dispatches) ? r.kot_dispatches.length : 0

      // Prep time: from created_at to printed_at (KOT print = ready)
      const created = new Date(r.created_at)
      const printed = r.printed_at ? new Date(r.printed_at) : null
      const prepMin = printed ? Math.round((printed - created) / 60000) : 0

      if (r.kitchen_id && kitchen?.name) {
        kitchenMap[r.kitchen_id] = kitchen.name
      }

      // Branch filter client-side for non-admin
      if (!authStore.isAdmin && branchId && order?.branch_id && order.branch_id !== branchId) {
        return null
      }

      return {
        id: r.id,
        kot_number: r.kot_number,
        date: r.created_at,
        table_no: order?.table_number ? `Table ${order.table_number}` : '—',
        item_count: itemCount,
        status: r.status || 'created',
        kitchen: kitchen?.name || '—',
        kitchen_id: r.kitchen_id,
        prep_time: prepMin,
        waiter: profile?.full_name || '—',
      }
    }).filter(Boolean)

    rows.value = processedRows

    // Update kitchen dropdown
    kitchenOptions.value = [
      { label: 'All Kitchens', value: null },
      ...Object.entries(kitchenMap).map(([id, name]) => ({ label: name, value: id })),
    ]
  } catch (e) {
    console.error('[KitchenOrders]', e)
  } finally {
    loading.value = false
  }
}

function applyKitchenFilter() {
  // Reactive — filteredRows computed auto-updates
}

function exportCSV() {
  exportTableToCSV(columns, filteredRows.value, 'kitchen_orders')
}
function exportExcel() {
  exportTableToExcel(columns, filteredRows.value, 'kitchen_orders')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';
</style>
