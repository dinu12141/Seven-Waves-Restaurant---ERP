<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="money_off"
      subtitle="Expense ledger movements from the General Ledger"
      title="Expense Management"
      breadcrumbs="Finance / Expenses & Tax / Expenses"
      show-refresh
      :loading="loading"
      @refresh="loadData"
    >
      <template #actions>
        <q-btn
          v-if="canRecord"
          unelevated
          no-caps
          color="primary"
          icon="add"
          label="New Expense (Pay Voucher)"
          @click="newExpense"
        />
      </template>
    </FinancePageHeader>

    <!-- Expenses are GL movements: they are recorded with a Pay Voucher, which posts Dr expense / Cr cash-bank. -->
    <div class="text-caption text-grey-6 q-mb-sm">
      <q-icon name="info" size="14px" />
      Figures are read from the General Ledger (movements on expense ledgers). Record a new expense with a
      <strong>Pay Voucher</strong> so it is approved and posted to the GL.
    </div>

    <FinanceFilterBar
      v-model:from="dateFrom"
      v-model:to="dateTo"
      persist-key="expenses"
      @change="loadData"
      @reset="resetFilters"
    >
      <q-select
        v-model="filterLedger"
        :options="ledgerSelectOptions"
        label="Expense ledger"
        dense
        outlined
        style="width: 260px"
        clearable
        emit-value
        map-options
        use-input
        input-debounce="0"
        @filter="onLedgerFilter"
        @update:model-value="loadData"
      />
      <q-toggle v-model="includeCostOfSales" label="Include Cost of Sales" dense @update:model-value="loadData" />
      <template #actions>
        <FinanceExportMenu :columns="columns" :rows="report.rows" title="Expense GL Entries" :subtitle="rangeLabel(dateFrom, dateTo)" filename="expenses" />
      </template>
    </FinanceFilterBar>

    <q-banner v-if="loadError" dense class="bg-negative text-white q-mb-md">{{ loadError }}</q-banner>

    <!-- Summary Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--red">
          <div class="fin-kpi-card__icon">
            <q-icon name="money_off" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Net Expenses (period)</div>
            <div class="fin-kpi-card__value">{{ fmt(report.total) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--amber">
          <div class="fin-kpi-card__icon">
            <q-icon name="undo" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Reversals / Credits</div>
            <div class="fin-kpi-card__value">{{ fmt(report.totalCredit) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--green">
          <div class="fin-kpi-card__icon">
            <q-icon name="list_alt" size="18px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">GL Entries</div>
            <div class="fin-kpi-card__value">{{ report.rows.length }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- By ledger -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">By Expense Ledger ({{ report.byLedger.length }})</span>
      </div>
      <q-table
        :rows="report.byLedger"
        :columns="ledgerColumns"
        row-key="ledger_id"
        flat
        :dark="$q.dark.isActive"
        dense
        :rows-per-page-options="[10, 25, 0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No expense postings in this period"
        @row-click="(_e, row) => selectLedger(row.ledger_id)"
      />
    </div>

    <!-- Register -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Expense GL Entries ({{ report.rows.length }})</span>
      </div>
      <q-table
        :rows="report.rows"
        :columns="columns"
        row-key="id"
        flat
        :dark="$q.dark.isActive"
        dense
        :rows-per-page-options="[25, 50, 100]"
        class="fin-table"
        :loading="loading"
        no-data-label="No expense entries"
      >
        <template #body-cell-source="props">
          <q-td :props="props">
            <span class="fin-badge fin-badge--info">{{ sourceLabel(props.row.source_type) }}</span>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import { usePermission } from 'src/core/rbac/usePermission'
import FinanceFilterBar from 'src/modules/finance/components/FinanceFilterBar.vue'
import FinanceExportMenu from 'src/modules/finance/components/FinanceExportMenu.vue'
import { useSelectFilter } from 'src/modules/finance/composables/useSelectFilter'
import { todayLK, rangeLabel, monthStart as monthStartOf } from 'src/modules/finance/utils/finance-dates'
import { fetchExpenseReport } from 'src/services/finance/glReports'

const router = useRouter()
const { can } = usePermission()
const canRecord = computed(() => can('finance.pay_vouchers.view'))

// Sri Lanka local dates (not browser / UTC)
const isoDay = () => todayLK()
const monthStart = () => monthStartOf(todayLK())

const loading = ref(false)
const loadError = ref('')
const ledgers = ref([])
const report = ref({ rows: [], byLedger: [], total: 0, totalDebit: 0, totalCredit: 0 })
const filterLedger = ref(null)
const includeCostOfSales = ref(false)
const dateFrom = ref(monthStart())
const dateTo = ref(isoDay())

const ledgerOptions = computed(() =>
  ledgers.value
    .filter((l) => includeCostOfSales.value || l.account_group !== 'Cost of Sales')
    .map((l) => ({ value: l.id, label: `${l.ledger_code || ''} ${l.ledger_name || ''}`.trim() })),
)
const { options: ledgerSelectOptions, onFilter: onLedgerFilter } = useSelectFilter(ledgerOptions)

const ledgerColumns = [
  { name: 'code', label: 'Code', field: 'ledger_code', align: 'left', sortable: true, style: 'width: 90px' },
  { name: 'name', label: 'Ledger', field: 'ledger_name', align: 'left', sortable: true },
  { name: 'group', label: 'Group', field: 'account_group', align: 'left' },
  { name: 'count', label: 'Entries', field: 'count', align: 'right' },
  { name: 'debit', label: 'Debits', field: 'debit', align: 'right', format: (v) => fmt(v) },
  { name: 'credit', label: 'Credits', field: 'credit', align: 'right', format: (v) => fmt(v) },
  { name: 'net', label: 'Net Expense', field: 'net', align: 'right', sortable: true, format: (v) => fmt(v) },
]

const columns = [
  { name: 'date', label: 'Date', field: 'entry_date', align: 'left', sortable: true, style: 'width: 100px' },
  {
    name: 'ledger',
    label: 'Expense Ledger',
    field: (r) => `${r.ledger_code} ${r.ledger_name}`.trim(),
    align: 'left',
    sortable: true,
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'source', label: 'Source', field: 'source_type', align: 'center', style: 'width: 120px' },
  { name: 'debit', label: 'Debit', field: 'debit', align: 'right', format: (v) => (v ? fmt(v) : ''), style: 'width: 120px' },
  { name: 'credit', label: 'Credit', field: 'credit', align: 'right', format: (v) => (v ? fmt(v) : ''), style: 'width: 120px' },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sourceLabel(s) {
  if (!s) return 'Manual'
  return String(s).replace(/_/g, ' ')
}

function newExpense() {
  router.push('/finance/pay-vouchers')
}

function selectLedger(id) {
  filterLedger.value = id
  loadData()
}

// Dates + reload are handled by FinanceFilterBar (reset → change).
function resetFilters() {
  filterLedger.value = null
  includeCostOfSales.value = false
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchExpenseReport({
      ledgerId: filterLedger.value,
      includeCostOfSales: includeCostOfSales.value,
      dateFrom: dateFrom.value || null,
      dateTo: dateTo.value || null,
    })
    ledgers.value = res.ledgers
    report.value = res
  } catch (e) {
    loadError.value = `Could not load expenses: ${e?.message || e}`
    report.value = { rows: [], byLedger: [], total: 0, totalDebit: 0, totalCredit: 0 }
  } finally {
    loading.value = false
  }
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
