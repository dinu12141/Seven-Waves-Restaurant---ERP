import { ref, watch, onUnmounted } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useGeolocation } from './useGeolocation'

/**
 * useDeliveryTracking
 * ───────────────────────────────────────────────────────────────
 * Composable that tracks a delivery driver's GPS position and
 * upserts it into the `delivery_tracking` table every 10 seconds.
 *
 * Usage:
 *   const { startTracking, stopTracking, isTracking, lastCoords, trackingError }
 *     = useDeliveryTracking(orderId, deliveryStatus)
 *
 * - `orderId`        — ref<string>  current order UUID
 * - `deliveryStatus` — ref<string>  delivery assignment status
 *
 * Tracking auto-starts when status becomes 'picked_up' (On the Way)
 * and auto-stops when status becomes 'delivered'.
 */

const TRACKING_INTERVAL_MS = 10_000 // 10 seconds

export function useDeliveryTracking(orderId, deliveryStatus) {
  // ── State ──────────────────────────────────────────────────
  const isActive = ref(false)
  const lastCoords = ref(null)       // { lat, lng }
  const trackingError = ref(null)
  const upsertCount = ref(0)

  // Geolocation composable for raw GPS
  const geo = useGeolocation({ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })

  let intervalId = null

  // ── Core: upsert current position ─────────────────────────
  async function upsertPosition() {
    const oid = typeof orderId === 'object' ? orderId.value : orderId
    if (!oid) return

    // Get latest GPS reading
    const position = geo.coords.value
    if (!position || !position.latitude || !position.longitude) {
      console.warn('[DeliveryTracking] No GPS fix yet, skipping upsert')
      return
    }

    const lat = position.latitude
    const lng = position.longitude

    try {
      const { error } = await supabase
        .from('delivery_tracking')
        .upsert(
          {
            order_id: oid,
            lat,
            lng,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'order_id' }
        )

      if (error) {
        console.error('[DeliveryTracking] Upsert error:', error)
        trackingError.value = error.message
      } else {
        lastCoords.value = { lat, lng }
        trackingError.value = null
        upsertCount.value++
        console.log(`[DeliveryTracking] 📍 Upserted (${upsertCount.value}):`, lat.toFixed(6), lng.toFixed(6))
      }
    } catch (err) {
      console.error('[DeliveryTracking] Unexpected error:', err)
      trackingError.value = err.message
    }
  }

  // ── Start tracking ────────────────────────────────────────
  function startTracking() {
    if (isActive.value) return // already running

    console.log('[DeliveryTracking] ▶ Starting GPS tracking for order:', typeof orderId === 'object' ? orderId.value : orderId)

    // Start GPS watch
    geo.startTracking()
    isActive.value = true
    trackingError.value = null

    // Immediately try a first upsert after a short delay (let GPS warm up)
    setTimeout(() => upsertPosition(), 2000)

    // Then upsert every 10 seconds
    intervalId = setInterval(() => {
      upsertPosition()
    }, TRACKING_INTERVAL_MS)
  }

  // ── Stop tracking ─────────────────────────────────────────
  function stopTracking() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    geo.stopTracking()
    isActive.value = false
    console.log('[DeliveryTracking] ⏹ Stopped GPS tracking. Total upserts:', upsertCount.value)
  }

  // ── Clean up the tracking row from Supabase ───────────────
  async function clearTrackingData() {
    const oid = typeof orderId === 'object' ? orderId.value : orderId
    if (!oid) return

    try {
      await supabase
        .from('delivery_tracking')
        .delete()
        .eq('order_id', oid)

      console.log('[DeliveryTracking] 🧹 Cleaned up tracking row for order:', oid)
    } catch (err) {
      console.warn('[DeliveryTracking] Cleanup error:', err)
    }
  }

  // ── Auto-start/stop based on delivery status ──────────────
  if (deliveryStatus && typeof deliveryStatus === 'object') {
    watch(
      deliveryStatus,
      (newStatus) => {
        // Start when status is 'picked_up' (driver is on the way)
        if (newStatus === 'picked_up' && !isActive.value) {
          startTracking()
        }

        // Stop when delivered
        if (newStatus === 'delivered' && isActive.value) {
          stopTracking()
          // Optionally clean up the tracking row since delivery is complete
          clearTrackingData()
        }

        // Also stop if somehow cancelled
        if (newStatus === 'cancelled' && isActive.value) {
          stopTracking()
          clearTrackingData()
        }
      },
      { immediate: true }
    )
  }

  // ── Cleanup on component unmount ──────────────────────────
  onUnmounted(() => {
    stopTracking()
  })

  return {
    // State
    isActive,
    lastCoords,
    trackingError,
    upsertCount,

    // Geolocation details
    geoCoords: geo.coords,
    geoError: geo.error,
    permissionState: geo.permissionState,

    // Actions
    startTracking,
    stopTracking,
    clearTrackingData,
  }
}
