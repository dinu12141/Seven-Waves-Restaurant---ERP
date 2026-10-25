<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="assessment" size="md" color="primary" class="q-mr-sm" />
      <div>
        <div class="text-h5 text-weight-bold">Financial Statements</div>
        <div class="text-caption text-grey-6">Official accounting statements — Seven Waves Restaurant (Pvt) Ltd</div>
      </div>
    </div>

    <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left" narrow-indicator>
      <q-tab name="trial" label="Trial Balance" icon="balance" />
      <q-tab name="pl" label="Profit & Loss" icon="trending_up" />
      <q-tab name="bs" label="Balance Sheet" icon="account_balance" />
    </q-tabs>
    <q-separator />

    <div class="row q-col-gutter-sm q-my-md items-center">
      <div class="col-12 col-sm-3">
        <q-input v-model="filters.date_from" label="From Date" outlined dense type="date" />
      </div>
      <div class="col-12 col-sm-3">
        <q-input v-model="filters.date_to" label="To Date" outlined dense type="date" />
      </div>
      <div class="col-12 col-sm-2">
        <q-btn color="primary" label="Generate" icon="autorenew" unelevated @click="generate" :loading="stmtStore.loading" no-caps />
      </div>
    </div>

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
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceStatementsStore } from '../stores/finance-statements.store'
import { financeExportService } from '../services/finance-export.service'
import FinancialStatementViewer from '../components/FinancialStatementViewer.vue'

const $q = useQuasar()
const stmtStore = useFinanceStatementsStore()
const tab = ref('trial')
const filters = ref({ date_from: '', date_to: '' })

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

async function generate() {
  if (tab.value === 'trial') await stmtStore.fetchTrialBalance(filters.value)
  else if (tab.value === 'pl') await stmtStore.fetchProfitLoss(filters.value)
  else await stmtStore.fetchBalanceSheet(filters.value)
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

function downloadPlExcel() {
  if (!stmtStore.profitLoss) return
  financeExportService.exportProfitLossToExcel(stmtStore.profitLoss)
  $q.notify({ type: 'positive', message: 'Profit & Loss Statement exported to Excel' })
}

function downloadPlPdf() {
  if (!stmtStore.profitLoss) return
  financeExportService.exportProfitLossToPdf(stmtStore.profitLoss)
  $q.notify({ type: 'positive', message: 'Profit & Loss Statement exported to PDF' })
}

function downloadBsExcel() {
  if (!stmtStore.balanceSheet) return
  financeExportService.exportBalanceSheetToExcel(stmtStore.balanceSheet)
  $q.notify({ type: 'positive', message: 'Balance Sheet exported to Excel' })
}

function downloadBsPdf() {
  if (!stmtStore.balanceSheet) return
  financeExportService.exportBalanceSheetToPdf(stmtStore.balanceSheet)
  $q.notify({ type: 'positive', message: 'Balance Sheet exported to PDF' })
}
</script>

<style scoped>
.font-mono {
  font-family: monospace;
}
</style>
