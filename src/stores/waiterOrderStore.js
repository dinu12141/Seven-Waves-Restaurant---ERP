import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

/**
 * Waiter Order Store — Shift-Aware
 *
 * Uses server-side RPCs (auth_is_on_shift, get_pending_orders_for_shift,
 * accept_order_as_waiter) to enforce that a waiter can ONLY view and
 * accept orders for branches where they are on shift today.
 */
export const useWaiterOrderStore = defineStore('waiterOrder', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const pendingOrders = ref([])
  const myOrders = ref([])
  const loading = ref(false)
  const accepting = ref(null) // order ID currently being accepted
  const isOnShift = ref(false)
  const shiftBranches = ref([]) // branches this waiter is on shift for
  const branchId = ref(null) // primary branch for realtime channel
  const companyId = ref(null)
  const shiftInfo = ref(null) // { branch_name, shift_name, shift_start, shift_end }

  // Subscriptions
  let ordersChannel = null

  // ── Getters ────────────────────────────────────────────────
  const pendingCount = computed(() => pendingOrders.value.length)
  const myOrderCount = computed(() => myOrders.value.length)
  const waiterId = computed(() => authStore.user?.id)

  // ── Initialize ─────────────────────────────────────────────

  /**
   * 1. Calls auth_get_shift_branches() RPC to discover which branches
   *    the waiter is assigned to today.
   * 2. Sets isOnShift + branchId from the result.
   * 3. Fetches pending orders via RPC (server enforces shift check).
   * 4. Starts realtime subscription per shift branch.
   */
  async function initialize() {
    loading.value = true
    try {
      const userId = authStore.user?.id
      if (!userId) return

      // 1. Ask the server which branches we're on shift for
      const { data: branches, error: branchErr } = await supabase.rpc('auth_get_shift_branches')

      if (branchErr) {
        console.error('[WaiterStore] Shift check error:', branchErr)
        // Fallback: use authStore branch (for admins/managers without employee records)
        branchId.value = authStore.currentBranch?.id
        companyId.value = authStore.currentBranch?.company_id
        isOnShift.value = authStore.roles.some((r) => ['admin', 'manager'].includes(r))
      } else if (branches && branches.length > 0) {
        isOnShift.value = true
        shiftBranches.value = branches
        // Use first shift branch as primary
        branchId.value = branches[0].branch_id
        shiftInfo.value = {
          branch_name: branches[0].branch_name,
          shift_name: branches[0].shift_name,
          shift_start: branches[0].shift_start,
          shift_end: branches[0].shift_end,
        }
        // Get company_id from the branch
        const { data: branchData } = await supabase
          .from('branches')
          .select('company_id')
          .eq('id', branchId.value)
          .single()
        companyId.value = branchData?.company_id
      } else {
        // No shift assignments found
        isOnShift.value = false
        branchId.value = authStore.currentBranch?.id
        companyId.value = authStore.currentBranch?.company_id
      }

      // 2. Fetch orders (server-side shift filtering)
      await Promise.all([fetchPendingOrders(), fetchMyOrders()])

      // 3. Start realtime for each shift branch
      subscribeToOrders()
    } catch (e) {
      console.error('[WaiterStore] Init error:', e)
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Pending Orders (RPC) ─────────────────────────────

  /**
   * Uses the get_pending_orders_for_shift() RPC which internally
   * calls auth_is_on_shift() for each order's branch.
   * Server guarantees we only get orders from our shift branches.
   */
  async function fetchPendingOrders() {
    const { data, error } = await supabase.rpc('get_pending_orders_for_shift')

    if (error) {
      console.error('[WaiterStore] Fetch pending RPC error:', error)
      return
    }

    // RPC returns flat rows; enrich with order_items AND kot_tickets
    const enriched = await Promise.all(
      (data || []).map(async (row) => {
        const [itemsResp, kotResp] = await Promise.all([
          supabase
            .from('order_items')
            .select('id, quantity, unit_price, notes, menu_items ( name )')
            .eq('order_id', row.id),
          supabase
            .from('kot_tickets')
            .select('id, kot_number, status, kitchen_id')
            .eq('order_id', row.id),
        ])

        const items = itemsResp.data || []
        const kotTickets = kotResp.data || []

        return {
          ...row,
          tableNumber: row.table_number || '—',
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0) || 0,
          items: items.map((oi) => ({
            ...oi,
            name: oi.menu_items?.name || 'Unknown Item',
          })),
          kot_tickets: kotTickets,
          timeAgo: getTimeAgo(row.created_at),
        }
      }),
    )

    pendingOrders.value = enriched
  }

  // ── Fetch My Orders ────────────────────────────────────────

  async function fetchMyOrders() {
    if (!waiterId.value) return

    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        table_id,
        order_type,
        order_source,
        status,
        total_amount,
        notes,
        created_at,
        updated_at,
        restaurant_tables ( table_number ),
        order_items (
          id,
          menu_item_id,
          quantity,
          unit_price,
          notes,
          status,
          menu_items ( name )
        ),
        kot_tickets (
          id,
          kot_number,
          kitchen_id,
          status,
          created_at
        )
      `,
      )
      .eq('assigned_waiter_id', waiterId.value)
      .in('status', ['accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[WaiterStore] Fetch my orders error:', error)
      return
    }

    myOrders.value = (data || []).map(normalizeOrder)
  }

  // ── Accept Order (RPC) ─────────────────────────────────────

  /**
   * Uses accept_order_as_waiter() RPC which:
   * 1. Locks the order row (SELECT ... FOR UPDATE)
   * 2. Verifies auth_is_on_shift(branch_id)
   * 3. Updates status + assigned_waiter_id atomically
   * 4. Creates order_acceptance record
   *
   * Returns { success: true/false, error?: string }
   */
  async function acceptOrder(orderId) {
    if (!waiterId.value) return { success: false, error: 'Not authenticated' }
    accepting.value = orderId

    try {
      const { data, error: rpcError } = await supabase.rpc('accept_order_as_waiter', {
        p_order_id: orderId,
      })

      if (rpcError) {
        return { success: false, error: rpcError.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Accept failed' }
      }

      // Remove from local pending list
      pendingOrders.value = pendingOrders.value.filter((o) => o.id !== orderId)

      // Refresh my orders
      await fetchMyOrders()

      return { success: true }
    } catch (e) {
      console.error('[WaiterStore] Accept error:', e)
      return { success: false, error: e.message }
    } finally {
      accepting.value = null
    }
  }

  // ── Realtime ───────────────────────────────────────────────

  function subscribeToOrders() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)

    // Subscribe to orders for ALL shift branches
    const branchIds = shiftBranches.value.map((b) => b.branch_id)
    // If no specific branches (admin/manager), use primary branch
    const filterBranch = branchIds.length > 0 ? branchIds[0] : branchId.value
    if (!filterBranch) return

    ordersChannel = supabase
      .channel('waiter-orders-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `branch_id=eq.${filterBranch}`,
        },
        (payload) => {
          handleOrderChange(payload)
        },
      )
      .subscribe()

    // If waiter has multiple shift branches, add listeners for each
    if (branchIds.length > 1) {
      branchIds.slice(1).forEach((bId) => {
        supabase
          .channel(`waiter-orders-rt-${bId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'orders',
              filter: `branch_id=eq.${bId}`,
            },
            (payload) => {
              handleOrderChange(payload)
            },
          )
          .subscribe()
      })
    }
  }

  function handleOrderChange(payload) {
    const { eventType, new: newRow } = payload

    if (eventType === 'INSERT') {
      // New order — add to pending if it matches
      if (newRow.status === 'pending_waiter' && !newRow.assigned_waiter_id) {
        // Re-fetch from RPC to ensure shift check on server
        fetchPendingOrders()
      }
    }

    if (eventType === 'UPDATE') {
      // If accepted / no longer pending → remove from inbox
      if (newRow.status !== 'pending_waiter' || newRow.assigned_waiter_id) {
        pendingOrders.value = pendingOrders.value.filter((o) => o.id !== newRow.id)
      }

      // If it's MY order, update it in myOrders
      if (newRow.assigned_waiter_id === waiterId.value) {
        const idx = myOrders.value.findIndex((o) => o.id === newRow.id)
        if (idx !== -1) {
          myOrders.value[idx] = {
            ...myOrders.value[idx],
            status: newRow.status,
            updated_at: newRow.updated_at,
          }
        } else if (newRow.status === 'accepted') {
          fetchMyOrders()
        }
      }

      // If status changed to terminal, remove from my list
      if (['served', 'invoiced', 'paid', 'cancelled'].includes(newRow.status)) {
        myOrders.value = myOrders.value.filter((o) => o.id !== newRow.id)
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  function normalizeOrder(order) {
    return {
      ...order,
      tableNumber: order.restaurant_tables?.table_number || '—',
      itemCount: order.order_items?.reduce((sum, i) => sum + i.quantity, 0) || 0,
      items: (order.order_items || []).map((oi) => ({
        ...oi,
        name: oi.menu_items?.name || 'Unknown Item',
      })),
      timeAgo: getTimeAgo(order.created_at),
    }
  }

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
  }

  // ── Cleanup ────────────────────────────────────────────────

  function cleanup() {
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    pendingOrders.value = []
    myOrders.value = []
  }

  return {
    pendingOrders,
    myOrders,
    loading,
    accepting,
    isOnShift,
    shiftBranches,
    branchId,
    shiftInfo,
    pendingCount,
    myOrderCount,
    waiterId,
    initialize,
    fetchPendingOrders,
    fetchMyOrders,
    acceptOrder,
    cleanup,
  }
})
