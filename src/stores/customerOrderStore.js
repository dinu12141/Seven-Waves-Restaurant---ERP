import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'

/**
 * Customer Order Store — Connected to Supabase
 */
export const useCustomerOrderStore = defineStore('customerOrder', () => {
  // ── Session State ─────────────────────────────────────────
  const isLoggedIn = ref(false)
  const companyId = ref(null)
  const branchId = ref(null)
  const tableId = ref(null)
  const tableName = ref(null)
  const deviceCode = ref(null)
  const sessionToken = ref(null)
  const sessionError = ref(null)

  // ── Cart State ────────────────────────────────────────────
  const cartItems = ref([])
  const cartDrawerOpen = ref(false)
  const specialRequest = ref('')

  // ── Tracking State ────────────────────────────────────────
  const currentOrder = ref(null)
  const kotTickets = ref([])
  const isPlacingOrder = ref(false)
  const orderSubscription = ref(null)
  const kotSubscription = ref(null)

  // ── Getters ───────────────────────────────────────────────
  const itemCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.qty, 0))
  const subtotal = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.price * item.qty, 0),
  )
  const isEmpty = computed(() => cartItems.value.length === 0)
  const isTracking = computed(() => !!currentOrder.value)

  // Status order for tracking UI
  const STATUS_ORDER = ['pending_waiter', 'accepted', 'preparing', 'ready', 'served']

  // ── Session Actions ───────────────────────────────────────

  /**
   * Login via table number + device code
   */
  async function loginWithTableCode(tNo, dCode) {
    sessionError.value = null
    try {
      // 1. Validate device and table
      const { data: device, error } = await supabase
        .from('table_devices')
        .select(
          `
          id,
          device_code,
          branch_id,
          table_id,
          restaurant_tables!inner (
            id,
            table_number,
            company_id
          )
        `,
        )
        .eq('device_code', dCode)
        .eq('restaurant_tables.table_number', tNo)
        .single()

      if (error || !device) {
        sessionError.value = 'Invalid Table ID or Device Code.'
        return false
      }

      // 2. Set session state
      isLoggedIn.value = true
      companyId.value = device.restaurant_tables.company_id
      branchId.value = device.branch_id
      tableId.value = device.table_id
      tableName.value = `Table ${device.restaurant_tables.table_number}`
      deviceCode.value = device.device_code

      return true
    } catch (e) {
      console.error('Login error:', e)
      sessionError.value = 'An unexpected error occurred.'
      return false
    }
  }

  /**
   * Login via QR token
   */
  async function loginWithQRToken(token) {
    sessionError.value = null
    try {
      const { data: session, error } = await supabase
        .from('customer_sessions')
        .select(
          `
          id,
          table_id,
          restaurant_tables (
            table_number,
            company_id,
            branch_id
          )
        `,
        )
        .eq('session_token', token)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single()

      if (error || !session) {
        sessionError.value = 'Invalid or expired QR session.'
        return false
      }

      isLoggedIn.value = true
      companyId.value = session.restaurant_tables.company_id
      branchId.value = session.restaurant_tables.branch_id
      tableId.value = session.table_id
      tableName.value = `Table ${session.restaurant_tables.table_number}`
      sessionToken.value = token

      return true
    } catch (e) {
      console.error('QR Login error:', e)
      sessionError.value = 'Invalid QR session.'
      return false
    }
  }

  function logout() {
    isLoggedIn.value = false
    clearCart()
    stopSubscriptions()
    currentOrder.value = null
    tableId.value = null
    branchId.value = null
    companyId.value = null
  }

  // ── Cart Actions ────────────────────────────────────────────

  function addItem(product, variant = null) {
    const existingIndex = cartItems.value.findIndex(
      (item) => item.productId === product.id && item.variant === variant,
    )
    if (existingIndex !== -1) {
      cartItems.value[existingIndex].qty++
    } else {
      cartItems.value.push({
        id: Math.random().toString(36).slice(2, 9),
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        kitchenId: product.kitchen_id,
        variant,
        qty: 1,
        notes: '',
      })
    }
  }

  function removeItem(index) {
    cartItems.value.splice(index, 1)
  }

  function updateQuantity(index, newQty) {
    if (newQty <= 0) {
      cartItems.value.splice(index, 1)
    } else {
      cartItems.value[index].qty = newQty
    }
  }

  function updateNotes(index, notes) {
    cartItems.value[index].notes = notes
  }

  function clearCart() {
    cartItems.value = []
    specialRequest.value = ''
  }

  function toggleCart() {
    cartDrawerOpen.value = !cartDrawerOpen.value
  }

  function getItemQty(productId, variant = null) {
    const item = cartItems.value.find((i) => i.productId === productId && i.variant === variant)
    return item ? item.qty : 0
  }

  // ── Order Actions ──────────────────────────────────────────

  /**
   * Place Order Flow:
   * 1. Create order
   * 2. Create order_items
   * 3. Create KOT tickets by kitchen
   * 4. Create KOT items
   */
  async function placeOrder() {
    if (isEmpty.value) return { success: false }
    isPlacingOrder.value = true

    try {
      // 1. Create Order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          company_id: companyId.value,
          branch_id: branchId.value,
          table_id: tableId.value,
          order_source: 'qr',
          order_type: 'dine_in',
          status: 'pending_waiter',
          total_amount: subtotal.value,
          notes: specialRequest.value,
        })
        .select()
        .single()

      if (orderError) throw orderError

      // 2. Insert Order Items
      const orderItemsData = cartItems.value.map((item) => ({
        order_id: order.id,
        menu_item_id: item.productId,
        kitchen_id: item.kitchenId,
        quantity: item.qty,
        unit_price: item.price,
        total_price: item.price * item.qty,
        notes: item.notes,
        status: 'queued',
      }))

      const { data: insertedItems, error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData)
        .select()

      if (itemsError) throw itemsError

      // 3. Create KOT tickets by kitchen_id
      const kitchens = [...new Set(insertedItems.map((i) => i.kitchen_id).filter((id) => id))]

      for (const kId of kitchens) {
        const { data: kot, error: kotError } = await supabase
          .from('kot_tickets')
          .insert({
            order_id: order.id,
            kitchen_id: kId,
            status: 'created',
          })
          .select()
          .single()

        if (kotError) throw kotError

        // 4. Create KOT Items
        const kotItemsData = insertedItems
          .filter((oi) => oi.kitchen_id === kId)
          .map((oi) => ({
            kot_id: kot.id,
            order_item_id: oi.id,
            quantity: oi.quantity,
            status: 'queued',
          }))

        const { error: kiError } = await supabase.from('kot_items').insert(kotItemsData)

        if (kiError) throw kiError
      }

      currentOrder.value = order
      currentOrder.value.items = insertedItems
      currentOrder.value.table_name = tableName.value

      clearCart()
      startSubscriptions(order.id)

      return { success: true, order }
    } catch (e) {
      console.error('Place order failed:', e)
      return { success: false, error: e.message }
    } finally {
      isPlacingOrder.value = false
    }
  }

  // ── Realtime Subscriptions ─────────────────────────────────

  function startSubscriptions(orderId) {
    stopSubscriptions()

    // Subscribe to Orders
    orderSubscription.value = supabase
      .channel(`order-tracking-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          console.log('Order update received:', payload)
          if (currentOrder.value) {
            currentOrder.value = { ...currentOrder.value, ...payload.new }
          }
        },
      )
      .subscribe()

    // Subscribe to KOT Tickets for this order
    kotSubscription.value = supabase
      .channel(`kot-tracking-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_tickets',
          filter: `order_id=eq.${orderId}`,
        },
        async () => {
          // Re-fetch KOTs to simplified logic, or handle individual updates
          const { data } = await supabase.from('kot_tickets').select('*').eq('order_id', orderId)

          if (data) kotTickets.value = data
        },
      )
      .subscribe()
  }

  function stopSubscriptions() {
    if (orderSubscription.value) supabase.removeChannel(orderSubscription.value)
    if (kotSubscription.value) supabase.removeChannel(kotSubscription.value)
    orderSubscription.value = null
    kotSubscription.value = null
  }

  return {
    isLoggedIn,
    tableId,
    tableName,
    deviceCode,
    sessionToken,
    sessionError,
    cartItems,
    cartDrawerOpen,
    specialRequest,
    currentOrder,
    kotTickets,
    isPlacingOrder,
    itemCount,
    subtotal,
    isEmpty,
    isTracking,
    STATUS_ORDER,
    loginWithTableCode,
    loginWithQRToken,
    logout,
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    toggleCart,
    getItemQty,
    placeOrder,
  }
})
