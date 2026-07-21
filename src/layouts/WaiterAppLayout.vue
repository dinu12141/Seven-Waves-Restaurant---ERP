<template>
  <q-layout view="hHh lpR fFf" class="waiter-app-layout mobile-app-shell">
    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="waiter-top-bar mobile-top-bar">
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
          color="grey-7"
          :icon="uiStore.themeIcon"
          class="q-ml-sm theme-toggle-btn"
          @click="uiStore.toggleDarkMode($q)"
        >
          <q-tooltip>{{ uiStore.themeLabel }}</q-tooltip>
        </q-btn>

        <!-- Real-time Sound Toggle -->
        <q-btn
          flat
          round
          dense
          :icon="store.soundEnabled ? 'notifications_active' : 'notifications_off'"
          :color="store.soundEnabled ? 'orange-8' : 'grey-7'"
          class="q-ml-sm sound-toggle-btn"
          @click="store.toggleSound"
        >
          <q-badge
            v-if="totalAlertCount > 0"
            color="red"
            floating
            rounded
          >
            {{ totalAlertCount > 9 ? '9+' : totalAlertCount }}
          </q-badge>
          <q-tooltip>{{ store.soundEnabled ? 'Alerts ON' : 'Alerts MUTED' }}</q-tooltip>
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

    <!-- ── New Order Alert Dialog ── -->
    <q-dialog v-model="showNewOrderAlert" position="top">
      <q-card class="order-alert-card">
        <q-card-section class="row items-center q-pb-none alert-header">
          <q-icon name="room_service" color="orange-9" size="28px" class="q-mr-sm alert-pulse-icon" />
          <div class="text-h6 text-orange-10">New Order Alert!</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <div class="alert-msg">You have <span class="text-weight-bolder">{{ orderStore.newOrderAlertCount }}</span> new customer order(s) waiting.</div>
        </q-card-section>

        <q-card-actions align="right" class="q-pb-sm q-pr-sm">
          <q-btn
            unelevated
            rounded
            color="orange-9"
            label="View Orders"
            to="/waiter-app/inbox"
            icon-right="arrow_forward"
            v-close-popup
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Page Content ──────────────────────────────────────────────────── -->
    <q-page-container>
      <router-view v-slot="{ Component }">
        <transition name="tab-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </q-page-container>

    <!-- Global Notification Toasts -->
    <NotificationToast />

    <!-- Global Offline Banner -->
    <OfflineBanner />

    <!-- ── Bottom Navigation ─────────────────────────────────────────────── -->
    <q-footer class="waiter-bottom-nav mobile-bottom-nav">
      <div class="bottom-nav-bar mobile-nav-bar">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          custom
          v-slot="{ isActive, isExactActive, navigate }"
        >
          <button class="nav-tab" :class="{ 'nav-tab--active': tab.exact ? isExactActive : isActive }" @click="navigate">
            <div class="nav-tab__icon-wrap">
              <q-icon :name="tab.icon" size="32px" />
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
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar, Notify } from 'quasar'
import { useWaiterAppStore } from 'src/stores/waiterAppStore'
import NotificationToast from 'components/common/NotificationToast.vue'
import OfflineBanner from 'components/common/OfflineBanner.vue'
import { useWaiterOrderStore } from 'src/stores/waiterOrderStore'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import { useWaiterPush } from 'src/composables/useWaiterPush'

const store = useWaiterAppStore()
const orderStore = useWaiterOrderStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const $q = useQuasar()
const router = useRouter()
const { checkExistingSubscription } = useWaiterPush()

// Real-time alerts
const showNewOrderAlert = ref(false)
watch(() => orderStore.newOrderAlertCount, (newVal, oldVal) => {
  if (newVal > oldVal) {
    showNewOrderAlert.value = true
  }
})

// PWA install prompt
const deferredInstallPrompt = ref(null)
const showInstallBanner = ref(false)

// Detect if running as installed PWA
const isPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone

// ── Auth guard + push setup ───────────────────────────────────────────────────
onMounted(async () => {
  // Mark body for mobile app scroll prevention
  document.body.classList.add('mobile-app-active')

  // Check session — redirect to login if unauthenticated
  if (!authStore.isAuthenticated) {
    router.replace('/auth/login')
    return
  }

  // Ensure authStore has branches
  if (!authStore.branches.length) {
    await authStore.fetchUserData()
  }

  // Prime audio on first user touch (to unlock AudioContext on iOS/Android)
  const primeAudioOnce = () => {
    store.primeAudio()
    document.removeEventListener('click', primeAudioOnce)
    document.removeEventListener('touchstart', primeAudioOnce)
  }
  document.addEventListener('click', primeAudioOnce)
  document.addEventListener('touchstart', primeAudioOnce)

  // Initialize waiter app store (skip if already loaded — prevents re-fetch on hot nav)
  if (!store.profile) {
    await store.initialize()
  }

  // Check existing push subscription (non-blocking)
  checkExistingSubscription().catch(() => {})

  // PWA install prompt listener
  window.addEventListener('beforeinstallprompt', handleInstallPrompt)
})
onUnmounted(() => {
  document.body.classList.remove('mobile-app-active')
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

function initials(name) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
}

function logout() {
  store.cleanup()
  authStore.signOut()
  // Use router.push for instant SPA navigation — no full page reload
  router.push('/auth/login')
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

const removeShiftGuard = router.beforeEach((to) => {
  // Only guard waiter-app routes
  if (!to.path.startsWith('/waiter-app')) return true
  // Allow home and profile always
  if (
    to.path === '/waiter-app' ||
    to.path === '/waiter-app/profile' ||
    to.path === '/waiter-app/notifs'
  )
    return true
  // Admin/manager bypass
  if (isAdminOrManager.value) return true
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
    return '/waiter-app'
  }
  return true
})

onUnmounted(() => {
  if (removeShiftGuard) {
    removeShiftGuard()
  }
})

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home', icon: 'home', to: '/waiter-app', exact: true },
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
  font-size: 15px;
  :deep(.q-page) { font-size: 15px; }
  :deep(.q-btn) { font-size: 13px !important; }
  :deep(.q-chip) { font-size: 12px !important; }
  :deep(.text-caption) { font-size: 13px !important; }
  :deep(.q-item__label) { font-size: 14px !important; }
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.waiter-top-bar {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%) !important;
  border-bottom: none !important;
  box-shadow: 0 4px 24px rgba(30, 27, 75, 0.45) !important;
}

// ─── Logo ────────────────────────────────────────────────────────────────────
.waiter-logo {
  height: 34px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1);
}

.waiter-brand {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.2px;
}

.brand-tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #ea580c);
  border: none;
  border-radius: 20px;
  padding: 3px 9px;
  text-transform: uppercase;
  box-shadow: 0 0 14px rgba(249, 115, 22, 0.6), 0 2px 6px rgba(249, 115, 22, 0.35);
}

// ─── Shift Chips ─────────────────────────────────────────────────────────────
.shift-chip {
  font-size: 12px !important;
  font-weight: 600 !important;
  height: 26px !important;
  border-radius: 20px !important;

  &.bg-green-9 {
    background: linear-gradient(135deg, #22c55e, #16a34a) !important;
    box-shadow: 0 0 14px rgba(34, 197, 94, 0.5), 0 2px 8px rgba(34, 197, 94, 0.3) !important;
  }
  &.bg-red-9 {
    background: linear-gradient(135deg, #ef4444, #dc2626) !important;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.45) !important;
  }
  &.bg-purple-9 {
    background: linear-gradient(135deg, #a855f7, #7c3aed) !important;
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.45) !important;
  }
}

// ─── Sound Toggle Button ──────────────────────────────────────────────────────
.sound-toggle-btn {
  transition: background 0.2s ease, box-shadow 0.2s ease !important;
  :deep(.q-icon) {
    color: rgba(255, 255, 255, 0.75) !important;
    transition: color 0.2s ease;
  }
  &.text-orange-8 {
    background: linear-gradient(135deg, #f97316, #ea580c) !important;
    border-radius: 50% !important;
    box-shadow: 0 0 16px rgba(249, 115, 22, 0.6), 0 0 6px rgba(249, 115, 22, 0.3) !important;
    :deep(.q-icon) { color: #fff !important; }
  }
  &.text-grey-7 {
    :deep(.q-icon) { color: rgba(255, 255, 255, 0.5) !important; }
  }
}

// ─── Theme Toggle Button ──────────────────────────────────────────────────────
.theme-toggle-btn {
  :deep(.q-icon) { color: rgba(255, 255, 255, 0.8) !important; }
}

// ─── Top-bar Avatar Button ────────────────────────────────────────────────────
.top-avatar-btn {
  padding: 0 !important;
  min-width: 36px !important;
  min-height: 36px !important;
  border-radius: 50% !important;
}

.top-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.35);
  &--lg {
    width: 44px;
    height: 44px;
    font-size: 15px;
    border: 2px solid rgba(249, 115, 22, 0.3);
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.waiter-user-menu) {
  background: rgba(255, 255, 255, 0.97) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
  border-radius: 20px !important;
  overflow: hidden;
  min-width: 220px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18), 0 6px 18px rgba(0, 0, 0, 0.08) !important;
}

.wum-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 14px;
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.07), rgba(239, 68, 68, 0.04));
}
.wum-info {
  flex: 1;
  min-width: 0;
}
.wum-name {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wum-code {
  font-size: 11px;
  font-weight: 600;
  color: #ea580c;
  background: rgba(249, 115, 22, 0.1);
  border-radius: 6px;
  padding: 1px 6px;
  display: inline-block;
  margin-top: 3px;
}
.wum-item {
  min-height: 46px !important;
  font-size: 13px !important;
  color: #1e293b !important;
  padding: 0 16px !important;
  gap: 10px;
  transition: background 0.15s ease;
  &:hover {
    background: rgba(249, 115, 22, 0.06) !important;
  }
  &--danger {
    color: #dc2626 !important;
    :deep(.q-icon) { color: #dc2626 !important; }
    &:hover { background: rgba(239, 68, 68, 0.06) !important; }
  }
}

// ─── Admin Waiter Selector Bar ────────────────────────────────────────────────
.waiter-selector-bar {
  display: flex;
  align-items: center;
  padding: 7px 14px;
  background: linear-gradient(90deg, rgba(124, 58, 237, 0.09), rgba(139, 92, 246, 0.05));
  border-bottom: 1px solid rgba(124, 58, 237, 0.15);
  min-height: 40px;
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
  :deep(.q-btn__content) { gap: 6px; }
}
:deep(.waiter-selector-list) {
  background: rgba(255, 255, 255, 0.97) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 14px;
  min-width: 220px;
  max-height: 360px;
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}
.selector-item {
  min-height: 50px !important;
  padding: 6px 14px !important;
  transition: background 0.15s ease;
  &--active { background: rgba(124, 58, 237, 0.08) !important; }
  &--reset { border-bottom: 1px solid rgba(0, 0, 0, 0.06); }
  &:hover { background: rgba(249, 115, 22, 0.05) !important; }
}
.selector-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
}

// ─── Off-Shift Banner ────────────────────────────────────────────────────────
.off-shift-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  background: linear-gradient(90deg, #7f1d1d, #991b1b);
  border-bottom: none;
  color: #fff;
  font-size: 0.88rem;
  padding: 10px 16px;
  min-height: 42px;
  gap: 4px;
}

// ─── PWA Install Banner ───────────────────────────────────────────────────────
.pwa-install-banner {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  background: linear-gradient(90deg, #c2410c, #ea580c, #f97316);
  border-bottom: none;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  min-height: 40px;
  gap: 4px;
}

.pwa-banner-text {
  flex: 1;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.92);
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
  font-size: 0.82rem;
  font-weight: 600;
  color: #9a3412;
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────
.bottom-nav-bar {
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.09);
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
  min-height: 64px;
  padding: 8px 4px;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease;

  &__icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 34px;
    border-radius: 25px;
    transition: background 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
                box-shadow 0.2s ease,
                transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1;
    transition: color 0.2s ease;
  }

  &--active {
    color: #fff;

    &::before { display: none; }

    .nav-tab__icon-wrap {
      background: linear-gradient(135deg, #f97316, #ef4444);
      box-shadow: 0 4px 18px rgba(249, 115, 22, 0.45), 0 2px 6px rgba(239, 68, 68, 0.25);
      transform: translateY(-2px) scale(1.06);
    }

    .nav-tab__label {
      color: #ea580c;
    }
  }

  &:active {
    transform: scale(0.93);
  }
}

.nav-badge {
  font-size: 10px !important;
  min-width: 18px !important;
  height: 18px !important;
  padding: 0 4px !important;
  top: -6px !important;
  right: -6px !important;
}

// ─── Page Transition ──────────────────────────────────────────────────────────
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
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

// ─── New Order Alert Card ─────────────────────────────────────────────────────
.order-alert-card {
  width: 92%;
  max-width: 400px;
  border-radius: 24px !important;
  background: #fff;
  border: none;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(234, 88, 12, 0.28), 0 8px 24px rgba(0, 0, 0, 0.1) !important;
  margin-top: 12px;
}
.alert-header {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.08), rgba(239, 68, 68, 0.05));
  border-bottom: 1px solid rgba(249, 115, 22, 0.12);
  padding: 16px 16px 14px !important;
}
.alert-pulse-icon {
  animation: alertPulse 1.6s ease-in-out infinite;
}
@keyframes alertPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.18); opacity: 0.85; }
}
.alert-msg {
  font-size: 15px;
  color: #4b5563;
  line-height: 1.5;
}

</style>

<!-- ── GLOBAL (unscoped) styles for all waiter-app child pages ──── -->
<style lang="scss">
.waiter-app-layout {
  font-size: 15px !important;
  .q-page { font-size: 15px !important; }
  .q-btn { font-size: 13px !important; }
  .q-chip { font-size: 12px !important; height: 26px !important; }
  .text-caption { font-size: 13px !important; }
  .q-item__label { font-size: 14px !important; }
  .q-item__label--caption { font-size: 12px !important; }
  .q-notification__message { font-size: 14px !important; }
  .q-notification__caption { font-size: 12px !important; }
}

/* ── DARK MODE ────────────────────────────────────────────────────────────── */
body.body--dark {
  // Top Bar — dark indigo with purple tint
  .waiter-top-bar {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #1e1650 100%) !important;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.55) !important;
  }

  // Bottom Nav — deep slate
  .waiter-app-layout .bottom-nav-bar {
    background: #0f172a !important;
    border-top-color: rgba(255, 255, 255, 0.06) !important;
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35) !important;
  }
  .waiter-app-layout .nav-tab {
    color: #475569;
  }
  .waiter-app-layout .nav-tab--active {
    color: #fff;
    .nav-tab__label { color: #fb923c; }
    // pill keeps the same orange gradient in dark mode
    .nav-tab__icon-wrap {
      background: linear-gradient(135deg, #f97316, #ef4444) !important;
      box-shadow: 0 4px 18px rgba(249, 115, 22, 0.5) !important;
    }
  }

  // User Menu — glass dark
  .waiter-user-menu {
    background: rgba(15, 23, 42, 0.96) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    border-color: rgba(255, 255, 255, 0.08) !important;
  }
  .waiter-user-menu .wum-header {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(239, 68, 68, 0.06));
  }
  .waiter-user-menu .wum-name { color: #f1f5f9 !important; }
  .waiter-user-menu .wum-code {
    color: #fb923c !important;
    background: rgba(249, 115, 22, 0.15) !important;
  }
  .waiter-user-menu .wum-item { color: #e2e8f0 !important; }
  .waiter-user-menu .wum-item:hover { background: rgba(255, 255, 255, 0.05) !important; }
  .waiter-user-menu .wum-item--danger { color: #f87171 !important; }

  // Selector List — glass dark
  .waiter-selector-list {
    background: rgba(15, 23, 42, 0.97) !important;
    border-color: rgba(255, 255, 255, 0.08) !important;
  }
  .waiter-selector-list .q-item__label { color: #e2e8f0 !important; }
  .waiter-selector-list .q-item__label--caption { color: #94a3b8 !important; }
  .waiter-selector-list .selector-item:hover { background: rgba(255, 255, 255, 0.05) !important; }
  .waiter-selector-list .selector-item--reset { border-bottom-color: rgba(255, 255, 255, 0.07) !important; }
  .waiter-selector-list .selector-item--active { background: rgba(124, 58, 237, 0.12) !important; }

  // Admin Selector Bar
  .waiter-app-layout .waiter-selector-bar {
    background: linear-gradient(90deg, rgba(124, 58, 237, 0.12), rgba(139, 92, 246, 0.07));
    border-bottom-color: rgba(124, 58, 237, 0.22) !important;
  }

  // Alert Card
  .order-alert-card {
    background: #1e293b !important;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45), 0 8px 24px rgba(249, 115, 22, 0.2) !important;
  }
  .order-alert-card .alert-header {
    background: linear-gradient(135deg, rgba(249, 115, 22, 0.12), rgba(239, 68, 68, 0.07));
    border-bottom-color: rgba(249, 115, 22, 0.18) !important;
  }
  .alert-msg { color: #94a3b8 !important; }
}
</style>
