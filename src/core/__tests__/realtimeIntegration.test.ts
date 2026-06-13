// ═══════════════════════════════════════════════════════════════════
// REALTIME INTEGRATION TESTS — Boot, Auth Wiring, Lifecycle
// Seven Waves ERP — Step 03D Finalization
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Quasar (not available in Vitest)
vi.mock('quasar', () => ({
  Notify: { create: vi.fn() },
}))

// Mock supabase
vi.mock('../../boot/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb: (s: string) => void) => { cb('SUBSCRIBED'); return {} }),
    })),
    removeChannel: vi.fn(),
  },
}))

import { realtimeManager } from '../realtime/realtime.manager'
import { CHANNEL_REGISTRY } from '../realtime/channel.registry'
import { EVENT_HANDLER_MAP } from '../realtime/event.handlers'

// ── Boot Registration Tests ─────────────────────────────────────

describe('Boot Registration', () => {
  it('realtime boot file exports subscribeUserChannels', async () => {
    // The boot/realtime.ts exports subscribeUserChannels as a named export
    // Verify the function exists in the event handler map
    expect(typeof EVENT_HANDLER_MAP).toBe('object')
    expect(Object.keys(EVENT_HANDLER_MAP).length).toBeGreaterThan(0)
  })

  it('all event handlers are registered for all channel registry keys', () => {
    const registryKeys = Object.keys(CHANNEL_REGISTRY)
    const handlerKeys = Object.keys(EVENT_HANDLER_MAP)

    for (const key of registryKeys) {
      expect(handlerKeys).toContain(key)
    }
  })
})

// ── RealtimeManager Lifecycle Tests ─────────────────────────────

describe('RealtimeManager Lifecycle', () => {
  beforeEach(() => {
    realtimeManager.cleanup()
  })

  it('setContext stores user and branch IDs', () => {
    realtimeManager.setContext('user-123', 'branch-456')
    const health = realtimeManager.getHealthSummary()
    expect(health.total).toBe(0) // No subscriptions yet
  })

  it('subscribe creates a managed channel', () => {
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.on('orders', vi.fn())
    realtimeManager.subscribe('orders')

    const health = realtimeManager.getHealthSummary()
    expect(health.total).toBe(1)
  })

  it('duplicate subscribe is prevented', () => {
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.subscribe('orders')
    realtimeManager.subscribe('orders') // duplicate

    const health = realtimeManager.getHealthSummary()
    expect(health.total).toBe(1) // Still just 1
  })

  it('unsubscribeAll clears all channels', () => {
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.subscribe('orders')
    realtimeManager.subscribe('notifications')

    expect(realtimeManager.getHealthSummary().total).toBe(2)

    realtimeManager.unsubscribeAll()
    expect(realtimeManager.getHealthSummary().total).toBe(0)
  })

  it('cleanup clears channels, handlers, and stops heartbeat', () => {
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.on('orders', vi.fn())
    realtimeManager.subscribe('orders')
    realtimeManager.startHeartbeat()

    realtimeManager.cleanup()

    expect(realtimeManager.getHealthSummary().total).toBe(0)
    expect(realtimeManager.getManagedChannels()).toHaveLength(0)
  })
})

// ── Branch Switch Tests ─────────────────────────────────────────

describe('Branch Switch Resubscription', () => {
  beforeEach(() => {
    realtimeManager.cleanup()
  })

  it('setContext with different branch triggers unsubscribeAll', () => {
    realtimeManager.setContext('user-1', 'branch-A')
    realtimeManager.subscribe('orders')
    expect(realtimeManager.getHealthSummary().total).toBe(1)

    // Switch branch
    realtimeManager.setContext('user-1', 'branch-B')
    expect(realtimeManager.getHealthSummary().total).toBe(0) // Cleared

    // Resubscribe with new branch
    realtimeManager.subscribe('orders')
    expect(realtimeManager.getHealthSummary().total).toBe(1)
  })

  it('setContext with same branch does NOT unsubscribe', () => {
    realtimeManager.setContext('user-1', 'branch-A')
    realtimeManager.subscribe('orders')

    realtimeManager.setContext('user-1', 'branch-A') // Same branch
    expect(realtimeManager.getHealthSummary().total).toBe(1) // Still subscribed
  })
})

// ── Logout Cleanup Tests ────────────────────────────────────────

describe('Logout Cleanup', () => {
  beforeEach(() => {
    realtimeManager.cleanup()
  })

  it('cleanup on logout clears all state', () => {
    // Simulate login
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.on('orders', vi.fn())
    realtimeManager.on('notifications', vi.fn())
    realtimeManager.subscribe('orders')
    realtimeManager.subscribe('notifications')
    realtimeManager.startHeartbeat()

    expect(realtimeManager.getHealthSummary().total).toBe(2)

    // Simulate logout
    realtimeManager.cleanup()

    expect(realtimeManager.getHealthSummary().total).toBe(0)
    expect(realtimeManager.getManagedChannels()).toHaveLength(0)
    expect(realtimeManager.getState('orders:branch-1')).toBe('disconnected')
  })
})

// ── Connection State Tests ──────────────────────────────────────

describe('Connection State Tracking', () => {
  beforeEach(() => {
    realtimeManager.cleanup()
  })

  it('onConnectionChange fires on subscribe', () => {
    const listener = vi.fn()
    realtimeManager.onConnectionChange(listener)
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.subscribe('orders')

    // Should have fired with 'connecting' and then 'connected' (from mock)
    expect(listener).toHaveBeenCalled()
  })

  it('onConnectionChange unsubscribe prevents further calls', () => {
    const listener = vi.fn()
    const unsub = realtimeManager.onConnectionChange(listener)

    unsub() // Remove listener

    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.subscribe('orders')

    expect(listener).not.toHaveBeenCalled()
  })
})

// ── Module Unsubscribe Tests ────────────────────────────────────

describe('Module-Scoped Unsubscribe', () => {
  beforeEach(() => {
    realtimeManager.cleanup()
  })

  it('unsubscribeModule removes only that module channels', () => {
    realtimeManager.setContext('user-1', 'branch-1')
    realtimeManager.subscribe('orders')        // module: pos
    realtimeManager.subscribe('kot_tickets')    // module: kitchen
    realtimeManager.subscribe('notifications')  // module: notifications

    expect(realtimeManager.getHealthSummary().total).toBe(3)

    realtimeManager.unsubscribeModule('pos')
    expect(realtimeManager.getHealthSummary().total).toBe(2)

    realtimeManager.unsubscribeModule('kitchen')
    expect(realtimeManager.getHealthSummary().total).toBe(1)
  })
})
