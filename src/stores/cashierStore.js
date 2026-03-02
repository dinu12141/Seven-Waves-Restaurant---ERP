import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/**
 * Cashier Billing Store (v2 – cashier_queue driven)
 *
 * Source of truth: cashier_queue table
 *   - Row is created by accept_order() RPC when waiter accepts
 *   - Status lifecycle: open → invoiced → paid | cancelled
 *
 * Flow:
 *  1. fetchBillingQueue()  → cashier_queue JOIN orders JOIN order_items / invoices
 *  2. generateInvoice(orderId)  → INSERT invoice + invoice_items → order.status = 'invoiced'
 *                              → cashier_queue.status = 'invoiced'
 *  3. recordPayment(invoiceId, orderId, payments[])
 *       → calls record_payment_and_close_order(RPC)
 *       → order.status='paid', cashier_queue.status='paid'
 *
 * Realtime: subscribes to cashier_queue + orders changes
 */
export const useCashierStore = defineStore('cashier', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const billingOrders = ref([]) // normalized queue entries (cashier_queue + joined order)
  const loading = ref(false)
  const processing = ref(false)

  const paymentMethods = ref([])
  const selectedOrderId = ref(null)
  const billDialogOpen = ref(false)

  // Realtime channels
  let queueChannel = null
  let ordersChannel = null

  // ── Getters ────────────────────────────────────────────────
  const branchId = computed(() => authStore.currentBranch?.id)
  const companyId = computed(() => authStore.currentBranch?.company_id)
  // userId accessed via authStore inside RPC calls (server-side via auth.uid())

  const readyCount = computed(
    () => billingOrders.value.filter((o) => ['ready', 'served'].includes(o.status)).length,
  )
  const wipCount = computed(
    () => billingOrders.value.filter((o) => ['accepted', 'preparing'].includes(o.status)).length,
  )
  const invoicedCount = computed(
    () => billingOrders.value.filter((o) => o.queue_status === 'invoiced').length,
  )

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await Promise.all([fetchBillingQueue(), fetchPaymentMethods()])
      subscribeRealtime()
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Billing Queue ────────────────────────────────────
  // Primary source: cashier_queue (status != 'paid' and 'cancelled')
  async function fetchBillingQueue() {
    if (!branchId.value) return

    const { data, error } = await supabase
      .from('cashier_queue')
      .select(
        `
        id,
        order_id,
        status as queue_status,
        created_at as queue_created_at,
        updated_at as queue_updated_at,
        orders!inner (
          id,
          order_number,
          order_type,
          order_source,
          status,
          payment_status,
          customer_name,
          customer_phone,
          subtotal,
          tax_amount,
          discount_amount,
          total_amount,
          notes,
          created_at,
          updated_at,
          accepted_at,
          waiter_id,
          table_id,
          branch_id,
          restaurant_tables ( table_number, section ),
          profiles!orders_waiter_id_fkey ( full_name ),
          order_items (
            id,
            quantity,
            unit_price,
            total_price,
            notes,
            status,
            menu_items ( id, name )
          ),
          kot_tickets (
            id,
            kot_number,
            status,
            kitchen_id,
            kot_items (
              id,
              order_item_id,
              quantity,
              status
            )
          ),
          invoices (
            id,
            invoice_number,
            status,
            payment_status,
            grand_total,
            created_at
          )
        )
      `,
      )
      .eq('orders.branch_id', branchId.value)
      .not('status', 'in', '(paid,cancelled)')
      .order('queue_created_at', { ascending: true })

    if (error) {
      console.error('[CashierStore] fetchBillingQueue error:', error)
      return
    }

    billingOrders.value = (data || []).map(normalizeQueueEntry)
  }

  // Keep alias for backward compat (used in CashierPage refresh btn)
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
  async function generateInvoice(orderId) {
    const entry = billingOrders.value.find((o) => o.id === orderId)
    if (!entry) throw new Error('Order not found in billing queue')

    const order = entry.orders || entry // handle both normalized shapes

    // Idempotency
    const existingInvoices = order.invoices || entry.invoices || []
    if (existingInvoices.length > 0) {
      return { success: true, invoice: existingInvoices[0], alreadyExisted: true }
    }

    processing.value = true
    try {
      // 1. Calculate actual items and totals based strictly on KOT
      const kotTickets = order.kot_tickets || entry.kot_tickets || []
      const validKotItems = []

      // Only consider KOTs that were not cancelled
      kotTickets.forEach((kot) => {
        if (kot.status !== 'cancelled') {
          const items = kot.kot_items || []
          items.forEach((ki) => {
            if (ki.status !== 'cancelled') {
              validKotItems.push(ki)
            }
          })
        }
      })

      // Aggregate quantities by order_item_id
      const billedQuantities = {}
      validKotItems.forEach((ki) => {
        if (!billedQuantities[ki.order_item_id]) {
          billedQuantities[ki.order_item_id] = 0
        }
        billedQuantities[ki.order_item_id] += ki.quantity
      })

      const orderItems = order.order_items || entry.order_items || []
      const invoiceItemsData = []
      let actualSubtotal = 0

      orderItems.forEach((oi) => {
        const billedQty = billedQuantities[oi.id] || 0
        if (billedQty > 0) {
          const unitPrice = parseFloat(oi.unit_price || 0)
          const totalPrice = unitPrice * billedQty
          actualSubtotal += totalPrice

          invoiceItemsData.push({
            order_item_id: oi.id,
            menu_item_name: oi.menu_items?.name || oi.name || 'Item',
            quantity: billedQty,
            unit_price: unitPrice,
            total_price: totalPrice,
            tax_amount: 0,
            discount_amount: 0,
          })
        }
      })

      // Fallback: If for some reason there are 0 KOT items (maybe direct billing items?),
      // we fallback to order.total_amount logic to avoid a zero bill. BUT the user specifically
      // requested "Bill eka print wenna ona KOT ekata anuwa", so we strictly use actualSubtotal.
      // If there ARE no KOTs, the Subtotal will be 0.

      // Assuming no complex tax/discount for now, or just proportional
      const actualGrandTotal = actualSubtotal
      // 2. Create invoice header
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          company_id: companyId.value,
          branch_id: branchId.value,
          order_id: orderId,
          customer_name: order.customer_name || null,
          customer_phone: order.customer_phone || null,
          subtotal: actualSubtotal,
          tax_total: 0, // Should be calculated if taxes exist
          discount_total: 0,
          grand_total: actualGrandTotal,
          payment_status: 'unpaid',
          status: 'issued',
        })
        .select('id, invoice_number, grand_total, status, payment_status, created_at')
        .single()

      if (invError) throw new Error(`Invoice creation failed: ${invError.message}`)

      // 3. Insert invoice items
      if (invoiceItemsData.length > 0) {
        const itemsPayload = invoiceItemsData.map((item) => ({
          ...item,
          invoice_id: invoice.id,
        }))
        const { error: itemsError } = await supabase.from('invoice_items').insert(itemsPayload)
        if (itemsError) console.warn('[CashierStore] invoice_items insert warning:', itemsError)
      }

      // 3. Update order status → 'invoiced'
      await supabase
        .from('orders')
        .update({ status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('id', orderId)

      // 4. Update cashier_queue status → 'invoiced'
      await supabase
        .from('cashier_queue')
        .update({ status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('order_id', orderId)

      // 5. Update local state
      const idx = billingOrders.value.findIndex((o) => o.id === orderId)
      if (idx !== -1) {
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: 'invoiced',
          queue_status: 'invoiced',
          invoices: [invoice],
        }
      }

      return { success: true, invoice }
    } finally {
      processing.value = false
    }
  }

  // ── Record Payment ─────────────────────────────────────────
  // Uses the atomic RPC: record_payment_and_close_order
  async function recordPayment(invoiceId, payments, orderId) {
    if (!invoiceId || !payments?.length) throw new Error('Invalid payment data')

    // Resolve orderId if not passed
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
      // Build payment rows JSONB array for RPC
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

      // Remove from local billing queue (realtime will also handle this)
      billingOrders.value = billingOrders.value.filter((o) => o.id !== targetOrderId)

      return { success: true, orderId: targetOrderId }
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
    const { error } = await supabase
      .from('orders')
      .update({ status: 'served', updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'ready')

    if (error) throw new Error(error.message)

    const idx = billingOrders.value.findIndex((o) => o.id === orderId)
    if (idx !== -1) billingOrders.value[idx].status = 'served'
  }

  // ── Fetch Full Invoice for Printing ───────────────────────
  async function fetchInvoiceDetails(invoiceId) {
    const { data, error } = await supabase
      .from('invoices')
      .select(
        `
        id,
        invoice_number,
        grand_total,
        status,
        payment_status,
        created_at,
        orders ( order_number, table_id ),
        invoice_items ( id, menu_item_name, quantity, unit_price, total_price ),
        payments ( id, amount, payment_method, transaction_reference, created_at )
      `,
      )
      .eq('id', invoiceId)
      .single()

    if (error) throw new Error(error.message)
    return {
      ...data,
      invoice_items: data?.invoice_items || [],
      payments: (data?.payments || []).map((p) => ({
        ...p,
        payment_method_name: p.payment_method || 'Other',
      })),
    }
  }

  // ── Realtime ───────────────────────────────────────────────
  function subscribeRealtime() {
    if (!branchId.value) return
    cleanup()

    // Subscribe to cashier_queue changes as primary trigger
    queueChannel = supabase
      .channel('cashier-queue-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cashier_queue',
          filter: 'status=eq.open',
        },
        handleQueueChange,
      )
      .subscribe()

    // Subscribe to orders for status updates (preparing, ready, etc.)
    ordersChannel = supabase
      .channel('cashier-orders-rt')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId.value}`,
        },
        handleOrderChange,
      )
      .subscribe()
  }

  function handleQueueChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // A new order entered the cashier queue — refresh to get full joined data
      fetchBillingQueue()
      return
    }

    if (eventType === 'UPDATE') {
      const terminal = ['paid', 'cancelled']
      if (terminal.includes(newRow.status)) {
        // Remove from queue
        billingOrders.value = billingOrders.value.filter((o) => o.queue_id !== newRow.id)
      } else {
        // Update queue status in place
        const idx = billingOrders.value.findIndex((o) => o.queue_id === newRow.id)
        if (idx !== -1) {
          billingOrders.value[idx] = {
            ...billingOrders.value[idx],
            queue_status: newRow.status,
            queue_updated_at: newRow.updated_at,
          }
        } else {
          fetchBillingQueue()
        }
      }
      return
    }

    if (eventType === 'DELETE') {
      billingOrders.value = billingOrders.value.filter((o) => o.queue_id !== oldRow?.id)
    }
  }

  function handleOrderChange(payload) {
    const { new: newRow } = payload
    const idx = billingOrders.value.findIndex((o) => o.id === newRow.id)
    if (idx !== -1) {
      billingOrders.value[idx] = {
        ...billingOrders.value[idx],
        status: newRow.status,
        payment_status: newRow.payment_status,
        updated_at: newRow.updated_at,
      }
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

  // ── Cleanup ────────────────────────────────────────────────
  function cleanup() {
    if (queueChannel) {
      supabase.removeChannel(queueChannel)
      queueChannel = null
    }
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    billingOrders.value = []
  }

  // ── Helpers ────────────────────────────────────────────────
  function normalizeQueueEntry(entry) {
    const order = entry.orders || {}
    return {
      // cashier_queue fields
      queue_id: entry.id,
      queue_status: entry.queue_status,
      queue_created_at: entry.queue_created_at,
      queue_updated_at: entry.queue_updated_at,
      // order fields (flattened for backward compat with CashierPage/BillDialog)
      id: order.id || entry.order_id,
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
      notes: order.notes,
      created_at: order.created_at,
      updated_at: order.updated_at,
      accepted_at: order.accepted_at,
      waiter_id: order.waiter_id,
      table_id: order.table_id,
      tableNumber: order.restaurant_tables?.table_number || '—',
      tableSection: order.restaurant_tables?.section || '',
      waiterName: order.profiles?.full_name || '—',
      order_items: (order.order_items || []).map((oi) => ({
        ...oi,
        name: oi.menu_items?.name || 'Item',
      })),
      kot_tickets: order.kot_tickets || [],
      invoices: order.invoices || [],
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
    markServed,
    fetchInvoiceDetails,
    openBillDialog,
    closeBillDialog,
    cleanup,
    getTimeAgo,
  }
})
