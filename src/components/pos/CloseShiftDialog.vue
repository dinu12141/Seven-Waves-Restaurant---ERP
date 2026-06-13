<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
    transition-show="scale"
    transition-hide="scale"
  >
    <q-card dark class="close-shift-card">
      <!-- Header -->
      <q-card-section class="header-section">
        <div class="row items-center no-wrap">
          <q-icon name="lock" size="24px" color="red" class="q-mr-sm" />
          <div class="text-h6 text-weight-bold text-white">Close Shift</div>
          <q-space />
          <q-chip dense color="grey-8" text-color="white" class="q-mr-sm">
            Step {{ step }}/{{ totalSteps }}
          </q-chip>
          <q-btn flat round dense icon="close" color="grey-5" @click="handleCancel" />
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <!-- Step 1: System Totals -->
      <q-card-section v-if="step === 1" class="step-section">
        <div class="step-title">System Calculated Totals</div>
        <div class="step-subtitle">Review the system-calculated values before counting</div>

        <table class="totals-table q-mt-md">
          <tbody>
            <tr>
              <td>Opening Cash Float</td>
              <td class="text-right val-col">{{ fmtNum(shift?.opening_cash_float) }}</td>
            </tr>
            <tr>
              <td>Cash Sales</td>
              <td class="text-right val-col text-green">+{{ fmtNum(shift?.cash_sales_total) }}</td>
            </tr>
            <tr>
              <td>Cash Drops</td>
              <td class="text-right val-col text-red">-{{ fmtNum(shift?.cash_drops_total) }}</td>
            </tr>
            <tr>
              <td>Cash In</td>
              <td class="text-right val-col text-green">+{{ fmtNum(shift?.cash_in_total) }}</td>
            </tr>
            <tr>
              <td>Cash Out</td>
              <td class="text-right val-col text-red">-{{ fmtNum(shift?.cash_out_total) }}</td>
            </tr>
            <tr class="expected-row">
              <td>EXPECTED CASH</td>
              <td class="text-right val-col text-cyan">{{ fmtNum(expectedCash) }}</td>
            </tr>
          </tbody>
        </table>

        <q-separator color="grey-8" class="q-my-md" />

        <table class="totals-table">
          <tbody>
            <tr>
              <td>Card Sales</td>
              <td class="text-right val-col">{{ fmtNum(shift?.card_sales_total) }}</td>
            </tr>
            <tr>
              <td>QR Sales</td>
              <td class="text-right val-col">{{ fmtNum(shift?.qr_sales_total) }}</td>
            </tr>
            <tr>
              <td>Bank Transfer</td>
              <td class="text-right val-col">{{ fmtNum(shift?.bank_sales_total) }}</td>
            </tr>
            <tr>
              <td>Credit Sales</td>
              <td class="text-right val-col">{{ fmtNum(shift?.credit_sales_total) }}</td>
            </tr>
            <tr class="expected-row">
              <td>TOTAL ALL SALES</td>
              <td class="text-right val-col text-yellow">{{ fmtNum(totalSales) }}</td>
            </tr>
          </tbody>
        </table>
      </q-card-section>

      <!-- Step 2: Cashier Counts -->
      <q-card-section v-if="step === 2" class="step-section">
        <div class="step-title">Enter Your Counts</div>
        <div class="step-subtitle">Count and enter the actual amounts</div>

        <q-input
          v-model.number="counts.countedCash"
          label="Counted Cash (LKR)"
          outlined dark dense
          type="number"
          bg-color="grey-9"
          class="q-mb-md q-mt-md"
          autofocus
        >
          <template v-slot:prepend>
            <q-icon name="payments" color="green" />
          </template>
        </q-input>

        <q-input
          v-model.number="counts.countedCardSlips"
          label="Counted Card Slips Total (LKR)"
          outlined dark dense
          type="number"
          bg-color="grey-9"
          class="q-mb-md"
        >
          <template v-slot:prepend>
            <q-icon name="credit_card" color="blue" />
          </template>
        </q-input>

        <q-input
          v-model.number="counts.countedQrTotal"
          label="QR / Online Total (LKR)"
          outlined dark dense
          type="number"
          bg-color="grey-9"
          class="q-mb-md"
        >
          <template v-slot:prepend>
            <q-icon name="qr_code_2" color="purple" />
          </template>
        </q-input>

        <q-input
          v-model.number="counts.countedBankTotal"
          label="Bank Transfer Total (LKR)"
          outlined dark dense
          type="number"
          bg-color="grey-9"
          class="q-mb-md"
        >
          <template v-slot:prepend>
            <q-icon name="account_balance" color="teal" />
          </template>
        </q-input>

        <q-input
          v-model="counts.closingNote"
          label="Closing Note (optional)"
          outlined dark dense
          type="textarea"
          bg-color="grey-9"
          rows="2"
        >
          <template v-slot:prepend>
            <q-icon name="notes" color="grey-5" />
          </template>
        </q-input>
      </q-card-section>

      <!-- Step 3: Variance Review -->
      <q-card-section v-if="step === 3" class="step-section">
        <div class="step-title">Variance Review</div>

        <div class="variance-display q-mt-md" :class="varianceClass">
          <div class="variance-label">Cash Variance</div>
          <div class="variance-value">
            {{ variance > 0 ? '+' : '' }}{{ fmtNum(variance) }}
          </div>
          <div class="variance-status">
            {{ varianceLabel }}
          </div>
        </div>

        <div class="variance-breakdown q-mt-md">
          <div class="vb-row">
            <span>Expected Cash:</span>
            <span>LKR {{ fmtNum(expectedCash) }}</span>
          </div>
          <div class="vb-row">
            <span>Counted Cash:</span>
            <span>LKR {{ fmtNum(counts.countedCash) }}</span>
          </div>
          <div class="vb-row vb-result" :class="varianceClass">
            <span>Variance:</span>
            <span>LKR {{ variance > 0 ? '+' : '' }}{{ fmtNum(variance) }}</span>
          </div>
        </div>

        <!-- Manager Approval (if variance != 0) -->
        <div v-if="variance !== 0" class="approval-section q-mt-lg">
          <div class="step-title text-orange">Manager Approval Required</div>
          <div class="step-subtitle q-mb-md">
            A manager must approve this variance before the shift can be closed.
          </div>

          <q-input
            v-model="approval.email"
            label="Manager Email"
            outlined dark dense
            type="email"
            bg-color="grey-9"
            class="q-mb-md"
          >
            <template v-slot:prepend>
              <q-icon name="email" color="orange" />
            </template>
          </q-input>

          <q-input
            v-model="approval.password"
            label="Manager Password"
            outlined dark dense
            type="password"
            bg-color="grey-9"
            class="q-mb-md"
          >
            <template v-slot:prepend>
              <q-icon name="lock" color="orange" />
            </template>
          </q-input>

          <q-input
            v-model="approval.note"
            label="Approval Note"
            outlined dark dense
            type="textarea"
            bg-color="grey-9"
            rows="2"
          >
            <template v-slot:prepend>
              <q-icon name="notes" color="orange" />
            </template>
          </q-input>

          <div v-if="approvalError" class="text-red q-mt-sm text-caption">
            {{ approvalError }}
          </div>
        </div>
      </q-card-section>

      <!-- Step 4: Confirmation -->
      <q-card-section v-if="step === 4" class="step-section">
        <div class="confirm-block">
          <q-icon name="check_circle" size="48px" color="green" />
          <div class="confirm-title q-mt-md">Shift Closed Successfully!</div>
          <div class="confirm-subtitle q-mt-sm">
            Shift closed at {{ formatDate(new Date()) }}
          </div>
          <div v-if="closeResult?.variance" class="confirm-variance q-mt-sm" :class="varianceClass">
            Variance: LKR {{ closeResult.variance > 0 ? '+' : '' }}{{ fmtNum(closeResult.variance) }}
          </div>
        </div>
      </q-card-section>

      <q-separator color="grey-8" />

      <!-- Actions -->
      <q-card-actions align="right" class="q-pa-md">
        <q-btn v-if="step < 4" flat label="Cancel" color="grey-5" no-caps @click="handleCancel" />

        <q-btn v-if="step > 1 && step < 4" flat label="Back" color="blue" no-caps icon="arrow_back" @click="step--" />

        <q-btn v-if="step < 3"
          unelevated label="Next" color="primary" no-caps icon-right="arrow_forward"
          @click="step++"
        />

        <q-btn v-if="step === 3"
          unelevated
          label="Close Shift"
          color="red"
          icon="lock"
          no-caps
          :loading="shiftStore.loading"
          @click="handleCloseShift"
        />

        <q-btn v-if="step === 4"
          unelevated label="Print Report" color="teal" icon="print" no-caps
          @click="handlePrintReport"
          class="q-mr-sm"
        />
        <q-btn v-if="step === 4"
          unelevated label="Done" color="primary" no-caps
          @click="handleDone"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
import { useShiftStore } from 'src/stores/shiftStore'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'
import { printService } from 'src/services/printService'

const props = defineProps({
  modelValue: Boolean,
})

const emit = defineEmits(['update:modelValue', 'closed', 'print-report'])
const shiftStore = useShiftStore()

const step = ref(1)
const totalSteps = 4
const shift = ref(null)
const closeResult = ref(null)
const approvalError = ref('')

const counts = ref({
  countedCash: 0,
  countedCardSlips: 0,
  countedQrTotal: 0,
  countedBankTotal: 0,
  closingNote: '',
})

const approval = ref({
  email: '',
  password: '',
  note: '',
})

const totalSales = computed(() => {
  if (!shift.value) return 0
  return (shift.value.cash_sales_total || 0)
    + (shift.value.card_sales_total || 0)
    + (shift.value.qr_sales_total || 0)
    + (shift.value.bank_sales_total || 0)
    + (shift.value.credit_sales_total || 0)
})

const expectedCash = computed(() => {
  if (!shift.value) return 0
  return (shift.value.opening_cash_float || 0)
    + (shift.value.cash_sales_total || 0)
    - (shift.value.cash_drops_total || 0)
    + (shift.value.cash_in_total || 0)
    - (shift.value.cash_out_total || 0)
})

const variance = computed(() => {
  return (counts.value.countedCash || 0) - expectedCash.value
})

const varianceClass = computed(() => {
  if (variance.value === 0) return 'variance-balanced'
  if (variance.value < 0) return 'variance-shortage'
  return 'variance-overage'
})

const varianceLabel = computed(() => {
  if (variance.value === 0) return 'BALANCED ✓'
  if (variance.value < 0) return 'SHORTAGE'
  return 'OVERAGE'
})

watch(() => props.modelValue, async (open) => {
  if (open) {
    step.value = 1
    closeResult.value = null
    approvalError.value = ''
    await shiftStore.refreshShiftTotals()
    shift.value = shiftStore.activeShift

    // Pre-fill counted values with system values
    if (shift.value) {
      counts.value.countedCash = expectedCash.value
      counts.value.countedCardSlips = shift.value.card_sales_total || 0
      counts.value.countedQrTotal = shift.value.qr_sales_total || 0
      counts.value.countedBankTotal = shift.value.bank_sales_total || 0
    }
  }
})

async function handleCloseShift() {
  let approvedBy = null

  // If variance, validate manager credentials
  if (variance.value !== 0) {
    if (!approval.value.email || !approval.value.password) {
      approvalError.value = 'Manager email and password are required for variance approval.'
      return
    }

    try {
      // Verify manager credentials by attempting sign-in
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: approval.value.email,
        password: approval.value.password,
      })

      if (signInError) {
        approvalError.value = 'Invalid manager credentials: ' + signInError.message
        return
      }

      approvedBy = signInData.user?.id

      // Sign back into the cashier account is not needed
      // because supabase SECURITY DEFINER RPCs use service role
      // The RPC just needs the approvedBy UUID
    } catch (err) {
      approvalError.value = 'Authentication error: ' + err.message
      return
    }
  }

  approvalError.value = ''

  const result = await shiftStore.closeShift({
    countedCash: counts.value.countedCash,
    countedCardSlips: counts.value.countedCardSlips,
    countedQrTotal: counts.value.countedQrTotal,
    countedBankTotal: counts.value.countedBankTotal,
    closingNote: counts.value.closingNote || undefined,
    approvedBy: approvedBy || undefined,
    approvalNote: approval.value.note || undefined,
  })

  if (result.success) {
    closeResult.value = result
    step.value = 4

    Notify.create({
      message: 'Shift Closed Successfully',
      caption: result.variance != null
        ? `Variance: LKR ${result.variance.toFixed(2)}`
        : undefined,
      color: 'positive',
      icon: 'check_circle',
      position: 'top',
      timeout: 3000,
    })
  } else if (result.requiresApproval) {
    approvalError.value = result.error || 'Manager approval is required for this variance.'
  } else {
    Notify.create({
      message: 'Failed to Close Shift',
      caption: result.error || 'Unknown error',
      color: 'red',
      icon: 'error',
      position: 'top',
    })
  }
}

function handleCancel() {
  step.value = 1
  emit('update:modelValue', false)
}

function handleDone() {
  step.value = 1
  emit('closed')
  emit('update:modelValue', false)
}

function fmtNum(val) {
  return parseFloat(val || 0).toFixed(2)
}

function formatDate(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const authStore = useAuthStore()

function handlePrintReport() {
  if (!shift.value || !closeResult.value) return
  
  const cashierName = authStore.profile?.full_name || authStore.user?.email || 'Cashier'
  const printPayload = {
    ...shift.value,
    closed_at: new Date().toISOString(),
    counted_cash: counts.value.countedCash,
    counted_card_slips: counts.value.countedCardSlips,
    counted_qr_total: counts.value.countedQrTotal,
    counted_bank_total: counts.value.countedBankTotal,
    variance: closeResult.value.variance,
    closing_note: counts.value.closingNote,
    cashier_name: cashierName,
  }
  printService.printShiftClose(printPayload)
}
</script>

<style scoped>
.close-shift-card {
  background: #1a1a1a;
  min-width: 440px;
  max-width: 540px;
  border: 1px solid #333;
}

.header-section {
  background: #222;
  padding: 12px 20px;
}

.step-section {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.step-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.step-subtitle {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}

.totals-table {
  width: 100%;
  border-collapse: collapse;
}

.totals-table td {
  padding: 8px 4px;
  font-size: 13px;
  color: #ccc;
  border-bottom: 1px solid #2a2a2a;
}

.val-col {
  text-align: right;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  font-size: 14px;
}

.text-green { color: #4caf50; }
.text-red { color: #ef5350; }
.text-cyan { color: #4fc3f7; }
.text-yellow { color: #ffeb3b; }
.text-orange { color: #ff9800; }

.expected-row td {
  font-weight: 800;
  font-size: 15px;
  border-top: 2px solid #444;
  color: #fff;
  padding-top: 12px;
}

/* Variance display */
.variance-display {
  text-align: center;
  padding: 24px;
  border: 2px solid;
}

.variance-balanced {
  border-color: #4caf50;
  background: rgba(76, 175, 80, 0.08);
}

.variance-shortage {
  border-color: #ef5350;
  background: rgba(239, 83, 80, 0.08);
}

.variance-overage {
  border-color: #ff9800;
  background: rgba(255, 152, 0, 0.08);
}

.variance-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.variance-value {
  font-size: 36px;
  font-weight: 800;
  font-family: 'Courier New', monospace;
  margin: 8px 0;
}

.variance-balanced .variance-value { color: #4caf50; }
.variance-shortage .variance-value { color: #ef5350; }
.variance-overage .variance-value { color: #ff9800; }

.variance-status {
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.variance-balanced .variance-status { color: #4caf50; }
.variance-shortage .variance-status { color: #ef5350; }
.variance-overage .variance-status { color: #ff9800; }

.variance-breakdown {
  background: #222;
  padding: 12px;
  border: 1px solid #333;
}

.vb-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  color: #aaa;
}

.vb-result {
  font-weight: 700;
  font-size: 14px;
  border-top: 1px solid #444;
  padding-top: 10px;
  margin-top: 4px;
}

.vb-result.variance-balanced { color: #4caf50; }
.vb-result.variance-shortage { color: #ef5350; }
.vb-result.variance-overage { color: #ff9800; }

.approval-section {
  padding: 16px;
  background: #2a1a00;
  border: 1px solid #ff9800;
}

/* Confirmation */
.confirm-block {
  text-align: center;
  padding: 24px;
}

.confirm-title {
  font-size: 20px;
  font-weight: 700;
  color: #4caf50;
}

.confirm-subtitle {
  font-size: 13px;
  color: #888;
}

.confirm-variance {
  font-size: 16px;
  font-weight: 700;
  padding: 8px 16px;
  display: inline-block;
  border: 1px solid;
}
</style>
