// ═══════════════════════════════════════════════════════════════════
// INDEXEDDB WRAPPER — Offline Storage
// Seven Waves ERP — Step 03A Infrastructure
// ═══════════════════════════════════════════════════════════════════

import { logger } from '../logging/logger'

const DB_NAME = 'seven_waves_erp'
const DB_VERSION = 1

/** Store names for IndexedDB object stores */
export const OfflineStores = {
  SYNC_QUEUE: 'sync_queue',
  OFFLINE_ORDERS: 'offline_orders',
  OFFLINE_KOT: 'offline_kot',
  OFFLINE_PAYMENTS: 'offline_payments',
  OFFLINE_ATTENDANCE: 'offline_attendance',
  CACHE_MENU: 'cache_menu',
} as const

export type OfflineStoreName = (typeof OfflineStores)[keyof typeof OfflineStores]

export interface SyncQueueItem {
  id: string
  module: string
  action: string
  payload: Record<string, unknown>
  status: 'pending' | 'processing' | 'failed' | 'synced'
  attempts: number
  maxAttempts: number
  createdAt: string
  lastAttemptAt?: string
  errorMessage?: string
  /** Whether this item is safe to auto-retry */
  idempotent: boolean
}

let dbInstance: IDBDatabase | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('[OfflineDB] indexedDB not available in this environment'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Sync queue — main offline queue
      if (!db.objectStoreNames.contains(OfflineStores.SYNC_QUEUE)) {
        const store = db.createObjectStore(OfflineStores.SYNC_QUEUE, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('module', 'module', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }

      // Offline orders
      if (!db.objectStoreNames.contains(OfflineStores.OFFLINE_ORDERS)) {
        const store = db.createObjectStore(OfflineStores.OFFLINE_ORDERS, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
      }

      // Offline KOT
      if (!db.objectStoreNames.contains(OfflineStores.OFFLINE_KOT)) {
        db.createObjectStore(OfflineStores.OFFLINE_KOT, { keyPath: 'id' })
      }

      // Offline payments (pending sync — NOT finalized)
      if (!db.objectStoreNames.contains(OfflineStores.OFFLINE_PAYMENTS)) {
        const store = db.createObjectStore(OfflineStores.OFFLINE_PAYMENTS, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
      }

      // HR attendance
      if (!db.objectStoreNames.contains(OfflineStores.OFFLINE_ATTENDANCE)) {
        db.createObjectStore(OfflineStores.OFFLINE_ATTENDANCE, { keyPath: 'id' })
      }

      // Menu cache (read-only, refreshed periodically)
      if (!db.objectStoreNames.contains(OfflineStores.CACHE_MENU)) {
        db.createObjectStore(OfflineStores.CACHE_MENU, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }

    request.onerror = (event) => {
      logger.error('[OfflineDB] Failed to open', { error: (event.target as IDBOpenDBRequest).error?.message })
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

/**
 * Generic put (upsert) into an IndexedDB store.
 */
export async function offlinePut<T extends { id: string }>(
  storeName: OfflineStoreName,
  item: T,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Get a single item by key.
 */
export async function offlineGet<T>(storeName: OfflineStoreName, key: string): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get all items from a store.
 */
export async function offlineGetAll<T>(storeName: OfflineStoreName): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get items by index value.
 */
export async function offlineGetByIndex<T>(
  storeName: OfflineStoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const index = tx.objectStore(storeName).index(indexName)
    const req = index.getAll(value)
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

/**
 * Delete a single item by key.
 */
export async function offlineDelete(storeName: OfflineStoreName, key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Clear all items from a store.
 */
export async function offlineClear(storeName: OfflineStoreName): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Count items in a store.
 */
export async function offlineCount(storeName: OfflineStoreName): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
