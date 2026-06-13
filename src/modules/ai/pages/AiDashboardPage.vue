<template>
  <q-page class="q-pa-md ai-dashboard-page">
    <PageHeader
      title="AI Intelligence Dashboard"
      subtitle="Executive insights, recommendations, and anomaly detection powered by Gemini AI"
      show-back
      back-route="/dashboard"
    >
      <template #actions>
        <PermissionGate permission="ai.generate">
          <q-btn
            color="primary"
            icon="auto_awesome"
            label="Run AI Scan"
            unelevated
            :loading="aiStore.isGenerating"
            @click="handleFullScan"
          />
        </PermissionGate>
      </template>
    </PageHeader>

    <!-- AI Safety Notice -->
    <q-banner dense class="ai-disclaimer q-mb-md" rounded>
      <template #avatar>
        <q-icon name="info" color="amber" />
      </template>
      AI-generated insights are advisory only. Always verify before taking action. AI can be wrong.
    </q-banner>

    <!-- KPI Summary Cards -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="insights" size="32px" color="primary" />
          <div class="text-h4 text-weight-bold q-mt-sm">{{ summary.total_insights }}</div>
          <div class="text-caption text-grey-5">New Insights</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="warning" size="32px" color="red" />
          <div class="text-h4 text-weight-bold q-mt-sm text-negative">{{ summary.critical_count }}</div>
          <div class="text-caption text-grey-5">Critical / High</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="lightbulb" size="32px" color="amber" />
          <div class="text-h4 text-weight-bold q-mt-sm">{{ summary.pending_recommendations }}</div>
          <div class="text-caption text-grey-5">Pending Actions</div>
        </q-card>
      </div>
      <div class="col-6 col-md-3">
        <q-card flat bordered class="kpi-card text-center q-pa-md">
          <q-icon name="shield" size="32px" color="orange" />
          <div class="text-h4 text-weight-bold q-mt-sm">{{ summary.active_anomalies }}</div>
          <div class="text-caption text-grey-5">Active Anomalies</div>
        </q-card>
      </div>
    </div>

    <!-- Last scan info -->
    <div v-if="aiStore.lastScanAt" class="text-caption text-grey-6 q-mb-md">
      Last scan: {{ formatDate(aiStore.lastScanAt) }}
    </div>

    <div class="row q-col-gutter-md">
      <!-- Insights Column -->
      <div class="col-12 col-lg-7">
        <div class="text-subtitle1 text-weight-bold q-mb-sm">
          <q-icon name="insights" class="q-mr-xs" /> Recent Insights
        </div>

        <div v-if="aiStore.loading.dashboard" class="column q-gutter-sm">
          <q-skeleton v-for="n in 3" :key="n" type="rect" height="120px" class="rounded-borders" />
        </div>

        <div v-else-if="aiStore.insights.length" class="column q-gutter-sm">
          <AiInsightCard
            v-for="insight in aiStore.insights"
            :key="insight.id"
            :insight="insight"
            @acknowledge="handleInsightAction($event, 'acknowledged')"
            @action="handleInsightAction($event, 'actioned')"
            @dismiss="handleInsightAction($event, 'dismissed')"
          />
        </div>

        <q-card v-else flat bordered class="text-center q-pa-xl text-grey-6" style="border-radius: 12px; background: rgba(255,255,255,0.03);">
          <q-icon name="auto_awesome" size="48px" class="q-mb-sm" />
          <div>Run an AI scan to generate insights.</div>
        </q-card>
      </div>

      <!-- Recommendations + Quick Links Column -->
      <div class="col-12 col-lg-5">
        <AiRecommendationList
          :recommendations="aiStore.recommendations"
          @approve="handleRecApprove"
          @reject="handleRecReject"
          class="q-mb-md"
        />

        <!-- Quick Navigation -->
        <q-card flat bordered class="q-pa-md" style="border-radius: 12px; background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08);">
          <div class="text-subtitle2 text-weight-bold q-mb-sm">AI Modules</div>
          <q-list dense>
            <q-item clickable v-ripple to="/ai/forecasts" class="rounded-borders">
              <q-item-section avatar><q-icon name="trending_up" color="blue" /></q-item-section>
              <q-item-section>Sales & Inventory Forecasts</q-item-section>
              <q-item-section side><q-icon name="chevron_right" /></q-item-section>
            </q-item>
            <q-item clickable v-ripple to="/ai/anomalies" class="rounded-borders">
              <q-item-section avatar><q-icon name="warning_amber" color="orange" /></q-item-section>
              <q-item-section>Anomaly Detection Center</q-item-section>
              <q-item-section side><q-icon name="chevron_right" /></q-item-section>
            </q-item>
            <q-item clickable v-ripple to="/ai/assistant" class="rounded-borders">
              <q-item-section avatar><q-icon name="smart_toy" color="primary" /></q-item-section>
              <q-item-section>AI Assistant</q-item-section>
              <q-item-section side><q-icon name="chevron_right" /></q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useQuasar, date } from 'quasar'
import { useAiStore } from '../stores/ai.store'
import { useAuthStore } from 'src/stores/auth'
import PageHeader from 'components/common/PageHeader.vue'
import PermissionGate from 'components/common/PermissionGate.vue'
import AiInsightCard from '../components/AiInsightCard.vue'
import AiRecommendationList from '../components/AiRecommendationList.vue'

const $q = useQuasar()
const aiStore = useAiStore()
const authStore = useAuthStore()

const summary = computed(() => aiStore.dashboardSummary)
const branchId = computed(() => authStore.activeBranch?.id)
const userId = computed(() => authStore.user?.id)

onMounted(() => {
  aiStore.loadDashboard(branchId.value)
})

async function handleFullScan() {
  const result = await aiStore.runFullScan(branchId.value)
  if (result.success) {
    $q.notify({ type: 'positive', message: 'AI scan completed successfully!' })
  } else {
    $q.notify({ type: 'negative', message: result.error || 'AI scan failed.' })
  }
}

async function handleInsightAction(insightId, action) {
  await aiStore.handleInsightAction(insightId, action, userId.value)
}

async function handleRecApprove(recId) {
  await aiStore.handleRecommendationReview(recId, 'approved', userId.value)
  $q.notify({ type: 'positive', message: 'Recommendation approved.' })
}

async function handleRecReject(recId) {
  $q.dialog({
    title: 'Reject Recommendation',
    message: 'Provide a reason for rejection:',
    prompt: { model: '', type: 'textarea' },
    cancel: true,
    persistent: true,
  }).onOk(async (reason) => {
    await aiStore.handleRecommendationReview(recId, 'rejected', userId.value, reason)
    $q.notify({ type: 'info', message: 'Recommendation rejected.' })
  })
}

function formatDate(val) {
  if (!val) return ''
  return date.formatDate(val, 'DD MMM YYYY HH:mm')
}
</script>

<style lang="scss" scoped>
.ai-dashboard-page {
  max-width: 1400px;
  margin: 0 auto;
}

.ai-disclaimer {
  background: rgba(255, 165, 0, 0.06);
  border: 1px solid rgba(255, 165, 0, 0.15);
  color: #d1d5db;
  font-size: 13px;
}

.kpi-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.08);
  transition: transform 0.2s;
  &:hover { transform: translateY(-2px); }
}
</style>
