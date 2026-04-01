<template>
  <q-layout view="hHh lpR fFf" class="manager-app-layout" :class="{ 'manager-app-layout--light': !$q.dark.isActive }">
    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="manager-top-bar" :class="{ 'manager-top-bar--light': !$q.dark.isActive }">
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
                <div class="mum-role">Manager</div>
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
    <q-page-container class="manager-page-container">
      <router-view v-slot="{ Component }">
        <transition name="tab-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </q-page-container>

    <!-- ── Bottom Navigation ─────────────────────────────────────────────── -->
    <q-footer class="manager-bottom-nav">
      <div class="bottom-nav-bar" :class="{ 'bottom-nav-bar--light': !$q.dark.isActive }">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          custom
          v-slot="{ isExactActive, navigate }"
        >
          <button class="nav-tab" :class="{ 'nav-tab--active': isExactActive }" @click="navigate">
            <div class="nav-tab__icon-wrap">
              <q-icon :name="isExactActive ? tab.iconActive || tab.icon : tab.icon" size="22px" />
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
            <div v-if="isExactActive" class="nav-tab__indicator" />
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
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import { supabase } from 'src/boot/supabase'

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
  // Listen for manager alert events
  window.addEventListener('mgr-alert', handleMgrAlert)

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

async function logout() {
  try {
    store.cleanup()
    await supabase.auth.signOut()
  } finally {
    window.location.href = '/#/auth/login'
  }
}

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home', icon: 'space_dashboard', iconActive: 'space_dashboard', to: '/manager-app' },
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
  background: #090c14;
  transition: background 0.25s ease;

  &--light {
    background: #f1f5f9;
  }
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.manager-top-bar {
  background: rgba(10, 14, 22, 0.97) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.2) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition: background 0.25s ease !important;

  &--light {
    background: rgba(255, 255, 255, 0.97) !important;
    border-bottom: 1px solid #e2e8f0 !important;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
  }
}

.manager-toolbar {
  height: 56px;
  min-height: 56px;
  padding: 0 12px;
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
}

.brand-tag {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 1.8px;
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
  text-transform: uppercase;
  line-height: 1;
}
.body--light .brand-tag {
  color: #0891b2;
  background: rgba(8, 145, 178, 0.08);
  border-color: rgba(8, 145, 178, 0.2);
}

.branch-chip {
  font-size: 10px !important;
  font-weight: 600 !important;
  height: 24px !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #a5b4fc !important;
}
.body--light .branch-chip {
  background: rgba(99, 102, 241, 0.06) !important;
  border: 1px solid rgba(99, 102, 241, 0.15) !important;
  color: #4f46e5 !important;
}

.toolbar-icon-btn {
  color: #9ca3af !important;
  transition: color 0.2s ease, transform 0.2s ease;
  &:hover {
    color: #e5e7eb !important;
    transform: scale(1.05);
  }
}
.body--light .toolbar-icon-btn {
  color: #64748b !important;
  &:hover {
    color: #1e293b !important;
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
  background: linear-gradient(135deg, #06b6d4, #8b5cf6);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 8px rgba(6, 182, 212, 0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  &:hover {
    transform: scale(1.08);
    box-shadow: 0 3px 12px rgba(6, 182, 212, 0.4);
  }
  &--lg {
    width: 44px;
    height: 44px;
    font-size: 14px;
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.manager-user-menu) {
  background: #111827 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 14px !important;
  overflow: hidden;
  min-width: 220px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4) !important;
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
  padding: 16px 16px 14px;
}
.mum-info {
  flex: 1;
  min-width: 0;
}
.mum-name {
  font-size: 14px;
  font-weight: 700;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.body--light .mum-name {
  color: #1e293b;
}
.mum-role {
  font-size: 11px;
  color: #22d3ee;
  margin-top: 2px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.body--light .mum-role {
  color: #0891b2;
}

.mum-branch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 500;
  color: #9ca3af;
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
  min-height: 44px !important;
  font-size: 13px !important;
  color: #e5e7eb !important;
  padding: 0 16px !important;
  gap: 10px;
  transition: background 0.15s ease;
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

// ─── Page Container ──────────────────────────────────────────────────────────
.manager-page-container {
  padding-bottom: 64px !important;
  min-height: calc(100vh - 56px - 64px);
}

// ─── Bottom Navigation ───────────────────────────────────────────────────────
.manager-bottom-nav {
  background: transparent !important;
  border-top: none !important;
}

.bottom-nav-bar {
  display: flex;
  align-items: stretch;
  height: 64px;
  background: rgba(10, 14, 22, 0.98);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding-bottom: env(safe-area-inset-bottom);
  transition: background 0.25s ease, border-color 0.25s ease;

  &--light {
    background: rgba(255, 255, 255, 0.98) !important;
    border-top: 1px solid #e2e8f0 !important;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
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
  transition: color 0.2s ease, transform 0.15s ease;
  position: relative;
  -webkit-tap-highlight-color: transparent;

  &__icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 28px;
    border-radius: 14px;
    transition: background 0.2s ease;
  }

  &__label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
    line-height: 1;
  }

  &__indicator {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #22d3ee;
    animation: indicator-pop 0.3s ease;
  }

  &--active {
    color: #22d3ee;

    .nav-tab__icon-wrap {
      background: rgba(34, 211, 238, 0.1);
    }
  }

  &:active {
    transform: scale(0.93);
  }
}

:global(.body--light) .nav-tab {
  color: #94a3b8;

  &.nav-tab--active {
    color: #0891b2;

    .nav-tab__icon-wrap {
      background: rgba(8, 145, 178, 0.08);
    }

    .nav-tab__indicator {
      background: #0891b2;
    }
  }
}

@keyframes indicator-pop {
  0% {
    transform: translateX(-50%) scale(0);
    opacity: 0;
  }
  60% {
    transform: translateX(-50%) scale(1.5);
  }
  100% {
    transform: translateX(-50%) scale(1);
    opacity: 1;
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
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.tab-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
