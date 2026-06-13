<template>
  <q-layout view="LHh Lpr lFf">
    <!-- ─── Header ────────────────────────────────────────────────────── -->
    <q-header v-if="!isPOSMode" class="erp-header">
      <!-- First Row: Search & Profile -->
      <q-toolbar class="erp-toolbar erp-toolbar--top">
        <!-- Toggle sidebar -->
        <q-btn
          flat
          dense
          icon="menu"
          aria-label="Toggle Menu"
          class="erp-toolbar-btn q-mr-sm"
          style="width: 30px; height: 30px; min-width: 30px; min-height: 30px; border-radius: 6px;"
          @click="toggleLeftDrawer"
        />

        <!-- Global Search -->
        <GlobalSearch />

        <q-space />

        <!-- Branch chip -->
        <div v-if="authStore.currentBranch && $q.screen.gt.sm" class="erp-branch-chip">
          <q-icon name="store_mall_directory" size="18px" />
          <span>{{ authStore.currentBranch.name }}</span>
        </div>

        <!-- Theme Toggle -->
        <q-btn
          flat
          dense
          :icon="uiStore.themeIcon"
          :aria-label="uiStore.themeLabel"
          class="erp-theme-toggle"
          @click="uiStore.toggleDarkMode($q)"
        >
          <q-tooltip>{{ uiStore.themeLabel }}</q-tooltip>
        </q-btn>

        <!-- Notification Bell -->
        <NotificationPanel />

        <!-- User Avatar & Menu -->
        <q-btn flat dense class="erp-avatar-btn q-ml-xs">
          <q-avatar size="32px" class="erp-user-avatar">
            <span>{{ userInitials }}</span>
          </q-avatar>
          <q-menu anchor="bottom right" self="top right" :offset="[0, 8]">
            <div class="erp-user-menu">
              <!-- User header -->
              <div class="erp-user-menu__header">
                <q-avatar size="44px" class="erp-user-menu__avatar">
                  <span>{{ userInitials }}</span>
                </q-avatar>
                <div class="erp-user-menu__info">
                  <div class="erp-user-menu__name">{{ authStore.userDisplayName }}</div>
                  <div class="erp-user-menu__email">{{ authStore.user?.email }}</div>
                  <div class="erp-user-menu__roles">
                    <span
                      v-for="role in authStore.roles"
                      :key="role"
                      class="erp-role-badge erp-role-badge--sm"
                      :class="`erp-role-badge--${role}`"
                      >{{ role }}</span
                    >
                  </div>
                </div>
              </div>

              <div class="erp-user-menu__divider"></div>

              <q-list class="erp-user-menu__list">
                <q-item
                  clickable
                  v-close-popup
                  class="erp-user-menu__item"
                  @click="router.push('/profile')"
                >
                  <q-item-section avatar>
                    <q-icon name="person_outline" size="18px" />
                  </q-item-section>
                  <q-item-section>My Profile & Settings</q-item-section>
                </q-item>
                <div class="erp-user-menu__divider"></div>
                <q-item
                  clickable
                  v-close-popup
                  class="erp-user-menu__item erp-user-menu__item--danger"
                  @click="logout"
                >
                  <q-item-section avatar>
                    <q-icon name="logout" size="18px" />
                  </q-item-section>
                  <q-item-section>Sign Out</q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-menu>
        </q-btn>
      </q-toolbar>

      <!-- Second Row: Categories Navigation Menu -->
      <q-toolbar
        class="erp-toolbar erp-toolbar--bottom"
        v-if="topNavSections.length > 0"
      >
        <div class="erp-top-nav">
          <q-tabs
            v-model="activeSection"
            dense
            shrink
            class="text-grey-4"
            active-color="primary"
            active-bg-color="primary-subtle"
            indicator-color="transparent"
            align="left"
            inline-label
            style="width: 100%"
          >
            <q-tab
              v-for="section in topNavSections"
              :key="section"
              :name="section"
              :label="section"
              class="erp-top-nav-tab"
              @click="handleSectionClick(section)"
            />
          </q-tabs>
        </div>
      </q-toolbar>
    </q-header>

    <!-- ─── Sidebar ──────────────────────────────────────────────────── -->
    <q-drawer
      v-if="!isPOSMode"
      v-model="leftDrawerOpen"
      show-if-above
      :width="240"
      :breakpoint="1024"
      class="erp-sidebar"
    >
      <!-- Logo area -->
      <div class="erp-sidebar__logo">
        <img
          src="~assets/seven-waves-logo-transparent.png"
          alt="Seven Waves"
          style="width: 22px; height: auto"
        />
        <div class="erp-sidebar__logo-text">
          <span class="erp-sidebar__logo-name">Seven Waves</span>
          <span class="erp-sidebar__logo-sub">Restaurant ERP</span>
        </div>
      </div>

      <div class="erp-sidebar__scroll">
        <nav class="erp-sidebar__nav">
          <template v-for="(items, groupName) in groupedSidebarItems" :key="groupName">
            <!-- Section header — hide for 'Overview' group (redundant with tab nav) -->
            <div
              v-if="groupName && groupName !== 'default' && groupName !== 'Overview'"
              class="erp-sidebar__section-label"
            >
              {{ groupName }}
            </div>

            <template v-for="item in items" :key="item.label">
              <!-- Leaf item -->
              <router-link
                v-if="!item.children"
                :to="item.to"
                custom
                v-slot="{ isActive, navigate }"
              >
                <div
                  class="erp-sidebar__item"
                  :class="{ 'erp-sidebar__item--active': isItemActive(item.to, isActive) }"
                  @click="navigate"
                  role="button"
                  :tabindex="0"
                >
                  <q-icon :name="item.icon" size="18px" class="erp-sidebar__item-icon" />
                  <span class="erp-sidebar__item-label">{{ item.label }}</span>
                </div>
              </router-link>

              <!-- Expandable group -->
              <q-expansion-item
                v-else
                dense
                class="erp-sidebar__expansion"
                header-class="erp-sidebar__expansion-header"
                expand-icon-class="erp-sidebar__expand-icon"
              >
                <template v-slot:header>
                  <div class="erp-sidebar__item-header-content">
                    <q-icon :name="item.icon" size="18px" class="erp-sidebar__item-icon" />
                    <span class="erp-sidebar__item-label">{{ item.label }}</span>
                  </div>
                </template>

                <div class="erp-sidebar__children">
                  <router-link
                    v-for="child in item.children"
                    :key="child.to"
                    :to="child.to"
                    custom
                    v-slot="{ isActive, navigate }"
                  >
                    <div
                      class="erp-sidebar__child-item"
                      :class="{ 'erp-sidebar__item--active': isItemActive(child.to, isActive) }"
                      @click="navigate"
                      role="button"
                      :tabindex="0"
                    >
                      <q-icon :name="child.icon" size="16px" class="erp-sidebar__item-icon" />
                      <span class="erp-sidebar__item-label">{{ child.label }}</span>
                    </div>
                  </router-link>
                </div>
              </q-expansion-item>
            </template>
          </template>
        </nav>
      </div>

      <!-- Version footer -->
      <div class="erp-sidebar__footer">
        <span>v2.0.0</span>
        <span class="erp-sidebar__footer-dot">·</span>
        <span>Seven Waves ERP</span>
      </div>
    </q-drawer>

    <!-- ─── Page Content ──────────────────────────────────────────────── -->
    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Global Notification Toasts -->
    <NotificationToast />

    <!-- Global Offline Banner -->
    <OfflineBanner />
  </q-layout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import { useUIStore } from 'stores/ui'
import { getFilteredNavItems } from 'src/config/roles'
import { useModulesStore } from 'src/stores/modules'
import NotificationPanel from 'components/common/NotificationPanel.vue'
import NotificationToast from 'components/common/NotificationToast.vue'
import GlobalSearch from 'components/common/GlobalSearch.vue'
import OfflineBanner from 'components/common/OfflineBanner.vue'
import { watch } from 'vue'

const authStore = useAuthStore()
const uiStore = useUIStore()
const $q = useQuasar()
const modulesStore = useModulesStore()
const route = useRoute()
const router = useRouter()

/** POS Mode: Hide sidebar + top nav for Cashier/Waiter/Kitchen or when on POS/Kitchen pages */
const isPOSMode = computed(() => {
  if (route.path.startsWith('/pos') || route.path.startsWith('/kitchen')) return true

  return (
    authStore.hasAnyRole(['cashier', 'waiter', 'kitchen']) &&
    !authStore.isAdmin &&
    !authStore.hasRole('manager')
  )
})

const leftDrawerOpen = ref(!isPOSMode.value)

const isItemActive = (itemTo, routerIsActive) => {
  if (!itemTo) return routerIsActive

  // Handle hash-based routes (e.g. /page#section)
  if (itemTo.includes('#')) {
    return route.path + route.hash === itemTo
  }

  // Handle dashboard specifically
  if (itemTo === '/dashboard') {
    return route.path === '/dashboard' && !route.hash
  }

  // Handle query-parameter based routes (e.g. /inventory?tab=stock)
  // Vue Router's isActive only matches path, not query — so we compare manually
  if (itemTo.includes('?')) {
    const [itemPath, itemQuery] = itemTo.split('?')
    if (route.path !== itemPath) return false

    // Parse the item's query params and compare with current route
    const itemParams = new URLSearchParams(itemQuery)
    for (const [key, value] of itemParams.entries()) {
      if (route.query[key] !== value) return false
    }
    return true
  }

  return routerIsActive
}

// searchQuery and searchInputRef moved to GlobalSearch component

const activeSection = ref(null)

// Top nav tab click — switches sidebar section AND navigates to the
// first accessible item in that section (its overview/dashboard page).
const handleSectionClick = (section) => {
  activeSection.value = section
  // Find the first accessible nav item in this section
  const firstItem = filteredMenuItems.value.find((item) => item.section === section && item.to)
  if (firstItem?.to && route.path !== firstItem.to) {
    router.push(firstItem.to)
  }
}

// Ctrl+K is handled inside GlobalSearch component

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function logout() {
  await authStore.signOut()
  router.push('/auth/login')
}

/** User initials for avatar */
const userInitials = computed(() => {
  const name = authStore.userDisplayName || authStore.user?.email || 'U'
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
})

/**
 * Dynamically filter navigation items based on user roles AND enabled modules.
 */
const filteredMenuItems = computed(() => {
  const roleFiltered = getFilteredNavItems(authStore.roles || [], authStore.permissions || [])

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
        if (item.children && item.children.length === 0 && !item.to) {
          return false
        }
        return true
      })
  }

  return recursiveModuleFilter(roleFiltered)
})

/** Compute unique sections available for the top navigation */
const topNavSections = computed(() => {
  const sections = new Set()
  filteredMenuItems.value.forEach((item) => {
    if (item.section) sections.add(item.section)
  })
  return Array.from(sections)
})

/** Fetch items only matching the selected active section and group them */
const groupedSidebarItems = computed(() => {
  if (!activeSection.value) return {}
  const items = filteredMenuItems.value.filter((item) => item.section === activeSection.value)

  const groups = {}
  items.forEach((item) => {
    const g = item.group || 'default'
    if (!groups[g]) groups[g] = []
    groups[g].push(item)
  })
  return groups
})

/**
 * Maps a route path to its natural section.
 * Used on initial load and direct URL navigation only.
 */
function sectionForPath(path) {
  if (path.startsWith('/inventory')) return 'INVENTORY'
  if (path.startsWith('/procurement')) return 'PROCUREMENT'
  if (path.startsWith('/finance')) return 'FINANCE'
  if (path.startsWith('/reports')) return 'REPORTS'
  if (path.startsWith('/hr')) return 'HR'
  if (path.startsWith('/admin') || path.startsWith('/system') || path === '/profile')
    return 'SYSTEM'
  if (path.startsWith('/website-orders') || path.startsWith('/website')) return 'WEBSITE'
  if (
    path.startsWith('/operations') ||
    path.startsWith('/pos') ||
    path.startsWith('/kitchen') ||
    path.startsWith('/cashier') ||
    path.startsWith('/orders') ||
    path.startsWith('/waiter')
  )
    return 'OPERATIONS'
  return 'MAIN'
}

// On initial load: set the active section from the URL.
// Once the user manually clicks a tab, the tab stays on their choice
// regardless of which page they navigate to via sidebar items.
watch(
  topNavSections,
  (sections) => {
    if (!sections || sections.length === 0) return
    // Only auto-detect on first load (activeSection still null)
    if (activeSection.value) return

    const section = sectionForPath(route.path)
    activeSection.value = sections.includes(section) ? section : sections[0]
  },
  { immediate: true },
)

// When the user navigates to a route, ensure the correct section tab is active.
// This handles both direct URL navigation and sidebar shortcut clicks
// (e.g. "Sales Reports" in MAIN section pointing to /reports/sales should
// switch to the REPORTS tab).
watch(
  () => route.path,
  (newPath) => {
    const sections = topNavSections.value
    if (!sections || sections.length === 0) return

    const natural = sectionForPath(newPath)
    if (natural !== activeSection.value && sections.includes(natural)) {
      activeSection.value = natural
    }
  },
)
</script>

<style scoped lang="scss">
// ─── Header ────────────────────────────────────────────────────────────────────
.erp-header {
  box-sizing: border-box !important;
  height: 75px !important;
  min-height: 75px !important;
  max-height: 75px !important;
  background-color: var(--erp-bg-header) !important;
  border-bottom: 1px solid var(--erp-border) !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
}

.erp-toolbar {
  padding: 0 16px;
  gap: 16px;
  align-items: center !important;

  &--top {
    height: var(--erp-header-height) !important;
    min-height: var(--erp-header-height) !important;
    max-height: var(--erp-header-height) !important;
    border-bottom: 1px solid var(--erp-border);
    display: flex !important;
    align-items: center !important;

    // Force Quasar internal toolbar to same height
    :deep(.q-toolbar__content) {
      height: var(--erp-header-height) !important;
      min-height: var(--erp-header-height) !important;
      align-items: center !important;
      padding: 0 !important;
    }
  }

  &--bottom {
    height: 32px !important;
    min-height: 32px !important;
    max-height: 32px !important;
    background: var(--erp-bg-toolbar-bottom);
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    overflow: hidden !important;
  }
}

// ─── User Avatar Button ────────────────────────────────────────────────────────
.erp-avatar-btn,
:deep(.notif-btn) {
  width: 30px !important;
  height: 30px !important;
  min-width: 30px !important;
  min-height: 30px !important;
  padding: 0 !important;
  border-radius: 6px !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  font-size: 18px !important;
}

.erp-user-avatar {
  background: var(--erp-primary) !important;
  color: #fff !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  letter-spacing: 0.5px;
}
// ─── Toolbar Buttons ───────────────────────────────────────────────────────────
.erp-toolbar-btn {
  color: var(--erp-text-secondary) !important;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  
  &:hover {
    color: var(--erp-text-primary) !important;
    background: var(--erp-bg-hover) !important;
  }
}

.erp-theme-toggle {
  width: 30px !important;
  height: 30px !important;
  min-height: 30px !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  border-radius: 6px !important;
  padding: 0 !important;
  font-size: 18px;
}

// ─── Brand ─────────────────────────────────────────────────────────────────────
.erp-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
  text-decoration: none;
  cursor: default;
  transition: margin-left 0.3s;

  &--pos {
    margin-left: 8px;
  }

  &__icon {
    color: var(--erp-primary);
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    white-space: nowrap;
  }

  &__tag {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--erp-primary);
    background-color: var(--erp-primary-subtle);
    border: 1px solid rgba(67, 133, 245, 0.2);
    padding: 1px 5px;
    border-radius: 4px;
    align-self: center;
  }
}

// ─── Branch Chip ─────────────────────────────────────────────────────────────
.erp-branch-chip {
  height: 30px !important;
  min-height: 30px !important;
  display: flex !important;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--erp-border);
  border-radius: 6px;
  color: var(--erp-text-secondary);
  font-size: 13px;
  font-weight: 500;
  background: var(--erp-bg-card);
  transition: all 0.2s ease;
  user-select: none;
  &:hover {
    background: var(--erp-bg-hover);
    color: var(--erp-text-primary);
    border-color: var(--erp-border-hover);
  }
}

// ─── Global Search ─────────────────────────────────────────────────────────────
.erp-search-wrap {
  flex: 0 1 320px;
  margin: 0 12px;
  display: flex;
  align-items: center;
  transition: flex 0.3s ease;

  &:focus-within {
    flex: 0 1 440px;
  }
}

.erp-search.q-field--dense {
  width: 100%;

  :deep(.q-field__inner),
  :deep(.q-field__control),
  :deep(.q-field__marginal) {
    height: 30px !important;
    min-height: 30px !important;
    max-height: 30px !important;
  }

  :deep(.q-field__bottom) {
    display: none !important;
  }

  :deep(.q-field__control) {
    background-color: var(--erp-bg-active) !important;
    border: 1px solid var(--erp-border-hover) !important;
    border-radius: 6px !important;
    padding: 0 10px 0 8px !important;
    display: flex;
    align-items: center;
    transition:
      border-color 0.2s,
      background-color 0.2s;

    &:focus-within {
      border-color: var(--erp-primary) !important;
      background-color: rgba(67, 133, 245, 0.06) !important;
    }
  }

  :deep(.q-field__prepend) {
    padding-right: 8px !important;
  }

  :deep(.q-field__append) {
    padding-left: 8px !important;
  }

  :deep(.q-field__marginal) {
    height: 32px !important;
  }

  :deep(.q-field__native) {
    font-size: 13px !important;
    color: var(--erp-text-primary) !important;
    padding: 0 !important;
    line-height: normal !important;
    &::placeholder {
      color: var(--erp-text-tertiary);
    }
  }

  &__icon {
    display: flex;
    color: var(--erp-text-tertiary);
  }

  &__kbd {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-family: var(--erp-font-family);
    color: var(--erp-text-tertiary);
    background: var(--erp-bg-active);
    border: 1px solid var(--erp-border-hover);
    border-radius: 4px;
    padding: 0 6px;
    height: 20px;
    white-space: nowrap;
    line-height: 1;
  }
}

// ─── Top Nav ───────────────────────────────────────────────────────────────────
.erp-top-nav {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 36px;
  padding: 0 16px;

  :deep(.q-tabs) {
    height: 36px !important;
    min-height: 36px !important;
    max-height: 36px !important;
    display: flex !important;
    align-items: center !important;
  }

  :deep(.q-tabs__content) {
    height: 36px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
  }

  :deep(.q-tabs__arrow) {
    display: none !important;
  }

  :deep(.q-tab) {
    min-height: 26px !important;
    height: 26px !important;
    padding: 0 10px;
    border-radius: 4px;
    margin-right: 4px;
    transition: all 0.2s ease;
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.4px;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;

    .q-tab__content {
      padding: 0 !important;
      min-height: unset !important;
      height: 26px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .q-tab__label {
      font-size: 11px;
      line-height: 1;
      display: flex;
      align-items: center;
    }

    &:hover {
      background: var(--erp-bg-hover);
    }
  }

  :deep(.q-tab--active) {
    color: var(--erp-text-on-primary) !important;
    background: var(--erp-primary) !important;
    font-weight: 700;
    .q-tab__label {
      color: var(--erp-text-on-primary);
    }
  }
}

// ─── Branch ────────────────────────────────────────────────────────────────────
.erp-branch-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--erp-text-secondary);
  background: var(--erp-bg-card-hover);
  border: 1px solid var(--erp-border);
  border-radius: 8px;
  padding: 0 12px;
}

// ─── Role Badges ───────────────────────────────────────────────────────────────
.erp-role-badges {
  display: flex;
  gap: 4px;
  margin-right: 8px;
}

.erp-role-badge {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  border: 1px solid transparent;

  &--admin {
    background: rgba(234, 67, 53, 0.12);
    color: #ea4335;
    border-color: rgba(234, 67, 53, 0.2);
  }
  &--manager {
    background: rgba(124, 77, 255, 0.12);
    color: #9c71f4;
    border-color: rgba(124, 77, 255, 0.2);
  }
  &--cashier {
    background: rgba(67, 133, 245, 0.12);
    color: #4385f5;
    border-color: rgba(67, 133, 245, 0.2);
  }
  &--waiter {
    background: rgba(0, 188, 212, 0.12);
    color: #00bcd4;
    border-color: rgba(0, 188, 212, 0.2);
  }
  &--kitchen {
    background: rgba(255, 152, 0, 0.12);
    color: #ff9800;
    border-color: rgba(255, 152, 0, 0.2);
  }
  &--inventory {
    background: rgba(76, 175, 80, 0.12);
    color: #4caf50;
    border-color: rgba(76, 175, 80, 0.2);
  }
  &--finance {
    background: rgba(255, 193, 7, 0.12);
    color: #ffc107;
    border-color: rgba(255, 193, 7, 0.2);
  }
  &--hr {
    background: rgba(233, 30, 99, 0.12);
    color: #e91e63;
    border-color: rgba(233, 30, 99, 0.2);
  }
  &--procurement {
    background: rgba(255, 87, 34, 0.12);
    color: #ff5722;
    border-color: rgba(255, 87, 34, 0.2);
  }

  &--sm {
    font-size: 9px;
    padding: 1px 5px;
  }
}

// ─── Avatar ────────────────────────────────────────────────────────────────────
.erp-avatar-btn {
  margin-left: 4px;
}

.erp-user-avatar {
  background: var(--erp-primary) !important;
  color: #fff !important;
  font-size: 12px !important;
  font-weight: 600 !important;
}

// ─── User Menu ─────────────────────────────────────────────────────────────────
.erp-user-menu {
  width: 260px;
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  &__avatar {
    background: var(--erp-primary) !important;
    color: #fff !important;
    font-size: 16px !important;
    font-weight: 600 !important;
    flex-shrink: 0;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__email {
    font-size: 11px;
    color: var(--erp-text-secondary);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__roles {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 6px;
  }

  &__divider {
    height: 1px;
    background-color: var(--erp-border);
    margin: 0;
  }

  &__list {
    padding: 4px 0;
  }

  &__item {
    min-height: 40px !important;
    padding: 0 16px !important;
    font-size: 13px !important;
    color: var(--erp-text-primary) !important;
    gap: 10px;

    &:hover {
      background-color: var(--erp-bg-card-hover) !important;
    }

    :deep(.q-icon) {
      color: var(--erp-text-secondary) !important;
    }

    &--danger {
      color: var(--erp-error) !important;
      :deep(.q-icon) {
        color: var(--erp-error) !important;
      }
      &:hover {
        background-color: var(--erp-error-bg) !important;
      }
    }
  }
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
.erp-sidebar {
  background-color: var(--erp-bg-sidebar) !important;
  border-right: 1px solid var(--erp-border) !important;
  box-shadow: none !important;
  display: flex;
  flex-direction: column;

  // Hide the q-drawer's own scrollbar and gap
  :deep(.q-drawer__content) {
    overflow: hidden !important;
    scrollbar-width: none !important;
    &::-webkit-scrollbar {
      display: none !important;
    }
  }

  // Remove the scrollbar gap between sidebar and main content
  :deep(.q-drawer) {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
    &::-webkit-scrollbar {
      display: none !important;
    }
  }

  &__logo {
    box-sizing: border-box !important;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: 75px !important;
    min-height: 75px !important;
    max-height: 75px !important;
    border-bottom: 1px solid var(--erp-border);
    flex-shrink: 0;

    .q-icon {
      color: var(--erp-primary);
    }
  }

  &__logo-text {
    display: flex;
    flex-direction: column;
  }

  &__logo-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--erp-text-primary);
    line-height: 1.2;
  }

  &__logo-sub {
    font-size: 10px;
    font-weight: 500;
    color: var(--erp-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__scroll {
    flex: 1;
    height: calc(100% - 72px);
    overflow-y: auto;
    overflow-x: hidden;

    // Hide scrollbar across all browsers
    scrollbar-width: none; // Firefox
    -ms-overflow-style: none; // IE/Edge
    &::-webkit-scrollbar {
      display: none;
    } // Chrome/Safari
  }

  &__nav {
    padding: 8px 0;
  }

  &__section-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--erp-text-tertiary);
    padding: 12px 12px 4px;
    margin-top: 2px;

    &:first-child {
      margin-top: 0;
      padding-top: 8px;
    }
  }

  &__item,
  &__child-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px; /* SAP B1 compact row */
    padding: 0 12px;
    margin: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    text-decoration: none;
    border-left: 3px solid transparent; /* left border for active state */

    &:hover {
      background-color: var(--erp-bg-hover);

      .erp-sidebar__item-label {
        color: var(--erp-text-primary);
      }
      .q-icon {
        color: var(--erp-text-secondary);
      }
    }

    &--active {
      background-color: var(--erp-primary-subtle) !important;
      border-left-color: var(--erp-primary) !important; /* Left border highlight */

      .erp-sidebar__item-label {
        color: var(--erp-primary) !important;
        font-weight: 600;
      }
      .q-icon {
        color: var(--erp-primary) !important;
      }
    }
  }

  &__child-item {
    padding-left: 24px;
    min-height: 44px;
    margin: 4px 8px 4px 16px;
  }

  &__item-header-content {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  &__item-icon {
    color: var(--erp-text-tertiary);
    flex-shrink: 0;
    transition: color 0.15s;
  }

  &__item-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--erp-text-secondary);
    transition: color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__children {
    padding: 2px 0;
  }

  &__footer {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 10px 16px;
    border-top: 1px solid var(--erp-border);
    font-size: 10px;
    color: var(--erp-text-tertiary);
    flex-shrink: 0;
  }

  &__footer-dot {
    opacity: 0.4;
  }
}

// Expansion item overrides
.erp-sidebar {
  :deep(.erp-sidebar__expansion) {
    .q-expansion-item__container {
      .q-item {
        min-height: 44px !important;
        padding: 0 16px !important;
        margin: 4px 8px !important;
        border-radius: 4px !important;
        border-left: 3px solid transparent;
        gap: 0 !important;

        // Custom header content alignment
        .q-item__section--main {
          padding: 0 !important;
        }

        &:hover {
          background-color: var(--erp-bg-hover) !important;
        }

        .q-expansion-item__toggle-icon {
          color: var(--erp-text-tertiary);
          font-size: 16px;
        }
      }
    }
  }
}
</style>
