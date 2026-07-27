<template>
  <q-dialog v-model="visible" persistent position="right" transition-show="slide-left" transition-hide="slide-right">
    <q-card class="fin-drawer" :class="$q.dark.isActive ? 'fin-drawer--dark' : ''">
      <!-- Header -->
      <div class="fin-drawer__header">
        <div class="fin-drawer__header-icon">
          <q-icon :name="isEdit ? 'edit' : 'account_balance'" size="20px" />
        </div>
        <div class="fin-drawer__header-text">
          <div class="fin-drawer__title">{{ isEdit ? 'Edit Account' : 'Register Account' }}</div>
          <div class="fin-drawer__sub">{{ isEdit ? 'Update the account details' : 'Create a cash, bank or wallet account' }}</div>
        </div>
        <q-btn flat round dense icon="close" class="fin-drawer__close" @click="close" />
      </div>

      <q-form @submit.prevent="save" class="fin-drawer__body">
        <q-scroll-area class="fin-drawer__scroll">
          <div class="q-pa-lg">
            <!-- SECTION: Classification -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="category" size="15px" class="q-mr-xs" />CLASSIFICATION</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Account Type <span class="fin-req">*</span></div>
                  <q-select v-model="form.account_type" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="accountTypeOptions"
                    :rules="[v => !!v || 'Required']" hide-bottom-space>
                    <template #prepend><q-icon :name="typeIcon(form.account_type)" size="18px" /></template>
                  </q-select>
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Linked Ledger <span class="fin-req">*</span></div>
                  <q-select v-model="form.ledger_id" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="ledgerOptions"
                    :rules="[v => !!v || 'Required']" hide-bottom-space use-input @filter="filterLedgers">
                    <template #prepend><q-icon name="book" size="18px" /></template>
                    <template #no-option>
                      <q-item><q-item-section class="text-grey">No ledgers — register a ledger first</q-item-section></q-item>
                    </template>
                  </q-select>
                </div>
              </div>
            </div>

            <!-- SECTION: Account Details -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="badge" size="15px" class="q-mr-xs" />ACCOUNT DETAILS</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Registered Name <span class="fin-req">*</span></div>
                  <q-input v-model="form.registered_name" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. Main Cash Drawer" :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Account Number</div>
                  <q-input v-model="form.account_number" outlined dense :dark="$q.dark.isActive"
                    placeholder="Optional" hide-bottom-space />
                </div>
              </div>
            </div>

            <!-- SECTION: Bank Details — always visible; required only for bank accounts -->
            <div class="fin-section fin-section--accent">
              <div class="fin-section__title">
                <q-icon name="account_balance" size="15px" class="q-mr-xs" />BANK DETAILS
                <span v-if="!isBank" class="fin-optional">optional</span>
              </div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Bank Name <span v-if="isBank" class="fin-req">*</span></div>
                  <q-input v-model="form.bank_name" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. Commercial Bank"
                    :rules="isBank ? [v => !!v || 'Required for bank accounts'] : []" hide-bottom-space />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Bank Branch <span v-if="isBank" class="fin-req">*</span></div>
                  <q-input v-model="form.bank_branch" outlined dense :dark="$q.dark.isActive"
                    placeholder="e.g. Colombo 03"
                    :rules="isBank ? [v => !!v || 'Required for bank accounts'] : []" hide-bottom-space />
                </div>
              </div>
            </div>

            <!-- SECTION: Financials -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="payments" size="15px" class="q-mr-xs" />FINANCIALS</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Opening Balance</div>
                  <q-input v-model.number="form.opening_balance" outlined dense :dark="$q.dark.isActive"
                    type="number" step="0.01" :prefix="form.currency || 'LKR'" hide-bottom-space />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Currency</div>
                  <q-select v-model="form.currency" outlined dense :dark="$q.dark.isActive"
                    :options="['LKR', 'USD', 'EUR', 'GBP', 'INR']" hide-bottom-space />
                </div>
                <div class="col-12">
                  <q-toggle v-model="form.is_default" color="primary" label="Set as default account for this type" />
                </div>
              </div>
            </div>
          </div>
        </q-scroll-area>

        <!-- Sticky footer -->
        <div class="fin-drawer__footer">
          <q-btn flat no-caps label="Cancel" color="grey-7" @click="close" />
          <q-btn type="submit" unelevated no-caps color="primary"
            :label="isEdit ? 'Save Changes' : 'Create Account'" :loading="saving" icon="save" />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'

const $q = useQuasar()
const props = defineProps({ modelValue: Boolean, account: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved'])
const ledgerStore = useFinanceLedgerStore()

const visible = ref(props.modelValue)
const saving = ref(false)
const isEdit = ref(false)

const accountTypeOptions = [
  { label: 'Cash', value: 'cash' },
  { label: 'Bank', value: 'bank' },
  { label: 'Petty Cash', value: 'petty_cash' },
  { label: 'Mobile Wallet', value: 'mobile_wallet' },
  { label: 'Card Settlement', value: 'card_settlement' },
]
function typeIcon(t) {
  return { cash: 'payments', bank: 'account_balance', petty_cash: 'savings', mobile_wallet: 'account_balance_wallet', card_settlement: 'credit_card' }[t] || 'account_balance'
}

const isBank = computed(() => form.value.account_type === 'bank')

const allLedgers = computed(() => ledgerStore.activeLedgers.map(l => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id })))
const ledgerOptions = ref([])
watch(allLedgers, v => { ledgerOptions.value = v }, { immediate: true })
function filterLedgers(val, update) {
  update(() => {
    const n = (val || '').toLowerCase()
    ledgerOptions.value = !n ? allLedgers.value : allLedgers.value.filter(o => o.label.toLowerCase().includes(n))
  })
}

const defaultForm = () => ({ account_type: 'cash', ledger_id: '', registered_name: '', account_number: '', bank_name: '', bank_branch: '', currency: 'LKR', opening_balance: 0, is_default: false })
const form = ref(defaultForm())

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))
watch(() => props.account, a => { isEdit.value = !!a; form.value = a ? { ...defaultForm(), ...a } : defaultForm() }, { immediate: true })

function close() { visible.value = false }
async function save() { saving.value = true; try { emit('saved', { ...form.value, _isEdit: isEdit.value, _id: props.account?.id }); close() } finally { saving.value = false } }
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
.fin-section--accent .fin-section__title { color: #2563eb; }
.fin-optional {
  margin-left: 8px; font-size: 0.6rem; font-weight: 700; letter-spacing: 0.4px;
  color: var(--erp-text-muted, #94a3b8); background: rgba(148,163,184,0.15);
  padding: 1px 6px; border-radius: 6px; text-transform: uppercase;
}

.fin-label { font-size: 0.78rem; font-weight: 600; color: var(--erp-text-secondary, #475569); margin-bottom: 5px; }
.fin-req { color: #ef4444; }

.fin-drawer__footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  background: var(--erp-bg-card, #fff);
}
.fin-drawer--dark .fin-drawer__footer { background: #1a1d23; border-color: rgba(255,255,255,0.08); }
</style>
