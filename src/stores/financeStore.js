import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { Notify } from 'quasar'
import { processFinance as rpcProcessFinance } from 'src/services/kotDispatchService'

/**
 * Finance Store
 *
 * Manages daily revenue data + finance_queue realtime subscription.
 * Exposes processFinance() for manual posting (if auto-trigger is bypassed).
 */
export const useFinanceStore = defineStore('finance', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const dailyInvoices = ref([])
  const dailyPayments = ref([])
  const wipOrders = ref([])
  const financeQueue = ref([]) // finance_queue entries (pending/posted)
  const loading = ref(false)
  const processing = ref(null) // order ID currently being finance-posted

  // Realtime channels
  let ordersChannel = null
  let paymentsChannel = null
  let financeQueueChannel = null

  // ── Getters ────────────────────────────────────────────────
  const branchId = computed(() => authStore.currentBranch?.id)

  const todayRevenue = computed(() => {
    return dailyPayments.value.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  })

  const wipRevenue = computed(() => {
    return wipOrders.value.reduce((sum, o) => sum + Number(o.total_amount || 0), 0)
  })

  const totalExpectedRevenue = computed(() => todayRevenue.value + wipRevenue.value)

  const pendingInvoicesCount = computed(() => {
    return dailyInvoices.value.filter((inv) => inv.payment_status === 'unpaid').length
  })

  const pendingFinanceQueueCount = computed(
    () => financeQueue.value.filter((fq) => fq.status === 'pending').length,
  )

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await Promise.all([fetchDailyData(), fetchWipOrders(), fetchFinanceQueue()])
      subscribeRealtime()
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Data ─────────────────────────────────────────────
  async function fetchDailyData() {
    if (!branchId.value) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [invResp, payResp] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .eq('branch_id', branchId.value)
        .gte('created_at', today.toISOString()),
      supabase
        .from('payments')
        .select('*, orders!inner(branch_id)')
        .eq('orders.branch_id', branchId.value)
        .gte('created_at', today.toISOString()),
    ])

    if (!invResp.error) dailyInvoices.value = invResp.data
    if (!payResp.error) dailyPayments.value = payResp.data
  }

  async function fetchWipOrders() {
    if (!branchId.value) return

    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, status, created_at')
      .eq('branch_id', branchId.value)
      .in('status', ['accepted', 'preparing', 'ready', 'served', 'invoiced'])
      .neq('payment_status', 'paid')

    if (!error) {
      wipOrders.value = data || []
    }
  }

  async function fetchFinanceQueue() {
    if (!branchId.value) return

    const { data, error } = await supabase
      .from('finance_queue')
      .select(
        `id, order_id, status, created_at, updated_at,
         orders ( order_number, total_amount, payment_status )`,
      )
      .eq('branch_id', branchId.value)
      .in('status', ['pending', 'posted'])
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error) {
      financeQueue.value = data || []
    }
  }

  // ── Process Finance (manual posting) ───────────────────────

  /**
   * Manually post finance for an order.
   * Normally auto-triggered when order reaches paid/invoiced state.
   * Idempotent — safe to call multiple times.
   */
  async function processFinance(orderId) {
    if (!orderId) return { success: false, error: 'No order ID provided' }
    processing.value = orderId

    try {
      const result = await rpcProcessFinance(orderId)

      if (!result.success) {
        Notify.create({
          type: 'negative',
          message: result.error || 'Finance posting failed',
          position: 'top',
          timeout: 5000,
        })
        return result
      }

      // Update local queue state
      const idx = financeQueue.value.findIndex((fq) => fq.order_id === orderId)
      if (idx !== -1) financeQueue.value[idx].status = 'posted'

      Notify.create({
        type: 'positive',
        icon: 'account_balance',
        message: `Finance posted — Order #${result.data?.order_number || ''}`,
        position: 'top',
        timeout: 3000,
      })

      return result
    } catch (e) {
      console.error('[FinanceStore] processFinance error:', e)
      return { success: false, error: e.message }
    } finally {
      processing.value = null
    }
  }

  // ── Realtime ───────────────────────────────────────────────
  function subscribeRealtime() {
    if (!branchId.value) return
    cleanup()

    ordersChannel = supabase
      .channel('finance-orders-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${branchId.value}`,
        },
        () => {
          fetchWipOrders()
        },
      )
      .subscribe()

    paymentsChannel = supabase
      .channel('finance-payments-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => {
          fetchDailyData()
        },
      )
      .subscribe()

    // Finance queue realtime — branch-filtered for security
    financeQueueChannel = supabase
      .channel(`finance-queue-rt-${branchId.value}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'finance_queue',
          filter: `branch_id=eq.${branchId.value}`,
        },
        (payload) => {
          handleFinanceQueueChange(payload)
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[FinanceStore] Finance queue realtime connected')
        }
      })
  }

  function handleFinanceQueueChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      fetchFinanceQueue()
    }

    if (eventType === 'UPDATE') {
      const idx = financeQueue.value.findIndex((fq) => fq.id === newRow.id)
      if (idx !== -1) {
        financeQueue.value[idx] = { ...financeQueue.value[idx], status: newRow.status }
      } else {
        fetchFinanceQueue()
      }
    }

    if (eventType === 'DELETE') {
      financeQueue.value = financeQueue.value.filter((fq) => fq.id !== oldRow?.id)
    }
  }

  function cleanup() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (paymentsChannel) supabase.removeChannel(paymentsChannel)
    if (financeQueueChannel) supabase.removeChannel(financeQueueChannel)
    ordersChannel = null
    paymentsChannel = null
    financeQueueChannel = null
  }

  return {
    dailyInvoices,
    dailyPayments,
    wipOrders,
    financeQueue,
    loading,
    processing,
    todayRevenue,
    wipRevenue,
    totalExpectedRevenue,
    pendingInvoicesCount,
    pendingFinanceQueueCount,
    initialize,
    fetchDailyData,
    fetchWipOrders,
    fetchFinanceQueue,
    processFinance,
    cleanup,
  }
})
