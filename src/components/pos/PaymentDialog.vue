<template>
  <q-dialog v-model="isOpen" persistent>
    <q-card class="payment-dialog-card bg-grey-10 text-white">
      <q-card-section class="row items-center justify-between q-pb-none">
        <div class="text-h6 text-weight-bold">Payment</div>
        <q-btn flat round icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-subtitle2 text-grey-5 q-mb-sm">Order Summary</div>
        <div class="row justify-between items-center q-mb-xs">
          <span>Total Amount</span>
          <span class="text-h5 text-primary text-weight-bold"
            >LKR {{ totalAmount.toFixed(2) }}</span
          >
        </div>
        <div class="text-caption text-grey-6">{{ itemCount }} items • {{ orderType }}</div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-section>
        <div class="text-subtitle2 text-grey-5 q-mb-sm">Select Payment Method</div>
        <div class="row q-col-gutter-sm">
          <div v-for="method in paymentMethods" :key="method.id" class="col-4">
            <q-btn
              unelevated
              class="full-width payment-btn"
              :class="{ 'active-method': selectedMethod === method.name }"
              :color="selectedMethod === method.name ? 'primary' : 'grey-9'"
              :text-color="selectedMethod === method.name ? 'white' : 'grey-4'"
              stack
              @click="selectedMethod = method.name"
            >
              <q-icon :name="method.icon" size="28px" class="q-mb-xs" />
              <div class="text-caption">{{ method.label }}</div>
            </q-btn>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md q-pt-none">
        <q-btn flat label="Cancel" color="grey-5" v-close-popup no-caps />
        <q-btn
          unelevated
          label="Confirm Payment"
          color="green-6"
          icon="check_circle"
          class="q-px-lg"
          no-caps
          :loading="loading"
          :disable="!selectedMethod"
          @click="confirmPayment"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  totalAmount: {
    type: Number,
    default: 0,
  },
  itemCount: {
    type: Number,
    default: 0,
  },
  orderType: {
    type: String,
    default: 'Dine-in',
  },
  loading: Boolean,
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const selectedMethod = ref('Cash')

const paymentMethods = [
  { id: 'cash', name: 'Cash', label: 'Cash', icon: 'payments' },
  { id: 'card', name: 'Card', label: 'Card', icon: 'credit_card' },
  { id: 'online', name: 'Online', label: 'Online', icon: 'qr_code_scanner' },
]

function confirmPayment() {
  emit('confirm', selectedMethod.value)
}
</script>

<style scoped lang="scss">
.payment-dialog-card {
  min-width: 400px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
}

.payment-btn {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px 0;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
}

.active-method {
  border-color: var(--q-primary);
  background: rgba(25, 118, 210, 0.15);
}
</style>
