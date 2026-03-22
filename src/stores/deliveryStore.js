import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { Notify } from 'quasar'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import {
  fetchDeliveryQueue,
  fetchDeliveryDetail,
  fetchDeliveryHistory,
  acceptDelivery as svcAcceptDelivery,
  markPickedUp as svcMarkPickedUp,
  markDelivered as svcMarkDelivered,
} from 'src/services/deliveryService'

/**
 * Delivery Store
 *
 * Manages the delivery rider's dashboard state.
 * Provides realtime subscription for delivery assignments,
 * status transition actions, and notification handling.
 */
export const useDeliveryStore = defineStore('delivery', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const assignments = ref([])
  const activeDelivery = ref(null)
  const history = ref([])
  const loading = ref(false)
  const isConnected = ref(false)
  const processing = ref(false)

  // New assignment alert (sound + visual)
  const newAssignmentAlert = ref(null)

  // Subscriptions
  let deliveryChannel = null
  let ordersChannel = null
  let booted = false

  // ── Computed ────────────────────────────────────────────────

  const branchId = computed(() => {
    return authStore.currentBranch?.id || authStore.profile?.branch_id
  })

  const pendingAssignments = computed(() =>
    assignments.value.filter((a) => a.status === 'pending_rider'),
  )

  const acceptedAssignments = computed(() =>
    assignments.value.filter((a) => ['accepted', 'picked_up'].includes(a.status)),
  )

  const pendingCount = computed(() => pendingAssignments.value.length)
  const activeCount = computed(() => acceptedAssignments.value.length)
  const completedTodayCount = computed(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    return history.value.filter(
      (a) => a.delivered_at && new Date(a.delivered_at) >= todayStart,
    ).length
  })

  // ── Initialize ─────────────────────────────────────────────

  async function initialize() {
    if (booted || !branchId.value) return
    booted = true
    loading.value = true

    try {
      console.log('[DeliveryStore] Initializing with branch:', branchId.value)
      await Promise.all([loadAssignments(), loadHistory()])
      subscribeRealtime()
    } catch (err) {
      console.error('[DeliveryStore] Init error:', err)
      Notify.create({
        message: 'Delivery Init Failed',
        caption: err.message || 'Unknown error',
        color: 'red',
        actions: [
          {
            label: 'Retry',
            color: 'white',
            handler: () => {
              booted = false
              initialize()
            },
          },
        ],
      })
    } finally {
      loading.value = false
    }
  }

  // Watch for branch availability
  watch(
    branchId,
    (newId) => {
      if (newId && !booted) {
        initialize()
      }
    },
    { immediate: true },
  )

  // ── Data Loading ───────────────────────────────────────────

  async function loadAssignments() {
    const bid = branchId.value
    if (!bid) return

    const data = await fetchDeliveryQueue(bid)
    assignments.value = data.map(normalizeAssignment)
  }

  async function loadHistory() {
    const bid = branchId.value
    if (!bid) return

    const userId = authStore.user?.id
    const data = await fetchDeliveryHistory(bid, userId, 50)
    history.value = data.map(normalizeAssignment)
  }

  async function loadActiveDelivery(assignmentId) {
    const data = await fetchDeliveryDetail(assignmentId)
    if (data) {
      activeDelivery.value = normalizeAssignment(data)
    }
  }

  // ── Actions ────────────────────────────────────────────────

  async function acceptAssignment(assignmentId) {
    processing.value = true
    try {
      const result = await svcAcceptDelivery(assignmentId)
      if (!result.success) {
        throw new Error(result.error || 'Accept failed')
      }

      // Optimistic update
      const idx = assignments.value.findIndex((a) => a.id === assignmentId)
      if (idx !== -1) {
        assignments.value[idx] = {
          ...assignments.value[idx],
          status: 'accepted',
          rider_id: authStore.user?.id,
          accepted_at: new Date().toISOString(),
        }
      }

      Notify.create({
        message: 'Delivery Accepted!',
        caption: 'You are now responsible for this delivery.',
        color: 'green-8',
        icon: 'delivery_dining',
        position: 'top',
        timeout: 3000,
      })

      return result
    } catch (err) {
      Notify.create({
        message: 'Accept Failed',
        caption: err.message,
        color: 'red',
        icon: 'error',
      })
      throw err
    } finally {
      processing.value = false
    }
  }

  async function pickUp(assignmentId) {
    processing.value = true
    try {
      const result = await svcMarkPickedUp(assignmentId)
      if (!result.success) {
        throw new Error(result.error || 'Mark picked up failed')
      }

      // Optimistic update
      const idx = assignments.value.findIndex((a) => a.id === assignmentId)
      if (idx !== -1) {
        assignments.value[idx] = {
          ...assignments.value[idx],
          status: 'picked_up',
          picked_up_at: new Date().toISOString(),
        }
      }
      if (activeDelivery.value?.id === assignmentId) {
        activeDelivery.value = { ...activeDelivery.value, status: 'picked_up' }
      }

      Notify.create({
        message: 'Picked Up!',
        caption: 'Heading to customer.',
        color: 'blue-8',
        icon: 'local_shipping',
        position: 'top',
        timeout: 2000,
      })

      return result
    } catch (err) {
      Notify.create({
        message: 'Pickup Failed',
        caption: err.message,
        color: 'red',
      })
      throw err
    } finally {
      processing.value = false
    }
  }

  async function deliver(assignmentId) {
    processing.value = true
    try {
      const result = await svcMarkDelivered(assignmentId)
      if (!result.success) {
        throw new Error(result.error || 'Mark delivered failed')
      }

      // Remove from active, add to history
      assignments.value = assignments.value.filter((a) => a.id !== assignmentId)
      if (activeDelivery.value?.id === assignmentId) {
        activeDelivery.value = null
      }

      Notify.create({
        message: '✅ Delivered!',
        caption: 'Delivery completed successfully.',
        color: 'green',
        icon: 'check_circle',
        position: 'top',
        timeout: 3000,
      })

      // Refresh history
      await loadHistory()

      return result
    } catch (err) {
      Notify.create({
        message: 'Delivery Failed',
        caption: err.message,
        color: 'red',
      })
      throw err
    } finally {
      processing.value = false
    }
  }

  // ── Realtime ───────────────────────────────────────────────

  function subscribeRealtime() {
    const bid = branchId.value
    if (!bid) return

    // Cleanup existing
    if (deliveryChannel) {
      supabase.removeChannel(deliveryChannel)
      deliveryChannel = null
    }
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }

    // Delivery assignments channel
    deliveryChannel = supabase
      .channel(`delivery-queue-${bid}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_assignments',
          filter: `branch_id=eq.${bid}`,
        },
        (payload) => {
          handleAssignmentChange(payload)
        },
      )
      .subscribe((status) => {
        isConnected.value = status === 'SUBSCRIBED'
        console.log('[DeliveryStore] RT Status:', status)
      })

    // Orders channel — listen for 'ready' status to alert rider
    ordersChannel = supabase
      .channel(`delivery-orders-watch-${bid}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${bid}`,
        },
        (payload) => {
          handleOrderChange(payload)
        },
      )
      .subscribe()
  }

  function handleAssignmentChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // New delivery assignment — alert rider
      if (newRow.status === 'pending_rider') {
        // Trigger alert
        newAssignmentAlert.value = {
          id: newRow.id,
          customer_name: newRow.customer_name,
          delivery_address: newRow.delivery_address,
          timestamp: Date.now(),
        }
        playDeliveryAlert()

        Notify.create({
          message: '🚴 New Delivery Available!',
          caption: newRow.customer_name
            ? `Customer: ${newRow.customer_name}`
            : 'New delivery order waiting.',
          color: 'deep-purple',
          icon: 'delivery_dining',
          position: 'top',
          timeout: 8000,
          actions: [{ label: 'View', color: 'white' }],
        })
      }
      // Full refresh to get joined data
      loadAssignments()
    } else if (eventType === 'UPDATE') {
      const idx = assignments.value.findIndex((a) => a.id === newRow.id)

      if (['delivered', 'cancelled'].includes(newRow.status)) {
        // Remove from active list
        if (idx !== -1) {
          assignments.value.splice(idx, 1)
        }
        if (activeDelivery.value?.id === newRow.id) {
          activeDelivery.value = null
        }
        return
      }

      if (idx !== -1) {
        // Update in place
        assignments.value[idx] = {
          ...assignments.value[idx],
          status: newRow.status,
          rider_id: newRow.rider_id,
          accepted_at: newRow.accepted_at,
          picked_up_at: newRow.picked_up_at,
          delivered_at: newRow.delivered_at,
          updated_at: newRow.updated_at,
        }
      } else {
        // Not in list — full refresh
        loadAssignments()
      }

      // Update active delivery if viewing it
      if (activeDelivery.value?.id === newRow.id) {
        activeDelivery.value = {
          ...activeDelivery.value,
          status: newRow.status,
          rider_id: newRow.rider_id,
          accepted_at: newRow.accepted_at,
          picked_up_at: newRow.picked_up_at,
          delivered_at: newRow.delivered_at,
        }
      }
    } else if (eventType === 'DELETE') {
      assignments.value = assignments.value.filter((a) => a.id !== oldRow?.id)
    }
  }

  function handleOrderChange(payload) {
    const { new: newRow } = payload
    if (!newRow) return

    // When an order becomes 'ready' and has a delivery assignment, alert the rider
    if (newRow.status === 'ready' && newRow.order_source === 'website') {
      const assignment = assignments.value.find(
        (a) => a.order_id === newRow.id && a.rider_id === authStore.user?.id,
      )

      if (assignment) {
        playDeliveryAlert()
        Notify.create({
          message: '🔔 Food Ready for Pickup!',
          caption: `Order #${newRow.order_number} is ready. Go to kitchen.`,
          color: 'green-8',
          icon: 'local_fire_department',
          position: 'top',
          timeout: 10000,
          actions: [{ label: 'View', color: 'white' }],
        })

        // Update local assignment data
        if (activeDelivery.value?.order_id === newRow.id) {
          activeDelivery.value = {
            ...activeDelivery.value,
            orderStatus: 'ready',
          }
        }
      }
    }
  }

  // ── Sound Alert ────────────────────────────────────────────

  function playDeliveryAlert() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      if (audioCtx.state === 'suspended') audioCtx.resume()

      const playTone = (freq, type, startTime, dur, vol = 0.7) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = type
        osc.frequency.setValueAtTime(freq, startTime)
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02)
        gain.gain.setValueAtTime(vol, startTime + dur * 0.7)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
        osc.start(startTime)
        osc.stop(startTime + dur)
      }

      const now = audioCtx.currentTime
      // Delivery notification: two-tone chime
      playTone(659.25, 'sine', now, 0.25, 0.8) // E5
      playTone(783.99, 'sine', now + 0.3, 0.25, 0.8) // G5
      playTone(987.77, 'sine', now + 0.6, 0.4, 0.9) // B5 (long)

      console.log('[DeliveryStore] 🔔 Alert sound played')
    } catch (e) {
      console.error('[DeliveryStore] Audio alert failed:', e)
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function normalizeAssignment(entry) {
    const order = entry.order || {}
    return {
      ...entry,
      orderNumber: order.order_number || '?',
      orderStatus: order.status || 'unknown',
      orderTotal: order.total_amount || 0,
      orderSource: order.order_source || 'website',
      orderNotes: order.notes || '',
      riderName: entry.rider?.full_name || '—',
      items: order.order_items || [],
      timeAgo: getTimeAgo(entry.created_at),
    }
  }

  function getTimeAgo(dateStr) {
    if (!dateStr) return '—'
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
  }

  function clearAlert() {
    newAssignmentAlert.value = null
  }

  // ── Cleanup ────────────────────────────────────────────────

  function cleanup() {
    if (deliveryChannel) {
      supabase.removeChannel(deliveryChannel)
      deliveryChannel = null
    }
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    assignments.value = []
    history.value = []
    activeDelivery.value = null
    isConnected.value = false
    booted = false
  }

  return {
    // State
    assignments,
    activeDelivery,
    history,
    loading,
    isConnected,
    processing,
    newAssignmentAlert,
    // Computed
    branchId,
    pendingAssignments,
    acceptedAssignments,
    pendingCount,
    activeCount,
    completedTodayCount,
    // Actions
    initialize,
    loadAssignments,
    loadHistory,
    loadActiveDelivery,
    acceptAssignment,
    pickUp,
    deliver,
    clearAlert,
    cleanup,
  }
})
