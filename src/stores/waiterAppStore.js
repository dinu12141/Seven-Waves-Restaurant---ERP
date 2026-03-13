/**
 * waiterAppStore.js
 * Central state for the Waiter PWA App Shell.
 * Wired directly to existing Supabase tables — no mock data.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

export const useWaiterAppStore = defineStore('waiterApp', () => {
  const authStore = useAuthStore()

  // ─── State ────────────────────────────────────────────────────────────────
  const loading = ref(false)
  const profile = ref(null)          // waiter_profiles row
  const managerInfo = ref(null)      // employee_hierarchy_assignments + manager employee
  const shiftInfo = ref(null)        // current shift info
  const isOnShift = ref(false)
  const pendingOrders = ref([])      // status = 'pending_waiter'
  const myOrders = ref([])           // assigned_waiter_id = me
  const readyAlerts = ref([])        // kot_tickets status = 'ready' on my orders
  const notifications = ref([])      // waiter_notifications
  const pointsLedger = ref([])       // last 20 waiter_points_ledger entries

  // Admin impersonation
  const impersonateProfileId = ref(null)  // waiter_profiles.id to view as
  const allWaiters = ref([])              // all active waiter profiles (admin only)

  // Realtime channels
  let ordersChannel = null
  let notifsChannel = null
  let pointsChannel = null

  // ─── Computed ─────────────────────────────────────────────────────────────
  const unreadNotifCount = computed(() => notifications.value.filter(n => !n.is_read).length)
  const pendingCount = computed(() => pendingOrders.value.length)
  const myOrderCount = computed(() => myOrders.value.length)
  const readyCount = computed(() => readyAlerts.value.length)
  const currentPoints = computed(() => profile.value?.current_points ?? 0)
  const totalOrdersServed = computed(() => profile.value?.total_orders_served ?? 0)

  // ─── Initialize ───────────────────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      await Promise.all([
        loadProfile(),
        loadShiftInfo(),
        loadPendingOrders(),
        loadMyOrders(),
        loadNotifications(),
      ])
      await loadReadyAlerts()
      subscribeRealtime()
      // Load all waiters for admin selector
      const roles = authStore.roles || []
      if (roles.includes('admin') || roles.includes('manager')) {
        await loadAllWaiters()
      }
    } catch (e) {
      console.error('[WaiterApp] initialize error:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Admin: switch into a specific waiter's dashboard.
   * Reloads profile, shift, orders, etc. for that waiter.
   */
  async function initializeAs(waiterProfileId) {
    cleanup() // tear down realtime channels
    impersonateProfileId.value = waiterProfileId || null
    loading.value = true
    try {
      await loadProfile()
      await Promise.all([
        loadShiftInfo(),
        loadMyOrders(),
        loadNotifications(),
        loadPendingOrders(),
      ])
      await loadReadyAlerts()
      subscribeRealtime()
    } catch (e) {
      console.error('[WaiterApp] initializeAs error:', e)
    } finally {
      loading.value = false
    }
  }

  // ─── Profile ──────────────────────────────────────────────────────────────
  async function loadProfile() {
    let wp = null

    if (impersonateProfileId.value) {
      // Admin viewing a specific waiter
      const { data } = await supabase
        .from('waiter_profiles')
        .select('*')
        .eq('id', impersonateProfileId.value)
        .single()
      wp = data
    } else {
      // Normal waiter — load own profile
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('waiter_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      wp = data
    }

    profile.value = wp || null
    if (!wp) return

    // Load manager from hierarchy
    const { data: hier } = await supabase
      .from('employee_hierarchy_assignments')
      .select(`
        hierarchy_type,
        manager_employee:manager_employee_id ( id, full_name, employee_code )
      `)
      .eq('employee_id', wp.employee_id)
      .eq('is_active', true)
      .limit(1)
      .single()
    managerInfo.value = hier || null

    // Load points ledger via dedicated action
    await loadPointsLedger(wp.id)
  }

  // ─── All Waiters (admin selector) ─────────────────────────────────────────
  async function loadAllWaiters() {
    const { data } = await supabase
      .from('waiter_profiles')
      .select('id, display_name, waiter_code, is_active, user_id')
      .eq('is_active', true)
      .order('display_name', { ascending: true })
    allWaiters.value = data || []
  }

  // ─── Points Ledger ────────────────────────────────────────────────────────
  async function loadPointsLedger(profileId) {
    const pid = profileId || profile.value?.id
    if (!pid) return
    const { data } = await supabase
      .from('waiter_points_ledger')
      .select('*')
      .eq('waiter_profile_id', pid)
      .order('created_at', { ascending: false })
      .limit(30)
    pointsLedger.value = data || []
  }

  // ─── Shift ────────────────────────────────────────────────────────────────
  async function loadShiftInfo() {
    // Wait for profile to be available (it loads in parallel)
    // If not available, do a quick lookup
    let employeeId = profile.value?.employee_id

    if (!employeeId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: wp } = await supabase
        .from('waiter_profiles')
        .select('employee_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()
      if (!wp?.employee_id) return
      employeeId = wp.employee_id
    }

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    let query = supabase
      .from('shift_assignments')
      .select(`
        id, assignment_date, status,
        shifts ( id, name, start_time, end_time )
      `)
      .eq('employee_id', employeeId)
      .eq('assignment_date', today)        // ✅ correct column name
      .in('status', ['scheduled', 'active', 'present'])
      .limit(1)

    // Filter by branch if available (not critical — employee_id is sufficient)
    const branchId = authStore.currentBranch?.id
    if (branchId) query = query.eq('branch_id', branchId)

    const { data: sa, error } = await query.single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = "no rows" — that's fine, means off shift
      console.warn('[WaiterApp] loadShiftInfo error:', error.message)
    }

    if (sa) {
      shiftInfo.value = {
        id:           sa.id,
        date:         sa.assignment_date,
        shift_name:   sa.shifts?.name,
        shift_start:  sa.shifts?.start_time,
        shift_end:    sa.shifts?.end_time,
        branch_name:  authStore.currentBranch?.name,
      }
      isOnShift.value = true
    } else {
      shiftInfo.value = null
      isOnShift.value = false
    }
  }


  // ─── Orders ───────────────────────────────────────────────────────────────
  async function loadPendingOrders() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, created_at, table_number,
        order_items ( id, quantity, menu_items ( name, price ) )
      `)
      .eq('branch_id', branchId)
      .eq('status', 'pending_waiter')
      .order('created_at', { ascending: true })

    pendingOrders.value = data || []
  }

  async function loadMyOrders() {
    // Use impersonated waiter's user_id if set, else current user
    let userId = profile.value?.user_id
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id
    }
    if (!userId) return

    const { data } = await supabase
      .from('orders')
      .select(`
        id, order_number, status, created_at, table_number, accepted_at,
        order_items ( id, quantity, status, menu_items ( name, price ) )
      `)
      .eq('assigned_waiter_id', userId)
      .in('status', ['accepted', 'sent_to_kitchen', 'ready', 'served'])
      .order('created_at', { ascending: false })
      .limit(30)

    myOrders.value = data || []
  }

  // ─── Ready Alerts ─────────────────────────────────────────────────────────
  async function loadReadyAlerts() {
    if (!myOrders.value.length) return

    const orderIds = myOrders.value.map(o => o.id)
    const { data } = await supabase
      .from('kot_tickets')
      .select(`
        id, status, batch_number, created_at,
        order_id,
        kitchens ( name )
      `)
      .in('order_id', orderIds)
      .eq('status', 'ready')
      .order('created_at', { ascending: true })

    readyAlerts.value = data || []
  }

  // ─── Notifications ────────────────────────────────────────────────────────
  async function loadNotifications() {
    if (!profile.value) {
      // profile may not be loaded yet; re-fetch user_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: wp } = await supabase
        .from('waiter_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
      if (!wp) return
      profile.value = { ...profile.value, id: wp.id }
    }

    const { data } = await supabase
      .from('waiter_notifications')
      .select('*')
      .eq('waiter_profile_id', profile.value.id)
      .order('created_at', { ascending: false })
      .limit(50)

    notifications.value = data || []
  }

  async function markNotificationRead(id) {
    await supabase
      .from('waiter_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    notifications.value = notifications.value.map(n =>
      n.id === id ? { ...n, is_read: true } : n
    )
  }

  async function markAllNotifsRead() {
    if (!profile.value) return
    await supabase
      .from('waiter_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('waiter_profile_id', profile.value.id)
      .eq('is_read', false)
    notifications.value = notifications.value.map(n => ({ ...n, is_read: true }))
  }

  // ─── Accept Order ─────────────────────────────────────────────────────────
  async function acceptOrder(orderId) {
    const { data, error } = await supabase.rpc('process_waiter_accept', { p_order_id: orderId })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error || 'Accept failed')
    await Promise.all([loadPendingOrders(), loadMyOrders()])
    return data
  }

  // ─── Mark Served ──────────────────────────────────────────────────────────
  async function markServed(orderId) {
    const { data, error } = await supabase.rpc('process_waiter_mark_served', { p_order_id: orderId })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error || 'Mark served failed')
    await Promise.all([loadMyOrders(), loadReadyAlerts(), loadProfile()])
    return data
  }

  // ─── Realtime ─────────────────────────────────────────────────────────────
  let kotChannel = null

  function subscribeRealtime() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    // Orders channel — covers pending + assigned order changes
    ordersChannel = supabase
      .channel('waiter-app-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => {
          loadPendingOrders()
          loadMyOrders()
        }
      )
      .subscribe()

    // KOT channel — kitchen-ready alerts
    kotChannel = supabase
      .channel('waiter-app-kot')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kot_tickets' },
        (payload) => {
          if (payload.new?.status === 'ready') {
            loadReadyAlerts()
          }
        }
      )
      .subscribe()

    if (profile.value?.id) {
      // Notifications channel — pushed by triggers
      notifsChannel = supabase
        .channel('waiter-app-notifs')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'waiter_notifications',
            filter: `waiter_profile_id=eq.${profile.value.id}` },
          (payload) => {
            notifications.value.unshift(payload.new)
          }
        )
        .subscribe()

      // Points ledger channel — realtime balance updates
      pointsChannel = supabase
        .channel('waiter-app-points')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'waiter_points_ledger',
            filter: `waiter_profile_id=eq.${profile.value.id}` },
          (payload) => {
            // Prepend new entry immediately for instant feedback
            pointsLedger.value.unshift(payload.new)
            // Re-fetch profile so current_points reflects DB trigger result
            loadProfile()
          }
        )
        .subscribe()
    }
  }

  function cleanup() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (notifsChannel) supabase.removeChannel(notifsChannel)
    if (kotChannel)    supabase.removeChannel(kotChannel)
    if (pointsChannel) supabase.removeChannel(pointsChannel)
  }

  async function refresh() {
    await Promise.all([
      loadPendingOrders(),
      loadMyOrders(),
      loadNotifications(),
      loadProfile(),
      loadShiftInfo(),
    ])
    await Promise.all([loadReadyAlerts(), loadPointsLedger()])
  }


  return {
    // state
    loading, profile, managerInfo, shiftInfo, isOnShift,
    pendingOrders, myOrders, readyAlerts, notifications, pointsLedger,
    impersonateProfileId, allWaiters,
    // computed
    unreadNotifCount, pendingCount, myOrderCount, readyCount,
    currentPoints, totalOrdersServed,
    // actions
    initialize, initializeAs, refresh, cleanup,
    acceptOrder, markServed, markNotificationRead, markAllNotifsRead,
    loadPendingOrders, loadMyOrders, loadReadyAlerts, loadPointsLedger,
    loadAllWaiters,
  }
})
