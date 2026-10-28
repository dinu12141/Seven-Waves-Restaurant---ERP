/**
 * Pure helpers for POS CREDIT payments.
 *
 * Business rule: a CREDIT (on-account) sale is only allowed for a REGISTERED
 * customer. The server (supabase/finance_pos_sales_gl_145.sql §4) creates the
 * customer receivable from orders.customer_id when the order becomes paid, so
 * the customer must be attached (fn_pos_set_order_customer, §7b) BEFORE the
 * payment RPC runs.
 */

export interface CreditCustomer {
  id: string
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  customer_code?: string | null
  phone?: string | null
  credit_limit?: number | string | null
  open_balance?: number | string | null
}

export interface SplitDetails {
  cash?: number | null
  card?: number | null
  qr?: number | null
  credit?: number | null
}

/** Statuses of customer_receivables that still carry an open balance (mirrors §7b). */
export const OPEN_RECEIVABLE_STATUSES = ['outstanding', 'partial', 'overdue'] as const

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Amount of the bill that is being put on credit (0 if none).
 * `method`/`subMethod` follow PaymentDialog ids: method 'other' + subMethod 'credit'
 * is a full-credit sale; a split carries an optional `credit` part.
 */
export function creditAmountFor(
  method: string,
  subMethod: string,
  total: number,
  split?: SplitDetails | null,
): number {
  if (method === 'other' && subMethod === 'credit') return Math.max(0, num(total))
  if (method === 'split' && split) return Math.max(0, num(split.credit))
  return 0
}

/** True when this payment needs a registered customer picked before confirming. */
export function requiresCreditCustomer(
  method: string,
  subMethod: string,
  total: number,
  split?: SplitDetails | null,
): boolean {
  if (method === 'other' && subMethod === 'credit') return true
  return creditAmountFor(method, subMethod, total, split) > 0
}

/** Confirm gate: credit payments are blocked until a customer with an id is chosen. */
export function canConfirmCredit(
  method: string,
  subMethod: string,
  total: number,
  customer: Pick<CreditCustomer, 'id'> | null | undefined,
  split?: SplitDetails | null,
): boolean {
  if (!requiresCreditCustomer(method, subMethod, total, split)) return true
  return !!customer?.id
}

export interface CreditLimitCheck {
  /** credit_limit > 0 (0 / null = no limit configured) */
  hasLimit: boolean
  limit: number
  openBalance: number
  projected: number
  /** projected − limit, clamped at 0 */
  overBy: number
  /** warn (never block) when true */
  exceeds: boolean
}

/** Warn-only credit-limit check: open balance + this credit vs credit_limit. */
export function checkCreditLimit(
  creditLimit: unknown,
  openBalance: unknown,
  creditAmount: unknown,
): CreditLimitCheck {
  const limit = num(creditLimit)
  const open = num(openBalance)
  const projected = Math.round((open + num(creditAmount)) * 100) / 100
  const hasLimit = limit > 0
  const overBy = hasLimit ? Math.max(0, Math.round((projected - limit) * 100) / 100) : 0
  return { hasLimit, limit, openBalance: open, projected, overBy, exceeds: hasLimit && overBy > 0.005 }
}

/** Sum of (total_amount − paid_amount) over open customer_receivables rows. */
export function sumOpenBalance(
  rows: Array<{ total_amount?: unknown; paid_amount?: unknown; status?: string | null }> | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0
  const open = OPEN_RECEIVABLE_STATUSES as readonly string[]
  const total = rows
    .filter((r) => !r.status || open.includes(r.status))
    .reduce((s, r) => s + (num(r.total_amount) - num(r.paid_amount)), 0)
  return Math.round(total * 100) / 100
}

/** Display name for a customer row (pos_search_customers or customers table). */
export function customerDisplayName(c: CreditCustomer | null | undefined): string {
  if (!c) return ''
  const full = (c.full_name || '').trim()
  if (full) return full
  const parts = [c.first_name, c.last_name].filter((p) => p && String(p).trim()).join(' ').trim()
  return parts || c.customer_code || c.phone || 'Customer'
}

/** pos_search_customers returns { success, data: [...] }; accept a bare array too. */
export function normalizeCustomerSearch(data: unknown): CreditCustomer[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : []
  return (list as Array<Record<string, unknown>>)
    .map((r) => ({ ...r, id: String(r.id ?? r.customer_id ?? '') }) as CreditCustomer)
    .filter((r) => !!r.id)
}

/** PostgREST "function not found" (RPC not deployed yet). */
export function isMissingRpcError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  if (e.code === 'PGRST202' || e.code === '42883') return true
  return /could not find the function/i.test(e.message || '')
}

export const MISSING_SET_CUSTOMER_RPC_MSG =
  'Credit sales need the server update: apply supabase/finance_pos_sales_gl_145.sql'

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
}

export interface AttachResult {
  success: boolean
  error?: string
  missingRpc?: boolean
  creditLimit?: number
  openBalance?: number
}

/**
 * Attach a registered customer to every order being paid, via
 * fn_pos_set_order_customer(p_order_id, p_customer_id). Stops at the first
 * failure. The client is injected so this stays testable.
 */
export async function attachCustomerToOrders(
  client: RpcClient,
  orderIds: Array<string | null | undefined>,
  customerId: string,
): Promise<AttachResult> {
  const ids = orderIds.filter((x): x is string => !!x)
  if (!customerId) return { success: false, error: 'Select a registered customer for a credit sale.' }
  if (ids.length === 0) return { success: false, error: 'No order to attach the customer to.' }
  let last: AttachResult = { success: true }
  for (const id of ids) {
    const { data, error } = await client.rpc('fn_pos_set_order_customer', {
      p_order_id: id,
      p_customer_id: customerId,
    })
    if (error) {
      if (isMissingRpcError(error)) {
        return { success: false, missingRpc: true, error: MISSING_SET_CUSTOMER_RPC_MSG }
      }
      return { success: false, error: error.message || 'Could not attach customer to order.' }
    }
    const d = (data || {}) as { success?: boolean; error?: string; credit_limit?: unknown; open_balance?: unknown }
    if (!d.success) return { success: false, error: d.error || 'Could not attach customer to order.' }
    last = { success: true, creditLimit: num(d.credit_limit), openBalance: num(d.open_balance) }
  }
  return last
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Side-effect-free check that fn_pos_set_order_customer is deployed and the
 * user may call it — used before a brand-new POS order is created, so a
 * missing server function never leaves an unpaid orphan order behind.
 * (The function returns {success:false,'Order not found.'} for the nil uuid.)
 */
export async function probeSetCustomerRpc(client: RpcClient): Promise<AttachResult> {
  const { data, error } = await client.rpc('fn_pos_set_order_customer', {
    p_order_id: NIL_UUID,
    p_customer_id: NIL_UUID,
  })
  if (error) {
    if (isMissingRpcError(error)) return { success: false, missingRpc: true, error: MISSING_SET_CUSTOMER_RPC_MSG }
    return { success: false, error: error.message || 'Credit sale check failed.' }
  }
  const d = (data || {}) as { success?: boolean; error?: string }
  if (!d.success && d.error && /only cashier|access to this branch/i.test(d.error)) {
    return { success: false, error: d.error }
  }
  return { success: true }
}
