<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="account_balance" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Account Registration</div>
      <q-space />
      <q-btn color="primary" icon="add" label="Register Account" unelevated @click="showForm = true" />
    </div>

    <q-table flat bordered :rows="accountStore.accounts" :columns="columns" row-key="id" :loading="accountStore.loading" :pagination="{ rowsPerPage: 20 }">
      <template v-slot:body-cell-account_type="p">
        <q-td :props="p"><q-badge :color="accColor(p.value)">{{ p.value?.replace(/_/g, ' ') }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-current_balance="p">
        <q-td :props="p" class="text-weight-bold">LKR {{ Number(p.value).toLocaleString() }}</q-td>
      </template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p">
          <q-btn flat round size="sm" icon="edit" @click="edit(p.row)" />
        </q-td>
      </template>
    </q-table>

    <AccountForm v-model="showForm" :account="editing" @saved="handleSave" />
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import AccountForm from '../components/AccountForm.vue'

const $q = useQuasar()
const accountStore = useFinanceAccountStore()
const ledgerStore = useFinanceLedgerStore()
const showForm = ref(false)
const editing = ref(null)

const columns = [
  { name: 'registered_name', label: 'Name', field: 'registered_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left' },
  { name: 'bank_name', label: 'Bank', field: 'bank_name', align: 'left' },
  { name: 'account_number', label: 'Acc No.', field: 'account_number', align: 'left' },
  { name: 'currency', label: 'Currency', field: 'currency', align: 'center' },
  { name: 'current_balance', label: 'Balance', field: 'current_balance', align: 'right', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

function accColor(t) { return { cash: 'green', bank: 'blue', petty_cash: 'orange', mobile_wallet: 'purple', card_settlement: 'teal' }[t] || 'grey' }
function edit(a) { editing.value = a; showForm.value = true }

async function handleSave(form) {
  try {
    if (form._isEdit) await accountStore.updateAccount(form._id, form)
    else await accountStore.createAccount(form)
    $q.notify({ type: 'positive', message: `Account ${form._isEdit ? 'updated' : 'created'}` })
    editing.value = null
  } catch (e) { $q.notify({ type: 'negative', message: e.message }) }
}

onMounted(async () => {
  await ledgerStore.fetchLedgers()
  await accountStore.fetchAccounts()
})
</script>
