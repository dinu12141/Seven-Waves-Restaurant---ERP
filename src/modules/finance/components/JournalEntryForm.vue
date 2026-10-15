<template>
  <q-dialog v-model="visible" persistent position="right" transition-show="slide-left" transition-hide="slide-right">
    <q-card class="fin-drawer" :class="$q.dark.isActive ? 'fin-drawer--dark' : ''">
      <!-- Header -->
      <div class="fin-drawer__header fin-drawer__header--journal">
        <div class="fin-drawer__header-icon">
          <q-icon name="menu_book" size="20px" />
        </div>
        <div class="fin-drawer__header-text">
          <div class="fin-drawer__title">New Journal Entry (GL)</div>
          <div class="fin-drawer__sub">Double-entry General Ledger adjustment &amp; reimbursement voucher</div>
        </div>
        <q-btn flat round dense icon="close" class="fin-drawer__close" @click="close" />
      </div>

      <q-form @submit.prevent="save" class="fin-drawer__body">
        <q-scroll-area class="fin-drawer__scroll">
          <div class="q-pa-lg">
            <!-- SECTION: Journal Info -->
            <div class="fin-section">
              <div class="fin-section__title">
                <q-icon name="description" size="15px" class="q-mr-xs" />ENTRY INFORMATION
              </div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Date <span class="fin-req">*</span></div>
                  <q-input
                    v-model="form.doc_date"
                    outlined
                    dense
                    :dark="$q.dark.isActive"
                    type="date"
                    :rules="[(v) => !!v || 'Required']"
                    hide-bottom-space
                  />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Reference Type <span class="fin-req">*</span></div>
                  <q-select
                    v-model="form.reference_type"
                    outlined
                    dense
                    :dark="$q.dark.isActive"
                    emit-value
                    map-options
                    :options="refTypeOptions"
                    :rules="[(v) => !!v || 'Required']"
                    hide-bottom-space
                  />
                </div>
                <div class="col-12">
                  <div class="fin-label">External Reference / Doc #</div>
                  <q-input
                    v-model="form.reference_id"
                    outlined
                    dense
                    :dark="$q.dark.isActive"
                    placeholder="e.g. PC-REIMB-2026-001 or Bill No."
                    hide-bottom-space
                  />
                </div>
                <div class="col-12">
                  <div class="fin-label">Narration / Description <span class="fin-req">*</span></div>
                  <q-input
                    v-model="form.description"
                    outlined
                    dense
                    :dark="$q.dark.isActive"
                    type="textarea"
                    rows="2"
                    placeholder="e.g. Reimbursement of store petty cash expenses for cleaning and stationery"
                    :rules="[(v) => !!v || 'Required']"
                    hide-bottom-space
                  />
                </div>
              </div>
            </div>

            <!-- SECTION: Journal Lines (Double-Entry) -->
            <div class="fin-section">
              <div class="fin-section__title">
                <q-icon name="account_tree" size="15px" class="q-mr-xs" />DOUBLE-ENTRY LINES
                <span class="fin-req q-ml-xs">*</span>
                <q-space />
                <q-btn
                  flat
                  dense
                  no-caps
                  size="sm"
                  icon="add"
                  label="Add Line"
                  color="primary"
                  @click="addLine"
                />
              </div>

              <div class="fin-lines-container">
                <div v-for="(line, idx) in form.lines" :key="idx" class="fin-journal-row">
                  <div class="row q-col-gutter-xs items-center q-mb-sm">
                    <!-- Ledger select -->
                    <div class="col-12 col-md-5">
                      <div class="text-caption text-grey-5" v-if="idx === 0">Ledger Account</div>
                      <q-select
                        v-model="line.ledger_id"
                        outlined
                        dense
                        :dark="$q.dark.isActive"
                        emit-value
                        map-options
                        :options="ledgerOptions"
                        use-input
                        @filter="filterLedgers"
                        @update:model-value="(val) => onLedgerSelect(val, line)"
                        placeholder="Select Account"
                        hide-bottom-space
                      >
                        <template #option="scope">
                          <q-item v-bind="scope.itemProps">
                            <q-item-section>
                              <q-item-label class="text-weight-medium">
                                {{ scope.opt.label }}
                              </q-item-label>
                              <q-item-label caption class="text-grey">
                                Code: {{ scope.opt.code }} | Type: {{ scope.opt.type }}
                              </q-item-label>
                            </q-item-section>
                            <q-item-section side>
                              <q-badge :color="getTypeColor(scope.opt.type)" dense size="xs">
                                {{ scope.opt.type }}
                              </q-badge>
                            </q-item-section>
                          </q-item>
                        </template>
                      </q-select>
                    </div>

                    <!-- Line memo -->
                    <div class="col-12 col-md-3">
                      <div class="text-caption text-grey-5" v-if="idx === 0">Memo / Note</div>
                      <q-input
                        v-model="line.memo"
                        outlined
                        dense
                        :dark="$q.dark.isActive"
                        placeholder="Memo (optional)"
                        hide-bottom-space
                      />
                    </div>

                    <!-- Debit -->
                    <div class="col-5 col-md-2">
                      <div class="text-caption text-grey-5 text-right" v-if="idx === 0">Debit (DR)</div>
                      <q-input
                        v-model.number="line.dr_amount"
                        outlined
                        dense
                        :dark="$q.dark.isActive"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        hide-bottom-space
                        input-class="text-right text-weight-bold text-primary"
                        @update:model-value="(v) => onDebitInput(v, line)"
                      />
                    </div>

                    <!-- Credit -->
                    <div class="col-5 col-md-2">
                      <div class="text-caption text-grey-5 text-right" v-if="idx === 0">Credit (CR)</div>
                      <q-input
                        v-model.number="line.cr_amount"
                        outlined
                        dense
                        :dark="$q.dark.isActive"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        hide-bottom-space
                        input-class="text-right text-weight-bold text-purple"
                        @update:model-value="(v) => onCreditInput(v, line)"
                      />
                    </div>

                    <!-- Remove line -->
                    <div class="col-2 col-md-auto text-center" :class="idx === 0 ? 'q-mt-md' : ''">
                      <q-btn
                        flat
                        round
                        dense
                        size="sm"
                        icon="close"
                        color="negative"
                        @click="removeLine(idx)"
                        :disable="form.lines.length <= 2"
                      >
                        <q-tooltip>Remove line</q-tooltip>
                      </q-btn>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Double-entry balance summary box -->
              <div class="fin-balance-box q-mt-md" :class="isBalanced ? 'fin-balance-box--ok' : 'fin-balance-box--warn'">
                <div class="row items-center justify-between">
                  <div class="row items-center q-gutter-x-md">
                    <div>
                      <span class="text-caption text-grey-6">TOTAL DEBIT (DR):</span>
                      <div class="text-weight-bold text-primary text-subtitle2">
                        LKR {{ totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                      </div>
                    </div>
                    <div>
                      <span class="text-caption text-grey-6">TOTAL CREDIT (CR):</span>
                      <div class="text-weight-bold text-purple text-subtitle2">
                        LKR {{ totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                      </div>
                    </div>
                  </div>

                  <div class="text-right">
                    <q-chip
                      :color="isBalanced ? 'positive' : 'negative'"
                      text-color="white"
                      dense
                      icon="balance"
                      class="text-weight-bold"
                    >
                      {{ isBalanced ? 'BALANCED' : `DIFFERENCE: LKR ${diff.toFixed(2)}` }}
                    </q-chip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </q-scroll-area>

        <!-- Sticky footer -->
        <div class="fin-drawer__footer">
          <q-btn flat no-caps label="Cancel" color="grey-7" @click="close" />
          <q-btn
            type="submit"
            unelevated
            no-caps
            color="primary"
            label="Post Journal Entry"
            :loading="saving"
            :disable="!isBalanced || totalDebit <= 0"
            icon="publish"
          />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceJournalStore } from '../stores/finance-journal.store'

const $q = useQuasar()
const props = defineProps({ modelValue: Boolean })
const emit = defineEmits(['update:modelValue', 'saved'])

const ledgerStore = useFinanceLedgerStore()
const journalStore = useFinanceJournalStore()

const visible = ref(props.modelValue)
const saving = ref(false)

const refTypeOptions = [
  { label: 'Manual Journal', value: 'manual' },
  { label: 'Petty Cash Reimbursement', value: 'petty_cash_reimbursement' },
  { label: 'Expense Allocation', value: 'expense_allocation' },
  { label: 'Accrual / Adjustment', value: 'accrual' },
  { label: 'Depreciation', value: 'depreciation' },
]

const defaultLines = () => [
  { ledger_id: null, account_code: '', account_name: '', memo: '', dr_amount: null, cr_amount: null },
  { ledger_id: null, account_code: '', account_name: '', memo: '', dr_amount: null, cr_amount: null },
]

const form = ref({
  doc_date: new Date().toISOString().slice(0, 10),
  reference_type: 'manual',
  reference_id: '',
  description: '',
  lines: defaultLines(),
})

const allLedgers = computed(() => ledgerStore.ledgers || [])
const ledgerFilterText = ref('')

const ledgerOptions = computed(() => {
  const txt = ledgerFilterText.value.toLowerCase().trim()
  return allLedgers.value
    .filter((l) => l.is_active)
    .filter((l) => {
      if (!txt) return true
      return (
        l.ledger_name?.toLowerCase().includes(txt) ||
        l.ledger_code?.toLowerCase().includes(txt) ||
        l.ledger_type?.toLowerCase().includes(txt)
      )
    })
    .map((l) => ({
      label: `${l.ledger_code} — ${l.ledger_name}`,
      value: l.id,
      code: l.ledger_code,
      name: l.ledger_name,
      type: l.ledger_type,
    }))
})

function filterLedgers(val, update) {
  update(() => {
    ledgerFilterText.value = val
  })
}

function onLedgerSelect(ledgerId, line) {
  const match = allLedgers.value.find((l) => l.id === ledgerId)
  if (match) {
    line.account_code = match.ledger_code
    line.account_name = match.ledger_name
  }
}

function onDebitInput(val, line) {
  if (val && Number(val) > 0) {
    line.cr_amount = null
  }
}

function onCreditInput(val, line) {
  if (val && Number(val) > 0) {
    line.dr_amount = null
  }
}

function addLine() {
  form.value.lines.push({
    ledger_id: null,
    account_code: '',
    account_name: '',
    memo: '',
    dr_amount: null,
    cr_amount: null,
  })
}

function removeLine(idx) {
  if (form.value.lines.length > 2) {
    form.value.lines.splice(idx, 1)
  }
}

const totalDebit = computed(() => {
  return form.value.lines.reduce((s, l) => s + (Number(l.dr_amount) || 0), 0)
})

const totalCredit = computed(() => {
  return form.value.lines.reduce((s, l) => s + (Number(l.cr_amount) || 0), 0)
})

const diff = computed(() => Math.abs(totalDebit.value - totalCredit.value))
const isBalanced = computed(() => totalDebit.value > 0 && diff.value < 0.01)

function getTypeColor(type) {
  switch (type) {
    case 'expense':
      return 'negative'
    case 'asset':
      return 'primary'
    case 'liability':
      return 'warning'
    case 'income':
      return 'positive'
    default:
      return 'info'
  }
}

function close() {
  visible.value = false
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  (val) => {
    visible.value = val
    if (val) {
      form.value = {
        doc_date: new Date().toISOString().slice(0, 10),
        reference_type: 'manual',
        reference_id: '',
        description: '',
        lines: defaultLines(),
      }
    }
  }
)

async function save() {
  if (!isBalanced.value) {
    $q.notify({
      type: 'negative',
      message: `Journal is imbalanced by LKR ${diff.value.toFixed(2)}. Total Debit must equal Total Credit.`,
      position: 'top',
    })
    return
  }

  saving.value = true
  try {
    await journalStore.createEntry(
      {
        doc_date: form.value.doc_date,
        reference_type: form.value.reference_type,
        reference_id: form.value.reference_id,
        description: form.value.description,
      },
      form.value.lines
    )

    $q.notify({
      type: 'positive',
      message: 'Journal Entry posted successfully to General Ledger!',
      position: 'top',
    })

    emit('saved')
    close()
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: e?.message || 'Failed to post Journal Entry',
      position: 'top',
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  ledgerStore.fetchLedgers().catch(() => {})
})
</script>

<style scoped>
.fin-drawer {
  width: 760px;
  max-width: 95vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--erp-bg-main, #fff);
}
.fin-drawer--dark {
  background: #1a1d23;
  color: #fff;
}

.fin-drawer__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  color: #fff;
}
.fin-drawer__header--journal {
  background: linear-gradient(135deg, #2563eb, #1e40af);
}
.fin-drawer__header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fin-drawer__header-text {
  flex: 1;
}
.fin-drawer__title {
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.2;
}
.fin-drawer__sub {
  font-size: 0.75rem;
  opacity: 0.85;
  margin-top: 2px;
}
.fin-drawer__close {
  color: #fff;
}

.fin-drawer__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.fin-drawer__scroll {
  flex: 1;
}

.fin-section {
  margin-bottom: 22px;
}
.fin-section__title {
  display: flex;
  align-items: center;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--erp-text-secondary, #64748b);
  text-transform: uppercase;
  padding-bottom: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--erp-border, rgba(0, 0, 0, 0.08));
}
.fin-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--erp-text-secondary, #475569);
  margin-bottom: 5px;
}
.fin-req {
  color: #ef4444;
}

.fin-journal-row {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.05);
  margin-bottom: 8px;
}
.fin-drawer--dark .fin-journal-row {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.06);
}

.fin-balance-box {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.fin-balance-box--ok {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.3);
}
.fin-balance-box--warn {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.3);
}

.fin-drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--erp-border, rgba(0, 0, 0, 0.08));
  background: var(--erp-bg-card, #fff);
}
.fin-drawer--dark .fin-drawer__footer {
  background: #1a1d23;
  border-color: rgba(255, 255, 255, 0.08);
}
</style>
