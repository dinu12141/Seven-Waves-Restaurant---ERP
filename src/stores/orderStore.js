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
  const orderType = ref(null) // 'dine-in' | 'takeaway'
  const selectedTable = ref(null)
  const tableNumber = ref(null) // simple integer table number (1-80)
  const customerName = ref('')
  const selectedCustomer = ref(null)
  const discount = ref(0) // percentage
  const taxRate = ref(0) // percentage (Disabled: the restaurant exclusively uses Service Charge)
  const serviceChargeRate = ref(0.1) // loaded from company_settings key 'serviceChargeRate'
  const orderNumber = ref(_generateOrderNumber())
  const isSending = ref(false) // loading state for send-to-kitchen
  const _loadedOrderId = ref(null) // tracks order loaded from billing queue
  const deliverySource = ref(null) // 'uber' | 'pickme' | 'website' | null
  const deliveryCharge = ref(0) // delivery charge amount in LKR
  const parkedOrders = ref([]) // list of parked orders for current branch

  // ── Getters ──────────────────────────────────────────────

  const isEmpty = computed(() => cartItems.value.length === 0)

  const itemCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.qty, 0))

  const subtotal = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.price * item.qty, 0),
  )

  const discountAmount = computed(() => subtotal.value * (Math.min(discount.value, 100) / 100))

  const taxableAmount = computed(() => subtotal.value - discountAmount.value)

  const taxAmount = computed(() => taxableAmount.value * (taxRate.value / 100))

  const serviceChargeAmount = computed(() => {
    if (orderType.value === 'dine-in') {
      return subtotal.value * serviceChargeRate.value
    }
    return 0
  })

  const total = computed(() =>
    taxableAmount.value + taxAmount.value + serviceChargeAmount.value + (deliveryCharge.value || 0),
  )

  // ── Actions ──────────────────────────────────────────────

  /**
   * Add a product to the cart.
   * If the same product+variant combo exists, increment its quantity.
   * product.id must be a real UUID from menu_items table.
   */
  function addItem(product, variant = null) {
    const variantName = variant ? (typeof variant === 'object' ? variant.name : variant) : null
    const variantId = variant ? (typeof variant === 'object' ? variant.id : null) : null
    const resolvedPrice = variant ? (typeof variant === 'object' ? variant.price : product.price) : product.price

    const existingIndex = cartItems.value.findIndex(
      (item) => item.productId === product.id && item.variant === variantName,
    )

    if (existingIndex !== -1) {
      cartItems.value[existingIndex].qty++
    } else {
      cartItems.value.push({
        id: _uid(),
        productId: product.id, // UUID from menu_items
        name: product.name,
        price: resolvedPrice,
        image: product.image,
        kitchenId: product.kitchen_id, // Store kitchen info for KOT routing
        variant: variantName,
        variant_id: variantId,
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
    selectedCustomer.value = null
    selectedTable.value = null
    tableNumber.value = null
    discount.value = 0
    deliveryCharge.value = 0
    orderNumber.value = _generateOrderNumber()
    _loadedOrderId.value = null
    deliverySource.value = null
    orderType.value = null
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
    if (!companyId) {
      throw new Error('Company information not loaded. Please refresh the page and try again.')
    }

    isSending.value = true

    try {
      // ── Step 1: Insert order ──────────────────────────────
      const isDineIn = orderType.value === 'dine-in'
      const isDelivery = orderType.value === 'delivery'
      const orderPayload = {
        company_id: companyId,
        branch_id: branchId,
        waiter_id: waiterId || null,
        order_type: isDineIn ? 'dine_in' : (isDelivery ? 'delivery' : 'takeaway'),
        order_source: 'pos',
        status: 'pending_waiter',
        payment_status: 'unpaid',
        table_id: _isUUID(selectedTable.value) ? selectedTable.value : null,
        table_number: tableNumber.value ? (parseInt(String(tableNumber.value).replace(/\D/g, '')) || null) : null,
        total_amount: parseFloat(total.value.toFixed(2)),
        customer_name: customerName.value || null,
        customer_id: selectedCustomer.value?.id || selectedCustomer.value?.customer_id || null,
        subtotal: parseFloat(subtotal.value.toFixed(2)),
        tax_amount: parseFloat(taxAmount.value.toFixed(2)),
        service_charge: parseFloat(serviceChargeAmount.value.toFixed(2)),
        discount_amount: parseFloat(discountAmount.value.toFixed(2)),
        delivery_charge: parseFloat((deliveryCharge.value || 0).toFixed(2)),
        delivery_source: deliverySource.value || null,
      }

      // ── Steps 2+3: Atomic order + items insert (P0 #48/#49) ──────────
      // One DB transaction: if items fail, the order rolls back too — no
      // orphaned zero-item orders and no fragile client-side delete-rollback.
      const itemsPayload = cartItems.value.map((item) => {
        const itemQty = parseInt(item.qty) || 1
        const itemPrice = parseFloat(item.price) || 0
        return {
          menu_item_id: item.productId,
          variant_id: item.variant_id || null,
          kitchen_id: item.kitchenId || null, // null = let RPC resolve via subcategory map
          quantity: itemQty,
          unit_price: itemPrice,
          total_price: parseFloat((itemQty * itemPrice).toFixed(2)),
          notes: item.notes || null,
          status: 'queued',
        }
      })

      const { data: createRes, error: createErr } = await supabase.rpc(
        'pos_create_order_with_items',
        { p_order: orderPayload, p_items: itemsPayload },
      )
      if (createErr) throw new Error(`Failed to create order: ${createErr.message}`)
      if (!createRes?.success) throw new Error(createRes?.error || 'Failed to create order')
      const order = createRes.order

      // ── Step 4: Update table status to occupied for real-time responsiveness ──
      if (isDineIn && _isUUID(selectedTable.value)) {
        await supabase
          .from('restaurant_tables')
          .update({
            status: 'occupied',
            current_order_id: order.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedTable.value)
          .catch((err) => console.warn('[OrderStore] Table status update notice:', err.message))
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
    if (!companyId) {
      throw new Error('Company information not loaded. Please refresh the page and try again.')
    }

    isSending.value = true

    try {
      // ── Step 1: Create order (status: pending_waiter) ────────────────────
      const isDineIn = orderType.value === 'dine-in'
      const isDelivery = orderType.value === 'delivery'
      const orderPayload = {
        company_id: companyId,
        branch_id: branchId,
        waiter_id: userId || null,
        order_type: isDineIn ? 'dine_in' : (isDelivery ? 'delivery' : 'takeaway'),
        order_source: 'pos',
        status: 'pending_waiter',
        payment_status: 'unpaid',
        table_id: _isUUID(selectedTable.value) ? selectedTable.value : null,
        table_number: tableNumber.value ? (parseInt(String(tableNumber.value).replace(/\D/g, '')) || null) : null,
        total_amount: parseFloat(total.value.toFixed(2)),
        customer_name: customerName.value || null,
        customer_id: selectedCustomer.value?.id || selectedCustomer.value?.customer_id || null,
        subtotal: parseFloat(subtotal.value.toFixed(2)),
        tax_amount: parseFloat(taxAmount.value.toFixed(2)),
        service_charge: parseFloat(serviceChargeAmount.value.toFixed(2)),
        discount_amount: parseFloat(discountAmount.value.toFixed(2)),
        delivery_charge: parseFloat((deliveryCharge.value || 0).toFixed(2)),
        delivery_source: deliverySource.value || null,
      }

      // ── Steps 1+2: Atomic order + items insert (P0 #48/#49) ──────────
      // NOTE: kitchen_id may be null for items without a direct pin.
      // The accept/generate_kots RPC resolves routing via subcategory → kitchen map.
      const itemsPayload = cartItems.value.map((item) => {
        const qty = parseInt(item.qty) || 1
        const price = parseFloat(item.price) || 0
        return {
          menu_item_id: item.productId,
          variant_id: item.variant_id || null,
          kitchen_id: item.kitchenId || null, // null = let RPC resolve via subcategory map
          quantity: qty,
          unit_price: price,
          total_price: parseFloat((qty * price).toFixed(2)),
          notes: item.notes || null,
          status: 'queued',
        }
      })

      const { data: createRes, error: createErr } = await supabase.rpc(
        'pos_create_order_with_items',
        { p_order: orderPayload, p_items: itemsPayload },
      )
      if (createErr) throw new Error(`Failed to create order: ${createErr.message}`)
      if (!createRes?.success) throw new Error(createRes?.error || 'Failed to create order')
      const order = createRes.order

      // ── Step 3: Accept + invoice + payment in ONE atomic txn (P0 #48) ─────
      // pos_quick_pay wraps process_waiter_accept → process_cashier_invoice →
      // process_cashier_payment server-side; any failure rolls the whole thing
      // back, so there is no cooked/dispatched-but-unpaid window. The RPC charges
      // the server-side locked order.total_amount; p_amount_paid is cash tendered
      // (used only for change_due).
      const { data: quickPay, error: quickPayErr } = await supabase.rpc('pos_quick_pay', {
        p_order_id: order.id,
        p_payment_method: paymentMethodName || 'cash',
        p_amount_paid: parseFloat(total.value.toFixed(2)),
      })
      if (quickPayErr) throw new Error(`Quick-Pay RPC failed: ${quickPayErr.message}`)
      if (!quickPay?.success) throw new Error(quickPay?.error || 'pos_quick_pay failed')

      // ── Step 4: Loyalty reward (best-effort — do not fail payment) ─────────
      const customerId = selectedCustomer.value?.id || selectedCustomer.value?.customer_id
      if (customerId) {
        await supabase.rpc('rpc_apply_loyalty_reward', { p_order_id: order.id }).catch(() => {})
      }

      // ── Step 5: Success ──────────────────────────────────────────────────
      const result = {
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        paymentMethod: paymentMethodName,
        total: parseFloat(total.value.toFixed(2)),
        changeDue: quickPay.change_due ?? 0,
        kotCount: quickPay.kot_count ?? 0,
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
    const rand = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    return `ORD-${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}`
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  }

  /** Check if a string is a valid UUID v4 format */
  function _isUUID(val) {
    if (!val || typeof val !== 'string') return false
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)
  }

  /**
   * Park (hold) the current order — saves cart + metadata to parked_orders table.
   * Returns the saved parked order row.
   */
  async function parkOrder({ label } = {}) {
    const authStore = useAuthStore()
    const { data, error } = await supabase
      .from('parked_orders')
      .insert({
        company_id: authStore.currentBranch?.company_id,
        branch_id: authStore.currentBranch?.id,
        parked_by: authStore.user?.id,
        label: label || `Parked ${new Date().toLocaleTimeString()}`,
        cart_items: cartItems.value,
        order_type: orderType.value,
        customer_id: selectedCustomer.value?.id || selectedCustomer.value?.customer_id || null,
        customer_name: customerName.value || null,
        table_number: tableNumber.value || null,
        selected_table: selectedTable.value || null,
        discount_amount: discountAmount.value || 0,
        delivery_charge: deliveryCharge.value || 0,
        notes: null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  /**
   * Recall a previously parked order — loads it back into the cart and deletes the parked row.
   */
  async function recallParkedOrder(parkedOrderId) {
    const { data, error } = await supabase
      .from('parked_orders')
      .select('*')
      .eq('id', parkedOrderId)
      .single()
    if (error) throw error
    // Delete after recall so it can't be loaded twice
    await supabase.from('parked_orders').delete().eq('id', parkedOrderId)
    return data
  }

  /**
   * Fetch all parked orders for the current branch.
   */
  async function fetchParkedOrders() {
    const authStore = useAuthStore()
    const { data, error } = await supabase
      .from('parked_orders')
      .select('*')
      .eq('branch_id', authStore.currentBranch?.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    parkedOrders.value = data || []
    return parkedOrders.value
  }

  /**
   * Load an existing order from the billing queue into the POS cart.
   * This allows the cashier to view/process an order selected from OrderLookupDialog.
   * @param {Object} queueOrder - normalized order object from cashierStore.billingOrders
   */
  function loadOrderFromQueue(queueOrder, mergedOrders = []) {
    // Clear existing cart first
    clearCart()

    // Set order metadata
    orderNumber.value = queueOrder.order_number || _generateOrderNumber()
    orderType.value = queueOrder.order_type === 'dine_in' ? 'dine-in' 
                    : queueOrder.order_type === 'takeaway' ? 'takeaway' 
                    : queueOrder.order_type === 'delivery' ? 'delivery' 
                    : 'dine-in'
    
    // Set table info
    if (queueOrder.table_id) {
      selectedTable.value = queueOrder.table_id
    }
    tableNumber.value = queueOrder.tableNumber || queueOrder.table_number || null

    // Set customer info
    customerName.value = queueOrder.customer_name || ''
    if (queueOrder.customer_name) {
      selectedCustomer.value = {
        full_name: queueOrder.customer_name,
        phone: queueOrder.customer_phone || '',
      }
    }

    // Set discount if any (2dp precision to avoid rounding-induced overcharge/undercharge)
    if (queueOrder.discount_amount && queueOrder.subtotal) {
      discount.value = Math.round((queueOrder.discount_amount / queueOrder.subtotal) * 10000) / 100
    }

    // Load order items into cart
    const ordersToLoad = mergedOrders.length > 0 ? mergedOrders : [queueOrder]
    
    ordersToLoad.forEach(order => {
      const items = order.order_items || []
      items.forEach(item => {
        cartItems.value.push({
          id: item.id || _uid(),
          productId: item.menu_items?.id || item.productId || item.id,
          name: item.name || item.menu_items?.name || 'Item',
          price: item.unit_price || item.price || 0,
          image: item.image || null,
          kitchenId: item.kitchen_id || null,
          variant: item.variant || null,
          qty: item.quantity || item.qty || 1,
          notes: item.notes || '',
        })
      })
    })

    // Store the source order ID so payment knows which order to update
    _loadedOrderId.value = queueOrder.id
    deliverySource.value = queueOrder.delivery_source || null
  }

  async function loadServiceChargeRate() {
    const authStore = useAuthStore()
    const companyId = authStore.companyId
    if (!companyId) return
    const { data } = await supabase
      .from('company_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'serviceChargeRate')
      .maybeSingle()
    if (data?.value !== undefined && data.value !== null) {
      const pct = parseFloat(data.value)
      if (!isNaN(pct) && pct >= 0 && pct <= 100) {
        serviceChargeRate.value = pct / 100
      }
    }
  }

  return {
    // state
    cartItems,
    orderType,
    selectedTable,
    tableNumber,
    customerName,
    selectedCustomer,
    discount,
    taxRate,
    serviceChargeRate,
    orderNumber,
    isSending,
    _loadedOrderId,
    deliverySource,
    deliveryCharge,
    // getters
    isEmpty,
    itemCount,
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    serviceChargeAmount,
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
    loadOrderFromQueue,
    parkOrder,
    recallParkedOrder,
    fetchParkedOrders,
    parkedOrders,
    loadServiceChargeRate,
  }
})
