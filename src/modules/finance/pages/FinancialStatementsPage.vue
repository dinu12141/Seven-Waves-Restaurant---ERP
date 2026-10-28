<template>
  <q-page class="q-pa-md">
    <FinancePageHeader
      title="Financial Statements"
      icon="assessment"
      subtitle="Trial balance, profit & loss and balance sheet — Seven Waves Restaurant (Pvt) Ltd"
      breadcrumbs="Finance / Reports"
    />

    <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left" narrow-indicator>
      <q-tab name="trial" label="Trial Balance" icon="balance" />
      <q-tab name="pl" label="Profit & Loss" icon="trending_up" />
      <q-tab name="bs" label="Balance Sheet" icon="account_balance" />
    </q-tabs>
    <q-separator />

    <FinanceFilterBar
      v-model:from="filters.date_from"
      v-model:to="filters.date_to"
      from-label="From (P&L period)"
      to-label="To (Balance Sheet as at)"
      :presets="['this_month', 'last_month', 'this_fy', 'last_fy']"
      default-preset="this_fy"
      persist-key="financial-statements"
      class="q-mt-md"
    >
      <q-btn color="primary" label="Generate" icon="autorenew" unelevated @click="generate" :loading="stmtStore.loading" no-caps />
      <span class="text-caption text-grey-7">{{ periodLabel }}</span>
    </FinanceFilterBar>

    <q-tab-panels v-model="tab" animated>
      <!-- TRIAL BALANCE -->
      <q-tab-panel name="trial">
        <div v-if="!stmtStore.trialBalance" class="text-grey-5 text-center q-pa-xl">
          Click "Generate" to compile the Trial Balance report
        </div>
        <template v-else>
          <div class="row items-center justify-between q-mb-md">
            <q-banner
              :class="stmtStore.trialBalance.isBalanced ? 'bg-green-1 text-green-8' : 'bg-red-1 text-red-8'"
              class="col"
              rounded
            >
              {{ stmtStore.trialBalance.isBalanced ? '✓ Trial Balance is balanced' : '⚠ Trial Balance is NOT balanced' }}
              — Total Debit: LKR {{ Number(stmtStore.trialBalance.totalDebit).toLocaleString(undefined, { minimumFractionDigits: 2 }) }} | Total Credit: LKR {{ Number(stmtStore.trialBalance.totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
              <div v-if="Math.abs(Number(stmtStore.trialBalance.opening_difference || 0)) >= 0.01" class="text-orange-9 text-weight-medium q-mt-xs">
                ⚠ Ledger opening balances do not agree by LKR
                {{ Math.abs(Number(stmtStore.trialBalance.opening_difference)).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                ({{ stmtStore.trialBalance.opening_difference > 0 ? 'debit' : 'credit' }} excess). It is shown as
                "Difference in Opening Balances (Suspense)" until the openings are corrected in Finance → Ledgers.
              </div>
            </q-banner>
            <div class="q-ml-md q-gutter-xs">
              <q-btn
                unelevated
                color="positive"
                icon="table_view"
                label="Excel"
                dense
                padding="xs sm"
                no-caps
                @click="downloadTrialExcel"
              />
              <q-btn
                unelevated
                color="negative"
                icon="picture_as_pdf"
                label="PDF"
                dense
                padding="xs sm"
                no-caps
                @click="downloadTrialPdf"
              />
            </div>
          </div>

          <q-table
            flat
            bordered
            dense
            :rows="stmtStore.trialBalance.rows"
            :columns="tbColumns"
            row-key="ledger_code"
            :pagination="{ rowsPerPage: 50 }"
          >
            <template v-slot:body-cell-closing_debit="p">
              <q-td :props="p" class="text-red-8 font-mono">
                {{ p.value > 0 ? Number(p.value).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '' }}
              </q-td>
            </template>
            <template v-slot:body-cell-closing_credit="p">
              <q-td :props="p" class="text-green-8 font-mono">
                {{ p.value > 0 ? Number(p.value).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '' }}
              </q-td>
            </template>
          </q-table>
        </template>
      </q-tab-panel>

      <!-- PROFIT & LOSS -->
      <q-tab-panel name="pl">
        <div v-if="!stmtStore.profitLoss" class="text-grey-5 text-center q-pa-xl">
          Click "Generate" to compile the Statement of Profit and Loss
        </div>
        <FinancialStatementViewer
          v-else
          :report="plReport"
          @download-excel="downloadPlExcel"
          @download-pdf="downloadPlPdf"
        />
      </q-tab-panel>

      <!-- BALANCE SHEET -->
      <q-tab-panel name="bs">
        <div v-if="!stmtStore.balanceSheet" class="text-grey-5 text-center q-pa-xl">
          Click "Generate" to compile the Statement of Financial Position
        </div>
        <FinancialStatementViewer
          v-else
          :report="bsReport"
          @download-excel="downloadBsExcel"
          @download-pdf="downloadBsPdf"
        />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import FinancePageHeader from '../components/FinancePageHeader.vue'
import FinanceFilterBar from '../components/FinanceFilterBar.vue'
import { presetRange, rangeLabel } from '../utils/finance-dates'
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceStatementsStore } from '../stores/finance-statements.store'
import { financeExportService } from '../services/finance-export.service'
import FinancialStatementViewer from '../components/FinancialStatementViewer.vue'

const $q = useQuasar()
const stmtStore = useFinanceStatementsStore()
const tab = ref('trial')
// Default: financial year to date (Sri Lanka time); user can pick any range.
const fyToDate = presetRange('this_fy')
const filters = ref({ date_from: fyToDate.from, date_to: fyToDate.to })
const periodLabel = computed(() => `P&L: ${rangeLabel(filters.value.date_from, filters.value.date_to)} · Balance Sheet as at ${filters.value.date_to || 'today'}`)

const tbColumns = [
  { name: 'ledger_code', label: 'Code', field: 'ledger_code', align: 'left', sortable: true },
  { name: 'ledger_name', label: 'Account Name', field: 'ledger_name', align: 'left', sortable: true },
  { name: 'account_group', label: 'Group', field: 'account_group', align: 'left' },
  { name: 'ledger_type', label: 'Type', field: 'ledger_type', align: 'left' },
  { name: 'closing_debit', label: 'Debit (LKR)', field: 'closing_debit', align: 'right' },
  { name: 'closing_credit', label: 'Credit (LKR)', field: 'closing_credit', align: 'right' },
]

const plReport = computed(() => {
  if (!stmtStore.profitLoss) return null
  return {
    ...stmtStore.profitLoss,
    type: 'pl',
  }
})

const bsReport = computed(() => {
  if (!stmtStore.balanceSheet) return null
  return {
    ...stmtStore.balanceSheet,
    type: 'bs',
  }
})

// Builds all three statements from one data load so no tab shows results
// from older filters. The Balance Sheet is cumulative as at "To Date"; the
// P&L covers "From Date" → "To Date".
async function generate() {
  await stmtStore.fetchAll({ ...filters.value })
  if (stmtStore.error) {
    $q.notify({ type: 'negative', message: stmtStore.error, position: 'top', timeout: 4000 })
  }
}

// ── Export Handlers ──
function downloadTrialExcel() {
  if (!stmtStore.trialBalance) return
  financeExportService.exportTrialBalanceToExcel(stmtStore.trialBalance)
  $q.notify({ type: 'positive', message: 'Trial Balance exported to Excel' })
}

function downloadTrialPdf() {
  if (!stmtStore.trialBalance) return
  financeExportService.exportTrialBalanceToPdf(stmtStore.trialBalance)
  $q.notify({ type: 'positive', message: 'Trial Balance exported to PDF' })
}

function downloadPlExcel(opts = {}) {
  if (!stmtStore.profitLoss) return
  financeExportService.exportProfitLossToExcel(stmtStore.profitLoss, opts)
  $q.notify({ type: 'positive', message: 'Profit & Loss Statement exported to Excel' })
}

function downloadPlPdf(opts = {}) {
  if (!stmtStore.profitLoss) return
  financeExportService.exportProfitLossToPdf(stmtStore.profitLoss, opts)
  $q.notify({ type: 'positive', message: 'Profit & Loss Statement exported to PDF' })
}

function downloadBsExcel(opts = {}) {
  if (!stmtStore.balanceSheet) return
  financeExportService.exportBalanceSheetToExcel(stmtStore.balanceSheet, opts)
  $q.notify({ type: 'positive', message: 'Balance Sheet exported to Excel' })
}

function downloadBsPdf(opts = {}) {
  if (!stmtStore.balanceSheet) return
  financeExportService.exportBalanceSheetToPdf(stmtStore.balanceSheet, opts)
  $q.notify({ type: 'positive', message: 'Balance Sheet exported to PDF' })
}
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
