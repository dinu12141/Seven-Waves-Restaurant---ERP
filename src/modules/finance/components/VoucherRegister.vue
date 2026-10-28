<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon :name="isPay ? 'payment' : 'receipt'" size="md" :color="isPay ? 'red-8' : 'green-8'" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">{{ isPay ? 'Pay Vouchers' : 'Received Vouchers' }}</div>
      <q-space />
      <q-btn v-if="canWrite" :color="isPay ? 'red-8' : 'green-8'" icon="add" :label="isPay ? 'New Pay Voucher' : 'New Received Voucher'" unelevated @click="openNew" />
    </div>
    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-2"><q-select v-model="filters.status" label="Status" outlined dense clearable emit-value map-options :options="statusOptions" @update:model-value="load" /></div>
      <div class="col-6 col-md-2"><q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-6 col-md-2"><q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" /></div>
      <div class="col-12 col-md-4"><q-input v-model="search" label="Search voucher # / name / narration" outlined dense clearable><template #prepend><q-icon name="search" /></template></q-input></div>
    </div>
    <q-banner v-if="voucherStore.error" class="bg-red-1 text-negative q-mb-md" rounded dense>{{ voucherStore.error }}</q-banner>
    <q-table flat bordered :rows="rows" :columns="columns" row-key="id" :loading="voucherStore.loading" :pagination="{ rowsPerPage: 20 }" :filter="search">
      <template v-slot:body-cell-status="p"><q-td :props="p"><q-badge :color="statusColor(p.value)">{{ p.value }}</q-badge></q-td></template>
      <template v-slot:body-cell-amount="p"><q-td :props="p" class="text-weight-bold" :class="isPay ? '' : 'text-green-8'">LKR {{ fmt(p.value) }}</q-td></template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p">
          <div class="row items-center justify-center q-gutter-x-xs no-wrap">
            <q-btn flat round size="sm" icon="visibility" color="grey-7" @click="selectVoucher(p.row)"><q-tooltip>View / Print</q-tooltip></q-btn>
            <template v-if="canWrite">
              <q-btn v-if="p.row.status === 'draft' || p.row.status === 'rejected'" flat round size="sm" icon="edit" color="primary" @click="openEdit(p.row)"><q-tooltip>Edit</q-tooltip></q-btn>
              <q-btn v-if="p.row.status === 'draft'" flat round size="sm" icon="send" color="orange" @click="submit(p.row.id)"><q-tooltip>Submit for Approval</q-tooltip></q-btn>
              <q-btn v-if="p.row.status === 'submitted'" flat round size="sm" icon="check" color="green" @click="approve(p.row.id)"><q-tooltip>Approve &amp; Post</q-tooltip></q-btn>
              <q-btn v-if="p.row.status === 'approved'" flat round size="sm" icon="publish" color="primary" @click="post(p.row.id)"><q-tooltip>Post to Books</q-tooltip></q-btn>
            </template>
          </div>
        </q-td>
      </template>
    </q-table>
    <VoucherApprovalPanel v-if="selected" :voucher="selected" :loading="actionLoading" class="q-mt-md"
      @approve="approve" @reject="reject" @post="post" @cancel="cancel" @close="selected = null" />
    <VoucherForm v-model="showForm" :type="type" :voucher="editing" @saved="load" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceVoucherStore } from '../stores/finance-voucher.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import { useAuthStore } from 'src/stores/auth'
import { canWriteVouchers } from '../services/finance-voucher.service'
import VoucherForm from './VoucherForm.vue'
import VoucherApprovalPanel from './VoucherApprovalPanel.vue'

const props = defineProps({ type: { type: String, default: 'pay' } })
const isPay = computed(() => props.type === 'pay')

const $q = useQuasar()
const voucherStore = useFinanceVoucherStore()
const authStore = useAuthStore()
const canWrite = computed(() => canWriteVouchers(authStore))

const showForm = ref(false)
const editing = ref(null)
const selectedId = ref(null)
const actionLoading = ref(false)
const search = ref('')
const filters = ref({ status: null, date_from: '', date_to: '' })

const rows = computed(() => (isPay.value ? voucherStore.payVouchers : voucherStore.receivedVouchers))
// Always show the live row so the panel follows status changes.
const selected = computed({
  get: () => rows.value.find((v) => v.id === selectedId.value) || null,
  set: (v) => { selectedId.value = v?.id || null },
})

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}
const statusOptions = ['draft', 'submitted', 'approved', 'rejected', 'posted', 'cancelled'].map((s) => ({ label: s, value: s }))
const columns = computed(() => [
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'voucher_date', label: 'Date', field: 'voucher_date', align: 'left', sortable: true },
  isPay.value
    ? { name: 'pay_to', label: 'Pay To', field: 'pay_to', align: 'left' }
    : { name: 'received_from', label: 'Received From', field: 'received_from', align: 'left' },
  { name: 'ledger', label: isPay.value ? 'Debit Ledger' : 'Credit Ledger', field: (r) => (r.ledger ? `${r.ledger.ledger_code} — ${r.ledger.ledger_name}` : '—'), align: 'left' },
  { name: 'account', label: isPay.value ? 'Paid From' : 'Deposited To', field: (r) => (r.account || r.bank)?.registered_name || '—', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'payment_method', label: 'Method', field: 'payment_method', align: 'left' },
  { name: 'narration', label: 'Narration', field: (r) => r.narration || r.remark || '', align: 'left', classes: 'ellipsis', style: 'max-width: 220px' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
])
function statusColor(s) { return { draft: 'grey', submitted: 'orange', approved: 'blue', rejected: 'red', posted: 'green', cancelled: 'dark' }[s] || 'grey' }
function selectVoucher(v) { selected.value = v }
function openNew() { editing.value = null; showForm.value = true }
function openEdit(v) { editing.value = v; showForm.value = true }

async function run(fn, okMsg, type = 'positive') {
  actionLoading.value = true
  try {
    await fn()
    $q.notify({ type, message: okMsg, position: 'top' })
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 6000 })
  } finally {
    actionLoading.value = false
    await load()
  }
}
const submit = (id) => run(() => voucherStore.submitVoucher(id), 'Submitted for approval')
const approve = (id) => run(() => voucherStore.approveVoucher(id), 'Approved and posted to books')
const post = (id) => run(() => voucherStore.postVoucher(id), 'Posted to books')
const reject = ({ id, reason }) => run(() => voucherStore.rejectVoucher(id, reason), 'Voucher rejected', 'warning')
const cancel = ({ id, reason }) => run(() => voucherStore.cancelVoucher(id, reason), 'Voucher cancelled', 'warning')

async function load() { await voucherStore.fetchVouchers({ voucher_type: props.type, ...filters.value }) }
onMounted(async () => {
  await Promise.all([useFinanceLedgerStore().fetchLedgers(), useFinanceAccountStore().fetchAccounts()])
  await load()
})
</script>
