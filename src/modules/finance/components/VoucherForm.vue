<template>
  <q-dialog v-model="visible" persistent position="right" transition-show="slide-left" transition-hide="slide-right">
    <q-card class="fin-drawer" :class="$q.dark.isActive ? 'fin-drawer--dark' : ''">
      <!-- Header (red = pay, green = received) -->
      <div class="fin-drawer__header" :class="isPay ? 'fin-drawer__header--pay' : 'fin-drawer__header--recv'">
        <div class="fin-drawer__header-icon">
          <q-icon :name="isPay ? 'payments' : 'receipt_long'" size="20px" />
        </div>
        <div class="fin-drawer__header-text">
          <div class="fin-drawer__title">{{ isPay ? 'Pay Voucher' : 'Received Voucher' }}</div>
          <div class="fin-drawer__sub">{{ isPay ? 'Record a payment out' : 'Record money received' }}</div>
        </div>
        <q-btn flat round dense icon="close" class="fin-drawer__close" @click="close" />
      </div>

      <q-form @submit.prevent="save" class="fin-drawer__body">
        <q-scroll-area class="fin-drawer__scroll">
          <div class="q-pa-lg">
            <!-- SECTION: Voucher Info -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="description" size="15px" class="q-mr-xs" />VOUCHER INFO</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Date <span class="fin-req">*</span></div>
                  <q-input v-model="form.voucher_date" outlined dense :dark="$q.dark.isActive"
                    type="date" :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">{{ isPay ? 'Pay To' : 'Received From' }} <span class="fin-req">*</span></div>
                  <q-input v-if="isPay" v-model="form.pay_to" outlined dense :dark="$q.dark.isActive"
                    placeholder="Payee name" :rules="[v => !!v || 'Required']" hide-bottom-space />
                  <q-input v-else v-model="form.received_from" outlined dense :dark="$q.dark.isActive"
                    placeholder="Payer name" :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12">
                  <div class="fin-label">Amount <span class="fin-req">*</span></div>
                  <q-input v-model.number="form.amount" outlined dense :dark="$q.dark.isActive"
                    type="number" step="0.01" prefix="LKR" placeholder="0.00"
                    :rules="[v => v > 0 || 'Must be greater than 0']" hide-bottom-space
                    :input-class="isPay ? 'text-red text-weight-bold' : 'text-green text-weight-bold'" />
                </div>
              </div>
            </div>

            <!-- SECTION: Payment Details -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="account_balance_wallet" size="15px" class="q-mr-xs" />PAYMENT DETAILS</div>
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <div class="fin-label">Payment Method <span class="fin-req">*</span></div>
                  <q-select v-model="form.payment_method" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="paymentMethodOptions"
                    :rules="[v => !!v || 'Required']" hide-bottom-space />
                </div>
                <div class="col-12 col-md-6">
                  <div class="fin-label">Ledger <span class="fin-req">*</span></div>
                  <q-select v-model="form.ledger_id" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="ledgerOptions" use-input @filter="filterLedgers"
                    :rules="[v => !!v || 'Required']" hide-bottom-space>
                    <template #no-option><q-item><q-item-section class="text-grey">Register a ledger first</q-item-section></q-item></template>
                  </q-select>
                </div>
                <div class="col-12">
                  <div class="fin-label">Account</div>
                  <q-select v-model="form.account_id" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options clearable :options="accountOptions" hide-bottom-space
                    placeholder="Optional — cash/bank account" />
                </div>
              </div>
            </div>

            <!-- SECTION: Bank & Cheque (conditional) -->
            <div v-if="needsBank || needsCheque" class="fin-section fin-section--accent">
              <div class="fin-section__title"><q-icon name="account_balance" size="15px" class="q-mr-xs" />BANK &amp; CHEQUE</div>
              <div class="row q-col-gutter-md">
                <div v-if="needsBank" class="col-12">
                  <div class="fin-label">Bank Account <span class="fin-req">*</span></div>
                  <q-select v-model="form.bank_id" outlined dense :dark="$q.dark.isActive"
                    emit-value map-options :options="bankAccountOptions"
                    :rules="(needsBank) ? [v => !!v || 'Required for bank/cheque'] : []" hide-bottom-space />
                </div>
                <template v-if="needsCheque">
                  <div class="col-12 col-md-6">
                    <div class="fin-label">Cheque No <span class="fin-req">*</span></div>
                    <q-input v-model="form.cheque_no" outlined dense :dark="$q.dark.isActive"
                      :rules="needsCheque ? [v => !!v || 'Required'] : []" hide-bottom-space />
                  </div>
                  <div class="col-12 col-md-6">
                    <div class="fin-label">Cheque Date <span class="fin-req">*</span></div>
                    <q-input v-model="form.cheque_date" outlined dense :dark="$q.dark.isActive"
                      type="date" :rules="needsCheque ? [v => !!v || 'Required'] : []" hide-bottom-space />
                  </div>
                </template>
              </div>
            </div>

            <!-- SECTION: Narration -->
            <div class="fin-section">
              <div class="fin-section__title"><q-icon name="notes" size="15px" class="q-mr-xs" />NARRATION</div>
              <div class="row q-col-gutter-md">
                <div class="col-12">
                  <div class="fin-label">Remark</div>
                  <q-input v-model="form.remark" outlined dense :dark="$q.dark.isActive"
                    placeholder="Short reference" hide-bottom-space />
                </div>
                <div class="col-12">
                  <div class="fin-label">Narration</div>
                  <q-input v-model="form.narration" outlined dense :dark="$q.dark.isActive"
                    type="textarea" rows="2" placeholder="Detailed description" hide-bottom-space />
                </div>
              </div>
            </div>

            <!-- SECTION: Voucher Lines (optional, multi-ledger) -->
            <div class="fin-section">
              <div class="fin-section__title">
                <q-icon name="table_rows" size="15px" class="q-mr-xs" />VOUCHER LINES
                <span class="fin-optional">optional</span>
                <q-space />
                <q-btn flat dense no-caps size="sm" icon="add" label="Add Line" color="primary" @click="addLine" />
              </div>
              <div v-if="!form.lines.length" class="fin-empty">No lines — single-ledger voucher.</div>
              <div v-for="(ln, i) in form.lines" :key="ln.idx" class="fin-line">
                <q-select v-model="ln.ledger_id" outlined dense :dark="$q.dark.isActive"
                  emit-value map-options :options="ledgerOptions" placeholder="Ledger" class="fin-line__ledger" hide-bottom-space />
                <q-input v-model="ln.description" outlined dense :dark="$q.dark.isActive" placeholder="Desc" hide-bottom-space />
                <q-input v-model.number="ln.debit_amount" outlined dense :dark="$q.dark.isActive" type="number" placeholder="Dr" class="fin-line__amt" hide-bottom-space />
                <q-input v-model.number="ln.credit_amount" outlined dense :dark="$q.dark.isActive" type="number" placeholder="Cr" class="fin-line__amt" hide-bottom-space />
                <q-btn flat round dense size="sm" icon="close" color="negative" @click="removeLine(i)" />
              </div>
              <!-- Double-entry balance indicator -->
              <div v-if="form.lines.length" class="fin-balance" :class="balanced ? 'fin-balance--ok' : 'fin-balance--warn'">
                <q-icon :name="balanced ? 'check_circle' : 'warning'" size="14px" class="q-mr-xs" />
                Dr {{ totalDebit.toLocaleString() }} / Cr {{ totalCredit.toLocaleString() }}
                <span class="q-ml-sm">{{ balanced ? 'Balanced' : 'Not balanced' }}</span>
              </div>
            </div>
          </div>
        </q-scroll-area>

        <!-- Sticky footer -->
        <div class="fin-drawer__footer">
          <q-btn flat no-caps label="Cancel" color="grey-7" @click="close" />
          <q-btn type="submit" unelevated no-caps :color="isPay ? 'red-8' : 'green-8'"
            :label="isPay ? 'Save Pay Voucher' : 'Save Received Voucher'" :loading="saving" icon="save" />
        </div>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'

const $q = useQuasar()
const props = defineProps({ modelValue: Boolean, type: { type: String, default: 'pay' } })
const emit = defineEmits(['update:modelValue', 'saved'])

const ledgerStore = useFinanceLedgerStore()
const accountStore = useFinanceAccountStore()
const visible = ref(props.modelValue)
const saving = ref(false)

const isPay = computed(() => props.type === 'pay')
const needsBank = computed(() => form.value.payment_method === 'bank' || form.value.payment_method === 'cheque')
const needsCheque = computed(() => form.value.payment_method === 'cheque')

const defaultForm = () => ({
  voucher_date: new Date().toISOString().split('T')[0],
  pay_to: '', received_from: '', amount: 0,
  payment_method: 'cash', ledger_id: '', account_id: '', bank_id: '',
  cheque_no: '', cheque_date: '', remark: '', narration: '', lines: [],
})
const form = ref(defaultForm())

const paymentMethodOptions = [
  { label: 'Cash', value: 'cash' }, { label: 'Bank Transfer', value: 'bank' },
  { label: 'Cheque', value: 'cheque' }, { label: 'Card', value: 'card' },
  { label: 'Online Transfer', value: 'online_transfer' }, { label: 'Petty Cash', value: 'petty_cash' },
]

const allLedgers = computed(() => ledgerStore.activeLedgers.map(l => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id })))
const ledgerOptions = ref([])
watch(allLedgers, v => { ledgerOptions.value = v }, { immediate: true })
function filterLedgers(val, update) {
  update(() => {
    const n = (val || '').toLowerCase()
    ledgerOptions.value = !n ? allLedgers.value : allLedgers.value.filter(o => o.label.toLowerCase().includes(n))
  })
}
const accountOptions = computed(() => accountStore.activeAccounts.map(a => ({ label: a.registered_name, value: a.id })))
const bankAccountOptions = computed(() => accountStore.bankAccounts.map(a => ({ label: `${a.bank_name || a.registered_name} — ${a.registered_name}`, value: a.id })))

const totalDebit = computed(() => form.value.lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0))
const totalCredit = computed(() => form.value.lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0))
const balanced = computed(() => Math.abs(totalDebit.value - totalCredit.value) < 0.01)

function addLine() { form.value.lines.push({ ledger_id: '', description: '', debit_amount: 0, credit_amount: 0, idx: Date.now() + Math.random() }) }
function removeLine(idx) { form.value.lines.splice(idx, 1) }

watch(() => props.modelValue, v => {
  visible.value = v
  if (v) form.value = defaultForm()   // fresh form each open
})
watch(visible, v => emit('update:modelValue', v))

function close() { visible.value = false }
async function save() {
  saving.value = true
  try { emit('saved', { ...form.value, voucher_type: props.type }); close() }
  finally { saving.value = false }
}
</script>

<style scoped lang="scss">
.fin-drawer {
  width: 580px; max-width: 100vw; height: 100vh;
  display: flex; flex-direction: column;
  background: var(--erp-bg-main, #fff);
}
.fin-drawer--dark { background: #1a1d23; color: #fff; }

.fin-drawer__header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; color: #fff;
}
.fin-drawer__header--pay  { background: linear-gradient(135deg, #dc2626, #b91c1c); }
.fin-drawer__header--recv { background: linear-gradient(135deg, #16a34a, #15803d); }
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

.fin-empty { font-size: 0.78rem; color: var(--erp-text-muted, #94a3b8); font-style: italic; padding: 4px 0; }
.fin-line { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.fin-line__ledger { flex: 1.4; min-width: 140px; }
.fin-line__amt { width: 84px; flex-shrink: 0; }

.fin-balance {
  display: flex; align-items: center; margin-top: 10px;
  font-size: 0.75rem; font-weight: 600; border-radius: 8px; padding: 7px 10px;
}
.fin-balance--ok   { color: #16a34a; background: rgba(22,163,74,0.1); }
.fin-balance--warn { color: #d97706; background: rgba(217,119,6,0.1); }

.fin-drawer__footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 20px; border-top: 1px solid var(--erp-border, rgba(0,0,0,0.08));
  background: var(--erp-bg-card, #fff);
}
.fin-drawer--dark .fin-drawer__footer { background: #1a1d23; border-color: rgba(255,255,255,0.08); }
</style>
