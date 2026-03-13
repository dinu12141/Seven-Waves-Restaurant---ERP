/**
 * managerAppStore.js
 * Central state for the Manager PWA App Shell.
 * Provides branch-scoped floor oversight, order monitoring,
 * messaging, alerts, and waiter performance tracking.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'

export const useManagerAppStore = defineStore('managerApp', () => {
  const authStore = useAuthStore()

  // ─── State ────────────────────────────────────────────────────────────────
  const loading = ref(false)
  const onShiftWaiters = ref([])
  const hierarchyMap = ref([])
  const leaderboard = ref([])

  // Orders by status
  const pendingOrders = ref([])
  const acceptedOrders = ref([])
  const readyOrders = ref([])
  const delayedOrders = ref([])

  // Messaging
  const messages = ref([])

  // Alerts
  const alerts = ref([])

  // Served today counter
  const servedTodayCount = ref(0)

  // Realtime channels
  let ordersChannel = null
  let kotChannel = null
  let profilesChannel = null
  let messagesChannel = null
  let alertsChannel = null

  // ─── Computed ─────────────────────────────────────────────────────────────
  const pendingOrderCount = computed(() => pendingOrders.value.length)
  const totalActiveOrders = computed(() =>
    pendingOrders.value.length + acceptedOrders.value.length + readyOrders.value.length
  )
  const unreadMessageCount = computed(() =>
    messages.value.filter(m => !m.is_read && m.receiver_employee_id === _myEmployeeId).length
  )
  const unreadAlertCount = computed(() =>
    alerts.value.filter(a => !a.is_resolved).length
  )

  // ─── Private ──────────────────────────────────────────────────────────────
  let _myEmployeeId = null

  // ─── Initialize ───────────────────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      // Guard: ensure branches are loaded before we use currentBranch in queries.
      if (!authStore.branches.length) {
        await authStore.fetchUserData()
      }
      // Resolve manager's employee_id
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('profile_id', user.id)
          .single()
        _myEmployeeId = emp?.id || null
      }

      await Promise.all([
        loadOnShiftWaiters(),
        loadOrders(),
        loadMessages(),
        loadAlerts(),
        loadHierarchy(),
        loadServedToday(),
      ])
      await loadLeaderboard()
      subscribeRealtime()
    } catch (e) {
      console.error('[ManagerApp] initialize error:', e)
    } finally {
      loading.value = false
    }
  }

  // ─── On-Shift Waiters ─────────────────────────────────────────────────────
  async function loadOnShiftWaiters() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data: profiles } = await supabase
      .from('waiter_profiles')
      .select(`
        id, waiter_code, display_name, current_points, total_orders_served, is_active,
        employee:employee_id ( id, full_name, employee_code, profile_id )
      `)
      .eq('branch_id', branchId)
      .eq('is_active', true)

    if (!profiles) { onShiftWaiters.value = []; return }

    const enriched = await Promise.all(profiles.map(async (wp) => {
      const { count: activeOrders } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_waiter_id', wp.employee?.profile_id)
        .eq('branch_id', branchId)
        .in('status', ['accepted', 'preparing', 'sent_to_kitchen', 'ready'])

      const { count: unreadAlerts } = await supabase
        .from('waiter_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('waiter_profile_id', wp.id)
        .eq('is_read', false)

      return {
        id: wp.id,
        employee_id: wp.employee?.id,
        waiter_code: wp.waiter_code,
        display_name: wp.display_name,
        employee_name: wp.employee?.full_name,
        employee_code: wp.employee?.employee_code,
        profile_id: wp.employee?.profile_id,
        current_points: wp.current_points || 0,
        served_count: wp.total_orders_served || 0,
        active_orders: activeOrders || 0,
        unread_alerts: unreadAlerts || 0,
      }
    }))

    onShiftWaiters.value = enriched
  }

  // ─── Orders ───────────────────────────────────────────────────────────────
  async function loadOrders() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const orderSelect = `
      id, order_number, status, created_at, table_id, accepted_at, assigned_waiter_id,
      restaurant_tables ( table_number ),
      order_items ( id, quantity, status, menu_items ( name, price ) )
    `

    const [pending, accepted, ready] = await Promise.all([
      supabase
        .from('orders').select(orderSelect)
        .eq('branch_id', branchId).eq('status', 'pending_waiter')
        .order('created_at', { ascending: true }),
      supabase
        .from('orders').select(orderSelect)
        .eq('branch_id', branchId).in('status', ['accepted', 'sent_to_kitchen', 'preparing'])
        .order('created_at', { ascending: false }).limit(50),
      supabase
        .from('orders').select(orderSelect)
        .eq('branch_id', branchId).eq('status', 'ready')
        .order('created_at', { ascending: false }).limit(50),
    ])

    const mapTable = arr => (arr || []).map(o => ({
      ...o,
      table_number: o.restaurant_tables?.table_number || null
    }))

    pendingOrders.value = mapTable(pending.data)
    acceptedOrders.value = mapTable(accepted.data)
    readyOrders.value = mapTable(ready.data)

    // Delayed = pending for > 5 min or accepted for > 15 min
    const now = Date.now()
    const PENDING_THRESHOLD = 5 * 60 * 1000
    const ACCEPTED_THRESHOLD = 15 * 60 * 1000

    delayedOrders.value = [
      ...pendingOrders.value.filter(o => now - new Date(o.created_at).getTime() > PENDING_THRESHOLD),
      ...acceptedOrders.value.filter(o => now - new Date(o.created_at).getTime() > ACCEPTED_THRESHOLD),
    ]
  }

  // ─── Messages ─────────────────────────────────────────────────────────────
  async function loadMessages() {
    if (!_myEmployeeId) return

    const { data } = await supabase
      .from('manager_messages')
      .select(`
        id, sender_employee_id, receiver_employee_id, branch_id,
        subject, message_body, priority, is_read, read_at, created_at,
        sender:sender_employee_id ( full_name ),
        receiver:receiver_employee_id ( full_name )
      `)
      .or(`sender_employee_id.eq.${_myEmployeeId},receiver_employee_id.eq.${_myEmployeeId}`)
      .order('created_at', { ascending: false })
      .limit(50)

    messages.value = data || []
  }

  async function sendMessage(recipientEmployeeId, subject, body, priority = 'normal') {
    const branchId = authStore.currentBranch?.id
    const { error } = await supabase.from('manager_messages').insert({
      sender_employee_id: _myEmployeeId,
      receiver_employee_id: recipientEmployeeId,
      branch_id: branchId,
      subject: subject || 'Direct Message',
      message_body: body,
      priority,
    })
    if (error) throw error
    await loadMessages()
  }

  async function markMessageRead(id) {
    await supabase
      .from('manager_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    messages.value = messages.value.map(m =>
      m.id === id ? { ...m, is_read: true } : m
    )
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────
  async function loadAlerts() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data } = await supabase
      .from('manager_alerts')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(50)

    alerts.value = data || []
  }

  async function resolveAlert(id) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase
      .from('manager_alerts')
      .update({ is_resolved: true, resolved_by: user?.id, resolved_at: new Date().toISOString() })
      .eq('id', id)
    alerts.value = alerts.value.map(a =>
      a.id === id ? { ...a, is_resolved: true } : a
    )
  }

  // ─── Hierarchy ────────────────────────────────────────────────────────────
  async function loadHierarchy() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data } = await supabase
      .from('employee_hierarchy_assignments')
      .select(`
        id, hierarchy_type,
        employee:employee_id ( full_name ),
        manager:manager_employee_id ( full_name )
      `)
      .eq('branch_id', branchId)
      .eq('is_active', true)

    hierarchyMap.value = (data || []).map(h => ({
      id: h.id,
      employee_name: h.employee?.full_name,
      manager_name: h.manager?.full_name,
      hierarchy_type: h.hierarchy_type,
    }))
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  async function loadLeaderboard() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data: profiles } = await supabase
      .from('waiter_profiles')
      .select('id, waiter_code, display_name, current_points, total_orders_served, employee:employee_id(full_name)')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('current_points', { ascending: false })

    if (!profiles) { leaderboard.value = []; return }

    const enriched = await Promise.all(profiles.map(async (wp) => {
      const { data: ledger } = await supabase
        .from('waiter_points_ledger')
        .select('id, point_type, points, note, created_at')
        .eq('waiter_profile_id', wp.id)
        .order('created_at', { ascending: false })
        .limit(10)
      return { ...wp, employee_name: wp.employee?.full_name, ledger: ledger || [] }
    }))

    leaderboard.value = enriched
  }

  // ─── Served Today ─────────────────────────────────────────────────────────
  async function loadServedToday() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'served')
      .gte('updated_at', todayStart.toISOString())
    servedTodayCount.value = count || 0
  }

  // ─── Realtime ─────────────────────────────────────────────────────────────
  function subscribeRealtime() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    // Orders channel
    ordersChannel = supabase
      .channel('mgr-orders')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => { loadOrders(); loadServedToday() }
      )
      .subscribe()

    // KOT channel
    kotChannel = supabase
      .channel('mgr-kot')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kot_tickets' },
        (payload) => {
          if (payload.new?.status === 'ready') loadOrders()
        }
      )
      .subscribe()

    // Waiter profiles channel
    profilesChannel = supabase
      .channel('mgr-waiter-profiles')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'waiter_profiles', filter: `branch_id=eq.${branchId}` },
        () => { loadOnShiftWaiters(); loadLeaderboard() }
      )
      .subscribe()

    // Messages channel
    if (_myEmployeeId) {
      messagesChannel = supabase
        .channel('mgr-messages')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'manager_messages',
            filter: `receiver_employee_id=eq.${_myEmployeeId}` },
          (payload) => { messages.value.unshift(payload.new) }
        )
        .subscribe()
    }

    // Alerts channel
    alertsChannel = supabase
      .channel('mgr-alerts')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'manager_alerts', filter: `branch_id=eq.${branchId}` },
        () => loadAlerts()
      )
      .subscribe()
  }

  function cleanup() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (kotChannel) supabase.removeChannel(kotChannel)
    if (profilesChannel) supabase.removeChannel(profilesChannel)
    if (messagesChannel) supabase.removeChannel(messagesChannel)
    if (alertsChannel) supabase.removeChannel(alertsChannel)
    ordersChannel = null
    kotChannel = null
    profilesChannel = null
    messagesChannel = null
    alertsChannel = null
  }

  async function refresh() {
    loading.value = true
    try {
      await Promise.all([
        loadOnShiftWaiters(),
        loadOrders(),
        loadMessages(),
        loadAlerts(),
        loadHierarchy(),
        loadServedToday(),
      ])
      await loadLeaderboard()
    } finally {
      loading.value = false
    }
  }

  return {
    // state
    loading, onShiftWaiters, hierarchyMap, leaderboard,
    pendingOrders, acceptedOrders, readyOrders, delayedOrders,
    messages, alerts, servedTodayCount,
    // computed
    pendingOrderCount, totalActiveOrders, unreadMessageCount, unreadAlertCount,
    // actions
    initialize, cleanup, refresh,
    loadOnShiftWaiters, loadOrders, loadMessages, loadAlerts,
    loadHierarchy, loadLeaderboard, loadServedToday,
    sendMessage, markMessageRead, resolveAlert,
  }
})
