<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Journal Entries"
      breadcrumbs="Finance / General Ledger / Journal Entries"
      showRefresh
      @refresh="loadData"
      :primaryAction="{ label: 'New Entry', icon: 'add' }"
      @primary-action="showCreateDialog = true"
    />

    <div class="fin-filters q-mb-md row items-center justify-between">
      <div class="row q-gutter-md items-center">
        <q-input
          v-model="filters.search"
          label="Search (e.g. Bank name, Reference)"
          dense
          dark
          outlined
          clearable
          style="min-width: 250px"
          @keyup.enter="loadData"
          @clear="loadData"
        >
          <template #append>
            <q-icon name="search" @click="loadData" class="cursor-pointer" />
          </template>
        </q-input>
        <q-input
          v-model="filters.dateFrom"
          label="From"
          type="date"
          dense
          dark
          outlined
          style="min-width: 160px"
        />
        <q-input
          v-model="filters.dateTo"
          label="To"
          type="date"
          dense
          dark
          outlined
          style="min-width: 160px"
        />
        <q-btn flat dense icon="filter_list_off" color="grey-5" @click="resetFilters" />
      </div>
      <div class="row q-gutter-sm">
        <q-btn flat icon="print" color="white" round @click="printReport">
          <q-tooltip dark>Print</q-tooltip>
        </q-btn>
        <q-btn flat icon="picture_as_pdf" color="white" round @click="exportPDF">
          <q-tooltip dark>PDF</q-tooltip>
        </q-btn>
        <q-btn flat icon="table_chart" color="white" round @click="exportExcel">
          <q-tooltip dark>Excel</q-tooltip>
        </q-btn>
        <q-btn flat icon="description" color="white" round @click="exportCSV">
          <q-tooltip dark>CSV</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Journal Entries ({{ entries.length }})</span>
      </div>
      <q-table
        :rows="entries"
        :columns="columns"
        row-key="id"
        flat
        dark
        dense
        :rows-per-page-options="[20, 50, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No journal entries"
      >
        <template #body-cell-status="props">
          <q-td :props="props">
            <span
              :class="
                props.row.is_reversed
                  ? 'fin-badge fin-badge--danger'
                  : 'fin-badge fin-badge--success'
              "
              >{{ props.row.is_reversed ? 'Reversed' : 'Posted' }}</span
            >
          </q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn
              v-if="!props.row.is_reversed"
              flat
              dense
              icon="undo"
              size="sm"
              color="orange-5"
              @click="reverseEntry(props.row)"
            >
              <q-tooltip>Reverse Entry</q-tooltip>
            </q-btn>
            <q-btn
              flat
              dense
              icon="visibility"
              size="sm"
              color="grey-5"
              @click="viewEntry(props.row)"
            >
              <q-tooltip>View Lines</q-tooltip>
            </q-btn>
          </q-td>
        </template>
      </q-table>
    </div>

    <!-- Create Dialog -->
    <q-dialog v-model="showCreateDialog" class="fin-dialog" maximized>
      <q-card
        style="
          background: var(--erp-fin-bg-page);
          max-width: 900px;
          margin: auto;
          border: 1px solid var(--erp-fin-border);
          border-radius: 10px;
          color: var(--erp-text-primary);
        "
      >
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bold text-white">New Journal Entry</div>
          <q-space /><q-btn flat dense icon="close" color="grey-5" v-close-popup />
        </q-card-section>
        <q-card-section class="q-gutter-sm fin-form">
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="form.doc_date" label="Date *" type="date" dense dark outlined />
            </div>
            <div class="col-6">
              <q-input v-model="form.description" label="Description *" dense dark outlined />
            </div>
          </div>
          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model="form.reference_type" label="Reference Type" dense dark outlined />
            </div>
            <div class="col-6">
              <q-input
                v-model="form.entry_type"
                label="Entry Type"
                dense
                dark
                outlined
                placeholder="manual"
              />
            </div>
          </div>

          <div class="text-subtitle2 text-grey-4 q-mt-md">Journal Lines</div>
          <div
            v-for="(line, idx) in formLines"
            :key="idx"
            class="row q-col-gutter-sm items-center q-mb-xs"
          >
            <div class="col-3">
              <q-select
                v-model="line.account_code"
                :options="accountOptions"
                label="Account"
                dense
                dark
                outlined
                emit-value
                map-options
                option-value="code"
                option-label="label"
                @update:model-value="
                  (v) => (line.account_name = accountOptions.find((a) => a.code === v)?.name || '')
                "
              />
            </div>
            <div class="col-3">
              <q-input v-model="line.account_name" label="Name" dense dark outlined readonly />
            </div>
            <div class="col-2">
              <q-input
                v-model.number="line.dr_amount"
                label="Debit"
                type="number"
                dense
                dark
                outlined
              />
            </div>
            <div class="col-2">
              <q-input
                v-model.number="line.cr_amount"
                label="Credit"
                type="number"
                dense
                dark
                outlined
              />
            </div>
            <div class="col-1">
              <q-input v-model="line.memo" label="Memo" dense dark outlined />
            </div>
            <div class="col-1">
              <q-btn
                flat
                dense
                icon="delete"
                size="sm"
                color="red-5"
                @click="formLines.splice(idx, 1)"
              />
            </div>
          </div>
          <q-btn
            flat
            dense
            icon="add"
            label="Add Line"
            color="blue-5"
            @click="addLine"
            class="q-mt-xs"
          />

          <div class="fin-summary-row q-mt-md" style="border-radius: 6px">
            <div>
              <span class="fin-summary-row__label">Total Debit: </span
              ><span class="fin-summary-row__value">{{ totalDr.toFixed(2) }}</span>
            </div>
            <div>
              <span class="fin-summary-row__label">Total Credit: </span
              ><span class="fin-summary-row__value">{{ totalCr.toFixed(2) }}</span>
            </div>
            <div>
              <span class="fin-summary-row__label">Difference: </span>
              <span
                :class="['fin-summary-row__value', diff === 0 ? 'text-green-4' : 'text-red-4']"
                >{{ diff.toFixed(2) }}</span
              >
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            unelevated
            label="Post Entry"
            color="blue-8"
            @click="postEntry"
            :loading="saving"
            :disable="diff !== 0 || formLines.length < 2"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- View Lines Dialog -->
    <q-dialog v-model="showViewDialog" class="fin-dialog">
      <q-card
        style="
          min-width: 600px;
          background: var(--erp-fin-bg-panel);
          border: 1px solid var(--erp-fin-border);
          color: var(--erp-text-primary);
        "
      >
        <q-card-section class="row items-center q-pb-none">
          <div class="text-subtitle1 text-weight-bold text-white">
            Journal Lines — {{ viewingEntry?.description }}
          </div>
          <q-space /><q-btn flat dense icon="close" color="grey-5" v-close-popup />
        </q-card-section>
        <q-card-section>
          <q-table
            :rows="viewingEntry?.journal_lines || []"
            :columns="lineCols"
            row-key="id"
            flat
            dark
            dense
            hide-bottom
            :rows-per-page-options="[0]"
            class="fin-table"
          />
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Notify } from 'quasar'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import {
  fetchJournalEntries,
  createJournalEntry,
  reverseJournalEntry,
  fetchChartOfAccounts,
} from 'src/services/financeService'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

const loading = ref(false)
const saving = ref(false)
const entries = ref([])
const showCreateDialog = ref(false)
const showViewDialog = ref(false)
const viewingEntry = ref(null)
const filters = ref({ search: '', dateFrom: '', dateTo: '' })
const accountOptions = ref([])

const form = ref({
  doc_date: new Date().toISOString().split('T')[0],
  description: '',
  reference_type: 'manual',
  entry_type: 'manual',
})
const formLines = ref([
  { account_code: '', account_name: '', dr_amount: 0, cr_amount: 0, memo: '' },
  { account_code: '', account_name: '', dr_amount: 0, cr_amount: 0, memo: '' },
])

const columns = [
  {
    name: 'doc_date',
    label: 'Date',
    field: 'doc_date',
    align: 'left',
    sortable: true,
    style: 'width: 100px',
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  {
    name: 'reference_type',
    label: 'Ref Type',
    field: 'reference_type',
    align: 'left',
    style: 'width: 100px',
  },
  {
    name: 'total_dr',
    label: 'Total Dr',
    field: 'total_dr',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 120px',
  },
  {
    name: 'total_cr',
    label: 'Total Cr',
    field: 'total_cr',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
    style: 'width: 120px',
  },
  { name: 'status', label: 'Status', field: 'is_reversed', align: 'center', style: 'width: 100px' },
  { name: 'actions', label: '', align: 'center', style: 'width: 80px' },
]

const lineCols = [
  { name: 'line_number', label: '#', field: 'line_number', align: 'center', style: 'width: 40px' },
  { name: 'account_code', label: 'Acct Code', field: 'account_code', align: 'left' },
  { name: 'account_name', label: 'Account', field: 'account_name', align: 'left' },
  {
    name: 'dr_amount',
    label: 'Debit',
    field: 'dr_amount',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
  },
  {
    name: 'cr_amount',
    label: 'Credit',
    field: 'cr_amount',
    align: 'right',
    format: (v) => Number(v || 0).toFixed(2),
  },
  { name: 'memo', label: 'Memo', field: 'memo', align: 'left' },
]

const totalDr = computed(() => formLines.value.reduce((s, l) => s + Number(l.dr_amount || 0), 0))
const totalCr = computed(() => formLines.value.reduce((s, l) => s + Number(l.cr_amount || 0), 0))
const diff = computed(() => totalDr.value - totalCr.value)

function addLine() {
  formLines.value.push({ account_code: '', account_name: '', dr_amount: 0, cr_amount: 0, memo: '' })
}
function resetFilters() {
  filters.value = { search: '', dateFrom: '', dateTo: '' }
  loadData()
}
function viewEntry(row) {
  viewingEntry.value = row
  showViewDialog.value = true
}

async function reverseEntry(row) {
  const { error } = await reverseJournalEntry(row.id)
  if (error) Notify.create({ type: 'negative', message: error.message })
  else {
    Notify.create({ type: 'positive', message: 'Entry reversed' })
    loadData()
  }
}

async function postEntry() {
  if (!form.value.doc_date || !form.value.description) {
    Notify.create({ type: 'warning', message: 'Date and Description required' })
    return
  }
  saving.value = true
  try {
    const { error } = await createJournalEntry(
      { ...form.value, total_dr: totalDr.value, total_cr: totalCr.value },
      formLines.value,
    )
    if (error) throw error
    Notify.create({ type: 'positive', message: 'Journal entry posted' })
    showCreateDialog.value = false
    form.value = {
      doc_date: new Date().toISOString().split('T')[0],
      description: '',
      reference_type: 'manual',
      entry_type: 'manual',
    }
    formLines.value = [
      { account_code: '', account_name: '', dr_amount: 0, cr_amount: 0, memo: '' },
      { account_code: '', account_name: '', dr_amount: 0, cr_amount: 0, memo: '' },
    ]
    loadData()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || 'Failed' })
  } finally {
    saving.value = false
  }
}

async function loadData() {
  loading.value = true
  const [jeRes, coaRes] = await Promise.all([
    fetchJournalEntries(filters.value),
    fetchChartOfAccounts(),
  ])
  entries.value = jeRes.data || []
  accountOptions.value = (coaRes.data || []).map((a) => ({
    code: a.code,
    name: a.name,
    label: `${a.code} - ${a.name}`,
  }))
  loading.value = false
}

onMounted(loadData)

// ── Export / Print ──
function getExportData() {
  const exportCols = columns.filter((c) => c.name !== 'actions')
  return { rows: entries.value, cols: exportCols, title: 'Journal_Entries' }
}
function printReport() { window.print() }
function exportCSV() {
  const d = getExportData()
  exportTableToCSV(d.cols, d.rows, d.title)
}
function exportExcel() {
  const d = getExportData()
  exportTableToExcel(d.cols, d.rows, d.title)
}
function exportPDF() {
  const d = getExportData()
  exportTableToPDF(d.cols, d.rows, d.title)
}
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
