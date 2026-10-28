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

                <!-- Amount to pay: follows the ticked bills until the user types
                     an amount (or picks a planned cheque); then it stays fixed
                     and "Auto-allocate" spreads it oldest-first. -->
                <q-input
                  :model-value="form.amount"
                  type="number"
                  label="Amount to Pay *"
                  outlined
                  dense
                  :min="0"
                  step="0.01"
                  :readonly="form.status !== 'draft'"
                  :hint="amountHint"
                  @update:model-value="onAmountInput"
                >
                  <template v-slot:prepend>
                    <q-icon name="payments" color="grey-6" />
                  </template>
                  <template v-slot:append>
                    <q-btn
                      v-if="form.status === 'draft' && form.allocations.length > 0 && allocationDiff !== 0"
                      flat
                      dense
                      round
                      size="sm"
                      icon="sync"
                      color="primary"
                      @click="matchAmountToAllocations"
                    >
                      <q-tooltip>Set the amount to the allocated total</q-tooltip>
                    </q-btn>
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

                <!-- Bank / Cash Account (dynamically shows based on payment method) -->
                <q-select
                  v-model="form.bank_account_code"
                  :options="payingAccountOptions"
                  option-value="code"
                  option-label="name"
                  emit-value
                  map-options
                  :label="isCashMethod ? 'Cash Account *' : 'Bank Account *'"
                  outlined
                  dense
                  :readonly="form.status !== 'draft'"
                  clearable
                >
                  <template v-slot:prepend>
                    <q-icon :name="isCashMethod ? 'payments' : 'account_balance'" color="grey-6" />
                  </template>
                </q-select>

                <!-- Cheque options when Cheque method is selected -->
                <div v-if="(form.payment_method || '').toLowerCase().includes('cheque')" class="q-pa-sm bg-grey-2 rounded-borders q-gutter-xs">
                  <div class="row items-center justify-between q-mb-xs">
                    <span class="text-caption text-weight-bold text-primary">Cheque Selection Mode</span>
                    <div class="row q-gutter-sm">
                      <q-radio v-model="form.cheque_source" val="planned" label="Planned Cheque" dense :disable="form.status !== 'draft'" />
                      <q-radio v-model="form.cheque_source" val="new" label="New Cheque" dense :disable="form.status !== 'draft'" />
                    </div>
                  </div>

                  <!-- Planned Cheque Dropdown -->
                  <div v-if="form.cheque_source === 'planned'" class="q-mb-xs">
                    <q-select
                      v-model="form.selected_planned_cheque"
                      :options="plannedChequeOptions"
                      label="Select Planned Cheque *"
                      outlined
                      dense
                      emit-value
                      map-options
                      :readonly="form.status !== 'draft'"
                      @update:model-value="onPlannedChequeSelected"
                    >
                      <template #no-option>
                        <div class="q-pa-sm text-caption text-grey-6">
                          No planned cheques found for this bank account.
                        </div>
                      </template>
                    </q-select>
                  </div>

                  <!-- Cheque Number & Cheque Date -->
                  <div class="row q-col-gutter-sm q-mt-xs">
                    <div class="col-6">
                      <q-input
                        v-model="form.reference"
                        label="Cheque #"
                        outlined
                        dense
                        :readonly="form.status !== 'draft' || (form.cheque_source === 'planned' && !!form.selected_planned_cheque)"
                      >
                        <template v-slot:prepend>
                          <q-icon name="tag" color="grey-6" />
                        </template>
                      </q-input>
                    </div>
                    <div class="col-6">
                      <q-input
                        v-model="form.cheque_date"
                        type="date"
                        label="Cheque Date (PDC)"
                        outlined
                        dense
                        :readonly="form.status !== 'draft'"
                      >
                        <template v-slot:prepend>
                          <q-icon name="event" color="grey-6" />
                        </template>
                      </q-input>
                    </div>
                  </div>
                </div>

                <!-- Reference (non-cheque) -->
                <q-input
                  v-else
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
                  <q-icon name="warning" size="12px" />
                  <template v-if="form.allocations.length === 0"> Select at least one bill to pay</template>
                  <template v-else-if="allocationDiff > 0">
                    {{ formatCurrency(allocationDiff) }} not allocated — amount must match total allocated
                  </template>
                  <template v-else-if="allocationDiff < 0">
                    Over-allocated by {{ formatCurrency(-allocationDiff) }} — amount must match total allocated
                  </template>
                  <template v-else> Amount must match total allocated</template>
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
                    icon="low_priority"
                    color="primary"
                    size="sm"
                    label="Oldest First"
                    @click="allocateAmountOldestFirst"
                    :disable="!form.supplier || form.status !== 'draft' || openInvoices.length === 0 || !(Number(form.amount) > 0)"
                  >
                    <q-tooltip>Spread the payment amount across bills, oldest first</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    icon="done_all"
                    color="primary"
                    size="sm"
                    label="Pay All"
                    @click="autoAllocateInvoices"
                    :disable="!form.supplier || form.status !== 'draft' || openInvoices.length === 0"
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
                <!-- Loading State -->
                <div
                  v-if="loadingInvoices"
                  class="column items-center justify-center q-py-xl text-primary"
                  style="border: 2px dashed var(--erp-border); border-radius: 8px; min-height: 200px"
                >
                  <q-spinner-dots size="40px" color="primary" />
                  <div class="text-caption text-grey-7 q-mt-sm">Loading open invoices...</div>
                </div>

                <div
                  v-else-if="openInvoices.length === 0"
                  class="column items-center justify-center q-py-xl text-grey-5"
                  style="border: 2px dashed var(--erp-border); border-radius: 8px; min-height: 200px"
                >
                  <q-icon
                    :name="unpostedSummary && unpostedSummary.count > 0 ? 'pending_actions' : 'receipt_long'"
                    size="36px"
                    class="q-mb-sm"
                    :color="unpostedSummary && unpostedSummary.count > 0 ? 'warning' : undefined"
                  />
                  <div class="text-body2 text-center" :class="{ 'text-grey-8': unpostedSummary && unpostedSummary.count > 0 }">
                    {{ emptyStateText.title }}
                  </div>
                  <div v-if="emptyStateText.detail" class="text-caption text-grey-7 text-center q-mt-xs q-px-md">
                    {{ emptyStateText.detail }}
                  </div>
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
                      <div class="text-weight-bold text-body2">
                        {{ inv.doc_number }}
                        <span v-if="inv.supplier_inv_no" class="text-caption text-grey-7">({{ inv.supplier_inv_no }})</span>
                      </div>
                      <div class="text-caption text-grey-6">
                        Date: {{ inv.doc_date ? formatDate(inv.doc_date) : '—' }}
                        · GRN: {{ inv.grn_number || '—' }}
                        <template v-if="inv.due_date"> · Due: {{ formatDate(inv.due_date) }}</template>
                      </div>
                      <div v-if="inv.total_amount !== undefined" class="text-caption text-grey-6">
                        Total: {{ formatCurrency(inv.total_amount) }} · Paid: {{ formatCurrency(inv.paid_amount) }}
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
            <q-btn flat label="Close" @click="dialogVisible = false" />
            <q-btn
              v-if="form.id && form.status === 'posted'"
              outline
              color="negative"
              icon="block"
              label="Cancel Payment"
              :loading="saving"
              @click="confirmCancelPayment"
            />
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
import { ref, onMounted, computed, watch } from 'vue'
import { useQuasar, date } from 'quasar'
import {
  listPayments,
  createAndPostPayment,
  allocatePayment,
  postPayment,
  cancelPayment,
  getSupplierBillsForPayment,
  listSuppliers,
  allocateOldestFirst,
  clampAllocation,
  sumAmounts,
  createLatestRequestGuard,
  describeUnpostedBills,
  isPayableBill,
} from 'src/services/procurementService'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const saving = ref(false)

const payments = ref([])
const supplierOptions = ref([])
const openInvoices = ref([])
const loadingInvoices = ref(false)
/** { count, total } of the supplier's draft/approved bills (not payable yet) */
const unpostedSummary = ref(null)
/**
 * true once the user typed an amount or picked a planned cheque: from then on
 * ticking bills must NOT overwrite form.amount (a cheque's face value is
 * fixed) — the difference is shown instead. false → amount follows the ticks.
 */
const amountLocked = ref(false)
/** Latest-request-wins guard for bill loading (supplier switch / edit). */
const billRequests = createLatestRequestGuard()

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
  cheque_source: 'planned',
  selected_planned_cheque: null,
  cheque_date: date.formatDate(Date.now(), 'YYYY-MM-DD'),
  cheque_id: null,
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

const financeAccounts = ref([])
const plannedCheques = ref([])

const plannedChequeOptions = computed(() => {
  return plannedCheques.value.map((c) => ({
    label: `Cheque #${c.cheque_no} (${c.cheque_date}) — LKR ${formatCurrency(c.amount)} ${c.issued_to ? '— ' + c.issued_to : ''}`,
    value: c.id,
    cheque: c,
  }))
})

async function loadPlannedCheques(bankAccountId = null) {
  let q = supabase
    .from('finance_cheques')
    .select('id, cheque_no, cheque_date, amount, issued_to, bank_account_id')
    .eq('status', 'planned')
    .order('cheque_date', { ascending: true })

  if (bankAccountId) {
    q = q.eq('bank_account_id', bankAccountId)
  }

  const { data } = await q
  plannedCheques.value = data || []
}

function onPlannedChequeSelected(val) {
  const opt = plannedChequeOptions.value.find((o) => o.value === val)
  if (opt?.cheque) {
    const c = opt.cheque
    form.value.reference = c.cheque_no
    form.value.cheque_date = c.cheque_date
    if (Number(c.amount) > 0) {
      // The cheque's face value is fixed: lock it so ticking bills never
      // silently replaces it. Spread it oldest-first if nothing is ticked yet.
      form.value.amount = Math.round(Number(c.amount) * 100) / 100
      amountLocked.value = true
      if (form.value.allocations.length === 0 && openInvoices.value.length > 0) {
        allocateAmountOldestFirst()
      }
    }
    form.value.cheque_id = c.id
  }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([fetchPayments(), fetchSuppliers(), fetchFinanceAccounts()])
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

async function fetchFinanceAccounts() {
  try {
    const { data } = await supabase
      .from('finance_accounts')
      .select('id, registered_name, bank_name, account_number, account_type, current_balance')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('registered_name')
    financeAccounts.value = data || []
    
    // Default account if not selected
    if (!form.value.bank_account_code && payingAccountOptions.value.length > 0) {
      form.value.bank_account_code = payingAccountOptions.value[0].code
    }
  } catch (e) {
    console.error('Failed to load finance accounts:', e)
  }
}

// Method type helpers
const isCashMethod = computed(() => {
  const m = (form.value.payment_method || '').toLowerCase()
  return m.includes('cash')
})

// Dynamically filter accounts: Cash accounts when Cash/Petty Cash is picked, Bank accounts when Bank/Cheque/Card is picked
const payingAccountOptions = computed(() => {
  const isCash = isCashMethod.value
  const isPetty = (form.value.payment_method || '').toLowerCase().includes('petty')

  const list = financeAccounts.value.filter((a) => {
    if (isPetty) {
      return a.account_type === 'petty_cash' || a.registered_name.toLowerCase().includes('petty')
    }
    if (isCash) {
      return a.account_type === 'cash'
    }
    return a.account_type === 'bank'
  })

  return list.map((a) => {
    const typeLabel = a.account_type === 'cash' ? 'Cash Account' : (a.bank_name || 'Bank')
    const accNum = a.account_number ? ` (${a.account_number})` : ''
    return {
      code: a.account_number || a.registered_name,
      name: `${a.registered_name}${accNum} [${typeLabel}] — LKR ${Number(a.current_balance || 0).toLocaleString()}`,
      id: a.id,
    }
  })
})

async function onPaymentMethodChange() {
  const opts = payingAccountOptions.value
  if (opts.length > 0) {
    const stillValid = opts.some((o) => o.code === form.value.bank_account_code)
    if (!stillValid) {
      form.value.bank_account_code = opts[0].code
    }
  } else {
    form.value.bank_account_code = null
  }

  if ((form.value.payment_method || '').toLowerCase().includes('cheque')) {
    const chosenAcc = payingAccountOptions.value.find((o) => o.code === form.value.bank_account_code)
    await loadPlannedCheques(chosenAcc?.id)
    if (plannedCheques.value.length === 0) {
      form.value.cheque_source = 'new'
    }
  }
}

watch(
  () => form.value.bank_account_code,
  async (newCode) => {
    if (newCode && (form.value.payment_method || '').toLowerCase().includes('cheque')) {
      const chosenAcc = payingAccountOptions.value.find((o) => o.code === newCode)
      await loadPlannedCheques(chosenAcc?.id)
    }
  },
)

async function onSupplierChange(supplier) {
  // A new supplier invalidates everything tied to the old one, including any
  // bill list still loading for it.
  const token = billRequests.begin()
  form.value.allocations = []
  openInvoices.value = []
  unpostedSummary.value = null
  // A planned cheque keeps its face value; a typed amount does not carry over.
  const keepChequeAmount = amountLocked.value && !!form.value.cheque_id
  if (!keepChequeAmount) {
    form.value.amount = 0
    amountLocked.value = false
  }
  const supplierId = supplier?.id || (typeof supplier === 'string' ? supplier : null)
  form.value.supplier_id = supplierId

  if (!supplierId) {
    loadingInvoices.value = false
    return
  }

  loadingInvoices.value = true
  try {
    const { payable, unposted } = await getSupplierBillsForPayment(supplierId)
    if (!billRequests.isCurrent(token)) return // stale: user picked another supplier
    openInvoices.value = toBillRows(payable)
    unpostedSummary.value = unposted
    if (amountLocked.value && Number(form.value.amount) > 0) allocateAmountOldestFirst()
  } catch (e) {
    if (!billRequests.isCurrent(token)) return
    console.error('[onSupplierChange] Failed to load invoices:', e)
    $q.notify({ type: 'negative', message: 'Failed to load invoices', caption: e.message })
  } finally {
    if (billRequests.isCurrent(token)) loadingInvoices.value = false
  }
}

/** Only payable bills ever become selectable rows (never drafts). */
function toBillRows(bills, existingAllocs = []) {
  return (bills || []).filter(isPayableBill).map((inv) => {
    const existing = existingAllocs.find((a) => a.invoice_id === inv.id)
    return {
      ...inv,
      isSelected: !!existing,
      allocation: existing ? clampAllocation(existing.amount, inv.balance_due) : 0,
    }
  })
}

function toggleInvoice(inv) {
  inv.isSelected = !inv.isSelected
  onInvoiceSelect(inv)
}

function onInvoiceSelect(inv) {
  if (inv.isSelected) {
    // With a fixed amount, a newly ticked bill takes only what is left.
    if (amountLocked.value) {
      const others = sumAmounts(openInvoices.value.filter((i) => i !== inv && i.isSelected).map((i) => i.allocation))
      const left = Math.max(Math.round((Number(form.value.amount) - others) * 100) / 100, 0)
      inv.allocation = clampAllocation(left > 0 ? left : inv.balance_due, inv.balance_due)
    } else {
      inv.allocation = inv.balance_due
    }
  } else {
    inv.allocation = 0
  }
  recalcFromTable()
}

function recalcFromTable() {
  // Partial payments are allowed, over-allocation is not: clamp each line to
  // [0, balance_due] so the payment can never exceed what is owed.
  openInvoices.value.forEach((i) => {
    if (!i.isSelected) return
    i.allocation = clampAllocation(i.allocation, i.balance_due)
  })
  const selected = openInvoices.value.filter((i) => i.isSelected && i.allocation > 0)
  form.value.allocations = selected.map((i) => ({
    invoice_id: i.id,
    amount: i.allocation,
  }))
  // Never overwrite a typed amount / planned cheque value.
  if (!amountLocked.value) form.value.amount = totalAllocated.value
}

/** Spread form.amount across the payable bills, oldest first. */
function allocateAmountOldestFirst() {
  const { allocations, unallocated } = allocateOldestFirst(openInvoices.value, form.value.amount)
  openInvoices.value.forEach((inv) => {
    const a = allocations.find((x) => x.invoice_id === inv.id)
    inv.isSelected = !!a
    inv.allocation = a ? a.amount : 0
  })
  recalcFromTable()
  if (unallocated > 0) {
    $q.notify({
      type: 'warning',
      message: `${formatCurrency(unallocated)} exceeds this supplier's payable balance and is not allocated`,
      caption: 'Reduce the amount — a payment cannot exceed the posted bills it settles.',
    })
  }
}

function onAmountInput(val) {
  const n = Number(val)
  if (val === '' || val === null || !Number.isFinite(n) || n <= 0) {
    // Cleared → amount follows the ticked bills again
    amountLocked.value = false
    form.value.amount = totalAllocated.value
    return
  }
  form.value.amount = Math.round(n * 100) / 100
  amountLocked.value = true
  if (openInvoices.value.length > 0) allocateAmountOldestFirst()
}

function matchAmountToAllocations() {
  amountLocked.value = false
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

function resetBillState() {
  billRequests.invalidate() // drop any bill list still loading
  openInvoices.value = []
  unpostedSummary.value = null
  loadingInvoices.value = false
  amountLocked.value = false
}

function createNewPayment() {
  isEditing.value = false
  resetBillState()
  form.value = { ...defaultForm, allocations: [] }
  dialogVisible.value = true
}

watch(dialogVisible, (open) => {
  if (!open) billRequests.invalidate()
})

function editPayment(row) {
  isEditing.value = true
  resetBillState()

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
    doc_date: spa.ap_invoices?.doc_date,
    total_amount: spa.ap_invoices?.total_amount,
    paid_amount: spa.ap_invoices?.paid_amount,
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

  if (row.status !== 'draft') {
    // Read-only history view of what this payment settled.
    openInvoices.value = existingAllocs.map((a) => ({
      id: a.invoice_id,
      doc_number: a.doc_number,
      doc_date: a.doc_date,
      total_amount: a.total_amount,
      paid_amount: a.paid_amount,
      balance_due: a.balance_due,
      isSelected: true,
      allocation: a.amount,
    }))
  } else {
    // Draft payment: its amount is already fixed — keep it, re-offer only
    // bills that are still payable.
    amountLocked.value = true
    form.value.allocations = []
    const supId = supplierObj?.id || row.supplier_id
    if (supId) {
      const token = billRequests.begin()
      loadingInvoices.value = true
      getSupplierBillsForPayment(supId)
        .then(({ payable, unposted }) => {
          if (!billRequests.isCurrent(token)) return
          openInvoices.value = toBillRows(payable, existingAllocs)
          unpostedSummary.value = unposted
          recalcFromTable()
        })
        .catch((e) => {
          if (!billRequests.isCurrent(token)) return
          console.error('[editPayment] Failed to load invoices:', e)
          $q.notify({ type: 'negative', message: 'Failed to load invoices', caption: e.message })
        })
        .finally(() => {
          if (billRequests.isCurrent(token)) loadingInvoices.value = false
        })
    }
  }

  dialogVisible.value = true
}


const totalAllocated = computed(() => sumAmounts(form.value.allocations.map((a) => a.amount)))

/** amount − allocated, in LKR (2dp). > 0 → unallocated, < 0 → over-allocated. */
const allocationDiff = computed(
  () => (Math.round(Number(form.value.amount || 0) * 100) - Math.round(totalAllocated.value * 100)) / 100,
)

const amountHint = computed(() => {
  if (form.value.status !== 'draft') return ''
  if (form.value.cheque_id && amountLocked.value) return 'Planned cheque amount (fixed)'
  if (amountLocked.value) return 'Fixed amount — use "Oldest First" to re-spread it'
  return 'Type an amount to auto-allocate oldest bills first'
})

const emptyStateText = computed(() => describeUnpostedBills(unpostedSummary.value, formatCurrency))

/** Every allocation targets a payable bill of THIS supplier, within its balance. */
const allocationsValid = computed(() =>
  form.value.allocations.every((a) => {
    const inv = openInvoices.value.find((i) => i.id === a.invoice_id)
    return !!inv && isPayableBill(inv) && a.amount > 0 && clampAllocation(a.amount, inv.balance_due) === a.amount
  }),
)

const canPost = computed(() => {
  if (!form.value.supplier || form.value.amount <= 0) return false
  if (form.value.allocations.length === 0) return false
  if (!allocationsValid.value) return false
  return allocationDiff.value === 0
})

function confirmCancelPayment() {
  $q.dialog({
    title: `Cancel payment ${form.value.doc_number || ''}?`,
    message:
      'This reverses the AP ledger, cash/bank posting, supplier balance and invoice paid amounts. Enter a reason:',
    prompt: { model: '', type: 'text', isValid: (v) => !!v && v.trim().length > 2 },
    cancel: true,
    persistent: true,
  }).onOk(async (reason) => {
    if (saving.value) return
    saving.value = true
    try {
      const res = await cancelPayment(form.value.id, reason.trim())
      if (!res.success) throw new Error(res.error || 'Cancellation failed')
      $q.notify({ type: 'positive', message: `Payment ${res.doc_number || ''} cancelled` })
      dialogVisible.value = false
      fetchPayments()
    } catch (e) {
      $q.notify({ type: 'negative', message: 'Cancel Failed', caption: e.message, timeout: 6000 })
    } finally {
      saving.value = false
    }
  })
}

async function savePayment(targetStatus) {
  if (saving.value) return // double-click / Enter while the RPC is in flight
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
    // Never pay a draft / foreign / over-allocated bill, and the payment must
    // equal what it settles (server guard: #140).
    if (!allocationsValid.value) {
      $q.notify({
        type: 'warning',
        message: 'Allocations must target posted bills of this supplier, within each balance due',
      })
      return
    }
    if (targetStatus === 'posted' && allocationDiff.value !== 0) {
      $q.notify({ type: 'warning', message: 'Payment amount must equal the total allocated' })
      return
    }

    // Validate paying account selected
    if (!form.value.bank_account_code) {
      $q.notify({
        type: 'warning',
        message: `Please select the ${isCashMethod.value ? 'Cash' : 'Bank'} Account used for this payment`,
      })
      return
    }

    const paymentMethod = (form.value.payment_method || 'cash').toLowerCase().replace(/ /g, '_')
    const isCheque = paymentMethod.includes('cheque')
    const chosenAcc = payingAccountOptions.value.find((o) => o.code === form.value.bank_account_code)

    if (!form.value.id) {
      // New payment: use atomic SECURITY DEFINER RPC (bypasses RLS)
      const res = await createAndPostPayment(
        {
          supplier_id: supplierId,
          supplier_name: form.value.supplier?.name,
          doc_date: form.value.doc_date,
          payment_method: paymentMethod,
          reference_no: form.value.reference || null,
          cheque_no: isCheque ? form.value.reference || null : null,
          cheque_date: isCheque ? form.value.cheque_date : null,
          cheque_id: isCheque && form.value.cheque_source === 'planned' ? form.value.selected_planned_cheque : null,
          total_amount: form.value.amount,
          remarks: form.value.remarks || null,
          bank_account_code: form.value.bank_account_code || null,
          bank_account_id: chosenAcc?.id || null,
        },
        form.value.allocations,
        targetStatus === 'posted',
      )
      if (!res.success) {
        // If the server created the document anyway, never create it again
        if (res.payment_id) {
          form.value.id = res.payment_id
          form.value.doc_number = res.doc_number
        }
        throw new Error(res.error || 'Payment failed')
      }
      form.value.id = res.payment_id || form.value.id
      $q.notify({
        type: 'positive',
        message:
          targetStatus === 'posted'
            ? `Payment ${res.doc_number} Posted Successfully`
            : `Payment ${res.doc_number} saved as Draft`,
      })
      if (res.warning) {
        $q.notify({ type: 'warning', message: res.warning, timeout: 8000 })
      }
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
