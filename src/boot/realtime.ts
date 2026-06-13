// ═══════════════════════════════════════════════════════════════════
// REALTIME BOOT — Wire RealtimeManager + Event Handlers into App
// Seven Waves ERP — Step 03D
// ═══════════════════════════════════════════════════════════════════

import { boot } from 'quasar/wrappers'
import { realtimeManager } from '../core/realtime/realtime.manager'
import { EVENT_HANDLER_MAP } from '../core/realtime/event.handlers'
import { CHANNEL_REGISTRY, type ChannelDefinition } from '../core/realtime/channel.registry'
import { logger } from '../core/logging/logger'

export default boot(({ app }) => {
  // Skip in SSR
  if (typeof window === 'undefined') return

  // ── 1. Register all event handlers ─────────────────────────────
  for (const [registryKey, handler] of Object.entries(EVENT_HANDLER_MAP)) {
    realtimeManager.on(registryKey, handler)
  }

  // ── 2. Start heartbeat ─────────────────────────────────────────
  realtimeManager.startHeartbeat()

  // ── 3. Provide to components ───────────────────────────────────
  app.provide('realtimeManager', realtimeManager)

  logger.info('[RT Boot] Realtime manager initialized with event handlers')
})

/**
 * Subscribe to all channels the current user has permission for.
 * Call this from the auth store after login / branch switch.
 *
 * Usage:
 *   import { subscribeUserChannels } from 'src/boot/realtime'
 *   subscribeUserChannels(userId, branchId, userRole, userPermissions)
 */
export function subscribeUserChannels(
  userId: string,
  branchId: string,
  userRole: string,
  userPermissions: string[],
): void {
  // Set context for branch isolation
  realtimeManager.setContext(userId, branchId)

  // Subscribe to all channels the user has permission for
  for (const [registryKey, def] of Object.entries(CHANNEL_REGISTRY)) {
    // Check permission
    const hasPerm = userRole === 'super_admin'
      || userRole === 'admin'
      || userPermissions.includes(def.permission)

    if (hasPerm) {
      realtimeManager.subscribe(registryKey)
      logger.debug(`[RT Boot] Subscribed: ${registryKey}`)
    }
  }

  const health = realtimeManager.getHealthSummary()
  logger.info(`[RT Boot] ${health.total} channels subscribed for role: ${userRole}`)
}

/**
 * Cleanup all realtime on logout.
 */
export function cleanupRealtime(): void {
  realtimeManager.cleanup()
  logger.info('[RT Boot] Realtime cleaned up')
}
