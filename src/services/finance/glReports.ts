// ═══════════════════════════════════════════════════════════════════════════════
// GL-backed reports for the Expenses and Tax pages.
//
// The GL of record is finance_cashbook_entries + finance_ledgers. The legacy
// expense_entries / tax_transactions tables are not written by any posting
// flow (both are empty on live), so these pages read GL movements instead:
//   • Expenses = movements on ledgers with ledger_type = 'expense'
//     (recorded through Pay Vouchers → post_finance_voucher, payroll, POS COGS…)
//   • VAT      = movements on 2006 Output VAT Payable and 1010 Input VAT.
// Builders are pure (unit tested); fetchers page past PostgREST's 1000-row cap.
// ═══════════════════════════════════════════════════════════════════════════════
import { supabase } from 'src/boot/supabase'

export const GL_PAGE_SIZE = 1000
export const OUTPUT_VAT_LEDGER_CODE = '2006'
export const INPUT_VAT_LEDGER_CODE = '1010'
export const COST_OF_SALES_GROUP = 'Cost of Sales'

export interface GlLedger {
  id: string
  ledger_code: string | null
  ledger_name: string | null
  ledger_type?: string | null
  account_group?: string | null
  current_balance?: number | string | null
}

export interface GlEntry {
  id: string
  ledger_id: string
  entry_date: string
  description?: string | null
  source_type?: string | null
  source_id?: string | null
  branch_id?: string | null
  debit_amount?: number | string | null
  credit_amount?: number | string | null
}

export interface GlFilters {
  dateFrom?: string | null
  dateTo?: string | null
  branchId?: string | null
}

const cents = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export async function fetchAllGlPages<T = any>(build: () => any, pageSize = GL_PAGE_SIZE): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) throw new Error(error.message || String(error))
    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

/** Cashbook (GL) entries of the given ledgers inside the period, oldest first. */
export async function fetchGlEntries(ledgerIds: string[], filters: GlFilters = {}): Promise<GlEntry[]> {
  if (!ledgerIds.length) return []
  return fetchAllGlPages<GlEntry>(() => {
    let q = supabase
      .from('finance_cashbook_entries')
      .select('id, ledger_id, entry_date, description, source_type, source_id, branch_id, debit_amount, credit_amount')
      .in('ledger_id', ledgerIds)
    if (filters.dateFrom) q = q.gte('entry_date', filters.dateFrom)
    if (filters.dateTo) q = q.lte('entry_date', filters.dateTo)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    return q.order('entry_date', { ascending: true }).order('id', { ascending: true })
  })
}

// ── Expenses ─────────────────────────────────────────────────────────────────
export async function fetchExpenseLedgers(): Promise<GlLedger[]> {
  const { data, error } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, ledger_type, account_group, current_balance')
    .eq('ledger_type', 'expense')
    .is('deleted_at', null)
    .order('ledger_code')
  if (error) throw new Error(error.message)
  return (data || []) as GlLedger[]
}

export interface ExpenseRow {
  id: string
  entry_date: string
  ledger_id: string
  ledger_code: string
  ledger_name: string
  account_group: string
  description: string
  source_type: string
  source_id: string | null
  debit: number
  credit: number
  /** debit − credit: positive = expense incurred, negative = reversal/refund */
  net: number
}

export interface ExpenseLedgerSummary {
  ledger_id: string
  ledger_code: string
  ledger_name: string
  account_group: string
  debit: number
  credit: number
  net: number
  count: number
}

export interface ExpenseReport {
  rows: ExpenseRow[]
  byLedger: ExpenseLedgerSummary[]
  total: number
  totalDebit: number
  totalCredit: number
}

export function buildExpenseReport(ledgers: GlLedger[], entries: GlEntry[]): ExpenseReport {
  const byId = new Map(ledgers.map((l) => [l.id, l]))
  const sums = new Map<string, { d: number; c: number; n: number }>()
  const rows: ExpenseRow[] = []
  let td = 0
  let tc = 0
  for (const e of entries) {
    const l = byId.get(e.ledger_id)
    if (!l) continue
    const d = cents(e.debit_amount)
    const c = cents(e.credit_amount)
    td += d
    tc += c
    const s = sums.get(l.id) || { d: 0, c: 0, n: 0 }
    s.d += d
    s.c += c
    s.n++
    sums.set(l.id, s)
    rows.push({
      id: e.id,
      entry_date: e.entry_date,
      ledger_id: l.id,
      ledger_code: l.ledger_code || '',
      ledger_name: l.ledger_name || '',
      account_group: l.account_group || 'Unclassified',
      description: e.description || '',
      source_type: e.source_type || '',
      source_id: e.source_id || null,
      debit: d / 100,
      credit: c / 100,
      net: (d - c) / 100,
    })
  }
  const byLedger: ExpenseLedgerSummary[] = []
  for (const l of ledgers) {
    const s = sums.get(l.id)
    if (!s) continue
    byLedger.push({
      ledger_id: l.id,
      ledger_code: l.ledger_code || '',
      ledger_name: l.ledger_name || '',
      account_group: l.account_group || 'Unclassified',
      debit: s.d / 100,
      credit: s.c / 100,
      net: (s.d - s.c) / 100,
      count: s.n,
    })
  }
  byLedger.sort((a, b) => b.net - a.net || a.ledger_code.localeCompare(b.ledger_code))
  // newest first for the register
  rows.sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0))
  return { rows, byLedger, total: (td - tc) / 100, totalDebit: td / 100, totalCredit: tc / 100 }
}

export interface ExpenseReportFilters extends GlFilters {
  ledgerId?: string | null
  includeCostOfSales?: boolean
}

export async function fetchExpenseReport(
  filters: ExpenseReportFilters = {},
): Promise<ExpenseReport & { ledgers: GlLedger[] }> {
  const all = await fetchExpenseLedgers()
  let ledgers = filters.includeCostOfSales ? all : all.filter((l) => l.account_group !== COST_OF_SALES_GROUP)
  if (filters.ledgerId) ledgers = ledgers.filter((l) => l.id === filters.ledgerId)
  const entries = await fetchGlEntries(
    ledgers.map((l) => l.id),
    filters,
  )
  return { ...buildExpenseReport(ledgers, entries), ledgers: all }
}

// ── VAT ──────────────────────────────────────────────────────────────────────
export interface VatReport {
  outputLedgerFound: boolean
  inputLedgerFound: boolean
  /** 2006 credits − debits in the period (VAT charged on sales) */
  outputVat: number
  outputCredits: number
  outputDebits: number
  /** 1010 debits − credits in the period (recoverable VAT on purchases) */
  inputVat: number
  inputDebits: number
  inputCredits: number
  /** output − input: positive = payable to the tax authority */
  netPayable: number
  /** Current (all-time) ledger balances, liability shown positive for 2006 */
  outputLedgerBalance: number
  inputLedgerBalance: number
  rows: (GlEntry & { ledger_code: string; ledger_name: string; side: 'output' | 'input'; debit: number; credit: number })[]
  byMonth: { month: string; output: number; input: number; net: number }[]
}

export function buildVatReport(ledgers: GlLedger[], entries: GlEntry[]): VatReport {
  const out = ledgers.find((l) => l.ledger_code === OUTPUT_VAT_LEDGER_CODE)
  const inp = ledgers.find((l) => l.ledger_code === INPUT_VAT_LEDGER_CODE)
  let oc = 0
  let od = 0
  let id = 0
  let ic = 0
  const months = new Map<string, { o: number; i: number }>()
  const rows: VatReport['rows'] = []
  for (const e of entries) {
    const side = out && e.ledger_id === out.id ? 'output' : inp && e.ledger_id === inp.id ? 'input' : null
    if (!side) continue
    const d = cents(e.debit_amount)
    const c = cents(e.credit_amount)
    const m = (e.entry_date || '').slice(0, 7)
    const mm = months.get(m) || { o: 0, i: 0 }
    if (side === 'output') {
      oc += c
      od += d
      mm.o += c - d
    } else {
      id += d
      ic += c
      mm.i += d - c
    }
    months.set(m, mm)
    const l = side === 'output' ? out! : inp!
    rows.push({
      ...e,
      ledger_code: l.ledger_code || '',
      ledger_name: l.ledger_name || '',
      side,
      debit: d / 100,
      credit: c / 100,
    })
  }
  rows.sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0))
  const byMonth = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, output: v.o / 100, input: v.i / 100, net: (v.o - v.i) / 100 }))
  const output = oc - od
  const input = id - ic
  return {
    outputLedgerFound: !!out,
    inputLedgerFound: !!inp,
    outputVat: output / 100,
    outputCredits: oc / 100,
    outputDebits: od / 100,
    inputVat: input / 100,
    inputDebits: id / 100,
    inputCredits: ic / 100,
    netPayable: (output - input) / 100,
    // current_balance is stored Dr-positive: a credit (liability) balance is negative
    outputLedgerBalance: out ? -cents(out.current_balance) / 100 : 0,
    inputLedgerBalance: inp ? cents(inp.current_balance) / 100 : 0,
    rows,
    byMonth,
  }
}

/**
 * VAT on posted supplier bills in the period. Known gap: AP bills post gross
 * to 1005 Inventory, so this tax is NOT in 1010 and is not being recovered.
 */
export function sumApBillTax(bills: { tax_amount?: unknown }[]): { count: number; total: number } {
  let t = 0
  let n = 0
  for (const b of bills) {
    const c = cents(b.tax_amount)
    if (c === 0) continue
    t += c
    n++
  }
  return { count: n, total: t / 100 }
}

export async function fetchVatReport(
  filters: GlFilters = {},
): Promise<VatReport & { apBillTax: { count: number; total: number } }> {
  const { data, error } = await supabase
    .from('finance_ledgers')
    .select('id, ledger_code, ledger_name, ledger_type, account_group, current_balance')
    .in('ledger_code', [OUTPUT_VAT_LEDGER_CODE, INPUT_VAT_LEDGER_CODE])
    .is('deleted_at', null)
  if (error) throw new Error(error.message)
  const ledgers = (data || []) as GlLedger[]

  const [entries, bills] = await Promise.all([
    fetchGlEntries(
      ledgers.map((l) => l.id),
      filters,
    ),
    fetchAllGlPages<{ tax_amount: unknown }>(() => {
      let q = supabase
        .from('ap_invoices')
        .select('id, tax_amount')
        .in('status', ['posted', 'partial_paid', 'paid'])
        .gt('tax_amount', 0)
      if (filters.dateFrom) q = q.gte('doc_date', filters.dateFrom)
      if (filters.dateTo) q = q.lte('doc_date', filters.dateTo)
      if (filters.branchId) q = q.eq('branch_id', filters.branchId)
      return q.order('id')
    }).catch(() => []),
  ])
  return { ...buildVatReport(ledgers, entries), apBillTax: sumApBillTax(bills) }
}
