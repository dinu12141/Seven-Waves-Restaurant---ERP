// ═══════════════════════════════════════════════════════════════════
// UNIT TESTS — Error Classification
// Seven Waves ERP — Step 03A
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { classifySupabaseError, ErrorCategory, ErrorSeverity, generateCorrelationId } from '../errors/types'

describe('classifySupabaseError', () => {
  // ── RLS / Permission ──────────────────────────────────────────
  it('classifies RLS errors from Postgres code 42501', () => {
    const err = classifySupabaseError({ code: '42501', message: 'permission denied' })
    expect(err.category).toBe(ErrorCategory.RLS)
    expect(err.severity).toBe(ErrorSeverity.WARNING)
  })

  it('classifies row-level security message', () => {
    const err = classifySupabaseError({ message: 'new row violates row-level security policy' })
    expect(err.category).toBe(ErrorCategory.RLS)
  })

  it('classifies Insufficient role as PERMISSION', () => {
    const err = classifySupabaseError({ message: 'Insufficient role for this action' })
    expect(err.category).toBe(ErrorCategory.PERMISSION)
  })

  // ── Inventory ─────────────────────────────────────────────────
  it('classifies NEGATIVE_STOCK_BLOCKED', () => {
    const err = classifySupabaseError({ message: 'NEGATIVE_STOCK_BLOCKED: flour stock below 0' })
    expect(err.category).toBe(ErrorCategory.INVENTORY_CONFLICT)
    expect(err.severity).toBe(ErrorSeverity.ERROR)
  })

  it('classifies DUPLICATE_MOVEMENT', () => {
    const err = classifySupabaseError({ message: 'DUPLICATE_MOVEMENT: already processed' })
    expect(err.category).toBe(ErrorCategory.INVENTORY_CONFLICT)
    expect(err.severity).toBe(ErrorSeverity.WARNING)
  })

  // ── Finance ───────────────────────────────────────────────────
  it('classifies JOURNAL_IMBALANCE', () => {
    const err = classifySupabaseError({ message: 'JOURNAL_IMBALANCE: debits != credits' })
    expect(err.category).toBe(ErrorCategory.FINANCE_POSTING)
  })

  it('classifies CLOSED_PERIOD', () => {
    const err = classifySupabaseError({ message: 'CLOSED_PERIOD: Jan 2026 is locked' })
    expect(err.category).toBe(ErrorCategory.FINANCE_POSTING)
  })

  it('classifies IMMUTABLE_DOC', () => {
    const err = classifySupabaseError({ message: 'IMMUTABLE_DOC: cannot modify posted journal' })
    expect(err.category).toBe(ErrorCategory.FINANCE_POSTING)
  })

  // ── Validation / Constraints ──────────────────────────────────
  it('classifies unique constraint (23505)', () => {
    const err = classifySupabaseError({ code: '23505', message: 'duplicate key value' })
    expect(err.category).toBe(ErrorCategory.VALIDATION)
  })

  it('classifies not-null constraint (23502)', () => {
    const err = classifySupabaseError({ code: '23502', message: 'not-null constraint violated' })
    expect(err.category).toBe(ErrorCategory.VALIDATION)
  })

  it('classifies foreign key constraint (23503)', () => {
    const err = classifySupabaseError({ code: '23503', message: 'foreign key violation' })
    expect(err.category).toBe(ErrorCategory.VALIDATION)
  })

  it('classifies check constraint (23514)', () => {
    const err = classifySupabaseError({ code: '23514', message: 'check constraint violated' })
    expect(err.category).toBe(ErrorCategory.VALIDATION)
  })

  // ── Network ───────────────────────────────────────────────────
  it('classifies Failed to fetch as NETWORK', () => {
    const err = classifySupabaseError({ message: 'Failed to fetch' })
    expect(err.category).toBe(ErrorCategory.NETWORK)
  })

  it('classifies ERR_NETWORK', () => {
    const err = classifySupabaseError({ message: 'ERR_NETWORK' })
    expect(err.category).toBe(ErrorCategory.NETWORK)
  })

  // ── Session ───────────────────────────────────────────────────
  it('classifies JWT expired as SESSION', () => {
    const err = classifySupabaseError({ message: 'JWT expired' })
    expect(err.category).toBe(ErrorCategory.SESSION)
  })

  it('classifies PGRST301 as SESSION', () => {
    const err = classifySupabaseError({ code: 'PGRST301' })
    expect(err.category).toBe(ErrorCategory.SESSION)
  })

  // ── Not Found ─────────────────────────────────────────────────
  it('classifies PGRST116 as NOT_FOUND', () => {
    const err = classifySupabaseError({ code: 'PGRST116', message: 'JSON result is not found' })
    expect(err.category).toBe(ErrorCategory.NOT_FOUND)
  })

  // ── Unknown fallback ──────────────────────────────────────────
  it('classifies unknown error as UNKNOWN', () => {
    const err = classifySupabaseError({ message: 'something totally unexpected' })
    expect(err.category).toBe(ErrorCategory.UNKNOWN)
  })

  // ── Metadata ──────────────────────────────────────────────────
  it('includes module and action in classified error', () => {
    const err = classifySupabaseError({ message: 'test' }, 'pos', 'createOrder')
    expect(err.module).toBe('pos')
    expect(err.action).toBe('createOrder')
  })

  it('generates a correlation ID', () => {
    const err = classifySupabaseError({ message: 'test' })
    expect(err.correlationId).toMatch(/^erp-/)
  })

  it('sets timestamp', () => {
    const err = classifySupabaseError({ message: 'test' })
    expect(err.timestamp).toBeTruthy()
    expect(new Date(err.timestamp).getTime()).toBeGreaterThan(0)
  })
})

describe('generateCorrelationId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateCorrelationId()))
    expect(ids.size).toBe(100)
  })

  it('starts with erp- prefix', () => {
    expect(generateCorrelationId()).toMatch(/^erp-/)
  })
})
