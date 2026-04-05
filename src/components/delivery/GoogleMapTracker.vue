<template>
  <q-page class="gmap-tracker-page">
    <!-- ── Map Container ────────────────────────── -->
    <div ref="mapEl" class="gmap-container"></div>

    <!-- ── GPS Status Badge ─────────────────────── -->
    <div class="gps-chip" :class="gpsChipClass">
      <q-icon :name="gpsIcon" size="14px" />
      <span>{{ gpsLabel }}</span>
    </div>

    <!-- ── Top Controls ─────────────────────────── -->
    <div class="top-controls">
      <q-btn flat round dense icon="arrow_back" color="white" class="ctrl-fab" @click="$router.back()" />
      <q-btn flat round dense icon="my_location" color="white" class="ctrl-fab" @click="panToDriver" />
      <q-btn flat round dense icon="layers" color="white" class="ctrl-fab" @click="toggleStyle" />
    </div>

    <!-- ── Route Info Panel ─────────────────────── -->
    <div class="route-panel" :class="{ 'route-panel--expanded': panelOpen }">
      <div class="panel-handle" @click="panelOpen = !panelOpen">
        <div class="handle-bar" />
      </div>

      <!-- Summary -->
      <div class="route-summary">
        <template v-if="routeMeta">
          <div class="route-time">{{ routeMeta.duration }}</div>
          <div class="route-dist">{{ routeMeta.distance }}</div>
        </template>
        <div v-else class="route-time route-time--calc">Calculating…</div>
      </div>

      <!-- Origin → Destination -->
      <div class="route-stops">
        <div class="stop-row">
          <div class="stop-dot stop-dot--origin"></div>
          <div class="stop-info">
            <div class="stop-label">Your location</div>
            <div class="stop-sub" v-if="driverPos">
              {{ driverPos.lat.toFixed(4) }}, {{ driverPos.lng.toFixed(4) }}
            </div>
            <div class="stop-sub" v-else>Acquiring GPS…</div>
          </div>
        </div>
        <div class="stop-dots"><span /><span /><span /></div>
        <div class="stop-row">
          <div class="stop-dot stop-dot--dest"></div>
          <div class="stop-info">
            <div class="stop-label">{{ customerName }}</div>
            <div class="stop-sub">{{ customerAddress }}</div>
          </div>
        </div>
      </div>

      <!-- Quick Actions (expanded) -->
      <div v-if="panelOpen" class="panel-actions">
        <q-btn unelevated no-caps color="blue-8" icon="navigation" label="Start Navigation" class="act-btn" @click="openExternalNav" />
        <q-btn unelevated no-caps color="green-8" icon="phone" class="act-call" @click="callCustomer" />
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from 'src/boot/supabase'
import { loadGoogleMaps } from 'src/utils/mapLoader'

// ═══════════════════════════════════════════════
//  Props
// ═══════════════════════════════════════════════
const props = defineProps({
  /** The Supabase Broadcast channel name to listen on, e.g. 'delivery:order-xyz' */
  channelName: { type: String, default: '' },

  /** Destination coordinates (customer) */
  destLat: { type: Number, default: 0 },
  destLng: { type: Number, default: 0 },

  /** Customer display info */
  customerName: { type: String, default: 'Customer' },
  customerAddress: { type: String, default: 'Destination' },
  customerPhone: { type: String, default: '' },

  /** Your Google Maps JavaScript API Key */
  apiKey: { type: String, required: true },

  /** If true the component will also EMIT its own GPS position to the broadcast channel (driver mode) */
  broadcastOwnPosition: { type: Boolean, default: false },
})

const emit = defineEmits(['driver-moved', 'route-updated'])

// ═══════════════════════════════════════════════
//  Refs
// ═══════════════════════════════════════════════
const mapEl = ref(null)
const panelOpen = ref(false)

let map = null
let driverMarker = null
let directionsRenderer = null
let geoWatchId = null
let supaChannel = null
let broadcastInterval = null

const driverPos = ref(null) // { lat, lng }
const routeMeta = ref(null) // { distance: '5.2 km', duration: '12 min' }
const geoError = ref(null)
const useSatellite = ref(false)

// ── GPS badge computed ─────────────────────────
const gpsChipClass = computed(() => {
  if (geoError.value) return 'gps-chip--error'
  if (driverPos.value) return 'gps-chip--ok'
  return 'gps-chip--wait'
})
const gpsIcon = computed(() => {
  if (geoError.value) return 'gps_off'
  if (driverPos.value) return 'gps_fixed'
  return 'gps_not_fixed'
})
const gpsLabel = computed(() => {
  if (geoError.value) return 'No GPS'
  if (driverPos.value) return 'Live'
  return 'GPS…'
})

// ═══════════════════════════════════════════════
//  1.  Load Google Maps API (shared loader)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
//  2.  Initialise the google.maps.Map
// ═══════════════════════════════════════════════
async function initMap() {
  const maps = await loadGoogleMaps(props.apiKey)
  if (!mapEl.value) return


  const startPos = driverPos.value || { lat: 6.9271, lng: 79.8612 } // Colombo fallback

  map = new maps.Map(mapEl.value, {
    center: startPos,
    zoom: 14,
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: maps.ControlPosition.RIGHT_CENTER },
    styles: darkMapStyle,
    gestureHandling: 'greedy',
  })

function vehicleIcon(heading = 0, navigating = false, vType = 'motorcycle') {
  const color = navigating ? '#1a73e8' : '#22c55e'
  const glow = navigating ? 'rgba(26,115,232,0.35)' : 'rgba(34,197,94,0.30)'
  
  let path = ''
  if (vType === 'car') {
    path = `<path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>`
  } else if (vType === 'tuk-tuk') {
    path = `<path d="M21 11.18V9.72c0-.46-.35-.86-.8-.92L13.2 7.82V2h-2.4v5.82L3.8 8.8C3.35 8.86 3 9.26 3 9.72v1.46c0 .4-.24.76-.6.92C1.56 12.42 1 13.36 1 14.5c0 1.93 1.57 3.5 3.5 3.5.54 0 1.05-.12 1.5-.34V19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2v-1.34c.45.22.96.34 1.5.34 1.93 0 3.5-1.57 3.5-3.5 0-1.14-.56-2.08-1.4-2.4-.36-.16-.6-.52-.6-.92zM12 9.07l6 1V13H6v-2.93l6-1zM4.5 16c-.83 0-1.5-.67-1.5-1.5S3.67 13 4.5 13s1.5.67 1.5 1.5S5.33 16 4.5 16zm15 0c-.83 0-1.5-.67-1.5-1.5S18.67 13 19.5 13s1.5.67 1.5 1.5S20.33 16 19.5 16z"/>`
  } else {
    // motorcycle
    path = `<path d="M19,10c-1.63,0-3.06,0.92-3.71,2.27L12.59,10.2L16,6.31L15.34,5L11,9.88l-1.92-2.18L10.37,6.3L9.62,5L7.2,7.74 C6.55,7.27,5.74,7,4.86,7C2.17,7,0,9.17,0,11.86s2.17,4.86,4.86,4.86c2.5,0,4.55-1.89,4.82-4.3l3.65-0.73l2.84,3.23 C15.54,16.57,17.15,18,19,18c2.76,0,5-2.24,5-5S21.76,10,19,10z M4.86,14.71c-1.57,0-2.86-1.28-2.86-2.86S3.29,9,4.86,9 s2.86,1.28,2.86,2.86S6.43,14.71,4.86,14.71z M14.18,13L11.5,9.97l0.87-0.98l2.67,3.03L14.18,13z M19,16c-1.65,0-3-1.35-3-3 s1.35-3,3-3s3,1.35,3,3S20.65,16,19,16z"/>`
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g transform="rotate(${heading},32,32)" filter="url(#glow)">
      <polygon points="32,4 44,24 32,18 20,24" fill="${glow}" stroke="none"/>
      <circle cx="32" cy="32" r="18" fill="${color}" stroke="white" stroke-width="3"/>
      <g transform="translate(32,32) scale(1) translate(-12,-12)" fill="white">
        ${path}
      </g>
    </g>
  </svg>`
  
  return {
    url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    scaledSize: new window.google.maps.Size(56, 56),
    anchor: new window.google.maps.Point(28, 28),
  }
}

  // ── Driver marker (custom icon) ───────
  driverMarker = new maps.Marker({
    position: startPos,
    map,
    icon: vehicleIcon(0, true, 'motorcycle'),
    zIndex: 999,
    title: 'Driver',
  })

  // ── Destination marker (red pin) ──────────────────
  if (props.destLat && props.destLng) {
    new maps.Marker({
      position: { lat: props.destLat, lng: props.destLng },
      map,
      icon: {
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
        fillColor: '#ef4444',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1.6,
        anchor: new maps.Point(12, 22),
      },
      title: props.customerName,
    })
  }

  // ── Directions Renderer (polyline only) ───────────
  directionsRenderer = new maps.DirectionsRenderer({
    map,
    suppressMarkers: true, // we draw our own markers
    polylineOptions: {
      strokeColor: '#4285f4',
      strokeWeight: 5,
      strokeOpacity: 0.85,
    },
  })

  // Initial route calculation
  computeRoute()
}

// ═══════════════════════════════════════════════
//  3.  Directions Service — route polyline
// ═══════════════════════════════════════════════
let lastRouteTime = 0

function computeRoute() {
  if (!map || !driverPos.value || !props.destLat || !props.destLng) return

  // Throttle: at most once every 15 s
  const now = Date.now()
  if (now - lastRouteTime < 15_000) return
  lastRouteTime = now

  const directionsService = new window.google.maps.DirectionsService()

  directionsService.route(
    {
      origin: driverPos.value,
      destination: { lat: props.destLat, lng: props.destLng },
      travelMode: window.google.maps.TravelMode.DRIVING,
    },
    (result, status) => {
      if (status !== 'OK') {
        console.warn('[GoogleMapTracker] DirectionsService status:', status)
        return
      }

      directionsRenderer.setDirections(result)

      const leg = result.routes[0]?.legs[0]
      if (leg) {
        routeMeta.value = {
          distance: leg.distance.text,
          duration: leg.duration.text,
        }
        emit('route-updated', routeMeta.value)
      }
    },
  )
}

// ═══════════════════════════════════════════════
//  4.  SMOOTH MARKER ANIMATION (interpolation)
// ═══════════════════════════════════════════════
const ANIMATION_DURATION = 1000 // ms
let animFrame = null

/**
 * Smoothly animate the driver marker from its current position to `target`.
 * Uses requestAnimationFrame for 60 fps interpolation.
 */
function smoothMoveMarker(target, heading = 0, vType = 'motorcycle') {
  if (!driverMarker) return

  // Update icon based on current data
  driverMarker.setIcon(vehicleIcon(heading || 0, true, vType))

  const start = driverMarker.getPosition()
  if (!start) {
    driverMarker.setPosition(target)
    return
  }

  const startLat = start.lat()
  const startLng = start.lng()
  const endLat = target.lat
  const endLng = target.lng

  // If distance is tiny avoid unnecessary animation
  const delta = Math.abs(endLat - startLat) + Math.abs(endLng - startLng)
  if (delta < 0.000001) return

  if (animFrame) cancelAnimationFrame(animFrame)

  const t0 = performance.now()

  function step(now) {
    const elapsed = now - t0
    const progress = Math.min(elapsed / ANIMATION_DURATION, 1)

    // Ease-out cubic for smooth deceleration
    const ease = 1 - Math.pow(1 - progress, 3)

    const lat = startLat + (endLat - startLat) * ease
    const lng = startLng + (endLng - startLng) * ease

    driverMarker.setPosition({ lat, lng })

    if (progress < 1) {
      animFrame = requestAnimationFrame(step)
    }
  }

  animFrame = requestAnimationFrame(step)
}

// ═══════════════════════════════════════════════
//  5.  GPS Geolocation watcher (driver mode)
// ═══════════════════════════════════════════════
function startGeoWatch() {
  if (!navigator.geolocation) {
    geoError.value = 'Geolocation not supported'
    return
  }

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const newPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }

      driverPos.value = newPos
      geoError.value = null

      // Smooth-move the marker
      smoothMoveMarker(newPos, pos.coords.heading || 0, 'motorcycle')

      emit('driver-moved', newPos)
    },
    (err) => {
      geoError.value = err.message
      console.warn('[GoogleMapTracker] Geo error:', err.message)
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    },
  )
}

// ═══════════════════════════════════════════════
//  6.  Supabase Realtime BROADCAST
// ═══════════════════════════════════════════════
function setupBroadcast() {
  if (!props.channelName) return

  supaChannel = supabase.channel(props.channelName)

  // ── LISTEN for coordinate updates from the driver ──
  supaChannel.on('broadcast', { event: 'location' }, ({ payload }) => {
    if (!payload?.lat || !payload?.lng) return

    const newPos = { lat: payload.lat, lng: payload.lng }
    driverPos.value = newPos

    // Smooth animation
    smoothMoveMarker(newPos, payload.heading || 0, payload.vType || 'motorcycle')

    // Recompute route
    computeRoute()

    emit('driver-moved', newPos)
  })

  supaChannel.subscribe((status) => {
    console.log(`[GoogleMapTracker] Broadcast channel "${props.channelName}":`, status)
  })
}

/**
 * If broadcastOwnPosition is true, the driver's GPS position is sent to the
 * Supabase Broadcast channel every 5 seconds so the customer can track.
 */
function startBroadcasting() {
  if (!props.broadcastOwnPosition || !supaChannel) return

  broadcastInterval = setInterval(() => {
    if (!driverPos.value) return

    supaChannel.send({
      type: 'broadcast',
      event: 'location',
      payload: {
        lat: driverPos.value.lat,
        lng: driverPos.value.lng,
        ts: Date.now(),
      },
    })
  }, 5000)
}

// ═══════════════════════════════════════════════
//  7.  Auto-center map when driver moves
// ═══════════════════════════════════════════════
watch(driverPos, (pos) => {
  if (!pos || !map) return
  map.panTo(pos)
})

// ═══════════════════════════════════════════════
//  8.  Helpers
// ═══════════════════════════════════════════════
function panToDriver() {
  if (!driverPos.value || !map) return
  map.panTo(driverPos.value)
  map.setZoom(16)
}

function toggleStyle() {
  useSatellite.value = !useSatellite.value
  if (map) {
    map.setOptions({
      styles: useSatellite.value ? [] : darkMapStyle,
      mapTypeId: useSatellite.value ? 'satellite' : 'roadmap',
    })
  }
}

function callCustomer() {
  if (props.customerPhone) window.location.href = `tel:${props.customerPhone}`
}

function openExternalNav() {
  if (!props.destLat || !props.destLng) return
  const url = `https://www.google.com/maps/dir/?api=1&destination=${props.destLat},${props.destLng}&travelmode=driving`
  window.open(url, '_blank')
}

// ═══════════════════════════════════════════════
//  9.  Lifecycle
// ═══════════════════════════════════════════════
onMounted(async () => {
  startGeoWatch()
  setupBroadcast()

  // Wait a frame for the DOM to be ready
  await new Promise((r) => setTimeout(r, 80))

  await initMap()
  startBroadcasting()
})

onUnmounted(() => {
  // GPS cleanup
  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId)

  // Animation cleanup
  if (animFrame) cancelAnimationFrame(animFrame)

  // Broadcast cleanup
  if (broadcastInterval) clearInterval(broadcastInterval)
  if (supaChannel) supabase.removeChannel(supaChannel)

  // Map cleanup
  if (map) { map = null }
})

// ═══════════════════════════════════════════════
//  Google Maps Dark Style
// ═══════════════════════════════════════════════
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
]
</script>

<style lang="scss" scoped>
// ── Page ────────────────────────────────────
.gmap-tracker-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  position: relative;
  background: #0a0e16;
}

.gmap-container {
  flex: 1;
  min-height: 0;
  z-index: 1;
}

// ── GPS Chip ────────────────────────────────
.gps-chip {
  position: absolute;
  top: 62px;
  left: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 16px;
  font-size: 11px;
  font-weight: 700;
  backdrop-filter: blur(10px);

  &--ok {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #6ee7b7;
  }
  &--wait {
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fbbf24;
  }
  &--error {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
}

// ── Top Controls ────────────────────────────
.top-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  > * {
    pointer-events: all;
  }
}

.ctrl-fab {
  background: rgba(10, 14, 22, 0.85) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 40px;
  height: 40px;
}

// ── Route Panel ─────────────────────────────
.route-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: #ffffff;
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -6px 30px rgba(0, 0, 0, 0.15);
  padding: 0 16px 16px;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 240px;
  overflow: hidden;

  &--expanded {
    max-height: 500px;
  }
}

.panel-handle {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
  cursor: pointer;
}
.handle-bar {
  width: 36px;
  height: 4px;
  border-radius: 4px;
  background: #cbd5e1;
}

.route-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}
.route-time {
  font-size: 22px;
  font-weight: 800;
  color: #10b981;
  &--calc {
    color: #10b981;
    font-size: 18px;
  }
}
.route-dist {
  font-size: 14px;
  font-weight: 600;
  color: #64748b;
}

// ── Stops ───────────────────────────────────
.route-stops {
  padding-left: 4px;
}
.stop-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stop-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  &--origin {
    background: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
  }
  &--dest {
    background: #ef4444;
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
  }
}
.stop-label {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}
.stop-sub {
  font-size: 12px;
  color: #94a3b8;
}
.stop-dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 4px 0;
  margin-left: 4px;
  span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #cbd5e1;
  }
}

// ── Actions ─────────────────────────────────
.panel-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.act-btn {
  flex: 1;
  border-radius: 12px !important;
  font-weight: 700 !important;
  height: 44px;
}
.act-call {
  width: 44px;
  min-width: 44px !important;
  border-radius: 12px !important;
}
</style>
