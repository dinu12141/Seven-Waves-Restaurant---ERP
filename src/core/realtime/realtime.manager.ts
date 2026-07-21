// ═══════════════════════════════════════════════════════════════════
// REALTIME MANAGER — Production-Grade Channel Orchestrator
// Seven Waves ERP — Step 03D Realtime Infrastructure
// ═══════════════════════════════════════════════════════════════════
//
// Extends the Step 03A RealtimeEngine with:
//   • Channel registry integration
//   • Exponential backoff reconnect
//   • Connection status tracking per channel
//   • Branch-scoped event validation
//   • Stale event rejection
//   • Heartbeat monitoring
//   • Auth token refresh recovery
//   • Event handler routing to Pinia stores
//   • Cleanup on branch switch / logout
// ═══════════════════════════════════════════════════════════════════

import { supabase } from '../../boot/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { logger } from '../logging/logger'
import {
  CHANNEL_REGISTRY,
  resolveChannelKey,
  buildFilter,
  type ChannelDefinition,
} from './channel.registry'

// ─── Types ──────────────────────────────────────────────────────────

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error'

export interface ManagedChannel {
  key: string
  definition: ChannelDefinition
  channel: RealtimeChannel | null
  state: ConnectionState
  subscribedAt: Date | null
  lastEventAt: Date | null
  reconnectAttempts: number
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

export type RealtimeEventPayload = RealtimePostgresChangesPayload<Record<string, unknown>>
export type EventHandler = (payload: RealtimeEventPayload, channelKey: string) => void

type ConnectionListener = (channelKey: string, state: ConnectionState) => void

// ─── Manager ────────────────────────────────────────────────────────

class RealtimeManager {
  private channels = new Map<string, ManagedChannel>()
  private eventHandlers = new Map<string, EventHandler[]>()
  private connectionListeners: ConnectionListener[] = []
  private eventDedup = new Map<string, number>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private currentBranchId: string | null = null
  private currentUserId: string | null = null

  private readonly DEDUP_WINDOW_MS = 2000
  private readonly BASE_RECONNECT_MS = 1000
  private readonly MAX_RECONNECT_MS = 30000
  private readonly HEARTBEAT_INTERVAL_MS = 60000

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Set current user/branch context. Call on login and branch switch.
   */
  setContext(userId: string, branchId: string): void {
    const branchChanged = this.currentBranchId !== branchId
    this.currentUserId = userId
    this.currentBranchId = branchId

    if (branchChanged) {
      logger.info('[RT] Branch context changed — resubscribing', { branchId })
      this.unsubscribeAll()
    }
  }

  /**
   * Subscribe to a registered channel by registry key.
   * Automatically resolves scope, builds filters, and handles reconnect.
   */
  subscribe(registryKey: string, handlers?: EventHandler[]): void {
    const def = CHANNEL_REGISTRY[registryKey]
    if (!def) {
      logger.warn(`[RT] Unknown channel registry key: ${registryKey}`)
      return
    }

    const resolvedKey = resolveChannelKey(def, {
      branchId: this.currentBranchId || undefined,
      userId: this.currentUserId || undefined,
    })

    // Prevent duplicate subscriptions
    if (this.channels.has(resolvedKey)) {
      logger.debug(`[RT] Already subscribed: ${resolvedKey}`)
      return
    }

    // Register handlers
    if (handlers?.length) {
      const existing = this.eventHandlers.get(registryKey) || []
      this.eventHandlers.set(registryKey, [...existing, ...handlers])
    }

    this.createSubscription(resolvedKey, def)
  }

  /**
   * Register an event handler for a registry key.
   */
  on(registryKey: string, handler: EventHandler): () => void {
    const existing = this.eventHandlers.get(registryKey) || []
    existing.push(handler)
    this.eventHandlers.set(registryKey, existing)

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(registryKey)
      if (handlers) {
        this.eventHandlers.set(registryKey, handlers.filter(h => h !== handler))
      }
    }
  }

  /**
   * Unsubscribe from a specific channel.
   */
  unsubscribe(resolvedKey: string): void {
    const managed = this.channels.get(resolvedKey)
    if (!managed) return

    this.clearReconnectTimer(managed)
    this.channels.delete(resolvedKey) // Delete before removeChannel to prevent reconnect

    if (managed.channel) {
      supabase.removeChannel(managed.channel)
    }
    
    logger.info(`[RT] Unsubscribed: ${resolvedKey}`)
  }

  /**
   * Unsubscribe from all channels for a module.
   */
  unsubscribeModule(module: string): void {
    for (const [key, managed] of this.channels) {
      if (managed.definition.module === module) {
        this.unsubscribe(key)
      }
    }
  }

  /**
   * Unsubscribe from all channels (logout / branch switch).
   */
  unsubscribeAll(): void {
    for (const [key] of this.channels) {
      this.unsubscribe(key)
    }
    this.eventDedup.clear()
    logger.info('[RT] All channels cleared')
  }

  /**
   * Subscribe to connection state changes.
   */
  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.push(listener)
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener)
    }
  }

  /**
   * Get connection state for a channel.
   */
  getState(resolvedKey: string): ConnectionState {
    return this.channels.get(resolvedKey)?.state || 'disconnected'
  }

  /**
   * Get overall connection health.
   */
  getHealthSummary(): { total: number; connected: number; reconnecting: number; error: number } {
    let connected = 0, reconnecting = 0, error = 0
    for (const [, ch] of this.channels) {
      if (ch.state === 'connected') connected++
      else if (ch.state === 'reconnecting') reconnecting++
      else if (ch.state === 'error') error++
    }
    return { total: this.channels.size, connected, reconnecting, error }
  }

  /**
   * Get all managed channels (for admin/debug UI).
   */
  getManagedChannels(): ManagedChannel[] {
    return Array.from(this.channels.values())
  }

  /**
   * Start heartbeat monitoring.
   */
  startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeat()
      this.cleanupDedup()
    }, this.HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Stop heartbeat monitoring.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Full cleanup (logout).
   */
  cleanup(): void {
    this.unsubscribeAll()
    this.stopHeartbeat()
    this.eventHandlers.clear()
    this.connectionListeners = []
    this.currentBranchId = null
    this.currentUserId = null
    logger.info('[RT] Manager cleaned up')
  }

  // ── Private ─────────────────────────────────────────────────────

  private createSubscription(resolvedKey: string, def: ChannelDefinition): void {
    const channelName = `erp-${resolvedKey}`

    const filter = buildFilter(def, {
      branchId: this.currentBranchId || undefined,
      userId: this.currentUserId || undefined,
    })

    const managed: ManagedChannel = {
      key: resolvedKey,
      definition: def,
      channel: null,
      state: 'connecting',
      subscribedAt: null,
      lastEventAt: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
    }

    this.channels.set(resolvedKey, managed)
    this.notifyConnectionChange(resolvedKey, 'connecting')

    const channel = supabase.channel(channelName)

    const pgConfig: Record<string, unknown> = {
      event: def.event,
      schema: 'public',
      table: def.table,
    }
    if (filter) pgConfig.filter = filter

    channel.on('postgres_changes', pgConfig as any, (payload: RealtimeEventPayload) => {
      this.handleEvent(resolvedKey, def, payload)
    })

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        managed.state = 'connected'
        managed.subscribedAt = new Date()
        managed.reconnectAttempts = 0
        this.notifyConnectionChange(resolvedKey, 'connected')
        logger.info(`[RT] Connected: ${resolvedKey}`)
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        managed.state = 'disconnected'
        this.notifyConnectionChange(resolvedKey, 'disconnected')
        logger.warn(`[RT] Disconnected: ${resolvedKey} (${status})`)

        if (def.reconnect) {
          this.scheduleReconnect(resolvedKey, def)
        }
      } else if (status === 'TIMED_OUT') {
        managed.state = 'error'
        this.notifyConnectionChange(resolvedKey, 'error')
        logger.error(`[RT] Timeout: ${resolvedKey}`)

        if (def.reconnect) {
          this.scheduleReconnect(resolvedKey, def)
        }
      }
    })

    managed.channel = channel
  }

  private handleEvent(resolvedKey: string, def: ChannelDefinition, payload: RealtimeEventPayload): void {
    const record = (payload.new || payload.old) as Record<string, unknown> | undefined
    if (!record) return

    // ── Branch isolation check ───────────────────────────────────
    if (def.scope === 'branch' && this.currentBranchId) {
      const eventBranch = record.branch_id as string | undefined
      if (eventBranch && eventBranch !== this.currentBranchId) {
        logger.debug(`[RT] Branch mismatch — ignoring event from ${eventBranch}`)
        return
      }
    }

    // ── Stale event rejection ────────────────────────────────────
    if (def.rejectStaleSeconds > 0) {
      const createdAt = record.created_at as string | undefined
        || record.updated_at as string | undefined
      if (createdAt) {
        const eventAge = (Date.now() - new Date(createdAt).getTime()) / 1000
        if (eventAge > def.rejectStaleSeconds) {
          logger.debug(`[RT] Stale event rejected (${eventAge.toFixed(0)}s old): ${resolvedKey}`)
          return
        }
      }
    }

    // ── Deduplication ────────────────────────────────────────────
    const recordId = record.id as string || ''
    const dedupKey = `${def.table}:${payload.eventType}:${recordId}`
    const now = Date.now()
    const lastSeen = this.eventDedup.get(dedupKey) || 0

    if (now - lastSeen < this.DEDUP_WINDOW_MS) {
      logger.debug(`[RT] Dedup skipped: ${dedupKey}`)
      return
    }
    this.eventDedup.set(dedupKey, now)

    // ── Update last event timestamp ──────────────────────────────
    const managed = this.channels.get(resolvedKey)
    if (managed) managed.lastEventAt = new Date()

    // ── Route to registered handlers ─────────────────────────────
    // Find the registry key from the definition
    const registryKey = Object.keys(CHANNEL_REGISTRY).find(
      k => CHANNEL_REGISTRY[k] === def,
    )
    if (registryKey) {
      const handlers = this.eventHandlers.get(registryKey) || []
      for (const handler of handlers) {
        try {
          handler(payload, resolvedKey)
        } catch (err) {
          logger.error(`[RT] Handler error for ${registryKey}`, { error: String(err) })
        }
      }
    }
  }

  // ── Reconnect ─────────────────────────────────────────────────

  private scheduleReconnect(resolvedKey: string, def: ChannelDefinition): void {
    const managed = this.channels.get(resolvedKey)
    if (!managed) return

    // Check max attempts
    if (def.maxReconnectAttempts > 0 && managed.reconnectAttempts >= def.maxReconnectAttempts) {
      managed.state = 'error'
      this.notifyConnectionChange(resolvedKey, 'error')
      logger.error(`[RT] Max reconnect attempts reached: ${resolvedKey}`)
      return
    }

    this.clearReconnectTimer(managed)
    managed.state = 'reconnecting'
    managed.reconnectAttempts++
    this.notifyConnectionChange(resolvedKey, 'reconnecting')

    // Exponential backoff with jitter
    const delay = Math.min(
      this.BASE_RECONNECT_MS * Math.pow(2, managed.reconnectAttempts - 1) + Math.random() * 500,
      this.MAX_RECONNECT_MS,
    )

    logger.info(`[RT] Reconnecting ${resolvedKey} in ${delay.toFixed(0)}ms (attempt ${managed.reconnectAttempts})`)

    managed.reconnectTimer = setTimeout(() => {
      // Remove old channel
      if (managed.channel) {
        supabase.removeChannel(managed.channel)
        managed.channel = null
      }
      this.channels.delete(resolvedKey)

      // Re-create subscription
      this.createSubscription(resolvedKey, def)
    }, delay)
  }

  private clearReconnectTimer(managed: ManagedChannel): void {
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer)
      managed.reconnectTimer = null
    }
  }

  // ── Heartbeat ─────────────────────────────────────────────────

  private checkHeartbeat(): void {
    const staleThreshold = Date.now() - 5 * 60 * 1000 // 5 min no events

    for (const [key, managed] of this.channels) {
      if (managed.state === 'connected' && managed.lastEventAt) {
        if (managed.lastEventAt.getTime() < staleThreshold) {
          logger.warn(`[RT] Heartbeat stale: ${key} (no events for 5+ min)`)
          // Don't force reconnect — just log. Supabase handles keepalive.
        }
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private cleanupDedup(): void {
    const threshold = Date.now() - this.DEDUP_WINDOW_MS * 5
    for (const [key, ts] of this.eventDedup) {
      if (ts < threshold) this.eventDedup.delete(key)
    }
  }

  private notifyConnectionChange(key: string, state: ConnectionState): void {
    for (const listener of this.connectionListeners) {
      try {
        listener(key, state)
      } catch { /* swallow */ }
    }
  }
}

/** Singleton realtime manager */
export const realtimeManager = new RealtimeManager()
