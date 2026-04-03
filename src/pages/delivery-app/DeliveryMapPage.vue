<template>
  <!-- GoogleMapTracker fills the full screen; we overlay the delivery controls on top -->
  <GoogleMapTracker
    v-if="currentDelivery"
    :api-key="GOOGLE_MAPS_KEY"
    :channel-name="broadcastChannel"
    :dest-lat="destLat"
    :dest-lng="destLng"
    :customer-name="currentDelivery.customer_name || 'Customer'"
    :customer-address="currentDelivery.delivery_address || ''"
    :customer-phone="currentDelivery.customer_phone || ''"
    :broadcast-own-position="true"
    @driver-moved="onDriverMoved"
  >
    <!-- Overlay delivery action buttons via teleport-like slot approach -->
  </GoogleMapTracker>

  <!-- Floating delivery action overlay (shown on top of the map) -->
  <div v-if="currentDelivery" class="delivery-overlay">
    <!-- Pick-Up button -->
    <q-btn
      v-if="currentDelivery.status === 'accepted'"
      unelevated
      no-caps
      color="cyan-8"
      icon="local_shipping"
      label="Mark Picked Up"
      class="overlay-status-btn"
      :loading="store.processing"
      :disable="currentDelivery.orderStatus !== 'ready'"
      @click="handlePickUp"
    >
      <q-tooltip v-if="currentDelivery.orderStatus !== 'ready'">
        Wait for kitchen to mark order as ready
      </q-tooltip>
    </q-btn>

    <!-- Deliver button -->
    <q-btn
      v-if="currentDelivery.status === 'picked_up'"
      unelevated
      no-caps
      color="green-8"
      icon="check_circle"
      label="Confirm Delivery"
      class="overlay-status-btn overlay-status-btn--deliver"
      :loading="store.processing"
      @click="showDeliveryConfirm = true"
    />
  </div>

  <!-- No active delivery fallback -->
  <q-page v-if="!currentDelivery" class="delivery-map-fallback">
    <q-icon name="map" size="64px" color="grey-7" />
    <div class="fallback-title">No active delivery</div>
    <div class="fallback-sub">Accept a delivery from the queue first.</div>
    <q-btn
      flat no-caps color="purple-4" label="Go to Queue"
      icon="arrow_back" class="q-mt-md"
      @click="$router.push('/delivery-app')"
    />
  </q-page>

  <!-- Delivery Confirmation Dialog -->
  <q-dialog v-model="showDeliveryConfirm" persistent>
    <q-card class="confirm-dialog">
      <q-card-section class="confirm-header">
        <q-icon name="check_circle" size="48px" color="green" />
        <div class="confirm-title">Confirm Delivery</div>
        <div class="confirm-sub">
          Are you sure order <b>#{{ currentDelivery?.orderNumber }}</b> has been handing over to
          <b>{{ currentDelivery?.customer_name || 'the customer' }}</b>?
        </div>
      </q-card-section>
      <q-card-section class="confirm-details" v-if="currentDelivery">
        <div class="confirm-row">
          <q-icon name="location_on" size="16px" color="grey-5" />
          <span>{{ currentDelivery.delivery_address || 'N/A' }}</span>
        </div>
        <div class="confirm-row">
          <q-icon name="payments" size="16px" color="amber" />
          <span class="confirm-amount">Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span>
        </div>
      </q-card-section>
      <q-card-actions class="confirm-actions">
        <q-btn flat no-caps label="Cancel" color="grey" v-close-popup />
        <q-btn
          unelevated no-caps color="green-8" icon="check"
          label="Yes, Mark Delivered"
          class="confirm-deliver-btn"
          :loading="store.processing"
          @click="handleConfirmDeliver"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import GoogleMapTracker from 'src/components/delivery/GoogleMapTracker.vue'

const router = useRouter()
const store = useDeliveryStore()
const showDeliveryConfirm = ref(false)

// ── Google Maps API key from env ─────────────────────────
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// ── Current delivery ─────────────────────────────────────
const currentDelivery = computed(() => {
  if (store.activeDelivery) return store.activeDelivery
  if (store.acceptedAssignments.length) return store.acceptedAssignments[0]
  return null
})

// ── Supabase broadcast channel name ─────────────────────
// Pattern: "delivery:order-<orderId>"  — must match what OrderTrackingPage listens on
const broadcastChannel = computed(() => {
  const orderId = currentDelivery.value?.order_id
  return orderId ? `delivery:order-${orderId}` : ''
})

// ── Destination coordinates ──────────────────────────────
const destLat = computed(() => {
  const d = currentDelivery.value
  if (!d) return 0
  return d.delivery_lat || d.latitude || 0
})

const destLng = computed(() => {
  const d = currentDelivery.value
  if (!d) return 0
  return d.delivery_lng || d.longitude || 0
})

// ── Event handlers ───────────────────────────────────────
function onDriverMoved(pos) {
  // Optional: could update a store ref for the live coords badge elsewhere
  console.log('[DeliveryMapPage] Driver moved to:', pos)
}

async function handlePickUp() {
  if (!currentDelivery.value) return
  await store.pickUp(currentDelivery.value.id)
}

async function handleConfirmDeliver() {
  if (!currentDelivery.value) return
  await store.deliver(currentDelivery.value.id)
  showDeliveryConfirm.value = false
  router.push('/delivery-app')
}
</script>

<style lang="scss" scoped>
// ── Overlay action buttons (float above GoogleMapTracker) ──
.delivery-overlay {
  position: fixed;
  bottom: 220px; // Sits above the GoogleMapTracker route panel
  left: 16px;
  right: 16px;
  z-index: 1100;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 10px;

  > .q-btn {
    pointer-events: all;
  }
}

.overlay-status-btn {
  width: 100%;
  height: 48px;
  font-size: 14px;
  font-weight: 700;
  border-radius: 14px !important;
  letter-spacing: 0.3px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);

  &--deliver {
    background: linear-gradient(135deg, #22c55e, #16a34a) !important;
    box-shadow: 0 4px 20px rgba(34, 197, 94, 0.4);
  }
}

// ── Fallback (no active delivery) ───────────────────────
.delivery-map-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 10px;
  text-align: center;
  background: #090c14;
}
.fallback-title {
  font-size: 16px;
  font-weight: 700;
  color: #bdbdbd;
}
.fallback-sub {
  font-size: 12px;
  color: #757575;
  max-width: 260px;
}

// ── Confirm Dialog ──────────────────────────────────────
.confirm-dialog {
  width: 320px;
  border-radius: 20px;
  background: #1a1e2e;
  color: #e0e0e0;
}
.confirm-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 24px 12px;
  text-align: center;
}
.confirm-title {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}
.confirm-sub {
  font-size: 13px;
  color: #9e9e9e;
  line-height: 1.5;
}
.confirm-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 24px 12px;
}
.confirm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #bdbdbd;
}
.confirm-amount {
  font-weight: 700;
  color: #a5d6a7;
}
.confirm-actions {
  display: flex;
  gap: 10px;
  padding: 12px 24px 20px;
}
.confirm-deliver-btn {
  flex: 1;
  border-radius: 10px !important;
}
</style>
