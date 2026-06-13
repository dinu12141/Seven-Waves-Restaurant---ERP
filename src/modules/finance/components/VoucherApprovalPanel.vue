<template>
  <q-card flat bordered class="q-pa-md">
    <div class="text-subtitle1 text-weight-bold q-mb-md">
      <q-icon name="check_circle" class="q-mr-sm" color="primary" />Voucher Approval
    </div>
    <div v-if="!voucher" class="text-grey-5 text-center q-pa-lg">Select a voucher to review</div>
    <template v-else>
      <div class="row q-col-gutter-sm q-mb-md">
        <div class="col-6"><strong>Voucher:</strong> {{ voucher.voucher_no }}</div>
        <div class="col-6"><strong>Type:</strong> <q-badge :color="voucher.voucher_type === 'pay' ? 'red' : 'green'">{{ voucher.voucher_type }}</q-badge></div>
        <div class="col-6"><strong>Amount:</strong> LKR {{ Number(voucher.amount).toLocaleString() }}</div>
        <div class="col-6"><strong>Status:</strong> <q-badge :color="statusColor(voucher.status)">{{ voucher.status }}</q-badge></div>
        <div class="col-12"><strong>Narration:</strong> {{ voucher.narration || voucher.remark || '—' }}</div>
      </div>
      <div class="row q-gutter-sm" v-if="voucher.status === 'submitted'">
        <q-btn color="positive" icon="thumb_up" label="Approve" @click="$emit('approve', voucher.id)" :loading="loading" unelevated />
        <q-btn color="negative" icon="thumb_down" label="Reject" @click="showReject = true" unelevated />
      </div>
      <div class="row q-gutter-sm" v-if="voucher.status === 'approved'">
        <q-btn color="primary" icon="publish" label="Post to Books" @click="$emit('post', voucher.id)" :loading="loading" unelevated />
      </div>

      <q-dialog v-model="showReject">
        <q-card style="min-width:350px">
          <q-card-section class="text-h6">Rejection Reason</q-card-section>
          <q-card-section><q-input v-model="rejectReason" outlined type="textarea" rows="3" label="Reason *" /></q-card-section>
          <q-card-actions align="right">
            <q-btn flat label="Cancel" @click="showReject = false" />
            <q-btn color="negative" label="Reject" @click="reject" :disable="!rejectReason" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>
  </q-card>
</template>

<script setup>
import { ref } from 'vue'
defineProps({ voucher: Object, loading: Boolean })
const emit = defineEmits(['approve', 'reject', 'post'])
const showReject = ref(false)
const rejectReason = ref('')
function reject() { emit('reject', { id: props.voucher.id, reason: rejectReason.value }); showReject.value = false; rejectReason.value = '' }
function statusColor(s) { return { draft: 'grey', submitted: 'orange', approved: 'blue', rejected: 'red', posted: 'green', cancelled: 'dark' }[s] || 'grey' }
</script>
