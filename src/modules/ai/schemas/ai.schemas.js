// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — AI Response Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════
// Runtime validation for all Gemini API responses to prevent unsafe/invalid output.

const VALID_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical']
const VALID_MODULES = ['sales', 'inventory', 'procurement', 'kitchen', 'hr', 'finance', 'customer', 'security', 'operations']

/**
 * Validates that a value is a non-empty string.
 */
function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0
}

/**
 * Validates that a value is a number between 0 and 1.
 */
function isConfidenceScore(val) {
  return typeof val === 'number' && val >= 0 && val <= 1
}

/**
 * Validates an AI Insight object from Gemini response.
 */
export function validateInsight(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (!isNonEmptyString(obj.title)) errors.push('missing title')
  if (!isNonEmptyString(obj.summary)) errors.push('missing summary')
  if (!VALID_SEVERITIES.includes(obj.severity)) errors.push(`invalid severity: ${obj.severity}`)
  if (!isConfidenceScore(obj.confidence_score)) errors.push(`invalid confidence_score: ${obj.confidence_score}`)
  if (!VALID_MODULES.includes(obj.module)) errors.push(`invalid module: ${obj.module}`)

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Validates an AI Forecast object.
 */
export function validateForecast(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (typeof obj.predicted_value !== 'number') errors.push('missing predicted_value')
  if (typeof obj.confidence_low !== 'number') errors.push('missing confidence_low')
  if (typeof obj.confidence_high !== 'number') errors.push('missing confidence_high')
  if (!isConfidenceScore(obj.confidence_score)) errors.push('invalid confidence_score')
  if (!isNonEmptyString(obj.forecast_period)) errors.push('missing forecast_period')
  if (obj.confidence_low > obj.confidence_high) errors.push('confidence_low > confidence_high')

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Validates an AI Recommendation object.
 */
export function validateRecommendation(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (!isNonEmptyString(obj.title)) errors.push('missing title')
  if (!isNonEmptyString(obj.description)) errors.push('missing description')
  if (!isNonEmptyString(obj.suggested_action)) errors.push('missing suggested_action')
  if (!VALID_SEVERITIES.includes(obj.impact_level)) errors.push(`invalid impact_level: ${obj.impact_level}`)
  if (!isConfidenceScore(obj.confidence_score)) errors.push('invalid confidence_score')

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Validates an AI Anomaly object.
 */
export function validateAnomaly(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (!isNonEmptyString(obj.anomaly_type)) errors.push('missing anomaly_type')
  if (!isNonEmptyString(obj.explanation)) errors.push('missing explanation')
  if (!isNonEmptyString(obj.suggested_review_action)) errors.push('missing suggested_review_action')
  if (!VALID_SEVERITIES.includes(obj.severity)) errors.push(`invalid severity: ${obj.severity}`)
  if (typeof obj.score !== 'number' || obj.score < 0 || obj.score > 1) errors.push('invalid score')

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Validates an AI Chat Response.
 */
export function validateChatResponse(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (!isNonEmptyString(obj.message)) errors.push('missing message')

  // Check for forbidden content in chat responses
  const forbidden = ['DELETE FROM', 'DROP TABLE', 'UPDATE SET', 'INSERT INTO', 'TRUNCATE']
  for (const keyword of forbidden) {
    if (typeof obj.message === 'string' && obj.message.toUpperCase().includes(keyword)) {
      errors.push(`response contains forbidden SQL keyword: ${keyword}`)
    }
  }

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Validates a Report Summary response.
 */
export function validateReportSummary(obj) {
  if (!obj || typeof obj !== 'object') return { valid: false, error: 'Not an object' }

  const errors = []
  if (!isNonEmptyString(obj.summary)) errors.push('missing summary')
  if (!Array.isArray(obj.key_metrics)) errors.push('missing key_metrics array')

  return errors.length === 0
    ? { valid: true, data: obj }
    : { valid: false, error: errors.join('; ') }
}

/**
 * Safely parses a JSON string from AI response with validation.
 * Returns null if parsing or validation fails.
 */
export function safeParseAiJson(jsonStr, validator) {
  try {
    // Handle markdown-wrapped JSON (```json ... ```)
    let cleaned = jsonStr
    if (typeof cleaned === 'string') {
      cleaned = cleaned.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
    }

    const parsed = JSON.parse(cleaned)
    if (validator) {
      const result = validator(parsed)
      return result.valid ? result.data : null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Fallback response when AI fails or returns invalid data.
 */
export function getAiFallbackResponse(module, promptType) {
  return {
    success: false,
    error: 'AI analysis could not be completed. Please try again later.',
    fallback: true,
    module,
    prompt_type: promptType,
    disclaimer: 'This is a system fallback — no AI analysis was performed.',
  }
}
