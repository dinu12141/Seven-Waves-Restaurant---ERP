<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="account_balance" size="md" color="deep-purple" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Bank Reconciliation</div>
      <q-space />
      <q-btn color="deep-purple" icon="add" label="New Reconciliation" unelevated @click="showCreate = true" />
    </div>

    <q-table flat bordered :rows="reconStore.reconciliations" :columns="columns" row-key="id" :loading="reconStore.loading" :pagination="{ rowsPerPage: 15 }">
      <template v-slot:body-cell-status="p"><q-td :props="p"><q-badge :color="sColor(p.value)">{{ p.value }}</q-badge></q-td></template>
      <template v-slot:body-cell-difference_amount="p">
        <q-td :props="p" :class="Number(p.value) === 0 ? 'text-green-8' : 'text-red-8'" class="text-weight-bold">
          LKR {{ Number(p.value).toLocaleString() }}
        </q-td>
      </template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p">
          <q-btn flat round size="sm" icon="visibility" @click="viewRecon(p.row)" />
          <q-btn v-if="p.row.status === 'reconciled'" flat round size="sm" icon="approval" color="positive" @click="approveRecon(p.row.id)" />
        </q-td>
      </template>
    </q-table>

    <!-- Create Dialog -->
    <q-dialog v-model="showCreate" persistent>
      <q-card style="min-width:500px">
        <q-card-section class="text-h6 bg-deep-purple text-white">New Reconciliation</q-card-section>
        <q-card-section>
          <q-form @submit.prevent="createRecon" class="q-gutter-sm">
            <q-select v-model="createForm.bank_account_id" label="Bank Account *" outlined emit-value map-options :options="bankOptions" :rules="[v => !!v || 'Required']" />
            <q-input v-model="createForm.reconciliation_month" label="Month (YYYY-MM) *" outlined :rules="[v => !!v || 'Required']" />
            <q-input v-model="createForm.statement_start_date" label="Statement Start" outlined type="date" />
            <q-input v-model="createForm.statement_end_date" label="Statement End" outlined type="date" />
            <q-input v-model.number="createForm.opening_bank_balance" label="Opening Bank Balance" outlined type="number" />
            <q-input v-model.number="createForm.closing_bank_balance" label="Closing Bank Balance" outlined type="number" />
            <div class="text-right q-mt-md">
              <q-btn flat label="Cancel" @click="showCreate = false" class="q-mr-sm" />
              <q-btn type="submit" color="deep-purple" label="Create" unelevated />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceAccountStore } from '../stores/finance-account.store'

const $q = useQuasar()
const accountStore = useFinanceAccountStore()

// Inline store usage since reconciliation store is separate
import { financeBankReconciliationService } from '../services/finance-bank-reconciliation.service'
const reconStore = ref({ reconciliations: [], loading: false })

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  return msg
}

const showCreate = ref(false)
const createForm = ref({ bank_account_id: '', reconciliation_month: '', statement_start_date: '', statement_end_date: '', opening_bank_balance: 0, closing_bank_balance: 0 })

const bankOptions = computed(() => accountStore.bankAccounts.map(a => ({ label: `${a.bank_name} — ${a.registered_name}`, value: a.id })))

const columns = [
  { name: 'reconciliation_month', label: 'Month', field: 'reconciliation_month', align: 'left', sortable: true },
  { name: 'bank', label: 'Bank', field: r => r.bank_account?.bank_name || '—', align: 'left' },
  { name: 'opening_bank_balance', label: 'Opening', field: r => `LKR ${Number(r.opening_bank_balance).toLocaleString()}`, align: 'right' },
  { name: 'closing_bank_balance', label: 'Closing', field: r => `LKR ${Number(r.closing_bank_balance).toLocaleString()}`, align: 'right' },
  { name: 'difference_amount', label: 'Difference', field: 'difference_amount', align: 'right' },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

function sColor(s) { return { draft: 'grey', reconciled: 'blue', approved: 'green', locked: 'dark' }[s] || 'grey' }

async function loadRecons() {
  reconStore.value.loading = true
  try { reconStore.value.reconciliations = await financeBankReconciliationService.list() }
  finally { reconStore.value.loading = false }
}

async function createRecon() {
  try {
    await financeBankReconciliationService.create(createForm.value)
    showCreate.value = false; $q.notify({ type: 'positive', message: 'Created' }); loadRecons()
  } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 4000 }) }
}

async function approveRecon(id) {
  try { await financeBankReconciliationService.approve(id); $q.notify({ type: 'positive', message: 'Approved' }); loadRecons() }
  catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) }
}

function viewRecon(r) { $q.notify({ message: `View reconciliation ${r.reconciliation_month} — lines: ${r.lines?.length || 0}` }) }

onMounted(async () => { await accountStore.fetchAccounts(); await loadRecons() })
</script>
