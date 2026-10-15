<template>
  <q-dialog v-model="visible" persistent>
    <q-card style="min-width: 520px; max-width: 600px;" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white'">
      <q-card-section class="row items-center q-pb-none bg-deep-purple text-white">
        <q-icon name="account_balance" size="24px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-bold">New Bank Reconciliation</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-caption text-grey-6 q-mb-md">
          Start a monthly bank reconciliation to match bank statement transactions against system cashbook entries and cheques.
        </div>

        <q-form @submit.prevent="handleSubmit" class="q-gutter-md">
          <!-- Bank Account -->
          <div>
            <div class="text-caption text-weight-medium q-mb-xs">Bank Account <span class="text-negative">*</span></div>
            <q-select
              v-model="form.bank_account_id"
              outlined
              dense
              emit-value
              map-options
              :options="bankOptions"
              :dark="$q.dark.isActive"
              :rules="[(v) => !!v || 'Bank account is required']"
              hide-bottom-space
              @update:model-value="onBankSelect"
            >
              <template v-slot:option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-icon name="account_balance" color="deep-purple" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-medium">{{ scope.opt.label }}</q-item-label>
                    <q-item-label caption>Acc No: {{ scope.opt.account_number || 'N/A' }} | Balance: LKR {{ Number(scope.opt.current_balance || 0).toLocaleString() }}</q-item-label>
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>

          <!-- Month & Date Range -->
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-4">
              <div class="text-caption text-weight-medium q-mb-xs">Reconciliation Month <span class="text-negative">*</span></div>
              <q-input
                v-model="form.reconciliation_month"
                outlined
                dense
                type="month"
                :dark="$q.dark.isActive"
                :rules="[(v) => !!v || 'Required']"
                hide-bottom-space
                @update:model-value="onMonthChange"
              />
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption text-weight-medium q-mb-xs">Statement Start Date <span class="text-negative">*</span></div>
              <q-input
                v-model="form.statement_start_date"
                outlined
                dense
                type="date"
                :dark="$q.dark.isActive"
                :rules="[(v) => !!v || 'Required']"
                hide-bottom-space
              />
            </div>
            <div class="col-12 col-md-4">
              <div class="text-caption text-weight-medium q-mb-xs">Statement End Date <span class="text-negative">*</span></div>
              <q-input
                v-model="form.statement_end_date"
                outlined
                dense
                type="date"
                :dark="$q.dark.isActive"
                :rules="[(v) => !!v || 'Required']"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- Balances from Paper / Online Bank Statement -->
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Statement Opening Balance (LKR) <span class="text-negative">*</span></div>
              <q-input
                v-model.number="form.opening_bank_balance"
                outlined
                dense
                type="number"
                step="0.01"
                placeholder="0.00"
                :dark="$q.dark.isActive"
                :rules="[(v) => v !== '' && v !== null || 'Required']"
                hide-bottom-space
              />
            </div>
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Statement Closing Balance (LKR) <span class="text-negative">*</span></div>
              <q-input
                v-model.number="form.closing_bank_balance"
                outlined
                dense
                type="number"
                step="0.01"
                placeholder="0.00"
                :dark="$q.dark.isActive"
                :rules="[(v) => v !== '' && v !== null || 'Required']"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- Auto-fetch option -->
          <div class="q-mt-sm">
            <q-checkbox
              v-model="autoFetch"
              label="Automatically pull all cheques, vouchers, and cashbook transactions for this date range"
              color="deep-purple"
              :dark="$q.dark.isActive"
              dense
            />
          </div>

          <div class="row justify-end q-gutter-sm q-mt-lg">
            <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
            <q-btn
              type="submit"
              unelevated
              color="deep-purple"
              label="Create Reconciliation"
              :loading="saving"
              no-caps
              icon="add_circle"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: Boolean,
  bankAccounts: { type: Array, default: () => [] },
  saving: Boolean,
})

const emit = defineEmits(['update:modelValue', 'create'])

const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) initDefaults()
  }
)

watch(visible, (val) => emit('update:modelValue', val))

const now = new Date()
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const form = ref({
  bank_account_id: null,
  reconciliation_month: currentMonthStr,
  statement_start_date: '',
  statement_end_date: '',
  opening_bank_balance: 0,
  closing_bank_balance: 0,
})

const autoFetch = ref(true)

const bankOptions = computed(() => {
  return (props.bankAccounts || []).map((acc) => ({
    label: `${acc.bank_name || 'Bank'} — ${acc.registered_name || acc.account_number}`,
    value: acc.id,
    account_number: acc.account_number,
    current_balance: acc.current_balance,
  }))
})

function initDefaults() {
  if (!form.value.statement_start_date || !form.value.statement_end_date) {
    onMonthChange(form.value.reconciliation_month || currentMonthStr)
  }
}

function onMonthChange(monthStr) {
  if (!monthStr) return
  const [yearStr, monthNumStr] = monthStr.split('-')
  const y = parseInt(yearStr, 10)
  const m = parseInt(monthNumStr, 10)
  if (!isNaN(y) && !isNaN(m)) {
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    form.value.statement_start_date = startDate
    form.value.statement_end_date = endDate
  }
}

function onBankSelect(bankId) {
  const selected = props.bankAccounts.find((a) => a.id === bankId)
  if (selected && Number(selected.current_balance)) {
    // Optionally pre-suggest opening balance if desired
  }
}

function handleSubmit() {
  emit('create', {
    recon: { ...form.value },
    autoFetch: autoFetch.value,
  })
}
</script>
