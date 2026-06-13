// ═══════════════════════════════════════════════════════════════════
// useRealtimeStatus — Vue Composable for Realtime Connection Health
// Seven Waves ERP — Step 03D
// ═══════════════════════════════════════════════════════════════════

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { realtimeManager, type ConnectionState } from '../core/realtime/realtime.manager'

/**
 * Composable that exposes reactive realtime connection status.
 *
 * Usage:
 *   const { isConnected, isReconnecting, health, channelStates } = useRealtimeStatus()
 */
export function useRealtimeStatus() {
  const channelStates = ref<Map<string, ConnectionState>>(new Map())
  let unsubscribe: (() => void) | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    // Listen for connection state changes
    unsubscribe = realtimeManager.onConnectionChange((key: string, state: ConnectionState) => {
      channelStates.value = new Map(channelStates.value).set(key, state)
    })

    // Poll health summary every 10 seconds for dashboard display
    pollTimer = setInterval(() => {
      // Force reactivity update
      const channels = realtimeManager.getManagedChannels()
      const newMap = new Map<string, ConnectionState>()
      for (const ch of channels) {
        newMap.set(ch.key, ch.state)
      }
      channelStates.value = newMap
    }, 10000)
  })

  onUnmounted(() => {
    unsubscribe?.()
    if (pollTimer) clearInterval(pollTimer)
  })

  const health = computed(() => realtimeManager.getHealthSummary())

  const isConnected = computed(() => {
    const h = health.value
    return h.total > 0 && h.connected === h.total
  })

  const isReconnecting = computed(() => {
    return health.value.reconnecting > 0
  })

  const hasErrors = computed(() => {
    return health.value.error > 0
  })

  /** CSS class for status dot: live / warning / error / offline */
  const statusClass = computed(() => {
    if (isConnected.value) return 'erp-status-dot--live'
    if (isReconnecting.value) return 'erp-status-dot--warning'
    if (hasErrors.value) return 'erp-status-dot--error'
    return 'erp-status-dot--offline'
  })

  /** Human-readable status */
  const statusText = computed(() => {
    const h = health.value
    if (h.total === 0) return 'No channels'
    if (isConnected.value) return `${h.connected} channels connected`
    if (isReconnecting.value) return `Reconnecting (${h.reconnecting}/${h.total})`
    if (hasErrors.value) return `${h.error} channels in error`
    return 'Disconnected'
  })

  return {
    channelStates,
    health,
    isConnected,
    isReconnecting,
    hasErrors,
    statusClass,
    statusText,
  }
}
