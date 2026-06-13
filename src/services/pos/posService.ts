// ═══════════════════════════════════════════════════════════════════
// Seven Waves ERP — POS Service (ApiClient edition)
// ═══════════════════════════════════════════════════════════════════

import { api } from 'src/core/api/ApiClient'
import type {
  PosOrder, Payment, CashierSession,
  PosCreateOrderPayload, PosPaymentPayload, RpcResult, UUID
} from 'src/types/erp.types'

const MODULE = 'pos'

// ─── Cashier Sessions ───────────────────────────────────────────

export async function openCashierSession(branchId: UUID, tillId?: UUID, openingAmount = 0): Promise<RpcResult<{ session_id: UUID }>> {
  const { data, error } = await api.rpc('pos_open_session', {
    p_branch_id: branchId,
    p_till_id: tillId || null,
    p_opening_amount: openingAmount,
  }, { module: MODULE, action: 'openCashierSession', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult<{ session_id: UUID }>
}

export async function closeCashierSession(sessionId: UUID, closingAmount: number): Promise<RpcResult> {
  const { data, error } = await api.rpc('pos_close_session', {
    p_session_id: sessionId,
    p_closing_amount: closingAmount,
  }, { module: MODULE, action: 'closeCashierSession', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function getActiveSession(branchId: UUID): Promise<CashierSession | null> {
  const { data } = await api.query(
    (client) => client
      .from('cashier_sessions')
      .select('*')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    { module: MODULE, action: 'getActiveSession', silent: true },
  )
  return data as CashierSession | null
}

// ─── Orders ─────────────────────────────────────────────────────

export async function createOrder(payload: PosCreateOrderPayload): Promise<RpcResult<{ order_id: UUID; subtotal: number; discount: number; total: number }>> {
  const { data, error } = await api.rpc('pos_create_order', {
    p_branch_id: payload.branch_id,
    p_items: JSON.stringify(payload.items),
    p_order_type: payload.order_type || 'dine_in',
    p_table_id: payload.table_id || null,
    p_customer_id: payload.customer_id || null,
    p_notes: payload.notes || null,
    p_discount_type: payload.discount_type || null,
    p_discount_value: payload.discount_value || 0,
  }, { module: MODULE, action: 'createOrder', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function getOrder(orderId: UUID): Promise<PosOrder | null> {
  const { data } = await api.query(
    (client) => client
      .from('orders')
      .select('*, order_items(*, menu_items(name, image_url))')
      .eq('id', orderId)
      .is('deleted_at', null)
      .single(),
    { module: MODULE, action: 'getOrder', silent: true },
  )
  return data as unknown as PosOrder | null
}

export async function getOrders(branchId: UUID, status?: string, limit = 50): Promise<PosOrder[]> {
  const { data } = await api.query(
    (client) => {
      let q = client
        .from('orders')
        .select('*, order_items(id, name, quantity, unit_price, status)')
        .eq('branch_id', branchId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (status) q = q.eq('status', status)
      return q
    },
    { module: MODULE, action: 'getOrders', silent: true },
  )
  return (data || []) as unknown as PosOrder[]
}

export async function voidOrder(orderId: UUID, reason: string): Promise<RpcResult> {
  const { data, error } = await api.rpc('pos_void_order', {
    p_order_id: orderId,
    p_reason: reason,
  }, { module: MODULE, action: 'voidOrder', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function applyDiscount(orderId: UUID, discountType: 'percentage' | 'fixed', value: number): Promise<RpcResult> {
  const { data, error } = await api.rpc('pos_apply_discount', {
    p_order_id: orderId,
    p_discount_type: discountType,
    p_discount_value: value,
  }, { module: MODULE, action: 'applyDiscount', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

// ─── Payments ───────────────────────────────────────────────────

export async function processPayment(orderId: UUID, payments: PosPaymentPayload[]): Promise<RpcResult<{ total_paid: number; change: number }>> {
  const { data, error } = await api.rpc('pos_process_payment', {
    p_order_id: orderId,
    p_payments: JSON.stringify(payments),
  }, { module: MODULE, action: 'processPayment', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function processRefund(orderId: UUID, amount: number, reason: string): Promise<RpcResult<{ refund_id: UUID }>> {
  const { data, error } = await api.rpc('pos_refund_payment', {
    p_order_id: orderId,
    p_amount: amount,
    p_reason: reason,
  }, { module: MODULE, action: 'processRefund', retries: 0 })
  if (error) return { success: false, error: error.userMessage }
  return data as RpcResult
}

export async function getPayments(orderId: UUID): Promise<Payment[]> {
  const { data } = await api.query(
    (client) => client.from('payments').select('*').eq('order_id', orderId).is('deleted_at', null),
    { module: MODULE, action: 'getPayments', silent: true },
  )
  return (data || []) as Payment[]
}
