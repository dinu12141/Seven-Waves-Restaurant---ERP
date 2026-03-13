<template>
  <q-layout view="hHh lpR fFf" class="waiter-app-layout">

    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="waiter-top-bar">
      <q-toolbar class="waiter-toolbar">
        <!-- Brand -->
        <q-icon name="restaurant" size="20px" color="orange-5" />
        <div class="waiter-brand q-ml-sm">
          <span class="brand-name">Seven Waves</span>
          <span class="brand-tag">WAITER</span>
        </div>
        <q-space />

        <!-- Shift chip -->
        <template v-if="isAdminOrManager">
          <q-chip dense color="purple-9" text-color="white" icon="admin_panel_settings" class="shift-chip">
            Admin View
          </q-chip>
        </template>
        <template v-else>
          <q-chip
            v-if="store.isOnShift"
            dense color="green-9" text-color="white" icon="schedule" class="shift-chip"
          >
            {{ store.shiftInfo?.shift_name || 'On Shift' }}
          </q-chip>
          <q-chip v-else dense color="red-9" text-color="white" icon="event_busy" class="shift-chip">
            Off Shift
          </q-chip>
        </template>

        <!-- Notification Bell -->
        <q-btn flat round dense icon="notifications" color="grey-4" class="q-ml-sm" to="/waiter-app/notifs">
          <q-badge v-if="store.unreadNotifCount > 0" color="red" floating rounded>
            {{ store.unreadNotifCount > 9 ? '9+' : store.unreadNotifCount }}
          </q-badge>
        </q-btn>

        <!-- User avatar + logout menu -->
        <q-btn flat round dense class="q-ml-xs top-avatar-btn">
          <div class="top-avatar">
            {{ initials(store.profile?.display_name || authStore.userDisplayName) }}
          </div>
          <q-menu anchor="bottom right" self="top right" :offset="[0, 6]" class="waiter-user-menu">
            <!-- Identity -->
            <div class="wum-header">
              <div class="top-avatar top-avatar--lg">
                {{ initials(store.profile?.display_name || authStore.userDisplayName) }}
              </div>
              <div class="wum-info">
                <div class="wum-name">{{ store.profile?.display_name || authStore.userDisplayName }}</div>
                <div class="wum-code" v-if="store.profile?.waiter_code">
                  {{ store.profile.waiter_code }}
                </div>
              </div>
            </div>
            <q-separator dark />
            <!-- Sign out -->
            <q-item clickable v-close-popup class="wum-item wum-item--danger" @click="logout">
              <q-item-section avatar><q-icon name="logout" size="16px" /></q-item-section>
              <q-item-section>Sign Out</q-item-section>
            </q-item>
          </q-menu>
        </q-btn>

      </q-toolbar>
    </q-header>

    <!-- ── Admin Waiter Selector ──────────────────────────────────────────── -->
    <div v-if="isAdminOrManager" class="waiter-selector-bar">
      <q-icon name="swap_horiz" size="16px" color="purple-4" class="q-mr-sm" />
      <span class="selector-label">View as:</span>
      <q-btn-dropdown
        flat dense no-caps
        class="selector-dropdown"
        :label="store.profile?.display_name || 'Select Waiter'"
        icon="person"
        color="purple-3"
        dropdown-icon="expand_more"
      >
        <q-list dark class="waiter-selector-list">
          <!-- Reset to admin's own view -->
          <q-item
            clickable v-close-popup
            class="selector-item selector-item--reset"
            @click="store.initializeAs(null)"
          >
            <q-item-section avatar>
              <q-icon name="admin_panel_settings" color="purple-4" size="18px" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-purple-3">Admin View (Own)</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator dark />

          <!-- Waiter list -->
          <q-item
            v-for="w in store.allWaiters"
            :key="w.id"
            clickable v-close-popup
            class="selector-item"
            :class="{ 'selector-item--active': store.profile?.id === w.id }"
            @click="store.initializeAs(w.id)"
          >
            <q-item-section avatar>
              <div class="selector-avatar">
                {{ initials(w.display_name) }}
              </div>
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-white">{{ w.display_name }}</q-item-label>
              <q-item-label caption class="text-grey-5">{{ w.waiter_code }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>

    <!-- ── Off-Shift Banner (waiter only, not admin/manager) ─────────────── -->
    <div
      v-if="!isAdminOrManager && !store.isOnShift && !store.loading"
      class="off-shift-banner"
    >
      <q-icon name="event_busy" size="16px" class="q-mr-xs" />
      <span class="text-weight-bold">Off Shift</span>
      <span class="q-ml-sm">— You are not assigned to a shift today. Contact your manager.</span>
    </div>

    <!-- ── Page Content ──────────────────────────────────────────────────── -->
    <q-page-container class="waiter-page-container">
      <router-view v-slot="{ Component }">
        <transition name="tab-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </q-page-container>

    <!-- ── Bottom Navigation ─────────────────────────────────────────────── -->
    <q-footer class="waiter-bottom-nav">
      <div class="bottom-nav-bar">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          custom
          v-slot="{ isActive, navigate }"
        >
          <button
            class="nav-tab"
            :class="{ 'nav-tab--active': isActive }"
            @click="navigate"
          >
            <div class="nav-tab__icon-wrap">
              <q-icon :name="tab.icon" size="22px" />
              <q-badge
                v-if="tab.badge && tab.badge.value > 0"
                color="red"
                floating
                rounded
                class="nav-badge"
              >
                {{ tab.badge.value > 9 ? '9+' : tab.badge.value }}
              </q-badge>
            </div>
            <span class="nav-tab__label">{{ tab.label }}</span>
          </button>
        </router-link>
      </div>
    </q-footer>

  </q-layout>
</template>

<script setup>
import { computed, onMounted, onUnmounted, provide } from 'vue'
import { useRouter } from 'vue-router'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useAuthStore } from 'stores/auth'
import { supabase } from 'src/boot/supabase'

const store = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const authStore = useAuthStore()
const router = useRouter()

// ── Auth guard ────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Check session — redirect to login if unauthenticated
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    router.replace('/auth/login')
    return
  }
  // Ensure authStore is FULLY populated (branches, roles) before store.initialize().
  // This prevents a race condition where loadPendingOrders() fires before currentBranch is set.
  if (!authStore.initialized || !authStore.branches.length) {
    await authStore.fetchUserData()
  }
  await store.initialize()
})
onUnmounted(() => store.cleanup())

function initials(name) {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

async function logout() {
  try {
    store.cleanup()
    await supabase.auth.signOut()
  } finally {
    // Full page reload — clears all pinia state and redirects to login
    window.location.href = '/#/auth/login'
  }
}

// ── Admin / Manager bypass ───────────────────────────────────────────────────
const isAdminOrManager = computed(() =>
  authStore.roles.includes('admin') || authStore.roles.includes('manager')
)
const isEffectivelyOnShift = computed(() => isAdminOrManager.value || store.isOnShift)
provide('isEffectivelyOnShift', isEffectivelyOnShift)
provide('isAdminOrManager', isAdminOrManager)

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home',    icon: 'home',                 to: '/waiter-app' },
  { label: 'Inbox',   icon: 'move_to_inbox',        to: '/waiter-app/inbox',   badge: { value: store.pendingCount } },
  { label: 'Orders',  icon: 'assignment_ind',       to: '/waiter-app/orders',  badge: { value: store.myOrderCount } },
  { label: 'Alerts',  icon: 'notifications_active', to: '/waiter-app/alerts',  badge: { value: store.readyCount + orderStore.newOrderAlertCount } },
  { label: 'Profile', icon: 'person',               to: '/waiter-app/profile' },
])
</script>

<style lang="scss" scoped>
// ─── Layout ──────────────────────────────────────────────────────────────────
.waiter-app-layout {
  background: #090c14;
  // No max-width — takes full screen as a standalone route
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.waiter-top-bar {
  background: rgba(10, 14, 22, 0.97) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow: none !important;
}

.waiter-toolbar {
  height: 52px;
  min-height: 52px;
  padding: 0 14px;
}

.waiter-brand {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: #e5e7eb;
  letter-spacing: -0.2px;
}

.brand-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #f97316;
  background: rgba(249, 115, 22, 0.12);
  border: 1px solid rgba(249, 115, 22, 0.25);
  border-radius: 4px;
  padding: 1px 5px;
  text-transform: uppercase;
}

.shift-chip {
  font-size: 10px !important;
  font-weight: 600 !important;
  height: 22px !important;
}

// ─── Top-bar Avatar Button ───────────────────────────────────────────────────
.top-avatar-btn {
  padding: 0 !important;
  min-width: 34px !important;
  min-height: 34px !important;
  border-radius: 50% !important;
}

.top-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; letter-spacing: 0.3px;
  &--lg {
    width: 40px; height: 40px; font-size: 14px;
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.waiter-user-menu) {
  background: #111827 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  overflow: hidden;
  min-width: 200px;
}

.wum-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px 12px;
}
.wum-info { flex: 1; min-width: 0; }
.wum-name {
  font-size: 13px; font-weight: 700; color: #f3f4f6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.wum-code {
  font-size: 11px; color: #6b7280; margin-top: 2px; font-weight: 500;
}
.wum-item {
  min-height: 44px !important;
  font-size: 13px !important;
  color: #e5e7eb !important;
  padding: 0 16px !important;
  gap: 10px;
  &--danger {
    color: #f87171 !important;
    :deep(.q-icon) { color: #f87171 !important; }
    &:hover { background: rgba(239, 68, 68, 0.08) !important; }
  }
}

// ─── Admin Waiter Selector Bar ───────────────────────────────────────────────
.waiter-selector-bar {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  background: rgba(127, 86, 217, 0.06);
  border-bottom: 1px solid rgba(127, 86, 217, 0.15);
  min-height: 38px;
}
.selector-label {
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  margin-right: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.selector-dropdown {
  font-size: 13px !important;
  font-weight: 600 !important;
  :deep(.q-btn__content) { gap: 6px; }
}
:deep(.waiter-selector-list) {
  background: #111827 !important;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  min-width: 220px;
  max-height: 360px;
  overflow-y: auto;
}
.selector-item {
  min-height: 48px !important;
  padding: 6px 14px !important;
  &--active { background: rgba(127, 86, 217, 0.1) !important; }
  &--reset { border-bottom: 1px solid rgba(255,255,255, 0.04); }
  &:hover { background: rgba(255, 255, 255, 0.04) !important; }
}
.selector-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

// ─── Off-Shift Banner ────────────────────────────────────────────────────────
.off-shift-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: rgba(239, 68, 68, 0.08);
  border-bottom: 1px solid rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  font-size: 0.78rem;
  padding: 10px 16px;
  min-height: 40px;
}

// ─── Page Container ──────────────────────────────────────────────────────────
.waiter-page-container {
  padding-bottom: 64px !important; // space for bottom nav
  min-height: calc(100vh - 52px - 64px);
}

// ─── Bottom Navigation ───────────────────────────────────────────────────────
.waiter-bottom-nav {
  background: transparent !important;
  border-top: none !important;
}

.bottom-nav-bar {
  display: flex;
  align-items: stretch;
  height: 64px;
  background: rgba(10, 14, 22, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  padding-bottom: env(safe-area-inset-bottom);
}

.nav-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: none;
  border: none;
  outline: none;
  cursor: pointer;
  color: #6b7280;
  transition: color 0.15s ease;
  position: relative;
  -webkit-tap-highlight-color: transparent;

  &__icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 28px;
  }

  &__label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.2px;
    line-height: 1;
  }

  &--active {
    color: #f97316;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 2px;
      background: #f97316;
      border-radius: 0 0 3px 3px;
    }
  }

  &:active {
    opacity: 0.7;
  }
}

.nav-badge {
  font-size: 8px !important;
  min-width: 14px !important;
  height: 14px !important;
  padding: 0 3px !important;
  top: -2px !important;
  right: -4px !important;
}

// ─── Page Transition ─────────────────────────────────────────────────────────
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>
