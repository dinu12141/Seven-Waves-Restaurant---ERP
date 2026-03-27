/**
 * kotDispatchService.js
 * ─────────────────────────────────────────────────────────────────
 * ERP-standard KOT Dispatch & Queue Service Layer
 *
 * Wraps all Supabase RPC calls for the KOT dispatch system.
 * All mutations go through SECURITY DEFINER RPCs — never direct table writes.
 *
 * Queues:
 *   • Kitchen  → kot_dispatches (target=KITCHEN) + kot_tickets
 *   • Cashier  → cashier_queue + kot_dispatches (target=CASHIER)
 *   • Inventory→ stock_queue   + kot_dispatches (target=INVENTORY)
 *   • Finance  → finance_queue + kot_dispatches (target=FINANCE)
 *
 * Realtime subscriptions:
 *   Use subscribeToDispatchQueues() which returns an unsubscribe fn.
 */

import { supabase } from 'src/boot/supabase'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WAITER ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Accept a pending order. Atomically:
 * - Assigns waiter
 * - Generates KOTs
 * - Creates kot_dispatches for KITCHEN/CASHIER/INVENTORY/FINANCE
 * - Creates cashier_queue, stock_queue, finance_queue rows
 *
 * @param {string} orderId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function acceptOrder(orderId, unavailableItemIds = null) {
  const params = { p_order_id: orderId }

  // Pass unavailable IDs to RPC so availability marking + KOT generation
  // happen atomically in one DB transaction (prevents race conditions)
  if (unavailableItemIds && unavailableItemIds.length > 0) {
    params.p_unavailable_ids = unavailableItemIds
  }

  const { data, error } = await supabase.rpc('accept_order_as_waiter', params)

  if (error) {
    console.error('[KotDispatch] acceptOrder RPC error:', error)
    return { success: false, error: error.message }
  }

  if (!data?.success) {
    return { success: false, error: data?.error || 'Accept failed' }
  }

  return { success: true, data }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// KITCHEN ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Kitchen starts preparing a KOT. Atomically:
 * - Sets kot_tickets.status = 'preparing'
 * - Marks KITCHEN dispatch as 'delivered'
 * - Updates order.status = 'preparing'
 * - Triggers stock issue if issue_stage = 'on_kitchen_start'
 *
 * @param {string} kotId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function kitchenStartKot(kotId) {
  const { data, error } = await supabase.rpc('kitchen_start_kot', {
    p_kot_id: kotId,
  })

  if (error) {
    console.error('[KotDispatch] kitchenStartKot RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

/**
 * Kitchen marks KOT as ready. Atomically:
 * - Sets kot_tickets.status = 'ready'
 * - Marks all kot_items as 'ready'
 * - If ALL KOTs ready → sets order.status = 'ready'
 *
 * @param {string} kotId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function kitchenMarkReady(kotId) {
  const { data, error } = await supabase.rpc('kitchen_mark_ready', {
    p_kot_id: kotId,
  })

  if (error) {
    console.error('[KotDispatch] kitchenMarkReady RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASHIER ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Cashier creates invoice for an order.
 * - Sets order.status = 'invoiced'
 * - Updates cashier_queue.status = 'invoiced'
 *
 * @param {string} orderId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function invoiceOrder(orderId) {
  const { data, error } = await supabase.rpc('cashier_invoice_order', {
    p_order_id: orderId,
  })

  if (error) {
    console.error('[KotDispatch] invoiceOrder RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

/**
 * Cashier marks order as paid. Atomically:
 * - Sets order.status = 'paid' + payment_status = 'paid'
 * - Updates cashier_queue.status = 'paid'
 * - Posts finance_queue
 * - Calls issue_stock_for_order() if stage = 'on_paid'
 *
 * @param {string} orderId
 * @param {string} [paymentMethod='cash']
 * @param {number} [amountPaid]
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function payOrder(orderId, paymentMethod = 'cash', amountPaid = null) {
  const { data, error } = await supabase.rpc('cashier_pay_order', {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_amount_paid: amountPaid,
  })

  if (error) {
    console.error('[KotDispatch] payOrder RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVENTORY ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Process inventory/BOM deduction for an order.
 * - Idempotent (server guards duplicate processing)
 * - Requires admin, manager, or inventory role
 *
 * @param {string} orderId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function processInventory(orderId) {
  const { data, error } = await supabase.rpc('rpc_process_inventory_for_order', {
    p_order_id: orderId,
  })

  if (error) {
    console.error('[KotDispatch] processInventory RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FINANCE ACTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Post financial data for a paid/invoiced order.
 * - Idempotent (server guards duplicate posting)
 * - Requires admin, manager, or finance role
 *
 * @param {string} orderId
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function processFinance(orderId) {
  const { data, error } = await supabase.rpc('rpc_process_finance_for_order', {
    p_order_id: orderId,
  })

  if (error) {
    console.error('[KotDispatch] processFinance RPC error:', error)
    return { success: false, error: error.message }
  }

  return { success: data?.success ?? false, data, error: data?.error }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUEUE DATA FETCHERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fetch open cashier billing queue for a branch.
 * Cashier screen: subscribes to this for real-time billing queue.
 *
 * @param {string} branchId
 * @param {{ statuses?: string[] }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchCashierQueue(branchId, opts = {}) {
  const statuses = opts.statuses || ['open', 'invoiced']

  const { data, error } = await supabase
    .from('cashier_queue')
    .select(
      `id, order_id, status, created_at, updated_at,
       orders ( order_number, order_type, total_amount, table_id, customer_name,
                restaurant_tables ( table_number ),
                order_items ( id, quantity, unit_price, menu_items ( name ) )
              )`,
    )
    .eq('branch_id', branchId)
    .in('status', statuses)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[KotDispatch] fetchCashierQueue error:', error)
    return []
  }

  return data || []
}

/**
 * Fetch inventory (stock) queue for a branch.
 *
 * @param {string} branchId
 * @param {{ statuses?: string[] }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchStockQueue(branchId, opts = {}) {
  const statuses = opts.statuses || ['pending']

  const { data, error } = await supabase
    .from('stock_queue')
    .select(
      `id, order_id, status, issue_stage, created_at, updated_at,
       orders ( order_number, order_type )`,
    )
    .eq('branch_id', branchId)
    .in('status', statuses)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[KotDispatch] fetchStockQueue error:', error)
    return []
  }

  return data || []
}

/**
 * Fetch finance revenue queue for a branch.
 *
 * @param {string} branchId
 * @param {{ statuses?: string[] }} [opts]
 * @returns {Promise<Array>}
 */
export async function fetchFinanceQueue(branchId, opts = {}) {
  const statuses = opts.statuses || ['pending', 'posted']

  const { data, error } = await supabase
    .from('finance_queue')
    .select(
      `id, order_id, status, created_at, updated_at,
       orders ( order_number, total_amount, payment_status )`,
    )
    .eq('branch_id', branchId)
    .in('status', statuses)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[KotDispatch] fetchFinanceQueue error:', error)
    return []
  }

  return data || []
}

/**
 * Fetch order audit timeline (order_status_events).
 *
 * @param {string} orderId
 * @returns {Promise<Array>}
 */
export async function fetchOrderTimeline(orderId) {
  const { data, error } = await supabase
    .from('order_status_events')
    .select('id, event_code, old_status, new_status, payload, created_at, actor_user_id')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[KotDispatch] fetchOrderTimeline error:', error)
    return []
  }

  return data || []
}

/**
 * Fetch KOT dispatch status for all targets for a given order.
 *
 * @param {string} orderId
 * @returns {Promise<Array>}
 */
export async function fetchKotDispatches(orderId) {
  const { data, error } = await supabase
    .from('kot_dispatches')
    .select('id, kot_id, target_code, status, delivered_at, created_at, meta')
    .eq('order_id', orderId)
    .order('target_code')

  if (error) {
    console.error('[KotDispatch] fetchKotDispatches error:', error)
    return []
  }

  return data || []
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUBCATEGORY KITCHEN MAP FETCHER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fetch subcategory → kitchen mappings for a branch.
 * Used by admin/manager UI to configure kitchen routing.
 *
 * @param {string} branchId
 * @returns {Promise<Array>}
 */
export async function fetchSubcategoryKitchenMap(branchId) {
  const { data, error } = await supabase
    .from('subcategory_kitchen_map')
    .select(
      `id, is_active, created_at,
       subcategory:menu_sub_categories ( id, name, category:categories ( name ) ),
       kitchen:kitchens ( id, name )`,
    )
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[KotDispatch] fetchSubcategoryKitchenMap error:', error)
    return []
  }

  return data || []
}

/**
 * Upsert a subcategory → kitchen mapping.
 *
 * @param {string} subcategoryId
 * @param {string} kitchenId
 * @param {string} branchId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function setSubcategoryKitchenMap(subcategoryId, kitchenId, branchId) {
  const { error } = await supabase.from('subcategory_kitchen_map').upsert(
    {
      subcategory_id: subcategoryId,
      kitchen_id: kitchenId,
      branch_id: branchId,
      is_active: true,
    },
    { onConflict: 'subcategory_id,branch_id' },
  )

  if (error) {
    console.error('[KotDispatch] setSubcategoryKitchenMap error:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REALTIME SUBSCRIPTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Subscribe to all dispatch queue tables for a branch.
 *
 * Usage:
 *   const unsub = subscribeToDispatchQueues(branchId, {
 *     onCashierChange: (payload) => { ... },
 *     onStockChange:   (payload) => { ... },
 *     onFinanceChange: (payload) => { ... },
 *     onKotDispatch:   (payload) => { ... },
 *     onOrderEvent:    (payload) => { ... },
 *   })
 *   // cleanup
 *   onUnmounted(() => unsub())
 *
 * @param {string} branchId
 * @param {object} handlers
 * @returns {function} unsubscribe function
 */
export function subscribeToDispatchQueues(branchId, handlers = {}) {
  const channels = []

  // Cashier queue — filter by branch_id
  const cashierCh = supabase
    .channel(`dispatch-cashier-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cashier_queue',
        filter: `branch_id=eq.${branchId}`,
      },
      (payload) => handlers.onCashierChange?.(payload),
    )
    .subscribe()

  // Stock (inventory) queue
  const stockCh = supabase
    .channel(`dispatch-stock-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stock_queue',
        filter: `branch_id=eq.${branchId}`,
      },
      (payload) => handlers.onStockChange?.(payload),
    )
    .subscribe()

  // Finance queue
  const financeCh = supabase
    .channel(`dispatch-finance-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'finance_queue',
        filter: `branch_id=eq.${branchId}`,
      },
      (payload) => handlers.onFinanceChange?.(payload),
    )
    .subscribe()

  // KOT dispatches (any target) — no branch filter here, join done on consume
  const dispatchCh = supabase
    .channel(`dispatch-kot-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'kot_dispatches',
      },
      (payload) => handlers.onKotDispatch?.(payload),
    )
    .subscribe()

  // Order status events
  const eventsCh = supabase
    .channel(`dispatch-events-${branchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_status_events',
      },
      (payload) => handlers.onOrderEvent?.(payload),
    )
    .subscribe()

  channels.push(cashierCh, stockCh, financeCh, dispatchCh, eventsCh)

  // Return unsubscribe function
  return () => {
    channels.forEach((ch) => supabase.removeChannel(ch))
  }
}

/**
 * Subscribe to kitchen KOT dispatches (KITCHEN target only).
 * Useful in KDS (Kitchen Display System).
 *
 * @param {string[]} kitchenIds  — array of kitchen UUIDs this staff member manages
 * @param {function} onKotChange — callback(payload)
 * @returns {function} unsubscribe
 */
export function subscribeToKitchenKots(onKotChange) {
  const ch = supabase
    .channel('dispatch-kitchen-kots')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_tickets' }, (payload) =>
      onKotChange?.(payload),
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'kot_dispatches',
        filter: 'target_code=eq.KITCHEN',
      },
      (payload) => onKotChange?.(payload),
    )
    .subscribe()

  return () => supabase.removeChannel(ch)
}
