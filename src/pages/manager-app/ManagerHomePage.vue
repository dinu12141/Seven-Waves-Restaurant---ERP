<template>
  <q-page class="mgr-home-page" padding>
    <!-- Header -->
    <div class="row items-center q-mb-lg">
      <div>
        <div class="text-h6 text-white text-weight-bold">Dashboard</div>
        <div class="text-caption text-grey-5">
          {{ authStore.currentBranch?.name || '—' }} · {{ today }}
        </div>
      </div>
      <q-space />
      <q-btn flat round icon="refresh" color="grey-5" :loading="store.loading" @click="store.refresh()" />
    </div>

    <!-- KPI Cards -->
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6">
        <div class="kpi-card kpi--cyan">
          <div class="kpi-val">{{ store.onShiftWaiters.length }}</div>
          <div class="kpi-lbl">On-Shift Waiters</div>
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--orange">
          <div class="kpi-val">{{ store.pendingOrderCount }}</div>
          <div class="kpi-lbl">Pending Orders</div>
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--green">
          <div class="kpi-val">{{ store.totalActiveOrders }}</div>
          <div class="kpi-lbl">Active Orders</div>
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--purple">
          <div class="kpi-val">{{ store.servedTodayCount }}</div>
          <div class="kpi-lbl">Served Today</div>
        </div>
      </div>
    </div>

    <!-- Delayed Orders Alert -->
    <div v-if="store.delayedOrders.length > 0" class="alert-banner q-mb-lg">
      <q-icon name="warning" size="18px" class="q-mr-sm" />
      <span class="text-weight-bold">{{ store.delayedOrders.length }} delayed order(s)</span>
      <q-space />
      <q-btn flat dense no-caps color="amber" label="View" to="/manager-app/orders" />
    </div>

    <!-- Unread Messages -->
    <div v-if="store.unreadMessageCount > 0" class="alert-banner alert-banner--info q-mb-lg">
      <q-icon name="mail" size="18px" class="q-mr-sm" />
      <span class="text-weight-bold">{{ store.unreadMessageCount }} unread message(s)</span>
      <q-space />
      <q-btn flat dense no-caps color="cyan" label="Open" to="/manager-app/messages" />
    </div>

    <!-- Quick Actions -->
    <div class="section-title q-mb-sm">QUICK ACTIONS</div>
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6" v-for="action in quickActions" :key="action.to">
        <q-btn
          class="quick-action-btn full-width"
          unelevated no-caps
          :icon="action.icon"
          :label="action.label"
          :to="action.to"
        />
      </div>
    </div>

    <!-- Waiter Rankings (with period filter) -->
    <WaiterLeaderboard />
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useAuthStore } from 'stores/auth'
import WaiterLeaderboard from 'src/components/waiter/WaiterLeaderboard.vue'

const store = useManagerAppStore()
const authStore = useAuthStore()

const today = computed(() =>
  new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })
)

const quickActions = [
  { label: 'Floor Overview', icon: 'supervisor_account', to: '/manager-app/floor' },
  { label: 'Monitor Orders', icon: 'receipt_long', to: '/manager-app/orders' },
  { label: 'View Waiters', icon: 'groups', to: '/manager-app/waiters' },
  { label: 'Alerts', icon: 'notifications_active', to: '/manager-app/alerts' },
]
</script>

<style lang="scss" scoped>
@import '../waiter-app/waiter-shared.scss';

.mgr-home-page { background: #090c14; min-height: 100vh; }
.section-title { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4b5563; }

.kpi-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 16px; text-align: center;
}
.kpi-val { font-size: 1.7rem; font-weight: 800; line-height: 1; }
.kpi-lbl { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-top: 4px; }
.kpi--cyan .kpi-val { color: #22d3ee; } .kpi--cyan { border-color: rgba(34,211,238,0.2); background: rgba(34,211,238,0.06); }
.kpi--orange .kpi-val { color: #f97316; } .kpi--orange { border-color: rgba(249,115,22,0.2); background: rgba(249,115,22,0.06); }
.kpi--green .kpi-val { color: #4ade80; } .kpi--green { border-color: rgba(34,197,94,0.2); background: rgba(34,197,94,0.06); }
.kpi--purple .kpi-val { color: #a78bfa; } .kpi--purple { border-color: rgba(167,139,250,0.2); background: rgba(167,139,250,0.06); }

.alert-banner {
  background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25);
  border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; color: #fbbf24;
  &--info {
    background: rgba(34,211,238,0.06); border-color: rgba(34,211,238,0.2); color: #22d3ee;
  }
}

.quick-action-btn {
  background: rgba(255,255,255,0.04) !important;
  border: 1px solid rgba(255,255,255,0.07) !important;
  border-radius: 12px !important;
  color: #d1d5db !important;
  font-weight: 600 !important;
  font-size: 0.8rem !important;
  height: 52px !important;
  :deep(.q-icon) { color: #22d3ee; margin-right: 8px; }
  &:hover { background: rgba(34,211,238,0.06) !important; }
}

.performer-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; padding: 12px 14px;
}
.rank-medal { font-size: 1.1rem; min-width: 28px; text-align: center; }
.performer-avatar { background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important; font-size: 13px !important; }
</style>
