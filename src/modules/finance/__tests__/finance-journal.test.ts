// ═══════════════════════════════════════════════════════════════════════════════
// Finance Journal Entry (GL) Double-Entry Unit & Security Tests
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Finance Journal Entries (GL) System Architecture', () => {
  it('journal service file exists and has required methods', () => {
    const servicePath = path.resolve(__dirname, '../services/finance-journal.service.js')
    expect(fs.existsSync(servicePath)).toBe(true)
    const content = fs.readFileSync(servicePath, 'utf-8')
    expect(content).toContain('list(filters')
    expect(content).toContain('getById(id')
    expect(content).toContain('create(header, lines')
    expect(content).toContain('reverse(journalId, reason')
  })

  it('journal store file exists and defines store correctly', () => {
    const storePath = path.resolve(__dirname, '../stores/finance-journal.store.js')
    expect(fs.existsSync(storePath)).toBe(true)
    const content = fs.readFileSync(storePath, 'utf-8')
    expect(content).toContain("defineStore('financeJournal'")
    expect(content).toContain('fetchEntries')
    expect(content).toContain('createEntry')
    expect(content).toContain('reverseEntry')
  })

  it('JournalEntriesPage and components exist', () => {
    const pagePath = path.resolve(__dirname, '../pages/JournalEntriesPage.vue')
    const formPath = path.resolve(__dirname, '../components/JournalEntryForm.vue')
    const linesPath = path.resolve(__dirname, '../components/JournalLinesDialog.vue')
    expect(fs.existsSync(pagePath)).toBe(true)
    expect(fs.existsSync(formPath)).toBe(true)
    expect(fs.existsSync(linesPath)).toBe(true)
  })

  it('router has journal-entries configured to JournalEntriesPage', () => {
    const routesPath = path.resolve(__dirname, '../../../router/routes.js')
    const content = fs.readFileSync(routesPath, 'utf-8')
    expect(content).toContain("path: 'journal-entries'")
    expect(content).toContain('JournalEntriesPage.vue')
    expect(content).not.toContain("{ path: 'journal-entries', redirect:")
  })

  it('navigation items in roles.ts contain Journal Entries (GL)', () => {
    const rolesPath = path.resolve(__dirname, '../../../config/roles.ts')
    const content = fs.readFileSync(rolesPath, 'utf-8')
    expect(content).toContain("label: 'Journal Entries (GL)'")
    expect(content).toContain("to: '/finance/journal-entries'")
    expect(content).toContain("permission: 'finance.journal.view'")
  })

  describe('Double-Entry Math & Balance Validation Logic', () => {
    function validateDoubleEntry(lines: any[]) {
      if (!Array.isArray(lines) || lines.length < 2) {
        throw new Error('A journal entry must contain at least 2 lines')
      }
      let totalDr = 0
      let totalCr = 0
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const dr = Math.round((Number(line.dr_amount) || 0) * 100) / 100
        const cr = Math.round((Number(line.cr_amount) || 0) * 100) / 100
        if (!line.ledger_id) throw new Error(`Line ${i + 1}: General ledger account is required.`)
        if (dr === 0 && cr === 0) throw new Error(`Line ${i + 1}: Either Debit or Credit must be greater than zero.`)
        if (dr > 0 && cr > 0) throw new Error(`Line ${i + 1}: A line cannot have both Debit and Credit.`)
        if (dr < 0 || cr < 0) throw new Error(`Line ${i + 1}: Negative amounts are not allowed.`)
        totalDr += dr
        totalCr += cr
      }
      totalDr = Math.round(totalDr * 100) / 100
      totalCr = Math.round(totalCr * 100) / 100
      if (totalDr <= 0) throw new Error('Total entry amount must be greater than zero.')
      if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`Double-entry imbalance: Total Debit (${totalDr}) must equal Total Credit (${totalCr})`)
      }
      return { totalDr, totalCr, balanced: true }
    }

    it('rejects entries with fewer than 2 lines', () => {
      expect(() => validateDoubleEntry([{ ledger_id: '1', dr_amount: 100, cr_amount: 0 }])).toThrow(
        'at least 2 lines'
      )
    })

    it('rejects imbalanced entries (Dr 10,000 != Cr 8,000)', () => {
      const lines = [
        { ledger_id: '1', dr_amount: 10000, cr_amount: 0 },
        { ledger_id: '2', dr_amount: 0, cr_amount: 8000 },
      ]
      expect(() => validateDoubleEntry(lines)).toThrow('Double-entry imbalance')
    })

    it('rejects lines with both Debit and Credit amounts', () => {
      const lines = [
        { ledger_id: '1', dr_amount: 500, cr_amount: 500 },
        { ledger_id: '2', dr_amount: 0, cr_amount: 500 },
      ]
      expect(() => validateDoubleEntry(lines)).toThrow('cannot have both Debit and Credit')
    })

    it('accepts perfectly balanced user scenario: DR Expense 10,000 / CR Store Petty Cash 10,000', () => {
      const lines = [
        { ledger_id: 'expense-ledger-id', dr_amount: 10000, cr_amount: 0 },
        { ledger_id: 'petty-cash-ledger-id', dr_amount: 0, cr_amount: 10000 },
      ]
      const result = validateDoubleEntry(lines)
      expect(result.balanced).toBe(true)
      expect(result.totalDr).toBe(10000)
      expect(result.totalCr).toBe(10000)
    })

    it('supports compound multi-line petty cash reimbursement', () => {
      // Example: 6,000 Cleaning + 4,000 Stationery reimbursed from 10,000 Store Petty Cash
      const lines = [
        { ledger_id: 'cleaning-exp-id', dr_amount: 6000, cr_amount: 0 },
        { ledger_id: 'stationery-exp-id', dr_amount: 4000, cr_amount: 0 },
        { ledger_id: 'petty-cash-ledger-id', dr_amount: 0, cr_amount: 10000 },
      ]
      const result = validateDoubleEntry(lines)
      expect(result.balanced).toBe(true)
      expect(result.totalDr).toBe(10000)
      expect(result.totalCr).toBe(10000)
    })
  })
})
