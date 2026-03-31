<template>
  <ReportLayout
    title="Electronic Journal"
    subtitle="Complete audit trail of all bills entered into the system — SAP B1 format"
    :kpis="kpiData"
    :export-columns="columns"
    :export-rows="flatRows"
    @filter-change="loadData"
    @export-csv="exportCSV"
    @export-excel="exportExcel"
    @refresh="loadData(currentFilters)"
  >
    <!-- ── Extra Filters ─────────────────────────────────── -->
    <template #extra-filters>
      <div class="report-filter-group">
        <label class="report-filter-label">Order Type</label>
        <q-select
          v-model="extraFilters.orderType"
          :options="orderTypeOptions"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input"
        />
      </div>
      <div class="report-filter-group">
        <label class="report-filter-label">Bill Status</label>
        <q-select
          v-model="extraFilters.billStatus"
          :options="billStatusOptions"
          dense
          outlined
          emit-value
          map-options
          class="report-filter-input"
        />
      </div>
    </template>

    <!-- ── Report Header (SAP style) ─────────────────────── -->
    <template #default>
      <!-- Status filter label -->
      <div v-if="extraFilters.billStatus !== 'all'" class="sap-filter-label">
        <q-icon name="filter_list" size="14px" class="q-mr-xs" />
        Filtered: <strong>{{ activeStatusLabel }}</strong>
      </div>

      <!-- ── Data Table ─────────────────────────────────────── -->
      <q-table
        :rows="flatRows"
        :columns="columns"
        row-key="__rowKey"
        flat
        dense
        class="sap-table"
        :loading="loading"
        :rows-per-page-options="[50, 100, 200, 0]"
        :pagination="{ rowsPerPage: 100 }"
        virtual-scroll
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
          <!-- ── Date Header Row ───────────────────────────────── -->
          <q-tr v-if="props.row.__type === 'date-header'" class="sap-table__date-header">
            <q-td :colspan="columns.length" class="sap-table__date-name">
              {{ props.row.date_label }}
            </q-td>
          </q-tr>

          <!-- ── Bill Subtotal Row ─────────────────────────────── -->
          <q-tr v-else-if="props.row.__type === 'subtotal'" class="sap-table__bill-subtotal">
            <q-td colspan="10" />
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.disc_amt) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(props.row.tax_amt) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold" style="color: #16a34a">{{
              fmtN(props.row.sales_price)
            }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{
              props.row.qty ? fmtQty(props.row.qty) : ''
            }}</q-td>
            <q-td colspan="4" />
          </q-tr>

          <!-- ── Normal / Service-charge / Payment Item Row ───── -->
          <q-tr
            v-else
            :props="props"
            class="sap-table__row"
            :class="[
              { 'sap-table__row--void': props.row.void_marked === 'V' },
              props.row.__type === 'service' ? 'ej-row--service' : '',
              props.row.__type === 'payment' ? 'ej-row--payment' : '',
            ]"
          >
            <q-td key="bill_no" :props="props" class="sap-table__td--mono text-weight-bold">{{
              props.row.bill_no
            }}</q-td>
            <q-td key="invoice_no" :props="props">
              <a v-if="props.row.invoice_no" href="#" class="inv-link" @click.prevent="openInvoice(props.row)">
                {{ props.row.invoice_no }}
              </a>
            </q-td>
            <q-td key="date" :props="props">{{ props.row.date }}</q-td>
            <q-td key="order_type" :props="props">
              <q-badge :color="String(props.row.order_type).includes('Dine') ? 'blue-8' : 'orange-8'" rounded class="q-px-sm" v-if="props.row.order_type">
                {{ props.row.order_type }}
              </q-badge>
            </q-td>
            <q-td key="time_in" :props="props">{{ props.row.time_in }}</q-td>
            <q-td key="pay_time" :props="props">{{ props.row.pay_time }}</q-td>
            <q-td key="waiter" :props="props">{{ props.row.waiter }}</q-td>
            <q-td key="cashier" :props="props">{{ props.row.cashier }}</q-td>
            <q-td key="item_code" :props="props" class="sap-table__td--mono">{{
              props.row.item_code
            }}</q-td>
            <q-td key="description" :props="props">
              <span :class="props.row.__type === 'payment' ? 'text-weight-bold' : ''">{{
                props.row.description
              }}</span>
            </q-td>
            <q-td key="qty" :props="props" class="sap-table__td--num">{{
              props.row.qty !== '' ? fmtQty(props.row.qty) : ''
            }}</q-td>
            <q-td key="disc_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.disc_amt)
            }}</q-td>
            <q-td key="tax_amt" :props="props" class="sap-table__td--num">{{
              fmtN(props.row.tax_amt)
            }}</q-td>
            <q-td key="sales_price" :props="props" class="sap-table__td--num text-weight-bold">{{
              fmtN(props.row.sales_price)
            }}</q-td>
            <q-td
              key="void_marked"
              :props="props"
              :class="props.row.void_marked === 'V' ? 'text-red text-weight-bold' : ''"
            >
              {{ props.row.void_marked }}
            </q-td>
          </q-tr>
        </template>

        <!-- Grand Total -->
        <template #bottom-row>
          <q-tr class="sap-table__grand-total">
            <q-td colspan="9" class="text-weight-bold">GRAND TOTAL ({{ billCount }} Bills)</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ grandTotals.qty }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(grandTotals.disc) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold">{{ fmtN(grandTotals.tax) }}</q-td>
            <q-td class="sap-table__td--num text-weight-bold text-green">{{ fmtN(grandTotals.sales) }}</q-td>
            <q-td />
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
            <q-icon name="receipt_long" size="40px" class="q-mb-sm" />
            <div>No journal entries for selected period</div>
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
import ReportLayout from 'src/components/reports/ReportLayout.vue'
import InvoiceViewDialog from 'src/components/reports/InvoiceViewDialog.vue'
import { exportTableToCSV } from 'src/services/exportService'

const loading = ref(false)
const rawOrders = ref([])
const profilesMap = ref({}) // uuid -> full_name for cashiers
const currentFilters = ref({ dateFrom: '', dateTo: '', branch: '' })

const showInvoiceDialog = ref(false)
const selectedInvoiceId = ref(null)
const selectedOrderId = ref(null)

function openInvoice(row) {
  selectedInvoiceId.value = row.__invoiceId || null
  selectedOrderId.value = row.__orderId || null
  showInvoiceDialog.value = true
}

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
  const opt = billStatusOptions.find((o) => o.value === extraFilters.value.billStatus)
  return opt?.label || 'All Bills'
})

// ── Column Definitions (SAP B1 format) ────────────────────
const columns = [
  { name: 'bill_no', label: 'Bill No', field: 'bill_no', align: 'left', sortable: true, style: 'width:60px' },
  { name: 'invoice_no', label: 'Invoice No', field: 'invoice_no', align: 'left', sortable: true, style: 'width:120px' },
  { name: 'date', label: 'Date', field: 'date', align: 'center', sortable: true, style: 'width:85px' },
  { name: 'order_type', label: 'Order Type', field: 'order_type', align: 'center', sortable: true, style: 'width:85px' },
  { name: 'time_in', label: 'Entry Time', field: 'time_in', align: 'center', style: 'width:85px' },
  { name: 'pay_time', label: 'Settled At', field: 'pay_time', align: 'center', style: 'width:85px' },
  { name: 'waiter', label: 'Steward Name', field: 'waiter', align: 'left', style: 'width:120px' },
  { name: 'cashier', label: 'Cashier Name', field: 'cashier', align: 'left', style: 'width:120px' },
  { name: 'item_code', label: 'Item Code', field: 'item_code', align: 'left', style: 'width:70px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'qty', label: 'Qty', field: 'qty', align: 'right', style: 'width:40px' },
  { name: 'disc_amt', label: 'Discount', field: 'disc_amt', align: 'right', style: 'width:70px' },
  { name: 'tax_amt', label: 'Tax', field: 'tax_amt', align: 'right', style: 'width:70px' },
  { name: 'sales_price', label: 'Total', field: 'sales_price', align: 'right', style: 'width:85px' },
  { name: 'void_marked', label: 'Void', field: 'void_marked', align: 'center', style: 'width:40px' },
]

// ── Helpers ────────────────────────────────────────────────

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


// ── Flatten orders → SAP B1 format rows ──────────────────
const flatRows = computed(() => {
  const result = []

  // Sort orders by created_at ascending (oldest first, then by date)
  const sorted = [...rawOrders.value].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  let lastDateKey = ''
  let billSeq = 0

  for (const order of sorted) {
    const dateKey = (order.created_at || '').slice(0, 10) // YYYY-MM-DD

    // Insert date group header when date changes
    if (dateKey !== lastDateKey) {
      const dateLabel = dateKey
        ? new Date(dateKey + 'T00:00:00').toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : ''
      result.push({
        __type: 'date-header',
        __rowKey: `date-${dateKey}`,
        __billSeq: -1,
        date_label: dateLabel,
      })
      lastDateKey = dateKey
    }

    billSeq++
    const items = order.order_items || []
    const isVoid = order.status === 'cancelled' || order.status === 'void'
    const orderTimeIn = fmtTime(order.created_at)
    const paymentTime = extractPaymentTime(order) || orderTimeIn
    
    // Steward & Cashier Names
    const stewardName = order.waiter?.full_name || '—'
    
    // Get cashier name from the profilesMap (loaded separately after main orders query)
    const firstInvoice = Array.isArray(order.invoices)
      ? order.invoices[0]
      : order.invoices || null
    const cashierUUID = firstInvoice?.cashier_id || null
    const cashierName = cashierUUID ? (profilesMap.value[cashierUUID] || '—') : '—'
    const invoiceNo = firstInvoice?.invoice_no || ''
    const invoiceId = firstInvoice?.id || null
    
    // Formatting Order type
    const orderTypeFormat = order.order_type ? order.order_type.charAt(0).toUpperCase() + order.order_type.slice(1).replace('_', '-') : 'Dine-In'
    
    const orderDisc = Number(order.discount_amount || 0)
    const orderTax = Number(order.tax_amount || 0)
    const serviceChargeAmt = Number(order.service_charge || 0)
    const orderTotal = items.reduce((s, i) => s + Number(i.total_price || i.quantity * i.unit_price || 0), 0)

    let billSubDisc = 0
    let billSubTax = 0
    let billSubSales = 0
    let billSubQty = 0

    // ── Regular Item Rows (Type = S) ────────────────────────────
    items.forEach((item, idx) => {
      const itemTotal = Number(item.total_price || item.quantity * item.unit_price || 0)
      const ratio = orderTotal > 0 ? itemTotal / orderTotal : 0
      const itemDisc = orderDisc * ratio
      const itemTax = orderTax * ratio
      const menuItem = item.menu_items || {}
      const itemId = menuItem.id || item.menu_item_id || ''
      const shortCode = typeof itemId === 'string' ? itemId.slice(0, 6).toUpperCase() : ''
      const isItemVoid = isVoid || item.status === 'cancelled' || item.status === 'void'
      const qty = Number(item.quantity || 0)

      billSubDisc += itemDisc
      billSubTax += itemTax
      billSubSales += itemTotal
      billSubQty += qty

      result.push({
        __type: 'item',
        __rowKey: `${order.id}-${idx}`,
        __billSeq: billSeq,
        __orderId: order.id,
        __invoiceId: invoiceId,
        bill_no: idx === 0 ? billSeq : '',
        invoice_no: idx === 0 ? invoiceNo : '',
        date: idx === 0 ? dateKey : '',
        time_in: idx === 0 ? orderTimeIn : '',
        pay_time: idx === 0 ? paymentTime : '',
        order_type: idx === 0 ? orderTypeFormat : '',
        waiter: idx === 0 ? stewardName : '',
        cashier: idx === 0 ? cashierName : '',
        item_code: shortCode,
        description: menuItem.name || 'Item',
        disc_amt: itemDisc,
        tax_amt: itemTax,
        sales_price: itemTotal,
        qty,
        void_marked: isItemVoid ? 'V' : '',
      })
    })

    // If order has no items
    if (items.length === 0) {
      result.push({
        __type: 'item',
        __rowKey: `${order.id}-empty`,
        __billSeq: billSeq,
        bill_no: billSeq,
        date: dateKey,
        time_in: orderTimeIn,
        pay_time: paymentTime,
        order_type: orderTypeFormat,
        waiter: stewardName,
        cashier: cashierName,
        item_code: '',
        description: '(No items)',
        disc_amt: 0,
        tax_amt: orderTax,
        sales_price: Number(order.total_amount || 0),
        qty: 0,
        void_marked: isVoid ? 'V' : '',
      })
      billSubSales = Number(order.total_amount || 0)
      billSubTax = orderTax
    }

    // ── Service Charge Row (Type = L, Bill Ref = SC) ───────────────
    if (serviceChargeAmt > 0) {
      const scPct = 10
      result.push({
        __type: 'service',
        __rowKey: `${order.id}-sc`,
        __billSeq: billSeq,
        bill_no: '',
        date: '',
        time_in: '',
        pay_time: '',
        order_type: '',
        waiter: '',
        cashier: '',
        item_code: 'Serv.',
        description: `Service Charge (${scPct}%)`,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: serviceChargeAmt,
        qty: '',
        void_marked: '',
      })
      billSubSales += serviceChargeAmt
    }

    // ── Payment Row (Type = P, Bill Ref = MM) ────────────────────
    const paymentName = extractPaymentMethod(order)
    const paymentTotal = Number(order.total_amount || billSubSales)
    if (paymentName) {
      result.push({
        __type: 'payment',
        __rowKey: `${order.id}-pay`,
        __billSeq: billSeq,
        bill_no: '',
        date: '',
        time_in: '',
        pay_time: '',
        order_type: '',
        waiter: '',
        cashier: '',
        item_code: paymentName,
        description: paymentName,
        disc_amt: 0,
        tax_amt: 0,
        sales_price: paymentTotal,
        qty: '',
        void_marked: '',
      })
    }

    // ── Bill Subtotal Separator Row ───────────────────────────
    result.push({
      __type: 'subtotal',
      __rowKey: `${order.id}-sub`,
      __billSeq: billSeq,
      disc_amt: billSubDisc,
      tax_amt: billSubTax,
      sales_price: billSubSales,
      qty: billSubQty,
    })
  }

  return result
})

function extractPaymentMethod(order) {
  const invoices = Array.isArray(order.invoices)
    ? order.invoices
    : order.invoices
      ? [order.invoices]
      : []
  for (const inv of invoices) {
    const payments = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
    for (const p of payments) {
      if (p.payment_methods?.name) return p.payment_methods.name.toUpperCase()
    }
  }
  return null
}

function extractPaymentTime(order) {
  const invoices = Array.isArray(order.invoices)
    ? order.invoices
    : order.invoices
      ? [order.invoices]
      : []
  for (const inv of invoices) {
    const payments = Array.isArray(inv.payments) ? inv.payments : inv.payments ? [inv.payments] : []
    for (const p of payments) {
      if (p.paid_at || p.created_at) return fmtTime(p.paid_at || p.created_at)
    }
  }
  return null
}

function fmtQty(v) {
  if (v === '' || v == null) return ''
  const n = Number(v)
  return isNaN(n) ? '' : n.toFixed(3)
}

// ── Computed KPIs & totals ─────────────────────────────────
const billCount = computed(() => rawOrders.value.length)

const grandTotals = computed(() => {
  let disc = 0,
    tax = 0,
    sales = 0,
    qty = 0
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
  {
    label: 'Gross Sales',
    value: `LKR ${fmtN(grandTotals.value.sales)}`,
    icon: 'payments',
    color: 'green',
  },
  {
    label: 'Total Discounts',
    value: `LKR ${fmtN(grandTotals.value.disc)}`,
    icon: 'local_offer',
    color: 'amber',
  },
  {
    label: 'Tax Collected',
    value: `LKR ${fmtN(grandTotals.value.tax)}`,
    icon: 'account_balance',
    color: 'purple',
  },
  {
    label: 'Void / Cancelled',
    value: rawOrders.value.filter((o) => o.status === 'cancelled' || o.status === 'void').length,
    icon: 'cancel',
    color: 'red',
  },
])

// ── Data Loading ──────────────────────────────────────────
async function loadData(filters = {}) {
  loading.value = true
  currentFilters.value = filters
  console.log('[ElectronicJournal] loadData called with filters:', JSON.stringify(filters))
  try {
    let query = supabase
      .from('orders')
      .select(
        `
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
        service_charge,
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
          menu_items ( id, name, categories ( name ) )
        ),
        kot_tickets ( id, kot_number, status ),
        invoices (
          id, invoice_number, invoice_no, total, payment_status,
          cashier_id,
          payments ( amount, created_at, payment_methods ( name ) )
        )
      `,
      )
      .order('created_at', { ascending: true })

    // Date filters
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59')
    if (filters.branch) query = query.eq('branch_id', filters.branch)

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
    if (error) {
      console.error('[ElectronicJournal] Supabase error:', error)
      throw error
    }

    console.log('[ElectronicJournal] Orders returned:', data?.length || 0)
    rawOrders.value = data || []

    // ── Batch-load cashier names (cashier_id is a plain UUID on invoices, no FK) ──
    const cashierIds = new Set()
    for (const order of rawOrders.value) {
      const invs = Array.isArray(order.invoices) ? order.invoices : order.invoices ? [order.invoices] : []
      for (const inv of invs) {
        if (inv.cashier_id) cashierIds.add(inv.cashier_id)
      }
    }
    if (cashierIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(cashierIds))
      const map = {}
      for (const p of profiles || []) map[p.id] = p.full_name
      profilesMap.value = map
    }

  } catch (err) {
    console.error('[ElectronicJournal] Error:', err)
  } finally {
    loading.value = false
  }
}

// ── Export ─────────────────────────────────────────────────
function exportCSV() {
  const exportRows = flatRows.value.filter((r) => r.__type === 'item')
  exportTableToCSV(columns, exportRows, 'electronic_journal')
}

async function exportExcel() {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Seven Waves ERP'
  wb.created = new Date()

  const ws = wb.addWorksheet('Electronic Journal', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  })

  // ── Column definitions ──────────────────────────────────
  ws.columns = [
    { key: 'bill_no', width: 10 },
    { key: 'date', width: 12 },
    { key: 'order_type', width: 14 },
    { key: 'time_in', width: 12 },
    { key: 'pay_time', width: 12 },
    { key: 'waiter', width: 22 },
    { key: 'cashier', width: 22 },
    { key: 'item_code', width: 14 },
    { key: 'description', width: 33 },
    { key: 'qty', width: 8 },
    { key: 'disc_amt', width: 12 },
    { key: 'tax_amt', width: 12 },
    { key: 'sales_price', width: 14 },
    { key: 'void_marked', width: 8 },
  ]

  const TOTAL_COLS = ws.columns.length
  const NAVY = { argb: 'FF1B3A6B' }
  const WHITE = { argb: 'FFFFFFFF' }
  const LIGHT_BLUE = { argb: 'FFE8EEF7' }
  const SUBTOTAL_BG = { argb: 'FFD0DCF0' }
  const PAY_BG = { argb: 'FFEAF4EA' }
  const TOTAL_BG = { argb: 'FF1B3A6B' }
  const AMT_COLS = [11, 12, 13, 14] // disc, tax, sales, qty — 1-indexed

  const numFmt = '#,##0.000'

  function borderAll(ws, rowNum) {
    const row = ws.getRow(rowNum)
    for (let c = 1; c <= TOTAL_COLS; c++) {
      const cell = row.getCell(c)
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      }
    }
  }

  // ── Row 1: Company name ────────────────────────────────
  ws.mergeCells(1, 1, 1, TOTAL_COLS)
  const titleCell = ws.getCell('A1')
  titleCell.value = 'SEVEN WAVES RESTAURANT (PVT) LTD'
  titleCell.font = { bold: true, size: 16, color: WHITE }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: NAVY }
  ws.getRow(1).height = 28

  // ── Row 2: Report title ────────────────────────────────
  ws.mergeCells(2, 1, 2, TOTAL_COLS)
  const subtitleCell = ws.getCell('A2')
  subtitleCell.value = 'Electronic Journal / Bill Details'
  subtitleCell.font = { bold: true, size: 12, color: WHITE }
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: NAVY }
  ws.getRow(2).height = 20

  // ── Row 3: Meta info ───────────────────────────────────
  const f = currentFilters.value
  const dateRange =
    f.dateFrom && f.dateTo ? `${f.dateFrom} to ${f.dateTo}` : new Date().toISOString().slice(0, 10)
  ws.mergeCells(3, 1, 3, TOTAL_COLS)
  const metaCell = ws.getCell('A3')
  metaCell.value = `Location: ${branchName.value}   |   Date: ${dateRange}   |   Generated: ${new Date().toLocaleString()}`
  metaCell.font = { italic: true, size: 9, color: { argb: 'FF444444' } }
  metaCell.alignment = { horizontal: 'center' }
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: LIGHT_BLUE }
  ws.getRow(3).height = 16

  // ── Row 4: Summary KPIs ────────────────────────────────
  ws.mergeCells(4, 1, 4, TOTAL_COLS)
  const kpiStr = `Total Bills: ${billCount.value}   |   Gross Sales: LKR ${grandTotals.value.sales.toFixed(3)}   |   Discounts: LKR ${grandTotals.value.disc.toFixed(3)}   |   Tax: LKR ${grandTotals.value.tax.toFixed(3)}`
  const kpiCell = ws.getCell('A4')
  kpiCell.value = kpiStr
  kpiCell.font = { bold: true, size: 10, color: NAVY }
  kpiCell.alignment = { horizontal: 'center' }
  kpiCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F8' } }
  ws.getRow(4).height = 18

  // ── Row 5: Blank spacer ───────────────────────────────
  ws.getRow(5).height = 8

  // ── Row 6: Column headers ──────────────────────────────
  const headers = [
    'Bill No',
    'POS',
    'Clerk',
    'Waiter',
    'KOT No',
    'Cust',
    'Item Code',
    'Dept',
    'Prod.Ref',
    'Description',
    'Disc Amt',
    'Tax Amt',
    'Sales Price',
    'Qty',
    'Time',
    'Type',
    'Bill Ref',
    'V',
  ]
  const headerRow = ws.addRow(headers) // row 6
  headerRow.height = 18
  headerRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: NAVY }
    cell.font = { bold: true, size: 9, color: WHITE }
    cell.alignment = {
      horizontal: AMT_COLS.includes(colNum) ? 'right' : 'center',
      vertical: 'middle',
    }
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0D2447' } },
      bottom: { style: 'medium', color: { argb: 'FF0D2447' } },
      left: { style: 'thin', color: { argb: 'FF3A5FA0' } },
      right: { style: 'thin', color: { argb: 'FF3A5FA0' } },
    }
  })

  // ── Data rows ──────────────────────────────────────────
  let altBg = false
  let lastBillSeq = -1

  for (const r of flatRows.value) {
    if (r.__billSeq !== lastBillSeq) {
      altBg = !altBg
      lastBillSeq = r.__billSeq
    }

    if (r.__type === 'item') {
      const dataRow = ws.addRow([
        r.bill_no,
        r.pos,
        r.clerk,
        r.waiter,
        r.kot_no,
        r.cust ? Number(r.cust) : '',
        r.item_code,
        r.dept,
        r.prod_ref,
        r.description,
        r.disc_amt ? Number(r.disc_amt) : 0,
        r.tax_amt ? Number(r.tax_amt) : 0,
        r.sales_price ? Number(r.sales_price) : 0,
        r.qty ? Number(r.qty) : 0,
        r.time,
        r.type,
        r.bill_ref,
        r.void_marked,
      ])
      dataRow.height = 15
      const rowBg = altBg ? { argb: 'FFF5F8FF' } : { argb: 'FFFFFFFF' }
      dataRow.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: rowBg }
        cell.font = {
          size: 9,
          color: r.void_marked === 'V' ? { argb: 'FFCC0000' } : { argb: 'FF222222' },
        }
        cell.alignment = {
          horizontal: AMT_COLS.includes(colNum) ? 'right' : 'left',
          vertical: 'middle',
        }
        if (AMT_COLS.includes(colNum)) cell.numFmt = numFmt
        borderAll(ws, dataRow.number)
      })
    } else if (r.__type === 'payment') {
      // Payment method row (e.g. CASH)
      const payRow = ws.addRow(Array(TOTAL_COLS).fill(''))
      payRow.getCell(10).value = r.description // description column
      payRow.height = 14
      payRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: PAY_BG }
        cell.font = { bold: true, size: 9, color: { argb: 'FF2E7D32' }, italic: true }
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
      })
    } else if (r.__type === 'subtotal') {
      // Bill subtotal row
      const subRow = ws.addRow(Array(TOTAL_COLS).fill(''))
      subRow.getCell(10).value = 'Bill Sub-total'
      subRow.getCell(11).value = Number(r.disc_amt || 0)
      subRow.getCell(12).value = Number(r.tax_amt || 0)
      subRow.getCell(13).value = Number(r.sales_price || 0)
      subRow.height = 14
      subRow.eachCell((cell, colNum) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: SUBTOTAL_BG }
        cell.font = { bold: true, size: 9, color: NAVY }
        cell.alignment = {
          horizontal: AMT_COLS.includes(colNum) ? 'right' : 'left',
          vertical: 'middle',
        }
        if ([11, 12, 13].includes(colNum)) cell.numFmt = numFmt
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF9FB8E0' } },
          bottom: { style: 'medium', color: { argb: 'FF1B3A6B' } },
        }
      })
    }
  }

  // ── Grand Total row ────────────────────────────────────
  const grandRow = ws.addRow(Array(TOTAL_COLS).fill(''))
  grandRow.getCell(1).value = `GRAND TOTAL (${billCount.value} Bills)`
  grandRow.getCell(11).value = grandTotals.value.disc
  grandRow.getCell(12).value = grandTotals.value.tax
  grandRow.getCell(13).value = grandTotals.value.sales
  grandRow.getCell(14).value = grandTotals.value.qty
  grandRow.height = 20
  grandRow.eachCell((cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: TOTAL_BG }
    cell.font = { bold: true, size: 10, color: WHITE }
    cell.alignment = {
      horizontal: AMT_COLS.includes(colNum) ? 'right' : 'left',
      vertical: 'middle',
    }
    if ([11, 12, 13].includes(colNum)) cell.numFmt = numFmt
    cell.border = {
      top: { style: 'medium', color: WHITE },
      bottom: { style: 'medium', color: WHITE },
    }
  })

  // ── Freeze header rows ─────────────────────────────────
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 6, activeCell: 'A7' }]

  // ── Download ───────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10)
  a.href = url
  a.download = `Electronic_Journal_${dateStr}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss">
/* Unscoped block */
body .sap-table__header,
body .sap-table .sap-table__header th.sap-table__th {
  background-color: #ffffff !important;
  border-bottom: 2px solid #ccc !important;
}

body .sap-table .sap-table__header th.sap-table__th,
body .sap-table .sap-table__header th.sap-table__th span,
body .sap-table .sap-table__header th.sap-table__th .q-table__sort-icon {
  color: #333333 !important;
}
</style>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* Date header row styling */
:deep(.sap-table__date-header td),
:deep(.sap-table__date-header .q-td) {
  background: #ffffff !important;
  color: #333333 !important;
  font-weight: 700 !important;
  font-size: 11px !important;
  letter-spacing: 0.5px !important;
  padding: 4px 8px !important;
  border-bottom: 2px solid #ccc !important;
  border-top: 2px solid #ccc !important;
}

.inv-link {
  color: #1565c0;
  text-decoration: none;
  font-weight: 600;
  cursor: pointer;
  &:hover { text-decoration: underline; color: #0d47a1; }
}
</style>
