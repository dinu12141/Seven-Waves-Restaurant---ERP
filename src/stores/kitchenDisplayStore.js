import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'
import { useAuthStore } from 'src/stores/auth'

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
  const loading = ref(false)
  const isConnected = ref(false)
  const printing = ref(null) // ticket ID currently printing

  // Subscriptions
  let kotChannel = null
  let timerInterval = null

  // ── Getters ────────────────────────────────────────────────
  const createdTickets = computed(() => tickets.value.filter((t) => t.status === 'created'))
  const preparingTickets = computed(() => tickets.value.filter((t) => t.status === 'preparing'))
  const readyTickets = computed(() => tickets.value.filter((t) => t.status === 'ready'))
  const totalActive = computed(() => tickets.value.length)

  const selectedKitchen = computed(() =>
    kitchens.value.find((k) => k.id === selectedKitchenId.value),
  )

  // ── Initialize ─────────────────────────────────────────────

  async function initialize() {
    loading.value = true
    try {
      await fetchKitchens()
      // Auto-select first kitchen
      if (kitchens.value.length > 0 && !selectedKitchenId.value) {
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
          table:restaurant_tables ( table_number )
        ),
        kot_items (
          id,
          quantity,
          notes,
          status,
          order_item:order_items (
            menu_item:menu_items ( name )
          )
        )
      `,
      )
      .eq('kitchen_id', selectedKitchenId.value)
      .in('status', ['created', 'preparing', 'ready'])
      .is('completed_at', null)
      .not('order.status', 'eq', 'pending_waiter')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[KDS] Fetch tickets error:', error)
      return
    }

    tickets.value = (data || []).map(enrichTicket)
  }

  // ── Realtime ───────────────────────────────────────────────

  function subscribeToTickets() {
    if (kotChannel) supabase.removeChannel(kotChannel)
    if (!selectedKitchenId.value) return

    kotChannel = supabase
      .channel(`kds-${selectedKitchenId.value}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kot_tickets',
          filter: `kitchen_id=eq.${selectedKitchenId.value}`,
        },
        (payload) => {
          handleTicketChange(payload)
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
      // New KOT created — could be 'created' status
      if (['created', 'preparing', 'ready'].includes(newRow.status) && !newRow.completed_at) {
        refreshSingleTicket(newRow.id)
      }
    }

    if (eventType === 'UPDATE') {
      const idx = tickets.value.findIndex((t) => t.id === newRow.id)

      // Remove if completed/cancelled
      if (newRow.completed_at || newRow.status === 'cancelled') {
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
      } else if (['created', 'preparing', 'ready'].includes(newRow.status)) {
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
    const { data } = await supabase
      .from('kot_tickets')
      .select('id')
      .eq('order_id', orderId)
      .eq('kitchen_id', selectedKitchenId.value)

    if (data) {
      data.forEach((t) => refreshSingleTicket(t.id))
    }
  }

  async function refreshSingleTicket(kotId) {
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
          table:restaurant_tables ( table_number )
        ),
        kot_items (
          id,
          quantity,
          notes,
          status,
          order_item:order_items (
            menu_item:menu_items ( name )
          )
        )
      `,
      )
      .eq('id', kotId)
      .single()

    if (error || !data) return

    // Only add/update if it belongs to our kitchen and is active
    if (data.kitchen_id !== selectedKitchenId.value) return
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

    const { error } = await supabase
      .from('kot_tickets')
      .update({
        status: 'preparing',
        accepted_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('status', 'created')

    if (error) {
      tickets.value[idx].status = prev
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  /**
   * Mark ready: preparing → ready
   */
  async function markReady(ticketId) {
    const idx = tickets.value.findIndex((t) => t.id === ticketId)
    if (idx === -1) return { success: false, error: 'Ticket not found' }

    const prev = tickets.value[idx].status
    tickets.value[idx].status = 'ready'

    const { error } = await supabase
      .from('kot_tickets')
      .update({
        status: 'ready',
        completed_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('status', 'preparing')

    if (error) {
      tickets.value[idx].status = prev
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  /**
   * Complete / dismiss a "ready" ticket
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

  // ── Helpers ────────────────────────────────────────────────

  function enrichTicket(ticket) {
    return {
      ...ticket,
      tableNumber: ticket.order?.table?.table_number || '—',
      orderNumber: ticket.order?.order_number || '?',
      orderType: formatOrderType(ticket.order?.order_type),
      orderSource: ticket.order?.order_source || 'pos',
      orderNotes: ticket.order?.notes || '',
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
    tickets.value = []
    isConnected.value = false
  }

  return {
    tickets,
    kitchens,
    selectedKitchenId,
    selectedKitchen,
    loading,
    isConnected,
    printing,
    createdTickets,
    preparingTickets,
    readyTickets,
    totalActive,
    initialize,
    selectKitchen,
    fetchTickets,
    acceptTicket,
    markReady,
    dismissTicket,
    printKot,
    cleanup,
  }
})
