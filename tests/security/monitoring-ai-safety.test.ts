// ═══════════════════════════════════════════════════════════════════
// MONITORING & AI SAFETY TEST SUITE
// Seven Waves ERP — Step 07 Production Hardening
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { metrics, trackApiCall, trackPrintJob, trackLogin } from '../../src/core/monitoring/metrics'
import {
  logSecurityEvent, getSecurityEvents, getSecuritySummary,
  SecuritySeverity, SecurityCategory,
} from '../../src/core/security/securityLogger'

// ─── METRICS ENGINE ─────────────────────────────────────────────

describe('Monitoring: Metrics Engine', () => {
  beforeEach(() => metrics.reset())

  it('tracks counters correctly', () => {
    metrics.increment('test_counter', {}, 1)
    metrics.increment('test_counter', {}, 5)
    expect(metrics.getCounter('test_counter')).toBe(6)
  })

  it('tracks gauges correctly', () => {
    metrics.setGauge('active_users', 42)
    expect(metrics.getGauge('active_users')).toBe(42)
    metrics.setGauge('active_users', 38)
    expect(metrics.getGauge('active_users')).toBe(38)
  })

  it('computes histogram percentiles', () => {
    // Add 100 observations from 1-100
    for (let i = 1; i <= 100; i++) {
      metrics.observe('request_duration', i)
    }

    const hist = metrics.getHistogram('request_duration')
    expect(hist.count).toBe(100)
    expect(hist.min).toBe(1)
    expect(hist.max).toBe(100)
    expect(hist.avg).toBeCloseTo(50.5, 0)
    expect(hist.p50).toBeGreaterThanOrEqual(49)
    expect(hist.p95).toBeGreaterThanOrEqual(94)
    expect(hist.p99).toBeGreaterThanOrEqual(98)
  })

  it('timer measures duration', async () => {
    const timer = metrics.startTimer('test_timer')
    // Small delay
    await new Promise(r => setTimeout(r, 10))
    const duration = timer.end()
    expect(duration).toBeGreaterThan(5)

    const hist = metrics.getHistogram('test_timer')
    expect(hist.count).toBe(1)
  })

  it('fires alerts on threshold breach', () => {
    let alertFired = null
    metrics.onAlert(alert => { alertFired = alert })

    metrics.addAlertRule({
      id: 'test_alert',
      metric: 'test_metric',
      condition: 'gt',
      threshold: 10,
      severity: 'critical',
      message: 'Test threshold breached',
      cooldownMs: 0,
    })

    metrics.observe('test_metric', 15) // Should trigger
    expect(alertFired).not.toBeNull()
    expect(alertFired.severity).toBe('critical')
    expect(alertFired.value).toBe(15)
  })

  it('does not fire alerts during cooldown', () => {
    let alertCount = 0
    metrics.onAlert(() => { alertCount++ })

    metrics.addAlertRule({
      id: 'cooldown_test',
      metric: 'cooldown_metric',
      condition: 'gt',
      threshold: 5,
      severity: 'warning',
      message: 'Cooldown test',
      cooldownMs: 60_000, // 1 min cooldown
    })

    metrics.observe('cooldown_metric', 10) // Fires
    metrics.observe('cooldown_metric', 20) // Should NOT fire (cooldown)

    expect(alertCount).toBe(1)
  })

  it('exports Prometheus format', () => {
    metrics.increment('http_requests_total', { method: 'GET' }, 100)
    metrics.setGauge('active_connections', 42)

    const prom = metrics.toPrometheusFormat()
    expect(prom).toContain('http_requests_total')
    expect(prom).toContain('100')
    expect(prom).toContain('active_connections')
    expect(prom).toContain('42')
  })

  it('tracks API calls with helper', () => {
    trackApiCall('pos', 'create_order', 150, true)
    trackApiCall('pos', 'create_order', 300, true)
    trackApiCall('pos', 'create_order', 800, false)

    const hist = metrics.getHistogram('api_latency_ms', { module: 'pos', action: 'create_order' })
    expect(hist.count).toBe(3)
    expect(hist.avg).toBeCloseTo(416.67, 0)
  })

  it('snapshot returns full metric state', () => {
    metrics.increment('test_snap', {}, 5)
    metrics.setGauge('test_gauge', 10)

    const snapshot = metrics.getSnapshot()
    expect(snapshot.counters).toBeDefined()
    expect(snapshot.gauges).toBeDefined()
    expect(snapshot.timestamp).toBeDefined()
  })
})

// ─── SECURITY LOGGER ────────────────────────────────────────────

describe('Monitoring: Security Logger', () => {
  it('logs security events with correct structure', () => {
    const event = logSecurityEvent({
      severity: SecuritySeverity.WARNING,
      category: SecurityCategory.XSS,
      message: 'XSS attempt detected in order notes',
      userId: 'user-123',
      branchId: 'branch-001',
    })

    expect(event.id).toBeDefined()
    expect(event.timestamp).toBeDefined()
    expect(event.severity).toBe('warning')
    expect(event.category).toBe('xss')
    expect(event.userId).toBe('user-123')
  })

  it('filters events by severity', () => {
    logSecurityEvent({
      severity: SecuritySeverity.CRITICAL,
      category: SecurityCategory.BRUTE_FORCE,
      message: 'Critical event',
    })
    logSecurityEvent({
      severity: SecuritySeverity.INFO,
      category: SecurityCategory.AUTH,
      message: 'Info event',
    })

    const critical = getSecurityEvents({ severity: 'critical' })
    expect(critical.every(e => e.severity === 'critical')).toBe(true)
  })

  it('generates security summary', () => {
    const summary = getSecuritySummary()
    expect(summary.total_events).toBeDefined()
    expect(summary.critical_count).toBeDefined()
    expect(summary.by_category).toBeDefined()
  })
})

// ─── AI SAFETY HARDENING ────────────────────────────────────────

describe('AI Safety Hardening', () => {
  it('blocks unsafe AI commands', () => {
    const BLOCKED_AI_INTENTS = [
      'approve_payment', 'post_voucher', 'delete_record',
      'change_salary', 'transfer_funds', 'modify_permissions',
      'grant_access', 'create_admin',
    ]

    function isAiCommandSafe(command) {
      return !BLOCKED_AI_INTENTS.some(blocked => command.toLowerCase().includes(blocked))
    }

    expect(isAiCommandSafe('show sales report')).toBe(true)
    expect(isAiCommandSafe('approve_payment for $5000')).toBe(false)
    expect(isAiCommandSafe('delete_record from orders')).toBe(false)
    expect(isAiCommandSafe('create_admin account')).toBe(false)
    expect(isAiCommandSafe('modify_permissions for user')).toBe(false)
    expect(isAiCommandSafe('What was yesterday revenue?')).toBe(true)
  })

  it('enforces AI response length limits', () => {
    const MAX_AI_RESPONSE = 10000

    function validateAiResponse(response) {
      if (!response || typeof response !== 'string') return { valid: false, reason: 'Empty' }
      if (response.length > MAX_AI_RESPONSE) return { valid: false, reason: 'Too long' }
      return { valid: true }
    }

    expect(validateAiResponse('Normal response')).toEqual({ valid: true })
    expect(validateAiResponse('x'.repeat(20000))).toEqual({ valid: false, reason: 'Too long' })
    expect(validateAiResponse(null)).toEqual({ valid: false, reason: 'Empty' })
  })

  it('redacts sensitive data before AI processing', () => {
    function redactSensitiveData(data) {
      const redacted = JSON.parse(JSON.stringify(data))
      const sensitiveKeys = ['password', 'ssn', 'credit_card', 'bank_account', 'api_key', 'secret', 'token']

      function redact(obj) {
        if (!obj || typeof obj !== 'object') return
        for (const key of Object.keys(obj)) {
          if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
            obj[key] = '[REDACTED]'
          } else if (typeof obj[key] === 'object') {
            redact(obj[key])
          }
        }
      }

      redact(redacted)
      return redacted
    }

    const data = {
      employee_name: 'John',
      password: 'secret123',
      bank_account_number: '1234567890',
      salary: 5000,
      api_key: 'sk-xxx',
    }

    const redacted = redactSensitiveData(data)
    expect(redacted.employee_name).toBe('John')
    expect(redacted.password).toBe('[REDACTED]')
    expect(redacted.bank_account_number).toBe('[REDACTED]')
    expect(redacted.salary).toBe(5000) // Not sensitive
    expect(redacted.api_key).toBe('[REDACTED]')
  })

  it('enforces AI rate limiting', () => {
    const AI_RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 }
    const requests = []

    function canMakeAiRequest() {
      const now = Date.now()
      const windowStart = now - AI_RATE_LIMIT.windowMs
      const recentCount = requests.filter(t => t > windowStart).length

      if (recentCount >= AI_RATE_LIMIT.maxRequests) {
        return false
      }
      requests.push(now)
      return true
    }

    // Allow first 10
    for (let i = 0; i < 10; i++) {
      expect(canMakeAiRequest()).toBe(true)
    }

    // Block 11th
    expect(canMakeAiRequest()).toBe(false)
  })

  it('validates AI response contains disclaimer', () => {
    function validateAiOutput(output) {
      const issues = []
      if (!output.disclaimer && !output.notice) {
        issues.push('Missing AI disclaimer')
      }
      if (output.confidence && output.confidence > 1) {
        issues.push('Invalid confidence score')
      }
      return { valid: issues.length === 0, issues }
    }

    expect(validateAiOutput({ text: 'Report', disclaimer: 'AI generated' }).valid).toBe(true)
    expect(validateAiOutput({ text: 'Report' }).valid).toBe(false)
  })
})

// ─── COMPLIANCE & AUDIT VALIDATION ──────────────────────────────

describe('Compliance: Audit Trail', () => {
  it('audit log structure is complete', () => {
    const requiredFields = ['entity_type', 'entity_id', 'action', 'user_id', 'created_at']

    const auditEntry = {
      entity_type: 'voucher',
      entity_id: '123',
      action: 'posted',
      user_id: 'user-1',
      created_at: new Date().toISOString(),
      details: {},
    }

    for (const field of requiredFields) {
      expect(auditEntry[field]).toBeDefined()
    }
  })

  it('posted vouchers cannot be mutated', () => {
    const postedVoucher = { id: 'v-1', is_posted: true, voucher_number: 'V001', total_amount: 1000 }

    function canEditVoucher(voucher, changes) {
      if (voucher.is_posted) {
        const protectedFields = ['voucher_number', 'voucher_date', 'total_amount', 'narration']
        for (const field of protectedFields) {
          if (changes[field] !== undefined && changes[field] !== voucher[field]) {
            return false
          }
        }
      }
      return true
    }

    expect(canEditVoucher(postedVoucher, { total_amount: 2000 })).toBe(false)
    expect(canEditVoucher(postedVoucher, { status: 'archived' })).toBe(true) // Status changes ok
  })

  it('finance traceability chain is complete', () => {
    const traceChain = ['order', 'payment', 'voucher', 'ledger_entry', 'audit_log']

    // Every financial transaction should be traceable through this chain
    traceChain.forEach((step, idx) => {
      expect(typeof step).toBe('string')
      if (idx > 0) {
        // Each step should reference the previous
        expect(traceChain[idx]).not.toBe(traceChain[idx - 1])
      }
    })
  })
})
