<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="request_quote" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Voucher Approval Queue</div>
      <q-space />
      <q-btn flat round icon="refresh" :loading="voucherStore.loading" @click="refresh" class="q-mr-sm"><q-tooltip>Refresh</q-tooltip></q-btn>
      <q-badge color="orange" :label="`${voucherStore.approvalQueue.length} Pending`" class="text-body1 q-pa-sm" />
    </div>
    <q-banner v-if="!canWrite" class="bg-orange-1 text-orange-10 q-mb-md" rounded dense>
      Only finance or admin users can approve vouchers.
    </q-banner>
    <q-table flat bordered :rows="voucherStore.approvalQueue" :columns="columns" row-key="id" :loading="voucherStore.loading" :pagination="{ rowsPerPage: 20 }"
      no-data-label="No vouchers waiting for approval">
      <template v-slot:body-cell-voucher_type="p"><q-td :props="p"><q-badge :color="p.value === 'pay' ? 'red' : 'green'">{{ p.value }}</q-badge></q-td></template>
      <template v-slot:body-cell-amount="p"><q-td :props="p" class="text-weight-bold">LKR {{ fmt(p.value) }}</q-td></template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p" class="q-gutter-xs">
          <q-btn flat round size="sm" icon="visibility" color="grey-7" @click="selected = p.row"><q-tooltip>Details</q-tooltip></q-btn>
          <template v-if="canWrite">
            <q-btn flat round size="sm" icon="check_circle" color="positive" :loading="busyId === p.row.id" @click="approve(p.row.id)"><q-tooltip>Approve &amp; Post</q-tooltip></q-btn>
            <q-btn flat round size="sm" icon="cancel" color="negative" @click="openReject(p.row)"><q-tooltip>Reject</q-tooltip></q-btn>
          </template>
        </q-td>
      </template>
    </q-table>

    <VoucherApprovalPanel v-if="selected" :voucher="selected" :loading="!!busyId" class="q-mt-md"
      @approve="approve" @reject="rejectFromPanel" @post="post" @cancel="cancel" @close="selected = null" />

    <q-dialog v-model="rejectDialog">
      <q-card style="min-width:400px">
        <q-card-section class="text-h6 bg-negative text-white">Reject Voucher {{ rejectTarget?.voucher_no }}</q-card-section>
        <q-card-section><q-input v-model="rejectReason" outlined type="textarea" rows="3" label="Reason for rejection *" /></q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="rejectDialog = false" />
          <q-btn color="negative" label="Reject" @click="reject" :disable="!rejectReason.trim()" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceVoucherStore } from '../stores/finance-voucher.store'
import { useAuthStore } from 'src/stores/auth'
import { canWriteVouchers } from '../services/finance-voucher.service'
import VoucherApprovalPanel from '../components/VoucherApprovalPanel.vue'

const $q = useQuasar()
const voucherStore = useFinanceVoucherStore()
const authStore = useAuthStore()
const canWrite = computed(() => canWriteVouchers(authStore))
const rejectDialog = ref(false)
const rejectTarget = ref(null)
const rejectReason = ref('')
const selected = ref(null)
const busyId = ref(null)

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}

const columns = [
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'voucher_type', label: 'Type', field: 'voucher_type', align: 'center' },
  { name: 'voucher_date', label: 'Date', field: 'voucher_date', align: 'left', sortable: true },
  { name: 'pay_to', label: 'Pay To / From', field: (r) => r.pay_to || r.received_from || '—', align: 'left' },
  { name: 'ledger', label: 'Ledger', field: (r) => (r.ledger ? `${r.ledger.ledger_code} — ${r.ledger.ledger_name}` : '—'), align: 'left' },
  { name: 'account', label: 'Cash / Bank', field: (r) => (r.account || r.bank)?.registered_name || '—', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'remark', label: 'Remark', field: (r) => r.remark || r.narration || '', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

async function refresh() { await voucherStore.fetchApprovalQueue() }

async function act(id, fn, okMsg, type = 'positive') {
  busyId.value = id
  try {
    const result = await fn()
    $q.notify({ type, message: okMsg, position: 'top' })
    if (selected.value?.id === id) selected.value = result?.id && 'lines' in result ? result : null
  } catch (e) {
    $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 7000 })
  } finally {
    busyId.value = null
    await refresh()
  }
}
const approve = (id) => act(id, () => voucherStore.approveVoucher(id), 'Voucher approved & posted to accounts')
const post = (id) => act(id, () => voucherStore.postVoucher(id), 'Posted to books')
const cancel = ({ id, reason }) => act(id, () => voucherStore.cancelVoucher(id, reason), 'Voucher cancelled', 'warning')
const rejectFromPanel = ({ id, reason }) => act(id, () => voucherStore.rejectVoucher(id, reason), 'Voucher rejected', 'warning')

function openReject(v) { rejectTarget.value = v; rejectDialog.value = true; rejectReason.value = '' }
async function reject() {
  const id = rejectTarget.value.id
  rejectDialog.value = false
  await act(id, () => voucherStore.rejectVoucher(id, rejectReason.value.trim()), 'Voucher rejected', 'warning')
}

onMounted(refresh)
</script>
