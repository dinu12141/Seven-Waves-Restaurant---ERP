<template>
  <div class="dmap-root">

    <!-- ═══ Full-Screen Google Map ═══ -->
    <div ref="mapEl" class="dmap-canvas" />

    <!-- ═══ NAVIGATION MODE: Turn Banner (top) ═══ -->
    <div v-if="isNavigating" class="nav-turn-banner">
      <div class="nav-turn-icon">
        <q-icon :name="currentManeuverIcon" size="36px" color="white" />
      </div>
      <div class="nav-turn-info">
        <div class="nav-turn-dist">{{ currentStepDist }}</div>
        <div class="nav-turn-inst">{{ currentStepInst }}</div>
      </div>
    </div>

    <!-- ═══ NAVIGATION MODE: ETA Strip (bottom) ═══ -->
    <div v-if="isNavigating" class="nav-eta-strip">
      <div class="nav-eta-time">{{ navRouteInfo?.durationText || '—' }}</div>
      <span class="nav-eta-dot">·</span>
      <div class="nav-eta-dist">{{ navRouteInfo?.distanceText || '—' }}</div>
      <span class="nav-eta-dot">·</span>
      <div class="nav-eta-arrival">{{ etaText }} arrival</div>
      <div style="flex:1" />
      <button class="nav-exit-btn" @click="exitNavigation">
        <q-icon name="close" size="18px" />
        <span>Exit</span>
      </button>
    </div>

    <!-- ═══ NAVIGATION MODE: Destination Card + Actions (Floating) ═══ -->
    <div v-if="isNavigating && currentDelivery" class="nav-dest-card">
      <div class="nav-dest-row">
        <q-icon name="person" color="blue-4" size="18px" />
        <span class="nav-dest-name">{{ currentDelivery.customer_name || 'Customer' }}</span>
        <q-space />
        <span class="nav-dest-amt">Rs. {{ Number(currentDelivery.orderTotal || 0).toLocaleString() }}</span>
      </div>
      <div class="nav-dest-addr">
        <q-icon name="place" color="red-5" size="16px" />
        <span>{{ currentDelivery.delivery_address }}</span>
      </div>

      <div v-if="currentDelivery.status === 'accepted' || currentDelivery.status === 'picked_up'" class="q-pt-sm q-mt-md" style="border-top: 1px solid rgba(255,255,255,0.1)">
        <q-btn
          v-if="currentDelivery.status === 'accepted'"
          unelevated no-caps color="cyan-8" icon="local_shipping" text-color="black"
          label="Mark Picked Up" class="nav-del-btn"
          :loading="store.processing"
          :disable="currentDelivery.orderStatus !== 'ready'"
          @click="handlePickUp"
        />
        <q-btn
          v-else-if="currentDelivery.status === 'picked_up'"
          unelevated no-caps color="green-8" icon="check_circle" text-color="black"
          label="Confirm Delivery" class="nav-del-btn"
          :loading="store.processing"
          @click="showConfirm = true"
        />
      </div>
    </div>

    <!-- ═══ NORMAL MODE: Route Planner Top Bar ═══ -->
    <div v-if="!isNavigating" class="gmap-top-planner">
      <div class="gmap-planner-fields">
        <button class="gmap-back-btn" @click="$router.back()">
          <q-icon name="arrow_back" size="24px" color="dark" />
        </button>
        
        <div class="gmap-route-stack">
          <!-- Left line & icons -->
          <div class="gmap-route-icons">
            <q-icon name="radio_button_unchecked" size="14px" color="grey-6" />
            <div class="gmap-route-dots"><span></span><span></span><span></span></div>
            <q-icon name="place" size="18px" color="red-6" />
          </div>
          
          <!-- Inputs -->
          <div class="gmap-route-inputs">
            <!-- Start Location -->
            <div class="gmap-input-wrap" @click="openOriginSearch">
              <input 
                v-if="searchActive && searchMode === 'origin'" 
                ref="searchInputEl" 
                v-model="searchQuery" 
                class="gmap-input-real" 
                placeholder="Choose start location" 
                autocomplete="off" spellcheck="false" 
                @input="onInput" @keydown.esc="closeSearch" 
              />
              <span v-else class="gmap-input-fake" :class="{'placeholder': !customOriginAddress && !riderPos}">
                {{ customOriginAddress || (riderPos ? 'Your location' : 'Choose start location') }}
              </span>
            </div>
            
            <div class="gmap-input-divider"></div>
            
            <!-- Destination Location -->
            <div class="gmap-input-wrap" @click="openSearch">
               <input 
                v-if="searchActive && searchMode === 'dest'" 
                ref="searchInputEl" 
                v-model="searchQuery" 
                class="gmap-input-real" 
                placeholder="Choose destination" 
                autocomplete="off" spellcheck="false" 
                @input="onInput" @keydown.esc="closeSearch" 
              />
              <span v-else class="gmap-input-fake" :class="{'placeholder': !destAddress}">
                {{ destAddress || 'Choose destination' }}
              </span>
            </div>
          </div>

          <!-- Swap Icon -->
          <button class="gmap-swap-btn" @click="swapLocations">
            <q-icon name="swap_vert" size="24px" color="grey-8" />
          </button>
        </div>
      </div>
      
      <!-- Vehicle Modes -->
      <div v-if="!searchActive" class="gmap-vehicle-tabs">
        <button class="gmap-v-tab" :class="{active: selectedVehicle === 'car'}" @click="selectedVehicle = 'car'">
          <q-icon name="directions_car" size="22px"/>
        </button>
        <button class="gmap-v-tab" :class="{active: selectedVehicle === 'motorcycle'}" @click="selectedVehicle = 'motorcycle'">
          <q-icon name="two_wheeler" size="22px"/>
        </button>
        <button class="gmap-v-tab disabled">
          <q-icon name="directions_transit" size="22px"/>
        </button>
        <button class="gmap-v-tab disabled">
          <q-icon name="directions_walk" size="22px"/>
        </button>
      </div>
    </div>

    <!-- ═══ Suggestions Sheet ═══ -->
    <div v-if="searchActive" class="gmap-suggestions" @mousedown.prevent>
      <div class="gmap-sug-item" @click="useCurrentLocation">
         <div class="gmap-sug-ico">
           <q-icon name="my_location" size="20px" color="blue-7" />
         </div>
         <div class="gmap-sug-body">
           <span class="gmap-sug-main">Your location</span>
         </div>
      </div>
      <div v-if="suggestions.length" class="gmap-sug-sep" />
      <div v-for="s in suggestions" :key="s.place_id" class="gmap-sug-item" @click="pickSuggestion(s)">
        <div class="gmap-sug-ico">
          <q-icon name="schedule" size="20px" color="grey-6" />
        </div>
        <div class="gmap-sug-body">
          <span class="gmap-sug-main">{{ s.structured_formatting?.main_text || s.description }}</span>
          <span class="gmap-sug-sub">{{ s.structured_formatting?.secondary_text || '' }}</span>
        </div>
      </div>
      <div v-if="searchQuery.length > 1 && !suggestions.length && loadingSuggestions" class="gmap-sug-loading">
        <q-spinner-dots size="22px" color="blue-6" />
      </div>
    </div>

    <!-- ═══ GPS Badge ═══ -->
    <div v-if="!isNavigating && !searchActive" class="dmap-gps-badge" :class="gpsBadgeClass">
      <q-icon :name="gpsIcon" size="12px" /><span>{{ gpsText }}</span>
    </div>

    <!-- ═══ Right FABs (normal mode) ═══ -->
    <div v-if="!isNavigating && !searchActive" class="dmap-fabs">
      <button class="dmap-fab" @click="snapToRider"><q-icon name="my_location" size="20px" color="white" /></button>
      <button class="dmap-fab" @click="toggleStyle"><q-icon name="layers" size="20px" color="white" /></button>
    </div>

    <!-- ═══ Navigation mode FAB: recenter ═══ -->
    <div v-if="isNavigating" class="nav-recenter-fab">
      <button class="dmap-fab" @click="snapToRider"><q-icon name="my_location" size="20px" color="white" /></button>
    </div>

    <!-- ═══ NORMAL MODE: Bottom Route Panel ═══ -->
    <transition name="slide-up">
      <div
        v-if="!isNavigating && !searchActive && (destReady || currentDelivery)"
        class="dmap-panel"
        :class="{ 'dmap-panel--open': panelOpen }"
        v-touch-swipe.mouse.up.down="handlePanelSwipe"
      >
        <div class="dmap-panel__handle-zone" @click="panelOpen = !panelOpen">
          <div class="dmap-panel__handle-bar" />
        </div>

        <!-- Route summary -->
        <div class="dmap-rt-row">
          <template v-if="routeInfo">
            <span class="dmap-rt-time">{{ routeInfo.durationText }}</span>
            <span class="dmap-rt-dot" />
            <span class="dmap-rt-dist">{{ routeInfo.distanceText }}</span>
            <span class="dmap-rt-dot" />
            <span class="dmap-rt-eta">ETA {{ etaText }}</span>
          </template>
          <div v-else class="dmap-rt-loading">
            <q-spinner-dots size="16px" color="blue-6" /><span>Calculating route…</span>
          </div>
        </div>

        <!-- Expanded: stops -->
        <template v-if="panelOpen">
          <div class="dmap-stops">
            <div class="dmap-stop" @click="openOriginSearch" style="cursor: pointer">
              <div class="dmap-stop__dot dmap-stop__dot--o" />
              <div>
                <div class="dmap-stop__label" style="display: flex; align-items: center; gap: 8px;">
                  <span>{{ customOriginAddress || 'Your location' }}</span>
                  <q-icon name="edit" size="14px" color="blue-6" />
                </div>
                <div class="dmap-stop__sub" v-if="customOriginLatLng || riderPos">{{ customOriginLatLng ? customOriginLatLng.lat.toFixed(4) + ', ' + customOriginLatLng.lng.toFixed(4) : riderPos.lat.toFixed(4) + ', ' + riderPos.lng.toFixed(4) }}</div>
                <div class="dmap-stop__sub" v-else>Acquiring GPS…</div>
              </div>
            </div>
            <div class="dmap-stop-line"><span/><span/><span/></div>
            <div class="dmap-stop">
              <div class="dmap-stop__dot dmap-stop__dot--d" />
              <div>
                <div class="dmap-stop__label">{{ currentDelivery?.customer_name || 'Customer' }}</div>
                <div class="dmap-stop__sub">{{ destAddress || currentDelivery?.delivery_address }}</div>
              </div>
            </div>
          </div>
          <div class="dmap-cust" v-if="currentDelivery">
            <a v-if="currentDelivery.customer_phone" :href="'tel:' + currentDelivery.customer_phone" class="dmap-cust-item">
              <q-icon name="phone" size="14px" color="blue-4" /><span>{{ currentDelivery.customer_phone }}</span>
            </a>
            <div class="dmap-cust-item">
              <q-icon name="payments" size="14px" color="amber-5" />
              <span class="dmap-cust-amount">Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span>
            </div>
          </div>
        </template>

        <!-- CTA: Start Navigation (IN-APP) + Call -->
        <div class="dmap-action-row">
          <div class="dmap-vehicle-selector">
            <button class="dmap-v-opt" :class="{active: selectedVehicle === 'motorcycle'}" @click="selectedVehicle = 'motorcycle'">
              <q-icon name="two_wheeler" size="20px"/>
            </button>
            <button class="dmap-v-opt" :class="{active: selectedVehicle === 'car'}" @click="selectedVehicle = 'car'">
              <q-icon name="directions_car" size="20px"/>
            </button>
            <button class="dmap-v-opt" :class="{active: selectedVehicle === 'tuk-tuk'}" @click="selectedVehicle = 'tuk-tuk'">
              <q-icon name="electric_rickshaw" size="20px"/>
            </button>
          </div>
          <button class="dmap-nav-btn" @click="startNavigation" :disabled="!destReady">
            <q-icon name="navigation" size="18px" /><span>Start Navigation</span>
          </button>
          <button class="dmap-call-btn" :disabled="!currentDelivery?.customer_phone" @click="callCustomer">
            <q-icon name="phone" size="18px" />
          </button>
        </div>

        <!-- Delivery status -->
        <q-btn
          v-if="currentDelivery?.status === 'accepted'"
          unelevated no-caps color="cyan-8" icon="local_shipping"
          label="Mark Picked Up" class="dmap-status-btn"
          :loading="store.processing"
          :disable="currentDelivery.orderStatus !== 'ready'"
          @click="handlePickUp"
        >
          <q-tooltip v-if="currentDelivery.orderStatus !== 'ready'">Wait for kitchen to mark order as ready</q-tooltip>
        </q-btn>
        <q-btn
          v-else-if="currentDelivery?.status === 'picked_up'"
          unelevated no-caps color="green-8" icon="check_circle"
          label="Confirm Delivery Complete" class="dmap-status-btn dmap-status-btn--deliver"
          :loading="store.processing" @click="showConfirm = true"
        />
      </div>
    </transition>

    <!-- Empty state -->
    <div v-if="!currentDelivery && mapReady" class="dmap-empty">
      <q-icon name="map" size="52px" color="grey-7" />
      <p>No active delivery</p>
      <q-btn flat no-caps color="purple-4" label="Go to Queue" icon="arrow_back"
        @click="$router.push('/delivery-app')" />
    </div>

    <!-- Confirm Delivery Dialog -->
    <q-dialog v-model="showConfirm" persistent>
      <q-card class="dmap-dlg">
        <q-card-section class="text-center q-pt-xl">
          <q-icon name="check_circle" size="52px" color="green" />
          <div class="text-h6 q-mt-sm text-white">Confirm Delivery</div>
          <div class="text-body2 q-mt-xs text-grey-5">
            Order <b>#{{ currentDelivery?.orderNumber }}</b> handed to
            <b>{{ currentDelivery?.customer_name || 'customer' }}</b>?
          </div>
        </q-card-section>
        <q-card-section v-if="currentDelivery" class="q-px-lg">
          <div class="dmap-dlg-row"><q-icon name="location_on" size="16px" color="grey-5" /><span class="text-grey-4">{{ currentDelivery.delivery_address }}</span></div>
          <div class="dmap-dlg-row q-mt-xs"><q-icon name="payments" size="16px" color="amber" /><span class="text-green-4 text-weight-bold">Rs. {{ Number(currentDelivery.orderTotal || 0).toFixed(2) }}</span></div>
        </q-card-section>
        <q-card-actions class="q-px-lg q-pb-lg" style="gap:8px">
          <q-btn flat no-caps label="Cancel" color="grey" v-close-popup style="flex:1" />
          <q-btn unelevated no-caps color="green-8" icon="check" label="Yes, Delivered"
            style="flex:2;border-radius:10px" :loading="store.processing" @click="confirmDeliver" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Location Required Dialog (Google Maps Style) -->
    <q-dialog v-model="locationRequiredDialog" persistent>
      <q-card class="gmap-loc-dialog">
        <q-card-section class="q-pa-lg">
          <div class="text-h6 text-weight-bold text-white q-mb-md" style="line-height:1.2">To continue, your device will need to use Location Accuracy</div>
          <div class="text-body2 text-grey-4 q-mb-md">The following settings should be on:</div>
          
          <div class="gmap-loc-item">
            <q-icon name="location_on" size="24px" color="light-blue-4" />
            <div class="text-body2 text-white">Device location</div>
          </div>
          <div class="gmap-loc-item q-mt-md">
            <q-icon name="gps_fixed" size="24px" color="light-blue-4" />
            <div class="text-caption text-grey-4 text-justify" style="line-height:1.4">
              Location Accuracy, which provides more accurate location for apps and services. To do this, Google periodically processes information about device sensors and wireless signals from your device to crowdsource wireless signal locations. These are used without identifying you to improve location accuracy and location-based services and to improve, provide and maintain Google's services based on Google's and third parties' legitimate interests to serve users' needs.
            </div>
          </div>
          
          <div class="text-caption text-grey-5 q-mt-md">
            You can change this at any time in location settings. <a href="#" class="text-light-blue-4 text-weight-medium" style="text-decoration:none">Manage settings</a> or <a href="#" class="text-light-blue-4 text-weight-medium" style="text-decoration:none">learn more</a>
          </div>
        </q-card-section>
        
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps color="grey-3" label="No, thanks" @click="$router.back()" style="border-radius:24px; border:1px solid #5f6368" />
          <q-btn unelevated no-caps color="light-blue-4" text-color="black" label="Turn on" @click="retryLocation" style="border-radius:24px; font-weight:600" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { supabase } from 'src/boot/supabase'
import { loadGoogleMaps } from 'src/utils/mapLoader'

const router = useRouter()
const store = useDeliveryStore()
const GKEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// ── Template refs ─────────────────────────────────
const mapEl = ref(null)
const searchInputEl = ref(null)

// ── UI state ──────────────────────────────────────
const searchActive = ref(false)
const searchQuery = ref('')
const searchMode = ref('dest') // 'dest' or 'origin'
const suggestions = ref([])
const loadingSuggestions = ref(false)
const panelOpen = ref(true)
const showConfirm = ref(false)
const mapReady = ref(false)

// ── Map state ─────────────────────────────────────
const riderPos = ref(null)
const geoError = ref(null)
const routeInfo = ref(null)
const destReady = ref(false)
const destAddress = ref('')
const customOriginAddress = ref('')
const customOriginLatLng = ref(null)
const useSatellite = ref(false)

// ── Heading (for navigation arrow rotation) ──────
const currentHeading = ref(0)

// ── Navigation state ──────────────────────────────
const isNavigating = ref(false)
const navSteps = ref([])          // google DirectionsStep[]
const currentStepIdx = ref(0)
const navRouteInfo = ref(null)    // live-updated {durationText, distanceText, duration}
const selectedVehicle = ref('motorcycle')

watch(selectedVehicle, () => {
  if (destLatLng) {
    routeInfo.value = null
    destReady.value = false
    calcRoute(destLatLng).then(() => { destReady.value = true })
  }
})

// ── Non-reactive map handles ──────────────────────
let map = null, riderMarker = null, destMarker = null
let riderAccuracyCircle = null   // pulsing accuracy halo
let directionsRenderer = null, geoWatchId = null
let supaChannel = null, broadcastInterval = null
let autocompleteSvc = null, placesSvc = null, geocoderSvc = null, dirSvc = null
let destLatLng = null
let suggestTimer = null
let rerouteTimer = null
let animFrameId = null           // smooth marker animation

// ── Store computed ────────────────────────────────
const currentDelivery = computed(() =>
  store.activeDelivery || store.acceptedAssignments[0] || null
)
const broadcastCh = computed(() => {
  const id = currentDelivery.value?.order_id
  return id ? `delivery:order-${id}` : ''
})

// ── GPS badge ─────────────────────────────────────
const gpsBadgeClass = computed(() => geoError.value ? 'dmap-gps-badge--err' : riderPos.value ? 'dmap-gps-badge--ok' : 'dmap-gps-badge--wait')
const gpsIcon = computed(() => geoError.value ? 'gps_off' : riderPos.value ? 'gps_fixed' : 'gps_not_fixed')
const gpsText = computed(() => geoError.value ? 'No GPS' : riderPos.value ? 'Live' : 'GPS…')

const locationRequiredDialog = computed(() => !!geoError.value && !riderPos.value)

// ── ETA ───────────────────────────────────────────
const etaText = computed(() => {
  const dur = isNavigating.value ? navRouteInfo.value?.duration : routeInfo.value?.duration
  if (!dur) return '—'
  const eta = new Date(); eta.setSeconds(eta.getSeconds() + dur)
  const h = eta.getHours() % 12 || 12, m = String(eta.getMinutes()).padStart(2, '0')
  return `${h}:${m} ${eta.getHours() >= 12 ? 'PM' : 'AM'}`
})

// ── Navigation step info ──────────────────────────
const currentStep = computed(() => navSteps.value[currentStepIdx.value] || null)

const currentManeuverIcon = computed(() => {
  const m = currentStep.value?.maneuver || ''
  const icons = {
    'turn-left': 'turn_left', 'turn-right': 'turn_right',
    'keep-left': 'fork_left', 'keep-right': 'fork_right',
    'roundabout-left': 'roundabout_left', 'roundabout-right': 'roundabout_right',
    'u-turn-left': 'u_turn_left', 'u-turn-right': 'u_turn_right',
    'ramp-left': 'ramp_left', 'ramp-right': 'ramp_right',
    'merge': 'merge', 'straight': 'straight',
    'ferry': 'directions_boat',
  }
  return icons[m] || 'arrow_upward'
})

const currentStepInst = computed(() =>
  (currentStep.value?.instructions || '').replace(/<[^>]*>/g, '') || 'Follow the route'
)

const currentStepDist = computed(() =>
  currentStep.value?.distance?.text || ''
)

// ── Haversine distance (meters) ───────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Init Map ──────────────────────────────────────
async function initMap() {
  const maps = await loadGoogleMaps(GKEY)
  if (!mapEl.value) return

  const center = riderPos.value || { lat: 6.8396, lng: 79.9012 }

  map = new maps.Map(mapEl.value, {
    center, zoom: 14,
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    styles: DARK_STYLE,
  })

  autocompleteSvc = new maps.places.AutocompleteService()
  placesSvc      = new maps.places.PlacesService(map)
  geocoderSvc    = new maps.Geocoder()
  dirSvc         = new maps.DirectionsService()

  directionsRenderer = new maps.DirectionsRenderer({
    map, 
    suppressMarkers: true,
    preserveViewport: true, // Prevent native Google UI underlap glitches
    polylineOptions: { strokeColor: '#4285f4', strokeWeight: 6, strokeOpacity: 0.9 },
  })

  riderMarker = new maps.Marker({
    position: center, map,
    icon: vehicleIcon(0),
    zIndex: 999,
  })

  // Accuracy circle (Google Maps-style blue halo)
  riderAccuracyCircle = new maps.Circle({
    map,
    center,
    radius: 30,
    fillColor: '#4285f4',
    fillOpacity: 0.08,
    strokeColor: '#4285f4',
    strokeOpacity: 0.25,
    strokeWeight: 1,
    clickable: false,
    zIndex: 998,
  })

  mapReady.value = true
  await resolveDestination()
  setupBroadcast()
}

// ── Resolve destination from order ────────────────
async function resolveDestination() {
  const d = currentDelivery.value; if (!d) return
  const address = d.delivery_address || ''
  destAddress.value = address

  let lat = d.delivery_lat || d.latitude
  let lng = d.delivery_lng || d.longitude

  if (lat && lng) {
    const pt = { lat: Number(lat), lng: Number(lng) }
    placeDestMarker(pt); await calcRoute(pt); destReady.value = true; return
  }
  if (address && geocoderSvc) {
    try {
      const r = await new Promise((res, rej) =>
        geocoderSvc.geocode({ address: address + ', Sri Lanka' }, (r, s) => s === 'OK' && r[0] ? res(r[0]) : rej(s))
      )
      const loc = r.geometry.location
      const pt = { lat: loc.lat(), lng: loc.lng() }
      placeDestMarker(pt); await calcRoute(pt); destReady.value = true
    } catch { console.warn('[DeliveryMap] Geocode failed') }
  }
}

// ── Destination Marker ────────────────────────────
function placeDestMarker(pt) {
  if (!map) return
  const maps = window.google.maps
  destLatLng = pt
  if (destMarker) destMarker.setMap(null)
  destMarker = new maps.Marker({
    position: pt, map,
    animation: maps.Animation.DROP,
    icon: {
      url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
          <path d="M18 0C8.06 0 0 8.06 0 18c0 12 18 30 18 30s18-18 18-30C36 8.06 27.94 0 18 0z" fill="#ea4335"/>
          <circle cx="18" cy="18" r="9" fill="white"/></svg>`
      ),
      scaledSize: new maps.Size(36, 48),
      anchor: new maps.Point(18, 48),
    },
  })
  if (riderPos.value) {
    const bounds = new maps.LatLngBounds()
    bounds.extend(riderPos.value); bounds.extend(pt)
    map.fitBounds(bounds, { top: 100, bottom: 280, left: 60, right: 60 })
  } else { map.setCenter(pt); map.setZoom(15) }
}

// ── Calculate Route (stores steps for navigation) ─
async function calcRoute(dest) {
  if (!dirSvc) return
  const origin = customOriginLatLng.value || riderPos.value || { lat: 6.8396, lng: 79.9012 }

  const v = selectedVehicle.value
  let travelMode = window.google.maps.TravelMode.DRIVING
  let avoidHighways = false

  if (v === 'motorcycle') {
    // Motorcycles in Sri Lanka can take routes cars can't (alleyways)
    travelMode = window.google.maps.TravelMode.TWO_WHEELER || window.google.maps.TravelMode.DRIVING
  } else if (v === 'tuk-tuk') {
    // Tuk-tuks use driving roads BUT are legally banned from Expressways/Highways
    travelMode = window.google.maps.TravelMode.DRIVING
    avoidHighways = true
  }

  const request = {
    origin,
    destination: dest,
    travelMode,
    avoidHighways
  }

  try {
    const result = await new Promise((res, rej) =>
      dirSvc.route(request, (r, s) => s === 'OK' ? res(r) : rej(s))
    )
    directionsRenderer.setDirections(result)
    
    // Fit bounds with proper padding
    if (result.routes?.[0]?.bounds) {
      map.fitBounds(result.routes[0].bounds, { top: 100, bottom: 280, left: 60, right: 60 })
    }

    const leg = result.routes[0]?.legs[0]
    if (leg) {
      const info = { 
        durationText: leg.duration.text, 
        distanceText: leg.distance.text, 
        duration: leg.duration.value 
      }
      routeInfo.value = info
      navRouteInfo.value = info
      navSteps.value = leg.steps || []
      currentStepIdx.value = 0
    }
  } catch (e) { 
    console.warn('[DeliveryMap] Route error:', e)
    routeInfo.value = { durationText: 'N/A', distanceText: 'N/A', duration: 0 }
  }
}

// ── Vehicle icon SVGs ────────────────────────────
// Motorcycle/scooter icon used for delivery rider marker.
// Rotates based on GPS heading. Two modes: normal (green) and navigating (blue).

function vehicleIcon(heading, navigating = false, vType = 'motorcycle') {
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

// ── Smooth marker animation ─────────────────────
// Animates the rider marker between two lat/lng points over ~800ms
// for fluid Google Maps-like movement
function animateMarkerTo(marker, newPos, circle) {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  const startPos = marker.getPosition()
  if (!startPos) { marker.setPosition(newPos); if (circle) circle.setCenter(newPos); return }

  const startLat = startPos.lat(), startLng = startPos.lng()
  const dLat = newPos.lat - startLat, dLng = newPos.lng - startLng

  // Skip animation for big jumps (>500m = GPS glitch or first fix)
  if (Math.abs(dLat) > 0.005 || Math.abs(dLng) > 0.005) {
    marker.setPosition(newPos)
    if (circle) circle.setCenter(newPos)
    return
  }

  const duration = 800 // ms
  const start = performance.now()

  function step(now) {
    const elapsed = now - start
    const t = Math.min(elapsed / duration, 1)
    // Ease-out cubic for natural deceleration
    const ease = 1 - Math.pow(1 - t, 3)
    const lat = startLat + dLat * ease
    const lng = startLng + dLng * ease
    const pos = { lat, lng }
    marker.setPosition(pos)
    if (circle) circle.setCenter(pos)
    if (t < 1) { animFrameId = requestAnimationFrame(step) }
  }
  animFrameId = requestAnimationFrame(step)
}

// ── GPS ───────────────────────────────────────────
// Strategy:
//  1. getCurrentPosition() with a long timeout to get the very first fix
//     (avoids triggering the error dialog before the OS permission prompt resolves)
//  2. Only after first fix succeeds, start watchPosition for continuous tracking
//  3. TIMEOUT errors (code 3) on the first fix are silently retried — NOT shown as errors
let gpsFirstFixDone = false

function startGPS() {
  if (!navigator.geolocation) { geoError.value = 'GPS not supported'; return }

  // ── Step 1: One-shot first fix with a generous timeout ──
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsFirstFixDone = true
      _onGpsSuccess(pos)
      // ── Step 2: Once we have the first fix, start continuous watch ──
      _startWatch()
    },
    (err) => {
      // TIMEOUT on first fix = user hasn't answered permission yet, or GPS is warming up.
      // Don't show the error dialog — just start the watch directly and let it handle it.
      if (err.code === 3 /* TIMEOUT */) {
        _startWatch()
      } else {
        // PERMISSION_DENIED (code 1) or POSITION_UNAVAILABLE (code 2) → show dialog
        geoError.value = err.code === 1
          ? 'Location permission denied. Please allow location access in your browser settings.'
          : err.message
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
  )
}

function _onGpsSuccess(pos) {
  const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }
  riderPos.value = newPos
  geoError.value = null

  if (pos.coords.heading !== null && pos.coords.heading >= 0) {
    currentHeading.value = pos.coords.heading
  }

  if (riderMarker) {
    animateMarkerTo(riderMarker, newPos, riderAccuracyCircle)
    riderMarker.setIcon(vehicleIcon(currentHeading.value, isNavigating.value, selectedVehicle.value))
  }

  if (riderAccuracyCircle && pos.coords.accuracy) {
    riderAccuracyCircle.setRadius(Math.min(pos.coords.accuracy, 100))
  }
}

function _startWatch() {
  if (geoWatchId !== null) return // already watching
  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      gpsFirstFixDone = true
      _onGpsSuccess(pos)
    },
    (err) => {
      // Only show error dialog for PERMISSION_DENIED (code 1) or if we never got a fix
      // TIMEOUT errors (code 3) during watch are transient on mobile — ignore them
      if (err.code === 1) {
        geoError.value = 'Location permission denied. Please allow location access in your browser settings.'
      } else if (err.code === 2 && !gpsFirstFixDone) {
        geoError.value = 'GPS signal unavailable. Please move to an open area.'
      }
      // code 3 (TIMEOUT) during watch = temporary signal loss, do NOT show dialog
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 }
  )
}

watch(selectedVehicle, (newVal) => {
  if (riderMarker) {
    riderMarker.setIcon(vehicleIcon(currentHeading.value, isNavigating.value, newVal))
  }
  if (destLatLng) {
    calcRoute(destLatLng)
  }
})

// ── Broadcast rider GPS to customer ──────────────
function setupBroadcast() {
  if (!broadcastCh.value) return
  supaChannel = supabase.channel(broadcastCh.value)
  supaChannel.subscribe()
  broadcastInterval = setInterval(() => {
    if (!riderPos.value || !supaChannel) return
    supaChannel.send({ type: 'broadcast', event: 'location',
      payload: { lat: riderPos.value.lat, lng: riderPos.value.lng, heading: currentHeading.value, vType: selectedVehicle.value, ts: Date.now() } })
  }, 5000)
}

// ── Places Autocomplete ────────────────────────────
function onInput() {
  clearTimeout(suggestTimer)
  if (!searchQuery.value.trim()) { suggestions.value = []; return }
  loadingSuggestions.value = true
  suggestTimer = setTimeout(async () => {
    if (!autocompleteSvc) return
    try {
      const preds = await new Promise((res, rej) =>
        autocompleteSvc.getPlacePredictions(
          { input: searchQuery.value, componentRestrictions: { country: 'lk' },
            ...(riderPos.value && { location: new window.google.maps.LatLng(riderPos.value.lat, riderPos.value.lng), radius: 50000 }) },
          (p, s) => (s === 'OK' || s === 'ZERO_RESULTS') ? res(p || []) : rej(s)
        )
      )
      suggestions.value = preds
    } catch { suggestions.value = [] }
    loadingSuggestions.value = false
  }, 280)
}

async function pickSuggestion(place) {
  closeSearch()
  const isDest = searchMode.value === 'dest'
  
  if (isDest) destAddress.value = place.description
  else customOriginAddress.value = place.description
  
  if (!placesSvc) return
  try {
    const detail = await new Promise((res, rej) =>
      placesSvc.getDetails({ placeId: place.place_id, fields: ['geometry', 'formatted_address'] },
        (r, s) => s === 'OK' ? res(r) : rej(s))
    )
    const loc = detail.geometry.location
    const pt = { lat: loc.lat(), lng: loc.lng() }
    
    if (isDest) {
      destAddress.value = detail.formatted_address || place.description
      routeInfo.value = null; destReady.value = false
      placeDestMarker(pt); await calcRoute(pt); destReady.value = true
    } else {
      customOriginAddress.value = detail.formatted_address || place.description
      customOriginLatLng.value = pt
      if (destLatLng) {
        routeInfo.value = null; destReady.value = false
        await calcRoute(destLatLng); destReady.value = true
      }
    }
  } catch (e) { console.warn('[Places] error:', e) }
}

function swapLocations() {
  const tempAddr = customOriginAddress.value
  const tempPos = customOriginLatLng.value
  
  customOriginAddress.value = destAddress.value
  customOriginLatLng.value = destLatLng
  
  destAddress.value = tempAddr
  destLatLng = tempPos
  
  if (destLatLng) {
    routeInfo.value = null
    destReady.value = false
    calcRoute(destLatLng).then(() => { destReady.value = true })
  }
}

function handlePanelSwipe(info) {
  if (info.direction === 'up' && !panelOpen.value) {
    panelOpen.value = true
  } else if (info.direction === 'down' && panelOpen.value) {
    panelOpen.value = false
  }
}

function openSearch() { searchMode.value = 'dest'; searchActive.value = true; searchQuery.value = ''; nextTick(() => searchInputEl.value?.focus()) }
function openOriginSearch() { searchMode.value = 'origin'; searchActive.value = true; searchQuery.value = ''; nextTick(() => searchInputEl.value?.focus()) }
function closeSearch() { searchActive.value = false; suggestions.value = [] }
function useCurrentLocation() {
  closeSearch()
  if (searchMode.value === 'dest') {
    snapToRider()
  } else {
    customOriginAddress.value = ''
    customOriginLatLng.value = null
    if (destLatLng) calcRoute(destLatLng)
    snapToRider()
  }
}

// ═══════════════════════════════════════════════
//  IN-APP NAVIGATION
// ═══════════════════════════════════════════════
function startNavigation() {
  if (!destLatLng) return
  // If steps not loaded yet, still start (banner will show when they load)
  isNavigating.value = true
  currentStepIdx.value = 0
  panelOpen.value = false

  if (map && riderPos.value) {
    map.setOptions({ zoom: 18, mapTypeId: 'roadmap' })
    // Switch to navigation vehicle icon (blue)
    if (riderMarker) riderMarker.setIcon(vehicleIcon(currentHeading.value, true, selectedVehicle.value))
    // Hide accuracy circle during navigation (cleaner view)
    if (riderAccuracyCircle) riderAccuracyCircle.setVisible(false)
    // Apply heading-up orientation + perspective tilt
    try {
      map.setHeading(currentHeading.value)
      map.setTilt(45)
    } catch (e) { void e }
    // Center map with rider at bottom-1/3 of screen
    centerMapOnRider(riderPos.value)
  }
  store.isNavigating = isNavigating.value
 
  // Periodic reroute every 10s for live navigation behavior
  clearInterval(rerouteTimer)
  rerouteTimer = setInterval(() => {
    if (destLatLng && riderPos.value) calcRoute(destLatLng)
  }, 10000)
}
 
function exitNavigation() {
  isNavigating.value = false
  store.isNavigating = false
  clearInterval(rerouteTimer)
  // Restore map to normal: north-up, no tilt, vehicle marker (green)
  if (map) {
    try { map.setHeading(0); map.setTilt(0) } catch (e) { void e }
    if (riderMarker) riderMarker.setIcon(vehicleIcon(currentHeading.value, false, selectedVehicle.value))
    if (riderAccuracyCircle) riderAccuracyCircle.setVisible(true)
  }
  if (map && riderPos.value && destLatLng) {
    const bounds = new window.google.maps.LatLngBounds()
    bounds.extend(riderPos.value); bounds.extend(destLatLng)
    map.fitBounds(bounds, { top: 100, bottom: 280, left: 60, right: 60 })
  }
}

// ── Center map with rider positioned at bottom-1/3 ──
// (Mimics Google Maps navigation: route ahead is visible)
function centerMapOnRider(pos) {
  if (!map || !pos) return
  try {
    const proj = map.getProjection()
    if (!proj) { map.panTo(pos); return }
    const scale = Math.pow(2, map.getZoom())
    const point = proj.fromLatLngToPoint(new window.google.maps.LatLng(pos.lat, pos.lng))
    // Shift center UP by 22% of screen height so rider sits lower on screen
    const offsetY = (mapEl.value?.clientHeight || 600) * 0.22
    const newPoint = new window.google.maps.Point(point.x, point.y - offsetY / scale)
    map.setCenter(proj.fromPointToLatLng(newPoint))
  } catch {
    map.panTo(pos)
  }
}

// ── Map controls ──────────────────────────────────
function snapToRider() {
  if (!map || !riderPos.value) return
  map.panTo(riderPos.value); map.setZoom(isNavigating.value ? 18 : 16)
}
function toggleStyle() {
  useSatellite.value = !useSatellite.value
  if (map) map.setOptions({ styles: useSatellite.value ? null : DARK_STYLE, mapTypeId: useSatellite.value ? 'satellite' : 'roadmap' })
}
function callCustomer() {
  const ph = currentDelivery.value?.customer_phone
  if (ph) window.location.href = `tel:${ph}`
}

// ── Delivery actions ──────────────────────────────
async function handlePickUp() { if (!currentDelivery.value) return; await store.pickUp(currentDelivery.value.id) }
async function confirmDeliver() {
  if (!currentDelivery.value) return
  await store.deliver(currentDelivery.value.id)
  showConfirm.value = false
  exitNavigation()
  if (supaChannel) supabase.removeChannel(supaChannel)
  router.push('/delivery-app')
}

// ── Watch riderPos → update navigation state ────
watch(riderPos, (pos) => {
  if (!pos || !map) return
  // Note: marker position is animated in startGPS() callback via animateMarkerTo()

  if (isNavigating.value) {
    // ── Rotate map to match heading (heading-up like Google Maps) ──
    try { map.setHeading(currentHeading.value) } catch (e) { void e }

    // ── Center map with rider at bottom-1/3 of screen ──
    centerMapOnRider(pos)

    // ── Step advancement: advance when within 25m of turn point ──
    const step = navSteps.value[currentStepIdx.value]
    if (step && currentStepIdx.value < navSteps.value.length - 1) {
      const end = step.end_location
      const dist = haversine(pos.lat, pos.lng, end.lat(), end.lng())
      if (dist < 25) {
        currentStepIdx.value = Math.min(currentStepIdx.value + 1, navSteps.value.length - 1)
      }
    }

    // ── Live ETA/distance recalculation from remaining steps ──
    const remainingSteps = navSteps.value.slice(currentStepIdx.value)
    const remDur  = remainingSteps.reduce((s, st) => s + (st.duration?.value  || 0), 0)
    const remDist = remainingSteps.reduce((s, st) => s + (st.distance?.value  || 0), 0)
    navRouteInfo.value = {
      durationText: remDur >= 3600
        ? `${Math.floor(remDur/3600)}h ${Math.floor((remDur%3600)/60)}m`
        : `${Math.ceil(remDur/60)} min`,
      distanceText: remDist >= 1000 ? `${(remDist/1000).toFixed(1)} km` : `${remDist} m`,
      duration: remDur,
    }
  }
})

// ── Lifecycle ──────────────────────────────────────
onMounted(async () => {
  startGPS()
  await new Promise(r => setTimeout(r, 400))
  await initMap()
})
onUnmounted(() => {
  if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId)
  if (animFrameId) cancelAnimationFrame(animFrameId)
  clearTimeout(suggestTimer); clearInterval(rerouteTimer)
  if (broadcastInterval) clearInterval(broadcastInterval)
  if (supaChannel) supabase.removeChannel(supaChannel)
  if (map) map = null
})

// ── Retry button handler ───────────────────────────
// Clears the error state, clears the old watch, and restarts GPS fresh
function retryLocation() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId)
    geoWatchId = null
  }
  geoError.value = null
  gpsFirstFixDone = false
  startGPS()
}

// ── Dark Map Style ────────────────────────────────
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
]
</script>

<style lang="scss" scoped>
.dmap-root { position: relative; width: 100%; height: 100dvh; overflow: hidden; background: #1a1a1a; }
.dmap-canvas { position: absolute; inset: 0; z-index: 0; }

// ══════════════════════════════════════════════════
//  IN-APP NAVIGATION UI
// ══════════════════════════════════════════════════

// Turn-by-turn banner (top, like Google Maps navigation)
.nav-turn-banner {
  position: absolute;
  top: 0; left: 0; right: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 16px;
  background: #1a73e8;
  padding: 18px 20px;
  padding-top: calc(18px + env(safe-area-inset-top));
  box-shadow: 0 4px 24px rgba(26,115,232,0.45);
}
.nav-turn-icon {
  width: 56px; height: 56px;
  border-radius: 14px;
  background: rgba(255,255,255,0.18);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.nav-turn-info { flex: 1; min-width: 0; }
.nav-turn-dist {
  font-size: 30px; font-weight: 800; color: #fff; line-height: 1;
}
.nav-turn-inst {
  font-size: 16px; color: rgba(255,255,255,0.88); margin-top: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

// ETA strip (bottom, like Google Maps)
.nav-eta-strip {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1a1e2e;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding: 16px 20px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
}
.nav-eta-time  { font-size: 20px; font-weight: 800; color: #4285f4; }
.nav-eta-dist  { font-size: 16px; font-weight: 600; color: #9e9e9e; }
.nav-eta-arrival { font-size: 16px; font-weight: 700; color: #34a853; }
.nav-eta-dot   { color: #4b5563; font-weight: 800; font-size: 16px; }

.nav-exit-btn {
  display: flex; align-items: center; gap: 6px;
  border: none; background: rgba(239,68,68,0.15);
  border: 1px solid rgba(239,68,68,0.3);
  color: #fca5a5; font-size: 15px; font-weight: 700;
  border-radius: 20px; padding: 6px 14px; cursor: pointer;
}

// In-nav delivery action (floats above ETA strip)
.nav-delivery-action {
  position: absolute;
  bottom: 154px; left: 16px; right: 16px;
  z-index: 200;
}
.nav-del-btn {
  width: 100%; height: 48px;
  border-radius: 24px !important; font-weight: 800 !important;
  font-size: 16px !important;
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
}

// In-nav recenter FAB
.nav-recenter-fab {
  position: absolute; right: 16px; bottom: 210px; z-index: 200;
}

.nav-dest-card {
  position: absolute;
  bottom: 80px; left: 12px; right: 12px;
  background: rgba(26, 30, 46, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 14px 16px;
  z-index: 200;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  animation: slideUp 0.4s ease-out;
}
.nav-dest-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.nav-dest-name { font-size: 16px; font-weight: 700; color: #fff; }
.nav-dest-amt { font-size: 16px; font-weight: 800; color: #4ade80; }
.nav-dest-addr {
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 14px; color: #94a3b8; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

// ══════════════════════════════════════════════════
//  NORMAL MODE UI (Google Maps Style Planner)
// ══════════════════════════════════════════════════
.gmap-top-planner {
  position: absolute; top: 0; left: 0; right: 0; z-index: 200;
  background: white; border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05); padding-bottom: 8px;
  padding-top: env(safe-area-inset-top);
}
.gmap-planner-fields {
  display: flex; align-items: stretch; padding: 12px 16px;
}
.gmap-back-btn {
  background: none; border: none; padding: 12px 4px 12px 0; cursor: pointer; display: flex; align-items: flex-start;
}
.gmap-route-stack {
  flex: 1; display: flex; align-items: stretch; gap: 12px; margin-left: 8px;
}
.gmap-route-icons {
  display: flex; flex-direction: column; align-items: center; justify-content: center; width: 24px; padding-top: 14px; padding-bottom: 14px; gap: 4px;
}
.gmap-route-dots {
  display: flex; flex-direction: column; gap: 4px; flex: 1; align-items: center; justify-content: center;
  span { width: 4px; height: 4px; background: #bdbdbd; border-radius: 50%; }
}
.gmap-route-inputs {
  flex: 1; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid #dadce0; border-radius: 8px;
}
.gmap-input-wrap {
  height: 44px; display: flex; align-items: center; padding: 0 12px; cursor: text;
}
.gmap-input-divider {
  height: 1px; background: #f1f3f4; margin: 0 12px;
}
.gmap-input-fake {
  font-size: 15px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  &.placeholder { color: #5f6368; }
}
.gmap-input-real {
  border: none; outline: none; background: transparent; font-size: 15px; color: #202124; width: 100%;
}
.gmap-swap-btn {
  background: none; border: none; padding: 0; cursor: pointer; display: flex; align-items: center; padding-left: 8px;
}

// Vehicle Tabs
.gmap-vehicle-tabs {
  display: flex; justify-content: space-around; padding: 10px 16px 0;
}
.gmap-v-tab {
  background: none; border: none; padding: 6px 20px; cursor: pointer;
  border-radius: 20px; transition: 0.2s; color: #5f6368; display: flex; align-items: center; justify-content: center;
  &.active { background: #cce4fc; color: #1a73e8; }
  &.disabled { opacity: 0.4; pointer-events: none; }
}

// Suggestions
.gmap-suggestions {
  position: absolute; top: 160px; left: 0; right: 0; bottom: 0; z-index: 199;
  background: #f8f9fa; overflow-y: auto; padding-top: 8px;
}
.gmap-sug-item {
  display: flex; align-items: center; padding: 14px 20px; cursor: pointer; background: white;
  &:hover, &:active { background: #f1f3f4; }
}
.gmap-sug-ico {
  width: 36px; height: 36px; border-radius: 50%; background: #f1f3f4;
  display: flex; align-items: center; justify-content: center; margin-right: 16px;
}
.gmap-sug-body {
  flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.gmap-sug-main { font-size: 16px; color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gmap-sug-sub { font-size: 13px; color: #5f6368; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gmap-sug-sep { height: 1px; background: #e0e0e0; margin: 0 20px; }
.gmap-sug-loading { padding: 20px; display: flex; justify-content: center; }

.dmap-gps-badge {
  position: absolute; top: 74px; left: 14px; z-index: 50;
  display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 14px; font-size: 13px; font-weight: 700; backdrop-filter: blur(8px);
  &--ok   { background: rgba(16,185,129,0.18); border: 1px solid rgba(16,185,129,0.3); color: #6ee7b7; }
  &--wait { background: rgba(245,158,11,0.18); border: 1px solid rgba(245,158,11,0.3); color: #fbbf24; }
  &--err  { background: rgba(239,68,68,0.18);  border: 1px solid rgba(239,68,68,0.3);  color: #fca5a5; }
}

.dmap-fabs { position: absolute; right: 14px; bottom: 300px; z-index: 50; display: flex; flex-direction: column; gap: 10px; }
.dmap-fab {
  width: 44px; height: 44px; border-radius: 50%; border: none;
  background: rgba(10,14,22,0.85); backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; cursor: pointer;
}

.dmap-panel {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 60;
  background: #fff; border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.18); padding: 0 16px 20px;
  transition: max-height 0.35s cubic-bezier(0.4,0,0.2,1);
  max-height: 200px; overflow: hidden;
  &--open { max-height: 560px; overflow-y: auto; overflow-x: hidden; }
  &__handle-zone { display: flex; justify-content: center; padding: 10px 0 6px; cursor: pointer; }
  &__handle-bar  { width: 36px; height: 4px; border-radius: 4px; background: #dadce0; }
}

.dmap-rt-row { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; }
.dmap-rt-time  { font-size: 22px; font-weight: 800; color: #1a73e8; }
.dmap-rt-dist  { font-size: 16px; font-weight: 600; color: #5f6368; }
.dmap-rt-eta   { font-size: 16px; color: #34a853; font-weight: 600; }
.dmap-rt-dot   { width: 4px; height: 4px; border-radius: 50%; background: #bdc1c6; flex-shrink: 0; }
.dmap-rt-loading { display: flex; align-items: center; gap: 8px; font-size: 15px; color: #9aa0a6; }

.dmap-stops { padding: 8px 0; }
.dmap-stop  { display: flex; align-items: flex-start; gap: 14px; padding: 4px 0;
  &__dot   { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; &--o { background: #4285f4; } &--d { background: #ea4335; } }
  &__label { font-size: 16px; font-weight: 600; color: #202124; }
  &__sub   { font-size: 14px; color: #70757a; margin-top: 2px; }
}
.dmap-stop-line { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 3px 0; margin-left: 6px; span { width: 3px; height: 3px; border-radius: 50%; background: #bdc1c6; } }

.dmap-cust { display: flex; gap: 16px; padding: 10px 0 4px; border-top: 1px solid #f1f3f4; margin-top: 8px; }
.dmap-cust-item { display: flex; align-items: center; gap: 6px; font-size: 15px; color: #3c4043; text-decoration: none; }
.dmap-cust-amount { font-weight: 700; color: #188038; }

.dmap-action-row { display: flex; gap: 10px; margin: 14px 0 10px; flex-wrap: wrap; }
.dmap-vehicle-selector {
  display: flex; gap: 8px; width: 100%; margin-bottom: 6px;
}
.dmap-v-opt {
  flex: 1; height: 44px; border: 1.5px solid #dadce0; border-radius: 12px; background: #fff;
  color: #5f6368; display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: all 0.2s;
  &.active { background: #e8f0fe; border: 2px solid #f9ab00; color: #1a73e8; }
}
.dmap-nav-btn {
  flex: 1; height: 46px; border: none; border-radius: 10px; background: #1a73e8; color: #fff;
  font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;
  &:hover { background: #1669d0; } &:disabled { background: #bdc1c6; }
}
.dmap-call-btn {
  width: 46px; height: 46px; border-radius: 50%; border: 1.5px solid #dadce0; background: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer; color: #5f6368;
  &:disabled { opacity: 0.4; }
}
.dmap-status-btn { width: 100%; height: 46px; border-radius: 10px !important; font-size: 16px; font-weight: 700; &--deliver { background: linear-gradient(135deg,#22c55e,#16a34a) !important; } }

.dmap-empty { position: absolute; inset: 0; z-index: 80; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: #090c14; p { color: #bdbdbd; font-size: 16px; font-weight: 700; margin: 0; } }

.dmap-dlg { width: 320px !important; border-radius: 20px !important; background: #1a1e2e !important; }
.dmap-dlg-row { display: flex; align-items: center; gap: 8px; }

.fade-slide-enter-active, .fade-slide-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-slide-enter-from { opacity: 0; transform: translateY(-8px); }
.fade-slide-leave-to  { opacity: 0; transform: translateY(-8px); }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s; }
.slide-up-enter-from { transform: translateY(100%); opacity: 0; }
.slide-up-leave-to  { transform: translateY(100%); opacity: 0; }

// Google Maps style dialog
.gmap-loc-dialog {
  background: #202124 !important; border-radius: 16px !important; width: 100%; max-width: 380px;
}
.gmap-loc-item {
  display: flex; align-items: flex-start; gap: 16px;
}
</style>
