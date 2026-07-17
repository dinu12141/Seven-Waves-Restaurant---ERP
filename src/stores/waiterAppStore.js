/**
 * waiterAppStore.js
 * Central state for the Waiter PWA App Shell.
 * Wired directly to existing Supabase tables — no mock data.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'stores/auth'
import { useWaiterOrderStore } from 'stores/waiterOrderStore'
import { Notify } from 'quasar'

export const useWaiterAppStore = defineStore('waiterApp', () => {
  const authStore = useAuthStore()

  // ─── State ────────────────────────────────────────────────────────────────
  const loading = ref(false)
  const profile = ref(null) // waiter_profiles row
  const managerInfo = ref(null) // employee_hierarchy_assignments + manager employee
  const shiftInfo = ref(null) // current shift info
  const isOnShift = ref(false)
  const pendingOrders = ref([]) // status = 'pending_waiter'
  const myOrders = ref([]) // assigned_waiter_id = me
  const readyAlerts = ref([]) // kot_tickets status = 'ready' on my orders
  const notifications = ref([]) // waiter_notifications
  const pointsLedger = ref([]) // last 20 waiter_points_ledger entries

  // Real-time Sound settings
  const soundEnabled = ref(localStorage.getItem('waiter_sound_enabled') !== 'false')
  let audioCtx = null

  // Admin impersonation
  const impersonateProfileId = ref(null) // waiter_profiles.id to view as
  const allWaiters = ref([]) // all active waiter profiles (admin only)

  // Realtime channels
  let ordersChannel = null
  let notifsChannel = null
  let pointsChannel = null

  // ─── Computed ─────────────────────────────────────────────────────────────
  const unreadNotifCount = computed(() => notifications.value.filter((n) => !n.is_read).length)
  const pendingCount = computed(() => pendingOrders.value.length)
  // Only count ACTIVE orders (not served/completed) for the badge
  const myOrderCount = computed(
    () => myOrders.value.filter((o) => !['served', 'invoiced', 'paid', 'cancelled'].includes(o.status)).length
  )
  const readyCount = computed(() => readyAlerts.value.length)
  const currentPoints = computed(() => profile.value?.current_points ?? 0)
  const totalOrdersServed = computed(() => profile.value?.total_orders_served ?? 0)

  // ─── Initialize ───────────────────────────────────────────────────────────
  async function initialize() {
    loading.value = true
    try {
      // Guard: ensure branches are loaded before we use currentBranch in queries.
      if (!authStore.branches.length) {
        await authStore.fetchUserData()
      }
      // MUST load profile first — shiftInfo + orders depend on profile.employee_id
      await loadProfile()
      await Promise.all([loadShiftInfo(), loadPendingOrders(), loadMyOrders(), loadNotifications()])
      // loadReadyAlerts depends on myOrders — run after above
      loadReadyAlerts().catch(() => {})
      subscribeRealtime()

      // Initialize the waiterOrderStore in background — non-blocking
      const orderStore = useWaiterOrderStore()
      orderStore.initialize().catch(() => {})

      // Load all waiters for admin selector — non-blocking
      const roles = authStore.roles || []
      const isAdmin = roles.includes('admin') || roles.includes('manager')
      if (isAdmin) {
        loadAllWaiters().catch(() => {})
      }

      // ── Final admin/manager override ──
      // Ensure admin/manager is ALWAYS on-shift regardless of shift_assignments
      if (isAdmin && !isOnShift.value) {
        isOnShift.value = true
        shiftInfo.value = {
          id: null,
          date: null,
          shift_name: 'Admin Mode',
          shift_start: null,
          shift_end: null,
          branch_name: authStore.currentBranch?.name,
        }
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
      await Promise.all([loadShiftInfo(), loadMyOrders(), loadNotifications(), loadPendingOrders()])
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
        .maybeSingle()
      wp = data
    } else {
      // Normal waiter — load own profile
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('waiter_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      wp = data

      // FALLBACK: If no waiter_profiles entry exists, build a basic profile
      // from the employees table so the waiter home page still works
      if (!wp) {
        const { data: emp } = await supabase
          .from('employees')
          .select('id, full_name, employee_code, branch_id, profile_id')
          .eq('profile_id', user.id)
          .eq('is_active', true)
          .maybeSingle()

        if (emp) {
          wp = {
            id: null, // no waiter_profiles id
            user_id: user.id,
            employee_id: emp.id,
            branch_id: emp.branch_id,
            display_name: emp.full_name,
            waiter_code: emp.employee_code || '—',
            is_active: true,
            current_points: 0,
            total_orders_served: 0,
            _fromEmployeeFallback: true, // flag so we know this is synthetic
          }
        }
      }
    }

    profile.value = wp || null
    if (!wp) return

    // Load manager from hierarchy (skip if no real employee_id)
    if (wp.employee_id) {
      const { data: hier } = await supabase
        .from('employee_hierarchy_assignments')
        .select(
          `
          hierarchy_type,
          manager_employee:manager_employee_id ( id, full_name, employee_code )
        `,
        )
        .eq('employee_id', wp.employee_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      managerInfo.value = hier || null
    }

    // Load points ledger via dedicated action (skip for synthetic profiles)
    if (wp.id) {
      await loadPointsLedger(wp.id)
    }
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

  /**
   * Checks if currentTime falls within [start - buffer, end + buffer].
   * Handles overnight / midnight-crossing shifts (e.g. 22:00 → 06:00).
   *
   * Key rules:
   *   - "Overnight" means the shift CROSSES midnight (start > end in raw minutes).
   *   - A shift like 00:00→08:00 does NOT cross midnight — it's a regular shift.
   *   - Buffer is clamped so startMin never goes below 0 and endMin never exceeds 1439.
   */
  function _isWithinShiftTime(startTimeStr, endTimeStr, isOvernight) {
    if (!startTimeStr || !endTimeStr) return true // can't determine, assume on shift

    const BUFFER_MINUTES = 30
    const DAY = 1440 // minutes in a day

    // IMPORTANT: Shift times are stored in Asia/Colombo timezone.
    // We must compare using Asia/Colombo local time, NOT browser UTC time.
    const now = new Date()
    let currentMinutes
    try {
      // Use Intl to get Sri Lanka local time reliably
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Colombo',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      })
      const parts = formatter.formatToParts(now)
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0')
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0')
      currentMinutes = hour * 60 + minute
    } catch {
      // Fallback: use browser local time (works if browser is in SL timezone)
      currentMinutes = now.getHours() * 60 + now.getMinutes()
    }

    const [sh, sm] = startTimeStr.split(':').map(Number)
    const [eh, em] = endTimeStr.split(':').map(Number)
    const rawStart = sh * 60 + sm
    const rawEnd = eh * 60 + em

    // Auto-detect overnight: shift crosses midnight when end <= start
    // e.g. Evening 16:00→00:00 (960 > 0) or 22:00→06:00 (1320 > 360)
    // But NOT 00:00→08:00 (0 < 480)
    const crossesMidnight = isOvernight || (rawEnd <= rawStart && rawStart !== rawEnd)

    if (crossesMidnight) {
      // Overnight shift spans two calendar days.
      const shiftStart = rawStart - BUFFER_MINUTES
      const shiftEnd = rawEnd + DAY + BUFFER_MINUTES

      // Normalize current time: if before raw start, treat as next-day
      const cur = currentMinutes < rawStart ? currentMinutes + DAY : currentMinutes

      return cur >= shiftStart && cur <= shiftEnd
    }

    // Normal daytime shift — clamp buffer so we don't go negative
    const startMin = Math.max(0, rawStart - BUFFER_MINUTES)
    const endMin = Math.min(DAY - 1, rawEnd + BUFFER_MINUTES)

    return currentMinutes >= startMin && currentMinutes <= endMin
  }

  /**
   * Helper: Get today's + yesterday's date in Sri Lanka timezone (YYYY-MM-DD).
   * IMPORTANT: We must use Asia/Colombo, NOT UTC, because shift assignments
   * are created by HR using local dates. At 01:00 AM SL time, UTC is still
   * the PREVIOUS day, which would cause shift lookups to fail.
   */
  function _getSriLankaDate() {
    const now = new Date()
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const today = fmt.format(now) // 'YYYY-MM-DD'

      // Yesterday for overnight shift lookups
      const yesterday = new Date(now.getTime() - 86400000)
      const yesterdayStr = fmt.format(yesterday)

      return { today, yesterday: yesterdayStr }
    } catch {
      // Fallback to browser local time
      const pad = (n) => String(n).padStart(2, '0')
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const yesterday = new Date(now.getTime() - 86400000)
      const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`
      return { today, yesterday: yStr }
    }
  }

  async function loadShiftInfo() {
    // ── Admin / Manager bypass: always on shift ──
    const roles = authStore.roles || []
    if (roles.includes('admin') || roles.includes('manager')) {
      isOnShift.value = true
      shiftInfo.value = {
        id: null,
        date: null,
        shift_name: 'Admin Mode',
        shift_start: null,
        shift_end: null,
        branch_name: authStore.currentBranch?.name,
      }
      return
    }

    // Wait for profile to be available (it loads in parallel)
    // If not available, do a quick lookup
    let employeeId = profile.value?.employee_id

    if (!employeeId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Try waiter_profiles first
      const { data: wp } = await supabase
        .from('waiter_profiles')
        .select('employee_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (wp?.employee_id) {
        employeeId = wp.employee_id
      } else {
        // FALLBACK: Look up employee from employees table via profile_id
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('profile_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
        if (emp?.id) {
          employeeId = emp.id
        }
      }

      if (!employeeId) return
    }

    // ── Use Sri Lanka local date, NOT UTC ──
    const { today, yesterday } = _getSriLankaDate()

    // Query today's AND yesterday's assignments (yesterday covers overnight shifts
    // that started last evening and continue into today)
    let query = supabase
      .from('shift_assignments')
      .select(
        `
        id, assignment_date, status,
        shifts ( id, name, start_time, end_time, is_overnight )
      `,
      )
      .eq('employee_id', employeeId)
      .in('assignment_date', [today, yesterday])
      .in('status', ['scheduled', 'active', 'present'])

    // Filter by branch if available (not critical — employee_id is sufficient)
    const branchId = authStore.currentBranch?.id
    if (branchId) query = query.eq('branch_id', branchId)

    const { data: assignments, error } = await query

    if (error && error.code !== 'PGRST116') {
      console.warn('[WaiterApp] loadShiftInfo error:', error.message)
    }

    // Find the first assignment whose shift time range covers NOW
    const activeAssignment = (assignments || []).find((sa) => {
      return _isWithinShiftTime(
        sa.shifts?.start_time,
        sa.shifts?.end_time,
        sa.shifts?.is_overnight || false,
      )
    })

    if (activeAssignment) {
      shiftInfo.value = {
        id: activeAssignment.id,
        date: activeAssignment.assignment_date,
        shift_name: activeAssignment.shifts?.name,
        shift_start: activeAssignment.shifts?.start_time,
        shift_end: activeAssignment.shifts?.end_time,
        branch_name: authStore.currentBranch?.name,
      }
      isOnShift.value = true
    } else {
      // Check if there's at least a today assignment (even if outside shift hours)
      const todayAssignment = (assignments || []).find((sa) => sa.assignment_date === today)
      if (todayAssignment) {
        shiftInfo.value = {
          id: todayAssignment.id,
          date: todayAssignment.assignment_date,
          shift_name: todayAssignment.shifts?.name,
          shift_start: todayAssignment.shifts?.start_time,
          shift_end: todayAssignment.shifts?.end_time,
          branch_name: authStore.currentBranch?.name,
        }
        isOnShift.value = false
      } else {
        shiftInfo.value = null
        isOnShift.value = false
      }
    }
  }

  // ─── Orders ───────────────────────────────────────────────────────────────
  async function loadPendingOrders() {
    // Primary: use authStore.currentBranch. Fallback: use the waiter profile's branch_id.
    let branchId = authStore.currentBranch?.id
    if (!branchId && profile.value?.branch_id) {
      branchId = profile.value.branch_id
    }
    if (!branchId) return

    const { data } = await supabase
      .from('orders')
      .select(
        `
        id, order_number, status, created_at, table_id,
        restaurant_tables ( table_number ),
        order_items ( id, quantity, unit_price, total_price, menu_items ( name, base_price ) )
      `,
      )
      .eq('branch_id', branchId)
      .eq('status', 'pending_waiter')
      .is('assigned_waiter_id', null)
      .order('created_at', { ascending: true })

    pendingOrders.value = (data || []).map((o) => ({
      ...o,
      table_number: o.restaurant_tables?.table_number || null,
    }))
  }

  async function loadMyOrders() {
    // Use impersonated waiter's user_id if set, else current user
    let userId = profile.value?.user_id
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      userId = user?.id
    }
    if (!userId) return

    const { data } = await supabase
      .from('orders')
      .select(
        `
        id, order_number, status, created_at, table_id, accepted_at, total_amount,
        restaurant_tables ( table_number ),
        order_items ( id, quantity, unit_price, total_price, status, notes, menu_items ( name, base_price ) ),
        kot_tickets ( id, status, kot_number, kitchen_id, kitchens ( name ) )
      `,
      )
      .eq('assigned_waiter_id', userId)
      .in('status', ['accepted', 'sent_to_kitchen', 'preparing', 'ready', 'served'])
      .order('created_at', { ascending: false })
      .limit(30)

    myOrders.value = (data || []).map((o) => ({
      ...o,
      table_number: o.restaurant_tables?.table_number || null,
    }))
  }

  // ─── Ready Alerts ─────────────────────────────────────────────────────────
  async function loadReadyAlerts() {
    if (!myOrders.value.length) return

    const orderIds = myOrders.value.map((o) => o.id)
    const { data } = await supabase
      .from('kot_tickets')
      .select(
        `
        id, status, batch_number, created_at,
        order_id,
        kitchens ( name )
      `,
      )
      .in('order_id', orderIds)
      .eq('status', 'ready')
      .order('created_at', { ascending: true })

    readyAlerts.value = data || []
  }

  // ─── Notifications ────────────────────────────────────────────────────────
  async function loadNotifications() {
    if (!profile.value) {
      // profile may not be loaded yet; re-fetch user_id
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: wp } = await supabase
        .from('waiter_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
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
    notifications.value = notifications.value.map((n) =>
      n.id === id ? { ...n, is_read: true } : n,
    )
  }

  async function markAllNotifsRead() {
    if (!profile.value) return
    await supabase
      .from('waiter_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('waiter_profile_id', profile.value.id)
      .eq('is_read', false)
    notifications.value = notifications.value.map((n) => ({ ...n, is_read: true }))
  }

  // ─── Accept Order ─────────────────────────────────────────────────────────
  async function acceptOrder(orderId, unavailableItemIds = null) {
    if (!isOnShift.value) throw new Error('You cannot accept orders while off shift.')
    // Route through waiterOrderStore so unavailableItemIds are forwarded to the
    // accept_order_as_waiter RPC (marks items unavailable before KOT generation).
    const orderStore = useWaiterOrderStore()
    const result = await orderStore.acceptOrder(orderId, unavailableItemIds)
    if (!result.success) throw new Error(result.error || 'Accept failed')
    await Promise.all([loadPendingOrders(), loadMyOrders()])
    return result.data
  }

  // ─── Mark Served ──────────────────────────────────────────────────────────
  async function markServed(orderId) {
    if (!isOnShift.value) throw new Error('You cannot mark orders while off shift.')
    const { data, error } = await supabase.rpc('process_waiter_mark_served', {
      p_order_id: orderId,
    })
    if (error) throw error
    if (data?.success === false) throw new Error(data.error || 'Mark served failed')
    await Promise.all([loadMyOrders(), loadReadyAlerts(), loadProfile()])
    return data
  }

  // ─── Realtime ─────────────────────────────────────────────────────────────
  let kotChannel = null

  /**
   * Initialize AudioContext on user gesture to 'unlock' audio on mobile.
   */
  function primeAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }
  }

  function _playToneSequence(tones) {
    if (!soundEnabled.value) return
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const playTone = (freq, type, startTime, dur, vol = 0.5) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = type
        osc.frequency.setValueAtTime(freq, startTime)
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
        osc.start(startTime)
        osc.stop(startTime + dur)
      }
      const doPlay = () => {
        const now = audioCtx.currentTime
        tones.forEach(([freq, type, offset, dur, vol]) => playTone(freq, type, now + offset, dur, vol))
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().then(doPlay)
      else doPlay()
    } catch {
      /* silent fail */
    }
  }

  // Urgent ringing: used for NEW customer orders
  function _playNewOrderSound() {
    _playToneSequence([
      [880, 'square', 0,   0.15, 0.08],
      [880, 'square', 0.2, 0.15, 0.1],
      [1320, 'square', 0.4, 0.3,  0.12],
    ])
  }

  // Bright double-ding: used for KOT READY alerts
  function _playKotReadySound() {
    _playToneSequence([
      [1046.5, 'triangle', 0,   0.2, 0.2],
      [1318.5, 'triangle', 0.2, 0.4, 0.2],
    ])
  }

  // Keep alias so calling code is backward-compatible
  function _playAlertSound() { _playNewOrderSound() }

  function toggleSound() {
    soundEnabled.value = !soundEnabled.value
    localStorage.setItem('waiter_sound_enabled', String(soundEnabled.value))
    if (soundEnabled.value) {
      primeAudio()
      _playKotReadySound()
    }
  }

  function subscribeRealtime() {
    let branchId = authStore.currentBranch?.id
    if (!branchId && profile.value?.branch_id) {
      branchId = profile.value.branch_id
    }
    if (!branchId) return

    // Orders channel — covers pending + assigned order changes
    ordersChannel = supabase
      .channel(`waiter-app-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        (payload) => {
          const newRow = payload.new

          if (newRow.status === 'pending_waiter' && !newRow.assigned_waiter_id) {
            _playAlertSound()
            loadPendingOrders()

            // Push a persistent alert to waiterOrderStore so the Alerts page shows it
            const pushAlert = (tableName) => {
              try {
                const orderStore = useWaiterOrderStore()
                if (!orderStore.newOrderAlerts.find((a) => a.order_id === newRow.id)) {
                  orderStore.newOrderAlerts.unshift({
                    id: `new-${newRow.id}`,
                    order_id: newRow.id,
                    order_number: newRow.order_number,
                    table_name: tableName,
                    created_at: newRow.created_at,
                  })
                }
              } catch {
                /* orderStore not ready */
              }

              // 🔔 Fire toast
              Notify.create({
                type: 'info',
                icon: 'room_service',
                color: 'blue-9',
                textColor: 'white',
                message: `🛎️ New Order from ${tableName}!`,
                caption: newRow.order_number
                  ? `Order #${newRow.order_number} — Tap to view`
                  : 'Tap Alerts to view',
                position: 'top',
                timeout: 10000,
                dense: true,
                classes: 'text-weight-bold',
                actions: [{ icon: 'close', color: 'white', size: 'sm' }],
              })
              // Vibrate device for physical alert (new order: long urgent pattern)
              if (navigator.vibrate) navigator.vibrate([400, 100, 400, 100, 400])
            }

            if (newRow.table_id) {
              supabase
                .from('restaurant_tables')
                .select('table_number')
                .eq('id', newRow.table_id)
                .single()
                .then(({ data }) => {
                  const tNum = data?.table_number
                    ? data.table_number.replace('Table', '').trim()
                    : ''
                  pushAlert(tNum ? `Table ${tNum}` : 'a Table')
                })
            } else {
              pushAlert(newRow.order_type === 'takeaway' ? 'Takeaway' : 'a Table')
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => {
          loadPendingOrders()
          loadMyOrders()
        },
      )
      .subscribe()

    // KOT channel — kitchen-ready alerts
    // Channel name is branch-scoped so cross-branch users share no broadcast state.
    // kot_tickets has no branch_id column so postgres_changes filter can't be used;
    // RLS on kot_tickets + the myOrders client-side check below are the guards.
    kotChannel = supabase
      .channel(`waiter-app-kot-${branchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kot_tickets' },
        (payload) => {
          if (payload.new?.status === 'ready') {
            // Check this KOT belongs to one of MY orders before alerting
            const myOrder = myOrders.value.find((o) => o.id === payload.new.order_id)
            if (myOrder) {
              _playKotReadySound()
              Notify.create({
                type: 'positive',
                icon: 'task_alt',
                color: 'green-9',
                textColor: 'white',
                message: `🍽️ Order #${myOrder.order_number || ''} is READY!`,
                caption: `Table ${myOrder.restaurant_tables?.table_number || myOrder.table_number || '—'} — Go collect & serve`,
                position: 'top',
                timeout: 8000,
                classes: 'text-weight-bold',
                actions: [{ icon: 'close', color: 'white', size: 'sm' }],
              })
              // Vibrate the device for physical alert
              if (navigator.vibrate) navigator.vibrate([200, 100, 200])
            }
            loadReadyAlerts()
          }
        },
      )
      .subscribe()

    // Subscribe notifications + points only when a real waiter_profiles id exists.
    // Synthetic/fallback profiles (id=null from employee-only lookup) have no
    // waiter_notifications rows — subscribing would silently match nothing anyway.
    const waiterProfileId = profile.value?.id
    if (waiterProfileId) {
      // Notifications channel — pushed by triggers
      notifsChannel = supabase
        .channel(`waiter-app-notifs-${waiterProfileId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'waiter_notifications',
            filter: `waiter_profile_id=eq.${waiterProfileId}`,
          },
          (payload) => {
            notifications.value.unshift(payload.new)
          },
        )
        .subscribe()

      // Points ledger channel — realtime balance updates
      pointsChannel = supabase
        .channel(`waiter-app-points-${waiterProfileId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'waiter_points_ledger',
            filter: `waiter_profile_id=eq.${waiterProfileId}`,
          },
          (payload) => {
            // Prepend new entry immediately for instant feedback
            pointsLedger.value.unshift(payload.new)
            // Re-fetch profile so current_points reflects DB trigger result
            loadProfile()
          },
        )
        .subscribe()
    }
  }

  function cleanup() {
    if (ordersChannel) supabase.removeChannel(ordersChannel)
    if (notifsChannel) supabase.removeChannel(notifsChannel)
    if (kotChannel) supabase.removeChannel(kotChannel)
    if (pointsChannel) supabase.removeChannel(pointsChannel)
    // Also cleanup the waiterOrderStore
    try {
      const orderStore = useWaiterOrderStore()
      orderStore.cleanup()
    } catch {
      /* ignore if not initialized */
    }
  }

  async function refresh() {
    const orderStore = useWaiterOrderStore()
    await Promise.all([
      loadPendingOrders(),
      loadMyOrders(),
      loadNotifications(),
      loadProfile(),
      loadShiftInfo(),
      orderStore.fetchPendingOrders(),
      orderStore.fetchMyOrders(),
    ])
    await Promise.all([loadReadyAlerts(), loadPointsLedger()])
  }

  return {
    // state
    loading,
    profile,
    managerInfo,
    shiftInfo,
    isOnShift,
    pendingOrders,
    myOrders,
    readyAlerts,
    notifications,
    pointsLedger,
    impersonateProfileId,
    allWaiters,
    // computed
    unreadNotifCount,
    pendingCount,
    myOrderCount,
    readyCount,
    currentPoints,
    totalOrdersServed,
    soundEnabled,
    // actions
    initialize,
    initializeAs,
    refresh,
    cleanup,
    acceptOrder,
    markServed,
    markNotificationRead,
    markAllNotifsRead,
    loadPendingOrders,
    loadMyOrders,
    loadReadyAlerts,
    loadPointsLedger,
    loadAllWaiters,
    toggleSound,
    primeAudio,
  }
})
