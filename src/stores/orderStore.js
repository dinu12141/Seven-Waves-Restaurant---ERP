import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * POS Order Store — manages the current order cart with mock state.
 *
 * Handles cart items, variants, per-item notes, quantity,
 * totals, and actions like Send to Kitchen / Payment.
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
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
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

  /** Mock: send current order to kitchen. */
  function sendToKitchen() {
    if (isEmpty.value) return false

    // In production this would POST to Supabase
    // For now, simulate success
    return {
      success: true,
      orderNumber: orderNumber.value,
      items: cartItems.value.map((item) => ({
        name: item.name,
        variant: item.variant,
        qty: item.qty,
        notes: item.notes,
      })),
      table: selectedTable.value,
      type: orderType.value,
    }
  }

  /** Mock: process payment for the current order. */
  function processPayment(paymentMethod = 'cash') {
    if (isEmpty.value) return false

    const result = {
      success: true,
      orderNumber: orderNumber.value,
      paymentMethod,
      subtotal: subtotal.value,
      discount: discountAmount.value,
      tax: taxAmount.value,
      total: total.value,
      items: cartItems.value.length,
    }

    // Reset for next order
    clearCart()

    return result
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
