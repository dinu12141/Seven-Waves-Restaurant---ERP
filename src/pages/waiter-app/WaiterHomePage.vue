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
                :icon="effectiveOnShift ? 'schedule' : 'schedule'"
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
}

// ── Hero ──────────────────────────────────
.hero-section {
  padding: 20px 16px 16px;
  background: linear-gradient(
    135deg,
    rgba(234, 88, 12, 0.06),
    rgba(251, 191, 36, 0.04),
    transparent
  );
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
}
.hero-avatar {
  background: linear-gradient(135deg, #e65100, #ff9800) !important;
  font-size: 18px !important;
}
.hero-name {
  font-size: 18px;
  font-weight: 800;
  color: var(--erp-text-primary, #1e293b);
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
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  color: #64748b;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  &:active {
    transform: scale(0.96);
    opacity: 0.8;
  }
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
  &--amber {
    color: #d97706;
    background: #fffbeb;
    border-color: #fde68a;
  }
  &--green {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
  }
  &--teal {
    color: #0d9488;
    background: #f0fdfa;
    border-color: #99f6e4;
  }
  &--purple {
    color: #7c3aed;
    background: #f5f3ff;
    border-color: #c4b5fd;
  }
  &--pos {
    color: #059669;
    background: #ecfdf5;
    border-color: #a7f3d0;
  }
  &--pulse {
    animation: kpi-pulse 1.5s ease-in-out infinite;
  }
}
@keyframes kpi-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(217, 119, 6, 0.2);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(217, 119, 6, 0);
  }
}
.kpi-icon-wrap {
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
  color: var(--erp-text-secondary, #475569);
  margin-bottom: 10px;
}

// ── Quick Buttons ────────────────────────
.quick-btn {
  height: 44px;
  border-radius: 10px !important;
  font-weight: 600;
  font-size: 12px;
  position: relative;
}

// ── Ready Alerts ─────────────────────────
.ready-alert-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  animation: alert-glow 2s ease-in-out infinite;
  -webkit-tap-highlight-color: transparent;
}
.ready-alert__icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(217, 119, 6, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ready-alert__info {
  flex: 1;
  min-width: 0;
}
.ready-alert__title {
  font-size: 13px;
  font-weight: 700;
  color: #b45309;
}
.ready-alert__sub {
  font-size: 11px;
  color: #78716c;
  margin-top: 1px;
}
.serve-mini-btn {
  font-size: 11px !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
}

@keyframes alert-glow {
  0%,
  100% {
    border-color: #fde68a;
  }
  50% {
    border-color: #f59e0b;
  }
}

// ── Order Cards ──────────────────────────
.order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  &:hover {
    border-color: #cbd5e1;
  }
}
.order-card__left {
  min-width: 0;
}
.order-number {
  font-size: 15px;
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
  font-size: 10px;
  color: #7c3aed;
  font-weight: 600;
}
.time-tag {
  font-size: 10px;
  color: #94a3b8;
}
.order-status-chip {
  font-size: 10px !important;
  height: 20px !important;
}

// ── Loading ──────────────────────────────
.loading-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 0;
}
.loading-text {
  font-size: 13px;
  color: #94a3b8;
}

// ── Points Summary Card ─────────────────
.points-summary-card {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
  border: 1px solid #fde68a;
  border-radius: 14px;
  padding: 16px 20px;
  gap: 16px;
}
.points-summary-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}
.points-summary-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}
.points-summary-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: #92400e;
  line-height: 1;
}
.points-summary-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: #b45309;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}
.points-summary-divider {
  width: 1px;
  height: 40px;
  background: #fcd34d;
  flex-shrink: 0;
}
.points-summary-right {
  text-align: center;
  min-width: 80px;
}

// ── Off-Shift Lock Screen ───────────────
.off-shift-lock {
  padding-top: 24px;
}
.off-shift-card {
  text-align: center;
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 16px;
  padding: 40px 24px 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.off-shift-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}
.off-shift-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #1e293b;
  margin-bottom: 8px;
}
.off-shift-desc {
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.5;
  max-width: 320px;
  margin: 0 auto 20px;
}
.off-shift-next {
  display: inline-flex;
  align-items: center;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 0.82rem;
  color: #475569;
}
</style>
