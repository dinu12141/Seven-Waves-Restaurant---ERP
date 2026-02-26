import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/**
 * Cashier Billing Store
 *
 * Flow:
 *   1. Fetch orders with status 'ready' | 'served'
 *   2. generateInvoice(orderId)  → INSERT invoice + invoice_items → set order.status = 'invoiced'
 *   3. recordPayment(invoiceId, method, amount, split?) → INSERT payment → set invoice.status = 'paid'
 *                                                        → set order.status = 'paid', payment_status = 'paid'
 *                                                        → DB trigger deducts inventory if module enabled
 */
export const useCashierStore = defineStore('cashier', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const billingOrders = ref([]) // orders ready for billing (status: ready | served | invoiced)
  const loading = ref(false)
  const processing = ref(false) // invoice / payment action in-flight

  const paymentMethods = ref([]) // loaded from payment_methods table
  const selectedOrderId = ref(null)
  const billDialogOpen = ref(false)

  // Realtime channel
  let ordersChannel = null

  // ── Getters ────────────────────────────────────────────────
  const branchId = computed(() => authStore.currentBranch?.id)
  const companyId = computed(() => authStore.currentBranch?.company_id)
  const userId = computed(() => authStore.user?.id)

  const readyCount = computed(
    () => billingOrders.value.filter((o) => ['ready', 'served'].includes(o.status)).length,
  )
  const invoicedCount = computed(
    () => billingOrders.value.filter((o) => o.status === 'invoiced').length,
  )

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await Promise.all([fetchBillingOrders(), fetchPaymentMethods()])
      subscribeRealtime()
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Orders ───────────────────────────────────────────
  async function fetchBillingOrders() {
    if (!branchId.value) return

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
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
        waiter_id,
        table_id,
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
        pos_invoices (
          id,
          invoice_number,
          status,
          payment_status,
          grand_total,
          created_at
        )
      `,
      )
      .eq('branch_id', branchId.value)
      .in('status', ['ready', 'served', 'invoiced'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[CashierStore] fetchBillingOrders error:', error)
      return
    }

    billingOrders.value = (data || []).map(normalizeOrder)
  }

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
  /**
   * Creates an invoice + invoice_items snapshot from the order.
   * Updates order.status → 'invoiced'.
   * Returns { success, invoice } or throws.
   */
  async function generateInvoice(orderId) {
    const order = billingOrders.value.find((o) => o.id === orderId)
    if (!order) throw new Error('Order not found')

    // Idempotency: if invoice already exists, return existing
    if (order.pos_invoices && order.pos_invoices.length > 0) {
      const existing = order.pos_invoices[0]
      return { success: true, invoice: existing, alreadyExisted: true }
    }

    processing.value = true
    try {
      // 1. Create invoice header
      const { data: invoice, error: invError } = await supabase
        .from('pos_invoices')
        .insert({
          company_id: companyId.value,
          branch_id: branchId.value,
          order_id: orderId,
          customer_name: order.customer_name || null,
          customer_phone: order.customer_phone || null,
          subtotal: order.subtotal || 0,
          tax_total: order.tax_amount || 0,
          discount_total: order.discount_amount || 0,
          grand_total: order.total_amount || 0,
          payment_status: 'unpaid',
          status: 'issued',
        })
        .select('id, invoice_number, grand_total, status, payment_status, created_at')
        .single()

      if (invError) throw new Error(`Invoice creation failed: ${invError.message}`)

      // 2. Snapshot invoice items
      const itemsPayload = (order.order_items || [])
        .filter((oi) => oi.status !== 'cancelled')
        .map((oi) => ({
          invoice_id: invoice.id,
          order_item_id: oi.id,
          menu_item_name: oi.menu_items?.name || 'Item',
          quantity: oi.quantity,
          unit_price: oi.unit_price,
          total_price: oi.total_price,
          tax_amount: 0,
          discount_amount: 0,
        }))

      if (itemsPayload.length > 0) {
        const { error: itemsError } = await supabase.from('pos_invoice_items').insert(itemsPayload)
        if (itemsError) console.warn('[CashierStore] pos_invoice_items insert warning:', itemsError)
      }

      // 3. Update order status → 'invoiced'
      await supabase.from('orders').update({ status: 'invoiced' }).eq('id', orderId)

      // Update local state
      const idx = billingOrders.value.findIndex((o) => o.id === orderId)
      if (idx !== -1) {
        billingOrders.value[idx] = {
          ...billingOrders.value[idx],
          status: 'invoiced',
          pos_invoices: [invoice],
        }
      }

      return { success: true, invoice }
    } finally {
      processing.value = false
    }
  }

  // ── Record Payment ─────────────────────────────────────────
  /**
   * Records payment(s) against an invoice.
   * Supports split payments (pass array of { methodId, amount }).
   * After all payments, marks:
   *   - invoice.payment_status = 'paid', invoice.status = 'paid'
   *   - order.status = 'paid', order.payment_status = 'paid'
   *
   * The DB trigger `trg_deduct_inv_on_pay` fires on order.payment_status → 'paid'
   * and deducts inventory automatically if the AUTO_DEDUCT module is enabled.
   */
  async function recordPayment(invoiceId, payments) {
    // payments = [{ methodId: UUID, amount: number, transactionRef?: string }]
    if (!invoiceId || !payments?.length) throw new Error('Invalid payment data')

    processing.value = true
    try {
      // 1. Insert payment rows
      const paymentRows = payments.map((p) => ({
        invoice_id: invoiceId,
        payment_method_id: p.methodId,
        amount: parseFloat(p.amount.toFixed(2)),
        transaction_ref: p.transactionRef || null,
        status: 'completed',
        received_by: userId.value || null,
        notes: p.notes || null,
      }))

      const { error: payError } = await supabase.from('pos_payments').insert(paymentRows)
      if (payError) throw new Error(`Payment recording failed: ${payError.message}`)

      // 2. Mark invoice as paid
      const { error: invError } = await supabase
        .from('pos_invoices')
        .update({ payment_status: 'paid', status: 'paid' })
        .eq('id', invoiceId)
      if (invError) throw new Error(`Invoice update failed: ${invError.message}`)

      // 3. Get order_id from invoice to mark order paid
      const { data: invData, error: fetchErr } = await supabase
        .from('pos_invoices')
        .select('order_id')
        .eq('id', invoiceId)
        .single()
      if (fetchErr) throw new Error(`Could not fetch invoice: ${fetchErr.message}`)

      // 4. Mark order as paid — this fires trg_deduct_inv_on_pay
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'paid' })
        .eq('id', invData.order_id)
      if (orderErr) throw new Error(`Order update failed: ${orderErr.message}`)

      // 5. Remove from local billing queue
      billingOrders.value = billingOrders.value.filter((o) => o.id !== invData.order_id)

      return { success: true, orderId: invData.order_id }
    } finally {
      processing.value = false
    }
  }

  // ── Quick Pay (for already-invoiced orders) ────────────────
  /**
   * All-in-one: generate invoice (if not already) then record payment.
   * Returns { success, invoice, orderId }.
   */
  async function quickPay(orderId, payments) {
    const { invoice } = await generateInvoice(orderId)
    const result = await recordPayment(invoice.id, payments)
    return { ...result, invoice }
  }

  // ── Mark as Served ─────────────────────────────────────────
  async function markServed(orderId) {
    const { error } = await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', orderId)
      .eq('status', 'ready') // only advance from 'ready' → 'served'

    if (error) throw new Error(error.message)

    const idx = billingOrders.value.findIndex((o) => o.id === orderId)
    if (idx !== -1) billingOrders.value[idx].status = 'served'
  }

  // ── Fetch Full Invoice for Printing ───────────────────────
  async function fetchInvoiceDetails(invoiceId) {
    const { data, error } = await supabase
      .from('pos_invoices')
      .select(
        `
        id,
        invoice_number,
        customer_name,
        customer_phone,
        subtotal,
        tax_total,
        discount_total,
        grand_total,
        payment_status,
        status,
        created_at,
        orders (
          order_number,
          order_type,
          notes,
          restaurant_tables ( table_number, section ),
          profiles!orders_waiter_id_fkey ( full_name )
        ),
        pos_invoice_items (
          id,
          menu_item_name,
          quantity,
          unit_price,
          total_price,
          tax_amount,
          discount_amount
        ),
        pos_payments (
          id,
          amount,
          transaction_ref,
          created_at,
          payment_methods ( name )
        )
      `,
      )
      .eq('id', invoiceId)
      .single()

    if (error) throw new Error(error.message)
    // Normalize so BillPrintTemplate can use invoice_items and payments keys
    return {
      ...data,
      invoice_items: data?.pos_invoice_items || [],
      payments: (data?.pos_payments || []).map((p) => ({
        ...p,
        payment_method_name: p.payment_methods?.name || '',
      })),
    }
  }

  // ── Realtime ───────────────────────────────────────────────
  function subscribeRealtime() {
    if (!branchId.value) return
    if (ordersChannel) supabase.removeChannel(ordersChannel)

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
        handleOrderChange,
      )
      .subscribe()
  }

  function handleOrderChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      if (['ready', 'served'].includes(newRow.status)) {
        fetchBillingOrders()
      }
    }

    if (eventType === 'UPDATE') {
      const billing = ['ready', 'served', 'invoiced']
      const terminal = ['paid', 'cancelled']

      if (terminal.includes(newRow.status)) {
        billingOrders.value = billingOrders.value.filter((o) => o.id !== newRow.id)
      } else if (billing.includes(newRow.status)) {
        const idx = billingOrders.value.findIndex((o) => o.id === newRow.id)
        if (idx !== -1) {
          billingOrders.value[idx] = {
            ...billingOrders.value[idx],
            status: newRow.status,
            payment_status: newRow.payment_status,
            updated_at: newRow.updated_at,
          }
        } else {
          // New order just became ready — refresh
          fetchBillingOrders()
        }
      }
    }

    if (eventType === 'DELETE') {
      billingOrders.value = billingOrders.value.filter((o) => o.id !== oldRow?.id)
    }
  }

  // ── Open Bill Dialog ───────────────────────────────────────
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
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    billingOrders.value = []
  }

  // ── Helpers ────────────────────────────────────────────────
  function normalizeOrder(order) {
    return {
      ...order,
      tableNumber: order.restaurant_tables?.table_number || '—',
      tableSection: order.restaurant_tables?.section || '',
      waiterName: order.profiles?.full_name || '—',
      itemCount: (order.order_items || []).reduce((s, i) => s + i.quantity, 0),
      order_items: (order.order_items || []).map((oi) => ({
        ...oi,
        name: oi.menu_items?.name || 'Item',
      })),
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
    invoicedCount,
    // Actions
    initialize,
    fetchBillingOrders,
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
