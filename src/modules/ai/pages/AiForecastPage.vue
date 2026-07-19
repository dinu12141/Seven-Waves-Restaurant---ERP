<template>
  <q-page class="q-pa-md ai-forecast-page">
    <PageHeader
      title="AI Forecasting"
      subtitle="Sales and inventory demand predictions powered by AI"
      show-back
      back-route="/ai"
    >
      <template #actions>
        <PermissionGate permission="ai.generate">
          <q-btn-dropdown color="primary" icon="auto_awesome" label="Generate Forecast" unelevated :loading="aiStore.loading.forecasts" :disable="aiStore.isAiUnavailable">
            <q-list>
              <q-item clickable v-close-popup @click="runSalesForecast">
                <q-item-section avatar><q-icon name="trending_up" color="blue" /></q-item-section>
                <q-item-section>Sales Forecast</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="runInventoryForecast">
                <q-item-section avatar><q-icon name="inventory_2" color="green" /></q-item-section>
                <q-item-section>Inventory Demand Forecast</q-item-section>
              </q-item>
              <q-item clickable v-close-popup @click="runProcurement">
                <q-item-section avatar><q-icon name="shopping_cart" color="orange" /></q-item-section>
                <q-item-section>Smart Procurement Suggestions</q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </PermissionGate>
      </template>
    </PageHeader>

    <!-- AI Unavailable Banner -->
    <q-banner
      v-if="aiStore.isAiUnavailable"
      dense
      class="q-mb-md bg-warning text-dark"
      rounded
    >
      <template #avatar><q-icon name="warning" /></template>
      AI features require a Gemini API key configured in the Edge Function secrets.
      Contact your system administrator to enable AI capabilities.
    </q-banner>

    <!-- AI Safety Notice -->
    <q-banner dense class="ai-disclaimer q-mb-md" rounded>
      <template #avatar><q-icon name="info" color="amber" /></template>
      Forecasts are based on historical patterns and may not account for external factors. Use as guidance only.
    </q-banner>

    <!-- Sales Forecast Section -->
    <AiForecastChart
      title="Sales Forecast"
      :forecasts="aiStore.forecasts"
      :explanation="forecastExplanation"
      @period-change="(p) => (selectedPeriod = p)"
      class="q-mb-lg"
    />

    <!-- Procurement Suggestions -->
    <AiRecommendationList
      :recommendations="aiStore.recommendations"
      @approve="handleApprove"
      @reject="handleReject"
      class="q-mb-lg"
    />

    <!-- Historical Data Reference -->
    <q-card flat bordered class="q-pa-md ai-history-card">
      <div class="text-subtitle2 text-weight-bold q-mb-sm">
        <q-icon name="history" class="q-mr-xs" /> Forecast History
      </div>
      <div v-if="!aiStore.forecasts.length" class="text-grey-6 text-center q-pa-lg">
        No forecasts generated yet. Use the button above to generate your first forecast.
      </div>
      <div v-else class="text-caption text-grey-6">
        {{ aiStore.forecasts.length }} forecasts on record
      </div>
    </q-card>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useAiStore } from '../stores/ai.store'
import { useAuthStore } from 'src/stores/auth'
import PageHeader from 'components/common/PageHeader.vue'
import PermissionGate from 'components/common/PermissionGate.vue'
import AiForecastChart from '../components/AiForecastChart.vue'
import AiRecommendationList from '../components/AiRecommendationList.vue'

const $q = useQuasar()
const aiStore = useAiStore()
const authStore = useAuthStore()

const branchId = computed(() => authStore.currentBranch?.id)
const userId = computed(() => authStore.user?.id)
const selectedPeriod = ref('7d')
const forecastExplanation = ref('')

onMounted(() => {
  if (branchId.value) aiStore.loadForecasts(branchId.value)
})

async function runSalesForecast() {
  const result = await aiStore.runSalesForecast(branchId.value, selectedPeriod.value)
  if (result.success) {
    forecastExplanation.value = result.data?.trend_explanation || ''
    $q.notify({ type: 'positive', message: 'Sales forecast generated.' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Forecast generation failed.' })
  }
}

async function runInventoryForecast() {
  const result = await aiStore.runInventoryForecast(branchId.value)
  if (result.success) {
    $q.notify({ type: 'positive', message: 'Inventory forecast generated.' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Forecast generation failed.' })
  }
}

async function runProcurement() {
  const result = await aiStore.runProcurementSuggestions(branchId.value)
  if (result.success) {
    $q.notify({ type: 'positive', message: 'Procurement suggestions generated.' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'Generation failed.' })
  }
}

async function handleApprove(id) {
  await aiStore.handleRecommendationReview(id, 'approved', userId.value)
}

async function handleReject(id) {
  $q.dialog({
    title: 'Reject',
    message: 'Reason:',
    prompt: { model: '', type: 'textarea' },
    cancel: true,
  }).onOk(async (reason) => {
    await aiStore.handleRecommendationReview(id, 'rejected', userId.value, reason)
  })
}
</script>

<style lang="scss" scoped>
.ai-forecast-page { max-width: 1200px; margin: 0 auto; }
.ai-disclaimer {
  background: rgba(255, 165, 0, 0.06);
  border: 1px solid rgba(255, 165, 0, 0.15);
  color: var(--erp-text-secondary);
  font-size: 13px;
}
.ai-history-card {
  border-radius: 12px;
  background: var(--erp-bg-card);
  border-color: var(--erp-border);
}
</style>
