<template>
  <div class="erp-toolbar q-py-sm q-px-md items-center shadow-1">
    <div class="row full-width justify-between no-wrap">
      <!-- Left side: Title, Badges, Breadcrumbs -->
      <div class="erp-toolbar__left row items-center no-wrap q-gutter-x-sm">
        <div class="column justify-center">
          <div class="erp-toolbar__breadcrumbs text-grey-5 text-uppercase" v-if="breadcrumbs">
            {{ breadcrumbs }}
          </div>
          <div class="row items-center q-gutter-x-sm">
            <h1 class="erp-toolbar__title text-white no-margin">{{ title }}</h1>
            <q-badge v-if="roleBadge" outline color="primary" class="erp-toolbar__role-badge">
              {{ roleBadge }}
            </q-badge>
          </div>
        </div>
      </div>

      <!-- Center: Global Search -->
      <div class="erp-toolbar__center col-grow row justify-center q-px-xl" v-if="showSearch">
        <q-input
          v-model="searchQuery"
          dense
          outlined
          dark
          placeholder="Search..."
          class="erp-toolbar__search full-width"
          style="max-width: 400px"
          @keyup.enter="$emit('search', searchQuery)"
        >
          <template #prepend>
            <q-icon name="search" size="18px" />
          </template>
        </q-input>
      </div>

      <!-- Right side: Actions -->
      <div class="erp-toolbar__right row items-center no-wrap q-gutter-x-sm">
        <q-select
          v-if="showBranchSelector && branches.length > 0"
          v-model="selectedBranch"
          :options="branches"
          option-label="name"
          option-value="id"
          dense
          outlined
          dark
          emit-value
          map-options
          class="erp-toolbar__branch"
          style="min-width: 160px"
          @update:model-value="$emit('branch-change', selectedBranch)"
        >
          <template #prepend>
            <q-icon name="store" size="18px" />
          </template>
        </q-select>

        <slot name="bulk-actions" />

        <q-btn
          v-if="showRefresh"
          flat
          round
          dense
          icon="refresh"
          size="sm"
          color="grey-5"
          class="erp-toolbar__icon-btn"
          @click="$emit('refresh')"
        />
        <q-btn
          v-if="showFilter"
          flat
          round
          dense
          icon="filter_list"
          size="sm"
          color="grey-5"
          class="erp-toolbar__icon-btn"
          @click="$emit('filter')"
        />

        <slot name="secondary-actions" />

        <q-btn
          v-if="showExport && canExport"
          outline
          class="erp-toolbar__secondary-btn q-ml-sm"
          color="white"
          label="Export"
          icon="download"
          @click="$emit('export')"
        />

        <q-btn
          v-if="primaryAction && canCreate"
          unelevated
          class="erp-toolbar__primary-btn q-ml-sm"
          color="primary"
          :label="primaryActionLabel"
          icon="add"
          @click="$emit('primary-action')"
        />

        <q-btn-dropdown
          v-if="secondaryActions && secondaryActions.length > 0"
          class="erp-toolbar__dropdown-btn q-ml-sm"
          outline
          color="white"
          icon="more_vert"
        >
          <q-list class="bg-dark text-white">
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
    validator: (v) => ['orders', 'inventory', 'hr', 'finance'].includes(v),
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

defineEmits(['search', 'branch-change', 'refresh', 'filter', 'export', 'primary-action'])

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
  height: 56px;
  background-color: var(--erp-bg-form-card, #111827); // subtle neutral
  border-bottom: 1px solid var(--erp-input-border, #1f2937);
  position: sticky;
  top: 0;
  z-index: 100;
  margin: -16px -16px 16px -16px; // Adjust negative margins based on Quasar q-page padding

  &__title {
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  &__breadcrumbs {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  &__role-badge {
    height: 18px;
    font-size: 10px;
    padding: 0 4px;
    border-width: 1px;
  }

  &__search :deep(.q-field__control),
  &__branch :deep(.q-field__control) {
    height: 32px !important;
    min-height: 32px !important;
    border-radius: 6px;
  }

  &__icon-btn {
    &:hover {
      color: white !important;
      background: rgba(255, 255, 255, 0.05);
    }
  }

  &__primary-btn {
    height: 32px;
    min-height: 32px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    padding: 0 16px;
    .q-icon {
      font-size: 16px;
    }
  }

  &__secondary-btn,
  &__dropdown-btn {
    height: 32px;
    min-height: 32px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    padding: 0 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);

    &:hover {
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.9);
    }
  }

  &__dropdown-btn {
    padding: 0 8px;
    :deep(.q-btn__content) {
      margin-left: 0;
    }
    :deep(.q-btn-dropdown__arrow) {
      display: none;
    }
  }
}
</style>
