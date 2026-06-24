// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Service Layer
// ═══════════════════════════════════════════════════════════════════════════════
// All AI calls route through Supabase Edge Functions for security.
// The Gemini API key is NEVER exposed to the frontend.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import {
  validateInsight,
  validateForecast,
  validateRecommendation,
  validateAnomaly,
  validateChatResponse,
  validateReportSummary,
  getAiFallbackResponse,
} from '../schemas/ai.schemas'

const AI_EDGE_FUNCTION = 'ai-gemini-service'
const REQUEST_TIMEOUT = 60000 // 60 seconds

/**
 * Invokes the AI Edge Function securely through Supabase.
 * Handles JWT auth automatically via the Supabase client.
 */
async function invokeAi(action, payload) {
  try {
    const { data, error } = await supabase.functions.invoke(AI_EDGE_FUNCTION, {
      body: { action, ...payload },
      headers: { 'x-request-timeout': String(REQUEST_TIMEOUT) },
    })

    if (error) {
      console.error(`[AI Service] Edge Function error for ${action}:`, error)
      return { success: false, error: error.message || 'AI service unavailable' }
    }

    return data
  } catch (err) {
    console.error(`[AI Service] Network error for ${action}:`, err)
    return { success: false, error: 'Failed to reach AI service. Check your connection.' }
  }
}

// ── Executive Insights ───────────────────────────────────────────────────────

/**
 * Generate executive-level insights from aggregated operational data.
 * RBAC: requires ai.generate permission
 */
export async function generateExecutiveInsights(branchId, dateRange) {
  const result = await invokeAi('executive_insights', {
    branch_id: branchId,
    date_from: dateRange?.from,
    date_to: dateRange?.to,
  })

  if (result.success && result.data?.insights) {
    result.data.insights = result.data.insights.filter(
      (insight) => validateInsight(insight).valid
    )
  }

  return result
}

// ── Sales Forecasting ────────────────────────────────────────────────────────

/**
 * Generate sales forecast with trend explanation.
 * Numerical forecast is calculated server-side; Gemini explains and enriches.
 */
export async function generateSalesForecast(branchId, forecastPeriod = '7d') {
  const result = await invokeAi('sales_forecast', {
    branch_id: branchId,
    forecast_period: forecastPeriod,
  })

  if (result.success && result.data?.forecasts) {
    result.data.forecasts = result.data.forecasts.filter(
      (f) => validateForecast(f).valid
    )
  }

  return result
}

// ── Inventory Forecasting ────────────────────────────────────────────────────

/**
 * Predict ingredient demand and identify stock risks.
 */
export async function generateInventoryForecast(branchId) {
  return invokeAi('inventory_forecast', { branch_id: branchId })
}

// ── Smart Procurement ────────────────────────────────────────────────────────

/**
 * Generate procurement suggestions — draft only, requires manager approval.
 */
export async function generateProcurementSuggestions(branchId) {
  const result = await invokeAi('procurement_suggestions', { branch_id: branchId })

  if (result.success && result.data?.recommendations) {
    result.data.recommendations = result.data.recommendations.filter(
      (r) => validateRecommendation(r).valid
    )
  }

  return result
}

// ── Kitchen Delay Prediction ─────────────────────────────────────────────────

/**
 * Predict kitchen delays and identify station bottlenecks.
 */
export async function predictKitchenDelays(branchId) {
  return invokeAi('kitchen_delay', { branch_id: branchId })
}

// ── Staff Scheduling ─────────────────────────────────────────────────────────

/**
 * Generate demand-based staffing recommendations.
 * AI cannot approve payroll or force shift changes.
 */
export async function generateStaffingRecommendations(branchId) {
  return invokeAi('staff_scheduling', { branch_id: branchId })
}

// ── Customer Intelligence ────────────────────────────────────────────────────

/**
 * Analyze anonymized customer behavior patterns.
 * Customer PII is never sent to Gemini.
 */
export async function generateCustomerIntelligence(branchId) {
  return invokeAi('customer_intelligence', { branch_id: branchId })
}

// ── Anomaly Detection ────────────────────────────────────────────────────────

/**
 * Detect fraud, anomalies, and suspicious patterns.
 * AI only flags for review — never accuses directly.
 */
export async function detectAnomalies(branchId, dateRange) {
  const result = await invokeAi('anomaly_detection', {
    branch_id: branchId,
    date_from: dateRange?.from,
    date_to: dateRange?.to,
  })

  if (result.success && result.data?.anomalies) {
    result.data.anomalies = result.data.anomalies.filter(
      (a) => validateAnomaly(a).valid
    )
  }

  return result
}

// ── Report Assistant ─────────────────────────────────────────────────────────

/**
 * Ask a natural language question about business data.
 * Data is pre-fetched and scoped by RBAC before sending to Gemini.
 */
export async function askReportAssistant(question, branchId, moduleContext) {
  const result = await invokeAi('report_assistant', {
    question,
    branch_id: branchId,
    module_context: moduleContext,
  })

  if (result.success && result.data) {
    const validation = validateReportSummary(result.data)
    if (!validation.valid) {
      return getAiFallbackResponse(moduleContext, 'report_assistant')
    }
  }

  return result
}

// ── Chat Assistant ───────────────────────────────────────────────────────────

/**
 * Send a message to the AI chat assistant.
 * The assistant cannot execute destructive actions.
 */
export async function sendChatMessage(message, conversationHistory = [], branchId, moduleContext) {
  const result = await invokeAi('chat_assistant', {
    message,
    conversation_history: conversationHistory.slice(-10), // Keep last 10 messages
    branch_id: branchId,
    module_context: moduleContext,
  })

  if (result.success && result.data) {
    const validation = validateChatResponse(result.data)
    if (!validation.valid) {
      return {
        success: true,
        data: {
          message: 'I was unable to process that request safely. Please try rephrasing.',
          disclaimer: 'AI suggestion — verify before taking action.',
        },
      }
    }
  }

  return result
}

// ── Insight Management ───────────────────────────────────────────────────────

/**
 * Fetch stored AI insights from the database.
 */
export async function fetchInsights(filters = {}) {
  let query = supabase
    .from('ai_insights')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.module) query = query.eq('module', filters.module)
  if (filters.severity) query = query.eq('severity', filters.severity)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.branch_id) query = query.eq('branch_id', filters.branch_id)
  query = query.limit(filters.limit || 100)

  const { data, error } = await query
  if (error) {
    console.error('[AI Service] Failed to fetch insights:', error)
    return []
  }
  return data || []
}

/**
 * Update insight status (acknowledge, action, dismiss).
 */
export async function updateInsightStatus(insightId, status, reviewedBy) {
  const { error } = await supabase
    .from('ai_insights')
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', insightId)

  if (error) {
    console.error('[AI Service] Failed to update insight:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ── Recommendation Management ────────────────────────────────────────────────

/**
 * Fetch stored AI recommendations.
 */
export async function fetchRecommendations(filters = {}) {
  let query = supabase
    .from('ai_recommendations')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.module) query = query.eq('module', filters.module)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.branch_id) query = query.eq('branch_id', filters.branch_id)
  query = query.limit(filters.limit || 100)

  const { data, error } = await query
  if (error) return []
  return data || []
}

/**
 * Approve or reject a recommendation.
 */
export async function reviewRecommendation(recommendationId, action, userId, rejectionReason) {
  const update = action === 'approved'
    ? { status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }
    : { status: 'rejected', rejected_by: userId, rejected_at: new Date().toISOString(), rejection_reason: rejectionReason }

  const { error } = await supabase
    .from('ai_recommendations')
    .update(update)
    .eq('id', recommendationId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Anomaly Management ───────────────────────────────────────────────────────

/**
 * Fetch stored anomaly events.
 */
export async function fetchAnomalies(filters = {}) {
  let query = supabase
    .from('ai_anomaly_events')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.module) query = query.eq('module', filters.module)
  if (filters.severity) query = query.eq('severity', filters.severity)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.branch_id) query = query.eq('branch_id', filters.branch_id)
  query = query.limit(filters.limit || 100)

  const { data, error } = await query
  if (error) return []
  return data || []
}

/**
 * Update anomaly status after review.
 */
export async function reviewAnomaly(anomalyId, status, reviewedBy) {
  const { error } = await supabase
    .from('ai_anomaly_events')
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', anomalyId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Forecast Management ──────────────────────────────────────────────────────

/**
 * Fetch stored forecasts.
 */
export async function fetchForecasts(filters = {}) {
  let query = supabase
    .from('ai_forecasts')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters.forecast_type) query = query.eq('forecast_type', filters.forecast_type)
  if (filters.branch_id) query = query.eq('branch_id', filters.branch_id)
  query = query.limit(filters.limit || 100)

  const { data, error } = await query
  if (error) return []
  return data || []
}

// ── Dashboard Summary ────────────────────────────────────────────────────────

/**
 * Get AI dashboard summary counts.
 */
export async function getAiDashboardSummary(branchId) {
  try {
    const [insights, recommendations, anomalies] = await Promise.all([
      supabase.from('ai_insights').select('id, severity, status', { count: 'exact' }).eq('status', 'new').eq('branch_id', branchId),
      supabase.from('ai_recommendations').select('id', { count: 'exact' }).eq('status', 'pending'),
      supabase.from('ai_anomaly_events').select('id, severity', { count: 'exact' }).eq('status', 'open').eq('branch_id', branchId),
    ])

    return {
      total_insights: insights.count || 0,
      critical_count: (insights.data || []).filter((i) => i.severity === 'critical' || i.severity === 'high').length,
      pending_recommendations: recommendations.count || 0,
      active_anomalies: anomalies.count || 0,
    }
  } catch {
    return { total_insights: 0, critical_count: 0, pending_recommendations: 0, active_anomalies: 0 }
  }
}
