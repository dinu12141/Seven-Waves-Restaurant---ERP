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

        <!-- Role indicator -->
        <q-chip
          v-for="role in authStore.roles"
          :key="role"
          dense
          :color="roleChipColor(role)"
          text-color="white"
          class="q-mr-xs"
          size="sm"
        >
          <q-icon :name="roleIcon(role)" size="14px" class="q-mr-xs" />
          {{ role }}
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
          <template v-for="(item, index) in filteredMenuItems" :key="item.label">
            <!-- Section header when changing sections -->
            <q-item-label
              v-if="
                item.section &&
                (index === 0 || item.section !== filteredMenuItems[index - 1]?.section)
              "
              header
              class="text-grey-4 text-weight-medium"
            >
              {{ item.section }}
            </q-item-label>
            <q-item-label v-else-if="index === 0" header class="text-grey-4 text-weight-medium">
              NAVIGATION
            </q-item-label>

            <!-- Single Page Item -->
            <q-item
              v-if="!item.children"
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

            <!-- Collapsible Item (Management, Procurement, etc.) -->
            <q-expansion-item
              v-else
              :icon="item.icon"
              :label="item.label"
              header-class="menu-item text-white"
              expand-icon-class="text-white"
              class="overflow-hidden"
            >
              <q-item
                v-for="child in item.children"
                :key="child.to"
                clickable
                v-ripple
                :to="child.to"
                exact
                active-class="bg-primary text-white"
                class="menu-item q-ml-sm"
              >
                <q-item-section avatar>
                  <q-icon :name="child.icon" size="20px" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ child.label }}</q-item-label>
                </q-item-section>
              </q-item>
            </q-expansion-item>
          </template>
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
import { getFilteredNavItems } from 'src/config/roles'
import { useModulesStore } from 'src/stores/modules'
import NotificationPanel from 'components/common/NotificationPanel.vue'

const leftDrawerOpen = ref(true)
const searchQuery = ref('')
const router = useRouter()
const authStore = useAuthStore()
const modulesStore = useModulesStore()

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

function logout() {
  // Navigate FIRST — instant redirect
  router.push('/auth/login')
  // Sign out in background — don't block the UI
  authStore.signOut()
}

/**
 * Dynamically filter navigation items based on user roles AND enabled modules.
 * Uses the centralized config from src/config/roles.ts
 */
const filteredMenuItems = computed(() => {
  const roleFiltered = getFilteredNavItems(authStore.roles || [])

  // Additionally filter out items whose module is disabled (recursively)
  function recursiveModuleFilter(items) {
    return items
      .filter((item) => {
        if (!item.moduleCode) return true
        return modulesStore.isModuleEnabled(item.moduleCode)
      })
      .map((item) => {
        if (item.children) {
          return {
            ...item,
            children: recursiveModuleFilter(item.children),
          }
        }
        return item
      })
      .filter((item) => {
        // Hide parent if it has no children and no 'to' link
        if (item.children && item.children.length === 0 && !item.to) {
          return false
        }
        return true
      })
  }

  return recursiveModuleFilter(roleFiltered)
})

/**
 * Role badge colors for the header
 */
function roleChipColor(role) {
  const colors = {
    admin: 'red-8',
    manager: 'deep-purple-8',
    waiter: 'teal-8',
    cashier: 'blue-8',
    kitchen: 'orange-8',
    inventory: 'green-8',
    finance: 'amber-9',
    hr: 'pink-8',
    procurement: 'deep-orange-8',
  }
  return colors[role] || 'grey-7'
}

function roleIcon(role) {
  const icons = {
    admin: 'shield',
    manager: 'supervisor_account',
    waiter: 'room_service',
    cashier: 'point_of_sale',
    kitchen: 'soup_kitchen',
    inventory: 'inventory_2',
    finance: 'account_balance',
    hr: 'people',
    procurement: 'local_shipping',
  }
  return icons[role] || 'person'
}
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
