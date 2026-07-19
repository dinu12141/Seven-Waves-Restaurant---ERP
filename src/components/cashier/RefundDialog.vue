<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card style="min-width: 380px; max-width: 480px" class="refund-dialog">
      <!-- Header -->
      <q-card-section class="refund-header row items-center q-gutter-sm">
        <q-icon name="undo" size="22px" color="orange-6" />
        <div>
          <div class="text-subtitle1 text-weight-bold text-white">Process Refund</div>
          <div class="text-caption text-grey-4">
            Order #{{ order?.order_number }} · LKR {{ fmtAmt(order?.total_amount) }}
          </div>
        </div>
        <q-space />
        <q-btn flat round dense icon="close" color="grey-5" @click="close" />
      </q-card-section>

      <q-separator color="grey-9" />

      <!-- Order summary -->
      <q-card-section class="q-pb-sm">
        <div class="row items-center justify-between q-mb-sm">
          <span class="text-caption text-grey-5">Total paid</span>
          <span class="text-body2 text-white text-weight-medium">LKR {{ fmtAmt(order?.total_amount) }}</span>
        </div>
        <div v-if="alreadyRefunded > 0" class="row items-center justify-between q-mb-sm">
          <span class="text-caption text-grey-5">Already refunded</span>
          <span class="text-body2 text-orange-5">− LKR {{ fmtAmt(alreadyRefunded) }}</span>
        </div>
        <div class="row items-center justify-between">
          <span class="text-caption text-grey-5">Max refundable</span>
          <span class="text-body2 text-green-4 text-weight-bold">LKR {{ fmtAmt(maxRefundable) }}</span>
        </div>
      </q-card-section>

      <q-separator color="grey-9" />

      <!-- Form -->
      <q-card-section class="q-gutter-y-md">
        <!-- Refund type -->
        <q-btn-toggle
          v-model="refundType"
          dense
          no-caps
          rounded
          toggle-color="orange-8"
          color="grey-9"
          text-color="grey-4"
          :options="[
            { label: 'Full Refund', value: 'full' },
            { label: 'Partial Refund', value: 'partial' },
          ]"
          spread
          class="full-width"
        />

        <!-- Partial amount field -->
        <q-input
          v-if="refundType === 'partial'"
          v-model="partialAmount"
          type="number"
          label="Refund Amount (LKR)"
          outlined
          dense
          dark
          :rules="[
            (v) => !!v || 'Amount required',
            (v) => parseFloat(v) > 0 || 'Must be greater than 0',
            (v) => parseFloat(v) <= maxRefundable || `Cannot exceed LKR ${fmtAmt(maxRefundable)}`,
          ]"
          prefix="LKR"
          :hint="`Max: LKR ${fmtAmt(maxRefundable)}`"
          ref="amountInput"
        />

        <!-- Refund method -->
        <q-select
          v-model="refundTo"
          :options="refundMethods"
          label="Refund Via"
          outlined
          dense
          dark
          emit-value
          map-options
        />

        <!-- Reason -->
        <q-input
          v-model="reason"
          label="Reason *"
          outlined
          dense
          dark
          :rules="[(v) => !!v?.trim() || 'Reason is required']"
          type="textarea"
          rows="2"
          maxlength="255"
          counter
          ref="reasonInput"
        />
      </q-card-section>

      <!-- Preview -->
      <q-card-section class="q-pt-none">
        <div class="refund-preview row items-center justify-between q-pa-sm rounded-borders">
          <span class="text-caption text-grey-4">Refund amount</span>
          <span class="text-h6 text-orange-5 text-weight-bold">LKR {{ fmtAmt(refundAmount) }}</span>
        </div>
      </q-card-section>

      <q-separator color="grey-9" />

      <!-- Actions -->
      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Cancel" color="grey-5" @click="close" />
        <q-btn
          unelevated
          no-caps
          label="Process Refund"
          icon="undo"
          color="orange-8"
          :loading="store.processing"
          :disable="!canSubmit"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useCashierStore } from 'src/stores/cashierStore'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  order: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'refunded'])

const store = useCashierStore()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const refundType = ref('full')
const partialAmount = ref('')
const refundTo = ref('cash')
const reason = ref('')
const amountInput = ref(null)
const reasonInput = ref(null)

const refundMethods = [
  { label: 'Cash', value: 'cash' },
  { label: 'Original Payment Method', value: 'original_method' },
  { label: 'Store Credit', value: 'store_credit' },
]

const alreadyRefunded = computed(() => parseFloat(props.order?.refund_amount || 0))
const maxRefundable = computed(() => {
  const total = parseFloat(props.order?.total_amount || 0)
  return Math.max(0, total - alreadyRefunded.value)
})

const refundAmount = computed(() => {
  if (refundType.value === 'full') return maxRefundable.value
  const v = parseFloat(partialAmount.value)
  return isNaN(v) ? 0 : Math.min(v, maxRefundable.value)
})

const canSubmit = computed(() => {
  if (!reason.value?.trim()) return false
  if (refundAmount.value <= 0) return false
  if (refundType.value === 'partial') {
    const v = parseFloat(partialAmount.value)
    if (isNaN(v) || v <= 0 || v > maxRefundable.value) return false
  }
  return true
})

watch(isOpen, (open) => {
  if (open) {
    refundType.value = 'full'
    partialAmount.value = ''
    refundTo.value = 'cash'
    reason.value = ''
  }
})

function fmtAmt(val) {
  return parseFloat(val || 0).toFixed(2)
}

function close() {
  isOpen.value = false
}

async function submit() {
  if (!canSubmit.value) return
  try {
    const result = await store.refundOrder(props.order.id, refundAmount.value, reason.value, refundTo.value)
    emit('refunded', result)
    close()
  } catch {
    // error notification already shown by store
  }
}
</script>

<style scoped>
.refund-dialog {
  background: #1a1a2e;
  border: 1px solid rgba(255, 152, 0, 0.25);
}

.refund-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  padding: 16px;
}

.refund-preview {
  background: rgba(255, 152, 0, 0.08);
  border: 1px solid rgba(255, 152, 0, 0.2);
}
</style>
