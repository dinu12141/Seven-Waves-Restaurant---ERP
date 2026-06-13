// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Step 05 AI Module Tests
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  validateInsight,
  validateForecast,
  validateRecommendation,
  validateAnomaly,
  validateChatResponse,
  validateReportSummary,
  safeParseAiJson,
  getAiFallbackResponse,
} from '../schemas/ai.schemas'

// ── Schema Validation Tests ──────────────────────────────────────────────────

describe('AI Schema Validation', () => {
  describe('validateInsight', () => {
    it('accepts valid insight', () => {
      const result = validateInsight({
        module: 'sales',
        insight_type: 'trend',
        title: 'Revenue is trending up',
        summary: 'Sales increased 15% compared to last week.',
        severity: 'medium',
        confidence_score: 0.85,
      })
      expect(result.valid).toBe(true)
    })

    it('rejects insight without title', () => {
      const result = validateInsight({
        module: 'sales',
        summary: 'Some summary',
        severity: 'low',
        confidence_score: 0.5,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing title')
    })

    it('rejects insight with invalid severity', () => {
      const result = validateInsight({
        module: 'sales',
        title: 'Test',
        summary: 'Test',
        severity: 'extreme',
        confidence_score: 0.5,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('invalid severity')
    })

    it('rejects insight with confidence > 1', () => {
      const result = validateInsight({
        module: 'sales',
        title: 'Test',
        summary: 'Test',
        severity: 'low',
        confidence_score: 1.5,
      })
      expect(result.valid).toBe(false)
    })

    it('rejects null input', () => {
      expect(validateInsight(null).valid).toBe(false)
      expect(validateInsight(undefined).valid).toBe(false)
    })
  })

  describe('validateForecast', () => {
    it('accepts valid forecast', () => {
      const result = validateForecast({
        predicted_value: 150000,
        confidence_low: 120000,
        confidence_high: 180000,
        confidence_score: 0.78,
        forecast_period: '2026-05-18',
      })
      expect(result.valid).toBe(true)
    })

    it('rejects forecast where low > high', () => {
      const result = validateForecast({
        predicted_value: 150000,
        confidence_low: 200000,
        confidence_high: 100000,
        confidence_score: 0.78,
        forecast_period: '2026-05-18',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('confidence_low > confidence_high')
    })
  })

  describe('validateRecommendation', () => {
    it('accepts valid recommendation', () => {
      const result = validateRecommendation({
        title: 'Reorder chicken stock',
        description: 'Stock will deplete in 2 days.',
        suggested_action: 'Create PO for 50kg chicken breast.',
        impact_level: 'high',
        confidence_score: 0.9,
      })
      expect(result.valid).toBe(true)
    })

    it('rejects recommendation without action', () => {
      const result = validateRecommendation({
        title: 'Test',
        description: 'Test desc',
        impact_level: 'low',
        confidence_score: 0.5,
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing suggested_action')
    })
  })

  describe('validateAnomaly', () => {
    it('accepts valid anomaly', () => {
      const result = validateAnomaly({
        anomaly_type: 'unusual_refund',
        explanation: 'Refund rate 3x above normal for this period.',
        suggested_review_action: 'Review refund transactions from cashier session #42.',
        severity: 'high',
        score: 0.87,
      })
      expect(result.valid).toBe(true)
    })

    it('rejects anomaly with score > 1', () => {
      const result = validateAnomaly({
        anomaly_type: 'unusual_refund',
        explanation: 'Test',
        suggested_review_action: 'Test',
        severity: 'high',
        score: 1.5,
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('validateChatResponse', () => {
    it('accepts valid chat response', () => {
      const result = validateChatResponse({
        message: 'Today\'s total sales are LKR 250,000.',
      })
      expect(result.valid).toBe(true)
    })

    it('rejects chat response with SQL injection', () => {
      const result = validateChatResponse({
        message: 'Sure! DELETE FROM orders WHERE id > 0',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('forbidden SQL keyword')
    })

    it('rejects chat response with DROP TABLE', () => {
      const result = validateChatResponse({
        message: 'You can DROP TABLE users to clean up.',
      })
      expect(result.valid).toBe(false)
    })
  })

  describe('validateReportSummary', () => {
    it('accepts valid report summary', () => {
      const result = validateReportSummary({
        summary: 'This week saw a 12% increase in revenue.',
        key_metrics: [{ label: 'Revenue', value: 'LKR 1.2M', trend: 'up' }],
      })
      expect(result.valid).toBe(true)
    })

    it('rejects report without key_metrics', () => {
      const result = validateReportSummary({
        summary: 'Some summary',
      })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing key_metrics')
    })
  })
})

// ── Safe JSON Parsing Tests ──────────────────────────────────────────────────

describe('safeParseAiJson', () => {
  it('parses valid JSON', () => {
    const result = safeParseAiJson('{"title": "test", "value": 42}')
    expect(result).toEqual({ title: 'test', value: 42 })
  })

  it('strips markdown code block wrappers', () => {
    const result = safeParseAiJson('```json\n{"title": "test"}\n```')
    expect(result).toEqual({ title: 'test' })
  })

  it('returns null for invalid JSON', () => {
    expect(safeParseAiJson('not json at all')).toBeNull()
  })

  it('applies validator when provided', () => {
    const result = safeParseAiJson(
      '{"title": "test", "summary": "s", "module": "sales", "severity": "low", "confidence_score": 0.8}',
      validateInsight
    )
    expect(result).toBeTruthy()
    expect(result.title).toBe('test')
  })

  it('returns null when validator fails', () => {
    const result = safeParseAiJson(
      '{"title": "test"}',
      validateInsight
    )
    expect(result).toBeNull()
  })
})

// ── Fallback Response Tests ──────────────────────────────────────────────────

describe('getAiFallbackResponse', () => {
  it('returns structured fallback', () => {
    const result = getAiFallbackResponse('sales', 'executive_insights')
    expect(result.success).toBe(false)
    expect(result.fallback).toBe(true)
    expect(result.module).toBe('sales')
    expect(result.disclaimer).toBeTruthy()
  })
})

// ── Prompt Template Tests ────────────────────────────────────────────────────

describe('AI Prompt Templates', () => {
  it('executive insight prompt contains safety rules', async () => {
    const { buildExecutiveInsightPrompt } = await import('../prompts/ai.prompts')
    const prompt = buildExecutiveInsightPrompt({ metrics: { total_sales: 100000 }, date_range: 'today' })
    expect(prompt.system).toContain('CRITICAL SAFETY RULES')
    expect(prompt.system).toContain('NEVER')
    expect(prompt.user).toContain('OUTPUT SCHEMA')
  })

  it('anomaly prompt uses neutral language guidance', async () => {
    const { buildAnomalyDetectionPrompt } = await import('../prompts/ai.prompts')
    const prompt = buildAnomalyDetectionPrompt({ void_summary: {}, discount_patterns: {}, drawer_summaries: {}, stock_adjustments: {} })
    expect(prompt.system).toContain('requires review')
    expect(prompt.system).toContain('Never accuse')
  })

  it('chat prompt enforces non-destructive behavior', async () => {
    const { buildChatAssistantPrompt } = await import('../prompts/ai.prompts')
    const prompt = buildChatAssistantPrompt({ message: 'test', user_role: 'manager' })
    expect(prompt.system).toContain('CANNOT')
    expect(prompt.system).toContain('Modify financial records')
  })

  it('staff scheduling prompt prevents payroll changes', async () => {
    const { buildStaffSchedulePrompt } = await import('../prompts/ai.prompts')
    const prompt = buildStaffSchedulePrompt({ hourly_demand: {}, current_schedule: {}, overtime_summary: {} })
    expect(prompt.system).toContain('NOT approve payroll')
  })

  it('customer intelligence prompt enforces anonymization', async () => {
    const { buildCustomerIntelligencePrompt } = await import('../prompts/ai.prompts')
    const prompt = buildCustomerIntelligencePrompt({ segments: {}, visit_frequency: {}, loyalty_tiers: {} })
    expect(prompt.system).toContain('NEVER reference specific customer names')
  })
})

// ── Data Security Tests ──────────────────────────────────────────────────────

describe('AI Data Security', () => {
  it('prompt templates do not contain API keys', async () => {
    const prompts = await import('../prompts/ai.prompts')
    const allFunctions = Object.values(prompts)
    for (const fn of allFunctions) {
      if (typeof fn === 'function') {
        const result = fn({ metrics: {}, message: 'test', void_summary: {}, discount_patterns: {}, drawer_summaries: {}, stock_adjustments: {}, segments: {}, visit_frequency: {}, loyalty_tiers: {}, hourly_demand: {}, current_schedule: {}, overtime_summary: {}, stock_levels: {}, consumption_rates: {}, reorder_rules: {}, items_below_reorder: {}, supplier_metrics: {}, pending_pos: {}, queue_status: {}, prep_times: {}, delay_incidents: {}, question: 'test', report_data: {} })
        const jsonStr = JSON.stringify(result)
        expect(jsonStr).not.toContain('AIzaSy')
        expect(jsonStr).not.toContain('sk-')
        expect(jsonStr).not.toContain('GOOGLE_API_KEY')
      }
    }
  })

  it('service does not import GoogleGenerativeAI directly', () => {
    const fs = require('fs')
    const path = require('path')
    const raw = fs.readFileSync(path.resolve(__dirname, '../services/ai.service.js'), 'utf-8')
    expect(raw).not.toContain('GoogleGenerativeAI')
    expect(raw).not.toContain('API_KEY')
  })
})
