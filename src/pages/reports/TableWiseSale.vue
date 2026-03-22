<template>
  <ReportLayout
    title="Table Wise Sale"
    subtitle="Table Wise Sales — Revenue breakdown by table with waiter detail"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <!-- SAP-style Report Header -->
      <div class="tws-header">
        <div class="tws-header__center">
          <div class="tws-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
          <div class="tws-header__title">Table Wise Sales</div>
        </div>
        <div class="tws-header__meta">
          <div>Location: <strong>{{ branchName }}</strong></div>
          <div>Date From: <strong>{{ reportDateRange }}</strong></div>
        </div>
      </div>

      <!-- ── Data Table ───────────────────────────── -->
      <q-table
        :rows="displayRows"
        :columns="columns"
        row-key="__rowKey"
        flat dense
        class="tws-table"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        separator="none"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="tws-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="tws-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <!-- Date header row -->
          <q-tr v-if="props.row.__type === 'date-header'" class="tws-table__date-header">
            <q-td class="tws-table__date-label">{{ props.row.date_label }}</q-td>
            <q-td class="tws-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="tws-table__td--num text-weight-bolder">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>

          <!-- Table group header row -->
          <q-tr v-else-if="props.row.__type === 'table-header'" class="tws-table__table-header">
            <q-td class="tws-table__table-name">Table No : {{ props.row.table_no }}</q-td>
            <q-td class="tws-table__td--num text-weight-bold">{{ props.row.no_customer }}</q-td>
            <q-td class="tws-table__td--num text-weight-bold">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>

          <!-- Grand total row -->
          <q-tr v-else-if="props.row.__type === 'grand-total'" class="tws-table__grand-total">
            <q-td class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td class="tws-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="tws-table__td--num text-weight-bolder text-green">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>

          <!-- Normal waiter row -->
          <q-tr v-else :props="props" class="tws-table__row">
            <q-td key="waiter" :props="props" class="tws-table__waiter-cell">{{ props.row.waiter }}</q-td>
            <q-td key="no_customer" :props="props" class="tws-table__td--num">{{ props.row.no_customer }}</q-td>
            <q-td key="amount" :props="props" class="tws-table__td--num">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>
        </template>

        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing>
            <q-spinner-gears size="36px" color="primary" />
          </q-inner-loading>
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="tws-empty">
            <q-icon name="table_restaurant" size="40px" class="q-mb-sm" />
            <div>No table sales data for selected period</div>
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

const authStore = useAuthStore()
const loading = ref(false)
const rawOrders = ref([])
const currentFilters = ref({})

// ── Column Definitions (SAP B1 format) ────────────────────
const columns = [
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left' },
  { name: 'no_customer', label: 'No.Customer', field: 'no_customer', align: 'right', style: 'width:120px', sortable: true },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', style: 'width:150px', sortable: true },
]

// ── Helpers ────────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES RESTAURANT')
const reportDateRange = computed(() => {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) return `${fmtDate(f.dateFrom)}  To: ${fmtDate(f.dateTo)}`
  return fmtDate(new Date().toISOString().slice(0, 10))
})

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtN(val) {
  const n = Number(val || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Process raw data → grouped display rows ───────────────
// Group by date → table → waiter rows (matching SAP B1 image)
const displayRows = computed(() => {
  if (rawOrders.value.length === 0) return []

  // Step 1: Group by bill date
  const byDate = {}
  for (const order of rawOrders.value) {
    const d = new Date(order.created_at)
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!byDate[dateKey]) byDate[dateKey] = []
    byDate[dateKey].push(order)
  }

  const result = []
  let grandCustomers = 0, grandAmount = 0
  const sortedDates = Object.keys(byDate).sort()

  for (const dateKey of sortedDates) {
    const dateOrders = byDate[dateKey]

    // Calculate date totals first
    const dateCustomers = dateOrders.length
    const dateAmount = dateOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0)

    // Date header with totals
    result.push({
      __type: 'date-header',
      __rowKey: `dh-${dateKey}`,
      date_label: fmtDate(dateKey),
      no_customer: dateCustomers,
      amount: dateAmount,
    })

    // Step 2: Group by table within this date
    const byTable = {}
    for (const order of dateOrders) {
      const tableNum = order.restaurant_tables?.table_number || 0
      const tableKey = tableNum || 'walk-in'
      if (!byTable[tableKey]) byTable[tableKey] = { tableNum, orders: [] }
      byTable[tableKey].orders.push(order)
    }

    const sortedTables = Object.entries(byTable).sort((a, b) => {
      const aNum = Number(a[1].tableNum) || 999
      const bNum = Number(b[1].tableNum) || 999
      return aNum - bNum
    })

    for (const [tableKey, tableData] of sortedTables) {
      const tableCustomers = tableData.orders.length
      const tableAmount = tableData.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)

      // Table header
      result.push({
        __type: 'table-header',
        __rowKey: `th-${dateKey}-${tableKey}`,
        table_no: tableData.tableNum || 'Walk-in',
        no_customer: tableCustomers,
        amount: tableAmount,
      })

      // Step 3: Group by waiter within this table
      const byWaiter = {}
      for (const order of tableData.orders) {
        const waiterId = order.waiter_id || 'unassigned'
        const waiterName = order.waiter?.full_name || 'Unassigned'
        if (!byWaiter[waiterId]) byWaiter[waiterId] = { name: waiterName, customers: 0, amount: 0 }
        byWaiter[waiterId].customers += 1
        byWaiter[waiterId].amount += Number(order.total_amount || 0)
      }

      const sortedWaiters = Object.entries(byWaiter).sort((a, b) => a[1].name.localeCompare(b[1].name))

      for (const [, waiterInfo] of sortedWaiters) {
        result.push({
          __type: 'item',
          __rowKey: `row-${dateKey}-${tableKey}-${waiterInfo.name}`,
          waiter: waiterInfo.name,
          no_customer: waiterInfo.customers,
          amount: waiterInfo.amount,
        })
      }
    }

    grandCustomers += dateCustomers
    grandAmount += dateAmount
  }

  // Grand total
  result.push({
    __type: 'grand-total',
    __rowKey: 'grand-total',
    no_customer: grandCustomers,
    amount: grandAmount,
  })

  return result
})

// ── KPIs ──────────────────────────────────────────────────
const kpiData = computed(() => {
  const gt = displayRows.value.find(r => r.__type === 'grand-total')
  if (!gt) return []
  const uniqueTables = new Set(rawOrders.value.map(o => o.restaurant_tables?.table_number).filter(Boolean)).size
  const uniqueWaiters = new Set(rawOrders.value.map(o => o.waiter_id).filter(Boolean)).size
  return [
    { label: 'Active Tables', value: uniqueTables, icon: 'table_restaurant', color: 'blue' },
    { label: 'Total Orders', value: gt.no_customer, icon: 'receipt_long', color: 'cyan' },
    { label: 'Total Revenue', value: `LKR ${fmtN(gt.amount)}`, icon: 'payments', color: 'green' },
    { label: 'Active Waiters', value: uniqueWaiters, icon: 'people', color: 'purple' },
  ]
})

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  try {
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        status,
        total_amount,
        created_at,
        branch_id,
        waiter_id,
        table_id,
        waiter:profiles!orders_waiter_id_fkey ( full_name ),
        restaurant_tables ( table_number, section )
      `)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: true })

    // Date filters
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')

    // Branch filter
    if (filters.branch) {
      query = query.eq('branch_id', filters.branch)
    } else if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query.limit(5000)
    if (error) throw error

    rawOrders.value = data || []
  } catch (err) {
    console.error('[TableWiseSale] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = displayRows.value.filter(r => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'table_wise_sales')
}
function exportExcel() {
  const exportRows = displayRows.value.filter(r => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'table_wise_sales')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* ── SAP Style Header ──────────────────────────────────────── */
.tws-header {
  padding: 14px 16px;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1));
  background: rgba(255, 255, 255, 0.02);

  &__center {
    text-align: center;
    margin-bottom: 10px;
  }
  &__company {
    font-size: 15px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    letter-spacing: -0.2px;
  }
  &__title {
    font-size: 12px;
    font-weight: 700;
    color: var(--erp-text-secondary, #94a3b8);
    margin-top: 2px;
    text-decoration: underline;
  }
  &__meta {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

/* ── Table ─────────────────────────────────────────────────── */
.tws-table {
  background: transparent !important;
  font-size: 11px !important;

  :deep(.q-table) { font-size: 11px !important; }
}

.tws-table__header { background: rgba(255, 255, 255, 0.03) !important; }

.tws-table__th {
  font-size: 10px !important;
  font-weight: 700 !important;
  color: var(--erp-text-secondary, #94a3b8) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
  padding: 6px 10px !important;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08)) !important;
  white-space: nowrap !important;
}

.tws-table__row {
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.03)) !important;

  td, .q-td {
    font-size: 11px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
    padding: 3px 10px 3px 40px !important;
    height: 26px !important;
  }
}

.tws-table__td--num {
  text-align: right !important;
  font-variant-numeric: tabular-nums !important;
  font-family: 'SF Mono', 'Consolas', monospace !important;
  padding-left: 10px !important;
}

.tws-table__waiter-cell {
  padding-left: 50px !important;
}

/* ── Date Header ───────────────────────────────────────────── */
.tws-table__date-header {
  background: rgba(245, 158, 11, 0.08) !important;
  border-top: 2px solid rgba(245, 158, 11, 0.2) !important;
  border-bottom: 1px solid rgba(245, 158, 11, 0.15) !important;

  td, .q-td {
    padding: 6px 10px !important;
    height: 30px !important;
  }
}

.tws-table__date-label {
  font-size: 12px !important;
  font-weight: 800 !important;
  color: #fbbf24 !important;
  letter-spacing: -0.2px !important;
}

/* ── Table Group Header ────────────────────────────────────── */
.tws-table__table-header {
  background: rgba(37, 99, 235, 0.05) !important;
  border-top: 1px solid rgba(37, 99, 235, 0.1) !important;

  td, .q-td {
    padding: 4px 10px !important;
    height: 28px !important;
  }
}

.tws-table__table-name {
  font-size: 11px !important;
  font-weight: 700 !important;
  color: var(--erp-primary, #2563eb) !important;
  padding-left: 20px !important;
}

/* ── Grand Total ───────────────────────────────────────────── */
.tws-table__grand-total {
  background: rgba(255, 255, 255, 0.06) !important;
  border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.15)) !important;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.15)) !important;

  td, .q-td {
    font-size: 12px !important;
    padding: 8px 10px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
  }
}

/* ── Empty State ───────────────────────────────────────────── */
.tws-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

/* ── Print Overrides ───────────────────────────────────────── */
@media print {
  .tws-header {
    background: none !important;
    border-bottom: 2pt solid #1a1a2e !important;
    padding: 6pt 0 !important;
  }
  .tws-header__company {
    font-size: 14pt !important;
    color: #1a1a2e !important;
  }
  .tws-header__title {
    font-size: 10pt !important;
    color: #333 !important;
  }
  .tws-header__meta {
    color: #555 !important;
    font-size: 8pt !important;
  }
  .tws-table__date-header {
    background: #f5f0e0 !important;
    border-top: 1.5pt solid #333 !important;
  }
  .tws-table__date-label {
    color: #333 !important;
    font-size: 9pt !important;
  }
  .tws-table__table-header {
    background: #eef2f7 !important;
  }
  .tws-table__table-name {
    color: #1a1a2e !important;
    font-size: 8pt !important;
  }
  .tws-table__grand-total td {
    font-size: 9pt !important;
    color: #1a1a2e !important;
    background: #e8edf3 !important;
    border-top: 1.5pt solid #1a1a2e !important;
    border-bottom: 1.5pt solid #1a1a2e !important;
  }
  .tws-table__row td {
    font-size: 7pt !important;
    padding: 2pt 6pt !important;
    height: auto !important;
    color: #222 !important;
  }
  .tws-table__th {
    font-size: 7pt !important;
    padding: 3pt 6pt !important;
    color: #fff !important;
    background: #1a1a2e !important;
  }
}
</style>
