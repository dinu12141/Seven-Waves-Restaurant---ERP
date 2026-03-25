<template>
  <q-page class="delivery-map-page">
    <!-- ── Map Container ─────────────────────── -->
    <div ref="mapContainer" class="map-container"></div>

    <!-- ── Navigation Mode: Turn-by-Turn Banner ── -->
    <div v-if="isNavigating && currentStep" class="nav-banner">
      <div class="nav-banner__icon">
        <q-icon :name="currentStepIcon" size="28px" color="white" />
      </div>
      <div class="nav-banner__info">
        <div class="nav-banner__distance">{{ formatDistance(distanceToNextStep) }}</div>
        <div class="nav-banner__instruction">{{ currentStep.instruction }}</div>
      </div>
    </div>

    <!-- ── Navigation Mode: Bottom ETA Strip ────── -->
    <div v-if="isNavigating" class="nav-eta-strip">
      <div class="nav-eta__time">{{ formatDuration(routeInfo?.duration) }}</div>
      <div class="nav-eta__dot">·</div>
      <div class="nav-eta__dist">{{ formatDistance(routeInfo?.distance) }}</div>
      <div class="nav-eta__dot">·</div>
      <div class="nav-eta__eta">ETA {{ arrivalTime }}</div>
      <q-btn
        flat
        round
        dense
        icon="close"
        color="red-4"
        class="nav-exit-btn"
        @click="exitNavigation"
      />
    </div>

    <!-- ── GPS Badge (non-navigation mode) ────── -->
    <div v-if="!isNavigating" class="gps-badge" :class="gpsStatusClass">
      <q-icon :name="gpsStatusIcon" size="14px" />
      <span>{{ gpsStatusText }}</span>
    </div>

    <!-- ── Top Overlay (non-navigation) ─── -->
    <div v-if="!isNavigating" class="top-overlay">
      <q-btn
        flat
        round
        dense
        icon="arrow_back"
        color="white"
        class="map-fab"
        @click="$router.back()"
      />
      <q-btn
        flat
        round
        dense
        icon="my_location"
        color="white"
        class="map-fab"
        @click="recenterMap"
      />
      <q-btn flat round dense icon="layers" color="white" class="map-fab" @click="toggleMapStyle" />
    </div>

    <!-- ── Navigation Mode: Floating Buttons ──── -->
    <div v-if="isNavigating" class="nav-float-btns">
      <q-btn
        flat
        round
        dense
        icon="my_location"
        color="white"
        class="map-fab"
        @click="recenterMap"
      />
    </div>

    <!-- ── Route Panel (non-navigation mode) ────── -->
    <div
      v-if="!isNavigating"
      class="route-panel"
      :class="{ 'route-panel--expanded': panelExpanded }"
    >
      <div class="panel-drag" @click="panelExpanded = !panelExpanded">
        <div class="drag-bar" />
      </div>

      <!-- Route Summary -->
      <div class="route-summary" v-if="routeInfo">
        <div class="route-primary">
          <div class="route-time">{{ formatDuration(routeInfo.duration) }}</div>
          <div class="route-dist">{{ formatDistance(routeInfo.distance) }}</div>
        </div>
        <div class="route-label">Fastest route</div>
      </div>
      <div class="route-summary" v-else>
        <div class="route-primary">
          <div class="route-time route-time--loading">Calculating…</div>
        </div>
      </div>

      <!-- Origin → Destination -->
      <div class="route-points">
        <div class="point-row">
          <div class="point-dot point-dot--origin"></div>
          <div class="point-text">
            <div class="point-label">Your location</div>
            <div class="point-sub" v-if="coords">
              {{ coords.latitude.toFixed(4) }}, {{ coords.longitude.toFixed(4) }}
            </div>
            <div class="point-sub" v-else>Acquiring GPS…</div>
          </div>
        </div>
        <div class="point-connector"><span></span><span></span><span></span></div>
        <div class="point-row">
          <div class="point-dot point-dot--dest"></div>
          <div class="point-text">
            <div class="point-label">{{ currentDelivery?.customer_name || 'Customer' }}</div>
            <div class="point-sub">{{ currentDelivery?.delivery_address || 'Destination' }}</div>
          </div>
        </div>
      </div>

      <!-- Expanded Steps Preview -->
      <div v-if="panelExpanded && navSteps.length" class="steps-preview">
        <div class="steps-preview__title">Directions</div>
        <div v-for="(step, i) in navSteps" :key="i" class="step-item">
          <q-icon
            :name="getManeuverIcon(step.maneuverType, step.maneuverModifier)"
            size="18px"
            color="blue-4"
            class="step-item__icon"
          />
          <div class="step-item__text">
            <div class="step-item__inst">{{ step.instruction }}</div>
            <div class="step-item__dist">{{ formatDistance(step.distance) }}</div>
          </div>
        </div>
      </div>

      <!-- Expanded Order Info -->
      <div v-if="panelExpanded && currentDelivery" class="order-strip">
        <div class="order-strip__row">
          <span class="order-strip__label">Order</span>
          <span class="order-strip__value">#{{ currentDelivery.orderNumber }}</span>
        </div>
        <div class="order-strip__row">
          <span class="order-strip__label">Amount</span>
          <span class="order-strip__value order-strip__value--green"
            >Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span
          >
        </div>
        <div class="order-strip__row" v-if="currentDelivery.customer_phone">
          <span class="order-strip__label">Phone</span>
          <a
            :href="'tel:' + currentDelivery.customer_phone"
            class="order-strip__value order-strip__value--link"
            >{{ currentDelivery.customer_phone }}</a
          >
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="panel-actions">
        <div class="actions-row">
          <q-btn
            unelevated
            no-caps
            color="blue-8"
            icon="navigation"
            :label="routeInfo ? 'Start Navigation' : 'Start Navigation'"
            class="nav-btn"
            @click="startNavigation"
            :loading="!routeInfo && routeLoading"
          />
          <q-btn
            unelevated
            no-caps
            color="green-8"
            icon="phone"
            class="call-btn"
            @click="handleCallCustomer"
          />
        </div>

        <q-btn
          v-if="currentDelivery && currentDelivery.status === 'accepted'"
          unelevated
          no-caps
          color="cyan-8"
          icon="local_shipping"
          label="Mark Picked Up"
          class="status-btn"
          :loading="store.processing"
          @click="handlePickUp"
        />
        <q-btn
          v-else-if="currentDelivery && currentDelivery.status === 'picked_up'"
          unelevated
          no-caps
          color="green-8"
          icon="check_circle"
          label="Confirm Delivery Complete"
          class="status-btn status-btn--deliver"
          :loading="store.processing"
          @click="showDeliveryConfirm = true"
        />
      </div>
    </div>

    <!-- ── Delivery Confirmation Dialog ──────── -->
    <q-dialog v-model="showDeliveryConfirm" persistent>
      <q-card class="confirm-dialog">
        <q-card-section class="confirm-header">
          <q-icon name="check_circle" size="48px" color="green" />
          <div class="confirm-title">Confirm Delivery</div>
          <div class="confirm-sub">
            Are you sure order <b>#{{ currentDelivery?.orderNumber }}</b> has been handed over to
            <b>{{ currentDelivery?.customer_name || 'the customer' }}</b
            >?
          </div>
        </q-card-section>
        <q-card-section class="confirm-details" v-if="currentDelivery">
          <div class="confirm-row">
            <q-icon name="location_on" size="16px" color="grey-5" /><span>{{
              currentDelivery.delivery_address
            }}</span>
          </div>
          <div class="confirm-row">
            <q-icon name="payments" size="16px" color="amber" /><span class="confirm-amount"
              >Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span
            >
          </div>
        </q-card-section>
        <q-card-actions class="confirm-actions">
          <q-btn flat no-caps label="Cancel" color="grey" v-close-popup />
          <q-btn
            unelevated
            no-caps
            color="green-8"
            icon="check"
            label="Yes, Mark Delivered"
            class="confirm-deliver-btn"
            :loading="store.processing"
            @click="handleConfirmDeliver"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { useGeolocation } from 'src/composables/useGeolocation'
import {
  fetchOSRMRoute,
  fetchOSRMRouteWithSteps,
  formatDistance,
  formatDuration,
  getManeuverIcon,
  findCurrentStep,
  haversineDistance,
} from 'src/composables/useMapNavigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const store = useDeliveryStore()
const router = useRouter()
const mapContainer = ref(null)
const panelExpanded = ref(false)
const showDeliveryConfirm = ref(false)
const useDarkMap = ref(true)
const isNavigating = ref(false)

// Geolocation
const { coords, error: geoError, permissionState, startTracking } = useGeolocation()

// Map state
let map = null
let riderMarker = null
let destMarker = null
let originCircle = null
let routeLine = null
let routeShadow = null
let tileLayer = null
let navRerouteTimer = null
const routeInfo = ref(null)
const routeLoading = ref(false)
const navSteps = ref([])
const resolvedDest = ref(null) // { lat, lng } — set after geocoding
const currentStepIdx = ref(0)

// Current delivery from store
const currentDelivery = computed(() => {
  if (store.activeDelivery) return store.activeDelivery
  if (store.acceptedAssignments.length) return store.acceptedAssignments[0]
  return null
})

const currentStep = computed(() => navSteps.value[currentStepIdx.value] || null)

const currentStepIcon = computed(() => {
  const s = currentStep.value
  if (!s) return 'arrow_upward'
  return getManeuverIcon(s.maneuverType, s.maneuverModifier)
})

const distanceToNextStep = computed(() => {
  const s = currentStep.value
  if (!s || !s.location || !coords.value) return s?.distance || 0
  return haversineDistance(
    coords.value.latitude,
    coords.value.longitude,
    s.location[1],
    s.location[0],
  )
})

const arrivalTime = computed(() => {
  if (!routeInfo.value?.duration) return '—'
  const now = new Date()
  now.setSeconds(now.getSeconds() + routeInfo.value.duration)
  const h = now.getHours() % 12 || 12
  const m = String(now.getMinutes()).padStart(2, '0')
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
})

// ── GPS Status ──────────────────────────────
const gpsStatusClass = computed(() => {
  if (geoError.value) return 'gps-badge--error'
  if (coords.value) return 'gps-badge--active'
  return 'gps-badge--searching'
})
const gpsStatusIcon = computed(() => {
  if (geoError.value) return 'gps_off'
  if (coords.value) return 'gps_fixed'
  return 'gps_not_fixed'
})
const gpsStatusText = computed(() => {
  if (permissionState.value === 'denied') return 'GPS Denied'
  if (geoError.value) return 'No GPS'
  if (coords.value) return `±${Math.round(coords.value.accuracy || 0)}m`
  return 'GPS…'
})

const RESTAURANT_LOCATION = [6.9271, 79.8612]
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_LIGHT = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// ── Map Initialization ──────────────────────
function initMap() {
  if (!mapContainer.value) return

  const startCoords = coords.value
    ? [coords.value.latitude, coords.value.longitude]
    : RESTAURANT_LOCATION

  map = L.map(mapContainer.value, {
    center: startCoords,
    zoom: 14,
    zoomControl: false,
    attributionControl: false,
  })

  tileLayer = L.tileLayer(useDarkMap.value ? TILE_DARK : TILE_LIGHT, {
    maxZoom: 19,
    subdomains: useDarkMap.value ? 'abcd' : 'abc',
  }).addTo(map)

  L.control.zoom({ position: 'topright' }).addTo(map)

  // Rider marker
  const riderIcon = L.divIcon({
    className: 'rider-marker',
    html: '<div class="rider-marker__dot"></div><div class="rider-marker__pulse"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
  riderMarker = L.marker(startCoords, { icon: riderIcon, zIndexOffset: 1000 }).addTo(map)

  // Accuracy circle
  originCircle = L.circleMarker(startCoords, {
    radius: 22,
    fillColor: '#4285f4',
    fillOpacity: 0.12,
    color: '#4285f4',
    weight: 1.5,
    opacity: 0.3,
  }).addTo(map)

  addDestinationMarker()
}

async function addDestinationMarker() {
  if (!map) return
  const delivery = currentDelivery.value
  if (!delivery) return

  let destLat = delivery.delivery_lat || delivery.latitude
  let destLng = delivery.delivery_lng || delivery.longitude

  // ── Geocode address if no coordinates ──────────────────
  if (!destLat || !destLng) {
    const address = delivery.delivery_address
    if (!address) return
    routeLoading.value = true
    const geocoded = await geocodeAddress(address)
    if (geocoded) {
      destLat = geocoded.lat
      destLng = geocoded.lng
    } else {
      routeLoading.value = false
      console.warn('[MapNav] Could not geocode address:', address)
      return
    }
  }

  // Store resolved destination for rerouting
  resolvedDest.value = { lat: destLat, lng: destLng }

  const destIcon = L.divIcon({
    className: 'dest-marker-v2',
    html: '<div class="dest-pin"><div class="dest-pin__inner"></div></div><div class="dest-pin__shadow"></div>',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
  })

  if (destMarker) map.removeLayer(destMarker)
  destMarker = L.marker([destLat, destLng], { icon: destIcon })
    .addTo(map)
    .bindPopup(
      `<b>${delivery.customer_name || 'Customer'}</b><br>${delivery.delivery_address || ''}`,
    )

  // Initial route fetch
  const origin = coords.value
    ? [coords.value.longitude, coords.value.latitude]
    : [RESTAURANT_LOCATION[1], RESTAURANT_LOCATION[0]]
  await fetchRouteWithDirections(origin, [destLng, destLat])
  routeLoading.value = false

  // Fit bounds to show both markers
  const riderPos = coords.value
    ? [coords.value.latitude, coords.value.longitude]
    : RESTAURANT_LOCATION
  map.fitBounds(L.latLngBounds([riderPos, [destLat, destLng]]), { padding: [50, 50], maxZoom: 15 })
}

/**
 * Geocode a free-text address using Nominatim (free, no API key needed).
 */
async function geocodeAddress(address) {
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'lk', // Restrict to Sri Lanka for faster / more accurate results
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'SevenWavesDeliveryApp/1.0' },
    })
    const data = await res.json()
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch (err) {
    console.error('[MapNav] Geocoding error:', err)
    return null
  }
}

async function fetchRouteWithDirections(start, end) {
  const route = await fetchOSRMRouteWithSteps(start, end)
  if (!route) {
    // Fallback to basic route
    const basic = await fetchOSRMRoute(start, end)
    if (basic) {
      routeInfo.value = { distance: basic.distance, duration: basic.duration }
      drawRoute(basic.coordinates)
    }
    return
  }

  routeInfo.value = { distance: route.distance, duration: route.duration }
  navSteps.value = route.steps
  drawRoute(route.coordinates)

  // Update current step
  if (isNavigating.value && coords.value) {
    currentStepIdx.value = findCurrentStep(
      route.steps,
      coords.value.latitude,
      coords.value.longitude,
    )
  }
}

function drawRoute(coordinates) {
  if (!map) return
  if (routeShadow) map.removeLayer(routeShadow)
  if (routeLine) map.removeLayer(routeLine)

  routeShadow = L.polyline(coordinates, {
    color: '#185abc',
    weight: 8,
    opacity: 0.4,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map)

  routeLine = L.polyline(coordinates, {
    color: '#4285f4',
    weight: 5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map)
}

function toggleMapStyle() {
  useDarkMap.value = !useDarkMap.value
  if (tileLayer && map) {
    map.removeLayer(tileLayer)
    tileLayer = L.tileLayer(useDarkMap.value ? TILE_DARK : TILE_LIGHT, {
      maxZoom: 19,
      subdomains: useDarkMap.value ? 'abcd' : 'abc',
    }).addTo(map)
  }
}

// ── Navigation Mode ─────────────────────────
function startNavigation() {
  isNavigating.value = true
  panelExpanded.value = false

  // Zoom in and follow rider
  if (coords.value && map) {
    map.setView([coords.value.latitude, coords.value.longitude], 17, { animate: true })
  }

  // Initial step calculation
  if (navSteps.value.length && coords.value) {
    currentStepIdx.value = findCurrentStep(
      navSteps.value,
      coords.value.latitude,
      coords.value.longitude,
    )
  }

  // Re-route every 30 seconds using cached resolvedDest
  navRerouteTimer = setInterval(() => {
    if (!coords.value || !resolvedDest.value) return
    fetchRouteWithDirections(
      [coords.value.longitude, coords.value.latitude],
      [resolvedDest.value.lng, resolvedDest.value.lat],
    )
  }, 30000)
}

function exitNavigation() {
  isNavigating.value = false
  if (navRerouteTimer) {
    clearInterval(navRerouteTimer)
    navRerouteTimer = null
  }

  // Zoom out to show full route using cached dest
  if (map && coords.value && resolvedDest.value) {
    map.fitBounds(
      L.latLngBounds([
        [coords.value.latitude, coords.value.longitude],
        [resolvedDest.value.lat, resolvedDest.value.lng],
      ]),
      { padding: [50, 50] },
    )
  }
}

// ── Watch rider position ────────────────────
watch(coords, (newCoords) => {
  if (!newCoords || !map || !riderMarker) return
  const pos = [newCoords.latitude, newCoords.longitude]
  riderMarker.setLatLng(pos)
  if (originCircle) originCircle.setLatLng(pos)

  // Navigation mode: auto-follow + update step
  if (isNavigating.value) {
    map.setView(pos, map.getZoom(), { animate: true })

    if (navSteps.value.length) {
      currentStepIdx.value = findCurrentStep(
        navSteps.value,
        newCoords.latitude,
        newCoords.longitude,
      )
    }

    // Re-fetch route on GPS update using cached resolvedDest
    if (resolvedDest.value) {
      fetchRouteWithDirections(
        [newCoords.longitude, newCoords.latitude],
        [resolvedDest.value.lng, resolvedDest.value.lat],
      )
    }
  }
})

function recenterMap() {
  if (!map || !coords.value) return
  map.setView([coords.value.latitude, coords.value.longitude], isNavigating.value ? 17 : 15, {
    animate: true,
  })
}

// ── Actions ─────────────────────────────────
function handleCallCustomer() {
  const phone = currentDelivery.value?.customer_phone
  if (phone) window.location.href = `tel:${phone}`
}

async function handlePickUp() {
  if (!currentDelivery.value) return
  await store.pickUp(currentDelivery.value.id)
}

async function handleConfirmDeliver() {
  if (!currentDelivery.value) return
  await store.deliver(currentDelivery.value.id)
  showDeliveryConfirm.value = false
  exitNavigation()
  router.push('/delivery-app')
}

// ── Lifecycle ───────────────────────────────
onMounted(() => {
  startTracking()
  setTimeout(() => initMap(), 100)
})

onUnmounted(() => {
  if (navRerouteTimer) clearInterval(navRerouteTimer)
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style lang="scss" scoped>
.delivery-map-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #0a0e16;
}

.map-container {
  flex: 1;
  min-height: 0;
  z-index: 1;
}

// ── Navigation Turn Banner ──────────────
.nav-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  display: flex;
  align-items: center;
  gap: 14px;
  background: #1a73e8;
  padding: 16px 16px;
  padding-top: calc(16px + env(safe-area-inset-top));
  box-shadow: 0 4px 20px rgba(26, 115, 232, 0.4);
  &__icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  &__info {
    flex: 1;
    min-width: 0;
  }
  &__distance {
    font-size: 28px;
    font-weight: 800;
    color: #fff;
    line-height: 1;
  }
  &__instruction {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

// ── Navigation ETA Strip ────────────────
.nav-eta-strip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1a1e2e;
  padding: 14px 16px;
  padding-bottom: calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.nav-eta__time {
  font-size: 18px;
  font-weight: 800;
  color: #4285f4;
}
.nav-eta__dist {
  font-size: 13px;
  color: #9e9e9e;
  font-weight: 600;
}
.nav-eta__eta {
  font-size: 13px;
  color: #34d399;
  font-weight: 700;
}
.nav-eta__dot {
  color: #4b5563;
  font-weight: 800;
}
.nav-exit-btn {
  margin-left: auto;
}

// ── Floating Buttons ────────────────────
.top-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  > * {
    pointer-events: all;
  }
}
.nav-float-btns {
  position: absolute;
  right: 12px;
  z-index: 1001;
  pointer-events: all;
  bottom: 70px;
}
.map-fab {
  background: rgba(10, 14, 22, 0.85) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 40px;
  height: 40px;
}

// ── GPS Badge ───────────────────────────
.gps-badge {
  position: absolute;
  top: 62px;
  left: 12px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 10px;
  font-weight: 700;
  backdrop-filter: blur(10px);
  &--active {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }
  &--searching {
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fcd34d;
    animation: gps-pulse 1.5s infinite;
  }
  &--error {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
}
@keyframes gps-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

// ── Route Panel ─────────────────────────
.route-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  background: #1a1e2e;
  border-radius: 20px 20px 0 0;
  padding: 0 16px 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
  max-height: 44vh;
  overflow-y: auto;
  transition: max-height 0.3s ease;
  &--expanded {
    max-height: 70vh;
  }
}
.panel-drag {
  display: flex;
  justify-content: center;
  padding: 10px 0 6px;
  cursor: pointer;
}
.drag-bar {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.2);
}

.route-summary {
  margin-bottom: 12px;
}
.route-primary {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.route-time {
  font-size: 28px;
  font-weight: 800;
  color: #4285f4;
  &--loading {
    font-size: 16px;
    color: #9e9e9e;
    font-weight: 600;
  }
}
.route-dist {
  font-size: 14px;
  color: #9e9e9e;
  font-weight: 600;
}
.route-label {
  font-size: 11px;
  color: #6b7280;
  margin-top: 2px;
}

// Points
.route-points {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 12px;
}
.point-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.point-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 3px;
  flex-shrink: 0;
  &--origin {
    background: #4285f4;
    box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.2);
  }
  &--dest {
    background: #ea4335;
    box-shadow: 0 0 0 3px rgba(234, 67, 53, 0.2);
  }
}
.point-text {
  flex: 1;
  min-width: 0;
}
.point-label {
  font-size: 13px;
  font-weight: 700;
  color: #e8eaf0;
}
.point-sub {
  font-size: 11px;
  color: #9e9e9e;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.point-connector {
  padding: 3px 0 3px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  span {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    display: block;
  }
}

// Steps Preview
.steps-preview {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  max-height: 180px;
  overflow-y: auto;
  &__title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #4b5563;
    margin-bottom: 10px;
  }
}
.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  &:last-child {
    border-bottom: none;
  }
  &__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }
  &__inst {
    font-size: 12px;
    color: #e0e0e0;
  }
  &__dist {
    font-size: 10px;
    color: #757575;
    margin-top: 2px;
  }
}

// Order strip
.order-strip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
  }
  &__label {
    font-size: 11px;
    color: #757575;
  }
  &__value {
    font-size: 13px;
    color: #e0e0e0;
    font-weight: 600;
    &--green {
      color: #a5d6a7;
      font-weight: 800;
    }
    &--link {
      color: #64b5f6;
      text-decoration: none;
    }
  }
}

// Actions
.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.actions-row {
  display: flex;
  gap: 8px;
}
.nav-btn {
  flex: 1;
  height: 46px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
}
.call-btn {
  width: 46px;
  height: 46px;
  border-radius: 10px;
}

.status-btn {
  width: 100%;
  height: 50px;
  font-size: 14px;
  font-weight: 800;
  border-radius: 12px;
  &--deliver {
    background: linear-gradient(135deg, #16a34a, #22c55e) !important;
    box-shadow: 0 4px 16px rgba(22, 163, 74, 0.4);
  }
}

// ── Confirm Dialog ──────────────────────
.confirm-dialog {
  background: #1a1e2e !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px !important;
  min-width: 320px;
  max-width: 400px;
}
.confirm-header {
  text-align: center;
  padding: 24px 20px 12px;
}
.confirm-title {
  font-size: 20px;
  font-weight: 800;
  color: #e8eaf0;
  margin-top: 12px;
}
.confirm-sub {
  font-size: 13px;
  color: #9e9e9e;
  margin-top: 8px;
  line-height: 1.5;
  b {
    color: #e0e0e0;
  }
}
.confirm-details {
  padding: 0 20px 12px;
}
.confirm-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #bdbdbd;
  padding: 4px 0;
}
.confirm-amount {
  font-weight: 800;
  color: #a5d6a7;
}
.confirm-actions {
  padding: 12px 20px 20px;
  justify-content: flex-end;
  gap: 8px;
}
.confirm-deliver-btn {
  border-radius: 10px;
  height: 42px;
  font-weight: 700;
}
</style>

<style lang="scss">
body.body--light {
  .delivery-map-page {
    background: #f1f5f9;
  }

  // Route panel
  .route-panel {
    background: #ffffff;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  }
  .drag-bar {
    background: #cbd5e1;
  }
  .route-time {
    color: #2563eb;
  }
  .route-dist {
    color: #64748b;
  }
  .route-label {
    color: #94a3b8;
  }

  .route-points {
    background: #f8fafc;
    border-color: #e2e8f0;
  }
  .point-label {
    color: #0f172a;
  }
  .point-sub {
    color: #64748b;
  }
  .point-connector span {
    background: #cbd5e1;
  }

  // Steps preview
  .steps-preview {
    background: #f8fafc;
    border-color: #e2e8f0;
    &__title {
      color: #64748b;
    }
  }
  .step-item {
    border-bottom-color: #f1f5f9;
    &__inst {
      color: #334155;
    }
    &__dist {
      color: #94a3b8;
    }
  }

  // Order strip
  .order-strip {
    background: #f8fafc;
    border-color: #e2e8f0;
    &__label {
      color: #94a3b8;
    }
    &__value {
      color: #334155;
      &--green {
        color: #16a34a;
      }
      &--link {
        color: #2563eb;
      }
    }
  }

  // ETA strip
  .nav-eta-strip {
    background: #ffffff;
    border-top: 1px solid #e2e8f0;
  }
  .nav-eta__time {
    color: #2563eb;
  }
  .nav-eta__dist {
    color: #64748b;
  }
  .nav-eta__eta {
    color: #16a34a;
  }
  .nav-eta__dot {
    color: #cbd5e1;
  }

  // Floating buttons in light mode
  .map-fab {
    background: rgba(255, 255, 255, 0.92) !important;
    border: 1px solid #e2e8f0;
    color: #475569;
  }

  // Confirm dialog
  .confirm-dialog {
    background: #ffffff !important;
    border: 1px solid #e2e8f0;
  }
  .confirm-title {
    color: #0f172a;
  }
  .confirm-sub {
    color: #64748b;
    b {
      color: #334155;
    }
  }
  .confirm-row {
    color: #475569;
  }
  .confirm-amount {
    color: #16a34a;
  }
}
</style>

<style lang="scss">
// Global Leaflet marker styles
.rider-marker {
  position: relative;
}
.rider-marker__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4285f4;
  border: 3px solid #1a3a6a;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
}
.rider-marker__pulse {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(66, 133, 244, 0.25);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: rider-pulse-v2 2s ease-out infinite;
  z-index: 1;
}
@keyframes rider-pulse-v2 {
  0% {
    transform: translate(-50%, -50%) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(2.2);
    opacity: 0;
  }
}

.dest-marker-v2 {
  position: relative;
}
.dest-pin {
  width: 24px;
  height: 24px;
  border-radius: 50% 50% 50% 0;
  background: #ea4335;
  transform: rotate(-45deg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 3px 8px rgba(234, 67, 53, 0.5);
  position: relative;
  z-index: 2;
}
.dest-pin__inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  transform: rotate(45deg);
}
.dest-pin__shadow {
  width: 14px;
  height: 4px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 50%;
  margin: 2px auto 0;
  filter: blur(1px);
}
</style>
