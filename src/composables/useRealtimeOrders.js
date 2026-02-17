import { ref, onMounted, onUnmounted, watch, toRef } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useOrderStore } from 'src/stores/orders'

/**
 * Composable — subscribe to Supabase Realtime Postgres Changes
 * for the full order lifecycle within a single branch.
 *
 * Usage (in any dashboard component):
 * ```js
 * const { isConnected, channelStatus, error } = useRealtimeOrders({ branchId })
 * ```
 *
 * @param {Object}            opts
 * @param {import('vue').Ref|string} opts.branchId  UUID of the active branch
 * @param {boolean}           [opts.hydrate=true]   Fetch existing orders on mount
 */
export function useRealtimeOrders({ branchId, hydrate = true } = {}) {
  const branchRef = toRef(typeof branchId === 'string' ? ref(branchId) : branchId)
  const orderStore = useOrderStore()

  const isConnected = ref(false)
  const channelStatus = ref('CLOSED')
  const error = ref(null)

  let channel = null

  // ── Tables we listen to ───────────────────────────────────
  const LISTENED_TABLES = [
    'orders',
    'order_items',
    'kot_tickets',
    'kot_items',
    'order_status_logs',
    'restaurant_tables',
  ]

  // Tables that carry a branch_id column we can filter on
  const BRANCH_FILTERABLE = new Set(['orders', 'restaurant_tables'])

  // ── Channel lifecycle ─────────────────────────────────────

  /**
   * Creates a Supabase Realtime channel and subscribes to
   * Postgres Changes for every order-lifecycle table.
   */
  function subscribe(activeBranchId) {
    // Tear down any existing channel first
    unsubscribe()

    if (!activeBranchId) return

    const channelName = `orders-realtime-${activeBranchId}`
    channel = supabase.channel(channelName)

    // Attach a postgres_changes listener for each table
    for (const table of LISTENED_TABLES) {
      const pgConfig = {
        event: '*',
        schema: 'public',
        table,
      }

      // Apply a branch filter where the table supports it
      if (BRANCH_FILTERABLE.has(table)) {
        pgConfig.filter = `branch_id=eq.${activeBranchId}`
      }

      channel.on('postgres_changes', pgConfig, (payload) => {
        orderStore.handleRealtimeEvent(payload.table, payload.eventType, payload.new, payload.old)
      })
    }

    // Subscribe and track connection state
    channel.subscribe((status, err) => {
      channelStatus.value = status

      if (status === 'SUBSCRIBED') {
        isConnected.value = true
        error.value = null
      } else if (status === 'CHANNEL_ERROR') {
        isConnected.value = false
        error.value = err ?? new Error('Realtime channel error')
        console.error('[useRealtimeOrders] Channel error:', err)
      } else if (status === 'TIMED_OUT') {
        isConnected.value = false
        error.value = new Error('Realtime channel timed out')
        console.warn('[useRealtimeOrders] Channel timed out — will auto-retry')
      } else if (status === 'CLOSED') {
        isConnected.value = false
      }
    })
  }

  /** Remove the channel and clean up. */
  function unsubscribe() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
      isConnected.value = false
      channelStatus.value = 'CLOSED'
    }
  }

  // ── Lifecycle hooks ───────────────────────────────────────

  onMounted(async () => {
    const id = branchRef.value
    if (!id) return

    // Hydrate store with current data before subscribing
    if (hydrate) {
      await orderStore.fetchInitialOrders(id)
    }

    subscribe(id)
  })

  onUnmounted(() => {
    unsubscribe()
  })

  // Re-subscribe when the branch changes at runtime
  watch(branchRef, async (newId, oldId) => {
    if (newId === oldId) return

    orderStore.clearAll()

    if (newId) {
      if (hydrate) {
        await orderStore.fetchInitialOrders(newId)
      }
      subscribe(newId)
    } else {
      unsubscribe()
    }
  })

  return {
    /** Reactive boolean — true when the WS channel is subscribed. */
    isConnected,
    /** Raw channel status string from Supabase (SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED). */
    channelStatus,
    /** Error object if the channel encountered an error. */
    error,
    /** Manually unsubscribe (e.g. on logout). */
    unsubscribe,
    /** Manually re-subscribe. */
    resubscribe: () => subscribe(branchRef.value),
  }
}
