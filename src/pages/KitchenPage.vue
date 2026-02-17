<template>
  <q-page class="kds-page">
    <PageHeader title="Kitchen Display System" subtitle="Real-time order tracking">
      <template #actions>
        <q-select
          v-model="filterMode"
          :options="['All', 'Dine-in', 'Takeaway', 'Delivery']"
          dense
          outlined
          dark
          options-dense
          class="filter-select"
          style="min-width: 150px"
        />
      </template>
    </PageHeader>

    <!-- Three Column Kanban Layout -->
    <div class="kanban-container row q-col-gutter-md q-mt-md">
      <!-- Column 1: New Orders (Orange) -->
      <div class="col-12 col-lg-4">
        <div class="kanban-column column-new-orders">
          <div class="column-header header-orange">
            <q-icon name="receipt_long" size="36px" class="q-mr-sm" />
            <div class="column-title">NEW ORDERS</div>
            <q-badge color="white" text-color="orange-9" class="count-badge">
              {{ newOrders.length }}
            </q-badge>
          </div>

          <q-scroll-area class="column-content">
            <div v-if="newOrders.length === 0" class="empty-state">
              <q-icon name="inbox" size="64px" color="grey-6" />
              <div class="text-grey-6 q-mt-md">No new orders</div>
            </div>

            <transition-group
              appear
              enter-active-class="animated fadeInUp"
              leave-active-class="animated fadeOutDown"
            >
              <KitchenTicketCard
                v-for="order in newOrders"
                :key="order.id"
                :order="order"
                class="q-mb-md"
                @start-cooking="updateStatus(order, 'Cooking')"
              />
            </transition-group>
          </q-scroll-area>
        </div>
      </div>

      <!-- Column 2: Preparing (Blue) -->
      <div class="col-12 col-lg-4">
        <div class="kanban-column column-preparing">
          <div class="column-header header-blue">
            <q-icon name="soup_kitchen" size="36px" class="q-mr-sm" />
            <div class="column-title">PREPARING</div>
            <q-badge color="white" text-color="blue-9" class="count-badge">
              {{ preparingOrders.length }}
            </q-badge>
          </div>

          <q-scroll-area class="column-content">
            <div v-if="preparingOrders.length === 0" class="empty-state">
              <q-icon name="inbox" size="64px" color="grey-6" />
              <div class="text-grey-6 q-mt-md">No orders preparing</div>
            </div>

            <transition-group
              appear
              enter-active-class="animated fadeInUp"
              leave-active-class="animated fadeOutDown"
            >
              <KitchenTicketCard
                v-for="order in preparingOrders"
                :key="order.id"
                :order="order"
                class="q-mb-md"
                @mark-ready="updateStatus(order, 'Ready')"
              />
            </transition-group>
          </q-scroll-area>
        </div>
      </div>

      <!-- Column 3: Ready (Green) -->
      <div class="col-12 col-lg-4">
        <div class="kanban-column column-ready">
          <div class="column-header header-green">
            <q-icon name="check_circle" size="36px" class="q-mr-sm" />
            <div class="column-title">READY</div>
            <q-badge color="white" text-color="green-9" class="count-badge">
              {{ readyOrders.length }}
            </q-badge>
          </div>

          <q-scroll-area class="column-content">
            <div v-if="readyOrders.length === 0" class="empty-state">
              <q-icon name="inbox" size="64px" color="grey-6" />
              <div class="text-grey-6 q-mt-md">No orders ready</div>
            </div>

            <transition-group
              appear
              enter-active-class="animated fadeInUp"
              leave-active-class="animated fadeOutDown"
            >
              <KitchenTicketCard
                v-for="order in readyOrders"
                :key="order.id"
                :order="order"
                class="q-mb-md"
                @complete="completeOrder(order)"
              />
            </transition-group>
          </q-scroll-area>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import PageHeader from 'components/common/PageHeader.vue'
import KitchenTicketCard from 'components/kitchen/KitchenTicketCard.vue'

const filterMode = ref('All')

// Mock Tickets Data
const activeTickets = ref([
  {
    id: 1,
    orderId: 'ORD-101',
    table: 'T5',
    status: 'Pending',
    startTime: Date.now() - 1000 * 60 * 2, // 2 mins ago
    timeElapsed: '02:00',
    type: 'Dine-in',
    items: [
      { name: 'Classic Burger', qty: 2, notes: 'No onions' },
      { name: 'Fries', qty: 1 },
    ],
  },
  {
    id: 2,
    orderId: 'ORD-102',
    table: 'T2',
    status: 'Cooking',
    startTime: Date.now() - 1000 * 60 * 12, // 12 mins ago
    timeElapsed: '12:00',
    type: 'Dine-in',
    items: [
      { name: 'Pizza Margherita', qty: 1 },
      { name: 'Caesar Salad', qty: 1, notes: 'Extra dressing' },
    ],
  },
  {
    id: 3,
    orderId: 'ORD-103',
    table: '-',
    status: 'Ready',
    startTime: Date.now() - 1000 * 60 * 25, // 25 mins ago
    timeElapsed: '25:00',
    type: 'Takeaway',
    items: [
      { name: 'Pasta Carbonara', qty: 2 },
      { name: 'Garlic Bread', qty: 1 },
    ],
  },
  {
    id: 4,
    orderId: 'ORD-104',
    table: 'T8',
    status: 'Pending',
    startTime: Date.now() - 1000 * 30, // 30 sec ago
    timeElapsed: '00:30',
    type: 'Dine-in',
    items: [
      { name: 'Steak', qty: 1, notes: 'Medium Rare' },
      { name: 'Mashed Potatoes', qty: 1 },
      { name: 'Grilled Vegetables', qty: 1 },
    ],
  },
  {
    id: 5,
    orderId: 'ORD-105',
    table: 'T3',
    status: 'Cooking',
    startTime: Date.now() - 1000 * 60 * 8, // 8 mins ago
    timeElapsed: '08:00',
    type: 'Dine-in',
    items: [
      { name: 'Chicken Wings', qty: 2, notes: 'Extra spicy' },
      { name: 'Onion Rings', qty: 1 },
    ],
  },
  {
    id: 6,
    orderId: 'ORD-106',
    table: '-',
    status: 'Ready',
    startTime: Date.now() - 1000 * 60 * 15, // 15 mins ago
    timeElapsed: '15:00',
    type: 'Delivery',
    items: [
      { name: 'Pepperoni Pizza', qty: 1 },
      { name: 'Coca Cola', qty: 2 },
    ],
  },
])

// Computed columns
const newOrders = computed(() => {
  return filterTickets(activeTickets.value.filter((t) => t.status === 'Pending'))
})

const preparingOrders = computed(() => {
  return filterTickets(activeTickets.value.filter((t) => t.status === 'Cooking'))
})

const readyOrders = computed(() => {
  return filterTickets(activeTickets.value.filter((t) => t.status === 'Ready'))
})

function filterTickets(tickets) {
  if (filterMode.value === 'All') return tickets
  return tickets.filter((t) => t.type === filterMode.value)
}

// Timer Logic
let timerInterval
onMounted(() => {
  timerInterval = setInterval(() => {
    activeTickets.value.forEach((ticket) => {
      const diff = Date.now() - ticket.startTime
      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      ticket.timeElapsed = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    })
  }, 1000)
})

onUnmounted(() => {
  clearInterval(timerInterval)
})

function updateStatus(ticket, newStatus) {
  ticket.status = newStatus
  // In a real app, you would make an API call here
}

function completeOrder(ticket) {
  // Remove from active list
  const idx = activeTickets.value.findIndex((t) => t.id === ticket.id)
  if (idx > -1) {
    activeTickets.value.splice(idx, 1)
  }
  // In a real app, you would update order status in the database
}
</script>

<style scoped>
.kds-page {
  background: #121212;
  min-height: 100vh;
  padding: 16px;
}

.kanban-container {
  height: calc(100vh - 140px);
}

.kanban-column {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: #1e1e1e;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.column-header {
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 3px solid rgba(255, 255, 255, 0.1);
}

.header-orange {
  background: linear-gradient(135deg, #f57c00 0%, #ff9800 100%);
}

.header-blue {
  background: linear-gradient(135deg, #1976d2 0%, #2196f3 100%);
}

.header-green {
  background: linear-gradient(135deg, #388e3c 0%, #4caf50 100%);
}

.column-title {
  font-size: 1.5rem;
  font-weight: 900;
  letter-spacing: 2px;
  color: white;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
  flex: 1;
}

.count-badge {
  font-size: 1.2rem;
  font-weight: 700;
  padding: 8px 16px;
}

.column-content {
  flex: 1;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  text-align: center;
}

/* Filter select styling */
.filter-select {
  font-size: 1.1rem;
}

/* Animations */
.animated {
  animation-duration: 0.5s;
  animation-fill-mode: both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeOutDown {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}

.fadeInUp {
  animation-name: fadeInUp;
}

.fadeOutDown {
  animation-name: fadeOutDown;
}

/* Responsive adjustments */
@media (max-width: 1023px) {
  .kanban-container {
    height: auto;
  }

  .kanban-column {
    min-height: 400px;
    margin-bottom: 20px;
  }

  .column-content {
    height: 400px;
  }
}
</style>
