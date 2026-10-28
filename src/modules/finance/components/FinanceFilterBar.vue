<template>
  <div class="fin-filter-bar" role="search">
    <div v-if="showDates" class="fin-filter-bar__presets">
      <q-btn
        v-for="p in presetOptions"
        :key="p.value"
        :label="p.label"
        size="sm"
        no-caps
        dense
        unelevated
        class="fin-filter-bar__preset"
        :color="activePreset === p.value ? 'primary' : undefined"
        :text-color="activePreset === p.value ? 'white' : undefined"
        :outline="activePreset !== p.value"
        @click="applyPreset(p.value)"
      />
    </div>

    <div class="fin-filter-bar__fields">
      <template v-if="showDates">
        <q-input
          :model-value="from"
          type="date"
          :label="fromLabel"
          stack-label
          dense
          outlined
          class="fin-filter-bar__date"
          :max="to || undefined"
          @update:model-value="(v) => setRange(v, to)"
        />
        <q-input
          :model-value="to"
          type="date"
          :label="toLabel"
          stack-label
          dense
          outlined
          class="fin-filter-bar__date"
          :min="from || undefined"
          @update:model-value="(v) => setRange(from, v)"
        />
      </template>

      <!-- Page-specific filters (branch, status, ledger…) -->
      <slot />

      <q-input
        v-if="showSearch"
        :model-value="search"
        dense
        outlined
        clearable
        debounce="300"
        :placeholder="searchPlaceholder"
        class="fin-filter-bar__search"
        @update:model-value="onSearch"
      >
        <template #prepend><q-icon name="search" size="18px" /></template>
      </q-input>

      <q-btn
        flat
        dense
        no-caps
        icon="filter_alt_off"
        label="Reset"
        color="grey-7"
        class="fin-filter-bar__reset"
        @click="reset"
      >
        <q-tooltip>Reset all filters</q-tooltip>
      </q-btn>

      <div v-if="$slots.actions" class="fin-filter-bar__actions">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * Standard Finance filter bar: date presets (Today / This month / Last month /
 * This FY …), from–to dates, page filters (default slot), search, reset and an
 * optional actions slot (export / print). Dates are 'YYYY-MM-DD' in Sri Lanka
 * local time. With `persistKey` the range + search survive navigation.
 *
 * Usage:
 *   <FinanceFilterBar v-model:from="dateFrom" v-model:to="dateTo" v-model:search="q"
 *                     persist-key="expenses" @change="loadData" @reset="resetExtras">
 *     <q-select v-model="status" … />
 *   </FinanceFilterBar>
 */
import { computed } from 'vue'
import { DATE_PRESETS, DEFAULT_FY_START_MONTH, matchPreset, normalizeRange, presetRange } from '../utils/finance-dates'
import { clearFilterState, loadFilterState, saveFilterState } from '../utils/finance-filter-state'

const props = defineProps({
  from: { type: String, default: null },
  to: { type: String, default: null },
  search: { type: String, default: '' },
  showDates: { type: Boolean, default: true },
  showSearch: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: 'Search…' },
  fromLabel: { type: String, default: 'From' },
  toLabel: { type: String, default: 'To' },
  presets: { type: Array, default: () => ['today', 'this_month', 'last_month', 'this_fy'] },
  /** Preset applied on Reset (null → clear dates). */
  defaultPreset: { type: String, default: 'this_month' },
  fyStartMonth: { type: Number, default: DEFAULT_FY_START_MONTH },
  persistKey: { type: String, default: '' },
})
const emit = defineEmits(['update:from', 'update:to', 'update:search', 'change', 'reset'])

const presetOptions = computed(() => DATE_PRESETS.filter((p) => props.presets.includes(p.value)))
const activePreset = computed(() => matchPreset(props.from, props.to, new Date(), props.fyStartMonth))

function persist(next) {
  if (!props.persistKey) return
  saveFilterState(props.persistKey, {
    from: next.from,
    to: next.to,
    search: next.search,
    preset: matchPreset(next.from, next.to, new Date(), props.fyStartMonth),
  })
}

function commit(next) {
  if (next.from !== props.from) emit('update:from', next.from)
  if (next.to !== props.to) emit('update:to', next.to)
  if ((next.search || '') !== (props.search || '')) emit('update:search', next.search || '')
  persist(next)
  emit('change', next)
}

function setRange(from, to) {
  const r = normalizeRange(from || null, to || null)
  commit({ from: r.from, to: r.to, search: props.search })
}

function applyPreset(value) {
  const r = presetRange(value, new Date(), props.fyStartMonth)
  if (r) commit({ ...r, search: props.search })
}

function onSearch(v) {
  commit({ from: props.from, to: props.to, search: v || '' })
}

function reset() {
  if (props.persistKey) clearFilterState(props.persistKey)
  const r = (props.defaultPreset && presetRange(props.defaultPreset, new Date(), props.fyStartMonth)) || {
    from: null,
    to: null,
  }
  emit('reset')
  commit({ from: props.showDates ? r.from : props.from, to: props.showDates ? r.to : props.to, search: '' })
}

// Restore before the parent's onMounted runs, so its first load uses saved filters.
if (props.persistKey) {
  const saved = loadFilterState(props.persistKey, new Date(), props.fyStartMonth)
  if (saved) {
    if (props.showDates) {
      if (saved.from !== props.from) emit('update:from', saved.from)
      if (saved.to !== props.to) emit('update:to', saved.to)
    }
    if (props.showSearch && saved.search !== (props.search || '')) emit('update:search', saved.search)
  }
}
</script>

<style scoped lang="scss">
.fin-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--erp-border);
  border-radius: 10px;
  background: var(--erp-bg-card);
}
.fin-filter-bar__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fin-filter-bar__preset {
  border-radius: 14px;
  padding: 0 10px;
}
.fin-filter-bar__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  :deep(.q-field) {
    min-width: 150px;
  }
}
.fin-filter-bar__date {
  width: 160px;
}
.fin-filter-bar__search {
  flex: 1 1 220px;
  max-width: 360px;
}
.fin-filter-bar__actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 599px) {
  .fin-filter-bar__date,
  .fin-filter-bar__search {
    flex: 1 1 140px;
    width: auto;
    max-width: none;
  }
  .fin-filter-bar__fields :deep(.q-field) {
    flex: 1 1 140px;
  }
  .fin-filter-bar__actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>
