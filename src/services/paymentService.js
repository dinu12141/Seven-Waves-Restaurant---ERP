/**
 * Payment Management Service (ApiClient edition)
 *
 * ERP-side payment control, refund processing, and reporting.
 * All mutations go through ApiClient for correlation IDs + error classification.
 */

import { api } from 'src/core/api/ApiClient'
import { supabase } from 'src/boot/supabase'

const MODULE = 'payment'

// ── Refund Processing ─────────────────────────────────────────

/**
 * Process a refund for an order. Manager/admin only.
 * @param {string} orderId
 * @param {{ amount?: number, reason?: string, refundTo?: string }} opts
 */
export async function processRefund(orderId, opts = {}) {
  const { data, error } = await api.rpc('manager_process_refund', {
    p_order_id: orderId,
    p_refund_amount: opts.amount ?? null,
    p_reason: opts.reason ?? 'Customer request',
    p_refund_to: opts.refundTo ?? 'original_method',
  }, { module: MODULE, action: 'processRefund', retries: 0 })

  if (error) throw new Error(`Refund failed: ${error.userMessage}`)
  return data
}

// ── Payment Confirmation ──────────────────────────────────────

/**
 * Confirm an online payment (webhook handler or manual).
 */
export async function confirmPayment(orderId, opts = {}) {
  const { data, error } = await api.rpc('confirm_online_payment', {
    p_order_id: orderId,
    p_gateway: opts.gateway ?? 'payhere',
    p_gateway_txn_id: opts.gatewayTxnId ?? null,
    p_amount: opts.amount ?? null,
    p_gateway_status: opts.status ?? 'success',
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_response_payload: opts.responsePayload ?? {},
  }, { module: MODULE, action: 'confirmPayment', retries: 1 })

  if (error) throw new Error(`Payment confirmation failed: ${error.userMessage}`)
  return data
}

// ── Payment Gate Check ────────────────────────────────────────

/**
 * Check if an order passes the payment gate.
 */
export async function checkPaymentGate(orderId) {
  const { data, error } = await api.rpc('check_payment_gate', {
    p_order_id: orderId,
  }, { module: MODULE, action: 'checkPaymentGate', retries: 1, silent: true })

  if (error) throw new Error(`Payment gate check failed: ${error.userMessage}`)
  return data
}

// ── Payment Transactions ──────────────────────────────────────

/**
 * Fetch payment transactions for an order.
 */
export async function fetchPaymentTransactions(orderId) {
  const { data, error } = await api.query(
    (client) => client
      .from('payment_transactions')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false }),
    { module: MODULE, action: 'fetchPaymentTransactions', silent: true },
  )
  if (error) throw new Error(`Failed to fetch transactions: ${error.userMessage}`)
  return data || []
}

/**
 * Fetch all payment transactions for a branch within a date range.
 */
export async function fetchBranchTransactions(branchId, startDate, endDate) {
  const { data, error } = await api.query(
    (client) => client
      .from('v_payment_transactions_log')
      .select('*')
      .eq('branch_id', branchId)
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending: false })
      .limit(500),
    { module: MODULE, action: 'fetchBranchTransactions', silent: true },
  )
  if (error) throw new Error(`Failed to fetch branch transactions: ${error.userMessage}`)
  return data || []
}

// ── Reporting ─────────────────────────────────────────────────

/**
 * Get payment summary for a branch and date range.
 */
export async function getPaymentSummary(branchId, startDate, endDate) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await api.rpc('get_payment_summary', {
    p_branch_id: branchId,
    p_start_date: startDate || today,
    p_end_date: endDate || today,
  }, { module: MODULE, action: 'getPaymentSummary', retries: 1, silent: true })

  if (error) throw new Error(`Failed to get payment summary: ${error.userMessage}`)
  return data
}

/**
 * Fetch unpaid website orders for manager dashboard.
 */
export async function fetchUnpaidWebsiteOrders(branchId) {
  const { data, error } = await api.query(
    (client) => client
      .from('v_unpaid_website_orders')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false }),
    { module: MODULE, action: 'fetchUnpaidWebsiteOrders', silent: true },
  )
  if (error) throw new Error(`Failed to fetch unpaid orders: ${error.userMessage}`)
  return data || []
}

// ── Branch Payment Settings ───────────────────────────────────

/**
 * Fetch payment settings for a branch.
 */
export async function fetchBranchPaymentSettings(branchId) {
  const { data, error } = await api.query(
    (client) => client.from('branch_settings').select('*').eq('branch_id', branchId).single(),
    { module: MODULE, action: 'fetchBranchPaymentSettings', silent: true },
  )
  if (error && error.raw?.code !== 'PGRST116') {
    throw new Error(`Failed to fetch settings: ${error.userMessage}`)
  }
  return data
}

/**
 * Update payment settings for a branch.
 */
export async function updateBranchPaymentSettings(branchId, settings) {
  const { data, error } = await api.query(
    (client) => client
      .from('branch_settings')
      .upsert({ branch_id: branchId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'branch_id' })
      .select()
      .single(),
    { module: MODULE, action: 'updateBranchPaymentSettings' },
  )
  if (error) throw new Error(`Failed to update settings: ${error.userMessage}`)
  return data
}

// ── Realtime Subscription ─────────────────────────────────────
// Note: uses supabase directly — channel lifecycle managed outside ApiClient

export function subscribePaymentTransactions(branchId, onInsert, onUpdate) {
  const channel = supabase
    .channel(`payment-txns-${branchId}-${Date.now()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_transactions' },
      (payload) => { onInsert?.(payload.new) })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_transactions' },
      (payload) => { onUpdate?.(payload.new, payload.old) })
    .subscribe()
  return channel
}
