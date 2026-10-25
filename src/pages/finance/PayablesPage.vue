<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Accounts Payable"
      breadcrumbs="Finance / Receivables & Payables / AP"
      showRefresh
      @refresh="loadData"
    >
      <template #actions>
        <q-input
          v-model="searchQuery"
          placeholder="Search supplier or bill..."
          outlined
          dense
          dark
          color="primary"
          clearable
          style="min-width: 220px"
          class="q-mr-sm"
        >
          <template #prepend>
            <q-icon name="search" size="xs" />
          </template>
        </q-input>

        <q-select
          v-model="selectedBank"
          :options="bankOptions"
          label="Filter by Bank"
          outlined
          dense
          dark
          color="primary"
          style="min-width: 180px"
          emit-value
          map-options
          class="q-mr-sm"
        />
        <q-btn
          unelevated
          icon="picture_as_pdf"
          color="red-6"
          label="PDF"
          @click="exportBankPDF"
          class="q-mr-sm"
          no-caps
        />
        <q-btn
          unelevated
          icon="table_chart"
          color="green-6"
          label="Excel"
          @click="exportBankXLSX"
          no-caps
        />
      </template>
    </ERPToolbar>

    <!-- ══ KPI AGING CARDS ══════════════════════════════════════════════ -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(bucket, i) in agingBuckets" :key="i" class="col-12 col-sm-6 col-md">
        <div :class="['fin-kpi-card', bucket.colorClass]">
          <div class="fin-kpi-card__icon">
            <q-icon name="schedule" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ bucket.label }}</div>
            <div class="fin-kpi-card__value">LKR {{ fmt(bucket.total) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ AP LEDGER ENTRIES TABLE ═════════════════════════════════════ -->
    <div class="fin-panel">
      <div class="fin-panel__header row items-center justify-between">
        <span class="fin-panel__title">AP Ledger Entries ({{ filteredPayables.length }})</span>
        <div class="text-caption text-grey-4">
          Click any <strong class="text-primary">Bill #</strong> to view items or make payment
        </div>
      </div>
      <q-table
        :rows="filteredPayables"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50, 100]"
        :pagination="{ sortBy: 'doc_date', descending: true, rowsPerPage: 20 }"
        class="fin-table"
        :loading="loading"
        no-data-label="No payable entries found"
      >
        <template #body-cell-supplier="props">
          <q-td :props="props">
            <div class="text-weight-bold">{{ props.row.supplier_name }}</div>
            <div class="text-caption text-grey-5" v-if="props.row.bank_name || props.row.bank_account_number">
              {{ props.row.bank_name || 'Bank' }}: {{ props.row.bank_account_number || '-' }}
            </div>
          </q-td>
        </template>

        <template #body-cell-doc_number="props">
          <q-td :props="props">
            <span
              class="text-weight-bold text-primary cursor-pointer text-decoration-underline"
              @click="openInvoiceDetails(props.row)"
            >
              <q-icon name="receipt_long" size="15px" class="q-mr-xs text-primary" />
              {{ props.row.doc_number }}
            </span>
          </q-td>
        </template>

        <template #body-cell-credit="props">
          <q-td :props="props" class="text-right text-weight-bold text-amber-4">
            LKR {{ fmt(props.row.credit) }}
          </q-td>
        </template>

        <template #body-cell-debit="props">
          <q-td :props="props" class="text-right text-green-4">
            LKR {{ fmt(props.row.debit) }}
          </q-td>
        </template>

        <template #body-cell-balance="props">
          <q-td :props="props" class="text-right text-weight-bolder text-red-4">
            LKR {{ fmt(props.row.balance) }}
          </q-td>
        </template>

        <template #body-cell-aging_bucket="props">
          <q-td :props="props" class="text-center">
            <span :class="bucketClass(props.row.aging_bucket)">{{ props.row.aging_bucket }}</span>
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props" class="text-center">
            <q-btn
              v-if="Number(props.row.balance || 0) > 0"
              unelevated
              dense
              no-caps
              size="sm"
              color="positive"
              icon="payments"
              label="Pay Bill"
              @click="openPayDialog(props.row)"
            >
              <q-tooltip>Pay this invoice</q-tooltip>
            </q-btn>
            <q-badge v-else color="grey-8" label="Paid" />
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- ══ INVOICE DETAILS MODAL (CLICKED FROM BILL #) ═════════════════ -->
    <q-dialog v-model="showInvoiceDialog" persistent>
      <q-card style="min-width: 650px; max-width: 95vw" :class="[$q.dark.isActive ? 'bg-grey-10 text-white' : 'bg-white text-dark']">
        <q-card-section class="row items-center q-pa-md" :style="{ background: 'linear-gradient(135deg, #0f4c75 0%, #1976d2 100%)' }">
          <q-icon name="receipt" color="white" size="24px" class="q-mr-sm" />
          <div class="text-h6 text-white text-weight-bold">{{ selectedInvoice?.doc_number }}</div>
          <q-space />
          <q-badge
            :color="selectedInvoice?.status === 'paid' ? 'positive' : selectedInvoice?.status === 'posted' ? 'info' : 'warning'"
            class="text-uppercase text-weight-bold q-mr-md q-px-sm"
          >
            {{ selectedInvoice?.status }}
          </q-badge>
          <q-btn flat round dense icon="close" color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md">
          <!-- Supplier & Meta Info -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-6">
              <div class="text-caption text-grey-5">Supplier</div>
              <div class="text-weight-bold text-subtitle2">{{ selectedInvoice?.suppliers?.name }}</div>
              <div class="text-caption text-grey-4" v-if="selectedInvoice?.suppliers?.bank_name">
                🏦 {{ selectedInvoice.suppliers.bank_name }} — {{ selectedInvoice.suppliers.bank_account_number || '-' }}
              </div>
              <div class="text-caption text-grey-4" v-if="selectedInvoice?.suppliers?.phone">
                📞 {{ selectedInvoice.suppliers.phone }}
              </div>
            </div>
            <div class="col-12 col-md-6">
              <div class="row q-col-gutter-sm">
                <div class="col-6">
                  <div class="text-caption text-grey-5">Bill Date</div>
                  <div class="text-weight-bold">{{ selectedInvoice?.doc_date || '-' }}</div>
                </div>
                <div class="col-6">
                  <div class="text-caption text-grey-5">Due Date</div>
                  <div class="text-weight-bold text-orange">{{ selectedInvoice?.due_date || '-' }}</div>
                </div>
                <div class="col-12" v-if="selectedInvoice?.remarks">
                  <div class="text-caption text-grey-5">Remarks</div>
                  <div class="text-caption">{{ selectedInvoice.remarks }}</div>
                </div>
              </div>
            </div>
          </div>

          <q-separator class="q-my-sm" />

          <!-- Invoice Lines Table -->
          <div class="text-caption text-weight-bold text-uppercase q-mb-xs text-grey-4">Items / Goods Received</div>
          <q-table
            :rows="invoiceLines"
            :columns="lineColumns"
            row-key="id"
            flat
            dense
            dark
            :loading="loadingLines"
            :pagination="{ rowsPerPage: 10 }"
            class="fin-table q-mb-md"
            no-data-label="No line items found for this bill"
          />

          <!-- Totals Breakdown -->
          <div class="row justify-end q-mt-sm">
            <div style="min-width: 280px" class="q-gutter-xs">
              <div class="row justify-between text-body2">
                <span class="text-grey-4">Total Billed:</span>
                <span class="text-weight-bold">LKR {{ fmt(selectedInvoice?.total_amount) }}</span>
              </div>
              <div class="row justify-between text-body2">
                <span class="text-grey-4">Amount Paid:</span>
                <span class="text-weight-bold text-green">LKR {{ fmt(selectedInvoice?.paid_amount) }}</span>
              </div>
              <q-separator class="q-my-xs" />
              <div class="row justify-between text-subtitle1">
                <span class="text-weight-bold">Balance Due:</span>
                <span class="text-weight-bolder text-red">LKR {{ fmt(selectedInvoice?.balance_due) }}</span>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md bg-grey-9">
          <q-btn flat label="Close" color="grey-4" v-close-popup no-caps />
          <q-btn
            v-if="Number(selectedInvoice?.balance_due || 0) > 0"
            unelevated
            color="positive"
            icon="payments"
            label="Pay This Bill"
            no-caps
            @click="openPayFromInvoice"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ══ PAY BILL / RECORD SUPPLIER PAYMENT DIALOG ═══════════════════ -->
    <q-dialog v-model="showPayDialog" persistent>
      <q-card style="min-width: 480px; max-width: 95vw" :class="[$q.dark.isActive ? 'bg-grey-10 text-white' : 'bg-white text-dark']">
        <q-card-section class="row items-center bg-positive text-white q-pa-md">
          <q-icon name="payments" size="24px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Record Supplier Payment</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-md">
          <!-- Summary Banner -->
          <div class="rounded-borders q-pa-sm bg-grey-9 row justify-between items-center">
            <div>
              <div class="text-caption text-grey-4">Supplier</div>
              <div class="text-weight-bold">{{ payTarget?.supplier_name }}</div>
              <div class="text-caption text-primary">Bill # {{ payTarget?.doc_number }}</div>
            </div>
            <div class="text-right">
              <div class="text-caption text-grey-4">Outstanding Due</div>
              <div class="text-subtitle1 text-weight-bolder text-red-4">LKR {{ fmt(payTarget?.balance) }}</div>
            </div>
          </div>

          <!-- Amount to pay -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Payment Amount (LKR) *</div>
            <q-input
              v-model.number="payForm.amount"
              type="number"
              outlined
              dense
              dark
              min="0.01"
              :max="Number(payTarget?.balance || 0)"
              step="0.01"
              prefix="LKR"
            />
          </div>

          <!-- Payment Date & Method -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Payment Date *</div>
              <q-input v-model="payForm.doc_date" type="date" outlined dense dark />
            </div>
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Payment Method *</div>
              <q-select
                v-model="payForm.payment_method"
                :options="['Bank Transfer', 'Cash', 'Cheque']"
                outlined
                dense
                dark
              />
            </div>
          </div>

          <!-- Paying Account (from finance_accounts) -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">
              {{ (payForm.payment_method || '').toLowerCase().includes('cash') ? 'Paying Cash Account *' : 'Paying Bank Account *' }}
            </div>
            <q-select
              v-model="payForm.bank_account_id"
              :options="payingAccountOptions"
              outlined
              dense
              dark
              emit-value
              map-options
              :placeholder="(payForm.payment_method || '').toLowerCase().includes('cash') ? 'Select cash drawer / account' : 'Select bank account'"
            >
              <template #prepend>
                <q-icon :name="(payForm.payment_method || '').toLowerCase().includes('cash') ? 'payments' : 'account_balance'" size="18px" />
              </template>
            </q-select>
            <div class="text-caption text-grey-5 q-mt-xs">
              💵 This account will be CREDITED and Accounts Payable (2000) will be DEBITED.
            </div>
          </div>

          <!-- Reference / Cheque No -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Reference / Cheque Number</div>
            <q-input v-model="payForm.reference" placeholder="e.g. TRF-99210 or CHQ-00123" outlined dense dark />
          </div>

          <!-- Remarks -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Remarks</div>
            <q-input v-model="payForm.remarks" placeholder="Optional notes" outlined dense dark />
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md bg-grey-9">
          <q-btn flat label="Cancel" color="grey-4" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Confirm Payment"
            color="positive"
            icon="check_circle"
            no-caps
            :loading="paying"
            @click="submitSupplierPayment"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchPayableAging } from 'src/services/financeService'
import { createAndPostPayment } from 'src/services/procurementService'
import { useQuasar } from 'quasar'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const payables = ref([])
const companyBankAccounts = ref([])
const financeAccounts = ref([])

const searchQuery = ref('')
const selectedBank = ref('All Banks')
const bankOptions = ['All Banks', 'BOC', 'HNB', 'Commercial Bank', 'Sampath Bank']

// ── Invoices Details State ──────────────────────────────────────────
const showInvoiceDialog = ref(false)
const selectedInvoice = ref(null)
const invoiceLines = ref([])
const loadingLines = ref(false)

const lineColumns = [
  { name: 'line_number', label: '#', field: 'line_number', align: 'center', style: 'width: 40px' },
  { name: 'item_code', label: 'Item Code', field: (r) => r.items?.code || '-', align: 'left' },
  { name: 'item_name', label: 'Item Name', field: (r) => r.items?.name || r.description || '-', align: 'left' },
  { name: 'quantity', label: 'Quantity', field: 'quantity', align: 'right' },
  { name: 'unit_price', label: 'Unit Price', field: 'unit_price', align: 'right', format: (v) => `LKR ${fmt(v)}` },
  { name: 'line_total', label: 'Total', field: 'line_total', align: 'right', format: (v) => `LKR ${fmt(v)}` },
]

// ── Payment Dialog State ────────────────────────────────────────────
const showPayDialog = ref(false)
const payTarget = ref(null)
const paying = ref(false)
const payForm = reactive({
  amount: 0,
  doc_date: new Date().toISOString().split('T')[0],
  payment_method: 'Bank Transfer',
  bank_account_id: null,
  reference: '',
  remarks: '',
})

// Dynamic account filtering: Cash vs Bank based on payment method
const payingAccountOptions = computed(() => {
  const method = (payForm.payment_method || '').toLowerCase()
  const isCash = method.includes('cash')

  const filtered = financeAccounts.value.filter((a) => {
    if (isCash) {
      return a.account_type === 'cash'
    } else {
      return a.account_type === 'bank'
    }
  })

  return filtered.map((a) => {
    const typeLabel = a.account_type === 'cash' ? 'Cash Account' : (a.bank_name || 'Bank')
    const accNum = a.account_number ? ` (${a.account_number})` : ''
    return {
      label: `${a.registered_name}${accNum} [${typeLabel}] — LKR ${fmt(a.current_balance)}`,
      value: a.id,
      account_type: a.account_type,
    }
  })
})

// Auto-switch selected account when payment method toggles between Cash and Bank
watch(
  () => payForm.payment_method,
  () => {
    const opts = payingAccountOptions.value
    if (opts.length > 0) {
      const stillValid = opts.some((o) => o.value === payForm.bank_account_id)
      if (!stillValid) {
        payForm.bank_account_id = opts[0].value
      }
    } else {
      payForm.bank_account_id = null
    }
  },
)

// ── Table Columns ───────────────────────────────────────────────────
const columns = [
  { name: 'supplier', label: 'Supplier & Bank', field: 'supplier_name', align: 'left' },
  { name: 'doc_number', label: 'Bill / Doc #', field: 'doc_number', align: 'left' },
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true },
  { name: 'credit', label: 'Billed Amount (LKR)', field: 'credit', align: 'right' },
  { name: 'debit', label: 'Paid (LKR)', field: 'debit', align: 'right' },
  { name: 'balance', label: 'Balance Due (LKR)', field: 'balance', align: 'right' },
  { name: 'due_date', label: 'Due Date', field: 'due_date', align: 'left' },
  { name: 'aging_bucket', label: 'Aging', field: 'aging_bucket', align: 'center' },
  { name: 'actions', label: 'Action', field: 'id', align: 'center' },
]

// ── Filtered Payables ───────────────────────────────────────────────
const filteredPayables = computed(() => {
  let list = payables.value

  if (selectedBank.value !== 'All Banks') {
    list = list.filter((p) => {
      const bName = p.bank_name || ''
      return (
        bName.toLowerCase().includes(selectedBank.value.toLowerCase()) ||
        selectedBank.value.toLowerCase().includes(bName.toLowerCase())
      )
    })
  }

  if (searchQuery.value && searchQuery.value.trim() !== '') {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(
      (p) =>
        (p.supplier_name && p.supplier_name.toLowerCase().includes(q)) ||
        (p.doc_number && p.doc_number.toLowerCase().includes(q)) ||
        (p.bank_name && p.bank_name.toLowerCase().includes(q))
    )
  }

  // Sort newest first
  return [...list].sort((a, b) => {
    const da = a.doc_date || ''
    const db = b.doc_date || ''
    return db.localeCompare(da)
  })
})

// ── Aging Buckets ───────────────────────────────────────────────────
const agingBuckets = computed(() => {
  const buckets = { current: 0, '1-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 }
  filteredPayables.value.forEach((p) => {
    if (buckets[p.aging_bucket] !== undefined) buckets[p.aging_bucket] += Number(p.balance || 0)
  })
  return [
    { label: 'Current', total: buckets.current, colorClass: 'fin-kpi-card--green' },
    { label: '1-30 Days', total: buckets['1-30 days'], colorClass: 'fin-kpi-card--amber' },
    { label: '31-60 Days', total: buckets['31-60 days'], colorClass: 'fin-kpi-card--red' },
    { label: '61-90 Days', total: buckets['61-90 days'], colorClass: 'fin-kpi-card--purple' },
    { label: '90+ Days', total: buckets['90+ days'], colorClass: 'fin-kpi-card--red' },
  ]
})

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function bucketClass(b) {
  if (b === 'current') return 'fin-badge fin-badge--success'
  if (b === '1-30 days') return 'fin-badge fin-badge--warning'
  return 'fin-badge fin-badge--danger'
}

const currentDateStr = computed(() => {
  const now = new Date()
  return now.toISOString().split('T')[0].replace(/-/g, '/')
})

const currentMonthLabel = computed(() => {
  const now = new Date()
  return now.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
})

function getCompanyBankAccount(bName) {
  if (bName === 'All Banks') return '_______________'
  const match = companyBankAccounts.value.find(
    (a) =>
      a.bank_name?.toLowerCase().includes(bName.toLowerCase()) ||
      bName.toLowerCase().includes(a.bank_name?.toLowerCase()),
  )
  return match?.account_number || '_______________'
}

// ── Open Invoice Details ────────────────────────────────────────────
async function openInvoiceDetails(row) {
  loadingLines.value = true
  showInvoiceDialog.value = true

  try {
    const { data: inv, error } = await supabase
      .from('ap_invoices')
      .select(`
        id, doc_number, doc_date, due_date, total_amount, paid_amount, balance_due, status, remarks, supplier_inv_no, supplier_id,
        suppliers(id, name, bank_name, bank_account_number, bank_branch, phone),
        ap_invoice_lines(id, line_number, description, quantity, unit_price, line_total, item_id, items(id, name, code))
      `)
      .eq('id', row.id)
      .single()

    if (error) throw error

    selectedInvoice.value = inv
    invoiceLines.value = inv.ap_invoice_lines || []
  } catch (err) {
    console.error('Failed to load invoice details:', err)
    $q.notify({ type: 'negative', message: 'Failed to load invoice details: ' + err.message })
  } finally {
    loadingLines.value = false
  }
}

// ── Open Payment Dialog ─────────────────────────────────────────────
function openPayDialog(row) {
  payTarget.value = row
  payForm.amount = Number(row.balance || 0)
  payForm.doc_date = new Date().toISOString().split('T')[0]
  payForm.payment_method = 'Bank Transfer'
  payForm.reference = ''
  payForm.remarks = `Payment for ${row.doc_number}`

  // Pre-select first matching bank account
  const opts = payingAccountOptions.value
  payForm.bank_account_id = opts.length > 0 ? opts[0].value : null

  showPayDialog.value = true
}

function openPayFromInvoice() {
  if (!selectedInvoice.value) return
  const target = {
    id: selectedInvoice.value.id,
    supplier_id: selectedInvoice.value.supplier_id,
    supplier_name: selectedInvoice.value.suppliers?.name,
    doc_number: selectedInvoice.value.doc_number,
    balance: selectedInvoice.value.balance_due,
  }
  openPayDialog(target)
}

// ── Submit Supplier Payment ─────────────────────────────────────────
async function submitSupplierPayment() {
  if (!payForm.amount || payForm.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Please enter a valid payment amount.' })
    return
  }
  if (!payForm.bank_account_id) {
    $q.notify({ type: 'warning', message: 'Please select a paying cash/bank account.' })
    return
  }

  paying.value = true
  try {
    const selectedAcc = financeAccounts.value.find((a) => a.id === payForm.bank_account_id)
    const paymentMethod = (payForm.payment_method || 'bank_transfer').toLowerCase().replace(/ /g, '_')

    const res = await createAndPostPayment(
      {
        supplier_id: payTarget.value.supplier_id,
        doc_date: payForm.doc_date,
        payment_method: paymentMethod,
        reference_no: payForm.reference || null,
        cheque_no: paymentMethod === 'cheque' ? payForm.reference || null : null,
        total_amount: payForm.amount,
        remarks: payForm.remarks || null,
        bank_account_code: selectedAcc?.account_number || selectedAcc?.registered_name || null,
      },
      [{ invoice_id: payTarget.value.id, amount: payForm.amount }],
      true,
    )

    if (!res.success) {
      throw new Error(res.error || 'Payment failed')
    }

    $q.notify({
      type: 'positive',
      icon: 'check_circle',
      message: `✅ Payment ${res.doc_number || ''} recorded successfully! Bill balance reduced.`,
      timeout: 4000,
    })

    showPayDialog.value = false
    showInvoiceDialog.value = false
    await loadData()
  } catch (err) {
    console.error('Payment error:', err)
    $q.notify({ type: 'negative', message: 'Payment failed: ' + err.message })
  } finally {
    paying.value = false
  }
}

// ── PDF Export ──────────────────────────────────────────────────────
function exportBankPDF() {
  const doc = new jsPDF('p', 'mm', 'a4')
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)

  const totalBilled = filteredPayables.value.reduce((s, p) => s + Number(p.credit || 0), 0)
  const totalPaid = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)
  const totalBalance = filteredPayables.value.reduce((s, p) => s + Number(p.balance || 0), 0)

  let y = 18

  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.text(currentDateStr.value, 15, y)
  y += 7

  if (bName !== 'All Banks') {
    doc.text('THE MANAGER', 15, y)
    y += 5
    doc.setFont('times', 'bold')
    doc.text(bName.toUpperCase(), 15, y)
    y += 8
  }

  doc.setFontSize(13)
  doc.setFont('times', 'bold')
  const title = `ACCOUNTS PAYABLE TRANSFER – ${currentMonthLabel.value}`
  doc.text(title, 105, y, { align: 'center' })
  doc.setLineWidth(0.5)
  const titleW = doc.getTextWidth(title)
  doc.line(105 - titleW / 2, y + 1, 105 + titleW / 2, y + 1)
  y += 8

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(10.5)
    doc.text('Dear Sir,', 15, y)
    y += 6

    const bodyText = `Appreciate if you could arrange to Transfer Rs. ${fmt(totalBalance)} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No. ${companyAcc}`
    const bodyLines = doc.splitTextToSize(bodyText, 180)
    doc.text(bodyLines, 15, y)
    y += bodyLines.length * 5 + 4
  }

  doc.setFont('times', 'bold')
  doc.setFontSize(11)
  doc.text('Seven Wave Food Court (Pvt) Ltd', 105, y, { align: 'center' })
  y += 5
  doc.setFontSize(10)
  doc.text(`SUPPLIER PAYMENTS – ${currentMonthLabel.value}`, 105, y, { align: 'center' })
  y += 4

  const tableData = filteredPayables.value.map((p, i) => [
    i + 1,
    p.supplier_name || '',
    p.doc_number || '',
    p.bank_account_number || '-',
    `LKR ${fmt(p.credit)}`,
    `LKR ${fmt(p.debit)}`,
    `LKR ${fmt(p.balance)}`,
  ])

  tableData.push([
    '',
    '',
    '',
    'TOTAL',
    `LKR ${fmt(totalBilled)}`,
    `LKR ${fmt(totalPaid)}`,
    `LKR ${fmt(totalBalance)}`,
  ])

  autoTable(doc, {
    startY: y + 2,
    margin: { left: 15, right: 15 },
    head: [['No.', 'Supplier', 'Invoice/Ref', 'Account No.', 'Billed (LKR)', 'Paid (LKR)', 'Balance Due (LKR)']],
    body: tableData,
    theme: 'grid',
    styles: { font: 'times', fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: {
      fillColor: [235, 235, 235],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 42 },
      2: { cellWidth: 32 },
      3: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [245, 245, 245]
      }
    },
  })

  y = doc.lastAutoTable.finalY + 12
  if (y > 260) {
    doc.addPage()
    y = 20
  }

  if (bName !== 'All Banks') {
    doc.setFont('times', 'normal')
    doc.setFontSize(11)
    doc.text('Thank You', 15, y)
    y += 18
    doc.text('...................................', 15, y)
    y += 5
    doc.setFont('times', 'bold')
    doc.text('Director', 15, y)
  }

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.pdf`
  doc.save(filename)
  $q.notify({ type: 'positive', icon: 'picture_as_pdf', message: `Downloaded: ${filename}` })
}

// ── Excel Export ────────────────────────────────────────────────────
function exportBankXLSX() {
  const bName = selectedBank.value
  const companyAcc = getCompanyBankAccount(bName)

  const totalBilled = filteredPayables.value.reduce((s, p) => s + Number(p.credit || 0), 0)
  const totalPaid = filteredPayables.value.reduce((s, p) => s + Number(p.debit || 0), 0)
  const totalBalance = filteredPayables.value.reduce((s, p) => s + Number(p.balance || 0), 0)

  const wsData = []
  if (bName !== 'All Banks') {
    wsData.push([currentDateStr.value])
    wsData.push(['THE MANAGER'])
    wsData.push([bName.toUpperCase()])
    wsData.push([])
    wsData.push([`ACCOUNTS PAYABLE TRANSFER – ${currentMonthLabel.value}`])
    wsData.push([])
    wsData.push(['Dear Sir,'])
    wsData.push([
      `Appreciate if you could arrange to Transfer Rs. ${fmt(totalBalance)} to the following supplier accounts as accounts payable settlement for ${currentMonthLabel.value} from Rupee Account No. ${companyAcc}`,
    ])
    wsData.push([])
  }

  wsData.push(['Seven Wave Food Court (Pvt) Ltd'])
  wsData.push([`SUPPLIER PAYMENTS – ${currentMonthLabel.value}`])
  wsData.push([])
  wsData.push([
    'No.',
    'Supplier',
    'Bank',
    'Account No.',
    'Invoice/Ref',
    'Date',
    'Due Date',
    'Billed Amount (LKR)',
    'Paid Amount (LKR)',
    'Balance Due (LKR)',
    'Aging Bucket',
    'Status',
  ])

  filteredPayables.value.forEach((p, i) => {
    wsData.push([
      i + 1,
      p.supplier_name || '',
      p.bank_name || '-',
      p.bank_account_number || '-',
      p.doc_number || '',
      p.doc_date || '',
      p.due_date || '',
      Number(p.credit || 0),
      Number(p.debit || 0),
      Number(p.balance || 0),
      p.aging_bucket || '',
      p.status || '',
    ])
  })

  wsData.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'TOTAL',
    totalBilled,
    totalPaid,
    totalBalance,
    '',
    '',
  ])

  if (bName !== 'All Banks') {
    wsData.push([])
    wsData.push(['Thank You'])
    wsData.push([])
    wsData.push(['...................................'])
    wsData.push(['Director'])
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 35 },
    { wch: 18 },
    { wch: 22 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, bName.substring(0, 31))

  const filename = `AP_Export_${bName.replace(/\s+/g, '_')}_${currentDateStr.value.replace(/\//g, '')}.xlsx`
  XLSX.writeFile(wb, filename)
  $q.notify({ type: 'positive', icon: 'table_chart', message: `Downloaded: ${filename}` })
}

// ── Initial Load ────────────────────────────────────────────────────
async function loadData() {
  loading.value = true

  // 1. Load company bank accounts for letter header
  const { data: banks } = await supabase
    .from('finance_accounts')
    .select('registered_name, bank_name, account_number, account_type, current_balance, id')
    .eq('is_active', true)
    .is('deleted_at', null)

  financeAccounts.value = banks || []
  companyBankAccounts.value = (banks || [])
    .filter((b) => b.account_type === 'bank')
    .map((b) => ({
      name: b.registered_name,
      bank_name: b.bank_name,
      account_number: b.account_number,
    }))

  // 2. Load payables aging list
  const { data } = await fetchPayableAging()
  payables.value = data || []
  loading.value = false
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
