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

        <!-- Cash Out = drawer payout, booked as an expense (fn_pos_cash_payout) -->
        <template v-if="isPayout">
          <q-select
            v-model="expenseLedger"
            :options="ledgerOptions"
            :option-label="ledgerLabel"
            option-value="id"
            label="Expense category"
            outlined
            dark
            dense
            bg-color="grey-9"
            use-input
            input-debounce="150"
            clearable
            :loading="ledgersLoading"
            class="q-mb-xs"
            @filter="onLedgerFilter"
          >
            <template v-slot:prepend>
              <q-icon name="receipt_long" color="grey-5" />
            </template>
            <template v-slot:no-option>
              <q-item>
                <q-item-section class="text-grey">
                  {{ ledgersError || 'No expense ledger found' }}
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <div class="payout-note">
            <q-icon name="info" size="14px" class="q-mr-xs" />
            Cash Out is booked as an expense: Dr
            {{ expenseLedger ? ledgerLabel(expenseLedger) : '7042 — Miscellaneous Expense (default)' }}
            / Cr Cash.
          </div>
        </template>
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
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'
import { printService } from 'src/services/printService'
import { ledgerLabel, pickDefaultExpenseLedger, filterLedgers } from 'src/modules/pos/splitTenders'

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

// ── Cash Out → expense ledger (fn_pos_cash_payout, #145 §10) ──
const isPayout = computed(() => props.movementType === 'cash_out')
const expenseLedgers = ref([])
const ledgerOptions = ref([])
const expenseLedger = ref(null)
const ledgersLoading = ref(false)
const ledgersError = ref('')

async function loadExpenseLedgers() {
  if (expenseLedgers.value.length || ledgersLoading.value) return
  ledgersLoading.value = true
  ledgersError.value = ''
  try {
    let q = supabase
      .from('finance_ledgers')
      .select('id, ledger_code, ledger_name, company_id')
      .eq('ledger_type', 'expense')
      .is('deleted_at', null)
      .order('ledger_code')
      .limit(500)
    const companyId = authStore.currentBranch?.company_id
    if (companyId) q = q.or(`company_id.eq.${companyId},company_id.is.null`)
    const { data, error } = await q
    if (error) throw error
    expenseLedgers.value = data || []
    ledgerOptions.value = expenseLedgers.value
    if (!expenseLedger.value) expenseLedger.value = pickDefaultExpenseLedger(expenseLedgers.value)
  } catch (err) {
    // Not fatal: the server falls back to 7042 Miscellaneous Expense.
    ledgersError.value = 'Could not load expense ledgers — default 7042 will be used'
    console.warn('[CashMovementDialog] expense ledgers:', err)
  } finally {
    ledgersLoading.value = false
  }
}

function onLedgerFilter(val, update) {
  update(() => {
    ledgerOptions.value = filterLedgers(expenseLedgers.value, val)
  })
}

watch(
  () => [props.modelValue, props.movementType],
  ([open]) => {
    if (open && isPayout.value) loadExpenseLedgers()
  },
  { immediate: true },
)

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

  // cash_out = drawer payout → expense (fn_pos_cash_payout); cash_in / cash_drop unchanged
  const result = isPayout.value
    ? await shiftStore.cashPayout(amount.value, reason.value || undefined, expenseLedger.value?.id || null)
    : await shiftStore.cashMovement(props.movementType, amount.value, reason.value || undefined)

  if (result.success) {
    Notify.create({
      message: `${headerTitle.value} Recorded`,
      caption: `LKR ${amount.value.toFixed(2)}${reason.value ? ' — ' + reason.value : ''}${
        isPayout.value ? ' — expense: ' + (expenseLedger.value ? ledgerLabel(expenseLedger.value) : '7042') : ''
      }`,
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
      message: result.missingRpc ? 'Apply supabase/finance_pos_sales_gl_145.sql' : `${headerTitle.value} Failed`,
      caption: result.missingRpc ? 'Cash Out needs the server update (fn_pos_cash_payout).' : result.error || 'Unknown error',
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

.payout-note {
  font-size: 11px;
  color: #ffb74d;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
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
