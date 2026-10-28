// ═══════════════════════════════════════════════════════════════════════════════
// Finance ledger / account integrity helpers (pure, unit-testable).
//
// GL of record = finance_cashbook_entries. A ledger's balance is
//   signed opening (debit +, credit −) + Σ(debit − credit)      (#122 rule)
// Ledger / account registration and the dashboard use these helpers so the
// numbers they show agree with the Financial Statements builder.
// ═══════════════════════════════════════════════════════════════════════════════

import { BS_LAYOUT, PL_LAYOUT, classifyLedger, round2 } from './finance-statements.builder'

export const LEDGER_TYPES = ['asset', 'liability', 'equity', 'income', 'expense']

/** Ledger types an account (cash, bank, wallet …) may be linked to. */
export const ACCOUNT_LEDGER_TYPES = ['asset']

const isZero = (n) => Math.abs(Number(n) || 0) < 0.005

/** Signed opening: debit +, credit −. */
export function signedOpening(ledger) {
  const amt = Number(ledger?.opening_balance) || 0
  return round2(ledger?.opening_balance_type === 'credit' ? -amt : amt)
}

/** Canonical account_group values the statements builder recognises for a ledger_type. */
export function accountGroupOptions(ledgerType) {
  const layout = ['asset', 'liability', 'equity'].includes(ledgerType) ? BS_LAYOUT : PL_LAYOUT
  const out = []
  for (const s of layout) {
    if (ledgerType && s.type !== ledgerType) continue
    for (const g of s.groups) if (!out.includes(g)) out.push(g)
  }
  if (!ledgerType || ledgerType === 'expense') {
    if (!out.includes('Income Tax Expense')) out.push('Income Tax Expense')
  }
  return out
}

/** All canonical groups mapped to the ledger_type(s) they belong to. */
function groupOwners() {
  const owners = new Map()
  for (const s of [...BS_LAYOUT, ...PL_LAYOUT]) {
    for (const g of s.groups) {
      const k = g.toLowerCase()
      if (!owners.has(k)) owners.set(k, new Set())
      owners.get(k).add(s.type)
    }
  }
  return owners
}
const OWNERS = groupOwners()

/**
 * Why a ledger's ledger_type / account_group combination will be mis-presented
 * on the statements, or null when it is fine.
 *  - 'mismatch'     : the group belongs to a different ledger_type
 *                     (e.g. equity ledger "Director Drawings" in "Assets-Current")
 *  - 'unclassified' : no account group
 *  - 'unknown'      : group is not part of the standard chart
 */
export function ledgerClassificationIssue(ledger) {
  if (!ledger) return null
  if (!LEDGER_TYPES.includes(ledger.ledger_type)) {
    return { kind: 'invalid_type', message: `Unknown ledger type "${ledger.ledger_type ?? ''}".` }
  }
  const group = String(ledger.account_group ?? '').trim()
  const owners = OWNERS.get(group.toLowerCase())
  if (group && owners && !owners.has(ledger.ledger_type)) {
    return {
      kind: 'mismatch',
      message:
        `Type "${ledger.ledger_type}" does not match group "${group}" (a ${[...owners].join('/')} group). ` +
        `The statements place it by its type (${ledger.ledger_type}) — fix the type or the group.`,
    }
  }
  const layout = ['asset', 'liability', 'equity'].includes(ledger.ledger_type) ? BS_LAYOUT : PL_LAYOUT
  const c = classifyLedger({ ...ledger, account_group: group || null }, layout)
  if (!c) return null
  if (c.status === 'unclassified') {
    return { kind: 'unclassified', message: 'No account group — shown under "Unclassified" on the statements.' }
  }
  if (c.status === 'unknown') {
    return {
      kind: 'unknown',
      message: `Group "${group}" is not a standard statement group; it is shown as its own heading under ${c.section.label}.`,
    }
  }
  return null
}

/**
 * Σ debit / credit per ledger from cashbook legs.
 * @returns {Map<string, {dr:number, cr:number, count:number}>}
 */
export function sumEntriesByLedger(entries = []) {
  const m = new Map()
  for (const e of entries || []) {
    if (!e?.ledger_id) continue
    const a = m.get(e.ledger_id) || { dr: 0, cr: 0, count: 0 }
    a.dr += Number(e.debit_amount) || 0
    a.cr += Number(e.credit_amount) || 0
    a.count += 1
    m.set(e.ledger_id, a)
  }
  return m
}

/** GL balance (signed, debit +) = signed opening + Σ(Dr − Cr). */
export function recomputeLedgerBalance(ledger, totals) {
  const t = totals || { dr: 0, cr: 0 }
  return round2(signedOpening(ledger) + (Number(t.dr) || 0) - (Number(t.cr) || 0))
}

/**
 * Annotate ledgers with their GL balance, drift against the stored
 * current_balance and any classification issue.
 */
export function annotateLedgers(ledgers = [], totalsByLedger = new Map()) {
  return (ledgers || []).map((l) => {
    const t = totalsByLedger.get(l.id)
    const gl = recomputeLedgerBalance(l, t)
    const stored = round2(Number(l.current_balance) || 0)
    return {
      ...l,
      gl_balance: gl,
      gl_entry_count: t?.count || 0,
      balance_drift: isZero(gl - stored) ? 0 : round2(stored - gl),
      classification_issue: ledgerClassificationIssue(l),
    }
  })
}

/**
 * Company-wide opening difference Σ signed openings over non-deleted ledgers.
 * Must be 0 (Dr = Cr); otherwise the statements show a suspense line.
 */
export function openingBalanceDifference(ledgers = [], { excludeId = null, override = null } = {}) {
  let total = 0
  let dr = 0
  let cr = 0
  for (const l of ledgers || []) {
    if (l?.deleted_at) continue
    const row = excludeId && l.id === excludeId ? null : l
    if (!row) continue
    const s = signedOpening(row)
    total += s
    if (s > 0) dr += s
    else cr -= s
  }
  if (override) {
    const s = signedOpening(override)
    total += s
    if (s > 0) dr += s
    else cr -= s
  }
  return { difference: round2(total), debit: round2(dr), credit: round2(cr) }
}

/** Format a signed (debit +) amount as "1,234.00 Dr" / "1,234.00 Cr". */
export function formatDrCr(n) {
  const v = round2(n)
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (isZero(v)) return '0.00'
  return `${abs} ${v > 0 ? 'Dr' : 'Cr'}`
}

/**
 * Problems with an account → ledger link (null when fine).
 * @param {object} account   finance_accounts row (ledger_id, id)
 * @param {object} ledger    the linked finance_ledgers row
 * @param {object[]} accounts all non-deleted accounts (to detect sharing)
 */
export function accountLinkIssue(account, ledger, accounts = []) {
  if (!account?.ledger_id) return 'No linked ledger — postings for this account cannot reach the GL.'
  if (!ledger) return 'Linked ledger not found (deleted?).'
  if (ledger.deleted_at) return `Linked ledger ${ledger.ledger_code} is deleted.`
  if (!ACCOUNT_LEDGER_TYPES.includes(ledger.ledger_type)) {
    return `Linked to ${ledger.ledger_code} "${ledger.ledger_name}" which is a ${ledger.ledger_type} ledger — cash/bank accounts must use an asset ledger.`
  }
  const sharing = (accounts || []).filter(
    (a) => a.id !== account.id && a.ledger_id === account.ledger_id && !a.deleted_at,
  )
  if (sharing.length) {
    return `Ledger ${ledger.ledger_code} is also linked to ${sharing.map((a) => a.registered_name).join(', ')} — one account per ledger, otherwise their balances cannot be separated.`
  }
  return null
}
