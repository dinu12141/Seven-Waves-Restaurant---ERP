<template>
  <q-page class="kds-page dark-backdrop">
    <div class="q-pa-md full-height-container">
      <div class="row items-center justify-between q-mb-md">
        <div class="row items-center q-gutter-x-sm">
          <q-icon name="kitchen" size="32px" color="primary" />
          <div class="text-h5 text-weight-bold text-white">Kitchen Display System</div>
          <q-badge color="accent" class="q-ml-sm text-caption">LIVE</q-badge>
        </div>

        <div class="row items-center q-gutter-x-md">
          <!-- Connection Status -->
          <div class="row items-center bg-dark-soft q-px-md q-py-sm rounded-borders">
            <div
              class="connection-dot q-mr-sm"
              :class="{ 'status-online': isConnected, 'status-offline': !isConnected }"
            ></div>
            <span class="text-caption text-grey-4">{{ isConnected ? 'ONLINE' : 'OFFLINE' }}</span>
          </div>

          <!-- Filter -->
          <q-select
            v-model="filterMode"
            :options="['All', 'Dine-in', 'Takeaway', 'Delivery']"
            dense
            outlined
            dark
            options-dense
            bg-color="grey-9"
            class="filter-select"
            style="min-width: 160px"
            behavior="menu"
          />
        </div>
      </div>

      <!-- Main Kanban Board -->
      <div class="row q-col-gutter-md full-height-board">
        <!-- NEW ORDERS -->
        <div class="col-12 col-md-4 kanban-col-wrapper">
          <div class="kanban-column bg-dark-glass">
            <div class="column-header">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-h6 text-weight-bold text-orange-4">NEW ORDERS</span>
                <q-chip size="sm" color="orange-9" text-color="white" class="text-weight-bold">
                  {{ newOrders.length }}
                </q-chip>
              </div>
              <div class="header-bar bg-orange-5"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#fb8c00' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <template v-if="newOrders.length > 0">
                  <KitchenTicketCard
                    v-for="ticket in newOrders"
                    :key="ticket.id"
                    :order="ticket"
                    @start-cooking="updateTicketStatus(ticket, 'preparing')"
                  />
                </template>
                <div v-else class="empty-placeholder">
                  <q-icon name="receipt_long" size="48px" color="grey-8" />
                  <div class="text-grey-7 q-mt-sm text-subtitle2">No new orders</div>
                </div>
              </transition-group>
            </q-scroll-area>
          </div>
        </div>

        <!-- PREPARING -->
        <div class="col-12 col-md-4 kanban-col-wrapper">
          <div class="kanban-column bg-dark-glass">
            <div class="column-header">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-h6 text-weight-bold text-blue-4">PREPARING</span>
                <q-chip size="sm" color="blue-9" text-color="white" class="text-weight-bold">
                  {{ preparingOrders.length }}
                </q-chip>
              </div>
              <div class="header-bar bg-blue-5"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#2196f3' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <template v-if="preparingOrders.length > 0">
                  <KitchenTicketCard
                    v-for="ticket in preparingOrders"
                    :key="ticket.id"
                    :order="ticket"
                    @mark-ready="updateTicketStatus(ticket, 'ready')"
                  />
                </template>
                <div v-else class="empty-placeholder">
                  <q-icon name="soup_kitchen" size="48px" color="grey-8" />
                  <div class="text-grey-7 q-mt-sm text-subtitle2">Kitchen is clear</div>
                </div>
              </transition-group>
            </q-scroll-area>
          </div>
        </div>

        <!-- READY -->
        <div class="col-12 col-md-4 kanban-col-wrapper">
          <div class="kanban-column bg-dark-glass">
            <div class="column-header">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-h6 text-weight-bold text-green-4">READY</span>
                <q-chip size="sm" color="green-9" text-color="white" class="text-weight-bold">
                  {{ readyOrders.length }}
                </q-chip>
              </div>
              <div class="header-bar bg-green-5"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#4caf50' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <template v-if="readyOrders.length > 0">
                  <KitchenTicketCard
                    v-for="ticket in readyOrders"
                    :key="ticket.id"
                    :order="ticket"
                    @complete="completeTicket(ticket)"
                  />
                </template>
                <div v-else class="empty-placeholder">
                  <q-icon name="check_circle" size="48px" color="grey-8" />
                  <div class="text-grey-7 q-mt-sm text-subtitle2">No orders waiting</div>
                </div>
              </transition-group>
            </q-scroll-area>
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { supabase } from 'boot/supabase'
import KitchenTicketCard from 'components/kitchen/KitchenTicketCard.vue'

const $q = useQuasar()
const filterMode = ref('All')
const activeTickets = ref([])
const isConnected = ref(false)

// Realtime Channel
let channel = null
let timerInterval = null

// --- Computed Columns ---

const newOrders = computed(() => {
  return filterTickets(
    activeTickets.value.filter((t) => ['pending', 'accepted'].includes(t.rawStatus)),
  )
})

const preparingOrders = computed(() => {
  return filterTickets(activeTickets.value.filter((t) => t.rawStatus === 'preparing'))
})

const readyOrders = computed(() => {
  return filterTickets(activeTickets.value.filter((t) => t.rawStatus === 'ready'))
})

function filterTickets(tickets) {
  if (filterMode.value === 'All') return tickets
  return tickets.filter((t) => t.type?.toLowerCase() === filterMode.value.toLowerCase())
}

// --- Data Fetching ---

async function fetchActiveTickets() {
  try {
    const { data, error } = await supabase
      .from('kot_tickets')
      .select(
        `
        *,
        order:orders (
          order_number,
          order_type,
          table:restaurant_tables (table_number)
        ),
        kot_items (
          quantity,
          notes,
          order_item:order_items (
            menu_item:menu_items (name)
          )
        )
      `,
      )
      .in('status', ['pending', 'accepted', 'preparing', 'ready'])
      .is('completed_at', null)
      .order('created_at', { ascending: true })

    if (error) throw error

    activeTickets.value = data.map(transformTicket)
  } catch (err) {
    console.error('Error fetching tickets:', err)
    $q.notify({
      type: 'negative',
      message: 'Failed to load tickets',
    })
  }
}

function transformTicket(ticket) {
  // Map Supabase data to component format
  return {
    id: ticket.id,
    orderId: ticket.kot_number ? `#${ticket.kot_number}` : '---',
    // Fallback if table is null (e.g. takeaway)
    table: ticket.order?.table?.table_number || '-',
    // Component expects PascalCase status for styling classes
    status: capitalize(ticket.status),
    rawStatus: ticket.status, // Keep raw for logic
    startTime: new Date(ticket.created_at).getTime(),
    timeElapsed: '00:00',
    type: formatOrderType(ticket.order?.order_type),
    items:
      ticket.kot_items?.map((item) => ({
        name: item.order_item?.menu_item?.name || 'Unknown Item',
        qty: item.quantity,
        notes: item.notes || '',
      })) || [],
  }
}

function capitalize(str) {
  if (!str) return ''
  // Component expects: Pending, Cooking, Ready
  if (str === 'preparing') return 'Cooking'
  if (str === 'pending' || str === 'accepted') return 'Pending' // Map accepted to Pending UI
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function formatOrderType(type) {
  if (!type) return 'Dine-in'
  // dine_in -> Dine-in
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-')
}

// --- Realtime Subscription ---

function subscribeToTickets() {
  // Unsubscribe previous if exists
  if (channel) supabase.removeChannel(channel)

  channel = supabase
    .channel('kitchen-display')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_tickets' }, (payload) => {
      handleTicketChange(payload)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kot_items' }, (payload) => {
      // If items change, we might need to refresh the ticket they belong to
      // Since kot_items has kot_id, we can find it.
      if (payload.new && payload.new.kot_id) {
        refreshTicket(payload.new.kot_id)
      } else if (payload.old && payload.old.kot_id) {
        refreshTicket(payload.old.kot_id)
      }
    })
    .subscribe((status) => {
      isConnected.value = status === 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') {
        fetchActiveTickets()
      }
    })
}

async function refreshTicket(kotId) {
  const { data, error } = await supabase
    .from('kot_tickets')
    .select(
      `
        *,
        order:orders (
          order_number,
          order_type,
          table:restaurant_tables (table_number)
        ),
        kot_items (
          quantity,
          notes,
          order_item:order_items (
            menu_item:menu_items (name)
          )
        )
      `,
    )
    .eq('id', kotId)
    .single()

  if (!error && data) {
    const idx = activeTickets.value.findIndex((t) => t.id === kotId)

    // If completed, ensure not in list
    if (data.completed_at) {
      if (idx !== -1) activeTickets.value.splice(idx, 1)
      return
    }

    if (idx !== -1) {
      activeTickets.value[idx] = transformTicket(data)
    } else if (['pending', 'accepted', 'preparing', 'ready'].includes(data.status)) {
      // Add if it matches our filter criteria
      activeTickets.value.push(transformTicket(data))
    }
  }
}

async function handleTicketChange(payload) {
  const { eventType, new: newRecord, old: oldRecord } = payload

  if (eventType === 'INSERT') {
    // Fetch full details for the new ticket
    refreshTicket(newRecord.id)
  } else if (eventType === 'UPDATE') {
    const index = activeTickets.value.findIndex((t) => t.id === newRecord.id)
    if (index !== -1) {
      if (
        !['pending', 'accepted', 'preparing', 'ready'].includes(newRecord.status) ||
        newRecord.completed_at
      ) {
        // Remove if cancelled or served/completed
        activeTickets.value.splice(index, 1)
      } else {
        // Update local status immediately
        activeTickets.value[index].status = capitalize(newRecord.status)
        activeTickets.value[index].rawStatus = newRecord.status
        // Also refresh to be safe (syncs time, etc)
        // refreshTicket(newRecord.id) // Optional, might be overkill
      }
    } else {
      // If not in list (e.g. was pending and we missed it?), try adding
      if (
        ['pending', 'accepted', 'preparing', 'ready'].includes(newRecord.status) &&
        !newRecord.completed_at
      ) {
        refreshTicket(newRecord.id)
      }
    }
  } else if (eventType === 'DELETE') {
    const index = activeTickets.value.findIndex((t) => t.id === oldRecord.id)
    if (index !== -1) activeTickets.value.splice(index, 1)
  }
}

// --- Actions ---

async function updateTicketStatus(ticket, newStatus) {
  try {
    // Optimistic UI update
    const oldStatus = ticket.rawStatus
    const oldUiStatus = ticket.status

    ticket.rawStatus = newStatus
    ticket.status = capitalize(newStatus)

    // We update the local array to trigger computed calc
    // Since computed depends on properties of objects in array, mutating object works

    const { error } = await supabase
      .from('kot_tickets')
      .update({ status: newStatus })
      .eq('id', ticket.id)

    if (error) {
      // Revert
      ticket.rawStatus = oldStatus
      ticket.status = oldUiStatus
      throw error
    }
  } catch (err) {
    console.error('Update status failed:', err)
    $q.notify({ type: 'negative', message: 'Failed to update status' })
  }
}

async function completeTicket(ticket) {
  try {
    // We assume 'served' is the completion status (or we just use ready for now? Schema allows 'status').
    // Let's set to 'served' if possible. If mapped to check constraint issues, we might need to change schema or use 'ready' + completed_at.
    // Schema in orders.sql: status IN ('pending', 'accepted', 'preparing', 'ready', 'cancelled')
    // It DOES NOT have 'served'.
    // So we should probably treat it as removed from KDS when 'ready' is done.
    // But how do we distinguish?
    // Maybe we move it to a 'completed' state in a new field?
    // `completed_at` exists!

    // If we set `completed_at`, it doesn't change `status`.
    // But we can filter our query: `.is('completed_at', null)`
    // So let's update `completed_at` to Now.

    const { error } = await supabase
      .from('kot_tickets')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', ticket.id)

    if (error) throw error

    // Remove from UI
    const idx = activeTickets.value.findIndex((t) => t.id === ticket.id)
    if (idx > -1) activeTickets.value.splice(idx, 1)
  } catch (err) {
    console.error('Complete failed', err)
    $q.notify({ type: 'negative', message: 'Failed to complete ticket' })
  }
}

// --- Timer ---

function startTimer() {
  updateTimes() // Immediate run
  timerInterval = setInterval(updateTimes, 1000)
}

function updateTimes() {
  const now = Date.now()
  activeTickets.value.forEach((ticket) => {
    const diff = now - ticket.startTime
    // If negative (clock drift?), show 00:00
    if (diff < 0) {
      ticket.timeElapsed = '00:00'
      return
    }
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    ticket.timeElapsed = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  })
}

// --- Lifecycle ---

onMounted(() => {
  fetchActiveTickets()
  subscribeToTickets()
  startTimer()

  // Auto-refresh on reconnect
  window.addEventListener('online', fetchActiveTickets)
})

onUnmounted(() => {
  if (channel) supabase.removeChannel(channel)
  if (timerInterval) clearInterval(timerInterval)
  window.removeEventListener('online', fetchActiveTickets)
})
</script>

<style scoped>
.kds-page {
  /* Rich dark gradient background */
  background: radial-gradient(circle at 50% -20%, #2a2a2a, #121212);
  min-height: 100vh;
  color: #e0e0e0;
}

.full-height-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.full-height-board {
  flex: 1;
  min-height: 0; /* Important for flex scrolling */
}

.kanban-col-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.kanban-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: rgba(30, 30, 30, 0.6);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.column-header {
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
}

.header-bar {
  height: 4px;
  width: 100%;
  border-radius: 2px;
  margin-top: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.column-scroll {
  flex: 1;
  /* background: rgba(0,0,0,0.1); */
}

/* Empty State */
.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  opacity: 0.5;
}

/* Connection Dot */
.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.status-online {
  background-color: #00e676;
  box-shadow: 0 0 8px #00e676;
}

.status-offline {
  background-color: #f44336;
  box-shadow: 0 0 8px #f44336;
}

/* Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
.list-move {
  transition: transform 0.4s ease;
}

/* Responsive */
@media (max-width: 1023px) {
  .full-height-container {
    height: auto;
    min-height: 100vh;
  }

  .full-height-board {
    height: auto;
  }

  .kanban-col-wrapper {
    height: auto;
    min-height: 500px;
  }

  .kanban-column {
    min-height: 500px;
  }
}
</style>
