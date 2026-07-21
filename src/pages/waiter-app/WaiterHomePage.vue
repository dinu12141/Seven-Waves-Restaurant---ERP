<template>
  <q-page class="waiter-home">
    <q-pull-to-refresh @refresh="onRefresh" color="orange">
      <!-- ── Hero Header ───────────────────────────── -->
      <div class="hero-section">
        <div class="row items-center q-gutter-md">
          <q-avatar size="52px" class="hero-avatar text-weight-bold text-white">
            {{ initials(displayName) }}
          </q-avatar>
          <div class="col">
            <div class="hero-name">{{ displayName }}</div>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-chip
                dense
                color="orange-9"
                text-color="white"
                icon="restaurant"
                class="text-caption"
              >
                Waiter
              </q-chip>
              <q-chip
                dense
                :color="effectiveOnShift ? 'green-9' : 'grey-8'"
                text-color="white"
                :icon="effectiveOnShift ? 'schedule' : 'event_busy'"
                class="text-caption"
              >
                {{ effectiveOnShift ? shiftName : 'Off Shift' }}
              </q-chip>
            </div>
          </div>
        </div>

        <!-- Shift Info Row -->
        <div class="shift-info-row q-mt-sm">
          <div class="shift-detail" v-if="store.shiftInfo">
            <q-icon name="access_time" size="13px" color="grey-5" class="q-mr-xs" />
            <span class="text-caption text-grey-5">
              {{ formatShiftTime(store.shiftInfo.shift_start) }} —
              {{ formatShiftTime(store.shiftInfo.shift_end) }}
            </span>
          </div>
          <div class="shift-detail" v-if="authStore.currentBranch">
            <q-icon name="store" size="13px" color="grey-5" class="q-mr-xs" />
            <span class="text-caption text-grey-5">{{ authStore.currentBranch.name }}</span>
          </div>
        </div>
      </div>

      <!-- ── KPI Cards ─────────────────────────────── -->
      <div class="q-px-md">
        <div class="kpi-row">
          <button class="kpi-card kpi-card--orange" @click="$router.push('/waiter-app/inbox')">
            <div class="kpi-icon-wrap"><q-icon name="notifications_active" size="24px" /></div>
            <div class="kpi-value">{{ store.pendingCount }}</div>
            <div class="kpi-label">Pending</div>
          </button>
          <button class="kpi-card kpi-card--blue" @click="$router.push('/waiter-app/orders')">
            <div class="kpi-icon-wrap"><q-icon name="receipt_long" size="24px" /></div>
            <div class="kpi-value">{{ store.myOrderCount }}</div>
            <div class="kpi-label">My Orders</div>
          </button>
          <button
            class="kpi-card kpi-card--amber"
            :class="{ 'kpi-card--pulse': store.readyCount > 0 }"
            @click="$router.push('/waiter-app/alerts')"
          >
            <div class="kpi-icon-wrap"><q-icon name="local_fire_department" size="24px" /></div>
            <div class="kpi-value">{{ store.readyCount }}</div>
            <div class="kpi-label">Ready</div>
          </button>
        </div>

        <div class="kpi-row q-mt-sm">
          <button class="kpi-card kpi-card--green" @click="$router.push('/waiter-app/tables')">
            <div class="kpi-icon-wrap"><q-icon name="table_restaurant" size="24px" /></div>
            <div class="kpi-value">{{ activeTables }}</div>
            <div class="kpi-label">Tables</div>
          </button>
          <button class="kpi-card kpi-card--teal">
            <div class="kpi-icon-wrap"><q-icon name="check_circle" size="24px" /></div>
            <div class="kpi-value">{{ store.totalOrdersServed }}</div>
            <div class="kpi-label">Served</div>
          </button>
          <button class="kpi-card kpi-card--pos" @click="$router.push('/waiter-app/pos')">
            <div class="kpi-icon-wrap"><q-icon name="point_of_sale" size="24px" /></div>
            <div class="kpi-value"><q-icon name="add" size="20px" /></div>
            <div class="kpi-label">POS</div>
          </button>
        </div>
      </div>

      <!-- ── Points Summary Card ──────────────────── -->
      <div class="q-px-md q-mt-md" v-if="effectiveOnShift">
        <div class="points-summary-card">
          <div class="points-summary-left">
            <div class="points-summary-icon"><q-icon name="star" size="24px" color="amber" /></div>
            <div>
              <div class="points-summary-value">{{ store.currentPoints }}</div>
              <div class="points-summary-label">Total Points</div>
            </div>
          </div>
          <div class="points-summary-divider"></div>
          <div class="points-summary-right">
            <div class="points-summary-value">{{ store.totalOrdersServed }}</div>
            <div class="points-summary-label">Orders Served</div>
          </div>
        </div>
      </div>

      <!-- ── Quick Actions ─────────────────────────── -->
      <div class="q-px-md q-mt-md" v-if="store.isOnShift">
        <div class="section-title">Quick Actions</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="green-8"
              icon="point_of_sale"
              label="Manual Bill"
              to="/waiter-app/pos"
              no-caps
            />
          </div>
          <div class="col-6">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="orange-9"
              icon="table_restaurant"
              label="Tables"
              to="/waiter-app/tables"
              no-caps
            />
          </div>
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="blue-8"
              icon="notifications"
              label="Inbox"
              to="/waiter-app/inbox"
              no-caps
            >
              <q-badge v-if="store.pendingCount > 0" color="red" floating>{{
                store.pendingCount
              }}</q-badge>
            </q-btn>
          </div>
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="deep-purple-8"
              icon="history"
              label="Orders"
              to="/waiter-app/orders"
              no-caps
            />
          </div>
          <div class="col-4">
            <q-btn
              unelevated
              class="quick-btn full-width"
              color="teal-8"
              icon="star"
              label="Points"
              no-caps
            />
          </div>
        </div>
      </div>

      <!-- ── Kitchen Alerts ────────────────────────── -->
      <div v-if="effectiveOnShift && store.readyAlerts.length" class="q-px-md q-mt-lg">
        <div class="section-title">
          <q-icon name="local_fire_department" size="18px" color="amber-5" class="q-mr-xs" />
          Kitchen Ready ({{ store.readyCount }})
        </div>
        <div
          v-for="alert in store.readyAlerts.slice(0, 3)"
          :key="alert.id"
          class="ready-alert-card"
          @click="$router.push('/waiter-app/alerts')"
        >
          <div class="ready-alert__icon-wrap">
            <q-icon name="local_fire_department" size="20px" color="amber" />
          </div>
          <div class="ready-alert__info">
            <div class="ready-alert__title">KOT Ready</div>
            <div class="ready-alert__sub">
              {{ alert.kitchens?.name || 'Kitchen' }}
              <span v-if="alert.batch_number"> · Batch #{{ alert.batch_number }}</span>
            </div>
          </div>
          <q-btn
            flat
            dense
            no-caps
            color="green-4"
            label="Serve"
            icon="room_service"
            class="serve-mini-btn"
            @click.stop="handleServe(alert)"
          />
        </div>
      </div>

      <!-- ── Leaderboard ──────────────────────────── -->
      <div class="q-px-md q-mt-lg" v-if="store.isOnShift">
        <WaiterLeaderboard :highlight-profile-id="store.profile?.id" ref="leaderboardRef" />
      </div>

      <!-- ── Recent Orders ─────────────────────────── -->
      <div v-if="store.isOnShift && store.myOrders.length" class="q-px-md q-mt-lg">
        <div class="section-title">
          <q-icon name="receipt_long" size="18px" color="blue-4" class="q-mr-xs" />
          Recent Orders
        </div>
        <div
          v-for="order in store.myOrders.slice(0, 5)"
          :key="order.id"
          class="order-card"
          @click="$router.push('/waiter-app/orders')"
        >
          <div class="order-card__left">
            <div class="order-number">#{{ order.order_number }}</div>
            <div class="order-meta">
              <span v-if="order.table_number" class="table-tag">
                <q-icon name="table_restaurant" size="10px" /> {{ order.table_number }}
              </span>
              <span class="time-tag">{{ formatTimeAgo(order.created_at) }}</span>
            </div>
          </div>
          <q-chip
            dense
            :color="orderStatusColor(order.status)"
            text-color="white"
            class="order-status-chip"
          >
            {{ orderStatusLabel(order.status) }}
          </q-chip>
        </div>
      </div>

      <!-- ── OFF-SHIFT LOCKED SCREEN ─────────────── -->
      <div v-if="!effectiveOnShift && !store.loading" class="off-shift-lock q-px-md">
        <div class="off-shift-card">
          <div class="off-shift-icon-wrap">
            <q-icon name="lock" size="48px" color="grey-5" />
          </div>
          <div class="off-shift-title">You're Off Shift</div>
          <div class="off-shift-desc">
            You cannot accept orders, use the POS, or access tables while off shift. Contact your
            manager if you believe this is an error.
          </div>
          <div v-if="store.shiftInfo" class="off-shift-next">
            <q-icon name="schedule" size="16px" class="q-mr-xs" />
            Your shift: <strong>{{ store.shiftInfo.shift_name }}</strong> ({{
              formatShiftTime(store.shiftInfo.shift_start)
            }}
            — {{ formatShiftTime(store.shiftInfo.shift_end) }})
          </div>
          <div v-else class="off-shift-next">
            <q-icon name="event_busy" size="16px" class="q-mr-xs" />
            No shift assigned for today.
          </div>
        </div>

        <!-- Still show leaderboard even when off shift -->
        <div class="q-mt-lg">
          <WaiterLeaderboard :highlight-profile-id="store.profile?.id" />
        </div>
      </div>

      <!-- ── Loading State ─────────────────────────── -->
      <div v-if="store.loading" class="loading-wrap">
        <q-spinner-orbit size="48px" color="orange" />
        <div class="loading-text">Loading dashboard…</div>
      </div>

      <div style="height: 24px" />
    </q-pull-to-refresh>
  </q-page>
</template>

<script setup>
import { computed, ref, inject } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useAuthStore } from 'stores/auth'
import WaiterLeaderboard from 'src/components/waiter/WaiterLeaderboard.vue'

const store = useWaiterAppStore()
const authStore = useAuthStore()
const leaderboardRef = ref(null)

// Injected from WaiterAppLayout — includes admin/manager bypass
const isEffectivelyOnShift = inject('isEffectivelyOnShift', computed(() => store.isOnShift))
const effectiveOnShift = computed(() => isEffectivelyOnShift.value)

const displayName = computed(
  () => store.profile?.display_name || authStore.userDisplayName || 'Waiter',
)

const shiftName = computed(() => store.shiftInfo?.shift_name || 'Shift')

const activeTables = computed(() => {
  // Count orders with table association in "active" statuses
  const tableIds = new Set()
  store.myOrders.forEach((o) => {
    if (o.table_id) tableIds.add(o.table_id)
  })
  return tableIds.size
})

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function formatShiftTime(timeStr) {
  if (!timeStr) return '—'
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

function orderStatusColor(status) {
  const map = {
    pending_waiter: 'orange-8',
    accepted: 'blue-8',
    sent_to_kitchen: 'indigo-8',
    preparing: 'deep-purple-8',
    ready: 'amber-8',
    served: 'green-8',
  }
  return map[status] || 'grey-7'
}

function orderStatusLabel(status) {
  const map = {
    pending_waiter: 'Pending',
    accepted: 'Accepted',
    sent_to_kitchen: 'Kitchen',
    preparing: 'Cooking',
    ready: 'Ready',
    served: 'Served',
  }
  return map[status] || status
}

async function handleServe(alert) {
  try {
    await store.markServed(alert.order_id)
  } catch {
    // Error handled in store
  }
}

async function onRefresh(done) {
  await store.refresh()
  if (leaderboardRef.value?.refresh) leaderboardRef.value.refresh()
  done()
}
</script>

<style lang="scss" scoped>
.waiter-home {
  min-height: 100vh;
  background: var(--erp-bg-primary, #f8fafc);
}

// ── Hero ──────────────────────────────────
.hero-section {
  padding: 24px 16px 20px;
  background: linear-gradient(135deg, #312e81 0%, #4c1d95 40%, #1e1b4b 100%);
  border-bottom: none;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50px;
    right: -40px;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }
  &::after {
    content: '';
    position: absolute;
    bottom: -30px;
    left: 20px;
    width: 110px;
    height: 110px;
    border-radius: 50%;
    background: rgba(249, 115, 22, 0.1);
    pointer-events: none;
  }
}

.hero-avatar {
  background: linear-gradient(135deg, #f97316, #ef4444, #ec4899) !important;
  font-size: 20px !important;
  font-weight: 900 !important;
  box-shadow:
    0 0 0 3px rgba(249, 115, 22, 0.45),
    0 6px 20px rgba(0, 0, 0, 0.35) !important;
}

.hero-name {
  font-size: 24px;
  font-weight: 800;
  color: #ffffff;
  line-height: 1.2;
}

.shift-info-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.shift-detail {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.65);

  :deep(.q-icon) {
    color: rgba(255, 255, 255, 0.55) !important;
  }

  span {
    color: rgba(255, 255, 255, 0.65);
  }
}

// ── KPI Cards ─────────────────────────────
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 14px;
}

.kpi-card {
  width: 100%;
  border: none;
  border-radius: 16px;
  padding: 16px 8px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
  color: #fff;
  -webkit-tap-highlight-color: transparent;

  &:active {
    transform: scale(0.93);
  }

  &--orange {
    background: linear-gradient(135deg, #ff6b35, #f97316);
    box-shadow: 0 4px 20px rgba(249, 115, 22, 0.38);
  }
  &--blue {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    box-shadow: 0 4px 20px rgba(37, 99, 235, 0.38);
  }
  &--amber {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    box-shadow: 0 4px 20px rgba(217, 119, 6, 0.38);
  }
  &--green {
    background: linear-gradient(135deg, #10b981, #059669);
    box-shadow: 0 4px 20px rgba(5, 150, 105, 0.38);
  }
  &--teal {
    background: linear-gradient(135deg, #0d9488, #0f766e);
    box-shadow: 0 4px 20px rgba(13, 148, 136, 0.38);
  }
  &--purple {
    background: linear-gradient(135deg, #a78bfa, #7c3aed);
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.38);
  }
  &--pos {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.38);
  }

  &--pulse {
    animation: kpi-pulse 1.5s ease-in-out infinite;
  }
}

@keyframes kpi-pulse {
  0%,
  100% {
    box-shadow:
      0 4px 20px rgba(217, 119, 6, 0.38),
      0 0 0 0 rgba(245, 158, 11, 0.45);
  }
  50% {
    box-shadow:
      0 4px 20px rgba(217, 119, 6, 0.38),
      0 0 0 10px rgba(245, 158, 11, 0);
  }
}

.kpi-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  margin-bottom: 2px;
}

.kpi-value {
  font-size: 2.4rem;
  font-weight: 900;
  color: #fff;
  line-height: 1;
}

.kpi-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.85);
}

// ── Section Title ─────────────────────────
.section-title {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: #f97316;
  margin-bottom: 10px;
}

// ── Quick Buttons ────────────────────────
.quick-btn {
  height: 52px !important;
  border-radius: 14px !important;
  font-weight: 700 !important;
  font-size: 14px !important;
  position: relative;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15) !important;
}

// ── Points Summary Card ─────────────────
.points-summary-card {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #fbbf24, #f59e0b, #d97706);
  border: none;
  border-radius: 18px;
  padding: 18px 20px;
  gap: 16px;
  box-shadow: 0 4px 22px rgba(245, 158, 11, 0.38);
}

.points-summary-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.points-summary-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
}

.points-summary-value {
  font-size: 2rem;
  font-weight: 900;
  color: #fff;
  line-height: 1;
}

.points-summary-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
}

.points-summary-divider {
  width: 1px;
  height: 44px;
  background: rgba(255, 255, 255, 0.38);
  flex-shrink: 0;
}

.points-summary-right {
  text-align: center;
  min-width: 80px;
}

// ── Ready Alerts ─────────────────────────
.ready-alert-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 191, 36, 0.05));
  border: 1.5px solid #f59e0b;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
  cursor: pointer;
  animation: alert-glow 2s ease-in-out infinite;
  -webkit-tap-highlight-color: transparent;
}

.ready-alert__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ready-alert__info {
  flex: 1;
  min-width: 0;
}

.ready-alert__title {
  font-size: 16px;
  font-weight: 800;
  color: #b45309;
}

.ready-alert__sub {
  font-size: 13px;
  color: #78716c;
  margin-top: 2px;
}

.serve-mini-btn {
  font-size: 13px !important;
  font-weight: 700 !important;
  border-radius: 20px !important;
  border: 1.5px solid #10b981 !important;

  :deep(.q-btn__content) {
    color: #10b981 !important;
  }
}

@keyframes alert-glow {
  0%,
  100% {
    border-color: #f59e0b;
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
  50% {
    border-color: #fbbf24;
    box-shadow: 0 0 14px rgba(245, 158, 11, 0.22);
  }
}

// ── Order Cards ──────────────────────────
.order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-left: 4px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.12s;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);

  &:active {
    transform: scale(0.98);
  }
}

.order-card__left {
  min-width: 0;
}

.order-number {
  font-size: 18px;
  font-weight: 800;
  color: var(--erp-text-primary, #1e293b);
}

.order-meta {
  display: flex;
  gap: 8px;
  margin-top: 3px;
}

.table-tag {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: #7c3aed;
  font-weight: 600;
}

.time-tag {
  font-size: 13px;
  color: #94a3b8;
}

.order-status-chip {
  font-size: 12px !important;
  height: 22px !important;
}

// ── Loading ──────────────────────────────
.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 0;
}

.loading-text {
  font-size: 14px;
  font-weight: 600;
  color: #f97316;
}

// ── Off-Shift Lock Screen ───────────────
.off-shift-lock {
  padding-top: 32px;
}

.off-shift-card {
  text-align: center;
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 20px;
  padding: 48px 24px 36px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.off-shift-icon-wrap {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ef4444, #f97316);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  box-shadow: 0 8px 28px rgba(239, 68, 68, 0.38);

  :deep(.q-icon) {
    color: #fff !important;
  }
}

.off-shift-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 10px;
}

.off-shift-desc {
  font-size: 1rem;
  color: #64748b;
  line-height: 1.6;
  max-width: 300px;
  margin: 0 auto 24px;
}

.off-shift-next {
  display: inline-flex;
  align-items: center;
  background: linear-gradient(135deg, #f1f5f9, #e8edf5);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 18px;
  font-size: 0.88rem;
  color: #475569;
  font-weight: 600;
}
</style>

<style lang="scss">
/* Unscoped overrides for WaiterHomePage — quick-btn gradients + dark mode */

// Quick action button gradient overrides
.waiter-home .q-btn.quick-btn {
  &.bg-green-8 {
    background: linear-gradient(135deg, #10b981, #059669) !important;
    box-shadow: 0 3px 14px rgba(5, 150, 105, 0.38) !important;
  }
  &.bg-orange-9 {
    background: linear-gradient(135deg, #f97316, #ea580c) !important;
    box-shadow: 0 3px 14px rgba(249, 115, 22, 0.38) !important;
  }
  &.bg-blue-8 {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
    box-shadow: 0 3px 14px rgba(37, 99, 235, 0.38) !important;
  }
  &.bg-deep-purple-8 {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed) !important;
    box-shadow: 0 3px 14px rgba(124, 58, 237, 0.38) !important;
  }
  &.bg-teal-8 {
    background: linear-gradient(135deg, #fbbf24, #f59e0b) !important;
    box-shadow: 0 3px 14px rgba(245, 158, 11, 0.38) !important;
  }
}

// Shift info icon overrides (hero is now dark gradient)
.waiter-home .shift-info-row .text-grey-5 {
  color: rgba(255, 255, 255, 0.62) !important;
}

body.body--dark {
  // ── Hero — richer dark purple ──
  .waiter-home .hero-section {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e1650 100%);
  }

  // ── KPI Cards — same gradients, slightly deeper ──
  .waiter-home .kpi-card--orange {
    background: linear-gradient(135deg, #c2511a, #d97706);
    box-shadow: 0 4px 18px rgba(194, 81, 26, 0.32);
  }
  .waiter-home .kpi-card--blue {
    background: linear-gradient(135deg, #2563eb, #1e40af);
    box-shadow: 0 4px 18px rgba(37, 99, 235, 0.32);
  }
  .waiter-home .kpi-card--amber {
    background: linear-gradient(135deg, #d97706, #b45309);
    box-shadow: 0 4px 18px rgba(180, 83, 9, 0.32);
  }
  .waiter-home .kpi-card--green {
    background: linear-gradient(135deg, #059669, #047857);
    box-shadow: 0 4px 18px rgba(5, 150, 105, 0.32);
  }
  .waiter-home .kpi-card--teal {
    background: linear-gradient(135deg, #0f766e, #115e59);
    box-shadow: 0 4px 18px rgba(15, 118, 110, 0.32);
  }
  .waiter-home .kpi-card--pos {
    background: linear-gradient(135deg, #7c3aed, #6d28d9);
    box-shadow: 0 4px 18px rgba(124, 58, 237, 0.32);
  }

  // ── Points summary — darker gold ──
  .waiter-home .points-summary-card {
    background: linear-gradient(135deg, #d97706, #b45309, #92400e);
    box-shadow: 0 4px 20px rgba(180, 83, 9, 0.38);
  }

  // ── Ready alerts ──
  .waiter-home .ready-alert-card {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(251, 191, 36, 0.04));
    border-color: rgba(245, 158, 11, 0.5);
  }
  .waiter-home .ready-alert__icon-wrap {
    background: rgba(245, 158, 11, 0.18);
  }
  .waiter-home .ready-alert__title {
    color: #fbbf24;
  }
  .waiter-home .ready-alert__sub {
    color: #a8a29e;
  }

  // ── Order cards ──
  .waiter-home .order-card {
    background: #1e293b;
    border-color: rgba(255, 255, 255, 0.07);
    border-left-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);

    &:hover {
      border-color: rgba(255, 255, 255, 0.14);
    }
  }
  .waiter-home .order-number {
    color: #e2e8f0;
  }
  .waiter-home .table-tag {
    color: #a78bfa;
  }
  .waiter-home .time-tag {
    color: #64748b;
  }

  // ── Off-shift card ──
  .waiter-home .off-shift-card {
    background: #1e293b;
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  }
  .waiter-home .off-shift-title {
    color: #e2e8f0;
  }
  .waiter-home .off-shift-desc {
    color: #94a3b8;
  }
  .waiter-home .off-shift-next {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    color: #94a3b8;
  }
}
</style>
