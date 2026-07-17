import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const RLS_FIX = resolve(ROOT, 'supabase/fix_missing_rls_policies.sql')
const JOURNAL_FIX = resolve(ROOT, 'supabase/fix_journal_immutability.sql')
const LOYALTY_FIX = resolve(ROOT, 'supabase/fix_loyalty_amount_value.sql')

// ─── fix_missing_rls_policies.sql ───────────────────────────────────────────

describe('fix_missing_rls_policies.sql — critical RLS coverage', () => {
  it('file exists', () => {
    expect(existsSync(RLS_FIX)).toBe(true)
  })

  let sql = ''
  it('loads and is non-trivial', () => {
    sql = readFileSync(RLS_FIX, 'utf8')
    expect(sql.length).toBeGreaterThan(5000)
  })

  const criticalTables = [
    'companies',
    'branches',
    'journal_entries',
    'journal_lines',
    'user_roles',
    'permissions',
    'role_permissions',
    'stock_levels',
    'stock_movements',
    'payroll_history',
  ]

  for (const table of criticalTables) {
    it(`has RLS coverage for ${table} (enable or policy)`, () => {
      const content = readFileSync(RLS_FIX, 'utf8')
      const hasEnableRls = content.match(new RegExp(`ALTER TABLE.*${table}.*ENABLE ROW LEVEL SECURITY`, 'i'))
      const hasPolicy = content.match(new RegExp(`CREATE POLICY.*ON public\\.${table}`, 'i'))
      expect(hasEnableRls || hasPolicy).toBeTruthy()
    })
  }

  it('defines get_user_company_id() helper for cross-table isolation', () => {
    const content = readFileSync(RLS_FIX, 'utf8')
    expect(content).toContain('get_user_company_id()')
    expect(content).toContain('SECURITY DEFINER')
  })

  it('does NOT use blanket USING(true) policies on sensitive tables', () => {
    const content = readFileSync(RLS_FIX, 'utf8')
    // Check no blanket USING(true) on finance/HR tables
    const lines = content.split('\n')
    const blanketPolicies = lines.filter(l =>
      l.match(/USING\s*\(\s*true\s*\)/i) &&
      !l.trim().startsWith('--')
    )
    // Any remaining USING(true) must be intentional (e.g. admin sees all) — not on sensitive tables
    for (const line of blanketPolicies) {
      // These are intentionally public or admin-scoped tables
      expect(line).not.toMatch(/journal|payroll|salary|voucher|finance/i)
    }
  })

  it('adds admin control policies (not just read-only)', () => {
    const content = readFileSync(RLS_FIX, 'utf8')
    expect(content).toMatch(/FOR ALL\s*\n\s*USING\s*\(\s*is_admin\(\)/im)
  })

  it('grants EXECUTE on new helper functions to authenticated role', () => {
    const content = readFileSync(RLS_FIX, 'utf8')
    expect(content).toMatch(/GRANT EXECUTE ON FUNCTION.*TO authenticated/i)
  })
})

// ─── fix_journal_immutability.sql ───────────────────────────────────────────

describe('fix_journal_immutability.sql — double-entry ordering + DELETE protection', () => {
  it('file exists', () => {
    expect(existsSync(JOURNAL_FIX)).toBe(true)
  })

  it('creates journal entry with is_posted = false first', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    // The INSERT must come before the UPDATE to is_posted=true
    const insertIdx = sql.indexOf('INSERT INTO public.journal_entries')
    const updateIdx = sql.indexOf('SET is_posted = true')
    expect(insertIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(insertIdx)
  })

  it('marks is_posted false on initial INSERT', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain('false  -- NOT posted yet')
  })

  it('updates is_posted to true after lines are inserted', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain('SET is_posted = true')
    expect(sql).toContain('posted_at = now()')
  })

  it('adds DELETE protection to immutability trigger (BEFORE UPDATE OR DELETE)', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE/i)
  })

  it('raises exception on DELETE of posted entry', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain("TG_OP = 'DELETE'")
    expect(sql).toContain('IMMUTABLE_JOURNAL: Cannot delete posted journal entry')
  })

  it('permits reversal marking (is_reversed = true) as the only exception', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain('is_reversed = true')
    expect(sql).toContain('RETURN NEW;  -- Permit reversal marking only')
  })

  it('handles DELETE by returning OLD (not NEW which is NULL for deletes)', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain("TG_OP = 'DELETE' THEN")
    expect(sql).toContain('RETURN OLD;')
  })

  it('has idempotency guard (skips if journal already exists for order)', () => {
    const sql = readFileSync(JOURNAL_FIX, 'utf8')
    expect(sql).toContain('Idempotency: skip if journal already posted for this order')
  })
})

// ─── fix_loyalty_amount_value.sql ────────────────────────────────────────────

describe('fix_loyalty_amount_value.sql — schema and sync trigger', () => {
  it('file exists', () => {
    expect(existsSync(LOYALTY_FIX)).toBe(true)
  })

  const requiredColumns = ['amount_value', 'payment_id', 'amount_reference', 'loyalty_account_id', 'customer_id', 'coins', 'type', 'note']
  for (const col of requiredColumns) {
    it(`adds column IF NOT EXISTS: ${col}`, () => {
      const sql = readFileSync(LOYALTY_FIX, 'utf8')
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`, 'i'))
    })
  }

  it('creates sync trigger before insert or update', () => {
    const sql = readFileSync(LOYALTY_FIX, 'utf8')
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE/i)
    expect(sql).toContain('trg_sync_loyalty_transaction_columns')
  })

  it('syncs coins <-> points bidirectionally', () => {
    const sql = readFileSync(LOYALTY_FIX, 'utf8')
    expect(sql).toContain('NEW.points := NEW.coins')
    expect(sql).toContain('NEW.coins := ABS(NEW.points)')
  })

  it('syncs amount_value <-> amount_reference bidirectionally', () => {
    const sql = readFileSync(LOYALTY_FIX, 'utf8')
    expect(sql).toContain('NEW.amount_reference := NEW.amount_value')
    expect(sql).toContain('NEW.amount_value := NEW.amount_reference')
  })

  it('uses CREATE OR REPLACE to be idempotent on re-run', () => {
    const sql = readFileSync(LOYALTY_FIX, 'utf8')
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION/i)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS/i)
  })
})
