<template>
  <q-layout view="hHh lpR fFf" class="waiter-app-layout">
    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="waiter-top-bar">
      <q-toolbar class="waiter-toolbar">
        <!-- Brand Logo -->
        <img
          src="~assets/seven-waves-logo-transparent.png"
          alt="Seven Waves"
          class="waiter-logo"
        /><span class="brand-tag q-ml-sm">WAITER</span>
        <q-space />

        <!-- Shift chip -->
        <template v-if="isAdminOrManager">
          <q-chip
            dense
            color="purple-9"
            text-color="white"
            icon="admin_panel_settings"
            class="shift-chip"
          >
            Admin View
          </q-chip>
        </template>
        <template v-else>
          <q-chip
            v-if="store.isOnShift"
            dense
            color="green-9"
            text-color="white"
            icon="schedule"
            class="shift-chip"
          >
            {{ store.shiftInfo?.shift_name || 'On Shift' }}
          </q-chip>
          <q-chip
            v-else
            dense
            color="red-9"
            text-color="white"
            icon="event_busy"
            class="shift-chip"
          >
            Off Shift
          </q-chip>
        </template>

        <!-- Theme Toggle -->
        <q-btn
          flat
          round
          dense
          :icon="uiStore.themeIcon"
          class="q-ml-sm theme-toggle-btn"
          @click="uiStore.toggleDarkMode($q)"
        >
          <q-tooltip>{{ uiStore.themeLabel }}</q-tooltip>
        </q-btn>

        <!-- Notification Bell (unified alerts + notifs hub) -->
        <q-btn
          flat
          round
          dense
          icon="notifications"
          :color="totalAlertCount > 0 ? 'orange-8' : pushSubscribed ? 'orange-6' : 'grey-7'"
          class="q-ml-sm"
          to="/waiter-app/notifs"
        >
          <q-badge
            v-if="totalAlertCount > 0"
            color="red"
            floating
            rounded
          >
            {{ totalAlertCount > 9 ? '9+' : totalAlertCount }}
          </q-badge>
          <q-tooltip v-if="!pushSubscribed">Enable push notifications</q-tooltip>
        </q-btn>

        <!-- Push enable button (if not subscribed) -->
        <q-btn
          v-if="!pushSubscribed && pushPermission !== 'denied'"
          flat round dense
          icon="notifications_off"
          color="grey-5"
          class="q-ml-xs"
          @click="requestPushPermission"
        >
          <q-tooltip>Tap to enable push alerts</q-tooltip>
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
                <div class="wum-name">
                  {{ store.profile?.display_name || authStore.userDisplayName }}
                </div>
                <div class="wum-code" v-if="store.profile?.waiter_code">
                  {{ store.profile.waiter_code }}
                </div>
              </div>
            </div>
            <q-separator />
            <!-- Theme Toggle -->
            <q-item clickable v-close-popup class="wum-item" @click="uiStore.toggleDarkMode($q)">
              <q-item-section avatar
                ><q-icon :name="uiStore.themeIcon" size="16px"
              /></q-item-section>
              <q-item-section>{{ uiStore.themeLabel }}</q-item-section>
            </q-item>
            <q-separator />
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
      <q-icon name="swap_horiz" size="16px" color="purple-7" class="q-mr-sm" />
      <span class="selector-label">View as:</span>
      <q-btn-dropdown
        flat
        dense
        no-caps
        class="selector-dropdown"
        :label="store.profile?.display_name || 'Select Waiter'"
        icon="person"
        color="purple-7"
        dropdown-icon="expand_more"
      >
        <q-list class="waiter-selector-list">
          <!-- Reset to admin's own view -->
          <q-item
            clickable
            v-close-popup
            class="selector-item selector-item--reset"
            @click="store.initializeAs(null)"
          >
            <q-item-section avatar>
              <q-icon name="admin_panel_settings" color="purple-7" size="18px" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-purple-8">Admin View (Own)</q-item-label>
            </q-item-section>
          </q-item>

          <q-separator />

          <!-- Waiter list -->
          <q-item
            v-for="w in store.allWaiters"
            :key="w.id"
            clickable
            v-close-popup
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
              <q-item-label>{{ w.display_name }}</q-item-label>
              <q-item-label caption class="text-grey-7">{{ w.waiter_code }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-btn-dropdown>
    </div>

    <!-- ── Off-Shift Banner (waiter only, not admin/manager) ─────────────── -->
    <div v-if="!isAdminOrManager && !store.isOnShift && !store.loading" class="off-shift-banner">
      <q-icon name="event_busy" size="16px" class="q-mr-xs" />
      <span class="text-weight-bold">Off Shift</span>
      <span class="q-ml-sm">— You are not assigned to a shift today. Contact your manager.</span>
    </div>

    <!-- ── PWA Install Banner ────────────────────────────────────────────── -->
    <transition name="banner-slide">
      <div v-if="showInstallBanner" class="pwa-install-banner">
        <q-icon name="install_mobile" size="18px" class="q-mr-sm" />
        <span class="pwa-banner-text">Install the Waiter App for a better experience!</span>
        <q-btn flat dense no-caps size="sm" color="orange-8" label="Install" class="q-ml-auto" @click="installPwa" />
        <q-btn flat round dense icon="close" size="xs" color="grey-6" class="q-ml-xs" @click="showInstallBanner = false" />
      </div>
    </transition>

    <!-- ── Push Permission Banner ─────────────────────────────────────────── -->
    <transition name="banner-slide">
      <div
        v-if="!pushSubscribed && pushPermission === 'default' && store.isOnShift"
        class="push-prompt-banner"
      >
        <q-icon name="notifications_active" size="18px" class="q-mr-sm" color="orange-8" />
        <span class="push-banner-text">Enable push alerts for new orders!</span>
        <q-btn
          flat dense no-caps size="sm"
          color="orange-8"
          label="Enable"
          class="q-ml-auto"
          @click="requestPushPermission"
        />
      </div>
    </transition>

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
          <button class="nav-tab" :class="{ 'nav-tab--active': isActive }" @click="navigate">
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
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar, Notify } from 'quasar'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import { supabase } from 'src/boot/supabase'
import { useWaiterPush } from 'src/composables/useWaiterPush'

const store = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const $q = useQuasar()
const router = useRouter()
const { pushPermission, pushSubscribed, subscribePush, checkExistingSubscription } = useWaiterPush()

// PWA install prompt
const deferredInstallPrompt = ref(null)
const showInstallBanner = ref(false)

// Detect if running as installed PWA
const isPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

// ── Auth guard + push setup ───────────────────────────────────────────────────
onMounted(async () => {
  // Check session — redirect to login if unauthenticated
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    router.replace('/auth/login')
    return
  }
  // Ensure authStore is FULLY populated (branches, roles) before store.initialize().
  if (!authStore.initialized || !authStore.branches.length) {
    await authStore.fetchUserData()
  }
  await store.initialize()

  // Check existing push subscription
  await checkExistingSubscription()

  // Auto-prompt for push permission after 6 seconds if not yet subscribed
  if (!pushSubscribed.value && Notification.permission === 'default') {
    setTimeout(() => {
      if (!pushSubscribed.value) {
        requestPushPermission()
      }
    }, 6000)
  }

  // PWA install prompt listener
  window.addEventListener('beforeinstallprompt', handleInstallPrompt)
})
onUnmounted(() => {
  store.cleanup()
  if (removeShiftGuard) removeShiftGuard()
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
})

function handleInstallPrompt(e) {
  e.preventDefault()
  deferredInstallPrompt.value = e
  if (!isPwa) showInstallBanner.value = true
}

async function installPwa() {
  if (!deferredInstallPrompt.value) return
  deferredInstallPrompt.value.prompt()
  const { outcome } = await deferredInstallPrompt.value.userChoice
  if (outcome === 'accepted') {
    showInstallBanner.value = false
    Notify.create({ type: 'positive', message: '✅ App installed! Open it from your home screen.', position: 'top', timeout: 4000 })
  }
  deferredInstallPrompt.value = null
}

async function requestPushPermission() {
  const userId = authStore.user?.id
  if (!userId) return
  const result = await subscribePush(userId)
  if (result.success) {
    Notify.create({
      type: 'positive',
      icon: 'notifications_active',
      message: '🔔 Push notifications enabled!',
      caption: 'You will be alerted for new orders and kitchen updates.',
      position: 'top',
      timeout: 4000,
    })
  }
}

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
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
const isAdminOrManager = computed(
  () => authStore.roles.includes('admin') || authStore.roles.includes('manager'),
)
const isEffectivelyOnShift = computed(() => isAdminOrManager.value || store.isOnShift)
provide('isEffectivelyOnShift', isEffectivelyOnShift)
provide('isAdminOrManager', isAdminOrManager)

// ── Unified alert count for the top bell badge ─────────────────────────────────
// Combines: kitchen ready alerts + new order alerts + unread general notifications
const totalAlertCount = computed(
  () =>
    store.readyCount +
    orderStore.newOrderAlertCount +
    store.unreadNotifCount,
)

// ── Off-shift route guard ────────────────────────────────────────────────────
// Block off-shift waiters from accessing functional pages

const removeShiftGuard = router.beforeEach((to, from, next) => {
  // Only guard waiter-app routes
  if (!to.path.startsWith('/waiter-app')) return next()
  // Allow home and profile always
  if (
    to.path === '/waiter-app' ||
    to.path === '/waiter-app/profile' ||
    to.path === '/waiter-app/notifs'
  )
    return next()
  // Admin/manager bypass
  if (isAdminOrManager.value) return next()
  // If not on shift, block
  if (!store.isOnShift && !store.loading) {
    Notify.create({
      type: 'warning',
      icon: 'lock',
      message: 'You are off shift',
      caption: 'You cannot access this feature while off shift.',
      position: 'top',
      timeout: 3000,
    })
    return next('/waiter-app')
  }
  next()
})

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home', icon: 'home', to: '/waiter-app' },
  { label: 'POS', icon: 'point_of_sale', to: '/waiter-app/pos' },
  { label: 'Tables', icon: 'table_restaurant', to: '/waiter-app/tables' },
  {
    label: 'Inbox',
    icon: 'move_to_inbox',
    to: '/waiter-app/inbox',
    badge: { value: store.pendingCount },
  },
  {
    label: 'Orders',
    icon: 'assignment_ind',
    to: '/waiter-app/orders',
    badge: { value: store.myOrderCount },
  },
])
</script>

<style lang="scss" scoped>
// ─── Layout ──────────────────────────────────────────────────────────────────
.waiter-app-layout {
  background: var(--erp-bg-page, #f1f5f9);
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.waiter-top-bar {
  background: #fff !important;
  border-bottom: 1px solid var(--erp-border, #e2e8f0) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06) !important;
}

.waiter-toolbar {
  height: 52px;
  min-height: 52px;
  padding: 0 14px;
}

// ─── Logo ───────────────────────────────────────────────────────────────────
.waiter-logo {
  height: 34px;
  width: auto;
  object-fit: contain;
  display: block;
}

.waiter-brand {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--erp-text-primary, #1e293b);
  letter-spacing: -0.2px;
}

.brand-tag {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #ea580c;
  background: rgba(234, 88, 12, 0.1);
  border: 1px solid rgba(234, 88, 12, 0.25);
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
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  &--lg {
    width: 40px;
    height: 40px;
    font-size: 14px;
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.waiter-user-menu) {
  background: #fff !important;
  border: 1px solid var(--erp-border, #e2e8f0) !important;
  border-radius: 12px !important;
  overflow: hidden;
  min-width: 200px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
}

.wum-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 12px;
}
.wum-info {
  flex: 1;
  min-width: 0;
}
.wum-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--erp-text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wum-code {
  font-size: 11px;
  color: var(--erp-text-muted, #94a3b8);
  margin-top: 2px;
  font-weight: 500;
}
.wum-item {
  min-height: 44px !important;
  font-size: 13px !important;
  color: var(--erp-text-primary, #1e293b) !important;
  padding: 0 16px !important;
  gap: 10px;
  &--danger {
    color: #dc2626 !important;
    :deep(.q-icon) {
      color: #dc2626 !important;
    }
    &:hover {
      background: rgba(239, 68, 68, 0.06) !important;
    }
  }
}

// ─── Admin Waiter Selector Bar ───────────────────────────────────────────────
.waiter-selector-bar {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  background: rgba(127, 86, 217, 0.05);
  border-bottom: 1px solid rgba(127, 86, 217, 0.12);
  min-height: 38px;
}
.selector-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin-right: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.selector-dropdown {
  font-size: 13px !important;
  font-weight: 600 !important;
  :deep(.q-btn__content) {
    gap: 6px;
  }
}
:deep(.waiter-selector-list) {
  background: #fff !important;
  border: 1px solid var(--erp-border, #e2e8f0);
  border-radius: 10px;
  min-width: 220px;
  max-height: 360px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}
.selector-item {
  min-height: 48px !important;
  padding: 6px 14px !important;
  &--active {
    background: rgba(127, 86, 217, 0.08) !important;
  }
  &--reset {
    border-bottom: 1px solid var(--erp-border, #e2e8f0);
  }
  &:hover {
    background: rgba(0, 0, 0, 0.03) !important;
  }
}
.selector-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

// ─── Off-Shift Banner ────────────────────────────────────────────────────────
.off-shift-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: rgba(239, 68, 68, 0.06);
  border-bottom: 1px solid rgba(239, 68, 68, 0.15);
  color: #dc2626;
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
  background: #fff;
  border-top: 1px solid var(--erp-border, #e2e8f0);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.04);
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
  color: #94a3b8;
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
    color: #ea580c;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 2px;
      background: #ea580c;
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

// ─── PWA Install Banner ───────────────────────────────────────────────────────
.pwa-install-banner {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: linear-gradient(90deg, rgba(234,88,12,0.08), rgba(251,191,36,0.06));
  border-bottom: 1px solid rgba(234, 88, 12, 0.2);
  color: #ea580c;
  font-size: 0.75rem;
  font-weight: 600;
  min-height: 38px;
  gap: 4px;
}

.pwa-banner-text {
  flex: 1;
  font-size: 0.72rem;
  color: #9a3412;
}

// ─── Push Permission Banner ───────────────────────────────────────────────────
.push-prompt-banner {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: linear-gradient(90deg, rgba(234,88,12,0.06), rgba(251,191,36,0.04));
  border-bottom: 1px solid rgba(234, 88, 12, 0.15);
  min-height: 38px;
  gap: 4px;
}

.push-banner-text {
  flex: 1;
  font-size: 0.72rem;
  font-weight: 600;
  color: #9a3412;
}

// ─── Banner Slide Animation ───────────────────────────────────────────────────
.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}
.banner-slide-enter-from,
.banner-slide-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.banner-slide-enter-to,
.banner-slide-leave-from {
  max-height: 60px;
  opacity: 1;
}

// ─── Mobile Safe Area Support ─────────────────────────────────────────────────
// Ensure content doesn't go behind notch or home indicator
.waiter-page-container {
  padding-bottom: calc(64px + env(safe-area-inset-bottom)) !important;
  padding-top: env(safe-area-inset-top);
}

.waiter-top-bar {
  padding-top: env(safe-area-inset-top) !important;
}

.waiter-toolbar {
  height: calc(52px + env(safe-area-inset-top));
  min-height: calc(52px + env(safe-area-inset-top));
  padding-top: env(safe-area-inset-top);
  padding-left: max(14px, env(safe-area-inset-left));
  padding-right: max(14px, env(safe-area-inset-right));
}

.bottom-nav-bar {
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

</style>
