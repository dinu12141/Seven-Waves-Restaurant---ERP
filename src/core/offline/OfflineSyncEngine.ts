// ═══════════════════════════════════════════════════════════════════
// OFFLINE SYNC ENGINE — Queue + Retry + Conflict Resolution
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { api } from '../api/ApiClient'
import { logger } from '../logging/logger'
import {
  offlinePut,
  offlineGetByIndex,
  offlineDelete,
  offlineCount,
  offlineGetAll,
  OfflineStores,
  type SyncQueueItem,
} from './offlineDb'
import { generateCorrelationId } from '../errors/types'

/** Modules that are SAFE to sync offline (no financial finalization) */
const SAFE_OFFLINE_MODULES = ['pos', 'kitchen', 'waiter', 'hr', 'delivery']

/** Modules that MUST NOT be finalized offline */
const BLOCKED_OFFLINE_MODULES = ['finance', 'procurement']

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

type SyncListener = (status: SyncStatus, pendingCount: number) => void

class OfflineSyncEngine {
  private status: SyncStatus = 'idle'
  private listeners: SyncListener[] = []
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  constructor() {
    // Monitor connectivity
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true
        logger.info('[Offline] Back online — triggering sync')
        this.syncAll()
      })
      window.addEventListener('offline', () => {
        this.isOnline = false
        this.setStatus('offline')
        logger.warn('[Offline] Connection lost')
      })
    }
  }

  /**
   * Enqueue an operation for offline sync.
   * Returns true if queued, false if the module is blocked from offline ops.
   */
  async enqueue(config: {
    module: string
    action: string
    payload: Record<string, unknown>
    idempotent?: boolean
    maxAttempts?: number
  }): Promise<boolean> {
    // Block finance/procurement from offline finalization
    if (BLOCKED_OFFLINE_MODULES.includes(config.module)) {
      logger.warn(`[Offline] Module "${config.module}" blocked from offline queue`)
      return false
    }

    const item: SyncQueueItem = {
      id: generateCorrelationId(),
      module: config.module,
      action: config.action,
      payload: config.payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: config.maxAttempts ?? 5,
      createdAt: new Date().toISOString(),
      idempotent: config.idempotent ?? false,
    }

    await offlinePut(OfflineStores.SYNC_QUEUE, item)
    logger.info(`[Offline] Queued: ${config.module}.${config.action}`, { id: item.id })

    this.notifyListeners()

    // Try to sync immediately if online
    if (this.isOnline) {
      this.syncAll()
    }

    return true
  }

  /**
   * Process all pending items in the sync queue.
   */
  async syncAll(): Promise<{ synced: number; failed: number }> {
    if (!this.isOnline) return { synced: 0, failed: 0 }
    if (this.status === 'syncing') return { synced: 0, failed: 0 }

    this.setStatus('syncing')
    let synced = 0
    let failed = 0

    try {
      const pending = await offlineGetByIndex<SyncQueueItem>(
        OfflineStores.SYNC_QUEUE,
        'status',
        'pending',
      )

      for (const item of pending) {
        const success = await this.processItem(item)
        if (success) synced++
        else failed++
      }

      this.setStatus(failed > 0 ? 'error' : 'idle')
    } catch (err) {
      logger.error('[Offline] Sync error', { error: String(err) })
      this.setStatus('error')
    }

    this.notifyListeners()
    return { synced, failed }
  }

  /**
   * Process a single sync queue item.
   */
  private async processItem(item: SyncQueueItem): Promise<boolean> {
    // Mark as processing
    item.status = 'processing'
    item.attempts++
    item.lastAttemptAt = new Date().toISOString()
    await offlinePut(OfflineStores.SYNC_QUEUE, item)

    try {
      // Route to the correct RPC based on module + action
      const rpcName = `offline_sync_${item.module}_${item.action}`
      const result = await api.rpc(rpcName, item.payload, {
        module: item.module,
        action: item.action,
        silent: true,
      })

      if (result.error) {
        throw new Error(result.error.technicalMessage)
      }

      // Success — remove from queue
      await offlineDelete(OfflineStores.SYNC_QUEUE, item.id)
      logger.info(`[Offline] Synced: ${item.module}.${item.action}`, { id: item.id })
      return true
    } catch (err: any) {
      item.errorMessage = err.message || String(err)

      if (item.attempts >= item.maxAttempts) {
        // Dead letter — mark as failed permanently
        item.status = 'failed'
        logger.error(`[Offline] Dead letter: ${item.module}.${item.action}`, {
          id: item.id,
          attempts: item.attempts,
          error: item.errorMessage,
        })
      } else {
        // Back to pending for retry
        item.status = 'pending'
      }

      await offlinePut(OfflineStores.SYNC_QUEUE, item)
      return false
    }
  }

  /**
   * Start periodic sync (call on app boot).
   */
  startPeriodicSync(intervalMs = 300000): void {  // 5 min default (was 30s)
    this.stopPeriodicSync()
    this.syncTimer = setInterval(() => {
      if (this.isOnline && this.status !== 'syncing') {
        this.syncAll()
      }
    }, intervalMs)
  }

  /**
   * Stop periodic sync.
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  /**
   * Get count of pending items.
   */
  async getPendingCount(): Promise<number> {
    const items = await offlineGetByIndex<SyncQueueItem>(
      OfflineStores.SYNC_QUEUE,
      'status',
      'pending',
    )
    return items.length
  }

  /**
   * Get count of failed (dead letter) items.
   */
  async getFailedCount(): Promise<number> {
    const items = await offlineGetByIndex<SyncQueueItem>(
      OfflineStores.SYNC_QUEUE,
      'status',
      'failed',
    )
    return items.length
  }

  /**
   * Get all failed items for the review page.
   */
  async getFailedItems(): Promise<SyncQueueItem[]> {
    return offlineGetByIndex<SyncQueueItem>(OfflineStores.SYNC_QUEUE, 'status', 'failed')
  }

  /**
   * Retry a single failed item.
   */
  async retryItem(id: string): Promise<boolean> {
    const items = await offlineGetAll<SyncQueueItem>(OfflineStores.SYNC_QUEUE)
    const item = items.find((i) => i.id === id)
    if (!item) return false

    item.status = 'pending'
    item.attempts = 0
    item.errorMessage = undefined
    await offlinePut(OfflineStores.SYNC_QUEUE, item)

    if (this.isOnline) {
      const result = await this.processItem(item)
      this.notifyListeners()
      return result
    }

    return true
  }

  /**
   * Discard a failed item permanently.
   */
  async discardItem(id: string): Promise<void> {
    await offlineDelete(OfflineStores.SYNC_QUEUE, id)
    this.notifyListeners()
  }

  /**
   * Check if a module can operate offline.
   */
  canOperateOffline(module: string): boolean {
    return SAFE_OFFLINE_MODULES.includes(module)
  }

  /**
   * Check if currently online.
   */
  get online(): boolean {
    return this.isOnline
  }

  /**
   * Get current sync status.
   */
  get currentStatus(): SyncStatus {
    return this.status
  }

  /**
   * Subscribe to status changes.
   */
  onStatusChange(listener: SyncListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  private setStatus(status: SyncStatus) {
    this.status = status
  }

  private async notifyListeners() {
    const count = await this.getPendingCount()
    this.listeners.forEach((fn) => fn(this.status, count))
  }

  /**
   * Cleanup on logout.
   */
  cleanup(): void {
    this.stopPeriodicSync()
    this.listeners = []
  }
}

/** Singleton offline sync engine */
export const offlineSyncEngine = new OfflineSyncEngine()
