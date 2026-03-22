/**
 * Payment Management Service
 *
 * ERP-side payment control, refund processing, and reporting.
 * Wraps Supabase RPCs for payment operations.
 */

import { supabase } from 'src/boot/supabase'

// ── Types ─────────────────────────────────────────────────────

/**
 * @typedef {'unpaid' | 'pending_payment' | 'partial' | 'paid' | 'refunded' | 'partially_refunded'} PaymentStatus
 * @typedef {'cod' | 'cash' | 'card' | 'online' | 'payhere' | 'stripe' | 'bank_transfer'} PaymentMethod
 */

/**
 * @typedef {Object} PaymentTransaction
 * @property {string} id
 * @property {string} order_id
 * @property {string} gateway
 * @property {string} [gateway_txn_id]
 * @property {string} txn_type
 * @property {number} amount
 * @property {string} status
 * @property {string} [error_message]
 * @property {string} created_at
 * @property {string} [completed_at]
 */

/**
 * @typedef {Object} RefundResult
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [order_id]
 * @property {number} [refund_amount]
 * @property {string} [payment_status]
 * @property {string} [transaction_id]
 * @property {number} [total_refunded]
 */

/**
 * @typedef {Object} PaymentSummary
 * @property {boolean} success
 * @property {Object} totals
 * @property {Object} by_method
 * @property {Object} by_source
 */

// ── Refund Processing ─────────────────────────────────────────

/**
 * Process a refund for an order. Manager/admin only.
 *
 * @param {string} orderId - Order UUID
 * @param {Object} opts
 * @param {number} [opts.amount] - Refund amount (null = full refund)
 * @param {string} [opts.reason] - Reason for refund
 * @param {string} [opts.refundTo] - 'original_method' | 'cash' | 'store_credit'
 * @returns {Promise<RefundResult>}
 */
export async function processRefund(orderId, opts = {}) {
  const { data, error } = await supabase.rpc('manager_process_refund', {
    p_order_id: orderId,
    p_refund_amount: opts.amount ?? null,
    p_reason: opts.reason ?? 'Customer request',
    p_refund_to: opts.refundTo ?? 'original_method',
  })

  if (error) throw new Error(`Refund failed: ${error.message}`)
  return data
}

// ── Payment Confirmation ──────────────────────────────────────

/**
 * Confirm an online payment (used by webhook handler or manual confirmation).
 *
 * @param {string} orderId
 * @param {Object} opts
 * @param {string} [opts.gateway] - 'payhere' | 'stripe' | etc.
 * @param {string} [opts.gatewayTxnId] - External transaction ID
 * @param {number} [opts.amount] - Payment amount
 * @param {string} [opts.status] - 'success' | 'failed'
 * @param {string} [opts.idempotencyKey] - Prevent duplicate processing
 * @param {Object} [opts.responsePayload] - Raw gateway response
 * @returns {Promise<Object>}
 */
export async function confirmPayment(orderId, opts = {}) {
  const { data, error } = await supabase.rpc('confirm_online_payment', {
    p_order_id: orderId,
    p_gateway: opts.gateway ?? 'payhere',
    p_gateway_txn_id: opts.gatewayTxnId ?? null,
    p_amount: opts.amount ?? null,
    p_gateway_status: opts.status ?? 'success',
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_response_payload: opts.responsePayload ?? {},
  })

  if (error) throw new Error(`Payment confirmation failed: ${error.message}`)
  return data
}

// ── Payment Gate Check ────────────────────────────────────────

/**
 * Check if an order passes the payment gate.
 *
 * @param {string} orderId
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
export async function checkPaymentGate(orderId) {
  const { data, error } = await supabase.rpc('check_payment_gate', {
    p_order_id: orderId,
  })

  if (error) throw new Error(`Payment gate check failed: ${error.message}`)
  return data
}

// ── Payment Transactions ──────────────────────────────────────

/**
 * Fetch payment transactions for an order.
 *
 * @param {string} orderId
 * @returns {Promise<PaymentTransaction[]>}
 */
export async function fetchPaymentTransactions(orderId) {
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch transactions: ${error.message}`)
  return data || []
}

/**
 * Fetch all payment transactions for a branch within a date range.
 *
 * @param {string} branchId
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<PaymentTransaction[]>}
 */
export async function fetchBranchTransactions(branchId, startDate, endDate) {
  const { data, error } = await supabase
    .from('v_payment_transactions_log')
    .select('*')
    .eq('branch_id', branchId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(`Failed to fetch branch transactions: ${error.message}`)
  return data || []
}

// ── Reporting ─────────────────────────────────────────────────

/**
 * Get payment summary for a branch and date range.
 *
 * @param {string} branchId
 * @param {string} [startDate] - ISO date (defaults to today)
 * @param {string} [endDate] - ISO date (defaults to today)
 * @returns {Promise<PaymentSummary>}
 */
export async function getPaymentSummary(branchId, startDate, endDate) {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase.rpc('get_payment_summary', {
    p_branch_id: branchId,
    p_start_date: startDate || today,
    p_end_date: endDate || today,
  })

  if (error) throw new Error(`Failed to get payment summary: ${error.message}`)
  return data
}

/**
 * Fetch unpaid website orders for manager dashboard.
 *
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export async function fetchUnpaidWebsiteOrders(branchId) {
  const { data, error } = await supabase
    .from('v_unpaid_website_orders')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch unpaid orders: ${error.message}`)
  return data || []
}

// ── Branch Payment Settings ───────────────────────────────────

/**
 * Fetch payment settings for a branch.
 *
 * @param {string} branchId
 * @returns {Promise<Object|null>}
 */
export async function fetchBranchPaymentSettings(branchId) {
  const { data, error } = await supabase
    .from('branch_settings')
    .select('*')
    .eq('branch_id', branchId)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch settings: ${error.message}`)
  }
  return data
}

/**
 * Update payment settings for a branch.
 *
 * @param {string} branchId
 * @param {Object} settings
 * @returns {Promise<Object>}
 */
export async function updateBranchPaymentSettings(branchId, settings) {
  const { data, error } = await supabase
    .from('branch_settings')
    .upsert(
      {
        branch_id: branchId,
        ...settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id' },
    )
    .select()
    .single()

  if (error) throw new Error(`Failed to update settings: ${error.message}`)
  return data
}

// ── Realtime Subscription ─────────────────────────────────────

/**
 * Subscribe to payment transaction changes for a branch.
 *
 * @param {string} branchId
 * @param {Function} onInsert - Called when new transaction is created
 * @param {Function} onUpdate - Called when transaction is updated
 * @returns {Object} The channel subscription (call .unsubscribe() to stop)
 */
export function subscribePaymentTransactions(branchId, onInsert, onUpdate) {
  const channel = supabase
    .channel(`payment-txns-${branchId}-${Date.now()}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'payment_transactions',
      },
      (payload) => {
        onInsert?.(payload.new)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'payment_transactions',
      },
      (payload) => {
        onUpdate?.(payload.new, payload.old)
      },
    )
    .subscribe()

  return channel
}
