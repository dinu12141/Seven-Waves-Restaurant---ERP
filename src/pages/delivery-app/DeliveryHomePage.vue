<template>
  <q-page class="delivery-home-page">
    <q-pull-to-refresh @refresh="onRefresh" color="purple">

      <!-- ── Hero Header ───────────────────────────── -->
      <div class="hero-section">
        <div class="row items-center q-gutter-md">
          <q-avatar size="52px" class="hero-avatar text-weight-bold text-white">
            {{ initials(authStore.userDisplayName) }}
          </q-avatar>
          <div class="col">
            <div class="text-h6 text-white text-weight-bold" style="line-height:1.2">
              {{ authStore.userDisplayName || 'Rider' }}
            </div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip dense color="deep-purple-9" text-color="white" icon="delivery_dining" class="text-caption">
                Delivery Rider
              </q-chip>
              <q-chip
                dense
                :color="store.isConnected ? 'green-9' : 'red-9'"
                text-color="white"
                :icon="store.isConnected ? 'wifi' : 'wifi_off'"
                class="text-caption"
              >
                {{ store.isConnected ? 'Live' : 'Offline' }}
              </q-chip>
            </div>
          </div>
        </div>
        <!-- Branch indicator -->
        <div class="branch-row q-mt-sm" v-if="authStore.currentBranch">
          <q-icon name="store" size="13px" color="grey-5" class="q-mr-xs" />
          <span class="text-caption text-grey-5">{{ authStore.currentBranch.name }}</span>
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
            <q-btn unelevated class="quick-btn full-width" color="deep-purple" icon="list_alt" label="Queue" to="/delivery-app" no-caps />
          </div>
          <div class="col-4">
            <q-btn unelevated class="quick-btn full-width" color="blue-8" icon="map" label="Map" to="/delivery-app/map" no-caps />
          </div>
          <div class="col-4">
            <q-btn unelevated class="quick-btn full-width" color="grey-8" icon="history" label="History" to="/delivery-app/history" no-caps />
          </div>
        </div>
      </div>

      <!-- ── Loading ─────────────────────────────── -->
      <div v-if="store.loading && !store.assignments.length" class="loading-wrap">
        <q-spinner-orbit size="48px" color="purple-4" />
        <div class="loading-text">Loading queue…</div>
      </div>

      <!-- ── Empty state ─────────────────────────── -->
      <div v-else-if="!store.pendingAssignments.length && !store.acceptedAssignments.length" class="empty-state">
        <q-icon name="delivery_dining" size="64px" color="grey-7" />
        <div class="empty-title">No deliveries right now</div>
        <div class="empty-sub">New website orders will appear here automatically.</div>
      </div>

      <!-- ── My Active Deliveries ─────────────────── -->
      <template v-else>
        <div v-if="store.acceptedAssignments.length" ref="activeSection" class="section q-px-md q-mt-lg">
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
              <q-btn flat dense no-caps color="blue-4" icon="map" label="Map" class="card-action-btn"
                @click.stop="goToMap(a.id)" />
              <q-btn flat dense no-caps color="green-4" icon="phone" label="Call" class="card-action-btn"
                @click.stop="callCustomer(a.customer_phone)" />
              <div class="time-ago">{{ a.timeAgo }}</div>
            </div>
          </div>
        </div>

        <!-- ── Available Deliveries ─────────────────── -->
        <div v-if="store.pendingAssignments.length" ref="pendingSection" class="section q-px-md q-mt-lg">
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
            <div class="card-actions">
              <q-btn
                unelevated no-caps
                color="deep-purple"
                label="Accept Delivery"
                icon="delivery_dining"
                class="accept-btn"
                :loading="store.processing"
                @click="handleAccept(a.id)"
              />
            </div>
            <div class="card-footer">
              <span class="time-ago">{{ a.timeAgo }}</span>
              <span class="est-time" v-if="a.estimated_minutes">~{{ a.estimated_minutes }} min</span>
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

const store = useDeliveryStore()
const authStore = useAuthStore()
const router = useRouter()

const pendingSection = ref(null)
const activeSection = ref(null)

// ── KPI Calculations ─────────────────────
const cashToCollect = computed(() => {
  const total = store.acceptedAssignments.reduce((sum, a) => sum + Number(a.orderTotal || 0), 0)
  if (total === 0) return '0'
  if (total >= 1000) return `${(total / 1000).toFixed(1)}K`
  return String(Math.round(total))
})

const avgTime = computed(() => {
  const completed = store.history.filter(h => h.assigned_at && h.delivered_at)
  if (!completed.length) return '—'
  const totalMins = completed.reduce((sum, h) => {
    return sum + Math.round((new Date(h.delivered_at).getTime() - new Date(h.assigned_at).getTime()) / 60000)
  }, 0)
  const avg = Math.round(totalMins / completed.length)
  return `${avg}m`
})

const delayedCount = computed(() => {
  return store.acceptedAssignments.filter(a => {
    if (!a.assigned_at) return false
    const elapsed = (Date.now() - new Date(a.assigned_at).getTime()) / 60000
    return elapsed > (a.estimated_minutes || 45)
  }).length
})

// ── Helpers ──────────────────────────────
function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function scrollToSection(type) {
  const el = type === 'pending' ? pendingSection.value : activeSection.value
  if (el?.$el) el.$el.scrollIntoView({ behavior: 'smooth' })
  else if (el) el.scrollIntoView({ behavior: 'smooth' })
}

async function handleAccept(assignmentId) {
  try {
    await store.acceptAssignment(assignmentId)
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
  const map = { pending_rider: 'orange-8', accepted: 'blue-8', picked_up: 'cyan-8', delivered: 'green-8', cancelled: 'red-8' }
  return map[status] || 'grey-7'
}

function statusLabel(status) {
  const map = { pending_rider: 'Waiting', accepted: 'Accepted', picked_up: 'Picked Up', delivered: 'Delivered', cancelled: 'Cancelled' }
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
  padding: 20px 16px 16px;
  background: linear-gradient(135deg, rgba(124, 77, 255, 0.08), rgba(206, 147, 216, 0.05), transparent);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.hero-avatar {
  background: linear-gradient(135deg, #7c4dff, #b388ff) !important;
  font-size: 18px !important;
}
.branch-row {
  display: flex;
  align-items: center;
}

// ── KPI Cards ─────────────────────────────
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}
.kpi-card {
  width: 100%; border: none; border-radius: 12px; padding: 14px 8px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  cursor: pointer; transition: transform 0.12s, opacity 0.12s;
  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.06);
  color: #9ca3af; -webkit-tap-highlight-color: transparent;
  &:active { transform: scale(0.96); opacity: 0.8; }
  &--orange { color: #f97316; background: rgba(249, 115, 22, 0.08); border-color: rgba(249, 115, 22, 0.2); }
  &--blue   { color: #60a5fa; background: rgba(96, 165, 250, 0.08); border-color: rgba(96, 165, 250, 0.2); }
  &--green  { color: #34d399; background: rgba(52, 211, 153, 0.08); border-color: rgba(52, 211, 153, 0.2); }
  &--amber  { color: #fbbf24; background: rgba(251, 191, 36, 0.08); border-color: rgba(251, 191, 36, 0.2); }
  &--teal   { color: #2dd4bf; background: rgba(45, 212, 191, 0.08); border-color: rgba(45, 212, 191, 0.2); }
  &--red    { color: #f87171; background: rgba(248, 113, 113, 0.08); border-color: rgba(248, 113, 113, 0.2); }
  &--pulse  { animation: kpi-pulse 1.5s ease-in-out infinite; }
}
@keyframes kpi-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(248, 113, 113, 0); }
}

.kpi-icon-wrap { position: relative; display: flex; align-items: center; justify-content: center; height: 28px; }
.kpi-value { font-size: 1.6rem; font-weight: 800; line-height: 1; }
.kpi-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; opacity: 0.85; }

// ── Section ──────────────────────────────
.section-title {
  display: flex; align-items: center;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: #4b5563; margin-bottom: 10px;
}
.quick-btn {
  height: 44px; border-radius: 10px !important; font-weight: 600; font-size: 12px;
}

// ── Loading / Empty ──────────────────────
.loading-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; }
.loading-text { font-size: 13px; color: #9e9e9e; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 60px 20px; text-align: center; }
.empty-title { font-size: 16px; font-weight: 700; color: #bdbdbd; }
.empty-sub { font-size: 12px; color: #757575; max-width: 260px; }

// ── Assignment Card ──────────────────────
.assignment-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 10px;
  transition: border-color 0.2s ease;
  &--pending:hover { border-color: rgba(156, 39, 176, 0.3); }
  &--active {
    border-left: 3px solid #42a5f5;
    cursor: pointer;
    &:hover { border-color: rgba(66, 165, 245, 0.4); }
  }
}
.card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.order-badge { font-size: 16px; font-weight: 800; color: #e8eaf0; &--active { color: #64b5f6; } }
.source-badge { font-size: 10px; font-weight: 700; color: #ce93d8; background: rgba(206, 147, 216, 0.12); padding: 3px 8px; border-radius: 6px; letter-spacing: 0.4px; }
.status-chip { font-size: 10px !important; height: 20px !important; }
.card-details { display: flex; flex-direction: column; gap: 6px; }
.detail-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #bdbdbd; }
.address-text { line-height: 1.4; color: #e0e0e0; }
.total-amount { font-weight: 700; color: #a5d6a7; }
.card-actions { margin-top: 14px; }
.accept-btn { width: 100%; height: 42px; font-size: 13px; font-weight: 700; border-radius: 10px; letter-spacing: 0.3px; }
.card-actions-row {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 10px;
}
.card-action-btn { font-size: 11px !important; font-weight: 600 !important; border-radius: 8px !important; }
.card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 10px; color: #757575; }
.time-ago { font-size: 10px; color: #757575; margin-left: auto; }
.est-time { color: #9e9e9e; }
</style>

<style lang="scss">
body.body--light {
  .delivery-home-page {
    background: #f8fafc;
  }

  // Hero
  .hero-section {
    background: linear-gradient(135deg, rgba(124, 58, 237, 0.06), rgba(167, 139, 250, 0.04), transparent);
    border-bottom: 1px solid #e2e8f0;

    .text-h6, .text-white { color: #0f172a !important; }
  }

  // KPI Cards
  .kpi-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);

    &--orange { color: #ea580c; background: #fff7ed; border-color: #fed7aa; }
    &--blue   { color: #2563eb; background: #eff6ff; border-color: #bfdbfe; }
    &--green  { color: #16a34a; background: #f0fdf4; border-color: #bbf7d0; }
    &--amber  { color: #d97706; background: #fffbeb; border-color: #fde68a; }
    &--teal   { color: #0d9488; background: #f0fdfa; border-color: #99f6e4; }
    &--red    { color: #dc2626; background: #fef2f2; border-color: #fecaca; }
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

    &--pending:hover { border-color: #c4b5fd; }
    &--active {
      border-left: 3px solid #3b82f6;
      &:hover { border-color: #93c5fd; }
    }
  }

  .order-badge { color: #0f172a; &--active { color: #2563eb; } }
  .source-badge { color: #7c3aed; background: rgba(124, 58, 237, 0.08); }
  .detail-row { color: #475569; }
  .address-text { color: #334155; }
  .total-amount { color: #16a34a; }
  .card-actions-row { border-top: 1px solid #e2e8f0; }
  .card-footer { color: #94a3b8; }
  .time-ago { color: #94a3b8; }

  // Empty / Loading
  .empty-title { color: #64748b; }
  .empty-sub { color: #94a3b8; }
  .loading-text { color: #64748b; }
}

