// ═══════════════════════════════════════════════════════════════════════════════
// Finance Statements Builder — pure, DB-free statement assembly
// Seven Waves Restaurant (Pvt) Ltd
//
// Turns finance_ledgers rows + finance_cashbook_entries rows into a Trial
// Balance, a Statement of Profit or Loss and a Statement of Financial Position.
//
// Rules (see finance-statements.service.js for the data loading side):
//   • Every ledger is placed exactly once, under its own account_group heading,
//     inside the LKAS 1 section that its ledger_type + account_group map to.
//     Nothing is ever dropped:
//       – an account_group we do not know is appended as its own heading inside
//         the fallback section of its ledger_type (flagged + warning);
//       – a NULL / blank account_group goes under an "Unclassified" heading in
//         that same fallback section (warning).
//   • Amounts come from the GL only (signed opening + cashbook legs). The
//     ledger's current_balance is never used as a statement figure.
//   • Balance Sheet  = cumulative as at date_to.
//     Profit or Loss = movements in [date_from, date_to]. With no date_from the
//     P&L runs from inception (ledger openings included).
//   • Retained Earnings b/f = all profit before date_from; "Profit for the
//     period" = the P&L above. Together they equal the cumulative P&L at date_to,
//     so A = E + L whenever the trial balance balances.
//   • Contra ledgers (accumulated depreciation, drawings) keep their natural
//     sign, so they show in brackets as deductions; their sign is never forced.
// ═══════════════════════════════════════════════════════════════════════════════

export const UNCLASSIFIED_GROUP = 'Unclassified'
export const RETAINED_EARNINGS_GROUP = 'Retained Earnings'
export const RETAINED_EARNINGS_BF_LABEL = 'Retained Earnings b/f'
export const PROFIT_FOR_PERIOD_LABEL = 'Profit / (Loss) for the Period'
export const OPENING_DIFF_GROUP = 'Opening Balance Difference'
export const OPENING_DIFF_LABEL = 'Difference in Opening Balances (Suspense)'
export const COMPANY_NAME = 'SEVEN WAVES RESTAURANT (PVT) LTD'

// Corporate income tax is presented below Profit before tax (LKAS 1.82(d)).
// The live chart keeps 7043 inside "Admin and Operation Expenses", so it is
// identified by code, or by any expense group named like an income-tax group.
export const INCOME_TAX_CODES = ['7043']
const INCOME_TAX_GROUP_RE = /income\s*tax|tax\s*expense/i

// ── LKAS 1 layout ─────────────────────────────────────────────────────────────
// `groups` lists the canonical account_group values in presentation order.
// `fallback: true` marks the section that receives unknown / NULL groups of
// that ledger_type. `match` routes an unknown group name to this section
// instead of the fallback (e.g. a new "Non-Current Investments" group).
export const BS_LAYOUT = [
  {
    key: 'non_current_assets',
    label: 'NON-CURRENT ASSETS',
    side: 'assets',
    type: 'asset',
    normal: 'debit',
    groups: ['Assets-Non Current'],
    match: /non[\s-]*current/i,
  },
  {
    key: 'current_assets',
    label: 'CURRENT ASSETS',
    side: 'assets',
    type: 'asset',
    normal: 'debit',
    groups: ['Assets-Current', 'Assets-Current (Other Receivable)'],
    fallback: true,
  },
  {
    key: 'equity',
    label: 'EQUITY',
    side: 'equity_liabilities',
    type: 'equity',
    normal: 'credit',
    groups: ['Equity'],
    fallback: true,
  },
  {
    key: 'non_current_liabilities',
    label: 'NON-CURRENT LIABILITIES',
    side: 'equity_liabilities',
    type: 'liability',
    normal: 'credit',
    groups: ['Non Current Liabilities'],
    match: /non[\s-]*current/i,
  },
  {
    key: 'current_liabilities',
    label: 'CURRENT LIABILITIES',
    side: 'equity_liabilities',
    type: 'liability',
    normal: 'credit',
    groups: ['Current Liabilities'],
    fallback: true,
  },
]

export const PL_LAYOUT = [
  { key: 'revenue', label: 'REVENUE', type: 'income', normal: 'credit', groups: ['Revenue'] },
  { key: 'cost_of_sales', label: 'COST OF SALES', type: 'expense', normal: 'debit', groups: ['Cost of Sales'] },
  {
    key: 'other_income',
    label: 'OTHER INCOME',
    type: 'income',
    normal: 'credit',
    groups: ['Other Income'],
    fallback: true,
  },
  {
    key: 'admin_and_operation',
    label: 'ADMINISTRATIVE AND OPERATION EXPENSES',
    type: 'expense',
    normal: 'debit',
    groups: ['Admin and Operation Expenses'],
  },
  {
    key: 'selling_and_distribution',
    label: 'SELLING AND DISTRIBUTION EXPENSES',
    type: 'expense',
    normal: 'debit',
    groups: ['Selling and Distribution'],
  },
  { key: 'finance_expenses', label: 'FINANCE EXPENSES', type: 'expense', normal: 'debit', groups: ['Finance Expenses'] },
  {
    key: 'other_expenses',
    label: 'OTHER EXPENSES',
    type: 'expense',
    normal: 'debit',
    groups: ['Other Expenses'],
    fallback: true,
  },
  { key: 'tax', label: 'INCOME TAX EXPENSE', type: 'expense', normal: 'debit', groups: ['Income Tax Expense'] },
]

const CONTRA_NAME_RE = /accumulated\s+depreciation|provision\s+for\s+depreciation|drawing/i

// ── Number helpers ────────────────────────────────────────────────────────────
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const isZero = (n) => Math.abs(Number(n) || 0) < 0.005
const sum = (arr, f = (x) => x) => round2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0))
const cmpCode = (a, b) =>
  String(a.ledger_code || '').localeCompare(String(b.ledger_code || ''), undefined, { numeric: true })
const normGroup = (g) => String(g ?? '').trim()

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Per-ledger GL balances
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Signed GL figures per ledger (debit positive, credit negative).
 *
 * @param {object[]} ledgers  finance_ledgers rows
 * @param {object[]} entries  finance_cashbook_entries rows with entry_date <= date_to
 * @param {{date_from?: string, date_to?: string}} filters
 */
export function computeLedgerBalances(ledgers = [], entries = [], filters = {}) {
  const from = filters.date_from || null
  const to = filters.date_to || null

  const agg = new Map()
  for (const e of entries || []) {
    if (!e?.ledger_id) continue
    const d = String(e.entry_date || '').slice(0, 10)
    if (to && d && d > to) continue
    const a = agg.get(e.ledger_id) || { prior_dr: 0, prior_cr: 0, period_dr: 0, period_cr: 0, count: 0 }
    const dr = Number(e.debit_amount || 0)
    const cr = Number(e.credit_amount || 0)
    if (from && d && d < from) {
      a.prior_dr += dr
      a.prior_cr += cr
    } else {
      a.period_dr += dr
      a.period_cr += cr
    }
    a.count += 1
    agg.set(e.ledger_id, a)
  }

  return (ledgers || []).map((l) => {
    const opening = Number(l.opening_balance || 0)
    const openingNet = l.opening_balance_type === 'credit' ? -opening : opening
    const a = agg.get(l.id) || { prior_dr: 0, prior_cr: 0, period_dr: 0, period_cr: 0, count: 0 }

    // Ledger openings carry no effective date, so they sit before every entry:
    // with a date_from they are brought forward, without one they are part of
    // the (inception-to-date) period.
    const priorNet = from ? round2(openingNet + a.prior_dr - a.prior_cr) : 0
    const periodNet = round2((from ? 0 : openingNet) + a.period_dr - a.period_cr)
    const closingNet = round2(priorNet + periodNet)

    return {
      id: l.id,
      ledger_code: String(l.ledger_code ?? '').trim(),
      ledger_name: String(l.ledger_name ?? '').trim(),
      ledger_type: l.ledger_type,
      ledger_nature: l.ledger_nature,
      account_group: l.account_group == null ? null : normGroup(l.account_group),
      parent_id: l.parent_ledger_id ?? l.parent_id ?? null,
      is_active: l.is_active !== false,
      is_deleted: !!l.deleted_at,
      current_balance: Number(l.current_balance || 0),
      opening_debit: l.opening_balance_type === 'credit' ? 0 : opening,
      opening_credit: l.opening_balance_type === 'credit' ? opening : 0,
      opening_net: round2(openingNet),
      prior_net: priorNet,
      period_debit: round2(a.period_dr),
      period_credit: round2(a.period_cr),
      period_net: periodNet,
      closing_net: closingNet,
      closing_debit: closingNet > 0 ? closingNet : 0,
      closing_credit: closingNet < 0 ? -closingNet : 0,
      entry_count: a.count,
    }
  })
}

/** Ledgers that must appear: live ones, plus inactive/deleted ones still carrying a balance. */
export function selectReportableLedgers(rows) {
  return rows.filter((r) => {
    const hasBalance = !isZero(r.closing_net) || !isZero(r.period_net) || r.entry_count > 0
    if (r.is_deleted) return hasBalance
    return r.is_active || hasBalance
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Trial Balance
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Σ signed ledger openings (Dr +, Cr −). Postings are always balanced, so a
 * non-zero value means the opening balances entered on the ledgers do not
 * agree (Dr ≠ Cr). Like Tally's "Difference in opening balances" it is shown
 * as its own suspense line until finance corrects the openings — it never
 * absorbs a one-sided posting.
 */
export function openingDifference(rows) {
  return sum(selectReportableLedgers(rows), (r) => r.opening_net)
}

function openingDiffTbRow(diff) {
  // The suspense line takes the opposite side of the excess.
  return {
    id: 'opening-difference',
    ledger_code: '',
    ledger_name: OPENING_DIFF_LABEL,
    account_group: OPENING_DIFF_GROUP,
    synthetic: true,
    closing_net: round2(-diff),
    closing_debit: diff < 0 ? round2(-diff) : 0,
    closing_credit: diff > 0 ? round2(diff) : 0,
    entry_count: 0,
  }
}

export function buildTrialBalance(balanceRows) {
  const rows = selectReportableLedgers(balanceRows).sort(cmpCode)
  // One net closing balance per ledger, as at date_to.
  const displayRows = rows.filter((r) => !isZero(r.closing_net) || r.entry_count > 0)
  const openingDiff = openingDifference(balanceRows)
  if (!isZero(openingDiff)) displayRows.push(openingDiffTbRow(openingDiff))
  const totalDebit = sum(displayRows, (r) => r.closing_debit)
  const totalCredit = sum(displayRows, (r) => r.closing_credit)
  return {
    rows: displayRows,
    allLedgers: rows,
    totalDebit,
    totalCredit,
    difference: round2(totalDebit - totalCredit),
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
    opening_difference: openingDiff,
    generated_at: new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Classification
// ═══════════════════════════════════════════════════════════════════════════════

export function isIncomeTaxLedger(r) {
  return (
    r.ledger_type === 'expense' &&
    (INCOME_TAX_CODES.includes(r.ledger_code) || INCOME_TAX_GROUP_RE.test(r.account_group || ''))
  )
}

/**
 * Resolve the section + heading for a ledger.
 * @returns {{ section: object, group: string, status: 'mapped'|'unknown'|'unclassified' }|null}
 */
export function classifyLedger(r, layout) {
  const ofType = layout.filter((s) => s.type === r.ledger_type)
  if (!ofType.length) return null

  if (layout === PL_LAYOUT && isIncomeTaxLedger(r)) {
    return { section: layout.find((s) => s.key === 'tax'), group: 'Income Tax Expense', status: 'mapped' }
  }

  const group = normGroup(r.account_group)
  const fallback = ofType.find((s) => s.fallback) || ofType[ofType.length - 1]
  if (!group) return { section: fallback, group: UNCLASSIFIED_GROUP, status: 'unclassified' }

  const lower = group.toLowerCase()
  const exact = ofType.find((s) => s.groups.some((g) => g.toLowerCase() === lower))
  if (exact) {
    const canonical = exact.groups.find((g) => g.toLowerCase() === lower)
    return { section: exact, group: canonical, status: 'mapped' }
  }
  const matched = ofType.find((s) => s.match && s.match.test(group))
  return { section: matched || fallback, group, status: 'unknown' }
}

/** Amount in the section's natural sign: positive = normal balance, negative = contra. */
function presentAmount(net, normal) {
  return round2(normal === 'credit' ? -net : net)
}

function isContraLedger(r, normal) {
  if (CONTRA_NAME_RE.test(r.ledger_name)) return true
  return (normal === 'debit' && r.ledger_nature === 'credit') || (normal === 'credit' && r.ledger_nature === 'debit')
}

// ── Header / sub-ledger handling ─────────────────────────────────────────────
// finance_ledgers has no parent column today. Sub-ledgers are recognised by
// parent_ledger_id / parent_id when present, otherwise by the "<code>-<n>"
// convention (1002 "Bank Accounts" → 1002-1 … 1002-5). This generalises the
// old hardcoded `ledger_code !== '1002'` exclusion:
//   • the header becomes a sub-heading followed by its children and a subtotal;
//   • if the header's own GL balance equals the sum of its children it is a
//     roll-up copy and is NOT added again (prevents double counting);
//   • otherwise its own balance is shown as its own line and counted once.
function buildHeaderIndex(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const byCode = new Map(rows.map((r) => [r.ledger_code, r]))
  const parentOf = new Map()
  for (const r of rows) {
    let parent = r.parent_id ? byId.get(r.parent_id) : null
    if (!parent) {
      const m = /^(.+)-[^-]+$/.exec(r.ledger_code)
      if (m) parent = byCode.get(m[1]) || null
    }
    if (parent && parent.id !== r.id && parent.ledger_type === r.ledger_type) parentOf.set(r.id, parent.id)
  }
  return parentOf
}

function buildGroupItems(groupRows, normal, parentOf, warnings) {
  const rowsSorted = [...groupRows].sort(cmpCode)
  const inGroup = new Set(rowsSorted.map((r) => r.id))
  const children = new Map()
  for (const r of rowsSorted) {
    const p = parentOf.get(r.id)
    if (p && inGroup.has(p)) {
      if (!children.has(p)) children.set(p, [])
      children.get(p).push(r)
    }
  }

  const items = []
  let counted = 0
  const ledgerItem = (r, depth, nameSuffix = '') => {
    const amount = presentAmount(r.closing_view, normal)
    const is_contra = isContraLedger(r, normal)
    return {
      kind: 'ledger',
      id: r.id,
      code: r.ledger_code,
      name: r.ledger_name + nameSuffix,
      amount,
      depth,
      is_contra,
      is_inactive: !r.is_active || r.is_deleted,
    }
  }

  for (const r of rowsSorted) {
    const p = parentOf.get(r.id)
    if (p && inGroup.has(p)) continue // rendered under its header
    const kids = children.get(r.id)
    if (!kids) {
      items.push(ledgerItem(r, 0))
      counted += 1
      continue
    }
    const kidItems = kids.map((k) => ledgerItem(k, 1))
    const kidsTotal = sum(kidItems, (i) => i.amount)
    const own = presentAmount(r.closing_view, normal)
    const isRollup = !isZero(own) && Math.abs(own - kidsTotal) < 0.01
    items.push({ kind: 'header', id: r.id, code: r.ledger_code, name: r.ledger_name, amount: null, depth: 0 })
    items.push(...kidItems)
    counted += kids.length + 1
    if (isRollup) {
      warnings.push({
        level: 'warning',
        code: 'header_rollup',
        message: `${r.ledger_code} ${r.ledger_name} carries the same balance as its sub-ledgers; it is shown as a heading only and not counted twice.`,
      })
    } else if (!isZero(own)) {
      items.push({ ...ledgerItem(r, 1, ' (own balance)') })
      warnings.push({
        level: 'warning',
        code: 'header_own_balance',
        message: `Header ledger ${r.ledger_code} ${r.ledger_name} has its own postings (${own.toFixed(2)}) besides its sub-ledgers.`,
      })
    }
    const headerTotal = round2(kidsTotal + (isRollup ? 0 : own))
    items.push({ kind: 'header_total', id: `${r.id}-total`, code: '', name: `Total ${r.ledger_name}`, amount: headerTotal, depth: 0 })
  }

  const total = sum(items.filter((i) => i.kind === 'ledger'), (i) => i.amount)
  return { items, total, counted }
}

/**
 * Place ledgers into a layout. `valueKey` selects the GL figure used
 * ('closing_net' for the balance sheet, 'period_net' for the P&L).
 */
function placeLedgers(rows, layout, valueKey, warnings) {
  const parentOf = buildHeaderIndex(rows)
  const sections = layout.map((s) => ({
    key: s.key,
    label: s.label,
    side: s.side,
    normal: s.normal,
    groupMap: new Map(),
  }))
  const sectionByKey = new Map(sections.map((s) => [s.key, s]))
  const unknownSeen = new Map()

  for (const r of rows) {
    const c = classifyLedger(r, layout)
    if (!c) continue
    const sec = sectionByKey.get(c.section.key)
    if (!sec.groupMap.has(c.group)) sec.groupMap.set(c.group, { status: c.status, rows: [] })
    sec.groupMap.get(c.group).rows.push({ ...r, closing_view: r[valueKey] })
    if (c.status !== 'mapped') {
      const k = `${c.status}|${r.ledger_type}|${c.group}`
      if (!unknownSeen.has(k)) unknownSeen.set(k, { c, r, codes: [] })
      unknownSeen.get(k).codes.push(r.ledger_code)
    }
  }

  for (const { c, r, codes } of unknownSeen.values()) {
    warnings.push(
      c.status === 'unclassified'
        ? {
            level: 'error',
            code: 'unclassified',
            message: `${codes.length} ${r.ledger_type} ledger(s) have no account group and are shown under "${UNCLASSIFIED_GROUP}" in ${c.section.label}: ${codes.join(', ')}.`,
          }
        : {
            level: 'warning',
            code: 'unknown_group',
            message: `Account group "${c.group}" (${r.ledger_type}) is not part of the standard chart; it is shown as its own heading under ${c.section.label}: ${codes.join(', ')}.`,
          },
    )
  }

  let placed = 0
  const out = sections.map((sec, idx) => {
    const def = layout[idx]
    const order = (name) => {
      const i = def.groups.findIndex((g) => g === name)
      if (i >= 0) return i
      return name === UNCLASSIFIED_GROUP ? 10000 : 1000
    }
    const groupNames = [...sec.groupMap.keys()]
    // Canonical groups always render (even when empty) so every category heading
    // of the chart is visible.
    for (const g of def.groups) if (!groupNames.includes(g) && def.key !== 'tax') groupNames.push(g)
    groupNames.sort((a, b) => order(a) - order(b) || a.localeCompare(b))

    const groups = groupNames.map((name) => {
      const g = sec.groupMap.get(name) || { status: 'mapped', rows: [] }
      const { items, total, counted } = buildGroupItems(g.rows, sec.normal, parentOf, warnings)
      placed += counted
      return {
        key: `${sec.key}:${name}`,
        name,
        label: name,
        status: g.status,
        items,
        total,
      }
    })
    return {
      key: sec.key,
      label: sec.label,
      side: sec.side,
      normal: sec.normal,
      groups,
      total: sum(groups, (g) => g.total),
    }
  })
  return { sections: out, placed }
}

// ── Diagnostics shared by both statements ────────────────────────────────────

// 1001 "Main Cash" vs 10001 "MAIN CASH -ACC": the audit log shows 10001 was
// created on 2026-10-23 as the replacement for 1001 (deactivated two minutes
// earlier) and both carry the same 126,136.75 opening — i.e. the same cash is
// in the chart twice. That is a data decision (merge/zero one opening), not
// something the report may silently fix, so both ledgers are still presented
// and this check raises a warning for any pair of same-type ledgers in the
// same group with identical non-zero openings.
function duplicateOpeningWarnings(rows) {
  const warnings = []
  const seen = new Map()
  for (const r of rows) {
    if (isZero(r.opening_net)) continue
    const k = `${r.ledger_type}|${r.account_group}|${r.opening_net}`
    if (seen.has(k)) {
      const o = seen.get(k)
      warnings.push({
        level: 'warning',
        code: 'duplicate_opening',
        message: `${o.ledger_code} ${o.ledger_name} and ${r.ledger_code} ${r.ledger_name} carry the same opening balance (${Math.abs(r.opening_net).toFixed(2)}). If they are the same account, zero one opening in the chart of accounts.`,
      })
    } else seen.set(k, r)
  }
  return warnings
}

function ledgerStateWarnings(rows) {
  const warnings = []
  for (const r of rows) {
    if (isZero(r.closing_net)) continue
    if (r.is_deleted) {
      warnings.push({
        level: 'error',
        code: 'deleted_with_balance',
        message: `Deleted ledger ${r.ledger_code} ${r.ledger_name} still carries a balance and is included.`,
      })
    } else if (!r.is_active) {
      warnings.push({
        level: 'info',
        code: 'inactive_with_balance',
        message: `Inactive ledger ${r.ledger_code} ${r.ledger_name} still carries a balance and is included.`,
      })
    }
  }
  return warnings
}

function oppositeBalanceWarnings(sections) {
  const warnings = []
  for (const s of sections) {
    for (const g of s.groups) {
      for (const i of g.items) {
        if (i.kind !== 'ledger' || i.synthetic || i.is_contra || i.amount >= 0 || isZero(i.amount)) continue
        const what = s.side === 'assets' ? 'a credit (overdrawn) balance' : 'a debit balance'
        warnings.push({
          level: 'info',
          code: 'opposite_balance',
          message: `${i.code} ${i.name} under ${s.label} has ${what}; it is shown as a deduction in its own category.`,
        })
      }
    }
  }
  return warnings
}

function periodLabel(filters) {
  if (filters.date_from && filters.date_to) return `FOR THE PERIOD OF ${filters.date_from} TO ${filters.date_to}`
  if (filters.date_from) return `FROM ${filters.date_from} TO DATE`
  if (filters.date_to) return `FROM INCEPTION TO ${filters.date_to}`
  return 'FOR THE CURRENT FINANCIAL PERIOD'
}

const todayStr = () => new Date().toISOString().slice(0, 10)

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Statement of Profit or Loss
// ═══════════════════════════════════════════════════════════════════════════════

function plSummary(sections) {
  const t = Object.fromEntries(sections.map((s) => [s.key, s.total]))
  const incomeKeys = sections.filter((s, i) => PL_LAYOUT[i].type === 'income').map((s) => s.key)
  const expenseKeys = sections
    .filter((s, i) => PL_LAYOUT[i].type === 'expense' && s.key !== 'cost_of_sales' && s.key !== 'tax')
    .map((s) => s.key)
  const grossProfit = round2(t.revenue - t.cost_of_sales)
  const otherIncome = sum(incomeKeys.filter((k) => k !== 'revenue'), (k) => t[k])
  const operatingExpenses = sum(expenseKeys, (k) => t[k])
  const profitBeforeTax = round2(grossProfit + otherIncome - operatingExpenses)
  const tax = t.tax || 0
  return {
    totals: t,
    grossProfit,
    otherIncome,
    operatingExpenses,
    profitBeforeTax,
    tax,
    netProfit: round2(profitBeforeTax - tax),
  }
}

/** Net profit for ledgers using a GL figure key (period_net or prior_net). */
export function computeProfit(balanceRows, valueKey = 'period_net') {
  const rows = balanceRows.filter((r) => r.ledger_type === 'income' || r.ledger_type === 'expense')
  const income = sum(rows.filter((r) => r.ledger_type === 'income'), (r) => -r[valueKey])
  const expense = sum(rows.filter((r) => r.ledger_type === 'expense'), (r) => r[valueKey])
  return round2(income - expense)
}

export function buildProfitLoss(balanceRows, filters = {}, options = {}) {
  const warnings = []
  const rows = selectReportableLedgers(balanceRows).filter(
    (r) => r.ledger_type === 'income' || r.ledger_type === 'expense',
  )
  const { sections, placed } = placeLedgers(rows, PL_LAYOUT, 'period_net', warnings)
  warnings.push(...ledgerStateWarnings(rows))
  const s = plSummary(sections)

  // Ordered presentation: sections interleaved with LKAS 1 subtotals.
  const sec = (k) => sections.find((x) => x.key === k)
  const totalLabel = {
    revenue: 'TOTAL REVENUE',
    cost_of_sales: 'TOTAL COST OF SALES',
    other_income: 'TOTAL OTHER INCOME',
    admin_and_operation: 'TOTAL ADMINISTRATIVE AND OPERATION EXPENSES',
    selling_and_distribution: 'TOTAL SELLING AND DISTRIBUTION EXPENSES',
    finance_expenses: 'TOTAL FINANCE EXPENSES',
    other_expenses: 'TOTAL OTHER EXPENSES',
    tax: 'TOTAL INCOME TAX EXPENSE',
  }
  for (const x of sections) x.total_label = totalLabel[x.key]

  const layout = [
    { kind: 'section', section: sec('revenue') },
    { kind: 'section', section: sec('cost_of_sales') },
    { kind: 'subtotal', key: 'gross_profit', label: 'GROSS PROFIT', amount: s.grossProfit, level: 'major' },
    { kind: 'section', section: sec('other_income') },
    { kind: 'section', section: sec('admin_and_operation') },
    { kind: 'section', section: sec('selling_and_distribution') },
    { kind: 'section', section: sec('finance_expenses') },
    { kind: 'section', section: sec('other_expenses') },
    { kind: 'subtotal', key: 'profit_before_tax', label: 'PROFIT BEFORE TAX', amount: s.profitBeforeTax, level: 'major' },
    { kind: 'section', section: sec('tax') },
    {
      kind: 'subtotal',
      key: 'net_profit',
      label: s.netProfit >= 0 ? 'PROFIT FOR THE PERIOD' : 'LOSS FOR THE PERIOD',
      amount: s.netProfit,
      level: 'grand',
    },
  ]

  if (placed !== rows.length) {
    warnings.push({
      level: 'error',
      code: 'placement_mismatch',
      message: `${rows.length - placed} P&L ledger(s) could not be placed.`,
    })
  }

  const t = s.totals
  const sectionCompat = (k, label) => {
    const x = sec(k)
    return { label, items: flatItems(x), total: x.total }
  }
  const financeAndOther = ['finance_expenses', 'other_expenses'].map(sec)

  return {
    company_name: options.company_name || COMPANY_NAME,
    title: 'STATEMENT OF PROFIT OR LOSS',
    period: periodLabel(filters),
    date_from: filters.date_from || null,
    date_to: filters.date_to || null,
    sections,
    layout,
    // ── Backward-compatible keys (pre-sections consumers) ──
    revenue: sectionCompat('revenue', 'REVENUE'),
    other_income: sectionCompat('other_income', 'OTHER INCOME'),
    total_income: round2(t.revenue + s.otherIncome),
    cost_of_sales: sectionCompat('cost_of_sales', 'COST OF SALES'),
    gross_profit: s.grossProfit,
    expenses: {
      admin_and_operation: sectionCompat('admin_and_operation', 'ADMINISTRATIVE AND OPERATION EXPENSES'),
      selling_and_distribution: sectionCompat('selling_and_distribution', 'SELLING AND DISTRIBUTION EXPENSES'),
      finance_and_other: {
        label: 'FINANCE AND OTHER EXPENSES',
        items: financeAndOther.flatMap(flatItems),
        total: sum(financeAndOther, (x) => x.total),
      },
      total_expenses: s.operatingExpenses,
    },
    net_profit_before_tax: s.profitBeforeTax,
    tax: { label: 'INCOME TAX EXPENSE', amount: s.tax, items: flatItems(sec('tax')) },
    net_profit: s.netProfit,
    checks: {
      ledger_count: rows.length,
      placed_count: placed,
      warnings,
    },
    warnings,
    generated_at: new Date().toISOString(),
  }
}

/** Ledger lines of a section, flattened (headers/subtotals removed). */
export function flatItems(section) {
  return (section?.groups || []).flatMap((g) =>
    g.items.filter((i) => i.kind === 'ledger').map((i) => ({ code: i.code, name: i.name, amount: i.amount })),
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Statement of Financial Position
// ═══════════════════════════════════════════════════════════════════════════════

export function buildBalanceSheet(balanceRows, filters = {}, options = {}) {
  const warnings = []
  const reportable = selectReportableLedgers(balanceRows)
  const rows = reportable.filter((r) => ['asset', 'liability', 'equity'].includes(r.ledger_type))
  const { sections, placed } = placeLedgers(rows, BS_LAYOUT, 'closing_net', warnings)

  // Retained earnings: everything the P&L ledgers accumulated before date_from
  // is brought forward; the period's result is shown on its own line.
  const retainedBf = filters.date_from ? computeProfit(reportable, 'prior_net') : 0
  const profitForPeriod = computeProfit(reportable, 'period_net')
  const equity = sections.find((s) => s.key === 'equity')
  const reItems = [
    {
      kind: 'ledger',
      id: 'retained-earnings-bf',
      code: '',
      name: RETAINED_EARNINGS_BF_LABEL,
      amount: retainedBf,
      depth: 0,
      is_contra: false,
      synthetic: true,
    },
    {
      kind: 'ledger',
      id: 'profit-for-period',
      code: '',
      name: PROFIT_FOR_PERIOD_LABEL,
      amount: profitForPeriod,
      depth: 0,
      is_contra: false,
      synthetic: true,
    },
  ]
  equity.groups.push({
    key: 'equity:retained-earnings',
    name: RETAINED_EARNINGS_GROUP,
    label: RETAINED_EARNINGS_GROUP,
    status: 'computed',
    items: reItems,
    total: round2(retainedBf + profitForPeriod),
  })

  // Unbalanced ledger openings → visible suspense line in equity (see openingDifference)
  const openingDiff = openingDifference(reportable)
  if (!isZero(openingDiff)) {
    equity.groups.push({
      key: 'equity:opening-difference',
      name: OPENING_DIFF_GROUP,
      label: OPENING_DIFF_GROUP,
      status: 'computed',
      items: [
        {
          kind: 'ledger',
          id: 'opening-difference',
          code: '',
          name: OPENING_DIFF_LABEL,
          amount: openingDiff,
          depth: 0,
          is_contra: false,
          synthetic: true,
        },
      ],
      total: openingDiff,
    })
  }
  equity.total = sum(equity.groups, (g) => g.total)

  const labels = {
    non_current_assets: 'TOTAL NON-CURRENT ASSETS',
    current_assets: 'TOTAL CURRENT ASSETS',
    equity: 'TOTAL EQUITY',
    non_current_liabilities: 'TOTAL NON-CURRENT LIABILITIES',
    current_liabilities: 'TOTAL CURRENT LIABILITIES',
  }
  for (const x of sections) x.total_label = labels[x.key]

  const sec = (k) => sections.find((x) => x.key === k)
  const totalAssets = round2(sec('non_current_assets').total + sec('current_assets').total)
  const totalNcl = sec('non_current_liabilities').total
  const totalCl = sec('current_liabilities').total
  const totalLiabilities = round2(totalNcl + totalCl)
  const totalEquityLiabilities = round2(equity.total + totalLiabilities)
  const difference = round2(totalAssets - totalEquityLiabilities)
  const isBalanced = Math.abs(difference) < 0.01

  const tbDebit = round2(sum(reportable, (r) => r.closing_debit) + (openingDiff < 0 ? -openingDiff : 0))
  const tbCredit = round2(sum(reportable, (r) => r.closing_credit) + (openingDiff > 0 ? openingDiff : 0))
  const tbBalanced = Math.abs(tbDebit - tbCredit) < 0.01

  warnings.push(...ledgerStateWarnings(rows), ...duplicateOpeningWarnings(rows), ...oppositeBalanceWarnings(sections))
  if (!isZero(openingDiff)) {
    warnings.unshift({
      level: 'error',
      code: 'opening_unbalanced',
      message: `Ledger opening balances do not agree: debit openings exceed credit openings by ${openingDiff.toFixed(2)} (negative = credit excess). The difference is shown under Equity as "${OPENING_DIFF_LABEL}" until the opening balances are corrected in Finance → Ledgers.`,
    })
  }
  if (!tbBalanced) {
    warnings.unshift({
      level: 'error',
      code: 'tb_unbalanced',
      message: `The general ledger is not balanced (Dr ${tbDebit.toFixed(2)} vs Cr ${tbCredit.toFixed(2)}, difference ${(tbDebit - tbCredit).toFixed(2)}). Opening balances or postings are one-sided.`,
    })
  }
  if (placed !== rows.length) {
    warnings.push({
      level: 'error',
      code: 'placement_mismatch',
      message: `${rows.length - placed} balance-sheet ledger(s) could not be placed.`,
    })
  }

  const layout = [
    { kind: 'heading', label: 'ASSETS' },
    { kind: 'section', section: sec('non_current_assets') },
    { kind: 'section', section: sec('current_assets') },
    { kind: 'subtotal', key: 'total_assets', label: 'TOTAL ASSETS', amount: totalAssets, level: 'grand' },
    { kind: 'heading', label: 'EQUITY AND LIABILITIES' },
    { kind: 'section', section: equity },
    { kind: 'section', section: sec('non_current_liabilities') },
    { kind: 'section', section: sec('current_liabilities') },
    { kind: 'subtotal', key: 'total_liabilities', label: 'TOTAL LIABILITIES', amount: totalLiabilities, level: 'major' },
    {
      kind: 'subtotal',
      key: 'total_equity_liabilities',
      label: 'TOTAL EQUITY AND LIABILITIES',
      amount: totalEquityLiabilities,
      level: 'grand',
    },
  ]

  const compat = (k, label) => ({ label, items: flatItems(sec(k)), total: sec(k).total })
  const equityCompat = compat('equity', 'EQUITY')

  return {
    company_name: options.company_name || COMPANY_NAME,
    title: 'STATEMENT OF FINANCIAL POSITION',
    as_of_date: `AS AT ${filters.date_to || todayStr()}`,
    date_from: filters.date_from || null,
    date_to: filters.date_to || null,
    sections,
    layout,
    // ── Backward-compatible keys ──
    assets: {
      non_current: compat('non_current_assets', 'NON-CURRENT ASSETS'),
      current: compat('current_assets', 'CURRENT ASSETS'),
      total_assets: totalAssets,
    },
    equity_and_liabilities: {
      equity: equityCompat,
      non_current_liabilities: compat('non_current_liabilities', 'NON-CURRENT LIABILITIES'),
      current_liabilities: compat('current_liabilities', 'CURRENT LIABILITIES'),
      total_liabilities_equity: totalEquityLiabilities,
    },
    retained_earnings_bf: retainedBf,
    profit_for_period: profitForPeriod,
    opening_difference: openingDiff,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: equity.total,
    total_equity_liabilities: totalEquityLiabilities,
    difference,
    is_balanced: isBalanced,
    checks: {
      ledger_count: rows.length,
      placed_count: placed,
      tb_debit: tbDebit,
      tb_credit: tbCredit,
      tb_balanced: tbBalanced,
      warnings,
    },
    warnings,
    generated_at: new Date().toISOString(),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Presentation helpers shared by the viewer and the Excel/PDF export
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A category gets its own sub-heading + subtotal whenever its section holds
 * more than one category, or the category is not one of the standard chart's.
 * (A section with a single standard category uses the section heading itself.)
 */
export function showStatementGroupHeading(section, group) {
  return (section?.groups || []).length > 1 || group.status !== 'mapped'
}

/**
 * Lines of a category, optionally without zero-balance ledgers. Category
 * headings and totals are never hidden; a header ledger is hidden only when
 * it and all its sub-ledgers are zero.
 */
export function visibleStatementItems(group, hideZero = false) {
  const items = group?.items || []
  if (!hideZero) return items
  const out = []
  let headerIdx = -1
  for (const it of items) {
    if (it.kind === 'header') {
      headerIdx = out.length
      out.push(it)
    } else if (it.kind === 'header_total') {
      if (isZero(it.amount) && out.length === headerIdx + 1) out.pop()
      else out.push(it)
      headerIdx = -1
    } else if (!isZero(it.amount)) {
      out.push(it)
    }
  }
  return out
}
