<template>
  <div class="erp-data-table">
    <!-- Card Header -->
    <div class="erp-data-table__header">
      <div class="erp-data-table__header-left">
        <h3 class="erp-h3" v-if="title">{{ title }}</h3>
        <span v-if="subtitle" class="erp-data-table__subtitle">{{ subtitle }}</span>
      </div>
      <div class="erp-data-table__header-right">
        <slot name="toolbar" />
        <!-- Search -->
        <q-input
          v-if="searchable"
          v-model="searchFilter"
          dense
          borderless
          placeholder="Search..."
          class="erp-data-table__search"
          @update:model-value="$emit('search', $event)"
        >
          <template #prepend>
            <q-icon name="search" size="16px" style="color: var(--erp-text-tertiary)" />
          </template>
          <template v-if="searchFilter" #append>
            <q-icon
              name="close"
              size="14px"
              style="color: var(--erp-text-tertiary); cursor: pointer"
              @click="searchFilter = ''"
            />
          </template>
        </q-input>
        <slot name="top-right" />
      </div>
    </div>

    <!-- Table -->
    <q-table
      :rows="rows"
      :columns="columns"
      :filter="filter || searchFilter"
      :loading="loading"
      :pagination="defaultPagination"
      row-key="id"
      flat
      class="erp-table"
      :no-data-label="noDataLabel"
      :rows-per-page-options="rowsPerPageOptions"
    >
      <!-- Pass through all custom slots -->
      <template v-for="(_, name) in $slots" v-slot:[name]="slotData">
        <slot :name="name" v-bind="slotData" />
      </template>

      <!-- Loading overlay -->
      <template #loading>
        <q-inner-loading showing>
          <q-spinner-dots size="36px" color="primary" />
        </q-inner-loading>
      </template>

      <!-- Empty state -->
      <template #no-data>
        <slot name="no-data">
          <div class="erp-data-table__empty">
            <q-icon name="table_rows" size="36px" class="erp-data-table__empty-icon" />
            <div class="erp-data-table__empty-text">{{ noDataLabel }}</div>
            <div class="erp-data-table__empty-sub">Try adjusting your filters</div>
          </div>
        </slot>
      </template>
    </q-table>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '',
  },
  subtitle: {
    type: String,
    default: '',
  },
  rows: {
    type: Array,
    required: true,
  },
  columns: {
    type: Array,
    required: true,
  },
  filter: {
    type: String,
    default: '',
  },
  loading: {
    type: Boolean,
    default: false,
  },
  searchable: {
    type: Boolean,
    default: false,
  },
  noDataLabel: {
    type: String,
    default: 'No records found',
  },
  rowsPerPage: {
    type: Number,
    default: 15,
  },
  rowsPerPageOptions: {
    type: Array,
    default: () => [10, 15, 25, 50, 0],
  },
})

defineEmits(['search'])

const searchFilter = ref('')
const defaultPagination = { rowsPerPage: props.rowsPerPage }
</script>

<style scoped lang="scss">
.erp-data-table {
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: 12px;
  overflow: hidden;

  // Header
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--erp-border);
    flex-wrap: wrap;
  }

  &__header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__subtitle {
    font-size: 12px;
    color: var(--erp-text-secondary);
  }

  // Search
  &__search {
    :deep(.q-field__control) {
      background-color: rgba(255, 255, 255, 0.04) !important;
      border: 1px solid var(--erp-border) !important;
      border-radius: 7px !important;
      height: 34px !important;
      min-height: 34px !important;
      padding: 0 10px !important;

      &:focus-within {
        border-color: var(--erp-primary) !important;
      }
    }
    :deep(.q-field__native) {
      font-size: 13px !important;
      color: var(--erp-text-primary) !important;
      padding: 0 4px !important;
      min-width: 160px;
    }
  }

  // Table
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px;
    gap: 8px;
  }

  &__empty-icon {
    color: var(--erp-text-tertiary);
    opacity: 0.5;
  }

  &__empty-text {
    font-size: 14px;
    font-weight: 500;
    color: var(--erp-text-secondary);
  }

  &__empty-sub {
    font-size: 12px;
    color: var(--erp-text-tertiary);
  }
}

// Table internal overrides
:deep(.erp-table) {
  background-color: transparent !important;
  color: var(--erp-text-primary) !important;

  .q-table__top,
  .q-table__middle {
    background-color: transparent !important;
  }

  thead tr {
    background-color: var(--erp-bg-table-header) !important;
    th {
      font-size: 11px !important;
      font-weight: 600 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      color: var(--erp-text-tertiary) !important;
      border-bottom: 1px solid var(--erp-border) !important;
      height: 40px !important;
      padding: 0 14px !important;
      white-space: nowrap;
    }
  }

  tbody {
    tr {
      &:nth-child(even) {
        background-color: rgba(255, 255, 255, 0.018) !important;
      }
      &:hover {
        background-color: rgba(67, 133, 245, 0.06) !important;
      }

      td {
        font-size: 13px !important;
        color: var(--erp-text-primary) !important;
        border-bottom: 1px solid var(--erp-border) !important;
        height: 44px !important;
        padding: 0 14px !important;
      }
    }
  }

  .q-table__bottom {
    border-top: 1px solid var(--erp-border) !important;
    background-color: var(--erp-bg-table-header) !important;
    font-size: 12px !important;
    color: var(--erp-text-secondary) !important;
    min-height: 44px !important;
    padding: 0 14px !important;
  }

  .q-table__linear-progress {
    display: none;
  } // hide default loading bar, we use loading slot
}
</style>
