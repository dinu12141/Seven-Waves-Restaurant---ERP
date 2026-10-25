// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Pinia Store
// ═══════════════════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
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
  runSystemAudit,
  generateEodReport,
  fetchDailyReports,
  fetchDailyReportById,
  fetchDailyReportByDate,
  runFinGuardAudit,
  runTalentOpsAudit,
  runSupplySenseAudit,
  runMultiAgentComprehensiveAudit,
  fetchMultiAgentAlerts,
  autoCloseOrphanedShift,
  autoTransferPosCash,
  draftInternalStockTransfer,
  resolveMultiAgentAlert,
} from '../services/ai.service'

export const useAiStore = defineStore('ai', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const insights = ref([])
  const recommendations = ref([])
  const anomalies = ref([])
  const forecasts = ref([])
  const multiAgentScores = ref({
    overall: 100,
    operations: 100,
    finance: 100,
    hr: 100,
    inventory: 100,
  })
  const multiAgentAlerts = ref([])
  const systemAudits = ref([])
  const dailyReports = ref([])
  const currentReport = ref(null)
  const auditChecks = ref([])
  const systemAuditResult = ref(null)
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
    audit: false,
    systemAudit: false,
    eodReport: false,
    reports: false,
  })

  const lastScanAt = ref(null)
  const aiServiceError = ref(null) // set when Edge Function is unreachable or unconfigured

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

  const isAiUnavailable = computed(() => !!aiServiceError.value)

  function _setServiceError(result) {
    if (!result?.success && result?.error) {
      const msg = result.error.toLowerCase()
      if (
        msg.includes('unavailable') ||
        msg.includes('gemini_api_key') ||
        msg.includes('missing') ||
        msg.includes('edge function') ||
        msg.includes('function not found') ||
        msg.includes('failed to reach') ||
        msg.includes('500') ||
        msg.includes('network') ||
        msg.includes('relay error')
      ) {
        aiServiceError.value = result.error
      }
    }
  }

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
      _setServiceError(result)
      if (result.success) {
        lastScanAt.value = new Date().toISOString()
        aiServiceError.value = null
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
      _setServiceError(result)
      if (result.success) {
        aiServiceError.value = null
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

  // Chat storage key namespaced by user ID — prevents cross-user chat leakage on shared devices.
  // Called inside actions (not at store definition time) so Pinia is fully initialized.
  function _chatKey() {
    const uid = useAuthStore().user?.id
    return uid ? `sw_ai_chat_${uid}` : 'sw_ai_chat_anonymous'
  }
  const CHAT_MAX_PERSIST = 20 // max messages stored locally (was 50; trimmed to limit PII exposure)

  /**
   * Load chat history from localStorage on page mount.
   * Falls back to empty array if nothing stored or parse fails.
   */
  function loadChatHistory() {
    if (chatLoaded.value) return
    chatLoaded.value = true
    try {
      const key = _chatKey()
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          chatMessages.value = parsed
        }
      }
    } catch {
      // corrupt storage — start fresh
      try { localStorage.removeItem(_chatKey()) } catch { /* ignore */ }
    }
  }

  /**
   * Persist current messages to localStorage (last N messages).
   */
  function _persistChat() {
    try {
      const toSave = chatMessages.value.slice(-CHAT_MAX_PERSIST)
      localStorage.setItem(_chatKey(), JSON.stringify(toSave))
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
        chatMessages.value.slice(0, -1), // exclude the just-pushed user message to avoid duplication
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
    try { localStorage.removeItem(_chatKey()) } catch { /* ignore */ }
  }

  // ── System Audit ─────────────────────────────────────────────────────────

  async function loadSystemAudits(limit = 30) {
    loading.value.audit = true
    try {
      const data = await fetchDailyReports(null, { limit })
      systemAudits.value = data
    } finally {
      loading.value.audit = false
    }
  }

  async function generateSystemAudit(branchId, dateFrom, dateTo) {
    loading.value.generating = true
    try {
      const result = await runSystemAudit(branchId, dateFrom, dateTo)
      _setServiceError(result)
      if (result.success) {
        aiServiceError.value = null
        systemAuditResult.value = result.data
        await loadDashboard(branchId)
      }
      return result
    } finally {
      loading.value.generating = false
    }
  }

  async function runSystemAuditAction(branchId, dateFrom, dateTo) {
    loading.value.systemAudit = true
    try {
      const result = await runSystemAudit(branchId, dateFrom, dateTo)
      _setServiceError(result)
      if (result.success) {
        aiServiceError.value = null
        systemAuditResult.value = result.data
        await loadDashboard(branchId)
      }
      return result
    } finally {
      loading.value.systemAudit = false
    }
  }

  async function generateEodReportAction(branchId, reportDate, userId) {
    loading.value.eodReport = true
    try {
      const result = await generateEodReport(branchId, reportDate, userId)
      _setServiceError(result)
      if (result.success) {
        aiServiceError.value = null
        await loadDailyReports(branchId)
      }
      return result
    } finally {
      loading.value.eodReport = false
    }
  }

  async function loadDailyReports(branchId, filters = {}) {
    loading.value.reports = true
    try {
      const data = await fetchDailyReports(branchId, filters)
      dailyReports.value = data
      return data
    } finally {
      loading.value.reports = false
    }
  }

  async function loadReportDetail(reportId) {
    const data = await fetchDailyReportById(reportId)
    if (data) {
      currentReport.value = data
      auditChecks.value = data.ai_audit_checks || []
    }
    return data
  }

  async function loadTodayReport(branchId) {
    const today = new Date().toISOString().split('T')[0]
    const data = await fetchDailyReportByDate(branchId, today)
    if (data) {
      currentReport.value = data
      auditChecks.value = data.ai_audit_checks || []
    }
    return data
  }

  // ── Multi-Agent System Actions (FinGuard, TalentOps, SupplySense) ─────────
  async function loadMultiAgentAlerts(branchId, agentType = null) {
    const alerts = await fetchMultiAgentAlerts(branchId, agentType)
    multiAgentAlerts.value = alerts
    return alerts
  }

  async function runAllMultiAgentAudits(branchId) {
    loading.value.audit = true
    try {
      const res = await runMultiAgentComprehensiveAudit(branchId)
      if (res?.success && res?.data) {
        multiAgentScores.value = {
          overall: res.data.overall_score || 100,
          operations: res.data.departments?.operations?.score || 100,
          finance: res.data.departments?.finance?.score || 100,
          hr: res.data.departments?.hr?.score || 100,
          inventory: res.data.departments?.inventory?.score || 100,
        }
      }
      await loadMultiAgentAlerts(branchId)
      return res
    } finally {
      loading.value.audit = false
    }
  }

  async function runSingleAgentAudit(agentType, branchId, options = {}) {
    loading.value.audit = true
    try {
      let res
      if (agentType === 'finance') res = await runFinGuardAudit(branchId, options)
      else if (agentType === 'hr') res = await runTalentOpsAudit(branchId, options)
      else if (agentType === 'inventory' || agentType === 'procurement') res = await runSupplySenseAudit(branchId, options)

      if (res?.success && res?.data) {
        if (agentType === 'finance') multiAgentScores.value.finance = res.data.health_score
        else if (agentType === 'hr') multiAgentScores.value.hr = res.data.health_score
        else multiAgentScores.value.inventory = res.data.health_score
      }
      await loadMultiAgentAlerts(branchId)
      return res
    } finally {
      loading.value.audit = false
    }
  }

  async function healShiftAction(attendanceId, maxHours = 9) {
    const res = await autoCloseOrphanedShift(attendanceId, maxHours)
    if (res?.success) {
      multiAgentAlerts.value = multiAgentAlerts.value.filter(
        (a) => a.metadata?.attendance_id !== attendanceId
      )
    }
    return res
  }

  async function transferCashAction(shiftId, branchId) {
    const res = await autoTransferPosCash(shiftId, branchId)
    if (res?.success) {
      multiAgentAlerts.value = multiAgentAlerts.value.filter(
        (a) => a.metadata?.shift_id !== shiftId
      )
    }
    return res
  }

  async function draftTransferAction(payload) {
    return await draftInternalStockTransfer(payload)
  }

  async function resolveAlertAction(alertId, action = 'resolved', notes = '', userId = null) {
    const res = await resolveMultiAgentAlert(alertId, action, notes, userId)
    if (res?.success) {
      multiAgentAlerts.value = multiAgentAlerts.value.filter((a) => a.id !== alertId)
    }
    return res
  }

  return {
    // State
    insights,
    recommendations,
    anomalies,
    forecasts,
    multiAgentScores,
    multiAgentAlerts,
    systemAudits,
    dailyReports,
    currentReport,
    auditChecks,
    systemAuditResult,
    chatMessages,
    dashboardSummary,
    loading,
    lastScanAt,
    aiServiceError,
    // Computed
    criticalInsights,
    pendingRecommendations,
    openAnomalies,
    isGenerating,
    isAiUnavailable,
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
    loadSystemAudits,
    generateSystemAudit,
    runSystemAuditAction,
    generateEodReportAction,
    loadDailyReports,
    loadReportDetail,
    loadTodayReport,
    loadMultiAgentAlerts,
    runAllMultiAgentAudits,
    runSingleAgentAudit,
    healShiftAction,
    transferCashAction,
    draftTransferAction,
    resolveAlertAction,
  }
})
