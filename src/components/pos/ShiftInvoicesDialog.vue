<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    maximized
    transition-show="slide-up"
    transition-hide="slide-down"
  >
    <q-card dark class="shift-invoices-dialog column full-height">
      <!-- ═══ TOP TOOLBAR ═══ -->
      <q-toolbar class="shift-dialog-toolbar q-py-sm">
        <div class="row items-center no-wrap">
          <div class="toolbar-icon-wrap q-mr-md">
            <q-icon name="receipt_long" size="22px" color="primary" />
          </div>
          <div>
            <div class="text-h6 text-weight-bolder text-white row items-center">
              Shift Invoices & Sales Ledger
              <q-badge
                :color="shift?.status === 'open' ? 'green' : 'grey-7'"
                text-color="white"
                class="q-ml-sm text-weight-bold"
              >
                {{ (shift?.status || 'UNKNOWN').toUpperCase() }}
              </q-badge>
            </div>
            <div class="text-caption text-grey-4">
              Terminal: <strong>{{ shift?.terminal_id || 'POS-1' }}</strong> • 
              Branch: <strong>{{ shift?.branches?.name || 'Main Branch' }}</strong> • 
              Cashier: <strong>{{ shift?.opened_by_user?.full_name || shift?.profiles?.full_name || 'Staff' }}</strong>
            </div>
          </div>
        </div>

        <q-space />

        <!-- Quick Summary Actions -->
        <div class="row items-center q-gutter-sm">
          <q-btn
            outline
            color="amber-4"
            icon="print"
            label="Print Shift Z-Report"
            no-caps
            class="text-weight-bold"
            @click="printShiftSummary"
          />
          <q-btn
            outline
            color="green-4"
            icon="file_download"
            label="Export Invoices"
            no-caps
            class="text-weight-bold"
            @click="exportInvoicesCsv"
          />
          <q-btn flat round dense icon="close" color="grey-4" v-close-popup />
        </div>
      </q-toolbar>

      <q-separator color="grey-9" />

      <!-- ═══ SHIFT METRICS STRIP ═══ -->
      <div class="metrics-strip q-pa-md row q-col-gutter-md">
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">Opening Float</div>
            <div class="text-h6 text-weight-bold text-blue-4">
              LKR {{ formatCurrency(shift?.opening_cash_float || 0) }}
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">Total Sales ({{ invoices.length }})</div>
            <div class="text-h6 text-weight-bold text-amber-4">
              LKR {{ formatCurrency(totalSalesAmount) }}
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">Cash Sales</div>
            <div class="text-h6 text-weight-bold text-green-4">
              LKR {{ formatCurrency(cashSalesTotal) }}
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">Card Sales</div>
            <div class="text-h6 text-weight-bold text-purple-4">
              LKR {{ formatCurrency(cardSalesTotal) }}
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">QR & Online</div>
            <div class="text-h6 text-weight-bold text-cyan-4">
              LKR {{ formatCurrency(onlineSalesTotal) }}
            </div>
          </div>
        </div>
        <div class="col-12 col-sm-6 col-md-2">
          <div class="metric-card">
            <div class="text-caption text-grey-4">Expected vs Counted</div>
            <div
              class="text-h6 text-weight-bold"
              :class="variance >= 0 ? 'text-green-4' : 'text-negative'"
            >
              {{ shift?.status === 'closed' ? `LKR ${formatCurrency(shift?.counted_cash)}` : 'In Progress' }}
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ INVOICES TABLE SECTION ═══ -->
      <div class="col q-px-md q-pb-md column no-wrap">
        <div class="row items-center justify-between q-mb-sm">
          <div class="text-subtitle1 text-weight-bold text-white row items-center">
            <q-icon name="list_alt" size="20px" class="q-mr-xs text-primary" />
            Invoices Issued During Shift ({{ filteredInvoices.length }})
          </div>

          <div class="row items-center q-gutter-sm">
            <q-select
              v-model="filterPaymentMethod"
              :options="paymentMethodOptions"
              dense
              outlined
              dark
              label="Payment Method"
              style="min-width: 160px"
              clearable
              emit-value
              map-options
            />
            <q-input
              v-model="searchQuery"
              dense
              outlined
              dark
              placeholder="Search Invoice #, Order #..."
              style="min-width: 220px"
              clearable
            >
              <template v-slot:prepend>
                <q-icon name="search" color="grey-5" />
              </template>
            </q-input>
          </div>
        </div>

        <q-table
          :rows="filteredInvoices"
          :columns="invoiceColumns"
          row-key="id"
          flat
          dark
          dense
          :loading="loading"
          :rows-per-page-options="[15, 30, 50, 100]"
          class="shift-inv-table col"
          no-data-label="No invoices found for this shift"
        >
          <template #body-cell-invoice_number="props">
            <q-td :props="props">
              <span class="text-weight-bold text-amber-4 font-mono">
                {{ props.row.invoice_number || `INV-${props.row.id?.substring(0, 8)}` }}
              </span>
            </q-td>
          </template>

          <template #body-cell-order_number="props">
            <q-td :props="props">
              <span class="font-mono text-grey-3">
                #{{ props.row.orders?.order_number || props.row.order_id?.substring(0, 6) || '—' }}
              </span>
              <span v-if="props.row.orders?.order_type" class="text-caption text-grey-5 q-ml-xs">
                ({{ props.row.orders.order_type }})
              </span>
            </q-td>
          </template>

          <template #body-cell-table="props">
            <q-td :props="props">
              <span v-if="props.row.orders?.table_number" class="text-weight-bold text-blue-3">
                Table {{ props.row.orders.table_number }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>

          <template #body-cell-payment_method="props">
            <q-td :props="props">
              <q-badge
                :color="getMethodBadgeColor(props.row.payment_method || props.row.payment_mode)"
                text-color="white"
                class="text-weight-bold"
              >
                {{ (props.row.payment_method || props.row.payment_mode || 'CASH').toUpperCase() }}
              </q-badge>
            </q-td>
          </template>

          <template #body-cell-total="props">
            <q-td :props="props" class="text-right">
              <span class="text-weight-bolder text-green-4 font-mono">
                LKR {{ formatCurrency(props.row.grand_total || props.row.total || props.row.amount || 0) }}
              </span>
            </q-td>
          </template>

          <template #body-cell-created_at="props">
            <q-td :props="props">
              <span class="text-grey-4">
                {{ formatDateTime(props.row.created_at || props.row.payment_time) }}
              </span>
            </q-td>
          </template>

          <template #body-cell-actions="props">
            <q-td :props="props" class="text-center">
              <div class="row items-center justify-center q-gutter-xs no-wrap">
                <!-- View / Print Invoice -->
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  color="primary"
                  icon="visibility"
                  @click="openInvoiceDetails(props.row)"
                >
                  <q-tooltip>View / Print Invoice</q-tooltip>
                </q-btn>

                <!-- Direct Thermal Print -->
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  color="amber-4"
                  icon="print"
                  @click="printSingleInvoice(props.row)"
                >
                  <q-tooltip>Print Receipt</q-tooltip>
                </q-btn>

                <!-- Download PDF -->
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  color="cyan-4"
                  icon="download"
                  @click="downloadSingleInvoicePdf(props.row)"
                >
                  <q-tooltip>Download Invoice</q-tooltip>
                </q-btn>
              </div>
            </q-td>
          </template>
        </q-table>
      </div>
    </q-card>

    <!-- Detailed Invoice View Modal -->
    <InvoiceViewDialog
      v-model="showInvoiceDialog"
      :invoice-id="selectedInvoiceId"
      :order-id="selectedOrderId"
    />
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useQuasar, exportFile } from 'quasar'
import { supabase } from 'src/boot/supabase'
import InvoiceViewDialog from 'src/components/reports/InvoiceViewDialog.vue'
import { printService } from 'src/services/printService'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  shift: { type: Object, default: () => null },
})

defineEmits(['update:modelValue'])

const $q = useQuasar()
const loading = ref(false)
const invoices = ref([])
const searchQuery = ref('')
const filterPaymentMethod = ref(null)

const showInvoiceDialog = ref(false)
const selectedInvoiceId = ref(null)
const selectedOrderId = ref(null)

const paymentMethodOptions = [
  { label: 'All Methods', value: null },
  { label: 'Cash', value: 'cash' },
  { label: 'Card / Visa / Master', value: 'card' },
  { label: 'QR / Online', value: 'qr' },
  { label: 'Bank Transfer', value: 'bank' },
  { label: 'Credit', value: 'credit' },
]

const invoiceColumns = [
  { name: 'invoice_number', label: 'Invoice #', field: 'invoice_number', align: 'left', sortable: true },
  { name: 'order_number', label: 'Order #', field: row => row.orders?.order_number, align: 'left', sortable: true },
  { name: 'table', label: 'Table', field: row => row.orders?.table_number, align: 'left', sortable: true },
  { name: 'payment_method', label: 'Method', field: 'payment_method', align: 'center', sortable: true },
  { name: 'total', label: 'Amount (LKR)', field: 'total', align: 'right', sortable: true },
  { name: 'created_at', label: 'Time', field: 'created_at', align: 'left', sortable: true },
  { name: 'actions', label: 'Actions', align: 'center' },
]

// ── Computed Metrics ──────────────────────────────────────────────────────────
const totalSalesAmount = computed(() => {
  return invoices.value.reduce((sum, inv) => sum + Number(inv.grand_total || inv.total || inv.amount || 0), 0)
})

const cashSalesTotal = computed(() => {
  return invoices.value
    .filter(inv => (inv.payment_method || inv.payment_mode || '').toLowerCase() === 'cash')
    .reduce((sum, inv) => sum + Number(inv.grand_total || inv.total || inv.amount || 0), 0)
})

const cardSalesTotal = computed(() => {
  return invoices.value
    .filter(inv => ['card', 'visa', 'master', 'credit card'].includes((inv.payment_method || inv.payment_mode || '').toLowerCase()))
    .reduce((sum, inv) => sum + Number(inv.grand_total || inv.total || inv.amount || 0), 0)
})

const onlineSalesTotal = computed(() => {
  return invoices.value
    .filter(inv => ['qr', 'online', 'bank'].includes((inv.payment_method || inv.payment_mode || '').toLowerCase()))
    .reduce((sum, inv) => sum + Number(inv.grand_total || inv.total || inv.amount || 0), 0)
})

const variance = computed(() => {
  if (!props.shift || props.shift.status !== 'closed') return 0
  return Number(props.shift.variance || 0)
})

const filteredInvoices = computed(() => {
  let list = invoices.value || []

  if (filterPaymentMethod.value) {
    const target = filterPaymentMethod.value.toLowerCase()
    list = list.filter(inv => {
      const m = (inv.payment_method || inv.payment_mode || '').toLowerCase()
      if (target === 'card') return ['card', 'visa', 'master', 'credit card'].includes(m)
      if (target === 'qr') return ['qr', 'online'].includes(m)
      return m === target
    })
  }

  if (searchQuery.value?.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(inv => {
      const invNum = (inv.invoice_number || '').toLowerCase()
      const orderNum = String(inv.orders?.order_number || inv.order_id || '').toLowerCase()
      const tableNum = String(inv.orders?.table_number || '').toLowerCase()
      return invNum.includes(q) || orderNum.includes(q) || tableNum.includes(q)
    })
  }

  return list
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(val) {
  if (val == null) return '0.00'
  return Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(val) {
  if (!val) return '-'
  return new Date(val).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true
  })
}

function getMethodBadgeColor(method) {
  const m = (method || '').toLowerCase()
  if (m === 'cash') return 'green-7'
  if (['card', 'visa', 'master'].includes(m)) return 'purple-7'
  if (['qr', 'online'].includes(m)) return 'cyan-7'
  if (m === 'bank') return 'blue-7'
  return 'grey-7'
}

// ── Data Fetching ────────────────────────────────────────────────────────────
async function loadShiftInvoices() {
  if (!props.shift) return
  loading.value = true
  invoices.value = []

  try {
    const shift = props.shift
    const openedAt = shift.opened_at
    const closedAt = shift.closed_at || new Date().toISOString()
    const branchId = shift.branch_id

    // Primary search: fetch invoices generated in branch between shift opened_at and closed_at
    let query = supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        order_id,
        subtotal,
        discount,
        tax,
        service_charge,
        total,
        grand_total,
        payment_status,
        payment_type,
        created_at,
        orders:order_id (
          id,
          order_number,
          order_type,
          table_number,
          customer_name,
          payment_method
        )
      `)
      .gte('created_at', openedAt)
      .lte('created_at', closedAt)
      .order('created_at', { ascending: false })

    if (branchId) {
      query = query.eq('branch_id', branchId)
    }

    const { data: invData, error: invError } = await query
    if (invError) console.warn('[ShiftInvoicesDialog] invoice query failed, using shift payments:', invError.message)

    if (!invError && invData && invData.length > 0) {
      invoices.value = invData.map(inv => ({
        ...inv,
        // invoices has no payment_mode column (selecting it 400'd the whole query
        // and forced the REC-xxxx fallback) — use the order's tender method.
        payment_method: inv.orders?.payment_method || inv.payment_type || 'cash'
      }))
    } else {
      // Fallback: check pos_shift_payments if invoices table was empty
      const { data: payData } = await supabase
        .from('pos_shift_payments')
        .select(`
          id,
          order_id,
          payment_method,
          amount,
          payment_time,
          orders:order_id (
            id,
            order_number,
            order_type,
            table_number,
            total_amount
          )
        `)
        .eq('shift_id', shift.id)
        .order('payment_time', { ascending: false })

      if (payData) {
        invoices.value = payData.map(p => ({
          id: p.id,
          invoice_number: `REC-${p.order_id?.substring(0, 8) || p.id.substring(0, 8)}`,
          order_id: p.order_id,
          total: p.amount,
          grand_total: p.amount,
          payment_method: p.payment_method,
          created_at: p.payment_time,
          orders: p.orders
        }))
      }
    }
  } catch (err) {
    console.error('[ShiftInvoicesDialog] Error loading shift invoices:', err)
    $q.notify({ type: 'negative', message: 'Failed to load shift invoices' })
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val && props.shift) {
      loadShiftInvoices()
    }
  }
)

// ── Actions ──────────────────────────────────────────────────────────────────
function openInvoiceDetails(row) {
  selectedInvoiceId.value = row.id
  selectedOrderId.value = row.order_id || row.orders?.id
  showInvoiceDialog.value = true
}

async function printSingleInvoice(row) {
  selectedInvoiceId.value = row.id
  selectedOrderId.value = row.order_id || row.orders?.id
  showInvoiceDialog.value = true
}

function downloadSingleInvoicePdf(row) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('SEVEN WAVES RESTAURANT', 14, 20)
  doc.setFontSize(10)
  doc.text(`Invoice: ${row.invoice_number || row.id}`, 14, 28)
  doc.text(`Date: ${formatDateTime(row.created_at)}`, 14, 34)
  doc.text(`Payment Method: ${(row.payment_method || 'CASH').toUpperCase()}`, 14, 40)
  doc.text(`Total Amount: LKR ${formatCurrency(row.grand_total || row.total || 0)}`, 14, 46)

  doc.save(`${row.invoice_number || 'invoice'}.pdf`)
  $q.notify({ type: 'positive', message: 'Invoice PDF downloaded' })
}

function printShiftSummary() {
  if (!props.shift) return
  printService.printShiftSummary({
    ...props.shift,
    cash_sales_total: cashSalesTotal.value,
    card_sales_total: cardSalesTotal.value,
    qr_sales_total: onlineSalesTotal.value,
  })
}

function exportInvoicesCsv() {
  if (invoices.value.length === 0) {
    $q.notify({ type: 'warning', message: 'No invoices to export' })
    return
  }

  const header = ['Invoice Number', 'Order Number', 'Table', 'Payment Method', 'Amount (LKR)', 'Created At']
  const rows = filteredInvoices.value.map(inv => [
    `"${inv.invoice_number || ''}"`,
    `"${inv.orders?.order_number || ''}"`,
    `"${inv.orders?.table_number || ''}"`,
    `"${inv.payment_method || ''}"`,
    `"${inv.grand_total || inv.total || 0}"`,
    `"${formatDateTime(inv.created_at)}"`,
  ])

  const content = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n')
  exportFile(`shift_${props.shift?.id?.substring(0, 8)}_invoices.csv`, content, 'text/csv')
  $q.notify({ type: 'positive', message: 'Shift invoices exported to CSV' })
}
</script>

<style scoped lang="scss">
.shift-invoices-dialog {
  background: #0f172a;
}

.shift-dialog-toolbar {
  background: #1e293b;
}

.toolbar-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.metrics-strip {
  background: #131d31;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.metric-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
}

.shift-inv-table {
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.font-mono {
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}
</style>
