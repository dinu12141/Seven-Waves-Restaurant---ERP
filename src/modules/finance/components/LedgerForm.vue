<template>
  <q-dialog v-model="visible" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card>
      <q-card-section class="row items-center bg-primary text-white">
        <q-icon :name="isEdit ? 'edit' : 'add_circle'" size="sm" class="q-mr-sm" />
        <div class="text-h6">{{ isEdit ? 'Edit Ledger' : 'Register Ledger' }}</div>
        <q-space />
        <q-btn flat round icon="close" @click="close" />
      </q-card-section>

      <q-card-section class="q-pa-lg">
        <q-form @submit.prevent="save" class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <q-input v-model="form.ledger_name" label="Ledger Name *" outlined :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-6">
            <q-input v-model="form.ledger_code" label="Ledger Code *" outlined :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-select v-model="form.ledger_type" label="Ledger Type *" outlined emit-value map-options
              :options="[{label:'Asset',value:'asset'},{label:'Liability',value:'liability'},{label:'Equity',value:'equity'},{label:'Income',value:'income'},{label:'Expense',value:'expense'}]"
              :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-select v-model="form.ledger_nature" label="Ledger Nature *" outlined emit-value map-options
              :options="[{label:'Debit',value:'debit'},{label:'Credit',value:'credit'},{label:'Both',value:'both'}]"
              :rules="[v => !!v || 'Required']" />
          </div>
          <div class="col-12 col-md-4">
            <q-input v-model="form.account_group" label="Account Group" outlined />
          </div>
          <div class="col-12 col-md-4">
            <q-input v-model.number="form.opening_balance" label="Opening Balance" outlined type="number" :rules="[v => v >= 0 || 'Cannot be negative']" />
          </div>
          <div class="col-12 col-md-4">
            <q-select v-model="form.opening_balance_type" label="Opening Balance Type" outlined emit-value map-options
              :options="[{label:'Debit',value:'debit'},{label:'Credit',value:'credit'}]" />
          </div>
          <div class="col-12 col-md-4 flex items-center q-gutter-md">
            <q-checkbox v-model="form.is_cashbook_ledger" label="Cashbook" />
            <q-checkbox v-model="form.is_bank_ledger" label="Bank" />
            <q-checkbox v-model="form.is_petty_cash_ledger" label="Petty Cash" />
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
import { ref, watch } from 'vue'

const props = defineProps({ modelValue: Boolean, ledger: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'saved'])

const visible = ref(props.modelValue)
const saving = ref(false)
const isEdit = ref(false)

const defaultForm = () => ({
  ledger_name: '', ledger_code: '', ledger_type: '', ledger_nature: '', account_group: '',
  opening_balance: 0, opening_balance_type: 'debit',
  is_cashbook_ledger: false, is_bank_ledger: false, is_petty_cash_ledger: false,
})
const form = ref(defaultForm())

watch(() => props.modelValue, v => { visible.value = v })
watch(visible, v => emit('update:modelValue', v))
watch(() => props.ledger, l => {
  isEdit.value = !!l
  form.value = l ? { ...l } : defaultForm()
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
