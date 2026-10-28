<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="percent"
      subtitle="Output and input VAT for the period, read from the General Ledger"
      title="Tax Management"
      breadcrumbs="Finance / Expenses & Tax / Tax"
      show-refresh
      @refresh="loadData"
    />

    <FinanceFilterBar v-model:from="dateFrom" v-model:to="dateTo" persist-key="tax" @change="loadData">
      <div class="text-caption text-grey-6">
        VAT is read from the General Ledger: {{ OUTPUT_VAT_LEDGER_CODE }} Output VAT Payable and
        {{ INPUT_VAT_LEDGER_CODE }} Input VAT - Recoverable.
      </div>
    </FinanceFilterBar>

    <q-banner v-if="loadError" dense class="bg-negative text-white q-mb-md">{{ loadError }}</q-banner>
    <q-banner
      v-if="!loading && !loadError && (!vat.outputLedgerFound || !vat.inputLedgerFound)"
      dense
      class="bg-warning text-black q-mb-md"
    >
      Ledger
      <template v-if="!vat.outputLedgerFound">{{ OUTPUT_VAT_LEDGER_CODE }} (Output VAT)</template>
      <template v-if="!vat.outputLedgerFound && !vat.inputLedgerFound"> and </template>
      <template v-if="!vat.inputLedgerFound">{{ INPUT_VAT_LEDGER_CODE }} (Input VAT)</template>
      not found in the chart of accounts.
    </q-banner>

    <!-- VAT Summary Cards (period movements) -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--green">
          <div class="fin-kpi-card__icon">
            <q-icon name="arrow_downward" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Output VAT (collected, {{ OUTPUT_VAT_LEDGER_CODE }})</div>
            <div class="fin-kpi-card__value">{{ fmt(vat.outputVat) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--red">
          <div class="fin-kpi-card__icon">
            <q-icon name="arrow_upward" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Input VAT (recoverable, {{ INPUT_VAT_LEDGER_CODE }})</div>
            <div class="fin-kpi-card__value">{{ fmt(vat.inputVat) }}</div>
          </div>
        </div>
      </div>
      <div class="col-12 col-sm-4">
        <div class="fin-kpi-card fin-kpi-card--blue">
          <div class="fin-kpi-card__icon">
            <q-icon name="balance" size="20px" color="white" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">Net VAT {{ vat.netPayable >= 0 ? 'Payable' : 'Refundable' }} (period)</div>
            <div class="fin-kpi-card__value">{{ fmt(Math.abs(vat.netPayable)) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="text-caption text-grey-5 q-mb-md">
      Current GL balances — {{ OUTPUT_VAT_LEDGER_CODE }}: LKR {{ fmt(vat.outputLedgerBalance) }} (Cr) ·
      {{ INPUT_VAT_LEDGER_CODE }}: LKR {{ fmt(vat.inputLedgerBalance) }} (Dr)
    </div>

    <q-banner v-if="vat.apBillTax.total > 0" dense class="bg-amber-2 text-black q-mb-md">
      <template #avatar><q-icon name="warning" color="amber-9" /></template>
      {{ vat.apBillTax.count }} posted supplier bill{{ vat.apBillTax.count === 1 ? '' : 's' }} in this period carry
      LKR {{ fmt(vat.apBillTax.total) }} of tax that was posted gross to 1005 Inventory, not to
      {{ INPUT_VAT_LEDGER_CODE }} Input VAT — it is not included in the Input VAT above.
    </q-banner>

    <!-- Monthly -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">VAT by Month</span>
      </div>
      <q-table
        :rows="vat.byMonth"
        :columns="monthCols"
        row-key="month"
        flat
        :dark="$q.dark.isActive"
        dense
        hide-bottom
        :rows-per-page-options="[0]"
        class="fin-table"
        :loading="loading"
        no-data-label="No VAT postings in this period"
      />
    </div>

    <!-- Tax Codes -->
    <div class="fin-panel q-mb-md">
      <div class="fin-panel__header">
        <span class="fin-panel__title">Tax Codes</span>
      </div>
      <q-table
        :rows="taxCodes"
        :columns="codeCols"
        row-key="id"
        flat
        :dark="$q.dark.isActive"
        dense
        hide-bottom
        :rows-per-page-options="[0]"
        class="fin-table"
        :loading="loading"
      />
    </div>

    <!-- VAT GL entries -->
    <div class="fin-panel">
      <div class="fin-panel__header">
        <span class="fin-panel__title">VAT GL Entries ({{ vat.rows.length }})</span>
        <q-space />
        <FinanceExportMenu :columns="txnCols" :rows="vat.rows" title="VAT GL Entries" :subtitle="rangeLabel(dateFrom, dateTo)" filename="vat_entries" />
      </div>
      <q-table
        :rows="vat.rows"
        :columns="txnCols"
        row-key="id"
        flat
        :dark="$q.dark.isActive"
        dense
        :rows-per-page-options="[25, 50, 100]"
        class="fin-table"
        :loading="loading"
        no-data-label="No VAT entries"
      >
        <template #body-cell-side="props">
          <q-td :props="props">
            <span
              :class="props.row.side === 'output' ? 'fin-badge fin-badge--success' : 'fin-badge fin-badge--danger'"
              >{{ props.row.side === 'output' ? 'output' : 'input' }}</span
            >
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import FinanceFilterBar from 'src/modules/finance/components/FinanceFilterBar.vue'
import FinanceExportMenu from 'src/modules/finance/components/FinanceExportMenu.vue'
import { todayLK, monthStart, rangeLabel } from 'src/modules/finance/utils/finance-dates'
import { fetchTaxCodes } from 'src/services/financeService'
import { fetchVatReport, OUTPUT_VAT_LEDGER_CODE, INPUT_VAT_LEDGER_CODE } from 'src/services/finance/glReports'

const emptyVat = () => ({
  outputLedgerFound: true,
  inputLedgerFound: true,
  outputVat: 0,
  inputVat: 0,
  netPayable: 0,
  outputLedgerBalance: 0,
  inputLedgerBalance: 0,
  rows: [],
  byMonth: [],
  apBillTax: { count: 0, total: 0 },
})

const loading = ref(false)
const loadError = ref('')
const taxCodes = ref([])
const vat = ref(emptyVat())
const dateFrom = ref(monthStart(todayLK()))
const dateTo = ref(todayLK())

const monthCols = [
  { name: 'month', label: 'Month', field: 'month', align: 'left' },
  { name: 'output', label: 'Output VAT', field: 'output', align: 'right', format: (v) => fmt(v) },
  { name: 'input', label: 'Input VAT', field: 'input', align: 'right', format: (v) => fmt(v) },
  { name: 'net', label: 'Net Payable', field: 'net', align: 'right', format: (v) => fmt(v) },
]

const codeCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 100px' },
  { name: 'name', label: 'Name', field: 'name', align: 'left' },
  { name: 'rate', label: 'Rate %', field: 'rate', align: 'right', style: 'width: 80px' },
  { name: 'tax_type', label: 'Type', field: 'tax_type', align: 'center', style: 'width: 100px' },
  { name: 'active', label: 'Active', field: (r) => (r.is_active === false ? 'No' : 'Yes'), align: 'center' },
]

const txnCols = [
  { name: 'entry_date', label: 'Date', field: 'entry_date', align: 'left', sortable: true, style: 'width: 100px' },
  { name: 'ledger', label: 'Ledger', field: (r) => `${r.ledger_code} ${r.ledger_name}`, align: 'left' },
  { name: 'side', label: 'VAT', field: 'side', align: 'center', style: 'width: 90px' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'source', label: 'Source', field: (r) => (r.source_type || '').replace(/_/g, ' '), align: 'left' },
  { name: 'debit', label: 'Debit', field: 'debit', align: 'right', format: (v) => (v ? fmt(v) : '') },
  { name: 'credit', label: 'Credit', field: 'credit', align: 'right', format: (v) => (v ? fmt(v) : '') },
]

function fmt(v) {
  return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadData() {
  loading.value = true
  loadError.value = ''
  try {
    const [codeRes, vatRes] = await Promise.all([
      fetchTaxCodes(),
      fetchVatReport({ dateFrom: dateFrom.value || null, dateTo: dateTo.value || null }),
    ])
    taxCodes.value = codeRes.data || []
    vat.value = vatRes
  } catch (e) {
    loadError.value = `Could not load VAT: ${e?.message || e}`
    vat.value = emptyVat()
  } finally {
    loading.value = false
  }
}
onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
