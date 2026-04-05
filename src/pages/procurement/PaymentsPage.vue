<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div>
        <div class="text-h5 text-weight-bold">Supplier Payments</div>
        <div class="text-caption text-grey">Record and allocate supplier payments</div>
      </div>
      <q-btn unelevated color="primary" icon="add" label="New Payment" @click="createNewPayment" />
    </div>

    <!-- Payments List -->
    <q-table
      :rows="payments"
      :columns="columns"
      row-key="id"
      :loading="loading"
      flat
      bordered
      :rows-per-page-options="[15, 25, 50]"
    >
      <template v-slot:body-cell-status="props">
        <q-td :props="props" align="center">
          <q-chip
            :color="statusColor(props.row.status)"
            text-color="white"
            dense
            size="sm"
            class="text-uppercase text-weight-bold"
          >
            {{ props.row.status }}
          </q-chip>
        </q-td>
      </template>
      <template v-slot:body-cell-actions="props">
        <q-td :props="props" align="right">
          <q-btn
            flat
            round
            color="primary"
            icon="visibility"
            size="sm"
            @click="editPayment(props.row)"
          />
        </q-td>
      </template>
    </q-table>

    <!-- ─── Payment Dialog ───────────────────────────────────────────────── -->
    <q-dialog v-model="dialogVisible" persistent>
      <q-card
        style="width: 860px; max-width: 96vw; max-height: 90vh; display: flex; flex-direction: column"
        class="erp-dialog-card erp-border-radius shadow-6"
      >
        <!-- Dialog Header -->
        <q-card-section
          class="row items-center justify-between q-py-sm q-px-md"
          style="background: var(--erp-primary); color: #fff; border-radius: 12px 12px 0 0"
        >
          <div class="row items-center q-gutter-sm">
            <q-icon name="payments" size="22px" />
            <span class="text-subtitle1 text-weight-bold">
              {{ isEditing ? 'Payment Details' : 'New Supplier Payment' }}
            </span>
            <q-chip
              v-if="form.doc_number && form.doc_number !== 'NEW'"
              dense
              color="white"
              text-color="primary"
              size="sm"
              class="text-weight-bold"
            >
              {{ form.doc_number }}
            </q-chip>
          </div>
          <q-btn icon="close" flat round dense color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="col scroll q-pa-md">
          <!-- ── Two-column Layout ────────────────────────────────────── -->
          <div class="row q-col-gutter-md">

            <!-- LEFT: Payment Details (40%) -->
            <div class="col-12 col-md-5">
              <div class="pay-section-label">Payment Details</div>

              <div class="column q-gutter-sm">
                <!-- Supplier -->
                <q-select
                  v-model="form.supplier"
                  :options="supplierOptions"
                  option-label="name"
                  label="Supplier *"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                  @update:model-value="onSupplierChange"
                >
                  <template v-slot:prepend>
                    <q-icon name="storefront" color="grey-6" />
                  </template>
                </q-select>

                <!-- Date -->
                <q-input
                  v-model="form.doc_date"
                  type="date"
                  label="Payment Date *"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                >
                  <template v-slot:prepend>
                    <q-icon name="event" color="grey-6" />
                  </template>
                </q-input>

                <!-- Method -->
                <q-select
                  v-model="form.payment_method"
                  :options="['Cash', 'Petty Cash', 'Bank Transfer', 'Cheque', 'Card']"
                  label="Payment Method"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                  @update:model-value="onPaymentMethodChange"
                >
                  <template v-slot:prepend>
                    <q-icon name="account_balance_wallet" color="grey-6" />
                  </template>
                </q-select>

                <!-- Bank Account (shows only for bank/cheque/card methods) -->
                <q-select
                  v-if="requiresBankAccount"
                  v-model="form.bank_account_code"
                  :options="bankAccountOptions"
                  option-value="code"
                  option-label="name"
                  emit-value
                  map-options
                  label="Bank Account *"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                  clearable
                >
                  <template v-slot:prepend>
                    <q-icon name="account_balance" color="grey-6" />
                  </template>
                </q-select>

                <!-- Reference -->
                <q-input
                  v-model="form.reference"
                  label="Ref / Cheque #"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                >
                  <template v-slot:prepend>
                    <q-icon name="tag" color="grey-6" />
                  </template>
                </q-input>

                <!-- Remarks -->
                <q-input
                  v-model="form.remarks"
                  label="Remarks"
                  outlined
                  dense
                  type="textarea"
                  :rows="2"
                  :readonly="form.status !== 'draft'"
                />

              </div>

              <!-- ── Summary card ─────────────────────────────────── -->
              <div class="pay-summary-card q-mt-md">
                <div class="pay-summary-row">
                  <span class="pay-summary-label">Invoices Selected</span>
                  <span class="pay-summary-value text-primary">{{ form.allocations.length }}</span>
                </div>
                <div class="pay-summary-row">
                  <span class="pay-summary-label">Total Allocated</span>
                  <span class="pay-summary-value text-weight-bold">{{ formatCurrency(totalAllocated) }}</span>
                </div>
                <q-separator class="q-my-sm" />
                <div class="pay-summary-total-row">
                  <span class="pay-summary-total-label">Payment Amount</span>
                  <span class="pay-summary-total-value" :class="canPost ? 'text-positive' : 'text-negative'">
                    {{ formatCurrency(form.amount) }}
                  </span>
                </div>
                <div v-if="!canPost && form.supplier && form.amount > 0" class="q-mt-xs text-caption text-negative">
                  <q-icon name="warning" size="12px" /> Amount must match total allocated
                </div>
                <div v-if="canPost" class="q-mt-xs text-caption text-positive">
                  <q-icon name="check_circle" size="12px" /> Ready to post
                </div>
              </div>
            </div>

            <!-- RIGHT: Invoice Selection (60%) -->
            <div class="col-12 col-md-7">
              <div class="row items-center justify-between q-mb-sm">
                <div class="pay-section-label" style="margin-bottom: 0">Select Invoices to Pay</div>
                <div class="row q-gutter-xs">
                  <q-btn
                    flat
                    dense
                    icon="done_all"
                    color="primary"
                    size="sm"
                    label="Pay All"
                    @click="autoAllocateInvoices"
                    :disable="!form.supplier || form.status !== 'draft'"
                  />
                  <q-btn
                    flat
                    dense
                    icon="clear_all"
                    color="grey-6"
                    size="sm"
                    label="Clear"
                    @click="clearAllocations"
                    :disable="form.allocations.length === 0 || form.status !== 'draft'"
                  />
                </div>
              </div>

              <!-- No supplier selected state -->
              <div
                v-if="!form.supplier"
                class="column items-center justify-center q-py-xl text-grey-5"
                style="border: 2px dashed var(--erp-border); border-radius: 8px; min-height: 200px"
              >
                <q-icon name="storefront" size="36px" class="q-mb-sm" />
                <div class="text-body2">Select a supplier to view open invoices</div>
              </div>

              <!-- Invoice list -->
              <template v-else>
                <div
                  v-if="openInvoices.length === 0"
                  class="column items-center justify-center q-py-xl text-grey-5"
                  style="border: 2px dashed var(--erp-border); border-radius: 8px; min-height: 200px"
                >
                  <q-icon name="receipt_long" size="36px" class="q-mb-sm" />
                  <div class="text-body2">No posted invoices pending payment</div>
                </div>

                <div v-else class="invoice-list">
                  <div
                    v-for="inv in openInvoices"
                    :key="inv.id"
                    class="invoice-item"
                    :class="{ 'invoice-item--selected': inv.isSelected }"
                    @click="form.status === 'draft' && toggleInvoice(inv)"
                  >
                    <div class="invoice-item__check">
                      <q-checkbox
                        v-model="inv.isSelected"
                        :disable="form.status !== 'draft'"
                        @update:model-value="onInvoiceSelect(inv)"
                        @click.stop
                      />
                    </div>
                    <div class="invoice-item__info">
                      <div class="text-weight-bold text-body2">{{ inv.doc_number }}</div>
                      <div class="text-caption text-grey-6">
                        Due: {{ inv.due_date ? formatDate(inv.due_date) : '—' }}
                      </div>
                    </div>
                    <div class="invoice-item__amounts">
                      <div class="text-caption text-grey-6 text-right">Balance</div>
                      <div class="text-weight-bold text-body2">{{ formatCurrency(inv.balance_due) }}</div>
                      <q-input
                        v-if="inv.isSelected && form.status === 'draft'"
                        v-model.number="inv.allocation"
                        type="number"
                        dense
                        outlined
                        class="q-mt-xs"
                        style="width: 110px"
                        :min="0"
                        :max="inv.balance_due"
                        @update:model-value="recalcFromTable"
                        @click.stop
                      />
                      <div v-else-if="inv.isSelected" class="text-positive text-weight-bold text-caption">
                        Paying: {{ formatCurrency(inv.allocation) }}
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </q-card-section>

        <!-- Action Bar -->
        <q-separator />
        <q-card-actions class="q-pa-md row items-center justify-between" style="background: var(--erp-bg-hover)">
          <div class="text-caption text-grey-6">
            <template v-if="canPost">
              <q-icon name="check_circle" color="positive" size="16px" />
              Payment of {{ formatCurrency(form.amount) }} ready to post
            </template>
          </div>
          <div class="row q-gutter-sm">
            <q-btn flat label="Cancel" @click="dialogVisible = false" />
            <q-btn
              v-if="form.status === 'draft' || !form.status"
              unelevated
              color="primary"
              icon="check"
              label="Post Payment"
              :loading="saving"
              :disable="!canPost"
              @click="savePayment('posted')"
            >
              <q-tooltip v-if="!canPost">
                Select invoices and ensure total matches payment amount
              </q-tooltip>
            </q-btn>
          </div>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listPayments,
  createAndPostPayment,
  allocatePayment,
  postPayment,
  getOpenInvoicesForSupplier,
  listSuppliers,
} from 'src/services/procurementService'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const payments = ref([])
const supplierOptions = ref([])
const openInvoices = ref([])

const defaultForm = {
  id: '',
  doc_number: 'NEW',
  supplier: null,
  supplier_id: null,
  doc_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  amount: 0,
  payment_method: 'Cash',
  bank_account_code: null,
  reference: '',
  remarks: '',
  status: 'draft',
  allocations: [],
}
const form = ref({ ...defaultForm })

const columns = [
  { name: 'doc_number', label: 'Payment #', field: 'doc_number', align: 'left', sortable: true },
  {
    name: 'doc_date',
    label: 'Date',
    field: 'doc_date',
    align: 'left',
    format: (val) => date.formatDate(val, 'DD/MM/YYYY'),
  },
  {
    name: 'supplier',
    label: 'Supplier',
    field: (row) => row.suppliers?.name || '-',
    align: 'left',
  },
  {
    name: 'amount',
    label: 'Amount',
    field: 'total_amount',
    align: 'right',
    format: (val) => formatCurrency(val),
  },
  {
    name: 'method',
    label: 'Method',
    field: (row) => (row.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    align: 'left',
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'right', width: 60 },
]


onMounted(async () => {
  loading.value = true
  await Promise.all([fetchPayments(), fetchSuppliers()])
  loading.value = false
})

async function fetchPayments() {
  try {
    payments.value = await listPayments()
  } catch (e) {
    console.error('Failed to load payments:', e)
  }
}
async function fetchSuppliers() {
  supplierOptions.value = await listSuppliers()
}

// Bank accounts available for payment selection
const bankAccountOptions = [
  { code: '1010', name: 'Bank Account - Main' },
  { code: '1011', name: 'Bank Account - HNB (Payroll)' },
  { code: '1012', name: 'Bank Account - Commercial Bank' },
  { code: '1013', name: 'Bank Account - Sampath Bank' },
  { code: '1014', name: 'Bank Account - BOC' },
]

// Show bank account selector only for bank-type methods
const requiresBankAccount = computed(() => {
  const m = (form.value.payment_method || '').toLowerCase()
  return m.includes('bank') || m.includes('cheque') || m.includes('card')
})

function onPaymentMethodChange() {
  // Reset bank_account_code when switching to cash/petty cash
  if (!requiresBankAccount.value) {
    form.value.bank_account_code = null
  }
}

async function onSupplierChange(supplier) {
  form.value.allocations = []
  form.value.amount = 0
  if (supplier) {
    try {
      const data = await getOpenInvoicesForSupplier(supplier.id)
      openInvoices.value = data.map((inv) => ({
        ...inv,
        isSelected: false,
        allocation: 0,
      }))
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Failed to load invoices', caption: e.message })
    }
  } else {
    openInvoices.value = []
  }
}

function toggleInvoice(inv) {
  inv.isSelected = !inv.isSelected
  onInvoiceSelect(inv)
}

function onInvoiceSelect(inv) {
  if (inv.isSelected) {
    inv.allocation = inv.balance_due
  } else {
    inv.allocation = 0
  }
  recalcFromTable()
}

function recalcFromTable() {
  const selected = openInvoices.value.filter((i) => i.isSelected && i.allocation > 0)
  form.value.allocations = selected.map((i) => ({
    invoice_id: i.id,
    amount: i.allocation,
  }))
  form.value.amount = totalAllocated.value
}

function autoAllocateInvoices() {
  openInvoices.value.forEach((inv) => {
    inv.isSelected = true
    inv.allocation = inv.balance_due
  })
  recalcFromTable()
}

function clearAllocations() {
  openInvoices.value.forEach((inv) => {
    inv.isSelected = false
    inv.allocation = 0
  })
  recalcFromTable()
}

function formatCurrency(val) {
  return `LKR ${(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(val) {
  return date.formatDate(val, 'DD/MM/YYYY')
}

function statusColor(status) {
  if (status === 'posted') return 'green-7'
  if (status === 'draft') return 'grey-7'
  return 'red-7'
}

function createNewPayment() {
  isEditing.value = false
  form.value = { ...defaultForm, allocations: [] }
  openInvoices.value = []
  dialogVisible.value = true
}

function editPayment(row) {
  isEditing.value = true

  const supplierObj = row.suppliers
    ? { id: row.suppliers.id, name: row.suppliers.name, code: row.suppliers.code }
    : supplierOptions.value.find((s) => s.id === row.supplier_id) || null

  const pmDisplay = (row.payment_method || 'cash')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

  const existingAllocs = (row.supplier_payment_allocations || []).map((spa) => ({
    invoice_id: spa.ap_invoices?.id || spa.invoice_id,
    amount: spa.amount,
    doc_number: spa.ap_invoices?.doc_number,
    balance_due: spa.ap_invoices?.balance_due,
  }))

  form.value = {
    ...defaultForm,
    id: row.id,
    doc_number: row.doc_number,
    supplier: supplierObj,
    supplier_id: row.supplier_id,
    doc_date: row.doc_date,
    amount: parseFloat(row.total_amount) || 0,
    payment_method: pmDisplay,
    bank_account_code: row.bank_account_code || null,
    reference: row.reference_no || '',
    remarks: row.remarks || '',
    status: row.status,
    allocations: existingAllocs,
  }

  if (row.status === 'posted') {
    openInvoices.value = existingAllocs.map((a) => ({
      id: a.invoice_id,
      doc_number: a.doc_number,
      balance_due: a.balance_due,
      isSelected: true,
      allocation: a.amount,
    }))
  } else {
    openInvoices.value = []
    if (supplierObj) {
      getOpenInvoicesForSupplier(supplierObj.id)
        .then((data) => {
          openInvoices.value = data.map((inv) => {
            const existing = existingAllocs.find((a) => a.invoice_id === inv.id)
            return {
              ...inv,
              isSelected: !!existing,
              allocation: existing ? existing.amount : 0,
            }
          })
        })
        .catch(() => {})
    }
  }

  dialogVisible.value = true
}


const totalAllocated = computed(() =>
  form.value.allocations.reduce((sum, a) => sum + (a.amount || 0), 0),
)

const canPost = computed(() => {
  if (!form.value.supplier || form.value.amount <= 0) return false
  if (form.value.allocations.length === 0) return false
  return Math.abs(form.value.amount - totalAllocated.value) < 0.01
})

async function savePayment(targetStatus) {
  saving.value = true
  try {
    const supplierId = form.value.supplier?.id || form.value.supplier_id
    if (!supplierId || !form.value.amount) {
      $q.notify({ type: 'warning', message: 'Supplier and Amount required' })
      return
    }
    if (targetStatus === 'posted' && form.value.allocations.length === 0) {
      $q.notify({ type: 'warning', message: 'Select at least one invoice to allocate' })
      return
    }

    // Validate bank account selected for bank-type methods
    const pm = form.value.payment_method || 'Cash'
    const needsBank = pm.toLowerCase().includes('bank') || pm.toLowerCase().includes('cheque') || pm.toLowerCase().includes('card')
    if (needsBank && !form.value.bank_account_code) {
      $q.notify({ type: 'warning', message: 'Please select the Bank Account used for this payment' })
      return
    }

    const paymentMethod = pm.toLowerCase().replace(/ /g, '_')

    if (!form.value.id) {
      // New payment: use atomic SECURITY DEFINER RPC (bypasses RLS)
      const res = await createAndPostPayment(
        {
          supplier_id: supplierId,
          doc_date: form.value.doc_date,
          payment_method: paymentMethod,
          reference_no: form.value.reference || null,
          cheque_no: paymentMethod === 'cheque' ? form.value.reference || null : null,
          total_amount: form.value.amount,
          remarks: form.value.remarks || null,
          bank_account_code: form.value.bank_account_code || null,
        },
        form.value.allocations,
        targetStatus === 'posted',
      )
      if (!res.success) throw new Error(res.error || 'Payment failed')
      $q.notify({
        type: 'positive',
        message:
          targetStatus === 'posted'
            ? `Payment ${res.doc_number} Posted Successfully`
            : `Payment ${res.doc_number} saved as Draft`,
      })
    } else {
      // Existing draft payment: allocate then post
      if (form.value.allocations.length > 0) {
        await allocatePayment(form.value.id, form.value.allocations)
      }
      if (targetStatus === 'posted') {
        const res = await postPayment(form.value.id)
        if (!res.success) throw new Error(res.error || 'Posting failed')
        $q.notify({ type: 'positive', message: `Payment ${res.doc_number} Posted Successfully` })
      } else {
        $q.notify({ type: 'positive', message: 'Payment saved as draft' })
      }
    }

    dialogVisible.value = false
    fetchPayments()
  } catch (e) {
    console.error('[savePayment] error:', e)
    $q.notify({
      type: 'negative',
      message: 'Payment Failed',
      caption: e.message,
      timeout: 6000,
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pay-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--erp-text-secondary, #888);
  margin-bottom: 10px;
}

/* Summary card */
.pay-summary-card {
  border: 1px solid var(--erp-border, #e0e0e0);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--erp-bg-hover, #f9f9f9);
}
.pay-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}
.pay-summary-label {
  font-size: 13px;
  color: var(--erp-text-secondary, #888);
}
.pay-summary-value {
  font-size: 14px;
}
.pay-summary-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}
.pay-summary-total-label {
  font-size: 14px;
  font-weight: 600;
}
.pay-summary-total-value {
  font-size: 20px;
  font-weight: 800;
}

/* Invoice list */
.invoice-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 340px;
  overflow-y: auto;
  padding-right: 2px;
}
.invoice-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1.5px solid var(--erp-border, #e0e0e0);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  background: var(--erp-bg, #fff);
}
.invoice-item:hover {
  border-color: var(--erp-primary, #1976d2);
  background: var(--erp-bg-hover, #f4f8ff);
}
.invoice-item--selected {
  border-color: var(--erp-primary, #1976d2);
  background: #eef5ff;
}
.invoice-item__check {
  flex-shrink: 0;
}
.invoice-item__info {
  flex: 1;
  min-width: 0;
}
.invoice-item__amounts {
  text-align: right;
  flex-shrink: 0;
}
</style>
