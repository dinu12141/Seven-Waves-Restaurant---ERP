import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { Notify } from 'quasar'

/**
 * KOT Orchestration Store — Phase 2-6 Integration
 *
 * Wraps all Phase 2-6 backend RPCs for:
 *  - Waiter: accept order & route KOTs
 *  - Kitchen: queue view, batch status transitions
 *  - Cashier: queue view, raise invoice, process payment, get bill
 *  - Background: stock deduction, finance posting
 *
 * Realtime: subscribes to kot_batches for live kitchen display updates.
 */
export const useKotOrchestrationStore = defineStore('kotOrchestration', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const kitchenQueue = ref([]) // get_kitchen_queue() result
  const cashierQueue = ref([]) // get_cashier_queue() result
  const loading = ref(false)
  const actionLoading = ref(null) // batch_id / order_id currently processing

  let kotBatchChannel = null

  // ── Getters ────────────────────────────────────────────────
  const branchId = computed(() => authStore.currentBranch?.id)

  const newBatches = computed(() =>
    kitchenQueue.value.filter((b) => ['created', 'accepted'].includes(b.batch_status)),
  )
  const preparingBatches = computed(() =>
    kitchenQueue.value.filter((b) => b.batch_status === 'preparing'),
  )
  const readyBatches = computed(() => kitchenQueue.value.filter((b) => b.batch_status === 'ready'))

  const readyOrdersInCashier = computed(() =>
    cashierQueue.value.filter((q) => q.order_status === 'ready'),
  )

  // ══════════════════════════════════════════════════════════
  // PHASE 2 — Waiter Accept + Route
  // ══════════════════════════════════════════════════════════

  /**
   * Call from WaiterPage after order selection.
   * Replaces the old dispatchAcceptOrder() service call.
   *
   * @param {string} orderId
   * @param {string} shiftId     (optional — from waiterOrderStore.shiftInfo)
   * @returns {Promise<{success, batches_created, lines_created}>}
   */
  async function acceptAndRouteKots(orderId, shiftId = null) {
    actionLoading.value = orderId
    try {
      const { data, error } = await supabase.rpc('accept_order_and_route_kots', {
        p_order_id: orderId,
        p_waiter_user_id: authStore.user?.id,
        p_shift_id: shiftId,
      })

      if (error) throw error

      Notify.create({
        type: 'positive',
        message: `Order accepted — ${data.batches_created} KOT(s) sent to kitchens`,
        position: 'top',
        timeout: 3000,
      })

      return { success: true, ...data }
    } catch (e) {
      console.error('[KOT] acceptAndRouteKots error:', e)
      Notify.create({ type: 'negative', message: e.message, position: 'top' })
      return { success: false, error: e.message }
    } finally {
      actionLoading.value = null
    }
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 4 — Kitchen Queue & Status RPCs
  // ══════════════════════════════════════════════════════════

  /**
   * Fetch live kitchen queue for a specific kitchen display.
   * @param {string} kitchenId
   */
  async function fetchKitchenQueue(kitchenId) {
    if (!kitchenId || !branchId.value) return
    loading.value = true
    try {
      const { data, error } = await supabase.rpc('get_kitchen_queue', {
        p_kitchen_id: kitchenId,
        p_branch_id: branchId.value,
      })
      if (error) throw error
      kitchenQueue.value = (data || []).map(enrichBatch)
    } catch (e) {
      console.error('[KOT] fetchKitchenQueue error:', e)
    } finally {
      loading.value = false
    }
  }

  /** created → accepted */
  async function acceptBatch(batchId) {
    return _batchTransition(batchId, 'kitchen_accept_batch', 'accepted')
  }

  /** created/accepted → preparing */
  async function startBatch(batchId) {
    return _batchTransition(batchId, 'kitchen_start_batch', 'preparing')
  }

  /** accepted/preparing → ready */
  async function completeBatch(batchId) {
    const result = await _batchTransition(batchId, 'kitchen_complete_batch', 'ready')
    if (result.success && result.data?.all_batches_ready) {
      Notify.create({
        type: 'positive',
        icon: 'task_alt',
        color: 'green-9',
        message: 'All KOTs ready — Order sent to cashier!',
        position: 'top',
        timeout: 5000,
      })
    }
    return result
  }

  /** Admin/manager cancel */
  async function cancelBatch(batchId, reason = null) {
    return _batchTransition(batchId, 'kitchen_cancel_batch', 'cancelled', { p_reason: reason })
  }

  async function _batchTransition(batchId, rpcName, nextStatus, extraParams = {}) {
    actionLoading.value = batchId
    // Optimistic update
    const idx = kitchenQueue.value.findIndex((b) => b.batch_id === batchId)
    const prev = idx !== -1 ? kitchenQueue.value[idx].batch_status : null
    if (idx !== -1) kitchenQueue.value[idx].batch_status = nextStatus

    try {
      const { data, error } = await supabase.rpc(rpcName, {
        p_kot_batch_id: batchId,
        ...extraParams,
      })
      if (error) throw error
      return { success: true, data }
    } catch (e) {
      // Roll back optimistic update
      if (idx !== -1 && prev) kitchenQueue.value[idx].batch_status = prev
      console.error(`[KOT] ${rpcName} error:`, e)
      Notify.create({ type: 'negative', message: e.message, position: 'top' })
      return { success: false, error: e.message }
    } finally {
      actionLoading.value = null
    }
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 5 — Cashier Queue, Invoice, Payment, Bill
  // ══════════════════════════════════════════════════════════

  /** Fetch cashier queue for branch */
  async function fetchCashierQueue() {
    if (!branchId.value) return
    loading.value = true
    try {
      const { data, error } = await supabase.rpc('get_cashier_queue', {
        p_branch_id: branchId.value,
      })
      if (error) throw error
      cashierQueue.value = data || []
    } catch (e) {
      console.error('[KOT] fetchCashierQueue error:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Create invoice from order items (idempotent — safe to call twice).
   * @param {string} orderId
   * @param {object} opts  { customerName, discount, notes }
   * @returns {{ success, invoice_id, invoice_number, total }}
   */
  async function raiseInvoice(orderId, opts = {}) {
    actionLoading.value = orderId
    try {
      const { data, error } = await supabase.rpc('cashier_raise_invoice', {
        p_order_id: orderId,
        p_customer_name: opts.customerName || null,
        p_discount: opts.discount || 0,
        p_notes: opts.notes || null,
      })
      if (error) throw error
      return { success: true, ...data }
    } catch (e) {
      console.error('[KOT] raiseInvoice error:', e)
      Notify.create({ type: 'negative', message: e.message, position: 'top' })
      return { success: false, error: e.message }
    } finally {
      actionLoading.value = null
    }
  }

  /**
   * Record payment. On full payment: cascades order → paid, batches → served,
   * activates stock_queue + finance_queue.
   *
   * @param {string} orderId
   * @param {string} paymentMethodId   UUID from payment_methods table
   * @param {number} amount
   * @param {object} opts   { tip, reference }
   * @returns {{ success, balance, payment_status, order_status }}
   */
  async function processPayment(orderId, paymentMethodId, amount, opts = {}) {
    actionLoading.value = orderId
    try {
      const { data, error } = await supabase.rpc('cashier_process_payment', {
        p_order_id: orderId,
        p_payment_method_id: paymentMethodId,
        p_amount: amount,
        p_tip: opts.tip || 0,
        p_reference: opts.reference || null,
      })
      if (error) throw error

      if (data?.payment_status === 'paid') {
        // Remove from cashier queue
        cashierQueue.value = cashierQueue.value.filter((q) => q.order_id !== orderId)

        // Trigger background processing (fire-and-forget)
        _triggerBackgroundProcessing(orderId)

        Notify.create({
          type: 'positive',
          icon: 'payments',
          message: 'Payment confirmed — Order closed!',
          position: 'top',
          timeout: 3000,
        })
      }

      return { success: true, ...data }
    } catch (e) {
      console.error('[KOT] processPayment error:', e)
      Notify.create({ type: 'negative', message: e.message, position: 'top' })
      return { success: false, error: e.message }
    } finally {
      actionLoading.value = null
    }
  }

  /**
   * Get full bill JSONB for display or print.
   * Works before and after invoice is raised.
   * @param {string} orderId
   */
  async function getOrderBill(orderId) {
    try {
      const { data, error } = await supabase.rpc('get_order_bill', {
        p_order_id: orderId,
      })
      if (error) throw error
      return { success: true, bill: data }
    } catch (e) {
      console.error('[KOT] getOrderBill error:', e)
      return { success: false, error: e.message }
    }
  }

  // ══════════════════════════════════════════════════════════
  // PHASE 6 — Background Stock + Finance (fire-and-forget)
  // ══════════════════════════════════════════════════════════

  async function _triggerBackgroundProcessing(orderId) {
    try {
      await Promise.all([
        supabase.rpc('process_stock_queue', { p_order_id: orderId }),
        supabase.rpc('process_finance_queue', { p_order_id: orderId }),
      ])
      console.log('[KOT] Stock + Finance processed for order:', orderId)
    } catch (e) {
      console.error('[KOT] Background processing error (non-critical):', e)
    }
  }

  // ══════════════════════════════════════════════════════════
  // REALTIME — kot_batches subscription
  // ══════════════════════════════════════════════════════════

  /**
   * Subscribe to kot_batches realtime for a specific kitchen.
   * Call from KitchenPage.vue after fetchKitchenQueue().
   * @param {string} kitchenId
   */
  function subscribeKitchenBatches(kitchenId) {
    if (kotBatchChannel) supabase.removeChannel(kotBatchChannel)
    if (!kitchenId) return

    kotBatchChannel = supabase
      .channel(`kot-batches-${kitchenId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_batches',
          filter: `kitchen_id=eq.${kitchenId}`,
        },
        (payload) => handleBatchChange(payload, kitchenId),
      )
      .subscribe((status) => {
        console.log('[KOT] Realtime status:', status)
      })
  }

  function handleBatchChange(payload, kitchenId) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // New batch arrived — fetch full row from RPC to get lines
      fetchKitchenQueue(kitchenId)
      playAlertSound()
      Notify.create({
        type: 'info',
        icon: 'restaurant',
        message: `New KOT arrived!`,
        position: 'top-right',
        timeout: 5000,
      })
    }

    if (eventType === 'UPDATE') {
      const idx = kitchenQueue.value.findIndex((b) => b.batch_id === newRow.id)
      if (idx !== -1) {
        kitchenQueue.value[idx].batch_status = newRow.status
      }
      // Remove served/cancelled from display
      if (['served', 'cancelled'].includes(newRow.status)) {
        kitchenQueue.value = kitchenQueue.value.filter((b) => b.batch_id !== newRow.id)
      }
    }

    if (eventType === 'DELETE') {
      kitchenQueue.value = kitchenQueue.value.filter((b) => b.batch_id !== oldRow.id)
    }
  }

  // ══════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════

  function enrichBatch(batch) {
    return {
      ...batch,
      lines: Array.isArray(batch.lines) ? batch.lines : [],
      timeElapsed: getTimeElapsed(batch.batch_created_at),
    }
  }

  function getTimeElapsed(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 0) return '00:00'
    const mins = Math.floor(diff / 60000)
    const secs = Math.floor((diff % 60000) / 1000)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  function playAlertSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const play = (f, t, d) => {
        const osc = ctx.createOscillator()
        const g = ctx.createGain()
        osc.connect(g)
        g.connect(ctx.destination)
        osc.frequency.value = f
        g.gain.setValueAtTime(0.5, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + d)
        osc.start(t)
        osc.stop(t + d)
      }
      const now = ctx.currentTime
      play(880, now, 0.3)
      play(1108, now + 0.2, 0.3)
    } catch {
      /* silent fail */
    }
  }

  function cleanup() {
    if (kotBatchChannel) {
      supabase.removeChannel(kotBatchChannel)
      kotBatchChannel = null
    }
    kitchenQueue.value = []
    cashierQueue.value = []
  }

  return {
    // State
    kitchenQueue,
    cashierQueue,
    loading,
    actionLoading,
    // Computed
    branchId,
    newBatches,
    preparingBatches,
    readyBatches,
    readyOrdersInCashier,
    // Phase 2 — Waiter
    acceptAndRouteKots,
    // Phase 4 — Kitchen
    fetchKitchenQueue,
    acceptBatch,
    startBatch,
    completeBatch,
    cancelBatch,
    subscribeKitchenBatches,
    // Phase 5 — Cashier
    fetchCashierQueue,
    raiseInvoice,
    processPayment,
    getOrderBill,
    // Cleanup
    cleanup,
  }
})
