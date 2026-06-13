// ═══════════════════════════════════════════════════════════════════
// MONITORING ENGINE — Observability, Metrics & Alerting
// Seven Waves ERP — Step 07 Production Hardening
// ═══════════════════════════════════════════════════════════════════

import { logger } from '../logging/logger'

// ─── Metric Types ───────────────────────────────────────────────

class MetricCollector {
  constructor() {
    this.counters = new Map()
    this.gauges = new Map()
    this.histograms = new Map()
    this.timers = new Map()
    this.alerts = []
    this.alertRules = []
    this.listeners = []
  }

  // ─── Counter: monotonically increasing ─────────────────────────

  increment(name, labels = {}, value = 1) {
    const key = this._key(name, labels)
    const current = this.counters.get(key) || { name, labels, value: 0, updatedAt: null }
    current.value += value
    current.updatedAt = Date.now()
    this.counters.set(key, current)
    this._checkAlerts(name, current.value, labels)
  }

  getCounter(name, labels = {}) {
    return this.counters.get(this._key(name, labels))?.value || 0
  }

  // ─── Gauge: current value ─────────────────────────────────────

  setGauge(name, value, labels = {}) {
    const key = this._key(name, labels)
    this.gauges.set(key, { name, labels, value, updatedAt: Date.now() })
    this._checkAlerts(name, value, labels)
  }

  getGauge(name, labels = {}) {
    return this.gauges.get(this._key(name, labels))?.value || 0
  }

  // ─── Histogram: distribution tracking ─────────────────────────

  observe(name, value, labels = {}) {
    const key = this._key(name, labels)
    let hist = this.histograms.get(key)
    if (!hist) {
      hist = { name, labels, values: [], count: 0, sum: 0, min: Infinity, max: -Infinity }
      this.histograms.set(key, hist)
    }

    hist.values.push(value)
    hist.count++
    hist.sum += value
    hist.min = Math.min(hist.min, value)
    hist.max = Math.max(hist.max, value)

    // Keep last 1000 observations
    if (hist.values.length > 1000) hist.values.shift()

    this._checkAlerts(name, value, labels)
  }

  getHistogram(name, labels = {}) {
    const hist = this.histograms.get(this._key(name, labels))
    if (!hist) return null

    const sorted = [...hist.values].sort((a, b) => a - b)
    return {
      count: hist.count,
      sum: hist.sum,
      avg: hist.sum / hist.count,
      min: hist.min,
      max: hist.max,
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    }
  }

  // ─── Timer: measure operation duration ────────────────────────

  startTimer(name, labels = {}) {
    const start = performance.now()
    return {
      end: () => {
        const duration = performance.now() - start
        this.observe(name, duration, labels)
        return duration
      },
    }
  }

  // ─── Alert Rules ──────────────────────────────────────────────

  addAlertRule(rule) {
    this.alertRules.push({
      id: rule.id || `rule-${Date.now()}`,
      metric: rule.metric,
      condition: rule.condition, // 'gt' | 'lt' | 'eq'
      threshold: rule.threshold,
      severity: rule.severity || 'warning',
      message: rule.message || `Alert on ${rule.metric}`,
      cooldownMs: rule.cooldownMs || 300_000, // 5 min default
      lastFired: 0,
    })
  }

  _checkAlerts(metric, value, labels) {
    const now = Date.now()
    for (const rule of this.alertRules) {
      if (rule.metric !== metric) continue
      if (now - rule.lastFired < rule.cooldownMs) continue

      let triggered = false
      if (rule.condition === 'gt' && value > rule.threshold) triggered = true
      if (rule.condition === 'lt' && value < rule.threshold) triggered = true
      if (rule.condition === 'eq' && value === rule.threshold) triggered = true

      if (triggered) {
        rule.lastFired = now
        const alert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ruleId: rule.id,
          metric,
          value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: rule.message,
          labels,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        }
        this.alerts.unshift(alert)
        if (this.alerts.length > 200) this.alerts.pop()

        logger.warn(`[Monitor] ALERT: ${rule.message}`, { metric, value, threshold: rule.threshold })
        this.listeners.forEach(fn => fn(alert))
      }
    }
  }

  // ─── Subscribe to alerts ──────────────────────────────────────

  onAlert(callback) {
    this.listeners.push(callback)
    return () => {
      const idx = this.listeners.indexOf(callback)
      if (idx >= 0) this.listeners.splice(idx, 1)
    }
  }

  // ─── Dashboard Snapshot ───────────────────────────────────────

  getSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      counters: {},
      gauges: {},
      histograms: {},
      activeAlerts: this.alerts.filter(a => !a.acknowledged).length,
    }

    for (const [key, c] of this.counters) snapshot.counters[key] = c.value
    for (const [key, g] of this.gauges) snapshot.gauges[key] = g.value
    for (const [key] of this.histograms) snapshot.histograms[key] = this.getHistogram(key)

    return snapshot
  }

  // ─── Prometheus-compatible export ─────────────────────────────

  toPrometheusFormat() {
    const lines = []

    for (const [, c] of this.counters) {
      const labelsStr = this._labelsToString(c.labels)
      lines.push(`# TYPE ${c.name} counter`)
      lines.push(`${c.name}${labelsStr} ${c.value}`)
    }

    for (const [, g] of this.gauges) {
      const labelsStr = this._labelsToString(g.labels)
      lines.push(`# TYPE ${g.name} gauge`)
      lines.push(`${g.name}${labelsStr} ${g.value}`)
    }

    for (const [key, h] of this.histograms) {
      const stats = this.getHistogram(key)
      if (!stats) continue
      lines.push(`# TYPE ${h.name} histogram`)
      lines.push(`${h.name}_count ${stats.count}`)
      lines.push(`${h.name}_sum ${stats.sum.toFixed(2)}`)
      lines.push(`${h.name}_avg ${stats.avg.toFixed(2)}`)
      lines.push(`${h.name}_p95 ${stats.p95.toFixed(2)}`)
      lines.push(`${h.name}_p99 ${stats.p99.toFixed(2)}`)
    }

    return lines.join('\n')
  }

  // ─── Internals ────────────────────────────────────────────────

  _key(name, labels) {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',')
    return labelStr ? `${name}{${labelStr}}` : name
  }

  _labelsToString(labels) {
    const entries = Object.entries(labels)
    if (entries.length === 0) return ''
    return `{${entries.map(([k, v]) => `${k}="${v}"`).join(',')}}`
  }

  /**
   * Reset all metrics (for testing).
   */
  reset() {
    this.counters.clear()
    this.gauges.clear()
    this.histograms.clear()
    this.alerts = []
  }
}

// ─── Singleton ──────────────────────────────────────────────────

export const metrics = new MetricCollector()

// ─── Default Alert Rules ────────────────────────────────────────

metrics.addAlertRule({ id: 'api_error_rate', metric: 'api_errors_total', condition: 'gt', threshold: 50, severity: 'critical', message: 'High API error rate (>50 in window)' })
metrics.addAlertRule({ id: 'api_latency_p95', metric: 'api_latency_ms', condition: 'gt', threshold: 5000, severity: 'warning', message: 'API latency P95 exceeds 5s' })
metrics.addAlertRule({ id: 'ws_disconnects', metric: 'websocket_disconnects', condition: 'gt', threshold: 20, severity: 'warning', message: 'Excessive WebSocket disconnects (>20)' })
metrics.addAlertRule({ id: 'print_failures', metric: 'print_failures_total', condition: 'gt', threshold: 10, severity: 'critical', message: 'High print failure rate (>10)' })
metrics.addAlertRule({ id: 'sync_failures', metric: 'offline_sync_failures', condition: 'gt', threshold: 5, severity: 'warning', message: 'Offline sync failures (>5)' })
metrics.addAlertRule({ id: 'voucher_failures', metric: 'voucher_post_failures', condition: 'gt', threshold: 3, severity: 'critical', message: 'Voucher posting failures (>3)' })
metrics.addAlertRule({ id: 'ai_failures', metric: 'ai_request_failures', condition: 'gt', threshold: 5, severity: 'warning', message: 'AI service failures (>5)' })
metrics.addAlertRule({ id: 'device_offline', metric: 'devices_offline_count', condition: 'gt', threshold: 5, severity: 'warning', message: 'Too many devices offline (>5)' })
metrics.addAlertRule({ id: 'login_failures', metric: 'login_failures_total', condition: 'gt', threshold: 10, severity: 'critical', message: 'Excessive login failures (>10)' })

// ─── Pre-built metric helpers ───────────────────────────────────

export function trackApiCall(module, action, durationMs, success) {
  metrics.observe('api_latency_ms', durationMs, { module, action })
  metrics.increment(success ? 'api_success_total' : 'api_errors_total', { module, action })
}

export function trackWebSocket(event, channel) {
  metrics.increment(`websocket_${event}`, { channel })
}

export function trackPrintJob(status, printerType) {
  metrics.increment(`print_${status}_total`, { type: printerType })
  if (status === 'failed') metrics.increment('print_failures_total', { type: printerType })
}

export function trackOfflineSync(status) {
  metrics.increment(`offline_sync_${status}`)
  if (status === 'failed') metrics.increment('offline_sync_failures')
}

export function trackAiRequest(action, success, durationMs) {
  metrics.observe('ai_request_duration_ms', durationMs, { action })
  if (!success) metrics.increment('ai_request_failures', { action })
}

export function trackLogin(success) {
  metrics.increment(success ? 'login_success_total' : 'login_failures_total')
}
