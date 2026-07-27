<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="request_quote" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Voucher Approval Queue</div>
      <q-space />
      <q-badge color="orange" :label="`${voucherStore.approvalQueue.length} Pending`" class="text-body1 q-pa-sm" />
    </div>
    <q-table flat bordered :rows="voucherStore.approvalQueue" :columns="columns" row-key="id" :loading="voucherStore.loading" :pagination="{ rowsPerPage: 20 }">
      <template v-slot:body-cell-voucher_type="p"><q-td :props="p"><q-badge :color="p.value === 'pay' ? 'red' : 'green'">{{ p.value }}</q-badge></q-td></template>
      <template v-slot:body-cell-amount="p"><q-td :props="p" class="text-weight-bold">LKR {{ Number(p.value).toLocaleString() }}</q-td></template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p" class="q-gutter-xs">
          <q-btn flat round size="sm" icon="check_circle" color="positive" @click="approve(p.row.id)"><q-tooltip>Approve</q-tooltip></q-btn>
          <q-btn flat round size="sm" icon="cancel" color="negative" @click="openReject(p.row)"><q-tooltip>Reject</q-tooltip></q-btn>
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="rejectDialog">
      <q-card style="min-width:400px">
        <q-card-section class="text-h6 bg-negative text-white">Reject Voucher {{ rejectTarget?.voucher_no }}</q-card-section>
        <q-card-section><q-input v-model="rejectReason" outlined type="textarea" rows="3" label="Reason for rejection *" /></q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="rejectDialog = false" />
          <q-btn color="negative" label="Reject" @click="reject" :disable="!rejectReason" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceVoucherStore } from '../stores/finance-voucher.store'

const $q = useQuasar()
const voucherStore = useFinanceVoucherStore()
const rejectDialog = ref(false)

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}
const rejectTarget = ref(null)
const rejectReason = ref('')

const columns = [
  { name: 'voucher_no', label: 'Voucher #', field: 'voucher_no', align: 'left', sortable: true },
  { name: 'voucher_type', label: 'Type', field: 'voucher_type', align: 'center' },
  { name: 'voucher_date', label: 'Date', field: 'voucher_date', align: 'left', sortable: true },
  { name: 'pay_to', label: 'Pay To / From', field: r => r.pay_to || r.received_from || '—', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', sortable: true },
  { name: 'remark', label: 'Remark', field: 'remark', align: 'left' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

async function approve(id) { try { await voucherStore.approveVoucher(id); $q.notify({ type: 'positive', message: 'Approved' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }
function openReject(v) { rejectTarget.value = v; rejectDialog.value = true; rejectReason.value = '' }
async function reject() { try { await voucherStore.rejectVoucher(rejectTarget.value.id, rejectReason.value); rejectDialog.value = false; $q.notify({ type: 'warning', message: 'Rejected' }) } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) } }

onMounted(() => voucherStore.fetchApprovalQueue())
</script>
