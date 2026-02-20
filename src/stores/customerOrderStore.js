import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Customer Order Store — manages the ordering flow for the customer PWA.
 * Includes cart management and order tracking state.
 */
export const useCustomerOrderStore = defineStore('customerOrder', () => {
  // ── Session State ─────────────────────────────────────────
  const tableId = ref('T1')
  const tableName = ref('Table 01')
  const deviceCode = ref('DEV-123')

  // ── Cart State ────────────────────────────────────────────
  const cartItems = ref([])
  const cartDrawerOpen = ref(false)

  // ── Tracking State ────────────────────────────────────────
  const currentOrder = ref(null) // Stores the last placed order for tracking

  // ── Getters ───────────────────────────────────────────────
  const itemCount = computed(() => cartItems.value.reduce((sum, item) => sum + item.qty, 0))
  const subtotal = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.price * item.qty, 0),
  )
  const isEmpty = computed(() => cartItems.value.length === 0)

  // ── Actions ───────────────────────────────────────────────
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

  function toggleCart() {
    cartDrawerOpen.value = !cartDrawerOpen.value
  }

  /**
   * Mock Implementation of Place Order
   */
  async function placeOrder() {
    if (isEmpty.value) return { success: false }

    const mockOrder = {
      id: 'ORD-' + Math.random().toString(36).slice(2, 9).toUpperCase(),
      status: 'pending_waiter',
      items: [...cartItems.value],
      total_amount: subtotal.value,
      created_at: new Date().toISOString(),
    }

    // Move to tracking
    currentOrder.value = mockOrder
    cartItems.value = []

    // In a real scenario, we'd return the order ID and redirect
    return { success: true, order: mockOrder }
  }

  return {
    // state
    tableId,
    tableName,
    deviceCode,
    cartItems,
    cartDrawerOpen,
    currentOrder,
    // getters
    itemCount,
    subtotal,
    isEmpty,
    // actions
    addItem,
    removeItem,
    updateQuantity,
    toggleCart,
    placeOrder,
  }
})
