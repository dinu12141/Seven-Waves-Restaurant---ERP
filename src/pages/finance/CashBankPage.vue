<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar moduleName="finance" title="Cash & Bank" breadcrumbs="Finance / Cash & Banking" showRefresh @refresh="loadData" :primaryAction="{ label: 'New Transaction', icon: 'add' }" @primary-action="showTxnDialog = true" />

    <!-- Bank Account Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="acct in bankAccounts" :key="acct.id" class="col-12 col-sm-6 col-md-3">
        <div class="fin-kpi-card" style="cursor: pointer" @click="filterByAccount(acct.id)">
          <div class="fin-kpi-card__icon" :style="{ background: acct.account_type === 'bank' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)' }">
            <q-icon :name="acct.account_type === 'bank' ? 'account_balance' : 'payments'" size="20px" :color="acct.account_type === 'bank' ? 'blue' : 'green'" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ acct.name }}</div>
            <div class="fin-kpi-card__value">{{ fmt(acct.current_balance) }}</div>
          </div>
        </div>
      </div>
      <div v-if="bankAccounts.length === 0" class="col-12">
        <div class="text-grey-6 text-center q-pa-lg">No bank/cash accounts configured. <q-btn flat dense label="Add Account" color="blue-5" @click="showAcctDialog = true" /></div>
      </div>
    </div>

    <!-- Transactions Table -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Cash Transactions ({{ transactions.length }})</span>
        <q-btn flat dense size="sm" label="Add Account" icon="add" color="blue-5" @click="showAcctDialog = true" />
      </div>
      <q-table :rows="transactions" :columns="txnCols" row-key="id" flat dark dense :rows-per-page-options="[20, 50, 0]" class="fin-table" :loading="loading" no-data-label="No transactions">
        <template #body-cell-txn_type="props">
          <q-td :props="props">
            <span :class="['deposit','transfer_in'].includes(props.row.txn_type) ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--danger'">{{ props.row.txn_type }}</span>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- New Transaction Dialog -->
    <q-dialog v-model="showTxnDialog" class="fin-dialog">
      <q-card dark style="min-width: 450px; background: #161b22; border: 1px solid #30363d;">
        <q-card-section><div class="text-subtitle1 text-weight-bold text-white">New Cash Transaction</div></q-card-section>
        <q-card-section class="q-gutter-sm fin-form">
          <q-select v-model="txnForm.bank_account_id" :options="bankAccounts" label="Account *" dense dark outlined emit-value map-options option-value="id" option-label="name" />
          <q-select v-model="txnForm.txn_type" :options="['deposit','withdrawal','transfer_in','transfer_out']" label="Type *" dense dark outlined emit-value map-options />
          <q-input v-model.number="txnForm.amount" label="Amount *" type="number" dense dark outlined />
          <q-input v-model="txnForm.counterparty" label="Counterparty" dense dark outlined />
          <q-input v-model="txnForm.reference" label="Reference" dense dark outlined />
          <q-input v-model="txnForm.description" label="Description" dense dark outlined />
          <q-input v-model="txnForm.txn_date" label="Date" type="date" dense dark outlined />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated label="Save" color="blue-8" @click="saveTxn" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Add Account Dialog -->
    <q-dialog v-model="showAcctDialog" class="fin-dialog">
      <q-card dark style="min-width: 400px; background: #161b22; border: 1px solid #30363d;">
        <q-card-section><div class="text-subtitle1 text-weight-bold text-white">Add Bank/Cash Account</div></q-card-section>
        <q-card-section class="q-gutter-sm fin-form">
          <q-input v-model="acctForm.name" label="Account Name *" dense dark outlined />
          <q-select v-model="acctForm.account_type" :options="['bank','cash','petty_cash']" label="Type *" dense dark outlined emit-value />
          <q-input v-model="acctForm.account_number" label="Account Number" dense dark outlined />
          <q-input v-model="acctForm.bank_name" label="Bank Name" dense dark outlined />
          <q-input v-model.number="acctForm.opening_balance" label="Opening Balance" type="number" dense dark outlined />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn unelevated label="Create" color="blue-8" @click="createAcct" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import { fetchBankAccounts, fetchCashTransactions, createCashTransaction, createBankAccount } from 'src/services/financeService'

const loading = ref(false); const saving = ref(false)
const bankAccounts = ref([]); const transactions = ref([])
const showTxnDialog = ref(false); const showAcctDialog = ref(false)
const txnForm = ref({ bank_account_id: '', txn_type: 'deposit', amount: 0, counterparty: '', reference: '', description: '', txn_date: new Date().toISOString().split('T')[0] })
const acctForm = ref({ name: '', account_type: 'bank', account_number: '', bank_name: '', opening_balance: 0 })
const selectedAccountFilter = ref(null)

const txnCols = [
  { name: 'txn_date', label: 'Date', field: 'txn_date', align: 'left', sortable: true, style: 'width: 100px' },
  { name: 'account', label: 'Account', field: row => row.bank_accounts?.name || '-', align: 'left' },
  { name: 'txn_type', label: 'Type', field: 'txn_type', align: 'center', style: 'width: 120px' },
  { name: 'counterparty', label: 'Counterparty', field: 'counterparty', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'reference', label: 'Reference', field: 'reference', align: 'left', style: 'width: 120px' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: v => fmt(v), style: 'width: 120px' },
]

function fmt(v) { return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function filterByAccount(id) { selectedAccountFilter.value = id; loadData() }

async function saveTxn() {
  if (!txnForm.value.bank_account_id || !txnForm.value.amount) { Notify.create({ type: 'warning', message: 'Account and Amount required' }); return }
  saving.value = true
  const { error } = await createCashTransaction(txnForm.value)
  if (error) Notify.create({ type: 'negative', message: error.message })
  else { Notify.create({ type: 'positive', message: 'Transaction recorded' }); showTxnDialog.value = false; loadData() }
  saving.value = false
}

async function createAcct() {
  if (!acctForm.value.name) { Notify.create({ type: 'warning', message: 'Name required' }); return }
  saving.value = true
  const { error } = await createBankAccount({ ...acctForm.value, current_balance: acctForm.value.opening_balance })
  if (error) Notify.create({ type: 'negative', message: error.message })
  else { Notify.create({ type: 'positive', message: 'Account created' }); showAcctDialog.value = false; loadData() }
  saving.value = false
}

async function loadData() {
  loading.value = true
  const [acctRes, txnRes] = await Promise.all([fetchBankAccounts(), fetchCashTransactions({ bankAccountId: selectedAccountFilter.value })])
  bankAccounts.value = acctRes.data || []; transactions.value = txnRes.data || []
  loading.value = false
}
onMounted(loadData)
</script>

<style scoped lang="scss">@import 'src/css/finance-common.scss';</style>
