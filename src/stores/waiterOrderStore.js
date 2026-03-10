import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { Notify } from 'quasar'
import { acceptOrder as dispatchAcceptOrder } from 'src/services/kotDispatchService'

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

  // Realtime channels
  let ordersChannel = null
  let kotChannel = null

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
        // No shift assignments found - but admins/managers are always "on shift" if they have a branch
        isOnShift.value = authStore.roles.some((r) => ['admin', 'manager'].includes(r))
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
            .select(
              'id, quantity, unit_price, notes, menu_items ( name, categories ( name ) ), kitchens ( name )',
            )
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
            categoryName: oi.menu_items?.categories?.name || '',
            kitchenName: oi.kitchens?.name || '',
          })),
          customerName: row.customer_name || '',
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

    // Fetch waiter name first (simple, no join that can break)
    let waiterName = 'Staff'
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', waiterId.value)
        .single()
      if (profileData?.full_name) waiterName = profileData.full_name
      // eslint-disable-next-line no-unused-vars
    } catch (_e) {
      /* non-critical */
    }

    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(
        'id, order_number, table_id, order_type, order_source, status, total_amount, notes, created_at, updated_at, branch_id, customer_name, restaurant_tables ( table_number )',
      )
      .eq('assigned_waiter_id', waiterId.value)
      .in('status', ['accepted', 'preparing', 'ready'])
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[WaiterStore] Fetch my orders error:', error)
      return
    }

    const enriched = await Promise.all(
      (ordersData || []).map(async (row) => {
        const [itemsResp, kotResp] = await Promise.all([
          supabase
            .from('order_items')
            .select(
              'id, quantity, unit_price, status, notes, menu_items ( name, categories ( name ) ), kitchens ( name )',
            )
            .eq('order_id', row.id),
          supabase
            .from('kot_tickets')
            .select(
              'id, kot_number, kitchen_id, status, created_at, kot_items ( order_item_id, quantity, status )',
            )
            .eq('order_id', row.id),
        ])

        const items = itemsResp.data || []
        const kotTickets = kotResp.data || []

        return {
          ...row,
          tableNumber: row.restaurant_tables?.table_number || '—',
          waiterName,
          customerName: row.customer_name || '',
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0) || 0,
          items: items.map((oi) => ({
            ...oi,
            name: oi.menu_items?.name || 'Unknown Item',
            categoryName: oi.menu_items?.categories?.name || '',
            kitchenName: oi.kitchens?.name || '',
          })),
          kot_tickets: kotTickets,
          timeAgo: getTimeAgo(row.created_at),
        }
      }),
    )

    myOrders.value = enriched
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
      console.log('[WaiterStore] Accepting order via ERP dispatch:', orderId)
      // Use the dispatch service (wraps the upgraded accept_order_as_waiter RPC)
      const result = await dispatchAcceptOrder(orderId)

      if (!result.success) {
        Notify.create({
          type: 'warning',
          message: result.error || 'This order was already accepted by another waiter.',
          position: 'top',
          timeout: 4000,
        })
        fetchPendingOrders() // refresh list to clear it off
        return { success: false, error: result.error || 'Accept failed' }
      }

      // Log ERP dispatch summary
      if (result.data) {
        console.log('[WaiterStore] ERP Dispatch complete:', {
          kotCount: result.data.kot_count,
          dispatchCount: result.data.dispatch_count,
          queues: result.data.queues_created,
        })
      }

      // Remove from local pending list
      pendingOrders.value = pendingOrders.value.filter((o) => o.id !== orderId)

      // Refresh my orders immediately
      await fetchMyOrders()

      // Small delay and refresh again to be 100% sure the DB change is visible
      setTimeout(() => fetchMyOrders(), 800)

      Notify.create({
        type: 'positive',
        message: 'Order Accepted!',
        position: 'top',
        timeout: 2000,
      })

      return { success: true, data: result.data }
    } catch (e) {
      console.error('[WaiterStore] Accept error:', e)
      Notify.create({ type: 'negative', message: e.message })
      return { success: false, error: e.message }
    } finally {
      accepting.value = null
    }
  }

  // ── Mark Order Served ──────────────────────────────────────

  async function markOrderServed(orderId) {
    if (!waiterId.value) return { success: false, error: 'Not authenticated' }

    try {
      const { data, error: rpcError } = await supabase.rpc('mark_order_served', {
        p_order_id: orderId,
      })

      if (rpcError) {
        console.error('[WaiterStore] Mark served RPC error:', rpcError)
        return { success: false, error: rpcError.message }
      }

      if (!data?.success) {
        return { success: false, error: data?.error || 'Failed to mark as served' }
      }

      // Remove from my orders list
      myOrders.value = myOrders.value.filter((o) => o.id !== orderId)

      return { success: true }
    } catch (e) {
      console.error('[WaiterStore] Mark served error:', e)
      return { success: false, error: e.message }
    }
  }

  function subscribeToOrders() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (kotChannel) supabase.removeChannel(kotChannel)

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

    // Subscribe to KOT tickets to refresh My Orders when trigger generates them
    kotChannel = supabase
      .channel('waiter-kot-rt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_tickets',
        },
        (payload) => {
          const { eventType, new: newRow } = payload

          if (eventType === 'UPDATE' && newRow.status === 'ready') {
            const myOrder = myOrders.value.find((o) => o.id === newRow.order_id)
            if (myOrder) {
              const kot = myOrder.kot_tickets?.find((k) => k.id === newRow.id)
              if (kot && kot.status !== 'ready') {
                // Trigger notification
                playAlertSound()
                Notify.create({
                  type: 'positive',
                  icon: 'task_alt',
                  color: 'green-10',
                  textColor: 'white',
                  message: `KOT #${newRow.kot_number || ''} is READY! (Table ${myOrder.tableNumber})`,
                  caption: `Order #${myOrder.order_number}`,
                  position: 'top',
                  timeout: 6000,
                  classes: 'text-weight-bold',
                  actions: [{ icon: 'close', color: 'white', size: 'sm' }],
                })
              }
            }
          }
          // When KOT generated or status changed, sync My Orders
          fetchMyOrders()
        },
      )
      .subscribe()
  }

  function handleOrderChange(payload) {
    const { eventType, new: newRow } = payload

    if (eventType === 'INSERT') {
      // New order — add to pending if it matches
      if (newRow.status === 'pending_waiter' && !newRow.assigned_waiter_id) {
        // 🔔 Play notification sound instantly
        playAlertSound()

        // Re-fetch from RPC to ensure shift check on server
        fetchPendingOrders()

        // 🔔 Fire notification for New Order
        if (newRow.table_id) {
          supabase
            .from('restaurant_tables')
            .select('table_number')
            .eq('id', newRow.table_id)
            .single()
            .then(({ data }) => {
              const tNum = data?.table_number ? data.table_number.replace('Table', '').trim() : ''
              const tableName = tNum ? `Table ${tNum}` : 'a Table'
              Notify.create({
                type: 'info',
                icon: 'room_service',
                color: 'blue-9',
                textColor: 'white',
                message: `New Order from ${tableName}!`,
                position: 'top',
                timeout: 8000,
                dense: true,
                classes: 'text-weight-bold',
                actions: [{ icon: 'close', color: 'white', size: 'sm' }],
              })
            })
        }
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
          const prevStatus = myOrders.value[idx].status
          myOrders.value[idx] = {
            ...myOrders.value[idx],
            status: newRow.status,
            updated_at: newRow.updated_at,
          }
          // 🔔 Fire a notification when order becomes ready
          if (newRow.status === 'ready' && prevStatus !== 'ready') {
            const order = myOrders.value[idx]
            Notify.create({
              type: 'positive',
              icon: 'notifications_active',
              color: 'green-9',
              textColor: 'white',
              message: `Order #${order.order_number || ''} READY (Table ${order.tableNumber})`,
              position: 'top-right',
              timeout: 6000,
              dense: true,
              classes: 'text-weight-bold',
              actions: [{ icon: 'close', color: 'white', size: 'sm' }],
            })
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

  // normalizeOrder removed because it was unused

  function getTimeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m ago`
  }

  function playAlertSound() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

      const playTone = (freq, type, startTime, dur) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = type
        osc.frequency.setValueAtTime(freq, startTime)
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
        osc.start(startTime)
        osc.stop(startTime + dur)
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume()
      }

      const now = audioCtx.currentTime
      // A bright "Ding - Ding" sequence suitable for restaurants
      playTone(1046.5, 'sine', now, 0.4) // C6
      playTone(1318.51, 'sine', now + 0.15, 0.6) // E6
    } catch (e) {
      console.error('[WaiterStore] Audio alert failed:', e)
    }
  }

  // ── Cleanup ────────────────────────────────────────────────

  function cleanup() {
    if (ordersChannel) {
      supabase.removeChannel(ordersChannel)
      ordersChannel = null
    }
    if (kotChannel) {
      supabase.removeChannel(kotChannel)
      kotChannel = null
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
    markOrderServed,
    cleanup,
  }
})
