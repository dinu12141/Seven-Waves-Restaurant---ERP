<template>
  <div class="tracking-root">
    <!-- Animated background -->
    <div class="tracking-bg">
      <div class="bg-pulse" :class="pulseClass"></div>
    </div>

    <!-- Order ID + Table Info -->
    <div class="order-header text-center q-mb-xl">
      <div class="text-overline text-primary letter-spacing q-mb-xs">ORDER TRACKING</div>
      <div class="order-id">#{{ orderId }}</div>
      <div class="text-body2 text-grey-5 q-mt-xs">{{ tableLabel }}</div>
    </div>

    <!-- Status Banner (large icon + label for current step) -->
    <div class="status-banner q-mb-xl" :class="bannerClass">
      <div class="banner-icon-wrap">
        <div class="banner-icon-ring">
          <span class="banner-emoji">{{ currentStepData.emoji }}</span>
        </div>
        <div v-if="!isFinalStep" class="pulse-ring"></div>
      </div>
      <div class="banner-title">{{ currentStepData.label }}</div>
      <div class="banner-subtitle">{{ currentStepData.message }}</div>

      <!-- Estimated time countdown -->
      <div v-if="estimatedMinutes > 0" class="eta-chip q-mt-md">
        <q-icon name="schedule" size="14px" class="q-mr-xs" />
        Ready in ~{{ estimatedMinutes }} min
      </div>
    </div>

    <!-- Progress Timeline -->
    <div class="timeline q-mb-xl">
      <div v-for="(step, index) in trackingSteps" :key="step.status" class="timeline-row">
        <!-- Connector line above (except first) -->
        <div class="connector-wrap">
          <div
            class="connector-line"
            :class="{
              'connector-done': isStepCompleted(index),
              'connector-active': isStepActive(step.status) && index > 0,
            }"
          ></div>
        </div>

        <!-- Step node -->
        <div class="timeline-node-wrap">
          <div
            class="timeline-node"
            :class="{
              'node-done': isStepCompleted(index),
              'node-active': isStepActive(step.status),
              'node-pending': !isStepCompleted(index) && !isStepActive(step.status),
            }"
          >
            <q-icon v-if="isStepCompleted(index)" name="check" size="16px" color="white" />
            <span v-else class="node-emoji">{{ step.emoji }}</span>
          </div>
        </div>

        <!-- Step content -->
        <div
          class="timeline-content"
          :class="{
            'content-done': isStepCompleted(index),
            'content-active': isStepActive(step.status),
          }"
        >
          <div class="step-label">{{ step.label }}</div>
          <div class="step-caption">{{ step.caption }}</div>
        </div>
      </div>
    </div>

    <!-- Kitchen Status (Realtime KOT info) -->
    <div v-if="kotTickets && kotTickets.length > 0" class="kot-status-tray q-mb-xl">
      <div class="text-overline text-grey-7 q-mb-sm">KITCHEN STATUS</div>
      <div class="row q-col-gutter-sm">
        <div v-for="kot in kotTickets" :key="kot.id" class="col-6">
          <div class="kot-card" :class="`kot-${kot.status}`">
            <div class="row items-center no-wrap">
              <q-icon :name="getKotIcon(kot.status)" size="14px" class="q-mr-xs" />
              <div class="kot-label truncate">{{ getKitchenName(kot.kitchen_id) }}</div>
            </div>
            <div class="kot-status-text">{{ kot.status.replace('_', ' ') }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Order Items Summary -->
    <div class="order-summary q-mb-xl">
      <div class="summary-title q-mb-sm">Order Summary</div>
      <div class="summary-items">
        <div v-for="item in items" :key="item.id" class="summary-row">
          <span class="item-qty-badge">{{ item.qty }}×</span>
          <span class="item-name">{{ item.name }}</span>
          <span class="item-price">LKR {{ (item.price * item.qty).toLocaleString() }}</span>
        </div>
        <div class="summary-total-row">
          <span class="summary-total-label">Total</span>
          <span class="summary-total-price">LKR {{ totalAmount.toLocaleString() }}</span>
        </div>
      </div>
    </div>

    <!-- Call Waiter / Actions -->
    <div class="action-section column q-gutter-y-sm">
      <q-btn
        unelevated
        class="call-waiter-btn full-width"
        no-caps
        icon="notifications_active"
        label="Call Waiter"
      />
      <q-btn
        flat
        color="grey-6"
        class="full-width"
        no-caps
        size="sm"
        label="Back to Menu"
        icon="arrow_back"
        to="/menu"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  orderId: {
    type: String,
    required: true,
  },
  currentStatus: {
    type: String,
    required: true,
  },
  items: {
    type: Array,
    default: () => [],
  },
  tableName: {
    type: String,
    default: '',
  },
  totalAmount: {
    type: Number,
    default: 0,
  },
  kotTickets: {
    type: Array,
    default: () => [],
  },
})

const trackingSteps = [
  {
    status: 'pending_waiter',
    label: 'Pending Waiter',
    caption: 'Waiting for a server to confirm your order.',
    emoji: '⏳',
    message: 'A waiter will confirm your order shortly.',
    eta: 3,
    bannerClass: 'banner-pending',
  },
  {
    status: 'accepted',
    label: 'Order Accepted',
    caption: 'Your order has been confirmed by our team.',
    emoji: '✅',
    message: 'Great! Your order is confirmed.',
    eta: 15,
    bannerClass: 'banner-accepted',
  },
  {
    status: 'preparing',
    label: 'Preparing',
    caption: 'Our kitchen team is crafting your meal.',
    emoji: '👨‍🍳',
    message: 'Chefs are working their magic!',
    eta: 10,
    bannerClass: 'banner-preparing',
  },
  {
    status: 'ready',
    label: 'Ready to Serve',
    caption: 'Your food is ready! Waiter is on the way.',
    emoji: '🎉',
    message: 'Enjoy your meal!',
    eta: 0,
    bannerClass: 'banner-ready',
  },
]

const statusOrder = ['pending_waiter', 'accepted', 'preparing', 'ready', 'served']

const currentStatusIndex = computed(() => statusOrder.indexOf(props.currentStatus))
const currentStepData = computed(
  () => trackingSteps.find((s) => s.status === props.currentStatus) || trackingSteps[0],
)
const isFinalStep = computed(
  () => props.currentStatus === 'ready' || props.currentStatus === 'served',
)
const estimatedMinutes = computed(() => currentStepData.value?.eta || 0)
const tableLabel = computed(() => props.tableName || 'Your Table')

const bannerClass = computed(() => currentStepData.value?.bannerClass || 'banner-pending')
const pulseClass = computed(() => `pulse-${props.currentStatus?.replace('_', '-')}`)

function isStepActive(status) {
  return props.currentStatus === status
}

function isStepCompleted(index) {
  return currentStatusIndex.value > index
}

// Kitchen Helpers
function getKotIcon(status) {
  const map = {
    created: 'hourglass_empty',
    preparing: 'restaurant',
    ready: 'check_circle',
    cancelled: 'cancel',
  }
  return map[status] || 'help_outline'
}

function getKitchenName(id) {
  // In a real app, you'd have a list of kitchens.
  // For now, we show Kitchen + short ID
  return id ? `Kitchen ${id.slice(0, 4)}` : 'Kitchen'
}
</script>

<style lang="scss" scoped>
.tracking-root {
  position: relative;
}

.tracking-bg {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.bg-pulse {
  position: absolute;
  width: 500px;
  height: 500px;
  border-radius: 50%;
  top: -100px;
  left: 50%;
  transform: translateX(-50%);
  filter: blur(120px);
  opacity: 0.07;
  transition: background 1.5s ease;
}

.pulse-pending-waiter {
  background: radial-gradient(circle, #f59e0b, transparent);
}
.pulse-accepted {
  background: radial-gradient(circle, #22c55e, transparent);
}
.pulse-preparing {
  background: radial-gradient(circle, #f97316, transparent);
}
.pulse-ready {
  background: radial-gradient(circle, #8b5cf6, transparent);
}

.letter-spacing {
  letter-spacing: 3px;
  font-size: 0.65rem;
  font-weight: 700;
}

.order-id {
  font-size: 1.8rem;
  font-weight: 800;
  color: white;
  letter-spacing: -0.5px;
  font-variant-numeric: tabular-nums;
}

// ── Status Banner ──────────────────────────
.status-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 24px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  position: relative;
  overflow: hidden;
  transition: all 0.5s ease;
}

.banner-pending {
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(245, 158, 11, 0.2);
}
.banner-accepted {
  background: rgba(34, 197, 94, 0.06);
  border-color: rgba(34, 197, 94, 0.2);
}
.banner-preparing {
  background: rgba(249, 115, 22, 0.06);
  border-color: rgba(249, 115, 22, 0.2);
}
.banner-ready {
  background: rgba(139, 92, 246, 0.06);
  border-color: rgba(139, 92, 246, 0.2);
}

.banner-icon-wrap {
  position: relative;
  margin-bottom: 16px;
}

.banner-icon-ring {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.banner-emoji {
  font-size: 36px;
  line-height: 1;
}

.pulse-ring {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid rgba(249, 115, 22, 0.4);
  animation: pulseRing 2s ease-in-out infinite;
  z-index: 0;
}

@keyframes pulseRing {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.12);
    opacity: 0;
  }
}

.banner-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: white;
  margin-bottom: 6px;
}

.banner-subtitle {
  font-size: 0.88rem;
  color: #9ca3af;
}

.eta-chip {
  display: inline-flex;
  align-items: center;
  background: rgba(249, 115, 22, 0.15);
  border: 1px solid rgba(249, 115, 22, 0.3);
  color: #fb923c;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

// ── Timeline ──────────────────────────────
.timeline {
  display: flex;
  flex-direction: column;
}

.timeline-row {
  display: grid;
  grid-template-columns: 24px 40px 1fr;
  align-items: center;
  min-height: 60px;

  &:last-child {
    .connector-wrap {
      visibility: hidden;
    }
  }
}

.connector-wrap {
  display: flex;
  justify-content: center;
  height: 100%;
  padding-top: 30px;
}

.connector-line {
  width: 2px;
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  transition: background 0.5s ease;
  border-radius: 2px;
}

.connector-done {
  background: #22c55e;
}

.connector-active {
  background: linear-gradient(to bottom, #22c55e, rgba(249, 115, 22, 0.5));
}

.timeline-node-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
}

.timeline-node {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  z-index: 2;
}

.node-pending {
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid rgba(255, 255, 255, 0.1);
}

.node-active {
  background: linear-gradient(135deg, #f97316, #ef4444);
  box-shadow: 0 0 20px rgba(249, 115, 22, 0.6);
  transform: scale(1.15);
  border: none;
}

.node-done {
  background: #22c55e;
  border: none;
}

.node-emoji {
  font-size: 1rem;
  line-height: 1;
  filter: grayscale(0.4);
}

.timeline-content {
  padding-left: 14px;
  transition: all 0.3s ease;
  opacity: 0.35;
}

.content-active {
  opacity: 1;
}

.content-done {
  opacity: 0.7;
}

.step-label {
  font-size: 0.9rem;
  font-weight: 700;
  color: #e2e8f0;
  line-height: 1.3;
}

.step-caption {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 2px;
}

// ── Order Summary ──────────────────────────
.order-summary {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 16px;
}

.summary-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.item-qty-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: #fb923c;
  min-width: 24px;
}

.item-name {
  flex: 1;
  font-size: 0.82rem;
  color: #d1d5db;
}

.item-price {
  font-size: 0.82rem;
  font-weight: 600;
  color: #9ca3af;
}

.summary-total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  margin-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.summary-total-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #e2e8f0;
}

.summary-total-price {
  font-size: 1rem;
  font-weight: 800;
  color: #fb923c;
}

// ── Kitchen Status ─────────────────────────
.kot-status-tray {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  padding: 12px;
}

.kot-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 8px 10px;
  transition: all 0.3s ease;
}

.kot-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #9ca3af;
  text-transform: uppercase;
}

.kot-status-text {
  font-size: 0.75rem;
  font-weight: 600;
  margin-top: 2px;
  text-transform: capitalize;
}

.kot-created {
  border-color: rgba(245, 158, 11, 0.2);
  .kot-status-text {
    color: #f59e0b;
  }
}
.kot-preparing {
  border-color: rgba(59, 130, 246, 0.2);
  .kot-status-text {
    color: #3b82f6;
  }
}
.kot-ready {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.3);
  .kot-status-text {
    color: #22c55e;
  }
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ── Actions ────────────────────────────────
.call-waiter-btn {
  background: rgba(249, 115, 22, 0.12) !important;
  border: 1px solid rgba(249, 115, 22, 0.35) !important;
  color: #fb923c !important;
  border-radius: 14px !important;
  height: 48px;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(249, 115, 22, 0.2) !important;
  }
}
</style>
