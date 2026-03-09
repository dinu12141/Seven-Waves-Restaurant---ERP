import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { Notify } from 'quasar'
import { processInventory as rpcProcessInventory } from 'src/services/kotDispatchService'

/**
 * Inventory Queue Store
 *
 * Subscribes to stock_queue filtered by branch_id.
 * Exposes processInventory() to trigger BOM/recipe deduction for an order.
 * Used by inventory staff to monitor and action pending deductions.
 */
export const useInventoryQueueStore = defineStore('inventoryQueue', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const pendingStockEvents = ref([])
  const loading = ref(false)
  const processing = ref(null) // order ID currently being processed

  // Realtime channel
  let stockQueueChannel = null

  // ── Getters ────────────────────────────────────────────────
  const pendingCount = computed(() => pendingStockEvents.value.length)
  const branchId = computed(() => authStore.currentBranch?.id)

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
    if (!branchId.value) return

    const { data, error } = await supabase
      .from('stock_queue')
      .select(
        `id, order_id, status, issue_stage, created_at, updated_at,
         orders ( order_number, order_type, total_amount )`,
      )
      .eq('branch_id', branchId.value)
      .in('status', ['pending', 'reserved'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[InventoryQueueStore] Fetch error:', error)
      return
    }

    pendingStockEvents.value = data || []
  }

  // ── Process Inventory (BOM Deduction) ──────────────────────

  /**
   * Trigger BOM/recipe stock deduction for a specific order.
   * Idempotent — safe to call multiple times.
   */
  async function processInventory(orderId) {
    if (!orderId) return { success: false, error: 'No order ID provided' }
    processing.value = orderId

    try {
      const result = await rpcProcessInventory(orderId)

      if (!result.success) {
        Notify.create({
          type: 'negative',
          message: result.error || 'Inventory processing failed',
          position: 'top',
          timeout: 5000,
        })
        return result
      }

      // Remove from pending list (it's now processed)
      pendingStockEvents.value = pendingStockEvents.value.filter((sq) => sq.order_id !== orderId)

      Notify.create({
        type: 'positive',
        icon: 'inventory_2',
        message: 'Inventory deducted successfully',
        position: 'top',
        timeout: 3000,
      })

      return result
    } catch (e) {
      console.error('[InventoryQueueStore] processInventory error:', e)
      return { success: false, error: e.message }
    } finally {
      processing.value = null
    }
  }

  // ── Realtime Subscription ───────────────────────────────────
  function subscribeToStockQueue() {
    if (stockQueueChannel) supabase.removeChannel(stockQueueChannel)
    if (!branchId.value) return

    stockQueueChannel = supabase
      .channel(`inventory-stock-rt-${branchId.value}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_queue',
          filter: `branch_id=eq.${branchId.value}`,
        },
        (payload) => {
          handleStockQueueChange(payload)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[InventoryQueueStore] Realtime connected')
        }
      })
  }

  function handleStockQueueChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      if (newRow.status === 'pending') {
        // Immediately fetch enriched row
        fetchPendingStockQueue()
        Notify.create({
          type: 'info',
          icon: 'inventory_2',
          message: `New stock deduction queued (Stage: ${newRow.issue_stage || 'on_paid'})`,
          position: 'top-right',
          timeout: 4000,
        })
      }
    }

    if (eventType === 'UPDATE') {
      if (['processed', 'failed', 'cancelled'].includes(newRow.status)) {
        // Remove from pending list
        pendingStockEvents.value = pendingStockEvents.value.filter((sq) => sq.id !== newRow.id)
      } else {
        fetchPendingStockQueue()
      }
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
    processing,
    pendingCount,
    initialize,
    fetchPendingStockQueue,
    processInventory,
    cleanup,
  }
})
