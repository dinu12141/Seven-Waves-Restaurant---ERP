<template>
  <q-dialog v-model="visible" persistent>
    <q-card style="min-width: 480px; max-width: 550px;" :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white'">
      <q-card-section class="row items-center q-pb-none bg-deep-purple text-white">
        <q-icon name="note_add" size="24px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-bold">Add Statement Adjustment</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-md">
        <div class="text-caption text-grey-6 q-mb-md">
          Record bank charges, interest, card/QR settlements or direct debits/credits from your bank statement. Each adjustment is posted to the General Ledger as a balanced journal (bank ledger against the ledger you choose) and added as a cleared line.
        </div>

        <q-form @submit.prevent="handleSubmit" class="q-gutter-md">
          <!-- Direction / Type -->
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Adjustment Type <span class="text-negative">*</span></div>
              <q-select
                v-model="form.source_type"
                outlined
                dense
                emit-value
                map-options
                :options="typeOptions"
                :dark="$q.dark.isActive"
                @update:model-value="onTypeChange"
              />
            </div>
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Direction <span class="text-negative">*</span></div>
              <q-select
                v-model="form.direction"
                outlined
                dense
                emit-value
                map-options
                :options="directionOptions"
                :disable="form.source_type === 'card_settlement'"
                :dark="$q.dark.isActive"
              />
            </div>
          </div>

          <!-- Date & Amount -->
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Transaction Date <span class="text-negative">*</span></div>
              <q-input
                v-model="form.transaction_date"
                outlined
                dense
                type="date"
                :dark="$q.dark.isActive"
                :rules="[(v) => !!v || 'Required']"
                hide-bottom-space
              />
            </div>
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Amount (LKR) <span class="text-negative">*</span></div>
              <q-input
                v-model.number="form.amount"
                outlined
                dense
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                :dark="$q.dark.isActive"
                :rules="[(v) => Number(v) > 0 || 'Must be > 0']"
                hide-bottom-space
              />
            </div>
          </div>

          <!-- Contra ledger (GL) -->
          <div>
            <div class="text-caption text-weight-medium q-mb-xs">
              {{ form.source_type === 'card_settlement' ? 'Clearing Ledger (credited)' : 'Contra GL Ledger' }}
              <span class="text-negative">*</span>
            </div>
            <q-select
              v-model="form.contra_ledger_id"
              outlined
              dense
              emit-value
              map-options
              use-input
              input-debounce="0"
              :options="filteredLedgers"
              :dark="$q.dark.isActive"
              :rules="[(v) => !!v || 'Required']"
              hide-bottom-space
              @filter="filterLedgers"
            />
          </div>

          <!-- Card settlement fee (MDR) -->
          <div v-if="form.source_type === 'card_settlement'" class="row q-col-gutter-sm">
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Fee / Commission deducted</div>
              <q-input v-model.number="form.fee_amount" outlined dense type="number" step="0.01" min="0" :dark="$q.dark.isActive" hide-bottom-space />
            </div>
            <div class="col-12 col-md-6">
              <div class="text-caption text-weight-medium q-mb-xs">Fee Ledger</div>
              <q-select
                v-model="form.fee_ledger_id"
                outlined
                dense
                emit-value
                map-options
                use-input
                input-debounce="0"
                :options="filteredLedgers"
                :dark="$q.dark.isActive"
                hide-bottom-space
                @filter="filterLedgers"
              />
            </div>
            <div class="col-12 text-caption text-grey-6">
              Amount = gross settlement cleared from the card/QR clearing ledger. The bank receives Amount − Fee.
            </div>
          </div>

          <!-- Description -->
          <div>
            <div class="text-caption text-weight-medium q-mb-xs">Description / Narration <span class="text-negative">*</span></div>
            <q-input
              v-model="form.description"
              outlined
              dense
              placeholder="e.g. Monthly maintenance fee / Interest for Oct"
              :dark="$q.dark.isActive"
              :rules="[(v) => !!v?.trim() || 'Required']"
              hide-bottom-space
            />
          </div>

          <!-- Optional Note -->
          <div>
            <div class="text-caption text-weight-medium q-mb-xs">Note / Reference</div>
            <q-input
              v-model="form.note"
              outlined
              dense
              placeholder="Optional reference or remarks"
              :dark="$q.dark.isActive"
              hide-bottom-space
            />
          </div>

          <div class="row justify-end q-gutter-sm q-mt-md">
            <q-btn flat label="Cancel" color="grey-7" v-close-popup no-caps />
            <q-btn
              type="submit"
              unelevated
              color="deep-purple"
              label="Add Adjustment"
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
import { todayLK } from 'src/modules/finance/utils/finance-dates'
import { ref, watch, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'

const props = defineProps({
  modelValue: Boolean,
  saving: Boolean,
  defaultDate: { type: String, default: () => todayLK() },
  // The reconciled bank account's own ledger — excluded from the contra list.
  bankLedgerId: { type: String, default: null },
})

const CARD_CLEARING_CODE = '1021'
const ledgerOptions = ref([])
const filteredLedgers = ref([])

async function loadLedgers() {
  const { data, error } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('ledger_code')
  if (error) return
  ledgerOptions.value = (data || [])
    .filter((l) => l.id !== props.bankLedgerId)
    .map((l) => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id, code: l.ledger_code }))
  filteredLedgers.value = ledgerOptions.value
}

function filterLedgers(val, update) {
  update(() => {
    const needle = (val || '').toLowerCase()
    filteredLedgers.value = needle
      ? ledgerOptions.value.filter((o) => o.label.toLowerCase().includes(needle))
      : ledgerOptions.value
  })
}

onMounted(loadLedgers)

const emit = defineEmits(['update:modelValue', 'save'])

const visible = ref(props.modelValue)

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      form.value.transaction_date = props.defaultDate || todayLK()
      if (!ledgerOptions.value.length) loadLedgers()
    }
  }
)

watch(visible, (val) => emit('update:modelValue', val))

const blankForm = () => ({
  source_type: 'bank_charge',
  direction: 'debit',
  transaction_date: props.defaultDate || todayLK(),
  amount: null,
  description: '',
  note: '',
  contra_ledger_id: null,
  fee_amount: null,
  fee_ledger_id: null,
})
const form = ref(blankForm())

const typeOptions = [
  { label: 'Bank Charge / Fee', value: 'bank_charge' },
  { label: 'Interest Earned', value: 'interest' },
  { label: 'Direct Deposit / Credit', value: 'deposit' },
  { label: 'Direct Debit / Standing Order', value: 'manual_bank_entry' },
  { label: 'Card / QR Settlement (clears 1021)', value: 'card_settlement' },
]

const directionOptions = [
  { label: 'Payment / Outflow (Debit on Statement)', value: 'debit' },
  { label: 'Deposit / Inflow (Credit on Statement)', value: 'credit' },
]

function onTypeChange(type) {
  if (type === 'card_settlement') {
    form.value.direction = 'credit'
    form.value.contra_ledger_id = ledgerOptions.value.find((o) => o.code === CARD_CLEARING_CODE)?.value || null
    return
  }
  if (type === 'interest' || type === 'deposit') {
    form.value.direction = 'credit'
  } else {
    form.value.direction = 'debit'
  }
}

function handleSubmit() {
  emit('save', { ...form.value })
  visible.value = false
  form.value = blankForm()
}
</script>
