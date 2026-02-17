<template>
  <q-card class="kitchen-ticket-card" :class="cardClass" flat bordered>
    <!-- Card Header with Order Number and Timer -->
    <q-card-section class="ticket-header" :class="headerClass">
      <div class="row items-center justify-between no-wrap">
        <div class="order-number">#{{ order.orderId }}</div>
        <div class="timer-display row items-center">
          <q-icon name="schedule" size="32px" class="q-mr-xs" />
          <span class="timer-text">{{ order.timeElapsed }}</span>
        </div>
      </div>
      <div class="row items-center q-mt-sm">
        <q-badge :color="tableColor" class="table-badge" text-color="white">
          {{ order.table !== '-' ? `Table ${order.table}` : 'Takeaway' }}
        </q-badge>
        <q-chip
          v-if="order.type"
          dense
          :color="typeColor"
          text-color="white"
          class="q-ml-sm"
          icon="restaurant"
        >
          {{ order.type }}
        </q-chip>
      </div>
    </q-card-section>

    <q-separator :color="separatorColor" />

    <!-- Items List -->
    <q-card-section class="ticket-items">
      <div class="items-title q-mb-md">ORDER ITEMS</div>
      <div v-for="(item, idx) in order.items" :key="idx" class="item-row">
        <div class="item-qty">{{ item.qty }}x</div>
        <div class="item-details">
          <div class="item-name">{{ item.name }}</div>
          <div v-if="item.notes" class="item-notes">
            <q-icon name="sticky_note_2" size="18px" class="q-mr-xs" />
            {{ item.notes }}
          </div>
        </div>
      </div>
    </q-card-section>

    <q-separator :color="separatorColor" />

    <!-- Action Buttons -->
    <q-card-actions class="ticket-actions">
      <q-btn
        v-if="order.status === 'Pending'"
        unelevated
        color="blue"
        text-color="white"
        size="lg"
        class="action-btn full-width"
        @click="$emit('start-cooking', order)"
      >
        <q-icon name="soup_kitchen" size="28px" class="q-mr-sm" />
        <span class="action-btn-text">START COOKING</span>
      </q-btn>
      <q-btn
        v-else-if="order.status === 'Cooking'"
        unelevated
        color="green"
        text-color="white"
        size="lg"
        class="action-btn full-width"
        @click="$emit('mark-ready', order)"
      >
        <q-icon name="check_circle" size="28px" class="q-mr-sm" />
        <span class="action-btn-text">MARK READY</span>
      </q-btn>
      <q-btn
        v-else-if="order.status === 'Ready'"
        unelevated
        color="grey-7"
        text-color="white"
        size="lg"
        class="action-btn full-width"
        @click="$emit('complete', order)"
      >
        <q-icon name="done_all" size="28px" class="q-mr-sm" />
        <span class="action-btn-text">COMPLETE</span>
      </q-btn>
    </q-card-actions>
  </q-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  order: {
    type: Object,
    required: true,
  },
})

defineEmits(['start-cooking', 'mark-ready', 'complete'])

const cardClass = computed(() => {
  switch (props.order.status) {
    case 'Pending':
      return 'status-pending'
    case 'Cooking':
      return 'status-cooking'
    case 'Ready':
      return 'status-ready'
    default:
      return 'status-pending'
  }
})

const headerClass = computed(() => {
  switch (props.order.status) {
    case 'Pending':
      return 'header-orange'
    case 'Cooking':
      return 'header-blue'
    case 'Ready':
      return 'header-green'
    default:
      return 'header-orange'
  }
})

const separatorColor = computed(() => {
  switch (props.order.status) {
    case 'Pending':
      return 'orange-6'
    case 'Cooking':
      return 'blue-6'
    case 'Ready':
      return 'green-6'
    default:
      return 'grey-6'
  }
})

const tableColor = computed(() => {
  return props.order.table !== '-' ? 'primary' : 'orange-8'
})

const typeColor = computed(() => {
  switch (props.order.type?.toLowerCase()) {
    case 'dine-in':
      return 'teal-7'
    case 'takeaway':
      return 'orange-7'
    case 'delivery':
      return 'purple-7'
    default:
      return 'grey-7'
  }
})
</script>

<style scoped>
.kitchen-ticket-card {
  background: #1e1e1e;
  color: white;
  border-width: 3px;
  transition: all 0.3s ease;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.kitchen-ticket-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.kitchen-ticket-card {
  animation: card-flash 0.8s ease-out;
}

@keyframes card-flash {
  0% {
    background-color: rgba(255, 255, 255, 0.8);
    transform: scale(1.02);
  }
  100% {
    background-color: #1e1e1e;
    transform: scale(1);
  }
}

/* Status-based card borders */
.status-pending {
  border-color: #ff9800;
}

.status-cooking {
  border-color: #2196f3;
}

.status-ready {
  border-color: #4caf50;
}

/* Header Styling */
.ticket-header {
  padding: 20px;
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

.order-number {
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: 1px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.timer-display {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 16px;
  border-radius: 8px;
}

.timer-text {
  font-size: 2rem;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  letter-spacing: 2px;
}

.table-badge {
  font-size: 1.1rem;
  font-weight: 700;
  padding: 8px 16px;
}

/* Items Section */
.ticket-items {
  padding: 24px;
  flex: 1;
  background: #2a2a2a;
}

.items-title {
  font-size: 1rem;
  font-weight: 700;
  color: #9e9e9e;
  letter-spacing: 2px;
}

.item-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border-left: 4px solid rgba(255, 255, 255, 0.1);
}

.item-qty {
  font-size: 2rem;
  font-weight: 900;
  color: #ff9800;
  min-width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-details {
  flex: 1;
}

.item-name {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 6px;
  color: #f5f5f5;
}

.item-notes {
  font-size: 1.1rem;
  color: #ffd54f;
  display: flex;
  align-items: center;
  font-style: italic;
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 213, 79, 0.1);
  border-radius: 4px;
}

/* Action Buttons */
.ticket-actions {
  padding: 16px;
  background: #1e1e1e;
}

.action-btn {
  height: 64px;
  font-weight: 700;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.action-btn:active {
  transform: scale(0.98);
}

.action-btn-text {
  font-size: 1.3rem;
  letter-spacing: 1px;
}

/* Touch optimization - larger touch targets */
@media (hover: none) and (pointer: coarse) {
  .action-btn {
    height: 72px;
  }

  .item-row {
    padding: 16px;
  }
}

/* Responsive adjustments */
@media (max-width: 1200px) {
  .order-number {
    font-size: 2rem;
  }

  .timer-text {
    font-size: 1.6rem;
  }

  .item-name {
    font-size: 1.3rem;
  }

  .item-qty {
    font-size: 1.6rem;
  }
}
</style>
