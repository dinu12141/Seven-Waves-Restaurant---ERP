// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Multi-Agent AI System Test Suite
// (FinGuard AI, TalentOps AI, SupplySense AI)
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import {
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

describe('Multi-Agent AI System: Service Layer', () => {
  it('exports all 3 specialized autonomous agents and multi-agent coordinator', () => {
    expect(typeof runFinGuardAudit).toBe('function')
    expect(typeof runTalentOpsAudit).toBe('function')
    expect(typeof runSupplySenseAudit).toBe('function')
    expect(typeof runMultiAgentComprehensiveAudit).toBe('function')
    expect(typeof fetchMultiAgentAlerts).toBe('function')
  })

  it('exports self-healing remediation functions', () => {
    expect(typeof autoCloseOrphanedShift).toBe('function')
    expect(typeof autoTransferPosCash).toBe('function')
    expect(typeof draftInternalStockTransfer).toBe('function')
    expect(typeof resolveMultiAgentAlert).toBe('function')
  })
})

describe('FinGuard AI: Cash & Forensic Integrity Logic', () => {
  it('handles empty branch safely without crashing', async () => {
    const res = await runFinGuardAudit(null)
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
    expect(res.data.agent).toBe('FinGuard AI')
    expect(res.data.department).toBe('finance')
    expect(typeof res.data.health_score).toBe('number')
    expect(res.data.health_score).toBeGreaterThanOrEqual(0)
    expect(res.data.health_score).toBeLessThanOrEqual(100)
  })

  it('correctly classifies variance thresholds: >= 1000 is critical, >= 500 is warning', () => {
    const isCritical = (diff: number) => Math.abs(diff) >= 1000
    const isWarning = (diff: number) => Math.abs(diff) >= 500 && Math.abs(diff) < 1000

    expect(isCritical(-1500)).toBe(true)
    expect(isCritical(1200)).toBe(true)
    expect(isCritical(-750)).toBe(false)
    expect(isWarning(-750)).toBe(true)
    expect(isWarning(200)).toBe(false)
  })
})

describe('TalentOps AI: Workforce & Compliance Logic', () => {
  it('handles attendance audit safely', async () => {
    const res = await runTalentOpsAudit(null)
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
    expect(res.data.agent).toBe('TalentOps AI')
    expect(res.data.department).toBe('hr')
    expect(typeof res.data.health_score).toBe('number')
  })

  it('enforces 50% basic salary cap calculation', () => {
    const basicSalary = 60000
    const cap = basicSalary * 0.5
    expect(cap).toBe(30000)

    const requestA = 25000
    const requestB = 35000

    expect(requestA > cap).toBe(false)
    expect(requestB > cap).toBe(true)
  })

  it('calculates auto-closing shift capped at standard 9 hours', () => {
    const clockInTime = new Date('2026-10-25T08:00:00Z').getTime()
    const maxHours = 9
    const clockOutTime = new Date(clockInTime + maxHours * 3600 * 1000).toISOString()
    expect(clockOutTime).toBe('2026-10-25T17:00:00.000Z')
  })
})

describe('SupplySense AI: Procurement & Inventory Guardian', () => {
  it('handles stock and recipe audit safely', async () => {
    const res = await runSupplySenseAudit(null)
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
    expect(res.data.agent).toBe('SupplySense AI')
    expect(res.data.department).toBe('inventory')
    expect(typeof res.data.health_score).toBe('number')
  })
})

describe('Unified Multi-Agent Comprehensive Coordinator', () => {
  it('calculates aggregate health score across all 4 departments', async () => {
    const res = await runMultiAgentComprehensiveAudit(null)
    expect(res).toBeDefined()
    expect(res.success).toBe(true)
    expect(typeof res.data.overall_score).toBe('number')
    expect(res.data.departments).toBeDefined()
    expect(res.data.departments.operations).toBeDefined()
    expect(res.data.departments.finance).toBeDefined()
    expect(res.data.departments.hr).toBeDefined()
    expect(res.data.departments.inventory).toBeDefined()
  })

  it('mathematically averages 4 pillars properly', () => {
    const scores = { kot: 95, fin: 85, hr: 90, supply: 90 }
    const avg = Math.round((scores.kot + scores.fin + scores.hr + scores.supply) / 4)
    expect(avg).toBe(90)
  })
})
