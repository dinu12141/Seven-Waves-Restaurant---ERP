<template>
  <q-card flat bordered class="q-pa-md">
    <div class="row items-center text-subtitle1 text-weight-bold q-mb-md">
      <q-icon name="check_circle" class="q-mr-sm" color="primary" />Voucher {{ voucher?.voucher_no || '' }}
      <q-space />
      <q-btn v-if="voucher" flat dense icon="print" label="Print" no-caps @click="printVoucher" />
      <q-btn flat round dense icon="close" @click="$emit('close')" />
    </div>
    <div v-if="!voucher" class="text-grey-5 text-center q-pa-lg">Select a voucher to review</div>
    <template v-else>
      <div class="row q-col-gutter-sm q-mb-md">
        <div class="col-6 col-md-3"><strong>Type:</strong> <q-badge :color="voucher.voucher_type === 'pay' ? 'red' : 'green'">{{ voucher.voucher_type }}</q-badge></div>
        <div class="col-6 col-md-3"><strong>Status:</strong> <q-badge :color="statusColor(voucher.status)">{{ voucher.status }}</q-badge></div>
        <div class="col-6 col-md-3"><strong>Date:</strong> {{ voucher.voucher_date }}</div>
        <div class="col-6 col-md-3"><strong>Amount:</strong> LKR {{ fmt(voucher.amount) }}</div>
        <div class="col-12 col-md-6"><strong>{{ voucher.voucher_type === 'pay' ? 'Pay To' : 'Received From' }}:</strong> {{ voucher.pay_to || voucher.received_from || '—' }}</div>
        <div class="col-12 col-md-6"><strong>Method:</strong> {{ voucher.payment_method || '—' }}</div>
        <div class="col-12 col-md-6"><strong>{{ voucher.voucher_type === 'pay' ? 'Debit' : 'Credit' }} ledger:</strong> {{ ledgerLabel(voucher.ledger) }}</div>
        <div class="col-12 col-md-6"><strong>{{ voucher.voucher_type === 'pay' ? 'Paid from' : 'Deposited to' }}:</strong> {{ accountLabel }}</div>
        <div class="col-12"><strong>Narration:</strong> {{ voucher.narration || voucher.remark || '—' }}</div>
        <div v-if="voucher.status === 'rejected' && voucher.rejection_reason" class="col-12 text-negative"><strong>Rejected:</strong> {{ voucher.rejection_reason }}</div>
      </div>
      <q-markup-table v-if="voucher.lines?.length" flat bordered dense class="q-mb-md">
        <thead><tr><th class="text-left">Ledger</th><th class="text-left">Description</th><th class="text-right">Dr</th><th class="text-right">Cr</th></tr></thead>
        <tbody>
          <tr v-for="l in voucher.lines" :key="l.id">
            <td>{{ ledgerLabel(l.ledger) }}</td><td>{{ l.description }}</td>
            <td class="text-right">{{ Number(l.debit_amount) ? fmt(l.debit_amount) : '' }}</td>
            <td class="text-right">{{ Number(l.credit_amount) ? fmt(l.credit_amount) : '' }}</td>
          </tr>
        </tbody>
      </q-markup-table>
      <div class="row q-gutter-sm" v-if="canWrite">
        <template v-if="voucher.status === 'submitted'">
          <q-btn color="positive" icon="thumb_up" label="Approve & Post" @click="$emit('approve', voucher.id)" :loading="loading" unelevated />
          <q-btn color="negative" icon="thumb_down" label="Reject" @click="showReject = true" unelevated />
        </template>
        <template v-if="voucher.status === 'approved'">
          <q-btn color="primary" icon="publish" label="Post to Books" @click="$emit('post', voucher.id)" :loading="loading" unelevated />
          <q-btn color="negative" flat icon="thumb_down" label="Reject" @click="showReject = true" />
        </template>
        <q-btn v-if="['draft', 'submitted', 'approved', 'posted', 'rejected'].includes(voucher.status)" color="dark" flat icon="block"
          :label="voucher.status === 'posted' ? 'Cancel & Reverse' : 'Cancel Voucher'" @click="showCancel = true" />
      </div>

      <q-dialog v-model="showReject">
        <q-card style="min-width:350px">
          <q-card-section class="text-h6">Rejection Reason</q-card-section>
          <q-card-section><q-input v-model="rejectReason" outlined type="textarea" rows="3" label="Reason *" /></q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Cancel" @click="showReject = false" />
            <q-btn color="negative" label="Reject" @click="reject" :disable="!rejectReason.trim()" />
          </q-card-actions>
        </q-card>
      </q-dialog>

      <q-dialog v-model="showCancel">
        <q-card style="min-width:350px">
          <q-card-section class="text-h6">Cancel voucher {{ voucher.voucher_no }}</q-card-section>
          <q-card-section>
            <div v-if="voucher.status === 'posted'" class="text-caption text-negative q-mb-sm">
              This voucher is posted — cancelling writes reversing GL entries dated today.
            </div>
            <q-input v-model="cancelReason" outlined type="textarea" rows="3" :label="voucher.status === 'posted' ? 'Reason *' : 'Reason'" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Back" @click="showCancel = false" />
            <q-btn color="dark" label="Cancel Voucher" @click="cancel" :disable="voucher.status === 'posted' && !cancelReason.trim()" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>
  </q-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { canWriteVouchers } from '../services/finance-voucher.service'

const props = defineProps({ voucher: Object, loading: Boolean })
const emit = defineEmits(['approve', 'reject', 'post', 'cancel', 'close'])
const authStore = useAuthStore()
const canWrite = computed(() => canWriteVouchers(authStore))
const showReject = ref(false)
const rejectReason = ref('')
const showCancel = ref(false)
const cancelReason = ref('')

const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ledgerLabel = (l) => (l ? `${l.ledger_code} — ${l.ledger_name}` : '—')
const accountLabel = computed(() => {
  const a = props.voucher?.account || props.voucher?.bank
  return a ? `${a.registered_name}${a.account_number ? ` (${a.account_number})` : ''}` : '—'
})

function reject() { emit('reject', { id: props.voucher.id, reason: rejectReason.value.trim() }); showReject.value = false; rejectReason.value = '' }
function cancel() { emit('cancel', { id: props.voucher.id, reason: cancelReason.value.trim() }); showCancel.value = false; cancelReason.value = '' }
function statusColor(s) { return { draft: 'grey', submitted: 'orange', approved: 'blue', rejected: 'red', posted: 'green', cancelled: 'dark' }[s] || 'grey' }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function printVoucher() {
  const v = props.voucher
  if (!v) return
  const isPay = v.voucher_type === 'pay'
  const lines = (v.lines || []).map((l) => `<tr><td>${esc(ledgerLabel(l.ledger))}</td><td>${esc(l.description)}</td><td class="r">${Number(l.debit_amount) ? fmt(l.debit_amount) : ''}</td><td class="r">${Number(l.credit_amount) ? fmt(l.credit_amount) : ''}</td></tr>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(v.voucher_no)}</title>
<style>body{font-family:Arial,sans-serif;margin:32px;color:#111}h1{margin:0 0 4px;font-size:20px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #999;padding:6px;font-size:13px;text-align:left}.r{text-align:right}.sig{display:flex;justify-content:space-between;margin-top:60px}.sig div{border-top:1px solid #000;width:28%;text-align:center;padding-top:4px;font-size:12px}</style></head><body>
<h1>${isPay ? 'PAYMENT VOUCHER' : 'RECEIPT VOUCHER'}</h1><div>Seven Waves Restaurant</div>
<table><tr><th>Voucher No</th><td>${esc(v.voucher_no)}</td><th>Date</th><td>${esc(v.voucher_date)}</td></tr>
<tr><th>${isPay ? 'Pay To' : 'Received From'}</th><td>${esc(v.pay_to || v.received_from)}</td><th>Status</th><td>${esc(v.status)}</td></tr>
<tr><th>${isPay ? 'Debit Ledger' : 'Credit Ledger'}</th><td>${esc(ledgerLabel(v.ledger))}</td><th>${isPay ? 'Paid From' : 'Deposited To'}</th><td>${esc(accountLabel.value)}</td></tr>
<tr><th>Method</th><td>${esc(v.payment_method)}</td><th>Amount (LKR)</th><td class="r"><b>${fmt(v.amount)}</b></td></tr>
<tr><th>Narration</th><td colspan="3">${esc(v.narration || v.remark)}</td></tr></table>
${lines ? `<table><tr><th>Ledger</th><th>Description</th><th class="r">Dr</th><th class="r">Cr</th></tr>${lines}</table>` : ''}
<div class="sig"><div>Prepared by</div><div>Approved by</div><div>${isPay ? 'Received by' : 'Cashier'}</div></div>
<script>window.onload=function(){window.print()}<${'/'}script></body></html>`
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
</script>
