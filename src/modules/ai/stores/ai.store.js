// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Pinia Store
// ═══════════════════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  generateExecutiveInsights,
  generateSalesForecast,
  generateInventoryForecast,
  generateProcurementSuggestions,
  detectAnomalies,
  sendChatMessage,
  fetchInsights,
  fetchRecommendations,
  fetchAnomalies,
  fetchForecasts,
  updateInsightStatus,
  reviewRecommendation,
  reviewAnomaly,
  getAiDashboardSummary,
} from '../services/ai.service'

export const useAiStore = defineStore('ai', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const insights = ref([])
  const recommendations = ref([])
  const anomalies = ref([])
  const forecasts = ref([])
  const chatMessages = ref([])
  const chatLoaded = ref(false) // prevents double-loading
  const dashboardSummary = ref({
    total_insights: 0,
    critical_count: 0,
    pending_recommendations: 0,
    active_anomalies: 0,
  })

  const loading = ref({
    insights: false,
    forecasts: false,
    anomalies: false,
    chat: false,
    dashboard: false,
    generating: false,
  })

  const lastScanAt = ref(null)

  // ── Computed ─────────────────────────────────────────────────────────────
  const criticalInsights = computed(() =>
    insights.value.filter((i) => i.severity === 'critical' || i.severity === 'high')
  )

  const pendingRecommendations = computed(() =>
    recommendations.value.filter((r) => r.status === 'pending')
  )

  const openAnomalies = computed(() =>
    anomalies.value.filter((a) => a.status === 'open')
  )

  const isGenerating = computed(() => loading.value.generating)

  // ── Actions ──────────────────────────────────────────────────────────────

  async function loadDashboard(branchId) {
    loading.value.dashboard = true
    try {
      const [summary, insightData, recData, anomalyData] = await Promise.all([
        getAiDashboardSummary(branchId),
        fetchInsights({ limit: 20, branch_id: branchId }),
        fetchRecommendations({ limit: 10, status: 'pending', branch_id: branchId }),
        fetchAnomalies({ limit: 10, status: 'open', branch_id: branchId }),
      ])

      dashboardSummary.value = summary
      insights.value = insightData
      recommendations.value = recData
      anomalies.value = anomalyData
    } finally {
      loading.value.dashboard = false
    }
  }

  async function runFullScan(branchId, dateRange) {
    loading.value.generating = true
    try {
      const result = await generateExecutiveInsights(branchId, dateRange)
      if (result.success) {
        lastScanAt.value = new Date().toISOString()
        // Reload data after scan
        await loadDashboard(branchId)
      }
      return result
    } finally {
      loading.value.generating = false
    }
  }

  async function runSalesForecast(branchId, period) {
    loading.value.forecasts = true
    try {
      const result = await generateSalesForecast(branchId, period)
      if (result.success && result.data?.forecasts) {
        forecasts.value = result.data.forecasts
      }
      return result
    } finally {
      loading.value.forecasts = false
    }
  }

  async function runInventoryForecast(branchId) {
    loading.value.forecasts = true
    try {
      return await generateInventoryForecast(branchId)
    } finally {
      loading.value.forecasts = false
    }
  }

  async function runProcurementSuggestions(branchId) {
    loading.value.generating = true
    try {
      return await generateProcurementSuggestions(branchId)
    } finally {
      loading.value.generating = false
    }
  }

  async function runAnomalyDetection(branchId, dateRange) {
    loading.value.anomalies = true
    try {
      const result = await detectAnomalies(branchId, dateRange)
      if (result.success) {
        await loadAnomalies(branchId)
      }
      return result
    } finally {
      loading.value.anomalies = false
    }
  }

  async function loadAnomalies(branchId, filters = {}) {
    const data = await fetchAnomalies({ ...filters, branch_id: branchId })
    anomalies.value = data
  }

  async function loadForecasts(branchId, filters = {}) {
    const data = await fetchForecasts({ ...filters, branch_id: branchId })
    forecasts.value = data
  }

  async function handleInsightAction(insightId, action, userId) {
    const result = await updateInsightStatus(insightId, action, userId)
    if (result.success) {
      const idx = insights.value.findIndex((i) => i.id === insightId)
      if (idx !== -1) insights.value[idx].status = action
    }
    return result
  }

  async function handleRecommendationReview(recId, action, userId, reason) {
    const result = await reviewRecommendation(recId, action, userId, reason)
    if (result.success) {
      const idx = recommendations.value.findIndex((r) => r.id === recId)
      if (idx !== -1) recommendations.value[idx].status = action
    }
    return result
  }

  async function handleAnomalyReview(anomalyId, status, userId) {
    const result = await reviewAnomaly(anomalyId, status, userId)
    if (result.success) {
      const idx = anomalies.value.findIndex((a) => a.id === anomalyId)
      if (idx !== -1) anomalies.value[idx].status = status
    }
    return result
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const CHAT_STORAGE_KEY = 'sw_ai_chat_history'
  const CHAT_MAX_PERSIST = 50 // max messages stored locally

  /**
   * Load chat history from localStorage on page mount.
   * Falls back to empty array if nothing stored or parse fails.
   */
  function loadChatHistory() {
    if (chatLoaded.value) return
    chatLoaded.value = true
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          chatMessages.value = parsed
        }
      }
    } catch {
      // corrupt storage — start fresh
      localStorage.removeItem(CHAT_STORAGE_KEY)
    }
  }

  /**
   * Persist current messages to localStorage (last N messages).
   */
  function _persistChat() {
    try {
      const toSave = chatMessages.value.slice(-CHAT_MAX_PERSIST)
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave))
    } catch {
      // ignore storage quota errors
    }
  }

  async function sendMessage(message, branchId, moduleContext) {
    loading.value.chat = true

    chatMessages.value.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    })

    try {
      const result = await sendChatMessage(
        message,
        chatMessages.value,
        branchId,
        moduleContext
      )

      const aiMessage = {
        role: 'assistant',
        content: result.success
          ? result.data?.message || 'No response generated.'
          : result.error || 'AI service unavailable.',
        timestamp: new Date().toISOString(),
        metadata: {
          confidence: result.data?.confidence,
          suggestions: result.data?.suggestions,
        },
      }

      chatMessages.value.push(aiMessage)
      _persistChat()
      return result
    } finally {
      loading.value.chat = false
    }
  }

  function clearChat() {
    chatMessages.value = []
    chatLoaded.value = false
    try { localStorage.removeItem(CHAT_STORAGE_KEY) } catch { /* ignore */ }
  }

  return {
    // State
    insights,
    recommendations,
    anomalies,
    forecasts,
    chatMessages,
    dashboardSummary,
    loading,
    lastScanAt,
    // Computed
    criticalInsights,
    pendingRecommendations,
    openAnomalies,
    isGenerating,
    // Actions
    loadDashboard,
    runFullScan,
    runSalesForecast,
    runInventoryForecast,
    runProcurementSuggestions,
    runAnomalyDetection,
    loadAnomalies,
    loadForecasts,
    handleInsightAction,
    handleRecommendationReview,
    handleAnomalyReview,
    loadChatHistory,
    sendMessage,
    clearChat,
  }
})
