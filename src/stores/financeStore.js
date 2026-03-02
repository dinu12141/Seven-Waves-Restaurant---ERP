import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

export const useFinanceStore = defineStore('finance', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const dailyInvoices = ref([])
  const dailyPayments = ref([])
  const wipOrders = ref([])
  const loading = ref(false)

  // Realtime
  let ordersChannel = null
  let paymentsChannel = null

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

  // ── Initialize ─────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await Promise.all([fetchDailyData(), fetchWipOrders()])
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

    // Parallel fetch for speed
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
  }

  function cleanup() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (paymentsChannel) supabase.removeChannel(paymentsChannel)
  }

  return {
    dailyInvoices,
    dailyPayments,
    wipOrders,
    loading,
    todayRevenue,
    wipRevenue,
    totalExpectedRevenue,
    pendingInvoicesCount,
    initialize,
    fetchDailyData,
    fetchWipOrders,
    cleanup,
  }
})
