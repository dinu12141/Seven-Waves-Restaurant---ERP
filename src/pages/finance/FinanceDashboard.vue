<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Finance Dashboard"
      breadcrumbs="Finance / Overview"
      showRefresh
      @refresh="fetchAll"
    />

    <!-- KPI Cards -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="(kpi, i) in kpis" :key="i" class="col-12 col-sm-6 col-md-4 col-lg-2">
        <DashboardCard
          :title="kpi.label"
          :value="kpi.isCurrency ? formatCurrency(kpi.value) : kpi.value"
          :icon="kpi.icon"
          :color="kpi.color"
        />
      </div>
    </div>

    <!-- Main Content Row -->
    <div class="row q-col-gutter-md q-mb-md items-stretch">
      <!-- Revenue & Expense Chart -->
      <div class="col-12 col-md-8">
        <div class="fin-panel full-height">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Revenue vs Expenses</span>
            <span class="fin-panel__subtitle">Last 7 days</span>
          </div>
          <div class="fin-panel__body">
            <DashboardChart
              v-if="chartReady"
              title=""
              type="area"
              height="285"
              :series="chartSeries"
              :options="chartOptions"
              :loading="loading"
            />
            <div v-else class="text-center text-grey-6 q-pa-xl">Loading chart data...</div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="col-12 col-md-4">
        <div class="fin-panel full-height">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Recent Journal Entries</span>
            <q-btn
              flat
              dense
              size="sm"
              color="primary"
              label="View All"
              @click="$router.push('/finance/journal-entries')"
            />
          </div>
          <div class="fin-panel__body q-pa-sm">
            <q-list dense>
              <q-item v-for="je in recentJournals" :key="je.id" class="fin-activity-item">
                <q-item-section avatar>
                  <q-avatar size="28px" color="blue-grey-8" text-color="white" icon="receipt" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    je.description || je.reference_type
                  }}</q-item-label>
                  <q-item-label caption>{{
                    formatDate(je.doc_date)
                  }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="text-subtitle2 text-right text-weight-bold" style="color: var(--erp-text-primary)">
                    {{ formatCurrency(je.total_dr) }}
                  </div>
                </q-item-section>
              </q-item>
              <div
                v-if="recentJournals.length === 0"
                class="text-grey-6 text-center q-pa-md text-caption"
              >
                No recent entries
              </div>
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
            <q-btn
              flat
              dense
              size="sm"
              color="primary"
              label="Full Ledger"
              @click="$router.push('/finance/general-ledger')"
            />
          </div>
          <div class="fin-panel__body">
            <q-table
              :rows="accountBalances"
              :columns="balanceCols"
              row-key="code"
              flat
              :dark="$q.dark.isActive"
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table"
              no-data-label="No account data"
              :loading="loading"
            />
          </div>
        </div>
      </div>
      <div class="col-12 col-md-6">
        <div class="fin-panel">
          <div class="fin-panel__header">
            <span class="fin-panel__title">Expense Breakdown</span>
            <q-btn
              flat
              dense
              size="sm"
              color="primary"
              label="All Expenses"
              @click="$router.push('/finance/expenses')"
            />
          </div>
          <div class="fin-panel__body">
            <q-table
              :rows="recentExpenses"
              :columns="expenseCols"
              row-key="id"
              flat
              :dark="$q.dark.isActive"
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table"
              no-data-label="No expenses recorded"
              :loading="loading"
            />
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'
import ERPToolbar from 'components/erp/ERPToolbar.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import {
  fetchDashboardKPIs,
  fetchJournalEntries,
  fetchAccountBalances,
  fetchExpenses,
} from 'src/services/financeService'

const loading = ref(false)
const chartReady = ref(false)
const $q = useQuasar()

const kpis = ref([
  {
    label: 'Today Revenue',
    value: 0,
    icon: 'trending_up',
    color: 'green',
    bg: 'rgba(16,185,129,0.12)',
    isCurrency: true,
  },
  {
    label: 'Today Expenses',
    value: 0,
    icon: 'trending_down',
    color: 'red',
    bg: 'rgba(239,68,68,0.12)',
    isCurrency: true,
  },
  {
    label: 'Bank Balance',
    value: 0,
    icon: 'account_balance',
    color: 'blue',
    bg: 'rgba(59,130,246,0.12)',
    isCurrency: true,
  },
  {
    label: 'Outstanding AR',
    value: 0,
    icon: 'request_quote',
    color: 'orange',
    bg: 'rgba(245,158,11,0.12)',
    isCurrency: true,
  },
  {
    label: 'Outstanding AP',
    value: 0,
    icon: 'receipt_long',
    color: 'purple',
    bg: 'rgba(139,92,246,0.12)',
    isCurrency: true,
  },
  {
    label: 'Payroll Due',
    value: 0,
    icon: 'payments',
    color: 'teal',
    bg: 'rgba(20,184,166,0.12)',
    isCurrency: true,
  },
])

const recentJournals = ref([])
const accountBalances = ref([])
const recentExpenses = ref([])

const balanceCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'type', label: 'Type', field: 'account_type', align: 'left' },
  {
    name: 'balance',
    label: 'Balance',
    field: 'balance',
    align: 'right',
    format: (v) => formatCurrency(v),
  },
]

const expenseCols = [
  { name: 'date', label: 'Date', field: 'expense_date', align: 'left' },
  {
    name: 'category',
    label: 'Category',
    field: (row) => row.expense_categories?.name || '-',
    align: 'left',
  },
  { name: 'description', label: 'Description', field: 'description', align: 'left' },
  {
    name: 'amount',
    label: 'Amount',
    field: 'amount',
    align: 'right',
    format: (v) => formatCurrency(v),
  },
  { name: 'status', label: 'Status', field: 'status', align: 'center' },
]

// Chart: last 6 months labels computed from real data
const chartMonthLabels = ref([])
const chartSeries = ref([
  { name: 'Revenue', data: [] },
  { name: 'Expenses', data: [] },
])
const chartOptions = computed(() => {
  const isDark = $q.dark.isActive
  return {
    chart: { type: 'area', toolbar: { show: false }, background: 'transparent' },
    theme: { mode: isDark ? 'dark' : 'light' },
    xaxis: {
      categories: chartMonthLabels.value,
      labels: { style: { colors: '#9ca3af' } },
    },
    yaxis: { labels: { style: { colors: '#9ca3af' }, formatter: (v) => `LKR ${Number(v).toLocaleString()}` } },
    colors: ['#10b981', '#ef4444'],
    grid: { borderColor: isDark ? '#1f2937' : '#e5e7eb', strokeDashArray: 4 },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] },
    },
  }
})

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Build last-6-months date range */
function getLast6MonthsRange() {
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      key: d.toISOString().substring(0, 7), // 'YYYY-MM'
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      start: d.toISOString().split('T')[0],
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0],
    })
  }
  return months
}

async function fetchAll() {
  loading.value = true
  try {
    const sixMonthsAgo = getLast6MonthsRange()[0].start

    const [kpiRes, jeRes, balRes, expRes, posRevenueChartRes, recvVouchersChartRes, payVouchersChartRes, expenseChartRes] = await Promise.all([
      fetchDashboardKPIs(),
      fetchJournalEntries({ limit: 5 }),
      fetchAccountBalances(),
      fetchExpenses({ limit: 8 }),

      // Monthly POS paid orders revenue
      supabase
        .from('orders')
        .select('total_amount, created_at')
        .eq('payment_status', 'paid')
        .gte('created_at', sixMonthsAgo + 'T00:00:00')
        .order('created_at'),

      // Monthly Received Vouchers revenue
      supabase
        .from('finance_vouchers')
        .select('amount, voucher_date, created_at')
        .eq('voucher_type', 'received')
        .in('status', ['posted', 'approved', 'submitted'])
        .gte('voucher_date', sixMonthsAgo),

      // Monthly Pay Vouchers expenses
      supabase
        .from('finance_vouchers')
        .select('amount, voucher_date, created_at')
        .eq('voucher_type', 'pay')
        .in('status', ['posted', 'approved', 'submitted'])
        .gte('voucher_date', sixMonthsAgo),

      // Monthly expense_entries
      supabase
        .from('expense_entries')
        .select('amount, expense_date')
        .in('status', ['approved', 'paid'])
        .gte('expense_date', sixMonthsAgo),
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

    // Build chart from real data
    const months = getLast6MonthsRange()
    chartMonthLabels.value = months.map((m) => m.label)

    const revenueByMonth = {}
    const expenseByMonth = {}
    months.forEach((m) => {
      revenueByMonth[m.key] = 0
      expenseByMonth[m.key] = 0
    })

    for (const row of posRevenueChartRes.data || []) {
      const monthKey = (row.created_at || '').substring(0, 7)
      if (revenueByMonth[monthKey] !== undefined) {
        revenueByMonth[monthKey] += Number(row.total_amount || 0)
      }
    }
    for (const row of recvVouchersChartRes.data || []) {
      const monthKey = (row.voucher_date || row.created_at || '').substring(0, 7)
      if (revenueByMonth[monthKey] !== undefined) {
        revenueByMonth[monthKey] += Number(row.amount || 0)
      }
    }

    for (const row of payVouchersChartRes.data || []) {
      const monthKey = (row.voucher_date || row.created_at || '').substring(0, 7)
      if (expenseByMonth[monthKey] !== undefined) {
        expenseByMonth[monthKey] += Number(row.amount || 0)
      }
    }
    for (const row of expenseChartRes.data || []) {
      const monthKey = (row.expense_date || '').substring(0, 7)
      if (expenseByMonth[monthKey] !== undefined) {
        expenseByMonth[monthKey] += Number(row.amount || 0)
      }
    }

    chartSeries.value = [
      { name: 'Revenue', data: months.map((m) => Math.round(revenueByMonth[m.key])) },
      { name: 'Expenses', data: months.map((m) => Math.round(expenseByMonth[m.key])) },
    ]
    chartReady.value = true
  } catch (err) {
    console.error('[FinanceDashboard] fetchAll error:', err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)
</script>

<style scoped lang="scss">
@import 'src/css/finance-common.scss';
</style>
