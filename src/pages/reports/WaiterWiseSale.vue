<template>
  <ReportLayout
    title="Waiter Wise Sale"
    subtitle="Waiter Wise Sales — Performance and table-level breakdown per waiter"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <!-- SAP-style Report Header -->
      <div class="wws-header">
        <div class="wws-header__left">
          <div class="wws-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
          <div class="wws-header__title">Waiter Wise Sales</div>
          <div class="wws-header__meta">
            <div>Location : <strong>{{ branchName }}</strong></div>
            <div>Date From : <strong>{{ reportDateRange }}</strong></div>
          </div>
        </div>
        <div class="wws-header__right">
          <div class="wws-header__page">Page 1</div>
          <div class="wws-header__date">{{ todayFormatted }}</div>
        </div>
      </div>

      <!-- ── Data Table ───────────────────────────── -->
      <q-table
        :rows="displayRows"
        :columns="columns"
        row-key="__rowKey"
        flat dense
        class="wws-table"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        separator="none"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="wws-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="wws-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <!-- Bill Date header row -->
          <q-tr v-if="props.row.__type === 'date-header'" class="wws-table__date-header">
            <q-td :colspan="columns.length" class="wws-table__date-name">
              <q-icon name="event" size="14px" class="q-mr-xs" />
              Bill Date : {{ props.row.date_label }}
            </q-td>
          </q-tr>

          <!-- Waiter header row -->
          <q-tr v-else-if="props.row.__type === 'waiter-header'" class="wws-table__waiter-header">
            <q-td :colspan="columns.length" class="wws-table__waiter-name">
              <q-icon name="person" size="14px" class="q-mr-xs" />
              Waiter : {{ props.row.waiter_label }}
            </q-td>
          </q-tr>

          <!-- Waiter subtotal row -->
          <q-tr v-else-if="props.row.__type === 'waiter-total'" class="wws-table__waiter-total">
            <q-td />
            <q-td class="wws-table__td--num text-weight-bold">{{ props.row.no_customer }}</q-td>
            <q-td class="wws-table__td--num text-weight-bold text-green">{{ fmtN(props.row.amount) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bold">{{ fmtN(props.row.avg_w_sales) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bold">{{ fmtN(props.row.avg_table_sal) }}</q-td>
          </q-tr>

          <!-- Date total row -->
          <q-tr v-else-if="props.row.__type === 'date-total'" class="wws-table__date-total">
            <q-td class="text-weight-bolder">Bill Date Total</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder text-green">{{ fmtN(props.row.amount) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ fmtN(props.row.avg_w_sales) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ fmtN(props.row.avg_table_sal) }}</q-td>
          </q-tr>

          <!-- Grand total row -->
          <q-tr v-else-if="props.row.__type === 'grand-total'" class="wws-table__grand-total">
            <q-td class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder text-green">{{ fmtN(props.row.amount) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ fmtN(props.row.avg_w_sales) }}</q-td>
            <q-td class="wws-table__td--num text-weight-bolder">{{ fmtN(props.row.avg_table_sal) }}</q-td>
          </q-tr>

          <!-- Normal table row -->
          <q-tr v-else :props="props" class="wws-table__row">
            <q-td key="table_no" :props="props" class="wws-table__td--num">{{ props.row.table_no }}</q-td>
            <q-td key="no_customer" :props="props" class="wws-table__td--num">{{ props.row.no_customer }}</q-td>
            <q-td key="amount" :props="props" class="wws-table__td--num">{{ fmtN(props.row.amount) }}</q-td>
            <q-td key="avg_w_sales" :props="props" class="wws-table__td--num">{{ fmtN(props.row.avg_w_sales) }}</q-td>
            <q-td key="avg_table_sal" :props="props" class="wws-table__td--num">{{ fmtN(props.row.avg_table_sal) }}</q-td>
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
          <div class="wws-empty">
            <q-icon name="person_off" size="40px" class="q-mb-sm" />
            <div>No waiter sales data for selected period</div>
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
  { name: 'table_no', label: 'Table No', field: 'table_no', align: 'right', style: 'width:80px', sortable: true },
  { name: 'no_customer', label: 'No.Customer', field: 'no_customer', align: 'right', style: 'width:90px', sortable: true },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', style: 'width:120px', sortable: true },
  { name: 'avg_w_sales', label: 'Avg W Sales', field: 'avg_w_sales', align: 'right', style: 'width:100px' },
  { name: 'avg_table_sal', label: 'Avg Tabel Sal', field: 'avg_table_sal', align: 'right', style: 'width:100px' },
]

// ── Helpers ────────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES RESTAURANT')
const todayFormatted = computed(() =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
)
const reportDateRange = computed(() => {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) return `${fmtDate(f.dateFrom)} To : ${fmtDate(f.dateTo)}`
  return fmtDate(new Date().toISOString().slice(0, 10))
})

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtN(val) {
  const n = Number(val || 0)
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

// ── Process raw data → grouped display rows ───────────────
// Group by date → waiter → table, matching SAP B1 format
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
    const orders = byDate[dateKey]
    const dateLabel = fmtDate(dateKey)

    // Date header
    result.push({
      __type: 'date-header',
      __rowKey: `dh-${dateKey}`,
      date_label: dateLabel,
    })

    // Step 2: Group by waiter within this date
    const byWaiter = {}
    for (const order of orders) {
      const waiterId = order.waiter_id || 'unassigned'
      const waiterName = order.waiter?.full_name || 'Unassigned'
      if (!byWaiter[waiterId]) byWaiter[waiterId] = { name: waiterName, orders: [] }
      byWaiter[waiterId].orders.push(order)
    }

    let dateCustomers = 0, dateAmount = 0

    const sortedWaiters = Object.entries(byWaiter).sort((a, b) => a[1].name.localeCompare(b[1].name))

    for (const [waiterId, waiterData] of sortedWaiters) {
      // Waiter header
      result.push({
        __type: 'waiter-header',
        __rowKey: `wh-${dateKey}-${waiterId}`,
        waiter_label: `${waiterData.name}`,
      })

      // Step 3: Group by table under this waiter
      const byTable = {}
      for (const order of waiterData.orders) {
        const tableNum = order.restaurant_tables?.table_number || 0
        const tableKey = tableNum || 'walk-in'
        if (!byTable[tableKey]) byTable[tableKey] = { orders: [], tableNum }
        byTable[tableKey].orders.push(order)
      }

      let waiterCustomers = 0, waiterAmount = 0
      const waiterTables = Object.keys(byTable).length

      const sortedTables = Object.entries(byTable).sort((a, b) => {
        const aNum = Number(a[1].tableNum) || 0
        const bNum = Number(b[1].tableNum) || 0
        return aNum - bNum
      })

      for (const [tableKey, tableData] of sortedTables) {
        const customers = tableData.orders.length
        const amount = tableData.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
        const avgTableSale = customers > 0 ? amount / customers : 0

        waiterCustomers += customers
        waiterAmount += amount

        result.push({
          __type: 'item',
          __rowKey: `row-${dateKey}-${waiterId}-${tableKey}`,
          table_no: tableData.tableNum || '—',
          no_customer: customers,
          amount,
          avg_w_sales: '',
          avg_table_sal: avgTableSale,
        })
      }

      // Waiter subtotal
      const avgWaiterSales = waiterCustomers > 0 ? waiterAmount / waiterCustomers : 0
      const avgTableSaleWaiter = waiterTables > 0 ? waiterAmount / waiterTables : 0

      result.push({
        __type: 'waiter-total',
        __rowKey: `wt-${dateKey}-${waiterId}`,
        no_customer: waiterCustomers,
        amount: waiterAmount,
        avg_w_sales: avgWaiterSales,
        avg_table_sal: avgTableSaleWaiter,
      })

      dateCustomers += waiterCustomers
      dateAmount += waiterAmount
    }

    // Date total
    const waiterCount = Object.keys(byWaiter).length
    result.push({
      __type: 'date-total',
      __rowKey: `dt-${dateKey}`,
      no_customer: dateCustomers,
      amount: dateAmount,
      avg_w_sales: dateCustomers > 0 ? dateAmount / dateCustomers : 0,
      avg_table_sal: waiterCount > 0 ? dateAmount / waiterCount : 0,
    })

    grandCustomers += dateCustomers
    grandAmount += dateAmount
  }

  // Grand total
  const totalDates = sortedDates.length
  result.push({
    __type: 'grand-total',
    __rowKey: 'grand-total',
    no_customer: grandCustomers,
    amount: grandAmount,
    avg_w_sales: grandCustomers > 0 ? grandAmount / grandCustomers : 0,
    avg_table_sal: totalDates > 0 ? grandAmount / totalDates : 0,
  })

  return result
})

// ── KPIs ──────────────────────────────────────────────────
const kpiData = computed(() => {
  const gt = displayRows.value.find(r => r.__type === 'grand-total')
  if (!gt) return []
  const uniqueWaiters = new Set(rawOrders.value.map(o => o.waiter_id).filter(Boolean)).size
  return [
    { label: 'Active Waiters', value: uniqueWaiters, icon: 'people', color: 'blue' },
    { label: 'Total Orders', value: gt.no_customer, icon: 'receipt_long', color: 'cyan' },
    { label: 'Total Revenue', value: `LKR ${fmtN(gt.amount)}`, icon: 'payments', color: 'green' },
    { label: 'Avg Per Order', value: `LKR ${fmtN(gt.avg_w_sales)}`, icon: 'trending_up', color: 'purple' },
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
    console.error('[WaiterWiseSale] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = displayRows.value.filter(r => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'waiter_wise_sales')
}
function exportExcel() {
  const exportRows = displayRows.value.filter(r => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'waiter_wise_sales')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* ── SAP Style Header ──────────────────────────────────────── */
.wws-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 16px;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1));
  background: rgba(255, 255, 255, 0.02);

  &__left { flex: 1; }
  &__company {
    font-size: 14px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    letter-spacing: -0.2px;
    text-align: center;
  }
  &__title {
    font-size: 12px;
    font-weight: 700;
    color: var(--erp-text-secondary, #94a3b8);
    text-align: center;
    margin-top: 2px;
  }
  &__meta {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  &__right { text-align: right; flex-shrink: 0; }
  &__page {
    font-size: 11px;
    color: var(--erp-text-secondary, #94a3b8);
  }
  &__date {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
  }
}

/* ── Table ─────────────────────────────────────────────────── */
.wws-table {
  background: transparent !important;
  font-size: 11px !important;

  :deep(.q-table) { font-size: 11px !important; }
}

.wws-table__header { background: rgba(255, 255, 255, 0.03) !important; }

.wws-table__th {
  font-size: 10px !important;
  font-weight: 700 !important;
  color: var(--erp-text-secondary, #94a3b8) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
  padding: 6px 8px !important;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08)) !important;
  white-space: nowrap !important;
}

.wws-table__row {
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.03)) !important;

  td, .q-td {
    font-size: 11px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
    padding: 4px 8px !important;
    height: 28px !important;
  }
}

.wws-table__td--num {
  text-align: right !important;
  font-variant-numeric: tabular-nums !important;
  font-family: 'SF Mono', 'Consolas', monospace !important;
}

/* ── Bill Date Header ──────────────────────────────────────── */
.wws-table__date-header {
  background: rgba(245, 158, 11, 0.08) !important;
  border-top: 2px solid rgba(245, 158, 11, 0.2) !important;
}

.wws-table__date-name {
  font-size: 12px !important;
  font-weight: 800 !important;
  color: #fbbf24 !important;
  letter-spacing: -0.2px !important;
  padding: 8px 10px !important;
}

/* ── Waiter Header ─────────────────────────────────────────── */
.wws-table__waiter-header {
  background: rgba(37, 99, 235, 0.06) !important;
  border-top: 1px solid rgba(37, 99, 235, 0.12) !important;
}

.wws-table__waiter-name {
  font-size: 11px !important;
  font-weight: 700 !important;
  color: var(--erp-primary, #2563eb) !important;
  padding: 5px 10px 5px 20px !important;
}

/* ── Waiter Subtotal ───────────────────────────────────────── */
.wws-table__waiter-total {
  background: rgba(255, 255, 255, 0.03) !important;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06)) !important;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06)) !important;

  td, .q-td {
    font-size: 11px !important;
    padding: 5px 8px !important;
    height: 28px !important;
    color: var(--erp-text-secondary, #94a3b8) !important;
  }
}

/* ── Date Total ────────────────────────────────────────────── */
.wws-table__date-total {
  background: rgba(245, 158, 11, 0.05) !important;
  border-top: 1px solid rgba(245, 158, 11, 0.15) !important;
  border-bottom: 2px solid rgba(245, 158, 11, 0.2) !important;

  td, .q-td {
    font-size: 11px !important;
    padding: 6px 8px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
  }
}

/* ── Grand Total ───────────────────────────────────────────── */
.wws-table__grand-total {
  background: rgba(255, 255, 255, 0.06) !important;
  border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.15)) !important;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.15)) !important;

  td, .q-td {
    font-size: 12px !important;
    padding: 8px 8px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
  }
}

/* ── Empty State ───────────────────────────────────────────── */
.wws-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

/* ── Print Overrides ───────────────────────────────────────── */
@media print {
  .wws-header {
    background: none !important;
    border-bottom: 2pt solid #1a1a2e !important;
    padding: 6pt 0 !important;
  }
  .wws-header__company {
    font-size: 13pt !important;
    color: #1a1a2e !important;
  }
  .wws-header__title {
    font-size: 10pt !important;
    color: #333 !important;
  }
  .wws-header__meta {
    color: #555 !important;
    font-size: 8pt !important;
  }
  .wws-table__date-header {
    background: #f5f0e0 !important;
    border-top: 1.5pt solid #333 !important;
  }
  .wws-table__date-name {
    color: #333 !important;
    font-size: 9pt !important;
  }
  .wws-table__waiter-header {
    background: #eef2f7 !important;
  }
  .wws-table__waiter-name {
    color: #1a1a2e !important;
    font-size: 8pt !important;
  }
  .wws-table__waiter-total td,
  .wws-table__date-total td {
    font-size: 7pt !important;
    color: #333 !important;
  }
  .wws-table__grand-total td {
    font-size: 8pt !important;
    color: #1a1a2e !important;
    background: #e8edf3 !important;
    border-top: 1.5pt solid #1a1a2e !important;
    border-bottom: 1.5pt solid #1a1a2e !important;
  }
  .wws-table__row td {
    font-size: 7pt !important;
    padding: 2pt 4pt !important;
    height: auto !important;
    color: #222 !important;
  }
  .wws-table__th {
    font-size: 7pt !important;
    padding: 3pt 4pt !important;
    color: #fff !important;
    background: #1a1a2e !important;
  }
}
</style>
