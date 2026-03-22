<template>
  <q-page class="kds-page">
    <div class="q-pa-md full-height-container">
      <!-- Header -->
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
              :class="{ 'status-online': store.isConnected, 'status-offline': !store.isConnected }"
            ></div>
            <span class="text-caption text-grey-4">{{
              store.isConnected ? 'ONLINE' : 'OFFLINE'
            }}</span>
          </div>

          <!-- Kitchen Selector: only for admin/manager (not for locked kitchen users) -->
          <q-select
            v-if="store.kitchens.length > 1 && !store.isKitchenLocked"
            v-model="selectedKitchen"
            :options="kitchenOptions"
            dense
            outlined
            dark
            options-dense
            bg-color="grey-9"
            class="kitchen-select"
            style="min-width: 200px"
            behavior="menu"
            emit-value
            map-options
            @update:model-value="onKitchenChange"
          >
            <template v-slot:prepend>
              <q-icon name="soup_kitchen" size="18px" color="primary" />
            </template>
          </q-select>

          <!-- Locked badge: shows assigned kitchen for kitchen-role users -->
          <div
            v-if="store.isKitchenLocked"
            class="row items-center bg-dark-soft q-px-md q-py-sm rounded-borders"
          >
            <q-icon name="soup_kitchen" size="18px" color="primary" class="q-mr-sm" />
            <span class="text-weight-bold text-white">{{
              store.selectedKitchen?.name || 'Kitchen'
            }}</span>
            <q-chip dense size="xs" color="primary" text-color="white" class="q-ml-sm"
              >ASSIGNED</q-chip
            >
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
            style="min-width: 150px"
            behavior="menu"
          />

          <!-- Fullscreen toggle -->
          <q-btn
            flat
            round
            dense
            :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
            color="grey-5"
            @click="toggleFullscreen"
          >
            <q-tooltip>{{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Kitchen Name Banner -->
      <div v-if="store.selectedKitchen" class="kitchen-banner q-mb-md">
        <q-icon name="soup_kitchen" size="20px" class="q-mr-sm" />
        {{ store.selectedKitchen.name }}
        <q-chip dense size="sm" color="grey-8" text-color="grey-4" class="q-ml-md">
          {{ store.totalActive }} active tickets
        </q-chip>
      </div>

      <!-- Loading -->
      <div v-if="store.loading" class="column items-center q-pa-xl">
        <q-spinner-orbit size="48px" color="primary" />
        <div class="text-body2 text-grey-5 q-mt-md">Loading kitchen tickets...</div>
      </div>

      <!-- No Kitchen -->
      <div v-else-if="store.kitchens.length === 0" class="column items-center q-pa-xl">
        <q-icon name="kitchen" size="64px" color="grey-8" />
        <div class="text-h6 text-grey-5 q-mt-md">No Kitchens Found</div>
        <div class="text-body2 text-grey-7 q-mt-xs">
          Ask an admin to create kitchen stations for this branch.
        </div>
      </div>

      <!-- Main Kanban Board -->
      <div v-else class="row q-col-gutter-md full-height-board justify-center">
        <!-- NEW -->
        <div class="col-12 col-md-4 kanban-col-wrapper">
          <div class="kanban-column bg-dark-glass">
            <div class="column-header">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-h6 text-weight-bold text-orange-4">NEW</span>
                <q-chip size="sm" color="orange-9" text-color="white" class="text-weight-bold">
                  {{ filteredNew.length }}
                </q-chip>
              </div>
              <div class="header-bar bg-orange-7"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#e65100' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <KitchenTicketCard
                  v-for="ticket in filteredNew"
                  :key="ticket.id"
                  :ticket="ticket"
                  :is-printing="store.printing === ticket.id"
                  @accept="handleAccept"
                  @print="handlePrint"
                  @view="handleView"
                />
              </transition-group>
              <div v-if="filteredNew.length === 0" class="empty-placeholder">
                <q-icon name="assignment" size="48px" color="grey-8" />
                <div class="text-grey-7 q-mt-sm text-subtitle2">No new orders</div>
              </div>
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
                  {{ filteredPreparing.length }}
                </q-chip>
              </div>
              <div class="header-bar bg-blue-6"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#1e88e5' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <KitchenTicketCard
                  v-for="ticket in filteredPreparing"
                  :key="ticket.id"
                  :ticket="ticket"
                  :is-printing="store.printing === ticket.id"
                  @mark-ready="handleMarkReady"
                  @print="handlePrint"
                  @view="handleView"
                />
              </transition-group>
              <div v-if="filteredPreparing.length === 0" class="empty-placeholder">
                <q-icon name="soup_kitchen" size="48px" color="grey-8" />
                <div class="text-grey-7 q-mt-sm text-subtitle2">Kitchen is clear</div>
              </div>
            </q-scroll-area>
          </div>
        </div>

        <!-- READY -->
        <div class="col-12 col-md-4 kanban-col-wrapper">
          <div class="kanban-column bg-dark-glass">
            <div class="column-header">
              <div class="row items-center justify-between q-mb-xs">
                <span class="text-h6 text-weight-bold text-green-4">READY</span>
                <div class="row items-center q-gutter-x-xs">
                  <q-btn
                    v-if="filteredReady.length > 0"
                    flat dense no-caps
                    size="sm"
                    color="red-4"
                    icon="clear_all"
                    label="Clear All"
                    @click="handleClearAllReady"
                  >
                    <q-tooltip>Dismiss all ready orders</q-tooltip>
                  </q-btn>
                  <q-chip size="sm" color="green-9" text-color="white" class="text-weight-bold">
                    {{ filteredReady.length }}
                  </q-chip>
                </div>
              </div>
              <div class="header-bar bg-green-5"></div>
            </div>

            <q-scroll-area
              class="column-scroll"
              :thumb-style="{ width: '6px', borderRadius: '3px', backgroundColor: '#4caf50' }"
            >
              <transition-group name="list" tag="div" class="q-pa-sm q-gutter-y-md">
                <KitchenTicketCard
                  v-for="ticket in filteredReady"
                  :key="ticket.id"
                  :ticket="ticket"
                  list-view
                  :is-printing="store.printing === ticket.id"
                  @dismiss="handleDismiss"
                  @print="handlePrint"
                  @view="handleView"
                />
              </transition-group>
              <div v-if="filteredReady.length === 0" class="empty-placeholder">
                <q-icon name="check_circle" size="48px" color="grey-8" />
                <div class="text-grey-7 q-mt-sm text-subtitle2">No orders waiting</div>
              </div>
            </q-scroll-area>
          </div>
        </div>
      </div>
    </div>

    <!-- KOT Viewer Dialog -->
    <q-dialog v-model="viewDialogOpen" transition-show="scale" transition-hide="scale">
      <KotReceipt
        v-if="selectedTicket"
        ref="receiptRef"
        :kot="selectedTicket"
        :table-number="selectedTicket.tableNumber"
        :waiter-name="selectedTicket.waiterName"
        :customer-name="selectedTicket.customerName"
        :order-type="selectedTicket.orderType"
        :order-notes="selectedTicket.orderNotes"
        :kitchen-name="store.selectedKitchen?.name"
        @printed="viewDialogOpen = false"
      />
    </q-dialog>

    <!-- Hidden KotReceipt for background printing -->
    <div v-if="selectedTicket && !viewDialogOpen" class="hidden">
      <KotReceipt
        ref="receiptRef"
        :kot="selectedTicket"
        :table-number="selectedTicket.tableNumber"
        :waiter-name="selectedTicket.waiterName"
        :customer-name="selectedTicket.customerName"
        :order-type="selectedTicket.orderType"
        :order-notes="selectedTicket.orderNotes"
        :kitchen-name="store.selectedKitchen?.name"
        :show-actions="false"
      />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useKitchenDisplayStore } from 'src/stores/kitchenDisplayStore'
import KitchenTicketCard from 'src/components/kitchen/KitchenTicketCard.vue'
import KotReceipt from 'src/components/common/KotReceipt.vue'

const $q = useQuasar()
const store = useKitchenDisplayStore()
const filterMode = ref('All')
const isFullscreen = ref(false)

// View Dialog State
const viewDialogOpen = ref(false)
const selectedTicket = ref(null)

// Kitchen selector
const selectedKitchen = ref(null)
const receiptRef = ref(null)

const kitchenOptions = computed(() => store.kitchens.map((k) => ({ label: k.name, value: k.id })))

// Filtered columns
const filteredNew = computed(() => filterByType(store.newTickets))
const filteredPreparing = computed(() => filterByType(store.preparingTickets))
const filteredReady = computed(() => filterByType(store.readyTickets))

function filterByType(tickets) {
  if (filterMode.value === 'All') return tickets
  return tickets.filter((t) => t.orderType?.toLowerCase() === filterMode.value.toLowerCase())
}

// Watch for kitchen-specific new ticket alerts → show detailed notification
watch(
  () => store.newTicketAlert,
  (alert) => {
    if (!alert) return

    // Build items summary text
    const itemsText = alert.items
      .map(i => `${i.qty}x ${i.name}`)
      .join(', ')

    $q.notify({
      type: 'warning',
      message: `🔔 New KOT for ${alert.kitchenName}`,
      caption: `Table ${alert.tableNumber} • #${alert.orderNumber}\n${itemsText}`,
      icon: 'notification_important',
      position: 'top',
      timeout: 6000,
      multiLine: true,
      html: false,
      actions: [
        { label: 'OK', color: 'white', handler: () => store.clearNewTicketAlert() }
      ],
    })
  },
  { deep: true }
)

async function onKitchenChange(kitchenId) {
  await store.selectKitchen(kitchenId)
}

async function handleMarkReady(ticketId) {
  const { success, error } = await store.markReady(ticketId)
  if (!success) {
    $q.notify({ type: 'negative', message: error || 'Failed to update', icon: 'error' })
  }
}

async function handleAccept(ticketId) {
  const { success, error } = await store.acceptTicket(ticketId)
  if (success) {
    $q.notify({ type: 'positive', message: 'Ticket Accepted', icon: 'check_circle', timeout: 1000 })
  } else {
    $q.notify({ type: 'negative', message: error || 'Failed to accept', icon: 'error' })
  }
}

async function handleDismiss(ticketId) {
  const { success, error } = await store.dismissTicket(ticketId)
  if (!success) {
    $q.notify({ type: 'negative', message: error || 'Failed', icon: 'error' })
  }
}

async function handleClearAllReady() {
  $q.dialog({
    title: 'Clear All Ready Orders',
    message: `Dismiss all ${filteredReady.value.length} ready orders from the display?`,
    cancel: true,
    ok: { label: 'Clear All', color: 'negative', flat: true },
    dark: true,
    persistent: true,
  }).onOk(async () => {
    const { success, error } = await store.dismissAllReady()
    if (success) {
      $q.notify({ type: 'positive', message: 'All ready orders cleared', icon: 'check_circle', timeout: 2000 })
    } else {
      $q.notify({ type: 'negative', message: error || 'Failed to clear', icon: 'error' })
    }
  })
}

function handleView(ticketId) {
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (ticket) {
    selectedTicket.value = ticket
    viewDialogOpen.value = true
  }
}

async function handlePrint(ticketId) {
  const ticket = store.tickets.find((t) => t.id === ticketId)
  if (!ticket) return

  const { success, error, isReprint } = await store.printKot(ticketId)
  if (success) {
    $q.notify({
      type: 'positive',
      message: isReprint ? 'KOT Reprinted' : 'KOT Printed',
      caption: `KOT #${ticket?.kot_number || ticket?.orderNumber}`,
      icon: 'print',
      position: 'top-right',
      timeout: 2000,
    })

    // Actual POS print
    selectedTicket.value = ticket
    setTimeout(() => {
      if (receiptRef.value) {
        receiptRef.value.printReceipt()
      }
    }, 100)
  } else {
    $q.notify({ type: 'negative', message: error || 'Print failed', icon: 'error' })
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

onMounted(() => {
  store.initialize()
  store.warmUpAudio() // Unlock AudioContext on first user gesture
  window.addEventListener('online', store.fetchTickets)
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})

onUnmounted(() => {
  store.cleanup()
  window.removeEventListener('online', store.fetchTickets)
})

// Auto-select kitchen once loaded
watch(
  () => store.selectedKitchenId,
  (val) => {
    selectedKitchen.value = val
  },
)
</script>

<style scoped>
.kds-page {
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
  min-height: 0;
}

.kitchen-banner {
  display: flex;
  align-items: center;
  color: #d1d5db;
  font-size: 0.95rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
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
}

.empty-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  opacity: 0.5;
}

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
