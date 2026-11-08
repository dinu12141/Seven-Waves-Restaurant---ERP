<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="percent"
      subtitle="Output and input VAT for the period, read from the General Ledger"
      title="Tax Management"
      breadcrumbs="Finance / Expenses & Tax / Tax"
      show-refresh
      @refresh="loadData"
    >
      <template #actions>
        <q-btn
          unelevated
          color="primary"
          icon="account_balance"
          label="Settle VAT / IRD Return"
          size="sm"
          no-caps
          class="q-mr-xs"
          @click="openSettlementDialog"
        />
      </template>
    </FinancePageHeader>

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
            <div class="fin-kpi-card__label">Input VAT (recoverable asset, {{ INPUT_VAT_LEDGER_CODE }})</div>
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
      {{ INPUT_VAT_LEDGER_CODE }}: LKR {{ fmt(vat.inputLedgerBalance) }} (Dr Recoverable Asset)
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

    <!-- VAT Settlement / IRD Return Dialog -->
    <q-dialog v-model="showSettlementDialog" persistent>
      <q-card style="min-width: 550px; max-width: 680px; width: 100%; border-radius: 12px">
        <q-card-section class="row items-center q-pb-none bg-primary text-white">
          <div>
            <div class="text-h6 text-weight-bold">Settle VAT / IRD Return</div>
            <div class="text-caption text-blue-1">
              Reconcile Output VAT (2006) vs Input VAT Asset (1010) and remit net to IRD
            </div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup text-color="white" />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <!-- Summary info alert -->
          <div class="q-pa-sm q-mb-md bg-blue-1 text-blue-9 rounded-borders text-caption">
            <q-icon name="info" size="18px" class="q-mr-xs" />
            Posting this settlement will <strong>Debit 2006</strong> (clear Output VAT liability),
            <strong>Credit 1010</strong> (offset Input VAT asset), and <strong>Credit Bank</strong> for the net
            remittance to the Inland Revenue Department (IRD).
          </div>

          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6">
              <q-input
                v-model="settlementForm.periodMonth"
                label="Tax Period (YYYY-MM)"
                outlined
                dense
                placeholder="2026-11"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="settlementForm.periodDate"
                label="Settlement Date"
                type="date"
                outlined
                dense
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6">
              <q-input
                v-model.number="settlementForm.outputVatClear"
                label="Output VAT to Clear (Dr 2006)"
                type="number"
                step="0.01"
                outlined
                dense
                prefix="LKR"
                hint="Collected sales tax liability"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="settlementForm.inputVatOffset"
                label="Input VAT to Offset (Cr 1010)"
                type="number"
                step="0.01"
                outlined
                dense
                prefix="LKR"
                hint="Recoverable tax asset credit"
              />
            </div>
          </div>

          <!-- Net Remittance Calculation Card -->
          <div class="q-pa-md q-my-md bg-grey-2 rounded-borders">
            <div class="row items-center justify-between">
              <div>
                <div class="text-caption text-grey-8">Net Remittance to IRD:</div>
                <div
                  class="text-h6 text-weight-bolder"
                  :class="computedNetRemittance >= 0 ? 'text-primary' : 'text-positive'"
                >
                  LKR {{ fmt(Math.abs(computedNetRemittance)) }}
                  <span class="text-caption font-normal">
                    ({{ computedNetRemittance >= 0 ? 'Payable to IRD' : 'Refund Claimable from IRD' }})
                  </span>
                </div>
              </div>
              <q-badge
                :color="computedNetRemittance >= 0 ? 'primary' : 'positive'"
                :label="computedNetRemittance >= 0 ? 'Remittance Due' : 'Refund Due'"
                class="q-pa-xs text-bold"
              />
            </div>
          </div>

          <!-- Bank / Payment details -->
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-12">
              <q-select
                v-model="settlementForm.accountId"
                :options="payingAccounts"
                option-value="id"
                :option-label="(opt) => `${opt.name} (${opt.account_number || opt.account_type}) — Bal: LKR ${fmt(opt.current_balance)}`"
                emit-value
                map-options
                label="Paying / Receiving Bank Account *"
                outlined
                dense
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6">
              <q-select
                v-model="settlementForm.paymentMethod"
                :options="paymentMethodOptions"
                emit-value
                map-options
                label="Payment Method"
                outlined
                dense
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="settlementForm.paymentRef"
                label="Cheque / Reference No"
                outlined
                dense
                placeholder="e.g. CHQ-10492 or TXN-849102"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm">
            <div class="col-12">
              <q-input
                v-model="settlementForm.notes"
                label="Notes / Settlement Remarks"
                outlined
                dense
                placeholder="e.g. Q3 IRD VAT Remittance for restaurant operations"
              />
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-8" v-close-popup no-caps />
          <q-btn
            unelevated
            color="primary"
            label="Confirm & Post Settlement"
            icon="check"
            no-caps
            :loading="submittingSettlement"
            @click="submitSettlement"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import FinanceFilterBar from 'src/modules/finance/components/FinanceFilterBar.vue'
import FinanceExportMenu from 'src/modules/finance/components/FinanceExportMenu.vue'
import { todayLK, monthStart, rangeLabel } from 'src/modules/finance/utils/finance-dates'
import { fetchTaxCodes } from 'src/services/financeService'
import { fetchVatReport, OUTPUT_VAT_LEDGER_CODE, INPUT_VAT_LEDGER_CODE } from 'src/services/finance/glReports'
import { taxSettlementService } from 'src/services/finance/taxSettlementService'
import { useAuthStore } from 'src/stores/auth'

const $q = useQuasar()
const authStore = useAuthStore()

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

// VAT Settlement Modal State
const showSettlementDialog = ref(false)
const submittingSettlement = ref(false)
const payingAccounts = ref([])
const paymentMethodOptions = [
  { label: 'Bank Transfer (CEFT / SLIPS)', value: 'bank_transfer' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Cash', value: 'cash' },
]

const settlementForm = ref({
  periodMonth: '',
  periodDate: '',
  outputVatClear: 0,
  inputVatOffset: 0,
  accountId: '',
  paymentMethod: 'bank_transfer',
  paymentRef: '',
  notes: '',
})

const computedNetRemittance = computed(() => {
  const outVal = Number(settlementForm.value.outputVatClear || 0)
  const inVal = Number(settlementForm.value.inputVatOffset || 0)
  return Math.round((outVal - inVal) * 100) / 100
})

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

async function openSettlementDialog() {
  try {
    const accs = await taxSettlementService.fetchPayingAccounts()
    payingAccounts.value = accs || []

    const currentPeriod = dateFrom.value ? dateFrom.value.slice(0, 7) : todayLK().slice(0, 7)
    const outBal = Number(vat.value.outputLedgerBalance || 0)
    const inBal = Number(vat.value.inputLedgerBalance || 0)

    settlementForm.value = {
      periodMonth: currentPeriod,
      periodDate: todayLK(),
      outputVatClear: outBal > 0 ? outBal : Number(vat.value.outputVat || 0),
      inputVatOffset: inBal > 0 ? inBal : Number(vat.value.inputVat || 0),
      accountId: payingAccounts.value[0]?.id || '',
      paymentMethod: 'bank_transfer',
      paymentRef: '',
      notes: `IRD VAT Return for ${currentPeriod}`,
    }

    showSettlementDialog.value = true
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: 'Failed to prepare settlement dialog: ' + (e?.message || e),
    })
  }
}

async function submitSettlement() {
  if (!settlementForm.value.accountId) {
    $q.notify({ type: 'warning', message: 'Please select a paying bank/cash account.' })
    return
  }

  const outClear = Number(settlementForm.value.outputVatClear || 0)
  const inOffset = Number(settlementForm.value.inputVatOffset || 0)

  if (outClear <= 0 && inOffset <= 0) {
    $q.notify({ type: 'warning', message: 'At least one of Output VAT or Input VAT must be greater than zero.' })
    return
  }

  submittingSettlement.value = true
  try {
    await taxSettlementService.recordVatSettlement({
      companyId: authStore.currentBranch?.company_id,
      branchId: authStore.currentBranch?.id,
      periodMonth: settlementForm.value.periodMonth || todayLK().slice(0, 7),
      periodDate: settlementForm.value.periodDate || todayLK(),
      accountId: settlementForm.value.accountId,
      paymentMethod: settlementForm.value.paymentMethod,
      paymentRef: settlementForm.value.paymentRef,
      outputVatClear: outClear,
      inputVatOffset: inOffset,
      notes: settlementForm.value.notes,
    })

    $q.notify({
      type: 'positive',
      message: 'VAT Settlement successfully posted to General Ledger!',
    })
    showSettlementDialog.value = false
    await loadData()
  } catch (e) {
    $q.notify({
      type: 'negative',
      message: 'Error recording settlement: ' + (e?.message || e),
    })
  } finally {
    submittingSettlement.value = false
  }
}

onMounted(loadData)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
