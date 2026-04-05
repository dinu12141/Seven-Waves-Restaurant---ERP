<template>
  <q-page class="mgr-home-page" :class="{ lt: !$q.dark.isActive }" padding>
    <!-- Welcome Header -->
    <div class="welcome-section q-mb-lg">
      <div class="welcome-greeting">
        {{ greeting }}, <span class="welcome-name">{{ firstName }}</span>
      </div>
      <div class="welcome-sub">
        <q-icon name="store" size="13px" class="q-mr-xs" />
        {{ authStore.currentBranch?.name || '—' }} · {{ today }}
      </div>
      <q-btn
        flat
        round
        icon="refresh"
        size="sm"
        class="welcome-refresh"
        :loading="store.loading"
        @click="store.refresh()"
      />
    </div>

    <!-- KPI Cards -->
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6">
        <div class="kpi-card kpi--cyan" style="cursor:pointer" @click="openShiftStaffDialog">
          <div class="kpi-icon-wrap kpi-icon--cyan">
            <q-icon name="groups" size="20px" />
          </div>
          <div class="kpi-content">
            <span class="kpi-val">{{ store.onShiftCount }}</span>
            <span class="kpi-lbl">On-Shift</span>
          </div>
          <q-icon name="chevron_right" size="16px" class="kpi-arrow" />
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--orange">
          <div class="kpi-icon-wrap kpi-icon--orange">
            <q-icon name="pending_actions" size="20px" />
          </div>
          <div class="kpi-content">
            <span class="kpi-val">{{ store.pendingOrderCount }}</span>
            <span class="kpi-lbl">Pending</span>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--green">
          <div class="kpi-icon-wrap kpi-icon--green">
            <q-icon name="restaurant" size="20px" />
          </div>
          <div class="kpi-content">
            <span class="kpi-val">{{ store.totalActiveOrders }}</span>
            <span class="kpi-lbl">Active</span>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="kpi-card kpi--purple">
          <div class="kpi-icon-wrap kpi-icon--purple">
            <q-icon name="check_circle" size="20px" />
          </div>
          <div class="kpi-content">
            <span class="kpi-val">{{ store.servedTodayCount }}</span>
            <span class="kpi-lbl">Served</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Delayed Orders Alert -->
    <div v-if="store.delayedOrders.length > 0" class="alert-banner alert-banner--warning q-mb-md">
      <div class="alert-banner__icon">
        <q-icon name="warning_amber" size="18px" />
      </div>
      <div class="alert-banner__content">
        <span class="alert-banner__title">{{ store.delayedOrders.length }} delayed order(s)</span>
        <span class="alert-banner__sub">Require immediate attention</span>
      </div>
      <q-btn flat dense no-caps label="View" class="alert-banner__action" to="/manager-app/orders" />
    </div>

    <!-- Unread Messages -->
    <div v-if="store.unreadMessageCount > 0" class="alert-banner alert-banner--info q-mb-md">
      <div class="alert-banner__icon alert-banner__icon--info">
        <q-icon name="mail" size="18px" />
      </div>
      <div class="alert-banner__content">
        <span class="alert-banner__title">{{ store.unreadMessageCount }} unread message(s)</span>
        <span class="alert-banner__sub">From your team</span>
      </div>
      <q-btn flat dense no-caps label="Open" class="alert-banner__action alert-banner__action--info" to="/manager-app/messages" />
    </div>

    <!-- Quick Actions -->
    <div class="section-title q-mb-sm">QUICK ACTIONS</div>
    <div class="row q-col-gutter-sm q-mb-lg">
      <div class="col-6" v-for="action in quickActions" :key="action.to">
        <div 
          class="qa-card" 
          v-ripple 
          @click="$router.push(action.to)"
        >
          <div class="qa-icon-wrap" :style="{ background: action.bg }">
            <q-icon :name="action.icon" size="20px" color="white" />
          </div>
          <div class="qa-content">
            <span class="qa-label">{{ action.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Waiter Rankings (with period filter) -->
    <WaiterLeaderboard />

    <!-- ══════════════════════════════════════════════════════════
         TODAY'S SHIFT STAFF DIALOG
    ══════════════════════════════════════════════════════════ -->
    <q-dialog v-model="shiftStaffOpen" position="bottom" maximized>
      <q-card class="shift-staff-card">
        <!-- Header -->
        <div class="ss-header">
          <div class="ss-header__left">
            <div class="ss-header__icon-wrap">
              <q-icon name="fingerprint" size="22px" />
            </div>
            <div>
              <div class="ss-header__title">Today's Shift Staff</div>
              <div class="ss-header__sub">
                {{ todayFormatted }} · {{ store.todayShiftStaff.length }} assigned
              </div>
            </div>
          </div>
          <q-btn flat round dense icon="close" class="ss-close-btn" @click="shiftStaffOpen = false" />
        </div>

        <!-- Summary Chips -->
        <div class="ss-summary">
          <div class="ss-chip ss-chip--present">
            <q-icon name="check_circle" size="14px" />
            <span>{{ presentStaff.length }} Present</span>
          </div>
          <div class="ss-chip ss-chip--absent">
            <q-icon name="cancel" size="14px" />
            <span>{{ absentStaff.length }} Absent</span>
          </div>
          <div class="ss-chip ss-chip--total">
            <q-icon name="people" size="14px" />
            <span>{{ store.todayShiftStaff.length }} Total</span>
          </div>
        </div>

        <!-- Filter Tabs -->
        <q-tabs
          v-model="ssTab"
          dense
          no-caps
          class="ss-tabs"
          active-color="cyan"
          indicator-color="cyan"
        >
          <q-tab name="all" label="All Staff" />
          <q-tab name="present" :label="`Present (${presentStaff.length})`" />
          <q-tab name="absent" :label="`Absent (${absentStaff.length})`" />
        </q-tabs>

        <!-- Department Filter Chips -->
        <div class="ss-dept-filter">
          <q-chip
            v-for="dept in departments"
            :key="dept"
            clickable
            dense
            :outline="ssDeptFilter !== dept"
            :color="ssDeptFilter === dept ? 'cyan-8' : undefined"
            :text-color="ssDeptFilter === dept ? 'white' : undefined"
            size="sm"
            class="ss-dept-chip"
            @click="ssDeptFilter = ssDeptFilter === dept ? null : dept"
          >
            {{ dept }}
          </q-chip>
        </div>

        <!-- Loading -->
        <div v-if="store.todayShiftStaffLoading" class="ss-loading">
          <q-spinner-orbit size="36px" color="cyan" />
          <div>Loading shift data…</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="filteredShiftStaff.length === 0" class="ss-empty">
          <q-icon name="event_busy" size="40px" />
          <div class="ss-empty__text">No staff found for this filter</div>
          <div class="ss-empty__sub">Try changing the tab or department filter</div>
        </div>

        <!-- Staff List -->
        <div v-else class="ss-list-area">
          <div
            v-for="staff in filteredShiftStaff"
            :key="staff.id"
            class="ss-staff-row"
          >
            <q-avatar
              size="38px"
              class="ss-avatar"
              :style="{ background: avatarBg(staff.employee_name) }"
            >
              {{ initials(staff.employee_name) }}
            </q-avatar>

            <div class="ss-staff-info">
              <div class="ss-staff-name">{{ staff.employee_name }}</div>
              <div class="ss-staff-meta">
                <span>{{ staff.designation }}</span>
                <span class="ss-dot">·</span>
                <span>{{ staff.department }}</span>
              </div>
              <div class="ss-staff-shift">
                <q-icon name="schedule" size="11px" class="q-mr-xs" />
                {{ staff.shift_name }}
                <span class="ss-shift-time">{{ fmtTime(staff.shift_start) }} – {{ fmtTime(staff.shift_end) }}</span>
              </div>
            </div>

            <div class="ss-staff-status">
              <q-chip
                dense
                size="sm"
                :color="statusChipColor(staff.status)"
                text-color="white"
                class="ss-status-chip"
              >
                {{ statusLabel(staff.status) }}
              </q-chip>
              <div class="ss-staff-code">{{ staff.employee_code }}</div>
            </div>
          </div>
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useAuthStore } from 'stores/auth'
import WaiterLeaderboard from 'src/components/waiter/WaiterLeaderboard.vue'
import { useQuasar } from 'quasar'

const store = useManagerAppStore()
const authStore = useAuthStore()
const $q = useQuasar()

const firstName = computed(() => {
  const name = authStore.userDisplayName || ''
  return name.split(/\s+/)[0] || 'Manager'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
})

const today = computed(() =>
  new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' }),
)

const quickActions = [
  { label: 'Floor Overview', icon: 'supervisor_account', to: '/manager-app/floor', bg: 'linear-gradient(135deg, #06b6d4, #0284c7)' },
  { label: 'Monitor Orders', icon: 'receipt_long', to: '/manager-app/orders', bg: 'linear-gradient(135deg, #f97316, #ea580c)' },
  { label: 'View Waiters', icon: 'groups', to: '/manager-app/waiters', bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  { label: 'Alerts', icon: 'notifications_active', to: '/manager-app/alerts', bg: 'linear-gradient(135deg, #ef4444, #dc2626)' },
]

// ─── Shift Staff Dialog ─────────────────────────────────────────────────────
const shiftStaffOpen = ref(false)
const ssTab = ref('all')
const ssDeptFilter = ref(null)

const todayFormatted = computed(() =>
  new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
)

async function openShiftStaffDialog() {
  shiftStaffOpen.value = true
  ssTab.value = 'all'
  ssDeptFilter.value = null
  await store.loadTodayShiftStaff()
}

const presentStaff = computed(() =>
  store.todayShiftStaff.filter(s => ['active', 'present', 'checked_in'].includes(s.status))
)
const absentStaff = computed(() =>
  store.todayShiftStaff.filter(s => !['active', 'present', 'checked_in'].includes(s.status))
)

const departments = computed(() => {
  const set = new Set(store.todayShiftStaff.map(s => s.department))
  return [...set].sort()
})

const filteredShiftStaff = computed(() => {
  let list = store.todayShiftStaff

  // Tab filter
  if (ssTab.value === 'present') {
    list = list.filter(s => ['active', 'present', 'checked_in'].includes(s.status))
  } else if (ssTab.value === 'absent') {
    list = list.filter(s => !['active', 'present', 'checked_in'].includes(s.status))
  }

  // Dept filter
  if (ssDeptFilter.value) {
    list = list.filter(s => s.department === ssDeptFilter.value)
  }

  return list
})

function initials(name) {
  return (name || '')
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('')
}

function avatarBg(name) {
  const colors = [
    'linear-gradient(135deg, #06b6d4, #0284c7)',
    'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    'linear-gradient(135deg, #f97316, #ea580c)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #ef4444, #dc2626)',
    'linear-gradient(135deg, #3b82f6, #2563eb)',
  ]
  let hash = 0
  for (const c of (name || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return colors[hash % colors.length]
}

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  const ampm = hr >= 12 ? 'PM' : 'AM'
  return `${hr % 12 || 12}:${m} ${ampm}`
}

function statusChipColor(status) {
  const map = {
    active: 'green-8',
    present: 'green-8',
    checked_in: 'green-8',
    scheduled: 'blue-grey-6',
    absent: 'red-7',
    late: 'orange-8',
    on_leave: 'purple-6',
  }
  return map[status] || 'grey-7'
}

function statusLabel(status) {
  const map = {
    active: 'Present',
    present: 'Present',
    checked_in: 'Checked In',
    scheduled: 'Scheduled',
    absent: 'Absent',
    late: 'Late',
    on_leave: 'On Leave',
  }
  return map[status] || status?.replace(/_/g, ' ') || 'Unknown'
}
</script>

<style lang="scss" scoped>
@import '../waiter-app/waiter-shared.scss';

.mgr-home-page {
  background: #090c14;
  transition: background 0.25s ease;

  &.lt {
    background: #f1f5f9;
  }
}

// ─── Welcome Section ─────────────────────────────────────────────────────────
.welcome-section {
  position: relative;
  padding: 4px 0;
}
.welcome-greeting {
  font-size: 1.3rem;
  font-weight: 400;
  color: #9ca3af;
  transition: color 0.25s ease;
}
.lt .welcome-greeting { color: #64748b; }
.welcome-name {
  font-weight: 800;
  color: #f3f4f6;
  transition: color 0.25s ease;
}
.lt .welcome-name { color: #1e293b; }
.welcome-sub {
  font-size: 0.90rem;
  color: #6b7280;
  margin-top: 4px;
  display: flex;
  align-items: center;
}
.lt .welcome-sub { color: #94a3b8; }
.welcome-refresh {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280 !important;
}

// ─── Section Title ─────────────────────────────────────────────────────────────────
.section-title {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: #4b5563;
  transition: color 0.25s ease;
}
.lt .section-title { color: #94a3b8; }

// ─── KPI Cards ───────────────────────────────────────────────────────────────
.kpi-card {
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 82px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.05);
  }
}

.lt .kpi-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
}

.kpi-icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 12px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.kpi-icon--cyan   { background: rgba(14, 165, 233, 0.15); color: #38bdf8; }
.kpi-icon--orange { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
.kpi-icon--green  { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.kpi-icon--purple { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }

.kpi-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
}

.kpi-val {
  font-size: 1.7rem;
  font-weight: 900;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.kpi-lbl {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #94a3b8;
  margin-top: 1px;
  white-space: nowrap;
}

.kpi--cyan .kpi-val { color: #38bdf8; }
.kpi--orange .kpi-val { color: #fb923c; }
.kpi--green .kpi-val { color: #34d399; }
.kpi--purple .kpi-val { color: #a78bfa; }

.kpi-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: #4b5563;
  opacity: 0.4;
}

.kpi--cyan { border-left: 4px solid #38bdf8; }
.kpi--orange { border-left: 4px solid #fb923c; }
.kpi--green { border-left: 4px solid #34d399; }
.kpi--purple { border-left: 4px solid #a78bfa; }

.lt .kpi-lbl { color: #64748b; }
.lt .kpi--cyan { border-left: 4px solid #0ea5e9; }
.lt .kpi--orange { border-left: 4px solid #f97316; }
.lt .kpi--green { border-left: 4px solid #10b981; }
.lt .kpi--purple { border-left: 4px solid #8b5cf6; }

// ─── Alert Banners ───────────────────────────────────────────────────────────
.alert-banner {
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-banner__icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}
.alert-banner__icon--info {
  background: rgba(34, 211, 238, 0.12);
  color: #22d3ee;
}

.alert-banner__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.alert-banner__title {
  font-size: 0.95rem;
  font-weight: 700;
}
.alert-banner__sub {
  font-size: 0.90rem;
  opacity: 0.85;
}

.alert-banner--warning {
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  transition: background 0.25s ease, color 0.25s ease;
}
.lt .alert-banner--warning {
  background: #fffbeb;
  border-color: #fde68a;
  color: #d97706;
}

.alert-banner--info {
  background: rgba(34, 211, 238, 0.04);
  border: 1px solid rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  transition: background 0.25s ease, color 0.25s ease;
}
.lt .alert-banner--info {
  background: #f0fdfa;
  border-color: #ccfbf1;
  color: #0d9488;
}

.alert-banner__action {
  font-size: 0.90rem !important;
  font-weight: 700 !important;
  color: #fbbf24 !important;
  border-radius: 6px !important;
}
.alert-banner__action--info {
  color: #22d3ee !important;
}
.lt .alert-banner__action { color: #d97706 !important; }
.lt .alert-banner__action--info { color: #0d9488 !important; }

// ─── Quick Actions ───────────────────────────────────────────────────────────
.qa-card {
  height: 68px;
  border-radius: 14px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  cursor: pointer;
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.05);
  }
}

.lt .qa-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.qa-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 12px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}

.qa-content {
  flex: 1;
  min-width: 0;
}

.qa-label {
  font-size: 0.92rem;
  font-weight: 700;
  color: #e5e7eb;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lt .qa-label {
  color: #1e293b;
}


// ─── Shift Staff Dialog ─────────────────────────────────────────────────────
// Note: q-dialog teleports to body; these styles are scoped but use :deep
// to penetrate the dialog. We'll keep them here and rely on the Quasar
// data-attribute for scoping.
</style>

<!-- Unscoped styles for teleported dialog -->
<style lang="scss">
.shift-staff-card {
  background: #0d1117;
  border-radius: 20px 20px 0 0 !important;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  color: #e5e7eb;
  overflow: hidden;
}
.body--light .shift-staff-card {
  background: #ffffff;
  color: #1e293b;
}

.ss-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 10px;
}
.ss-header__left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ss-header__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 182, 212, 0.12);
  color: #06b6d4;
}
.ss-header__title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #f3f4f6;
}
.body--light .ss-header__title { color: #0f172a; }
.ss-header__sub {
  font-size: 0.95rem;
  color: #6b7280;
  margin-top: 2px;
}
.body--light .ss-header__sub { color: #94a3b8; }
.ss-close-btn {
  color: #6b7280 !important;
}

// Summary chips
.ss-summary {
  display: flex;
  gap: 8px;
  padding: 0 16px 10px;
}
.ss-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 0.90rem;
  font-weight: 700;
}
.ss-chip--present {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.ss-chip--absent {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.ss-chip--total {
  background: rgba(6, 182, 212, 0.08);
  color: #06b6d4;
  border: 1px solid rgba(6, 182, 212, 0.15);
}
.body--light .ss-chip--present {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #16a34a;
}
.body--light .ss-chip--absent {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}
.body--light .ss-chip--total {
  background: #f0f9ff;
  border-color: #bae6fd;
  color: #0284c7;
}

// Tabs
.ss-tabs {
  margin: 0 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.body--light .ss-tabs {
  background: #f1f5f9;
  border-color: #e2e8f0;
}
.ss-tabs .q-tab {
  font-size: 0.95rem;
  font-weight: 600;
  min-height: 36px;
  color: #6b7280;
}
.body--light .ss-tabs .q-tab { color: #94a3b8; }
.ss-tabs .q-tab--active { color: #06b6d4; }
.body--light .ss-tabs .q-tab--active { color: #0891b2; }

// Dept filter
.ss-dept-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 10px 16px 6px;
}
.ss-dept-chip {
  font-size: 0.90rem !important;
  font-weight: 600 !important;
  border-radius: 8px !important;
}

// Loading / Empty
.ss-loading, .ss-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 10px;
  color: #6b7280;
  font-size: 0.95rem;
}
.ss-empty__text {
  font-weight: 700;
  font-size: 1rem;
  color: #9ca3af;
}
.ss-empty__sub {
  font-size: 0.82rem;
  color: #6b7280;
}

// Staff list area
.ss-list-area {
  flex: 1;
  min-height: 100px;
  max-height: calc(92vh - 280px);
  overflow-y: auto;
  padding: 0 12px 16px;
}

// Staff row
.ss-staff-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s ease;
}
.body--light .ss-staff-row {
  border-color: #f1f5f9;
}
.ss-staff-row:last-child { border-bottom: none; }

.ss-avatar {
  font-size: 0.80rem;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
}

.ss-staff-info {
  flex: 1;
  min-width: 0;
}
.ss-staff-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.body--light .ss-staff-name { color: #1e293b; }
.ss-staff-meta {
  font-size: 0.81rem;
  color: #6b7280;
  margin-top: 1px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.body--light .ss-staff-meta { color: #94a3b8; }
.ss-dot { opacity: 0.5; }
.ss-staff-shift {
  font-size: 0.77rem;
  color: #4b5563;
  margin-top: 2px;
  display: flex;
  align-items: center;
}
.body--light .ss-staff-shift { color: #94a3b8; }
.ss-shift-time {
  margin-left: 4px;
  opacity: 0.7;
}

.ss-staff-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex-shrink: 0;
}
.ss-status-chip {
  font-size: 0.75rem !important;
  font-weight: 700 !important;
  border-radius: 6px !important;
}
.ss-staff-code {
  font-size: 0.73rem;
  color: #4b5563;
  font-family: monospace;
  letter-spacing: 0.5px;
}
.body--light .ss-staff-code { color: #94a3b8; }
</style>
