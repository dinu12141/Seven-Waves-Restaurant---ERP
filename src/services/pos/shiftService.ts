/**
 * POS Shift Service — API layer for shift lifecycle
 *
 * All shift mutations use ApiClient for correlation IDs + error classification.
 * Mirrors the RPC functions created in pos_shift_management.sql.
 */

import { api } from 'src/core/api/ApiClient'
import { supabase } from 'src/boot/supabase'

const MODULE = 'pos.shift'

// ── Types ─────────────────────────────────────────────────────────

export interface OpenShiftPayload {
  branchId: string
  terminalId: string
  cashierId: string
  openingCashFloat: number
  openingNote?: string
}

export interface ShiftPaymentPayload {
  shiftId: string
  orderId: string
  paymentMethod: 'cash' | 'card' | 'qr' | 'bank' | 'credit'
  amount: number
}

export interface CashMovementPayload {
  shiftId: string
  type: 'cash_drop' | 'cash_in' | 'cash_out'
  amount: number
  reason?: string
  approvedBy?: string
}

export interface CloseShiftPayload {
  shiftId: string
  countedCash: number
  countedCardSlips?: number
  countedQrTotal?: number
  countedBankTotal?: number
  closingNote?: string
  approvedBy?: string
  approvalNote?: string
}

export interface ShiftSummary {
  id: string
  branch_id: string
  terminal_id: string
  cashier_id: string
  status: string
  opening_cash_float: number
  cash_sales_total: number
  card_sales_total: number
  qr_sales_total: number
  bank_sales_total: number
  credit_sales_total: number
  refunds_total: number
  discounts_total: number
  void_total: number
  cash_drops_total: number
  cash_in_total: number
  cash_out_total: number
  expected_cash: number | null
  counted_cash: number | null
  counted_card_slips: number | null
  counted_qr_total: number | null
  counted_bank_total: number | null
  variance: number | null
  closing_note: string | null
  approved_by: string | null
  approved_at: string | null
  approval_note: string | null
  journal_entry_id: string | null
  opened_at: string
  closed_at: string | null
}

// ── Get Active Shift ──────────────────────────────────────────────

export async function getActiveShift(
  branchId: string,
  terminalId?: string,
  cashierId?: string,
): Promise<ShiftSummary | null> {
  const { data, error } = await api.rpc('pos_get_active_shift', {
    p_branch_id: branchId,
    p_terminal_id: terminalId || null,
    p_cashier_id: cashierId || null,
  }, { module: MODULE, action: 'getActiveShift', retries: 1, silent: true })

  if (error) {
    console.error('[ShiftService] getActiveShift error:', error)
    return null
  }

  // RPC returns an array (SETOF), take first row
  const rows = data as ShiftSummary[] | null
  return rows && rows.length > 0 ? rows[0] : null
}

// ── Open Shift ────────────────────────────────────────────────────

export async function openShift(payload: OpenShiftPayload) {
  const { data, error } = await api.rpc('pos_open_shift', {
    p_branch_id: payload.branchId,
    p_terminal_id: payload.terminalId,
    p_cashier_id: payload.cashierId,
    p_opening_cash_float: payload.openingCashFloat,
    p_opening_note: payload.openingNote || null,
  }, { module: MODULE, action: 'openShift', retries: 0 })

  if (error) throw new Error(`Failed to open shift: ${error.userMessage || error}`)
  return data as { success: boolean; shift_id?: string; error?: string }
}

// ── Record Payment ────────────────────────────────────────────────

export async function recordShiftPayment(payload: ShiftPaymentPayload) {
  const { data, error } = await api.rpc('pos_record_shift_payment', {
    p_shift_id: payload.shiftId,
    p_order_id: payload.orderId,
    p_payment_method: payload.paymentMethod,
    p_amount: payload.amount,
  }, { module: MODULE, action: 'recordShiftPayment', retries: 1 })

  if (error) {
    console.error('[ShiftService] recordShiftPayment error:', error)
    // Non-fatal: don't throw — payment already succeeded in the main flow
    return { success: false, error: String(error) }
  }
  return data as { success: boolean; error?: string }
}

// ── Cash Movement ─────────────────────────────────────────────────

export async function createCashMovement(payload: CashMovementPayload) {
  const { data, error } = await api.rpc('pos_cash_movement', {
    p_shift_id: payload.shiftId,
    p_type: payload.type,
    p_amount: payload.amount,
    p_reason: payload.reason || null,
    p_approved_by: payload.approvedBy || null,
  }, { module: MODULE, action: 'cashMovement', retries: 0 })

  if (error) throw new Error(`Cash movement failed: ${error.userMessage || error}`)
  return data as { success: boolean; movement_id?: string; error?: string }
}

// ── Get Shift Summary ─────────────────────────────────────────────

export async function getShiftSummary(shiftId: string): Promise<ShiftSummary | null> {
  const { data, error } = await api.query(
    (client: any) => client
      .from('pos_shifts')
      .select('*')
      .eq('id', shiftId)
      .single(),
    { module: MODULE, action: 'getShiftSummary', silent: true },
  )

  if (error) {
    console.error('[ShiftService] getShiftSummary error:', error)
    return null
  }
  return data as ShiftSummary
}

// ── Get Shift Cash Movements ──────────────────────────────────────

export async function getShiftCashMovements(shiftId: string) {
  const { data, error } = await api.query(
    (client: any) => client
      .from('pos_shift_cash_movements')
      .select('*')
      .eq('shift_id', shiftId)
      .order('created_at', { ascending: false }),
    { module: MODULE, action: 'getShiftCashMovements', silent: true },
  )

  if (error) return []
  return data || []
}

// ── Close Shift ───────────────────────────────────────────────────

export async function closeShift(payload: CloseShiftPayload) {
  const { data, error } = await api.rpc('pos_close_shift', {
    p_shift_id: payload.shiftId,
    p_counted_cash: payload.countedCash,
    p_counted_card_slips: payload.countedCardSlips || 0,
    p_counted_qr_total: payload.countedQrTotal || 0,
    p_counted_bank_total: payload.countedBankTotal || 0,
    p_closing_note: payload.closingNote || null,
    p_approved_by: payload.approvedBy || null,
    p_approval_note: payload.approvalNote || null,
  }, { module: MODULE, action: 'closeShift', retries: 0 })

  if (error) throw new Error(`Close shift failed: ${error.userMessage || error}`)
  return data as {
    success: boolean
    error?: string
    requires_approval?: boolean
    expected_cash?: number
    counted_cash?: number
    variance?: number
    shift_id?: string
  }
}

// ── Audit Log ─────────────────────────────────────────────────────

export async function logShiftAudit(
  action: string,
  shiftId: string | null,
  branchId: string,
  terminalId: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  deviceInfo?: Record<string, unknown>,
) {
  const userId = (await supabase.auth.getUser()).data.user?.id
  if (!userId) return

  await supabase.from('pos_shift_audit_logs').insert({
    user_id: userId,
    branch_id: branchId,
    terminal_id: terminalId,
    shift_id: shiftId,
    action,
    old_value: oldValue || null,
    new_value: newValue || null,
    device_info: deviceInfo || null,
  })
}
