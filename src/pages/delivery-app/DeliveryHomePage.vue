<template>
  <q-page class="delivery-home-page">
    <q-pull-to-refresh @refresh="onRefresh" color="purple">
      <!-- ── Hero Header ───────────────────────────── -->
      <div class="hero-section">
        <!-- Decorative orbs -->
        <div class="hero-orb hero-orb--1" />
        <div class="hero-orb hero-orb--2" />

        <div class="hero-inner">
          <!-- Avatar -->
          <div class="hero-avatar-wrap">
            <div class="hero-avatar-ring">
              <div class="hero-avatar">
                {{ initials(riderName) }}
              </div>
            </div>
            <!-- Live pulse badge -->
            <div class="hero-live-badge" :class="{ 'hero-live-badge--offline': !store.isConnected }">
              <div class="hero-live-dot" />
            </div>
          </div>

          <!-- Info -->
          <div class="hero-info">
            <div class="hero-name">{{ riderName }}</div>

            <!-- Role + Status chips -->
            <div class="hero-badges">
              <span class="hero-role-badge">
                <q-icon name="delivery_dining" size="12px" class="q-mr-xs" />
                Delivery Rider
              </span>
              <span class="hero-status-badge" :class="store.isConnected ? 'hero-status-badge--live' : 'hero-status-badge--offline'">
                <span class="hero-status-dot" />
                {{ store.isConnected ? 'Live' : 'Offline' }}
              </span>
            </div>

            <!-- Branch -->
            <div class="hero-branch" v-if="authStore.currentBranch">
              <q-icon name="store" size="12px" />
              {{ authStore.currentBranch.name }}
            </div>
          </div>
        </div>
      </div>

      <!-- ── KPI Cards ─────────────────────────────── -->
      <div class="q-px-md">
        <div class="kpi-row">
          <button class="kpi-card kpi-card--orange" @click="scrollToSection('pending')">
            <div class="kpi-icon-wrap"><q-icon name="pending_actions" size="24px" /></div>
            <div class="kpi-value">{{ store.pendingCount }}</div>
            <div class="kpi-label">Pending</div>
          </button>
          <button class="kpi-card kpi-card--blue" @click="scrollToSection('active')">
            <div class="kpi-icon-wrap"><q-icon name="local_shipping" size="24px" /></div>
            <div class="kpi-value">{{ store.activeCount }}</div>
            <div class="kpi-label">Active</div>
          </button>
          <button class="kpi-card kpi-card--green" @click="$router.push('/delivery-app/history')">
            <div class="kpi-icon-wrap"><q-icon name="check_circle" size="24px" /></div>
            <div class="kpi-value">{{ store.completedTodayCount }}</div>
            <div class="kpi-label">Today</div>
          </button>
        </div>

        <div class="kpi-row q-mt-sm">
          <button class="kpi-card kpi-card--amber">
            <div class="kpi-icon-wrap"><q-icon name="payments" size="24px" /></div>
            <div class="kpi-value">{{ cashToCollect }}</div>
            <div class="kpi-label">Cash COD</div>
          </button>
          <button class="kpi-card kpi-card--teal">
            <div class="kpi-icon-wrap"><q-icon name="timer" size="24px" /></div>
            <div class="kpi-value">{{ avgTime }}</div>
            <div class="kpi-label">Avg Time</div>
          </button>
          <button class="kpi-card kpi-card--red" :class="{ 'kpi-card--pulse': delayedCount > 0 }">
            <div class="kpi-icon-wrap"><q-icon name="warning" size="24px" /></div>
            <div class="kpi-value">{{ delayedCount }}</div>
            <div class="kpi-label">Delayed</div>
          </button>
        </div>
      </div>

      <!-- ── Quick Actions ─────────────────────────── -->
      <div class="q-px-md q-mt-md">
        <div class="section-title">Quick Actions</div>
        <div class="row q-col-gutter-sm">
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="deep-purple"
              icon="list_alt"
              label="Queue"
              to="/delivery-app"
              no-caps
            />
          </div>
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="blue-8"
              icon="map"
              label="Map"
              to="/delivery-app/map"
              no-caps
            />
          </div>
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="grey-8"
              icon="history"
              label="History"
              to="/delivery-app/history"
              no-caps
            />
          </div>
        </div>
      </div>

      <!-- ── Loading ─────────────────────────────── -->
      <div v-if="store.loading && !store.assignments.length" class="loading-wrap">
        <q-spinner-orbit size="48px" color="purple-4" />
        <div class="loading-text">Loading queue…</div>
      </div>

      <!-- ── Empty state ─────────────────────────── -->
      <div
        v-else-if="!store.pendingAssignments.length && !store.acceptedAssignments.length"
        class="empty-state"
      >
        <q-icon name="delivery_dining" size="64px" color="grey-7" />
        <div class="empty-title">No deliveries right now</div>
        <div class="empty-sub">New website orders will appear here automatically.</div>
      </div>

      <!-- ── My Active Deliveries ─────────────────── -->
      <template v-else>
        <div
          v-if="store.acceptedAssignments.length"
          ref="activeSection"
          class="section q-px-md q-mt-lg"
        >
          <div class="section-title">
            <q-icon name="local_shipping" size="18px" color="blue-4" class="q-mr-xs" />
            My Active ({{ store.acceptedAssignments.length }})
          </div>
          <div
            v-for="a in store.acceptedAssignments"
            :key="a.id"
            class="assignment-card assignment-card--active"
            @click="goToActive(a.id)"
          >
            <div class="card-top">
              <div class="order-badge order-badge--active">#{{ a.orderNumber }}</div>
              <q-chip dense :color="statusColor(a.status)" text-color="white" class="status-chip">
                {{ statusLabel(a.status) }}
              </q-chip>
            </div>
            <div class="card-details">
              <div class="detail-row" v-if="a.customer_name">
                <q-icon name="person" size="14px" color="grey-5" />
                <span>{{ a.customer_name }}</span>
              </div>
              <div class="detail-row" v-if="a.delivery_address">
                <q-icon name="location_on" size="14px" color="grey-5" />
                <span class="address-text">{{ a.delivery_address }}</span>
              </div>
            </div>
            <div class="card-actions-row">
              <q-btn
                flat
                dense
                no-caps
                color="blue-4"
                icon="map"
                label="Map"
                class="card-action-btn"
                @click.stop="goToMap(a.id)"
              />
              <q-btn
                flat
                dense
                no-caps
                color="green-4"
                icon="phone"
                label="Call"
                class="card-action-btn"
                @click.stop="callCustomer(a.customer_phone)"
              />
              <div class="time-ago">{{ a.timeAgo }}</div>
            </div>
          </div>
        </div>

        <!-- ── Available Deliveries ─────────────────── -->
        <div
          v-if="store.pendingAssignments.length"
          ref="pendingSection"
          class="section q-px-md q-mt-lg"
        >
          <div class="section-title">
            <q-icon name="pending_actions" size="18px" color="orange-5" class="q-mr-xs" />
            Available ({{ store.pendingAssignments.length }})
          </div>
          <div
            v-for="a in store.pendingAssignments"
            :key="a.id"
            class="assignment-card assignment-card--pending"
          >
            <div class="card-top">
              <div class="order-badge">#{{ a.orderNumber }}</div>
              <span class="source-badge">🌐 WEBSITE</span>
            </div>
            <div class="card-details">
              <div class="detail-row" v-if="a.customer_name">
                <q-icon name="person" size="14px" color="grey-5" />
                <span>{{ a.customer_name }}</span>
              </div>
              <div class="detail-row" v-if="a.delivery_address">
                <q-icon name="location_on" size="14px" color="grey-5" />
                <span class="address-text">{{ a.delivery_address }}</span>
              </div>
              <div class="detail-row" v-if="a.customer_phone">
                <q-icon name="phone" size="14px" color="grey-5" />
                <span>{{ a.customer_phone }}</span>
              </div>
              <div class="detail-row">
                <q-icon name="payments" size="14px" color="grey-5" />
                <span class="total-amount">Rs. {{ Number(a.orderTotal || 0).toFixed(2) }}</span>
              </div>
            </div>

            <!-- ── Items with Availability Toggles ──────────── -->
            <div class="items-preview q-mt-sm" v-if="a.items && a.items.length">
              <div class="items-preview-header">
                <span class="items-label">ORDER ITEMS</span>
                <span class="tap-hint">Tap to set availability</span>
              </div>
              <div
                v-for="item in a.items"
                :key="item.id"
                class="item-row"
                :class="{
                  'item-row--unavailable': getItemAvailability(a.id, item.id) === 'unavailable',
                  'item-row--available': getItemAvailability(a.id, item.id) === 'available',
                }"
              >
                <span class="item-qty">{{ item.quantity }}×</span>
                <span
                  class="item-name"
                  :class="{
                    'item-name--strike': getItemAvailability(a.id, item.id) === 'unavailable',
                  }"
                >
                  {{ item.name }}
                </span>
                <!-- Availability Toggle Buttons -->
                <div class="avail-toggle-group">
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    :icon="
                      getItemAvailability(a.id, item.id) === 'available'
                        ? 'check_circle'
                        : 'check_circle_outline'
                    "
                    :class="
                      getItemAvailability(a.id, item.id) === 'available'
                        ? 'avail-btn--yes'
                        : 'avail-btn--inactive'
                    "
                    @click.stop="toggleAvailability(a.id, item.id, 'available')"
                  >
                    <q-tooltip>Available</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    size="xs"
                    :icon="
                      getItemAvailability(a.id, item.id) === 'unavailable'
                        ? 'cancel'
                        : 'highlight_off'
                    "
                    :class="
                      getItemAvailability(a.id, item.id) === 'unavailable'
                        ? 'avail-btn--no'
                        : 'avail-btn--inactive'
                    "
                    @click.stop="toggleAvailability(a.id, item.id, 'unavailable')"
                  >
                    <q-tooltip>Unavailable</q-tooltip>
                  </q-btn>
                </div>
              </div>
              <!-- Unavailable summary banner -->
              <div v-if="getUnavailableCount(a.id) > 0" class="unavail-summary">
                <q-icon name="warning_amber" size="13px" class="q-mr-xs" />
                {{ getUnavailableCount(a.id) }} item(s) unavailable — will be excluded from KOT
                &amp; bill
              </div>
            </div>

            <div class="card-actions">
              <q-btn
                unelevated
                no-caps
                color="deep-purple"
                label="Accept Delivery"
                icon="delivery_dining"
                class="accept-btn"
                :loading="store.processing"
                @click="handleAccept(a)"
              />
            </div>
            <div class="card-footer">
              <span class="time-ago">{{ a.timeAgo }}</span>
              <span class="est-time" v-if="a.estimated_minutes"
                >~{{ a.estimated_minutes }} min</span
              >
            </div>
          </div>
        </div>
      </template>

      <div style="height: 24px" />
    </q-pull-to-refresh>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { useAuthStore } from 'stores/auth'
import { useQuasar } from 'quasar'
import { supabase } from 'src/boot/supabase'

const store = useDeliveryStore()
const authStore = useAuthStore()
const router = useRouter()
const $q = useQuasar()

const pendingSection = ref(null)
const activeSection = ref(null)

// ── Availability tracking per assignment ────────────────
// Map: { [assignmentId]: { [itemId]: 'available' | 'unavailable' | null } }
const itemAvailability = ref({})

function getItemAvailability(assignmentId, itemId) {
  return itemAvailability.value[assignmentId]?.[itemId] || null
}

function toggleAvailability(assignmentId, itemId, status) {
  if (!itemAvailability.value[assignmentId]) {
    itemAvailability.value[assignmentId] = {}
  }
  // Toggle: clicking same status clears it (back to unchecked)
  if (itemAvailability.value[assignmentId][itemId] === status) {
    itemAvailability.value[assignmentId][itemId] = null
  } else {
    itemAvailability.value[assignmentId][itemId] = status
  }
}

function getUnavailableCount(assignmentId) {
  const avail = itemAvailability.value[assignmentId]
  if (!avail) return 0
  return Object.values(avail).filter((v) => v === 'unavailable').length
}

function getUnavailableItemIds(assignment) {
  const avail = itemAvailability.value[assignment.id]
  if (!avail) return []
  return Object.entries(avail)
    .filter(([, v]) => v === 'unavailable')
    .map(([id]) => id)
}

function getUnavailableItemNames(assignment) {
  const unavailIds = getUnavailableItemIds(assignment)
  return (assignment.items || []).filter((i) => unavailIds.includes(i.id)).map((i) => i.name)
}

// ── KPI Calculations ─────────────────────
const cashToCollect = computed(() => {
  const total = store.acceptedAssignments.reduce((sum, a) => sum + Number(a.orderTotal || 0), 0)
  if (total === 0) return '0'
  if (total >= 1000) return `${(total / 1000).toFixed(1)}K`
  return String(Math.round(total))
})

const avgTime = computed(() => {
  const completed = store.history.filter((h) => h.assigned_at && h.delivered_at)
  if (!completed.length) return '—'
  const totalMins = completed.reduce((sum, h) => {
    return (
      sum +
      Math.round((new Date(h.delivered_at).getTime() - new Date(h.assigned_at).getTime()) / 60000)
    )
  }, 0)
  const avg = Math.round(totalMins / completed.length)
  return `${avg}m`
})

const delayedCount = computed(() => {
  return store.acceptedAssignments.filter((a) => {
    if (!a.assigned_at) return false
    const elapsed = (Date.now() - new Date(a.assigned_at).getTime()) / 60000
    return elapsed > (a.estimated_minutes || 45)
  }).length
})

// ── Rider display name ──────────────────
// Priority: profile full_name → email prefix (before @) → 'Rider'
const riderName = computed(() => {
  if (authStore.profile?.full_name) return authStore.profile.full_name
  const email = authStore.user?.email || ''
  if (email) return email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return 'Rider'
})

// ── Helpers ──────────────────────────────
function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function scrollToSection(type) {
  const el = type === 'pending' ? pendingSection.value : activeSection.value
  if (el?.$el) el.$el.scrollIntoView({ behavior: 'smooth' })
  else if (el) el.scrollIntoView({ behavior: 'smooth' })
}

async function handleAccept(assignment) {
  const unavailableIds = getUnavailableItemIds(assignment)
  const unavailableNames = getUnavailableItemNames(assignment)

  try {
    await store.acceptAssignment(assignment.id, unavailableIds.length > 0 ? unavailableIds : null)

    // Notify customer about unavailable items
    if (unavailableIds.length > 0 && unavailableNames.length > 0) {
      try {
        await supabase.from('order_notifications').insert({
          order_id: assignment.order_id,
          notification_type: 'item_unavailable',
          title: 'Items Unavailable',
          message: `Sorry, the following items are currently unavailable: ${unavailableNames.join(', ')}. They have been removed from your order.`,
          is_read: false,
        })
      } catch (notifyErr) {
        console.warn('[Delivery] Could not send customer notification:', notifyErr)
      }

      $q.notify({
        type: 'warning',
        icon: 'info',
        message: `Delivery accepted. ${unavailableNames.length} unavailable item(s) excluded from KOT.`,
        caption: unavailableNames.join(', '),
        position: 'top',
        timeout: 5000,
      })
    }

    // Clear availability tracking for this assignment
    delete itemAvailability.value[assignment.id]

    router.push('/delivery-app/active')
  } catch {
    // Error handled in store
  }
}

function goToActive(assignmentId) {
  store.loadActiveDelivery(assignmentId)
  router.push('/delivery-app/active')
}

function goToMap(assignmentId) {
  store.loadActiveDelivery(assignmentId)
  router.push('/delivery-app/map')
}

function callCustomer(phone) {
  if (phone) window.location.href = `tel:${phone}`
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
    pending_rider: 'Waiting',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  }
  return map[status] || status
}

async function onRefresh(done) {
  await store.loadAssignments()
  done()
}
</script>

<style lang="scss" scoped>
.delivery-home-page {
  min-height: 100vh;
}

// ── Hero ──────────────────────────────────
.hero-section {
  position: relative;
  padding: 22px 20px 20px;
  background: linear-gradient(135deg, #3d1a78 0%, #6d28d9 50%, #7c3aed 100%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

// Decorative background orbs
.hero-orb {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  &--1 {
    width: 140px;
    height: 140px;
    background: rgba(196, 181, 253, 0.28);
    top: -40px;
    right: -30px;
    filter: blur(18px);
  }
  &--2 {
    width: 100px;
    height: 100px;
    background: rgba(167, 139, 250, 0.22);
    bottom: -30px;
    left: 20px;
    filter: blur(14px);
  }
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 16px;
}

// Glowing avatar
.hero-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}
.hero-avatar-ring {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(135deg, #c4b5fd, #7c3aed, #4c1d95);
  box-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
}
.hero-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #5b21b6, #7c3aed);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
}
.hero-live-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #3d1a78;
  display: flex;
  align-items: center;
  justify-content: center;
  &--offline {
    background: #ef4444;
  }
}
.hero-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: hero-ping 1.8s ease-in-out infinite;
}
@keyframes hero-ping {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}

// Info block
.hero-info {
  flex: 1;
  min-width: 0;
}
.hero-name {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.3px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0,0,0,0.2);
}
.hero-badges {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.hero-role-badge {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #ede9fe;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 3px 9px;
  border-radius: 20px;
}
.hero-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 3px 9px;
  border-radius: 20px;
  &--live {
    color: #d1fae5;
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  &--offline {
    color: #fee2e2;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
}
.hero-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: hero-ping 1.8s ease-in-out infinite;
}
.hero-branch {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.3px;
}

// ── KPI Cards ─────────────────────────────
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}
.kpi-card {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition:
    transform 0.12s,
    opacity 0.12s;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #9ca3af;
  -webkit-tap-highlight-color: transparent;
  &:active {
    transform: scale(0.96);
    opacity: 0.8;
  }
  &--orange {
    color: #f97316;
    background: rgba(249, 115, 22, 0.08);
    border-color: rgba(249, 115, 22, 0.2);
  }
  &--blue {
    color: #60a5fa;
    background: rgba(96, 165, 250, 0.08);
    border-color: rgba(96, 165, 250, 0.2);
  }
  &--green {
    color: #34d399;
    background: rgba(52, 211, 153, 0.08);
    border-color: rgba(52, 211, 153, 0.2);
  }
  &--amber {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
    border-color: rgba(251, 191, 36, 0.2);
  }
  &--teal {
    color: #2dd4bf;
    background: rgba(45, 212, 191, 0.08);
    border-color: rgba(45, 212, 191, 0.2);
  }
  &--red {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
    border-color: rgba(248, 113, 113, 0.2);
  }
  &--pulse {
    animation: kpi-pulse 1.5s ease-in-out infinite;
  }
}
@keyframes kpi-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.3);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(248, 113, 113, 0);
  }
}

.kpi-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
}
.kpi-value {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
}
.kpi-label {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.85;
}

// ── Section ──────────────────────────────
.section-title {
  display: flex;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #4b5563;
  margin-bottom: 10px;
}
.quick-btn {
  height: 44px;
  border-radius: 10px !important;
  font-weight: 600;
  font-size: 12px;
}

// ── Loading / Empty ──────────────────────
.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
}
.loading-text {
  font-size: 13px;
  color: #9e9e9e;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 60px 20px;
  text-align: center;
}
.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #bdbdbd;
}
.empty-sub {
  font-size: 12px;
  color: #757575;
  max-width: 260px;
}

// ── Assignment Card ──────────────────────
.assignment-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
  transition: border-color 0.2s ease;
  &--pending:hover {
    border-color: rgba(156, 39, 176, 0.3);
  }
  &--active {
    border-left: 3px solid #42a5f5;
    cursor: pointer;
    &:hover {
      border-color: rgba(66, 165, 245, 0.4);
    }
  }
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.order-badge {
  font-size: 16px;
  font-weight: 800;
  color: #e8eaf0;
  &--active {
    color: #64b5f6;
  }
}
.source-badge {
  font-size: 10px;
  font-weight: 700;
  color: #ce93d8;
  background: rgba(206, 147, 216, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.4px;
}
.status-chip {
  font-size: 10px !important;
  height: 20px !important;
}
.card-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: #bdbdbd;
}
.address-text {
  line-height: 1.4;
  color: #e0e0e0;
}
.total-amount {
  font-weight: 700;
  color: #a5d6a7;
}
.card-actions {
  margin-top: 14px;
}
.accept-btn {
  width: 100%;
  height: 42px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 10px;
  letter-spacing: 0.3px;
}
.card-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 10px;
}
.card-action-btn {
  font-size: 11px !important;
  font-weight: 600 !important;
  border-radius: 8px !important;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  font-size: 10px;
  color: #757575;
}
.time-ago {
  font-size: 10px;
  color: #757575;
  margin-left: auto;
}
.est-time {
  color: #9e9e9e;
}

// ── Items Preview (availability toggles) ──────────────────
.items-preview {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.items-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  margin-bottom: 4px;
}

.items-label {
  font-size: 0.6rem;
  font-weight: 700;
  color: #6b7280;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.tap-hint {
  font-size: 0.6rem;
  color: #4b5563;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  font-size: 0.82rem;
  transition: all 0.2s ease;
  border-radius: 6px;

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  }

  &--available {
    background: rgba(34, 197, 94, 0.06);
    padding-left: 4px;
    padding-right: 4px;
  }

  &--unavailable {
    background: rgba(239, 68, 68, 0.08);
    padding-left: 4px;
    padding-right: 4px;
    opacity: 0.7;
  }
}

.item-qty {
  font-weight: 700;
  color: #ce93d8;
  min-width: 26px;
  font-size: 0.78rem;
}

.item-name {
  color: #d1d5db;
  flex: 1;
  font-size: 0.8rem;
  transition: all 0.2s;

  &--strike {
    text-decoration: line-through;
    color: #6b7280;
  }
}

.avail-toggle-group {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.avail-btn--inactive {
  color: #4b5563 !important;
  opacity: 0.45;
  transition: all 0.2s;

  &:hover {
    opacity: 1;
  }
}

.avail-btn--yes {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.15) !important;
  animation: avail-pop 0.3s ease;
}

.avail-btn--no {
  color: #ef4444 !important;
  background: rgba(239, 68, 68, 0.15) !important;
  animation: avail-pop 0.3s ease;
}

@keyframes avail-pop {
  0% {
    transform: scale(0.8);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.unavail-summary {
  display: flex;
  align-items: center;
  font-size: 0.68rem;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  border: 1px dashed rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  padding: 5px 8px;
  font-weight: 600;
  margin-top: 6px;
}
</style>

<style lang="scss">
body.body--light {
  .delivery-home-page {
    background: #f8fafc;
  }

  // Hero — vibrant gradient persists in light mode
  .hero-section {
    background: linear-gradient(135deg, #2e1065 0%, #5b21b6 45%, #7c3aed 100%) !important;
    border-bottom: 1px solid rgba(91, 33, 182, 0.4) !important;
    box-shadow: 0 6px 24px rgba(91, 33, 182, 0.25) !important;
  }
  // Keep hero text white on gradient background
  .hero-name, .hero-branch {
    color: #fff !important;
  }
  .hero-role-badge {
    background: rgba(255, 255, 255, 0.18) !important;
    border-color: rgba(255, 255, 255, 0.25) !important;
    color: #fff !important;
  }
  .hero-status-badge--live {
    background: rgba(16, 185, 129, 0.3) !important;
    border-color: rgba(16, 185, 129, 0.5) !important;
    color: #d1fae5 !important;
  }
  .hero-status-badge--offline {
    background: rgba(239, 68, 68, 0.3) !important;
    border-color: rgba(239, 68, 68, 0.5) !important;
    color: #fee2e2 !important;
  }

  // KPI Cards
  .kpi-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    &--orange {
      color: #ea580c;
      background: #fff7ed;
      border-color: #fed7aa;
    }
    &--blue {
      color: #2563eb;
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    &--green {
      color: #16a34a;
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    &--amber {
      color: #d97706;
      background: #fffbeb;
      border-color: #fde68a;
    }
    &--teal {
      color: #0d9488;
      background: #f0fdfa;
      border-color: #99f6e4;
    }
    &--red {
      color: #dc2626;
      background: #fef2f2;
      border-color: #fecaca;
    }
  }

  // Section title
  .section-title {
    color: #475569;
  }

  // Assignment cards
  .assignment-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

    &--pending:hover {
      border-color: #c4b5fd;
    }
    &--active {
      border-left: 3px solid #3b82f6;
      &:hover {
        border-color: #93c5fd;
      }
    }
  }

  .order-badge {
    color: #0f172a;
    &--active {
      color: #2563eb;
    }
  }
  .source-badge {
    color: #7c3aed;
    background: rgba(124, 58, 237, 0.08);
  }
  .detail-row {
    color: #475569;
  }
  .address-text {
    color: #334155;
  }
  .total-amount {
    color: #16a34a;
  }
  .card-actions-row {
    border-top: 1px solid #e2e8f0;
  }
  .card-footer {
    color: #94a3b8;
  }
  .time-ago {
    color: #94a3b8;
  }

  // Items preview (availability toggles)
  .items-preview {
    background: #f8fafc;
    border-color: #e2e8f0;
  }
  .items-preview-header {
    border-bottom-color: #e2e8f0;
  }
  .items-label {
    color: #475569;
  }
  .tap-hint {
    color: #94a3b8;
  }
  .item-row {
    &:not(:last-child) {
      border-bottom-color: #f1f5f9;
    }
  }
  .item-qty {
    color: #7c3aed;
  }
  .item-name {
    color: #334155;
  }
  .avail-btn--inactive {
    color: #94a3b8 !important;
    opacity: 0.6;
  }
  .unavail-summary {
    background: #fffbeb;
    border-color: rgba(245, 158, 11, 0.3);
  }

  // Empty / Loading
  .empty-title {
    color: #64748b;
  }
  .empty-sub {
    color: #94a3b8;
  }
  .loading-text {
    color: #64748b;
  }
}
</style>
