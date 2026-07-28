<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="payments" size="md" color="indigo" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Cheque Plan</div>
    </div>
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3"><q-select v-model="filters.status" label="Status" outlined dense clearable emit-value map-options :options="statusOptions" @update:model-value="load" /></div>
      <div class="col-12 col-md-3"><q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-3"><q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" /></div>
    </div>
    <q-table flat bordered :rows="chequeStore.cheques" :columns="columns" row-key="id" :loading="chequeStore.loading" :pagination="{ rowsPerPage: 20 }">
      <template v-slot:body-cell-status="p">
        <q-td :props="p"><q-badge :color="chequeColor(p.value)">{{ p.value }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-amount="p"><q-td :props="p" class="text-weight-bold">LKR {{ Number(p.value).toLocaleString() }}</q-td></template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p" class="q-gutter-xs">
          <q-btn v-if="p.row.status === 'issued'" flat round size="sm" icon="check_circle" color="positive" @click="clear(p.row.id)"><q-tooltip>Mark Cleared</q-tooltip></q-btn>
          <q-btn v-if="p.row.status === 'issued'" flat round size="sm" icon="report_problem" color="orange" @click="bounce(p.row)"><q-tooltip>Mark Bounced</q-tooltip></q-btn>
          <q-btn v-if="['planned','issued'].includes(p.row.status)" flat round size="sm" icon="cancel" color="negative" @click="cancelCheque(p.row)"><q-tooltip>Cancel</q-tooltip></q-btn>
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="cancelDialog">
      <q-card style="min-width:350px">
        <q-card-section class="text-h6">Cancel Cheque {{ cancelTarget?.cheque_no }}</q-card-section>
        <q-card-section><q-input v-model="cancelReason" outlined label="Reason *" type="textarea" rows="2" /></q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" @click="cancelDialog = false" />
          <q-btn color="negative" label="Cancel Cheque" @click="doCancel" :disable="!cancelReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="bounceDialog">
      <q-card style="min-width:350px">
        <q-card-section class="text-h6">Mark Cheque {{ bounceTarget?.cheque_no }} Bounced</q-card-section>
        <q-card-section class="text-caption text-grey-7">
          This reverses the ledger, cashbook, and account balance effect of the voucher this cheque was issued for.
        </q-card-section>
        <q-card-section><q-input v-model="bounceReason" outlined label="Reason *" type="textarea" rows="2" /></q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Close" @click="bounceDialog = false" />
          <q-btn color="orange" label="Mark Bounced" @click="doBounce" :disable="!bounceReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceChequeStore } from '../stores/finance-cheque.store'

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
const statusOptions = ['planned','issued','cleared','bounced','cancelled','stale'].map(s => ({ label: s, value: s }))
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
  { name: 'bank_name', label: 'Bank', field: r => r.bank_account?.bank_name || '—', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

function chequeColor(s) { return { planned: 'grey', issued: 'blue', cleared: 'green', bounced: 'red', cancelled: 'dark', stale: 'orange' }[s] || 'grey' }

async function clear(id) { try { await chequeStore.markCleared(id); $q.notify({ type: 'positive', message: 'Cleared' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }
function bounce(c) { bounceTarget.value = c; bounceDialog.value = true; bounceReason.value = '' }
async function doBounce() {
  try {
    await chequeStore.markBounced(bounceTarget.value.id, bounceReason.value)
    bounceDialog.value = false
    $q.notify({ type: 'warning', message: 'Cheque marked bounced — ledger and cashbook reversed' })
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' })
  }
}
function cancelCheque(c) { cancelTarget.value = c; cancelDialog.value = true; cancelReason.value = '' }
async function doCancel() { try { await chequeStore.cancel(cancelTarget.value.id, cancelReason.value); cancelDialog.value = false; $q.notify({ type: 'info', message: 'Cancelled' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }

async function load() { await chequeStore.fetchCheques(filters.value) }
onMounted(load)
</script>
