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
          <q-btn flat round size="sm" icon="edit" color="primary" @click="edit(p.row)">
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn v-if="isAdmin" flat round size="sm" icon="delete" color="negative" @click="confirmDelete(p.row)">
            <q-tooltip>Delete (admin)</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <AccountForm v-model="showForm" :account="editing" @saved="handleSave" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import AccountForm from '../components/AccountForm.vue'

const $q = useQuasar()
const authStore = useAuthStore()
const accountStore = useFinanceAccountStore()
const ledgerStore = useFinanceLedgerStore()
const showForm = ref(false)
const editing = ref(null)
const isAdmin = computed(() => authStore.isAdmin)

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}

const columns = [
  { name: 'registered_name', label: 'Name', field: 'registered_name', align: 'left', sortable: true },
  { name: 'account_type', label: 'Type', field: 'account_type', align: 'left' },
  { name: 'bank_name', label: 'Bank', field: 'bank_name', align: 'left', format: (v) => v || '—' },
  { name: 'bank_branch', label: 'Branch', field: 'bank_branch', align: 'left', format: (v) => v || '—' },
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
    // Re-fetch so the list (balance, bank, embeds) reflects the saved row immediately.
    await accountStore.fetchAccounts()
  } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 4000 }) }
}

function confirmDelete(row) {
  $q.dialog({
    title: 'Delete Account',
    message: `Delete account <strong>${row.registered_name}</strong>? This cannot be undone.<br><br>
              If the account has posted transactions it cannot be deleted — deactivate it instead.`,
    html: true,
    cancel: true,
    persistent: true,
    ok: { label: 'Delete', color: 'negative', unelevated: true },
  }).onOk(async () => {
    try {
      await accountStore.deleteAccount(row.id)
      $q.notify({ type: 'positive', message: 'Account deleted' })
    } catch (e) {
      const msg = /foreign key|violates/i.test(e?.message || '')
        ? 'This account has linked transactions and cannot be deleted. Deactivate it instead.'
        : humanizeError(e)
      $q.notify({ type: 'negative', message: msg, position: 'top', timeout: 4000 })
    }
  })
}

onMounted(async () => {
  await ledgerStore.fetchLedgers()
  await accountStore.fetchAccounts()
})
</script>
