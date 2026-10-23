<template>
  <q-dialog v-model="visible" persistent position="right" transition-show="slide-left" transition-hide="slide-right">
    <q-card class="fin-drawer" :class="$q.dark.isActive ? 'fin-drawer--dark' : ''">
      <!-- Header -->
      <div class="fin-drawer__header">
        <div class="fin-drawer__header-icon">
          <q-icon :name="isEdit ? 'edit' : 'book'" size="20px" />
        </div>
        <div class="fin-drawer__header-text">
          <div class="fin-drawer__title">{{ isEdit ? 'Edit Ledger' : 'Register Ledger' }}</div>
          <div class="fin-drawer__sub">{{ isEdit ? 'Update the ledger account' : 'Create a chart-of-accounts ledger' }}</div>
        </div>
        <q-btn flat round dense icon="close" class="fin-drawer__close" @click="close" />
      </div>

      <q-form @submit.prevent="save" class="fin-drawer__body">
        <q-scroll-area class="fin-drawer__scroll">
          <div class="q-pa-lg">
            <!-- SECTION: Identity -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="badge" size="15px" class="q-mr-xs" />IDENTITY</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-7">
                  <div class="fin-label">Ledger Name <span class="fin-req">*</span></div>
                  <q-input v-model="form.ledger_name" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. Cash on Hand" :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12 col-md-5">
                  <div class="fin-label">Ledger Code <span class="fin-req">*</span></div>
                  <q-input v-model="form.ledger_code" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. 1000" :rules="[v => !!v || 'Required']" hide-bottom-space>
                    <template #append>
                      <q-btn flat dense round size="sm" icon="auto_awesome" color="primary" @click="genCode">
                        <q-tooltip>Auto-generate</q-tooltip>
                      </q-btn>
                    </template>
                  </q-input>
                </div>
              </div>
            </div>

            <!-- SECTION: Classification -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="category" size="15px" class="q-mr-xs" />CLASSIFICATION</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Ledger Type <span class="fin-req">*</span></div>
                  <q-select v-model="form.ledger_type" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="typeOptions"
                    :rules="[v => !!v || 'Required']" hide-bottom-space @update:model-value="onTypeChange" />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Ledger Nature <span class="fin-req">*</span></div>
                  <q-select v-model="form.ledger_nature" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="natureOptions"
                    :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12">
                  <div class="fin-label">Account Group</div>
                  <q-input v-model="form.account_group" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. Current Assets" hide-bottom-space />
                </div>
              </div>
            </div>

            <!-- SECTION: Opening Balance -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="payments" size="15px" class="q-mr-xs" />OPENING &amp; CURRENT BALANCE</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-7">
                  <div class="fin-label">Opening Balance</div>
                  <q-input v-model.number="form.opening_balance" outlined dense :dark="$q.dark.isActive"
                    type="number" step="0.01" prefix="LKR"
                    :rules="[v => v >= 0 || 'Cannot be negative']" hide-bottom-space />
                </div>
                <div class="col-12 col-md-5">
                  <div class="fin-label">Balance Type</div>
                  <q-select v-model="form.opening_balance_type" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="[{label:'Debit',value:'debit'},{label:'Credit',value:'credit'}]"
                    hide-bottom-space />
                </div>
                <div v-if="isEdit" class="col-12">
                  <div class="fin-label">Current Balance (Live)</div>
                  <q-input v-model.number="form.current_balance" outlined dense :dark="$q.dark.isActive"
                    type="number" step="0.01" prefix="LKR" hide-bottom-space>
                    <template #append>
                      <q-badge :color="form.current_balance >= 0 ? 'green' : 'red'">
                        {{ form.current_balance >= 0 ? 'Surplus / Active' : 'Deficit / Overdrawn' }}
                      </q-badge>
                    </template>
                  </q-input>
                  <div class="text-caption text-grey-7 q-mt-xs">
                    Direct balance adjustment updates this ledger and its linked accounts in real time.
                  </div>
                </div>
              </div>
              <div class="fin-hint">
                <q-icon name="info" size="14px" class="q-mr-xs" />
                Credit-nature opening balances (liabilities, income, equity) are stored as negative.
              </div>
            </div>

            <!-- SECTION: Flags -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="tune" size="15px" class="q-mr-xs" />FLAGS</div>
              <div class="fin-flag-grid">
                <q-toggle v-model="form.is_cashbook_ledger" color="green" label="Cashbook ledger" />
                <q-toggle v-model="form.is_bank_ledger" color="blue" label="Bank ledger" />
                <q-toggle v-model="form.is_petty_cash_ledger" color="orange" label="Petty cash ledger" />
                <q-toggle v-model="form.is_active" color="primary" label="Active" />
              </div>
            </div>
          </div>
        </q-scroll-area>

        <!-- Sticky footer -->
        <div class="fin-drawer__footer">
          <q-btn flat no-caps label="Cancel" color="grey-7" @click="close" />
          <q-btn type="submit" unelevated no-caps color="primary"
            :label="isEdit ? 'Save Changes' : 'Create Ledger'" :loading="saving" icon="save" />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useQuasar } from 'quasar'

const $q = useQuasar()
const props = defineProps({ modelValue: Boolean, ledger: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved'])

const visible = ref(props.modelValue)
const saving = ref(false)
const isEdit = ref(false)

const typeOptions = [
  { label: 'Asset', value: 'asset' },
  { label: 'Liability', value: 'liability' },
  { label: 'Equity', value: 'equity' },
  { label: 'Income', value: 'income' },
  { label: 'Expense', value: 'expense' },
]
const natureOptions = [
  { label: 'Debit', value: 'debit' },
  { label: 'Credit', value: 'credit' },
  { label: 'Both', value: 'both' },
]

// Sensible default nature per type (assets/expenses are debit-natured; the rest credit).
function onTypeChange(t) {
  if (!form.value.ledger_nature || form.value.ledger_nature === 'both') {
    form.value.ledger_nature = ['asset', 'expense'].includes(t) ? 'debit' : 'credit'
    form.value.opening_balance_type = ['asset', 'expense'].includes(t) ? 'debit' : 'credit'
  }
}
function genCode() {
  form.value.ledger_code = String(Math.floor(1000 + Math.random() * 8999))
}

const defaultForm = () => ({
  ledger_name: '', ledger_code: '', ledger_type: '', ledger_nature: '', account_group: '',
  opening_balance: 0, opening_balance_type: 'debit', current_balance: 0,
  is_cashbook_ledger: false, is_bank_ledger: false, is_petty_cash_ledger: false,
  is_system_ledger: false, is_active: true,
})
const form = ref(defaultForm())

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))
watch(() => props.ledger, l => {
  isEdit.value = !!l
  form.value = l ? { ...defaultForm(), ...l } : defaultForm()
}, { immediate: true })

function close() { visible.value = false }

async function save() {
  saving.value = true
  try {
    emit('saved', { ...form.value, _isEdit: isEdit.value, _id: props.ledger?.id })
    close()
  } finally { saving.value = false }
}
</script>

<style scoped lang="scss">
.fin-drawer {
  width: 560px; max-width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  background: var(--erp-bg-main, #fff);
}
.fin-drawer--dark { background: #1a1d23; color: #fff; }

.fin-drawer__header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; color: #fff;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}
.fin-drawer__header-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center;
}
.fin-drawer__header-text { flex: 1; }
.fin-drawer__title { font-size: 1.05rem; font-weight: 800; line-height: 1.2; }
.fin-drawer__sub { font-size: 0.75rem; opacity: 0.85; margin-top: 2px; }
.fin-drawer__close { color: #fff; }

.fin-drawer__body { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fin-drawer__scroll { flex: 1; }

.fin-section { margin-bottom: 22px; }
.fin-section__title {
  display: flex; align-items: center;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.6px;
  color: var(--erp-text-secondary, #64748b); text-transform: uppercase;
  padding-bottom: 8px; margin-bottom: 12px;
  border-bottom: 1px solid var(--erp-border, rgba(0,0,0,0.08));
}
.fin-label { font-size: 0.78rem; font-weight: 600; color: var(--erp-text-secondary, #475569); margin-bottom: 5px; }
.fin-req { color: #ef4444; }
.fin-hint {
  display: flex; align-items: center; margin-top: 10px;
  font-size: 0.72rem; color: var(--erp-text-muted, #94a3b8);
  background: rgba(37,99,235,0.06); border: 1px solid rgba(37,99,235,0.15);
  border-radius: 8px; padding: 8px 10px;
  .q-icon { color: #2563eb; }
}
.fin-flag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }

.fin-drawer__footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  background: var(--erp-bg-card, #fff);
}
.fin-drawer--dark .fin-drawer__footer { background: #1a1d23; border-color: rgba(255,255,255,0.08); }
</style>
