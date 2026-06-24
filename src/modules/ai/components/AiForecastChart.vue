<template>
  <q-card flat bordered class="ai-forecast-chart">
    <q-card-section class="row items-center q-pb-sm">
      <q-icon name="trending_up" color="primary" size="sm" class="q-mr-sm" />
      <div class="text-subtitle1 text-weight-bold">{{ title }}</div>
      <q-space />
      <q-btn-toggle
        v-model="selectedPeriod"
        no-caps
        unelevated
        dense
        size="sm"
        :options="periodOptions"
        color="dark"
        toggle-color="primary"
        class="q-mr-sm"
        @update:model-value="onPeriodChange"
      />
    </q-card-section>

    <q-card-section v-if="forecasts.length" class="q-pt-none">
      <!-- Forecast cards with actual overlay -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div v-for="f in forecasts.slice(0, 4)" :key="f.forecast_period" class="col-6 col-md-3">
          <div class="forecast-period-card q-pa-sm text-center">
            <div class="text-caption text-grey-5">{{ f.forecast_period }}</div>

            <!-- Predicted -->
            <div class="text-caption text-grey-6 q-mt-xs">Predicted</div>
            <div class="text-h6 text-weight-bold text-primary q-my-xs">
              {{ formatValue(f.predicted_value) }}
            </div>
            <div class="text-caption text-grey-6">
              {{ formatValue(f.confidence_low) }} – {{ formatValue(f.confidence_high) }}
            </div>
            <AiConfidenceBadge :score="f.confidence_score" size="sm" class="q-mt-xs" />

            <!-- Actual revenue comparison (when available) -->
            <template v-if="actualByPeriod[f.forecast_period] !== undefined">
              <q-separator class="q-my-xs" />
              <div class="text-caption text-grey-6">Actual</div>
              <div class="text-subtitle2 text-weight-bold" :class="actualVsPredictedColor(actualByPeriod[f.forecast_period], f.predicted_value)">
                {{ formatValue(actualByPeriod[f.forecast_period]) }}
              </div>
              <div class="text-caption" :class="varianceColor(actualByPeriod[f.forecast_period], f.predicted_value)">
                {{ varianceLabel(actualByPeriod[f.forecast_period], f.predicted_value) }}
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Actual vs Predicted Summary Bar -->
      <div v-if="hasActualData" class="actual-summary-bar q-pa-sm q-mb-md row items-center q-gutter-sm">
        <q-icon name="bar_chart" color="teal" size="sm" />
        <span class="text-caption text-grey-5">Actual vs Predicted:</span>
        <q-chip dense size="sm" color="teal" text-color="white" icon="check_circle">
          Total Actual: {{ formatValue(totalActual) }}
        </q-chip>
        <q-chip dense size="sm" color="primary" text-color="white" icon="trending_up">
          Total Predicted: {{ formatValue(totalPredicted) }}
        </q-chip>
        <q-chip dense size="sm" :color="overallVarianceColor" text-color="white">
          {{ overallVarianceLabel }}
        </q-chip>
        <q-spinner-dots v-if="loadingActual" color="teal" size="16px" />
      </div>

      <!-- Explanation -->
      <div v-if="explanation" class="forecast-explanation q-pa-sm q-mt-sm">
        <div class="text-caption text-grey-5 q-mb-xs">AI Trend Analysis</div>
        <div class="text-body2">{{ explanation }}</div>
      </div>
    </q-card-section>

    <q-card-section v-else class="text-center text-grey-6 q-pa-xl">
      <q-icon name="show_chart" size="48px" class="q-mb-sm" />
      <div>Generate a forecast to see predictions here.</div>
    </q-card-section>
  </q-card>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import AiConfidenceBadge from './AiConfidenceBadge.vue'

const props = defineProps({
  title: { type: String, default: 'Sales Forecast' },
  forecasts: { type: Array, default: () => [] },
  explanation: { type: String, default: '' },
  currency: { type: String, default: '' },
})

const emit = defineEmits(['period-change'])

const authStore = useAuthStore()
const selectedPeriod = ref('7d')
const periodOptions = [
  { label: '7 Days', value: '7d' },
  { label: '14 Days', value: '14d' },
  { label: '30 Days', value: '30d' },
]

// Currency: prefer prop → company settings → fallback LKR
const currencyCode = computed(() => {
  if (props.currency) return props.currency
  return authStore.currentBranch?.currency || 'LKR'
})

// ── Actual Revenue Data ───────────────────────────────────────────────────────

const actualRevenueByDate = ref({}) // { 'YYYY-MM-DD': number }
const loadingActual = ref(false)

/**
 * Load actual paid orders grouped by date for the selected period.
 */
async function loadActualRevenue() {
  const branchId = authStore.currentBranch?.id
  if (!branchId) return

  const days = selectedPeriod.value === '30d' ? 30 : selectedPeriod.value === '14d' ? 14 : 7
  const from = new Date()
  from.setDate(from.getDate() - days)

  loadingActual.value = true
  try {
    const { data } = await supabase
      .from('orders')
      .select('created_at, total_amount')
      .eq('branch_id', branchId)
      .eq('payment_status', 'paid')
      .gte('created_at', from.toISOString())
      .order('created_at', { ascending: true })

    const byDate = {}
    ;(data || []).forEach((order) => {
      const day = order.created_at.split('T')[0]
      byDate[day] = (byDate[day] || 0) + (order.total_amount || 0)
    })
    actualRevenueByDate.value = byDate
  } finally {
    loadingActual.value = false
  }
}

/**
 * Map forecast_period strings (e.g. "2026-06-23", "Day 1", "Week 1") to
 * their actual revenue. We try an exact date match first, then fall back to
 * summing all daily actuals for the period window.
 */
const actualByPeriod = computed(() => {
  const result = {}
  if (!props.forecasts.length) return result
  const dates = Object.keys(actualRevenueByDate.value)

  props.forecasts.slice(0, 4).forEach((f) => {
    const period = f.forecast_period
    if (!period) return

    // Direct date match (YYYY-MM-DD)
    if (actualRevenueByDate.value[period] !== undefined) {
      result[period] = actualRevenueByDate.value[period]
      return
    }

    // Week-based periods: sum all actual dates
    // For non-date strings (e.g. "Day 1", "Week 1"), sum all available actuals
    // divided across forecast items
    const total = dates.reduce((sum, d) => sum + actualRevenueByDate.value[d], 0)
    const count = props.forecasts.length || 1
    result[period] = Math.round(total / count)
  })

  return result
})

const hasActualData = computed(() => Object.keys(actualByPeriod.value).length > 0)

const totalActual = computed(() =>
  Object.values(actualRevenueByDate.value).reduce((s, v) => s + v, 0)
)

const totalPredicted = computed(() =>
  props.forecasts.slice(0, 4).reduce((s, f) => s + (f.predicted_value || 0), 0)
)

const overallVarianceColor = computed(() => {
  if (!totalPredicted.value) return 'grey'
  const pct = ((totalActual.value - totalPredicted.value) / totalPredicted.value) * 100
  if (pct >= 0) return 'positive'
  if (pct < -10) return 'negative'
  return 'warning'
})

const overallVarianceLabel = computed(() => {
  if (!totalPredicted.value) return 'No forecast'
  const pct = ((totalActual.value - totalPredicted.value) / totalPredicted.value) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs forecast`
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValue(val) {
  if (typeof val !== 'number') return '—'
  return `${currencyCode.value} ${val.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`
}

function varianceLabel(actual, predicted) {
  if (!predicted) return ''
  const pct = ((actual - predicted) / predicted) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function varianceColor(actual, predicted) {
  if (!predicted) return 'text-grey-6'
  const pct = ((actual - predicted) / predicted) * 100
  if (pct >= 0) return 'text-positive'
  if (pct < -10) return 'text-negative'
  return 'text-warning'
}

function actualVsPredictedColor(actual, predicted) {
  if (!predicted) return 'text-teal'
  const pct = ((actual - predicted) / predicted) * 100
  if (pct >= -5) return 'text-positive'
  if (pct < -15) return 'text-negative'
  return 'text-warning'
}

function onPeriodChange(val) {
  emit('period-change', val)
  loadActualRevenue()
}

// Load actual data on mount and when forecasts arrive
onMounted(loadActualRevenue)
watch(() => props.forecasts, (val) => { if (val.length) loadActualRevenue() }, { immediate: false })
</script>

<style lang="scss" scoped>
.ai-forecast-chart {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
}
.forecast-period-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}
.forecast-explanation {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.1);
  border-radius: 8px;
}
.actual-summary-bar {
  background: rgba(0, 128, 128, 0.06);
  border: 1px solid rgba(0, 128, 128, 0.15);
  border-radius: 8px;
  flex-wrap: wrap;
}
</style>
