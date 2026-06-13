// ═══════════════════════════════════════════════════════════════════
// REALTIME ENGINE — Centralized Channel Management
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { supabase } from 'src/boot/supabase'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { logger } from '../logging/logger'

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*'

export interface ChannelSubscription {
  /** Unique key for this subscription (e.g., 'orders:branch-uuid') */
  key: string
  /** The Supabase realtime channel */
  channel: RealtimeChannel
  /** Tables being watched */
  tables: string[]
  /** When subscribed */
  subscribedAt: Date
  /** Module that owns this subscription */
  module: string
}

type ChangeHandler = (payload: RealtimePostgresChangesPayload<any>) => void

class RealtimeEngine {
  private subscriptions = new Map<string, ChannelSubscription>()
  private eventDedup = new Map<string, number>() // eventKey -> timestamp
  private readonly DEDUP_WINDOW_MS = 2000

  /**
   * Subscribe to postgres changes on a table, scoped to a filter.
   * Automatically deduplicates and manages lifecycle.
   */
  subscribe(config: {
    key: string
    module: string
    table: string
    event?: ChangeEvent
    filter?: string
    onInsert?: ChangeHandler
    onUpdate?: ChangeHandler
    onDelete?: ChangeHandler
    onChange?: ChangeHandler
  }): void {
    // If already subscribed with same key, skip
    if (this.subscriptions.has(config.key)) {
      logger.debug(`[Realtime] Already subscribed: ${config.key}`)
      return
    }

    const channelName = `erp-${config.key}`
    const channel = supabase.channel(channelName)

    // Build postgres_changes config
    const pgConfig: any = {
      event: config.event || '*',
      schema: 'public',
      table: config.table,
    }
    if (config.filter) {
      pgConfig.filter = config.filter
    }

    channel.on('postgres_changes', pgConfig, (payload: RealtimePostgresChangesPayload<any>) => {
      // Dedup check
      const dedupKey = `${config.table}:${payload.eventType}:${(payload.new as any)?.id || (payload.old as any)?.id}`
      const now = Date.now()
      const lastSeen = this.eventDedup.get(dedupKey) || 0

      if (now - lastSeen < this.DEDUP_WINDOW_MS) {
        logger.debug(`[Realtime] Dedup skipped: ${dedupKey}`)
        return
      }
      this.eventDedup.set(dedupKey, now)

      // Route to handler
      switch (payload.eventType) {
        case 'INSERT':
          config.onInsert?.(payload)
          config.onChange?.(payload)
          break
        case 'UPDATE':
          config.onUpdate?.(payload)
          config.onChange?.(payload)
          break
        case 'DELETE':
          config.onDelete?.(payload)
          config.onChange?.(payload)
          break
      }
    })

    channel.subscribe((status) => {
      logger.info(`[Realtime] Channel ${config.key}: ${status}`)
    })

    this.subscriptions.set(config.key, {
      key: config.key,
      channel,
      tables: [config.table],
      subscribedAt: new Date(),
      module: config.module,
    })
  }

  /**
   * Unsubscribe from a specific channel.
   */
  unsubscribe(key: string): void {
    const sub = this.subscriptions.get(key)
    if (sub) {
      supabase.removeChannel(sub.channel)
      this.subscriptions.delete(key)
      logger.info(`[Realtime] Unsubscribed: ${key}`)
    }
  }

  /**
   * Unsubscribe from all channels owned by a module.
   */
  unsubscribeModule(module: string): void {
    for (const [key, sub] of this.subscriptions) {
      if (sub.module === module) {
        supabase.removeChannel(sub.channel)
        this.subscriptions.delete(key)
      }
    }
    logger.info(`[Realtime] Unsubscribed module: ${module}`)
  }

  /**
   * Unsubscribe from all channels (used on logout / branch switch).
   */
  unsubscribeAll(): void {
    for (const [, sub] of this.subscriptions) {
      supabase.removeChannel(sub.channel)
    }
    this.subscriptions.clear()
    this.eventDedup.clear()
    logger.info('[Realtime] All channels cleared')
  }

  /**
   * Get active subscription count.
   */
  getActiveCount(): number {
    return this.subscriptions.size
  }

  /**
   * Get all active subscriptions (for debug/admin view).
   */
  getSubscriptions(): ChannelSubscription[] {
    return Array.from(this.subscriptions.values())
  }

  /**
   * Periodic cleanup of old dedup entries (call every 60s from a timer).
   */
  cleanupDedup(): void {
    const threshold = Date.now() - this.DEDUP_WINDOW_MS * 5
    for (const [key, ts] of this.eventDedup) {
      if (ts < threshold) {
        this.eventDedup.delete(key)
      }
    }
  }
}

/** Singleton realtime engine */
export const realtimeEngine = new RealtimeEngine()
