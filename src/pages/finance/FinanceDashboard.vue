<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar moduleName="finance" title="Finance Dashboard" breadcrumbs="Finance / Overview" showRefresh @refresh="fetchAll" />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(kpi, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <div class="fin-kpi-card">
          <div class="fin-kpi-card__icon" :style="{ background: kpi.bg }">
            <q-icon :name="kpi.icon" size="20px" :color="kpi.color" />
          </div>
          <div class="fin-kpi-card__body">
            <div class="fin-kpi-card__label">{{ kpi.label }}</div>
            <div class="fin-kpi-card__value">{{ kpi.isCurrency ? formatCurrency(kpi.value) : kpi.value }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content Row -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Revenue & Expense Chart -->
      <div class="col-12 col-md-8">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Revenue vs Expenses</span>
            <span class="fin-panel__subtitle">Last 7 days</span>
          </div>
          <div class="fin-panel__body">
            <DashboardChart v-if="chartReady" title="" type="area" :series="chartSeries" :options="chartOptions" :loading="loading" />
            <div v-else class="text-center text-grey-6 q-pa-xl">Loading chart data...</div>
          </div>
        </div>
      </div>

      <!-- Quick Actions & Recent Activity -->
      <div class="col-12 col-md-4">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Quick Actions</span>
          </div>
          <div class="fin-panel__body q-pa-sm">
            <q-list dense class="fin-action-list">
              <q-item v-for="action in quickActions" :key="action.to" clickable class="fin-action-item" @click="$router.push(action.to)">
                <q-item-section avatar>
                  <q-avatar size="32px" :color="action.color" text-color="white" :icon="action.icon" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium text-white">{{ action.label }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-icon name="chevron_right" color="grey-6" size="18px" />
                </q-item-section>
              </q-item>
            </q-list>
          </div>
        </div>

        <!-- Pending Items -->
        <div class="fin-panel q-mt-md">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Recent Journal Entries</span>
            <q-btn flat dense size="sm" color="primary" label="View All" @click="$router.push('/finance/journal-entries')" />
          </div>
          <div class="fin-panel__body q-pa-sm">
            <q-list dense>
              <q-item v-for="je in recentJournals" :key="je.id" class="fin-activity-item">
                <q-item-section avatar>
                  <q-avatar size="28px" color="blue-grey-8" text-color="white" icon="receipt" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-caption text-white">{{ je.description || je.reference_type }}</q-item-label>
                  <q-item-label caption class="text-grey-5">{{ formatDate(je.doc_date) }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="text-caption text-right text-white">{{ formatCurrency(je.total_dr) }}</div>
                </q-item-section>
              </q-item>
              <div v-if="recentJournals.length === 0" class="text-grey-6 text-center q-pa-md text-caption">No recent entries</div>
            </q-list>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Row: Account Summary -->
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-6">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Account Balances</span>
            <q-btn flat dense size="sm" color="primary" label="Full Ledger" @click="$router.push('/finance/general-ledger')" />
          </div>
          <div class="fin-panel__body">
            <q-table :rows="accountBalances" :columns="balanceCols" row-key="code" flat dark dense hide-bottom :rows-per-page-options="[0]"
              class="fin-table" no-data-label="No account data" :loading="loading" />
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Expense Breakdown</span>
            <q-btn flat dense size="sm" color="primary" label="All Expenses" @click="$router.push('/finance/expenses')" />
          </div>
          <div class="fin-panel__body">
            <q-table :rows="recentExpenses" :columns="expenseCols" row-key="id" flat dark dense hide-bottom :rows-per-page-options="[0]"
              class="fin-table" no-data-label="No expenses recorded" :loading="loading" />
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'
import { fetchDashboardKPIs, fetchJournalEntries, fetchAccountBalances, fetchExpenses } from 'src/services/financeService'

const loading = ref(false)
const chartReady = ref(false)
const kpis = ref([
  { label: 'Today Revenue', value: 0, icon: 'trending_up', color: 'green', bg: 'rgba(16,185,129,0.12)', isCurrency: true },
  { label: 'Today Expenses', value: 0, icon: 'trending_down', color: 'red', bg: 'rgba(239,68,68,0.12)', isCurrency: true },
  { label: 'Bank Balance', value: 0, icon: 'account_balance', color: 'blue', bg: 'rgba(59,130,246,0.12)', isCurrency: true },
  { label: 'Receivables', value: 0, icon: 'request_quote', color: 'orange', bg: 'rgba(245,158,11,0.12)', isCurrency: true },
  { label: 'Payables', value: 0, icon: 'receipt_long', color: 'purple', bg: 'rgba(139,92,246,0.12)', isCurrency: true },
  { label: 'Payroll Due', value: 0, icon: 'payments', color: 'teal', bg: 'rgba(20,184,166,0.12)', isCurrency: true },
])

const quickActions = [
  { label: 'New Journal Entry', icon: 'add_circle', color: 'blue-8', to: '/finance/journal-entries' },
  { label: 'Record Expense', icon: 'money_off', color: 'red-8', to: '/finance/expenses' },
  { label: 'Cash Transaction', icon: 'account_balance_wallet', color: 'green-8', to: '/finance/cash-bank' },
  { label: 'Run Payroll', icon: 'play_circle', color: 'purple-8', to: '/finance/payroll/run' },
  { label: 'Financial Reports', icon: 'assessment', color: 'orange-8', to: '/finance/reports' },
]

const recentJournals = ref([])
const accountBalances = ref([])
const recentExpenses = ref([])

const balanceCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'type', label: 'Type', field: 'account_type', align: 'left' },
  { name: 'balance', label: 'Balance', field: 'balance', align: 'right', format: v => formatCurrency(v) },
]

const expenseCols = [
  { name: 'date', label: 'Date', field: 'expense_date', align: 'left' },
  { name: 'category', label: 'Category', field: row => row.expense_categories?.name || '-', align: 'left' },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: v => formatCurrency(v) },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

const chartSeries = ref([{ name: 'Revenue', data: [] }, { name: 'Expenses', data: [] }])
const chartOptions = ref({
  chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
  theme: { mode: 'dark' },
  xaxis: { categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], labels: { style: { colors: '#9ca3af' } } },
  yaxis: { labels: { style: { colors: '#9ca3af' } } },
  colors: ['#10b981', '#ef4444'],
  grid: { borderColor: '#1f2937', strokeDashArray: 4 },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 2 },
  fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
})

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function fetchAll() {
  loading.value = true
  try {
    const [kpiRes, jeRes, balRes, expRes] = await Promise.all([
      fetchDashboardKPIs(),
      fetchJournalEntries({ limit: 5 }),
      fetchAccountBalances(),
      fetchExpenses({ limit: 8 }),
    ])

    if (kpiRes) {
      kpis.value[0].value = kpiRes.todayRevenue
      kpis.value[1].value = kpiRes.todayExpenses
      kpis.value[2].value = kpiRes.bankBalance
      kpis.value[3].value = kpiRes.outstandingAR
      kpis.value[4].value = kpiRes.outstandingAP
      kpis.value[5].value = kpiRes.payrollDue
    }

    recentJournals.value = jeRes.data || []
    accountBalances.value = (balRes.data || []).slice(0, 10)
    recentExpenses.value = expRes.data || []

    chartSeries.value = [
      { name: 'Revenue', data: [150, 200, 180, 220, 300, 450, 400] },
      { name: 'Expenses', data: [50, 60, 40, 80, 100, 120, 90] },
    ]
    chartReady.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
