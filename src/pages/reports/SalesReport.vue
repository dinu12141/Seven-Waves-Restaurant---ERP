<template>
  <ReportLayout
    title="Sales Report"
    subtitle="Daily, weekly and monthly revenue breakdown by branch, category, and payment mode"
    :kpis="kpiData"
    @filter-change="onFilterChange"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- Extra filters slot -->
    <template #extra-filters>
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
          placeholder="All Categories"
          class="report-filter-input"
        />
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Payment Mode</label>
        <q-select
          v-model="extraFilters.paymentMode"
          :options="paymentModeOptions"
          dense
          outlined
          emit-value
          map-options
          clearable
          placeholder="All Modes"
          class="report-filter-input"
        />
      </div>

      <div class="report-filter-group">
        <label class="report-filter-label">Status</label>
        <q-select
          v-model="extraFilters.status"
          :options="statusOptions"
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

    <!-- DataGrid -->
    <template #default>
      <!-- Column group headers -->
      <div class="sales-col-groups">
        <div class="sales-col-group" style="flex: 3">Order Details</div>
        <div class="sales-col-group" style="flex: 2">Amount (LKR)</div>
        <div class="sales-col-group" style="flex: 2">Payment</div>
        <div class="sales-col-group" style="flex: 1">Status</div>
      </div>

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        flat
        class="report-table"
        :loading="loading"
        :rows-per-page-options="[25, 50, 100]"
        rows-per-page-label="Rows/page"
        :pagination="{ rowsPerPage: 25 }"
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
            <q-td key="order_no" :props="props" class="report-table__td report-table__td--mono">
              {{ props.row.order_no }}
            </q-td>
            <q-td key="created_at" :props="props" class="report-table__td">
              {{ formatDateTime(props.row.created_at) }}
            </q-td>
            <q-td key="branch" :props="props" class="report-table__td">{{ props.row.branch }}</q-td>
            <q-td key="subtotal" :props="props" class="report-table__td report-table__td--num">
              {{ fmtLKR(props.row.subtotal) }}
            </q-td>
            <q-td
              key="discount"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--debit"
            >
              {{ props.row.discount > 0 ? `(${fmtLKR(props.row.discount)})` : '-' }}
            </q-td>
            <q-td key="tax" :props="props" class="report-table__td report-table__td--num">
              {{ fmtLKR(props.row.tax) }}
            </q-td>
            <q-td
              key="total"
              :props="props"
              class="report-table__td report-table__td--num report-table__td--bold"
            >
              {{ fmtLKR(props.row.total) }}
            </q-td>
            <q-td key="payment_mode" :props="props" class="report-table__td">
              <span
                class="report-badge"
                :class="`report-badge--${props.row.payment_mode?.toLowerCase()}`"
              >
                {{ props.row.payment_mode || '-' }}
              </span>
            </q-td>
            <q-td key="cashier" :props="props" class="report-table__td">{{
              props.row.cashier
            }}</q-td>
            <q-td key="status" :props="props" class="report-table__td">
              <span class="erp-badge" :class="`erp-badge--${props.row.status}`">{{
                props.row.status
              }}</span>
            </q-td>
          </q-tr>
        </template>

        <!-- Footer total row -->
        <template #bottom-row>
          <q-tr class="report-table__total-row">
            <q-td colspan="3" class="report-table__td report-table__td--bold">TOTAL</q-td>
            <q-td class="report-table__td report-table__td--num report-table__td--bold">{{
              fmtLKR(totals.subtotal)
            }}</q-td>
            <q-td
              class="report-table__td report-table__td--num report-table__td--debit report-table__td--bold"
            >
              ({{ fmtLKR(totals.discount) }})
            </q-td>
            <q-td class="report-table__td report-table__td--num report-table__td--bold">{{
              fmtLKR(totals.tax)
            }}</q-td>
            <q-td class="report-table__td report-table__td--num report-table__td--bold">{{
              fmtLKR(totals.total)
            }}</q-td>
            <q-td colspan="3" />
          </q-tr>
        </template>

        <!-- Loading -->
        <template #loading>
          <q-inner-loading showing>
            <q-spinner-gears size="40px" color="primary" />
          </q-inner-loading>
        </template>

        <!-- Empty -->
        <template #no-data>
          <div class="report-empty">
            <q-icon name="receipt_long" size="40px" class="q-mb-sm" />
            <div>No sales data for selected period</div>
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
  category: null,
  paymentMode: null,
  status: null,
})

const categoryOptions = [
  { label: 'All Categories', value: null },
  { label: 'Food', value: 'food' },
  { label: 'Beverage', value: 'beverage' },
  { label: 'Dessert', value: 'dessert' },
]

const paymentModeOptions = [
  { label: 'All Modes', value: null },
  { label: 'Cash', value: 'cash' },
  { label: 'Card', value: 'card' },
  { label: 'Online', value: 'online' },
]

const statusOptions = [
  { label: 'All', value: null },
  { label: 'Paid', value: 'paid' },
  { label: 'Completed', value: 'completed' },
  { label: 'Served', value: 'served' },
  { label: 'Invoiced', value: 'invoiced' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Pending', value: 'pending' },
  { label: 'Cancelled', value: 'cancelled' },
]

const columns = [
  { name: 'order_no', label: 'Order #', field: 'order_no', align: 'left', sortable: true },
  { name: 'created_at', label: 'Date & Time', field: 'created_at', align: 'left', sortable: true },
  { name: 'branch', label: 'Branch', field: 'branch', align: 'left', sortable: true },
  { name: 'subtotal', label: 'Subtotal', field: 'subtotal', align: 'right', sortable: true },
  { name: 'discount', label: 'Discount', field: 'discount', align: 'right', sortable: false },
  { name: 'tax', label: 'Tax', field: 'tax', align: 'right', sortable: false },
  { name: 'total', label: 'Total', field: 'total', align: 'right', sortable: true },
  {
    name: 'payment_mode',
    label: 'Payment Mode',
    field: 'payment_mode',
    align: 'left',
    sortable: true,
  },
  { name: 'cashier', label: 'Cashier', field: 'cashier', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left', sortable: true },
]

const totals = computed(() => ({
  subtotal: rows.value.reduce((s, r) => s + (r.subtotal || 0), 0),
  discount: rows.value.reduce((s, r) => s + (r.discount || 0), 0),
  tax: rows.value.reduce((s, r) => s + (r.tax || 0), 0),
  total: rows.value.reduce((s, r) => s + (r.total || 0), 0),
}))

const kpiData = computed(() => [
  {
    label: 'Total Revenue',
    value: fmtLKR(totals.value.total),
    icon: 'payments',
    color: 'blue',
    sub: `${rows.value.length} orders`,
  },
  {
    label: 'Gross Sales',
    value: fmtLKR(totals.value.subtotal),
    icon: 'shopping_cart',
    color: 'green',
  },
  {
    label: 'Total Discount',
    value: `(${fmtLKR(totals.value.discount)})`,
    icon: 'discount',
    color: 'amber',
  },
  {
    label: 'Tax Collected',
    value: fmtLKR(totals.value.tax),
    icon: 'account_balance',
    color: 'purple',
  },
  {
    label: 'Avg. Order Value',
    value: rows.value.length ? fmtLKR(totals.value.total / rows.value.length) : 'LKR 0',
    icon: 'trending_up',
    color: 'teal',
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
      .from('orders')
      .select(
        `
        id,
        order_number,
        created_at,
        subtotal,
        discount_amount,
        tax_amount,
        total_amount,
        status,
        payment_status,
        order_type,
        branch_id,
        branches (name),
        waiter:profiles!orders_waiter_id_fkey (full_name),
        invoices (
          payments (
            amount,
            payment_methods (name)
          )
        )
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
    if (extraFilters.value.status) {
      query = query.eq('status', extraFilters.value.status)
    }

    // Security: non-admin users only see their own branch data
    if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    const { data, error } = await query.limit(500)
    if (error) throw error

    rows.value = (data || []).map((r) => {
      // Extract payment method from invoices → payments chain
      let paymentMode = '—'
      const invoices = Array.isArray(r.invoices) ? r.invoices : r.invoices ? [r.invoices] : []
      for (const inv of invoices) {
        const payments = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
        for (const p of payments) {
          if (p.payment_methods?.name) {
            paymentMode = p.payment_methods.name
            break
          }
        }
        if (paymentMode !== '—') break
      }

      // Filter by payment mode if set
      if (extraFilters.value.paymentMode && paymentMode.toLowerCase() !== extraFilters.value.paymentMode) {
        return null
      }

      return {
        id: r.id,
        order_no: r.order_number || `#${r.id?.slice(0, 8)}`,
        created_at: r.created_at,
        branch: r.branches?.name || '—',
        subtotal: Number(r.subtotal || 0),
        discount: Number(r.discount_amount || 0),
        tax: Number(r.tax_amount || 0),
        total: Number(r.total_amount || 0),
        payment_mode: paymentMode,
        cashier: r.waiter?.full_name || '—',
        status: r.status || 'pending',
      }
    }).filter(Boolean)
  } catch (err) {
    console.error('[SalesReport] Error:', err)
  } finally {
    loading.value = false
  }
}

function fmtLKR(val) {
  return `LKR ${Number(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`
}

function formatDateTime(dt) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function exportCSV() {
  const headers = columns.map((c) => c.label).join(',')
  const rowsCSV = rows.value
    .map((r) =>
      [
        r.order_no,
        formatDateTime(r.created_at),
        r.branch,
        r.subtotal,
        r.discount,
        r.tax,
        r.total,
        r.payment_mode,
        r.cashier,
        r.status,
      ].join(','),
    )
    .join('\n')
  const csv = headers + '\n' + rowsCSV
  downloadFile(csv, 'sales-report.csv', 'text/csv')
}

function exportExcel() {
  // Simple TSV export that Excel opens natively
  const headers = columns.map((c) => c.label).join('\t')
  const rowsTSV = rows.value
    .map((r) =>
      [
        r.order_no,
        formatDateTime(r.created_at),
        r.branch,
        r.subtotal,
        r.discount,
        r.tax,
        r.total,
        r.payment_mode,
        r.cashier,
        r.status,
      ].join('\t'),
    )
    .join('\n')
  downloadFile(headers + '\n' + rowsTSV, 'sales-report.xls', 'application/vnd.ms-excel')
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

/* Column group dividers */
.sales-col-groups {
  display: flex;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  padding: 4px 16px;
}
.sales-col-group {
  font-size: 10px;
  font-weight: 700;
  color: var(--erp-text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.7px;
  text-align: center;
  border-right: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  padding-right: 8px;
  &:last-child {
    border-right: none;
  }
}

/* Table styles */
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
    padding: 8px 12px !important;
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
    padding: 8px 12px !important;
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
    &--debit {
      color: var(--erp-danger, #dc2626) !important;
    }
  }

  &__total-row {
    background: rgba(255, 255, 255, 0.04) !important;
    border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1)) !important;
  }
}

/* Badge */
.report-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.06);
  color: var(--erp-text-secondary, #94a3b8);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));

  &--cash {
    background: rgba(22, 163, 74, 0.12);
    color: var(--erp-success, #16a34a);
    border-color: rgba(22, 163, 74, 0.2);
  }
  &--card {
    background: rgba(37, 99, 235, 0.12);
    color: var(--erp-primary, #2563eb);
    border-color: rgba(37, 99, 235, 0.2);
  }
  &--online {
    background: rgba(124, 58, 237, 0.12);
    color: #7c3aed;
    border-color: rgba(124, 58, 237, 0.2);
  }
}

/* Empty state */
.report-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

@media print {
  .sales-col-groups {
    display: none;
  }
  .report-table__td,
  .report-table__th {
    color: #000 !important;
    font-size: 10px !important;
  }
}
</style>
