import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sendHeartbeat } from 'src/services/tableAuthService'

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_DEVICE_CODE_KEY = 'table_device_code'
const HEARTBEAT_INTERVAL_MS = 60_000 // 60 seconds

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTableSessionStore = defineStore('tableSession', () => {
  // ── State ──────────────────────────────────────────────────────────────────

  /** Plaintext token — held in memory only, never persisted. */
  const sessionToken = ref<string | null>(null)
  const sessionId = ref<string | null>(null)
  const tableId = ref<string | null>(null)
  const branchId = ref<string | null>(null)
  const expiresAt = ref<string | null>(null)

  /** Remembered device code (persisted in localStorage). */
  const savedDeviceCode = ref<string>(
    typeof window !== 'undefined' ? (localStorage.getItem(LS_DEVICE_CODE_KEY) ?? '') : '',
  )

  const heartbeatTimer = ref<ReturnType<typeof setInterval> | null>(null)
  const remainingSec = ref<number | null>(null)
  const sessionExpired = ref(false)
  const activeOrders = ref<string[]>([])

  // Order history: array of { id, order_number, total_amount, paid_at }
  const orderHistory = ref<Array<{
    id: string
    order_number?: number
    total_amount?: number
    paid_at?: string
  }>>([])

  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('table_active_orders')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) activeOrders.value = parsed
        else activeOrders.value = []
      }
    } catch (e) {
      console.error('[TableSession] Failed to load active orders:', e)
      activeOrders.value = []
    }

    try {
      const savedHistory = localStorage.getItem('table_order_history')
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory)
        if (Array.isArray(parsed)) orderHistory.value = parsed
        else orderHistory.value = []
      }
    } catch (e) {
      console.error('[TableSession] Failed to load order history:', e)
      orderHistory.value = []
    }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const isAuthenticated = computed(() => !!sessionToken.value && !sessionExpired.value)

  const expiresDate = computed(() => (expiresAt.value ? new Date(expiresAt.value) : null))

  // ── Actions ────────────────────────────────────────────────────────────────

  function setSession(result: {
    session_token: string
    session_id: string
    table_id: string
    branch_id: string
    expires_at: string
  }) {
    sessionToken.value = result.session_token
    sessionId.value = result.session_id
    tableId.value = result.table_id
    branchId.value = result.branch_id
    expiresAt.value = result.expires_at
    sessionExpired.value = false

    startHeartbeat()
  }

  function rememberDeviceCode(code: string) {
    savedDeviceCode.value = code.trim()
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_DEVICE_CODE_KEY, savedDeviceCode.value)
    }
  }

  function clearSession() {
    stopHeartbeat()
    sessionToken.value = null
    sessionId.value = null
    tableId.value = null
    branchId.value = null
    expiresAt.value = null
    remainingSec.value = null
    sessionExpired.value = false
    activeOrders.value = []
    if (typeof window !== 'undefined') {
      // Clear all customer QR/kiosk session keys so a new customer starting on
      // the same shared device doesn't inherit the previous session.
      const customerKeys = [
        'table_active_orders',
        'tm_session_token',
        'qr_session_token',
        'tm_table_id',
        'tm_customer_name',
        'tm_loyalty_points',
        'tm_table',
      ]
      customerKeys.forEach((k) => localStorage.removeItem(k))
    }
  }

  function addActiveOrder(orderId: string) {
    if (!Array.isArray(activeOrders.value)) activeOrders.value = []
    if (orderId && !activeOrders.value.includes(orderId)) {
      activeOrders.value.push(orderId)
      if (typeof window !== 'undefined') {
        localStorage.setItem('table_active_orders', JSON.stringify(activeOrders.value))
      }
    }
  }

  /** Remove an order from the active list (after paid/cancelled) */
  function removeActiveOrder(orderId: string) {
    activeOrders.value = activeOrders.value.filter((id) => id !== orderId)
    if (typeof window !== 'undefined') {
      localStorage.setItem('table_active_orders', JSON.stringify(activeOrders.value))
    }
  }

  /** Move a paid/completed order from activeOrders into orderHistory */
  function moveOrderToHistory(orderData: {
    id: string
    order_number?: number
    total_amount?: number
    paid_at?: string
  }) {
    removeActiveOrder(orderData.id)

    // Add to front of history if not already there
    if (!orderHistory.value.find((o) => o.id === orderData.id)) {
      orderHistory.value.unshift(orderData)
      // Keep only last 10 orders in history
      if (orderHistory.value.length > 10) {
        orderHistory.value = orderHistory.value.slice(0, 10)
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('table_order_history', JSON.stringify(orderHistory.value))
      }
    }
  }

  /** Clear order history (e.g. when session ends) */
  function clearOrderHistory() {
    orderHistory.value = []
    if (typeof window !== 'undefined') {
      localStorage.removeItem('table_order_history')
    }
  }

  function startHeartbeat() {
    stopHeartbeat() // clear any previous timer

    heartbeatTimer.value = setInterval(async () => {
      if (!sessionToken.value) {
        stopHeartbeat()
        return
      }

      const result = await sendHeartbeat(sessionToken.value)

      if (!result.success) {
        console.warn('[TableSession] Heartbeat failed:', result.error)
        sessionExpired.value = true
        stopHeartbeat()
        return
      }

      remainingSec.value = result.remaining_sec ?? null
    }, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer.value !== null) {
      clearInterval(heartbeatTimer.value)
      heartbeatTimer.value = null
    }
  }

  return {
    // state
    sessionToken,
    sessionId,
    tableId,
    branchId,
    expiresAt,
    savedDeviceCode,
    remainingSec,
    sessionExpired,
    activeOrders,
    orderHistory,
    // computed
    isAuthenticated,
    expiresDate,
    // actions
    setSession,
    rememberDeviceCode,
    clearSession,
    startHeartbeat,
    stopHeartbeat,
    addActiveOrder,
    removeActiveOrder,
    moveOrderToHistory,
    clearOrderHistory,
  }
})

