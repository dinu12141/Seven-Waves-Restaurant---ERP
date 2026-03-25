<template>
  <q-page class="waiter-page-dark">
    <q-pull-to-refresh @refresh="onRefresh" color="orange">

      <!-- ── Loading State ────────────────────────────────────────────── -->
      <div v-if="store.loading && !store.profile" class="loading-state">
        <div class="loading-ring" />
        <div class="text-grey-5 text-caption q-mt-lg">Loading your profile…</div>
      </div>

      <!-- ── Error / Not Set Up ────────────────────────────────────────── -->
      <div v-else-if="!store.profile" class="empty-state">
        <div class="empty-icon-wrap">
          <q-icon name="person_off" size="44px" color="grey-6" />
        </div>
        <div class="text-h6 text-grey-4 q-mt-md">Profile Not Set Up</div>
        <div class="text-caption text-grey-6 q-mt-xs" style="max-width:260px">
          Your waiter profile has not been created yet. Please contact your manager or admin.
        </div>
      </div>

      <!-- ── Main Profile ──────────────────────────────────────────────── -->
      <template v-else>

        <!-- ▸ Hero Identity Card ──────────────────────────────────────── -->
        <div class="hero-card">
          <div class="hero-bg" />
          <div class="hero-content">
            <!-- Avatar + Name -->
            <div class="hero-identity">
              <div class="avatar-ring">
                <q-avatar size="72px" class="hero-avatar text-white text-h5 text-weight-bold">
                  {{ initials(store.profile.display_name) }}
                </q-avatar>
                <!-- On-shift indicator dot -->
                <div class="shift-dot" :class="store.isOnShift ? 'shift-dot--on' : 'shift-dot--off'" />
              </div>
              <div class="hero-details">
                <div class="hero-name">{{ store.profile.display_name || '—' }}</div>
                <div class="hero-meta">
                  <q-chip dense outline size="sm" color="cyan-7" text-color="cyan-3" icon="badge" class="hero-chip">
                    {{ store.profile.waiter_code }}
                  </q-chip>
                  <q-chip dense outline size="sm" color="grey-7" text-color="grey-4" icon="work" class="hero-chip">
                    {{ roleName }}
                  </q-chip>
                </div>
              </div>
            </div>

            <!-- Branch row -->
            <div class="hero-branch">
              <q-icon name="store" size="13px" color="grey-6" class="q-mr-xs" />
              <span class="text-grey-5">{{ authStore.currentBranch?.name || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- ▸ Stats Strip ─────────────────────────────────────────────── -->
        <div class="stats-strip q-px-md">
          <div class="stat-cell">
            <div class="stat-circle stat-circle--amber">
              <q-icon name="stars" size="18px" />
            </div>
            <div class="stat-val text-amber">{{ store.currentPoints }}</div>
            <div class="stat-lbl">Points</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-circle stat-circle--blue">
              <q-icon name="task_alt" size="18px" />
            </div>
            <div class="stat-val text-blue-4">{{ store.totalOrdersServed }}</div>
            <div class="stat-lbl">Served</div>
          </div>
          <div class="stat-divider" />
          <div class="stat-cell">
            <div class="stat-circle stat-circle--green">
              <q-icon name="star_rate" size="18px" />
            </div>
            <div class="stat-val text-green-4">
              {{ store.profile.rating_avg ? Number(store.profile.rating_avg).toFixed(1) : '—' }}
            </div>
            <div class="stat-lbl">Rating</div>
          </div>
        </div>

        <!-- ▸ Shift & Manager ─────────────────────────────────────────── -->
        <div class="q-px-md q-mt-md">
          <div class="info-grid">
            <!-- Current Shift -->
            <div class="info-tile" :class="store.isOnShift ? 'info-tile--active' : ''">
              <div class="info-tile__icon-wrap" :class="store.isOnShift ? 'iw--green' : 'iw--grey'">
                <q-icon :name="store.isOnShift ? 'schedule' : 'event_busy'" size="20px" />
              </div>
              <div class="info-tile__body">
                <div class="info-tile__label">Current Shift</div>
                <div class="info-tile__value" v-if="store.shiftInfo">
                  {{ store.shiftInfo.shift_name }}
                </div>
                <div class="info-tile__value text-grey-6" v-else>Off Shift</div>
                <div class="info-tile__sub" v-if="store.shiftInfo">
                  {{ store.shiftInfo.shift_start?.slice(0, 5) }} – {{ store.shiftInfo.shift_end?.slice(0, 5) }}
                </div>
              </div>
            </div>

            <!-- Manager -->
            <div class="info-tile">
              <div class="info-tile__icon-wrap iw--purple">
                <q-icon name="supervisor_account" size="20px" />
              </div>
              <div class="info-tile__body">
                <div class="info-tile__label">My Manager</div>
                <div class="info-tile__value" v-if="store.managerInfo">
                  {{ store.managerInfo.manager_employee?.full_name }}
                </div>
                <div class="info-tile__value text-grey-6" v-else>Not assigned</div>
                <div class="info-tile__sub" v-if="store.managerInfo">
                  {{ formatHType(store.managerInfo.hierarchy_type) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ▸ Points Transactions ─────────────────────────────────────── -->
        <div class="q-px-md q-mt-lg">
          <div class="section-head">
            <q-icon name="receipt_long" size="15px" color="amber-6" class="q-mr-xs" />
            <span>Point Transactions</span>
            <q-space />
            <q-chip dense color="amber-9" text-color="dark" class="text-weight-bold section-badge">
              {{ store.currentPoints }} pts
            </q-chip>
          </div>

          <!-- Empty -->
          <div v-if="store.pointsLedger.length === 0" class="empty-section">
            <q-icon name="emoji_events" size="28px" color="grey-7" />
            <div>No points yet — start serving orders!</div>
          </div>

          <!-- Ledger rows -->
          <div v-else class="ledger-list">
            <div
              v-for="entry in store.pointsLedger.slice(0, 15)"
              :key="entry.id"
              class="ledger-row"
            >
              <div class="ledger-icon" :class="entry.points >= 0 ? 'li--pos' : 'li--neg'">
                <q-icon :name="ptIcon(entry.point_type)" size="16px" />
              </div>
              <div class="ledger-body">
                <div class="ledger-title">{{ ptLabel(entry.point_type) }}</div>
                <div class="ledger-sub">{{ entry.note || fmtRelative(entry.created_at) }}</div>
              </div>
              <div class="ledger-delta" :class="entry.points >= 0 ? 'text-green-4' : 'text-red-4'">
                {{ entry.points >= 0 ? '+' : '' }}{{ entry.points }}
              </div>
            </div>
          </div>
        </div>

        <!-- ▸ Recent Notifications ────────────────────────────────────── -->
        <div class="q-px-md q-mt-lg">
          <div class="section-head">
            <q-icon name="notifications" size="15px" color="blue-4" class="q-mr-xs" />
            <span>Recent Notifications</span>
            <q-space />
            <q-badge v-if="store.unreadNotifCount > 0" color="red-8" rounded class="q-px-sm">
              {{ store.unreadNotifCount }}
            </q-badge>
          </div>

          <!-- Empty -->
          <div v-if="store.notifications.length === 0" class="empty-section">
            <q-icon name="notifications_none" size="28px" color="grey-7" />
            <div>All caught up!</div>
          </div>

          <!-- Notification rows -->
          <div v-else class="notif-list">
            <div
              v-for="notif in store.notifications.slice(0, 5)"
              :key="notif.id"
              class="notif-row"
              :class="{ 'notif-row--unread': !notif.is_read }"
              @click="store.markNotificationRead(notif.id)"
            >
              <div class="notif-icon-dot" :class="'nd--' + notifTheme(notif.notification_type)">
                <q-icon :name="notifIcon(notif.notification_type)" size="16px" />
              </div>
              <div class="notif-body">
                <div class="notif-title">{{ notif.title }}</div>
                <div class="notif-sub">{{ notif.body }}</div>
              </div>
              <div class="notif-time">{{ fmtRelative(notif.created_at) }}</div>
            </div>

            <!-- View all link -->
            <button class="view-all-btn" @click="$router.push('/waiter-app/notifs')">
              View all notifications
              <q-icon name="chevron_right" size="14px" class="q-ml-xs" />
            </button>
          </div>
        </div>

        <!-- ▸ Log Out ─────────────────────────────────────────────────── -->
        <div class="q-px-md q-mt-xl q-mb-xl">
          <button class="logout-btn" @click="logout">
            <q-icon name="logout" size="18px" class="q-mr-sm" />
            Log Out
          </button>
        </div>

        <div style="height: 24px" />
      </template>

    </q-pull-to-refresh>
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useAuthStore } from 'stores/auth'
import { supabase } from 'src/boot/supabase'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'

const store = useWaiterAppStore()
const authStore = useAuthStore()
const $router = useRouter()
const $q = useQuasar()

// ─── Computed ──────────────────────────────────────────────────
const roleName = computed(() => {
  if (authStore.roles.includes('waiter')) return 'Waiter'
  if (authStore.roles.includes('manager')) return 'Manager'
  if (authStore.roles.includes('admin')) return 'Admin'
  return authStore.roles?.[0] || 'Staff'
})

// ─── Helpers ───────────────────────────────────────────────────
function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function formatHType(type) {
  const m = {
    waiter_manager: 'Waiter Manager',
    floor_manager: 'Floor Manager',
    shift_lead: 'Shift Lead',
    general: 'General Manager',
    kitchen_manager: 'Kitchen Manager',
  }
  return m[type] || type
}

function ptIcon(type) {
  return {
    served_order: 'restaurant', bonus: 'card_giftcard', adjustment: 'tune',
    penalty: 'warning', tip_received: 'payments', customer_rating: 'star',
  }[type] || 'stars'
}

function ptLabel(type) {
  return {
    served_order: 'Order Served', bonus: 'Bonus', adjustment: 'Adjustment',
    penalty: 'Penalty', tip_received: 'Tip Received', customer_rating: 'Customer Rating',
  }[type] || type
}

function notifIcon(type) {
  return {
    info: 'info', order_assigned: 'assignment', message_received: 'mail',
    points_earned: 'stars', schedule_change: 'event', urgent: 'priority_high',
    performance_review: 'assessment', shift_reminder: 'alarm', customer_rating: 'star',
  }[type] || 'notifications'
}

function notifTheme(type) {
  if (['urgent', 'performance_review'].includes(type)) return 'red'
  if (['message_received'].includes(type)) return 'blue'
  if (['points_earned', 'customer_rating'].includes(type)) return 'amber'
  if (['order_assigned'].includes(type)) return 'green'
  return 'grey'
}

function fmtRelative(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

async function onRefresh(done) {
  await store.refresh()
  done()
}

function logout() {
  $q.dialog({
    title: 'Log Out',
    message: 'Are you sure you want to sign out?',
    cancel: { flat: true, color: 'grey-7', noCaps: true },
    ok: { color: 'red-8', noCaps: true, label: 'Log Out' },
    persistent: false,
  }).onOk(async () => {
    store.cleanup()
    await supabase.auth.signOut()
    $router.push('/auth/login')
  })
}
</script>

<style lang="scss" scoped>
@import './waiter-shared.scss';

// ─── Loading State ───────────────────────────────────────────────────────────
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
.loading-ring {
  width: 48px; height: 48px;
  border: 3px solid rgba(234, 88, 12, 0.15);
  border-top-color: #ea580c;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

// ─── Empty / Error State ─────────────────────────────────────────────────────
.empty-icon-wrap {
  width: 80px; height: 80px; border-radius: 50%;
  background: #f1f5f9;
  border: 1px solid var(--erp-border, #e2e8f0);
  display: flex; align-items: center; justify-content: center;
}

// ─── Hero Identity Card ─────────────────────────────────────────────────────
.hero-card {
  position: relative;
  overflow: hidden;
  padding: 28px 20px 20px;
}
.hero-bg {
  position: absolute; inset: 0;
  background: linear-gradient(
    150deg,
    rgba(234, 88, 12, 0.06) 0%,
    rgba(147, 51, 234, 0.04) 50%,
    transparent 100%
  );
  border-bottom: 1px solid var(--erp-border, #e2e8f0);
}
.hero-content { position: relative; z-index: 1; }

.hero-identity {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-ring {
  position: relative;
  flex-shrink: 0;
  padding: 3px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.25), rgba(37, 99, 235, 0.15));
}
.hero-avatar {
  background: linear-gradient(135deg, #f97316, #ef4444) !important;
  font-size: 22px !important;
}
.shift-dot {
  position: absolute; bottom: 2px; right: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid #fff;
  &--on { background: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
  &--off { background: #9ca3af; }
}

.hero-details { min-width: 0; }
.hero-name {
  font-size: 1.25rem; font-weight: 800; color: var(--erp-text-primary, #1e293b);
  line-height: 1.2; letter-spacing: -0.3px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.hero-meta {
  display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap;
}
.hero-chip {
  font-size: 10px !important; font-weight: 700 !important;
  height: 22px !important; letter-spacing: 0.3px;
}

.hero-branch {
  display: flex; align-items: center;
  margin-top: 14px; padding-top: 12px;
  border-top: 1px solid var(--erp-border, #e2e8f0);
  font-size: 0.78rem; font-weight: 500;
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────
.stats-strip {
  display: flex; align-items: center; justify-content: center;
  margin-top: 16px; padding: 16px 0;
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 14px;
  margin-left: 16px; margin-right: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.stat-cell {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.stat-circle {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  &--amber { background: #fef3c7; color: #d97706; }
  &--blue  { background: #dbeafe; color: #2563eb; }
  &--green { background: #dcfce7; color: #16a34a; }
}
.stat-val {
  font-size: 1.35rem; font-weight: 800; line-height: 1;
}
.stat-lbl {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.8px; color: var(--erp-text-muted, #94a3b8);
}
.stat-divider {
  width: 1px; height: 36px;
  background: var(--erp-border, #e2e8f0);
}

// ─── Info Grid (Shift + Manager) ─────────────────────────────────────────────
.info-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
}
.info-tile {
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 12px; padding: 14px;
  display: flex; align-items: flex-start; gap: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  &--active { border-color: rgba(22, 163, 74, 0.3); background: #f0fdf4; }
}
.info-tile__icon-wrap {
  width: 36px; height: 36px; border-radius: 9px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  &.iw--green  { background: #dcfce7; color: #16a34a; }
  &.iw--grey   { background: #f1f5f9; color: #94a3b8; }
  &.iw--purple { background: #ede9fe; color: #7c3aed; }
}
.info-tile__body { min-width: 0; }
.info-tile__label {
  font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1px; color: var(--erp-text-muted, #94a3b8); margin-bottom: 3px;
}
.info-tile__value {
  font-size: 0.85rem; font-weight: 700; color: var(--erp-text-primary, #1e293b);
  line-height: 1.2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.info-tile__sub {
  font-size: 0.7rem; color: var(--erp-text-secondary, #64748b); margin-top: 2px;
}

// ─── Section Heads ───────────────────────────────────────────────────────────
.section-head {
  display: flex; align-items: center;
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1.2px; color: var(--erp-text-secondary, #64748b);
  margin-bottom: 10px;
}
.section-badge {
  font-size: 10px !important; height: 20px !important;
}

.empty-section {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 24px 0; color: var(--erp-text-muted, #94a3b8); font-size: 0.8rem;
}

// ─── Ledger Rows ─────────────────────────────────────────────────────────────
.ledger-list {
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.ledger-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
  &:last-child { border-bottom: none; }
}
.ledger-icon {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  &.li--pos { background: #dcfce7; color: #16a34a; }
  &.li--neg { background: #fee2e2; color: #dc2626; }
}
.ledger-body { flex: 1; min-width: 0; }
.ledger-title {
  font-size: 0.8rem; font-weight: 600; color: var(--erp-text-primary, #1e293b);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ledger-sub {
  font-size: 0.68rem; color: var(--erp-text-muted, #94a3b8); margin-top: 1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ledger-delta {
  font-size: 0.85rem; font-weight: 800; flex-shrink: 0;
  min-width: 36px; text-align: right;
}

// ─── Notification Rows ───────────────────────────────────────────────────────
.notif-list {
  background: #fff;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.notif-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px 14px; cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.1s;
  -webkit-tap-highlight-color: transparent;
  &:last-of-type { border-bottom: none; }
  &:active { background: #f8fafc; }
  &--unread { background: #fefce8; }
}
.notif-icon-dot {
  width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  &.nd--red   { background: #fee2e2; color: #dc2626; }
  &.nd--blue  { background: #dbeafe; color: #2563eb; }
  &.nd--amber { background: #fef3c7; color: #d97706; }
  &.nd--green { background: #dcfce7; color: #16a34a; }
  &.nd--grey  { background: #f1f5f9; color: #94a3b8; }
}
.notif-body { flex: 1; min-width: 0; }
.notif-title {
  font-size: 0.8rem; font-weight: 600; color: var(--erp-text-primary, #1e293b);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notif-sub {
  font-size: 0.68rem; color: var(--erp-text-muted, #94a3b8); margin-top: 2px;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.notif-time {
  font-size: 0.6rem; font-weight: 500; color: var(--erp-text-muted, #94a3b8);
  flex-shrink: 0; padding-top: 2px;
}

.view-all-btn {
  width: 100%; display: flex; align-items: center; justify-content: center;
  padding: 10px; background: none; border: none; cursor: pointer;
  font-size: 0.72rem; font-weight: 600; color: #ea580c;
  letter-spacing: 0.3px;
  -webkit-tap-highlight-color: transparent;
  &:active { opacity: 0.7; }
}

// ─── Log Out ─────────────────────────────────────────────────────────────────
.logout-btn {
  width: 100%; height: 50px;
  display: flex; align-items: center; justify-content: center;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  color: #dc2626; font-size: 14px; font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.12s, transform 0.1s;
  &:active { background: #fee2e2; transform: scale(0.98); }
}
</style>
