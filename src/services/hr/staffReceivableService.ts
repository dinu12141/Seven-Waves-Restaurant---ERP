/**
 * Staff receivable (advances / loans) + Full & Final settlement finance posting.
 *
 * Wraps the Finance #134b RPCs:
 *   disburse_staff_receivable(p_source, p_source_id, p_cash_bank_account_id)
 *   post_final_settlement_to_finance(p_settlement_id, p_cash_bank_account_id)
 *
 * Every call degrades gracefully while #134b is not applied yet: a missing RPC
 * (PostgREST PGRST202 / HTTP 404) is reported as `{ ok: false, missing: true }`
 * instead of throwing, so callers can keep the pre-#134b behaviour and tell
 * the user that the finance posting is not available yet.
 */

export type StaffReceivableSource = 'salary_advance' | 'employee_loan' | 'employee_advance'

export interface RpcOutcome<T = Record<string, unknown>> {
  ok: boolean
  /** true when the RPC does not exist on the server (#134b not applied) */
  missing: boolean
  data: T | null
  error: string | null
}

interface RpcError {
  code?: string
  message?: string
  details?: string
  hint?: string
  status?: number
}

// Minimal structural type so tests can pass a fake client.
export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>
}

export function isMissingRpcError(err: RpcError | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST202') return true
  if (err.status === 404) return true
  const msg = `${err.message || ''} ${err.details || ''}`
  return /could not find the function/i.test(msg) || /function .* does not exist/i.test(msg)
}

/** Strips trigger prefixes (NOT_DISBURSED:, STAFF_RECEIVABLE_LOCKED: …) for display. */
export function friendlyReceivableError(message: string | null | undefined): string {
  const m = String(message || 'Unknown error')
  return m.replace(/^(NOT_DISBURSED|STAFF_RECEIVABLE_LOCKED|STAFF_RECEIVABLE_NOT_DISBURSED|UNTRACED_RECOVERY):\s*/, '')
}

async function callRpc<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<RpcOutcome<T>> {
  try {
    const { data, error } = await client.rpc(fn, args)
    if (error) {
      if (isMissingRpcError(error)) return { ok: false, missing: true, data: null, error: error.message || null }
      return { ok: false, missing: false, data: null, error: friendlyReceivableError(error.message) }
    }
    const d = data as (T & { success?: boolean; error?: string }) | null
    if (d && typeof d === 'object' && d.success === false) {
      return { ok: false, missing: false, data: d, error: friendlyReceivableError(d.error) }
    }
    return { ok: true, missing: false, data: d, error: null }
  } catch (e) {
    const err = e as RpcError
    if (isMissingRpcError(err)) return { ok: false, missing: true, data: null, error: err.message || null }
    return { ok: false, missing: false, data: null, error: friendlyReceivableError(err?.message || String(e)) }
  }
}

/** Dr 1004 Staff Receivable / Cr cash-bank; makes the advance / loan recoverable by payroll. */
export function disburseStaffReceivable(
  client: RpcClient,
  source: StaffReceivableSource,
  sourceId: string,
  cashBankAccountId: string,
): Promise<RpcOutcome> {
  return callRpc(client, 'disburse_staff_receivable', {
    p_source: source,
    p_source_id: sourceId,
    p_cash_bank_account_id: cashBankAccountId,
  })
}

/**
 * employee_advances: #134b RPC first, falling back to the legacy
 * disburse_employee_advance RPC (live today) when #134b is not applied.
 */
export async function disburseEmployeeAdvance(
  client: RpcClient,
  advanceId: string,
  cashBankAccountId: string,
  disbursedBy?: string | null,
): Promise<RpcOutcome> {
  const res = await disburseStaffReceivable(client, 'employee_advance', advanceId, cashBankAccountId)
  if (!res.missing) return res
  return callRpc(client, 'disburse_employee_advance', {
    p_advance_id: advanceId,
    p_cash_bank_account_id: cashBankAccountId,
    p_disbursed_by: disbursedBy ?? null,
  })
}

/** Posts an APPROVED Full & Final settlement to finance and marks it paid. */
export function postFinalSettlementToFinance(
  client: RpcClient,
  settlementId: string,
  cashBankAccountId: string,
): Promise<RpcOutcome> {
  return callRpc(client, 'post_final_settlement_to_finance', {
    p_settlement_id: settlementId,
    p_cash_bank_account_id: cashBankAccountId,
  })
}

export const FINANCE_POSTING_UNAVAILABLE =
  'Finance posting is not available yet (Finance update #134b not applied).'
