import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/**
 * POS Order Store — manages the current order cart.
 *
 * Handles cart items, variants, per-item notes, quantity,
 * totals, and actions like Send to Kitchen / Payment.
 *
 * sendToKitchen() performs real Supabase inserts with
 * a manual rollback pattern (delete order if items fail).
 */
export const useOrderStore = defineStore('posOrder', () => {
  // ── State ────────────────────────────────────────────────
  const cartItems = ref([])
  const orderType = ref('dine-in') // 'dine-in' | 'takeaway'
  const selectedTable = ref(null)
  const customerName = ref('')
  const discount = ref(0) // percentage
  const taxRate = ref(10) // percentage
  const orderNumber = ref(_generateOrderNumber())
  const isSending = ref(false) // loading state for send-to-kitchen

  // ── Getters ──────────────────────────────────────────────

  const isEmpty = computed(() => cartItems.value.length === 0)

  const itemCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.qty, 0))

  const subtotal = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.price * item.qty, 0),
  )

  const discountAmount = computed(() => subtotal.value * (discount.value / 100))

  const taxableAmount = computed(() => subtotal.value - discountAmount.value)

  const taxAmount = computed(() => taxableAmount.value * (taxRate.value / 100))

  const total = computed(() => taxableAmount.value + taxAmount.value)

  // ── Actions ──────────────────────────────────────────────

  /**
   * Add a product to the cart.
   * If the same product+variant combo exists, increment its quantity.
   * product.id must be a real UUID from menu_items table.
   */
  function addItem(product, variant = null) {
    const existingIndex = cartItems.value.findIndex(
      (item) => item.productId === product.id && item.variant === variant,
    )

    if (existingIndex !== -1) {
      cartItems.value[existingIndex].qty++
    } else {
      cartItems.value.push({
        id: _uid(),
        productId: product.id, // UUID from menu_items
        name: product.name,
        price: product.price,
        image: product.image,
        kitchenId: product.kitchen_id, // Store kitchen info for KOT routing
        variant,
        qty: 1,
        notes: '',
      })
    }
  }

  /** Remove an item from the cart by index. */
  function removeItem(index) {
    cartItems.value.splice(index, 1)
  }

  /** Update the quantity of an item. Removes if qty drops to 0. */
  function updateQuantity(index, newQty) {
    if (newQty <= 0) {
      cartItems.value.splice(index, 1)
    } else {
      cartItems.value[index].qty = newQty
    }
  }

  /** Set notes for a specific cart item. */
  function setItemNotes(index, notes) {
    if (cartItems.value[index]) {
      cartItems.value[index].notes = notes
    }
  }

  /** Change the variant of an existing cart item. */
  function setItemVariant(index, variant) {
    if (cartItems.value[index]) {
      cartItems.value[index].variant = variant
    }
  }

  /** Clear entire cart and generate a new order number. */
  function clearCart() {
    cartItems.value = []
    customerName.value = ''
    selectedTable.value = null
    discount.value = 0
    orderNumber.value = _generateOrderNumber()
  }

  /**
   * Send current order to kitchen — real Supabase insert.
   *
   * Pattern:
   *   1. Insert into `orders`
   *   2. Insert into `order_items`
   *   3. If step 2 fails → delete the order (rollback)
   *
   * Returns { success: true, order } on success.
   * Throws an Error on failure (caller handles toast/UX).
   */
  async function sendToKitchen() {
    if (isEmpty.value) return { success: false, reason: 'cart_empty' }

    const authStore = useAuthStore()

    // Guard: ensure we have required context
    const companyId = authStore.currentBranch?.company_id
    const branchId = authStore.currentBranch?.id
    const waiterId = authStore.user?.id

    if (!branchId) {
      throw new Error('No branch assigned to your account. Please contact your administrator.')
    }

    isSending.value = true

    try {
      // ── Step 1: Insert order ──────────────────────────────
      // Core fields exist in both schema versions (schema.sql and orders.sql)
      const orderPayload = {
        branch_id: branchId,
        waiter_id: waiterId || null,
        order_type: orderType.value === 'dine-in' ? 'dine_in' : 'takeaway',
        order_source: 'pos',
        status: 'pending', // Create as pending first so trigger doesn't fire before items exist
        payment_status: 'unpaid',
        table_id: selectedTable.value || null,
        total_amount: parseFloat(total.value.toFixed(2)),
      }

      // Extended fields (present in orders.sql full schema — include if company_id available)
      if (companyId) {
        Object.assign(orderPayload, {
          company_id: companyId,
          customer_name: customerName.value || null,
          subtotal: parseFloat(subtotal.value.toFixed(2)),
          tax_amount: parseFloat(taxAmount.value.toFixed(2)),
          discount_amount: parseFloat(discountAmount.value.toFixed(2)),
        })
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number')
        .single()

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`)

      // ── Step 2: Insert order_items ────────────────────────
      const itemsPayload = cartItems.value.map((item) => {
        const itemQty = parseInt(item.qty) || 1
        const itemPrice = parseFloat(item.price) || 0
        return {
          order_id: order.id,
          menu_item_id: item.productId,
          kitchen_id: item.kitchenId || null,
          quantity: itemQty,
          unit_price: itemPrice,
          total_price: parseFloat((itemQty * itemPrice).toFixed(2)),
          notes: item.notes || null,
          status: 'queued',
        }
      })

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)

      // ── Step 3: Rollback if items insert failed ───────────
      if (itemsError) {
        // Best-effort delete of the orphaned order
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error(`Failed to save order items: ${itemsError.message}`)
      }

      // ── Step 4: Update status to 'accepted' to trigger KOT generation ────
      const { error: statusError } = await supabase
        .from('orders')
        .update({ status: 'accepted' })
        .eq('id', order.id)

      if (statusError) {
        console.error(
          '[POS] Failed to move order to accepted status (Stock/Trigger Error):',
          statusError,
        )
        // Rollback: delete the order if status update (and stock deduction) fails
        // This ensures the cart remains visible to the user so they can adjust items
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error(`Order failed: ${statusError.message}`)
      }

      return { success: true, order }
    } finally {
      isSending.value = false
    }
  }

  /**
   * Process payment for the current order.
   * Creates the order, invoice, and payment records in a transaction-like flow.
   */
  async function processPayment(paymentMethodName) {
    if (isEmpty.value) return { success: false, reason: 'cart_empty' }

    const authStore = useAuthStore()
    const companyId = authStore.currentBranch?.company_id
    const branchId = authStore.currentBranch?.id
    const userId = authStore.user?.id

    if (!branchId) {
      throw new Error('No branch assigned. Cannot process payment.')
    }

    isSending.value = true

    try {
      // 1. Get Payment Method ID
      const { data: pmData, error: pmError } = await supabase
        .from('payment_methods')
        .select('id')
        .ilike('name', paymentMethodName) // Case-insensitive match
        .single()

      if (pmError || !pmData) throw new Error(`Invalid payment method: ${paymentMethodName}`)
      const paymentMethodId = pmData.id

      // 2. Create Order (Status: 'pending' -> later 'paid')
      const orderPayload = {
        branch_id: branchId,
        waiter_id: userId || null,
        order_type: orderType.value === 'dine-in' ? 'dine_in' : 'takeaway',
        order_source: 'pos',
        status: 'pending',
        payment_status: 'unpaid',
        table_id: selectedTable.value || null,
        total_amount: parseFloat(total.value.toFixed(2)),
      }

      if (companyId) {
        Object.assign(orderPayload, {
          company_id: companyId,
          customer_name: customerName.value || null,
          subtotal: parseFloat(subtotal.value.toFixed(2)),
          tax_amount: parseFloat(taxAmount.value.toFixed(2)),
          discount_amount: parseFloat(discountAmount.value.toFixed(2)),
        })
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number')
        .single()

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`)

      // 3. Create Order Items
      const itemsPayload = cartItems.value.map((item) => ({
        order_id: order.id,
        menu_item_id: item.productId,
        kitchen_id: item.kitchenId || null, // Ensure kitchen_id is passed for KOT
        quantity: item.qty,
        unit_price: item.price,
        total_price: parseFloat((item.qty * item.price).toFixed(2)),
        notes: item.notes || null,
        status: 'queued',
      }))

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)

      if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error(`Failed to save items: ${itemsError.message}`)
      }

      // 4. Trigger KOT (pending -> accepted)
      // We update to 'accepted' so the KOT trigger fires.
      // Then we will update to 'paid'.
      const { error: acceptError } = await supabase
        .from('orders')
        .update({ status: 'accepted' })
        .eq('id', order.id)

      if (acceptError) throw new Error(`Failed to accept order: ${acceptError.message}`)

      // 5. Create Invoice
      // invoice_number is SERIAL, so we just insert and select it back
      const invoicePayload = {
        company_id: companyId,
        branch_id: branchId,
        order_id: order.id,
        customer_name: customerName.value || null,
        subtotal: orderPayload.subtotal || 0,
        tax_total: orderPayload.tax_amount || 0,
        discount_total: orderPayload.discount_amount || 0,
        grand_total: orderPayload.total_amount || 0,
        payment_status: 'paid',
        status: 'paid',
      }

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select('id, invoice_number')
        .single()

      if (invoiceError) throw new Error(`Failed to create invoice: ${invoiceError.message}`)

      // 6. Create Payment
      const paymentPayload = {
        invoice_id: invoice.id,
        payment_method_id: paymentMethodId,
        amount: orderPayload.total_amount,
        status: 'completed',
        received_by: userId || null,
      }

      const { error: paymentError } = await supabase.from('payments').insert(paymentPayload)

      if (paymentError) throw new Error(`Failed to record payment: ${paymentError.message}`)

      // 7. Update Order to 'paid'
      // This might trigger "Order Ready" checks or just mark it as paid.
      // We also set payment_status = 'paid'.
      const { error: finalError } = await supabase
        .from('orders')
        .update({ status: 'paid', payment_status: 'paid' })
        .eq('id', order.id)

      if (finalError) console.warn('Failed to update final order status', finalError)

      // 8. Success & Cleanup
      const result = {
        success: true,
        orderNumber: order.order_number,
        invoiceNumber: invoice.invoice_number,
        paymentMethod: paymentMethodName,
        total: orderPayload.total_amount,
      }

      clearCart()
      return result
    } catch (err) {
      console.error('Process Payment Error:', err)
      throw err
    } finally {
      isSending.value = false
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  function _generateOrderNumber() {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `ORD-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  }

  return {
    // state
    cartItems,
    orderType,
    selectedTable,
    customerName,
    discount,
    taxRate,
    orderNumber,
    isSending,
    // getters
    isEmpty,
    itemCount,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total,
    // actions
    addItem,
    removeItem,
    updateQuantity,
    setItemNotes,
    setItemVariant,
    clearCart,
    sendToKitchen,
    processPayment,
  }
})
