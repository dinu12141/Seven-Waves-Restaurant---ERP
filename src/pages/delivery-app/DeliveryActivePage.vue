<template>
  <q-page class="delivery-active-page">

    <!-- ── No active delivery ──────────────────────── -->
    <div v-if="!currentDelivery" class="empty-state">
      <q-icon name="local_shipping" size="64px" color="grey-7" />
      <div class="empty-title">No active delivery</div>
      <div class="empty-sub">Accept a delivery from the queue to get started.</div>
      <q-btn
        flat no-caps color="purple-4" label="Go to Queue" icon="arrow_back"
        class="q-mt-md" @click="$router.push('/delivery-app')"
      />
    </div>

    <!-- ── Active Delivery Detail ──────────────────── -->
    <template v-else>
      <!-- Order Header -->
      <div class="order-header">
        <div class="order-header__left">
          <div class="order-number">#{{ currentDelivery.orderNumber }}</div>
          <span class="source-badge">🌐 WEBSITE</span>
        </div>
        <q-chip
          dense
          :color="statusColor(currentDelivery.status)"
          text-color="white"
          class="status-chip"
        >
          {{ statusLabel(currentDelivery.status) }}
        </q-chip>
      </div>

      <!-- Progress Stepper -->
      <div class="progress-stepper">
        <div
          v-for="(step, i) in steps"
          :key="step.key"
          class="step"
          :class="{
            'step--done': isStepDone(step.key),
            'step--current': isStepCurrent(step.key),
          }"
        >
          <div class="step__circle">
            <q-icon v-if="isStepDone(step.key)" name="check" size="14px" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <div class="step__label">{{ step.label }}</div>
          <div class="step__connector" v-if="i < steps.length - 1" />
        </div>
      </div>

      <!-- Kitchen Status Alert -->
      <div
        v-if="orderIsReady"
        class="kitchen-alert"
      >
        <q-icon name="local_fire_department" size="28px" color="green" />
        <div class="kitchen-alert__text">
          <div class="kitchen-alert__title">🔔 Food is Ready!</div>
          <div class="kitchen-alert__sub">Go to the kitchen to pick up this order.</div>
        </div>
      </div>

      <!-- Customer Details -->
      <div class="info-section">
        <div class="section-heading">
          <q-icon name="person" size="16px" color="purple-4" />
          Customer
        </div>
        <div class="info-grid">
          <div class="info-item" v-if="currentDelivery.customer_name">
            <span class="info-label">Name</span>
            <span class="info-value">{{ currentDelivery.customer_name }}</span>
          </div>
          <div class="info-item" v-if="currentDelivery.customer_phone">
            <span class="info-label">Phone</span>
            <a :href="'tel:' + currentDelivery.customer_phone" class="info-value info-value--link">
              📞 {{ currentDelivery.customer_phone }}
            </a>
          </div>
          <div class="info-item info-item--full" v-if="currentDelivery.delivery_address">
            <span class="info-label">Address</span>
            <span class="info-value">{{ currentDelivery.delivery_address }}</span>
          </div>
          <div class="info-item info-item--full" v-if="currentDelivery.delivery_notes">
            <span class="info-label">Notes</span>
            <span class="info-value info-value--note">{{ currentDelivery.delivery_notes }}</span>
          </div>
        </div>
      </div>

      <!-- Order Items -->
      <div class="info-section" v-if="currentDelivery.items && currentDelivery.items.length">
        <div class="section-heading">
          <q-icon name="restaurant_menu" size="16px" color="orange-5" />
          Items ({{ currentDelivery.items.length }})
        </div>
        <div class="items-list">
          <div v-for="item in currentDelivery.items" :key="item.id" class="item-row">
            <span class="item-qty">{{ item.quantity }}×</span>
            <span class="item-name">{{ item.menu_items?.name || 'Item' }}</span>
            <span class="item-price">Rs. {{ Number(item.total_price || 0).toFixed(2) }}</span>
          </div>
        </div>
        <div class="order-total">
          <span>Total</span>
          <span class="total-value">Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="action-section">
        <!-- Picked Up -->
        <q-btn
          v-if="currentDelivery.status === 'accepted'"
          unelevated no-caps
          color="blue-8"
          label="Mark Picked Up"
          icon="local_shipping"
          class="action-btn"
          :loading="store.processing"
          :disable="!orderIsReady && currentDelivery.orderStatus !== 'ready'"
          @click="handlePickUp"
        >
          <q-tooltip v-if="!orderIsReady && currentDelivery.orderStatus !== 'ready'">
            Wait for kitchen to mark order as ready
          </q-tooltip>
        </q-btn>

        <!-- Delivered -->
        <q-btn
          v-if="currentDelivery.status === 'picked_up'"
          unelevated no-caps
          color="green-8"
          label="Mark Delivered"
          icon="check_circle"
          class="action-btn"
          :loading="store.processing"
          @click="handleDeliver"
        />
      </div>

      <!-- Timing Info -->
      <div class="timing-section">
        <div class="timing-item" v-if="currentDelivery.assigned_at">
          <span class="timing-label">Assigned</span>
          <span class="timing-value">{{ formatTime(currentDelivery.assigned_at) }}</span>
        </div>
        <div class="timing-item" v-if="currentDelivery.accepted_at">
          <span class="timing-label">Accepted</span>
          <span class="timing-value">{{ formatTime(currentDelivery.accepted_at) }}</span>
        </div>
        <div class="timing-item" v-if="currentDelivery.picked_up_at">
          <span class="timing-label">Picked Up</span>
          <span class="timing-value">{{ formatTime(currentDelivery.picked_up_at) }}</span>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useDeliveryStore } from 'src/stores/deliveryStore'

const store = useDeliveryStore()

// If no active delivery is set, try to find one from accepted assignments
onMounted(() => {
  if (!store.activeDelivery && store.acceptedAssignments.length) {
    store.loadActiveDelivery(store.acceptedAssignments[0].id)
  }
})

const currentDelivery = computed(() => {
  // First check store's active delivery
  if (store.activeDelivery) return store.activeDelivery
  // Fallback: first accepted assignment
  if (store.acceptedAssignments.length) return store.acceptedAssignments[0]
  return null
})

const orderIsReady = computed(() => {
  if (!currentDelivery.value) return false
  return currentDelivery.value.orderStatus === 'ready'
})

const steps = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'delivered', label: 'Delivered' },
]

const statusOrder = ['accepted', 'preparing', 'ready', 'picked_up', 'delivered']

function isStepDone(stepKey) {
  if (!currentDelivery.value) return false
  const delivery = currentDelivery.value

  // Map delivery status and order status to a combined progress
  const deliveryIdx = statusOrder.indexOf(delivery.status)
  const orderStatus = delivery.orderStatus
  const stepIdx = statusOrder.indexOf(stepKey)

  // For 'preparing' and 'ready', use order status
  if (stepKey === 'preparing') {
    return ['preparing', 'ready', 'served', 'invoiced', 'paid'].includes(orderStatus) ||
      deliveryIdx >= statusOrder.indexOf('picked_up')
  }
  if (stepKey === 'ready') {
    return ['ready', 'served', 'invoiced', 'paid'].includes(orderStatus) ||
      deliveryIdx >= statusOrder.indexOf('picked_up')
  }

  return deliveryIdx > stepIdx
}

function isStepCurrent(stepKey) {
  if (!currentDelivery.value) return false
  const delivery = currentDelivery.value

  if (stepKey === 'preparing') {
    return delivery.orderStatus === 'preparing' && delivery.status === 'accepted'
  }
  if (stepKey === 'ready') {
    return delivery.orderStatus === 'ready' && delivery.status === 'accepted'
  }

  return delivery.status === stepKey
}

function statusColor(status) {
  const map = {
    pending_rider: 'orange-8',
    accepted: 'blue-8',
    picked_up: 'cyan-8',
    delivered: 'green-8',
    cancelled: 'red-8',
  }
  return map[status] || 'grey-7'
}

function statusLabel(status) {
  const map = {
    pending_rider: 'Pending',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}

function formatTime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

async function handlePickUp() {
  if (!currentDelivery.value) return
  await store.pickUp(currentDelivery.value.id)
}

async function handleDeliver() {
  if (!currentDelivery.value) return
  await store.deliver(currentDelivery.value.id)
}
</script>

<style lang="scss" scoped>
.delivery-active-page {
  padding: 16px;
  min-height: 100vh;
}

// ── Empty ───────────────────────────────
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 80px 20px;
  text-align: center;
}
.empty-title { font-size: 16px; font-weight: 700; color: #bdbdbd; }
.empty-sub { font-size: 12px; color: #757575; max-width: 260px; }

// ── Order Header ────────────────────────
.order-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.order-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.order-number {
  font-size: 22px;
  font-weight: 800;
  color: #e8eaf0;
}
.source-badge {
  font-size: 10px;
  font-weight: 700;
  color: #ce93d8;
  background: rgba(206, 147, 216, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
}
.status-chip { font-size: 11px !important; }

// ── Progress Stepper ────────────────────
.progress-stepper {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 8px;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  position: relative;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  position: relative;

  &__circle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #757575;
    transition: all 0.3s ease;
    z-index: 1;
    background: #090c14;
  }

  &__label {
    font-size: 9px;
    color: #757575;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  &__connector {
    position: absolute;
    top: 14px;
    left: 62%;
    width: 76%;
    height: 2px;
    background: rgba(255, 255, 255, 0.08);
    z-index: 0;
  }

  &--done {
    .step__circle {
      background: #66bb6a;
      border-color: #66bb6a;
      color: white;
    }
    .step__label { color: #a5d6a7; }
    .step__connector { background: #66bb6a; }
  }

  &--current {
    .step__circle {
      background: #42a5f5;
      border-color: #42a5f5;
      color: white;
      box-shadow: 0 0 12px rgba(66, 165, 245, 0.5);
      animation: pulse 2s ease-in-out infinite;
    }
    .step__label { color: #64b5f6; font-weight: 800; }
  }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 8px rgba(66, 165, 245, 0.3); }
  50% { box-shadow: 0 0 18px rgba(66, 165, 245, 0.7); }
}

// ── Kitchen Alert ───────────────────────
.kitchen-alert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(76, 175, 80, 0.12);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 12px;
  margin-bottom: 16px;
  animation: alertPulse 1.5s ease-in-out infinite;
}
.kitchen-alert__title {
  font-size: 14px;
  font-weight: 800;
  color: #a5d6a7;
}
.kitchen-alert__sub {
  font-size: 11px;
  color: #81c784;
  margin-top: 2px;
}
@keyframes alertPulse {
  0%, 100% { border-color: rgba(76, 175, 80, 0.3); }
  50% { border-color: rgba(76, 175, 80, 0.7); }
}

// ── Info Section ────────────────────────
.info-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #bdbdbd;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.info-item {
  &--full { grid-column: 1 / -1; }
}
.info-label {
  display: block;
  font-size: 9px;
  color: #757575;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
}
.info-value {
  display: block;
  font-size: 13px;
  color: #e0e0e0;
  &--link {
    color: #64b5f6;
    text-decoration: none;
    &:active { color: #90caf9; }
  }
  &--note {
    font-size: 12px;
    font-style: italic;
    color: #9e9e9e;
  }
}

// ── Items List ──────────────────────────
.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  &:last-child { border-bottom: none; }
}
.item-qty {
  font-size: 12px;
  font-weight: 700;
  color: #ce93d8;
  min-width: 24px;
}
.item-name {
  flex: 1;
  font-size: 13px;
  color: #e0e0e0;
}
.item-price {
  font-size: 12px;
  color: #a5d6a7;
  font-weight: 600;
}
.order-total {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 14px;
  font-weight: 800;
  color: #e8eaf0;
}
.total-value { color: #a5d6a7; }

// ── Action Section ──────────────────────
.action-section {
  margin: 20px 0;
}
.action-btn {
  width: 100%;
  height: 48px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 12px;
  letter-spacing: 0.3px;
}

// ── Timing ──────────────────────────────
.timing-section {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  margin-bottom: 16px;
}
.timing-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.timing-label {
  font-size: 9px;
  color: #616161;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.timing-value {
  font-size: 12px;
  color: #bdbdbd;
  font-weight: 600;
}
</style>
