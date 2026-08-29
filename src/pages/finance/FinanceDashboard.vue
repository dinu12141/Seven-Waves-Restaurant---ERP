<template>
  <q-page class="q-pa-md finance-page">
    <ERPToolbar
      moduleName="finance"
      title="Finance Dashboard"
      breadcrumbs="Finance / Overview"
      showRefresh
      @refresh="fetchAll"
    >
      <template #actions>
        <div class="row items-center q-gutter-x-sm no-wrap">
          <q-btn-toggle
            v-model="selectedPeriod"
            dense
            rounded
            unelevated
            toggle-color="primary"
            color="grey-9"
            text-color="grey-4"
            class="period-toggle"
            :options="[
              { label: 'Daily', value: 'daily', icon: 'today' },
              { label: 'Weekly', value: 'weekly', icon: 'date_range' },
              { label: 'Monthly', value: 'monthly', icon: 'calendar_month' },
            ]"
            @update:model-value="fetchAll"
          />

          <!-- Specific Day Selector when Daily is active -->
          <q-input
            v-if="selectedPeriod === 'daily'"
            v-model="selectedDailyDate"
            dense
            outlined
            type="date"
            class="bg-grey-9 rounded-borders text-caption"
            style="width: 145px"
            @update:model-value="fetchAll"
          />
        </div>
      </template>
    </ERPToolbar>

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
          <div class="fin-panel__header row items-center justify-between">
            <div>
              <span class="fin-panel__title">Revenue vs Expenses</span>
              <span class="fin-panel__subtitle q-ml-sm text-caption text-grey-5">{{ chartSubtitle }}</span>
            </div>
            <q-badge color="primary" outline class="q-px-sm">
              {{ selectedPeriod.toUpperCase() }} VIEW
            </q-badge>
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
              @click="$router.push('/finance/pay-vouchers')"
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
              @click="$router.push('/finance/ledgers')"
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
import { useAuthStore } from 'src/stores/auth'
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
const authStore = useAuthStore()

// Period selection state
const selectedPeriod = ref('monthly') // 'daily' | 'weekly' | 'monthly'
const todayStr = new Date().toISOString().split('T')[0]
const selectedDailyDate = ref(todayStr)

const kpis = ref([
  {
    label: 'Period Revenue',
    value: 0,
    icon: 'trending_up',
    color: 'green',
    bg: 'rgba(16,185,129,0.12)',
    isCurrency: true,
  },
  {
    label: 'Period Expenses',
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

// Chart series & categories
const chartCategories = ref([])
const chartSubtitle = ref('Last 6 months')
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
      categories: chartCategories.value,
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

/** Compute date ranges and chart buckets based on selected period */
function getPeriodConfig() {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  if (selectedPeriod.value === 'daily') {
    const targetDate = selectedDailyDate.value || today
    const isToday = targetDate === today
    chartSubtitle.value = `Hourly Timeline (${targetDate})`
    kpis.value[0].label = isToday ? 'Today Revenue' : 'Day Revenue'
    kpis.value[1].label = isToday ? 'Today Expenses' : 'Day Expenses'

    // 8 slots of 3 hours
    const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']
    return {
      startDate: targetDate,
      endDate: targetDate,
      categories: hours,
      bucketType: 'hour',
    }
  }

  if (selectedPeriod.value === 'weekly') {
    chartSubtitle.value = 'Last 7 Days (Day-by-Day)'
    kpis.value[0].label = 'Weekly Revenue'
    kpis.value[1].label = 'Weekly Expenses'

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().split('T')[0]
      const label = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
      days.push({ key: dateKey, label })
    }

    return {
      startDate: days[0].key,
      endDate: days[days.length - 1].key,
      categories: days.map(d => d.label),
      dateKeys: days.map(d => d.key),
      bucketType: 'day',
    }
  }

  // Default: monthly (Last 6 months)
  chartSubtitle.value = 'Last 6 Months (Monthly Trend)'
  kpis.value[0].label = 'This Month Revenue'
  kpis.value[1].label = 'This Month Expenses'

  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      key: d.toISOString().substring(0, 7), // 'YYYY-MM'
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    })
  }

  // Start of 5 months ago to end of this month
  const firstMonth = new Date()
  firstMonth.setMonth(firstMonth.getMonth() - 5)
  firstMonth.setDate(1)
  const startStr = firstMonth.toISOString().split('T')[0]

  return {
    startDate: startStr,
    endDate: today,
    categories: months.map(m => m.label),
    monthKeys: months.map(m => m.key),
    bucketType: 'month',
  }
}

async function fetchAll() {
  loading.value = true
  chartReady.value = false
  try {
    const period = getPeriodConfig()

    const [kpiRes, jeRes, balRes, expRes, ordersRes, recvVouchersRes, payVouchersRes, expenseRes] = await Promise.all([
      fetchDashboardKPIs(authStore.activeBranchId, period.startDate, period.endDate),
      fetchJournalEntries({ limit: 5 }),
      fetchAccountBalances(),
      fetchExpenses({ limit: 8 }),

      // Real POS orders in date range
      supabase
        .from('orders')
        .select('total_amount, created_at')
        .gte('created_at', period.startDate + 'T00:00:00')
        .lte('created_at', period.endDate + 'T23:59:59')
        .eq('payment_status', 'paid'),

      // Received vouchers in date range
      supabase
        .from('finance_vouchers')
        .select('amount, voucher_date, created_at')
        .eq('voucher_type', 'received')
        .not('received_from', 'ilike', 'POS Cash Transfer%')
        .in('status', ['posted', 'approved', 'submitted'])
        .gte('voucher_date', period.startDate)
        .lte('voucher_date', period.endDate),

      // Pay vouchers in date range
      supabase
        .from('finance_vouchers')
        .select('amount, voucher_date, created_at')
        .eq('voucher_type', 'pay')
        .in('status', ['posted', 'approved', 'submitted'])
        .gte('voucher_date', period.startDate)
        .lte('voucher_date', period.endDate),

      // Expense entries in date range
      supabase
        .from('expense_entries')
        .select('amount, expense_date')
        .in('status', ['approved', 'paid'])
        .gte('expense_date', period.startDate)
        .lte('expense_date', period.endDate),
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

    chartCategories.value = period.categories

    // Populate chart series based on bucket type
    const revData = new Array(period.categories.length).fill(0)
    const expData = new Array(period.categories.length).fill(0)

    if (period.bucketType === 'hour') {
      // Bucket by 3-hour window
      for (const o of ordersRes.data || []) {
        const h = new Date(o.created_at).getHours()
        const idx = Math.min(Math.floor(h / 3), 7)
        revData[idx] += Number(o.total_amount || 0)
      }
      for (const v of recvVouchersRes.data || []) {
        const h = new Date(v.created_at || v.voucher_date).getHours()
        const idx = Math.min(Math.floor(h / 3), 7)
        revData[idx] += Number(v.amount || 0)
      }
      for (const v of payVouchersRes.data || []) {
        const h = new Date(v.created_at || v.voucher_date).getHours()
        const idx = Math.min(Math.floor(h / 3), 7)
        expData[idx] += Number(v.amount || 0)
      }
      for (const e of expenseRes.data || []) {
        expData[4] += Number(e.amount || 0) // distributed midday for daily
      }
    } else if (period.bucketType === 'day') {
      // Bucket by YYYY-MM-DD
      const dateMap = {}
      period.dateKeys.forEach((k, i) => { dateMap[k] = i })

      for (const o of ordersRes.data || []) {
        const d = (o.created_at || '').substring(0, 10)
        if (dateMap[d] !== undefined) revData[dateMap[d]] += Number(o.total_amount || 0)
      }
      for (const v of recvVouchersRes.data || []) {
        const d = (v.voucher_date || v.created_at || '').substring(0, 10)
        if (dateMap[d] !== undefined) revData[dateMap[d]] += Number(v.amount || 0)
      }
      for (const v of payVouchersRes.data || []) {
        const d = (v.voucher_date || v.created_at || '').substring(0, 10)
        if (dateMap[d] !== undefined) expData[dateMap[d]] += Number(v.amount || 0)
      }
      for (const e of expenseRes.data || []) {
        const d = (e.expense_date || '').substring(0, 10)
        if (dateMap[d] !== undefined) expData[dateMap[d]] += Number(e.amount || 0)
      }
    } else {
      // Bucket by YYYY-MM (Monthly)
      const monthMap = {}
      period.monthKeys.forEach((k, i) => { monthMap[k] = i })

      for (const o of ordersRes.data || []) {
        const m = (o.created_at || '').substring(0, 7)
        if (monthMap[m] !== undefined) revData[monthMap[m]] += Number(o.total_amount || 0)
      }
      for (const v of recvVouchersRes.data || []) {
        const m = (v.voucher_date || v.created_at || '').substring(0, 7)
        if (monthMap[m] !== undefined) revData[monthMap[m]] += Number(v.amount || 0)
      }
      for (const v of payVouchersRes.data || []) {
        const m = (v.voucher_date || v.created_at || '').substring(0, 7)
        if (monthMap[m] !== undefined) expData[monthMap[m]] += Number(v.amount || 0)
      }
      for (const e of expenseRes.data || []) {
        const m = (e.expense_date || '').substring(0, 7)
        if (monthMap[m] !== undefined) expData[monthMap[m]] += Number(e.amount || 0)
      }
    }

    chartSeries.value = [
      { name: 'Revenue', data: revData.map(v => Math.round(v)) },
      { name: 'Expenses', data: expData.map(v => Math.round(v)) },
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

.period-toggle {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
}
</style>
