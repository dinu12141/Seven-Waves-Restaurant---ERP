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
        status: 'accepted', // POS manual orders skip waiter step → go directly to accepted
        payment_status: 'unpaid',
        table_id: selectedTable.value || null,
        total_amount: parseFloat(total.value.toFixed(2)),
        customer_name: customerName.value || null,
        subtotal: parseFloat(subtotal.value.toFixed(2)),
        tax_amount: parseFloat(taxAmount.value.toFixed(2)),
        discount_amount: parseFloat(discountAmount.value.toFixed(2)),
        accepted_at: new Date().toISOString(),
      }

      // Extended fields
      if (companyId) {
        Object.assign(orderPayload, {
          company_id: companyId,
        })
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number')
        .single()

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`)

      // ── Step 1.5: Resolve default kitchen for items with no kitchen_id ──
      // The DB trigger `generate_kot_on_accept` requires kitchen_id on order_items.
      // If an item has no kitchen assigned, we resolve the branch's default kitchen.
      let defaultKitchenId = null
      const hasItemsWithoutKitchen = cartItems.value.some((item) => !item.kitchenId)
      if (hasItemsWithoutKitchen) {
        const { data: kitchenData } = await supabase
          .from('kitchens')
          .select('id')
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()
        defaultKitchenId = kitchenData?.id || null
      }

      // ── Step 2: Insert order_items ────────────────────────
      const itemsPayload = cartItems.value.map((item) => {
        const itemQty = parseInt(item.qty) || 1
        const itemPrice = parseFloat(item.price) || 0
        return {
          order_id: order.id,
          menu_item_id: item.productId,
          kitchen_id: item.kitchenId || defaultKitchenId || null,
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

      // ── Step 4: Auto-generate KOTs and dispatch to kitchen ─────────
      // Call the generate_kots_for_order RPC which:
      //   - Creates KOT tickets per kitchen
      //   - Creates KOT items linked to order items
      //   - Dispatches to KITCHEN, CASHIER, INVENTORY, FINANCE
      //   - Creates cashier_queue, stock_queue, finance_queue entries
      const { data: kotResult, error: kotError } = await supabase.rpc('generate_kots_for_order', {
        p_order_id: order.id,
        p_branch_id: branchId,
        p_actor_id: waiterId || null,
      })

      if (kotError) {
        console.error('[OrderStore] KOT generation warning:', kotError.message)
        // Don't throw — order is still valid, KOTs can be created manually
      } else {
        console.log('[OrderStore] KOTs created:', kotResult?.kot_count, 'dispatches:', kotResult?.dispatch_count)
      }

      return { success: true, order }
    } finally {
      isSending.value = false
    }
  }

  /**
   * Process payment for the current order (Quick Pay / Cashier shortcut).
   *
   * Flow:
   *   1. Create order + items (same as sendToKitchen)
   *   2. Use process_waiter_accept RPC to assign order + generate KOTs atomically
   *   3. Use process_cashier_payment RPC to mark as paid, post finance & stock
   *
   * This routes through the full KOT orchestration pipeline, ensuring:
   *   - KOTs are generated
   *   - cashier_queue / stock_queue / finance_queue are created
   *   - Audit trail is complete
   *   - All mutations are server-side atomic
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
      // ── Step 1: Create order (status: pending_waiter) ────────────────────
      const orderPayload = {
        branch_id: branchId,
        waiter_id: userId || null,
        order_type: orderType.value === 'dine-in' ? 'dine_in' : 'takeaway',
        order_source: 'pos',
        status: 'pending_waiter',
        payment_status: 'unpaid',
        table_id: selectedTable.value || null,
        total_amount: parseFloat(total.value.toFixed(2)),
        customer_name: customerName.value || null,
        subtotal: parseFloat(subtotal.value.toFixed(2)),
        tax_amount: parseFloat(taxAmount.value.toFixed(2)),
        discount_amount: parseFloat(discountAmount.value.toFixed(2)),
      }
      if (companyId) orderPayload.company_id = companyId

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number')
        .single()

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`)

      // ── Step 2: Resolve default kitchen & insert order items ─────────────
      let defaultKitchenId = null
      const hasItemsWithoutKitchen = cartItems.value.some((item) => !item.kitchenId)
      if (hasItemsWithoutKitchen) {
        const { data: kData } = await supabase
          .from('kitchens')
          .select('id')
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()
        defaultKitchenId = kData?.id || null
      }

      const itemsPayload = cartItems.value.map((item) => {
        const qty = parseInt(item.qty) || 1
        const price = parseFloat(item.price) || 0
        return {
          order_id: order.id,
          menu_item_id: item.productId,
          kitchen_id: item.kitchenId || defaultKitchenId || null,
          quantity: qty,
          unit_price: price,
          total_price: parseFloat((qty * price).toFixed(2)),
          notes: item.notes || null,
          status: 'queued',
        }
      })

      const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)
      if (itemsError) {
        // Best-effort cleanup
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error(`Failed to save order items: ${itemsError.message}`)
      }

      // ── Step 3: Accept order via orchestration RPC (generates KOTs + queues) ─
      const { data: acceptData, error: acceptError } = await supabase.rpc(
        'process_waiter_accept',
        { p_order_id: order.id },
      )
      if (acceptError) throw new Error(`Accept RPC failed: ${acceptError.message}`)
      if (!acceptData?.success) throw new Error(acceptData?.error || 'process_waiter_accept failed')

      // ── Step 4: Mark as invoiced (cashier step) ──────────────────────────
      const { data: invoiceData, error: invoiceRpcError } = await supabase.rpc(
        'process_cashier_invoice',
        { p_order_id: order.id },
      )
      if (invoiceRpcError) throw new Error(`Invoice RPC failed: ${invoiceRpcError.message}`)
      if (!invoiceData?.success) throw new Error(invoiceData?.error || 'process_cashier_invoice failed')

      // ── Step 5: Record payment via orchestration RPC (posts finance + stock) ─
      const { data: payData, error: payRpcError } = await supabase.rpc(
        'process_cashier_payment',
        {
          p_order_id: order.id,
          p_payment_method: paymentMethodName || 'cash',
          p_amount_paid: parseFloat(total.value.toFixed(2)),
        },
      )
      if (payRpcError) throw new Error(`Payment RPC failed: ${payRpcError.message}`)
      if (!payData?.success) throw new Error(payData?.error || 'process_cashier_payment failed')

      // ── Step 6: Success ──────────────────────────────────────────────────
      const result = {
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        paymentMethod: paymentMethodName,
        total: parseFloat(total.value.toFixed(2)),
        kotCount: acceptData.kot_count,
      }

      clearCart()
      return result
    } catch (err) {
      console.error('[POS] processPayment error:', err)
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
