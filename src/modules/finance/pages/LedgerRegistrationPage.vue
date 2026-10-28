<template>
  <q-page class="q-pa-md">
    <FinancePageHeader
      title="Ledger Registration"
      icon="book"
      subtitle="General Ledger accounts, opening balances and current balances"
      breadcrumbs="Finance / Setup"
    >
      <template #actions>
        <q-btn color="primary" icon="add" label="Register Ledger" unelevated no-caps @click="editingLedger = null; showForm = true" />
      </template>
    </FinancePageHeader>

    <q-banner v-if="ledgerStore.error" dense rounded class="bg-negative text-white q-mb-sm">
      <template #avatar><q-icon name="error" /></template>
      Could not load ledgers: {{ ledgerStore.error }}
    </q-banner>
    <q-banner v-if="openingDiff && Math.abs(openingDiff.difference) >= 0.005" dense rounded class="bg-orange-1 text-orange-10 q-mb-sm">
      <template #avatar><q-icon name="balance" color="orange-9" /></template>
      Opening balances do not agree: Debit {{ money(openingDiff.debit) }} vs Credit {{ money(openingDiff.credit) }}
      — difference <b>{{ formatDrCr(openingDiff.difference) }}</b>. The Trial Balance and Balance Sheet carry it as
      "Difference in Opening Balances (Suspense)" until the openings are corrected so that Dr = Cr.
    </q-banner>
    <q-banner v-if="issueCount" dense rounded class="bg-amber-1 text-brown-9 q-mb-sm">
      <template #avatar><q-icon name="report_problem" color="amber-9" /></template>
      {{ issueCount }} ledger(s) have a type / account-group problem and will be mis-presented on the financial
      statements (marked in the Group column).
      <template #action>
        <q-btn flat dense no-caps color="brown-9" :label="onlyIssues ? 'Show all' : 'Show only these'" @click="onlyIssues = !onlyIssues" />
      </template>
    </q-banner>
    <q-banner v-if="driftCount" dense rounded class="bg-blue-1 text-blue-10 q-mb-sm">
      <template #avatar><q-icon name="sync_problem" color="blue-9" /></template>
      {{ driftCount }} ledger(s) have a stored balance that differs from the GL (opening + postings). The Balance
      column shows the GL figure; saving the ledger re-syncs the stored balance.
    </q-banner>

    <div class="row q-col-gutter-sm q-mb-md">
      <div class="col-12 col-md-3">
        <q-select v-model="filters.ledger_type" label="Type" outlined dense clearable emit-value map-options
          :options="[{label:'Asset',value:'asset'},{label:'Liability',value:'liability'},{label:'Equity',value:'equity'},{label:'Income',value:'income'},{label:'Expense',value:'expense'}]"
          @update:model-value="loadLedgers" />
      </div>
      <div class="col-12 col-md-3">
        <q-select v-model="statusFilter" label="Status" outlined dense emit-value map-options
          :options="[{label:'All',value:'all'},{label:'Active',value:'active'},{label:'Inactive',value:'inactive'}]" />
      </div>
      <div class="col-12 col-md-3">
        <q-input v-model="search" label="Search" outlined dense clearable>
          <template v-slot:prepend><q-icon name="search" /></template>
        </q-input>
      </div>
    </div>

    <q-table flat bordered :rows="filteredLedgers" :columns="columns" row-key="id" :loading="ledgerStore.loading"
      :pagination="{ rowsPerPage: 20 }" class="cursor-pointer" no-data-label="No ledgers found"
      @row-click="(_evt, row) => openStatement(row)">
      <template v-slot:body-cell-ledger_type="props">
        <q-td :props="props"><q-badge :color="typeColor(props.value)">{{ props.value }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-ledger_nature="props">
        <q-td :props="props"><q-badge :color="props.value === 'debit' ? 'red' : props.value === 'credit' ? 'green' : 'blue'">{{ props.value }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-account_group="props">
        <q-td :props="props">
          {{ props.value || '—' }}
          <q-icon v-if="props.row.classification_issue" name="report_problem"
            :color="props.row.classification_issue.kind === 'mismatch' ? 'negative' : 'amber-9'" class="q-ml-xs">
            <q-tooltip max-width="320px">{{ props.row.classification_issue.message }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>
      <template v-slot:body-cell-opening="props">
        <q-td :props="props">{{ formatDrCr(props.value) }}</q-td>
      </template>
      <template v-slot:body-cell-gl_balance="props">
        <q-td :props="props" class="text-weight-bold">
          {{ formatDrCr(props.value) }}
          <q-icon v-if="props.row.balance_drift" name="sync_problem" color="blue-8" class="q-ml-xs">
            <q-tooltip>Stored balance {{ money(props.row.current_balance) }} ≠ GL {{ money(props.value) }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>
      <template v-slot:body-cell-is_active="props">
        <q-td :props="props"><q-badge :color="props.value ? 'green' : 'grey'">{{ props.value ? 'Active' : 'Inactive' }}</q-badge></q-td>
      </template>
      <template v-slot:body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat round size="sm" icon="receipt_long" color="teal" @click.stop="openStatement(props.row)">
            <q-tooltip>View entries</q-tooltip>
          </q-btn>
          <q-btn flat round size="sm" icon="edit" color="primary" @click.stop="editLedger(props.row)" />
          <q-btn v-if="props.row.is_active && !props.row.is_system_ledger" flat round size="sm" icon="visibility_off" color="orange" @click.stop="deactivate(props.row)">
            <q-tooltip>Deactivate</q-tooltip>
          </q-btn>
          <q-btn v-if="!props.row.is_active" flat round size="sm" icon="visibility" color="green" @click.stop="activate(props.row)">
            <q-tooltip>Re-activate</q-tooltip>
          </q-btn>
          <q-btn v-if="isAdmin && !props.row.is_system_ledger" flat round size="sm" icon="delete" color="negative" @click.stop="confirmDelete(props.row)">
            <q-tooltip>Delete (admin)</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <LedgerForm v-model="showForm" :ledger="editingLedger" :ledgers="ledgerStore.ledgers" @saved="handleSave" />
    <LedgerStatementDialog v-model="showStatement" :ledger-id="statementLedgerId" />
  </q-page>
</template>

<script setup>
import FinancePageHeader from '../components/FinancePageHeader.vue'
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'src/stores/auth'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { useFinanceAccountStore } from '../stores/finance-account.store'
import LedgerForm from '../components/LedgerForm.vue'
import LedgerStatementDialog from '../components/LedgerStatementDialog.vue'
import { financeLedgerService } from '../services/finance-ledger.service'
import { formatDrCr, signedOpening } from '../services/finance-ledger-integrity'

const $q = useQuasar()
const authStore = useAuthStore()
const ledgerStore = useFinanceLedgerStore()
const accountStore = useFinanceAccountStore()
const showForm = ref(false)
const isAdmin = computed(() => authStore.isAdmin)

function humanizeError(err) {
  const msg = err?.message || String(err || 'Unknown error')
  if (err?.code === '42501' || /row-level security|violates row-level/i.test(msg)) {
    return 'You need finance or admin permission for this action.'
  }
  if (err?.code === '23505' || /duplicate key/i.test(msg)) {
    return 'A ledger with this code already exists.'
  }
  return msg
}
const editingLedger = ref(null)
const search = ref('')
const filters = ref({ ledger_type: null })
const statusFilter = ref('all')
const onlyIssues = ref(false)
const openingDiff = ref(null)

const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => HTML_ESC[c])

const isRealIssue = (l) => l.classification_issue && l.classification_issue.kind !== 'unclassified'
const issueCount = computed(() => ledgerStore.ledgers.filter(isRealIssue).length)
const driftCount = computed(() => ledgerStore.ledgers.filter(l => l.balance_drift).length)

const filteredLedgers = computed(() => {
  const term = (search.value || '').toLowerCase()
  return ledgerStore.ledgers.filter(l => {
    const matchesSearch = !term || (l.ledger_name || '').toLowerCase().includes(term) || (l.ledger_code || '').toLowerCase().includes(term)
    const matchesType = !filters.value.ledger_type || l.ledger_type === filters.value.ledger_type
    const matchesStatus = statusFilter.value === 'all' || (statusFilter.value === 'active' ? l.is_active : !l.is_active)
    const matchesIssue = !onlyIssues.value || isRealIssue(l)
    return matchesSearch && matchesType && matchesStatus && matchesIssue
  })
})

const columns = [
  { name: 'ledger_code', label: 'Code', field: 'ledger_code', align: 'left', sortable: true },
  { name: 'ledger_name', label: 'Name', field: 'ledger_name', align: 'left', sortable: true },
  { name: 'ledger_type', label: 'Type', field: 'ledger_type', align: 'left', sortable: true },
  { name: 'ledger_nature', label: 'Nature', field: 'ledger_nature', align: 'left' },
  { name: 'account_group', label: 'Group', field: 'account_group', align: 'left', sortable: true },
  { name: 'opening', label: 'Opening', field: (r) => signedOpening(r), align: 'right' },
  { name: 'gl_balance', label: 'Balance (GL)', field: 'gl_balance', align: 'right', sortable: true },
  { name: 'is_active', label: 'Status', field: 'is_active', align: 'center' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center' },
]

function typeColor(t) { return { asset: 'blue', liability: 'orange', equity: 'purple', income: 'green', expense: 'red' }[t] || 'grey' }
const showStatement = ref(false)
const statementLedgerId = ref(null)
function openStatement(l) { statementLedgerId.value = l.id; showStatement.value = true }
function editLedger(l) { editingLedger.value = l; showForm.value = true }

async function handleSave(form) {
  try {
    if (form._isEdit) await ledgerStore.updateLedger(form._id, form)
    else await ledgerStore.createLedger(form)
    $q.notify({ type: 'positive', message: `Ledger ${form._isEdit ? 'updated' : 'created'}` })
    editingLedger.value = null
    // Re-fetch so the list (GL balance, opening difference) reflects the saved row.
    await loadLedgers()
  } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top', timeout: 5000 }) }
}

function confirmDelete(l) {
  $q.dialog({
    title: 'Delete Ledger',
    message: `Delete ledger <strong>${escapeHtml(l.ledger_code)} — ${escapeHtml(l.ledger_name)}</strong>? This cannot be undone.<br><br>
              Ledgers with GL postings, linked accounts or an opening balance cannot be deleted — deactivate them instead.`,
    html: true,
    cancel: true,
    persistent: true,
    ok: { label: 'Delete', color: 'negative', unelevated: true },
  }).onOk(async () => {
    try {
      await ledgerStore.deleteLedger(l.id)
      $q.notify({ type: 'positive', message: 'Ledger deleted' })
      loadOpeningDiff()
    } catch (e) {
      const msg = /foreign key|violates foreign/i.test(e?.message || '')
        ? 'This ledger is referenced by other records and cannot be deleted. Deactivate it instead.'
        : humanizeError(e)
      $q.notify({ type: 'negative', message: msg, position: 'top', timeout: 5000 })
    }
  })
}

async function deactivate(l) {
  let warn = ''
  try {
    const { accounts } = await financeLedgerService.usage(l.id)
    if (accounts.length) warn += `<br><br>It is linked to account(s): <b>${accounts.map(a => escapeHtml(a.registered_name)).join(', ')}</b>.`
  } catch { /* advisory only */ }
  if (Math.abs(Number(l.gl_balance || 0)) >= 0.005) {
    warn += `<br><br>It still carries a GL balance of <b>${formatDrCr(l.gl_balance)}</b> and will keep showing on the statements.`
  }
  $q.dialog({
    title: 'Deactivate Ledger?',
    message: `Deactivate "${escapeHtml(l.ledger_name)}"? It will no longer be selectable for new entries.${warn}`,
    html: true,
    cancel: true,
  }).onOk(async () => {
    try {
      await ledgerStore.deactivateLedger(l.id)
      $q.notify({ type: 'warning', message: 'Ledger deactivated' })
    } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) }
  })
}

async function activate(l) {
  try {
    await ledgerStore.activateLedger(l.id)
    $q.notify({ type: 'positive', message: 'Ledger re-activated' })
  } catch (e) { $q.notify({ type: 'negative', message: humanizeError(e), position: 'top' }) }
}

async function loadOpeningDiff() {
  try { openingDiff.value = await financeLedgerService.getOpeningDifference() }
  catch { openingDiff.value = null }
}

async function loadLedgers() {
  await Promise.all([
    ledgerStore.fetchLedgersWithGl(filters.value),
    loadOpeningDiff(),
    accountStore.fetchAccounts().catch(() => {})
  ])
}
onMounted(loadLedgers)
</script>
