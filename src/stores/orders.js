import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from 'src/boot/supabase'

/**
 * Pinia store — centralised order-lifecycle state.
 *
 * Holds orders, order items, KOT tickets, KOT items,
 * status logs, and restaurant table statuses.
 *
 * All collections use a Map keyed by UUID for O(1) lookups.
 */
export const useOrderStore = defineStore('orders', () => {
  // ── State ────────────────────────────────────────────────
  const orders = ref(new Map())
  const orderItems = ref(new Map())
  const kotTickets = ref(new Map())
  const kotItems = ref(new Map())
  const statusLogs = ref([])
  const tables = ref(new Map())
  const loading = ref(false)

  // ── Getters ──────────────────────────────────────────────

  /** Active orders (not completed / cancelled). */
  const activeOrders = computed(() =>
    [...orders.value.values()].filter((o) => !['completed', 'cancelled'].includes(o.status)),
  )

  /** Filter orders by a specific status. */
  const ordersByStatus = computed(
    () => (status) => [...orders.value.values()].filter((o) => o.status === status),
  )

  /** Orders for a specific restaurant table. */
  const ordersByTable = computed(
    () => (tableId) => [...orders.value.values()].filter((o) => o.table_id === tableId),
  )

  /** KOT tickets grouped by kitchen_id. */
  const kotByKitchen = computed(
    () => (kitchenId) => [...kotTickets.value.values()].filter((k) => k.kitchen_id === kitchenId),
  )

  /** Count of KOTs with status 'pending'. */
  const pendingKotCount = computed(
    () => [...kotTickets.value.values()].filter((k) => k.status === 'pending').length,
  )

  /** Get a single order with its items attached. */
  const orderWithItems = computed(() => (orderId) => {
    const order = orders.value.get(orderId)
    if (!order) return null
    return {
      ...order,
      items: [...orderItems.value.values()].filter((i) => i.order_id === orderId),
    }
  })

  // ── Actions ──────────────────────────────────────────────

  /**
   * Single dispatcher — called by the realtime composable on every
   * Postgres Change payload.
   *
   * @param {'orders'|'order_items'|'kot_tickets'|'kot_items'|'order_status_logs'|'restaurant_tables'} table
   * @param {'INSERT'|'UPDATE'|'DELETE'} eventType
   * @param {Object|null} newRecord
   * @param {Object|null} oldRecord
   */
  function handleRealtimeEvent(table, eventType, newRecord, oldRecord) {
    const storeMap = {
      orders,
      order_items: orderItems,
      kot_tickets: kotTickets,
      kot_items: kotItems,
      restaurant_tables: tables,
    }

    // order_status_logs is append-only
    if (table === 'order_status_logs') {
      if (eventType === 'INSERT' && newRecord) {
        statusLogs.value.push(newRecord)
      }
      return
    }

    const target = storeMap[table]
    if (!target) return

    switch (eventType) {
      case 'INSERT':
        if (newRecord?.id) target.value.set(newRecord.id, newRecord)
        break
      case 'UPDATE':
        if (newRecord?.id) target.value.set(newRecord.id, newRecord)
        break
      case 'DELETE': {
        const id = oldRecord?.id ?? newRecord?.id
        if (id) target.value.delete(id)
        break
      }
    }
  }

  /**
   * Hydrate the store via REST on initial mount.
   * Fetches all non-completed orders for the given branch
   * plus their related items, KOTs, and table statuses.
   */
  async function fetchInitialOrders(branchId) {
    loading.value = true
    try {
      // ── Orders ───────────────────────────────────────────
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .eq('branch_id', branchId)
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false })

      if (ordersData) {
        orders.value = new Map(ordersData.map((o) => [o.id, o]))
      }

      const orderIds = ordersData?.map((o) => o.id) ?? []

      if (orderIds.length) {
        // ── Order Items (with menu item names) ────────────────
        const { data: itemsData } = await supabase
          .from('order_items')
          .select('*, menu_items ( id, name )')
          .in('order_id', orderIds)

        if (itemsData) {
          orderItems.value = new Map(itemsData.map((i) => [i.id, i]))
        }

        // ── KOT Tickets ──────────────────────────────────────
        const { data: kotData } = await supabase
          .from('kot_tickets')
          .select('*')
          .in('order_id', orderIds)

        if (kotData) {
          kotTickets.value = new Map(kotData.map((k) => [k.id, k]))

          const kotIds = kotData.map((k) => k.id)
          if (kotIds.length) {
            const { data: kotItemsData } = await supabase
              .from('kot_items')
              .select('*')
              .in('kot_id', kotIds)

            if (kotItemsData) {
              kotItems.value = new Map(kotItemsData.map((ki) => [ki.id, ki]))
            }
          }
        }

        // ── Status Logs ──────────────────────────────────────
        const { data: logsData } = await supabase
          .from('order_status_logs')
          .select('*')
          .in('order_id', orderIds)
          .order('created_at', { ascending: true })

        if (logsData) {
          statusLogs.value = logsData
        }
      }

      // ── Restaurant Tables ────────────────────────────────
      const { data: tablesData } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('branch_id', branchId)

      if (tablesData) {
        tables.value = new Map(tablesData.map((t) => [t.id, t]))
      }
    } finally {
      loading.value = false
    }
  }

  /** Reset all state — call on logout or branch switch. */
  function clearAll() {
    orders.value = new Map()
    orderItems.value = new Map()
    kotTickets.value = new Map()
    kotItems.value = new Map()
    statusLogs.value = []
    tables.value = new Map()
  }

  async function updateOrderStatus(orderId, status) {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)

    if (error) {
      console.error('Failed to update order status:', error)
      throw error
    }
    return true
  }

  return {
    // state
    orders,
    orderItems,
    kotTickets,
    kotItems,
    statusLogs,
    tables,
    loading,
    // getters
    activeOrders,
    ordersByStatus,
    ordersByTable,
    kotByKitchen,
    pendingKotCount,
    orderWithItems,
    // actions
    handleRealtimeEvent,

    fetchInitialOrders,
    updateOrderStatus,
    clearAll,
  }
})
