<template>
  <q-dialog v-model="visible" persistent maximized transition-show="slide-up">
    <q-card>
      <q-card-section class="row items-center bg-primary text-white">
        <q-icon :name="isEdit ? 'edit' : 'account_balance'" size="sm" class="q-mr-sm" />
        <div class="text-h6">{{ isEdit ? 'Edit Account' : 'Register Account' }}</div>
        <q-space /><q-btn flat round icon="close" @click="close" />
      </q-card-section>
      <q-card-section class="q-pa-lg">
        <q-form @submit.prevent="save" class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <q-select v-model="form.account_type" label="Account Type *" outlined emit-value map-options
              :options="[{label:'Cash',value:'cash'},{label:'Bank',value:'bank'},{label:'Petty Cash',value:'petty_cash'},{label:'Mobile Wallet',value:'mobile_wallet'},{label:'Card Settlement',value:'card_settlement'}]"
              :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-6">
            <q-select v-model="form.ledger_id" label="Linked Ledger *" outlined emit-value map-options
              :options="ledgerOptions" :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.registered_name" label="Registered Name *" outlined :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.account_number" label="Account Number" outlined />
          </div>
          <template v-if="form.account_type === 'bank'">
            <div class="col-12 col-md-6">
              <q-input v-model="form.bank_name" label="Bank Name *" outlined :rules="[v => !!v || 'Required for bank']" />
            </div>
            <div class="col-12 col-md-6">
              <q-input v-model="form.bank_branch" label="Bank Branch *" outlined :rules="[v => !!v || 'Required for bank']" />
            </div>
          </template>
          <div class="col-12 col-md-4">
            <q-input v-model.number="form.opening_balance" label="Opening Balance" outlined type="number" />
          </div>
          <div class="col-12 col-md-4">
            <q-input v-model="form.currency" label="Currency" outlined />
          </div>
          <div class="col-12 col-md-4 flex items-center">
            <q-checkbox v-model="form.is_default" label="Default Account" />
          </div>
          <div class="col-12 text-right">
            <q-btn flat label="Cancel" class="q-mr-sm" @click="close" />
            <q-btn type="submit" color="primary" :label="isEdit ? 'Update' : 'Create'" :loading="saving" unelevated />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'

const props = defineProps({ modelValue: Boolean, account: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved'])
const ledgerStore = useFinanceLedgerStore()

const visible = ref(props.modelValue)
const saving = ref(false)
const isEdit = ref(false)

const ledgerOptions = computed(() => ledgerStore.activeLedgers.map(l => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id })))

const defaultForm = () => ({ account_type: 'cash', ledger_id: '', registered_name: '', account_number: '', bank_name: '', bank_branch: '', currency: 'LKR', opening_balance: 0, is_default: false })
const form = ref(defaultForm())

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))
watch(() => props.account, a => { isEdit.value = !!a; form.value = a ? { ...a } : defaultForm() }, { immediate: true })

function close() { visible.value = false }
async function save() { saving.value = true; try { emit('saved', { ...form.value, _isEdit: isEdit.value, _id: props.account?.id }); close() } finally { saving.value = false } }
</script>
