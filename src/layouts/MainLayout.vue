<template>
  <q-layout view="lHh Lpr lFf">
    <!-- ─── Header ────────────────────────────────────────────────────── -->
    <q-header class="erp-header">
      <!-- First Row: Search & Profile -->
      <q-toolbar class="erp-toolbar erp-toolbar--top">
        <!-- Toggle sidebar -->
        <q-btn
          v-if="!isPOSMode"
          flat
          dense
          round
          icon="menu"
          aria-label="Toggle Menu"
          class="erp-toolbar-btn q-mr-sm"
          @click="toggleLeftDrawer"
        />

        <!-- Brand only visible in POS mode where sidebar is hidden entirely -->
        <div class="erp-brand erp-brand--pos" v-if="isPOSMode">
          <img src="~assets/seven-waves-logo-transparent.png" alt="Seven Waves" style="width: 18px; height: auto;" />
          <span class="erp-brand__name">Seven Waves</span>
        </div>

        <!-- Global Search -->
        <div class="erp-search-wrap">
          <q-input
            ref="searchInputRef"
            v-model="searchQuery"
            dense
            borderless
            placeholder="Search..."
            class="erp-search"
          >
            <template #prepend>
              <q-icon name="search" size="18px" class="erp-search__icon" />
            </template>
            <template #append>
              <kbd class="erp-search__kbd">⌘K</kbd>
            </template>
          </q-input>
        </div>

        <q-space />

        <!-- Branch chip -->
        <div v-if="authStore.currentBranch && $q.screen.gt.sm" class="erp-branch-chip">
          <q-icon name="store_mall_directory" size="14px" />
          <span>{{ authStore.currentBranch.name }}</span>
        </div>

        <!-- Notification Bell -->
        <NotificationPanel />

        <!-- User Avatar & Menu -->
        <q-btn flat round dense class="erp-avatar-btn q-ml-xs">
          <q-avatar size="26px" class="erp-user-avatar">
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
      <q-toolbar class="erp-toolbar erp-toolbar--bottom" v-if="!isPOSMode && topNavSections.length > 0">
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
        <img src="~assets/seven-waves-logo-transparent.png" alt="Seven Waves" style="width: 22px; height: auto;" />
        <div class="erp-sidebar__logo-text">
          <span class="erp-sidebar__logo-name">Seven Waves</span>
          <span class="erp-sidebar__logo-sub">Restaurant ERP</span>
        </div>
      </div>

      <div class="erp-sidebar__scroll">
        <nav class="erp-sidebar__nav">
          <template v-for="(items, groupName) in groupedSidebarItems" :key="groupName">
            <!-- Section header — hide for 'Overview' group (redundant with tab nav) -->
            <div v-if="groupName && groupName !== 'default' && groupName !== 'Overview'" class="erp-sidebar__section-label">
              {{ groupName }}
            </div>

            <template v-for="item in items" :key="item.label">
              <!-- Leaf item -->
              <router-link v-if="!item.children" :to="item.to" custom v-slot="{ isActive, navigate }">
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
  </q-layout>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from 'stores/auth'
import { getFilteredNavItems } from 'src/config/roles'
import { useModulesStore } from 'src/stores/modules'
import NotificationPanel from 'components/common/NotificationPanel.vue'
import NotificationToast from 'components/common/NotificationToast.vue'
import { onMounted, onUnmounted, watch } from 'vue'

const authStore = useAuthStore()
const modulesStore = useModulesStore()
const route = useRoute()
const router = useRouter()

/** POS Mode: Hide sidebar for Cashier/Waiter or when on POS/Kitchen pages to maximize screen space */
const isPOSMode = computed(() => {
  if (route.path.startsWith('/pos') || route.path.startsWith('/kitchen')) return true

  return (
    authStore.hasAnyRole(['cashier', 'waiter']) &&
    !authStore.isAdmin &&
    !authStore.hasRole('manager')
  )
})

const leftDrawerOpen = ref(!isPOSMode.value)

const isItemActive = (itemTo, routerIsActive) => {
  if (itemTo) {
    if (itemTo.includes('#')) {
      return route.path + route.hash === itemTo
    }
    if (itemTo === '/dashboard') {
      return route.path === '/dashboard' && !route.hash
    }
  }
  return routerIsActive
}

const searchQuery = ref('')
const searchInputRef = ref(null)

const activeSection = ref(null)

// Top nav tab click — switches sidebar section AND navigates to the
// first accessible item in that section (its overview/dashboard page).
const handleSectionClick = (section) => {
  activeSection.value = section
  // Find the first accessible nav item in this section
  const firstItem = filteredMenuItems.value.find(
    (item) => item.section === section && item.to
  )
  if (firstItem?.to && route.path !== firstItem.to) {
    router.push(firstItem.to)
  }
}

const handleKeyDown = (e) => {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function logout() {
  await authStore.signOut()
  window.location.href = '/' // Triggers a full page reload which effectively cleans memory
  window.location.reload()
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
  filteredMenuItems.value.forEach(item => {
    if (item.section) sections.add(item.section)
  })
  return Array.from(sections)
})

/** Fetch items only matching the selected active section and group them */
const groupedSidebarItems = computed(() => {
  if (!activeSection.value) return {}
  const items = filteredMenuItems.value.filter(item => item.section === activeSection.value)
  
  const groups = {}
  items.forEach(item => {
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
  if (path.startsWith('/admin') || path.startsWith('/system') || path === '/profile') return 'SYSTEM'
  if (path.startsWith('/operations') || path.startsWith('/pos') || path.startsWith('/kitchen') || path.startsWith('/cashier') || path.startsWith('/orders') || path.startsWith('/waiter')) return 'OPERATIONS'
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
  { immediate: true }
)

// When the user navigates directly via browser URL (not sidebar click),
// re-sync the tab. We detect this by checking if the new path's natural
// section is completely different from what the sidebar currently shows.
// We never auto-sync when the user is just clicking sidebar items — that
// would undo their manual tab selection.
watch(
  () => route.path,
  (newPath) => {
    const sections = topNavSections.value
    if (!sections || sections.length === 0) return

    const natural = sectionForPath(newPath)
    // Only override the active tab when the URL's section is a real,
    // known section AND the currently-shown section has no items that
    // lead to this path (meaning the user typed/pasted the URL directly).
    const currentSectionHasPath = filteredMenuItems.value
      .filter(item => item.section === activeSection.value)
      .some(item => item.to && newPath.startsWith(item.to.split('?')[0]))

    if (!currentSectionHasPath && sections.includes(natural)) {
      activeSection.value = natural
    }
  }
)

</script>

<style scoped lang="scss">
// ─── Header ────────────────────────────────────────────────────────────────────
.erp-header {
  background-color: var(--erp-bg-header) !important;
  border-bottom: 1px solid var(--erp-border) !important;
  box-shadow: none !important;
}

.erp-toolbar {
  padding: 0 16px;
  gap: 8px;

  &--top {
    height: 48px !important;
    min-height: 48px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  &--bottom {
    height: 36px !important;
    min-height: 36px !important;
    max-height: 36px !important;
    background: rgba(0, 0, 0, 0.15);
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    overflow: hidden !important;
  }
}

.erp-toolbar-btn {
  color: var(--erp-text-secondary) !important;
  &:hover {
    color: var(--erp-text-primary) !important;
    background: rgba(255, 255, 255, 0.05) !important;
  }
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

// ─── Global Search ─────────────────────────────────────────────────────────────
.erp-search-wrap {
  flex: 0 1 320px;
  margin: 0 12px;
  transition: flex 0.3s ease;

  &:focus-within {
    flex: 0 1 440px;
  }
}

.erp-search {
  :deep(.q-field__control) {
    background-color: rgba(255, 255, 255, 0.06) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 8px !important;
    height: 34px !important;
    min-height: 34px !important;
    padding: 0 10px 0 8px !important;
    transition: border-color 0.2s, background-color 0.2s;
    display: flex;
    align-items: center;

    &:focus-within {
      border-color: var(--erp-primary) !important;
      background-color: rgba(67, 133, 245, 0.06) !important;
    }
  }

  :deep(.q-field__prepend) {
    height: 34px !important;
    padding-right: 6px !important;
    display: flex;
    align-items: center;
  }

  :deep(.q-field__append) {
    height: 34px !important;
    padding-left: 8px !important;
    display: flex;
    align-items: center;
  }

  :deep(.q-field__native) {
    font-size: 13px !important;
    color: var(--erp-text-primary) !important;
    padding: 0 !important;
    line-height: 34px !important;
    &::placeholder {
      color: var(--erp-text-tertiary);
    }
  }

  &__icon {
    color: var(--erp-text-tertiary);
    margin-top: 0 !important;
  }

  &__kbd {
    font-size: 10px;
    font-family: var(--erp-font-family);
    color: var(--erp-text-tertiary);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    padding: 2px 6px;
    white-space: nowrap;
    line-height: 1.4;
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
  }

  :deep(.q-tabs__content) {
    height: 36px !important;
    display: flex !important;
    align-items: center !important;
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

    .q-tab__content { padding: 0 !important; min-height: unset !important; height: 26px !important; display: flex !important; align-items: center !important; }
    .q-tab__label   { font-size: 11px; line-height: 1; }

    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  :deep(.q-tab--active) {
    color: #ffffff !important;
    background: rgba(255, 255, 255, 0.14) !important;
    font-weight: 700;
    .q-tab__label { color: #ffffff; }
  }
}

// ─── Branch ────────────────────────────────────────────────────────────────────
.erp-branch-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  color: var(--erp-text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--erp-border);
  border-radius: 6px;
  padding: 4px 10px;
  margin-right: 8px;
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

  // Hide the q-drawer's own scrollbar
  :deep(.q-drawer__content) {
    overflow: hidden !important;
    scrollbar-width: none !important;
    &::-webkit-scrollbar { display: none !important; }
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: 85px !important;
    min-height: 85px !important;
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
    height: calc(100% - 120px);
    overflow-y: auto;
    overflow-x: hidden;

    // Hide scrollbar across all browsers
    scrollbar-width: none;       // Firefox
    -ms-overflow-style: none;    // IE/Edge
    &::-webkit-scrollbar { display: none; } // Chrome/Safari
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
    padding: 16px 16px 4px;
    margin-top: 4px;

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
    min-height: 44px; /* 44px row height ERP standard */
    padding: 0 16px;
    margin: 4px 8px; /* 8px spacing grid */
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    text-decoration: none;
    border-left: 3px solid transparent; /* left border for active state */

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);

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
          background-color: rgba(255, 255, 255, 0.05) !important;
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
