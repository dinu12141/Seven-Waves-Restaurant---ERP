<template>
  <div class="bdg-wrap">
    <!-- ─── Toolbar ─────────────────────────────────────────────────────────── -->
    <div class="bdg-toolbar">
      <div class="bdg-toolbar__left">
        <div v-if="title || subtitle" class="bdg-toolbar__title-block">
          <div v-if="title" class="bdg-toolbar__title">{{ title }}</div>
          <div v-if="subtitle" class="bdg-toolbar__subtitle">{{ subtitle }}</div>
        </div>
        <!-- Search -->
        <div class="bdg-search-wrap" :class="{ 'bdg-search-wrap--focused': searchFocused }">
          <q-icon name="search" size="16px" class="bdg-search-icon" />
          <input
            ref="searchRef"
            v-model="searchQuery"
            :placeholder="searchPlaceholder || 'Search...'"
            class="bdg-search-input"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button v-if="searchQuery" class="bdg-search-clear" @click="searchQuery = ''">
            <q-icon name="close" size="14px" />
          </button>
          <kbd class="bdg-kbd" v-if="!searchFocused && !searchQuery">Ctrl+K</kbd>
        </div>
      </div>

      <div class="bdg-toolbar__right">
        <!-- Filter drawer toggle -->
        <button
          v-if="filters && filters.length"
          class="bdg-icon-btn"
          :class="{ 'bdg-icon-btn--active': hasActiveFilters }"
          @click="filterDrawerOpen = true"
          title="Open Filters"
        >
          <q-icon name="filter_list" size="18px" />
          <span v-if="hasActiveFilters" class="bdg-active-dot" />
        </button>

        <!-- Column visibility -->
        <button class="bdg-icon-btn" @click="colMenuOpen = !colMenuOpen" title="Configure Columns">
          <q-icon name="view_column" size="18px" />
        </button>

        <!-- Column menu dropdown -->
        <div v-if="colMenuOpen" ref="colMenuRef" class="bdg-col-menu">
          <div class="bdg-col-menu__header">Columns</div>
          <label v-for="col in hideableColumns" :key="col.name" class="bdg-col-menu__item">
            <input
              type="checkbox"
              :checked="isColumnVisible(col.name)"
              @change="toggleColumn(col.name)"
              class="bdg-checkbox"
            />
            <span>{{ col.label }}</span>
          </label>
        </div>

        <!-- Export -->
        <button class="bdg-icon-btn" title="Export Options">
          <q-icon name="download" size="18px" />
          <q-menu auto-close class="bg-dark text-white">
            <q-list dense style="min-width: 140px">
              <q-item clickable @click="exportData('csv')">
                <q-item-section avatar><q-icon name="table_view" size="18px" /></q-item-section>
                <q-item-section>Export CSV</q-item-section>
              </q-item>
              <q-item clickable @click="exportData('excel')">
                <q-item-section avatar><q-icon name="grid_on" size="18px" /></q-item-section>
                <q-item-section>Export Excel</q-item-section>
              </q-item>
              <q-item clickable @click="exportData('pdf')">
                <q-item-section avatar><q-icon name="picture_as_pdf" size="18px" /></q-item-section>
                <q-item-section>Export PDF</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </button>

        <!-- Refresh slot / generic -->
        <slot name="toolbar-right" />
      </div>
    </div>

    <!-- ─── Error State ──────────────────────────────────────────────────────── -->
    <div v-if="error" class="bdg-error-state">
      <q-icon name="error_outline" size="32px" />
      <div class="bdg-error-state__text">{{ error }}</div>
    </div>

    <!-- ─── Table ────────────────────────────────────────────────────────────── -->
    <div v-else class="bdg-table-wrap">
      <table class="bdg-table">
        <!-- Sticky Header -->
        <thead class="bdg-thead">
          <tr>
            <th
              v-for="col in visibleColumns"
              :key="col.name"
              class="bdg-th"
              :class="[
                `bdg-th--${col.align || colAlign(col)}`,
                col.sortable ? 'bdg-th--sortable' : '',
                sortBy === col.name ? 'bdg-th--sorted' : '',
              ]"
              :style="colStyle(col)"
              @click="col.sortable && onSort(col.name)"
            >
              <span>{{ col.label }}</span>
              <span v-if="col.sortable" class="bdg-sort-icon">
                <q-icon
                  :name="
                    sortBy === col.name
                      ? sortDesc
                        ? 'arrow_downward'
                        : 'arrow_upward'
                      : 'unfold_more'
                  "
                  size="14px"
                />
              </span>
            </th>
            <th v-if="actions && actions.length" class="bdg-th bdg-th--right bdg-th--actions">
              Actions
            </th>
          </tr>
        </thead>

        <!-- Skeleton Loading Rows -->
        <tbody v-if="loading" class="bdg-tbody">
          <tr v-for="i in skeletonRows" :key="`sk-${i}`" class="bdg-tr bdg-tr--skeleton">
            <td v-for="col in visibleColumns" :key="`sk-${i}-${col.name}`" class="bdg-td">
              <div class="bdg-skeleton" :style="{ width: skeletonWidth() }" />
            </td>
            <td v-if="actions && actions.length" class="bdg-td">
              <div class="bdg-skeleton bdg-skeleton--sm" style="width: 64px" />
            </td>
          </tr>
        </tbody>

        <!-- Empty State -->
        <tbody v-else-if="filteredRows.length === 0" class="bdg-tbody">
          <tr>
            <td :colspan="visibleColumns.length + (actions?.length ? 1 : 0)" class="bdg-td--empty">
              <slot name="empty">
                <div class="bdg-empty-state">
                  <q-icon name="inbox" size="40px" class="bdg-empty-state__icon" />
                  <div class="bdg-empty-state__title">{{ noDataLabel || 'No records found' }}</div>
                  <div class="bdg-empty-state__sub">Try adjusting your search or filters</div>
                </div>
              </slot>
            </td>
          </tr>
        </tbody>

        <!-- Data Rows -->
        <tbody v-else class="bdg-tbody">
          <tr
            v-for="(row, rowIdx) in paginatedRows"
            :key="row[rowKey || 'id']"
            class="bdg-tr"
            :class="{ 'bdg-tr--even': rowIdx % 2 === 0 }"
            @click="$emit('row-click', row)"
          >
            <td
              v-for="col in visibleColumns"
              :key="col.name"
              class="bdg-td"
              :class="`bdg-td--${col.align || colAlign(col)}`"
            >
              <!-- Custom slot override -->
              <slot :name="`cell-${col.name}`" :row="row" :value="getCellValue(row, col)">
                <!-- Status chip -->
                <StatusChip
                  v-if="col.type === 'status'"
                  :status="String(getCellValue(row, col) || '')"
                />

                <!-- Currency -->
                <span v-else-if="col.type === 'currency'" class="bdg-num">
                  {{ formatCurrency(getCellValue(row, col), col.currency) }}
                </span>

                <!-- Number -->
                <span v-else-if="col.type === 'number'" class="bdg-num">
                  {{ getCellValue(row, col) }}
                </span>

                <!-- Date -->
                <span v-else-if="col.type === 'date' || col.type === 'datetime'" class="bdg-date">
                  {{ formatDate(getCellValue(row, col), col.type) }}
                </span>

                <!-- Boolean -->
                <q-icon
                  v-else-if="col.type === 'boolean'"
                  :name="getCellValue(row, col) ? 'check_circle' : 'cancel'"
                  :class="getCellValue(row, col) ? 'text-positive' : 'text-negative'"
                  size="16px"
                />

                <!-- Badge -->
                <span v-else-if="col.type === 'badge'" class="bdg-badge-cell">
                  {{
                    col.format ? col.format(getCellValue(row, col), row) : getCellValue(row, col)
                  }}
                </span>

                <!-- Default text -->
                <span v-else>
                  {{
                    col.format ? col.format(getCellValue(row, col), row) : getCellValue(row, col)
                  }}
                </span>
              </slot>
            </td>

            <!-- Row Actions -->
            <td v-if="actions && actions.length" class="bdg-td bdg-td--right bdg-td--actions">
              <div class="bdg-row-actions">
                <button
                  v-for="action in visibleActions(row)"
                  :key="action.event"
                  class="bdg-action-btn"
                  :class="{ 'bdg-action-btn--danger': action.danger }"
                  :title="action.label"
                  @click.stop="$emit(action.event, row)"
                >
                  <q-icon :name="action.icon" size="18px" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ─── Pagination ────────────────────────────────────────────────────────── -->
    <div v-if="!loading && filteredRows.length > 0" class="bdg-pagination">
      <div class="bdg-pagination__info">
        Showing {{ paginationInfo.from }}–{{ paginationInfo.to }} of {{ paginationInfo.total }}
      </div>
      <div class="bdg-pagination__controls">
        <select
          class="bdg-page-size"
          :value="pageSize"
          @change="onPageSizeChange($event.target.value)"
        >
          <option v-for="sz in pageSizes" :key="sz" :value="sz">{{ sz }} / page</option>
        </select>
        <button
          class="bdg-page-btn"
          :disabled="currentPage === 1"
          @click="currentPage = 1"
          title="First"
        >
          <q-icon name="first_page" size="16px" />
        </button>
        <button
          class="bdg-page-btn"
          :disabled="currentPage === 1"
          @click="currentPage--"
          title="Previous"
        >
          <q-icon name="chevron_left" size="16px" />
        </button>
        <span class="bdg-page-label">{{ currentPage }} / {{ totalPages }}</span>
        <button
          class="bdg-page-btn"
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
          title="Next"
        >
          <q-icon name="chevron_right" size="16px" />
        </button>
        <button
          class="bdg-page-btn"
          :disabled="currentPage >= totalPages"
          @click="currentPage = totalPages"
          title="Last"
        >
          <q-icon name="last_page" size="16px" />
        </button>
      </div>
    </div>

    <!-- ─── Filter Drawer ─────────────────────────────────────────────────────── -->
    <q-drawer
      v-if="filters && filters.length"
      v-model="filterDrawerOpen"
      side="right"
      :width="320"
      overlay
      class="bdg-filter-drawer"
    >
      <div class="bdg-filter-drawer__header">
        <span class="bdg-filter-drawer__title">
          <q-icon name="filter_list" size="18px" class="q-mr-sm" />
          Filters
        </span>
        <button class="bdg-icon-btn" @click="filterDrawerOpen = false">
          <q-icon name="close" size="18px" />
        </button>
      </div>

      <div class="bdg-filter-drawer__body">
        <template v-for="f in filters" :key="f.field">
          <!-- Date range -->
          <div v-if="f.type === 'date-range'" class="bdg-filter-group">
            <label class="bdg-filter-label">{{ f.label }}</label>
            <div class="row q-col-gutter-xs">
              <div class="col-6">
                <q-input
                  v-model="activeFilters[f.field + '_from']"
                  dense
                  borderless
                  type="date"
                  class="bdg-filter-input"
                  label="From"
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model="activeFilters[f.field + '_to']"
                  dense
                  borderless
                  type="date"
                  class="bdg-filter-input"
                  label="To"
                />
              </div>
            </div>
          </div>

          <!-- Select -->
          <div v-else-if="f.type === 'select'" class="bdg-filter-group">
            <label class="bdg-filter-label">{{ f.label }}</label>
            <q-select
              v-model="activeFilters[f.field]"
              :options="f.options || []"
              dense
              borderless
              emit-value
              map-options
              class="bdg-filter-input bdg-filter-select"
              clearable
              options-dense
            />
          </div>

          <!-- Text -->
          <div v-else class="bdg-filter-group">
            <label class="bdg-filter-label">{{ f.label }}</label>
            <input
              v-model="activeFilters[f.field]"
              class="bdg-text-input"
              :placeholder="`Filter by ${f.label.toLowerCase()}...`"
            />
          </div>
        </template>
      </div>

      <div class="bdg-filter-drawer__footer">
        <button class="bdg-btn bdg-btn--secondary" @click="clearFilters">Clear All</button>
        <button class="bdg-btn bdg-btn--primary" @click="applyFilters">Apply Filters</button>
      </div>
    </q-drawer>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue'
import StatusChip from 'components/common/StatusChip.vue'
import { exportTableToCSV, exportTableToExcel, exportTableToPDF } from 'src/services/exportService'

// ─── Props ────────────────────────────────────────────────────────────────────
const props = defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  actions: { type: Array, default: () => [] },
  filters: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  searchPlaceholder: { type: String, default: 'Search...' },
  noDataLabel: { type: String, default: 'No records found' },
  storageKey: { type: String, default: '' },
  serverSide: { type: Boolean, default: false },
  pageSizes: { type: Array, default: () => [10, 20, 50, 100] },
})

const emit = defineEmits([
  'update:pagination',
  'filter-change',
  'sort-change',
  'row-click',
  'export',
  // Dynamic action events (view, edit, void, print, etc.)
  'view',
  'edit',
  'void',
  'print',
  'delete',
  'cancel',
  'approve',
  'reorder',
  'transfer',
])

// ─── State ────────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const searchFocused = ref(false)
const searchRef = ref(null)
const filterDrawerOpen = ref(false)
const colMenuOpen = ref(false)
const colMenuRef = ref(null)
const currentPage = ref(1)
const pageSize = ref(props.pageSizes[1] || 20)
const sortBy = ref('')
const sortDesc = ref(false)
const hiddenColumns = ref(new Set())
const activeFilters = reactive({})
const skeletonRows = 8

// ─── Keyboard Shortcut: Ctrl+K ────────────────────────────────────────────────
function handleGlobalKey(e) {
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault()
    searchRef.value?.focus()
  }
}
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKey)
  window.addEventListener('click', handleOutsideClick)
  loadColumnPreferences()
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKey)
  window.removeEventListener('click', handleOutsideClick)
})

function handleOutsideClick(e) {
  if (colMenuOpen.value && colMenuRef.value && !colMenuRef.value.contains(e.target)) {
    colMenuOpen.value = false
  }
}

// ─── Column visibility (persisted to localStorage) ────────────────────────────
function loadColumnPreferences() {
  if (!props.storageKey) return
  try {
    const stored = localStorage.getItem(`bdg-cols-${props.storageKey}`)
    if (stored) hiddenColumns.value = new Set(JSON.parse(stored))
    // eslint-disable-next-line no-empty
  } catch {} // localStorage unavailable — ignore silently
}

function saveColumnPreferences() {
  if (!props.storageKey) return
  try {
    localStorage.setItem(`bdg-cols-${props.storageKey}`, JSON.stringify([...hiddenColumns.value]))
    // eslint-disable-next-line no-empty
  } catch {} // localStorage unavailable — ignore silently
}

function isColumnVisible(colName) {
  return !hiddenColumns.value.has(colName)
}

function toggleColumn(colName) {
  if (hiddenColumns.value.has(colName)) {
    hiddenColumns.value.delete(colName)
  } else {
    hiddenColumns.value.add(colName)
  }
  // Force reactivity
  hiddenColumns.value = new Set(hiddenColumns.value)
  saveColumnPreferences()
}

const hideableColumns = computed(() =>
  props.columns.filter((c) => c.hideable !== false && c.type !== 'actions'),
)

const visibleColumns = computed(() =>
  props.columns.filter(
    (c) => c.type !== 'actions' && !hiddenColumns.value.has(c.name) && c.visible !== false,
  ),
)

// ─── Filter Logic ─────────────────────────────────────────────────────────────
const hasActiveFilters = computed(() => Object.values(activeFilters).some((v) => v))

function clearFilters() {
  Object.keys(activeFilters).forEach((k) => delete activeFilters[k])
}

function applyFilters() {
  filterDrawerOpen.value = false
  emit('filter-change', { ...activeFilters, search: searchQuery.value })
  currentPage.value = 1
}

// ─── Search (debounced) ───────────────────────────────────────────────────────
let debounceTimer = null
watch(searchQuery, () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    currentPage.value = 1
  }, 250)
})

// ─── Filtering + Sorting ─────────────────────────────────────────────────────
const filteredRows = computed(() => {
  let rows = [...props.rows]

  // Text search
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    rows = rows.filter((row) =>
      visibleColumns.value.some((col) => {
        const val = getCellValue(row, col)
        return val != null && String(val).toLowerCase().includes(q)
      }),
    )
  }

  // Active filters (from drawer)
  Object.entries(activeFilters).forEach(([key, val]) => {
    if (!val) return
    if (key.endsWith('_from')) {
      const field = key.replace('_from', '')
      rows = rows.filter((row) => {
        const rowVal = row[field]
        return rowVal && new Date(rowVal) >= new Date(val)
      })
    } else if (key.endsWith('_to')) {
      const field = key.replace('_to', '')
      rows = rows.filter((row) => {
        const rowVal = row[field]
        return rowVal && new Date(rowVal) <= new Date(val + 'T23:59:59')
      })
    } else {
      rows = rows.filter((row) => {
        const rowVal = String(row[key] || '').toLowerCase()
        return rowVal.includes(String(val).toLowerCase())
      })
    }
  })

  // Sorting
  if (sortBy.value) {
    rows.sort((a, b) => {
      const col = props.columns.find((c) => c.name === sortBy.value)
      const va = col ? getCellValue(a, col) : a[sortBy.value]
      const vb = col ? getCellValue(b, col) : b[sortBy.value]
      if (va == null) return 1
      if (vb == null) return -1
      const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDesc.value ? -cmp : cmp
    })
  }

  return rows
})

// ─── Sorting ─────────────────────────────────────────────────────────────────
function onSort(colName) {
  if (sortBy.value === colName) {
    sortDesc.value = !sortDesc.value
  } else {
    sortBy.value = colName
    sortDesc.value = false
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────
const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)),
)

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

const paginationInfo = computed(() => {
  const total = filteredRows.value.length
  const from = Math.min((currentPage.value - 1) * pageSize.value + 1, total)
  const to = Math.min(currentPage.value * pageSize.value, total)
  return { from, to, total }
})

function onPageSizeChange(val) {
  pageSize.value = Number(val)
  currentPage.value = 1
}

// Reset page if rows change
watch(
  () => props.rows,
  () => {
    currentPage.value = 1
  },
)

// ─── Cell helpers ─────────────────────────────────────────────────────────────
function getCellValue(row, col) {
  if (typeof col.field === 'function') return col.field(row)
  const keys = col.field.split('.')
  let val = row
  for (const k of keys) {
    if (val == null) return null
    val = val[k]
  }
  return val
}

function colAlign(col) {
  if (col.align) return col.align
  const numTypes = ['number', 'currency']
  return numTypes.includes(col.type) ? 'right' : 'left'
}

function colStyle(col) {
  const styles = {}
  if (col.width) styles.width = `${col.width}px`
  if (col.minWidth) styles.minWidth = `${col.minWidth}px`
  return styles
}

// ─── Actions ─────────────────────────────────────────────────────────────────
function visibleActions(row) {
  return (props.actions || []).filter((a) => {
    if (typeof a.show === 'function') return a.show(row)
    return true
  })
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function formatCurrency(val, currency = 'LKR') {
  const n = Number(val || 0)
  return `${currency} ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(val, type) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  if (type === 'datetime') {
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`
  }
  return `${dd}/${mm}/${yyyy}`
}

// Skeleton helper
function skeletonWidth() {
  const widths = ['70%', '55%', '80%', '60%', '45%', '75%']
  return widths[Math.floor(Math.random() * widths.length)]
}

// ─── Export ──────────────────────────────────────────────────────────────────
function exportData(format) {
  emit('export', { format, rows: filteredRows.value })

  const title = props.title || 'Export_Data'
  const sub = props.subtitle || ''
  const filename = props.storageKey || title.toLowerCase().replace(/\s+/g, '_')

  if (format === 'csv') {
    exportTableToCSV(visibleColumns.value, filteredRows.value, filename)
  } else if (format === 'excel') {
    exportTableToExcel(visibleColumns.value, filteredRows.value, filename)
  } else if (format === 'pdf') {
    exportTableToPDF(visibleColumns.value, filteredRows.value, title, sub)
  }
}
</script>

<style scoped lang="scss">
/* ─── Wrapper ─────────────────────────────────────────────────────────────── */
.bdg-wrap {
  display: flex;
  flex-direction: column;
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  overflow: hidden;
  position: relative;
}

/* ─── Toolbar ─────────────────────────────────────────────────────────────── */
.bdg-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--erp-border);
  flex-wrap: wrap;
  background-color: rgba(255, 255, 255, 0.01);
}

.bdg-toolbar__left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.bdg-toolbar__right {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
}

.bdg-toolbar__title-block {
  flex-shrink: 0;
}

.bdg-toolbar__title {
  font-size: var(--erp-font-size-h3);
  font-weight: var(--erp-font-weight-semibold);
  color: var(--erp-text-primary);
  line-height: 1.2;
}

.bdg-toolbar__subtitle {
  font-size: var(--erp-font-size-small);
  color: var(--erp-text-secondary);
  margin-top: 2px;
}

/* ─── Search ──────────────────────────────────────────────────────────────── */
.bdg-search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-md);
  padding: 0 10px;
  height: 34px;
  width: 260px;
  transition:
    border-color 0.2s,
    width 0.3s;

  &--focused {
    border-color: var(--erp-primary);
    width: 380px;
  }
}

.bdg-search-icon {
  color: var(--erp-text-muted);
  flex-shrink: 0;
}

.bdg-search-input {
  background: transparent;
  border: none;
  outline: none;
  color: var(--erp-text-primary);
  font-size: 13px;
  font-family: var(--erp-font-family);
  width: 100%;
  min-width: 0;

  &::placeholder {
    color: var(--erp-text-placeholder);
  }
}

.bdg-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--erp-text-muted);
  padding: 0;
  display: flex;
  align-items: center;

  &:hover {
    color: var(--erp-text-primary);
  }
}

.bdg-kbd {
  font-size: 10px;
  font-family: var(--erp-font-family);
  color: var(--erp-text-muted);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--erp-border);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ─── Icon Buttons ──────────────────────────────────────────────────────────── */
.bdg-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-md);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--erp-text-secondary);
  transition:
    background-color 0.15s,
    color 0.15s;
  position: relative;

  &:hover {
    background-color: rgba(255, 255, 255, 0.06);
    color: var(--erp-text-primary);
  }

  &--active {
    background-color: var(--erp-primary-subtle);
    color: var(--erp-primary);
    border-color: rgba(37, 99, 235, 0.3);
  }
}

.bdg-active-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--erp-primary);
}

/* ─── Column Menu ─────────────────────────────────────────────────────────── */
.bdg-col-menu {
  position: absolute;
  top: 36px;
  right: 0;
  z-index: 100;
  background-color: var(--erp-bg-card);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-lg);
  padding: 4px 0;
  min-width: 180px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);

  &__header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 12px 4px;
    color: var(--erp-text-muted);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--erp-text-secondary);
    cursor: pointer;

    &:hover {
      background-color: var(--erp-bg-card-hover);
      color: var(--erp-text-primary);
    }
  }
}

.bdg-checkbox {
  accent-color: var(--erp-primary);
  cursor: pointer;
}

/* ─── Table ───────────────────────────────────────────────────────────────── */
.bdg-table-wrap {
  overflow: auto;
  max-height: calc(100vh - 240px);
  min-height: 120px;
}

.bdg-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

/* ─── Thead ───────────────────────────────────────────────────────────────── */
.bdg-thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.bdg-th {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--erp-text-secondary);
  padding: 0 14px;
  height: 40px;
  background-color: var(--erp-bg-card);
  border-bottom: 1px solid var(--erp-border);
  white-space: nowrap;
  user-select: none;

  &--right {
    text-align: right;
  }
  &--center {
    text-align: center;
  }
  &--left {
    text-align: left;
  }
  &--actions {
    text-align: right;
    width: 1px;
  }

  &--sortable {
    cursor: pointer;
  }
  &--sortable:hover {
    color: var(--erp-text-primary);
  }
  &--sorted {
    color: var(--erp-primary);
  }
}

.bdg-sort-icon {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  opacity: 0.5;

  .bdg-th--sorted & {
    opacity: 1;
    color: var(--erp-primary);
  }
}

/* ─── Tbody ───────────────────────────────────────────────────────────────── */
.bdg-tr {
  border-bottom: 1px solid var(--erp-border);
  transition: background-color 0.1s ease;
  cursor: default;

  &:hover {
    background-color: rgba(255, 255, 255, 0.03);
  }
  &--even {
    background-color: rgba(255, 255, 255, 0.01);
  }
  &--skeleton {
    pointer-events: none;
  }
}

.bdg-td {
  padding: 0 14px;
  height: var(--erp-row-height); /* 44px */
  font-size: var(--erp-font-size-table); /* 13px */
  color: var(--erp-text-primary);
  vertical-align: middle;

  &--right {
    text-align: right;
  }
  &--center {
    text-align: center;
  }
  &--left {
    text-align: left;
  }
  &--actions {
    width: 1px;
    white-space: nowrap;
    text-align: right;
  }

  &--empty {
    padding: 48px 24px;
    text-align: center;
  }
}

.bdg-num {
  font-family: 'SF Mono', 'Roboto Mono', monospace;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.bdg-date {
  color: var(--erp-text-secondary);
  font-size: 12px;
}

/* ─── Row Actions ─────────────────────────────────────────────────────────── */
.bdg-row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;

  .bdg-tr:hover & {
    opacity: 1;
  }
}

.bdg-action-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: var(--erp-radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--erp-text-secondary);
  transition:
    background-color 0.15s,
    color 0.15s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.06);
    color: var(--erp-text-primary);
  }

  &--danger {
    color: var(--erp-danger);
    &:hover {
      background-color: rgba(220, 38, 38, 0.1);
    }
  }
}

/* ─── Skeleton ─────────────────────────────────────────────────────────────── */
.bdg-skeleton {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 25%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;

  &--sm {
    height: 10px;
  }
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ─── Empty State ─────────────────────────────────────────────────────────── */
.bdg-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;

  &__icon {
    color: var(--erp-text-muted);
    opacity: 0.5;
  }
  &__title {
    font-size: 14px;
    font-weight: 500;
    color: var(--erp-text-secondary);
  }
  &__sub {
    font-size: 12px;
    color: var(--erp-text-muted);
  }
}

/* ─── Error State ───────────────────────────────────────────────────────────── */
.bdg-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 8px;
  color: var(--erp-danger);

  &__text {
    font-size: 14px;
  }
}

/* ─── Pagination ──────────────────────────────────────────────────────────── */
.bdg-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end; /* Right-aligned ERP standard */
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--erp-border);
  background-color: rgba(255, 255, 255, 0.01);
  flex-wrap: wrap;
}

.bdg-pagination__info {
  font-size: 12px;
  color: var(--erp-text-secondary);
  flex: 1;
}

.bdg-pagination__controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bdg-page-size {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-sm);
  color: var(--erp-text-secondary);
  font-size: 12px;
  font-family: var(--erp-font-family);
  padding: 4px 8px;
  cursor: pointer;
  appearance: none;

  &:focus {
    outline: none;
    border-color: var(--erp-primary);
  }
}

.bdg-page-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-sm);
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--erp-text-secondary);
  transition: background-color 0.15s;

  &:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.06);
    color: var(--erp-text-primary);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.bdg-page-label {
  font-size: 12px;
  color: var(--erp-text-secondary);
  margin: 0 4px;
  min-width: 48px;
  text-align: center;
}

/* ─── Filter Drawer ────────────────────────────────────────────────────────── */
.bdg-filter-drawer {
  background-color: var(--erp-bg-card) !important;
  border-left: 1px solid var(--erp-border) !important;
  display: flex;
  flex-direction: column;

  :deep(.q-drawer__content) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--erp-border);
    flex-shrink: 0;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-text-primary);
    display: flex;
    align-items: center;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__footer {
    padding: 16px;
    border-top: 1px solid var(--erp-border);
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
}

.bdg-filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bdg-filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--erp-text-secondary);
}

.bdg-filter-input {
  :deep(.q-field__control) {
    background-color: var(--erp-bg-main) !important;
    border: 1px solid var(--erp-border) !important;
    border-radius: var(--erp-radius-md) !important;
    min-height: 36px !important;
  }
}

.bdg-filter-select {
  :deep(.q-field__native) {
    font-size: 13px !important;
  }
}

.bdg-text-input {
  width: 100%;
  background: var(--erp-bg-main);
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-md);
  padding: 0 10px;
  height: 36px;
  font-size: 13px;
  font-family: var(--erp-font-family);
  color: var(--erp-text-primary);
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--erp-primary);
  }
  &::placeholder {
    color: var(--erp-text-placeholder);
  }
}

/* ─── Buttons ─────────────────────────────────────────────────────────────── */
.bdg-btn {
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--erp-border);
  border-radius: var(--erp-radius-md);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--erp-font-family);
  cursor: pointer;
  transition: background-color 0.15s;

  &--primary {
    background-color: var(--erp-primary);
    color: #fff;
    border-color: var(--erp-primary);

    &:hover {
      background-color: var(--erp-primary-hover);
    }
  }

  &--secondary {
    background-color: transparent;
    color: var(--erp-text-secondary);

    &:hover {
      background-color: rgba(255, 255, 255, 0.04);
    }
  }
}

.bdg-badge-cell {
  font-size: 11px;
  font-weight: 600;
}
</style>
