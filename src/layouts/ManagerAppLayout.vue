<template>
  <q-layout view="hHh lpR fFf" class="manager-app-layout mobile-app-shell" :class="{ 'manager-app-layout--light': !$q.dark.isActive }">
    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="manager-top-bar mobile-top-bar" :class="{ 'manager-top-bar--light': !$q.dark.isActive }">
      <q-toolbar class="manager-toolbar">
        <!-- Brand Logo -->
        <div class="manager-brand">
          <img
            src="~assets/seven-waves-logo-transparent.png"
            alt="Seven Waves"
            class="manager-logo"
          />
          <span class="brand-tag">MANAGER</span>
        </div>
        <q-space />

        <!-- Branch chip -->
        <q-chip dense class="branch-chip" icon="store">
          {{ authStore.currentBranch?.name || 'No Branch' }}
        </q-chip>

        <!-- Notification Bell -->
        <q-btn
          flat
          round
          dense
          icon="notifications"
          class="q-ml-sm toolbar-icon-btn"
          to="/manager-app/alerts"
        >
          <q-badge v-if="store.unreadAlertCount > 0" color="red" floating rounded>
            {{ store.unreadAlertCount > 9 ? '9+' : store.unreadAlertCount }}
          </q-badge>
        </q-btn>

        <!-- Messages -->
        <q-btn
          flat
          round
          dense
          icon="mail"
          class="q-ml-xs toolbar-icon-btn"
          to="/manager-app/messages"
        >
          <q-badge v-if="store.unreadMessageCount > 0" color="orange" floating rounded>
            {{ store.unreadMessageCount > 9 ? '9+' : store.unreadMessageCount }}
          </q-badge>
        </q-btn>

        <!-- Theme Toggle -->
        <q-btn
          flat
          round
          dense
          :icon="uiStore.themeIcon"
          class="q-ml-xs toolbar-icon-btn"
          @click="uiStore.toggleDarkMode($q)"
        >
          <q-tooltip>{{ uiStore.themeLabel }}</q-tooltip>
        </q-btn>

        <!-- User avatar + logout menu -->
        <q-btn flat round dense class="q-ml-xs top-avatar-btn">
          <div class="top-avatar">
            {{ initials(authStore.userDisplayName) }}
          </div>
          <q-menu anchor="bottom right" self="top right" :offset="[0, 8]" class="manager-user-menu">
            <!-- Identity -->
            <div class="mum-header">
              <div class="top-avatar top-avatar--lg">
                {{ initials(authStore.userDisplayName) }}
              </div>
              <div class="mum-info">
                <div class="mum-name">{{ authStore.userDisplayName }}</div>
                <div class="mum-role">{{ (authStore.roles?.[0] || 'manager').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }}</div>
              </div>
            </div>
            <q-separator class="mum-sep" />
            <!-- Branch Info -->
            <div class="mum-branch-row">
              <q-icon name="store" size="14px" class="mum-branch-icon" />
              <span>{{ authStore.currentBranch?.name || 'No Branch' }}</span>
            </div>
            <q-separator class="mum-sep" />
            <!-- Theme Toggle -->
            <q-item clickable v-close-popup class="mum-item" @click="uiStore.toggleDarkMode($q)">
              <q-item-section avatar
                ><q-icon :name="uiStore.themeIcon" size="16px"
              /></q-item-section>
              <q-item-section>{{ uiStore.themeLabel }}</q-item-section>
            </q-item>
            <q-separator class="mum-sep" />
            <!-- Sign out -->
            <q-item clickable v-close-popup class="mum-item mum-item--danger" @click="logout">
              <q-item-section avatar><q-icon name="logout" size="16px" /></q-item-section>
              <q-item-section>Sign Out</q-item-section>
            </q-item>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

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
    <q-footer class="manager-bottom-nav mobile-bottom-nav">
      <div class="bottom-nav-bar mobile-nav-bar" :class="{ 'bottom-nav-bar--light': !$q.dark.isActive }">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          custom
          v-slot="{ isActive, isExactActive, navigate }"
        >
          <button class="nav-tab" :class="{ 'nav-tab--active': tab.exact ? isExactActive : isActive }" @click="navigate">
            <div class="nav-tab__icon-wrap">
              <q-icon :name="(tab.exact ? isExactActive : isActive) ? (tab.iconActive || tab.icon) : tab.icon" size="32px" />
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
            <div v-if="tab.exact ? isExactActive : isActive" class="nav-tab__indicator" />
          </button>
        </router-link>
      </div>
    </q-footer>
  </q-layout>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import NotificationToast from 'components/common/NotificationToast.vue'
import OfflineBanner from 'components/common/OfflineBanner.vue'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'

const store = useManagerAppStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const $q = useQuasar()
const router = useRouter()

// ── Alert notification listener ───────────────────────────────────────────────
function handleMgrAlert(e) {
  const d = e.detail
  if (!d) return

  // Play notification sound for critical/warning alerts
  if (d.severity === 'critical' || d.severity === 'warning') {
    playAlertSound(d.severity)
  }

  $q.notify({
    message: d.title,
    caption: d.body || '',
    icon: d.icon || 'notifications',
    color: d.color || 'info',
    position: 'top-right',
    timeout: d.severity === 'critical' ? 8000 : 5000,
    progress: true,
    actions: [
      {
        label: 'View',
        color: 'white',
        flat: true,
        handler: () => router.push('/manager-app/alerts'),
      },
      { icon: 'close', color: 'white', flat: true, round: true },
    ],
  })
}

function playAlertSound(severity) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = severity === 'critical' ? 'square' : 'sine'
    osc.frequency.setValueAtTime(severity === 'critical' ? 880 : 660, ctx.currentTime)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch { /* silent fail if AudioContext not available */ }
}

// ── Auth guard ────────────────────────────────────────────────────────────────
onMounted(async () => {
  // Mark body for mobile app scroll prevention
  document.body.classList.add('mobile-app-active')

  // Listen for manager alert events
  window.addEventListener('mgr-alert', handleMgrAlert)

  // Use cached auth state — no network call needed
  if (!authStore.isAuthenticated) {
    router.replace('/auth/login')
    return
  }
  // Ensure authStore is FULLY populated (branches, roles) before store.initialize().
  if (!authStore.initialized || !authStore.branches.length) {
    await authStore.fetchUserData()
  }
  // Verify manager/admin role
  const roles = authStore.roles || []
  // Manager can only access manager-app — redirect non-managers to login
  if (!roles.includes('admin') && !roles.includes('manager')) {
    router.replace('/auth/login')
    return
  }
  // Admin can still access manager-app for preview, but pure managers stay here
  // No ERP links shown for pure managers
  await store.initialize()
})
onUnmounted(() => {
  document.body.classList.remove('mobile-app-active')
  store.cleanup()
  window.removeEventListener('mgr-alert', handleMgrAlert)
})

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
  // replace (not push): drops the authenticated page from history so back
  // from the login page can't resurrect a stale, now-signed-out view.
  router.replace('/auth/login')
}

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home', icon: 'space_dashboard', iconActive: 'space_dashboard', to: '/manager-app', exact: true },
  { label: 'Floor', icon: 'supervisor_account', iconActive: 'supervisor_account', to: '/manager-app/floor' },
  {
    label: 'Orders',
    icon: 'receipt_long',
    iconActive: 'receipt_long',
    to: '/manager-app/orders',
    badge: { value: store.pendingOrderCount },
  },
  {
    label: 'Messages',
    icon: 'mail_outline',
    iconActive: 'mail',
    to: '/manager-app/messages',
    badge: { value: store.unreadMessageCount },
  },
  { label: 'Profile', icon: 'person_outline', iconActive: 'person', to: '/manager-app/profile' },
])
</script>

<style lang="scss" scoped>
// ─── Layout ──────────────────────────────────────────────────────────────────
.manager-app-layout {
  background: #060a12;
  transition: background 0.25s ease;
  font-size: 15px;
  :deep(.q-page) {
    font-size: 15px;
  }
  :deep(.q-btn) {
    font-size: 13px !important;
  }
  :deep(.q-chip) {
    font-size: 12px !important;
  }
  :deep(.text-caption) {
    font-size: 13px !important;
  }
  :deep(.q-item__label) {
    font-size: 14px !important;
  }

  &--light {
    background: #eef2f7;
  }
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.manager-top-bar {
  background: linear-gradient(135deg, rgba(6, 10, 18, 0.98) 0%, rgba(13, 18, 36, 0.98) 50%, rgba(17, 14, 40, 0.98) 100%) !important;
  border-bottom: 1px solid rgba(34, 211, 238, 0.1) !important;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(34, 211, 238, 0.04) !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  transition: background 0.25s ease !important;

  &--light {
    background: rgba(255, 255, 255, 0.97) !important;
    border-bottom: 1px solid #dde4ef !important;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07) !important;
  }
}

.manager-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.manager-logo {
  height: 36px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.25));
}

.brand-tag {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #22d3ee;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(99, 102, 241, 0.1));
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 5px;
  padding: 3px 7px;
  text-transform: uppercase;
  line-height: 1;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.body--light .brand-tag {
  color: #0369a1;
  background: linear-gradient(135deg, rgba(3, 105, 161, 0.1), rgba(79, 70, 229, 0.06));
  border-color: rgba(3, 105, 161, 0.25);
  box-shadow: none;
}

.branch-chip {
  font-size: 10px !important;
  font-weight: 600 !important;
  height: 24px !important;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.1), rgba(99, 102, 241, 0.08)) !important;
  border: 1px solid rgba(34, 211, 238, 0.2) !important;
  color: #67e8f9 !important;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.08) !important;
}
.body--light .branch-chip {
  background: linear-gradient(135deg, rgba(3, 105, 161, 0.08), rgba(79, 70, 229, 0.05)) !important;
  border: 1px solid rgba(3, 105, 161, 0.2) !important;
  color: #0369a1 !important;
  box-shadow: none !important;
}

.toolbar-icon-btn {
  color: #6b7280 !important;
  transition: color 0.2s ease, transform 0.2s ease, background 0.2s ease;
  border-radius: 10px !important;
  &:hover {
    color: #22d3ee !important;
    background: rgba(34, 211, 238, 0.08) !important;
    transform: scale(1.05);
  }
}
.body--light .toolbar-icon-btn {
  color: #64748b !important;
  &:hover {
    color: #0369a1 !important;
    background: rgba(3, 105, 161, 0.06) !important;
  }
}

// ─── Top-bar Avatar Button ───────────────────────────────────────────────────
.top-avatar-btn {
  padding: 0 !important;
  min-width: 34px !important;
  min-height: 34px !important;
  border-radius: 50% !important;
}

.top-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #22d3ee 0%, #6366f1 60%, #0d9488 100%);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.25), 0 3px 12px rgba(34, 211, 238, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  &:hover {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px rgba(34, 211, 238, 0.4), 0 4px 16px rgba(34, 211, 238, 0.4);
  }
  &--lg {
    width: 44px;
    height: 44px;
    font-size: 14px;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.3), 0 4px 16px rgba(34, 211, 238, 0.35);
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.manager-user-menu) {
  background: linear-gradient(160deg, #0d1220 0%, #111827 100%) !important;
  border: 1px solid rgba(34, 211, 238, 0.12) !important;
  border-radius: 16px !important;
  overflow: hidden;
  min-width: 230px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(34, 211, 238, 0.06) !important;
}
.body--light :deep(.manager-user-menu) {
  background: #fff !important;
  border: 1px solid #e2e8f0 !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12) !important;
}

.mum-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px 14px;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.06), rgba(99, 102, 241, 0.04));
}
.body--light .mum-header {
  background: linear-gradient(135deg, rgba(3, 105, 161, 0.04), rgba(79, 70, 229, 0.02));
}
.mum-info {
  flex: 1;
  min-width: 0;
}
.mum-name {
  font-size: 16px;
  font-weight: 700;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.body--light .mum-name {
  color: #0f172a;
}
.mum-role {
  font-size: 11px;
  background: linear-gradient(90deg, #22d3ee, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-top: 3px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.body--light .mum-role {
  background: linear-gradient(90deg, #0369a1, #4f46e5);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.mum-branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
}
.body--light .mum-branch-row {
  color: #64748b;
}
.mum-branch-icon {
  color: #6366f1;
}

.mum-sep {
  background: rgba(255, 255, 255, 0.06) !important;
}
.body--light .mum-sep {
  background: #f1f5f9 !important;
}

.mum-item {
  min-height: 46px !important;
  font-size: 15px !important;
  color: #e2e8f0 !important;
  padding: 0 16px !important;
  gap: 10px;
  transition: background 0.15s ease;
  :deep(.q-icon) {
    color: #67e8f9 !important;
  }
  &:hover {
    background: rgba(34, 211, 238, 0.06) !important;
  }
  &--danger {
    color: #f87171 !important;
    :deep(.q-icon) {
      color: #f87171 !important;
    }
    &:hover {
      background: rgba(239, 68, 68, 0.08) !important;
    }
  }
}
.body--light .mum-item {
  color: #374151 !important;
  :deep(.q-icon) {
    color: #0369a1 !important;
  }
  &:hover {
    background: rgba(3, 105, 161, 0.05) !important;
  }
  &--danger {
    color: #dc2626 !important;
    :deep(.q-icon) {
      color: #dc2626 !important;
    }
    &:hover {
      background: rgba(239, 68, 68, 0.05) !important;
    }
  }
}

// ─── Bottom Navigation ───────────────────────────────────────────────────────
.bottom-nav-bar {
  background: linear-gradient(180deg, rgba(6, 10, 18, 0.97) 0%, rgba(10, 15, 28, 0.99) 100%);
  border-top: 1px solid rgba(34, 211, 238, 0.1);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  transition: background 0.25s ease, border-color 0.25s ease;

  &--light {
    background: rgba(255, 255, 255, 0.98) !important;
    border-top: 1px solid #dde4ef !important;
    box-shadow: 0 -2px 16px rgba(0, 0, 0, 0.06) !important;
  }
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
  color: #4b5563;
  transition: color 0.22s ease, transform 0.15s ease;
  position: relative;
  padding: 6px 0 4px;
  -webkit-tap-highlight-color: transparent;

  &__icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 34px;
    border-radius: 14px;
    transition: background 0.22s ease, box-shadow 0.22s ease, transform 0.15s ease;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    line-height: 1;
    transition: color 0.22s ease;
  }

  &__indicator {
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 20px;
    height: 3px;
    border-radius: 3px;
    background: linear-gradient(90deg, #22d3ee, #6366f1);
    box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
    animation: indicator-slide 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &--active {
    color: #22d3ee;

    .nav-tab__icon-wrap {
      background: linear-gradient(135deg, rgba(34, 211, 238, 0.15), rgba(99, 102, 241, 0.1));
      box-shadow: 0 0 16px rgba(34, 211, 238, 0.2), inset 0 1px 0 rgba(34, 211, 238, 0.08);
      transform: translateY(-1px);
    }

    .nav-tab__label {
      color: #22d3ee;
    }
  }

  &:active {
    transform: scale(0.91);
  }
}

:global(.body--light) .nav-tab {
  color: #94a3b8;

  &.nav-tab--active {
    color: #0369a1;

    .nav-tab__icon-wrap {
      background: linear-gradient(135deg, rgba(3, 105, 161, 0.1), rgba(79, 70, 229, 0.06));
      box-shadow: 0 0 12px rgba(3, 105, 161, 0.12);
    }

    .nav-tab__label {
      color: #0369a1;
    }

    .nav-tab__indicator {
      background: linear-gradient(90deg, #0369a1, #4f46e5);
      box-shadow: 0 0 6px rgba(3, 105, 161, 0.35);
    }
  }
}

@keyframes indicator-slide {
  0% {
    width: 0;
    opacity: 0;
  }
  60% {
    width: 28px;
  }
  100% {
    width: 20px;
    opacity: 1;
  }
}

.nav-badge {
  font-size: 10px !important;
  min-width: 18px !important;
  height: 18px !important;
  padding: 0 4px !important;
  top: -4px !important;
  right: -6px !important;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.4) !important;
}

// ─── Page Transition ─────────────────────────────────────────────────────────
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.99);
}
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.99);
}
</style>
