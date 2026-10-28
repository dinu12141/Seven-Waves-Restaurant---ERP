<template>
  <ReportLayout
    title="Table Wise Sale"
    subtitle="Table Wise Sales — Revenue breakdown by table with waiter detail"
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
          <!-- Date header row -->
          <q-tr v-if="props.row.__type === 'date-header'" class="sap-table__date-header">
            <q-td class="sap-table__date-name">{{ props.row.date_label }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>

          <!-- Table group header row -->
          <q-tr v-else-if="props.row.__type === 'table-header'" class="sap-table__table-header">
            <q-td class="sap-table__table-name">Table No : {{ props.row.table_no }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.amount) }}</q-td>
          </q-tr>

          <!-- Grand total row -->
          <q-tr v-else-if="props.row.__type === 'grand-total'" class="sap-table__grand-total">
            <q-td class="text-weight-bolder">GRAND TOTAL</q-td>
            <q-td class="sap-table__td--num text-weight-bolder">{{ props.row.no_customer }}</q-td>
            <q-td class="sap-table__td--num text-weight-bolder text-green">{{
              fmtN(props.row.amount)
            }}</q-td>
          </q-tr>

          <!-- Normal waiter row -->
          <q-tr v-else :props="props" class="sap-table__row">
            <q-td key="waiter" :props="props" style="padding-left: 50px !important">{{
              props.row.waiter
            }}</q-td>
            <q-td key="no_customer" :props="props" class="sap-table__td--num">{{
              props.row.no_customer
            }}</q-td>
            <q-td key="amount" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.amount)
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
            <q-icon name="table_restaurant" size="40px" class="q-mb-sm" />
            <div>No table sales data for selected period</div>
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
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left' },
  {
    name: 'no_customer',
    label: 'No.Customer',
    field: 'no_customer',
    align: 'right',
    style: 'width:120px',
    sortable: true,
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'amount',
    align: 'right',
    style: 'width:150px',
    sortable: true,
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
  let grandCustomers = 0,
    grandAmount = 0
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
        if (!byWaiter[waiterId]) byWaiter[waiterId] = { name: waiterName, customers: 0, amount: 0, sampleOrder: null }
        byWaiter[waiterId].customers += 1
        byWaiter[waiterId].amount += Number(order.total_amount || 0)
        if (!byWaiter[waiterId].sampleOrder) byWaiter[waiterId].sampleOrder = order
      }

      const sortedWaiters = Object.entries(byWaiter).sort((a, b) =>
        a[1].name.localeCompare(b[1].name),
      )

      for (const [, waiterInfo] of sortedWaiters) {
        const sOrder = waiterInfo.sampleOrder
        const inv = sOrder ? (Array.isArray(sOrder.invoices) ? sOrder.invoices[0] : sOrder.invoices) : null
        result.push({
          __type: 'item',
          __rowKey: `row-${dateKey}-${tableKey}-${waiterInfo.name}`,
          __orderId: sOrder?.id || null,
          __invoiceId: inv?.id || null,
          waiter: waiterInfo.name,
          no_customer: waiterInfo.customers,
          amount: waiterInfo.amount,
          invoice_no: inv?.invoice_no || '',
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
  const gt = displayRows.value.find((r) => r.__type === 'grand-total')
  if (!gt) return []
  const uniqueTables = new Set(
    rawOrders.value.map((o) => o.restaurant_tables?.table_number).filter(Boolean),
  ).size
  const uniqueWaiters = new Set(rawOrders.value.map((o) => o.waiter_id).filter(Boolean)).size
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
    console.error('[TableWiseSale] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'table_wise_sales')
}
function exportExcel() {
  const exportRows = displayRows.value.filter((r) => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'table_wise_sales')
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
