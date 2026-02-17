<template>
  <q-layout view="lHh Lpr lFf" class="bg-dark">
    <!-- Header -->
    <q-header elevated class="bg-grey-10 text-white border-bottom">
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title class="text-weight-medium">
          <q-icon name="restaurant" size="24px" class="q-mr-sm" />
          Restaurant ERP
        </q-toolbar-title>

        <!-- Search Bar -->
        <q-input
          dark
          dense
          standout
          v-model="searchQuery"
          placeholder="Search..."
          class="q-mx-md"
          style="max-width: 300px"
        >
          <template v-slot:prepend>
            <q-icon name="search" />
          </template>
        </q-input>

        <q-space />

        <!-- Branch indicator -->
        <q-chip
          v-if="authStore.currentBranch"
          dense
          color="grey-8"
          text-color="white"
          icon="store"
          class="q-mr-sm"
        >
          {{ authStore.currentBranch.name }}
        </q-chip>

        <!-- Notification Bell -->
        <NotificationPanel />

        <!-- User Menu -->
        <q-btn round flat>
          <q-avatar size="32px">
            <img src="https://cdn.quasar.dev/img/boy-avatar.png" />
          </q-avatar>
          <q-menu>
            <q-list style="min-width: 220px">
              <!-- User info header -->
              <q-item>
                <q-item-section>
                  <q-item-label class="text-weight-bold">{{
                    authStore.userDisplayName
                  }}</q-item-label>
                  <q-item-label caption>{{ authStore.user?.email }}</q-item-label>
                  <div class="q-mt-xs">
                    <q-badge
                      v-for="role in authStore.roles"
                      :key="role"
                      :color="role === 'admin' ? 'red' : 'primary'"
                      class="q-mr-xs"
                    >
                      {{ role }}
                    </q-badge>
                  </div>
                </q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable v-close-popup>
                <q-item-section avatar>
                  <q-icon name="person" />
                </q-item-section>
                <q-item-section>Profile</q-item-section>
              </q-item>
              <q-item clickable v-close-popup>
                <q-item-section avatar>
                  <q-icon name="settings" />
                </q-item-section>
                <q-item-section>Settings</q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable v-close-popup @click="logout">
                <q-item-section avatar>
                  <q-icon name="logout" />
                </q-item-section>
                <q-item-section>Logout</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- Sidebar -->
    <q-drawer
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      :width="250"
      :breakpoint="1024"
      class="bg-grey-10 sidebar-drawer"
    >
      <q-scroll-area class="fit">
        <q-list padding class="menu-list">
          <q-item-label header class="text-grey-4 text-weight-medium"> NAVIGATION </q-item-label>

          <q-item
            v-for="item in filteredMenuItems"
            :key="item.to"
            clickable
            v-ripple
            :to="item.to"
            exact
            active-class="bg-primary text-white"
            class="menu-item"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ item.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <!-- Page Content -->
    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from 'stores/auth'
import NotificationPanel from 'components/common/NotificationPanel.vue'

const leftDrawerOpen = ref(true)
const searchQuery = ref('')
const router = useRouter()
const authStore = useAuthStore()

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function logout() {
  await authStore.signOut()
  router.push('/auth/login')
}

const menuItems = [
  {
    label: 'Dashboard',
    icon: 'dashboard',
    to: '/dashboard',
    roles: ['admin', 'manager'],
  },
  {
    label: 'POS',
    icon: 'point_of_sale',
    to: '/pos',
    roles: ['admin', 'manager', 'cashier', 'waiter'],
  },
  {
    label: 'Kitchen',
    icon: 'kitchen',
    to: '/kitchen',
    roles: ['admin', 'manager', 'kitchen'],
  },
  {
    label: 'Orders',
    icon: 'receipt_long',
    to: '/orders',
    roles: ['admin', 'manager', 'waiter', 'cashier'],
  },
  {
    label: 'Inventory',
    icon: 'inventory_2',
    to: '/inventory',
    roles: ['admin', 'manager', 'inventory'],
  },
  {
    label: 'Finance',
    icon: 'account_balance',
    to: '/finance',
    roles: ['admin', 'manager', 'finance'],
  },
  {
    label: 'Admin',
    icon: 'admin_panel_settings',
    to: '/admin',
    roles: ['admin'],
  },
]

const filteredMenuItems = computed(() => {
  const userRoles = authStore.roles || []

  // If user is admin, show everything
  if (userRoles.includes('admin')) return menuItems

  // Filter based on roles
  return menuItems.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true
    return item.roles.some((role) => userRoles.includes(role))
  })
})
</script>

<style scoped lang="scss">
.border-bottom {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-drawer {
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.menu-list {
  padding-top: 1rem;
}

.menu-item {
  margin: 0.25rem 0.5rem;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
}

:deep(.q-item__label--header) {
  padding: 1rem 1rem 0.5rem;
  font-size: 0.75rem;
  letter-spacing: 0.5px;
}
</style>
