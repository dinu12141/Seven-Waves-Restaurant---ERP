<template>
  <q-page class="mgr-floor-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Page Header -->
    <div class="page-header q-mb-lg">
      <div class="page-header__left">
        <div class="page-header__icon-wrap">
          <q-icon name="supervisor_account" size="20px" />
        </div>
        <div>
          <div class="page-header__title">Floor Overview</div>
          <div class="page-header__sub">Real-time waiter &amp; order monitoring</div>
        </div>
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        size="sm"
        class="page-header__refresh"
        :loading="store.loading"
        @click="store.refresh()"
      />
    </div>

    <!-- KPI Row -->
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-4">
        <div class="mini-kpi">
          <span class="mini-val mini-val--cyan">{{ store.onShiftWaiters.length }}</span>
          <span class="mini-lbl">Waiters</span>
        </div>
      </div>
      <div class="col-4">
        <div class="mini-kpi">
          <span class="mini-val mini-val--orange">{{ store.pendingOrderCount }}</span>
          <span class="mini-lbl">Pending</span>
        </div>
      </div>
      <div class="col-4">
        <div class="mini-kpi">
          <span class="mini-val mini-val--green">{{ store.servedTodayCount }}</span>
          <span class="mini-lbl">Served</span>
        </div>
      </div>
    </div>

    <!-- Unaccepted Orders Alert -->
    <div v-if="store.pendingOrders.length > 0" class="alert-banner q-mb-lg">
      <q-icon name="warning_amber" size="18px" class="q-mr-sm" />
      <span class="text-weight-bold">{{ store.pendingOrders.length }} unaccepted order(s)</span>
      <q-space />
      <q-btn flat dense no-caps label="View" class="alert-action" to="/manager-app/orders" />
    </div>

    <!-- Waiter Cards -->
    <div class="section-title q-mb-sm">ON-SHIFT WAITERS</div>
    <div v-if="store.loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="32px" color="cyan" />
    </div>
    <div v-else-if="store.onShiftWaiters.length === 0" class="empty-state q-pa-lg">
      <q-icon name="people" size="40px" class="empty-state__icon" />
      <div class="empty-state__text">No waiters on shift right now</div>
    </div>
    <div v-else>
      <div
        v-for="w in store.onShiftWaiters"
        :key="w.id"
        class="waiter-card q-mb-md"
        @click="$router.push(`/manager-app/waiters/${w.id}`)"
      >
        <div class="row items-center q-pa-md">
          <q-avatar size="42px" class="waiter-avatar q-mr-md text-weight-bold text-white">
            {{ initials(w.display_name || w.employee_name) }}
          </q-avatar>
          <div class="col">
            <div class="waiter-name">{{ w.display_name || w.employee_name }}</div>
            <div class="waiter-code">{{ w.waiter_code }}</div>
          </div>
          <q-icon name="chevron_right" class="waiter-card__arrow" />
        </div>

        <div class="waiter-card__stats row q-px-md q-pb-md q-gutter-sm">
          <div class="stat-pill">
            <q-icon name="assignment_ind" size="12px" class="q-mr-xs" />
            {{ w.active_orders }} active
          </div>
          <div class="stat-pill">
            <q-icon name="check_circle" size="12px" class="q-mr-xs" />
            {{ w.served_count }} served
          </div>
          <div class="stat-pill stat-pill--gold">
            <q-icon name="stars" size="12px" class="q-mr-xs" />
            {{ w.current_points }} pts
          </div>
          <div v-if="w.unread_alerts > 0" class="stat-pill stat-pill--alert">
            <q-icon name="notifications" size="12px" class="q-mr-xs" />
            {{ w.unread_alerts }} unread
          </div>
        </div>
      </div>
    </div>

    <!-- Hierarchy Map -->
    <div class="section-title q-mt-lg q-mb-sm">HIERARCHY MAP</div>
    <div v-if="store.hierarchyMap.length === 0" class="empty-state q-pa-md">
      <div class="empty-state__text">No hierarchy assignments</div>
    </div>
    <div v-else>
      <div
        v-for="h in store.hierarchyMap"
        :key="h.id"
        class="hierarchy-row q-mb-sm row items-center"
      >
        <q-icon name="person" size="14px" class="hierarchy-icon--person q-mr-sm" />
        <span class="hierarchy-name">{{ h.employee_name }}</span>
        <q-icon name="arrow_right" size="14px" class="hierarchy-arrow q-mx-xs" />
        <q-icon name="supervisor_account" size="14px" class="hierarchy-icon--manager q-mr-xs" />
        <span class="hierarchy-manager">{{ h.manager_name }}</span>
        <q-badge :color="htColor(h.hierarchy_type)" class="q-ml-sm text-caption">
          {{ htLabel(h.hierarchy_type) }}
        </q-badge>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useQuasar } from 'quasar'

const store = useManagerAppStore()
const $q = useQuasar()

function initials(name) {
  return name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')
    : '?'
}
function htLabel(t) {
  return (
    { waiter_manager: 'W.Mgr', floor_manager: 'F.Mgr', shift_lead: 'Lead', general: 'GM' }[t] || t
  )
}
function htColor(t) {
  return (
    {
      waiter_manager: 'purple-8',
      floor_manager: 'blue-8',
      shift_lead: 'teal-8',
      general: 'orange-8',
    }[t] || 'grey-8'
  )
}
</script>

<style lang="scss" scoped>
// ─── Page Root ───────────────────────────────────────────────────────────────
.mgr-floor-page {
  // min-height and padding handled by mobile-app-shell
  background: #090c14;
  transition: background 0.25s ease;

  &.lt {
    background: #f1f5f9;
  }
}

// ─── Page Header ─────────────────────────────────────────────────────────────
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.page-header__icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
  transition: background 0.25s ease, color 0.25s ease;
}
.lt .page-header__icon-wrap {
  background: rgba(8, 145, 178, 0.08);
  color: #0891b2;
}
.page-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
  transition: color 0.25s ease;
}
.lt .page-header__title {
  color: #1e293b;
}
.page-header__sub {
  font-size: 0.80rem;
  color: #9ca3af;
  margin-top: 1px;
  transition: color 0.25s ease;
}
.lt .page-header__sub {
  color: #94a3b8;
}
.page-header__refresh {
  color: #6b7280 !important;
}

// ─── Section Title ───────────────────────────────────────────────────────────
.section-title {
  font-size: 0.80rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
  transition: color 0.25s ease;
}
.lt .section-title {
  color: #94a3b8;
}

// ─── Mini KPI ────────────────────────────────────────────────────────────────
.mini-kpi {
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  overflow: hidden;
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: 2px 2px 0 0;
  }

  &:nth-child(1)::before { background: linear-gradient(90deg, #22d3ee, #0d9488); }
  &:nth-child(2)::before { background: linear-gradient(90deg, #f97316, #ea580c); }
  &:nth-child(3)::before { background: linear-gradient(90deg, #10b981, #059669); }
}
.lt .mini-kpi {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.mini-val {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
}
.mini-val--cyan {
  color: #22d3ee;
  filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.4));
}
.mini-val--orange {
  color: #fb923c;
  filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.4));
}
.mini-val--green {
  color: #34d399;
  filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.4));
}
.lt .mini-val--cyan { color: #0891b2; filter: none; }
.lt .mini-val--orange { color: #ea580c; filter: none; }
.lt .mini-val--green { color: #059669; filter: none; }
.mini-lbl {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}

// ─── Alert Banner ────────────────────────────────────────────────────────────
.alert-banner {
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(234, 88, 12, 0.06));
  border: 1px solid rgba(245, 158, 11, 0.25);
  color: #fbbf24;
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.1), inset 0 0 0 1px rgba(251, 191, 36, 0.05);
  animation: alertPulse 2.5s ease-in-out infinite;
  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}
@keyframes alertPulse {
  0%, 100% { box-shadow: 0 0 14px rgba(245, 158, 11, 0.1); }
  50% { box-shadow: 0 0 22px rgba(245, 158, 11, 0.22); }
}
.lt .alert-banner {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #d97706;
  box-shadow: none;
  animation: none;
}
.alert-action {
  font-weight: 700 !important;
  font-size: 0.85rem !important;
  color: #fbbf24 !important;
}
.lt .alert-action {
  color: #d97706 !important;
}

// ─── Empty State ─────────────────────────────────────────────────────────────
.empty-state {
  text-align: center;
}
.empty-state__icon {
  color: #374151;
  margin-bottom: 8px;
  transition: color 0.25s ease;
}
.lt .empty-state__icon {
  color: #cbd5e1;
}
.empty-state__text {
  font-size: 0.88rem;
  color: #6b7280;
}

// ─── Waiter Cards ────────────────────────────────────────────────────────────
.waiter-card {
  border-radius: 14px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.2s ease, border-color 0.2s, transform 0.15s, box-shadow 0.2s;

  &:hover {
    border-color: rgba(34, 211, 238, 0.2);
    box-shadow: 0 4px 16px rgba(34, 211, 238, 0.06);
  }
}
.lt .waiter-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &:hover {
    border-color: rgba(8, 145, 178, 0.25);
    box-shadow: 0 4px 12px rgba(8, 145, 178, 0.08);
  }
}
.waiter-card:active {
  transform: scale(0.985);
  border-color: rgba(34, 211, 238, 0.35);
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.08);
}
.lt .waiter-card:active {
  border-color: rgba(8, 145, 178, 0.35);
  box-shadow: none;
}

.waiter-avatar {
  background: linear-gradient(135deg, #22d3ee, #6366f1) !important;
  font-size: 16px !important;
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.2), 0 4px 12px rgba(34, 211, 238, 0.18) !important;
}

.waiter-name {
  font-weight: 700;
  font-size: 0.90rem;
  color: #f3f4f6;
  transition: color 0.25s ease;
}
.lt .waiter-name {
  color: #1e293b;
}
.waiter-code {
  font-size: 0.82rem;
  color: #9ca3af;
  transition: color 0.25s ease;
}
.lt .waiter-code {
  color: #94a3b8;
}
.waiter-card__arrow {
  color: #4b5563;
  transition: color 0.25s ease;
}
.lt .waiter-card__arrow {
  color: #cbd5e1;
}
.waiter-card__stats {
  flex-wrap: wrap;
}

// ─── Stat Pills ──────────────────────────────────────────────────────────────
.stat-pill {
  display: inline-flex;
  align-items: center;
  font-size: 0.83rem;
  font-weight: 600;
  border-radius: 6px;
  padding: 3px 8px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.05);
  transition: background 0.25s ease, color 0.25s ease;
}
.lt .stat-pill {
  color: #64748b;
  background: #f1f5f9;
}
.stat-pill--gold {
  color: #fbbf24 !important;
  background: rgba(251, 191, 36, 0.08);
}
.stat-pill--alert {
  color: #f87171 !important;
  background: rgba(248, 113, 113, 0.08);
}
.lt .stat-pill--alert {
  background: rgba(248, 113, 113, 0.06);
}

// ─── Hierarchy ───────────────────────────────────────────────────────────────
.hierarchy-row {
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.95rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.25s ease, border-color 0.25s ease;
}
.lt .hierarchy-row {
  background: #ffffff;
  border: 1px solid #e5e7eb;
}
.hierarchy-icon--person { color: #06b6d4; }
.hierarchy-icon--manager { color: #8b5cf6; }
.hierarchy-arrow { color: #4b5563; }
.hierarchy-name {
  color: #f3f4f6;
  transition: color 0.25s ease;
}
.lt .hierarchy-name {
  color: #1e293b;
}
.hierarchy-manager {
  color: #9ca3af;
  transition: color 0.25s ease;
}
.lt .hierarchy-manager {
  color: #64748b;
}
</style>
