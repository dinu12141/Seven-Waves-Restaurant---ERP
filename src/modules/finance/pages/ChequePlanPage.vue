<template>
  <q-page class="q-pa-md">
    <div class="row items-center justify-between q-mb-md">
      <div class="row items-center">
        <q-icon name="payments" size="md" color="indigo" class="q-mr-sm" />
        <div>
          <div class="text-h5 text-weight-bold">Cheque Plan</div>
          <div class="text-caption text-grey-7">Pre-plan, issue, track, and reconcile company cheques</div>
        </div>
      </div>
      <q-btn
        unelevated
        color="indigo"
        icon="add_circle"
        label="Plan New Cheque"
        no-caps
        @click="openCreateDialog"
      />
    </div>

    <!-- Filters -->
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3">
        <q-select
          v-model="filters.status"
          label="Status"
          outlined
          dense
          clearable
          emit-value
          map-options
          :options="statusOptions"
          @update:model-value="load"
        />
      </div>
      <div class="col-12 col-md-3">
        <q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" />
      </div>
      <div class="col-12 col-md-3">
        <q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" />
      </div>
    </div>

    <!-- Cheques Table -->
    <q-table
      flat
      bordered
      :rows="chequeStore.cheques"
      :columns="columns"
      row-key="id"
      :loading="chequeStore.loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <template v-slot:body-cell-status="p">
        <q-td :props="p">
          <q-badge :color="chequeColor(p.value)">{{ p.value }}</q-badge>
        </q-td>
      </template>
      <template v-slot:body-cell-amount="p">
        <q-td :props="p" class="text-weight-bold">
          LKR {{ Number(p.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </q-td>
      </template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p" class="q-gutter-xs">
          <q-btn
            v-if="p.row.status === 'issued'"
            flat
            round
            size="sm"
            icon="check_circle"
            color="positive"
            @click="clear(p.row.id)"
          >
            <q-tooltip>Mark Cleared</q-tooltip>
          </q-btn>
          <q-btn
            v-if="p.row.status === 'issued'"
            flat
            round
            size="sm"
            icon="report_problem"
            color="orange"
            @click="bounce(p.row)"
          >
            <q-tooltip>Mark Bounced</q-tooltip>
          </q-btn>
          <q-btn
            v-if="canCancel(p.row)"
            flat
            round
            size="sm"
            icon="cancel"
            color="negative"
            @click="cancelCheque(p.row)"
          >
            <q-tooltip>Cancel</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Plan Cheque Dialog -->
    <q-dialog v-model="createDialog" persistent>
      <q-card style="min-width: 480px; max-width: 95vw">
        <q-card-section class="row items-center bg-indigo text-white q-py-sm q-px-md">
          <q-icon name="edit_calendar" size="22px" class="q-mr-sm" />
          <div class="text-subtitle1 text-weight-bold">Plan New Cheque</div>
          <q-space />
          <q-btn icon="close" flat round dense color="white" v-close-popup />
        </q-card-section>

        <q-card-section class="q-pa-md q-gutter-md">
          <!-- Bank Account -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Bank Account *</div>
            <q-select
              v-model="createForm.bank_account_id"
              :options="bankAccountOptions"
              outlined
              dense
              emit-value
              map-options
              placeholder="Select Bank Account"
            />
          </div>

          <!-- Cheque No & Cheque Date -->
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Cheque Number *</div>
              <q-input v-model="createForm.cheque_no" outlined dense placeholder="e.g. 578427" />
            </div>
            <div class="col-6">
              <div class="text-caption text-weight-bold q-mb-xs">Cheque Date *</div>
              <q-input v-model="createForm.cheque_date" type="date" outlined dense />
            </div>
          </div>

          <!-- Amount -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Amount (LKR) *</div>
            <q-input
              v-model.number="createForm.amount"
              type="number"
              step="0.01"
              min="0.01"
              outlined
              dense
              prefix="LKR"
            />
          </div>

          <!-- Payee / Issued To -->
          <div>
            <div class="text-caption text-weight-bold q-mb-xs">Payee / Issued To (Supplier or Person)</div>
            <q-input
              v-model="createForm.issued_to"
              outlined
              dense
              placeholder="e.g. MR .DILUSHA FISH or Supplier Name"
            />
          </div>

          <div class="text-caption text-grey-7 bg-grey-2 q-pa-sm rounded-borders">
            📌 Planned cheques can be selected when recording supplier payments in Accounts Payable or Procurement.
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
          <q-btn
            unelevated
            label="Save Planned Cheque"
            color="indigo"
            icon="check"
            no-caps
            :loading="creating"
            @click="doCreateCheque"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Cancel Dialog -->
    <q-dialog v-model="cancelDialog">
      <q-card style="min-width: 350px">
        <q-card-section class="text-h6">Cancel Cheque {{ cancelTarget?.cheque_no }}</q-card-section>
        <q-card-section>
          <q-input v-model="cancelReason" outlined label="Reason *" type="textarea" rows="2" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" @click="cancelDialog = false" />
          <q-btn color="negative" label="Cancel Cheque" @click="doCancel" :disable="!cancelReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Bounce Dialog -->
    <q-dialog v-model="bounceDialog">
      <q-card style="min-width: 350px">
        <q-card-section class="text-h6">Mark Cheque {{ bounceTarget?.cheque_no }} Bounced</q-card-section>
        <q-card-section class="text-caption text-grey-7">
          <span v-if="bounceTarget?.supplier_payment_id">This cancels the linked supplier payment, which reverses its AP, bank and supplier balance postings.</span>
          <span v-else>This reverses the ledger, cashbook, and account balance effect of the voucher this cheque was issued for.</span>
        </q-card-section>
        <q-card-section>
          <q-input v-model="bounceReason" outlined label="Reason *" type="textarea" rows="2" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" @click="bounceDialog = false" />
          <q-btn color="orange" label="Mark Bounced" @click="doBounce" :disable="!bounceReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { todayLK } from 'src/modules/finance/utils/finance-dates'
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceChequeStore } from '../stores/finance-cheque.store'
import { supabase } from 'src/boot/supabase'

const $q = useQuasar()
const chequeStore = useFinanceChequeStore()
const filters = ref({ status: null, date_from: '', date_to: '' })

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}

const statusOptions = ['planned', 'issued', 'cleared', 'bounced', 'cancelled', 'stale'].map((s) => ({
  label: s,
  value: s,
}))

// Create Dialog State
const createDialog = ref(false)
const creating = ref(false)
const bankAccountOptions = ref([])
const createForm = reactive({
  bank_account_id: null,
  cheque_no: '',
  cheque_date: todayLK(),
  amount: null,
  issued_to: '',
})

const cancelDialog = ref(false)
const cancelTarget = ref(null)
const cancelReason = ref('')
const bounceDialog = ref(false)
const bounceTarget = ref(null)
const bounceReason = ref('')

const columns = [
  { name: 'cheque_no', label: 'Cheque #', field: 'cheque_no', align: 'left', sortable: true },
  { name: 'cheque_date', label: 'Date', field: 'cheque_date', align: 'left', sortable: true },
  { name: 'issued_to', label: 'Issued To', field: 'issued_to', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'linked', label: 'Linked To', field: (r) => linkedDoc(r), align: 'left' },
  { name: 'bank_name', label: 'Bank', field: (r) => r.bank_account?.bank_name || r.bank_account?.registered_name || '—', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

// Issued cheques linked to a posted supplier payment / voucher carry a GL bank
// leg: they must be voided through that document (or bounced), never by a
// plain status flip. See assertChequeTransition in finance-cheque.service.
function canCancel(row) {
  return ['planned', 'stale'].includes(row.status) && !row.supplier_payment_id && !row.voucher_id
}

function linkedDoc(r) {
  if (r.supplier_payment_id) return `Supplier payment ${r.supplier_payment?.doc_number || ''}`.trim()
  if (r.voucher_id) return `Voucher ${r.voucher?.voucher_no || ''}`.trim()
  return '—'
}

function chequeColor(s) {
  return {
    planned: 'grey-7',
    issued: 'blue-8',
    cleared: 'positive',
    bounced: 'negative',
    cancelled: 'dark',
    stale: 'orange-8',
  }[s] || 'grey'
}

async function loadBankAccounts() {
  const { data, error } = await supabase
    .from('finance_accounts')
    .select('id, registered_name, bank_name, account_number')
    .eq('account_type', 'bank')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('registered_name')
  if (error) $q.notify({ type: 'negative', message: humanizeError(error), position: 'top' })
  if (data) {
    bankAccountOptions.value = data.map((a) => ({
      label: `${a.registered_name} (${a.bank_name || 'Bank'} - ${a.account_number || ''})`,
      value: a.id,
    }))
  }
}

function openCreateDialog() {
  createForm.bank_account_id = bankAccountOptions.value[0]?.value || null
  createForm.cheque_no = ''
  createForm.cheque_date = todayLK()
  createForm.amount = null
  createForm.issued_to = ''
  createDialog.value = true
}

async function doCreateCheque() {
  if (!createForm.bank_account_id) {
    $q.notify({ type: 'warning', message: 'Please select a bank account' })
    return
  }
  if (!createForm.cheque_no || !createForm.cheque_no.trim()) {
    $q.notify({ type: 'warning', message: 'Please enter a cheque number' })
    return
  }
  if (!createForm.amount || createForm.amount <= 0) {
    $q.notify({ type: 'warning', message: 'Please enter a valid amount' })
    return
  }

  creating.value = true
  try {
    await chequeStore.createCheque({
      bank_account_id: createForm.bank_account_id,
      cheque_no: createForm.cheque_no,
      cheque_date: createForm.cheque_date,
      amount: createForm.amount,
      issued_to: createForm.issued_to,
      status: 'planned',
    })
    $q.notify({ type: 'positive', message: `Planned Cheque #${createForm.cheque_no} registered successfully!` })
    createDialog.value = false
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' })
  } finally {
    creating.value = false
  }
}

async function clear(id) {
  try {
    await chequeStore.markCleared(id)
    $q.notify({ type: 'positive', message: 'Cheque marked cleared' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' })
  }
}

function bounce(c) {
  bounceTarget.value = c
  bounceDialog.value = true
  bounceReason.value = ''
}

async function doBounce() {
  try {
    await chequeStore.markBounced(bounceTarget.value.id, bounceReason.value)
    bounceDialog.value = false
    $q.notify({ type: 'warning', message: 'Cheque marked bounced — ledger and cashbook reversed' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' })
  }
}

function cancelCheque(c) {
  cancelTarget.value = c
  cancelDialog.value = true
  cancelReason.value = ''
}

async function doCancel() {
  try {
    await chequeStore.cancel(cancelTarget.value.id, cancelReason.value)
    cancelDialog.value = false
    $q.notify({ type: 'info', message: 'Cheque cancelled' })
    await load()
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' })
  }
}

async function load() {
  await chequeStore.fetchCheques(filters.value)
  if (chequeStore.error) $q.notify({ type: 'negative', message: chequeStore.error, position: 'top' })
}

onMounted(async () => {
  await Promise.all([load(), loadBankAccounts()])
})
</script>
