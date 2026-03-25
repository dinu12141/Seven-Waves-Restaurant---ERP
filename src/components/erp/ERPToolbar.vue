<template>
  <div class="erp-toolbar q-px-lg shadow-2">
    <div class="row full-width items-center no-wrap h-100">
      <!-- Left side: Title, Badges, Breadcrumbs -->
      <div class="col-auto row items-center no-wrap q-gutter-x-md">
        <div class="column justify-center">
          <div class="erp-toolbar__breadcrumbs text-grey-6 text-uppercase" v-if="breadcrumbs">
            {{ breadcrumbs }}
          </div>
          <div class="row items-center no-wrap q-gutter-x-sm">
            <h1 class="erp-toolbar__title no-margin">{{ title }}</h1>
            <q-badge v-if="roleBadge" outline color="primary" class="erp-toolbar__role-badge">
              {{ roleBadge }}
            </q-badge>
          </div>
        </div>
      </div>

      <!-- Center: Global Search -->
      <div class="col row justify-center q-px-xl" v-if="showSearch">
        <q-input
          v-model="searchQuery"
          dense
          outlined
          placeholder="Search items, orders, or records..."
          class="erp-toolbar__search full-width"
          style="max-width: 480px"
          @keyup.enter="$emit('search', searchQuery)"
        >
          <template #prepend>
            <q-icon name="search" size="20px" class="erp-toolbar__search-icon" />
          </template>
        </q-input>
      </div>

      <!-- Right side: Actions -->
      <div class="col-auto row items-center no-wrap q-gutter-x-sm">
        <q-select
          v-if="showBranchSelector && branches.length > 0"
          v-model="selectedBranch"
          :options="branches"
          option-label="name"
          option-value="id"
          dense
          outlined
          emit-value
          map-options
          class="erp-toolbar__branch"
          style="min-width: 140px"
          @update:model-value="$emit('branch-change', selectedBranch)"
        >
          <template #prepend>
            <q-icon name="store" size="18px" class="text-primary" />
          </template>
        </q-select>

        <slot name="bulk-actions" />

        <div class="row items-center no-wrap q-gutter-x-xs">
          <q-btn
            v-if="showRefresh"
            flat
            round
            dense
            icon="refresh"
            size="sm"
            color="grey-7"
            class="erp-toolbar__icon-btn"
            @click="$emit('refresh')"
          >
            <q-tooltip>Refresh Data</q-tooltip>
          </q-btn>
          <q-btn
            v-if="showFilter"
            flat
            round
            dense
            icon="filter_list"
            size="sm"
            color="grey-7"
            class="erp-toolbar__icon-btn"
            @click="$emit('filter')"
          >
            <q-tooltip>Advanced Filter</q-tooltip>
          </q-btn>
        </div>

        <slot name="secondary-actions" />

        <q-btn-dropdown
          v-if="showExport && canExport"
          outline
          class="erp-toolbar__secondary-btn"
          color="white"
          label="Export"
          icon="file_download"
          no-caps
        >
          <q-list dense class="erp-toolbar__dropdown-list" style="min-width: 140px">
            <q-item clickable v-close-popup @click="$emit('export-csv')">
              <q-item-section avatar>
                <q-icon name="table_view" size="20px" />
              </q-item-section>
              <q-item-section>Export CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="$emit('export-excel')">
              <q-item-section avatar>
                <q-icon name="grid_on" size="20px" />
              </q-item-section>
              <q-item-section>Export Excel</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-btn
          v-if="primaryAction && canCreate"
          unelevated
          class="erp-toolbar__primary-btn"
          color="primary"
          :label="primaryActionLabel"
          icon="add"
          @click="$emit('primary-action')"
        />

        <q-btn-dropdown
          v-if="secondaryActions && secondaryActions.length > 0"
          class="erp-toolbar__dropdown-btn"
          outline
          color="white"
          icon="more_vert"
        >
          <q-list class="erp-toolbar__dropdown-list" style="min-width: 180px">
            <q-item
              v-for="action in secondaryActions"
              :key="action.label"
              clickable
              v-close-popup
              @click="action.handler"
            >
              <q-item-section avatar v-if="action.icon">
                <q-icon :name="action.icon" size="sm" />
              </q-item-section>
              <q-item-section>{{ action.label }}</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { useToolbarPermissions } from 'src/composables/useToolbarPermissions'

const props = defineProps({
  title: { type: String, required: true },
  breadcrumbs: { type: String, default: '' },
  roleBadge: { type: String, default: '' },
  moduleName: {
    type: String,
    required: true,
    validator: (v) =>
      ['orders', 'inventory', 'hr', 'finance', 'dashboard', 'operations', 'procurement', 'reports', 'system'].includes(v),
  },
  showSearch: { type: Boolean, default: false },
  showBranchSelector: { type: Boolean, default: false },
  showRefresh: { type: Boolean, default: false },
  showFilter: { type: Boolean, default: false },
  showExport: { type: Boolean, default: false },
  primaryAction: { type: Boolean, default: false },
  primaryActionLabel: { type: String, default: 'Create' },
  secondaryActions: { type: Array, default: () => [] }, // { label, icon, handler }
})

defineEmits([
  'search',
  'branch-change',
  'refresh',
  'filter',
  'export-csv',
  'export-excel',
  'primary-action',
])

const authStore = useAuthStore()
const { canCreateRecord, canExportData } = useToolbarPermissions()

const selectedBranch = ref(authStore.currentBranch?.id || null)
const searchQuery = ref('')

const branches = computed(() => authStore.branches?.map((b) => b.branches).filter(Boolean) || [])

const canCreate = computed(() => canCreateRecord(props.moduleName))
const canExport = computed(() => canExportData(props.moduleName))
</script>

<style scoped lang="scss">
.erp-toolbar {
  height: 64px;
  background-color: var(--erp-bg-form-card);
  border-bottom: 1px solid var(--erp-border);
  position: sticky;
  top: 0;
  z-index: 100;
  margin: -16px -16px 16px -16px;
  display: flex;
  align-items: center;

  .h-100 {
    height: 100%;
  }

  &__title {
    font-size: 18px !important;
    font-weight: 700 !important;
    line-height: 1.1 !important;
    letter-spacing: -0.02em;
    white-space: nowrap;
    color: var(--erp-text-primary) !important;
  }

  &__breadcrumbs {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
    color: var(--erp-text-muted);
  }

  &__search-icon {
    color: var(--erp-text-muted);
  }

  &__role-badge {
    height: 20px;
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    font-weight: 600;
  }

  &__search :deep(.q-field__control),
  &__branch :deep(.q-field__control) {
    height: 38px !important;
    min-height: 38px !important;
    border-radius: 8px;
    background: var(--erp-bg-input) !important;
    border: 1px solid var(--erp-border);
    color: var(--erp-text-primary);
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--erp-border-hover);
      background: var(--erp-bg-hover) !important;
    }

    &.q-field__control--focused {
      border-color: var(--erp-primary);
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
    }
  }

  &__dropdown-list {
    background: var(--erp-bg-card) !important;
    color: var(--erp-text-primary) !important;
  }

  &__icon-btn {
    width: 32px;
    height: 32px;
    color: var(--erp-text-muted);
    transition: all 0.2s ease;
    &:hover {
      color: var(--erp-text-primary) !important;
      background: var(--erp-bg-hover);
    }
  }

  &__primary-btn {
    height: 38px;
    min-height: 38px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    padding: 0 20px;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
    }
  }

  &__secondary-btn,
  &__dropdown-btn {
    height: 38px;
    min-height: 38px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    padding: 0 16px;
    border: 1px solid var(--erp-border);
    color: var(--erp-text-secondary);
    transition: all 0.2s ease;

    :deep(.q-btn-dropdown__arrow) {
      display: none;
    }

    &:hover {
      background: var(--erp-bg-hover);
      border-color: var(--erp-border-hover);
    }
  }

  &__dropdown-btn {
    padding: 0 10px;
    :deep(.q-btn-dropdown__arrow) {
      display: none;
    }
  }
}
</style>
