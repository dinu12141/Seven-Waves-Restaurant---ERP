import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
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

  // Tracking for "new" notifications
  const lastViewedAt = ref(new Date())

  // userId accessed via authStore inside RPC calls (server-side via auth.uid())
  const branchId = computed(() => {
    return authStore.currentBranch?.id || authStore.profile?.branch_id
  })
  const companyId = computed(() => {
    return authStore.currentBranch?.company_id || authStore.profile?.company_id
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

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    if (loading.value) return
    loading.value = true

    try {
      console.log('[CashierStore] Initializing...')

      // Setup realtime even before we have data
      if (!ordersChannel) subscribeRealtime()

      // If branch is already there, fetch immediately
      if (branchId.value) {
        await Promise.all([fetchBillingQueue(), fetchPaymentMethods()])
      } else {
        // Wait and watch for branch
        console.log('[CashierStore] Waiting for branch data...')
      }

      lastViewedAt.value = new Date()
    } catch (err) {
      console.error('[CashierStore] Init error:', err)
      Notify.create({
        message: 'POS Initialization Failed',
        caption: err.message || 'Unknown error',
        color: 'red',
      })
    } finally {
      loading.value = false
    }
  }

  // Reactive watch to catch branch loads late
  watch(
    branchId,
    (newId) => {
      if (newId) {
        console.log('[CashierStore] Branch detected/changed reactive:', newId)
        fetchBillingQueue()
        fetchPaymentMethods()
        subscribeRealtime() // Ensure we subscribe with the new branch ID
      }
    },
    { immediate: true },
  )

  // ── Fetch Billing Queue ────────────────────────────────────
  // Primary source: orders table
  async function fetchBillingQueue(forceRefresh = false) {
    const idToUse = branchId.value || companyId.value
    if (!idToUse) {
      console.warn('[CashierStore] No branch or company ID available for fetchBillingQueue')
      Notify.create({
        message: 'Configuration Error',
        caption: 'Branch info not found. Please re-login.',
        color: 'red-8',
        icon: 'error',
      })
      return
    }

    console.log(`[CashierStore] Fetching queue for id: ${idToUse} (Force: ${forceRefresh})`)

    let query = supabase.from('orders').select(
      `
        id, order_number, order_type, order_source, status, payment_status,
        customer_name, customer_phone, subtotal, tax_amount, discount_amount,
        total_amount, notes, created_at, updated_at, accepted_at, waiter_id,
        table_id, branch_id,
        restaurant_tables ( table_number ),
        profiles ( full_name ),
        order_items (
          id, quantity, unit_price, total_price, notes, status,
          menu_items ( id, name )
        ),
        kot_tickets ( id, kot_number, status, kitchen_id )
      `,
    )

    // Apply filters based on what we have
    if (branchId.value) {
      query = query.eq('branch_id', branchId.value)
    } else {
      query = query.eq('company_id', companyId.value)
    }

    const { data: qData, error } = await query
      .in('status', [
        'pending',
        'pending_waiter',
        'accepted',
        'preparing',
        'ready',
        'served',
        'invoiced',
      ])
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[CashierStore] fetchBillingQueue error:', error)
      Notify.create({ message: 'Fetch Failed', caption: error.message, color: 'red' })
      return
    }

    console.log(`[CashierStore] Received ${qData?.length || 0} orders from DB`)

    // Cross-check: If 0 orders for branch, check if any exist for company
    if (qData?.length === 0 && branchId.value) {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId.value)
        .in('status', ['accepted', 'preparing', 'ready', 'served'])

      if (count > 0) {
        console.warn(
          `[CashierStore] Found ${count} orders for company but 0 for current branch (${branchId.value}). Possible branch mismatch.`,
        )
        if (forceRefresh) {
          Notify.create({
            message: 'Branch Mismatch Hook',
            caption: `Found orders in other branches. Current: ${branchId.value.substring(0, 8)}`,
            color: 'deep-orange',
            icon: 'warning',
            multiLine: true,
          })
        }
      }
    }

    if (qData?.length === 0 && forceRefresh) {
      Notify.create({
        message: 'No Orders Found',
        caption: `Checked for branch/company: ${idToUse.substring(0, 8)}...`,
        color: 'orange-8',
        icon: 'info',
      })
    }

    billingOrders.value = (qData || []).map(normalizeQueueEntry)
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

      // 4. Update order status → 'invoiced'
      await supabase
        .from('orders')
        .update({ status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('id', orderId)

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
    if (!branchId.value) {
      console.warn('[CashierStore] Cannot subscribe to realtime: No branchId')
      return
    }

    // Cleanup existing channels if any
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
    }

    console.log('[CashierStore] Subscribing to orders realtime for branch:', branchId.value)

    ordersChannel = supabase
      .channel('cashier-orders-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId.value}`,
        },
        (payload) => {
          console.log(
            '[CashierStore] Order RT Change:',
            payload.eventType,
            payload.new?.order_number,
          )
          handleOrderChange(payload)
        },
      )
      .subscribe((status) => {
        console.log('[CashierStore] RT Subscription Status:', status)
      })
  }

  function handleOrderChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    // Full refresh handles deep relations (KOTs, items, etc) reliably
    if (eventType === 'INSERT') {
      if (!['paid', 'cancelled', 'completed', 'pending_waiter'].includes(newRow.status)) {
        fetchBillingQueue()
      }
    } else if (eventType === 'UPDATE') {
      const idx = billingOrders.value.findIndex((o) => o.id === newRow.id)

      // Remove from queue if it moved to a closed status
      if (['paid', 'cancelled', 'completed'].includes(newRow.status)) {
        if (idx !== -1) {
          console.log('[CashierStore] Removing order from queue:', newRow.order_number)
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
            classes: 'glossy',
          })
        }

        // Notify when a pending order is accepted (Waiters)
        if (oldState.status === 'pending_waiter' && newRow.status === 'accepted') {
          Notify.create({
            message: `Order Accepted! (#${newRow.order_number})`,
            caption: 'Waiter has started processing the order.',
            color: 'orange-8',
            icon: 'check_circle',
            position: 'top-right',
            timeout: 5000,
            classes: 'glossy',
          })
        }

        // Update local state without full refresh for non-structural changes
        const needsRefresh =
          ['ready', 'served', 'invoiced'].includes(newRow.status) &&
          oldState.status !== newRow.status

        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: newRow.status,
          payment_status: newRow.payment_status,
          updated_at: newRow.updated_at,
        }

        if (needsRefresh) fetchBillingQueue()
      } else {
        // Not in current queue, but status is now valid for queue?
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
          console.log('[CashierStore] New active order detected via update, refreshing...')
          fetchBillingQueue()

          if (newRow.status === 'accepted') {
            Notify.create({
              message: `New Order Received! (#${newRow.order_number})`,
              caption: 'A waiter just accepted a new order. Check Billing Queue.',
              color: 'orange-9',
              icon: 'receipt_long',
              position: 'top-right',
              timeout: 6000,
              classes: 'glossy',
              actions: [
                {
                  label: 'View',
                  color: 'white',
                  flat: true,
                  handler: () => {
                    billDialogOpen.value = true
                  },
                },
              ],
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
    const order = entry.orders || entry
    return {
      id: order.id,
      queue_id: order.id, // Fallback for components mapping to queue_id
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
    markServed,
    fetchInvoiceDetails,
    openBillDialog,
    closeBillDialog,
    markQueueAsRead,
    cleanup,
    getTimeAgo,
  }
})
