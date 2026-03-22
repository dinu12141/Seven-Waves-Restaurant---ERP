<template>
  <q-layout view="hHh LpR fFf">
    <!-- ── Report Sidebar ──────────────────────────────────────────── -->
    <q-drawer
      v-model="drawerOpen"
      side="left"
      :width="260"
      :breakpoint="1024"
      bordered
      class="reports-drawer"
    >
      <!-- Drawer Header -->
      <div class="reports-drawer__header">
        <div class="reports-drawer__title">
          <q-icon name="analytics" size="20px" class="q-mr-sm" />
          <span>Reports Center</span>
        </div>
        <q-input
          v-model="searchQuery"
          dense
          outlined
          placeholder="Search reports..."
          class="reports-drawer__search"
          clearable
        >
          <template #prepend>
            <q-icon name="search" size="16px" />
          </template>
        </q-input>
      </div>

      <!-- Search Results -->
      <div v-if="searchQuery" class="reports-drawer__results">
        <div
          v-for="r in searchResults"
          :key="r.id"
          class="reports-drawer__item"
          :class="{ 'reports-drawer__item--active': isActive(r.route) }"
          @click="navigateTo(r.route)"
        >
          <q-icon :name="r.icon" size="16px" class="reports-drawer__item-icon" />
          <div class="reports-drawer__item-text">
            <div class="reports-drawer__item-label">{{ r.label }}</div>
            <div class="reports-drawer__item-group">{{ r.group }}</div>
          </div>
        </div>
        <div v-if="searchResults.length === 0" class="reports-drawer__empty">
          No reports found
        </div>
      </div>

      <!-- Grouped Navigation -->
      <q-scroll-area v-else class="reports-drawer__scroll">
        <!-- Dashboard link -->
        <div
          class="reports-drawer__item reports-drawer__item--dashboard"
          :class="{ 'reports-drawer__item--active': isActive('/reports/dashboard') }"
          @click="navigateTo('/reports/dashboard')"
        >
          <q-icon name="dashboard" size="16px" class="reports-drawer__item-icon" />
          <span class="reports-drawer__item-label">Reports Dashboard</span>
        </div>

        <q-separator class="q-my-xs" dark />

        <!-- Report Groups -->
        <div v-for="group in REPORT_GROUPS" :key="group.id" class="reports-drawer__group">
          <div
            class="reports-drawer__group-header"
            @click="toggleGroup(group.id)"
          >
            <q-icon :name="group.icon" size="16px" :style="{ color: group.color }" />
            <span class="reports-drawer__group-label">{{ group.label }}</span>
            <q-badge :label="group.reports.length" class="reports-drawer__group-badge" />
            <q-icon
              :name="expandedGroups[group.id] ? 'expand_less' : 'expand_more'"
              size="16px"
              class="reports-drawer__group-chevron"
            />
          </div>

          <q-slide-transition>
            <div v-show="expandedGroups[group.id]" class="reports-drawer__group-items">
              <div
                v-for="report in group.reports"
                :key="report.id"
                class="reports-drawer__item"
                :class="{ 'reports-drawer__item--active': isActive(report.route) }"
                @click="navigateTo(report.route)"
              >
                <q-icon :name="report.icon" size="14px" class="reports-drawer__item-icon" />
                <span class="reports-drawer__item-label">{{ report.label }}</span>
              </div>
            </div>
          </q-slide-transition>
        </div>
      </q-scroll-area>
    </q-drawer>

    <!-- ── Page Container ──────────────────────────────────────────── -->
    <q-page-container>
      <!-- Mobile drawer toggle -->
      <q-btn
        v-if="!drawerOpen"
        flat
        dense
        round
        icon="menu"
        class="reports-drawer-toggle"
        @click="drawerOpen = true"
      />
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { REPORT_GROUPS, searchReports } from 'src/services/reportService'

const router = useRouter()
const route = useRoute()

const drawerOpen = ref(true)
const searchQuery = ref('')

// Expand sales group by default
const expandedGroups = reactive(
  Object.fromEntries(REPORT_GROUPS.map((g) => [g.id, g.id === 'sales'])),
)

const searchResults = computed(() => searchReports(searchQuery.value))

function toggleGroup(groupId) {
  expandedGroups[groupId] = !expandedGroups[groupId]
}

function isActive(path) {
  return route.path === path
}

function navigateTo(path) {
  router.push(path)
}
</script>

<style scoped lang="scss">
.reports-drawer {
  background: var(--erp-bg-sidebar, #0c1222) !important;
  border-right: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06)) !important;

  &__header {
    padding: 16px 14px 12px;
    border-bottom: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  }

  &__title {
    display: flex;
    align-items: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--erp-text-primary, #f8fafc);
    letter-spacing: -0.3px;
    margin-bottom: 12px;
  }

  &__search {
    font-size: 12px;

    :deep(.q-field__control) {
      height: 32px;
      min-height: 32px;
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.08);
    }

    :deep(.q-field__native) {
      color: var(--erp-text-primary, #f8fafc);
      font-size: 12px;
    }

    :deep(.q-field__prepend) {
      color: var(--erp-text-muted, #64748b);
    }
  }

  &__scroll {
    height: calc(100vh - 110px);
  }

  &__results {
    padding: 8px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
  }

  &__empty {
    padding: 24px;
    text-align: center;
    color: var(--erp-text-muted, #64748b);
    font-size: 12px;
  }

  // ── Group ─────────────────
  &__group {
    margin-bottom: 2px;
  }

  &__group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: pointer;
    transition: background 0.12s ease;
    user-select: none;

    &:hover {
      background: rgba(255, 255, 255, 0.03);
    }
  }

  &__group-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--erp-text-secondary, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
  }

  &__group-badge {
    background: rgba(255, 255, 255, 0.06) !important;
    color: var(--erp-text-muted, #64748b) !important;
    font-size: 10px;
    font-weight: 600;
    min-height: 16px;
    padding: 0 5px;
  }

  &__group-chevron {
    color: var(--erp-text-muted, #64748b);
  }

  &__group-items {
    padding: 0 0 4px;
  }

  // ── Item ──────────────────
  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 28px;
    cursor: pointer;
    transition: all 0.12s ease;
    border-left: 2px solid transparent;

    &:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    &--active {
      background: rgba(37, 99, 235, 0.1) !important;
      border-left-color: var(--erp-primary, #2563eb);

      .reports-drawer__item-label {
        color: var(--erp-primary, #2563eb);
        font-weight: 600;
      }
      .reports-drawer__item-icon {
        color: var(--erp-primary, #2563eb);
      }
    }

    &--dashboard {
      padding-left: 14px;
      margin: 4px 8px;
      border-radius: 6px;
      border-left: none;
    }
  }

  &__item-icon {
    color: var(--erp-text-muted, #64748b);
    flex-shrink: 0;
  }

  &__item-label {
    font-size: 12px;
    color: var(--erp-text-secondary, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__item-text {
    flex: 1;
    min-width: 0;
  }

  &__item-group {
    font-size: 10px;
    color: var(--erp-text-muted, #64748b);
    margin-top: 1px;
  }
}

.reports-drawer-toggle {
  position: fixed;
  top: 72px;
  left: 8px;
  z-index: 100;
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  color: var(--erp-text-secondary, #94a3b8);
}
</style>
