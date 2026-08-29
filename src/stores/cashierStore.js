import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/**
 * Cashier Billing Store (v2 – orders-driven)
 *
 * Flow:
 *  1. fetchBillingQueue()  → orders JOIN order_items / invoices
 *  2. generateInvoice(orderId)  → INSERT invoice + invoice_items → order.status = 'invoiced'
 *  3. recordPayment(invoiceId, orderId, payments[])
 *       → calls record_payment_and_close_order(RPC)
 *       → order.status='paid'
 *
 * Realtime: subscribes to orders changes by branch_id
 */
export const useCashierStore = defineStore('cashier', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const billingOrders = ref([]) // normalized queue entries
  const loading = ref(false)
  const processing = ref(false)

  const paymentMethods = ref([])
  const selectedOrderId = ref(null)
  const billDialogOpen = ref(false)

  // Realtime channel (single)
  let ordersChannel = null

  // Boot guard — ensures we only boot once
  let booted = false

  // Tracking for "new" notifications
  const lastViewedAt = ref(new Date())

  const branchId = computed(() => {
    return authStore.currentBranch?.id || authStore.profile?.branch_id
  })

  const readyCount = computed(
    () => billingOrders.value.filter((o) => ['ready', 'served'].includes(o.status)).length,
  )
  const wipCount = computed(
    () => billingOrders.value.filter((o) => ['accepted', 'preparing'].includes(o.status)).length,
  )
  const invoicedCount = computed(
    () => billingOrders.value.filter((o) => o.status === 'invoiced').length,
  )

  // ── Initialize (idempotent) ────────────────────────────────
  async function initialize() {
    if (booted || !branchId.value) return
    booted = true
    loading.value = true

    try {
      console.log('[CashierStore] Initializing with branch:', branchId.value)
      await Promise.all([fetchBillingQueue(), fetchPaymentMethods()])
      subscribeRealtime()
      lastViewedAt.value = new Date()
    } catch (err) {
      console.error('[CashierStore] Init error:', err)
      // NOTE: Do NOT reset booted=false — that causes an infinite retry loop
      // because the watcher immediately calls initialize() again after each crash.
      // If init truly fails, the user must manually refresh.
      Notify.create({
        message: 'POS Initialization Failed',
        caption: err.message || 'Unknown error',
        color: 'red',
        actions: [
          {
            label: 'Retry',
            color: 'white',
            handler: () => {
              booted = false
              initialize()
            },
          },
        ],
      })
    } finally {
      loading.value = false
    }
  }

  // ── Watch for branch availability ─────────────────────────
  watch(
    branchId,
    (newId) => {
      if (newId && !booted) {
        console.log('[CashierStore] Branch available:', newId)
        initialize()
      }
    },
    { immediate: true },
  )

  // ── Fetch Billing Queue ────────────────────────────────────
  async function fetchBillingQueue(forceRefresh = false) {
    const bid = branchId.value
    if (!bid) {
      console.warn('[CashierStore] No branchId for fetchBillingQueue')
      return
    }

    if (!forceRefresh) {
      console.log(`[CashierStore] Fetching queue for branch: ${bid}`)
    }

    // Fetch unpaid orders: last 7 days (covers orders from previous sessions)
    // Fetch all unpaid statuses (last 7 days) + paid orders (today only)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const todayLocalMidnight = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

    // Fetch all unpaid statuses (last 7 days) + paid orders (today only)
    const unpaidStatuses = [
      'pending',
      'pending_waiter',
      'accepted',
      'preparing',
      'ready',
      'served',
      'invoiced',
    ]
    const paidStatuses = ['paid', 'completed']

    const [unpaidRes, paidRes] = await Promise.all([
      supabase
        .from('orders')
        .select(
          `
          id, order_number, order_type, order_source, status, payment_status,
          customer_name, customer_phone, subtotal, tax_amount, discount_amount,
          total_amount, delivery_charge, service_charge, notes, created_at, updated_at, accepted_at, waiter_id,
          table_id, table_number, branch_id,
          restaurant_tables ( table_number, section ),
          waiter:profiles!orders_waiter_id_fkey ( full_name ),
          assigned_waiter:profiles!orders_assigned_waiter_id_fkey ( full_name ),
          order_items (
            id, quantity, unit_price, total_price, notes, status,
            menu_items ( id, name )
          ),
          kot_tickets (
            id, kot_number, status, kitchen_id,
            kot_items ( id, order_item_id, quantity, status )
          ),
          invoices ( id, invoice_number, total, payment_status, status )
        `,
        )
        .eq('branch_id', bid)
        .in('status', unpaidStatuses)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(300),

      supabase
        .from('orders')
        .select(
          `
          id, order_number, order_type, order_source, status, payment_status,
          customer_name, customer_phone, subtotal, tax_amount, discount_amount,
          total_amount, delivery_charge, service_charge, notes, created_at, updated_at, accepted_at, waiter_id,
          table_id, table_number, branch_id,
          restaurant_tables ( table_number, section ),
          waiter:profiles!orders_waiter_id_fkey ( full_name ),
          assigned_waiter:profiles!orders_assigned_waiter_id_fkey ( full_name ),
          order_items (
            id, quantity, unit_price, total_price, notes, status,
            menu_items ( id, name )
          ),
          kot_tickets (
            id, kot_number, status, kitchen_id,
            kot_items ( id, order_item_id, quantity, status )
          ),
          invoices ( id, invoice_number, total, payment_status, status )
        `,
        )
        .eq('branch_id', bid)
        .in('status', paidStatuses)
        .gte('updated_at', todayLocalMidnight)
        .order('updated_at', { ascending: false })
        .limit(200),
    ])

    if (unpaidRes.error) {
      console.error('[CashierStore] fetchBillingQueue (unpaid) error:', unpaidRes.error)
      Notify.create({ message: 'Fetch Failed', caption: unpaidRes.error.message, color: 'red' })
      return
    }
    if (paidRes.error) {
      console.warn('[CashierStore] fetchBillingQueue (paid) error:', paidRes.error)
      // Non-fatal — still show unpaid orders
    }

    const combined = [...(unpaidRes.data || []), ...(paidRes.data || [])]
    // De-duplicate by id (shouldn't happen but guard anyway)
    const seen = new Set()
    const deduped = combined.filter((o) => {
      if (seen.has(o.id)) return false
      seen.add(o.id)
      return true
    })

    console.log(
      `[CashierStore] Received ${deduped.length} orders (${unpaidRes.data?.length ?? 0} unpaid + ${paidRes.data?.length ?? 0} paid)`,
    )
    billingOrders.value = deduped.map(normalizeQueueEntry)
  }

  // Keep alias for backward compat
  const fetchBillingOrders = fetchBillingQueue

  // ── Fetch Payment Methods ──────────────────────────────────
  async function fetchPaymentMethods() {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name, description')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('[CashierStore] fetchPaymentMethods error:', error)
      return
    }
    paymentMethods.value = data || []
  }

  // ── Generate Invoice ───────────────────────────────────────
  // Uses cashier_raise_invoice RPC so all charges (tax, discount,
  // service_charge, tips, delivery_charge) are correctly applied.
  async function generateInvoice(orderId, opts = {}) {
    const entry = billingOrders.value.find((o) => o.id === orderId)
    if (!entry) {
      Notify.create({ message: 'Order not found in billing queue', color: 'red', icon: 'error' })
      throw new Error('Order not found in billing queue')
    }

    const order = entry.orders || entry

    // Idempotency: return existing invoice if already raised
    const existingInvoices = toArray(entry.invoices ?? order.invoices)
    if (existingInvoices.length > 0) {
      return { success: true, invoice: existingInvoices[0], alreadyExisted: true }
    }

    processing.value = true
    try {
      // Call the canonical RPC — it handles all charges correctly and
      // creates invoice_items, updates cashier_queue, and fires audit events.
      const { data: result, error: rpcErr } = await supabase.rpc('cashier_raise_invoice', {
        p_order_id: orderId,
        p_customer_name: opts.customerName ?? order.customer_name ?? null,
        p_discount: opts.discount ?? 0,
        p_service_charge: opts.serviceCharge ?? 0,
        p_tips: opts.tips ?? 0,
        p_delivery_charge: opts.deliveryCharge ?? 0,
        p_notes: opts.notes ?? null,
        p_tax_breakdown: opts.taxBreakdown ?? {},
        p_discount_breakdown: opts.discountBreakdown ?? {},
      })

      if (rpcErr) throw new Error(`Invoice RPC failed: ${rpcErr.message}`)
      if (!result?.success) throw new Error(result?.error || 'Invoice creation failed')

      // Fetch the full invoice record for local state
      const { data: invoice, error: fetchErr } = await supabase
        .from('invoices')
        .select(
          'id, invoice_number, total, grand_total, status, payment_status, created_at, subtotal, tax, discount, service_charge, tips, delivery_charge',
        )
        .eq('id', result.invoice_id)
        .single()

      if (fetchErr) throw new Error(`Invoice fetch failed: ${fetchErr.message}`)

      // Update local store
      const idx = billingOrders.value.findIndex((o) => o.id === orderId)
      if (idx !== -1) {
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: 'invoiced',
          queue_status: 'invoiced',
          invoices: [{ ...invoice, grand_total: invoice.grand_total ?? invoice.total }],
        }
      }

      return {
        success: true,
        invoice: { ...invoice, grand_total: invoice.grand_total ?? invoice.total },
      }
    } catch (err) {
      Notify.create({
        message: 'Invoice Generation Failed',
        caption: err.message || 'Unknown error',
        color: 'red',
        icon: 'error',
        timeout: 6000,
      })
      throw err
    } finally {
      processing.value = false
    }
  }

  // ── Record Payment ─────────────────────────────────────────
  async function recordPayment(invoiceId, payments, orderId) {
    if (!invoiceId || !payments?.length) throw new Error('Invalid payment data')

    let targetOrderId = orderId
    if (!targetOrderId) {
      const { data: invData, error: fetchErr } = await supabase
        .from('invoices')
        .select('order_id')
        .eq('id', invoiceId)
        .single()
      if (fetchErr) throw new Error(`Could not fetch invoice: ${fetchErr.message}`)
      targetOrderId = invData.order_id
    }

    processing.value = true
    try {
      const paymentRows = payments.map((p) => ({
        invoice_id: invoiceId,
        payment_method_id: p.methodId,
        amount: parseFloat(p.amount.toFixed(2)),
        transaction_ref: p.transactionRef || null,
        notes: p.notes || null,
      }))

      const { error } = await supabase.rpc('record_payment_and_close_order', {
        p_invoice_id: invoiceId,
        p_order_id: targetOrderId,
        p_payment_rows: paymentRows,
      })

      if (error) throw new Error(`Payment RPC failed: ${error.message}`)

      // Real-time atomic BOM deduction: auto deduct recipe ingredients from kitchen inventory
      try {
        await supabase.rpc('atomic_bom_deduct_for_order', {
          p_order_id: targetOrderId,
        })
      } catch (bomErr) {
        console.warn('[CashierStore] BOM deduction note:', bomErr)
      }

      // Update in-place so the order moves to the Paid tab instead of disappearing
      const idx = billingOrders.value.findIndex((o) => o.id === targetOrderId)
      if (idx !== -1) {
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: 'paid',
          payment_status: 'paid',
        }
      }

      return { success: true, orderId: targetOrderId }
    } finally {
      processing.value = false
    }
  }

  // ── Refund Order ───────────────────────────────────────────
  async function refundOrder(orderId, refundAmount, reason, refundTo = 'cash') {
    if (!orderId) throw new Error('Order ID required')
    if (!refundAmount || parseFloat(refundAmount) <= 0) throw new Error('Refund amount must be greater than zero')
    if (!reason?.trim()) throw new Error('Refund reason is required')

    processing.value = true
    try {
      const { data: result, error } = await supabase.rpc('process_refund', {
        p_order_id: orderId,
        p_refund_amount: parseFloat(parseFloat(refundAmount).toFixed(2)),
        p_reason: reason.trim(),
        p_refund_to: refundTo,
      })

      if (error) throw new Error(`Refund failed: ${error.message}`)
      if (!result?.success) throw new Error(result?.error || 'Refund failed')

      // Update local state
      const idx = billingOrders.value.findIndex((o) => o.id === orderId)
      if (idx !== -1) {
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          payment_status: result.payment_status,
        }
      }

      Notify.create({
        message: `Refund of LKR ${parseFloat(refundAmount).toFixed(2)} processed`,
        caption: `Status: ${result.payment_status}`,
        color: 'teal',
        icon: 'undo',
        timeout: 5000,
      })

      return result
    } catch (err) {
      Notify.create({
        message: 'Refund Failed',
        caption: err.message || 'Unknown error',
        color: 'red',
        icon: 'error',
        timeout: 6000,
      })
      throw err
    } finally {
      processing.value = false
    }
  }

  // ── Quick Pay ──────────────────────────────────────────────
  async function quickPay(orderId, payments) {
    const { invoice } = await generateInvoice(orderId)
    const result = await recordPayment(invoice.id, payments, orderId)
    return { ...result, invoice }
  }

  // ── Mark as Served ─────────────────────────────────────────
  async function markServed(orderId) {
    // Guard: only 'ready' orders can be marked as served
    const idx = billingOrders.value.findIndex((o) => o.id === orderId)
    if (idx === -1) {
      Notify.create({ message: 'Order not found in queue', color: 'red', icon: 'error' })
      return
    }

    const currentStatus = billingOrders.value[idx].status
    if (currentStatus !== 'ready') {
      Notify.create({
        message: `Cannot mark as served`,
        caption: `Order is currently "${currentStatus}" — only "ready" orders can be served.`,
        color: 'orange-8',
        icon: 'warning',
      })
      return
    }

    // Optimistic update
    const previousStatus = billingOrders.value[idx].status
    billingOrders.value[idx].status = 'served'

    try {
      const { data: rpcData, error } = await supabase.rpc('process_waiter_mark_served', {
        p_order_id: orderId,
      })

      if (error) throw new Error(error.message)

      // If the RPC reported failure, another user already changed the status
      if (!rpcData?.success) {
        billingOrders.value[idx].status = previousStatus
        Notify.create({
          message: 'Order status changed by another user',
          caption: 'Please refresh the queue.',
          color: 'orange-8',
          icon: 'sync_problem',
        })
        debouncedRefresh()
      }
    } catch (err) {
      // Rollback optimistic update
      billingOrders.value[idx].status = previousStatus
      Notify.create({
        message: 'Failed to mark as served',
        caption: err.message,
        color: 'red',
        icon: 'error',
      })
      throw err
    }
  }

  // ── Fetch Full Invoice for Printing ───────────────────────
  async function fetchInvoiceDetails(invoiceId) {
    const { data, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_number,
        subtotal,
        tax,
        discount,
        total,
        grand_total,
        delivery_charge,
        service_charge,
        status,
        payment_status,
        customer_name,
        customer_phone,
        notes,
        created_at,
        orders!order_id (
          order_number,
          order_type,
          order_source,
          table_id,
          waiter_id,
          customer_name,
          customer_phone,
          delivery_address,
          delivery_charge,
          restaurant_tables ( table_number, section ),
          waiter:profiles!orders_waiter_id_fkey ( full_name ),
          assigned_waiter:profiles!orders_assigned_waiter_id_fkey ( full_name ),
          kot_tickets ( id, kot_number, status, kitchen_id )
        ),
        invoice_items ( id, description, qty, unit_price, line_total ),
        payments ( id, amount, payment_method, payment_method_id, transaction_reference, created_at,
          payment_methods ( id, name )
        )
      `,
      )
      .eq('id', invoiceId)
      .single()

    if (error) throw new Error(error.message)
    return {
      ...data,
      // grand_total: prefer DB column, fall back to legacy total
      grand_total: data?.grand_total ?? data?.total,
      tax_total: data?.tax,
      discount_total: data?.discount,
      // orders is a single object from Supabase (unique FK) — ensure kot_tickets is array
      orders: data?.orders
        ? {
            ...data.orders,
            kot_tickets: Array.isArray(data.orders.kot_tickets)
              ? data.orders.kot_tickets
              : data.orders.kot_tickets
                ? [data.orders.kot_tickets]
                : [],
          }
        : null,
      invoice_items: (data?.invoice_items || []).map((ii) => ({
        ...ii,
        menu_item_name: ii.description,
        quantity: ii.qty,
        total_price: ii.line_total,
      })),
      payments: (data?.payments || []).map((p) => ({
        ...p,
        payment_method_name: p.payment_methods?.name || p.payment_method || 'Other',
      })),
    }
  }

  // ── Realtime (single channel, unique name) ─────────────────
  function subscribeRealtime() {
    const bid = branchId.value
    if (!bid) return

    // Cleanup existing channel
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }

    const channelName = `cashier-orders-${bid}`
    console.log('[CashierStore] Subscribing realtime:', channelName)

    ordersChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${bid}`,
        },
        (payload) => {
          handleOrderChange(payload)
        },
      )
      .subscribe((status) => {
        console.log('[CashierStore] RT Status:', status)
      })
  }

  // ── Debounced refresh ──────────────────────────────────────
  let refreshTimer = null
  function debouncedRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      fetchBillingQueue(true)
    }, 300)
  }

  function handleOrderChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // Always refresh for any new order (including pending_waiter from website)
      // so the cashier sees it immediately in the queue
      const isValidForQueue = [
        'pending',
        'pending_waiter',
        'accepted',
        'preparing',
        'ready',
        'served',
        'invoiced',
      ].includes(newRow.status)
      if (isValidForQueue) {
        debouncedRefresh()
        // Notify cashier of new website/delivery orders
        if (newRow.status === 'accepted') {
          Notify.create({
            message: `New Order Received! (#${newRow.order_number})`,
            caption: '✅ Order accepted — check Billing Queue.',
            color: 'orange-9',
            icon: 'receipt_long',
            position: 'top-right',
            timeout: 6000,
          })
        }
      }
    } else if (eventType === 'UPDATE') {
      const idx = billingOrders.value.findIndex((o) => o.id === newRow.id)

      // Remove from queue only if cancelled, or if completed but NOT paid.
      // (Paid completed orders stay in the queue for the Paid tab)
      if (
        newRow.status === 'cancelled' ||
        (newRow.status === 'completed' && newRow.payment_status !== 'paid')
      ) {
        if (idx !== -1) {
          billingOrders.value.splice(idx, 1)
        }
        return
      }

      if (idx !== -1) {
        const oldState = billingOrders.value[idx]

        // Notify POS when an order is ready
        if (oldState.status !== 'ready' && newRow.status === 'ready') {
          Notify.create({
            message: `Order #${newRow.order_number} is Ready!`,
            caption: 'Kitchen has finished preparation.',
            color: 'green-8',
            icon: 'room_service',
            position: 'top-right',
            timeout: 5000,
          })
        }

        if (oldState.status === 'pending_waiter' && newRow.status === 'accepted') {
          Notify.create({
            message: `Order Accepted! (#${newRow.order_number})`,
            caption: 'Waiter/Delivery boy accepted — billing queue updated.',
            color: 'orange-8',
            icon: 'check_circle',
            position: 'top-right',
            timeout: 5000,
          })
          // Always do a full refresh when accepted — we need complete order data (items, KOTs)
          debouncedRefresh()
          return
        }

        // Update local state in-place
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: newRow.status,
          payment_status: newRow.payment_status,
          updated_at: newRow.updated_at,
        }

        // Full refresh for structural status changes
        if (
          ['ready', 'served', 'invoiced'].includes(newRow.status) &&
          oldState.status !== newRow.status
        ) {
          debouncedRefresh()
        }
      } else {
        // Order not in local list yet — add it via full refresh
        const isValidForQueue = [
          'pending',
          'pending_waiter',
          'accepted',
          'preparing',
          'ready',
          'served',
          'invoiced',
          'paid',
        ].includes(newRow.status) || (newRow.status === 'completed' && newRow.payment_status === 'paid')
        if (isValidForQueue) {
          debouncedRefresh()
          if (newRow.status === 'accepted') {
            Notify.create({
              message: `New Order in Queue! (#${newRow.order_number})`,
              caption: 'Check Billing Queue.',
              color: 'orange-9',
              icon: 'receipt_long',
              position: 'top-right',
              timeout: 6000,
            })
          }
        }
      }
    } else if (eventType === 'DELETE') {
      billingOrders.value = billingOrders.value.filter((o) => o.id !== oldRow?.id)
    }
  }

  // ── Dialog helpers ─────────────────────────────────────────
  function openBillDialog(orderId) {
    selectedOrderId.value = orderId
    billDialogOpen.value = true
  }

  function closeBillDialog() {
    billDialogOpen.value = false
    selectedOrderId.value = null
  }

  function markQueueAsRead() {
    lastViewedAt.value = new Date()
  }

  // ── Cleanup ────────────────────────────────────────────────
  function cleanup() {
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    billingOrders.value = []
    booted = false
  }

  // ── Helpers ────────────────────────────────────────────────

  /**
   * Safely coerce a Supabase relation to an array.
   * Supabase returns a single object (not array) when the FK has UNIQUE constraint.
   * null / undefined → []
   * object (not array) → [object]
   * array → array
   */
  function toArray(value) {
    if (!value) return []
    if (Array.isArray(value)) return value
    return [value]
  }

  function normalizeQueueEntry(entry) {
    const order = entry.orders || entry
    return {
      id: order.id,
      queue_id: order.id,
      queue_status: order.status,
      queue_created_at: order.created_at,
      queue_updated_at: order.updated_at,
      order_number: order.order_number,
      order_type: order.order_type,
      order_source: order.order_source,
      status: order.status,
      payment_status: order.payment_status,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      subtotal: order.subtotal,
      tax_amount: order.tax_amount,
      discount_amount: order.discount_amount,
      total_amount: order.total_amount,
      service_charge: order.service_charge || 0,
      notes: order.notes,
      created_at: order.created_at,
      updated_at: order.updated_at,
      accepted_at: order.accepted_at,
      waiter_id: order.waiter_id,
      table_id: order.table_id,
      tableNumber: order.restaurant_tables?.table_number || order.table_number || '—',
      tableSection: order.restaurant_tables?.section || '',
      waiterName: order.waiter?.full_name || '—',
      order_items: (order.order_items || []).map((oi) => ({
        ...oi,
        name: oi.menu_items?.name || 'Item',
      })),
      kot_tickets: order.kot_tickets || [],
      // Supabase may return a single object (unique FK), null, or array — normalise to array
      invoices: toArray(order.invoices).map((inv) => ({
        ...inv,
        grand_total: inv.grand_total ?? inv.total,
      })),
      itemCount: (order.order_items || []).reduce((s, i) => s + i.quantity, 0),
    }
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
  }

  return {
    // State
    billingOrders,
    loading,
    processing,
    paymentMethods,
    selectedOrderId,
    billDialogOpen,
    lastViewedAt,
    // Getters
    branchId,
    readyCount,
    wipCount,
    invoicedCount,
    // Actions
    initialize,
    fetchBillingQueue,
    fetchBillingOrders, // alias
    fetchPaymentMethods,
    generateInvoice,
    recordPayment,
    quickPay,
    refundOrder,
    markServed,
    fetchInvoiceDetails,
    openBillDialog,
    closeBillDialog,
    markQueueAsRead,
    cleanup,
    getTimeAgo,
    // Internal helpers exposed for POSPage direct-fetch fallback
    _normalizeEntry: normalizeQueueEntry,
  }
})
