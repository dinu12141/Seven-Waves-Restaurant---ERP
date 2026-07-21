<template>
  <q-page class="mgr-home-page">
    <q-pull-to-refresh @refresh="onRefresh" color="cyan">

      <!-- ── Hero Header ─────────────────────────────────────────── -->
      <div class="mgr-hero">
        <div class="mgr-hero__inner">
          <div class="row items-center no-wrap">
            <q-avatar size="52px" class="mgr-hero__avatar text-weight-bold text-white">
              {{ initials(firstName) }}
            </q-avatar>
            <div class="col q-ml-md">
              <div class="mgr-hero__greeting">{{ greeting }}</div>
              <div class="mgr-hero__name">{{ firstName }}</div>
              <div class="row items-center q-gutter-xs q-mt-xs">
                <q-chip dense color="cyan-9" text-color="white" icon="manage_accounts" class="text-caption">
                  Manager
                </q-chip>
                <q-chip dense color="indigo-8" text-color="white" icon="store" class="text-caption">
                  {{ authStore.currentBranch?.name || '—' }}
                </q-chip>
              </div>
            </div>
            <q-btn flat round icon="refresh" size="sm" class="mgr-hero__refresh" :loading="store.loading" @click="store.refresh()" />
          </div>

          <!-- Date row -->
          <div class="mgr-hero__date q-mt-sm">
            <q-icon name="today" size="13px" class="q-mr-xs" />
            {{ today }}
          </div>
        </div>
      </div>

      <!-- ── KPI Cards ──────────────────────────────────────────── -->
      <div class="q-px-md q-pt-md">
        <div class="row q-col-gutter-sm">

          <!-- On-Shift (clickable → dialog) -->
          <div class="col-6">
            <button class="mgr-kpi-card mgr-kpi-card--cyan" @click="openShiftStaffDialog">
              <div class="mgr-kpi-icon"><q-icon name="groups" size="22px" /></div>
              <div class="mgr-kpi-val">{{ store.onShiftCount }}</div>
              <div class="mgr-kpi-lbl">On-Shift</div>
              <q-icon name="chevron_right" size="14px" class="mgr-kpi-arrow" />
            </button>
          </div>

          <!-- Pending Orders -->
          <div class="col-6">
            <button class="mgr-kpi-card mgr-kpi-card--orange" @click="$router.push('/manager-app/orders')">
              <div class="mgr-kpi-icon"><q-icon name="pending_actions" size="22px" /></div>
              <div class="mgr-kpi-val">{{ store.pendingOrderCount }}</div>
              <div class="mgr-kpi-lbl">Pending</div>
            </button>
          </div>

          <!-- Active Orders -->
          <div class="col-6">
            <button class="mgr-kpi-card mgr-kpi-card--green" @click="$router.push('/manager-app/orders')">
              <div class="mgr-kpi-icon"><q-icon name="restaurant" size="22px" /></div>
              <div class="mgr-kpi-val">{{ store.totalActiveOrders }}</div>
              <div class="mgr-kpi-lbl">Active</div>
            </button>
          </div>

          <!-- Served Today -->
          <div class="col-6">
            <button class="mgr-kpi-card mgr-kpi-card--purple">
              <div class="mgr-kpi-icon"><q-icon name="check_circle" size="22px" /></div>
              <div class="mgr-kpi-val">{{ store.servedTodayCount }}</div>
              <div class="mgr-kpi-lbl">Served</div>
            </button>
          </div>

        </div>
      </div>

      <!-- ── Alert Banners ───────────────────────────────────────── -->
      <div class="q-px-md q-mt-md">

        <!-- Delayed Orders -->
        <div v-if="store.delayedOrders.length > 0" class="mgr-alert-banner mgr-alert-banner--warn q-mb-sm">
          <div class="mgr-alert-icon mgr-alert-icon--warn">
            <q-icon name="warning_amber" size="18px" />
          </div>
          <div class="mgr-alert-content">
            <div class="mgr-alert-title">{{ store.delayedOrders.length }} delayed order(s)</div>
            <div class="mgr-alert-sub">Require immediate attention</div>
          </div>
          <q-btn flat dense no-caps label="View" class="mgr-alert-btn mgr-alert-btn--warn" to="/manager-app/orders" />
        </div>

        <!-- Unread Messages -->
        <div v-if="store.unreadMessageCount > 0" class="mgr-alert-banner mgr-alert-banner--info q-mb-sm">
          <div class="mgr-alert-icon mgr-alert-icon--info">
            <q-icon name="mail" size="18px" />
          </div>
          <div class="mgr-alert-content">
            <div class="mgr-alert-title">{{ store.unreadMessageCount }} unread message(s)</div>
            <div class="mgr-alert-sub">From your team</div>
          </div>
          <q-btn flat dense no-caps label="Open" class="mgr-alert-btn mgr-alert-btn--info" to="/manager-app/messages" />
        </div>

      </div>

      <!-- ── Quick Actions ──────────────────────────────────────── -->
      <div class="q-px-md q-mt-md q-mb-md">
        <div class="mgr-section-title q-mb-sm">QUICK ACTIONS</div>
        <div class="row q-col-gutter-sm">
          <div class="col-6" v-for="action in quickActions" :key="action.to">
            <button class="mgr-qa-card" @click="$router.push(action.to)">
              <div class="mgr-qa-icon" :style="{ background: action.bg }">
                <q-icon :name="action.icon" size="22px" color="white" />
              </div>
              <div class="mgr-qa-label">{{ action.label }}</div>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Waiter Leaderboard ─────────────────────────────────── -->
      <div class="q-px-md q-pb-xl">
        <WaiterLeaderboard />
      </div>

    </q-pull-to-refresh>

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
        <q-tabs v-model="ssTab" dense no-caps class="ss-tabs" active-color="cyan" indicator-color="cyan">
          <q-tab name="all" label="All Staff" />
          <q-tab name="present" :label="`Present (${presentStaff.length})`" />
          <q-tab name="absent" :label="`Absent (${absentStaff.length})`" />
        </q-tabs>

        <!-- Dept Filter -->
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

        <!-- Empty -->
        <div v-else-if="filteredShiftStaff.length === 0" class="ss-empty">
          <div class="ss-empty__circle"><q-icon name="event_busy" size="32px" /></div>
          <div class="ss-empty__text">No staff found</div>
          <div class="ss-empty__sub">Try changing the tab or department filter</div>
        </div>

        <!-- Staff List -->
        <div v-else class="ss-list-area">
          <div v-for="staff in filteredShiftStaff" :key="staff.id" class="ss-staff-row">
            <q-avatar size="38px" class="ss-avatar" :style="{ background: avatarBg(staff.employee_name) }">
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
              <q-chip dense size="sm" :color="statusChipColor(staff.status)" text-color="white" class="ss-status-chip">
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

const store = useManagerAppStore()
const authStore = useAuthStore()

const firstName = computed(() => {
  const name = authStore.userDisplayName || ''
  return name.split(/\s+/)[0] || 'Manager'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning,'
  if (h < 17) return 'Good Afternoon,'
  return 'Good Evening,'
})

const today = computed(() =>
  new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }),
)

const quickActions = [
  { label: 'Floor Overview', icon: 'supervisor_account', to: '/manager-app/floor', bg: 'linear-gradient(135deg, #06b6d4, #0284c7)' },
  { label: 'Monitor Orders', icon: 'receipt_long', to: '/manager-app/orders', bg: 'linear-gradient(135deg, #f97316, #ea580c)' },
  { label: 'View Waiters', icon: 'groups', to: '/manager-app/waiters', bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' },
  { label: 'Alerts', icon: 'notifications_active', to: '/manager-app/alerts', bg: 'linear-gradient(135deg, #ef4444, #dc2626)' },
]

async function onRefresh(done) {
  await store.refresh()
  done()
}

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
  if (ssTab.value === 'present') list = list.filter(s => ['active', 'present', 'checked_in'].includes(s.status))
  else if (ssTab.value === 'absent') list = list.filter(s => !['active', 'present', 'checked_in'].includes(s.status))
  if (ssDeptFilter.value) list = list.filter(s => s.department === ssDeptFilter.value)
  return list
})

function initials(name) {
  return (name || '').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
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
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function statusChipColor(status) {
  const map = { active: 'green-8', present: 'green-8', checked_in: 'green-8', scheduled: 'blue-grey-6', absent: 'red-7', late: 'orange-8', on_leave: 'purple-6' }
  return map[status] || 'grey-7'
}

function statusLabel(status) {
  const map = { active: 'Present', present: 'Present', checked_in: 'Checked In', scheduled: 'Scheduled', absent: 'Absent', late: 'Late', on_leave: 'On Leave' }
  return map[status] || status?.replace(/_/g, ' ') || 'Unknown'
}
</script>

<style lang="scss" scoped>
// ─── Page ───────────────────────────────────────────────────────────────────
.mgr-home-page {
  background: #090c14;
  min-height: 100vh;
}
.body--light .mgr-home-page {
  background: #f1f5f9;
}

// ─── Hero ───────────────────────────────────────────────────────────────────
.mgr-hero {
  background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 55%, #0c2d5c 100%);
  box-shadow: 0 8px 32px rgba(6, 182, 212, 0.15);
  padding: 20px 16px 22px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -30px;
    right: -30px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%);
    pointer-events: none;
  }
}
.body--light .mgr-hero {
  background: linear-gradient(160deg, #1e1b4b 0%, #312e81 55%, #1e3a8a 100%);
}

.mgr-hero__inner {
  position: relative;
  z-index: 1;
}

.mgr-hero__avatar {
  background: linear-gradient(135deg, #06b6d4 0%, #0284c7 50%, #6366f1 100%);
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.3), 0 8px 20px rgba(6, 182, 212, 0.25);
  font-size: 1.1rem;
}

.mgr-hero__greeting {
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.55);
  font-weight: 500;
}

.mgr-hero__name {
  font-size: 1.45rem;
  font-weight: 900;
  color: #ffffff;
  letter-spacing: -0.3px;
  line-height: 1.1;
}

.mgr-hero__date {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.45);
  display: flex;
  align-items: center;
}

.mgr-hero__refresh {
  color: rgba(255, 255, 255, 0.5) !important;
  flex-shrink: 0;
}

// ─── KPI Cards ──────────────────────────────────────────────────────────────
.mgr-kpi-card {
  width: 100%;
  border: none;
  outline: none;
  border-radius: 16px;
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.15s;

  &:active { transform: scale(0.95); }
}

.mgr-kpi-card--cyan {
  background: linear-gradient(135deg, #0891b2 0%, #0369a1 100%);
  box-shadow: 0 8px 24px rgba(8, 145, 178, 0.35);
}
.mgr-kpi-card--orange {
  background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
  box-shadow: 0 8px 24px rgba(234, 88, 12, 0.35);
}
.mgr-kpi-card--green {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.35);
}
.mgr-kpi-card--purple {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.35);
}

.mgr-kpi-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  margin-bottom: 10px;
}

.mgr-kpi-val {
  font-size: 2rem;
  font-weight: 900;
  color: #fff;
  line-height: 1;
  letter-spacing: -1px;
}

.mgr-kpi-lbl {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-top: 3px;
}

.mgr-kpi-arrow {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(255, 255, 255, 0.4);
}

// ─── Alert Banners ──────────────────────────────────────────────────────────
.mgr-alert-banner {
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.mgr-alert-banner--warn {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%);
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.mgr-alert-banner--info {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.10) 0%, rgba(2, 132, 199, 0.06) 100%);
  border: 1px solid rgba(6, 182, 212, 0.25);
}

.mgr-alert-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mgr-alert-icon--warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.mgr-alert-icon--info { background: rgba(6, 182, 212, 0.12); color: #22d3ee; }

.mgr-alert-content { flex: 1; }

.mgr-alert-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #f3f4f6;
}
.body--light .mgr-alert-title { color: #1e293b; }

.mgr-alert-sub {
  font-size: 0.82rem;
  color: #9ca3af;
  margin-top: 1px;
}
.body--light .mgr-alert-sub { color: #64748b; }

.mgr-alert-btn {
  font-size: 0.88rem !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
}
.mgr-alert-btn--warn { color: #fbbf24 !important; }
.mgr-alert-btn--info { color: #22d3ee !important; }

// ─── Section Title ──────────────────────────────────────────────────────────
.mgr-section-title {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1.8px;
  color: #4b5563;
}
.body--light .mgr-section-title { color: #94a3b8; }

// ─── Quick Actions ──────────────────────────────────────────────────────────
.mgr-qa-card {
  width: 100%;
  border: none;
  outline: none;
  height: 72px;
  border-radius: 16px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:active { transform: scale(0.96); }
}
.body--light .mgr-qa-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.mgr-qa-icon {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 13px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.mgr-qa-label {
  font-size: 0.94rem;
  font-weight: 700;
  color: #e5e7eb;
  flex: 1;
  text-align: left;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.body--light .mgr-qa-label { color: #1e293b; }
</style>

<!-- Unscoped: teleported dialog -->
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
  background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
}
.body--light .ss-header {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
}

.ss-header__left { display: flex; align-items: center; gap: 12px; }

.ss-header__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 182, 212, 0.15);
  color: #22d3ee;
}

.ss-header__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #f3f4f6;
}
.ss-header__sub {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.ss-close-btn { color: rgba(255,255,255,0.5) !important; }

// Summary chips
.ss-summary { display: flex; gap: 8px; padding: 10px 16px 8px; }
.ss-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
}
.ss-chip--present { background: rgba(16,185,129,0.1); color: #10b981; border: 1px solid rgba(16,185,129,0.2); }
.ss-chip--absent  { background: rgba(239,68,68,0.1);  color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.ss-chip--total   { background: rgba(6,182,212,0.08); color: #06b6d4; border: 1px solid rgba(6,182,212,0.15); }

// Tabs
.ss-tabs {
  margin: 0 16px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
}
.body--light .ss-tabs { background: #f1f5f9; border-color: #e2e8f0; }
.ss-tabs .q-tab { font-size: 0.82rem; font-weight: 600; min-height: 36px; color: #6b7280; }
.ss-tabs .q-tab--active { color: #06b6d4; }
.body--light .ss-tabs .q-tab--active { color: #0891b2; }

// Dept filter
.ss-dept-filter { display: flex; flex-wrap: wrap; gap: 4px; padding: 10px 16px 6px; }
.ss-dept-chip { font-size: 0.80rem !important; font-weight: 600 !important; border-radius: 8px !important; }

// Loading / Empty
.ss-loading, .ss-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 10px;
  color: #6b7280;
  font-size: 0.88rem;
}
.ss-empty__circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e1b4b, #312e81);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  margin-bottom: 4px;
}
.ss-empty__text { font-weight: 700; font-size: 0.95rem; color: #9ca3af; }
.ss-empty__sub { font-size: 0.80rem; color: #6b7280; }

// List
.ss-list-area {
  flex: 1;
  min-height: 100px;
  max-height: calc(92vh - 280px);
  overflow-y: auto;
  padding: 0 12px 16px;
}

.ss-staff-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.body--light .ss-staff-row { border-color: #f1f5f9; }
.ss-staff-row:last-child { border-bottom: none; }

.ss-avatar { font-size: 0.80rem; font-weight: 800; color: #fff; flex-shrink: 0; }

.ss-staff-info { flex: 1; min-width: 0; }
.ss-staff-name { font-size: 0.92rem; font-weight: 700; color: #f3f4f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.body--light .ss-staff-name { color: #1e293b; }
.ss-staff-meta { font-size: 0.80rem; color: #6b7280; margin-top: 1px; display: flex; align-items: center; gap: 4px; }
.ss-dot { opacity: 0.5; }
.ss-staff-shift { font-size: 0.76rem; color: #4b5563; margin-top: 2px; display: flex; align-items: center; }
.body--light .ss-staff-shift { color: #94a3b8; }
.ss-shift-time { margin-left: 4px; opacity: 0.7; }

.ss-staff-status { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.ss-status-chip { font-size: 0.75rem !important; font-weight: 700 !important; border-radius: 6px !important; }
.ss-staff-code { font-size: 0.73rem; color: #4b5563; font-family: monospace; letter-spacing: 0.5px; }
.body--light .ss-staff-code { color: #94a3b8; }
</style>
