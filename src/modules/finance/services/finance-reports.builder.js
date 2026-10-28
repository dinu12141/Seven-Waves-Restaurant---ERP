// ═══════════════════════════════════════════════════════════════════════════════
// Finance Reports Builder — pure, DB-free (Financial Reports page)
// Seven Waves Restaurant (Pvt) Ltd
//
// Every figure comes from the GL of record: finance_ledgers +
// finance_cashbook_entries (signed opening + Σ debit − credit).
//   • Monthly summary — income / expense ledger movements per month.
//   • Cash flow (direct method) — movements on cash/bank ledgers, each cash leg
//     attributed to the counterparty legs of the same posting (source_type +
//     source_id) and classified by the counterparty ledger:
//       income / expense / current asset / current liability → operating
//       non-current asset                                     → investing
//       equity / non-current liability                        → financing
//     Transfers between cash/bank ledgers net to zero and are excluded.
//   • COGS — movements on Cost of Sales ledgers against revenue.
// ═══════════════════════════════════════════════════════════════════════════════

import { BS_LAYOUT, PL_LAYOUT, classifyLedger } from './finance-statements.builder'
import { classifyCashLedgers } from './finance-cashbook.builder'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const num = (n) => Number(n) || 0
const day = (e) => String(e?.entry_date || '').slice(0, 10)
const signedOpening = (l) =>
  l?.opening_balance_type === 'credit' ? -num(l?.opening_balance) : num(l?.opening_balance)

/** Payroll cost ledgers (7000 salaries, 7003 EPF, 7004 ETF, or named so). */
export const PAYROLL_CODES = ['7000', '7001', '7002', '7003', '7004']
const PAYROLL_NAME_RE = /salar|wage|\bepf\b|\betf\b|payroll/i
export function isPayrollLedger(l) {
  if (!l || l.ledger_type !== 'expense') return false
  return PAYROLL_CODES.includes(String(l.ledger_code || '').trim()) || PAYROLL_NAME_RE.test(l.ledger_name || '')
}

export function isCostOfSalesLedger(l) {
  if (!l || l.ledger_type !== 'expense') return false
  return classifyLedger({ ...l, account_group: l.account_group }, PL_LAYOUT)?.section?.key === 'cost_of_sales'
}

// ── Monthly P&L summary ─────────────────────────────────────────────────────
export function buildMonthlySummary(ledgers = [], entries = [], year) {
  const byId = new Map((ledgers || []).map((l) => [l.id, l]))
  const months = []
  const idx = new Map()
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`
    const row = { month: key, revenue: 0, cost_of_sales: 0, expenses: 0, wages: 0, profit: 0 }
    months.push(row)
    idx.set(key, row)
  }
  for (const e of entries || []) {
    const row = idx.get(day(e).slice(0, 7))
    const l = byId.get(e?.ledger_id)
    if (!row || !l) continue
    const net = num(e.debit_amount) - num(e.credit_amount)
    if (l.ledger_type === 'income') row.revenue -= net
    else if (l.ledger_type === 'expense') {
      if (isPayrollLedger(l)) row.wages += net
      else if (isCostOfSalesLedger(l)) row.cost_of_sales += net
      else row.expenses += net
    }
  }
  const tot = { yearRevenue: 0, yearCostOfSales: 0, yearExpenses: 0, yearWages: 0 }
  for (const r of months) {
    for (const k of ['revenue', 'cost_of_sales', 'expenses', 'wages']) r[k] = round2(r[k])
    r.profit = round2(r.revenue - r.cost_of_sales - r.expenses - r.wages)
    tot.yearRevenue += r.revenue
    tot.yearCostOfSales += r.cost_of_sales
    tot.yearExpenses += r.expenses
    tot.yearWages += r.wages
  }
  for (const k of Object.keys(tot)) tot[k] = round2(tot[k])
  return {
    monthly: months,
    ...tot,
    yearProfit: round2(tot.yearRevenue - tot.yearCostOfSales - tot.yearExpenses - tot.yearWages),
  }
}

// ── Cash flow ───────────────────────────────────────────────────────────────
export function cashFlowActivity(l) {
  if (!l) return 'operating'
  if (l.ledger_type === 'income' || l.ledger_type === 'expense') return 'operating'
  if (l.ledger_type === 'equity') return 'financing'
  const c = classifyLedger(l, BS_LAYOUT)
  if (c?.section?.key === 'non_current_assets') return 'investing'
  if (c?.section?.key === 'non_current_liabilities') return 'financing'
  return 'operating'
}

const groupKey = (e) =>
  e.source_id ? `${e.source_type || ''}|${e.source_id}` : `${e.source_type || ''}|nil|${e.created_at || e.id}`

/**
 * @param {object} p
 * @param {Array} p.ledgers      all finance_ledgers
 * @param {Array} p.accounts     finance_accounts (cash/bank ledger detection)
 * @param {Array} p.entries      finance_cashbook_entries with entry_date <= dateTo (cash ledgers
 *                               of any date + every ledger inside the period)
 * @param {string} [p.dateFrom]
 * @param {string} [p.dateTo]
 */
export function buildCashFlow({ ledgers = [], accounts = [], entries = [], dateFrom = '', dateTo = '' }) {
  const { cash, petty } = classifyCashLedgers(ledgers, accounts)
  const cashIds = new Set([...cash, ...petty].map((l) => l.id))
  const byId = new Map((ledgers || []).map((l) => [l.id, l]))
  const inPeriod = (e) => (!dateFrom || day(e) >= dateFrom) && (!dateTo || day(e) <= dateTo)

  let opening = 0
  let closing = 0
  for (const l of [...cash, ...petty]) {
    opening += signedOpening(l)
    closing += signedOpening(l)
  }

  const groups = new Map()
  for (const e of entries || []) {
    if (dateTo && day(e) > dateTo) continue
    const isCash = cashIds.has(e.ledger_id)
    const net = num(e.debit_amount) - num(e.credit_amount)
    if (isCash) {
      closing += net
      if (dateFrom && day(e) < dateFrom) opening += net
    }
    if (!inPeriod(e)) continue
    const k = groupKey(e)
    ;(groups.get(k) || groups.set(k, []).get(k)).push(e)
  }

  const lines = new Map() // activity|ledgerId → amount
  const add = (activity, key, label, amount) => {
    const k = `${activity}|${key}`
    const cur = lines.get(k) || { activity, category: label, amount: 0 }
    cur.amount += amount
    lines.set(k, cur)
  }

  for (const legs of groups.values()) {
    const cashLegs = legs.filter((e) => cashIds.has(e.ledger_id))
    if (!cashLegs.length) continue
    const cashNet = cashLegs.reduce((s, e) => s + num(e.debit_amount) - num(e.credit_amount), 0)
    if (Math.abs(cashNet) < 0.005) continue // internal cash/bank transfer
    const others = legs.filter((e) => !cashIds.has(e.ledger_id))
    // counterparty legs move opposite to cash (cash in ⇒ credits elsewhere)
    let weights = others
      .map((e) => ({ e, w: -(num(e.debit_amount) - num(e.credit_amount)) * Math.sign(cashNet) }))
      .filter((x) => x.w > 0)
    if (!weights.length) weights = others.map((e) => ({ e, w: Math.abs(num(e.debit_amount) - num(e.credit_amount)) })).filter((x) => x.w > 0)
    const totalW = weights.reduce((s, x) => s + x.w, 0)
    if (!totalW) {
      const st = cashLegs[0].source_type || 'unknown'
      add('operating', `unmatched:${st}`, `Unallocated cash movements (${st})`, cashNet)
      continue
    }
    for (const { e, w } of weights) {
      const l = byId.get(e.ledger_id)
      const label = l ? `${l.ledger_code} ${l.ledger_name}`.trim() : 'Unknown ledger'
      add(cashFlowActivity(l), e.ledger_id, label, (cashNet * w) / totalW)
    }
  }

  const section = (act) =>
    [...lines.values()]
      .filter((x) => x.activity === act)
      .map((x) => ({ category: x.category, amount: round2(x.amount) }))
      .filter((x) => Math.abs(x.amount) >= 0.005)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const operating = section('operating')
  const investing = section('investing')
  const financing = section('financing')
  const tot = (rows) => round2(rows.reduce((s, r) => s + r.amount, 0))
  const net_operating = tot(operating)
  const net_investing = tot(investing)
  const net_financing = tot(financing)
  const net_cash_flow = round2(net_operating + net_investing + net_financing)
  const opening_balance = round2(opening)
  const closing_balance = round2(closing)
  return {
    opening_balance,
    operating_activities: operating,
    investing_activities: investing,
    financing_activities: financing,
    net_operating,
    net_investing,
    net_financing,
    net_cash_flow,
    closing_balance,
    // rounding of the per-line allocation only; any real gap means a data issue
    reconciliation_difference: round2(closing_balance - opening_balance - net_cash_flow),
    cash_ledgers: [...cash, ...petty].map((l) => `${l.ledger_code} ${l.ledger_name}`),
  }
}

// ── COGS (GL) ─────────────────────────────────────────────────────────────
export function buildGlCogs(ledgers = [], entries = [], dateFrom = '', dateTo = '') {
  const byId = new Map((ledgers || []).map((l) => [l.id, l]))
  const cogs = new Map()
  let revenue = 0
  for (const e of entries || []) {
    if ((dateFrom && day(e) < dateFrom) || (dateTo && day(e) > dateTo)) continue
    const l = byId.get(e.ledger_id)
    if (!l) continue
    const net = num(e.debit_amount) - num(e.credit_amount)
    if (l.ledger_type === 'income' && classifyLedger(l, PL_LAYOUT)?.section?.key === 'revenue') revenue -= net
    else if (isCostOfSalesLedger(l)) {
      const r = cogs.get(l.id) || { code: l.ledger_code, name: l.ledger_name, amount: 0 }
      r.amount += net
      cogs.set(l.id, r)
    }
  }
  const rows = [...cogs.values()]
    .map((r) => ({ ...r, amount: round2(r.amount) }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
  const total_cogs = round2(rows.reduce((s, r) => s + r.amount, 0))
  revenue = round2(revenue)
  const gross_profit = round2(revenue - total_cogs)
  return {
    rows: rows.map((r) => ({ ...r, pct_of_revenue: revenue ? round2((r.amount / revenue) * 100) : 0 })),
    revenue,
    total_cogs,
    gross_profit,
    gp_percent: revenue ? round2((gross_profit / revenue) * 100) : 0,
  }
}
