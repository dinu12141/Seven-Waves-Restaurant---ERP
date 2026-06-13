<template>
  <q-dialog v-model="visible" persistent maximized transition-show="slide-up">
    <q-card>
      <q-card-section class="row items-center" :class="type === 'pay' ? 'bg-red-8 text-white' : 'bg-green-8 text-white'">
        <q-icon :name="type === 'pay' ? 'payment' : 'receipt'" size="sm" class="q-mr-sm" />
        <div class="text-h6">{{ type === 'pay' ? 'Pay Voucher' : 'Received Voucher' }}</div>
        <q-space /><q-btn flat round icon="close" @click="close" />
      </q-card-section>

      <q-card-section class="q-pa-lg">
        <q-form @submit.prevent="save" class="row q-col-gutter-md">
          <!-- Header -->
          <div class="col-12 col-md-4">
            <q-input v-model="form.voucher_date" label="Date *" outlined type="date" :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4" v-if="type === 'pay'">
            <q-input v-model="form.pay_to" label="Pay To *" outlined :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4" v-if="type === 'received'">
            <q-input v-model="form.received_from" label="Received From *" outlined :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-input v-model.number="form.amount" label="Amount (LKR) *" outlined type="number" prefix="LKR" :rules="[v => v > 0 || 'Must be > 0']" />
          </div>

          <!-- Payment Details -->
          <div class="col-12 col-md-4">
            <q-select v-model="form.payment_method" label="Payment Method *" outlined emit-value map-options
              :options="paymentMethodOptions" :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-select v-model="form.ledger_id" label="Ledger *" outlined emit-value map-options
              :options="ledgerOptions" :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-select v-model="form.account_id" label="Account" outlined emit-value map-options clearable
              :options="accountOptions" />
          </div>

          <!-- Bank/Cheque fields -->
          <template v-if="form.payment_method === 'bank' || form.payment_method === 'cheque'">
            <div class="col-12 col-md-4">
              <q-select v-model="form.bank_id" label="Bank Account *" outlined emit-value map-options
                :options="bankAccountOptions" :rules="[v => !!v || 'Required for bank/cheque']" />
            </div>
          </template>
          <template v-if="form.payment_method === 'cheque'">
            <div class="col-12 col-md-4">
              <q-input v-model="form.cheque_no" label="Cheque No *" outlined :rules="[v => !!v || 'Required']" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="form.cheque_date" label="Cheque Date *" outlined type="date" :rules="[v => !!v || 'Required']" />
            </div>
          </template>

          <!-- Narration -->
          <div class="col-12 col-md-6">
            <q-input v-model="form.remark" label="Remark" outlined />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.narration" label="Narration" outlined type="textarea" rows="2" />
          </div>

          <!-- Voucher Lines (multi-ledger entries) -->
          <div class="col-12">
            <div class="text-subtitle2 q-mb-sm">Voucher Lines (Optional — for multi-ledger entries)</div>
            <q-table flat bordered dense :rows="form.lines" :columns="lineColumns" row-key="idx" hide-bottom>
              <template v-slot:body="props">
                <q-tr :props="props">
                  <q-td>
                    <q-select v-model="props.row.ledger_id" dense outlined emit-value map-options :options="ledgerOptions" style="min-width:200px" />
                  </q-td>
                  <q-td><q-input v-model="props.row.description" dense outlined /></q-td>
                  <q-td><q-input v-model.number="props.row.debit_amount" dense outlined type="number" /></q-td>
                  <q-td><q-input v-model.number="props.row.credit_amount" dense outlined type="number" /></q-td>
                  <q-td><q-btn flat round size="sm" icon="delete" color="negative" @click="removeLine(props.rowIndex)" /></q-td>
                </q-tr>
              </template>
            </q-table>
            <q-btn flat size="sm" icon="add" label="Add Line" class="q-mt-sm" @click="addLine" />
          </div>

          <div class="col-12 text-right q-mt-md">
            <q-btn flat label="Cancel" class="q-mr-sm" @click="close" />
            <q-btn type="submit" :color="type === 'pay' ? 'red-8' : 'green-8'" label="Save Voucher" :loading="saving" unelevated />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'

const props = defineProps({ modelValue: Boolean, type: { type: String, default: 'pay' } })
const emit = defineEmits(['update:modelValue', 'saved'])

const ledgerStore = useFinanceLedgerStore()
const accountStore = useFinanceAccountStore()
const visible = ref(props.modelValue)
const saving = ref(false)

const form = ref({
  voucher_date: new Date().toISOString().split('T')[0],
  pay_to: '', received_from: '', amount: 0,
  payment_method: 'cash', ledger_id: '', account_id: '', bank_id: '',
  cheque_no: '', cheque_date: '', remark: '', narration: '', lines: [],
})

const paymentMethodOptions = [
  { label: 'Cash', value: 'cash' }, { label: 'Bank Transfer', value: 'bank' },
  { label: 'Cheque', value: 'cheque' }, { label: 'Card', value: 'card' },
  { label: 'Online Transfer', value: 'online_transfer' }, { label: 'Petty Cash', value: 'petty_cash' },
]

const ledgerOptions = computed(() => ledgerStore.activeLedgers.map(l => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id })))
const accountOptions = computed(() => accountStore.activeAccounts.map(a => ({ label: a.registered_name, value: a.id })))
const bankAccountOptions = computed(() => accountStore.bankAccounts.map(a => ({ label: `${a.bank_name} — ${a.registered_name}`, value: a.id })))

const lineColumns = [
  { name: 'ledger', label: 'Ledger', field: 'ledger_id', align: 'left' },
  { name: 'desc', label: 'Description', field: 'description', align: 'left' },
  { name: 'debit', label: 'Debit', field: 'debit_amount', align: 'right' },
  { name: 'credit', label: 'Credit', field: 'credit_amount', align: 'right' },
  { name: 'actions', label: '', field: 'actions' },
]

function addLine() { form.value.lines.push({ ledger_id: '', description: '', debit_amount: 0, credit_amount: 0, idx: Date.now() }) }
function removeLine(idx) { form.value.lines.splice(idx, 1) }

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))

function close() { visible.value = false }
async function save() {
  saving.value = true
  try { emit('saved', { ...form.value, voucher_type: props.type }); close() }
  finally { saving.value = false }
}
</script>
