<template>
  <q-page class="q-pa-md finance-page">
    <FinancePageHeader
      icon="dashboard"
      title="Finance Dashboard"
      breadcrumbs="Finance / Overview"
      show-refresh
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
            class="fin-surface-2 rounded-borders text-caption"
            style="width: 145px"
            @update:model-value="fetchAll"
          />
        </div>
      </template>
    </FinancePageHeader>

    <q-banner v-if="loadError" dense rounded class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error" /></template>
      {{ loadError }}
      <template #action><q-btn flat dense label="Retry" @click="fetchAll" /></template>
    </q-banner>
    <q-banner v-for="(w, i) in warnings" :key="'w' + i" dense rounded class="bg-amber-1 text-brown-9 q-mb-sm">
      <template #avatar><q-icon name="report_problem" color="amber-9" /></template>
      {{ w }}
    </q-banner>

    <!-- KPI Cards — revenue / expenses / profit / cash are GL figures (same as the statements) -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="kpi in kpis" :key="kpi.key" class="col-12 col-sm-6 col-md-3 col-lg">
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
            <span class="fin-panel__title">Recent GL Postings</span>
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
              <q-item v-for="je in recentJournals" :key="je.key" class="fin-activity-item">
                <q-item-section avatar>
                  <q-avatar size="28px" color="blue-grey-8" text-color="white" icon="receipt" />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-body2 text-weight-medium">{{
                    je.description || je.source_label
                  }}</q-item-label>
                  <q-item-label caption>{{ je.source_label }} · {{ formatDate(je.date) }}</q-item-label>
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
              label="Accounts"
              @click="$router.push('/finance/accounts')"
            />
          </div>
          <div class="fin-panel__body">
            <q-table
              :rows="accountBalances"
              :columns="balanceCols"
              row-key="id"
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
            <span class="fin-panel__title">Expense Breakdown (period, GL)</span>
            <q-btn
              flat
              dense
              size="sm"
              color="primary"
              label="Profit &amp; Loss"
              @click="$router.push('/finance/financial-statements')"
            />
          </div>
          <div class="fin-panel__body">
            <q-table
              :rows="expenseBreakdown"
              :columns="expenseCols"
              row-key="id"
              flat
              :dark="$q.dark.isActive"
              dense
              hide-bottom
              :rows-per-page-options="[0]"
              class="fin-table"
              no-data-label="No expenses posted in this period"
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
import { useAuthStore } from 'src/stores/auth'
import FinancePageHeader from 'src/modules/finance/components/FinancePageHeader.vue'
import DashboardChart from 'components/dashboard/DashboardChart.vue'
import DashboardCard from 'components/dashboard/DashboardCard.vue'
import { financeDashboardService } from 'src/modules/finance/services/finance-dashboard.service'
import { localDateKey } from 'src/modules/finance/services/finance-dashboard.builder'

const loading = ref(false)
const chartReady = ref(false)
const loadError = ref('')
const warnings = ref([])
const $q = useQuasar()
const authStore = useAuthStore()

// Period selection state
const selectedPeriod = ref('monthly') // 'daily' | 'weekly' | 'monthly'
const todayStr = localDateKey()
const selectedDailyDate = ref(todayStr)

const kpis = ref([
  { key: 'revenue', label: 'Period Revenue', value: 0, icon: 'trending_up', color: 'green', isCurrency: true },
  { key: 'expenses', label: 'Period Expenses', value: 0, icon: 'trending_down', color: 'red', isCurrency: true },
  { key: 'profit', label: 'Net Profit', value: 0, icon: 'insights', color: 'indigo', isCurrency: true },
  { key: 'cash', label: 'Cash & Bank', value: 0, icon: 'account_balance', color: 'blue', isCurrency: true },
  { key: 'ar', label: 'Outstanding AR', value: 0, icon: 'request_quote', color: 'orange', isCurrency: true },
  { key: 'ap', label: 'Outstanding AP', value: 0, icon: 'receipt_long', color: 'purple', isCurrency: true },
  { key: 'payroll', label: 'Payroll Due', value: 0, icon: 'payments', color: 'teal', isCurrency: true },
])
const setKpi = (key, patch) => {
  const k = kpis.value.find((x) => x.key === key)
  if (k) Object.assign(k, patch)
}

const recentJournals = ref([])
const accountBalances = ref([])
const expenseBreakdown = ref([])

const balanceCols = [
  { name: 'code', label: 'Ledger', field: 'code', align: 'left', style: 'width: 80px' },
  { name: 'name', label: 'Account', field: 'name', align: 'left' },
  { name: 'type', label: 'Type', field: 'account_type', align: 'left' },
  { name: 'balance', label: 'Balance (GL)', field: 'balance', align: 'right', format: (v) => formatCurrency(v) },
]

const expenseCols = [
  { name: 'code', label: 'Code', field: 'code', align: 'left', style: 'width: 80px' },
  { name: 'name', label: 'Expense Ledger', field: 'name', align: 'left' },
  { name: 'group', label: 'Group', field: 'group', align: 'left' },
  { name: 'amount', label: 'Amount', field: 'amount', align: 'right', format: (v) => formatCurrency(v) },
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
  if (val === null || val === undefined) return '—'
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

/**
 * KPI period + chart buckets for the selected view. All dates are LOCAL
 * (toISOString() is UTC and shifts the day for Sri Lanka before 05:30).
 */
function getPeriodConfig() {
  const today = localDateKey()

  if (selectedPeriod.value === 'daily') {
    const targetDate = selectedDailyDate.value || today
    const isToday = targetDate === today
    chartSubtitle.value = `Hourly Timeline (${targetDate}, by posting time)`
    setKpi('revenue', { label: isToday ? 'Today Revenue' : 'Day Revenue' })
    setKpi('expenses', { label: isToday ? 'Today Expenses' : 'Day Expenses' })
    setKpi('profit', { label: isToday ? 'Today Net Profit' : 'Day Net Profit' })

    // 8 slots of 3 hours — GL legs carry only a date, so the hour is the posting time.
    const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']
    return {
      kpiFrom: targetDate,
      kpiTo: targetDate,
      categories: hours,
      bucketOf: (e) => {
        if (String(e.entry_date || '').slice(0, 10) !== targetDate) return -1
        const h = e.created_at ? new Date(e.created_at).getHours() : 12
        return Math.min(Math.floor(h / 3), 7)
      },
    }
  }

  if (selectedPeriod.value === 'weekly') {
    chartSubtitle.value = 'Last 7 Days (Day-by-Day)'
    setKpi('revenue', { label: '7-Day Revenue' })
    setKpi('expenses', { label: '7-Day Expenses' })
    setKpi('profit', { label: '7-Day Net Profit' })

    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push({ key: localDateKey(d), label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }) })
    }
    const idx = new Map(days.map((d, i) => [d.key, i]))
    return {
      kpiFrom: days[0].key,
      kpiTo: days[days.length - 1].key,
      categories: days.map((d) => d.label),
      bucketOf: (e) => idx.get(String(e.entry_date || '').slice(0, 10)) ?? -1,
    }
  }

  // Monthly: KPIs = this month to date; chart = last 6 months.
  chartSubtitle.value = 'Last 6 Months (Monthly Trend)'
  setKpi('revenue', { label: 'This Month Revenue' })
  setKpi('expenses', { label: 'This Month Expenses' })
  setKpi('profit', { label: 'This Month Net Profit' })

  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      key: localDateKey(d).slice(0, 7), // 'YYYY-MM'
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    })
  }
  const idx = new Map(months.map((m, i) => [m.key, i]))
  return {
    kpiFrom: `${today.slice(0, 7)}-01`,
    kpiTo: today,
    categories: months.map((m) => m.label),
    bucketOf: (e) => idx.get(String(e.entry_date || '').slice(0, 7)) ?? -1,
  }
}

async function fetchAll() {
  loading.value = true
  chartReady.value = false
  loadError.value = ''
  try {
    const period = getPeriodConfig()
    const res = await financeDashboardService.load({
      branchId: authStore.activeBranchId || null,
      kpiFrom: period.kpiFrom,
      kpiTo: period.kpiTo,
      bucketCount: period.categories.length,
      bucketOf: period.bucketOf,
    })

    setKpi('revenue', { value: res.revenue })
    setKpi('expenses', { value: res.expenses })
    setKpi('profit', { value: res.netProfit, color: res.netProfit < 0 ? 'red' : 'indigo' })
    setKpi('cash', { value: res.cashAndBank })
    setKpi('ar', { value: res.outstandingAR })
    setKpi('ap', { value: res.outstandingAP })
    setKpi('payroll', { value: res.payrollDue })

    warnings.value = res.warnings || []
    recentJournals.value = res.recent || []
    accountBalances.value = res.accountBalances || []
    expenseBreakdown.value = (res.expenseBreakdown || []).slice(0, 8)

    chartCategories.value = period.categories
    chartSeries.value = [
      { name: 'Revenue', data: res.revenueSeries.map((v) => Math.round(v)) },
      { name: 'Expenses', data: res.expenseSeries.map((v) => Math.round(v)) },
    ]
    chartReady.value = true
  } catch (err) {
    console.error('[FinanceDashboard] fetchAll error:', err)
    loadError.value = err?.message || 'Failed to load the finance dashboard'
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
