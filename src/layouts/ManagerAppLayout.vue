<template>
  <q-layout view="hHh lpR fFf" class="manager-app-layout">

    <!-- ── Top Bar ───────────────────────────────────────────────────────── -->
    <q-header class="manager-top-bar">
      <q-toolbar class="manager-toolbar">
        <!-- Brand -->
        <q-icon name="restaurant" size="20px" color="cyan-4" />
        <div class="manager-brand q-ml-sm">
          <span class="brand-name">Seven Waves</span>
          <span class="brand-tag">MANAGER</span>
        </div>
        <q-space />

        <!-- Branch chip -->
        <q-chip
          dense color="blue-grey-9" text-color="cyan-3"
          icon="store" class="branch-chip"
        >
          {{ authStore.currentBranch?.name || 'No Branch' }}
        </q-chip>

        <!-- Notification Bell -->
        <q-btn flat round dense icon="notifications" color="grey-4" class="q-ml-sm" to="/manager-app/alerts">
          <q-badge v-if="store.unreadAlertCount > 0" color="red" floating rounded>
            {{ store.unreadAlertCount > 9 ? '9+' : store.unreadAlertCount }}
          </q-badge>
        </q-btn>

        <!-- Messages -->
        <q-btn flat round dense icon="mail" color="grey-4" class="q-ml-xs" to="/manager-app/messages">
          <q-badge v-if="store.unreadMessageCount > 0" color="orange" floating rounded>
            {{ store.unreadMessageCount > 9 ? '9+' : store.unreadMessageCount }}
          </q-badge>
        </q-btn>

        <!-- User avatar + logout menu -->
        <q-btn flat round dense class="q-ml-xs top-avatar-btn">
          <div class="top-avatar">
            {{ initials(authStore.userDisplayName) }}
          </div>
          <q-menu anchor="bottom right" self="top right" :offset="[0, 6]" class="manager-user-menu">
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
            <q-separator dark />
            <!-- Back to ERP -->
            <q-item clickable v-close-popup class="mum-item" @click="$router.push('/dashboard')">
              <q-item-section avatar><q-icon name="dashboard" size="16px" /></q-item-section>
              <q-item-section>Back to ERP</q-item-section>
            </q-item>
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
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useManagerAppStore } from 'src/stores/managerAppStore'
import { useAuthStore } from 'stores/auth'
import { supabase } from 'src/boot/supabase'

const store = useManagerAppStore()
const authStore = useAuthStore()
const router = useRouter()

// ── Auth guard ────────────────────────────────────────────────────────────────
onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
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
  if (!roles.includes('admin') && !roles.includes('manager')) {
    router.replace('/dashboard')
    return
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
    window.location.href = '/#/auth/login'
  }
}

// ── Bottom tabs ───────────────────────────────────────────────────────────────
const tabs = computed(() => [
  { label: 'Home',     icon: 'space_dashboard',       to: '/manager-app' },
  { label: 'Floor',    icon: 'supervisor_account',    to: '/manager-app/floor' },
  { label: 'Orders',   icon: 'receipt_long',          to: '/manager-app/orders',   badge: { value: store.pendingOrderCount } },
  { label: 'Messages', icon: 'mail',                  to: '/manager-app/messages', badge: { value: store.unreadMessageCount } },
  { label: 'Profile',  icon: 'person',                to: '/manager-app/profile' },
])
</script>

<style lang="scss" scoped>
// ─── Layout ──────────────────────────────────────────────────────────────────
.manager-app-layout {
  background: #090c14;
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────
.manager-top-bar {
  background: rgba(10, 14, 22, 0.97) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow: none !important;
}

.manager-toolbar {
  height: 52px;
  min-height: 52px;
  padding: 0 14px;
}

.manager-brand {
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
  color: #22d3ee;
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.25);
  border-radius: 4px;
  padding: 1px 5px;
  text-transform: uppercase;
}

.branch-chip {
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
  background: linear-gradient(135deg, #06b6d4, #8b5cf6);
  color: #fff; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; letter-spacing: 0.3px;
  &--lg {
    width: 40px; height: 40px; font-size: 14px;
  }
}

// ─── User Menu Dropdown ───────────────────────────────────────────────────────
:deep(.manager-user-menu) {
  background: #111827 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  overflow: hidden;
  min-width: 200px;
}

.mum-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px 12px;
}
.mum-info { flex: 1; min-width: 0; }
.mum-name {
  font-size: 13px; font-weight: 700; color: #f3f4f6;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mum-role {
  font-size: 11px; color: #22d3ee; margin-top: 2px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
}
.mum-item {
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

// ─── Page Container ──────────────────────────────────────────────────────────
.manager-page-container {
  padding-bottom: 64px !important;
  min-height: calc(100vh - 52px - 64px);
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
    color: #22d3ee;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 32px;
      height: 2px;
      background: #22d3ee;
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
