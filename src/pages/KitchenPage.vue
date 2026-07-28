<template>
  <q-page class="kds-page window-height">
    <div class="kds-container">
      <!-- Header -->
      <div class="row items-center justify-between q-mb-md">
        <div class="row items-center q-gutter-x-sm">
          <q-icon name="kitchen" size="32px" color="primary" />
          <div class="text-h5 text-weight-bold kds-title">Kitchen Display System</div>
          <q-badge color="accent" class="q-ml-sm text-caption">LIVE</q-badge>
        </div>

        <div class="row items-center q-gutter-x-md">
          <!-- Connection Status -->
          <div class="row items-center kds-status-box q-px-md q-py-sm rounded-borders">
            <div
              class="connection-dot q-mr-sm"
              :class="{ 'status-online': store.isConnected, 'status-offline': !store.isConnected }"
            ></div>
            <span class="text-caption kds-status-text">{{
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
            options-dense
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
            class="row items-center kds-status-box q-px-md q-py-sm rounded-borders"
          >
            <q-icon name="soup_kitchen" size="18px" color="primary" class="q-mr-sm" />
            <span class="text-weight-bold kds-title">{{
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
            options-dense
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
          <!-- Logout -->
          <q-btn
            flat
            round
            dense
            icon="logout"
            color="red-5"
            @click="handleLogout"
          >
            <q-tooltip>Logout</q-tooltip>
          </q-btn>
        </div>
      </div>

      <!-- Kitchen Name Banner -->
      <div v-if="store.selectedKitchen" class="kitchen-banner q-mb-md">
        <q-icon name="soup_kitchen" size="20px" class="q-mr-sm" />
        {{ store.selectedKitchen.name }}
        <q-chip dense size="sm" class="q-ml-md kds-active-chip">
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

            <div class="column-scroll">
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
            </div>
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

            <div class="column-scroll">
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
            </div>
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
                    flat
                    dense
                    no-caps
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

            <div class="column-scroll">
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
            </div>
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
        :delivery-source="selectedTicket.deliverySource"
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
        :delivery-source="selectedTicket.deliverySource"
        :order-notes="selectedTicket.orderNotes"
        :kitchen-name="store.selectedKitchen?.name"
        :show-actions="false"
      />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useKitchenDisplayStore } from 'src/stores/kitchenDisplayStore'
import { useAuthStore } from 'src/stores/auth'
import KitchenTicketCard from 'src/components/kitchen/KitchenTicketCard.vue'
import KotReceipt from 'src/components/common/KotReceipt.vue'

const $q = useQuasar()
const store = useKitchenDisplayStore()
const authStore = useAuthStore()
const router = useRouter()
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
    const itemsText = alert.items.map((i) => `${i.qty}x ${i.name}`).join(', ')

    $q.notify({
      type: 'warning',
      message: `🔔 New KOT for ${alert.kitchenName}`,
      caption: `Table ${alert.tableNumber} • #${alert.orderNumber}\n${itemsText}`,
      icon: 'notification_important',
      position: 'top',
      timeout: 6000,
      multiLine: true,
      html: false,
      actions: [{ label: 'OK', color: 'white', handler: () => store.clearNewTicketAlert() }],
    })
  },
  { deep: true },
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
    persistent: true,
  }).onOk(async () => {
    const { success, error } = await store.dismissAllReady()
    if (success) {
      $q.notify({
        type: 'positive',
        message: 'All ready orders cleared',
        icon: 'check_circle',
        timeout: 2000,
      })
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



async function handleLogout() {
  try {
    $q.loading.show()
    await authStore.signOut()
    router.push('/auth/login')
  } catch (error) {
    console.error('Logout error:', error)
  } finally {
    $q.loading.hide()
  }
}
</script>

<style scoped>
.kds-page {
  background: var(--erp-bg-page);
  color: var(--erp-text-primary);
  height: 100vh !important;
  max-height: 100vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.kds-container {
  display: flex;
  flex-direction: column;
  padding: 12px 16px;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.kds-title {
  color: var(--erp-text-primary);
}

.kds-status-box {
  background: var(--erp-bg-hover);
  border: 1px solid var(--erp-border);
}

.kds-status-text {
  color: var(--erp-text-secondary);
}

.kds-active-chip {
  background: var(--erp-bg-hover) !important;
  color: var(--erp-text-secondary) !important;
  border: 1px solid var(--erp-border);
}

.full-height-board {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  flex-wrap: nowrap !important;
}

.kitchen-banner {
  display: flex;
  align-items: center;
  color: var(--erp-text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
  background: var(--erp-bg-hover);
  padding: 6px 16px;
  border-radius: 10px;
  border: 1px solid var(--erp-border);
}

.kanban-col-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.kanban-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  box-shadow: var(--erp-shadow-card);
  overflow: hidden;
  min-height: 0;
}

.column-header {
  padding: 12px 16px;
  background: var(--erp-bg-card-hover);
  flex-shrink: 0;
}

.header-bar {
  height: 4px;
  width: 100%;
  border-radius: 2px;
  margin-top: 6px;
}

.column-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.column-scroll::-webkit-scrollbar {
  width: 6px;
}
.column-scroll::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
}
.column-scroll::-webkit-scrollbar-track {
  background: transparent;
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

/* Responsive — tablet/mobile: stack columns vertically and cap each at 50vh */
@media (max-width: 1023px) {
  .kds-container {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .full-height-board {
    flex-wrap: wrap !important;
    overflow: visible;
  }
  .kanban-col-wrapper {
    height: auto;
    min-height: 300px;
    max-height: 50vh;
  }
  .kanban-column {
    min-height: 300px;
  }
}

</style>
