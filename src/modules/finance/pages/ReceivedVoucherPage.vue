<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="receipt" size="md" color="green-8" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Received Vouchers</div>
      <q-space />
      <q-btn color="green-8" icon="add" label="New Received Voucher" unelevated @click="showForm = true" />
    </div>
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-2"><q-select v-model="filters.status" label="Status" outlined dense clearable emit-value map-options :options="statusOptions" @update:model-value="load" /></div>
      <div class="col-12 col-md-2"><q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-2"><q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" /></div>
    </div>
    <q-table flat bordered :rows="voucherStore.receivedVouchers" :columns="columns" row-key="id" :loading="voucherStore.loading" :pagination="{ rowsPerPage: 20 }">
      <template v-slot:body-cell-status="p"><q-td :props="p"><q-badge :color="statusColor(p.value)">{{ p.value }}</q-badge></q-td></template>
      <template v-slot:body-cell-amount="p"><q-td :props="p" class="text-weight-bold text-green-8">LKR {{ Number(p.value).toLocaleString() }}</q-td></template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p">
          <q-btn flat round size="sm" icon="send" color="orange" @click="submit(p.row.id)" v-if="p.row.status === 'draft'" />
          <q-btn flat round size="sm" icon="check" color="green" @click="approve(p.row.id)" v-if="p.row.status === 'submitted'" />
          <q-btn flat round size="sm" icon="publish" color="primary" @click="post(p.row.id)" v-if="p.row.status === 'approved'" />
        </q-td>
      </template>
    </q-table>
    <VoucherForm v-model="showForm" type="received" @saved="handleSave" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceVoucherStore } from '../stores/finance-voucher.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import VoucherForm from '../components/VoucherForm.vue'

const $q = useQuasar()
const voucherStore = useFinanceVoucherStore()
const showForm = ref(false)

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}
const filters = ref({ status: null, date_from: '', date_to: '' })
const statusOptions = ['draft','submitted','approved','rejected','posted','cancelled'].map(s => ({ label: s, value: s }))
const columns = [
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'voucher_date', label: 'Date', field: 'voucher_date', align: 'left', sortable: true },
  { name: 'received_from', label: 'Received From', field: 'received_from', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'payment_method', label: 'Method', field: 'payment_method', align: 'left' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]
function statusColor(s) { return { draft: 'grey', submitted: 'orange', approved: 'blue', rejected: 'red', posted: 'green', cancelled: 'dark' }[s] || 'grey' }

async function handleSave() {
  await load()
}
async function submit(id) { try { await voucherStore.submitVoucher(id); $q.notify({ type: 'positive', message: 'Submitted' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }
async function approve(id) { try { await voucherStore.approveVoucher(id); $q.notify({ type: 'positive', message: 'Approved' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }
async function post(id) { try { await voucherStore.postVoucher(id); $q.notify({ type: 'positive', message: 'Posted!' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }

async function load() { await voucherStore.fetchVouchers({ voucher_type: 'received', ...filters.value }) }
onMounted(async () => { await useFinanceLedgerStore().fetchLedgers(); await useFinanceAccountStore().fetchAccounts(); await load() })
</script>
