<template>
  <q-layout view="hHh lpR fFf" class="delivery-app-layout">
    <!-- ── Top Bar ───────────────────────────────────────────── -->
    <q-header class="delivery-top-bar">
      <q-toolbar class="delivery-toolbar">
        <!-- Brand -->
        <q-icon name="delivery_dining" size="22px" color="purple-4" />
        <div class="delivery-brand q-ml-sm">
          <span class="brand-name">Seven Waves</span>
          <span class="brand-tag">DELIVERY</span>
        </div>
        <q-space />

        <!-- Connection status -->
        <q-chip
          dense
          :color="store.isConnected ? 'green-9' : 'red-9'"
          text-color="white"
          :icon="store.isConnected ? 'wifi' : 'wifi_off'"
          class="status-chip"
        >
          {{ store.isConnected ? 'Live' : 'Offline' }}
        </q-chip>

        <!-- Theme Toggle -->
        <q-btn
          flat
          round
          dense
          :icon="uiStore.themeIcon"
          class="q-ml-sm"
          @click="uiStore.toggleDarkMode($q)"
        >
          <q-tooltip>{{ uiStore.themeLabel }}</q-tooltip>
        </q-btn>

        <!-- User avatar + logout -->
        <q-btn flat round dense class="q-ml-xs top-avatar-btn">
          <div class="top-avatar">
            {{ initials(authStore.userDisplayName) }}
          </div>
          <q-menu
            anchor="bottom right"
            self="top right"
            :offset="[0, 6]"
            class="delivery-user-menu"
          >
            <div class="dum-header">
              <div class="top-avatar top-avatar--lg">
                {{ initials(authStore.userDisplayName) }}
              </div>
              <div class="dum-info">
                <div class="dum-name">{{ authStore.userDisplayName }}</div>
                <div class="dum-role">Delivery Rider</div>
              </div>
            </div>
            <q-separator dark />
            <!-- Theme Toggle -->
            <q-item clickable v-close-popup class="dum-item" @click="uiStore.toggleDarkMode($q)">
              <q-item-section avatar
                ><q-icon :name="uiStore.themeIcon" size="16px"
              /></q-item-section>
              <q-item-section>{{ uiStore.themeLabel }}</q-item-section>
            </q-item>
            <q-separator dark />
            <q-item clickable v-close-popup class="dum-item dum-item--danger" @click="logout">
              <q-item-section avatar><q-icon name="logout" size="16px" /></q-item-section>
              <q-item-section>Sign Out</q-item-section>
            </q-item>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- ── Page Content ──────────────────────────────────────── -->
    <q-page-container class="delivery-page-container">
      <router-view v-slot="{ Component }">
        <transition name="tab-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </q-page-container>

    <!-- ── Bottom Navigation ─────────────────────────────────── -->
    <q-footer class="delivery-bottom-nav">
      <div class="bottom-nav-bar">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          custom
          v-slot="{ isActive, isExactActive, navigate }"
        >
          <button
            class="nav-tab"
            :class="{ 'nav-tab--active': tab.exact ? isExactActive : isActive }"
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
import { useQuasar } from 'quasar'
import { useDeliveryStore } from 'src/stores/deliveryStore'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import { supabase } from 'src/boot/supabase'

const store = useDeliveryStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const $q = useQuasar()
const router = useRouter()

// ── Auth guard ─────────────────────────
onMounted(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    router.replace('/auth/login')
    return
  }
  if (!authStore.initialized || !authStore.branches.length) {
    await authStore.fetchUserData()
  }
  await store.initialize()
})

onUnmounted(() => store.cleanup())

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

// ── Bottom tabs ─────────────────────────
const tabs = computed(() => [
  {
    label: 'Queue',
    icon: 'list_alt',
    to: '/delivery-app',
    exact: true,
    badge: { value: store.pendingCount },
  },
  {
    label: 'Active',
    icon: 'local_shipping',
    to: '/delivery-app/active',
    badge: { value: store.activeCount },
  },
  {
    label: 'Map',
    icon: 'map',
    to: '/delivery-app/map',
  },
  {
    label: 'History',
    icon: 'history',
    to: '/delivery-app/history',
  },
  {
    label: 'Profile',
    icon: 'person',
    to: '/delivery-app/profile',
  },
])
</script>

<style lang="scss" scoped>
// ─── Layout ─────────────────────────────────────
.delivery-app-layout {
  background: #090c14;
}

// ─── Top Bar ────────────────────────────────────
.delivery-top-bar {
  background: rgba(10, 14, 22, 0.97) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  box-shadow: none !important;
}

.delivery-toolbar {
  height: 52px;
  min-height: 52px;
  padding: 0 14px;
}

.delivery-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-name {
  font-size: 14px;
  font-weight: 700;
  color: #e8eaf0;
  letter-spacing: 0.4px;
}
.brand-tag {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #ce93d8;
  background: rgba(206, 147, 216, 0.12);
  padding: 2px 7px;
  border-radius: 4px;
}

.status-chip {
  font-size: 10px !important;
  height: 22px !important;
}

// ─── Avatar ─────────────────────────────────────
.top-avatar-btn {
  min-width: 34px;
}
.top-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7c4dff, #b388ff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  &--lg {
    width: 40px;
    height: 40px;
    font-size: 14px;
  }
}

// ─── User Menu ──────────────────────────────────
.delivery-user-menu {
  background: #1a1e2e !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  min-width: 200px;
}
.dum-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}
.dum-info {
  flex: 1;
}
.dum-name {
  font-size: 13px;
  font-weight: 700;
  color: #e8eaf0;
}
.dum-role {
  font-size: 10px;
  color: #9e9e9e;
  margin-top: 2px;
}
.dum-item {
  font-size: 12px;
  color: #bdbdbd;
  min-height: 36px;
  &--danger {
    color: #ef5350 !important;
  }
}

// ─── Page Container ─────────────────────────────
.delivery-page-container {
  padding-bottom: 72px !important; // space for bottom nav
}

// ─── Bottom Nav ─────────────────────────────────
.delivery-bottom-nav {
  background: rgba(10, 14, 22, 0.98) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
}

.bottom-nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 64px;
  max-width: 480px;
  margin: 0 auto;
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 12px;
  border: none;
  background: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.38);
  transition:
    color 0.2s ease,
    transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
  position: relative;

  &:active {
    transform: scale(0.92);
  }
  &--active {
    color: #ce93d8 !important;
    .nav-tab__label {
      font-weight: 700;
    }
  }
}

.nav-tab__icon-wrap {
  position: relative;
  line-height: 0;
}

.nav-tab__label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.nav-badge {
  font-size: 9px !important;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  top: -4px !important;
  right: -8px !important;
}

// ─── Transitions ────────────────────────────────
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity 0.15s ease;
}
.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>

<style lang="scss">
body.body--light {
  .delivery-app-layout {
    background: #f8fafc;
  }

  // Top bar — use high-specificity to beat scoped !important
  .delivery-top-bar.q-header {
    background: #ffffff !important;
    border-bottom: 1px solid #e2e8f0 !important;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
  }

  .brand-name {
    color: #0f172a;
  }

  .brand-tag {
    color: #7c3aed;
    background: rgba(124, 58, 237, 0.08);
  }

  // Theme toggle and avatar button in toolbar
  .delivery-toolbar .q-btn {
    color: #475569;
  }

  .top-avatar {
    background: linear-gradient(135deg, #7c3aed, #a78bfa);
  }

  .delivery-user-menu {
    background: #ffffff !important;
    border: 1px solid #e2e8f0 !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1) !important;
  }

  .dum-name {
    color: #0f172a;
  }
  .dum-role {
    color: #64748b;
  }
  .dum-item {
    color: #475569;
  }

  // Bottom nav — use high-specificity
  .delivery-bottom-nav.q-footer {
    background: #ffffff !important;
    border-top: 1px solid #e2e8f0 !important;
    box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06) !important;
  }

  .nav-tab {
    color: #94a3b8;

    &--active {
      color: #7c3aed !important;
    }
  }
}
</style>
