/**
 * Pure helpers for POS SPLIT payments (pos_split_pay) and drawer payouts
 * (fn_pos_cash_payout) — supabase/finance_pos_sales_gl_145.sql §9 / §10.
 *
 * pos_split_pay(p_order_id, p_tenders [{method, amount}], p_shift_id) stores each
 * tender, books it to its own account and records the shift payment per tender
 * itself — the client must NOT call shiftStore.recordPayment for a split.
 */

import { isMissingRpcError } from './creditCustomer'

export const TENDER_METHODS = ['cash', 'card', 'visa', 'master', 'qr', 'bank', 'credit'] as const
export type TenderMethod = (typeof TENDER_METHODS)[number]

export const TENDER_LABELS: Record<TenderMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  visa: 'Visa',
  master: 'Master',
  qr: 'QR / Online',
  bank: 'Bank Transfer',
  credit: 'Credit (Account)',
}

/** Options for a q-select ({label, value}). */
export const TENDER_OPTIONS = TENDER_METHODS.map((m) => ({ label: TENDER_LABELS[m], value: m }))

export interface TenderLine {
  method?: string | null
  amount?: number | string | null
}

export interface Tender {
  method: TenderMethod
  amount: number
}

const ALIASES: Record<string, TenderMethod> = {
  online: 'qr',
  'qr pay': 'qr',
  qr_pay: 'qr',
  uber_eats: 'qr',
  uber: 'qr',
  pickme: 'qr',
  website: 'qr',
  'credit card': 'card',
  credit_card: 'card',
  mastercard: 'master',
  transfer: 'bank',
  bank_transfer: 'bank',
  'bank transfer': 'bank',
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Map a UI / legacy label to a pos_split_pay tender method, or null if unknown. */
export function normalizeTenderMethod(method: unknown): TenderMethod | null {
  const m = String(method ?? '').trim().toLowerCase()
  if (!m) return null
  if ((TENDER_METHODS as readonly string[]).includes(m)) return m as TenderMethod
  return ALIASES[m] || null
}

export interface NormalizedTenders {
  tenders: Tender[]
  errors: string[]
}

/**
 * Normalise UI lines → pos_split_pay tenders: known methods only, amounts
 * rounded to 2dp, zero lines dropped, negatives rejected.
 */
export function normalizeTenders(lines: TenderLine[] | null | undefined): NormalizedTenders {
  const tenders: Tender[] = []
  const errors: string[] = []
  for (const l of Array.isArray(lines) ? lines : []) {
    const amount = round2(num(l?.amount))
    if (amount === 0) continue
    const method = normalizeTenderMethod(l?.method)
    if (!method) {
      errors.push(`Unknown payment method "${l?.method ?? ''}"`)
      continue
    }
    if (amount < 0) {
      errors.push('Payment amounts must be positive')
      continue
    }
    tenders.push({ method, amount })
  }
  if (tenders.length === 0 && errors.length === 0) errors.push('Add at least one payment line')
  return { tenders, errors }
}

export function tendersTotal(lines: TenderLine[] | null | undefined): number {
  return round2((Array.isArray(lines) ? lines : []).reduce((s, l) => s + num(l?.amount), 0))
}

/** Bill total − Σ lines (positive = still to pay, negative = overpaid). */
export function tenderBalance(lines: TenderLine[] | null | undefined, total: unknown): number {
  return round2(num(total) - tendersTotal(lines))
}

/** Σ lines equals the bill total within ±0.01 (same tolerance as the server). */
export function isTendersBalanced(lines: TenderLine[] | null | undefined, total: unknown): boolean {
  return Math.abs(tenderBalance(lines, total)) <= 0.01
}

/** Amount put on credit across all lines. */
export function creditTenderAmount(lines: TenderLine[] | null | undefined): number {
  return round2(
    (Array.isArray(lines) ? lines : [])
      .filter((l) => normalizeTenderMethod(l?.method) === 'credit')
      .reduce((s, l) => s + Math.max(0, num(l?.amount)), 0),
  )
}

/** A CREDIT tender needs a registered customer on the order (fn_pos_set_order_customer first). */
export function tendersRequireCustomer(lines: TenderLine[] | null | undefined): boolean {
  return creditTenderAmount(lines) > 0
}

export function hasCashTender(lines: TenderLine[] | null | undefined): boolean {
  return (Array.isArray(lines) ? lines : []).some(
    (l) => normalizeTenderMethod(l?.method) === 'cash' && num(l?.amount) > 0,
  )
}

/** PaymentDialog SPLIT breakdown ({cash, card, qr, bank, credit, ...}) → lines. */
export function splitDetailsToLines(details: Record<string, unknown> | null | undefined): TenderLine[] {
  if (!details || typeof details !== 'object') return []
  return Object.entries(details).map(([method, amount]) => ({ method, amount: amount as number }))
}

export const MISSING_SPLIT_RPC_MSG = 'Apply supabase/finance_pos_sales_gl_145.sql'

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}

export interface SplitPayResult {
  success: boolean
  error?: string
  missingRpc?: boolean
  data?: Record<string, unknown>
}

/** Call pos_split_pay. The client is injected so this stays testable. */
export async function paySplit(
  client: RpcClient,
  orderId: string,
  tenders: Tender[],
  shiftId?: string | null,
): Promise<SplitPayResult> {
  const { data, error } = await client.rpc('pos_split_pay', {
    p_order_id: orderId,
    p_tenders: tenders,
    p_shift_id: shiftId || null,
  })
  if (error) {
    if (isMissingRpcError(error)) return { success: false, missingRpc: true, error: MISSING_SPLIT_RPC_MSG }
    return { success: false, error: error.message || 'Split payment failed' }
  }
  const d = (data || {}) as Record<string, unknown>
  if (!d.success) return { success: false, error: String(d.error || 'Split payment failed'), data: d }
  return { success: true, data: d }
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Side-effect-free check that pos_split_pay is deployed and callable — run
 * before creating a brand-new POS order so a missing server function never
 * leaves an unpaid orphan order behind. (Nil uuid → 'Order not found.')
 */
export async function probeSplitPayRpc(client: RpcClient): Promise<SplitPayResult> {
  const { data, error } = await client.rpc('pos_split_pay', {
    p_order_id: NIL_UUID,
    p_tenders: [],
    p_shift_id: null,
  })
  if (error) {
    if (isMissingRpcError(error)) return { success: false, missingRpc: true, error: MISSING_SPLIT_RPC_MSG }
    return { success: false, error: error.message || 'Split payment check failed' }
  }
  const d = (data || {}) as { success?: boolean; error?: string }
  if (!d.success && d.error && /insufficient role/i.test(d.error)) return { success: false, error: d.error }
  return { success: true }
}

// ── Drawer payouts (cash_out → expense) ─────────────────────────────────────

export const DEFAULT_PAYOUT_LEDGER_CODE = '7042'

export interface ExpenseLedger {
  id: string
  ledger_code?: string | null
  ledger_name?: string | null
}

export function ledgerLabel(l: ExpenseLedger | null | undefined): string {
  if (!l) return ''
  return [l.ledger_code, l.ledger_name].filter(Boolean).join(' — ')
}

/** Default payout ledger: code 7042 (Miscellaneous Expense), else null (server default). */
export function pickDefaultExpenseLedger(ledgers: ExpenseLedger[] | null | undefined): ExpenseLedger | null {
  const list = Array.isArray(ledgers) ? ledgers : []
  return (
    list.find((l) => String(l.ledger_code || '').trim() === DEFAULT_PAYOUT_LEDGER_CODE) ||
    list.find((l) => /miscellaneous expense/i.test(l.ledger_name || '')) ||
    null
  )
}

/** Case-insensitive search on code + name. */
export function filterLedgers(ledgers: ExpenseLedger[] | null | undefined, query: string): ExpenseLedger[] {
  const list = Array.isArray(ledgers) ? ledgers : []
  const q = String(query || '').trim().toLowerCase()
  if (!q) return list
  return list.filter((l) => ledgerLabel(l).toLowerCase().includes(q))
}
