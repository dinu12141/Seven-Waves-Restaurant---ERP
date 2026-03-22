<template>
  <ReportLayout
    title="Electronic Journal"
    subtitle="Complete audit trail of all bills entered into the system — SAP B1 format"
    :kpis="kpiData"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData"
  >
    <!-- ── Extra Filters ─────────────────────────────────── -->
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Order Type</label>
        <q-select
          v-model="extraFilters.orderType"
          :options="orderTypeOptions"
          dense outlined emit-value map-options
          class="report-filter-input"
        />
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Bill Status</label>
        <q-select
          v-model="extraFilters.billStatus"
          :options="billStatusOptions"
          dense outlined emit-value map-options
          class="report-filter-input"
        />
      </div>
    </template>

    <!-- ── Report Header (SAP style) ─────────────────────── -->
    <template #default>
      <!-- Location & Date header -->
      <div class="ej-header">
        <div class="ej-header__left">
          <div class="ej-header__title">Electronic Journal / Bill Details</div>
          <div class="ej-header__location">Location : {{ branchName }} Date : {{ reportDateRange }}</div>
        </div>
        <div class="ej-header__right">
          <div class="ej-header__page">Page 1</div>
          <div class="ej-header__date">{{ todayFormatted }}</div>
        </div>
      </div>

      <!-- Status filter label -->
      <div v-if="extraFilters.billStatus !== 'all'" class="ej-filter-label">
        <q-icon name="filter_list" size="14px" class="q-mr-xs" />
        Filtered: <strong>{{ activeStatusLabel }}</strong>
      </div>

      <!-- ── Data Table ─────────────────────────────────────── -->
      <q-table
        :rows="flatRows"
        :columns="columns"
        row-key="__rowKey"
        flat dense
        class="ej-table"
        :loading="loading"
        :rows-per-page-options="[50, 100, 200, 0]"
        :pagination="{ rowsPerPage: 100 }"
        virtual-scroll
        separator="none"
      >
        <!-- Header -->
        <template #header="props">
          <q-tr :props="props" class="ej-table__header">
            <q-th v-for="col in props.cols" :key="col.name" :props="props" class="ej-table__th">
              {{ col.label }}
            </q-th>
          </q-tr>
        </template>

        <!-- Body -->
        <template #body="props">
          <!-- Bill subtotal separator row -->
          <q-tr v-if="props.row.__type === 'subtotal'" class="ej-table__subtotal-row">
            <q-td colspan="10" />
            <q-td class="ej-table__td--num text-weight-bold">{{ fmtN(props.row.disc_amt) }}</q-td>
            <q-td class="ej-table__td--num text-weight-bold">{{ fmtN(props.row.tax_amt) }}</q-td>
            <q-td class="ej-table__td--num text-weight-bold text-green">{{ fmtN(props.row.sales_price) }}</q-td>
            <q-td colspan="5" />
          </q-tr>

          <!-- Payment / CASH row -->
          <q-tr v-else-if="props.row.__type === 'payment'" class="ej-table__payment-row">
            <q-td :colspan="columns.length" class="ej-table__payment-cell">
              <span class="text-weight-bold">{{ props.row.description }}</span>
            </q-td>
          </q-tr>

          <!-- Normal item row -->
          <q-tr v-else :props="props" class="ej-table__row" :class="{ 'ej-table__row--void': props.row.void_marked === 'V' }">
            <q-td key="bill_no" :props="props" class="ej-table__td--mono">{{ props.row.bill_no }}</q-td>
            <q-td key="pos" :props="props">{{ props.row.pos }}</q-td>
            <q-td key="clerk" :props="props">{{ props.row.clerk }}</q-td>
            <q-td key="waiter" :props="props">{{ props.row.waiter }}</q-td>
            <q-td key="kot_no" :props="props">{{ props.row.kot_no }}</q-td>
            <q-td key="cust" :props="props">{{ props.row.cust }}</q-td>
            <q-td key="item_code" :props="props" class="ej-table__td--mono">{{ props.row.item_code }}</q-td>
            <q-td key="dept" :props="props">{{ props.row.dept }}</q-td>
            <q-td key="prod_ref" :props="props" class="ej-table__td--mono">{{ props.row.prod_ref }}</q-td>
            <q-td key="description" :props="props">{{ props.row.description }}</q-td>
            <q-td key="disc_amt" :props="props" class="ej-table__td--num">{{ fmtN(props.row.disc_amt) }}</q-td>
            <q-td key="tax_amt" :props="props" class="ej-table__td--num">{{ fmtN(props.row.tax_amt) }}</q-td>
            <q-td key="sales_price" :props="props" class="ej-table__td--num text-weight-bold">{{ fmtN(props.row.sales_price) }}</q-td>
            <q-td key="qty" :props="props" class="ej-table__td--num">{{ props.row.qty }}</q-td>
            <q-td key="time" :props="props">{{ props.row.time }}</q-td>
            <q-td key="type" :props="props">
              <span class="ej-type-badge" :class="`ej-type-badge--${(props.row.type||'').toLowerCase()}`">{{ props.row.type }}</span>
            </q-td>
            <q-td key="bill_ref" :props="props" class="ej-table__td--mono">{{ props.row.bill_ref }}</q-td>
            <q-td key="void_marked" :props="props" :class="props.row.void_marked === 'V' ? 'text-red text-weight-bold' : ''">
              {{ props.row.void_marked }}
            </q-td>
          </q-tr>
        </template>

        <!-- Grand Total -->
        <template #bottom-row>
          <q-tr class="ej-table__grand-total">
            <q-td colspan="10" class="text-weight-bold">GRAND TOTAL ({{ billCount }} Bills)</q-td>
            <q-td class="ej-table__td--num text-weight-bold">{{ fmtN(grandTotals.disc) }}</q-td>
            <q-td class="ej-table__td--num text-weight-bold">{{ fmtN(grandTotals.tax) }}</q-td>
            <q-td class="ej-table__td--num text-weight-bold text-green">{{ fmtN(grandTotals.sales) }}</q-td>
            <q-td class="ej-table__td--num text-weight-bold">{{ grandTotals.qty }}</q-td>
            <q-td colspan="4" />
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
          <div class="ej-empty">
            <q-icon name="receipt_long" size="40px" class="q-mb-sm" />
            <div>No journal entries for selected period</div>
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

const extraFilters = ref({
  orderType: 'all',
  billStatus: 'all',
})

// ── Filter Options ────────────────────────────────────────
const orderTypeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Dine-In', value: 'dine_in' },
  { label: 'Take Away', value: 'takeaway' },
  { label: 'Online', value: 'online' },
  { label: 'PickMe', value: 'pickme' },
  { label: 'Uber', value: 'uber' },
  { label: 'Delivery', value: 'delivery' },
]

const billStatusOptions = [
  { label: 'All Bills', value: 'all' },
  { label: 'Void Bills', value: 'void' },
  { label: 'Cancelled Bills', value: 'cancelled' },
  { label: 'Discounted Bills', value: 'discounted' },
  { label: 'Complimentary', value: 'complimentary' },
  { label: 'FOC (Free of Charge)', value: 'foc' },
]

const activeStatusLabel = computed(() => {
  const opt = billStatusOptions.find(o => o.value === extraFilters.value.billStatus)
  return opt?.label || 'All Bills'
})

// ── Column Definitions (SAP B1 format) ────────────────────
const columns = [
  { name: 'bill_no', label: 'Bill No', field: 'bill_no', align: 'left', sortable: true, style: 'width:70px' },
  { name: 'pos', label: 'POS', field: 'pos', align: 'center', style: 'width:35px' },
  { name: 'clerk', label: 'Clerk', field: 'clerk', align: 'left', style: 'width:50px' },
  { name: 'waiter', label: 'Waiter', field: 'waiter', align: 'left', style: 'width:50px' },
  { name: 'kot_no', label: 'Kot No', field: 'kot_no', align: 'left', style: 'width:50px' },
  { name: 'cust', label: 'Cust', field: 'cust', align: 'center', style: 'width:35px' },
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left', style: 'width:60px' },
  { name: 'dept', label: 'Dept', field: 'dept', align: 'left', style: 'width:50px' },
  { name: 'prod_ref', label: 'Prod.ref', field: 'prod_ref', align: 'left', style: 'width:40px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'disc_amt', label: 'Disc Amt', field: 'disc_amt', align: 'right', style: 'width:70px' },
  { name: 'tax_amt', label: 'Tax Amt', field: 'tax_amt', align: 'right', style: 'width:70px' },
  { name: 'sales_price', label: 'Sales Price', field: 'sales_price', align: 'right', style: 'width:80px' },
  { name: 'qty', label: 'Qty', field: 'qty', align: 'right', style: 'width:35px' },
  { name: 'time', label: 'Time', field: 'time', align: 'center', style: 'width:70px' },
  { name: 'type', label: 'Type', field: 'type', align: 'center', style: 'width:35px' },
  { name: 'bill_ref', label: 'Bill Ref', field: 'bill_ref', align: 'left', style: 'width:70px' },
  { name: 'void_marked', label: 'V', field: 'void_marked', align: 'center', style: 'width:25px' },
]

// ── Helpers ────────────────────────────────────────────────
const branchName = computed(() => authStore.currentBranch?.name || 'SEVEN WAVES RESTAURANT')

const todayFormatted = computed(() => {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
})

const reportDateRange = computed(() => {
  const f = currentFilters.value
  if (f.dateFrom && f.dateTo) {
    return `${formatDateShort(f.dateFrom)} to ${formatDateShort(f.dateTo)}`
  }
  return formatDateShort(new Date().toISOString().slice(0, 10))
})

function formatDateShort(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtN(val) {
  const n = Number(val || 0)
  if (n === 0) return '.000'
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function fmtTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function orderTypeCode(type) {
  const map = {
    dine_in: 'RS',
    takeaway: 'TK',
    online: 'WE',
    delivery: 'DL',
    pickme: 'PM',
    uber: 'UB',
  }
  return map[type?.toLowerCase()] || 'RS'
}

// ── Flatten orders → item rows with bill subtotals ────────
const flatRows = computed(() => {
  const result = []
  let billSeq = 0

  for (const order of rawOrders.value) {
    billSeq++
    const items = order.order_items || []
    const waiterName = order.waiter?.full_name || '—'
    const billNo = order.order_number || `#${(order.id || '').slice(0, 8)}`
    const kotNos = (order.kot_tickets || []).map(k => k.kot_number).filter(Boolean)
    const typeCode = orderTypeCode(order.order_type)
    const isVoid = order.status === 'cancelled' || order.status === 'void'
    const orderTime = fmtTime(order.created_at)
    const custCount = order.customer_name ? 1 : 0

    // Calculate per-item discount/tax proration
    const orderTotal = items.reduce((s, i) => s + Number(i.total_price || i.quantity * i.unit_price || 0), 0)
    const orderDisc = Number(order.discount_amount || 0)
    const orderTax = Number(order.tax_amount || 0)

    let billSubDisc = 0
    let billSubTax = 0
    let billSubSales = 0

    items.forEach((item, idx) => {
      const itemTotal = Number(item.total_price || item.quantity * item.unit_price || 0)
      const ratio = orderTotal > 0 ? itemTotal / orderTotal : 0
      const itemDisc = orderDisc * ratio
      const itemTax = orderTax * ratio
      const kotNo = kotNos[0] || ''
      const menuItem = item.menu_items || {}
      const catName = menuItem.item_categories?.name || ''
      const itemId = menuItem.id || item.menu_item_id || ''
      const shortCode = typeof itemId === 'string' ? itemId.slice(0, 6).toUpperCase() : ''
      const isItemVoid = isVoid || item.status === 'cancelled' || item.status === 'void'

      billSubDisc += itemDisc
      billSubTax += itemTax
      billSubSales += itemTotal

      result.push({
        __type: 'item',
        __rowKey: `${order.id}-${idx}`,
        __billSeq: billSeq,
        bill_no: idx === 0 ? billNo : '',
        pos: idx === 0 ? '1' : '',
        clerk: idx === 0 ? waiterName : '',
        waiter: idx === 0 ? waiterName : '',
        kot_no: idx === 0 ? kotNo : '',
        cust: idx === 0 ? String(custCount) : '',
        item_code: shortCode,
        dept: catName,
        prod_ref: shortCode.slice(0, 4),
        description: menuItem.name || 'Item',
        disc_amt: itemDisc,
        tax_amt: itemTax,
        sales_price: itemTotal,
        qty: item.quantity || 0,
        time: idx === 0 ? orderTime : '',
        type: idx === 0 ? typeCode : '',
        bill_ref: billNo,
        void_marked: isItemVoid ? 'V' : '',
      })
    })

    // If order has no items, show a single row for the bill header
    if (items.length === 0) {
      result.push({
        __type: 'item',
        __rowKey: `${order.id}-empty`,
        __billSeq: billSeq,
        bill_no: billNo,
        pos: '1',
        clerk: waiterName,
        waiter: waiterName,
        kot_no: '',
        cust: String(custCount),
        item_code: '',
        dept: '',
        prod_ref: '',
        description: '(No items)',
        disc_amt: orderDisc,
        tax_amt: orderTax,
        sales_price: Number(order.total_amount || 0),
        qty: 0,
        time: orderTime,
        type: typeCode,
        bill_ref: billNo,
        void_marked: isVoid ? 'V' : '',
      })
      billSubSales = Number(order.total_amount || 0)
      billSubDisc = orderDisc
      billSubTax = orderTax
    }

    // Payment method row (like "CASH" in SAP format)
    const paymentName = extractPaymentMethod(order)
    if (paymentName) {
      result.push({
        __type: 'payment',
        __rowKey: `${order.id}-pay`,
        __billSeq: billSeq,
        description: paymentName,
      })
    }

    // Subtotal separator row per bill
    result.push({
      __type: 'subtotal',
      __rowKey: `${order.id}-sub`,
      __billSeq: billSeq,
      disc_amt: billSubDisc,
      tax_amt: billSubTax,
      sales_price: billSubSales,
    })
  }

  return result
})

function extractPaymentMethod(order) {
  const invoices = Array.isArray(order.invoices) ? order.invoices : order.invoices ? [order.invoices] : []
  for (const inv of invoices) {
    const payments = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
    for (const p of payments) {
      if (p.payment_methods?.name) return p.payment_methods.name.toUpperCase()
    }
  }
  return null
}

// ── Computed KPIs & totals ─────────────────────────────────
const billCount = computed(() => rawOrders.value.length)

const grandTotals = computed(() => {
  let disc = 0, tax = 0, sales = 0, qty = 0
  for (const r of flatRows.value) {
    if (r.__type === 'item') {
      disc += Number(r.disc_amt || 0)
      tax += Number(r.tax_amt || 0)
      sales += Number(r.sales_price || 0)
      qty += Number(r.qty || 0)
    }
  }
  return { disc, tax, sales, qty }
})

const kpiData = computed(() => [
  { label: 'Total Bills', value: billCount.value, icon: 'receipt_long', color: 'blue' },
  { label: 'Gross Sales', value: `LKR ${fmtN(grandTotals.value.sales)}`, icon: 'payments', color: 'green' },
  { label: 'Total Discounts', value: `LKR ${fmtN(grandTotals.value.disc)}`, icon: 'local_offer', color: 'amber' },
  { label: 'Tax Collected', value: `LKR ${fmtN(grandTotals.value.tax)}`, icon: 'account_balance', color: 'purple' },
  { label: 'Void / Cancelled', value: rawOrders.value.filter(o => o.status === 'cancelled' || o.status === 'void').length, icon: 'cancel', color: 'red' },
])

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
        order_source,
        status,
        payment_status,
        customer_name,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        created_at,
        updated_at,
        accepted_at,
        branch_id,
        waiter_id,
        waiter:profiles!orders_waiter_id_fkey ( full_name ),
        branches ( name ),
        order_items (
          id,
          menu_item_id,
          quantity,
          unit_price,
          total_price,
          status,
          notes,
          menu_items ( id, name, item_categories ( name ) )
        ),
        kot_tickets ( id, kot_number, status ),
        invoices (
          id, invoice_number, total, payment_status,
          payments ( amount, payment_methods ( name ) )
        )
      `)
      .order('created_at', { ascending: true })

    // Date filters
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)

    // Branch security
    if (!authStore.isAdmin) {
      const branchId = authStore.currentBranch?.id
      if (branchId) query = query.eq('branch_id', branchId)
    }

    // Order type filter
    if (extraFilters.value.orderType !== 'all') {
      query = query.eq('order_type', extraFilters.value.orderType)
    }

    // Bill status filter
    const bs = extraFilters.value.billStatus
    if (bs === 'void') {
      query = query.in('status', ['void'])
    } else if (bs === 'cancelled') {
      query = query.in('status', ['cancelled'])
    } else if (bs === 'discounted') {
      query = query.gt('discount_amount', 0)
    } else if (bs === 'complimentary' || bs === 'foc') {
      query = query.eq('total_amount', 0)
    }

    const { data, error } = await query.limit(2000)
    if (error) throw error

    rawOrders.value = data || []
  } catch (err) {
    console.error('[ElectronicJournal] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = flatRows.value.filter(r => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'electronic_journal')
}

function exportExcel() {
  const exportRows = flatRows.value.filter(r => r.__type === 'item')
  exportTableToExcel(columns, exportRows, 'electronic_journal')
}
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* ── Report Header (SAP style) ────────────────────────────── */
.ej-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.1));
  background: rgba(255, 255, 255, 0.02);

  &__left {
    flex: 1;
  }
  &__title {
    font-size: 14px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    letter-spacing: -0.3px;
  }
  &__location {
    font-size: 11px;
    color: var(--erp-text-secondary, #94a3b8);
    margin-top: 2px;
  }
  &__right {
    text-align: right;
    flex-shrink: 0;
  }
  &__page {
    font-size: 11px;
    color: var(--erp-text-secondary, #94a3b8);
  }
  &__date {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
  }
}

.ej-filter-label {
  display: flex;
  align-items: center;
  padding: 6px 16px;
  background: rgba(37, 99, 235, 0.08);
  border-bottom: 1px solid rgba(37, 99, 235, 0.15);
  font-size: 11px;
  color: var(--erp-text-secondary, #94a3b8);
}

/* ── Table ─────────────────────────────────────────────────── */
.ej-table {
  background: transparent !important;
  font-size: 11px !important;

  :deep(.q-table) {
    font-size: 11px !important;
  }
}

.ej-table__header {
  background: rgba(255, 255, 255, 0.03) !important;
}

.ej-table__th {
  font-size: 10px !important;
  font-weight: 700 !important;
  color: var(--erp-text-secondary, #94a3b8) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.3px !important;
  padding: 6px 6px !important;
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08)) !important;
  white-space: nowrap !important;
}

.ej-table__row {
  border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.03)) !important;

  td, .q-td {
    font-size: 11px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
    padding: 4px 6px !important;
    height: 28px !important;
  }

  &--void td, &--void .q-td {
    color: var(--erp-danger, #dc2626) !important;
    text-decoration: line-through;
    opacity: 0.7;
  }
}

.ej-table__td--num {
  text-align: right !important;
  font-variant-numeric: tabular-nums !important;
  font-family: 'SF Mono', 'Consolas', monospace !important;
}

.ej-table__td--mono {
  font-family: 'SF Mono', 'Consolas', monospace !important;
  font-size: 10px !important;
}

/* ── Subtotal row ──────────────────────────────────────────── */
.ej-table__subtotal-row {
  background: rgba(255, 255, 255, 0.02) !important;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08)) !important;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.06)) !important;

  td, .q-td {
    font-size: 11px !important;
    padding: 3px 6px !important;
    height: 24px !important;
    color: var(--erp-text-secondary, #94a3b8) !important;
  }
}

/* ── Payment row ───────────────────────────────────────────── */
.ej-table__payment-row {
  background: rgba(22, 163, 74, 0.05) !important;

  td, .q-td {
    font-size: 11px !important;
    padding: 3px 6px !important;
    height: 22px !important;
  }
}

.ej-table__payment-cell {
  padding-left: 60px !important;
  color: var(--erp-text-secondary, #94a3b8) !important;
  font-style: italic;
}

/* ── Grand Total ───────────────────────────────────────────── */
.ej-table__grand-total {
  background: rgba(255, 255, 255, 0.05) !important;
  border-top: 2px solid var(--erp-border, rgba(255, 255, 255, 0.12)) !important;
  border-bottom: 2px solid var(--erp-border, rgba(255, 255, 255, 0.12)) !important;

  td, .q-td {
    font-size: 12px !important;
    padding: 8px 6px !important;
    color: var(--erp-text-primary, #f8fafc) !important;
  }
}

/* ── Type Badge ────────────────────────────────────────────── */
.ej-type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.3px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--erp-text-secondary, #94a3b8);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));

  &--rs { background: rgba(37, 99, 235, 0.12); color: #60a5fa; border-color: rgba(37, 99, 235, 0.2); }
  &--tk { background: rgba(245, 158, 11, 0.12); color: #fbbf24; border-color: rgba(245, 158, 11, 0.2); }
  &--we { background: rgba(124, 58, 237, 0.12); color: #a78bfa; border-color: rgba(124, 58, 237, 0.2); }
  &--dl { background: rgba(22, 163, 74, 0.12); color: #4ade80; border-color: rgba(22, 163, 74, 0.2); }
  &--pm { background: rgba(236, 72, 153, 0.12); color: #f472b6; border-color: rgba(236, 72, 153, 0.2); }
  &--ub { background: rgba(0, 0, 0, 0.15); color: #e5e7eb; border-color: rgba(255, 255, 255, 0.1); }
}

/* ── Empty State ───────────────────────────────────────────── */
.ej-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  color: var(--erp-text-muted, #64748b);
  font-size: 13px;
}

/* ── Print overrides (scoped) ──────────────────────────────── */
@media print {
  .ej-header {
    background: none !important;
    border-bottom: 2pt solid #1a1a2e !important;
    padding: 6pt 0 !important;
  }
  .ej-header__title {
    font-size: 12pt !important;
    color: #1a1a2e !important;
  }
  .ej-header__location,
  .ej-header__page,
  .ej-header__date {
    color: #555 !important;
    font-size: 8pt !important;
  }
  .ej-filter-label {
    background: none !important;
    border: none !important;
    color: #333 !important;
    font-size: 8pt !important;
    padding: 4pt 0 !important;
  }
  .ej-table__row td,
  .ej-table__subtotal-row td,
  .ej-table__payment-row td {
    font-size: 7pt !important;
    padding: 2pt 3pt !important;
    height: auto !important;
    color: #222 !important;
  }
  .ej-table__th {
    font-size: 6pt !important;
    padding: 3pt 3pt !important;
    color: #fff !important;
    background: #1a1a2e !important;
  }
  .ej-table__grand-total td {
    font-size: 8pt !important;
    color: #1a1a2e !important;
  }
  .ej-type-badge {
    background: none !important;
    border: 0.5pt solid #999 !important;
    color: #333 !important;
    font-size: 6pt !important;
  }
  .ej-table__row--void td {
    color: #c62828 !important;
  }
}
</style>
