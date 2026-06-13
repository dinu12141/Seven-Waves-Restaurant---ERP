// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Module Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

export type AiModule = 'sales' | 'inventory' | 'procurement' | 'kitchen' | 'hr' | 'finance' | 'customer' | 'security' | 'operations'

export type AiSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type AiInsightStatus = 'new' | 'viewed' | 'acknowledged' | 'actioned' | 'dismissed'

export type AiRecommendationStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type AiAnomalyStatus = 'open' | 'investigating' | 'confirmed' | 'false_positive' | 'resolved'

export type AiForecastType = 'daily_sales' | 'weekly_sales' | 'category_sales' | 'ingredient_demand' | 'stock_depletion' | 'peak_hour' | 'staff_demand'

export type AiAnomalyType = 'unusual_refund' | 'frequent_void' | 'suspicious_discount' | 'drawer_mismatch' | 'stock_adjustment' | 'payroll_anomaly' | 'supplier_price' | 'login_anomaly'

export type AiRecommendationType = 'reorder' | 'staffing' | 'menu_optimization' | 'cost_reduction' | 'pricing' | 'procurement' | 'scheduling'

// ── Database Row Types ───────────────────────────────────────────────────────

export interface AiInsight {
  id: string
  company_id?: string
  branch_id?: string
  module: AiModule
  insight_type: string
  title: string
  summary: string
  recommendation?: string
  severity: AiSeverity
  confidence_score: number
  source_data_range?: string
  model_name: string
  prompt_version: string
  status: AiInsightStatus
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  expires_at?: string
}

export interface AiForecast {
  id: string
  company_id?: string
  branch_id?: string
  forecast_type: AiForecastType
  target_entity: string
  target_id?: string
  forecast_period: string
  predicted_value: number
  confidence_low: number
  confidence_high: number
  confidence_score: number
  model_name: string
  source_snapshot?: Record<string, unknown>
  created_at: string
}

export interface AiRecommendation {
  id: string
  company_id?: string
  branch_id?: string
  module: AiModule
  recommendation_type: AiRecommendationType
  title: string
  description: string
  suggested_action: string
  impact_level: AiSeverity
  confidence_score: number
  status: AiRecommendationStatus
  approved_by?: string
  approved_at?: string
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  created_at: string
}

export interface AiPromptLog {
  id: string
  company_id?: string
  branch_id?: string
  user_id: string
  module: AiModule
  prompt_type: string
  sanitized_prompt_hash: string
  input_summary: string
  output_summary: string
  model_name: string
  token_input: number
  token_output: number
  latency_ms: number
  success: boolean
  error_message?: string
  created_at: string
}

export interface AiAnomalyEvent {
  id: string
  company_id?: string
  branch_id?: string
  module: AiModule
  anomaly_type: AiAnomalyType
  entity_type: string
  entity_id?: string
  severity: AiSeverity
  score: number
  explanation: string
  suggested_review_action: string
  status: AiAnomalyStatus
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
}

// ── API Request/Response Types ───────────────────────────────────────────────

export interface AiGenerateRequest {
  module: AiModule
  prompt_type: string
  context?: Record<string, unknown>
  branch_id?: string
  date_from?: string
  date_to?: string
}

export interface AiGenerateResponse {
  success: boolean
  data?: {
    insights?: AiInsight[]
    forecasts?: AiForecast[]
    recommendations?: AiRecommendation[]
    anomalies?: AiAnomalyEvent[]
    chat_response?: string
    report_summary?: string
  }
  prompt_log_id?: string
  error?: string
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: {
    module?: AiModule
    confidence?: number
    sources?: string[]
  }
}

export interface AiChatRequest {
  message: string
  conversation_history?: AiChatMessage[]
  module_context?: AiModule
  branch_id?: string
}

export interface AiChatResponse {
  success: boolean
  message: string
  suggestions?: string[]
  data_references?: Array<{ type: string; label: string; value: string }>
  confidence?: number
  disclaimer: string
}

// ── Dashboard Widget Types ───────────────────────────────────────────────────

export interface AiDashboardSummary {
  total_insights: number
  critical_count: number
  pending_recommendations: number
  active_anomalies: number
  last_scan_at?: string
  modules_scanned: AiModule[]
}

export interface AiInsightCard {
  insight: AiInsight
  actions: Array<{
    label: string
    action: 'acknowledge' | 'action' | 'dismiss'
    color: string
  }>
}
