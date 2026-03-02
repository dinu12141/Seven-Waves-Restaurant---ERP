import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { Notify } from 'quasar'

/**
 * Inventory Queue Store
 * Subscribes to stock_queue where status='pending'
 * Used to monitor upcoming or pending auto-deductions.
 */
export const useInventoryQueueStore = defineStore('inventoryQueue', () => {
  // ── State ──────────────────────────────────────────────────
  const pendingStockEvents = ref([])
  const loading = ref(false)

  // Realtime channel
  let stockQueueChannel = null

  // ── Getters ────────────────────────────────────────────────
  const pendingCount = computed(() => pendingStockEvents.value.length)

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await fetchPendingStockQueue()
      subscribeToStockQueue()
    } catch (error) {
      console.error('[InventoryQueueStore] Init error:', error)
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Initial Data ─────────────────────────────────────
  async function fetchPendingStockQueue() {
    // Optionally filter by branch mapping if necessary
    const { data, error } = await supabase
      .from('stock_queue')
      .select('id, order_id, status, issue_stage, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[InventoryQueueStore] Fetch error:', error)
      return
    }

    pendingStockEvents.value = data || []
  }

  // ── Realtime Subscription ───────────────────────────────────
  function subscribeToStockQueue() {
    if (stockQueueChannel) supabase.removeChannel(stockQueueChannel)

    // 🎯 Subscribe to stock_queue where status='pending'
    stockQueueChannel = supabase
      .channel('inventory-stock-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_queue',
          filter: `status=eq.pending`,
        },
        (payload) => {
          handleStockQueueChange(payload)
        },
      )
      .subscribe()
  }

  function handleStockQueueChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // New pending stock action
      pendingStockEvents.value.unshift(newRow)
      Notify.create({
        type: 'info',
        message: `New pending stock deduction (Trigger: ${newRow.issue_stage})`,
        position: 'top-right',
        timeout: 3000,
      })
    }

    if (eventType === 'UPDATE') {
      // If it's no longer pending, it won't trigger this strictly filtered channel,
      // but in some cases Supabase pushes old record to let client know it fell out.
      // So fetch fresh data to sync.
      fetchPendingStockQueue()
    }

    if (eventType === 'DELETE') {
      pendingStockEvents.value = pendingStockEvents.value.filter((sq) => sq.id !== oldRow?.id)
    }
  }

  // ── Cleanup ────────────────────────────────────────────────
  function cleanup() {
    if (stockQueueChannel) {
      supabase.removeChannel(stockQueueChannel)
      stockQueueChannel = null
    }
    pendingStockEvents.value = []
  }

  return {
    pendingStockEvents,
    loading,
    pendingCount,
    initialize,
    fetchPendingStockQueue,
    cleanup,
  }
})
