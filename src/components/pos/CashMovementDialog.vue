<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card dark class="cash-movement-card">
      <q-card-section class="header-section">
        <div class="row items-center no-wrap">
          <q-icon :name="headerIcon" size="24px" :color="headerColor" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold text-white">{{ headerTitle }}</div>
          <q-space />
          <q-btn flat round dense icon="close" color="grey-5" v-close-popup />
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-section class="form-section">
        <div class="amount-display q-mb-lg">
          <div class="amount-label">Amount (LKR)</div>
          <div class="amount-value" :class="{ 'has-value': amount > 0 }">
            {{ amount > 0 ? amount.toFixed(2) : '0.00' }}
          </div>
        </div>

        <!-- Numeric Keypad -->
        <div class="keypad q-mb-md">
          <button v-for="n in ['7','8','9','4','5','6','1','2','3','C','0','.']" :key="n"
            class="key-btn" :class="{ 'key-clear': n === 'C' }"
            @click="handleKey(n)"
          >
            {{ n }}
          </button>
        </div>

        <!-- Quick Amounts -->
        <div class="quick-amounts q-mb-md">
          <q-btn v-for="val in quickAmounts" :key="val"
            flat dense no-caps class="quick-btn"
            :label="`${val.toLocaleString()}`"
            @click="amount = val; rawInput = val.toString()"
          />
        </div>

        <q-input
          v-model="reason"
          label="Reason"
          outlined
          dark
          dense
          bg-color="grey-9"
          class="q-mb-sm"
        >
          <template v-slot:prepend>
            <q-icon name="notes" color="grey-5" />
          </template>
        </q-input>
      </q-card-section>

      <q-separator color="grey-8" />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cancel" color="grey-5" no-caps v-close-popup />
        <q-btn
          unelevated
          :label="submitLabel"
          :color="headerColor"
          :icon="headerIcon"
          no-caps
          :loading="shiftStore.loading"
          :disable="amount <= 0"
          @click="handleSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Notify } from 'quasar'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'
import { printService } from 'src/services/printService'

const props = defineProps({
  modelValue: Boolean,
  movementType: {
    type: String,
    default: 'cash_drop', // 'cash_drop' | 'cash_in' | 'cash_out'
    validator: (v) => ['cash_drop', 'cash_in', 'cash_out'].includes(v),
  },
})

const emit = defineEmits(['update:modelValue', 'completed'])
const shiftStore = useShiftStore()
const authStore = useAuthStore()

const rawInput = ref('')
const reason = ref('')
const quickAmounts = [500, 1000, 2000, 5000, 10000]

const amount = computed(() => {
  const val = parseFloat(rawInput.value)
  return isNaN(val) ? 0 : val
})

const headerTitle = computed(() => {
  switch (props.movementType) {
    case 'cash_drop': return 'Cash Drop'
    case 'cash_in': return 'Cash In'
    case 'cash_out': return 'Cash Out'
    default: return 'Cash Movement'
  }
})

const headerIcon = computed(() => {
  switch (props.movementType) {
    case 'cash_drop': return 'move_to_inbox'
    case 'cash_in': return 'add_circle'
    case 'cash_out': return 'remove_circle'
    default: return 'payments'
  }
})

const headerColor = computed(() => {
  switch (props.movementType) {
    case 'cash_drop': return 'orange'
    case 'cash_in': return 'blue'
    case 'cash_out': return 'blue'
    default: return 'primary'
  }
})

const submitLabel = computed(() => {
  return `Record ${headerTitle.value}`
})

function handleKey(key) {
  if (key === 'C') {
    rawInput.value = ''
    return
  }
  if (key === '.' && rawInput.value.includes('.')) return
  rawInput.value += key
}

async function handleSubmit() {
  if (amount.value <= 0) {
    Notify.create({ message: 'Enter a valid amount', color: 'red', position: 'top' })
    return
  }

  const result = await shiftStore.cashMovement(
    props.movementType,
    amount.value,
    reason.value || undefined,
  )

  if (result.success) {
    Notify.create({
      message: `${headerTitle.value} Recorded`,
      caption: `LKR ${amount.value.toFixed(2)}${reason.value ? ' — ' + reason.value : ''}`,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 3000,
    })

    // Print cash movement slip
    try {
      printService.printCashMovement({
        id: result.movementId || 'MOV-NEW',
        shift_id: shiftStore.shiftId || 'UNKNOWN',
        terminal_id: shiftStore.terminalId || 'POS-1',
        cashier_name: authStore.profile?.full_name || authStore.user?.email || 'Cashier',
        type: props.movementType,
        amount: amount.value,
        reason: reason.value,
        created_at: new Date().toISOString(),
      })
    } catch (printErr) {
      console.error('[CashMovementDialog] Failed to print movement slip:', printErr)
    }

    emit('completed')
    emit('update:modelValue', false)

    // Reset
    rawInput.value = ''
    reason.value = ''
  } else {
    Notify.create({
      message: `${headerTitle.value} Failed`,
      caption: result.error || 'Unknown error',
      color: 'red',
      icon: 'error',
      position: 'top',
    })
  }
}
</script>

<style scoped>
.cash-movement-card {
  background: #1a1a1a;
  min-width: 380px;
  max-width: 440px;
  border: 1px solid #333;
}

.header-section {
  background: #222;
  padding: 12px 20px;
}

.form-section {
  padding: 20px;
}

.amount-display {
  text-align: center;
  padding: 16px;
  background: #111;
  border: 1px solid #333;
}

.amount-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.amount-value {
  font-size: 36px;
  font-weight: 800;
  color: #555;
  font-family: 'Courier New', monospace;
  transition: color 0.2s;
}

.amount-value.has-value {
  color: #4caf50;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.key-btn {
  padding: 14px;
  font-size: 20px;
  font-weight: 700;
  background: #2a2a2a;
  color: #fff;
  border: 1px solid #444;
  cursor: pointer;
  transition: all 0.1s;
}

.key-btn:hover {
  background: #3a3a3a;
}

.key-btn:active {
  background: #555;
  transform: scale(0.95);
}

.key-clear {
  background: #c62828;
  border-color: #ef5350;
}

.key-clear:hover {
  background: #d32f2f;
}

.quick-amounts {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.quick-btn {
  background: #333 !important;
  color: #4fc3f7 !important;
  font-weight: 600;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid #444;
}
</style>
