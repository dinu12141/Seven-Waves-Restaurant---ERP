import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'
import { kitchenStartKot, kitchenMarkReady } from 'src/services/kotDispatchService'

/**
 * Kitchen Display Store
 *
 * Manages KOT tickets for a selected kitchen station.
 * Provides realtime subscription filtered by kitchen_id,
 * status transition actions, and KOT print logging.
 */
export const useKitchenDisplayStore = defineStore('kitchenDisplay', () => {
  const authStore = useAuthStore()

  // ── State ──────────────────────────────────────────────────
  const tickets = ref([])
  const kitchens = ref([]) // available kitchens for this branch
  const selectedKitchenId = ref(null)
  const lockedKitchenId = ref(null) // set when user is a kitchen-role user with assigned kitchen
  const loading = ref(false)
  const isConnected = ref(false)
  const printing = ref(null) // ticket ID currently printing

  // Kitchen-specific new ticket alert (consumed by KitchenPage for notifications)
  // { id, tableNumber, orderNumber, items: [{name, qty}], kitchenName, timestamp }
  const newTicketAlert = ref(null)

  // Subscriptions
  let kotChannel = null
  let timerInterval = null

  // ── Getters ────────────────────────────────────────────────
  const newTickets = computed(() =>
    tickets.value.filter((t) => ['created', 'pending', 'accepted'].includes(t.status)),
  )
  const preparingTickets = computed(() => tickets.value.filter((t) => t.status === 'preparing'))
  const readyTickets = computed(() =>
    [...tickets.value]
      .filter((t) => t.status === 'ready')
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
  )
  const totalActive = computed(() => tickets.value.length)

  const selectedKitchen = computed(() =>
    kitchens.value.find((k) => k.id === selectedKitchenId.value),
  )

  // True when the user is a kitchen-role user locked to a specific kitchen
  const isKitchenLocked = computed(() => !!lockedKitchenId.value)

  // ── Initialize ─────────────────────────────────────────────

  async function initialize() {
    loading.value = true
    try {
      // Ensure branch is ready (wait up to 2 seconds if needed)
      let branchId = authStore.currentBranch?.id
      if (!branchId) {
        // Simple poll/wait
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 500))
          branchId = authStore.currentBranch?.id
          if (branchId) break
        }
      }

      await fetchKitchens()

      // Check if this user is a kitchen-role user with an assigned kitchen
      const assignedKitchenId = authStore.profile?.kitchen_id
      if (assignedKitchenId) {
        // Lock user to their assigned kitchen — no switching allowed
        lockedKitchenId.value = assignedKitchenId
        selectedKitchenId.value = assignedKitchenId
      } else if (kitchens.value.length > 0 && !selectedKitchenId.value) {
        // Admin/Manager: auto-select first kitchen
        selectedKitchenId.value = kitchens.value[0].id
      }

      if (selectedKitchenId.value) {
        await fetchTickets()
        subscribeToTickets()
      }
      startTimer()
    } catch (e) {
      console.error('[KDS] Init error:', e)
    } finally {
      loading.value = false
    }
  }

  // ── Fetch Kitchens ─────────────────────────────────────────

  async function fetchKitchens() {
    const branchId = authStore.currentBranch?.id
    if (!branchId) return

    const { data, error } = await supabase
      .from('kitchens')
      .select('id, name, branch_id')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('[KDS] Fetch kitchens error:', error)
      return
    }
    kitchens.value = data || []
  }

  // ── Switch Kitchen ─────────────────────────────────────────

  async function selectKitchen(kitchenId) {
    selectedKitchenId.value = kitchenId
    await fetchTickets()
    subscribeToTickets()
  }

  // ── Fetch KOT Tickets ─────────────────────────────────────

  async function fetchTickets() {
    if (!selectedKitchenId.value) return

    const isCashierDisplay = selectedKitchen.value?.name?.trim().toUpperCase() === 'CASHIER'
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

    // Fetch today's active tickets (new + preparing) AND all ready tickets (any date, not yet dismissed)
    // We do two queries and merge to avoid the date filter excluding old ready tickets
    const selectFields = `
      id,
      order_id,
      kitchen_id,
      kot_number,
      status,
      printed_at,
      accepted_at,
      completed_at,
      created_at,
      updated_at,
      order:orders!inner (
        order_number,
        order_type,
        order_source,
        notes,
        status,
        customer_name,
        table:restaurant_tables ( table_number ),
        waiter:profiles!orders_assigned_waiter_id_fkey ( full_name )
      ),
      kot_items (
        id,
        quantity,
        notes,
        status,
        order_item:order_items (
          menu_item:menu_items ( name )
        )
      ),
      kitchen:kitchens ( name )
    `

    // Query 1: Today's non-ready tickets (new/preparing)
    let todayQuery = supabase
      .from('kot_tickets')
      .select(selectFields)
      .in('status', ['created', 'pending', 'accepted', 'preparing'])
      .is('completed_at', null)
      .gte('created_at', todayStart)
      .not('order.status', 'eq', 'pending_waiter')
      .order('created_at', { ascending: true })

    // Query 2: ALL ready tickets that haven't been dismissed (completed_at IS NULL)
    let readyQuery = supabase
      .from('kot_tickets')
      .select(selectFields)
      .eq('status', 'ready')
      .is('completed_at', null)
      .not('order.status', 'eq', 'pending_waiter')
      .order('created_at', { ascending: false })

    if (!isCashierDisplay) {
      todayQuery = todayQuery.eq('kitchen_id', selectedKitchenId.value)
      readyQuery = readyQuery.eq('kitchen_id', selectedKitchenId.value)
    }

    const [todayResult, readyResult] = await Promise.all([todayQuery, readyQuery])

    if (todayResult.error) {
      console.error('[KDS] Fetch today tickets error:', todayResult.error)
    }
    if (readyResult.error) {
      console.error('[KDS] Fetch ready tickets error:', readyResult.error)
    }

    // Merge and deduplicate
    const allData = [...(todayResult.data || []), ...(readyResult.data || [])]
    const uniqueMap = new Map()
    allData.forEach(t => uniqueMap.set(t.id, t))
    const merged = Array.from(uniqueMap.values())

    console.log('[KDS] Fetched tickets: today=%d, ready=%d, merged=%d',
      todayResult.data?.length || 0, readyResult.data?.length || 0, merged.length)
    tickets.value = merged.map(enrichTicket)
  }

  // ── Realtime ───────────────────────────────────────────────

  function subscribeToTickets() {
    if (kotChannel) supabase.removeChannel(kotChannel)
    if (!selectedKitchenId.value) return

    const isCashierDisplay = selectedKitchen.value?.name?.trim().toUpperCase() === 'CASHIER'

    // Build the realtime config — omit filter entirely for CASHIER display
    const kotTicketConfig = {
      event: '*',
      schema: 'public',
      table: 'kot_tickets',
    }
    if (!isCashierDisplay) {
      kotTicketConfig.filter = `kitchen_id=eq.${selectedKitchenId.value}`
    }

    kotChannel = supabase
      .channel(`kds-${selectedKitchenId.value}`)
      .on('postgres_changes', kotTicketConfig, (payload) => {
        handleTicketChange(payload)
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_dispatches',
          filter: `target_code=eq.KITCHEN`,
        },
        (payload) => {
          if (payload.new && payload.new.kot_id) {
            refreshSingleTicket(payload.new.kot_id)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          // If an order status changes (e.g. from pending_waiter to accepted), we need to refresh tickets for that order to show up
          if (payload.new) {
            // Fetch KOTs for this order and refresh them locally
            refreshTicketsForOrder(payload.new.id)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_items',
        },
        (payload) => {
          // Refresh the parent ticket if items change
          const kotId = payload.new?.kot_id || payload.old?.kot_id
          if (kotId) refreshSingleTicket(kotId)
        },
      )
      .subscribe((status) => {
        isConnected.value = status === 'SUBSCRIBED'
      })
  }

  function handleTicketChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload

    if (eventType === 'INSERT') {
      // New KOT created — could be 'created' or 'accepted' status
      if (
        ['created', 'pending', 'accepted', 'preparing', 'ready'].includes(newRow.status) &&
        !newRow.completed_at
      ) {
        // 🔔 This is a NEW ticket for THIS kitchen — trigger alert after fetching details
        refreshSingleTicket(newRow.id, true)
      }
    }

    if (eventType === 'UPDATE') {
      const idx = tickets.value.findIndex((t) => t.id === newRow.id)

      // Remove if completed/cancelled
      if (newRow.status === 'cancelled' || newRow.completed_at) {
        if (idx !== -1) tickets.value.splice(idx, 1)
        return
      }

      // Update status in place
      if (idx !== -1) {
        tickets.value[idx] = {
          ...tickets.value[idx],
          status: newRow.status,
          printed_at: newRow.printed_at,
          accepted_at: newRow.accepted_at,
          updated_at: newRow.updated_at,
        }
      } else if (['created', 'pending', 'accepted', 'preparing', 'ready'].includes(newRow.status)) {
        // Not in list yet — fetch full details
        refreshSingleTicket(newRow.id)
      }
    }

    if (eventType === 'DELETE') {
      const id = oldRow?.id
      if (id) {
        tickets.value = tickets.value.filter((t) => t.id !== id)
      }
    }
  }

  // Called when an order updates (e.g. pending_waiter -> accepted)
  async function refreshTicketsForOrder(orderId) {
    if (!selectedKitchenId.value) return
    const isCashierDisplay = selectedKitchen.value?.name?.trim().toUpperCase() === 'CASHIER'

    let query = supabase.from('kot_tickets').select('id').eq('order_id', orderId)

    if (!isCashierDisplay) {
      query = query.eq('kitchen_id', selectedKitchenId.value)
    }

    const { data } = await query

    if (data) {
      data.forEach((t) => refreshSingleTicket(t.id))
    }
  }

  async function refreshSingleTicket(kotId, isNewAlert = false) {
    const { data, error } = await supabase
      .from('kot_tickets')
      .select(
        `
        id,
        order_id,
        kitchen_id,
        kot_number,
        status,
        printed_at,
        accepted_at,
        completed_at,
        created_at,
        updated_at,
        order:orders!inner (
          order_number,
          order_type,
          order_source,
          notes,
          status,
          customer_name,
          table:restaurant_tables ( table_number ),
          waiter:profiles!orders_assigned_waiter_id_fkey ( full_name )
        ),
        kot_items (
          id,
          quantity,
          notes,
          status,
          order_item:order_items (
            menu_item:menu_items ( name )
          )
        ),
        kitchen:kitchens ( name )
      `,
      )
      .eq('id', kotId)
      .single()

    if (error || !data) return

    // Today filter check — only for non-ready tickets
    // Ready tickets should always show regardless of creation date
    if (data.status !== 'ready') {
      const todayStart = new Date().setHours(0, 0, 0, 0)
      const ticketDate = new Date(data.created_at).getTime()
      if (ticketDate < todayStart) return
    }

    // 🔒 KITCHEN GUARD — Only add/update if it belongs to OUR kitchen
    const isCashierDisplay = selectedKitchen.value?.name?.trim().toUpperCase() === 'CASHIER'
    if (!isCashierDisplay && data.kitchen_id !== selectedKitchenId.value) return
    if (
      data.completed_at ||
      data.status === 'cancelled' ||
      data.order?.status === 'pending_waiter'
    ) {
      tickets.value = tickets.value.filter((t) => t.id !== kotId)
      return
    }

    const enriched = enrichTicket(data)
    const idx = tickets.value.findIndex((t) => t.id === kotId)
    if (idx !== -1) {
      tickets.value[idx] = enriched
    } else {
      tickets.value.push(enriched)

      // 🔔 Fire kitchen-specific alert for genuinely NEW tickets
      if (isNewAlert && ['created', 'pending', 'accepted'].includes(data.status)) {
        const itemSummary = (data.kot_items || []).map(ki => ({
          name: ki.order_item?.menu_item?.name || 'Item',
          qty: ki.quantity
        }))
        newTicketAlert.value = {
          id: data.id,
          kotNumber: data.kot_number,
          tableNumber: data.order?.table?.table_number || '—',
          orderNumber: data.order?.order_number || '?',
          kitchenName: data.kitchen?.name || selectedKitchen.value?.name || 'Kitchen',
          items: itemSummary,
          timestamp: Date.now()
        }
        // Play urgent repeating sound alert
        startAlertRepeating()
      }
    }
  }

  // ── Actions ────────────────────────────────────────────────

  /**
   * Accept ticket: created → preparing
   */
  async function acceptTicket(ticketId) {
    const idx = tickets.value.findIndex((t) => t.id === ticketId)
    if (idx === -1) return { success: false, error: 'Ticket not found' }

    // Optimistic update
    const prev = tickets.value[idx].status
    tickets.value[idx].status = 'preparing'

    // ERP RPC Call: updates kot_tickets AND parent order table
    const result = await kitchenStartKot(ticketId)

    if (!result.success) {
      tickets.value[idx].status = prev
      return { success: false, error: result.error || 'Failed to accept ticket' }
    }
    return { success: true }
  }

  /**
   * Mark ready: preparing → ready
   * NOTE: Do NOT set completed_at here — that removes the ticket from KDS.
   * completed_at is set when the waiter marks the order as served.
   */
  async function markReady(ticketId) {
    const idx = tickets.value.findIndex((t) => t.id === ticketId)
    if (idx === -1) return { success: false, error: 'Ticket not found' }

    const prev = tickets.value[idx].status
    tickets.value[idx].status = 'ready'

    // ERP RPC Call: updates kot_tickets AND parent order table (if all KOTs are ready)
    const result = await kitchenMarkReady(ticketId)

    if (!result.success) {
      tickets.value[idx].status = prev
      return { success: false, error: result.error || 'Failed to mark ready' }
    }
    return { success: true }
  }

  /**
   * Complete / dismiss a "ready" ticket (called from kitchen after serving)
   * This sets completed_at to remove it from the KDS board.
   */
  async function dismissTicket(ticketId) {
    const { error } = await supabase
      .from('kot_tickets')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', ticketId)

    if (!error) {
      tickets.value = tickets.value.filter((t) => t.id !== ticketId)
    }
    return { success: !error, error: error?.message }
  }

  /**
   * Dismiss ALL ready tickets at once (clear the ready column)
   */
  async function dismissAllReady() {
    const readyIds = readyTickets.value.map(t => t.id)
    if (readyIds.length === 0) return { success: true }

    const { error } = await supabase
      .from('kot_tickets')
      .update({ completed_at: new Date().toISOString() })
      .in('id', readyIds)

    if (error) {
      console.error('[KDS] dismissAllReady error:', error)
    }

    if (!error) {
      tickets.value = tickets.value.filter(t => t.status !== 'ready')
    }
    return { success: !error, error: error?.message }
  }

  // ── Print KOT ──────────────────────────────────────────────

  /**
   * Logs a print event and updates printed_at on the ticket.
   * If the ticket was already printed, this is a "reprint".
   */
  async function printKot(ticketId) {
    const ticket = tickets.value.find((t) => t.id === ticketId)
    if (!ticket) return { success: false, error: 'Ticket not found' }

    const userId = authStore.user?.id
    printing.value = ticketId

    try {
      // 1. Insert print log
      const { error: logErr } = await supabase.from('kot_print_logs').insert({
        kot_id: ticketId,
        printed_by: userId,
      })
      if (logErr) throw logErr

      // 2. Update printed_at on the ticket (first print only; reprints still log)
      if (!ticket.printed_at) {
        await supabase
          .from('kot_tickets')
          .update({ printed_at: new Date().toISOString() })
          .eq('id', ticketId)
        ticket.printed_at = new Date().toISOString()
      }

      // 3. Increment local print count
      ticket.printCount = (ticket.printCount || 0) + 1

      return { success: true, isReprint: ticket.printCount > 1 }
    } catch (e) {
      console.error('[KDS] Print error:', e)
      return { success: false, error: e.message }
    } finally {
      printing.value = null
    }
  }

  // ── Sound Alert System ─────────────────────────────────────
  // Persistent AudioContext — created once, resumed on user gesture
  let _audioCtx = null
  let _alertRepeatTimer = null
  let _alertRepeatCount = 0
  const MAX_ALERT_REPEATS = 3 // ring 3 times if not acknowledged

  function getAudioContext() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    return _audioCtx
  }

  /**
   * Warm up AudioContext on ANY user gesture (click, keypress, touch).
   * Must be called once from onMounted in KitchenPage.
   */
  function warmUpAudio() {
    const unlock = () => {
      const ctx = getAudioContext()
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('[KDS] 🔊 AudioContext unlocked — sound alerts active')
        })
      }
      // Play a silent buffer to fully unlock on iOS/Safari
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
    }
    // Attach to common user gestures
    ;['click', 'touchstart', 'keydown'].forEach(evt => {
      document.addEventListener(evt, unlock, { once: true })
    })
  }

  function playKitchenAlert() {
    try {
      const audioCtx = getAudioContext()

      // If suspended, force resume
      if (audioCtx.state === 'suspended') {
        audioCtx.resume()
      }

      const playTone = (freq, type, startTime, dur, vol = 0.8) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.type = type
        osc.frequency.setValueAtTime(freq, startTime)
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02)
        gain.gain.setValueAtTime(vol, startTime + dur * 0.7)
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur)
        osc.start(startTime)
        osc.stop(startTime + dur)
      }

      const now = audioCtx.currentTime
      // LOUD urgent kitchen bell: 3 rising tones + double-ding
      playTone(880, 'square', now, 0.2, 0.9)            // A5 (square = louder)
      playTone(1108.73, 'square', now + 0.2, 0.2, 0.9)  // C#6
      playTone(1318.51, 'sine', now + 0.4, 0.5, 1.0)    // E6 (long, max volume)
      // Second ding after pause
      playTone(880, 'square', now + 1.0, 0.15, 0.7)
      playTone(1318.51, 'sine', now + 1.2, 0.5, 0.9)    // E6 repeat

      console.log('[KDS] 🔔 Kitchen alert sound played')
    } catch (e) {
      console.error('[KDS] Audio alert failed:', e)
    }
  }

  /**
   * Start repeating the alert sound until acknowledged or max repeats.
   * Called when a new KOT arrives.
   */
  function startAlertRepeating() {
    stopAlertRepeating()
    _alertRepeatCount = 0
    playKitchenAlert()
    _alertRepeatCount++

    _alertRepeatTimer = setInterval(() => {
      if (_alertRepeatCount >= MAX_ALERT_REPEATS) {
        stopAlertRepeating()
        return
      }
      playKitchenAlert()
      _alertRepeatCount++
    }, 2500) // repeat every 2.5 seconds
  }

  function stopAlertRepeating() {
    if (_alertRepeatTimer) {
      clearInterval(_alertRepeatTimer)
      _alertRepeatTimer = null
    }
    _alertRepeatCount = 0
  }

  function clearNewTicketAlert() {
    newTicketAlert.value = null
    stopAlertRepeating()
  }

  function enrichTicket(ticket) {
    return {
      ...ticket,
      tableNumber: ticket.order?.table?.table_number || '—',
      orderNumber: ticket.order?.order_number || '?',
      orderType: formatOrderType(ticket.order?.order_type),
      orderSource: ticket.order?.order_source || 'pos',
      orderNotes: ticket.order?.notes || '',
      waiterName: ticket.order?.waiter?.full_name || '',
      customerName: ticket.order?.customer_name || '',
      kitchenName: ticket.kitchen?.name || '',
      items: (ticket.kot_items || []).map((ki) => ({
        id: ki.id,
        name: ki.order_item?.menu_item?.name || 'Unknown Item',
        qty: ki.quantity,
        notes: ki.notes || '',
        status: ki.status,
      })),
      startTime: new Date(ticket.created_at).getTime(),
      timeElapsed: getTimeElapsed(ticket.created_at),
      printCount: 0, // Will be enriched if we count logs later
    }
  }

  function formatOrderType(type) {
    if (!type) return 'Dine-in'
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('-')
  }

  function getTimeElapsed(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 0) return '00:00'
    const mins = Math.floor(diff / 60000)
    const secs = Math.floor((diff % 60000) / 1000)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // ── Timer ──────────────────────────────────────────────────

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval)
    timerInterval = setInterval(() => {
      tickets.value.forEach((t) => {
        t.timeElapsed = getTimeElapsed(t.created_at)
      })
    }, 1000)
  }

  // ── Cleanup ────────────────────────────────────────────────

  function cleanup() {
    if (kotChannel) {
      supabase.removeChannel(kotChannel)
      kotChannel = null
    }
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    stopAlertRepeating()
    tickets.value = []
    isConnected.value = false
  }

  return {
    tickets,
    kitchens,
    selectedKitchenId,
    selectedKitchen,
    lockedKitchenId,
    isKitchenLocked,
    loading,
    isConnected,
    printing,
    newTicketAlert,
    newTickets,
    preparingTickets,
    readyTickets,
    totalActive,
    initialize,
    warmUpAudio,
    selectKitchen,
    fetchTickets,
    acceptTicket,
    markReady,
    dismissTicket,
    dismissAllReady,
    printKot,
    clearNewTicketAlert,
    cleanup,
  }
})
