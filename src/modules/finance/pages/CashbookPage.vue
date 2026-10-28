<template>
  <q-page class="q-pa-md">
    <FinancePageHeader
      :title="title"
      icon="menu_book"
      :subtitle="petty ? 'Petty cash ledgers — receipts, payments and running balance from the GL' : 'Cash & bank ledgers — receipts, payments and running balance from the GL'"
      breadcrumbs="Finance / Cash & Banking"
      show-refresh
      :loading="loading"
      @refresh="load"
    />
    <FinanceFilterBar
      v-model:from="filters.date_from"
      v-model:to="filters.date_to"
      :persist-key="petty ? 'petty-cash' : 'cashbook'"
      @change="load"
      @reset="resetFilters"
    >
      <q-select v-model="filters.ledger_id" :label="petty ? 'Petty cash ledger' : 'Cash / bank ledger'" outlined dense clearable
        emit-value map-options :options="ledgerSelectOptions" use-input input-debounce="0" @filter="onLedgerFilter"
        style="min-width: 240px" @update:model-value="load"
        :placeholder="filters.ledger_id ? '' : (petty ? 'All petty cash ledgers' : 'All cash & bank ledgers')" />
      <q-select v-model="filters.source_type" label="Source" outlined dense clearable emit-value map-options
        style="min-width: 160px" :options="sourceOptions" @update:model-value="load" />
      <q-select v-if="branchOptions.length > 1" v-model="filters.branch_id" label="Branch" outlined dense clearable emit-value map-options
        style="min-width: 160px" :options="branchOptions" placeholder="All branches" @update:model-value="load" />
      <template #actions>
        <q-btn-dropdown outline no-caps dense color="primary" icon="file_download" label="Export" :disable="!rows.length">
          <q-list dense>
            <q-item clickable v-close-popup @click="exportToCsv">
              <q-item-section avatar><q-icon name="description" /></q-item-section>
              <q-item-section>CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="exportToExcel">
              <q-item-section avatar><q-icon name="table_view" color="positive" /></q-item-section>
              <q-item-section>Excel (.xlsx)</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="exportToPdf">
              <q-item-section avatar><q-icon name="picture_as_pdf" color="negative" /></q-item-section>
              <q-item-section>PDF</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </template>
    </FinanceFilterBar>
    <q-banner v-if="error" class="bg-red-1 text-negative q-mb-md" rounded dense>{{ error }}</q-banner>
    <q-banner v-if="filters.source_type" class="bg-blue-1 text-blue-10 q-mb-md" rounded dense>
      Showing only {{ sourceLabel }} rows — balances still include every movement of the ledger.
    </q-banner>
    <CashbookTable :report="report" :loading="loading" :title="title" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useFinanceCashbookStore } from '../stores/finance-cashbook.store'
import { useAuthStore } from 'src/stores/auth'
import CashbookTable from '../components/CashbookTable.vue'
import FinancePageHeader from '../components/FinancePageHeader.vue'
import FinanceFilterBar from '../components/FinanceFilterBar.vue'
import { useSelectFilter } from '../composables/useSelectFilter'
import { monthStart, todayLK, rangeLabel } from '../utils/finance-dates'
import { CASHBOOK_SOURCE_OPTIONS } from '../services/finance-cashbook.builder'
import { formatDrCr } from '../services/finance-ledger-statement.builder'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

const props = defineProps({ petty: { type: Boolean, default: false } })

const cashbookStore = useFinanceCashbookStore()
const authStore = useAuthStore()
const title = computed(() => (props.petty ? 'Petty Cash Book' : 'Cashbook'))
const filters = ref({ date_from: firstOfMonth(), date_to: '', source_type: null, ledger_id: null, branch_id: null })
const sourceOptions = CASHBOOK_SOURCE_OPTIONS

const report = computed(() => (props.petty ? cashbookStore.pettyReport : cashbookStore.report))
const rows = computed(() => report.value?.rows || [])
const loading = computed(() => cashbookStore.loading)
const error = computed(() => cashbookStore.error)
const sourceLabel = computed(() => sourceOptions.find((o) => o.value === filters.value.source_type)?.label || filters.value.source_type)

const ledgerOptions = computed(() => {
  const books = report.value?.books || { cash: [], petty: [] }
  return (props.petty ? books.petty : books.cash).map((l) => ({ label: `${l.ledger_code} — ${l.ledger_name}`, value: l.id }))
})
const { options: ledgerSelectOptions, onFilter: onLedgerFilter } = useSelectFilter(ledgerOptions)
const branchOptions = computed(() => (authStore.availableBranches || []).map((b) => ({ label: b.name || b.branch_name || b.id, value: b.id })))

// First day of the current month in Sri Lanka time.
function firstOfMonth() {
  return monthStart(todayLK())
}

// Dates are reset by FinanceFilterBar, which then emits change → load().
function resetFilters() {
  filters.value.source_type = null
  filters.value.ledger_id = null
  filters.value.branch_id = null
}

async function load() {
  if (props.petty) await cashbookStore.fetchPettyCash({ ...filters.value })
  else await cashbookStore.fetchCashbook({ ...filters.value })
}

const exportColumns = [
  { name: 'date', label: 'Date', field: 'date' },
  { name: 'ledger', label: 'Ledger', field: (r) => `${r.ledger_code} — ${r.ledger_name}` },
  { name: 'source', label: 'Source', field: 'source_label' },
  { name: 'doc_ref', label: 'Reference', field: 'doc_ref' },
  { name: 'description', label: 'Description', field: 'description' },
  { name: 'debit', label: 'Receipts Dr (LKR)', field: (r) => (r.debit ? r.debit : '') },
  { name: 'credit', label: 'Payments Cr (LKR)', field: (r) => (r.credit ? r.credit : '') },
  { name: 'running_balance', label: 'Balance', field: (r) => formatDrCr(r.running_balance) },
]
const fileName = () => `${title.value.replace(/\s+/g, '_')}_Report`
function subtitle() {
  const f = filters.value
  return `Period: ${rangeLabel(f.date_from, f.date_to)}`
}
function exportToCsv() { exportTableToCSV(exportColumns, rows.value, fileName()) }
function exportToExcel() { exportTableToExcel(exportColumns, rows.value, fileName()) }
async function exportToPdf() { await exportTableToPDF(exportColumns, rows.value, `${title.value} Report`, subtitle()) }

onMounted(load)
</script>
