<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <q-icon name="assessment" size="md" color="primary" class="q-mr-sm" />
      <div class="text-h5 text-weight-bold">Financial Statements</div>
    </div>

    <q-tabs v-model="tab" dense class="text-grey" active-color="primary" indicator-color="primary" align="left" narrow-indicator>
      <q-tab name="trial" label="Trial Balance" icon="balance" />
      <q-tab name="pl" label="Profit & Loss" icon="trending_up" />
      <q-tab name="bs" label="Balance Sheet" icon="account_balance" />
    </q-tabs>
    <q-separator />

    <div class="row q-col-gutter-sm q-my-md">
      <div class="col-12 col-md-3"><q-input v-model="filters.date_from" label="From" outlined dense type="date" /></div>
      <div class="col-12 col-md-3"><q-input v-model="filters.date_to" label="To" outlined dense type="date" /></div>
      <div class="col-12 col-md-2"><q-btn color="primary" label="Generate" icon="autorenew" unelevated @click="generate" :loading="stmtStore.loading" /></div>
    </div>

    <q-tab-panels v-model="tab" animated>
      <!-- TRIAL BALANCE -->
      <q-tab-panel name="trial">
        <div v-if="!stmtStore.trialBalance" class="text-grey-5 text-center q-pa-xl">Generate a Trial Balance report</div>
        <template v-else>
          <q-banner :class="stmtStore.trialBalance.isBalanced ? 'bg-green-1 text-green-8' : 'bg-red-1 text-red-8'" class="q-mb-md" rounded>
            {{ stmtStore.trialBalance.isBalanced ? '✓ Trial Balance is balanced' : '⚠ Trial Balance is NOT balanced' }}
            — Debit: LKR {{ stmtStore.trialBalance.totalDebit.toLocaleString() }} | Credit: LKR {{ stmtStore.trialBalance.totalCredit.toLocaleString() }}
          </q-banner>
          <q-table flat bordered dense :rows="stmtStore.trialBalance.rows" :columns="tbColumns" row-key="ledger_code" :pagination="{ rowsPerPage: 50 }">
            <template v-slot:body-cell-closing_debit="p"><q-td :props="p" class="text-red-8">{{ p.value > 0 ? p.value.toLocaleString() : '' }}</q-td></template>
            <template v-slot:body-cell-closing_credit="p"><q-td :props="p" class="text-green-8">{{ p.value > 0 ? p.value.toLocaleString() : '' }}</q-td></template>
          </q-table>
        </template>
      </q-tab-panel>

      <!-- PROFIT & LOSS -->
      <q-tab-panel name="pl">
        <div v-if="!stmtStore.profitLoss" class="text-grey-5 text-center q-pa-xl">Generate a Profit & Loss report</div>
        <FinancialStatementViewer v-else :report="plReport" />
      </q-tab-panel>

      <!-- BALANCE SHEET -->
      <q-tab-panel name="bs">
        <div v-if="!stmtStore.balanceSheet" class="text-grey-5 text-center q-pa-xl">Generate a Balance Sheet</div>
        <FinancialStatementViewer v-else :report="bsReport" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceStatementsStore } from '../stores/finance-statements.store'
import FinancialStatementViewer from '../components/FinancialStatementViewer.vue'

const $q = useQuasar()
const stmtStore = useFinanceStatementsStore()
const tab = ref('trial')
const filters = ref({ date_from: '', date_to: '' })

const tbColumns = [
  { name: 'ledger_code', label: 'Code', field: 'ledger_code', align: 'left', sortable: true },
  { name: 'ledger_name', label: 'Name', field: 'ledger_name', align: 'left' },
  { name: 'ledger_type', label: 'Type', field: 'ledger_type', align: 'left' },
  { name: 'opening_debit', label: 'Open Dr', field: 'opening_debit', align: 'right' },
  { name: 'opening_credit', label: 'Open Cr', field: 'opening_credit', align: 'right' },
  { name: 'period_debit', label: 'Period Dr', field: 'period_debit', align: 'right' },
  { name: 'period_credit', label: 'Period Cr', field: 'period_credit', align: 'right' },
  { name: 'closing_debit', label: 'Close Dr', field: 'closing_debit', align: 'right' },
  { name: 'closing_credit', label: 'Close Cr', field: 'closing_credit', align: 'right' },
]

const plReport = computed(() => {
  const pl = stmtStore.profitLoss
  if (!pl) return { sections: [] }
  return {
    title: 'Profit & Loss Statement',
    period: pl.period,
    sections: [pl.revenue, pl.cost_of_sales, pl.operating_expenses],
    summary_line: { label: 'Net Profit', value: pl.net_profit },
    generated_at: pl.generated_at,
  }
})

const bsReport = computed(() => {
  const bs = stmtStore.balanceSheet
  if (!bs) return { sections: [] }
  return {
    title: 'Balance Sheet',
    as_of_date: bs.as_of_date,
    sections: [bs.assets, bs.liabilities, bs.equity],
    summary_line: { label: 'Total Liabilities + Equity', value: bs.total_liabilities_equity },
    is_balanced: bs.is_balanced,
    generated_at: bs.generated_at,
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
</script>
