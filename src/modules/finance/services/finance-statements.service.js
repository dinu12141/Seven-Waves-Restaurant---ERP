// ═══════════════════════════════════════════════════════════════════════════════
// Finance Statements Service — Trial Balance, P&L, Balance Sheet
// Seven Waves Restaurant (Pvt) Ltd
//
// Loads finance_ledgers + finance_cashbook_entries and hands them to the pure
// builder (finance-statements.builder.js), which lays the statements out
// dynamically from each ledger's account_group in LKAS 1 order:
//   • Balance Sheet — cumulative as at date_to; equity shows every Equity
//     ledger plus Retained Earnings b/f (profit before date_from) and the
//     Profit for the period.
//   • Profit or Loss — movements between date_from and date_to.
// Every ledger appears exactly once; unknown account groups get their own
// heading and NULL groups go under "Unclassified" — nothing is dropped.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import {
  computeLedgerBalances,
  buildTrialBalance,
  buildProfitLoss,
  buildBalanceSheet,
} from './finance-statements.builder'

// PostgREST caps every response (1000 rows by default), so large tables are
// read page by page instead of trusting a single select.
export const STATEMENT_PAGE_SIZE = 1000

export async function fetchAllPages(buildQuery, pageSize = STATEMENT_PAGE_SIZE) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

export const financeStatementsService = {
  /**
   * Raw GL figures per ledger.
   * Ledgers are company-level, so the branch filter applies to entries only.
   * Inactive / deleted ledgers are loaded too: one that still carries a balance
   * must stay on the statements (the builder decides what is reportable).
   */
  async loadLedgerBalances(filters = {}) {
    const ledgers = await fetchAllPages(() =>
      supabase.from('finance_ledgers').select('*').order('ledger_code').order('id'),
    )

    const entries = await fetchAllPages(() => {
      let q = supabase
        .from('finance_cashbook_entries')
        .select('id, ledger_id, debit_amount, credit_amount, entry_date')
        .order('entry_date')
        .order('id')
      if (filters.branch_id) q = q.eq('branch_id', filters.branch_id)
      // Cumulative up to date_to: entries before date_from are still needed for
      // the balance sheet and for Retained Earnings b/f.
      if (filters.date_to) q = q.lte('entry_date', filters.date_to)
      return q
    })

    return computeLedgerBalances(ledgers, entries, filters)
  },

  // ── 1. Trial Balance (as at date_to) ────────────────────────────────────────
  async generateTrialBalance(filters = {}) {
    const balances = await this.loadLedgerBalances(filters)
    return buildTrialBalance(balances)
  },

  // ── 2. Statement of Profit or Loss (date_from → date_to) ────────────────────
  async generateProfitLoss(filters = {}) {
    const balances = await this.loadLedgerBalances(filters)
    return buildProfitLoss(balances, filters)
  },

  // ── 3. Statement of Financial Position (as at date_to) ──────────────────────
  // Equity = every Equity ledger + Retained Earnings b/f + profit for the period.
  async generateBalanceSheet(filters = {}) {
    const balances = await this.loadLedgerBalances(filters)
    return buildBalanceSheet(balances, filters)
  },

  /** All three statements from a single data load. */
  async generateAll(filters = {}) {
    const balances = await this.loadLedgerBalances(filters)
    return {
      trialBalance: buildTrialBalance(balances),
      profitLoss: buildProfitLoss(balances, filters),
      balanceSheet: buildBalanceSheet(balances, filters),
    }
  },
}
