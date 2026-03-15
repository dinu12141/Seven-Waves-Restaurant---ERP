<template>
  <q-page class="report-page">
    <!-- ── Toolbar ───────────────────────────────────────────────────── -->
    <div class="report-toolbar">
      <div class="report-toolbar__left">
        <div class="report-toolbar__breadcrumb">
          <span class="report-toolbar__breadcrumb-item">REPORTS</span>
          <span class="report-toolbar__breadcrumb-sep">/</span>
          <span class="report-toolbar__breadcrumb-item report-toolbar__breadcrumb-item--active">{{
            title
          }}</span>
        </div>
        <h1 class="report-toolbar__title">{{ title }}</h1>
        <p v-if="subtitle" class="report-toolbar__subtitle">{{ subtitle }}</p>
      </div>
      <div class="report-toolbar__right">
        <!-- Export Controls -->
        <q-btn-dropdown
          flat
          dense
          icon="file_download"
          label="Export"
          class="report-btn report-btn--ghost"
          no-caps
        >
          <q-list dense class="report-export-menu">
            <q-item clickable v-close-popup @click="$emit('export-csv')">
              <q-item-section avatar><q-icon name="table_view" size="16px" /></q-item-section>
              <q-item-section>Export CSV</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="$emit('export-excel')">
              <q-item-section avatar><q-icon name="grid_on" size="16px" /></q-item-section>
              <q-item-section>Export Excel</q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="handlePrint">
              <q-item-section avatar><q-icon name="print" size="16px" /></q-item-section>
              <q-item-section>Print Report</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-btn
          flat
          dense
          icon="tune"
          :label="filtersOpen ? 'Hide Filters' : 'Filters'"
          class="report-btn report-btn--ghost q-ml-sm"
          no-caps
          @click="filtersOpen = !filtersOpen"
        >
          <q-badge
            v-if="activeFilterCount > 0"
            floating
            color="primary"
            :label="activeFilterCount"
          />
        </q-btn>


      </div>
    </div>

    <!-- ── Filter Panel ──────────────────────────────────────────────── -->
    <q-slide-transition>
      <div v-show="filtersOpen" class="report-filter-panel">
        <div class="report-filter-panel__grid">
          <!-- Date Range -->
          <div class="report-filter-group">
            <label class="report-filter-label">Date Range</label>
            <div class="report-filter-date-row">
              <q-input
                v-model="filters.dateFrom"
                dense
                outlined
                type="date"
                class="report-filter-input"
                @update:model-value="onFilterChange"
              />
              <span class="report-filter-date-sep">to</span>
              <q-input
                v-model="filters.dateTo"
                dense
                outlined
                type="date"
                class="report-filter-input"
                @update:model-value="onFilterChange"
              />
            </div>
            <div class="report-date-presets">
              <button
                v-for="preset in datePresets"
                :key="preset.label"
                class="report-date-preset"
                :class="{ active: activePreset === preset.label }"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>

          <!-- Branch -->
          <div class="report-filter-group">
            <label class="report-filter-label">Branch</label>
            <q-select
              v-model="filters.branch"
              :options="branchOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              placeholder="All Branches"
              class="report-filter-input"
              @update:model-value="onFilterChange"
            />
          </div>

          <!-- Dynamic slot for extra filters -->
          <slot name="extra-filters" :filters="filters" />
        </div>

        <!-- Advanced Toggle -->
        <div v-if="$slots['advanced-filters']" class="report-filter-advanced-toggle">
          <button class="report-filter-advanced-btn" @click="advancedOpen = !advancedOpen">
            <q-icon :name="advancedOpen ? 'expand_less' : 'expand_more'" size="16px" />
            {{ advancedOpen ? 'Hide' : 'Show' }} Advanced Filters
          </button>
        </div>
        <q-slide-transition>
          <div v-show="advancedOpen" class="report-filter-advanced">
            <slot name="advanced-filters" :filters="filters" />
          </div>
        </q-slide-transition>

        <div class="report-filter-actions">
          <q-btn
            no-caps
            dense
            label="Apply Filters"
            color="primary"
            class="report-btn report-btn--primary"
            @click="applyFilters"
          />
          <q-btn
            no-caps
            dense
            flat
            label="Clear"
            class="report-btn report-btn--ghost q-ml-sm"
            @click="clearFilters"
          />
        </div>
      </div>
    </q-slide-transition>

    <!-- ── Active Filter Summary Bar ─────────────────────────────────── -->
    <div v-if="appliedFilters && activeFilterCount > 0" class="report-filter-bar">
      <q-icon name="filter_list" size="14px" class="q-mr-xs" />
      <span class="report-filter-bar__label">Active filters:</span>
      <template v-if="appliedFilters.dateFrom && appliedFilters.dateTo">
        <span class="report-filter-chip">
          {{ formatDate(appliedFilters.dateFrom) }} → {{ formatDate(appliedFilters.dateTo) }}
          <q-icon
            name="close"
            size="12px"
            class="cursor-pointer q-ml-xs"
            @click="clearDateFilter"
          />
        </span>
      </template>
      <template v-if="appliedFilters.branch">
        <span class="report-filter-chip">
          Branch: {{ appliedFilters.branch }}
          <q-icon
            name="close"
            size="12px"
            class="cursor-pointer q-ml-xs"
            @click="clearBranchFilter"
          />
        </span>
      </template>
      <slot name="filter-chips" :applied="appliedFilters" />
      <button class="report-filter-bar__clear" @click="clearFilters">Clear all</button>
    </div>

    <!-- ── KPI Summary Row ─────────────────────────────────────────── -->
    <div v-if="kpis && kpis.length" class="report-kpi-row">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        class="report-kpi-card"
        :class="`report-kpi-card--${kpi.color || 'default'}`"
      >
        <div class="report-kpi-card__icon">
          <q-icon :name="kpi.icon" size="18px" />
        </div>
        <div class="report-kpi-card__body">
          <div class="report-kpi-card__value">{{ kpi.value }}</div>
          <div class="report-kpi-card__label">{{ kpi.label }}</div>
          <div v-if="kpi.sub" class="report-kpi-card__sub">{{ kpi.sub }}</div>
        </div>
      </div>
    </div>

    <!-- ── Content Slot ──────────────────────────────────────────────── -->
    <div class="report-content">
      <slot :filters="appliedFilters || filters" />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from 'src/stores/auth'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  kpis: { type: Array, default: () => [] },
  branches: { type: Array, default: () => [] },
  autoRefreshInterval: { type: Number, default: 60000 },
})

const emit = defineEmits(['filter-change', 'export-csv', 'export-excel', 'refresh'])

const authStore = useAuthStore()

const filtersOpen = ref(true)
const advancedOpen = ref(false)
const activePreset = ref('This Month')
const appliedFilters = ref(null)

const today = new Date()
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

const filters = ref({
  dateFrom: firstOfMonth.toISOString().slice(0, 10),
  dateTo: today.toISOString().slice(0, 10),
  branch: null,
})

const branchOptions = computed(() => {
  const opts = [{ label: 'All Branches', value: null }]
  if (props.branches.length) {
    props.branches.forEach((b) => opts.push({ label: b.name, value: b.id }))
  } else {
    authStore.branches.forEach((b) => {
      if (b.branches) opts.push({ label: b.branches.name, value: b.branches.id })
    })
  }
  return opts
})

const datePresets = [
  {
    label: 'Today',
    from: () => today.toISOString().slice(0, 10),
    to: () => today.toISOString().slice(0, 10),
  },
  {
    label: 'Yesterday',
    from: () => {
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    },
    to: () => {
      const d = new Date(today)
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    },
  },
  {
    label: 'This Week',
    from: () => {
      const d = new Date(today)
      d.setDate(d.getDate() - d.getDay())
      return d.toISOString().slice(0, 10)
    },
    to: () => today.toISOString().slice(0, 10),
  },
  {
    label: 'This Month',
    from: () => firstOfMonth.toISOString().slice(0, 10),
    to: () => today.toISOString().slice(0, 10),
  },
  {
    label: 'Last Month',
    from: () => {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return d.toISOString().slice(0, 10)
    },
    to: () => {
      const d = new Date(today.getFullYear(), today.getMonth(), 0)
      return d.toISOString().slice(0, 10)
    },
  },
]

const activeFilterCount = computed(() => {
  if (!appliedFilters.value) return 0
  let count = 0
  if (appliedFilters.value.dateFrom || appliedFilters.value.dateTo) count++
  if (appliedFilters.value.branch) count++
  return count
})

function applyPreset(preset) {
  activePreset.value = preset.label
  filters.value.dateFrom = preset.from()
  filters.value.dateTo = preset.to()
}

function onFilterChange() {
  activePreset.value = ''
}

function applyFilters() {
  appliedFilters.value = { ...filters.value }
  emit('filter-change', appliedFilters.value)
  filtersOpen.value = false
}

function clearFilters() {
  filters.value = {
    dateFrom: firstOfMonth.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
    branch: null,
  }
  appliedFilters.value = null
  activePreset.value = 'This Month'
  emit('filter-change', filters.value)
}

function clearDateFilter() {
  if (appliedFilters.value) {
    appliedFilters.value.dateFrom = null
    appliedFilters.value.dateTo = null
  }
}

function clearBranchFilter() {
  if (appliedFilters.value) appliedFilters.value.branch = null
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function handlePrint() {
  window.print()
}

// ── Auto-refresh ────────────────────────────────────────────────────
let autoRefreshTimer = null

onMounted(() => {
  appliedFilters.value = { ...filters.value }
  emit('filter-change', appliedFilters.value)

  // Silently auto-refresh report data in background
  if (props.autoRefreshInterval > 0) {
    autoRefreshTimer = setInterval(() => {
      emit('refresh')
    }, props.autoRefreshInterval)
  }
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})
</script>

<style scoped lang="scss">
/* ── Page ─────────────────────────────────────────────────────────────── */
.report-page {
  padding: 24px;
  background: var(--erp-bg-main, #0f172a);
  min-height: 100vh;
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.report-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  &__left {
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
  }

  &__breadcrumb {
    display: flex !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    margin-bottom: 6px;
  }

  &__breadcrumb-item,
  &__breadcrumb-sep {
    font-size: 11px;
    font-weight: 700;
    color: var(--erp-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1;
    white-space: nowrap;
  }

  &__breadcrumb-item--active {
    color: var(--erp-text-secondary, #94a3b8);
    font-weight: 800;
  }

  &__title {
    font-size: 22px;
    font-weight: 800;
    color: var(--erp-text-primary, #f8fafc);
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.5px;
  }

  &__subtitle {
    font-size: 13px;
    color: var(--erp-text-muted, #64748b);
    margin: 6px 0 0;
    line-height: 1.4;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    align-self: flex-start;
  }
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.report-btn {
  height: 32px;
  min-height: 32px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;

  &--primary {
    background: var(--erp-primary, #2563eb);
    color: #fff;
    padding: 0 14px;
  }

  &--ghost {
    background: transparent;
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    color: var(--erp-text-secondary, #94a3b8);
    padding: 0 12px;

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--erp-text-primary, #f8fafc);
    }
  }

  &--icon {
    width: 32px;
    padding: 0;
    border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
    color: var(--erp-text-secondary, #94a3b8);

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--erp-text-primary, #f8fafc);
    }
  }
}

/* ── Filter Panel ──────────────────────────────────────────────────── */
.report-filter-panel {
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;

  &__grid {
    display: grid;
    grid-template-columns: 320px 200px repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    align-items: start;
  }
}

.report-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--erp-text-muted, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.report-filter-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.report-filter-date-sep {
  font-size: 11px;
  color: var(--erp-text-muted, #64748b);
  white-space: nowrap;
}

.report-filter-input {
  font-size: 13px;
}

.report-date-presets {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.report-date-preset {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  background: transparent;
  color: var(--erp-text-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover,
  &.active {
    background: var(--erp-primary, #2563eb);
    color: #fff;
    border-color: var(--erp-primary, #2563eb);
  }
}

.report-filter-advanced-toggle {
  margin-top: 12px;
}

.report-filter-advanced-btn {
  background: transparent;
  border: none;
  color: var(--erp-text-secondary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;

  &:hover {
    color: var(--erp-text-primary, #f8fafc);
  }
}

.report-filter-advanced {
  padding-top: 12px;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  margin-top: 12px;
}

.report-filter-actions {
  display: flex;
  align-items: center;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
}

/* ── Filter Summary Bar ─────────────────────────────────────────────── */
.report-filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.2);
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--erp-text-secondary, #94a3b8);
  flex-wrap: wrap;

  &__label {
    font-weight: 600;
  }

  &__clear {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--erp-danger, #dc2626);
    font-size: 11px;
    cursor: pointer;
    padding: 0;
    &:hover {
      text-decoration: underline;
    }
  }
}

.report-filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: rgba(37, 99, 235, 0.15);
  color: var(--erp-primary, #2563eb);
  border: 1px solid rgba(37, 99, 235, 0.25);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

/* ── KPI Row ─────────────────────────────────────────────────────────── */
.report-kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.report-kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  border-top: 2px solid transparent;

  &--blue {
    border-top-color: var(--erp-primary, #2563eb);
  }
  &--green {
    border-top-color: var(--erp-success, #16a34a);
  }
  &--amber {
    border-top-color: var(--erp-warning, #f59e0b);
  }
  &--red {
    border-top-color: var(--erp-danger, #dc2626);
  }
  &--purple {
    border-top-color: #7c3aed;
  }
  &--teal {
    border-top-color: #0d9488;
  }
  &--default {
    border-top-color: var(--erp-border, rgba(255, 255, 255, 0.06));
  }

  &__icon {
    width: 34px;
    height: 34px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--erp-text-secondary, #94a3b8);
  }

  &__value {
    font-size: 18px;
    font-weight: 700;
    color: var(--erp-text-primary, #f8fafc);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  &__label {
    font-size: 11px;
    color: var(--erp-text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-top: 2px;
  }

  &__sub {
    font-size: 11px;
    color: var(--erp-text-secondary, #94a3b8);
    margin-top: 2px;
  }
}

/* ── Content ─────────────────────────────────────────────────────────── */
.report-content {
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  overflow: hidden;
}

/* ── Export Menu ─────────────────────────────────────────────────────── */
.report-export-menu {
  background: var(--erp-bg-card, #1e293b) !important;
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  min-width: 160px;

  .q-item {
    font-size: 13px;
    color: var(--erp-text-primary, #f8fafc);
    min-height: 36px;
    &:hover {
      background: rgba(255, 255, 255, 0.04);
    }
  }
}

/* ── Print Styles ─────────────────────────────────────────────────────── */
@media print {
  .report-toolbar__right,
  .report-filter-panel,
  .report-filter-bar,
  .report-date-presets,
  .report-filter-actions {
    display: none !important;
  }

  .report-page {
    padding: 0;
    background: #fff;
  }
  .report-kpi-card {
    border: 1px solid #ccc;
  }
  .report-content {
    border: none;
  }
}
</style>
