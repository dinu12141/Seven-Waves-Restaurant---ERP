<template>
  <ReportLayout
    title="Waiter Wise Sale"
    subtitle="Waiter Wise Sales — Performance and table-level breakdown per waiter"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="displayRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <template #default>
      <!-- ── Data Table ───────────────────────────── -->
      <q-table
        :rows="displayRows"
        :columns="columns"
        row-key="__rowKey"
        flat
        dense
        class="sap-table"
        :loading="loading"
        :rows-per-page-options="[0]"
        hide-pagination
        separator="none"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="sap-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="sap-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <!-- Bill Date header row -->
          <q-tr v-if="props.row.__type === 'date-header'" class="sap-table__date-header">
            <q-td :colspan="columns.length" class="sap-table__date-name">
              <q-icon name="event" size="14px" class="q-mr-xs" />
              Bill Date : {{ props.row.date_label }}
            </q-td>
          </q-tr>

          <!-- Waiter header row -->
          <q-tr v-else-if="props.row.__type === 'waiter-header'" class="sap-table__sub-header">
            <q-td :colspan="columns.length" class="sap-table__sub-name">
              <q-icon name="person" size="14px" class="q-mr-xs" />
              Waiter : {{ props.row.waiter_label }}
            </q-td>
          </q-tr>

          <!-- Waiter subtotal row -->
          <q-tr v-else-if="props.row.__type === 'waiter-total'" class="sap-table__subtotal">
            <q-td />
            <q-td class="sap-table__td--num text-weight-bold">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold text-green">{{
              fmtN(props.row.amount)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{
              fmtN(props.row.avg_w_sales)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{
              fmtN(props.row.avg_table_sal)
            }}</q-td>
          </q-tr>

          <!-- Date total row -->
          <q-tr v-else-if="props.row.__type === 'date-total'" class="sap-table__date-total">
            <q-td class="text-weight-bolder">Bill Date Total</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder text-green">{{
              fmtN(props.row.amount)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtN(props.row.avg_w_sales)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtN(props.row.avg_table_sal)
            }}</q-td>
          </q-tr>

          <!-- Grand total row -->
          <q-tr v-else-if="props.row.__type === 'grand-total'" class="sap-table__grand-total">
            <q-td class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder text-green">{{
              fmtN(props.row.amount)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtN(props.row.avg_w_sales)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{
              fmtN(props.row.avg_table_sal)
            }}</q-td>
          </q-tr>

          <!-- Normal table row -->
          <q-tr v-else :props="props" class="sap-table__row">
            <q-td key="table_no" :props="props" class="sap-table__td--num">{{
              props.row.table_no
            }}</q-td>
            <q-td key="no_customer" :props="props" class="sap-table__td--num">{{
              props.row.no_customer
            }}</q-td>
            <q-td key="amount" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.amount)
            }}</q-td>
            <q-td key="avg_w_sales" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.avg_w_sales)
            }}</q-td>
            <q-td key="avg_table_sal" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.avg_table_sal)
            }}</q-td>
            <q-td key="invoice_no" :props="props">
              <a v-if="props.row.invoice_no" href="#" class="inv-link" @click.prevent="openInvoice(props.row)">
                {{ props.row.invoice_no }}
              </a>
            </q-td>
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
          <div class="report-empty">
            <q-icon name="person_off" size="40px" class="q-mb-sm" />
            <div>No waiter sales data for selected period</div>
          </div>
        </template>
      </q-table>
    </template>
  </ReportLayout>

  <InvoiceViewDialog v-model="showInvoiceDialog" :invoice-id="selectedInvoiceId" :order-id="selectedOrderId" />
</template>

<script setup>
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { dayEndExclusiveISO, dayStartISO, fetchAllRows } from 'src/services/reportFilters'
import { useAuthStore } from 'src/stores/auth'
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import InvoiceViewDialog from 'src/components/reports/InvoiceViewDialog.vue'
import { exportTableToCSV, exportTableToExcel } from 'src/services/exportService'

const authStore = useAuthStore()
const loading = ref(false)
const rawOrders = ref([])
const currentFilters = ref({})

const showInvoiceDialog = ref(false)
const selectedInvoiceId = ref(null)
const selectedOrderId = ref(null)

function openInvoice(row) {
  selectedInvoiceId.value = row.__invoiceId || null
  selectedOrderId.value = row.__orderId || null
  showInvoiceDialog.value = true
}

// ── Column Definitions (SAP B1 format) ────────────────────
const columns = [
  {
    name: 'table_no',
    label: 'Table No',
    field: 'table_no',
    align: 'right',
    style: 'width:80px',
    sortable: true,
  },
  {
    name: 'no_customer',
    label: 'No.Customer',
    field: 'no_customer',
    align: 'right',
    style: 'width:90px',
    sortable: true,
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'amount',
    align: 'right',
    style: 'width:120px',
    sortable: true,
  },
  {
    name: 'avg_w_sales',
    label: 'Avg W Sales',
    field: 'avg_w_sales',
    align: 'right',
    style: 'width:100px',
  },
  {
    name: 'avg_table_sal',
    label: 'Avg Tabel Sal',
    field: 'avg_table_sal',
    align: 'right',
    style: 'width:100px',
  },
  {
    name: 'invoice_no',
    label: 'Invoice No',
    field: 'invoice_no',
    align: 'left',
    style: 'width:140px',
  },
]

// ── Helpers ────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
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
  let grandCustomers = 0,
    grandAmount = 0

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

    let dateCustomers = 0,
      dateAmount = 0

    const sortedWaiters = Object.entries(byWaiter).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )

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

      let waiterCustomers = 0,
        waiterAmount = 0
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
          __orderId: tableData.orders[0]?.id || null,
          __invoiceId: (() => {
            const inv = Array.isArray(tableData.orders[0]?.invoices) ? tableData.orders[0].invoices[0] : tableData.orders[0]?.invoices
            return inv?.id || null
          })(),
          table_no: tableData.tableNum || '—',
          no_customer: customers,
          amount,
          avg_w_sales: '',
          avg_table_sal: avgTableSale,
          invoice_no: (() => {
            const invNos = tableData.orders.map(o => {
              const inv = Array.isArray(o.invoices) ? o.invoices[0] : o.invoices
              return inv?.invoice_no || ''
            }).filter(Boolean)
            return invNos.length > 0 ? invNos[0] : ''
          })(),
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
  const gt = displayRows.value.find((r) => r.__type === 'grand-total')
  if (!gt) return []
  const uniqueWaiters = new Set(rawOrders.value.map((o) => o.waiter_id).filter(Boolean)).size
  return [
    { label: 'Active Waiters', value: uniqueWaiters, icon: 'people', color: 'blue' },
    { label: 'Total Orders', value: gt.no_customer, icon: 'receipt_long', color: 'cyan' },
    { label: 'Total Revenue', value: `LKR ${fmtN(gt.amount)}`, icon: 'payments', color: 'green' },
    {
      label: 'Avg Per Order',
      value: `LKR ${fmtN(gt.avg_w_sales)}`,
      icon: 'trending_up',
      color: 'purple',
    },
  ]
})

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  try {
    let query = supabase
      .from('orders')
      .select(
        `
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
        restaurant_tables ( table_number, section ),
        invoices ( id, invoice_no )
      `,
      )
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: true })

    // Date filters
    if (filters.dateFrom) query = query.gte('created_at', dayStartISO(filters.dateFrom))
    if (filters.dateTo) query = query.lt('created_at', dayEndExclusiveISO(filters.dateTo))

    // Branch filter
    if (filters.branch) {
      query = query.eq('branch_id', filters.branch)
    } else if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data, error } = await fetchAllRows(query.order('id'))
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
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'waiter_wise_sales')
}
function exportExcel() {
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'waiter_wise_sales')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

.inv-link {
  color: #1565c0;
  text-decoration: none;
  font-weight: 600;
  cursor: pointer;
  &:hover { text-decoration: underline; color: #0d47a1; }
}
</style>
