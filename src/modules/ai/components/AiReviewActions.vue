<template>
  <div class="ai-review-actions row q-gutter-sm items-center">
    <slot />
    <q-btn
      v-if="showApprove"
      flat
      size="sm"
      color="positive"
      icon="check_circle"
      :label="approveLabel"
      @click="$emit('approve')"
      :loading="loading"
    />
    <q-btn
      v-if="showReject"
      flat
      size="sm"
      color="negative"
      icon="cancel"
      :label="rejectLabel"
      @click="handleReject"
      :loading="loading"
    />
    <q-btn
      v-if="showDismiss"
      flat
      size="sm"
      color="grey-6"
      icon="close"
      label="Dismiss"
      @click="$emit('dismiss')"
      :loading="loading"
    />

    <!-- Reject reason dialog -->
    <q-dialog v-model="rejectDialogVisible" persistent>
      <q-card style="min-width: 350px; background: var(--erp-bg-card, #1e293b);">
        <q-card-section>
          <div class="text-h6">Rejection Reason</div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model="rejectReason"
            type="textarea"
            outlined
            dense
            autogrow
            placeholder="Please provide a reason for rejection..."
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" @click="rejectDialogVisible = false" />
          <q-btn
            flat
            color="negative"
            label="Reject"
            :disable="!rejectReason.trim()"
            @click="confirmReject"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  showApprove: { type: Boolean, default: true },
  showReject: { type: Boolean, default: true },
  showDismiss: { type: Boolean, default: false },
  approveLabel: { type: String, default: 'Approve' },
  rejectLabel: { type: String, default: 'Reject' },
  requireRejectReason: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['approve', 'reject', 'dismiss'])

const rejectDialogVisible = ref(false)
const rejectReason = ref('')

function handleReject() {
  rejectDialogVisible.value = true
  rejectReason.value = ''
}

function confirmReject() {
  emit('reject', rejectReason.value)
  rejectDialogVisible.value = false
}
</script>
