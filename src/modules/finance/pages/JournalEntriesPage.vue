<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md q-col-gutter-sm">
      <div class="col-12 col-sm row items-center no-wrap">
        <q-icon name="menu_book" size="md" color="primary" class="q-mr-sm" />
        <div>
          <div class="text-h5 text-weight-bold">Journal Entries (GL)</div>
          <div class="text-caption text-grey-6">
            Every posting in the General Ledger — supplier bills, payments, vouchers, payroll &amp; manual journals
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-auto text-right">
        <q-btn
          color="primary"
          icon="add"
          label="New Journal Entry"
          unelevated
          @click="showForm = true"
        />
      </div>
    </div>

    <q-tabs
      v-model="tab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
      narrow-indicator
    >
      <q-tab name="gl" label="General Ledger (all postings)" icon="account_tree" no-caps />
      <q-tab name="manual" label="Manual Journals" icon="edit_note" no-caps />
    </q-tabs>
    <q-separator class="q-mb-md" />

    <q-tab-panels v-model="tab" animated keep-alive class="bg-transparent">
      <!-- ═══════════════ GENERAL LEDGER ═══════════════ -->
      <q-tab-panel name="gl" class="q-pa-none">
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Postings</div>
              <div class="text-h6 text-weight-bold">{{ glSummary.count.toLocaleString() }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Debit</div>
              <div class="text-h6 text-weight-bold text-primary">LKR {{ money(glSummary.total_dr) }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Credit</div>
              <div class="text-h6 text-weight-bold text-purple">LKR {{ money(glSummary.total_cr) }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Unbalanced</div>
              <div
                class="text-h6 text-weight-bold"
                :class="glSummary.unbalanced ? 'text-negative' : 'text-positive'"
              >
                {{ glSummary.unbalanced }}
              </div>
            </q-card>
          </div>
        </div>

        <!-- GL Filter Bar -->
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-12 col-md-4">
            <q-input
              v-model="glFilters.search"
              label="Search description..."
              outlined
              dense
              clearable
              debounce="400"
              @update:model-value="loadGl"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-12 col-sm-4 col-md-3">
            <q-select
              v-model="glFilters.source_type"
              label="Type"
              outlined
              dense
              clearable
              emit-value
              map-options
              :options="glTypeOptions"
              @update:model-value="loadGl"
            />
          </div>
          <div class="col-6 col-sm-4 col-md-2">
            <q-input v-model="glFilters.date_from" label="From" outlined dense type="date" @update:model-value="loadGl" />
          </div>
          <div class="col-6 col-sm-4 col-md-2">
            <q-input v-model="glFilters.date_to" label="To" outlined dense type="date" @update:model-value="loadGl" />
          </div>
          <div class="col-12 col-md-1 text-right">
            <q-btn flat round dense icon="refresh" color="grey-7" :loading="glLoading" @click="loadGl">
              <q-tooltip>Refresh</q-tooltip>
            </q-btn>
          </div>
        </div>

        <q-banner v-if="glError" dense class="bg-red-1 text-negative q-mb-md rounded-borders">
          <template #avatar><q-icon name="error" color="negative" /></template>
          {{ glError }}
        </q-banner>

        <q-table
          flat
          bordered
          :rows="glPostings"
          :columns="glColumns"
          row-key="key"
          :loading="glLoading"
          :pagination="{ rowsPerPage: 25 }"
          :rows-per-page-options="[25, 50, 100, 0]"
          no-data-label="No postings for the selected filters"
        >
          <template #body="props">
            <q-tr :props="props" class="cursor-pointer" @click="props.expand = !props.expand">
              <q-td auto-width>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  :icon="props.expand ? 'expand_less' : 'expand_more'"
                  @click.stop="props.expand = !props.expand"
                />
              </q-td>
              <q-td key="date" :props="props">{{ props.row.date }}</q-td>
              <q-td key="source_label" :props="props">
                <q-badge :color="getSourceColor(props.row.source_type)">{{ props.row.source_label }}</q-badge>
                <q-badge v-if="props.row.is_reversal" color="red-8" class="q-ml-xs">REVERSAL</q-badge>
              </q-td>
              <q-td key="doc_ref" :props="props" class="text-weight-medium">
                {{ props.row.doc_ref || shortId(props.row.source_id) }}
              </q-td>
              <q-td key="description" :props="props" class="gl-desc">
                {{ props.row.description }}
                <q-tooltip v-if="props.row.description && props.row.description.length > 60" max-width="400px">
                  {{ props.row.description }}
                </q-tooltip>
              </q-td>
              <q-td key="total_dr" :props="props" class="text-weight-bold text-primary">
                {{ money(props.row.total_dr) }}
              </q-td>
              <q-td key="total_cr" :props="props" class="text-weight-bold text-purple">
                {{ money(props.row.total_cr) }}
              </q-td>
              <q-td key="balanced" :props="props">
                <q-icon
                  :name="props.row.balanced ? 'check_circle' : 'warning'"
                  :color="props.row.balanced ? 'positive' : 'negative'"
                  size="18px"
                >
                  <q-tooltip>
                    {{
                      props.row.balanced
                        ? 'Balanced (Dr = Cr)'
                        : `Unbalanced by LKR ${money(Math.abs(props.row.total_dr - props.row.total_cr))}`
                    }}
                  </q-tooltip>
                </q-icon>
              </q-td>
            </q-tr>

            <q-tr v-show="props.expand" :props="props" class="gl-legs-row">
              <q-td colspan="100%" class="q-pa-sm">
                <q-markup-table flat dense bordered separator="cell" class="gl-legs">
                  <thead>
                    <tr>
                      <th class="text-left">Ledger</th>
                      <th class="text-left gt-xs">Account</th>
                      <th class="text-left gt-sm">Description</th>
                      <th class="text-right">Debit</th>
                      <th class="text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(leg, i) in props.row.lines" :key="leg.id || i">
                      <td class="text-left">
                        <span class="text-weight-bold">{{ leg.ledger_code }}</span>
                        <span v-if="leg.ledger_code"> — </span>{{ leg.ledger_name }}
                      </td>
                      <td class="text-left gt-xs text-grey-7">{{ leg.account_name || '—' }}</td>
                      <td class="text-left gt-sm text-grey-7 gl-desc">{{ leg.description }}</td>
                      <td class="text-right text-primary text-weight-medium">
                        {{ leg.debit > 0 ? money(leg.debit) : '-' }}
                      </td>
                      <td class="text-right text-purple text-weight-medium">
                        {{ leg.credit > 0 ? money(leg.credit) : '-' }}
                      </td>
                    </tr>
                    <tr class="text-weight-bold">
                      <td class="text-right" colspan="1">Total</td>
                      <td class="gt-xs"></td>
                      <td class="gt-sm"></td>
                      <td class="text-right text-primary">{{ money(props.row.total_dr) }}</td>
                      <td class="text-right text-purple">{{ money(props.row.total_cr) }}</td>
                    </tr>
                  </tbody>
                </q-markup-table>
              </q-td>
            </q-tr>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ═══════════════ MANUAL JOURNALS ═══════════════ -->
      <q-tab-panel name="manual" class="q-pa-none">
        <!-- Summary KPI Cards -->
        <div class="row q-col-gutter-md q-mb-md">
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Entries</div>
              <div class="text-h6 text-weight-bold">{{ manualEntries.length }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Debited</div>
              <div class="text-h6 text-weight-bold text-primary">LKR {{ money(totalDebitsSum) }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Total Credited</div>
              <div class="text-h6 text-weight-bold text-purple">LKR {{ money(totalCreditsSum) }}</div>
            </q-card>
          </div>
          <div class="col-6 col-md-3">
            <q-card flat bordered class="q-pa-sm">
              <div class="text-caption text-grey-7 text-uppercase text-weight-medium">Active / Reversed</div>
              <div class="text-h6 text-weight-bold">
                <span class="text-positive">{{ manualActive.length }}</span>
                <span class="text-grey-5 q-mx-xs">/</span>
                <span class="text-negative">{{ manualEntries.length - manualActive.length }}</span>
              </div>
            </q-card>
          </div>
        </div>

        <!-- Filter Bar -->
        <div class="row q-col-gutter-sm q-mb-md items-center">
          <div class="col-12 col-md-3">
            <q-input
              v-model="filters.search"
              label="Search description or reference..."
              outlined
              dense
              clearable
              debounce="400"
              @update:model-value="load"
            >
              <template #prepend><q-icon name="search" /></template>
            </q-input>
          </div>
          <div class="col-6 col-md-2">
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
          <div class="col-6 col-md-2">
            <q-select
              v-model="filters.status"
              label="Status"
              outlined
              dense
              clearable
              emit-value
              map-options
              :options="statusFilterOptions"
            />
          </div>
          <div class="col-6 col-md-2">
            <q-input v-model="filters.date_from" label="From" outlined dense type="date" @update:model-value="load" />
          </div>
          <div class="col-6 col-md-2">
            <q-input v-model="filters.date_to" label="To" outlined dense type="date" @update:model-value="load" />
          </div>
          <div class="col-12 col-md-1 row items-center justify-end no-wrap">
            <q-toggle v-model="showSystemJournals" dense size="sm" icon="lock">
              <q-tooltip>
                Show old system journals (written automatically for supplier payments before fix #141).
                Their real postings are in the General Ledger tab.
              </q-tooltip>
            </q-toggle>
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
              <q-badge v-if="isSystemJournal(props.row)" color="grey-7" class="q-ml-xs" dense>
                System
                <q-tooltip max-width="320px">{{ systemTooltip(props.row) }}</q-tooltip>
              </q-badge>
            </q-td>
          </template>

          <template #body-cell-total_dr="props">
            <q-td :props="props" class="text-weight-bold text-primary">LKR {{ money(props.value) }}</q-td>
          </template>

          <template #body-cell-total_cr="props">
            <q-td :props="props" class="text-weight-bold text-purple">LKR {{ money(props.value) }}</q-td>
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

              <!-- Reverse entry: manual journals only -->
              <q-btn
                v-if="!props.row.is_reversed && !isSystemJournal(props.row)"
                flat
                round
                size="sm"
                icon="undo"
                color="negative"
                @click="confirmReverse(props.row)"
              >
                <q-tooltip>Reverse this Journal Entry</q-tooltip>
              </q-btn>
              <q-icon v-else-if="isSystemJournal(props.row)" name="lock" color="grey-5" size="16px">
                <q-tooltip max-width="320px">{{ systemTooltip(props.row) }}</q-tooltip>
              </q-icon>
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Modals -->
    <JournalEntryForm v-model="showForm" @saved="onSaved" />
    <JournalLinesDialog v-model="showViewDialog" :entry="selectedEntry" />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceJournalStore } from '../stores/finance-journal.store'
import { useFinanceLedgerStore } from '../stores/finance-ledger.store'
import { financeJournalService, isSystemJournal } from '../services/finance-journal.service'
import { GL_SOURCE_LABELS, summarizeGlPostings } from '../services/finance-gl.builder'
import JournalEntryForm from '../components/JournalEntryForm.vue'
import JournalLinesDialog from '../components/JournalLinesDialog.vue'

const $q = useQuasar()
const journalStore = useFinanceJournalStore()
const ledgerStore = useFinanceLedgerStore()

const tab = ref('gl')
const showForm = ref(false)
const showViewDialog = ref(false)
const selectedEntry = ref(null)

const money = (v) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shortId = (id) => (id ? String(id).slice(0, 8).toUpperCase() : '—')

// ── General Ledger tab ─────────────────────────────────────────────────────
const glPostings = ref([])
const glLoading = ref(false)
const glError = ref('')
const glFilters = ref({ search: '', source_type: null, date_from: '', date_to: '' })

const glSummary = computed(() => summarizeGlPostings(glPostings.value))

const glTypeOptions = [
  { label: 'All Types', value: null },
  ...Object.entries(GL_SOURCE_LABELS).map(([value, label]) => ({ label, value })),
]

const glColumns = [
  { name: 'expand', label: '', field: 'key', align: 'left' },
  { name: 'date', label: 'Date', field: 'date', align: 'left', sortable: true, style: 'width: 110px' },
  { name: 'source_label', label: 'Type', field: 'source_label', align: 'left', sortable: true, style: 'width: 170px' },
  { name: 'doc_ref', label: 'Doc #', field: 'doc_ref', align: 'left', sortable: true, style: 'width: 140px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'total_dr', label: 'Debit (DR)', field: 'total_dr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'total_cr', label: 'Credit (CR)', field: 'total_cr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'balanced', label: 'Bal.', field: 'balanced', align: 'center', style: 'width: 60px' },
]

function getSourceColor(type) {
  switch (type) {
    case 'invoice':
      return 'deep-orange-8'
    case 'supplier_payment':
      return 'teal-8'
    case 'pay_voucher':
      return 'orange-9'
    case 'received_voucher':
      return 'green-8'
    case 'manual_adjustment':
      return 'blue-8'
    case 'payroll':
    case 'salary_advance':
      return 'indigo'
    default:
      return type?.startsWith('pos_') ? 'cyan-8' : 'blue-grey-7'
  }
}

async function loadGl() {
  glLoading.value = true
  glError.value = ''
  try {
    glPostings.value = await financeJournalService.listGeneralLedger(glFilters.value)
  } catch (e) {
    glError.value = e?.message || 'Failed to load the General Ledger'
  } finally {
    glLoading.value = false
  }
}

// ── Manual Journals tab ────────────────────────────────────────────────────
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
  { label: 'Supplier Payment (system)', value: 'supplier_payment' },
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
  { name: 'reference_type', label: 'Type', field: 'reference_type', align: 'left', style: 'width: 180px' },
  { name: 'reference_id', label: 'Ref #', field: 'reference_id', align: 'left', style: 'width: 130px' },
  { name: 'description', label: 'Narration / Description', field: 'description', align: 'left' },
  { name: 'total_dr', label: 'Total Debit (DR)', field: 'total_dr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'total_cr', label: 'Total Credit (CR)', field: 'total_cr', align: 'right', sortable: true, style: 'width: 140px' },
  { name: 'status', label: 'Status', field: 'is_reversed', align: 'center', style: 'width: 100px' },
  { name: 'actions', label: 'Actions', field: 'actions', align: 'center', style: 'width: 90px' },
]

// Journals written automatically by documents (e.g. the pre-#141 supplier
// payment trigger) are not manual journals: their real legs are already in
// the General Ledger tab. Hidden here unless asked for.
const SYSTEM_JOURNAL_TYPES = ['supplier_payment', 'ap_invoice', 'invoice', 'payroll', 'pos_order', 'purchase_return', 'refund']
const showSystemJournals = ref(false)
const isAutoJournal = (entry) => SYSTEM_JOURNAL_TYPES.includes(entry?.reference_type) || entry?.entry_type === 'procurement'

const manualEntries = computed(() =>
  journalStore.entries.filter((entry) => showSystemJournals.value || !isAutoJournal(entry)),
)
const manualActive = computed(() => manualEntries.value.filter((e) => !e.is_reversed))

const filteredEntries = computed(() => {
  return manualEntries.value.filter((entry) => {
    if (filters.value.status === 'posted' && entry.is_reversed) return false
    if (filters.value.status === 'reversed' && !entry.is_reversed) return false
    return true
  })
})

const totalDebitsSum = computed(() => {
  return manualActive.value.reduce((s, e) => s + Number(e.total_dr || 0), 0)
})

const totalCreditsSum = computed(() => {
  return manualActive.value.reduce((s, e) => s + Number(e.total_cr || 0), 0)
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
    case 'supplier_payment':
      return 'teal-8'
    default:
      return 'blue-8'
  }
}

function systemTooltip(entry) {
  switch (entry?.reference_type) {
    case 'supplier_payment':
      return 'Posted automatically by a supplier payment. To undo it, cancel the payment in Procurement → Payments.'
    case 'reversal':
      return 'Reversal entry generated when a manual journal was reversed. It cannot be reversed again.'
    default:
      return `System journal (${formatType(entry?.reference_type)}). Reverse it from its source document, not here.`
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
      await Promise.all([load(), loadGl()])
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

async function onSaved() {
  await Promise.all([load(), loadGl()])
}

onMounted(async () => {
  await Promise.all([loadGl(), load(), ledgerStore.fetchLedgers()])
})
</script>

<style scoped>
.gl-desc {
  max-width: 360px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gl-legs-row > td {
  background: rgba(0, 0, 0, 0.02);
}
:global(.body--dark) .gl-legs-row > td {
  background: rgba(255, 255, 255, 0.03);
}
.gl-legs {
  font-size: 0.8rem;
}
</style>
