// ═══════════════════════════════════════════════════════════════════
// OFFLINE SYNC STORE — Pinia Store for Sync Status
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { defineStore } from 'pinia'
import { offlineSyncEngine, type SyncStatus } from 'src/core/offline/OfflineSyncEngine'
import type { SyncQueueItem } from 'src/core/offline/offlineDb'

interface OfflineSyncState {
  status: SyncStatus
  pendingCount: number
  failedCount: number
  failedItems: SyncQueueItem[]
  isOnline: boolean
  lastSyncAt: string | null
  loading: boolean
}

export const useOfflineSyncStore = defineStore('offlineSync', {
  state: (): OfflineSyncState => ({
    status: 'idle',
    pendingCount: 0,
    failedCount: 0,
    failedItems: [],
    isOnline: navigator.onLine,
    lastSyncAt: null,
    loading: false,
  }),

  getters: {
    hasPending: (state) => state.pendingCount > 0,
    hasFailed: (state) => state.failedCount > 0,
    statusIcon: (state) => {
      switch (state.status) {
        case 'syncing': return 'sync'
        case 'error': return 'sync_problem'
        case 'offline': return 'cloud_off'
        default: return 'cloud_done'
      }
    },
    statusColor: (state) => {
      switch (state.status) {
        case 'syncing': return 'blue'
        case 'error': return 'red'
        case 'offline': return 'grey'
        default: return 'green'
      }
    },
  },

  actions: {
    /** Initialize the sync engine and subscribe to status changes */
    initialize() {
      offlineSyncEngine.onStatusChange((status, pendingCount) => {
        this.status = status
        this.pendingCount = pendingCount
      })

      offlineSyncEngine.startPeriodicSync()

      // Monitor online/offline
      window.addEventListener('online', () => { this.isOnline = true })
      window.addEventListener('offline', () => { this.isOnline = false })

      this.refreshCounts()
    },

    /** Trigger manual sync */
    async syncNow() {
      this.loading = true
      try {
        const result = await offlineSyncEngine.syncAll()
        this.lastSyncAt = new Date().toISOString()
        await this.refreshCounts()
        return result
      } finally {
        this.loading = false
      }
    },

    /** Refresh pending/failed counts */
    async refreshCounts() {
      this.pendingCount = await offlineSyncEngine.getPendingCount()
      this.failedCount = await offlineSyncEngine.getFailedCount()
      this.failedItems = await offlineSyncEngine.getFailedItems()
    },

    /** Retry a failed item */
    async retryItem(id: string) {
      await offlineSyncEngine.retryItem(id)
      await this.refreshCounts()
    },

    /** Discard a failed item */
    async discardItem(id: string) {
      await offlineSyncEngine.discardItem(id)
      await this.refreshCounts()
    },

    /** Cleanup on logout */
    cleanup() {
      offlineSyncEngine.cleanup()
      this.$reset()
    },
  },
})
