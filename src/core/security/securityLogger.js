// ═══════════════════════════════════════════════════════════════════
// SECURITY LOGGER — Centralized Security Event Pipeline
// Seven Waves ERP — Step 07 Production Hardening
// ═══════════════════════════════════════════════════════════════════

import { logger } from '../logging/logger'
import { supabase } from 'src/boot/supabase'

/**
 * Security event severity levels.
 */
export const SecuritySeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  ALERT: 'alert',
}

/**
 * Security event categories.
 */
export const SecurityCategory = {
  AUTH: 'auth',
  XSS: 'xss',
  INJECTION: 'injection',
  RATE_LIMIT: 'rate_limit',
  BRUTE_FORCE: 'brute_force',
  IMPOSSIBLE_TRAVEL: 'impossible_travel',
  SESSION_ANOMALY: 'session_anomaly',
  PERMISSION: 'permission',
  DATA_TAMPERING: 'data_tampering',
  AI_ABUSE: 'ai_abuse',
  DEVICE_SECURITY: 'device_security',
  QR_FORGERY: 'qr_forgery',
  PAYLOAD_OVERFLOW: 'payload_overflow',
}

const MAX_SECURITY_BUFFER = 500
const securityBuffer = []
const securityListeners = []

/**
 * Log a security event.
 */
export function logSecurityEvent(event) {
  const entry = {
    id: crypto.randomUUID?.() || `sec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    severity: event.severity || SecuritySeverity.WARNING,
    category: event.category || SecurityCategory.AUTH,
    message: event.message,
    userId: event.userId || null,
    branchId: event.branchId || null,
    ipAddress: event.ipAddress || null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    metadata: event.metadata || {},
    correlationId: event.correlationId || null,
  }

  // Buffer the event
  securityBuffer.unshift(entry)
  if (securityBuffer.length > MAX_SECURITY_BUFFER) securityBuffer.pop()

  // Log to main logger
  const logFn = entry.severity === SecuritySeverity.CRITICAL || entry.severity === SecuritySeverity.ALERT
    ? 'error'
    : entry.severity === SecuritySeverity.WARNING
      ? 'warn'
      : 'info'

  logger[logFn](`[SECURITY:${entry.category}] ${entry.message}`, {
    severity: entry.severity,
    userId: entry.userId,
    ...entry.metadata,
  })

  // Notify listeners (for admin alerts dashboard)
  securityListeners.forEach(fn => fn(entry))

  // Auto-escalate critical events
  if (entry.severity === SecuritySeverity.CRITICAL || entry.severity === SecuritySeverity.ALERT) {
    escalateSecurityEvent(entry)
  }

  return entry
}

/**
 * Escalate a critical security event (persist to DB for admin review).
 */
async function escalateSecurityEvent(entry) {
  // Primary: persist to server-side audit log (tamper-resistant)
  try {
    await supabase.from('audit_logs').insert({
      user_id: entry.userId || null,
      action: `SECURITY:${entry.category}`,
      table_name: null,
      record_id: null,
      new_data: {
        severity: entry.severity,
        message: entry.message,
        metadata: entry.metadata,
        correlationId: entry.correlationId,
        userAgent: entry.userAgent,
      },
      severity: entry.severity,
    })
  } catch {
    // Silent fail — audit write must never crash the app
  }

  // Tertiary: Dispatch real-time alert via Telegram, Discord, and in-app banner
  try {
    import('./securityAlertService').then(({ securityAlertService }) => {
      securityAlertService.dispatchAlert({
        title: `${(entry.category || 'System').toUpperCase()} Security Event`,
        message: entry.message,
        severity: entry.severity,
        category: entry.category,
        metadata: entry.metadata,
      }).catch(() => {})
    }).catch(() => {})
  } catch {
    // Non-blocking alerting fail-safe
  }

  // Secondary: localStorage as offline fallback display cache only (not a security record)
  try {
    if (typeof localStorage !== 'undefined') {
      const escalated = JSON.parse(localStorage.getItem('sw_security_escalations') || '[]')
      escalated.unshift({
        ...entry,
        escalatedAt: new Date().toISOString(),
        synced: true,
      })
      localStorage.setItem('sw_security_escalations', JSON.stringify(escalated.slice(0, 100)))
    }
  } catch {
    // Silent fail
  }
}

/**
 * Subscribe to security events (for real-time admin dashboard).
 */
export function onSecurityEvent(callback) {
  securityListeners.push(callback)
  return () => {
    const idx = securityListeners.indexOf(callback)
    if (idx >= 0) securityListeners.splice(idx, 1)
  }
}

/**
 * Get buffered security events.
 */
export function getSecurityEvents(filters = {}) {
  let events = [...securityBuffer]

  if (filters.severity) events = events.filter(e => e.severity === filters.severity)
  if (filters.category) events = events.filter(e => e.category === filters.category)
  if (filters.userId) events = events.filter(e => e.userId === filters.userId)
  if (filters.since) {
    const since = new Date(filters.since).getTime()
    events = events.filter(e => new Date(e.timestamp).getTime() >= since)
  }

  return events
}

/**
 * Get security summary for dashboard.
 */
export function getSecuritySummary() {
  const now = Date.now()
  const last24h = securityBuffer.filter(e => now - new Date(e.timestamp).getTime() < 86400_000)

  return {
    total_events: last24h.length,
    critical_count: last24h.filter(e => e.severity === SecuritySeverity.CRITICAL).length,
    alert_count: last24h.filter(e => e.severity === SecuritySeverity.ALERT).length,
    warning_count: last24h.filter(e => e.severity === SecuritySeverity.WARNING).length,
    by_category: Object.entries(
      last24h.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]),
    top_users: Object.entries(
      last24h.filter(e => e.userId).reduce((acc, e) => { acc[e.userId] = (acc[e.userId] || 0) + 1; return acc }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 10),
  }
}

/**
 * Export security events as JSON for compliance reporting.
 */
export function exportSecurityEvents() {
  return JSON.stringify(securityBuffer, null, 2)
}

/**
 * Clear security buffer (admin action — logged).
 */
export function clearSecurityBuffer(userId) {
  logSecurityEvent({
    severity: SecuritySeverity.INFO,
    category: SecurityCategory.AUTH,
    message: `Security event buffer cleared by ${userId}`,
    userId,
  })
  securityBuffer.length = 0
}
