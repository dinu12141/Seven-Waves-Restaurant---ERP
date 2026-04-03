<template>
  <div class="track-root">
    <!-- Background -->
    <div class="bg-layer">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
    </div>

    <!-- Top Bar -->
    <div class="top-bar">
      <q-btn flat round dense icon="arrow_back" color="white" @click="goBack" />
      <div class="top-bar-title">Order Tracking</div>
      <q-btn flat round dense icon="loyalty" color="amber" @click="$router.push('/loyalty')">
        <q-tooltip>My Loyalty Card</q-tooltip>
      </q-btn>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <q-spinner-dots color="orange" size="52px" />
      <div class="text-grey-5 q-mt-md">Loading order status…</div>
    </div>

    <!-- Not found -->
    <div v-else-if="!order" class="empty-state">
      <q-icon name="search_off" size="64px" color="grey-7" />
      <div class="text-h6 text-grey-5 q-mt-md">Order not found</div>
      <q-btn flat color="orange" no-caps label="Go Back" @click="goBack" class="q-mt-md" />
    </div>

    <!-- Order content -->
    <div v-else class="track-content">
      <!-- Order summary card -->
      <div class="order-card">
        <div class="order-no">
          <span class="order-label">ORDER</span>
          <span class="order-number">#{{ order.order_number }}</span>
        </div>

        <div
          class="order-time"
          v-if="
            order.status !== 'served' && order.status !== 'paid' && order.status !== 'cancelled'
          "
        >
          <span class="time-label">Elapsed Time</span>
          <span class="time-value"
            ><q-icon name="schedule" size="14px" class="q-mr-xs" />{{ elapsedTime }}</span
          >
        </div>

        <div class="order-total">
          <span class="total-label">Total</span>
          <span class="total-value">LKR {{ Number(order.total_amount).toLocaleString() }}</span>
        </div>
      </div>

      <!-- Status timeline -->
      <div class="timeline-section">
        <div class="section-label">Order Progress</div>

        <div class="timeline">
          <div
            v-for="(step, idx) in statusSteps"
            :key="step.key"
            class="timeline-step"
            :class="{
              completed: getStepState(idx) === 'done',
              active: getStepState(idx) === 'active',
              pending: getStepState(idx) === 'pending',
            }"
          >
            <div
              class="step-connector"
              v-if="idx > 0"
              :class="{ filled: getStepState(idx) !== 'pending' }"
            />
            <div class="step-dot-wrap">
              <div
                class="step-dot"
                :style="
                  getStepState(idx) === 'active' ? `box-shadow: 0 0 0 6px ${step.color}22` : ''
                "
              >
                <q-icon
                  :name="getStepState(idx) === 'done' ? 'check' : step.icon"
                  size="16px"
                  color="white"
                />
                <div v-if="getStepState(idx) === 'active'" class="pulse-ring" />
              </div>
            </div>
            <div class="step-meta">
              <div class="step-name" :class="getStepState(idx)">{{ step.label }}</div>
              <div v-if="getStepState(idx) === 'active'" class="step-sub active-sub">
                In progress...
              </div>
              <div v-else-if="getStepState(idx) === 'done'" class="step-sub done-sub">
                Completed ✓
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ordered items -->
      <div class="items-section">
        <div class="section-label">Your Items</div>
        <div class="smart-items-grid">
          <div v-for="item in order.order_items" :key="item.id" class="smart-item-card">
            <div class="item-img-banner">
              <img
                v-if="getItemMeta(item).image_url"
                :src="getItemMeta(item).image_url"
                :alt="getItemMeta(item).name"
              />
              <div v-else class="img-placeholder">
                <q-icon name="restaurant" size="28px" color="grey-7" />
              </div>
              <div class="smart-item-qty">×{{ item.quantity }}</div>
            </div>

            <div class="smart-item-info">
              <div class="item-name-row">
                <div class="smart-name">{{ getItemMeta(item).name ?? 'Item' }}</div>
              </div>
              <div class="item-price-status">
                <span class="smart-price">LKR {{ Number(item.total_price).toLocaleString() }}</span>
                <span class="smart-status" :class="item.status">
                  {{ item.status.replace('_', ' ') }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Live Driver Map (delivery orders only) ────────────── -->
      <div
        v-if="isDeliveryOrder && isDriverOnWay && order.delivery_lat && order.delivery_lng"
        class="live-map-section"
      >
        <div class="section-label">
          <q-icon name="local_shipping" size="14px" class="q-mr-xs" style="color:#f97316" />
          Live Driver Location
          <span class="live-pulse" />
        </div>
        <div class="live-map-wrap">
          <GoogleMapTracker
            :api-key="GOOGLE_MAPS_KEY"
            :channel-name="driverChannel"
            :dest-lat="order.delivery_lat"
            :dest-lng="order.delivery_lng"
            :customer-name="'Destination'"
            :customer-address="order.delivery_address || ''"
            :broadcast-own-position="false"
            style="height:260px;border-radius:16px;overflow:hidden;"
          />
        </div>
      </div>

      <!-- Loyalty points earned -->
      <div v-if="order.status === 'paid' && customer.isLoggedIn" class="loyalty-earned">
        <q-icon name="stars" size="20px" color="amber" class="q-mr-sm" />
        <div>
          <div class="loyalty-earned-title">Points Earned!</div>
          <div class="loyalty-earned-sub">Check your loyalty card for your new balance.</div>
        </div>
        <q-btn
          flat
          no-caps
          size="sm"
          color="amber"
          label="View Card"
          @click="$router.push('/loyalty')"
          class="q-ml-auto"
        />
      </div>

      <!-- Place another order button -->
      <div class="bottom-actions">
        <q-btn
          unelevated
          no-caps
          class="order-again-btn full-width"
          icon="add_shopping_cart"
          label="Order More Items"
          @click="goToMenu"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GoogleMapTracker from 'src/components/delivery/GoogleMapTracker.vue'

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
import {
  getOrderStatus,
  subscribeToOrder,
  unsubscribeFromOrder,
  ORDER_STATUS_STEPS,
  getStatusIndex,
} from 'src/services/orderService'
import { useTableSessionStore } from 'src/stores/tableSessionStore'
import { useCustomerStore } from 'src/stores/customerStore'

const route = useRoute()
const router = useRouter()
const session = useTableSessionStore()
const customer = useCustomerStore()

// Support both /menu/track/:orderId and /table/:sessionToken/track/:orderId
const orderId = computed(() => String(route.params.orderId ?? ''))
// Prefer route param token (from QR session URL), fall back to store
const routeToken = computed(() =>
  route.params.sessionToken ? String(route.params.sessionToken) : null,
)
const backToken = computed(() => routeToken.value ?? session.sessionToken)

const loading = ref(true)
const order = ref(null)
const now = ref(new Date())
let channel = null
let pollTimer = null
let clockTimer = null

// Filter steps based on whether this is a delivery or dine-in order
const isDeliveryOrder = computed(() => {
  if (!order.value) return false
  return order.value.order_type === 'delivery' || order.value.order_type === 'website_delivery'
})

// Show live map when driver has picked up and is heading to customer
const isDriverOnWay = computed(() => {
  if (!order.value) return false
  return ['picked_up', 'out_for_delivery'].includes(order.value.status)
})

// Broadcast channel name — must match what GoogleMapTracker (driver) uses
const driverChannel = computed(() => {
  return order.value?.id ? `delivery:order-${order.value.id}` : ''
})



const statusSteps = computed(() => {
  if (isDeliveryOrder.value) {
    // Delivery orders: show delivery-specific steps, hide 'served'
    return ORDER_STATUS_STEPS.filter((s) => s.key !== 'invoiced' && s.key !== 'served')
  }
  // Dine-in / takeaway: hide delivery-specific steps
  return ORDER_STATUS_STEPS.filter(
    (s) =>
      s.key !== 'invoiced' &&
      s.key !== 'picked_up' &&
      s.key !== 'out_for_delivery' &&
      s.key !== 'delivered',
  )
})

const currentStatusIdx = computed(() => {
  if (!order.value) return -1
  return getStatusIndex(order.value.status)
})

const elapsedTime = computed(() => {
  if (!order.value?.created_at) return '00:00'
  const diff = now.value.getTime() - new Date(order.value.created_at).getTime()
  if (diff < 0) return '00:00'

  const m = Math.floor(diff / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
})

function getStepState(idx) {
  const cur = currentStatusIdx.value
  if (cur === -1) return 'pending'
  if (idx < cur) return 'done'
  if (idx === cur) return 'active'
  return 'pending'
}

// Safely resolve menu_items (Supabase may return array OR object)
function getItemMeta(item) {
  const mi = item.menu_items
  if (!mi) return { name: null, image_url: null }
  if (Array.isArray(mi)) return mi[0] || { name: null, image_url: null }
  return mi
}

async function loadOrder() {
  if (!orderId.value) return
  loading.value = true
  order.value = await getOrderStatus(orderId.value)
  loading.value = false
}

function goBack() {
  const token = backToken.value
  if (token) {
    router.replace('/table/' + encodeURIComponent(token) + '/menu')
  } else {
    router.replace('/menu')
  }
}

function goToMenu() {
  const token = backToken.value
  if (token) {
    router.push('/table/' + encodeURIComponent(token) + '/menu')
  } else {
    router.push('/menu')
  }
}

onMounted(async () => {
  await loadOrder()

  if (orderId.value) {
    channel = subscribeToOrder(orderId.value, (updated) => {
      if (order.value) {
        Object.assign(order.value, updated)
      }
    })

    // Polling fallback every 15s in case realtime WS is blocked
    pollTimer = setInterval(async () => {
      const fresh = await getOrderStatus(orderId.value)
      if (fresh && order.value) {
        Object.assign(order.value, fresh)
      }
    }, 15_000)

    // UI Clock
    clockTimer = setInterval(() => {
      now.value = new Date()
    }, 1000)
  }
})

onUnmounted(async () => {
  if (channel) {
    await unsubscribeFromOrder(channel)
    channel = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<style lang="scss" scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

.track-root {
  background: #0d0d14;
  min-height: 100dvh;
  font-family: 'Inter', sans-serif;
  position: relative;
}

.bg-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.08;
  &--1 {
    width: 480px;
    height: 480px;
    background: radial-gradient(circle, #f97316 0%, transparent 70%);
    top: -150px;
    left: -150px;
  }
  &--2 {
    width: 340px;
    height: 340px;
    background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
    bottom: -80px;
    right: -80px;
  }
}

// Top bar
.top-bar {
  position: sticky;
  top: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 58px;
  background: rgba(13, 13, 20, 0.94);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  gap: 8px;
}
.top-bar-title {
  flex: 1;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}

// States
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

// Content
.track-content {
  position: relative;
  z-index: 1;
  padding: 20px 16px 100px;
  max-width: 560px;
  margin: 0 auto;
}

// Order card
.order-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 18px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}
.order-no {
  display: flex;
  flex-direction: column;
}
.order-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: #6b7280;
}
.order-number {
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  margin-top: 2px;
}
.order-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.time-label {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 1px;
  color: #9ca3af;
  text-transform: uppercase;
}
.time-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
}

.order-total {
  text-align: right;
}
.total-label {
  font-size: 0.75rem;
  color: #6b7280;
  display: block;
}
.total-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: #fb923c;
}

// Section label
.section-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: #6b7280;
  text-transform: uppercase;
  margin-bottom: 16px;
}

// Timeline
.timeline-section {
  margin-bottom: 28px;
}

.timeline {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin: 0 -16px;
  padding-left: 16px;
  padding-right: 16px;

  /* Hide scrollbar */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.timeline-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: relative;
  flex: 1;
  min-width: 90px;
  text-align: center;
  padding-bottom: 0;
}

.step-connector {
  position: absolute;
  right: 50%;
  top: 19px;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.07);
  transform: translateY(-50%);
  z-index: 0;

  &.filled {
    background: linear-gradient(90deg, #f97316, rgba(249, 115, 22, 0.3));
  }
}

.step-dot-wrap {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.step-dot {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #1a1a2e;
  border: 2px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.3s ease;

  .completed & {
    background: linear-gradient(135deg, #f97316, #ef4444);
    border-color: transparent;
  }
  .active & {
    background: linear-gradient(135deg, #f97316, #dc2626);
    border-color: transparent;
  }
}

.pulse-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #f97316;
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 0;
    transform: scale(1.32);
  }
}

.step-meta {
  padding-top: 0;
}

.step-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: #6b7280;
  line-height: 1.2;

  &.done {
    color: #d1d5db;
  }
  &.active {
    color: #fff;
  }
}

.step-sub {
  font-size: 0.62rem;
  margin-top: 4px;
}
.active-sub {
  color: #fb923c;
}
.done-sub {
  color: #10b981;
}

// Order items (Smart Grid)
.items-section {
  margin-bottom: 24px;
}

.smart-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}

.smart-item-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
  }
}

.item-img-banner {
  height: 100px;
  width: 100%;
  position: relative;
  background: rgba(0, 0, 0, 0.3);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .img-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.02);
  }
}

.smart-item-qty {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.smart-item-info {
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.smart-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e5e7eb;
  line-height: 1.3;
  margin-bottom: 8px;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-price-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

.smart-price {
  font-size: 0.85rem;
  font-weight: 800;
  color: #fb923c;
}

.smart-status {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 3px 6px;
  border-radius: 8px;
  text-transform: capitalize;
  white-space: nowrap;

  &.queued {
    background: rgba(107, 114, 128, 0.15);
    color: #9ca3af;
  }
  &.sent_to_kitchen {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
  }
  &.preparing {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
  }
  &.ready {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }
  &.served {
    background: rgba(6, 182, 212, 0.15);
    color: #22d3ee;
  }
}

// Loyalty earned
.loyalty-earned {
  display: flex;
  align-items: center;
  background: rgba(251, 191, 36, 0.07);
  border: 1px solid rgba(251, 191, 36, 0.18);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 24px;
}
.loyalty-earned-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #fbbf24;
}
.loyalty-earned-sub {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 2px;
}

// Bottom actions
.bottom-actions {
  margin-top: 8px;
}

.order-again-btn {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  color: white !important;
  border-radius: 14px;
  height: 52px;
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: 0 6px 24px rgba(249, 115, 22, 0.35);
}

// ── Live Driver Map section ──────────────────────────
.live-map-section {
  margin-bottom: 28px;

  .section-label {
    display: flex;
    align-items: center;
  }

  .live-pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    margin-left: 8px;
    animation: livePing 1.5s ease-in-out infinite;
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
  }
}

.live-map-wrap {
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  // Force the map component to take proper dimensions inside the tracking page
  :deep(.gmap-tracker-page) {
    height: 260px !important;
    min-height: 260px !important;
    border-radius: 16px;
  }
  :deep(.gmap-container) {
    border-radius: 16px;
  }
  // Hide the back button & top overlay inside the embedded map
  :deep(.top-controls .q-btn:first-child) {
    display: none;
  }
}

@keyframes livePing {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  50%       { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
}
</style>

