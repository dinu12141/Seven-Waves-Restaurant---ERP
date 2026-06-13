// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — useAiInsights Composable
// ═══════════════════════════════════════════════════════════════════════════════
import { computed } from 'vue'
import { useAiStore } from '../stores/ai.store'
import { useAuthStore } from 'src/stores/auth'

export function useAiInsights() {
  const aiStore = useAiStore()
  const authStore = useAuthStore()

  const branchId = computed(() => authStore.activeBranch?.id)
  const userId = computed(() => authStore.user?.id)

  const insights = computed(() => aiStore.insights)
  const criticalInsights = computed(() => aiStore.criticalInsights)
  const isLoading = computed(() => aiStore.loading.insights || aiStore.loading.generating)
  const lastScan = computed(() => aiStore.lastScanAt)

  async function generateInsights(dateRange) {
    return aiStore.runFullScan(branchId.value, dateRange)
  }

  async function acknowledgeInsight(insightId) {
    return aiStore.handleInsightAction(insightId, 'acknowledged', userId.value)
  }

  async function dismissInsight(insightId) {
    return aiStore.handleInsightAction(insightId, 'dismissed', userId.value)
  }

  async function actionInsight(insightId) {
    return aiStore.handleInsightAction(insightId, 'actioned', userId.value)
  }

  return {
    insights,
    criticalInsights,
    isLoading,
    lastScan,
    generateInsights,
    acknowledgeInsight,
    dismissInsight,
    actionInsight,
  }
}
