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
        @update:model-value="$emit('period-change', $event)"
      />
    </q-card-section>

    <q-card-section v-if="forecasts.length" class="q-pt-none">
      <!-- Forecast cards -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div v-for="f in forecasts.slice(0, 4)" :key="f.forecast_period" class="col-6 col-md-3">
          <div class="forecast-period-card q-pa-sm text-center">
            <div class="text-caption text-grey-5">{{ f.forecast_period }}</div>
            <div class="text-h6 text-weight-bold text-primary q-my-xs">
              {{ formatValue(f.predicted_value) }}
            </div>
            <div class="text-caption text-grey-6">
              {{ formatValue(f.confidence_low) }} – {{ formatValue(f.confidence_high) }}
            </div>
            <AiConfidenceBadge :score="f.confidence_score" size="sm" class="q-mt-xs" />
          </div>
        </div>
      </div>

      <!-- Explanation -->
      <div v-if="explanation" class="forecast-explanation q-pa-sm q-mt-sm">
        <div class="text-caption text-grey-5 q-mb-xs">📊 AI Trend Analysis</div>
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
import { ref } from 'vue'
import AiConfidenceBadge from './AiConfidenceBadge.vue'

defineProps({
  title: { type: String, default: 'Sales Forecast' },
  forecasts: { type: Array, default: () => [] },
  explanation: { type: String, default: '' },
  currency: { type: String, default: 'LKR' },
})

defineEmits(['period-change'])

const selectedPeriod = ref('7d')
const periodOptions = [
  { label: '7 Days', value: '7d' },
  { label: '14 Days', value: '14d' },
  { label: '30 Days', value: '30d' },
]

function formatValue(val) {
  if (typeof val !== 'number') return '—'
  return `LKR ${val.toLocaleString('en-LK', { maximumFractionDigits: 0 })}`
}
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
</style>
