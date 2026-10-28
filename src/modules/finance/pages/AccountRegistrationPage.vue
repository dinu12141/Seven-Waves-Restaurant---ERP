<template>
  <q-page class="q-pa-md">
    <FinancePageHeader
      title="Account Registration"
      icon="account_balance"
      subtitle="Chart of accounts — control accounts each ledger rolls up to"
      breadcrumbs="Finance / Setup"
    >
      <template #actions>
        <q-btn color="primary" icon="add" label="Register Account" unelevated no-caps @click="editing = null; showForm = true" />
      </template>
    </FinancePageHeader>

    <q-banner v-if="accountStore.error" dense rounded class="bg-negative text-white q-mb-sm">
      <template #avatar><q-icon name="error" /></template>
      Could not load accounts: {{ accountStore.error }}
    </q-banner>
    <q-banner v-if="linkIssueCount" dense rounded class="bg-amber-1 text-brown-9 q-mb-sm">
      <template #avatar><q-icon name="link_off" color="amber-9" /></template>
      {{ linkIssueCount }} account(s) have a ledger-link problem (marked in the Ledger column). Their balances
      and postings may appear under the wrong ledger on the financial statements — re-link them to their own asset ledger.
    </q-banner>
    <q-banner v-if="driftCount" dense rounded class="bg-blue-1 text-blue-10 q-mb-sm">
      <template #avatar><q-icon name="sync_problem" color="blue-9" /></template>
      {{ driftCount }} account(s) have a stored balance that differs from their ledger's GL balance. The Balance
      column shows the GL figure; saving the account re-syncs it.
    </q-banner>

    <q-table flat bordered no-data-label="No accounts registered" :rows="accountStore.accounts" :columns="columns" row-key="id" :loading="accountStore.loading" :pagination="{ rowsPerPage: 20 }" class="cursor-pointer" @row-click="(_evt, row) => openStatement(row)">
      <template v-slot:body-cell-account_type="p">
        <q-td :props="p"><q-badge :color="accColor(p.value)">{{ p.value?.replace(/_/g, ' ') }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-ledger="p">
        <q-td :props="p">
          {{ p.value }}
          <q-icon v-if="p.row.link_issue" name="link_off" color="negative" class="q-ml-xs">
            <q-tooltip max-width="340px">{{ p.row.link_issue }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>
      <template v-slot:body-cell-gl_balance="p">
        <q-td :props="p" class="text-weight-bold">
          {{ p.value === null || p.value === undefined ? '—' : `${p.row.currency || 'LKR'} ${formatDrCr(p.value)}` }}
          <q-icon v-if="p.row.balance_drift" name="sync_problem" color="blue-8" class="q-ml-xs">
            <q-tooltip>Stored {{ Number(p.row.current_balance || 0).toLocaleString() }} ≠ GL {{ Number(p.value || 0).toLocaleString() }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>
      <template v-slot:body-cell-actions="p">
        <q-td :props="p">
          <q-btn flat round size="sm" icon="receipt_long" color="teal" @click.stop="openStatement(p.row)">
            <q-tooltip>View entries</q-tooltip>
          </q-btn>
          <q-btn flat round size="sm" icon="edit" color="primary" @click.stop="edit(p.row)">
            <q-tooltip>Edit</q-tooltip>
          </q-btn>
          <q-btn v-if="isAdmin" flat round size="sm" icon="delete" color="negative" @click.stop="confirmDelete(p.row)">
            <q-tooltip>Delete (admin)</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <AccountForm v-model="showForm" :account="editing" :accounts="accountStore.accounts" @saved="handleSave" />
    <LedgerStatementDialog v-model="showStatement" :account-id="statementAccountId" />
  </q-page>
</template>

<script setup>
import FinancePageHeader from '../components/FinancePageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import AccountForm from '../components/AccountForm.vue'
import LedgerStatementDialog from '../components/LedgerStatementDialog.vue'
import { formatDrCr } from '../services/finance-ledger-integrity'

const $q = useQuasar()
const authStore = useAuthStore()
const accountStore = useFinanceAccountStore()
const ledgerStore = useFinanceLedgerStore()
const showForm = ref(false)
const editing = ref(null)
const isAdmin = computed(() => authStore.isAdmin)
const linkIssueCount = computed(() => accountStore.accounts.filter(a => a.link_issue).length)
const driftCount = computed(() => accountStore.accounts.filter(a => a.balance_drift).length)
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c])

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
  { name: 'ledger', label: 'Ledger', field: (r) => (r.ledger ? `${r.ledger.ledger_code} — ${r.ledger.ledger_name}` : '—'), align: 'left' },
  { name: 'currency', label: 'Currency', field: 'currency', align: 'center' },
  { name: 'gl_balance', label: 'Balance (GL)', field: 'gl_balance', align: 'right', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'center' },
]

function accColor(t) { return { cash: 'green', bank: 'blue', petty_cash: 'orange', mobile_wallet: 'purple', card_settlement: 'teal' }[t] || 'grey' }
const showStatement = ref(false)
const statementAccountId = ref(null)
function openStatement(a) { statementAccountId.value = a.id; showStatement.value = true }
function edit(a) { editing.value = a; showForm.value = true }

async function handleSave(form) {
  try {
    if (form._isEdit) await accountStore.updateAccount(form._id, form)
    else await accountStore.createAccount(form)
    $q.notify({ type: 'positive', message: `Account ${form._isEdit ? 'updated' : 'created'}` })
    editing.value = null
    // Re-fetch so the list (balance, bank, embeds) reflects the saved row immediately.
    await accountStore.fetchAccountsWithGl()
    ledgerStore.fetchLedgers().catch(() => {})
  } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 4000 }) }
}

function confirmDelete(row) {
  $q.dialog({
    title: 'Delete Account',
    message: `Delete account <strong>${escapeHtml(row.registered_name)}</strong>? This cannot be undone.<br><br>
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
  await Promise.all([ledgerStore.fetchLedgers(), accountStore.fetchAccountsWithGl()])
})
</script>
