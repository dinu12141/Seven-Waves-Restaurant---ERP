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
        <!-- SAP B1-style Icon Toolbar Strip -->
        <div class="sap-icon-strip">
          <!-- Filter toggle -->
          <q-btn
            flat dense round
            :icon="filtersOpen ? 'filter_list_off' : 'filter_list'"
            class="sap-icon-strip__btn"
            :class="{ 'sap-icon-strip__btn--active': filtersOpen }"
            @click="filtersOpen = !filtersOpen"
          >
            <q-badge
              v-if="activeFilterCount > 0 && !filtersOpen"
              floating
              color="primary"
              :label="activeFilterCount"
              class="sap-icon-strip__badge"
            />
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">
              {{ filtersOpen ? 'Hide Filters' : 'Show Filters' }}
            </q-tooltip>
          </q-btn>

          <!-- Refresh -->
          <q-btn
            flat dense round
            icon="refresh"
            class="sap-icon-strip__btn"
            @click="handleRefresh"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">Refresh Data</q-tooltip>
          </q-btn>

          <!-- Separator -->
          <div class="sap-icon-strip__sep" />

          <!-- Print -->
          <q-btn
            flat dense round
            icon="print"
            class="sap-icon-strip__btn"
            @click="handlePrint"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">Print Report</q-tooltip>
          </q-btn>

          <!-- Export PDF -->
          <q-btn
            flat dense round
            icon="picture_as_pdf"
            class="sap-icon-strip__btn"
            @click="handleExportPDF"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">Download PDF</q-tooltip>
          </q-btn>

          <!-- Export CSV -->
          <q-btn
            flat dense round
            icon="table_view"
            class="sap-icon-strip__btn"
            @click="$emit('export-csv')"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">Export CSV</q-tooltip>
          </q-btn>

          <!-- Export Excel -->
          <q-btn
            flat dense round
            icon="grid_on"
            class="sap-icon-strip__btn"
            @click="$emit('export-excel')"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">Export Excel</q-tooltip>
          </q-btn>

          <!-- Separator -->
          <div class="sap-icon-strip__sep" />

          <!-- Fullscreen -->
          <q-btn
            flat dense round
            :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'"
            class="sap-icon-strip__btn"
            @click="toggleFullscreen"
          >
            <q-tooltip :delay="400" anchor="bottom middle" self="top middle">
              {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
            </q-tooltip>
          </q-btn>
        </div>
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

          <!-- Kitchen -->
          <div class="report-filter-group">
            <label class="report-filter-label">Kitchen</label>
            <q-select
              v-model="filters.branch"
              :options="branchOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              placeholder="All Kitchens"
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
      <!-- SAP B1 Company Header (built-in for all reports) -->
      <div v-if="!hideSapHeader" class="sap-header">
        <div class="sap-header__left">
          <div class="sap-header__company">SEVEN WAVES RESTAURANT (PVT) LTD</div>
          <div class="sap-header__title">{{ title }}</div>
          <div class="sap-header__meta">
            <span>Location: <strong>{{ branchLabel }}</strong></span>
            <span class="q-ml-lg">{{ reportDateLabel }}</span>
          </div>
        </div>
        <div class="sap-header__right">
          <div class="sap-header__page">Page 1</div>
          <div class="sap-header__date">{{ todayLabel }}</div>
        </div>
      </div>
      <slot :filters="appliedFilters || filters" />
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from 'src/stores/auth'
import { supabase } from 'src/boot/supabase'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  kpis: { type: Array, default: () => [] },
  branches: { type: Array, default: () => [] },
  autoRefreshInterval: { type: Number, default: 60000 },
  hideSapHeader: { type: Boolean, default: false },
})

const emit = defineEmits(['filter-change', 'export-csv', 'export-excel', 'export-pdf', 'refresh'])

const authStore = useAuthStore()

const filtersOpen = ref(false)
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

// ── SAP Header computed values ──────────────────────────────────────
const branchLabel = computed(() => authStore.currentBranch?.name || 'All Branches')
const todayLabel = computed(() =>
  new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
)
const reportDateLabel = computed(() => {
  const f = appliedFilters.value || filters.value
  if (f.dateFrom && f.dateTo) {
    const from = new Date(f.dateFrom).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const to = new Date(f.dateTo).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `${from} To ${to}`
  }
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
})

const branchOptions = ref([{ label: 'All Kitchens', value: null }])

async function loadBranches() {
  try {
    const branchId = authStore.currentBranch?.id

    // Kitchens to exclude from the filter (non-selling stations)
    const excludeNames = ['CHINEESE', 'FUNCTION MENU', 'Main Kitchen', 'Main Store', 'OTHERS', 'SRI LANKAN', 'WESTERN']

    // Fetch kitchens only (BENMAR, CASHIER, INDIAN, ITALIAN, JUICE BAR)
    let kitchenQuery = supabase
      .from('kitchens')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    if (branchId) kitchenQuery = kitchenQuery.eq('branch_id', branchId)
    const { data: kitchenData } = await kitchenQuery

    const opts = [{ label: 'All Kitchens', value: null }]
    if (kitchenData && kitchenData.length) {
      kitchenData
        .filter((k) => !excludeNames.includes(k.name))
        .forEach((k) => {
          opts.push({ label: k.name, value: k.id })
        })
    }

    branchOptions.value = opts
  } catch {
    branchOptions.value = [{ label: 'All Kitchens', value: null }]
  }
}

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
  // Set print metadata for the footer
  const page = document.querySelector('.report-page')
  if (page) {
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    page.setAttribute('data-print-date', `${dateStr} ${timeStr}`)
  }
  // Set document title for the print filename (includes report name + date)
  const origTitle = document.title
  const dateStr = new Date().toISOString().slice(0, 10)
  document.title = `${props.title.replace(/\s+/g, '_')}_${dateStr}`

  // Brief delay to let attributes render, then print
  setTimeout(() => {
    window.print()
    document.title = origTitle
  }, 100)
}

// ── File name helper ────────────────────────────────────────────────
function getFileBaseName() {
  const dateStr = new Date().toISOString().slice(0, 10) // 2026-03-22
  return `${props.title.replace(/\s+/g, '_')}_${dateStr}`
}

// ── PDF Export ──────────────────────────────────────────────────────
async function handleExportPDF() {
  const sapContent = document.querySelector('.report-sap-document')
  if (!sapContent) {
    // If no SAP content found, emit event for custom handling
    emit('export-pdf')
    return
  }

  try {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    // Capture the SAP report content as a canvas
    const canvas = await html2canvas(sapContent, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const imgWidth = canvas.width
    const imgHeight = canvas.height

    // Calculate PDF dimensions (A4 landscape or portrait based on aspect ratio)
    const pdfWidth = 297 // A4 landscape width in mm
    const pdfHeight = 210 // A4 landscape height in mm
    const ratio = imgWidth / imgHeight

    let orientation = 'landscape'
    let pageW = pdfWidth
    let pageH = pdfHeight
    if (ratio < 1) {
      orientation = 'portrait'
      pageW = 210
      pageH = 297
    }

    const pdf = new jsPDF(orientation, 'mm', 'a4')
    const margin = 10
    const usableW = pageW - margin * 2
    const scaledH = (imgHeight * usableW) / imgWidth

    // If content exceeds one page, split across pages
    let yOffset = 0
    const usableH = pageH - margin * 2

    while (yOffset < scaledH) {
      if (yOffset > 0) pdf.addPage()

      pdf.addImage(
        imgData,
        'PNG',
        margin,
        margin - yOffset,
        usableW,
        scaledH
      )

      yOffset += usableH
    }

    pdf.save(`${getFileBaseName()}.pdf`)
  } catch (err) {
    console.error('[ReportLayout] PDF export error:', err)
    // Fallback: emit event
    emit('export-pdf')
  }
}

// ── SAP Toolbar actions ─────────────────────────────────────────────
function handleRefresh() {
  emit('refresh')
  // Also re-apply current filters to trigger a data reload
  if (appliedFilters.value) {
    emit('filter-change', appliedFilters.value)
  }
}

const isFullscreen = ref(false)

function toggleFullscreen() {
  const el = document.querySelector('.report-page')
  if (!el) return

  if (!document.fullscreenElement) {
    el.requestFullscreen().then(() => { isFullscreen.value = true }).catch(() => {})
  } else {
    document.exitFullscreen().then(() => { isFullscreen.value = false }).catch(() => {})
  }
}

// Listen for fullscreen exit via Escape key
function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

// ── Auto-refresh ────────────────────────────────────────────────────
let autoRefreshTimer = null

onMounted(() => {
  appliedFilters.value = { ...filters.value }
  emit('filter-change', appliedFilters.value)

  // Load all branches for the filter dropdown
  loadBranches()

  document.addEventListener('fullscreenchange', onFullscreenChange)

  // Silently auto-refresh report data in background
  if (props.autoRefreshInterval > 0) {
    autoRefreshTimer = setInterval(() => {
      emit('refresh')
    }, props.autoRefreshInterval)
  }
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
})
</script>

<style scoped lang="scss">
@import 'src/pages/reports/report-common.scss';

/* ── Page ─────────────────────────────────────────────────────────────── */
.report-page {
  padding: 16px;
  background: var(--erp-bg-main, #0f172a);
  min-height: 100vh;
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.report-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;

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

/* ── SAP B1-style Icon Toolbar Strip ──────────────────────────────── */
.sap-icon-strip {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--erp-bg-card, #1e293b);
  border: 1px solid var(--erp-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 3px 4px;

  &__btn {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px !important;
    min-height: 30px !important;
    font-size: 16px;
    color: var(--erp-text-muted, #64748b);
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: var(--erp-text-primary, #f8fafc);
    }

    &--active {
      background: rgba(37, 99, 235, 0.15) !important;
      color: var(--erp-primary, #2563eb) !important;
    }
  }

  &__sep {
    width: 1px;
    height: 20px;
    background: var(--erp-border, rgba(255, 255, 255, 0.08));
    margin: 0 3px;
    flex-shrink: 0;
  }

  &__badge {
    font-size: 9px;
    min-height: 14px;
    padding: 0 4px;
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
  padding: 12px;
  margin-bottom: 10px;

  &__grid {
    display: grid;
    grid-template-columns: 320px 200px repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
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
  gap: 8px;
  margin-bottom: 12px;
}

.report-kpi-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
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
/* NOTE: All print styles are in src/css/report-print.css (global) */

</style>
