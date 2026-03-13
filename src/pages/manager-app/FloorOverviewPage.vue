<template>
  <q-page class="mgr-floor-page" padding>
    <div class="row items-center q-mb-lg">
      <q-icon name="supervisor_account" size="24px" color="cyan-4" class="q-mr-sm" />
      <div>
        <div class="text-h6 text-white text-weight-bold">Floor Overview</div>
        <div class="text-caption text-grey-5">Real-time waiter and order monitoring</div>
      </div>
      <q-space />
      <q-btn flat round icon="refresh" color="grey-5" :loading="store.loading" @click="store.refresh()" />
    </div>

    <!-- KPI Row -->
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-4">
        <div class="mini-kpi"><span class="mini-val text-cyan">{{ store.onShiftWaiters.length }}</span><span class="mini-lbl">Waiters</span></div>
      </div>
      <div class="col-4">
        <div class="mini-kpi"><span class="mini-val text-orange">{{ store.pendingOrderCount }}</span><span class="mini-lbl">Pending</span></div>
      </div>
      <div class="col-4">
        <div class="mini-kpi"><span class="mini-val text-green">{{ store.servedTodayCount }}</span><span class="mini-lbl">Served</span></div>
      </div>
    </div>

    <!-- Unaccepted Orders Alert -->
    <div v-if="store.pendingOrders.length > 0" class="alert-banner q-mb-lg">
      <q-icon name="warning" size="18px" class="q-mr-sm" />
      <span class="text-weight-bold">{{ store.pendingOrders.length }} unaccepted order(s)</span>
      <q-space />
      <q-btn flat dense no-caps color="amber" label="View" to="/manager-app/orders" />
    </div>

    <!-- Waiter Cards -->
    <div class="section-title q-mb-sm">ON-SHIFT WAITERS</div>
    <div v-if="store.loading" class="column items-center q-pa-lg">
      <q-spinner-orbit size="32px" color="cyan" />
    </div>
    <div v-else-if="store.onShiftWaiters.length === 0" class="text-grey-6 text-center q-pa-lg text-caption">
      No waiters on shift right now.
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
            <div class="text-white text-weight-bold">{{ w.display_name || w.employee_name }}</div>
            <div class="text-caption text-grey-5">{{ w.waiter_code }}</div>
          </div>
          <q-icon name="chevron_right" color="grey-7" />
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
          <div class="stat-pill">
            <q-icon name="stars" size="12px" class="q-mr-xs" color="amber-5" />
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
    <div v-if="store.hierarchyMap.length === 0" class="text-grey-6 text-caption text-center q-pa-md">
      No hierarchy assignments.
    </div>
    <div v-else>
      <div v-for="h in store.hierarchyMap" :key="h.id" class="hierarchy-row q-mb-sm row items-center">
        <q-icon name="person" size="14px" color="cyan-4" class="q-mr-sm" />
        <span class="text-white">{{ h.employee_name }}</span>
        <q-icon name="arrow_right" size="14px" color="grey-6" class="q-mx-xs" />
        <q-icon name="supervisor_account" size="14px" color="purple-4" class="q-mr-xs" />
        <span class="text-grey-4">{{ h.manager_name }}</span>
        <q-badge :color="htColor(h.hierarchy_type)" class="q-ml-sm text-caption">
          {{ htLabel(h.hierarchy_type) }}
        </q-badge>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { useManagerAppStore } from 'src/stores/managerAppStore'

const store = useManagerAppStore()

function initials(name) { return name ? name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') : '?' }
function htLabel(t) { return { waiter_manager: 'W.Mgr', floor_manager: 'F.Mgr', shift_lead: 'Lead', general: 'GM' }[t] || t }
function htColor(t) { return { waiter_manager: 'purple-8', floor_manager: 'blue-8', shift_lead: 'teal-8', general: 'orange-8' }[t] || 'grey-8' }
</script>

<style lang="scss" scoped>
.mgr-floor-page { background: #090c14; min-height: 100vh; }
.section-title { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #4b5563; }

.mini-kpi {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;
  padding: 10px; text-align: center; display: flex; flex-direction: column; gap: 2px;
}
.mini-val { font-size: 1.3rem; font-weight: 800; line-height: 1; }
.mini-lbl { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }

.alert-banner {
  background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25);
  border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; color: #fbbf24;
}

.waiter-card {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px; cursor: pointer; transition: border-color 0.15s;
  &:active { border-color: rgba(34,211,238,0.3); }
}
.waiter-avatar { background: linear-gradient(135deg, #06b6d4, #8b5cf6) !important; font-size: 14px !important; }
.waiter-card__stats { flex-wrap: wrap; }
.stat-pill {
  display: inline-flex; align-items: center; font-size: 0.7rem; font-weight: 600;
  color: #9ca3af; background: rgba(255,255,255,0.04); border-radius: 6px; padding: 3px 8px;
  &--alert { color: #f87171; background: rgba(248,113,113,0.08); }
}
.hierarchy-row {
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
  border-radius: 8px; padding: 10px 14px; font-size: 0.85rem;
}
</style>
