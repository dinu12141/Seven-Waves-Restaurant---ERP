// ═══════════════════════════════════════════════════════════════════════════════
// Finance Dashboard builder — pure, unit-testable.
//
// Every figure comes from the GL of record (finance_cashbook_entries +
// finance_ledgers), with the same sign rules as the statements builder:
//   revenue  = Σ income-ledger legs  (Cr − Dr) in the period
//   expenses = Σ expense-ledger legs (Dr − Cr) in the period
//   profit   = revenue − expenses           (= Statement of Profit or Loss)
//   cash & bank = GL balance of the ledgers behind the active finance_accounts
// ═══════════════════════════════════════════════════════════════════════════════

import { round2 } from './finance-statements.builder'
import { accountLinkIssue, recomputeLedgerBalance, sumEntriesByLedger } from './finance-ledger-integrity'
import { buildGlPostings } from './finance-gl.builder'

/** YYYY-MM-DD in the browser's local time zone (toISOString() is UTC). */
export function localDateKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d)
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${day}`
}

const dateOf = (e) => String(e?.entry_date || '').slice(0, 10)
const inRange = (d, from, to) => !!d && (!from || d >= from) && (!to || d <= to)

/**
 * @param {object}   [p]
 * @param {object[]} [p.ledgers]   finance_ledgers rows
 * @param {object[]} [p.entries]   finance_cashbook_entries rows (entry_date <= endDate)
 * @param {object[]} [p.accounts]  active finance_accounts rows
 * @param {string}   [p.kpiFrom]   KPI period start (YYYY-MM-DD)
 * @param {string}   [p.kpiTo]     KPI period end
 * @param {number}   [p.bucketCount]  chart buckets
 * @param {(e:object)=>number} [p.bucketOf] entry → bucket index (−1 = outside chart)
 */
export function buildDashboardFigures({
  ledgers = [],
  entries = [],
  accounts = [],
  kpiFrom = null,
  kpiTo = null,
  bucketCount = 0,
  bucketOf = null,
} = {}) {
  const byId = new Map((ledgers || []).map((l) => [l.id, l]))
  const revenueSeries = new Array(bucketCount).fill(0)
  const expenseSeries = new Array(bucketCount).fill(0)
  const expenseByLedger = new Map()
  let revenue = 0
  let expenses = 0

  for (const e of entries || []) {
    const l = byId.get(e.ledger_id)
    if (!l || (l.ledger_type !== 'income' && l.ledger_type !== 'expense')) continue
    const dr = Number(e.debit_amount) || 0
    const cr = Number(e.credit_amount) || 0
    const isIncome = l.ledger_type === 'income'
    const amt = isIncome ? cr - dr : dr - cr

    if (inRange(dateOf(e), kpiFrom, kpiTo)) {
      if (isIncome) revenue += amt
      else {
        expenses += amt
        expenseByLedger.set(l.id, (expenseByLedger.get(l.id) || 0) + amt)
      }
    }
    if (bucketOf && bucketCount) {
      const i = bucketOf(e)
      if (i >= 0 && i < bucketCount) {
        if (isIncome) revenueSeries[i] += amt
        else expenseSeries[i] += amt
      }
    }
  }

  // Cash & bank: each account mirrors its ledger; a ledger shared by several
  // accounts is counted once.
  const totals = sumEntriesByLedger(entries)
  const accountBalances = []
  const warnings = []
  const counted = new Set()
  let cashAndBank = 0
  for (const a of accounts || []) {
    const l = byId.get(a.ledger_id)
    const issue = accountLinkIssue(a, l, accounts)
    if (issue) warnings.push(`${a.registered_name}: ${issue}`)
    const bal = l ? recomputeLedgerBalance(l, totals.get(l.id)) : 0
    accountBalances.push({
      id: a.id,
      code: l?.ledger_code || '—',
      name: a.registered_name,
      account_type: String(a.account_type || '').replace(/_/g, ' ').toUpperCase(),
      balance: bal,
      issue,
    })
    if (l && !counted.has(l.id)) {
      counted.add(l.id)
      cashAndBank += bal
    }
  }

  const expenseBreakdown = [...expenseByLedger.entries()]
    .map(([id, amount]) => ({
      id,
      code: byId.get(id)?.ledger_code || '',
      name: byId.get(id)?.ledger_name || '',
      group: byId.get(id)?.account_group || '',
      amount: round2(amount),
    }))
    .filter((r) => Math.abs(r.amount) >= 0.005)
    .sort((a, b) => b.amount - a.amount)

  return {
    revenue: round2(revenue),
    expenses: round2(expenses),
    netProfit: round2(revenue - expenses),
    cashAndBank: round2(cashAndBank),
    revenueSeries: revenueSeries.map(round2),
    expenseSeries: expenseSeries.map(round2),
    expenseBreakdown,
    accountBalances,
    warnings,
  }
}

/** Latest GL postings (one row per source document), newest first. */
export function recentPostings(entries = [], ledgers = [], limit = 5) {
  const ledgerMap = new Map((ledgers || []).map((l) => [l.id, l]))
  return buildGlPostings(entries, { ledgers: ledgerMap }).slice(0, limit)
}
