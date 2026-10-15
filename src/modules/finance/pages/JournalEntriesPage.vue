<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <q-icon name="menu_book" size="md" color="primary" class="q-mr-sm" />
      <div>
        <div class="text-h5 text-weight-bold">Journal Entries (GL)</div>
        <div class="text-caption text-grey-6">
          Double-entry General Ledger adjustments, petty cash reimbursements &amp; non-cash vouchers
        </div>
      </div>
      <q-space />
      <q-btn
        color="primary"
        icon="add"
        label="New Journal Entry"
        unelevated
        @click="showForm = true"
      />
    </div>

    <!-- Summary KPI Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-sm">
          <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Entries</div>
          <div class="text-h6 text-weight-bold">{{ journalStore.entries.length }}</div>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-sm">
          <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Debited</div>
          <div class="text-h6 text-weight-bold text-primary">
            LKR {{ totalDebitsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
          </div>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-sm">
          <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Credited</div>
          <div class="text-h6 text-weight-bold text-purple">
            LKR {{ totalCreditsSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
          </div>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered class="q-pa-sm">
          <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Active / Reversed</div>
          <div class="text-h6 text-weight-bold">
            <span class="text-positive">{{ journalStore.activeEntries.length }}</span>
            <span class="text-grey-5 q-mx-xs">/</span>
            <span class="text-negative">{{ journalStore.reversedEntries.length }}</span>
          </div>
        </q-card>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="row q-col-gutter-sm q-mb-md items-center">
      <div class="col-12 col-md-3">
        <q-input v-model="filters.search" label="Search description or reference..." outlined dense clearable @update:model-value="load">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
      <div class="col-12 col-md-2">
        <q-select
          v-model="filters.reference_type"
          label="Type"
          outlined
          dense
          clearable
          emit-value
          map-options
          :options="typeFilterOptions"
          @update:model-value="load"
        />
      </div>
      <div class="col-12 col-md-2">
        <q-select
          v-model="filters.status"
          label="Status"
          outlined
          dense
          clearable
          emit-value
          map-options
          :options="statusFilterOptions"
          @update:model-value="load"
        />
      </div>
      <div class="col-12 col-md-2">
        <q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" />
      </div>
      <div class="col-12 col-md-2">
        <q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" />
      </div>
      <div class="col-12 col-md-1 text-right">
        <q-btn flat round dense icon="refresh" color="grey-7" @click="load">
          <q-tooltip>Refresh</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- Table -->
    <q-table
      flat
      bordered
      :rows="filteredEntries"
      :columns="columns"
      row-key="id"
      :loading="journalStore.loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <template #body-cell-reference_type="props">
        <q-td :props="props">
          <q-badge :color="getTypeColor(props.value)" dense>
            {{ formatType(props.value) }}
          </q-badge>
        </q-td>
      </template>

      <template #body-cell-total_dr="props">
        <q-td :props="props" class="text-weight-bold text-primary">
          LKR {{ Number(props.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
        </q-td>
      </template>

      <template #body-cell-total_cr="props">
        <q-td :props="props" class="text-weight-bold text-purple">
          LKR {{ Number(props.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props" align="center">
          <q-badge :color="props.row.is_reversed ? 'red' : 'green'">
            {{ props.row.is_reversed ? 'REVERSED' : 'POSTED' }}
          </q-badge>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props" align="center" class="q-gutter-xs">
          <!-- View details -->
          <q-btn flat round size="sm" icon="visibility" color="primary" @click="viewEntry(props.row)">
            <q-tooltip>View Double-Entry Lines</q-tooltip>
          </q-btn>

          <!-- Reverse entry -->
          <q-btn
            v-if="!props.row.is_reversed"
            flat
            round
            size="sm"
            icon="undo"
            color="negative"
            @click="confirmReverse(props.row)"
          >
            <q-tooltip>Reverse this Journal Entry</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Modals -->
    <JournalEntryForm v-model="showForm" @saved="load" />
    <JournalLinesDialog v-model="showViewDialog" :entry="selectedEntry" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceJournalStore } from '../stores/finance-journal.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import JournalEntryForm from '../components/JournalEntryForm.vue'
import JournalLinesDialog from '../components/JournalLinesDialog.vue'

const $q = useQuasar()
const journalStore = useFinanceJournalStore()
const ledgerStore = useFinanceLedgerStore()

const showForm = ref(false)
const showViewDialog = ref(false)
const selectedEntry = ref(null)

const filters = ref({
  search: '',
  reference_type: null,
  status: null,
  date_from: '',
  date_to: '',
})

const typeFilterOptions = [
  { label: 'All Types', value: null },
  { label: 'Manual Journal', value: 'manual' },
  { label: 'Petty Cash Reimbursement', value: 'petty_cash_reimbursement' },
  { label: 'Expense Allocation', value: 'expense_allocation' },
  { label: 'Accrual / Adjustment', value: 'accrual' },
  { label: 'Depreciation', value: 'depreciation' },
  { label: 'Reversal', value: 'reversal' },
]

const statusFilterOptions = [
  { label: 'All Statuses', value: null },
  { label: 'Posted (Active)', value: 'posted' },
  { label: 'Reversed', value: 'reversed' },
]

const columns = [
  { name: 'doc_date', label: 'Date', field: 'doc_date', align: 'left', sortable: true, style: 'width: 110px' },
  { name: 'reference_type', label: 'Type', field: 'reference_type', align: 'left', style: 'width: 140px' },
  { name: 'reference_id', label: 'Ref #', field: 'reference_id', align: 'left', style: 'width: 130px' },
  { name: 'description', label: 'Narration / Description', field: 'description', align: 'left' },
  { name: 'total_dr', label: 'Total Debit (DR)', field: 'total_dr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'total_cr', label: 'Total Credit (CR)', field: 'total_cr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'status', label: 'Status', field: 'is_reversed', align: 'center', style: 'width: 100px' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center', style: 'width: 90px' },
]

const filteredEntries = computed(() => {
  return journalStore.entries.filter((entry) => {
    if (filters.value.status === 'posted' && entry.is_reversed) return false
    if (filters.value.status === 'reversed' && !entry.is_reversed) return false
    return true
  })
})

const totalDebitsSum = computed(() => {
  return journalStore.activeEntries.reduce((s, e) => s + Number(e.total_dr || 0), 0)
})

const totalCreditsSum = computed(() => {
  return journalStore.activeEntries.reduce((s, e) => s + Number(e.total_cr || 0), 0)
})

function formatType(type) {
  if (!type) return 'Manual'
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function getTypeColor(type) {
  switch (type) {
    case 'petty_cash_reimbursement':
      return 'orange-9'
    case 'expense_allocation':
      return 'teal'
    case 'reversal':
      return 'red-8'
    case 'accrual':
      return 'indigo'
    case 'depreciation':
      return 'brown'
    default:
      return 'blue-8'
  }
}

function viewEntry(entry) {
  selectedEntry.value = entry
  showViewDialog.value = true
}

function confirmReverse(entry) {
  $q.dialog({
    title: 'Reverse Journal Entry',
    message: `Are you sure you want to reverse entry "${entry.description}"? A reversing journal entry will be posted to restore ledger balances.`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Reversal Reason (optional)',
    },
    cancel: true,
    persistent: true,
    dark: $q.dark.isActive,
  }).onOk(async (reason) => {
    try {
      await journalStore.reverseEntry(entry.id, reason)
      $q.notify({
        type: 'positive',
        message: 'Reversal journal entry posted successfully!',
        position: 'top',
      })
      await load()
    } catch (e) {
      $q.notify({
        type: 'negative',
        message: e?.message || 'Failed to reverse entry',
        position: 'top',
      })
    }
  })
}

async function load() {
  await journalStore.fetchEntries(filters.value)
}

onMounted(async () => {
  await Promise.all([load(), ledgerStore.fetchLedgers()])
})
</script>
